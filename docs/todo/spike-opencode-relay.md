# Spike: opencode through neuralwatt relay from a Daytona sandbox

**Date:** 2026-07-22
**Status:** Complete — opencode-through-relay path verified
**Closes:** The gap left by `spike-neuralwatt-accessibility.md`, which verified the relay via manual `curl` but never exercised opencode itself calling neuralwatt through the relay.
**Harness:** Reuses `docs/todo/spike-opencode-sandbox.js` (OpencodeSandbox, SpikeRunner)
**Script:** `docs/todo/spike-opencode-relay.js`

## TL;DR

The prior relay spike verified the Caddy relay on Railway via `curl` from inside a Tier 1 sandbox. That proved the network path works but left the actual opencode path unverified — no spike had ever run `opencode run --model neuralwatt/glm-5.2` with the provider `baseURL` pointed at the relay. **This spike closes that gap.** opencode successfully resolves the `neuralwatt` provider from a sandbox-local `opencode.json`, routes the request through `https://neuralwatt-relay-production.up.railway.app/v1`, authenticates with `NEURALWATT_API_KEY`, and returns model output. Both non-streaming and streaming (`--format json`) runs succeed.

## What was unverified before this spike

`spike-neuralwatt-accessibility.md` resolved question 17 with:

> Spike-verified from a Tier 1 sandbox: `/v1/models` returns 200, chat completions work, SSE streaming arrives incrementally (not buffered).

Those tests were manual `curl` commands. The opencode-specific path — provider resolution from `opencode.json`, `baseURL` override propagation, API key injection into the provider's `Authorization` header, opencode's own SSE parser — was never exercised. The spike harness (`spike-opencode-sandbox.js`) had no code path that wrote an `opencode.json` or set `NEURALWATT_API_KEY`; subsequent spikes (`spike-stop-resume.js`, `spike-midstream-resume.js`) worked around the neuralwatt unreachability by switching to opencode-hosted free models (`opencode/big-pickle`, `opencode/deepseek-v4-flash-free`).

## Spike design

Six steps, all inside a single Tier 1 Daytona sandbox created and destroyed per run:

1. **Create sandbox + install opencode** — reuses the harness.
2. **Direct `api.neuralwatt.com` fails** — sanity check that the Tier 1 block is still in place (HTTP 000 / connection reset).
3. **Relay `/v1/models` via curl succeeds** — sanity check that the relay is up and the API key is valid.
4. **Write `opencode.json`** to `/tmp` with `provider.neuralwatt.options.baseURL` set to `https://neuralwatt-relay-production.up.railway.app/v1`.
5. **`opencode run --model neuralwatt/glm-5.2 "Print exactly: SPIKE_OK"`** — non-streaming, verifies provider resolution + API call + output capture.
6. **`opencode run --format json --model neuralwatt/glm-5.2`** — streaming, verifies structured event output (step_start, text, step_finish).

