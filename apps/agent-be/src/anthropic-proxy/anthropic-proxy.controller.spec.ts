/**
 * @jest-environment node
 *
 * Story 4.5: Wire Environment Variables and Secrets on Both Platforms
 * Unit tests for AnthropicProxyController (AC-5: NFR-S1 compliance).
 *
 * Covers AC-5:
 * - Forwards HTTP requests to api.anthropic.com with injected x-api-key header
 * - Never leaks the API key in response body/headers/logs
 * - Supports streaming (SSE) responses
 * - Registered as @Public() endpoint (no boundary JWT)
 *
 * Security regression guards:
 * - Credential-isolation: API key never appears in response body, response headers, or logs
 * - Header filtering: client-provided authorization, x-api-key, host, cookie headers are NOT forwarded
 */
import { EventEmitter } from 'events';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { Test } from '@nestjs/testing';
import { AnthropicProxyController } from './anthropic-proxy.controller';

describe('AnthropicProxyController — Story 4.5 AC-5 (NFR-S1 compliance)', () => {
  let controller: AnthropicProxyController;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'sk-ant-test-key-1234567890' };

    const moduleRef = await Test.createTestingModule({
      controllers: [AnthropicProxyController],
    }).compile();

    controller = moduleRef.get(AnthropicProxyController);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function mockRequest(overrides: Partial<Request> = {}): Request {
    return {
      method: 'POST',
      url: '/v1/messages?beta=true',
      params: { path: 'v1/messages' },
      body: { model: 'claude-sonnet-4-20250514', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] },
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        authorization: 'Bearer client-token',
        'x-api-key': 'client-provided-key',
        host: 'localhost:3001',
        cookie: 'session=abc123',
      },
      on: jest.fn(),
      once: jest.fn(),
      ...overrides,
    } as unknown as Request;
  }

  function mockResponse(): {
    res: Record<string, unknown>;
    written: Buffer[];
    statusCode: number;
    headers: Record<string, string>;
  } {
    const written: Buffer[] = [];
    const headers: Record<string, string> = {};
    let statusCode = 200;

    const res: Record<string, unknown> = {
      status: jest.fn((code: number) => {
        statusCode = code;
        return res;
      }),
      json: jest.fn((data: unknown) => {
        written.push(Buffer.from(JSON.stringify(data)));
        return res;
      }),
      setHeader: jest.fn((key: string, value: string) => {
        headers[key.toLowerCase()] = value;
      }),
      write: jest.fn((data: unknown) => {
        written.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
        return true;
      }),
      end: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      headers,
    };

    return { res, written, statusCode, headers };
  }

  function mockFetchResponse(overrides: Partial<Response> = {}): Response {
    const encoder = new TextEncoder();
    const chunks = [encoder.encode('data: {"type":"message_start"}\n\n'), encoder.encode('data: [DONE]\n\n')];
    let chunkIndex = 0;

    const body = {
      getReader: () => ({
        read: async () => {
          if (chunkIndex < chunks.length) {
            return { done: false, value: chunks[chunkIndex++] };
          }
          return { done: true, value: undefined };
        },
        cancel: jest.fn().mockResolvedValue(undefined),
      }),
    };

    return {
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body,
      ...overrides,
    } as unknown as Response;
  }

  describe('[P0] x-api-key header injection', () => {
    it('[P0] injects x-api-key header from process.env.ANTHROPIC_API_KEY into the forwarded request', async () => {
      const req = mockRequest();
      const { res } = mockResponse();
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse());

      await controller.proxy(req as never, res as never);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const fetchArgs = fetchSpy.mock.calls[0];
      const init = fetchArgs[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('sk-ant-test-key-1234567890');
    });

    it('[P0] returns 503 when ANTHROPIC_API_KEY is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const req = mockRequest();
      const { res } = mockResponse();

      await controller.proxy(req as never, res as never);

      expect(res.status).toHaveBeenCalledWith(503);
      const fetchSpy = jest.spyOn(global, 'fetch');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('[P0] header filtering — credential isolation', () => {
    it('[P0] does NOT forward authorization, x-api-key (from client), host, or cookie headers', async () => {
      const req = mockRequest();
      const { res } = mockResponse();
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse());

      await controller.proxy(req as never, res as never);

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['authorization']).toBeUndefined();
      expect(headers['x-api-key']).toBe('sk-ant-test-key-1234567890');
      expect(headers['host']).toBeUndefined();
      expect(headers['cookie']).toBeUndefined();
    });
  });

  describe('[P0] response forwarding', () => {
    it('[P0] forwards the response status code and body', async () => {
      const req = mockRequest();
      const { res, written } = mockResponse();
      jest.spyOn(global, 'fetch').mockResolvedValue(
        mockFetchResponse({ status: 200 }),
      );

      await controller.proxy(req as never, res as never);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(written.length).toBeGreaterThan(0);
    });

    it('[P0] streams the response body (does not buffer)', async () => {
      const req = mockRequest();
      const { res, written } = mockResponse();
      jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse());

      await controller.proxy(req as never, res as never);

      expect(written.length).toBeGreaterThanOrEqual(2);
    });

    it('[P0] never includes the API key in the response body or headers', async () => {
      const req = mockRequest();
      const { res, written, headers } = mockResponse();
      jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse());

      await controller.proxy(req as never, res as never);

      const allResponseBody = Buffer.concat(written).toString();
      expect(allResponseBody).not.toContain('sk-ant-test-key-1234567890');
      const headerValues = Object.values(headers).join(' ');
      expect(headerValues).not.toContain('sk-ant-test-key-1234567890');
    });
  });

  describe('[P0] request forwarding', () => {
    it('[P0] forwards query string parameters', async () => {
      const req = mockRequest({ url: '/v1/messages?beta=true&version=2023-06-01' });
      const { res } = mockResponse();
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse());

      await controller.proxy(req as never, res as never);

      const targetUrl = fetchSpy.mock.calls[0][0] as string;
      expect(targetUrl).toContain('beta=true');
      expect(targetUrl).toContain('version=2023-06-01');
    });

    it('[P0] forwards the request body to the upstream Anthropic API (POST body reaches fetch())', async () => {
      const req = mockRequest();
      const { res } = mockResponse();
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse());

      await controller.proxy(req as never, res as never);

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(init.body).toBeDefined();
      const bodyStr = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
      expect(bodyStr).toContain('claude-sonnet-4-20250514');
    });
  });

  describe('[P1] logging', () => {
    it('[P1] logs at debug level only (no key, no body, no response content)', async () => {
      const req = mockRequest();
      const { res } = mockResponse();
      jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse());

      // Spy on the NestJS Logger's debug method — the controller uses
      // this.logger.debug(), not console.log directly.
      const debugSpy = jest.spyOn(controller['logger'], 'debug');

      await controller.proxy(req as never, res as never);

      // The debug log should contain only method, path, and status — never
      // the API key, request body, or response content.
      for (const callArgs of debugSpy.mock.calls) {
        const logOutput = callArgs.join(' ');
        expect(logOutput).not.toContain('sk-ant-test-key-1234567890');
        expect(logOutput).not.toContain('claude-sonnet-4-20250514');
      }
    });
  });

  describe('[P0] NFR-1: SSE proxy headers on responses', () => {
    it('[P0] sets X-Accel-Buffering, Cache-Control, and X-Content-Type-Options on the response', async () => {
      const req = mockRequest();
      const { res, headers } = mockResponse();
      jest.spyOn(global, 'fetch').mockResolvedValue(mockFetchResponse());

      await controller.proxy(req as never, res as never);

      expect(headers['x-accel-buffering']).toBe('no');
      expect(headers['cache-control']).toBe('no-cache, no-transform');
      expect(headers['x-content-type-options']).toBe('nosniff');
    });

    it('[P0] SSE proxy headers override upstream values (set after forEach loop)', async () => {
      const req = mockRequest();
      const { res, headers } = mockResponse();
      jest.spyOn(global, 'fetch').mockResolvedValue(
        mockFetchResponse({
          headers: new Headers({
            'content-type': 'text/event-stream',
            'cache-control': 'private, max-age=60',
            'x-accel-buffering': 'yes',
          }),
        }),
      );

      await controller.proxy(req as never, res as never);

      // The mock's setHeader normalizes keys to lowercase (matching real
      // Express behavior). The forEach loop sets the upstream value first,
      // then the explicit setHeader calls overwrite it. If the ordering
      // were reversed (explicit before forEach), the upstream value would
      // win — this test would fail.
      expect(headers['cache-control']).toBe('no-cache, no-transform');
      expect(headers['x-accel-buffering']).toBe('no');
    });
  });

  describe('[P0] NFR-3: incremental streaming (no buffering)', () => {
    it('[P0] writes each chunk before reading the next — proves no buffering', async () => {
      const encoder = new TextEncoder();
      const chunk1 = encoder.encode('data: {"type":"message_start"}\n\n');
      const chunk2 = encoder.encode('data: [DONE]\n\n');

      const callOrder: string[] = [];
      let readCount = 0;

      const body = {
        getReader: () => ({
          read: async () => {
            readCount++;
            callOrder.push(`read${readCount}`);
            if (readCount === 1) return { done: false, value: chunk1 };
            if (readCount === 2) return { done: false, value: chunk2 };
            return { done: true, value: undefined };
          },
          cancel: jest.fn().mockResolvedValue(undefined),
        }),
      };

      const { res } = mockResponse();
      (res.write as jest.Mock).mockImplementation(() => {
        callOrder.push('write');
        return true;
      });

      jest.spyOn(global, 'fetch').mockResolvedValue({
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body,
      } as unknown as Response);

      const req = mockRequest();
      await controller.proxy(req as never, res as never);

      // Incremental delivery: first write happens before second read.
      // A buffering implementation would read all chunks before writing.
      const firstWriteIdx = callOrder.indexOf('write');
      const secondReadIdx = callOrder.indexOf('read2');
      expect(firstWriteIdx).toBeGreaterThan(-1);
      expect(secondReadIdx).toBeGreaterThan(-1);
      expect(firstWriteIdx).toBeLessThan(secondReadIdx);
    });
  });

  describe('[P0] NFR-4: backpressure (NFR-R3)', () => {
    it('[P0] pauses upstream reads when res.write() returns false, resumes on drain', async () => {
      const encoder = new TextEncoder();
      const chunk1 = encoder.encode('data: {"type":"message_start"}\n\n');
      const chunk2 = encoder.encode('data: [DONE]\n\n');

      const readCount = { value: 0 };

      const body = {
        getReader: () => ({
          read: async () => {
            readCount.value++;
            if (readCount.value === 1) return { done: false, value: chunk1 };
            if (readCount.value === 2) return { done: false, value: chunk2 };
            return { done: true, value: undefined };
          },
          cancel: jest.fn().mockResolvedValue(undefined),
        }),
      };

      // EventEmitter-backed res so 'drain' / 'removeListener' work
      const resEmitter = new EventEmitter();
      const written: Buffer[] = [];
      const headers: Record<string, string> = {};
      let writeCount = 0;

      const res: ExpressResponse = {
        status: jest.fn(function (this: unknown) {
          return res;
        }),
        json: jest.fn(function (this: unknown) {
          return res;
        }),
        setHeader: jest.fn((key: string, value: string) => {
          headers[key] = value;
        }),
        write: jest.fn((data: unknown) => {
          writeCount++;
          written.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
          return writeCount === 1 ? false : true;
        }),
        end: jest.fn(),
        on: resEmitter.on.bind(resEmitter),
        once: resEmitter.once.bind(resEmitter),
        removeListener: resEmitter.removeListener.bind(resEmitter),
        headers,
      } as unknown as ExpressResponse;

      // EventEmitter-backed req so 'close' / 'removeListener' work
      const reqEmitter = new EventEmitter();
      const req = {
        method: 'POST',
        url: '/v1/messages?beta=true',
        params: { path: 'v1/messages' },
        body: {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }],
        },
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        on: reqEmitter.on.bind(reqEmitter),
        once: reqEmitter.once.bind(reqEmitter),
        removeListener: reqEmitter.removeListener.bind(reqEmitter),
      } as unknown as ExpressRequest;

      jest.spyOn(global, 'fetch').mockResolvedValue({
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body,
      } as unknown as Response);

      // Start the proxy — it will hit backpressure after the first chunk
      const proxyPromise = controller.proxy(req, res);

      // Let the first chunk be read and written (returns false → backpressure)
      await new Promise((r) => setImmediate(r));

      // After first write returned false, reader.read() should NOT have been
      // called again — the proxy is waiting for 'drain'
      expect(readCount.value).toBe(1);

      // Emit 'drain' to release backpressure
      resEmitter.emit('drain');

      // Wait for the proxy to finish
      await proxyPromise;

      // After drain, the second chunk should have been read and written
      expect(readCount.value).toBeGreaterThanOrEqual(2);
      expect(written.length).toBeGreaterThanOrEqual(2);

      // NFR-2 fix verification: the onClose listener from the backpressure
      // handler must have been removed by onDrain. Only the line-63
      // req.on('close') listener should remain on reqEmitter.
      expect(reqEmitter.listenerCount('close')).toBe(1);
    });
  });
});
