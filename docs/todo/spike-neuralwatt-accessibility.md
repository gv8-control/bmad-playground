# Investigation: neuralwatt API accessibility from Daytona sandboxes

**Date:** 2026-07-22
**Status:** Complete — root cause identified
**Investigates:** Assumption #6 from `docs/todo/graph-pipeline.md` "Admitted assumptions" section (originally reported as finding F2 in `docs/todo/spike-opencode-sandbox.md`)
**Harness:** Reuses `docs/todo/spike-opencode-sandbox.js` (OpencodeSandbox class)

## TL;DR

The original finding F2 attributed the failure to "Cloudflare bot protection blocking the Daytona sandbox egress IP range." **This is wrong.** The root cause is **Daytona's own network tier policy**: the sandbox is on Tier 1 (free/personal), which restricts outbound TLS to a curated "Essential Services" domain allowlist enforced via SNI inspection at an Envoy proxy. `neuralwatt.com` is not on that allowlist, so the Envoy proxy resets the TLS connection when it sees the SNI in the Client Hello. The fix is operational, not a network workaround: upgrade to Tier 3+ (open egress) or add `neuralwatt.com` to the sandbox's `domainAllowList`.

## Original finding (F2, from spike-opencode-sandbox.md)

> `api.neuralwatt.com` resolves correctly (Cloudflare IPs) and the TCP connection succeeds, but the TLS handshake is reset by the peer (`write:errno=104`). Other Cloudflare-fronted sites (`httpbin.org`) exhibit the same failure. Non-Cloudflare HTTPS sites (`api.anthropic.com`, `api.openai.com`, `cloudflare.com` itself, `models.dev`, `registry.npmjs.org`) work fine.
>
> **Root cause:** Likely Cloudflare bot protection blocking the Daytona sandbox egress IP range. Not a Daytona network restriction — the sandbox has open egress.

The hypothesis was plausible: Cloudflare's bot products can block datacenter IPs, and the failure pattern (TLS reset, not HTTP 403) seemed consistent with L4-level filtering. The investigation disproves this.

## Investigation method

Four spike scripts, each reusing the `OpencodeSandbox` harness from `spike-opencode-sandbox.js`:

1. **`spike-neuralwatt-accessibility.js`** — full network stack diagnostics (DNS, TCP, TLS, HTTP, control sites)
2. **`spike-cloudflare-targeted.js`** — tested 12 sites to find the Cloudflare vs non-Cloudflare pattern
3. **`spike-sni-filtering.js`** — SNI cross-test: same IP, different SNI values; also tested HTTP port 80
4. **`spike-sni-confirmation.js`** — 12 SNI values against a single known-working IP, plus HTTP body capture

All scripts are in `docs/todo/` and were run against live Daytona sandboxes (created and destroyed per run).

## Evidence chain

### Step 1: The failure is at the TLS layer, not TCP or DNS

From `spike-neuralwatt-accessibility.js`:

- DNS resolves `api.neuralwatt.com` correctly → `104.26.7.80`, `104.26.6.80`, `172.67.73.70` (Cloudflare IPs)
- TCP connection to port 443 succeeds (`TCP_OK`)
- TLS handshake fails: `write:errno=104` (Connection reset by peer) — the sandbox wrote the Client Hello, the peer reset the connection before sending a Server Hello
- No peer certificate is ever received (`no peer certificate available`, `SSL handshake has read 0 bytes`)
- Node.js `fetch()` fails with `ECONNRESET` on `read` syscall

### Step 2: Not all Cloudflare sites fail — the "Cloudflare bot protection" hypothesis breaks

From `spike-cloudflare-targeted.js` (12 sites tested):

| Site | Cloudflare? | TLS result | IP resolved |
|---|---|---|---|
| neuralwatt | Yes | RESET | 104.26.7.80 |
| cloudflare.com | Yes | RESET | 104.16.123.96 |
| httpbin.org | Yes | RESET | 32.194.128.236 |
| discord.com | Yes | RESET | 162.159.136.232 |
| workers.cloudflare.com | Yes | RESET | 104.16.196.131 |
| 1.1.1.1 | Yes | RESET | 1.1.1.1 |
| **api.openai.com** | **Yes** | **OK** | **162.159.140.245** |
| **www.shopify.com** | **Yes** | **OK** | **172.64.145.93** |
| api.anthropic.com | No | OK | 160.79.104.10 |
| github.com | No | OK | 140.82.121.3 |
| www.kaggle.com | No | RESET | 35.244.233.98 |
| registry.npmjs.org | Cloudflare IPs | Hang/OK | 104.16.9.34 |

