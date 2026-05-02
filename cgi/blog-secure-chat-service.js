#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const WebSocketImpl = globalThis.WebSocket || (() => {
  try {
    return require('undici').WebSocket;
  } catch (_err) {
    return null;
  }
})();

const STORE_ROOT = process.env.SECURE_CHAT_STORE_DIR || process.env.SECURE_CHAT_DB_PATH || '';
const SOCKET_PATH = process.env.SECURE_CHAT_SOCKET_PATH || '';
const UPLOADS_DIR = process.env.SECURE_CHAT_UPLOADS_DIR || '';
const DOWNLOADS_DIR = process.env.SECURE_CHAT_DOWNLOADS_DIR || '';
const SIMPLEX_BINARY = process.env.SECURE_CHAT_SIMPLEX_BINARY || 'simplex-chat';
const SIMPLEX_WS_PORT = Number(process.env.SECURE_CHAT_SIMPLEX_WS_PORT || 0);
const SIMPLEX_NATIVE_MODULE_ROOT = process.env.SECURE_CHAT_SIMPLEX_NATIVE_MODULE_ROOT || '';
const SITE_TITLE = String(process.env.SECURE_CHAT_SITE_TITLE || 'Secure Chat');
const MAX_UPLOAD_BYTES = Number(process.env.SECURE_CHAT_MAX_UPLOAD_BYTES || 25 * 1024 * 1024);
const MESSAGE_CACHE_LIMIT = 500;
const COMMAND_TIMEOUT_MS = 30000;
const PROVISION_TIMEOUT_MS = 30000;

if (!STORE_ROOT || !SOCKET_PATH || !UPLOADS_DIR || !DOWNLOADS_DIR || !SIMPLEX_WS_PORT) {
  process.stderr.write('Missing Secure Chat service environment.\n');
  process.exit(1);
}
if (!WebSocketImpl) {
  process.stderr.write('Secure Chat service requires a Node.js runtime with WebSocket support.\n');
  process.exit(1);
}

const CONTACTS_DIR = path.join(STORE_ROOT, 'contacts');
const MESSAGES_DIR = path.join(STORE_ROOT, 'messages');
const META_DIR = path.join(STORE_ROOT, 'meta');

