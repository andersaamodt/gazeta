#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const WebSocketImpl = globalThis.WebSocket || (() => {
  try {
    return require('undici').WebSocket;
  } catch (_err) {
    return null;
  }
})();

const STORE_ROOT = process.env.SECURE_CHAT_STORE_DIR || '';
const SIMPLEX_WS_PORT = Number(process.env.SECURE_CHAT_SIMPLEX_WS_PORT || 0);
const COMMAND_TIMEOUT_MS = Number(process.env.SECURE_CHAT_COMMAND_TIMEOUT_MS || 90000);

if (!STORE_ROOT || !SIMPLEX_WS_PORT || !WebSocketImpl) {
  process.stdout.write(JSON.stringify({
    success: false,
    error: 'Secure Chat direct sender is not configured',
    code: 'direct_sender_unavailable'
  }) + '\n');
  process.exit(0);
}

const CONTACTS_DIR = path.join(STORE_ROOT, 'contacts');
const MESSAGES_DIR = path.join(STORE_ROOT, 'messages');
const META_DIR = path.join(STORE_ROOT, 'meta');
const DIRECT_LOG_PATH = path.join(STORE_ROOT, '..', 'runtime', 'direct-send.log');

function logDirect(type, detail) {
  try {
    fs.appendFileSync(DIRECT_LOG_PATH, JSON.stringify(Object.assign({
      ts: new Date().toISOString(),
      type
    }, detail || {})) + '\n');
  } catch (_err) {
    // ignore logging failures
  }
}

function nowIso() {
  return new Date().toISOString();
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return fallback;
  }
}

function writeFileAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  fs.writeFileSync(tmpPath, content, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function writeJsonFileAtomic(filePath, value) {
  writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function validateNpub(npub) {
  const value = String(npub || '').trim().toLowerCase();
  if (!/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(value)) {
    throw new Error('Invalid npub');
  }
  return value;
}

function contactFilePath(npub) {
  return path.join(CONTACTS_DIR, `${validateNpub(npub)}.json`);
}

function messagesFilePath(npub) {
  return path.join(MESSAGES_DIR, `${validateNpub(npub)}.json`);
}

function metaFilePath(key) {
  return path.join(META_DIR, `${String(key || '').replace(/[^a-z0-9_.-]+/gi, '_')}.txt`);
}

function bech32Polymod(values) {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) chk ^= generators[i];
    }
  }
  return chk;
}

function bech32HrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; i += 1) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i += 1) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function bech32CreateChecksum(hrp, data) {
  const values = bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const polymod = bech32Polymod(values) ^ 1;
  const out = [];
  for (let i = 0; i < 6; i += 1) out.push((polymod >> (5 * (5 - i))) & 31);
  return out;
}

function convertBits(data, fromBits, toBits) {
  let acc = 0;
  let bits = 0;
  const out = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      out.push((acc >> bits) & maxv);
    }
  }
  if (bits > 0) out.push((acc << (toBits - bits)) & maxv);
  return out;
}

function hexToBytes(hex) {
  const clean = String(hex || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error('Invalid pubkey hex');
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

function pubkeyToNpub(pubkeyHex) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const data = convertBits(hexToBytes(pubkeyHex), 8, 5);
  return 'npub1' + data.concat(bech32CreateChecksum('npub', data)).map((value) => alphabet[value]).join('');
}

function nextMessageSeq() {
  const filePath = metaFilePath('next_seq');
  const current = Number((() => {
    try { return fs.readFileSync(filePath, 'utf8').trim(); } catch (_err) { return ''; }
  })() || 0);
  const next = current > 0 ? current : 1;
  writeFileAtomic(filePath, `${next + 1}\n`);
  return next;
}

function loadMessages(npub) {
  const rows = readJsonFile(messagesFilePath(npub), []);
  return Array.isArray(rows) ? rows : [];
}

function saveMessages(npub, rows) {
  writeJsonFileAtomic(messagesFilePath(npub), rows.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0)));
}

function parseResponseEnvelope(message) {
  try {
    return JSON.parse(String(message || ''));
  } catch (_err) {
    return null;
  }
}

function openWs() {
  return new Promise((resolve, reject) => {
    logDirect('open_ws_start', { port: SIMPLEX_WS_PORT });
    const ws = new WebSocketImpl(`ws://127.0.0.1:${SIMPLEX_WS_PORT}`);
    const timer = setTimeout(() => {
      try { ws.close(); } catch (_err) {}
      reject(new Error('Timed out connecting to simplex-chat command WebSocket'));
    }, 2000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      logDirect('open_ws_ok');
      resolve(ws);
    });
    ws.addEventListener('error', (err) => {
      clearTimeout(timer);
      logDirect('open_ws_error', { error: err && err.message ? err.message : String(err || 'unknown') });
      reject(err);
    });
  });
}

let commandSeq = 0;