If Cloudflare bot protection were blocking the egress IP, **all** Cloudflare-fronted sites would fail. But OpenAI and Shopify — both behind Cloudflare — succeed. And kaggle.com (Google/GCP, not Cloudflare) fails. The "Cloudflare bot protection" hypothesis is disproven.

### Step 3: The filter is SNI-based, not IP-based

From `spike-sni-filtering.js` — the decisive cross-test:

**Test A:** Connect to OpenAI's IP (162.159.140.245, TLS works normally) but send `api.neuralwatt.com` as the SNI:
→ **RESET** (errno=104)

**Test B:** Connect to neuralwatt's IP (104.26.7.80, TLS fails normally) but send `api.openai.com` as the SNI:
→ **TLS OK** (certificate for `api.openai.com` returned, handshake completes)

**Test C:** Connect to neuralwatt's IP with no SNI (`-noservername`):
→ **RESET**

**Test D:** HTTP (port 80, no TLS) to `api.neuralwatt.com`:
→ **HTTP 403 Forbidden**, body: `"Internet is restricted on Tier 1 and Tier 2."`, `server: envoy`

The conclusion is inescapable: the filter inspects the SNI field in the TLS Client Hello and resets connections to hostnames not on an allowlist. The destination IP is irrelevant — the same IP accepts or rejects based on the SNI. Plain HTTP (port 80) is intercepted by an Envoy proxy that returns a 403 with a body explicitly stating the tier restriction.

### Step 4: Confirmation — 12 SNI values against a single working IP

From `spike-sni-confirmation.js` — all 12 SNI values tested against OpenAI's IP (162.159.140.245):

| SNI | Result | In Essential Services? |
|---|---|---|
| api.openai.com | TLS OK | Yes (OpenAI) |
| www.shopify.com | TLS OK | Yes (Shopify) |
| api.anthropic.com | TLS OK | Yes (Anthropic) |
| github.com | TLS OK | Yes (GitHub) |
| registry.npmjs.org | TLS OK | Yes (npm) |
| api.neuralwatt.com | RESET | **No** |
| www.cloudflare.com | RESET | No (cloudflare.com is, but www. subdomain may not match) |
| discord.com | RESET | No |
| httpbin.org | RESET | No |
| workers.cloudflare.com | RESET | No |
| www.google.com | RESET | No |
| fake-nonexistent-domain-12345.com | RESET | No |

Every SNI in Daytona's "Essential Services" allowlist succeeds; every SNI not in the allowlist is reset. The correlation is perfect.

## Root cause

**Daytona Tier 1 network policy.** The sandbox runs on a Tier 1 (free/personal) account, which restricts outbound network access to a curated "Essential Services" allowlist. The restriction is enforced by an Envoy proxy that:

1. **For HTTPS (port 443):** inspects the SNI field in the TLS Client Hello. If the SNI hostname is not on the allowlist, the proxy resets the TCP connection (RST), which the client experiences as `Connection reset by peer` (errno 104) during the TLS handshake. No HTTP response is ever returned — the reset happens before TLS completes.
2. **For HTTP (port 80):** intercepts the HTTP request and returns `403 Forbidden` with body `"Internet is restricted on Tier 1 and Tier 2."` and `server: envoy`.

The Essential Services allowlist includes: npm, PyPI, crates, GitHub, GitLab, Docker registries, Anthropic, OpenAI, Gemini, DeepSeek, Groq, Perplexity, Qwen, Hugging Face, Railway, Vercel, Supabase, opencode.ai, and others. Neuralwatt is not on this list.

This is documented at https://www.daytona.io/docs/network-limits — Tier 1 & 2 have restricted egress (Essential Services only, cannot be overridden per sandbox); Tier 3 & 4 have open internet access by default.

### Why the original F2 hypothesis was wrong

The original spike observed that "non-Cloudflare HTTPS sites work fine" and concluded Cloudflare was the blocker. This was a sampling error: the control sites chosen (Anthropic, OpenAI, npm, GitHub) are all in the Essential Services allowlist — they work because they're allowlisted, not because they're non-Cloudflare. OpenAI is behind Cloudflare and works fine. The original spike tested `cloudflare.com` (which failed) and attributed it to Cloudflare blocking itself, but `cloudflare.com` is not in the Essential Services allowlist (only specific Cloudflare service domains like `r2.cloudflarestorage.com` and `gateway.ai.cloudflare.com` are).