for (const dir of [STORE_ROOT, CONTACTS_DIR, MESSAGES_DIR, META_DIR, path.dirname(SOCKET_PATH), UPLOADS_DIR, DOWNLOADS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

try {
  fs.unlinkSync(SOCKET_PATH);
} catch (_err) {
  // ignore stale sockets
}

let cachedNativeSimplex = undefined;
let cachedNativeSimplexError = '';

function tryRequire(moduleId) {
  try {
    return require(moduleId);
  } catch (err) {
    cachedNativeSimplexError = err && err.message ? err.message : String(err || 'unknown error');
    return null;
  }
}

function loadNativeSimplexModule() {
  if (cachedNativeSimplex !== undefined) return cachedNativeSimplex;
  const candidates = [];
  if (SIMPLEX_NATIVE_MODULE_ROOT) {
    candidates.push(path.join(SIMPLEX_NATIVE_MODULE_ROOT, 'node_modules', 'simplex-chat'));
    candidates.push(SIMPLEX_NATIVE_MODULE_ROOT);
  }
  candidates.push('simplex-chat');
  for (const candidate of candidates) {
    const loaded = tryRequire(candidate);
    if (loaded) {
      cachedNativeSimplex = loaded;
      cachedNativeSimplexError = '';
      return loaded;
    }
  }
  cachedNativeSimplex = null;
  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function readJsonFileSync(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return fallback;
  }
}

function readTextFileSync(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_err) {
    return '';
  }
}

function writeFileAtomicSync(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  fs.writeFileSync(tmpPath, content, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function writeJsonFileAtomicSync(filePath, value) {
  writeFileAtomicSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function normalizeContactRow(row) {
  if (!row || typeof row !== 'object') return null;
  let npub;
  try {
    npub = validateNpub(row.npub);
  } catch (_err) {
    return null;
  }
  return {
    npub,
    simplex_contact_id: row.simplex_contact_id == null ? '' : String(row.simplex_contact_id),
    bridge_user_id: row.bridge_user_id == null ? '' : String(row.bridge_user_id),
    bridge_contact_id: row.bridge_contact_id == null ? '' : String(row.bridge_contact_id),
    status: String(row.status || 'provisioning'),
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
    deactivated_at: row.deactivated_at || '',
    last_provisioned_at: row.last_provisioned_at || '',
    last_error: row.last_error || ''
  };
}

function normalizeMessageRow(row) {
  if (!row || typeof row !== 'object') return null;
  let npub;
  try {
    npub = validateNpub(row.npub);
  } catch (_err) {
    return null;
  }
  const seq = Number(row.seq);
  if (!Number.isFinite(seq) || seq <= 0) return null;
  return {
    seq,
    npub,
    simplex_contact_id: row.simplex_contact_id == null ? '' : String(row.simplex_contact_id),
    bridge_user_id: row.bridge_user_id == null ? '' : String(row.bridge_user_id),
    bridge_contact_id: row.bridge_contact_id == null ? '' : String(row.bridge_contact_id),
    direction: String(row.direction || 'outgoing'),
    message_ref: row.message_ref == null ? '' : String(row.message_ref),
    message_kind: String(row.message_kind || 'text'),
    delivery_status: String(row.delivery_status || 'queued'),
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
    attachment_name: row.attachment_name == null ? '' : String(row.attachment_name),
    attachment_mime: row.attachment_mime == null ? '' : String(row.attachment_mime),
    attachment_size: row.attachment_size == null || row.attachment_size === '' ? null : Number(row.attachment_size),
    upload_id: row.upload_id == null ? '' : String(row.upload_id),
    error_code: row.error_code == null ? '' : String(row.error_code),
    error_detail: row.error_detail == null ? '' : String(row.error_detail)
  };
}

function listJsonRows(dir, normalizer) {
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (_err) {
    return [];
  }
  const rows = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const row = normalizer(readJsonFileSync(path.join(dir, name), null));
    if (row) rows.push(row);
  }
  return rows;
}

function loadAllContacts() {
  return listJsonRows(CONTACTS_DIR, normalizeContactRow)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

function loadContactByNpub(npub) {
  return normalizeContactRow(readJsonFileSync(contactFilePath(npub), null));
}

function findContact(predicate) {
  for (const row of loadAllContacts()) {
    if (predicate(row)) return row;
  }
  return null;
}

function saveContact(row) {
  const normalized = normalizeContactRow(row);
  if (!normalized) throw new Error('Invalid contact row');
  for (const existing of loadAllContacts()) {
    if (existing.npub === normalized.npub) continue;
    if (normalized.simplex_contact_id && existing.simplex_contact_id === normalized.simplex_contact_id) {
      throw new Error('duplicate simplex_contact_id');
    }
    if (normalized.bridge_user_id && existing.bridge_user_id === normalized.bridge_user_id) {
      throw new Error('duplicate bridge_user_id');
    }
    if (normalized.bridge_contact_id && existing.bridge_contact_id === normalized.bridge_contact_id) {
      throw new Error('duplicate bridge_contact_id');
    }
  }
  writeJsonFileAtomicSync(contactFilePath(normalized.npub), normalized);
  return normalized;
}

function updateContactStatus(npub, status, deactivatedAt, lastError) {
  const existing = loadContactByNpub(npub) || normalizeContactRow({
    npub,
    simplex_contact_id: '',
    bridge_user_id: '',
    bridge_contact_id: '',
    status: 'provisioning',
    created_at: nowIso(),
    updated_at: '',
    deactivated_at: '',
    last_provisioned_at: '',
    last_error: ''
  });
  return saveContact(Object.assign({}, existing, {
    status: String(status || existing.status || 'provisioning'),
    updated_at: nowIso(),
    deactivated_at: deactivatedAt || '',
    last_error: lastError || ''
  }));
}

function deleteContact(npub) {
  try {
    fs.unlinkSync(contactFilePath(npub));
  } catch (_err) {
    // ignore missing files
  }
}

function loadMessages(npub) {
  const rows = readJsonFileSync(messagesFilePath(npub), []);
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeMessageRow)
    .filter(Boolean)
    .sort((a, b) => a.seq - b.seq);
}

function saveMessages(npub, rows) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map(normalizeMessageRow)
    .filter(Boolean)
    .sort((a, b) => a.seq - b.seq);
  writeJsonFileAtomicSync(messagesFilePath(npub), normalized);
  return normalized;
}

function nextMessageSeq() {
  const current = Number(readTextFileSync(metaFilePath('next_seq')).trim() || 0);
  const next = current > 0 ? current : 1;
  writeFileAtomicSync(metaFilePath('next_seq'), `${next + 1}\n`);
  return next;
}

const seqToNpub = new Map();
const messageRefToNpub = new Map();

function rememberMessageIndex(row) {
  if (!row) return;
  seqToNpub.set(Number(row.seq), String(row.npub || ''));
  if (row.message_ref) messageRefToNpub.set(String(row.message_ref), String(row.npub || ''));
}

const selectContactByNpubStmt = {
  get(npub) {
    return loadContactByNpub(String(npub || ''));
  }
};

const selectContactByBridgeUserStmt = {
  get(bridgeUserId) {
    const needle = String(bridgeUserId || '');
    if (!needle) return null;
    return findContact((row) => row.bridge_user_id === needle);
  }
};

const selectContactByOwnerContactStmt = {
  get(contactId) {
    const needle = String(contactId || '');
    if (!needle) return null;
    return findContact((row) => row.simplex_contact_id === needle);
  }
};

const selectContactByBridgeContactStmt = {
  get(contactId) {
    const needle = String(contactId || '');
    if (!needle) return null;
    return findContact((row) => row.bridge_contact_id === needle);
  }
};

const selectMappingsStmt = {
  all(limit) {
    return loadAllContacts().slice(0, Math.max(0, Number(limit || 0) || 0));
  }
};

const selectMessagesSinceStmt = {
  all(npub, sinceSeq, limit) {
    return loadMessages(String(npub || ''))
      .filter((row) => Number(row.seq) > Number(sinceSeq || 0))
      .slice(0, Math.max(0, Number(limit || 0) || 0));
  }
};

const selectRecentMessagesStmt = {
  all(npub, limit) {
    const rows = loadMessages(String(npub || ''));
    const count = Math.max(0, Number(limit || 0) || 0);
    return count > 0 ? rows.slice(-count).reverse() : [];
  }
};

const upsertContactStmt = {
  run(npub, simplexContactId, bridgeUserId, bridgeContactId, status, createdAt, updatedAt, lastProvisionedAt) {
    return saveContact({
      npub,
      simplex_contact_id: simplexContactId || '',
      bridge_user_id: bridgeUserId || '',
      bridge_contact_id: bridgeContactId || '',
      status: status || 'active',
      created_at: createdAt || nowIso(),
      updated_at: updatedAt || nowIso(),
      deactivated_at: '',
      last_provisioned_at: lastProvisionedAt || nowIso(),
      last_error: ''
    });
  }
};

const updateContactStatusStmt = {
  run(status, _updatedAt, deactivatedAt, lastError, npub) {
    return updateContactStatus(String(npub || ''), status, deactivatedAt, lastError);
  }
};

function sanitizeName(name) {
  return String(name || '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'file';
}

function logEvent(type, detail) {
  const payload = Object.assign({ ts: nowIso(), type }, detail || {});
  try {
    fs.appendFileSync(path.join(path.dirname(SOCKET_PATH), 'service.events.log'), JSON.stringify(payload) + '\n');
  } catch (_err) {
    // ignore logging failures
  }
}

function metaGet(key) {
  return readTextFileSync(metaFilePath(key)).trim();
}

function metaSet(key, value) {
  writeFileAtomicSync(metaFilePath(key), `${String(value || '')}\n`);
}

function contactRowToJson(row) {
  if (!row) return null;
  return {
    npub: String(row.npub || ''),
    simplex_contact_id: row.simplex_contact_id == null ? '' : String(row.simplex_contact_id),
    bridge_user_id: row.bridge_user_id == null ? '' : String(row.bridge_user_id),
    bridge_contact_id: row.bridge_contact_id == null ? '' : String(row.bridge_contact_id),
    status: String(row.status || 'unknown'),
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
    deactivated_at: row.deactivated_at || '',
    last_provisioned_at: row.last_provisioned_at || '',
    last_error: row.last_error || ''
  };
}

function mapMessageRow(row) {
  const extra = recentMessageText.get(Number(row.seq)) || {};
  return {
    seq: Number(row.seq),
    direction: String(row.direction || 'outgoing'),
    message_ref: row.message_ref == null ? '' : String(row.message_ref),
    message_kind: String(row.message_kind || 'text'),
    delivery_status: String(row.delivery_status || 'unknown'),
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
    text: extra.text || '',
    attachment: row.attachment_name ? {
      name: row.attachment_name,
      mime: row.attachment_mime || '',
      size: Number(row.attachment_size || 0),
      upload_id: row.upload_id || ''
    } : null,
    error_code: row.error_code || '',
    error_detail: row.error_detail || ''
  };
}

function rememberMessageText(seq, text, file) {
  recentMessageText.set(Number(seq), {
    text: String(text || ''),
    file: file || null
  });
  if (recentMessageText.size > MESSAGE_CACHE_LIMIT) {
    const firstKey = recentMessageText.keys().next().value;
    recentMessageText.delete(firstKey);
  }
}

function insertMessage(row) {
  const normalized = normalizeMessageRow(Object.assign({}, row, { seq: nextMessageSeq() }));
  if (!normalized) {
    throw new Error('Invalid secure chat message row');
  }
  const rows = loadMessages(normalized.npub);
  rows.push(normalized);
  saveMessages(normalized.npub, rows);
  rememberMessageIndex(normalized);
  return Number(normalized.seq);
}

function setMessageStatusByRef(messageRef, deliveryStatus, errorCode, errorDetail) {
  if (!messageRef) return;
  const ref = String(messageRef);
  const candidates = [];
  const indexed = messageRefToNpub.get(ref);
  if (indexed) candidates.push(indexed);
  for (const row of loadAllContacts()) {
    if (!candidates.includes(row.npub)) candidates.push(row.npub);
  }
  for (const npub of candidates) {
    const rows = loadMessages(npub);
    let changed = false;
    for (const row of rows) {
      if (String(row.message_ref || '') !== ref) continue;
      row.delivery_status = deliveryStatus || row.delivery_status;
      row.updated_at = nowIso();
      row.error_code = errorCode || row.error_code || '';
      row.error_detail = errorDetail || row.error_detail || '';
      changed = true;
      rememberMessageIndex(row);
    }
    if (changed) {
      saveMessages(npub, rows);
      return;
    }
  }
}

function updateMessageBySeq(seq, fields) {
  const seqNumber = Number(seq);
  const candidates = [];
  const indexed = seqToNpub.get(seqNumber);
  if (indexed) candidates.push(indexed);
  for (const row of loadAllContacts()) {
    if (!candidates.includes(row.npub)) candidates.push(row.npub);
  }
  for (const npub of candidates) {
    const rows = loadMessages(npub);
    let changed = false;
    for (const row of rows) {
      if (Number(row.seq) !== seqNumber) continue;
      if (fields.message_ref) row.message_ref = String(fields.message_ref);
      if (fields.delivery_status) row.delivery_status = String(fields.delivery_status);
      row.updated_at = nowIso();
      if (fields.error_code) row.error_code = String(fields.error_code);
      if (fields.error_detail) row.error_detail = String(fields.error_detail);
      changed = true;
      rememberMessageIndex(row);
      break;
    }
    if (changed) {
      saveMessages(npub, rows);
      return;
    }
  }
}

function bech32Polymod(values) {
  const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) chk ^= GENERATORS[i];
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
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error('Invalid pubkey hex');
  }
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

function pubkeyToNpub(pubkeyHex) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const data = convertBits(hexToBytes(pubkeyHex), 8, 5);
  const checksum = bech32CreateChecksum('npub', data);
  const all = data.concat(checksum);
  return 'npub1' + all.map((value) => alphabet[value]).join('');
}

const recentMessageText = new Map();
const pendingCommands = new Map();
const provisionLocks = new Map();
const uploads = new Map();

const state = {
  startedAt: nowIso(),
  ownerUserId: metaGet('owner_user_id') || '',
  ws: null,
  wsConnected: false,
  commandSeq: 0,
  activeUserId: metaGet('last_active_user_id') || '',
  transportStatus: 'starting',
  transportError: '',
  simplexProcess: null,
  driverType: 'unknown',
  nativeSimplex: null,
  nativeChat: null,
  operations: Promise.resolve()
};

function withLock(fn) {
  const current = state.operations.then(fn, fn);
  state.operations = current.catch(() => undefined);
  return current;
}

function safeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function isWebSocketOpen() {
  return state.ws && state.ws.readyState === WebSocketImpl.OPEN;
}

function nativeDriverAvailable() {
  return !!loadNativeSimplexModule();
}

async function ensureNativeChatApi() {
  if (state.nativeChat) return state.nativeChat;
  const simplex = loadNativeSimplexModule();
  if (!simplex || !simplex.api || !simplex.core) {
    throw new Error(cachedNativeSimplexError || 'simplex-chat native Node.js module is not available');
  }
  const dbPrefix = path.join(STORE_ROOT, 'simplex-bridge');
  const chat = await simplex.api.ChatApi.init(
    { type: 'sqlite', filePrefix: dbPrefix },
    simplex.core.MigrationConfirmation.YesUp
  );
  chat.onAny((event) => {
    try {
      handleIncomingEvent(event);
    } catch (err) {
      logEvent('event_error', {
        eventType: event && event.type ? event.type : 'native_event',
        error: err && err.message ? err.message : String(err || 'unknown error')
      });
    }
  });
  state.nativeSimplex = simplex;
  state.nativeChat = chat;
  state.driverType = 'native';
  return chat;
}

function startSimplexChild() {
  if (nativeDriverAvailable()) {
    state.driverType = 'native';
    return;
  }
  if (state.simplexProcess && !state.simplexProcess.killed) return;
  if (!fs.existsSync(SIMPLEX_BINARY) && !process.env.PATH) {
    state.transportStatus = 'degraded';
    state.transportError = 'simplex-chat binary is not installed';
    return;
  }
  const dbPrefix = path.join(STORE_ROOT, 'simplex-bridge');
  const botDisplayName = `${SITE_TITLE} Secure Chat`;
  const simplexArgs = [
    '--create-bot-display-name',
    botDisplayName,
    '--create-bot-allow-files',
    '-p',
    String(SIMPLEX_WS_PORT),
    '-d',
    dbPrefix
  ];
  try {
    state.simplexProcess = spawn(SIMPLEX_BINARY, simplexArgs, {
      stdio: ['ignore', 'ignore', 'ignore']
    });
    state.simplexProcess.on('exit', (code) => {
      logEvent('simplex_exit', { code });
      state.transportStatus = 'degraded';
      state.transportError = 'simplex-chat stopped';
      state.wsConnected = false;
      state.ws = null;
      state.simplexProcess = null;
    });
  } catch (err) {
    state.transportStatus = 'degraded';
    state.transportError = err && err.message ? err.message : 'Could not start simplex-chat';
  }
}

function stopSimplexChild() {
  if (state.nativeChat) {
    const chat = state.nativeChat;
    state.nativeChat = null;
    Promise.resolve()
      .then(async () => {
        if (chat.started) await chat.stopChat();
      })
      .catch(() => undefined)
      .then(async () => {
        try {
          await chat.close();
        } catch (_err) {
          // ignore shutdown races
        }
      });
    return;
  }
  if (!state.simplexProcess || state.simplexProcess.killed) return;
  try {
    state.simplexProcess.kill('SIGTERM');
  } catch (_err) {
    // ignore shutdown races
  }
}

function parseResponseEnvelope(message) {
  try {
    return JSON.parse(String(message || ''));
  } catch (_err) {
    return null;
  }
}

function handleIncomingEvent(resp) {
  if (!resp || typeof resp !== 'object') return;
  switch (resp.type) {
    case 'newChatItems':
      if (Array.isArray(resp.chatItems)) {
        for (const chatItem of resp.chatItems) {
          try {
            handleChatItemEvent(resp.user, chatItem);
          } catch (err) {
            logEvent('event_error', { eventType: 'newChatItems', error: err.message });
          }
        }
      }
      break;
    case 'chatItemsStatusesUpdated':
      if (Array.isArray(resp.chatItems)) {
        for (const chatItem of resp.chatItems) {
          try {
            handleChatItemStatusEvent(resp.user, chatItem);
          } catch (err) {
            logEvent('event_error', { eventType: 'chatItemsStatusesUpdated', error: err.message });
          }
        }
      }
      break;
    case 'sndFileError':
    case 'sndFileWarning':
      if (resp.chatItem_ && resp.chatItem_.chatItem && resp.chatItem_.chatItem.meta) {
        const itemId = String(resp.chatItem_.chatItem.meta.itemId || '');
        setMessageStatusByRef(itemId, 'failed', resp.type, String(resp.errorMessage || ''));
      }
      break;
    case 'sndFileCompleteXFTP':
      if (resp.chatItem && resp.chatItem.chatItem && resp.chatItem.chatItem.meta) {
        const itemId = String(resp.chatItem.chatItem.meta.itemId || '');
        setMessageStatusByRef(itemId, 'delivered', '', '');
      }
      break;
    case 'contactDeletedByContact':
      if (resp.contact && resp.contact.contactId != null) {
        const row = selectContactByOwnerContactStmt.get(String(resp.contact.contactId)) || selectContactByBridgeContactStmt.get(String(resp.contact.contactId));
        if (row) {
          updateContactStatusStmt.run('inactive', nowIso(), nowIso(), 'Contact deleted in SimpleX', row.npub);
        }
      }
      break;
    default:
      break;
  }
}

function chatItemText(chatItem) {
  if (!chatItem || !chatItem.content) return '';
  const content = chatItem.content;
  const msgContent = content.msgContent || content.content || null;
  if (msgContent && typeof msgContent.text === 'string') {
    return msgContent.text;
  }
  if (chatItem.meta && typeof chatItem.meta.itemText === 'string') {
    return chatItem.meta.itemText;
  }
  return '';
}

function chatItemKind(chatItem) {
  const content = chatItem && chatItem.content && (chatItem.content.msgContent || chatItem.content.content || chatItem.content);
  if (content && typeof content.type === 'string') return content.type;
  if (chatItem && chatItem.file) return 'file';
  return 'text';
}

function deliveryStatusFromChatItem(chatItem) {
  const itemStatus = chatItem && chatItem.meta && chatItem.meta.itemStatus;
  if (!itemStatus || typeof itemStatus.type !== 'string') return 'queued';
  switch (itemStatus.type) {
    case 'sndRcvd':
      return 'delivered';
    case 'sndSent':
      return 'sent';
    case 'sndWarning':
      return 'warning';
    case 'sndError':
    case 'sndErrorAuth':
      return 'failed';
    case 'rcvNew':
    case 'rcvRead':
      return 'received';
    default:
      return itemStatus.type;
  }
}

function bridgeMappingForUser(userId, contactId) {
  if (userId) {
    const byUser = selectContactByBridgeUserStmt.get(String(userId));
    if (byUser) return byUser;
  }
  if (contactId) {
    return selectContactByBridgeContactStmt.get(String(contactId)) || null;
  }
  return null;
}

function ownerMappingForContact(contactId) {
  if (!contactId) return null;
  return selectContactByOwnerContactStmt.get(String(contactId)) || null;
}

function handleChatItemEvent(user, aChatItem) {
  if (!aChatItem || !aChatItem.chatInfo || !aChatItem.chatItem) return;
  if (aChatItem.chatInfo.type !== 'direct' || !aChatItem.chatInfo.contact) return;
  const userId = user && user.userId != null ? String(user.userId) : '';
  const contactId = aChatItem.chatInfo.contact.contactId != null ? String(aChatItem.chatInfo.contact.contactId) : '';
  const bridgeRow = bridgeMappingForUser(userId, contactId);
  if (!bridgeRow) {
    return;
  }

  const chatItem = aChatItem.chatItem;
  const direction = chatItem.chatDir && chatItem.chatDir.type === 'directRcv' ? 'incoming' : 'outgoing';
  const messageKind = chatItemKind(chatItem);
  const deliveryStatus = deliveryStatusFromChatItem(chatItem);
  const createdAt = (chatItem.meta && (chatItem.meta.itemTs || chatItem.meta.createdAt)) || nowIso();
  const messageRef = chatItem.meta && chatItem.meta.itemId != null ? String(chatItem.meta.itemId) : '';
  const text = chatItemText(chatItem);
  const attachmentName = chatItem.file && chatItem.file.fileName ? String(chatItem.file.fileName) : '';
  const attachmentMime = '';
  const attachmentSize = chatItem.file && chatItem.file.fileSize != null ? Number(chatItem.file.fileSize) : null;

  const seq = insertMessage({
    npub: bridgeRow.npub,
    simplex_contact_id: bridgeRow.simplex_contact_id,
    bridge_user_id: bridgeRow.bridge_user_id,
    bridge_contact_id: bridgeRow.bridge_contact_id,
    direction,
    message_ref: messageRef,
    message_kind: messageKind,
    delivery_status: deliveryStatus,
    created_at: createdAt,
    updated_at: nowIso(),
    attachment_name: attachmentName,
    attachment_mime: attachmentMime,
    attachment_size: attachmentSize,
    upload_id: '',
    error_code: '',
    error_detail: ''
  });
  rememberMessageText(seq, text, attachmentName ? { name: attachmentName, size: attachmentSize || 0 } : null);
}

function handleChatItemStatusEvent(user, aChatItem) {
  if (!aChatItem || !aChatItem.chatInfo || !aChatItem.chatItem) return;
  if (aChatItem.chatInfo.type !== 'direct' || !aChatItem.chatInfo.contact) return;
  const userId = user && user.userId != null ? String(user.userId) : '';
  const contactId = aChatItem.chatInfo.contact.contactId != null ? String(aChatItem.chatInfo.contact.contactId) : '';
  const bridgeRow = bridgeMappingForUser(userId, contactId);
  if (!bridgeRow) return;
  const messageRef = aChatItem.chatItem.meta && aChatItem.chatItem.meta.itemId != null
    ? String(aChatItem.chatItem.meta.itemId)
    : '';
  setMessageStatusByRef(messageRef, deliveryStatusFromChatItem(aChatItem.chatItem), '', '');
}

function ensureWsConnection() {
  if (nativeDriverAvailable()) {
    return ensureNativeChatApi().then((chat) => {
      state.wsConnected = true;
      state.transportStatus = 'connected';
      state.transportError = '';
      return chat;
    }).catch((err) => {
      state.transportStatus = 'degraded';
      state.transportError = err && err.message ? err.message : 'Could not initialize simplex-chat native driver';
      throw err;
    });
  }
  if (isWebSocketOpen()) {
    return Promise.resolve();
  }
  startSimplexChild();

  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(`ws://127.0.0.1:${SIMPLEX_WS_PORT}`);
    const timer = setTimeout(() => {
      try { ws.close(); } catch (_err) {}
      reject(new Error('Timed out connecting to simplex-chat local WebSocket'));
    }, 8000);

    ws.addEventListener('open', () => {
      clearTimeout(timer);
      state.ws = ws;
      state.wsConnected = true;
      state.transportStatus = 'connected';
      state.transportError = '';
      ws.addEventListener('message', (event) => {
        const envelope = parseResponseEnvelope(event.data);
        if (!envelope || !envelope.resp) return;
        if (envelope.corrId && pendingCommands.has(envelope.corrId)) {
          const pending = pendingCommands.get(envelope.corrId);
          pendingCommands.delete(envelope.corrId);
          pending.resolve(envelope.resp);
          return;
        }
        handleIncomingEvent(envelope.resp);
      });
      ws.addEventListener('close', () => {
        state.wsConnected = false;
        state.ws = null;
      });
      resolve();
    });
    ws.addEventListener('error', (err) => {
      clearTimeout(timer);
      state.transportStatus = 'degraded';
      state.transportError = err && err.message ? err.message : 'WebSocket error';
      reject(err);
    });
  });
}

