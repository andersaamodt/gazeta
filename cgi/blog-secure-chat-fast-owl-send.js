#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STORE_ROOT = process.env.SECURE_CHAT_STORE_DIR || '';

if (!STORE_ROOT) {
  process.stdout.write(JSON.stringify({
    success: false,
    error: 'Secure Chat fast Owl send is not configured',
    code: 'fast_owl_send_unavailable'
  }) + '\n');
  process.exit(0);
}

const CONTACTS_DIR = path.join(STORE_ROOT, 'contacts');
const MESSAGES_DIR = path.join(STORE_ROOT, 'messages');
const META_DIR = path.join(STORE_ROOT, 'meta');
const LOG_PATH = path.join(STORE_ROOT, '..', 'runtime', 'fast-owl-send.log');

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
    // Reply acceptance should not depend on logging.
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

function appendIncomingMessage(payload) {
  const npub = validateNpub(payload.npub);
  const text = String(payload.text || '');
  if (!text.trim()) throw new Error('reply body is required');
  const mapping = ensureContact(npub);
  const now = nowIso();
  const seq = nextMessageSeq();
  const row = {
    seq,
    npub,
    simplex_contact_id: String(mapping.simplex_contact_id || ''),
    bridge_user_id: String(mapping.bridge_user_id || ''),
    bridge_contact_id: String(mapping.bridge_contact_id || ''),
    direction: 'incoming',
    message_ref: '',
    message_kind: 'text',
    delivery_status: 'received',
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
  const payload = readJsonFile(process.argv[2] || '', null);
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Owl reply payload');
  const result = appendIncomingMessage(payload);
  logFast('accepted', result);
  process.stdout.write(JSON.stringify({
    success: true,
    accepted: true,
    queued: true,
    npub: result.npub,
    seq: result.seq
  }) + '\n');
}

try {
  main();
} catch (err) {
  logFast('error', { error: err && err.message ? err.message : String(err || 'unknown') });
  process.stdout.write(JSON.stringify({
    success: false,
    error: err && err.message ? err.message : String(err || 'Secure Chat fast Owl send failed'),
    code: 'fast_owl_send_failed'
  }) + '\n');
}
