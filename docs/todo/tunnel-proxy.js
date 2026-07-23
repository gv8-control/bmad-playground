#!/usr/bin/env node
/**
 * Local CONNECT-to-WebSocket tunnel proxy.
 *
 * Runs inside a Daytona sandbox on 127.0.0.1:8888. Handles HTTP CONNECT
 * requests from the sandbox agent (opencode/Go net/http, which respects
 * HTTPS_PROXY). For each CONNECT, opens a WebSocket to the relay's /tunnel
 * endpoint and pipes bytes bidirectionally.
 *
 * The outer TLS (sandbox → Railway relay) has an allowlisted SNI, so Envoy
 * allows it. The inner TLS (sandbox → target) flows inside the WebSocket,
 * invisible to the SNI filter.
 *
 * Uses the `ws` library for the WebSocket client (installed globally via npm).
 *
 * Env vars:
 *   TUNNEL_RELAY_URL  - WebSocket URL of the relay (wss://...railway.app/tunnel)
 *   TUNNEL_RELAY_TOKEN - Auth token for the relay (x-relay-token header)
 *   TUNNEL_LISTEN_PORT - Port to listen on (default: 8888)
 *   TUNNEL_DEBUG       - If set, logs each connection
 */

const http = require('http');
const WebSocket = require('ws');

const RELAY_URL = process.env.TUNNEL_RELAY_URL || '';
const RELAY_TOKEN = process.env.TUNNEL_RELAY_TOKEN || '';
const LISTEN_PORT = parseInt(process.env.TUNNEL_LISTEN_PORT || '8888', 10);
const DEBUG = !!process.env.TUNNEL_DEBUG;

function log(...args) {
  if (DEBUG) console.log('[tunnel-proxy]', ...args);
}

// ─── CONNECT proxy server ──────────────────────────────────────────────────

if (!RELAY_URL) {
  console.error('[tunnel-proxy] TUNNEL_RELAY_URL is not set — cannot start');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  // Regular HTTP requests (non-CONNECT) — respond with a simple message.
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('tunnel-proxy: use HTTPS_PROXY=http://127.0.0.1:' + LISTEN_PORT + '\n');
});

server.on('connect', (req, clientSocket, head) => {
  // req.url is "host:port" for CONNECT requests.
  const target = req.url || '';
  const [host, port] = target.split(':');
  const targetPort = port || '443';

  if (!host) {
    clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    clientSocket.destroy();
    return;
  }

  // Attach error handler immediately to prevent unhandled 'error' events.
  clientSocket.on('error', (err) => {
    log(`Client socket error (${host}:${targetPort}): ${err.message}`);
  });

  log(`CONNECT ${host}:${targetPort} → opening WebSocket tunnel`);

  const wsUrl = `${RELAY_URL}?host=${encodeURIComponent(host)}&port=${encodeURIComponent(targetPort)}`;
  const wsOptions = {};
  if (RELAY_TOKEN) {
    wsOptions.headers = { 'x-relay-token': RELAY_TOKEN };
  }

  const ws = new WebSocket(wsUrl, wsOptions);

  let established = false;

  ws.on('open', () => {
    log(`WebSocket connected, establishing tunnel for ${host}:${targetPort}`);
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    established = true;

    // If there's buffered data from the client (head), send it.
    if (head && head.length > 0) {
      ws.send(head);
    }

    // Client → WebSocket
    clientSocket.on('data', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // WebSocket → Client
    ws.on('message', (data) => {
      try { clientSocket.write(data); } catch (e) { /* socket closed */ }
    });

    // Close handling
    ws.on('close', () => {
      try { clientSocket.end(); } catch (e) { /* already closed */ }
    });

    ws.on('error', (err) => {
      log(`WebSocket error (${host}:${targetPort}): ${err.message}`);
      try { clientSocket.destroy(); } catch (e) { /* already closed */ }
    });

    clientSocket.on('close', () => {
      ws.close();
    });

    log(`Tunnel established: ${host}:${targetPort}`);
  });

  ws.on('error', (err) => {
    log(`WebSocket error (${host}:${targetPort}): ${err.message}`);
    if (!established) {
      try {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.destroy();
      } catch (e) { /* already closed */ }
    } else {
      try { clientSocket.destroy(); } catch (e) { /* already closed */ }
    }
  });
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log(`[tunnel-proxy] Listening on 127.0.0.1:${LISTEN_PORT}`);
  console.log(`[tunnel-proxy] Relay: ${RELAY_URL}`);
  console.log(`[tunnel-proxy] Auth: ${RELAY_TOKEN ? 'enabled' : 'disabled (dev mode)'}`);
});

// Prevent the proxy from crashing on unhandled errors.
process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}`);
});