async function sendCommand(cmd) {
  const transport = await ensureWsConnection();
  if (state.driverType === 'native' && transport && typeof transport.sendChatCmd === 'function') {
    return transport.sendChatCmd(cmd);
  }
  const corrId = `secure-chat-${Date.now()}-${++state.commandSeq}`;
  const payload = JSON.stringify({ corrId, cmd });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(corrId);
      reject(new Error(`SimpleX command timed out: ${cmd}`));
    }, COMMAND_TIMEOUT_MS);
    pendingCommands.set(corrId, {
      resolve(resp) {
        clearTimeout(timer);
        resolve(resp);
      }
    });
    state.ws.send(payload);
  });
}

async function ensureChatStarted() {
  if (nativeDriverAvailable()) {
    const chat = await ensureNativeChatApi();
    if (!chat.started) {
      await chat.startChat().catch((err) => {
        state.transportStatus = 'degraded';
        state.transportError = err && err.message ? err.message : 'Could not start simplex-chat native driver';
        throw err;
      });
    }
    state.transportStatus = 'connected';
    state.transportError = '';
    return;
  }
  const resp = await sendCommand('/_start').catch((err) => {
    state.transportStatus = 'degraded';
    state.transportError = err.message;
    throw err;
  });
  if (resp.type !== 'chatStarted' && resp.type !== 'chatRunning') {
    throw new Error(`Unexpected start response: ${resp.type || 'unknown'}`);
  }
}

