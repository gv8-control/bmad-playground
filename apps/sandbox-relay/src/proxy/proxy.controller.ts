import { All, Controller, Logger, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { isEssentialService } from '../essential-services';
import { RelayAuthGuard } from './relay-auth.guard';

// Hop-by-hop / relay-specific headers stripped from the forwarded request.
// `content-length` is stale because the body is re-serialized via
// JSON.stringify. `x-relay-token` is the relay's own auth — never forward it.
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'x-relay-token',
  'content-length',
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  'transfer-encoding',
  'content-length',
]);

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Hostnames the relay refuses to proxy — private/local addresses that would
// let a sandbox reach the relay's own internal network. Basic sanity guard,
// not a comprehensive SSRF defense (the relay is auth-gated and internal).
const PRIVATE_HOST_PATTERNS: ReadonlyArray<RegExp> = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /\.local$/i,
  /\.internal$/i,
];

function isPrivateHost(host: string): boolean {
  if (!host || host.includes(' ')) return true;
  return PRIVATE_HOST_PATTERNS.some((re) => re.test(host));
}

@Controller('proxy')
@UseGuards(RelayAuthGuard)
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  // Single wildcard route: `/proxy/<host>/<anything>`. We parse the host and
  // path manually from req.url because Express `:host/*path` doesn't match
  // `/proxy/<host>` (no trailing path). A single `*all` captures everything
  // after `/proxy/`, and we split on the first `/` to separate host from path.
  @All('*all')
  async proxy(@Req() req: Request, @Res() res: Response): Promise<void> {
    // req.url is the full path after the global prefix (none here), e.g.
    // `/proxy/httpbin.org/get?foo=bar`. Strip the `/proxy/` prefix.
    const url = req.url;
    const afterPrefix = url.startsWith('/proxy/') ? url.slice('/proxy/'.length) : url;

    // Split on the first `/` to separate the host from the rest of the path.
    const slashIndex = afterPrefix.indexOf('/');
    let host: string;
    let rest: string;
    if (slashIndex >= 0) {
      host = afterPrefix.slice(0, slashIndex);
      rest = afterPrefix.slice(slashIndex + 1);
    } else {
      // No path — just the host, e.g. `/proxy/httpbin.org`
      host = afterPrefix;
      rest = '';
    }

    // Strip query string from host extraction (shouldn't happen since `?`
    // comes after the path, but be safe).
    const queryInHost = host.indexOf('?');
    if (queryInHost >= 0) {
      host = host.slice(0, queryInHost);
    }

    const path = rest;

    // 1. Essential Services allowlist — sandbox reaches these directly.
    if (isEssentialService(host)) {
      res.status(400).json({
        code: 'DOMAIN_DIRECTLY_REACHABLE',
        message: `${host} is on the Essential Services allowlist; reach it directly`,
      });
      return;
    }

    // 2. Private/local host sanity check.
    if (isPrivateHost(host)) {
      res.status(400).json({
        code: 'PRIVATE_HOST_REJECTED',
        message: `${host} is a private or local address; relay refuses to proxy it`,
      });
      return;
    }

    // `rest` may contain a query string (e.g. `get?foo=bar`). Extract it so
    // we don't double-append it. `path` is the path-only portion.
    const queryInPath = path.indexOf('?');
    const cleanPath = queryInPath >= 0 ? path.slice(0, queryInPath) : path;
    const queryString = queryInPath >= 0 ? path.slice(queryInPath) : '';
    const targetUrl = `https://${host}/${cleanPath}${queryString}`;

    // 3. Forward headers — strip hop-by-hop, set Host to the target.
    const forwardHeaders: Record<string, string> = {};
    const reqHeaders = req.headers as Record<string, string | string[] | undefined>;
    for (const [key, value] of Object.entries(reqHeaders)) {
      if (STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) continue;
      if (typeof value === 'string') {
        forwardHeaders[key.toLowerCase()] = value;
      }
    }
    forwardHeaders['host'] = host;

    // 4. Body — only for methods that support one. GET/HEAD with a body
    // throws TypeError in fetch(); Express sets req.body = {} for empty
    // JSON bodies, which would produce a spurious '{}' body.
    const bodyData =
      BODY_METHODS.has(req.method) && req.body ? JSON.stringify(req.body) : undefined;

    // 5. Abort upstream fetch if the client disconnects mid-stream — prevents
    // leaking connections and billing upstream for bytes nobody reads.
    const abortController = new AbortController();
    const clientDisconnected = { value: false };
    req.on('close', () => {
      clientDisconnected.value = true;
      abortController.abort();
    });

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: bodyData,
        signal: abortController.signal,
      });
    } catch {
      if (!clientDisconnected.value) {
        this.logger.error(`Proxy fetch failed: ${req.method} ${host}/${cleanPath}`);
        res
          .status(502)
          .json({ code: 'PROXY_FETCH_FAILED', message: 'Failed to reach upstream' });
      }
      return;
    }

    res.status(upstream.status);

    upstream.headers.forEach((value, key) => {
      if (STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) return;
      res.setHeader(key, value);
    });

    // SSE/proxy headers — set AFTER upstream header forwarding so upstream
    // values cannot overwrite them. X-Accel-Buffering disables reverse-
    // proxy buffering (Railway fronts the relay with an HTTP/2 proxy) —
    // without it, SSE chunks may buffer, breaking streaming. Cache-Control
    // prevents intermediary caching. X-Content-Type-Options prevents
    // MIME-sniffing.
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    this.logger.debug(`${req.method} ${host}/${cleanPath} → ${upstream.status}`);

    const body = upstream.body;
    if (!body) {
      try {
        res.end();
      } catch {
        // response already closed
      }
      return;
    }

    const reader = body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (clientDisconnected.value) break;
        try {
          const canWrite = res.write(value);
          if (!canWrite) {
            // Backpressure: wait for the downstream to drain before reading
            // more from upstream. Also resolve on 'close' so a client
            // disconnect during the wait doesn't hang the loop. Named
            // handlers + removeListener prevent listener accumulation
            // across N backpressure cycles.
            await new Promise<void>((resolve) => {
              const onDrain = () => {
                req.removeListener('close', onClose);
                resolve();
              };
              const onClose = () => {
                res.removeListener('drain', onDrain);
                resolve();
              };
              res.once('drain', onDrain);
              req.once('close', onClose);
            });
          }
        } catch {
          break;
        }
      }
    } catch (err) {
      if (!clientDisconnected.value) {
        this.logger.warn(
          `Proxy stream error: ${req.method} ${host}/${cleanPath} — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // reader already cancelled or released
      }
      try {
        res.end();
      } catch {
        // response already closed
      }
    }
  }
}
