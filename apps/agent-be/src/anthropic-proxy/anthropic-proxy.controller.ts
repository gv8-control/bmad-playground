import { All, Controller, Logger, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';

const STRIPPED_REQUEST_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'host',
  'cookie',
  'content-length', // body is re-serialized via JSON.stringify; original length is stale
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  'transfer-encoding',
  'content-length',
]);

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Controller('proxy/anthropic')
export class AnthropicProxyController {
  private readonly logger = new Logger(AnthropicProxyController.name);

  @Public()
  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response): Promise<void> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res
        .status(503)
        .json({ code: 'PROXY_NOT_CONFIGURED', message: 'ANTHROPIC_API_KEY not set' });
      return;
    }

    const pathParam = (req.params as Record<string, string>).path;
    const queryIndex = req.url.indexOf('?');
    const queryString = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    const targetUrl = `https://api.anthropic.com/${pathParam}${queryString}`;

    const forwardHeaders: Record<string, string> = {};
    const reqHeaders = req.headers as Record<string, string | string[] | undefined>;
    for (const [key, value] of Object.entries(reqHeaders)) {
      if (STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) continue;
      if (typeof value === 'string') {
        forwardHeaders[key.toLowerCase()] = value;
      }
    }
    forwardHeaders['x-api-key'] = apiKey;
    if (!forwardHeaders['anthropic-version']) {
      forwardHeaders['anthropic-version'] = '2023-06-01';
    }

    // Only send a body for methods that support it. GET/HEAD with a body throws
    // TypeError in fetch(); Express body-parser sets req.body = {} for empty
    // JSON bodies, which would produce a spurious '{}' body.
    const bodyData =
      BODY_METHODS.has(req.method) && req.body ? JSON.stringify(req.body) : undefined;

    // Abort upstream fetch if the client disconnects mid-stream — prevents
    // leaking connections and billing Anthropic for tokens nobody reads.
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
        this.logger.error(`Proxy fetch failed: ${req.method} ${pathParam}`);
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
    // values cannot overwrite them. Matches the StreamingController SSE
    // pattern (project-context.md). X-Accel-Buffering disables reverse-
    // proxy buffering (Railway fronts agent-be with an HTTP/2 proxy) —
    // without it, SSE chunks may buffer, breaking streaming and eating
    // into the NFR-P1 1,500ms budget. Cache-Control prevents intermediary
    // caching. X-Content-Type-Options prevents MIME-sniffing.
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    this.logger.debug(`${req.method} ${pathParam} → ${upstream.status}`);

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
            // across N backpressure cycles (NFR-R3).
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
          `Proxy stream error: ${req.method} ${pathParam} — ${err instanceof Error ? err.message : String(err)}`,
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
