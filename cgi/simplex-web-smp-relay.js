#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
//
// Self-contained SMP WebSocket-to-native-TLS relay for Secure Chat.
//
// This is intentionally a byte relay, not a SimpleX Chat API bridge.  It only
// accepts binary WebSocket frames that are exactly one 16384-byte SMP transport
// block, connects to the configured native SMP server over TLS ALPN `smp/1`,
// normalizes the native server handshake for browser clients, and then forwards
// blocks in both directions.  Chat plaintext is never accepted by this process.

const http = require('node:http');
const tls = require('node:tls');
const crypto = require('node:crypto');

const SMP_BLOCK_SIZE = 16384;

function text(value) {
  return String(value == null ? '' : value).trim();
}

function safePort(value, fallback) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid port');
  return port;
}

function safeHost(value) {
  const host = text(value).toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(host) || host.includes('..') || host.startsWith('.') || host.endsWith('.')) {
    throw new Error('invalid host');
  }
  return host;
}

function allowedTargetHost(host, options) {
  const allowlist = String(options.targetHostAllowlist || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!allowlist.length) return host === options.targetHost;
  return allowlist.some((rule) => {
    if (rule === host) return true;
    if (rule.startsWith('*.')) return host.endsWith(rule.slice(1)) && host.length > rule.length - 1;
    return false;
  });
}

function targetOptionsForRequest(url, options) {
  const requestedHost = text(url.searchParams.get('host'));
  if (!requestedHost) return options;
  const targetHost = safeHost(requestedHost);
  if (!allowedTargetHost(targetHost, options)) throw new Error('target host is not allowed');
  const targetPort = safePort(url.searchParams.get('port'), options.targetPort);
  return {
    ...options,
    targetHost,
    targetPort,
    targetServername: safeHost(url.searchParams.get('servername') || targetHost)
  };
}

function word16(value) {
  const out = Buffer.alloc(2);
  out.writeUInt16BE(value, 0);
  return out;
}

function padBlock(body) {
  const input = Buffer.from(body);
  if (input.length + 2 > SMP_BLOCK_SIZE) throw new Error('SMP block is too large');
  return Buffer.concat([word16(input.length), input, Buffer.alloc(SMP_BLOCK_SIZE - input.length - 2, 0x23)]);
}

function unpadBlock(block) {
  const input = Buffer.from(block);
  const length = input.readUInt16BE(0);
  if (length > input.length - 2) throw new Error('SMP block length is invalid');
  for (let i = 2 + length; i < input.length; i += 1) {
    if (input[i] !== 0x23) throw new Error('SMP block padding is invalid');
  }
  return input.subarray(2, 2 + length);
}

function encodeServerHandshake(handshake) {
  const session = Buffer.from(handshake.sessionId);
  return Buffer.concat([word16(handshake.minVersion), word16(handshake.maxVersion), Buffer.from([session.length]), session]);
}

function parseNativeServerHandshake(block) {
  const body = nativePayloadFromBlock(block);
  let offset = 0;
  const minVersion = body.readUInt16BE(offset); offset += 2;
  const maxVersion = body.readUInt16BE(offset); offset += 2;
  const sessionLength = body[offset]; offset += 1;
  if (offset + sessionLength > body.length) throw new Error('native SMP session is truncated');
  return { minVersion, maxVersion, sessionId: body.subarray(offset, offset + sessionLength) };
}

function nativePayloadFromBlock(block) {
  const nativeLength = block.readUInt16BE(0);
  if (nativeLength < 5 || nativeLength > block.length - 2) throw new Error('native SMP block length is invalid');
  return block.subarray(2, 2 + nativeLength);
}

function browserBlockFromNative(block) {
  return padBlock(nativePayloadFromBlock(block));
}

function nativeBlockFromBrowser(block) {
  const body = unpadBlock(block);
  const out = Buffer.alloc(SMP_BLOCK_SIZE);
  out.writeUInt16BE(body.length, 0);
  body.copy(out, 2);
  return out;
}

function acceptKey(key) {
  return crypto.createHash('sha1').update(String(key || '') + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
}

function encodeServerFrame(payload) {
  const body = Buffer.from(payload);
  if (body.length < 126) return Buffer.concat([Buffer.from([0x82, body.length]), body]);
  const header = Buffer.alloc(4);
  header[0] = 0x82;
  header[1] = 126;
  header.writeUInt16BE(body.length, 2);
  return Buffer.concat([header, body]);
}

function encodeCloseFrame(code, reason) {
  const message = Buffer.from(String(reason || ''));
  const body = Buffer.alloc(2 + message.length);
  body.writeUInt16BE(code || 1000, 0);
  message.copy(body, 2);
  return Buffer.concat([Buffer.from([0x88, body.length]), body]);
}

function decodeClientFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  const final = (buffer[0] & 0x80) !== 0;
  const masked = (buffer[1] & 0x80) !== 0;
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < offset + 2) return null;
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null;
    const wide = buffer.readBigUInt64BE(offset);
    if (wide > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('frame too large');
    length = Number(wide);
    offset += 8;
  }
  if (!masked) throw new Error('client WebSocket frames must be masked');
  if (buffer.length < offset + 4 + length) return null;
  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
  return { opcode, final, payload, rest: buffer.subarray(offset + length) };
}

