# Workstream F — Notification channel architecture (exploratory)

Extracted from a discussion following the n8n Workflow Review (2026-07-17).
This is **not** a prescriptive fix list — it is an architecture exploration for
further work. It relates to F-11 (unreachable URLs, in Workstream E) but goes
beyond the env-var fix: it addresses how the operator interacts with the
pipeline from a phone when away from the devbox.

The operator's requirement: **read pipeline alerts and respond to agent
questions from a phone, when away from the network.** `localhost` and LAN IPs
do not resolve when away, so the existing `0.0.0.0` / `localhost` URLs are
unreachable from a phone regardless of the F-11 env fix.

## Context: what the question/response flow actually is

Verified against the workflow definitions and the agent code:

- **Question side (agent → human):** the agent's full response — free-form
  markdown, whatever it said — is rendered to HTML and displayed in an n8n
  Wait form as an HTML field. Could be "which approach: A or B?", "what
  should I name this?", "I found 3 issues, which do I fix first?" —
  open-ended.
- **Response side (human → agent):** a free-text textarea (required). The
  typed text is passed directly as the next prompt to the opencode session:
  `opencode run --session <id> "<your answer>"`.
- **How the system "knows" it's a question:** the LLM classifier (BMAD
  Outcome workflow) reads the agent's response and classifies COMPLETE /
  QUESTION / INCOMPLETE. When QUESTION, the form fires. That is the
  "understanding" — LLM classification of free-form text.
- **Current question notification:** ntfy POST with title
  `<conversation> - Action Needed`, message `"BMAD run is awaiting your
  response"` (generic — does not include the actual question), and a `click`
  URL pointing to the dead `0.0.0.0` form.

The free-text-both-ways structure eliminates ntfy-action-button architectures
(ntfy actions are VIEW/BROADCAST/HTTP only, no text input). Any solution must
capture free text on a phone.

## The reframe: two architectures

Every solution assumes one of two architectures:

1. **Expose n8n** — make the web UI / form reachable from the phone.
2. **Flip the channel** — move the interaction into the notification layer;
   n8n stays private (no inbound exposure).

The flip architecture is more secure (nothing reaches in) and is where the
creative combinations live. Exposing n8n is simpler conceptually but widens
the F-1 attack surface (unauthenticated webhook, RCE-capable) unless D2
(webhook auth) lands first or simultaneously.

## The operator's chosen direction: two channels — ntfy + Telegram

The natural split is by capability, not "send everything to both":

- **ntfy = one-way alerts.** Instant push, no reply needed, lightweight.
  Perfect for "story started", "story finished", "cap exhausted", "reflection
  failed", "error handler fired."
- **Telegram = two-way questions.** Free-text chat, markdown rendering,
  conversation history. Perfect for "the agent is asking you a question,
  respond with text."

The existing 9 ntfy nodes stay exactly as they are — they are all alerts.
Only the question-form flow (the `Get response` Wait node + the dead
`0.0.0.0` recovery URL) is replaced with a Telegram send + long-poll. Smallest
possible change, and each channel stops doing work it is bad at.

### Creative combination: ntfy as push trigger, Telegram as interaction layer

When a question comes in, **both** fire: ntfy sends the instant push
("Question: <story> / <step> — tap to open"), Telegram sends the full agent
response as a message. Read the ntfy push (reliable — FCM/APNS, system-level),
tap it, and it deep-links into the Telegram chat where you type your reply.

Why this pattern exists: **Telegram's push reliability varies by device.**
Some Android phones aggressively kill Telegram's background process, so its
push notifications arrive late or not at all. ntfy uses FCM (Android) / APNS
(iOS), which are system-level and cannot be killed. So ntfy guarantees you
*see* the alert; Telegram provides the *interaction surface*.

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
noise — two buzzes for every event trains you to ignore both. And for
questions, dedup logic would be needed (only accept the first reply, ignore
the second), which adds complexity for no gain. Pick the channel per message
type and commit.

The one exception: a *question* can justifiably go to both ntfy (push
trigger) and Telegram (interaction), because they serve different roles (alert
vs. reply). That is not redundancy — that is separation of concerns.

## Proposed channel mapping

| Message type | Channel | Why |
| --- | --- | --- |
| Story started / finished | ntfy | Alert, no reply needed |
| Cap exhausted | ntfy | Alert, no reply needed |
| Error handler fired | ntfy | Alert, no reply needed |
| Question from agent | Telegram (+ ntfy push trigger if Telegram push is unreliable) | Needs free-text reply |
| Telegram unreachable | ntfy | Alert about the interaction channel being down |

## Implementation breakdown

1. **Leave ntfy alone** for alerts (the 9 existing nodes stay). Apply F-12
   (`onError: continueRegularOutput`) from Workstream E so an ntfy outage does
   not halt the pipeline — that applies regardless of channels.
2. **Add Telegram** as the question channel: create a bot, add the credential
   to n8n, replace the `Get response` Wait form with a Telegram send +
   long-poll `getUpdates`. The agent's markdown response goes to the chat; the
   reply becomes the next `--session` prompt.
