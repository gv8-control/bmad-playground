import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { ProxyController } from './proxy.controller';
import { RelayAuthGuard } from './relay-auth.guard';

// Builds a mock Express Request with the params/headers/method/body the
// controller reads. `url` must include the query string when present.
function mockReq(overrides: Partial<Request> & { params?: Record<string, string> } = {}): Request {
  const params = overrides.params ?? {};
  const url = overrides.url ?? `/proxy/${params.host ?? 'example.com'}/${params.path ?? ''}`;
  return {
    method: 'GET',
    url,
    params,
    headers: {},
    body: undefined,
    on: jest.fn(),
    ...overrides,
  } as unknown as Request;
}

// Builds a mock Express Response that records status/json/setHeader/write/end
// calls and supports the `drain`/`close` event emitter the backpressure loop
// attaches listeners to.
function mockRes(): Response & { body: Buffer[]; statusCode: number; jsonData: unknown } {
  const chunks: Buffer[] = [];
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const res = {
    statusCode: 200,
    jsonData: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.jsonData = data;
      return this;
    },
    setHeader() {
      return this;
    },
    write(chunk: Buffer) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    },
    end() {
      return this;
    },
    once(event: string, cb: (...args: unknown[]) => void) {
      (listeners[event] ??= []).push(cb);
      return this;
    },
    removeListener(event: string, cb: (...args: unknown[]) => void) {
      listeners[event] = (listeners[event] ?? []).filter((l) => l !== cb);
      return this;
    },
    on(event: string, cb: (...args: unknown[]) => void) {
      (listeners[event] ??= []).push(cb);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      (listeners[event] ?? []).forEach((l) => l(...args));
    },
  };
  return Object.assign(res, { body: chunks, statusCode: 200, jsonData: undefined }) as unknown as Response & {
    body: Buffer[];
    statusCode: number;
    jsonData: unknown;
  };
}

// Builds a mock fetch Response with a ReadableStream body that yields the
// given chunks then completes.
function mockFetchResponse(chunks: string[] = ['hello'], status = 200): globalThis.Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return {
    status,
    headers: new Headers({ 'content-type': 'text/plain' }),
    body: stream,
  } as unknown as globalThis.Response;
}

describe('ProxyController', () => {
  let controller: ProxyController;
  let moduleRef: TestingModule;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    process.env.RELAY_AUTH_TOKEN = 'test-secret-token';
    moduleRef = await Test.createTestingModule({
      controllers: [ProxyController],
      providers: [RelayAuthGuard],
    }).compile();
    controller = moduleRef.get(ProxyController);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.RELAY_AUTH_TOKEN;
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  // ── Auth guard ──

  it('guard rejects requests without X-Relay-Token', async () => {
    const guard = moduleRef.get(RelayAuthGuard);
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as never;
    expect(() => guard.canActivate(ctx)).toThrow();
  });

  it('guard rejects requests with wrong X-Relay-Token', async () => {
    const guard = moduleRef.get(RelayAuthGuard);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-relay-token': 'wrong' } }),
      }),
    } as never;
    expect(() => guard.canActivate(ctx)).toThrow();
  });

  it('guard passes requests with correct X-Relay-Token', async () => {
    const guard = moduleRef.get(RelayAuthGuard);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-relay-token': 'test-secret-token' } }),
      }),
    } as never;
    expect(guard.canActivate(ctx)).toBe(true);
  });

  // ── Allowlist rejection ──

  it('rejects allowlisted host (github.com) with DOMAIN_DIRECTLY_REACHABLE', async () => {
    const req = mockReq({ params: { host: 'github.com', path: 'foo/bar' } });
    const res = mockRes();
    await controller.proxy(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.jsonData as { code: string }).code).toBe('DOMAIN_DIRECTLY_REACHABLE');
  });

  it('rejects allowlisted host (registry.npmjs.org) with DOMAIN_DIRECTLY_REACHABLE', async () => {
    const req = mockReq({ params: { host: 'registry.npmjs.org', path: 'lodash' } });
    const res = mockRes();
    await controller.proxy(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.jsonData as { code: string }).code).toBe('DOMAIN_DIRECTLY_REACHABLE');
  });

  // ── Private host rejection ──

  it.each(['localhost', '127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.1.1', 'foo.local', 'bar.internal'])(
    'rejects private/local host %s with 400',
    async (host) => {
      const req = mockReq({ params: { host, path: 'x' } });
      const res = mockRes();
      await controller.proxy(req, res);
      expect(res.statusCode).toBe(400);
      expect((res.jsonData as { code: string }).code).toBe('PRIVATE_HOST_REJECTED');
    },
  );

  // ── Valid proxy ──

  it('forwards to the correct URL and streams the response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(mockFetchResponse(['chunk1', 'chunk2'], 200));
    globalThis.fetch = fetchMock as never;

    const req = mockReq({
      method: 'POST',
      params: { host: 'api.example.com', path: 'v1/data' },
      url: '/proxy/api.example.com/v1/data?foo=bar',
      headers: { 'content-type': 'application/json', 'x-relay-token': 'test-secret-token' },
      body: { hello: 'world' },
    });
    const res = mockRes();

    await controller.proxy(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://api.example.com/v1/data?foo=bar');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ hello: 'world' }));
    // x-relay-token must be stripped, host must be set to target
    expect(init.headers['x-relay-token']).toBeUndefined();
    expect(init.headers['host']).toBe('api.example.com');

    expect(res.statusCode).toBe(200);
    expect(Buffer.concat(res.body).toString()).toBe('chunk1chunk2');
  });

  it('returns 502 when fetch fails', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('network down')) as never;

    const req = mockReq({ params: { host: 'api.example.com', path: 'fail' } });
    const res = mockRes();

    await controller.proxy(req, res);

    expect(res.statusCode).toBe(502);
    expect((res.jsonData as { code: string }).code).toBe('PROXY_FETCH_FAILED');
  });
});