The `write:errno=104` (TCP RST during TLS handshake) was mistaken for a Cloudflare L4 action, but it's actually the Envoy proxy in the sandbox's network path sending the RST after inspecting the SNI.

## Impact on the graph pipeline plan

The plan's resolved question 17 (revised) says:

> neuralwatt's API (`api.neuralwatt.com`, Cloudflare-fronted) is unreachable from Daytona sandboxes — the TLS handshake is reset by the peer, likely Cloudflare bot protection blocking the sandbox egress IP range. Non-Cloudflare providers (Anthropic, OpenAI) work fine from sandboxes.

This is incorrect in its mechanism but the practical consequence is the same: neuralwatt is unreachable from Tier 1 sandboxes. The resolution path changes:

- **Original (wrong) understanding:** Cloudflare is blocking the egress IP; workarounds are proxy, allowlist request, or alternative provider. No quick fix.
- **Corrected understanding:** Daytona's own network tier restricts egress to an allowlist; neuralwatt is not on it. The fix is operational: upgrade the Daytona account to Tier 3+ (open egress) or use `domainAllowList` to add `neuralwatt.com` (if the tier supports it — Tier 1/2 cannot override the Essential Services restriction, so this requires Tier 3+).

### What works and what doesn't from sandboxes (corrected)

| Provider | Accessible from Tier 1 sandbox | Reason |
|---|---|---|
| Anthropic (`api.anthropic.com`) | Yes | In Essential Services |
| OpenAI (`api.openai.com`) | Yes | In Essential Services |
| Google Gemini | Yes | In Essential Services |
| DeepSeek, Groq, Perplexity, Qwen | Yes | In Essential Services |
| **neuralwatt** (`api.neuralwatt.com`) | **No** | Not in Essential Services |
| Cloudflare Workers | No | Not in Essential Services |
| Discord, httpbin.org, google.com | No | Not in Essential Services |

### Resolution options (updated)

1. **Upgrade to Daytona Tier 3+** (recommended). Open egress by default; no allowlist management needed. The pipeline's `maxConcurrentSandboxes` cap (5) and the 30 GiB shared quota already imply a paid tier. This is the cleanest fix and removes the entire class of "is X in the allowlist?" problems.

2. **Use a provider in the Essential Services allowlist** (Anthropic, OpenAI, etc.) for sandbox agents. This is what the plan already proposes as a workaround. It works on Tier 1 but forces a split-provider setup (neuralwatt on devcontainer, alternative in sandboxes) that the plan calls "a temporary split."

3. **BYOC (Bring Your Own Compute)** — attach a machine with open egress as a Daytona runner. The sandbox egress would then be the customer machine's IP with no allowlist restriction. Overkill for this problem but documented as a Daytona feature.

4. **Proxy neuralwatt through a relay** — still viable but unnecessary if option 1 or 2 is taken. The proxy itself would need to be on an allowlisted domain or on a Tier 3+ sandbox.

5. ~~Ask neuralwatt to allowlist Daytona egress IPs~~ — **not needed**. The block is not on neuralwatt's side; it's Daytona's network policy. Neuralwatt's Cloudflare configuration is not the issue.

## Spike scripts

| Script | Purpose | Reuses |
|---|---|---|
| `spike-neuralwatt-accessibility.js` | Full network stack diagnostics (DNS, TCP, TLS, HTTP, control sites) | `spike-opencode-sandbox.js` (OpencodeSandbox, SpikeRunner) |
| `spike-cloudflare-targeted.js` | 12-site test to find the Cloudflare vs non-Cloudflare pattern | Same |
| `spike-sni-filtering.js` | SNI cross-test: same IP, different SNI; HTTP port 80 body capture | Same |
| `spike-sni-confirmation.js` | 12 SNI values against a single working IP; final confirmation | Same |

All scripts create and destroy their own sandboxes. Total sandbox time across all four runs: ~9 seconds (4 sandboxes, each ~2s). No sandboxes were left running.

## Recommendation for the graph pipeline plan