function sendCommand(ws, cmd) {
  const corrId = `secure-chat-direct-${Date.now()}-${++commandSeq}`;
  logDirect('command_send', { corrId, command: cmd.replace(/ text .*/s, ' text [redacted]') });
  return new Promise((resolve, reject) => {
    function cleanup() {
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('error', onError);
    }
    function onMessage(event) {
      const envelope = parseResponseEnvelope(event.data);
      logDirect('command_message', {
        corrId,
        envelopeCorrId: envelope && envelope.corrId || '',
        responseType: envelope && envelope.resp && envelope.resp.type || ''
      });
      if (!envelope || envelope.corrId !== corrId) return;
      cleanup();
      resolve(envelope.resp);
    }
    function onError(err) {
      cleanup();
      reject(err);
    }
    const timer = setTimeout(() => {
      cleanup();
      logDirect('command_timeout', { corrId, command: cmd.replace(/ text .*/s, ' text [redacted]') });
      reject(new Error(`SimpleX command timed out: ${cmd}`));
    }, COMMAND_TIMEOUT_MS);
    ws.addEventListener('message', onMessage);
    ws.addEventListener('error', onError);
    ws.send(JSON.stringify({ corrId, cmd }));
  });
}

function deliveryStatusFromChatItem(chatItem) {
  const itemStatus = chatItem && chatItem.meta && chatItem.meta.itemStatus;
  if (!itemStatus || typeof itemStatus.type !== 'string') return 'queued';
  if (itemStatus.type === 'sndRcvd') return 'delivered';
  if (itemStatus.type === 'sndSent') return 'sent';
  if (itemStatus.type === 'sndWarning') return 'warning';
  if (itemStatus.type === 'sndError' || itemStatus.type === 'sndErrorAuth') return 'failed';
  return itemStatus.type;
}

function appendMessage(mapping, text, chatItem) {
  const npub = validateNpub(mapping.npub);
  const now = nowIso();
  const seq = nextMessageSeq();
  const row = {
    seq,
    npub,
    simplex_contact_id: String(mapping.simplex_contact_id || ''),
    bridge_user_id: String(mapping.bridge_user_id || ''),
    bridge_contact_id: String(mapping.bridge_contact_id || ''),
    direction: 'outgoing',
    message_ref: chatItem && chatItem.meta && chatItem.meta.itemId != null ? String(chatItem.meta.itemId) : '',
    message_kind: 'text',
    delivery_status: deliveryStatusFromChatItem(chatItem),
    created_at: now,
    updated_at: now,
    text: String(text || ''),
    attachment_name: '',
    attachment_mime: '',
    attachment_size: null,
    upload_id: '',
    error_code: '',
    error_detail: ''
  };
  const rows = loadMessages(npub);
  rows.push(row);
  saveMessages(npub, rows);
  return seq;
}

async function main() {
  const payloadPath = process.argv[2] || '';
  logDirect('start', { payloadPath });
  const payload = readJsonFile(payloadPath, null);
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Secure Chat payload');
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const text = String(payload.text || '');
  if (attachments.length || !text.trim()) {
    process.stdout.write(JSON.stringify({ success: false, code: 'unsupported_direct_send' }) + '\n');
    return;
  }
  const npub = pubkeyToNpub(payload.sessionPubkey);
  const mapping = readJsonFile(contactFilePath(npub), null);
  logDirect('mapping_loaded', {
    npub,
    status: mapping && mapping.status || '',
    bridgeUserId: mapping && mapping.bridge_user_id || '',
    bridgeContactId: mapping && mapping.bridge_contact_id || ''
  });
  if (!mapping || mapping.status !== 'active' || !mapping.bridge_user_id || !mapping.bridge_contact_id) {
    process.stdout.write(JSON.stringify({ success: false, code: 'mapping_unavailable' }) + '\n');
    return;
  }
  const ws = await openWs();
  try {
    const active = await sendCommand(ws, `/_user ${mapping.bridge_user_id}`);
    if (!active || active.type !== 'activeUser') {
      throw new Error(`Could not activate SimpleX user ${mapping.bridge_user_id}`);
    }
    const resp = await sendCommand(ws, `/_send @${mapping.bridge_contact_id} text ${text}`);
    if (!resp || resp.type !== 'newChatItems' || !Array.isArray(resp.chatItems)) {
      throw new Error(`Unexpected send response: ${resp && resp.type || 'unknown'}`);
    }
    const first = resp.chatItems[0] && resp.chatItems[0].chatItem ? resp.chatItems[0].chatItem : null;
    appendMessage(mapping, text, first);
    logDirect('success', {
      npub,
      messageRef: first && first.meta && first.meta.itemId != null ? String(first.meta.itemId) : ''
    });
    process.stdout.write(JSON.stringify({ success: true, uploads: [] }) + '\n');
  } finally {
    try { ws.close(); } catch (_err) {}
  }
}

main().catch((err) => {
  logDirect('error', { error: err && err.message ? err.message : String(err || 'Secure Chat direct send failed') });
  process.stdout.write(JSON.stringify({
    success: false,
    error: err && err.message ? err.message : String(err || 'Secure Chat direct send failed'),
    code: 'direct_send_failed'
  }) + '\n');
});
