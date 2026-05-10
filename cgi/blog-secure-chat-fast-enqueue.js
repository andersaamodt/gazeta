#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STORE_ROOT = process.env.SECURE_CHAT_STORE_DIR || '';

if (!STORE_ROOT) {
  process.stdout.write(JSON.stringify({
    success: false,
    error: 'Secure Chat fast enqueue is not configured',
    code: 'fast_enqueue_unavailable'
  }) + '\n');
  process.exit(0);
}

const CONTACTS_DIR = path.join(STORE_ROOT, 'contacts');
const MESSAGES_DIR = path.join(STORE_ROOT, 'messages');
const META_DIR = path.join(STORE_ROOT, 'meta');
const LOG_PATH = path.join(STORE_ROOT, '..', 'runtime', 'fast-enqueue.log');

for (const dir of [STORE_ROOT, CONTACTS_DIR, MESSAGES_DIR, META_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function logFast(type, detail) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(Object.assign({
      ts: new Date().toISOString(),
      type
    }, detail || {})) + '\n');
  } catch (_err) {
    // Logging must never block message acceptance.
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

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_err) {
    return '';
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
  const current = Number(readTextFile(filePath).trim() || 0);
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

function ensureContact(npub) {
  const filePath = contactFilePath(npub);
  const existing = readJsonFile(filePath, null);
  if (existing && typeof existing === 'object') return existing;
  const now = nowIso();
  const row = {
    npub,
    simplex_contact_id: '',
    bridge_user_id: '',
    bridge_contact_id: '',
    status: 'queued',
    created_at: now,
    updated_at: now,
    deactivated_at: '',
    last_provisioned_at: '',
    last_error: ''
  };
  writeJsonFileAtomic(filePath, row);
  return row;
}

function appendQueuedMessage(payload) {
  const npub = pubkeyToNpub(payload.sessionPubkey);
  const text = String(payload.text || '');
  if (!text.trim()) throw new Error('message is required');
  const mapping = ensureContact(npub);
  const now = nowIso();
  const seq = nextMessageSeq();
  const row = {
    seq,
    npub,
    simplex_contact_id: String(mapping.simplex_contact_id || ''),
    bridge_user_id: String(mapping.bridge_user_id || ''),
    bridge_contact_id: String(mapping.bridge_contact_id || ''),
    direction: 'outgoing',
    message_ref: '',
    message_kind: 'text',
    delivery_status: 'accepted',
    created_at: now,
    updated_at: now,
    text,
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
  return { npub, seq };
}

function main() {
  const payloadPath = process.argv[2] || '';
  const payload = readJsonFile(payloadPath, null);
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Secure Chat payload');
  const result = appendQueuedMessage(payload);
  logFast('accepted', result);
  process.stdout.write(JSON.stringify({
    success: true,
    accepted: true,
    queued: true,
    seq: result.seq,
    uploads: []
  }) + '\n');
}

try {
  main();
} catch (err) {
  logFast('error', { error: err && err.message ? err.message : String(err || 'unknown') });
  process.stdout.write(JSON.stringify({
    success: false,
    error: err && err.message ? err.message : String(err || 'Secure Chat fast enqueue failed'),
    code: 'fast_enqueue_failed'
  }) + '\n');
}