async function listUsers() {
  if (nativeDriverAvailable()) {
    const chat = await ensureNativeChatApi();
    return (await chat.apiListUsers()).map((item) => (item && item.user ? item.user : item)).filter(Boolean);
  }
  const resp = await sendCommand('/users');
  if (resp.type === 'usersList' && Array.isArray(resp.users)) {
    return resp.users.map((item) => (item && item.user ? item.user : item)).filter(Boolean);
  }
  if (resp.type === 'chatCmdError') throw new Error(resp.chatError && resp.chatError.type ? resp.chatError.type : 'users_error');
  return [];
}

async function showActiveUser() {
  if (nativeDriverAvailable()) {
    const chat = await ensureNativeChatApi();
    return chat.apiGetActiveUser();
  }
  const resp = await sendCommand('/user');
  if (resp.type === 'activeUser' && resp.user) return resp.user;
  if (resp.type === 'chatCmdError') {
    const type = resp.chatError && resp.chatError.type ? resp.chatError.type : 'noActiveUser';
    if (type === 'noActiveUser') return null;
    throw new Error(type);
  }
  return null;
}

async function setActiveUser(userId) {
  if (nativeDriverAvailable()) {
    const chat = await ensureNativeChatApi();
    const user = await chat.apiSetActiveUser(Number(userId));
    state.activeUserId = String(user.userId);
    metaSet('last_active_user_id', state.activeUserId);
    return user;
  }
  const resp = await sendCommand(`/_user ${userId}`);
  if (resp.type !== 'activeUser' || !resp.user) {
    throw new Error(`Could not set active user: ${resp.type || 'unknown'}`);
  }
  state.activeUserId = String(resp.user.userId);
  metaSet('last_active_user_id', state.activeUserId);
  return resp.user;
}

