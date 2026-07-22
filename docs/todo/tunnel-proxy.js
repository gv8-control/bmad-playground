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
 * Zero dependencies — uses only Node.js built-ins (http, crypto, net).
 * The WebSocket client is a minimal implementation: it does the handshake
 * and handles binary/text frames (no fragmentation beyond what ws sends).
 *
 * Env vars:
 *   TUNNEL_RELAY_URL  - WebSocket URL of the relay (wss://...railway.app/tunnel)
 *   TUNNEL_RELAY_TOKEN - Auth token for the relay (x-relay-token header)
 *   TUNNEL_LISTEN_PORT - Port to listen on (default: 8888)
 *   TUNNEL_DEBUG       - If set, logs each connection
 */

const http = require('http');
const crypto = require('crypto');
const net = require('net');

const RELAY_URL = process.env.TUNNEL_RELAY_URL || '';
const RELAY_TOKEN = process.env.TUNNEL_RELAY_TOKEN || '';
const LISTEN_PORT = parseInt(process.env.TUNNEL_LISTEN_PORT || '8888', 10);
const DEBUG = !!process.env.TUNNEL_DEBUG;

function log(...args) {
  if (DEBUG) console.log('[tunnel-proxy]', ...args);
}

// ─── Minimal WebSocket client ──────────────────────────────────────────────

/**
 * Connect to a WebSocket server and return a duplex stream-like object
 * with .send(data), .onData(cb), .onClose(cb), .close().
 *
 * This is a minimal implementation: it handles the opening handshake and
 * binary frames (opcode 2). It does not handle fragmentation, extensions,
 * or subprotocols — sufficient for raw byte tunneling.
 */
function connectWebSocket(url, headers, onOpen, onClose, onError) {
  const urlObj = new URL(url);
  const isSecure = urlObj.protocol === 'wss:';
  const port = urlObj.port || (isSecure ? 443 : 80);
  const path = urlObj.pathname + urlObj.search;

  // Generate WebSocket handshake key.
  const wsKey = crypto.randomBytes(16).toString('base64');

  const reqHeaders = {
    Host: urlObj.hostname + (urlObj.port ? ':' + urlObj.port : ''),
    Upgrade: 'websocket',
    Connection: 'Upgrade',
    'Sec-WebSocket-Key': wsKey,
    'Sec-WebSocket-Version': '13',
    ...headers,
  };

  const httpModule = isSecure ? require('https') : http;

  const req = httpModule.request({
    hostname: urlObj.hostname,
    port: port,
    path: path,
    method: 'GET',
    headers: reqHeaders,
  }, (res) => {
    // The response should be a 101 Switching Protocols.
    if (res.statusCode !== 101) {
      onError(new Error(`WebSocket handshake failed: HTTP ${res.statusCode}`));
      res.resume();
      return;
    }

    // The socket is now a raw TCP stream. We need to parse WebSocket frames.
    const socket = res.socket;

    let closed = false;
    const dataCallbacks = [];
    const closeCallbacks = [];

    function handleClose() {
      if (closed) return;
      closed = true;
      closeCallbacks.forEach((cb) => cb());
      try { socket.destroy(); } catch (e) { /* already closed */ }
    }

    // Parse WebSocket frames from the socket.
    let buffer = Buffer.alloc(0);

    function processFrames() {
      while (buffer.length >= 2) {
        // Frame header
        const b0 = buffer[0];
        const b1 = buffer[1];
        const fin = (b0 & 0x80) !== 0;
        const opcode = b0 & 0x0f;
        const masked = (b1 & 0x80) !== 0;
        let payloadLen = b1 & 0x7f;
        let offset = 2;

        if (payloadLen === 126) {
          if (buffer.length < 4) return;
          payloadLen = buffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (buffer.length < 10) return;
          // Read 64-bit length (we only use the lower 32 bits).
          payloadLen = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }

        if (masked) {
          // Masking key is 4 bytes after payload length.
          if (buffer.length < offset + 4) return;
          offset += 4; // skip mask for now
        }

        if (buffer.length < offset + payloadLen) return;

        const payload = buffer.slice(offset, offset + payloadLen);
        buffer = buffer.slice(offset + payloadLen);

        if (opcode === 0x8) {
          // Close frame
          handleClose();
          return;
        } else if (opcode === 0x9) {
          // Ping → respond with Pong
          const pong = Buffer.alloc(2 + 4 + payload.length);
          pong[0] = 0x8a; // FIN + pong
          pong[1] = 0x80 | payload.length; // masked
          const mask = crypto.randomBytes(4);
          mask.copy(pong, 2);
          for (let i = 0; i < payload.length; i++) {
            pong[6 + i] = payload[i] ^ mask[i % 4];
          }
          socket.write(pong);
        } else if (opcode === 0x2 || opcode === 0x1 || opcode === 0x0) {
          // Binary, text, or continuation frame
          dataCallbacks.forEach((cb) => cb(payload));
        }
      }
    }

    socket.on('data', (data) => {
      buffer = buffer.length ? Buffer.concat([buffer, data]) : data;
      processFrames();
    });

    socket.on('close', handleClose);
    socket.on('error', (err) => {
      onError(err);
      handleClose();
    });

    // Send a binary frame (masked, as required by the spec for client→server).
    function send(data) {
      const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const mask = crypto.randomBytes(4);

      let header;
      if (payload.length < 126) {
        header = Buffer.alloc(6);
        header[1] = 0x80 | payload.length; // masked
      } else if (payload.length < 65536) {
        header = Buffer.alloc(8);
        header[1] = 0x80 | 126;
        header.writeUInt16BE(payload.length, 2);
      } else {
        header = Buffer.alloc(14);
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
      }
      header[0] = 0x82; // FIN + binary

      mask.copy(header, header.length - 4);

      const masked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) {
        masked[i] = payload[i] ^ mask[i % 4];
      }

      return socket.write(Buffer.concat([header, masked]));
    }

    function close() {
      // Send a close frame.
      const mask = crypto.randomBytes(4);
      const frame = Buffer.alloc(6);
      frame[0] = 0x88; // FIN + close
      frame[1] = 0x80; // masked, length 0
      mask.copy(frame, 2);
      try { socket.write(frame); } catch (e) { /* already closed */ }
      handleClose();
    }

    onOpen({ send, close, onData: (cb) => dataCallbacks.push(cb), onClose: (cb) => closeCallbacks.push(cb) });
  });

  req.on('error', (err) => {
    onError(err);
  });

  req.end();

  return { req };
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

  log(`CONNECT ${host}:${targetPort} → opening WebSocket tunnel`);

  const wsUrl = `${RELAY_URL}?host=${encodeURIComponent(host)}&port=${encodeURIComponent(targetPort)}`;
  const wsHeaders = {};
  if (RELAY_TOKEN) {
    wsHeaders['x-relay-token'] = RELAY_TOKEN;
  }

  connectWebSocket(
    wsUrl,
    wsHeaders,
    (ws) => {
      // WebSocket is open — respond to the CONNECT client.
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

      // If there's buffered data from the client (head), send it.
      if (head && head.length > 0) {
        ws.send(head);
      }

      // Client → WebSocket
      clientSocket.on('data', (data) => {
        if (!ws.send(data)) {
          // Backpressure: pause client until WebSocket drains.
          clientSocket.pause();
          // We can't easily detect drain on our minimal WS, so just
          // resume after a short delay.
          setTimeout(() => clientSocket.resume(), 10);
        }
      });

      // WebSocket → Client
      ws.onData((data) => {
        clientSocket.write(data);
      });

      // Close handling
      ws.onClose(() => {
        try { clientSocket.end(); } catch (e) { /* already closed */ }
      });

      clientSocket.on('close', () => {
        ws.close();
      });

      clientSocket.on('error', (err) => {
        log(`Client socket error: ${err.message}`);
        ws.close();
      });

      log(`Tunnel established: ${host}:${targetPort}`);
    },
    () => {
      // onClose
      try { clientSocket.end(); } catch (e) { /* already closed */ }
    },
    (err) => {
      // onError
      log(`WebSocket error: ${err.message}`);
      try {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.destroy();
      } catch (e) { /* already closed */ }
    },
  );
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log(`[tunnel-proxy] Listening on 127.0.0.1:${LISTEN_PORT}`);
  console.log(`[tunnel-proxy] Relay: ${RELAY_URL}`);
  console.log(`[tunnel-proxy] Auth: ${RELAY_TOKEN ? 'enabled' : 'disabled (dev mode)'}`);
});