3. **Optionally** add the ntfy push trigger for questions if Telegram push
   proves unreliable on the phone.

## Second-order effect: Telegram chat log as evidence source

Telegram conversations persist. Every question/response thread becomes a
searchable chat history. If the reflector is later taught to learn from human
decisions ("the human chose A over B, here's why"), the Telegram chat log is
a ready-made evidence source — same compounding gain as the GitHub-issue
alternative, but with better phone UX. This is an unexplored follow-on, not
part of the channel-replacement work.

## Alternative architectures considered

These were explored and are recorded here so future work does not re-litigate
them.

### Expose n8n (phone reaches the web UI)

- **Tailscale (plain):** install on devbox + phone, stable hostname,
  `WEBHOOK_URL=http://<tailscale-host>:5678`. WireGuard, no port forwarding.
  Trade-off: phone needs the Tailscale app running for links to resolve.
- **Tailscale Funnel:** publishes a tailnet service to the public internet as
  a stable `https://<machine>.ts.net` URL. Phone needs nothing installed.
  Trade-off: URL is publicly reachable — with F-1's unauthenticated webhook,
  this widens the RCE hole unless D2 lands first.
- **Cloudflare Tunnel + Cloudflare Access:** `cloudflared` tunnels
  `localhost:5678` to a public hostname with no port forwarding; Cloudflare
  Access (Zero Trust, free tier) requires Google/GitHub/OTP auth. Public
  hostname + TLS + auth + zero inbound ports. Most infrastructure, but
  incidentally hardens the F-1 perimeter. Effort: L.
- **SSH reverse tunnel to a VPS:** `ssh -R` from devbox to a VPS with a
  domain; `WEBHOOK_URL` points at the VPS. Fully self-hosted, no third-party
  trust. Trade-off: own the maintenance (reconnect logic, TLS, key rotation,
  dynamic-IP `WEBHOOK_URL` updates). Most control, most work.

### Flip the channel (n8n stays private)

- **ntfy two-topic:** n8n posts the question (with markdown — ntfy renders
  it) to topic `bmad-q-<runId>`. Operator publishes the answer to
  `bmad-a-<runId>`. n8n polls the reply topic via HTTP (outbound). Reuses
  ntfy for both directions, zero new infra. Trade-off: clunky UX — read on
  one topic, switch to another to reply; ntfy's publish UX is basic.
- **GitHub issue as the form:** n8n creates a GitHub issue titled
  `Question: <story> / <step>` with the agent's response as the body. GitHub
  renders markdown natively. Operator comments with free text; n8n polls the
  API for new comments (outbound), passes the comment as the next prompt,
  closes the issue. Reuses existing GitHub infra, auth, and mobile app. Every
  question/decision becomes a permanent, searchable artifact that could feed
  the self-improvement evidence feed. Trade-off: polling latency (30-second
  polling is fine for a human-awaiting question); more formal than chat.
- **Cloudflare Worker + KV, ntfy as push:** ntfy sends the push (instant
  alert) with a `click` URL pointing to a Cloudflare Worker (public HTTPS,
  edge-rendered). The Worker renders the question as HTML + a textarea.
  Operator fills it, submits. Worker stores the response in Cloudflare KV.
  Devbox polls KV (outbound), n8n resumes. Separates push alert (ntfy) from
  form UI (Worker). Trade-off: most moving parts (Worker code, KV schema,
  poller), but each is ~50 lines and free-tier.
- **Email round-trip:** n8n sends the agent's response as HTML email
  (markdown → HTML, same conversion the form already does). Operator replies;
  n8n polls IMAP (outbound). Works from any phone, any email client, no app
  to install, no new account. Highest universality. Trade-off: high latency;
  markdown renders inconsistently in email clients; threading can get messy.

## Open questions and unknowns

- **Telegram push reliability on the operator's phone.** If reliable,
  the ntfy-push-trigger layer is redundant. If unreliable (Android killing
  background processes), the two-app pattern is justified. Test before
  committing to the combined architecture.
- **Form-timeout (F-3.2) interaction.** Replacing the Wait form with
  Telegram long-poll does not solve the stall-when-unreachable problem. If
  the operator is away and does not see the Telegram push, the question
  stalls indefinitely. Telegram's push is far more reliable than "you happen
  to check the n8n form URL," so the practical stall frequency drops sharply.
  If a hard ceiling is wanted, add a timeout to the Telegram-poll equivalent
  that escalates to `INCOMPLETE` auto-continue or `failed` after N hours —
  but that is a separate decision about how autonomous the pipeline should be
  when the operator is unreachable.
- **Question content in the notification.** The current question
  notification says "awaiting your response" without the actual question.
  Whichever architecture lands, the question content should travel in the
  notification itself (ntfy message body, Telegram message, issue body,
  email body) — not just "click here to see what's being asked." This is a
  one-line fix to the Notify node that improves all architectures.