async function createUser(profile) {
  const displayName = String((profile && profile.displayName) || '').trim() || `secure-chat-${Date.now()}`;
  if (nativeDriverAvailable()) {
    const chat = await ensureNativeChatApi();
    const simplex = state.nativeSimplex || loadNativeSimplexModule();
    const created = await chat.apiCreateActiveUser({
      displayName,
      fullName: String((profile && profile.fullName) || ''),
      peerType: profile && profile.peerType === 'bot' && simplex && simplex.T && simplex.T.ChatPeerType
        ? simplex.T.ChatPeerType.Bot
        : undefined
    });
    state.activeUserId = String(created.userId);
    metaSet('last_active_user_id', state.activeUserId);
    return created;
  }
  const command = profile && profile.peerType === 'bot'
    ? `/create bot ${displayName}`
    : `/create user ${displayName}`;
  const resp = await sendCommand(command);
  if (resp.type !== 'activeUser' || !resp.user) {
    throw new Error(`Could not create user: ${resp.type || 'unknown'}`);
  }
  state.activeUserId = String(resp.user.userId);
  return resp.user;
}

function isMissingUserContactLinkError(resp) {
  return !!(
    resp &&
    resp.type === 'chatCmdError' &&
    resp.chatError &&
    resp.chatError.type === 'errorStore' &&
    resp.chatError.storeError &&
    resp.chatError.storeError.type === 'userContactLinkNotFound'
  );
}