### The opencode.json written into the sandbox

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "neuralwatt": {
      "options": {
        "baseURL": "https://neuralwatt-relay-production.up.railway.app/v1"
      },
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

The `options.baseURL` field is the opencode provider config key that overrides the built-in API endpoint (confirmed in the [opencode config schema](https://opencode.ai/config.json) → `ProviderConfig.options.baseURL`). The `NEURALWATT_API_KEY` is injected into the shell env for the `opencode run` command; opencode reads it and sends it as the `Authorization: Bearer` header, which the Caddy relay passes through to `api.neuralwatt.com`.

## Results (2026-07-22 run)

| Step                                         | Result         | Duration | Notes                                                     |
| -------------------------------------------- | -------------- | -------- | --------------------------------------------------------- |
| 1. Create + install                          | PASS           | 10.7s    | opencode 1.1.35                                           |
| 2. Direct `api.neuralwatt.com`               | PASS (blocked) | 0.1s     | HTTP 000 — Tier 1 SNI block confirmed                     |
| 3. Relay `/v1/models` via curl               | PASS           | 1.7s     | 498 chars of model list returned                          |
| 4. Write `opencode.json`                     | PASS           | 0.1s     | Config written, contains relay baseURL                    |
| 5. `opencode run --model neuralwatt/glm-5.2` | PASS           | 8.9s     | Exit 0, output contains `SPIKE_OK`                        |
| 6. `opencode run --format json` (streaming)  | PASS           | 10.3s    | Exit 0, structured events (step_start, text, step_finish) |

Total wall time: 32.4s (including sandbox creation, npm install, and teardown).

### Step 5 output (non-streaming)

```
INFO  2026-07-22T12:13:32 +39ms service=models.dev file={} refreshing
SPIKE_OK
```

opencode resolved the `neuralwatt` provider from `/tmp/opencode.json`, used the relay `baseURL`, authenticated with the env-injected `NEURALWATT_API_KEY`, called `glm-5.2`, and returned the model's output. Exit code 0.

### Step 6 output (streaming, `--format json`)

```
INFO  2026-07-22T12:13:41 +90ms service=models.dev file={} refreshing
{"type":"step_start","timestamp":1784722424291,"sessionID":"ses_07641086cffef1Le32Nm4K1AWZ","part":{"id":"prt_f89bf01e10019FLib5fE5z2S3K","sessionID":"ses_07641086cffef1Le32Nm4K1AWZ","messageID":"msg_f89bef805001dkpPY5CIzbpu1a","type":"step-start"}}
{"type":"text","timestamp":1784722431081,"sessionID":"ses_07641086cffef1Le32Nm4K1AWZ","part":{"id":"prt_f89bf0528001AabN03loLqvU3a","sessionID":"ses_07641086cffef1Le32Nm4K1AWZ","messageID":"msg_f89bef805001dkpPY5CIzbpu1a","type":"text","text":"HTTP/2 multiplexing allows multiple concurrent requests and responses to be sent over a single TCP connection using binary frames, each tagged with a unique stream identifier. Frames from different streams are interleaved on the wire, so a slow response on one stream doesn't block others (head-of-line blocking is eliminated at the HTTP level). This contrasts with HTTP/1.1, where each request typically needs its own connection or must wait in line, reducing latency and improving connection efficiency.","time":{"start":1784722431078,"end":1784722431078}}}
{"type":"step_finish","timestamp":1784722431083,"sessionID":"ses_07641086cffef1Le32Nm4K1AWZ","part":...}}
```

The full event sequence (`step_start` → `text` → `step_finish`) is present. The `text` event carries the model's response. opencode's SSE parser correctly decoded the chunked response from the relay.

## What this proves

1. **opencode's `provider.neuralwatt.options.baseURL` override works** — the relay URL is used instead of the built-in `api.neuralwatt.com`.
2. **`NEURALWATT_API_KEY` env var is picked up by opencode** and sent as the `Authorization` header; the relay passes it through to neuralwatt.
3. **Non-streaming `opencode run` works** — provider resolution, API call, output capture all succeed.
4. **Streaming (`--format json`) works** — structured events arrive correctly; opencode's SSE parser handles the relay's chunked responses.
5. **The relay is not buffering** — the response arrives as expected (the prior curl spike confirmed incremental SSE chunks; this spike confirms opencode's parser handles them).

## What this does not prove

- **Concurrency under load** — this spike ran a single sandbox with sequential calls. The pipeline's `maxConcurrentSandboxes` (5) with concurrent relay traffic is not tested here.
- **Relay availability over time** — the relay is a single Railway service. This spike verifies it works now, not its uptime characteristics.
- **Error recovery** — no provider mid-stream drops or relay failures were simulated. Those are covered by `spike-midstream-resume.js` and `spike-stop-resume.js` (which used opencode-hosted models, not neuralwatt through the relay).

## Impact on the plan

Resolved question 17 in `graph-pipeline.md` and assumption #6 in the same file previously stated the relay was "spike-verified" based on curl alone. This spike upgrades that claim: the full opencode-through-relay path is now verified. The plan's architecture — sandbox `opencode.json` with `provider.neuralwatt.options.baseURL` pointing at the relay, `NEURALWATT_API_KEY` in the sandbox env — is confirmed working end-to-end.

## Spike script

`docs/todo/spike-opencode-relay.js` — reuses `OpencodeSandbox` and `SpikeRunner` from `spike-opencode-sandbox.js`. Creates and destroys its own sandbox. Total sandbox time: ~32s. No sandbox left running.