**Resolved (2026-07-22): a Caddy reverse proxy on Railway is the chosen resolution.**
`*.railway.app` is on the Essential Services allowlist, so sandbox agents can reach the
relay. The relay forwards requests to `api.neuralwatt.com`, passing through the
`Authorization` header. The relay domain is
`neuralwatt-relay-production.up.railway.app`; the Docker image is
`ghcr.io/marius321967/neuralwatt-relay:latest` (public). Spike-verified from a Tier 1
sandbox: `/v1/models` returns 200, chat completions work, SSE streaming arrives
incrementally (not buffered). See resolved question 17 in `graph-pipeline.md` for the full
decision and spike results.

**Follow-up spike (2026-07-22):** the curl-based verification above proved the network
path but left the opencode path unverified — no spike had run `opencode run --model
neuralwatt/glm-5.2` with the provider `baseURL` pointed at the relay.
`docs/todo/spike-opencode-relay.js` closes that gap: it writes an `opencode.json` with
`provider.neuralwatt.options.baseURL` set to the relay URL into the sandbox, injects
`NEURALWATT_API_KEY` into the env, and runs opencode. Both non-streaming (`opencode run
--model neuralwatt/glm-5.2 "Print exactly: SPIKE_OK"` → exit 0, output contains
`SPIKE_OK`) and streaming (`--format json` → full `step_start`/`text`/`step_finish` event
sequence) succeed. See `docs/todo/spike-opencode-relay.md` for the full report.

The reasoning changes from "Cloudflare bot protection" to "Daytona Tier 1 network
allowlist." This matters because:

- It means the block is **fully under our control** (upgrade the account), not dependent on a third party (Cloudflare/neuralwatt).
- It means **no allowlist request to neuralwatt is needed** — the block is not on their side.
- It means the `domainAllowList` approach mentioned in the plan's provisioning recipe is the right mechanism, but only works on Tier 3+ (Tier 1/2 cannot override the Essential Services restriction).
- It corrects the record for anyone debugging similar connectivity issues from Daytona sandboxes in the future.

The plan should also update the "Sandbox platform capabilities" table entry for "Network to devcontainer" and the provisioning recipe's note about `domainAllowList` — the current text says "start with `networkBlockAll: false` (default) and tighten to an explicit allowlist when the pipeline is stable," but on Tier 1 the default is already restricted (not open), and `networkBlockAll: false` does not mean open egress on Tier 1.

## Online sources

The claims in this report are backed by the following online sources, all fetched during the investigation.

### Daytona tier-based network restrictions (primary root cause)

**Source:** https://www.daytona.io/docs/network-limits

Key quotes verifying the root cause:

> **Tier 1 & Tier 2**: Network access is restricted and cannot be overridden at the sandbox level. Organization-level network restrictions take precedence over sandbox-level settings. Even with `networkAllowList` or `domainAllowList` specified when creating a sandbox, the organization's network restrictions still apply.

> **Tier 3 & Tier 4**: Full internet access is available by default, with the ability to configure custom network settings.

> Organizations on Tier 1 or Tier 2 cannot override network policy at the sandbox level, and the API returns an error in that case.

This directly confirms: (a) Tier 1 sandboxes have restricted egress, (b) the restriction cannot be overridden per-sandbox on Tier 1, (c) the fix requires Tier 3+. The "Essential services" list on the same page confirms which domains are reachable on all tiers — `neuralwatt.com` is not listed. The AI/ML services section lists Anthropic, OpenAI, Google AI, Perplexity, DeepSeek, Groq, Qwen, Hugging Face, OpenRouter, and others, but not neuralwatt.

### Daytona network isolation model

**Source:** https://www.daytona.io/docs/isolation

Key quote:

> **Outbound** traffic passes a per-sandbox firewall. Tier-based restrictions apply automatically, and each sandbox can be locked down further with one of three mutually exclusive settings: block all traffic, allow specific CIDR ranges, or allow specific domains. Essential services such as package registries stay reachable on all tiers.

> Sandbox to internet: Open on Tier 3 and above; restricted on Tier 1 and 2.

This confirms the per-sandbox firewall (which the spike identified as Envoy via the `server: envoy` header) and the tier-based default policy.

### Daytona Essential Services allowlist

**Source:** https://www.daytona.io/docs/network-limits#essential-services

