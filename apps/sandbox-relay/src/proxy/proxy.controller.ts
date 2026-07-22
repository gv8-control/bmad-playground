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

  // Two routes: `/proxy/:host` (no path) and `/proxy/:host/*path` (with path).
  // Express route params: `*path` captures the rest of the URL as a single
  // string. When no path is given, `path` is undefined — the controller
  // defaults it to empty string.
  @All(':host')
  @All(':host/*path')
  async proxy(@Req() req: Request, @Res() res: Response): Promise<void> {
    const host = (req.params as Record<string, string>).host;
    const path = (req.params as Record<string, string | undefined>).path ?? '';

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

    const queryIndex = req.url.indexOf('?');
    const queryString = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    const targetUrl = `https://${host}/${path}${queryString}`;

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
        this.logger.error(`Proxy fetch failed: ${req.method} ${host}/${path}`);
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

    this.logger.debug(`${req.method} ${host}/${path} → ${upstream.status}`);

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
          `Proxy stream error: ${req.method} ${host}/${path} — ${err instanceof Error ? err.message : String(err)}`,
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