function readExact(stream, length, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => cleanup(reject, new Error('native SMP read timeout')), timeoutMs);
    function cleanup(done, value) {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('error', onError);
      stream.off('close', onClose);
      done(value);
    }
    function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < length) return;
      const block = buffer.subarray(0, length);
      const extra = buffer.subarray(length);
      if (extra.length) stream.unshift(extra);
      cleanup(resolve, block);
    }
    function onError(error) { cleanup(reject, error); }
    function onClose() { cleanup(reject, new Error('native SMP closed')); }
    stream.on('data', onData);
    stream.once('error', onError);
    stream.once('close', onClose);
    stream.resume();
  });
}

function closePair(ws, native, code, reason) {
  try { if (!ws.destroyed) ws.write(encodeCloseFrame(code || 1000, reason || '')); } catch (_) {}
  try { ws.destroy(); } catch (_) {}
  try { native.destroy(); } catch (_) {}
}

async function startNative(ws, native, options) {
  const nativeHandshakeBlock = await readExact(native, SMP_BLOCK_SIZE, options.timeoutMs);
  const nativeHandshake = parseNativeServerHandshake(nativeHandshakeBlock);
  const browserHandshake = padBlock(encodeServerHandshake({
    minVersion: nativeHandshake.minVersion,
    maxVersion: Math.min(nativeHandshake.maxVersion, 9),
    sessionId: nativeHandshake.sessionId
  }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  ws.write(encodeServerFrame(browserHandshake));
}

function handleUpgrade(request, socket, options) {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname !== options.path) return false;
  let targetOptions = options;
  try {
    targetOptions = targetOptionsForRequest(url, options);
  } catch (_) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return true;
  }
  const requested = String(request.headers['sec-websocket-protocol'] || '').split(',').map((item) => item.trim());
  if (!requested.includes('simplex-smp.v4.ws')) {
    socket.write('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nSec-WebSocket-Protocol: simplex-smp.v4.ws\r\n\r\n');
    socket.destroy();
    return true;
  }
  const native = tls.connect({
    host: targetOptions.targetHost,
    port: targetOptions.targetPort,
    servername: targetOptions.targetServername || targetOptions.targetHost,
    ALPNProtocols: ['smp/1'],
    rejectUnauthorized: targetOptions.rejectUnauthorized
  });
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + acceptKey(request.headers['sec-websocket-key']),
    'Sec-WebSocket-Protocol: simplex-smp.v4.ws',
    '',
    ''
  ].join('\r\n'));
  let nativeBuffer = Buffer.alloc(0);
  const started = startNative(socket, native, targetOptions).then(() => {
    native.on('data', (chunk) => {
      nativeBuffer = Buffer.concat([nativeBuffer, chunk]);
      while (nativeBuffer.length >= SMP_BLOCK_SIZE) {
        const block = nativeBuffer.subarray(0, SMP_BLOCK_SIZE);
        nativeBuffer = nativeBuffer.subarray(SMP_BLOCK_SIZE);
        socket.write(encodeServerFrame(browserBlockFromNative(block)));
      }
    });
  }).catch(() => closePair(socket, native, 1011, 'native SMP unavailable'));
  let wsBuffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    wsBuffer = Buffer.concat([wsBuffer, chunk]);
    try {
      for (;;) {
        const frame = decodeClientFrame(wsBuffer);
        if (!frame) return;
        wsBuffer = frame.rest;
        if (frame.opcode === 0x8) return closePair(socket, native);
        if (!frame.final || frame.opcode !== 0x2 || frame.payload.length !== SMP_BLOCK_SIZE) {
          return closePair(socket, native, 1003, 'binary SMP blocks only');
        }
        const payload = frame.payload;
        started.then(() => { if (!native.destroyed) native.write(nativeBlockFromBrowser(payload)); });
      }
    } catch (_) {
      closePair(socket, native, 1002, 'bad WebSocket frame');
    }
  });
  native.on('error', () => closePair(socket, native, 1011, 'native SMP error'));
  native.on('close', () => closePair(socket, native));
  socket.on('error', () => closePair(socket, native));
  socket.on('close', () => closePair(socket, native));
  return true;
}

const options = {
  host: text(process.env.SIMPLEX_WEB_SMP_RELAY_HOST) || '127.0.0.1',
  port: safePort(process.env.SIMPLEX_WEB_SMP_RELAY_PORT, 18097),
  path: text(process.env.SIMPLEX_WEB_SMP_RELAY_PATH) || '/simplex/smp',
  targetHost: text(process.env.SIMPLEX_WEB_SMP_TARGET_HOST) || 'smp8.simplex.im',
  targetPort: safePort(process.env.SIMPLEX_WEB_SMP_TARGET_PORT, 5223),
  targetServername: text(process.env.SIMPLEX_WEB_SMP_TARGET_SERVERNAME) || 'smp8.simplex.im',
  targetHostAllowlist: text(process.env.SIMPLEX_WEB_SMP_TARGET_HOST_ALLOWLIST) || '*.simplex.im',
  rejectUnauthorized: text(process.env.SIMPLEX_WEB_SMP_TARGET_REJECT_UNAUTHORIZED || 'false') !== 'false',
  timeoutMs: safePort(process.env.SIMPLEX_WEB_SMP_RELAY_TIMEOUT_MS, 15000)
};

const server = http.createServer((request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok\n');
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain' });
  response.end('not found\n');
});

server.on('upgrade', (request, socket, head) => {
  if (head && head.length) return socket.destroy();
  if (!handleUpgrade(request, socket, options)) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
  }
});

server.listen(options.port, options.host, () => {
  process.stdout.write(`simplex-web SMP relay listening on ${options.host}:${options.port}${options.path}\n`);
});
