# Workstream F — Notification channel architecture

Implementation spec for adding Telegram as a question/reply channel alongside
the existing n8n form. Extracted from a discussion following the n8n Workflow
Review (2026-07-17). F-11 and E3 (unreachable URLs, `WEBHOOK_URL` env fix) were
moved here from Workstream E — they are notification-reachability issues, not
loop-robustness issues. This doc owns the env-var fix (E3) and goes beyond it:
it addresses how the operator interacts with the pipeline from a phone when
away from the devbox.

> **Central constraint:** n8n runs on the dev machine, which is not
> immediately accessible from outside the local network. The operator is
> actively working on solving this (e.g., via Tailscale or similar). The
> Telegram approach designed here does **not** depend on solving external
> accessibility — getUpdates is outbound polling (n8n reaches Telegram, not
> the reverse), and the form resume URL is localhost-to-localhost on the same
> machine. Only the form-from-phone fallback requires external accessibility.

> **Verification basis (2026-07-17):** All workspace claims below were verified
> against the n8n workflow JSON in `n8n/workflows/` and the agent code.
> External claims (ntfy, Telegram, Tailscale, Cloudflare, GitHub) were verified
> against official documentation only — see [Sources](#sources) at the end.
> Claims that could not be verified against official docs are flagged as such.

The operator's requirement: **read pipeline alerts and respond to agent
questions from a phone, when away from the network.** `localhost` and LAN IPs
do not resolve when away, so the existing `0.0.0.0` / `localhost` URLs are
unreachable from a phone regardless of the E3 env fix.

## Findings

### F-11 — Error Handler click URL is unreachable (`0.0.0.0`)

- **Where:** Error Handler -> `Notify failure`; BMAD Session -> `Notify` (question
  notification)
- **Evidence:** `.env` sets `N8N_HOST=0.0.0.0`, `N8N_PORT=5678`,
  `N8N_PROTOCOL=http`, and neither `WEBHOOK_URL` nor `N8N_EDITOR_BASE_URL` is
  set. The Error Handler's `$json.execution?.url` resolves to
  `http://0.0.0.0:5678/...` — browsers cannot reach it. The question-form
  `Recovery URL` (`$execution.resumeUrl.replace('webhook','form')`) resolves to
  `http://0.0.0.0:5678/form-executions/...` — also unreachable. Every other
  notification hardcodes `http://localhost:5678/...` (reachable from the devbox
  browser).
- **Fix (E3):** Set `WEBHOOK_URL=http://localhost:5678` in n8n's env. This directly
  controls `webhookWaitingBaseUrl`, which is what `$execution.resumeUrl`
  derives from (see V3 for the source-code-level derivation chain).
  `N8N_EDITOR_BASE_URL` is a narrower alternative — it controls the
  editor/instance URLs but not the webhook-waiting base URL.
- **Scope:** `localhost` resolves only from the devbox browser. When the
  operator is on a phone away from the network, neither `localhost` nor
  `0.0.0.0` resolves. Full phone reachability is the architecture exploration
  below. The human-question form inside `BMAD Session (OpenCode)` also has no
  timeout (`docs/self-improving-pipeline.md:105`) — an unanswered question
  stalls the loop indefinitely regardless of URL reachability. The deferred
  form-timeout (F-3.2, decision #5 in the INCOMPLETE plan) is a separate
  robustness gap. E3 makes the URL reachable; it does not make the form
  responsive.

## Relevant verifications

### V3 — `WEBHOOK_URL` controls `webhookWaitingBaseUrl` and `$execution.resumeUrl` — CONFIRMED

**Sources:**
- n8n source: `dist/services/url.service.js` (v2.26.8)
- n8n source: `dist/workflow-execute-additional-data.js` (v2.26.8)
- n8n source: `dist/webhooks/webhook-helpers.js` (v2.26.8)
- Official docs: [Endpoints env vars](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/endpoints.md),
  [Deployment env vars](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/deployment.md),
  [`$execution.resumeUrl`](https://docs.n8n.io/build/code-in-n8n/cookbook/built-in-methods-and-variables-examples/execution.md)

**Derivation chain (source code):**

1. `UrlService.getWebhookBaseUrl()` (`url.service.js:20-26`):
   ```js
   getWebhookBaseUrl() {
       let urlBaseWebhook = this.trimQuotes(process.env.WEBHOOK_URL) || this.baseUrl;
       // ...
       return urlBaseWebhook;
   }
   ```
   `trimQuotes` returns `''` when `WEBHOOK_URL` is unset. The fallback
   `this.baseUrl` is `generateBaseUrl()` which constructs
   `${protocol}://${host}:${port}${path}` from `GlobalConfig` (which reads
   `N8N_PROTOCOL`, `N8N_HOST`, `N8N_PORT`, `N8N_PATH`).

2. `workflow-execute-additional-data.js:372-373`:
   ```js
   webhookBaseUrl: urlBaseWebhook + globalConfig.endpoints.webhook,
   webhookWaitingBaseUrl: urlBaseWebhook + globalConfig.endpoints.webhookWaiting,
   ```
   The endpoint suffix `webhookWaiting` defaults to `webhook-waiting`
   (`@n8n/config` `endpoints.config.js:132`, env var
   `N8N_ENDPOINT_WEBHOOK_WAIT`).

3. `webhook-helpers.js:488`:
   ```js
   additionalKeys.$execution = {
       // ...
       resumeUrl: `${additionalData.webhookWaitingBaseUrl}/${executionId}`,
       resumeFormUrl: `${additionalData.formWaitingBaseUrl}/${executionId}`,
   };
   ```

**Resolved formula:**
```
$execution.resumeUrl = (WEBHOOK_URL || "${N8N_PROTOCOL}://${N8N_HOST}:${N8N_PORT}${N8N_PATH}")
                       + "/" + (N8N_ENDPOINT_WEBHOOK_WAIT || "webhook-waiting")
                       + "/" + executionId
```

**Runtime path note:** The source-code derivation yields `webhook-waiting` as
the endpoint suffix. However, the `.replace('webhook', 'form')` trick in BMAD
Session's `Variables` node was empirically verified to produce a working
`form-executions` URL — implying the actual runtime path is
`webhook-executions`. The source-code default may be outdated or overridden at
runtime. This discrepancy does not affect the E3 fix, which only changes the
host, not the path.

**Official docs confirmation:**
- `WEBHOOK_URL`: "Used to manually provide the Webhook URL when running n8n
  behind a reverse proxy." (Endpoints env vars page)
- `N8N_EDITOR_BASE_URL`: "Public URL where users can access the editor. Also
  used for emails sent from n8n and the redirect URL for SAML based
  authentication." (Deployment env vars page) — does not control
  `webhookWaitingBaseUrl`.
- `$execution.resumeUrl`: "The webhook URL to call to resume a waiting workflow."
  (execution cookbook page)

**Impact on E3:** `WEBHOOK_URL=http://localhost:5678` sets the base URL to
`http://localhost:5678`, so `$execution.resumeUrl` becomes
`http://localhost:5678/webhook-executions/<id>` (or `webhook-waiting` per
source — see runtime path note above) — reachable from the devbox browser.
`N8N_EDITOR_BASE_URL` does not control this path. Neither env var is currently
set; the fallback to `N8N_HOST=0.0.0.0` is what produces the unreachable
`0.0.0.0` URLs.

## Context: what the question/response flow actually is

Verified against the workflow definitions and the agent code [workspace:
`n8n/workflows/C8qzMFk2e00sLHJg.json` (BMAD Session),
`3D8Jw6GicWiwBQc6.json` (BMAD Outcome), `tDs1dBlOKDd3aDH8.json` (Parse
OpenCode Response)]:

- **Question side (agent → human):** the agent's full response — free-form
  markdown, whatever it said — is rendered to HTML via n8n's `markdown`
  node (`Agent MD to HTML`, mode `markdownToHtml`) and displayed in an n8n
  Wait form as an HTML field (`Get response` node, `resume: form`, first
  field `fieldType: html`). Could be "which approach: A or B?", "what
  should I name this?", "I found 3 issues, which do I fix first?" —
  open-ended.
- **Response side (human → agent):** a free-text textarea (required). The
  typed text is passed directly as the positional prompt argument to the
  opencode session: `opencode run --session <sessionId> "<answer>"` (actual
  command also includes `--dangerously-skip-permissions`, `--format json`,
  `--agent <agentName>`).
- **How the system "knows" it's a question:** the BMAD Outcome workflow
  classifies the agent's response as COMPLETE / QUESTION / INCOMPLETE. A
  deterministic front-end (`Determine outcome` Code node) pre-classifies
  empty responses → UNKNOWN, opencode errors → INCOMPLETE, salvaged/nonzero
  exit → INCOMPLETE; the LLM classifier (`Classify response` node) handles
  only genuinely ambiguous text. When QUESTION, the form fires (and the
  question-notification `Notify` node also fires on the same branch).
- **Current question notification:** ntfy POST with title
  `<conversation> - Action Needed`, message body set to the agent's actual
  response text (`={{ $('Parse OpenCode Response').item.json.response }}` —
  applied to live 2026-07-17), and a `click` URL set to
  `$execution.resumeUrl.replace('webhook', 'form')`, which resolves to
  `http://0.0.0.0:5678/form-executions/…` because `N8N_HOST=0.0.0.0` with no
  `WEBHOOK_URL` override — unreachable / dead. The `click` URL is the
  remaining broken piece; the message body is fixed.

The free-text-both-ways structure eliminates ntfy-action-button architectures.
ntfy supports four action types — `view`, `broadcast`, `http`, and `copy` — and
none of them capture free-text input from the user [ntfy docs:
publish/#action-buttons]. Any solution must capture free text on a phone.

## The reframe: two architectures

Every solution assumes one of two architectures:

1. **Expose n8n** — make the web UI / form reachable from the phone.
2. **Flip the channel** — move the interaction into the notification layer;
   n8n stays private (no inbound exposure).

The flip architecture is more secure (nothing reaches in) and is where the
creative combinations live. Exposing n8n is simpler conceptually but widens
the F-1 attack surface (unauthenticated webhook, RCE-capable) unless D2
(webhook auth) lands first or simultaneously. The operator's chosen direction
(Telegram) is a flip architecture — it does not require solving external
accessibility of the dev machine.

## The operator's chosen direction: two channels — ntfy + Telegram

The natural split is by capability, not "send everything to both":

- **ntfy = one-way alerts.** Instant push, no reply needed, lightweight.
  Perfect for "story started", "story finished", "cap exhausted", "reflection
  failed", "error handler fired."
- **Telegram = two-way questions.** Free-text chat, markdown rendering
  (Telegram-defined subset via `MarkdownV2` or `HTML` parse mode — not full
  markdown; see open questions below), conversation history. Perfect for
  "the agent is asking you a question, respond with text."

The 8 alert-only ntfy nodes stay as they are — they are all one-way POSTs
[verified: `n8n/workflows/C8qzMFk2e00sLHJg.json` (BMAD Session, 3 nodes),
`7akkpjTdEW6RMIJG.json` (Develop Epic, 5 nodes), `bmadErrNotify001.json`
(Error Handler, 1 node)]. The 1 question-notification `Notify` node (title
`"… - Action Needed"`) is modified: its message body now carries the agent's
response text (applied to live 2026-07-17). A 10th node (`Notify cap`) was
added by the INCOMPLETE-outcome work and already has `onError:
continueRegularOutput`. Only the question-form flow (the `Get response` Wait
node + the dead `0.0.0.0` recovery URL) is replaced with a Telegram send +
long-poll. Smallest possible change, and each channel stops doing work it is
bad at.

### Creative combination: ntfy as push trigger, Telegram as interaction layer

When a question comes in, **both** fire: ntfy sends the instant push
("Question: <story> / <step> — tap to open"), Telegram sends the full agent
response as a message. Read the ntfy push, tap it, and it deep-links into the
Telegram chat where you type your reply.

Why this pattern exists: **Telegram's push reliability varies by device.**
Some Android phones aggressively kill Telegram's background process, so its
push notifications arrive late or not at all — the Telegram FAQ specifically
names Huawei and Xiaomi devices as having "evil task killer services that
interfere with the Telegram notification service" [Telegram FAQ:
notification-problems]. ntfy uses FCM (Android) / APNS (iOS) for push delivery
[ntfy docs: config/#firebase-fcm, config/#ios-instant-notifications], which
are OS-managed channels. However, ntfy's own docs caution that FCM is "pretty
bad at delivering messages in time" and that without the optional "instant
delivery" foreground service, "messages may arrive with a significant delay
(sometimes many minutes, or even hours later)" [ntfy docs:
subscribe/phone/#instant-delivery]. So ntfy is more likely to deliver than
Telegram's app-level push, but it is not a guarantee — "instant delivery"
must be enabled on the phone for reliable ntfy push.

Trade-off: two apps involved per question. If Telegram push works reliably on
the phone, this is redundant — Telegram alone suffices. Test Telegram push
first; only add the ntfy-trigger layer if questions are being missed.

### Fallback pattern: ntfy as the "Telegram is down" alarm

If n8n cannot reach Telegram (HTTP failure, bot API outage), fire an ntfy
alert: "Telegram unreachable — question for <story> stalled." This gives
visibility into the failure mode without trying to use ntfy as a reply channel
(which it cannot do — no free text). The question stalls until Telegram
recovers, same as today's form stalls. But at least the stall is *known*,
instead of silent.

This is cheap: one extra HTTP Request node on the error branch of the
Telegram send, pointing at ntfy. No new infra.

### What NOT to do

Do not send every notification to both channels. Redundant notifications are
noise — two buzzes for every event trains you to ignore both. Pick the channel
per message type and commit.

The one exception: a *question* can justifiably go to both ntfy (push
trigger) and Telegram (interaction), because they serve different roles (alert
vs. reply). That is not redundancy — that is separation of concerns.

For the dual-channel input (form + Telegram), dedup is not needed —
first-reply-wins is handled naturally by n8n's resume mechanism (D3).

## Proposed channel mapping

| Message type | Channel | Why |
| --- | --- | --- |
| Story started / finished | ntfy | Alert, no reply needed |
| Cap exhausted | ntfy | Alert, no reply needed |
| Error handler fired | ntfy | Alert, no reply needed |
| Question from agent | Telegram (+ ntfy push trigger if Telegram push is unreliable) | Needs free-text reply |
| Telegram unreachable | ntfy | Alert about the interaction channel being down |

## Implementation breakdown

### Prerequisites

1. **F-11 / E3:** set `WEBHOOK_URL=http://localhost:5678` in n8n env. The
   Telegram reply handler calls the form resume URL
   (`http://localhost:5678/form-executions/<executionId>`) to unblock the
   waiting execution. Without this fix, the resume URL resolves to `0.0.0.0`
   and the handler cannot reach it. This is a one-line env var change and is
   separate from the external-accessibility problem — it makes the resume URL
   work at all (localhost-to-localhost), not reachable from outside.
2. **Create a Telegram bot** via @BotFather. Obtain the bot API token. Send
   `/start` to the bot from the operator's Telegram — required before the bot
   can send messages [Telegram Bot API: bots#how-are-bots-different-from-users].
   **Not yet done.**
3. **Add the bot token as an n8n credential** (Telegram type). Hardcode the
   operator's `chat_id` in the credential or a workflow variable — this locks
   the bot to one recipient (defense in depth). The `chat_id` is obtained from
   the `/start` message's `getUpdates` response.
4. **Test Telegram push on the Samsung device.** Send a test message via the
   bot and confirm the phone receives a push notification reliably. This
   determines whether step 5 (D8, ntfy push trigger layer) is needed or can
   be dropped. Depends on prerequisite 2.

### Architecture: dual-channel, first-reply-wins

The form Wait node stays. Telegram is added as a **second input channel**, not
a replacement. Both channels can resume the same waiting execution; the first
reply wins, the second is ignored (n8n's resume mechanism naturally rejects
resume attempts for already-resumed executions).

```
QUESTION branch:
  → Notify (ntfy push, already modified)
  → Agent MD to HTML → Get response (Wait, resume: form)    [stays as-is]
  → Telegram send (new, parallel to the form)                [new node]
    → Data Table insert: message_id → executionId            [new node]
                                                              ↓
  [operator replies via form OR Telegram — first wins]

Telegram Reply Handler (new, separate workflow):
  Telegram Trigger (getUpdates) → extract reply text + reply_to_message.message_id
  → Data Table lookup: executionId by message_id
  → HTTP Request to form resume URL → form Wait node resumes → Agent run (follow-up)
  → Data Table delete: cleanup row
```

### Decisions

| # | Question | Decision | Rationale |
| --- | --- | --- | --- |
| D1 | Parse mode | MarkdownV2 | Operator choice. Requires escaping `.` `-` and other special characters in the agent's output before sending [Telegram Bot API: markdownv2-style]. |
| D2 | Messages >4096 chars | Split at semantic boundaries (paragraph/line breaks), send as multiple `sendMessage` calls | Avoids mid-sentence cuts. Telegram `sendMessage` limit is 1–4096 characters [Telegram Bot API: sendMessage]. |
| D3 | Wait mechanism | Keep form Wait node (resume: form); Telegram handler calls the form resume URL | Dual-channel: form stays for devbox, Telegram for phone. First-reply-wins is natural. No webhook exposure needed — the resume call is localhost-to-localhost on the same n8n instance. |
| D4 | `chat_id` source | Hardcode in credential | Locks bot to one recipient. Not meaningfully more secure (chat_id isn't a secret; the bot token is the real secret), but good practice. |
| D5 | Concurrent questions | Reply-to-message threading | Each question is a separate Telegram message. The operator replies to a specific message; the handler matches `reply_to_message.message_id` back to the execution that sent it. Multiple agents can ask simultaneously; each gets its own message. |
| D6 | `Agent MD to HTML` node | Keep | Telegram handles its own formatting, but the node stays as a fallback for the form path. |
| D7 | Form fallback | Keep | If Telegram is down or misconfigured, the form path still works from the devbox. |
| D8 | ntfy push trigger for questions | Documented as likely needed | Operator has not tested Telegram push on Samsung and recalls past issues. The two-app pattern (ntfy push → deep-link into Telegram) stays as a planned addition, not just a theoretical fallback. |
| D9 | `message_id` → execution ID mapping storage | n8n Data Table node | `$getWorkflowStaticData` is NOT concurrency-safe — it uses a last-write-wins `UPDATE` on a single JSON blob column with no transaction or optimistic locking (verified from n8n source: `workflow-static-data.service.ts`; official docs carry a callout: "may behave unreliably under high-frequency workflow executions"). Two concurrent executions writing different keys silently clobber each other. Data Tables are safe: each data table is a dedicated SQL table (`data_table_user_<id>`), and INSERT/UPDATE/DELETE are atomic SQL statements wrapped in transactions (verified from n8n source: `data-table-rows.repository.ts`, `data-table-ddl.service.ts`). Each `message_id → executionId` pair is a separate row, writes are independent, and cleanup is a row deletion after resume. Use INSERT (not upsert) — the upsert operation has a check-then-act race that can create duplicate rows under concurrent access. Load is trivially light (a few messages per day). |

### Implementation steps

1. **Leave ntfy alone** for alerts (the 8 alert-only nodes stay; the 1
   question-notification node is already modified). ntfy is reliable enough
   in practice; no `onError` hardening needed (F-12 was evaluated and
   dropped).
2. **Apply E3:** set `WEBHOOK_URL=http://localhost:5678`
   in n8n env. Prerequisite for the Telegram handler's resume call.
3. **Add Telegram send node** on the QUESTION branch (parallel to the form):
   sends the agent's response text as a MarkdownV2 message to the operator's
   chat. Split at semantic boundaries if >4096 chars. Escape MarkdownV2 special
   characters. After sending, use a Data Table node to insert a row mapping
   the returned `message_id` → current execution ID (D9). Both workflows must
   be in the same n8n project to share the data table.
4. **Create the Telegram Reply Handler workflow** (separate workflow):
   Telegram Trigger (getUpdates mode) → extract reply text and
   `reply_to_message.message_id` → Data Table node: look up the execution ID
   by `message_id` → HTTP Request to
   `http://localhost:5678/form-executions/<executionId>` with the reply text
   as the "Answer" field → Data Table node: delete the row (cleanup). The form
   Wait node resumes; `Agent run (follow-up)` receives the reply.
5. **Optionally** add the ntfy push trigger for questions (D8) if Telegram
   push proves unreliable on the phone.

## Second-order effect: Telegram chat log as evidence source

Telegram conversations persist on the user's client — every question/response
thread becomes a searchable chat history from the operator's phone [Telegram
FAQ: telegram.org/faq — "Instant search" under group features]. However, the
bot-side API has limited storage: "Bots have limited cloud storage – older
messages may be removed by the server shortly after they have been processed"
[Telegram Bot API: bots#how-are-bots-different-from-users], and unprocessed
updates expire after 24 hours [Telegram Bot API: getting-updates]. So the chat
log is a reliable evidence source from the **user's** perspective (it persists
and is searchable in their Telegram client), but the **bot/n8n** side cannot
reconstruct past history from the API alone — it must persist responses in its
own storage if it wants to replay them. If the reflector is later taught to
learn from human decisions ("the human chose A over B, here's why"), the
Telegram chat log is a ready-made evidence source from the user side, but n8n
should log question/response pairs to its own storage (GitHub issue, data
table, or file) for programmatic access. This is an unexplored follow-on, not
part of the channel-replacement work.

## Alternative architectures considered

These were explored and are recorded here so future work does not re-litigate
them.

### Expose n8n (phone reaches the web UI)

- **Tailscale (plain):** install on devbox + phone, stable hostname
  (MagicDNS), `WEBHOOK_URL=http://<tailscale-host>:5678`. Uses WireGuard as
  its data-plane encryption, NAT traversal built in, no port forwarding
  [Tailscale docs: kb/1017/install, concepts/tailscale-encryption]. Trade-off:
  phone needs the Tailscale app running and connected to the tailnet for links
  to resolve (both endpoints must be tailnet members).
- **Tailscale Funnel:** publishes a tailnet service to the public internet as
  a stable `https://<machine>.<tailnet-name>.ts.net` URL [Tailscale docs:
  kb/1223/funnel]. Phone needs nothing installed — "even if they don't use
  Tailscale." Trade-off: URL is publicly reachable — with F-1's unauthenticated
  webhook, this widens the RCE hole unless D2 lands first.
- **Cloudflare Tunnel + Cloudflare Access:** `cloudflared` tunnels
  `localhost:5678` to a public hostname with no port forwarding; Cloudflare
  Access (Zero Trust) requires identity verification. Free tier supports up
  to 50 users [Cloudflare: cloudflare.com/pricing]. Supported identity
  providers include Google, GitHub, and one-time PIN (OTP) — among others
  [Cloudflare docs: cloudflare-one/integrations/identity-providers]. Public
  hostname + TLS + auth + zero inbound ports. Most infrastructure, but
  incidentally hardens the F-1 perimeter. Effort: L.
- **SSH reverse tunnel to a VPS:** `ssh -R` from devbox to a VPS with a
  domain; `WEBHOOK_URL` points at the VPS. `-R` allocates a listener on the
  remote (VPS) side, forwarding to the local devbox [OpenSSH man page:
  man.openbsd.org/ssh]. Fully self-hosted, no third-party trust. Trade-off:
  own the maintenance (reconnect logic — no built-in auto-reconnect; TLS;
  key rotation; the remote listener binds to loopback by default, so
  `GatewayPorts on` or a local proxy on the VPS is needed to expose it on the
  public IP). Most control, most work.

### Flip the channel (n8n stays private)

- **ntfy two-topic:** n8n posts the question (with markdown — ntfy supports a
  curated subset of markdown including bold, italic, links, images, code
  blocks, headings, lists, and blockquotes) to topic `bmad-q-<runId>`.
  **Caveat:** markdown rendering is **web app only** — it does not render in
  native Android/iOS phone notifications, which display plain text. Must be
  opt-in per message via the `X-Markdown` header or `Content-Type:
  text/markdown` [ntfy docs: publish/#markdown-formatting]. Also, message body
  is capped at 4,096 bytes — longer messages are offloaded to attachments
  (max 15 MB, expire after 3 hours) [ntfy docs: publish/#attach-local-file,
  config/#message-limits]. Operator publishes the answer to
  `bmad-a-<runId>`. n8n polls the reply topic via HTTP (outbound). Reuses
  ntfy for both directions, zero new infra. Trade-off: clunky UX — read on
  one topic, switch to another to reply; ntfy's publish UX is basic; markdown
  not visible in phone push notifications.
- **GitHub issue as the form:** n8n creates a GitHub issue titled
  `Question: <story> / <step>` with the agent's response as the body. GitHub
  renders markdown natively. Operator comments with free text; n8n polls the
  API for new comments (outbound), passes the comment as the next prompt,
  closes the issue. Reuses existing GitHub infra, auth, and mobile app. Every
  question/decision becomes a permanent, searchable artifact that could feed
  the self-improvement evidence feed. Trade-off: polling latency — 30-second
  polling is well within the 5,000 requests/hour authenticated rate limit
  (120 req/hour, 2.4% of budget) [GitHub REST API docs:
  rate-limits-for-the-rest-api]; more formal than chat.
- **Cloudflare Worker + KV, ntfy as push:** ntfy sends the push (instant
  alert) with a `click` URL pointing to a Cloudflare Worker (public HTTPS,
  edge-rendered). The Worker renders the question as HTML + a textarea.
  Operator fills it, submits. Worker stores the response in Cloudflare KV.
  Devbox polls KV (outbound), n8n resumes. Separates push alert (ntfy) from
  form UI (Worker). Both Workers (100,000 requests/day) and KV (1 GB storage,
  100,000 reads/day, 1,000 writes/day) have free tiers [Cloudflare:
  cloudflare.com/pricing, developers.cloudflare.com/workers/platform/limits].
  Trade-off: most moving parts (Worker code, KV schema, poller), but each is
  small and free-tier.
- **Email round-trip:** n8n sends the agent's response as HTML email
  (markdown → HTML, same conversion the form already does). Operator replies;
  n8n polls IMAP (outbound). Works from any phone, any email client, no app
  to install, no new account. Highest universality. Trade-off: high latency;
  markdown renders inconsistently in email clients (widely observed practical
  limitation — no single authoritative source to cite); threading can get
  messy.

## Open questions and unknowns

- **Telegram push reliability on the operator's phone — UNTESTED.** The
  operator has not yet created the Telegram bot, so push has not been tested
  on the Samsung device. The operator recalls past issues with Telegram push.
  If unreliable, the ntfy-push-trigger layer (D8) is needed. Test
  before deciding whether to implement step 5. Also test ntfy's "instant
  delivery" foreground service — without it, ntfy's own docs say FCM delivery
  "may arrive with a significant delay (sometimes many minutes, or even hours
  later)" [ntfy docs: subscribe/phone/#instant-delivery].
- **Single-chat interleaving with concurrent questions.** All questions
  arrive in one Telegram chat (one bot, one 1:1 conversation). When multiple
  agents ask questions within seconds of each other, their messages interleave
  in the chat. Reply-to-message threading (D5) routes each answer to the
  correct execution, so correctness is not affected — but the chat can look
  cluttered. Separate chats per story are not possible with a single bot in a
  1:1 chat; that would require group chats or multiple bots, both of which add
  complexity for marginal UX gain. Accepted trade-off.
- **Form resume URL accepts programmatic POST — UNVERIFIED.** The Telegram
  Reply Handler calls the form resume URL
  (`http://localhost:5678/form-executions/<executionId>`) with the reply text
  as the "Answer" field. This is expected to work (the form endpoint is an HTTP
  handler that doesn't distinguish browser vs. programmatic POSTs), but has
  not been verified against n8n source. If the form endpoint rejects
  non-browser POSTs, the fallback is option A (getUpdates long-poll loop
  inside the same workflow), which doesn't need the resume URL but is more
  complex to wire. Verify during implementation.
- **`message_id` → execution ID mapping storage — RESOLVED (D9).** When the
  Telegram send node sends a question message, Telegram returns a `message_id`
  (e.g., message #12345). When the operator replies to that message, Telegram's
  update payload includes `reply_to_message.message_id: 12345`. The Reply
  Handler needs to know: "message #12345 was sent by execution #67890" — so
  it can call the form resume URL for execution #67890. **Decision: use an n8n
  Data Table node** (D9). `$getWorkflowStaticData` was investigated and rejected
  — it is not concurrency-safe (last-write-wins on a single JSON blob column,
  no transaction or optimistic locking; verified from n8n source:
  `workflow-static-data.service.ts`). Data Tables were then investigated and
  confirmed safe: each data table is a dedicated SQL table, and
  INSERT/UPDATE/DELETE are atomic SQL statements wrapped in transactions
  (verified from n8n source: `data-table-rows.repository.ts`,
  `data-table-ddl.service.ts`). Use INSERT (not upsert) — upsert has a
  check-then-act race that can create duplicate rows. Cleanup is a row deletion
  after the execution resumes.
- **External accessibility of the dev machine — IN PROGRESS.** n8n runs on
  the dev machine, which is not immediately reachable from outside the local
  network. The operator is actively working on solving this (e.g., Tailscale
  or similar). The Telegram approach designed here does not depend on solving
  this — getUpdates is outbound polling, and the form resume URL is
  localhost-to-localhost. But the form-from-phone fallback does require
  external accessibility. This is tracked here so the doc does not assume it
  is solved.
- **Form-timeout (F-3.2) interaction.** Adding Telegram does not solve the
  stall-when-unreachable problem. If the operator is away and does not see
  the Telegram push, the question stalls indefinitely. Telegram's push is far
  more reliable than "you happen to check the n8n form URL," so the practical
  stall frequency drops sharply. If a hard ceiling is wanted, add a timeout
  to the Telegram-poll equivalent that escalates to `INCOMPLETE` auto-continue
  or `failed` after N hours — but that is a separate decision about how
  autonomous the pipeline should be when the operator is unreachable. (F-3.2
  form-timeout is currently deferred per decision #5 in
  `docs/todo/incomplete-classification-plan.md`.)
- **Question content in the notification — RESOLVED.** The question-notification
  `Notify` node's message body now carries the agent's response text
  (`={{ $('Parse OpenCode Response').item.json.response }}`), applied to live
  2026-07-17. The question content travels in the notification itself, not
  just "click here to see what's being asked."   The `click` URL remains dead
  (`0.0.0.0`) until E3 or the Telegram channel replaces it.

## Sources

All external claims verified against official documentation on 2026-07-17.

### ntfy

| Claim | URL |
| --- | --- |
| Action types: view, broadcast, http, copy (no free-text input) | https://docs.ntfy.sh/publish/#action-buttons |
| FCM for Android push | https://docs.ntfy.sh/config/#firebase-fcm |
| APNS for iOS push (via FCM → APNS forwarding) | https://docs.ntfy.sh/config/#ios-instant-notifications |
| FCM is "pretty bad at delivering messages in time"; instant delivery needed | https://docs.ntfy.sh/subscribe/phone/#instant-delivery |
| Markdown rendering: web app only, opt-in, curated subset | https://docs.ntfy.sh/publish/#markdown-formatting |
| Message body limit: 4,096 bytes; attachments 15 MB / 3-hour expiry | https://docs.ntfy.sh/config/#message-limits, https://docs.ntfy.sh/publish/#attach-local-file |

### Telegram Bot API

| Claim | URL |
| --- | --- |
| `getUpdates` long-polling; mutually exclusive with `setWebhook` | https://core.telegram.org/bots/api#getting-updates |
| `getUpdates` method reference (timeout, limit params) | https://core.telegram.org/bots/api#getupdates |
| Formatting: MarkdownV2, HTML, legacy Markdown (subset, not full markdown) | https://core.telegram.org/bots/api#formatting-options |
| MarkdownV2 escaping requirements | https://core.telegram.org/bots/api#markdownv2-style |
| Rich Messages (Bot API 10.1+, GitHub Flavored Markdown) | https://core.telegram.org/bots/features#advanced-formatting-options |
| Bot cloud storage is limited; old messages may be removed | https://core.telegram.org/bots#how-are-bots-different-from-users |
| Updates expire after 24 hours if not fetched | https://core.telegram.org/bots/api#getting-updates |
| "Bots can't start conversations with users" — /start required | https://core.telegram.org/bots#how-are-bots-different-from-users |
| `sendMessage` text limit: 1–4096 characters | https://core.telegram.org/bots/api#sendmessage |
| Push notification issues on Huawei/Xiaomi ("evil task killer services") | https://telegram.org/faq#notification-problems |
| Cloud-based messaging; instant search (user-side persistence) | https://telegram.org/faq |

### Tailscale

| Claim | URL |
| --- | --- |
| Funnel: public internet access, `https://<machine>.<tailnet-name>.ts.net` | https://tailscale.com/kb/1223/funnel |
| WireGuard data-plane encryption | https://tailscale.com/docs/concepts/tailscale-encryption |
| NAT traversal, no port forwarding, MagicDNS stable hostnames | https://tailscale.com/kb/1017/install |

### Cloudflare

| Claim | URL |
| --- | --- |
| Zero Trust free tier: up to 50 users | https://www.cloudflare.com/pricing/ |
| Identity providers: Google, GitHub, OTP (among others) | https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/ |
| Workers free tier: 100,000 requests/day | https://developers.cloudflare.com/workers/platform/limits/ |
| KV free tier: 1 GB storage, 100K reads/day, 1K writes/day | https://www.cloudflare.com/pricing/ |

### GitHub

| Claim | URL |
| --- | --- |
| Authenticated rate limit: 5,000 requests/hour | https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api |
| List issue comments endpoint | https://docs.github.com/en/rest/issues/comments |

### OpenSSH

| Claim | URL |
| --- | --- |
| `-R` remote port forwarding; loopback-only bind by default; `GatewayPorts` | https://man.openbsd.org/ssh |

### Workspace (verified against n8n workflow JSON and agent code)

| Claim | Source files |
| --- | --- |
| 9 pre-existing ntfy nodes (3 BMAD Session + 5 Develop Epic + 1 Error Handler) | `n8n/workflows/C8qzMFk2e00sLHJg.json`, `7akkpjTdEW6RMIJG.json`, `bmadErrNotify001.json` |
| 10th ntfy node (`Notify cap`) added by INCOMPLETE-outcome work | `n8n/workflows/C8qzMFk2e00sLHJg.json` |
| Wait form: `Agent MD to HTML` → `Get response` (HTML field) | `n8n/workflows/C8qzMFk2e00sLHJg.json` |
| Response text → `opencode run --session <id> "<answer>"` | `n8n/workflows/C8qzMFk2e00sLHJg.json` |
| Classifier: deterministic front-end + LLM (COMPLETE/QUESTION/INCOMPLETE/UNKNOWN) | `n8n/workflows/3D8Jw6GicWiwBQc6.json` |
| Question notification: title, dynamic message body (agent response text), dead `0.0.0.0` click URL | `n8n/workflows/C8qzMFk2e00sLHJg.json` |
| F-1: unauthenticated webhook, shell injection, RCE-capable | `docs/todo/n8n-workstream-d-security-perimeter.md` |
| F-3.2: form timeout (deferred per decision #5) | `docs/todo/incomplete-classification-plan.md` |

### Unverifiable from official docs

| Claim | Status |
| --- | --- |
| "Markdown renders inconsistently in email clients" | Widely observed practical limitation; no single authoritative source to cite |