async function enableOwnerAddress(userId) {
  if (nativeDriverAvailable()) {
    const chat = await ensureNativeChatApi();
    let address = await chat.apiGetUserAddress(Number(userId));
    if (!address) {
      await chat.apiCreateUserAddress(Number(userId));
      address = await chat.apiGetUserAddress(Number(userId));
    }
    if (!address) {
      throw new Error('Could not load owner contact address');
    }
    await chat.apiSetAddressSettings(Number(userId), {
      autoAccept: true,
      businessAddress: false
    });
    return address;
  }
  // SimpleX v6.5 can provision direct invitations without a user contact link.
  // On fresh bot profiles these address-management commands return
  // userContactLinkNotFound, which is non-fatal for the bridge flow.
  const addressResp = await sendCommand(`/_profile_address ${userId} on`);
  if (isMissingUserContactLinkError(addressResp)) {
    return;
  }
  if (addressResp && addressResp.type === 'chatCmdError') {
    throw new Error(`Could not enable owner profile address: ${addressResp.chatError && addressResp.chatError.type ? addressResp.chatError.type : 'chatCmdError'}`);
  }
  const settingsResp = await sendCommand(`/_address_settings ${userId} ${JSON.stringify({
    businessAddress: false,
    autoAccept: { acceptIncognito: true }
  })}`);
  if (isMissingUserContactLinkError(settingsResp)) {
    return;
  }
  if (settingsResp && settingsResp.type === 'chatCmdError') {
    throw new Error(`Could not configure owner address settings: ${settingsResp.chatError && settingsResp.chatError.type ? settingsResp.chatError.type : 'chatCmdError'}`);
  }
}

async function ensureOwnerUser() {
  const users = await listUsers();
  if (state.ownerUserId) {
    const existing = users.find((user) => String(user.userId) === String(state.ownerUserId));
    if (existing) {
      await setActiveUser(existing.userId);
      await ensureChatStarted();
      await enableOwnerAddress(existing.userId);
      return existing;
    }
  }

  const active = await showActiveUser();
  if (active) {
    state.ownerUserId = String(active.userId);
    metaSet('owner_user_id', state.ownerUserId);
    await ensureChatStarted();
    await enableOwnerAddress(active.userId);
    return active;
  }

  const created = await createUser({
    displayName: `${SITE_TITLE} Secure Chat`,
    fullName: `${SITE_TITLE} Secure Chat`,
    shortDescr: 'Website secure chat bridge',
    peerType: 'bot'
  });
  state.ownerUserId = String(created.userId);
  metaSet('owner_user_id', state.ownerUserId);
  await ensureChatStarted();
  await enableOwnerAddress(created.userId);
  return created;
}

async function ensureBridgeUser(npub) {
  const row = selectContactByNpubStmt.get(npub);
  const users = await listUsers();
  if (row && row.bridge_user_id) {
    const existing = users.find((user) => String(user.userId) === String(row.bridge_user_id));
    if (existing) {
      return existing;
    }
  }
  const short = npub.slice(0, 20);
  const created = await createUser({
    displayName: `nostr-${short}`,
    fullName: `Nostr Visitor ${short}`,
    shortDescr: 'Secure chat website bridge'
  });
  return created;
}

async function listContacts(userId) {
  if (nativeDriverAvailable()) {
    const chat = await ensureNativeChatApi();
    return chat.apiListContacts(Number(userId));
  }
  const resp = await sendCommand(`/_contacts ${userId}`);
  if (resp.type === 'contactsList' && Array.isArray(resp.contacts)) {
    return resp.contacts;
  }
  throw new Error(`Could not list contacts: ${resp.type || 'unknown'}`);
}

function diffContactIds(before, after) {
  const known = new Set(before.map((item) => String(item.contactId)));
  return after.filter((item) => !known.has(String(item.contactId)));
}

async function createInvitation(ownerUserId) {
  const resp = await sendCommand(`/_connect ${ownerUserId}`);
  if (resp.type !== 'invitation' || !resp.connLinkInvitation || !resp.connLinkInvitation.connFullLink) {
    throw new Error(`Could not create owner invitation: ${resp.type || 'unknown'}`);
  }
  return String(resp.connLinkInvitation.connFullLink);
}

async function ownerAddressLink(ownerUserId) {
  if (nativeDriverAvailable()) {
    const address = await enableOwnerAddress(ownerUserId);
    const connLink = address && address.connLinkContact ? address.connLinkContact : null;
    if (!connLink || (!connLink.connFullLink && !connLink.connShortLink)) {
      throw new Error('Could not load owner contact address');
    }
    return connLink.connShortLink || connLink.connFullLink;
  }
  return createInvitation(ownerUserId);
}

async function connectBridgeToInvitation(bridgeUserId, link) {
  const resp = await sendCommand(`/_connect ${bridgeUserId} ${link}`);
  if (resp.type === 'sentConfirmation' || resp.type === 'sentInvitation' || resp.type === 'contactAlreadyExists') {
    return resp;
  }
  throw new Error(`Could not connect bridge profile: ${resp.type || 'unknown'}`);
}

async function connectBridgeToOwnerAddress(bridgeUserId, link) {
  if (nativeDriverAvailable()) {
    const chat = await ensureNativeChatApi();
    const [plan, preparedLink] = await chat.apiConnectPlan(Number(bridgeUserId), String(link));
    if (!plan || !preparedLink) {
      throw new Error('Could not prepare owner contact address');
    }
    return chat.apiConnect(Number(bridgeUserId), false, preparedLink);
  }
  return connectBridgeToInvitation(bridgeUserId, link);
}

