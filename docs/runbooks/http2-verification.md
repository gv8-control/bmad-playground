# HTTP/2 Verification — apps/agent-be Railway Edge Proxy

## Verification Result

**HTTP/2 ALPN negotiation: CONFIRMED**

Railway's platform-provided TLS-terminating edge proxy negotiates HTTP/2 by default. No additional reverse proxy or sidecar was needed — the Railway edge proxy handles HTTP/2 termination and forwards HTTP/1.1 to the NestJS container.

## Agent-be Public URL

`https://agent-be-production-1c09.up.railway.app`

## Verification Command

```bash
curl -v --http2 https://agent-be-production-1c09.up.railway.app/health
```

The `/health` endpoint is excluded from the `/api` global prefix (see `apps/agent-be/src/main.ts`) and serves at root.

## Key Output

```
* ALPN: curl offers h2,http/1.1
* ALPN: server accepted h2
* using HTTP/2
> GET /health HTTP/2
< HTTP/2 200
< content-type: application/json; charset=utf-8
{"status":"ok"}
```

## Verification Details

- **Date:** 2026-07-13
- **Tool:** curl 8.5.0 (x86_64-pc-linux-gnu) with nghttp2/1.59.0 — HTTP2 feature confirmed
- **TLS:** TLSv1.3 / TLS_AES_256_GCM_SHA384
- **Certificate:** Let's Encrypt, `*.up.railway.app` wildcard
- **Railway edge:** waw1 (Warsaw)
- **Reverse proxy/sidecar needed:** No — Railway's edge proxy handles HTTP/2 termination natively

## NFR Prerequisite Confirmed

**NFR-R4:** The streaming transport must support 10 concurrent agent SSE connections per browser session without connection starvation. HTTP/2 multiplexes streams over a single TCP connection, removing the HTTP/1.1 6-connection-per-origin browser cap that would block the 10-concurrent-SSE requirement. This story confirms the transport-layer prerequisite only — end-to-end SSE verification is Story 3.11's scope (see Scope Boundary below).

## Scope Boundary

This verification confirms the transport protocol capability (HTTP/2 ALPN negotiation) only. End-to-end 10-concurrent-SSE verification is Story 3.11's scope once the streaming transport exists — this story does not exercise SSE connections.
