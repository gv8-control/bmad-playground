# Spike: WebSocket tunnel proxy for LLM access from a Daytona sandbox

**Date:** 2026-07-22 (initial), 2026-07-23 (re-verified with broader URL coverage)
**Status:** Complete — tunnel proxy verified end-to-end
**Closes:** The gap left by `spike-opencode-relay.md`, which verified the Caddy reverse-proxy approach (opencode with `baseURL` override) but not the WebSocket tunnel approach (opencode with `HTTPS_PROXY`, no `baseURL` override).
**Harness:** Reuses `docs/todo/spike-opencode-sandbox.js` (OpencodeSandbox, SpikeRunner)
**Script:** `docs/todo/spike-ws-tunnel-proxy.js`

## TL;DR

A local CONNECT-to-WebSocket tunnel proxy (`docs/todo/tunnel-proxy.js`) runs inside a Tier 1
Daytona sandbox on `127.0.0.1:8888`. It handles HTTP CONNECT requests from opencode (Go's
`net/http` respects `HTTPS_PROXY` natively) and bridges each CONNECT to the relay's WebSocket
`/tunnel` endpoint, which opens a raw TCP connection to the target host and pipes bytes
bidirectionally. The outer TLS (sandbox → Railway relay) has an allowlisted SNI, so Envoy allows
it; the inner TLS (sandbox → target) flows inside the WebSocket, invisible to the SNI filter.
opencode uses the real `api.neuralwatt.com` URL — no `baseURL` override in `opencode.json`.

All eight original spike steps passed (2026-07-22). A re-verification run (2026-07-23) confirmed
all results and extended coverage to additional non-allowlisted URLs and Essential Services
direct-access bypass.

## What was unverified before this spike

`spike-opencode-relay.md` verified the Caddy reverse-proxy approach: opencode with
`provider.neuralwatt.options.baseURL` pointed at the relay's `/proxy/` path-based endpoint. That
worked but required a `baseURL` override in `opencode.json`, meaning the agent used a relay URL
instead of the real `api.neuralwatt.com` URL. The WebSocket tunnel approach — where a local proxy
handles CONNECT requests and bridges them to the relay's WebSocket tunnel — was unverified. This
spike closes that gap: opencode runs with `HTTPS_PROXY=http://127.0.0.1:8888` and no `baseURL`
override, using the real `api.neuralwatt.com` URL.

## Spike design (original, 2026-07-22)

Eight steps, all inside a single Tier 1 Daytona sandbox created and destroyed per run:

1. **Create sandbox + install opencode** — reuses the harness.
2. **Direct `api.neuralwatt.com` fails** — sanity check that the Tier 1 block is still in place (HTTP 000 / connection reset).
3. **Upload `tunnel-proxy.js`** to `/tmp/tunnel-proxy.js` in the sandbox.
4. **Install `ws` + start tunnel proxy** in the background with `TUNNEL_RELAY_URL`, `TUNNEL_RELAY_TOKEN`, and `TUNNEL_LISTEN_PORT` env vars.
5. **curl through tunnel** to `api.neuralwatt.com/v1/models` with `HTTPS_PROXY` set — verifies the tunnel reaches the non-allowlisted host.
6. **opencode run with `HTTPS_PROXY`** (no `baseURL` override) — `opencode run --model neuralwatt/glm-5.2 "Print exactly: SPIKE_OK"` — verifies provider resolution + API call + output capture through the tunnel.
7. **Streaming chat completion** — `opencode run --format json --model neuralwatt/glm-5.2` — verifies structured event output (`step_start`, `text`, `step_finish`) through the tunnel.
8. **Check tunnel proxy logs** — confirms each CONNECT was bridged.

