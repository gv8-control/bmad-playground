import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { isEssentialService } from '../essential-services';

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

const TUNNEL_PATH = '/tunnel';

interface TunnelQuery {
  host?: string;
  port?: string;
}

function parseQuery(url: string): TunnelQuery {
  const qIndex = url.indexOf('?');
  if (qIndex < 0) return {};
  const qs = new URLSearchParams(url.slice(qIndex + 1));
  return { host: qs.get('host') ?? undefined, port: qs.get('port') ?? undefined };
}

/**
 * WebSocket tunnel gateway at /tunnel.
 *
 * Accepts WebSocket upgrade requests at `/tunnel?host=<hostname>&port=<port>`.
 * After the WebSocket handshake completes, opens a raw TCP connection to
 * `host:port` and pipes bytes bidirectionally: WebSocket messages → TCP socket,
 * TCP socket data → WebSocket messages.
 *
 * This lets a sandbox agent (behind the Tier 1 SNI filter) tunnel TLS to
 * non-allowlisted hosts through an allowlisted relay domain. The outer TLS
 * connection (sandbox → Railway) has an allowlisted SNI; the inner TLS
 * (sandbox → target) flows inside the WebSocket, invisible to the Envoy
 * SNI filter.
 *
 * Auth: the same `x-relay-token` header as the HTTP proxy controller. The
 * header is sent as a subprotocol or query param during the WebSocket
 * handshake (browsers can't set custom headers on WS; Node clients can).
 */
@Injectable()
export class TunnelGateway implements OnModuleInit {
  private readonly logger = new Logger('TunnelGateway');
  private wss: WebSocketServer | null = null;

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  onModuleInit() {
    const httpAdapter = this.adapterHost.httpAdapter;
    const server = httpAdapter.getHttpServer() as HttpServer;

    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      // Only handle /tunnel; let other upgrade requests pass through
      // (there shouldn't be any, but this is defensive).
      const url = req.url ?? '';
      if (!url.startsWith(TUNNEL_PATH)) {
        return;
      }

      // Auth check — same token as RelayAuthGuard.
      const expectedToken = process.env.RELAY_AUTH_TOKEN;
      if (expectedToken) {
        // Header first (Node ws clients), then query param (fallback for
        // clients that can't set custom headers on WS upgrade).
        const headerToken = req.headers['x-relay-token'] as string | undefined;
        const qIndex = url.indexOf('?');
        const qs = qIndex >= 0 ? new URLSearchParams(url.slice(qIndex + 1)) : null;
        const queryToken = qs?.get('token') ?? undefined;
        const providedToken = headerToken ?? queryToken;

        if (!providedToken || providedToken !== expectedToken) {
          this.logger.warn(`Tunnel auth failed from ${req.socket.remoteAddress}`);
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
      }

      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.handleConnection(ws, req);
      });
    });

    this.logger.log('WebSocket tunnel gateway mounted at /tunnel');
  }

  private handleConnection(ws: WebSocket, req: import('http').IncomingMessage) {
    const url = req.url ?? '';
    const query = parseQuery(url);
    const host = query.host;
    const port = query.port || '443';

    if (!host) {
      ws.close(1008, 'Missing host parameter');
      return;
    }

    // Essential Services check — sandbox reaches these directly.
    if (isEssentialService(host)) {
      ws.close(1008, `${host} is on the Essential Services allowlist; reach it directly`);
      this.logger.debug(`Rejected tunnel to ${host} (Essential Service)`);
      return;
    }

    // Private/local host check.
    if (isPrivateHost(host)) {
      ws.close(1008, `${host} is a private or local address; relay refuses to tunnel`);
      this.logger.warn(`Rejected tunnel to private host ${host}`);
      return;
    }

    const target = `${host}:${port}`;
    this.logger.log(`Tunnel opening: ${target}`);

    // Import net lazily so it doesn't affect bundle if unused.
    const net = require('net') as typeof import('net');
    const tcp = net.connect(parseInt(port, 10), host);

    let bytesIn = 0;
    let bytesOut = 0;
    let closed = false;

    const cleanup = (reason: string) => {
      if (closed) return;
      closed = true;
      this.logger.log(
        `Tunnel closed: ${target} (${reason}) — in:${bytesIn}B out:${bytesOut}B`,
      );
      try { tcp.destroy(); } catch { /* already closed */ }
      try { ws.close(); } catch { /* already closed */ }
    };

    // WebSocket → TCP
    ws.on('message', (data: Buffer) => {
      bytesIn += data.length;
      const ok = tcp.write(data);
      if (!ok) {
        // Backpressure: wait for drain before reading more from WS.
        ws.pause();
        tcp.once('drain', () => ws.resume());
      }
    });

    // TCP → WebSocket
    tcp.on('data', (data: Buffer) => {
      bytesOut += data.length;
      ws.send(data, (err) => {
        if (err) {
          cleanup(`ws send error: ${err.message}`);
        }
      });
    });

    tcp.on('error', (err) => {
      cleanup(`tcp error: ${err.message}`);
    });

    tcp.on('close', () => {
      cleanup('tcp closed');
    });

    ws.on('close', () => {
      cleanup('ws closed');
    });

    ws.on('error', (err) => {
      cleanup(`ws error: ${err.message}`);
    });
  }
}