async function waitForProvisionedContacts(ownerUserId, bridgeUserId, ownerBefore, bridgeBefore) {
  const started = Date.now();
  while ((Date.now() - started) < PROVISION_TIMEOUT_MS) {
    const ownerAfter = await listContacts(ownerUserId);
    const bridgeAfter = await listContacts(bridgeUserId);
    const ownerNew = diffContactIds(ownerBefore, ownerAfter);
    const bridgeNew = diffContactIds(bridgeBefore, bridgeAfter);
    if (ownerNew.length > 0 && bridgeNew.length > 0) {
      return {
        ownerContactId: String(ownerNew[0].contactId),
        bridgeContactId: String(bridgeNew[0].contactId)
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error('Timed out waiting for SimpleX contacts to provision');
}

async function provisionContact(npub) {
  const cached = contactRowToJson(selectContactByNpubStmt.get(npub));
  if (cached && cached.status === 'active' && cached.simplex_contact_id && cached.bridge_user_id && cached.bridge_contact_id) {
    return cached;
  }
  if (provisionLocks.has(npub)) {
    return provisionLocks.get(npub);
  }
  const promise = withLock(async () => {
    const owner = await ensureOwnerUser();
    const ownerUserId = String(owner.userId);
    const bridgeUser = await ensureBridgeUser(npub);
    const bridgeUserId = String(bridgeUser.userId);

    await setActiveUser(ownerUserId);
    const ownerBefore = await listContacts(ownerUserId);
    const bridgeBefore = await listContacts(bridgeUserId);
    const link = await ownerAddressLink(ownerUserId);
    await setActiveUser(bridgeUserId);
    await connectBridgeToOwnerAddress(bridgeUserId, link);
    const ids = await waitForProvisionedContacts(ownerUserId, bridgeUserId, ownerBefore, bridgeBefore);
    await setActiveUser(ownerUserId);

    upsertContactStmt.run(
      npub,
      ids.ownerContactId,
      bridgeUserId,
      ids.bridgeContactId,
      'active',
      nowIso(),
      nowIso(),
      nowIso()
    );
    return contactRowToJson(selectContactByNpubStmt.get(npub));
  }).catch((err) => {
    updateContactStatusStmt.run('error', nowIso(), null, err.message, npub);
    throw err;
  }).finally(() => {
    provisionLocks.delete(npub);
  });
  provisionLocks.set(npub, promise);
  return promise;
}

async function ensureMappingForPubkey(pubkeyHex) {
  const npub = pubkeyToNpub(pubkeyHex);
  const mapping = await provisionContact(npub);
  return { npub, mapping };
}

async function sendComposedMessages(activeUserId, chatRef, composedMessages) {
  await setActiveUser(activeUserId);
  if (nativeDriverAvailable()) {
    const chat = await ensureNativeChatApi();
    const simplex = state.nativeSimplex || loadNativeSimplexModule();
    const contactId = Number(String(chatRef || '').replace(/^@/, ''));
    if (!Number.isFinite(contactId) || contactId <= 0) {
      throw new Error(`Invalid direct chat reference: ${chatRef}`);
    }
    return chat.apiSendMessages([simplex.T.ChatType.Direct, contactId], composedMessages);
  }
  const resp = await sendCommand(`/_send ${chatRef} json ${JSON.stringify(composedMessages)}`);
  if (resp.type !== 'newChatItems' || !Array.isArray(resp.chatItems)) {
    throw new Error(`Unexpected send response: ${resp.type || 'unknown'}`);
  }
  return resp.chatItems;
}

async function sendTextMessage(pubkeyHex, text) {
  const { npub, mapping } = await ensureMappingForPubkey(pubkeyHex);
  const createdAt = nowIso();
  const seq = insertMessage({
    npub,
    simplex_contact_id: mapping.simplex_contact_id,
    bridge_user_id: mapping.bridge_user_id,
    bridge_contact_id: mapping.bridge_contact_id,
    direction: 'outgoing',
    message_ref: '',
    message_kind: 'text',
    delivery_status: 'sending',
    created_at: createdAt,
    updated_at: createdAt,
    attachment_name: '',
    attachment_mime: '',
    attachment_size: null,
    upload_id: '',
    error_code: '',
    error_detail: ''
  });
  rememberMessageText(seq, text, null);
  const chatItems = await sendComposedMessages(mapping.bridge_user_id, `@${mapping.bridge_contact_id}`, [{
    msgContent: { type: 'text', text: String(text || '') },
    mentions: {}
  }]);
  const first = chatItems[0] && chatItems[0].chatItem ? chatItems[0].chatItem : null;
  const messageRef = first && first.meta && first.meta.itemId != null ? String(first.meta.itemId) : '';
  updateMessageBySeq(seq, {
    message_ref: messageRef,
    delivery_status: first ? deliveryStatusFromChatItem(first) : 'sent'
  });
  return { npub, seq };
}

function queueUploadTicket(pubkeyHex, attachment) {
  const npub = pubkeyToNpub(pubkeyHex);
  const uploadId = `upl-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const item = {
    uploadId,
    npub,
    name: sanitizeName(attachment.name || attachment.filename || 'attachment.bin'),
    size: Number(attachment.size || 0),
    mime: String(attachment.mime || 'application/octet-stream'),
    status: 'waiting',
    createdAt: nowIso(),
    error: ''
  };
  uploads.set(uploadId, item);
  return item;
}

async function sendAttachmentMetadata(pubkeyHex, ticket) {
  const descriptor = `Attachment: ${ticket.name} (${ticket.size} bytes, ${ticket.mime})`;
  await sendTextMessage(pubkeyHex, descriptor);
}

async function sendFileMessage(pubkeyHex, uploadId, filePath, mimeType, fileSize, fileName) {
  const { npub, mapping } = await ensureMappingForPubkey(pubkeyHex);
  const createdAt = nowIso();
  const seq = insertMessage({
    npub,
    simplex_contact_id: mapping.simplex_contact_id,
    bridge_user_id: mapping.bridge_user_id,
    bridge_contact_id: mapping.bridge_contact_id,
    direction: 'outgoing',
    message_ref: '',
    message_kind: 'file',
    delivery_status: 'uploading',
    created_at: createdAt,
    updated_at: createdAt,
    attachment_name: fileName,
    attachment_mime: mimeType,
    attachment_size: fileSize,
    upload_id: uploadId,
    error_code: '',
    error_detail: ''
  });
  rememberMessageText(seq, '', { name: fileName, size: fileSize });
  const chatItems = await sendComposedMessages(mapping.bridge_user_id, `@${mapping.bridge_contact_id}`, [{
    fileSource: { filePath },
    msgContent: { type: 'file', text: fileName },
    mentions: {}
  }]);
  const first = chatItems[0] && chatItems[0].chatItem ? chatItems[0].chatItem : null;
  const messageRef = first && first.meta && first.meta.itemId != null ? String(first.meta.itemId) : '';
  updateMessageBySeq(seq, {
    message_ref: messageRef,
    delivery_status: first ? deliveryStatusFromChatItem(first) : 'sent'
  });
  return { npub, seq };
}

function currentServiceStatus() {
  return {
    started_at: state.startedAt,
    driver_type: state.driverType,
    transport_status: state.transportStatus,
    transport_error: state.transportError,
    ws_connected: state.wsConnected,
    simplex_binary: SIMPLEX_BINARY,
    simplex_ws_port: SIMPLEX_WS_PORT,
    owner_user_id: state.ownerUserId || '',
    max_upload_bytes: MAX_UPLOAD_BYTES
  };
}

async function ensureRuntime() {
  try {
    await ensureOwnerUser();
    state.transportStatus = 'connected';
    state.transportError = '';
  } catch (err) {
    state.transportStatus = 'degraded';
    state.transportError = err && err.message ? err.message : 'Secure Chat transport unavailable';
  }
}

function statePayload(pubkeyHex, sinceSeq, admin) {
  const npub = pubkeyToNpub(pubkeyHex);
  const mapping = contactRowToJson(selectContactByNpubStmt.get(npub));
  const limit = 100;
  const rows = sinceSeq > 0
    ? selectMessagesSinceStmt.all(npub, Number(sinceSeq), limit)
    : selectRecentMessagesStmt.all(npub, limit).reverse();
  const tickets = Array.from(uploads.values())
    .filter((item) => item.npub === npub)
    .map((item) => ({
      upload_id: item.uploadId,
      name: item.name,
      size: item.size,
      mime: item.mime,
      status: item.status,
      created_at: item.createdAt,
      error: item.error
    }));
  const payload = {
    success: true,
    npub,
    service: currentServiceStatus(),
    mapping,
    messages: rows.map(mapMessageRow),
    uploads: tickets
  };
  if (admin) {
    payload.admin = {
      mappings: selectMappingsStmt.all(200).map(contactRowToJson)
    };
  }
  return payload;
}

async function handleState(req, res) {
  const body = await parseJsonBody(req);
  const pubkeyHex = String(body.sessionPubkey || '').trim().toLowerCase();
  const sinceSeq = Number(body.sinceSeq || 0);
  const admin = body.admin === true;
  safeJson(res, 200, statePayload(pubkeyHex, sinceSeq, admin));
}

async function handleSend(req, res) {
  const body = await parseJsonBody(req);
  const pubkeyHex = String(body.sessionPubkey || '').trim().toLowerCase();
  const text = String(body.text || '');
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (!pubkeyHex) {
    safeJson(res, 400, { success: false, error: 'sessionPubkey is required' });
    return;
  }
  await ensureRuntime();
  const tickets = [];
  if (text.trim()) {
    await sendTextMessage(pubkeyHex, text);
  }
  for (const attachment of attachments) {
    const ticket = queueUploadTicket(pubkeyHex, attachment || {});
    tickets.push(ticket);
    await sendAttachmentMetadata(pubkeyHex, ticket);
  }
  safeJson(res, 200, {
    success: true,
    uploads: tickets.map((item) => ({
      upload_id: item.uploadId,
      name: item.name,
      size: item.size,
      mime: item.mime,
      status: item.status
    }))
  });
}

async function handleUpload(req, res) {
  const uploadId = String(req.headers['x-upload-id'] || '').trim();
  const pubkeyHex = String(req.headers['x-session-pubkey'] || '').trim().toLowerCase();
  const mimeType = String(req.headers['content-type'] || 'application/octet-stream').trim().toLowerCase();
  const rawName = String(req.headers['x-file-name'] || 'attachment.bin');
  const safeName = sanitizeName(rawName);
  const lengthHeader = Number(req.headers['content-length'] || 0);
  const ticket = uploads.get(uploadId);
  if (!uploadId || !ticket || !pubkeyHex) {
    safeJson(res, 400, { success: false, error: 'Invalid upload ticket' });
    return;
  }
  if (ticket.npub !== pubkeyToNpub(pubkeyHex)) {
    safeJson(res, 403, { success: false, error: 'Upload ticket does not match session' });
    return;
  }
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType)) {
    ticket.status = 'failed';
    ticket.error = 'mime_invalid';
    safeJson(res, 400, { success: false, error: 'Invalid MIME type' });
    return;
  }
  if (lengthHeader > MAX_UPLOAD_BYTES) {
    ticket.status = 'failed';
    ticket.error = 'too_large';
    safeJson(res, 413, { success: false, error: 'Upload exceeds server size limit' });
    return;
  }
  const diskPath = path.join(UPLOADS_DIR, `${uploadId}-${safeName}`);
  ticket.status = 'uploading';
  let received = 0;
  req.on('data', (chunk) => {
    received += chunk.length;
    if (received > MAX_UPLOAD_BYTES) {
      req.destroy(new Error('Upload exceeds server size limit'));
    }
  });
  try {
    await pipeline(req, fs.createWriteStream(diskPath, { flags: 'w', mode: 0o600 }));
    ticket.status = 'processing';
    ticket.size = received;
    await ensureRuntime();
    await sendFileMessage(pubkeyHex, uploadId, diskPath, mimeType, received, safeName);
    ticket.status = 'complete';
    safeJson(res, 200, { success: true, upload_id: uploadId, bytes_received: received });
  } catch (err) {
    ticket.status = 'failed';
    ticket.error = err && err.message ? err.message : 'upload_failed';
    safeJson(res, 500, { success: false, error: ticket.error });
  }
}

async function handleAdmin(req, res) {
  const body = await parseJsonBody(req);
  const action = String(body.action || 'list').trim().toLowerCase();
  if (action === 'deactivate') {
    updateContactStatusStmt.run('inactive', nowIso(), nowIso(), '', String(body.npub || ''));
  } else if (action === 'delete') {
    deleteContact(String(body.npub || ''));
  } else if (action === 'status') {
    await ensureRuntime();
  }
  safeJson(res, 200, {
    success: true,
    service: currentServiceStatus(),
    mappings: selectMappingsStmt.all(200).map(contactRowToJson)
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = (req.url || '').split('?')[0];
    if (req.method === 'GET' && pathname === '/health') {
      await ensureRuntime();
      safeJson(res, 200, { success: true, service: currentServiceStatus() });
      return;
    }
    if (req.method === 'POST' && pathname === '/state') {
      await handleState(req, res);
      return;
    }
    if (req.method === 'POST' && pathname === '/send') {
      await handleSend(req, res);
      return;
    }
    if (req.method === 'POST' && pathname === '/upload') {
      await handleUpload(req, res);
      return;
    }
    if (req.method === 'POST' && pathname === '/admin') {
      await handleAdmin(req, res);
      return;
    }
    safeJson(res, 404, { success: false, error: 'Not found' });
  } catch (err) {
    logEvent('request_error', { error: err && err.message ? err.message : String(err) });
    safeJson(res, 500, { success: false, error: err && err.message ? err.message : 'Internal error' });
  }
});

server.listen(SOCKET_PATH, async () => {
  await fsp.chmod(SOCKET_PATH, 0o600).catch(() => undefined);
  logEvent('service_started', { socket: SOCKET_PATH, port: SIMPLEX_WS_PORT });
  await ensureRuntime();
});

process.on('SIGINT', () => {
  stopSimplexChild();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopSimplexChild();
  process.exit(0);
});
process.on('exit', () => {
  stopSimplexChild();
  try { fs.unlinkSync(SOCKET_PATH); } catch (_err) {}
});