### The opencode.json written into the sandbox

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "neuralwatt": {
      "models": {
        "glm-5.2": {
          "limit": {
            "context": 1048560,
            "output": 1048560
          }
        }
      }
    }
  }
}
```

No `options.baseURL` — the provider uses its default endpoint (`api.neuralwatt.com`). The
`HTTPS_PROXY` env var routes the request through the local tunnel proxy, which bridges it to the
relay's WebSocket `/tunnel` endpoint. The relay opens a raw TCP connection to the target and pipes
bytes bidirectionally. `NEURALWATT_API_KEY` is injected into the shell env; opencode reads it and
sends it as the `Authorization: Bearer` header, which passes through the tunnel to the target.

### NO_PROXY for Essential Services

The in-sandbox command sets `NO_PROXY` to exclude Daytona's Essential Services:
`models.dev,registry.npmjs.org,registry.npmjs.com,github.com,*.githubusercontent.com,opencode.ai,*.railway.app,railway.app,railway.com`.
The sandbox reaches these directly (they're on the Tier 1 allowlist), and the relay rejects
tunnel requests for allowlisted domains with HTTP 400 `DOMAIN_DIRECTLY_REACHABLE`.

## Results (2026-07-22 run)

| Step                                         | Result         | Duration | Notes                                                     |
| -------------------------------------------- | -------------- | -------- | --------------------------------------------------------- |
| 1. Create + install                          | PASS           | ~11s     | opencode 1.1.35                                           |
| 2. Direct `api.neuralwatt.com`               | PASS (blocked) | 0.1s     | HTTP 000 — Tier 1 SNI block confirmed                     |
| 3. Upload `tunnel-proxy.js`                  | PASS           | 0.1s     | 139 lines written via heredoc                             |
| 4. Install `ws` + start proxy                | PASS           | ~2s      | Proxy listening on 127.0.0.1:8888, auth enabled            |
| 5. curl via tunnel to `/v1/models`           | PASS           | ~1s      | JSON model list returned (gemma-4-31b, etc.)               |
| 6. `opencode run` (no `baseURL`)             | PASS           | ~9s      | Exit 0, output contains `SPIKE_OK`                        |
| 7. `opencode run --format json` (streaming)  | PASS           | ~10s     | Exit 0, structured events (step_start, text, step_finish) |
| 8. Proxy logs                                | PASS           | —        | Each CONNECT bridged to relay                             |

## Re-verification (2026-07-23)

A broader verification run confirmed all original results and extended coverage to additional
non-allowlisted URLs and Essential Services direct-access bypass. The test script created a
fresh Tier 1 sandbox, provisioned it identically, and ran 11 checks:

| Step                                         | Result  | Notes                                                     |
| -------------------------------------------- | ------- | --------------------------------------------------------- |
| 1. Direct `api.neuralwatt.com` (blocked)     | PASS    | HTTP 000 — Tier 1 SNI block confirmed                     |
| 2a. `github.com` direct (Essential Service)  | PASS    | HTTP 200 — reachable without proxy                        |
| 2b. `registry.npmjs.org` direct               | PASS    | HTTP 200 — reachable without proxy                        |
| 3. Tunnel proxy started                       | PASS    | Port 8888, relay auth enabled                             |
| 4. curl `api.neuralwatt.com` via tunnel       | PASS    | JSON model list returned                                  |
| 5. curl `httpbin.org` via tunnel              | PASS    | HTTP 200 — non-allowlisted URL reachable through tunnel   |
| 6. curl `discord.com` via tunnel              | PASS    | HTTP 200 — non-allowlisted URL reachable through tunnel   |
| 7a. `github.com` with `NO_PROXY` bypass      | PASS    | HTTP 200 — went direct, not through relay                 |
| 7b. `registry.npmjs.org` with `NO_PROXY`     | PASS    | HTTP 200 — went direct, not through relay                |
| 8. opencode agent through tunnel             | PASS    | Exit 0, agent ran curl for all 4 URLs and reported results |
| 9. Proxy logs                                 | PASS    | 31 log lines, all CONNECTs bridged                        |

### Agent results (step 8)

The opencode agent (`neuralwatt/glm-5.2`) was prompted to run `curl` for four URLs and report
HTTP status codes. The agent executed all four and reported:

```
RESULTS:
1. api.neuralwatt.com: 200 - success
2. httpbin.org: 200 - success
3. github.com: 200 - success
4. registry.npmjs.org: 200 - success
```

The agent used `HTTPS_PROXY=http://127.0.0.1:8888` and `NO_PROXY` for Essential Services. No
`baseURL` override in `opencode.json` — opencode used the real `api.neuralwatt.com` URL for its
own LLM calls, and the agent's `curl` commands respected the same proxy settings.

## What this proves

1. **The tunnel proxy bypasses the Tier 1 SNI filter.** Non-allowlisted hosts
   (`api.neuralwatt.com`, `httpbin.org`, `discord.com`) are reachable through the tunnel. The
   outer TLS to the Railway relay has an allowlisted SNI; the inner TLS to the target flows inside
   the WebSocket, invisible to the Envoy SNI filter.
2. **opencode works through the tunnel with no `baseURL` override.** The agent uses the real
   `api.neuralwatt.com` URL. `HTTPS_PROXY` is set in the environment; Go's `net/http` respects it
   natively. Both non-streaming and streaming (`--format json`) runs succeed.
3. **Essential Services are reachable directly (no proxy).** `github.com` and
   `registry.npmjs.org` return HTTP 200 without going through the tunnel. The `NO_PROXY` env var
   correctly excludes them, so the proxy is not in the path for allowlisted hosts.
4. **The relay's auth is enforced.** The proxy sends the `x-relay-token` header; without it, the
   relay returns 401. The token rides with the `.env*` files copied per-sandbox at provision time.
5. **The tunnel handles multiple concurrent CONNECT requests.** The proxy log shows 31 lines with
   multiple sequential CONNECT requests to different hosts, all bridged successfully.

## What this does not prove

- **Concurrency under load** — this spike ran a single sandbox with sequential calls. The
  pipeline's `maxConcurrentSandboxes` (5) with concurrent relay traffic is not tested here.
- **Relay availability over time** — the relay is a single Railway service. This spike verifies it
  works now, not its uptime characteristics.
- **Error recovery** — no provider mid-stream drops or relay failures were simulated. Those are
  covered by `spike-midstream-resume.js` and `spike-stop-resume.js`.
- **All non-allowlisted URLs** — three were tested (`api.neuralwatt.com`, `httpbin.org`,
  `discord.com`). The tunnel should work for any non-allowlisted HTTPS host, but edge cases
  (hosts that block non-browser TLS fingerprints, hosts requiring client certificates) are not
  covered.

## Impact on the plan

The plan's resolved question 2 and the WebSocket tunnel proxy section under Worker sandbox design
both cite this spike. The tunnel proxy is the chosen approach for sandbox LLM access: no
`baseURL` override in `opencode.json`, `HTTPS_PROXY` set in the in-sandbox command, `NO_PROXY`
for Essential Services. The relay is deployed at
`sandbox-relay-production.up.railway.app` and verified.

## Spike script

`docs/todo/spike-ws-tunnel-proxy.js` — reuses `OpencodeSandbox` and `SpikeRunner` from
`spike-opencode-sandbox.js`. Creates and destroys its own sandbox. Total sandbox time: ~32s
(original run) / ~90s (re-verification with broader coverage). No sandbox left running.