The full allowlist is documented on this page. The AI/ML services section includes: `*.anthropic.com`, `openai.com`, `*.openai.com`, `generativelanguage.googleapis.com`, `api.perplexity.ai`, `api.deepseek.com`, `api.groq.com`, `chat.qwen.ai`, `huggingface.co`, `*.huggingface.co`, `openrouter.ai`, `opencode.ai`, `*.opencode.ai`, and many others. Neuralwatt is not listed. This is the allowlist the SNI filter enforces — the spike's 12-SNI confirmation test matches this list exactly.

### Daytona regions (shared infrastructure)

**Source:** https://www.daytona.io/docs/regions

Key quote:

> **Shared regions** are managed by Daytona and available to all organizations. Region: United States (`us`), Europe (`eu`).

This confirms the sandbox runs on shared Daytona-managed infrastructure. The docs do not publicly name the underlying cloud provider.

### Cloudflare bot products operate at HTTP layer, not TLS reset

**Source:** https://developers.cloudflare.com/bots/get-started/bot-fight-mode/

Key quote:

> Bot Fight Mode is a simple, free product that helps detect and mitigate bot traffic on your domain. When enabled, the product: Identifies traffic matching patterns of known bots; Issues computationally expensive challenges that force the requesting client to perform CPU-intensive calculations.

> Bot Fight Mode does not run on the Ruleset Engine — it operates in a separate evaluation pipeline where Skip, Bypass, and Allow actions have no effect.

The documented behavior is HTTP-layer: challenges (HTTP 200 with interstitial JS), blocks (HTTP 403), and JS detections injected into HTML responses. None of the documented bot products describe TCP/TLS-level connection resets (errno 104). A TLS reset is inconsistent with Cloudflare's documented bot protection behavior, which is what the spike evidence confirmed — the reset comes from Daytona's Envoy proxy, not Cloudflare.

**Source:** https://developers.cloudflare.com/bots/concepts/bot/

Key quote:

> AI crawlers and agents interact with your site for very different reasons, and you may want to treat those reasons differently. Rather than relying on a single "AI bot" label, Cloudflare classifies bots by behavior — what a bot does on your site.

This confirms Cloudflare's bot classification is behavior-based (Search, Agent, Training), not IP-based blocking that would produce TLS resets. The "Agent" classification targets browser-use agents and chat fetch bots, not OpenAI-compatible API clients making authenticated Bearer-token requests.

### Cloudflare does not appear in the failure path

The spike evidence is the primary source here, but the Cloudflare docs corroborate: if Cloudflare bot protection were the cause, the failure would manifest as an HTTP 403 challenge page (the documented behavior), not a TCP RST during the TLS handshake. The spike's HTTP port 80 test returned `server: envoy` (Daytona's proxy) with body `"Internet is restricted on Tier 1 and Tier 2."` — this is Daytona's own filter explicitly identifying itself, not Cloudflare.

### Neuralwatt documentation

**Source:** https://portal.neuralwatt.com/docs/authentication

Neuralwatt is an LLM inference API gateway at `api.neuralwatt.com`, behind Cloudflare. The docs describe Bearer-token authentication, rate limits, and tier-based access (Trial through Enterprise). There is no documented IP allowlisting feature, no WAF configurability for customers, and no documented mechanism that would produce TLS resets. The docs mention an "Abuse Protection" section that reserves the right to throttle based on IP range patterns, but this would produce HTTP-level rate limiting (429), not TLS handshake resets.

### Summary of source verification

| Claim | Source | URL |
|---|---|---|
| Tier 1 restricts egress, cannot be overridden | Daytona network-limits docs | https://www.daytona.io/docs/network-limits |
| Tier 3+ has open egress by default | Daytona network-limits docs | https://www.daytona.io/docs/network-limits |
| Outbound traffic passes a per-sandbox firewall | Daytona isolation docs | https://www.daytona.io/docs/isolation |
| Essential Services allowlist (neuralwatt not listed) | Daytona network-limits docs | https://www.daytona.io/docs/network-limits#essential-services |
| Cloudflare bot products issue HTTP challenges, not TLS resets | Cloudflare bot docs | https://developers.cloudflare.com/bots/get-started/bot-fight-mode/ |
| Cloudflare bot classification is behavior-based, not IP-blocking | Cloudflare bot concepts | https://developers.cloudflare.com/bots/concepts/bot/ |
| Sandboxes run on shared Daytona-managed infrastructure | Daytona regions docs | https://www.daytona.io/docs/regions |
| Neuralwatt has no documented IP allowlisting or TLS-reset behavior | Neuralwatt portal docs | https://portal.neuralwatt.com/docs/authentication |
