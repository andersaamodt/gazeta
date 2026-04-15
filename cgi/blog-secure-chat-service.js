#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.SECURE_CHAT_DB_PATH || '';
const SOCKET_PATH = process.env.SECURE_CHAT_SOCKET_PATH || '';
const UPLOADS_DIR = process.env.SECURE_CHAT_UPLOADS_DIR || '';
const DOWNLOADS_DIR = process.env.SECURE_CHAT_DOWNLOADS_DIR || '';
const SIMPLEX_BINARY = process.env.SECURE_CHAT_SIMPLEX_BINARY || 'simplex-chat';
const SIMPLEX_WS_PORT = Number(process.env.SECURE_CHAT_SIMPLEX_WS_PORT || 0);
const SITE_TITLE = String(process.env.SECURE_CHAT_SITE_TITLE || 'Secure Chat');
const MAX_UPLOAD_BYTES = Number(process.env.SECURE_CHAT_MAX_UPLOAD_BYTES || 25 * 1024 * 1024);
const MESSAGE_CACHE_LIMIT = 500;
const COMMAND_TIMEOUT_MS = 30000;
const PROVISION_TIMEOUT_MS = 30000;

if (!DB_PATH || !SOCKET_PATH || !UPLOADS_DIR || !DOWNLOADS_DIR || !SIMPLEX_WS_PORT) {
  process.stderr.write('Missing Secure Chat service environment.\n');
  process.exit(1);
}

for (const dir of [path.dirname(DB_PATH), path.dirname(SOCKET_PATH), UPLOADS_DIR, DOWNLOADS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

try {
  fs.unlinkSync(SOCKET_PATH);
} catch (_err) {
  // ignore stale sockets
}

const db = new DatabaseSync(DB_PATH);
db.exec(`
CREATE TABLE IF NOT EXISTS secure_chat_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS secure_chat_contacts (
  npub TEXT PRIMARY KEY,
  simplex_contact_id TEXT UNIQUE,
  bridge_user_id TEXT UNIQUE,
  bridge_contact_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'provisioning',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deactivated_at TEXT,
  last_provisioned_at TEXT,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS secure_chat_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  npub TEXT NOT NULL,
  simplex_contact_id TEXT,
  bridge_user_id TEXT,
  bridge_contact_id TEXT,
  direction TEXT NOT NULL,
  message_ref TEXT,
  message_kind TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  attachment_name TEXT,
  attachment_mime TEXT,
  attachment_size INTEGER,
  upload_id TEXT,
  error_code TEXT,
  error_detail TEXT
);
CREATE INDEX IF NOT EXISTS secure_chat_messages_npub_seq_idx
  ON secure_chat_messages(npub, seq);
`);

const insertMessageStmt = db.prepare(`
  INSERT INTO secure_chat_messages (
    npub, simplex_contact_id, bridge_user_id, bridge_contact_id, direction, message_ref,
    message_kind, delivery_status, created_at, updated_at, attachment_name,
    attachment_mime, attachment_size, upload_id, error_code, error_detail
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateMessageBySeqStmt = db.prepare(`
  UPDATE secure_chat_messages
     SET message_ref = COALESCE(?, message_ref),
         delivery_status = COALESCE(?, delivery_status),
         updated_at = ?,
         error_code = COALESCE(?, error_code),
         error_detail = COALESCE(?, error_detail)
   WHERE seq = ?
`);

const updateMessageByRefStmt = db.prepare(`
  UPDATE secure_chat_messages
     SET delivery_status = COALESCE(?, delivery_status),
         updated_at = ?,
         error_code = COALESCE(?, error_code),
         error_detail = COALESCE(?, error_detail)
   WHERE message_ref = ?
`);

const upsertContactStmt = db.prepare(`
  INSERT INTO secure_chat_contacts (
    npub, simplex_contact_id, bridge_user_id, bridge_contact_id, status,
    created_at, updated_at, deactivated_at, last_provisioned_at, last_error
  ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)
  ON CONFLICT(npub) DO UPDATE SET
    simplex_contact_id = excluded.simplex_contact_id,
    bridge_user_id = excluded.bridge_user_id,
    bridge_contact_id = excluded.bridge_contact_id,
    status = excluded.status,
    updated_at = excluded.updated_at,
    deactivated_at = NULL,
    last_provisioned_at = excluded.last_provisioned_at,
    last_error = NULL
`);

const updateContactStatusStmt = db.prepare(`
  UPDATE secure_chat_contacts
     SET status = ?,
         updated_at = ?,
         deactivated_at = ?,
         last_error = ?
   WHERE npub = ?
`);

const selectContactByNpubStmt = db.prepare(`
  SELECT npub, simplex_contact_id, bridge_user_id, bridge_contact_id, status,
         created_at, updated_at, deactivated_at, last_provisioned_at, last_error
    FROM secure_chat_contacts
   WHERE npub = ?
   LIMIT 1
`);

const selectContactByBridgeUserStmt = db.prepare(`
  SELECT npub, simplex_contact_id, bridge_user_id, bridge_contact_id, status,
         created_at, updated_at, deactivated_at, last_provisioned_at, last_error
    FROM secure_chat_contacts
   WHERE bridge_user_id = ?
   LIMIT 1
`);

const selectContactByOwnerContactStmt = db.prepare(`
  SELECT npub, simplex_contact_id, bridge_user_id, bridge_contact_id, status,
         created_at, updated_at, deactivated_at, last_provisioned_at, last_error
    FROM secure_chat_contacts
   WHERE simplex_contact_id = ?
   LIMIT 1
`);

const selectContactByBridgeContactStmt = db.prepare(`
  SELECT npub, simplex_contact_id, bridge_user_id, bridge_contact_id, status,
         created_at, updated_at, deactivated_at, last_provisioned_at, last_error
    FROM secure_chat_contacts
   WHERE bridge_contact_id = ?
   LIMIT 1
`);

const selectMappingsStmt = db.prepare(`
  SELECT npub, simplex_contact_id, bridge_user_id, bridge_contact_id, status,
         created_at, updated_at, deactivated_at, last_provisioned_at, last_error
    FROM secure_chat_contacts
   ORDER BY updated_at DESC
   LIMIT ?
`);

const selectMessagesSinceStmt = db.prepare(`
  SELECT seq, npub, simplex_contact_id, bridge_user_id, bridge_contact_id,
         direction, message_ref, message_kind, delivery_status,
         created_at, updated_at, attachment_name, attachment_mime,
         attachment_size, upload_id, error_code, error_detail
    FROM secure_chat_messages
   WHERE npub = ? AND seq > ?
   ORDER BY seq ASC
   LIMIT ?
`);

const selectRecentMessagesStmt = db.prepare(`
  SELECT seq, npub, simplex_contact_id, bridge_user_id, bridge_contact_id,
         direction, message_ref, message_kind, delivery_status,
         created_at, updated_at, attachment_name, attachment_mime,
         attachment_size, upload_id, error_code, error_detail
    FROM secure_chat_messages
   WHERE npub = ?
   ORDER BY seq DESC
   LIMIT ?
`);

const metaGetStmt = db.prepare('SELECT value FROM secure_chat_meta WHERE key = ? LIMIT 1');
const metaSetStmt = db.prepare(`
  INSERT INTO secure_chat_meta (key, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

function nowIso() {
  return new Date().toISOString();
}

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
  const row = metaGetStmt.get(String(key));
  return row ? String(row.value) : '';
}

function metaSet(key, value) {
  metaSetStmt.run(String(key), String(value), nowIso());
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
  const result = insertMessageStmt.run(
    row.npub,
    row.simplex_contact_id || null,
    row.bridge_user_id || null,
    row.bridge_contact_id || null,
    row.direction,
    row.message_ref || null,
    row.message_kind,
    row.delivery_status,
    row.created_at,
    row.updated_at,
    row.attachment_name || null,
    row.attachment_mime || null,
    row.attachment_size == null ? null : Number(row.attachment_size),
    row.upload_id || null,
    row.error_code || null,
    row.error_detail || null
  );
  return Number(result.lastInsertRowid);
}

function setMessageStatusByRef(messageRef, deliveryStatus, errorCode, errorDetail) {
  if (!messageRef) return;
  updateMessageByRefStmt.run(
    deliveryStatus || null,
    nowIso(),
    errorCode || null,
    errorDetail || null,
    String(messageRef)
  );
}

function updateMessageBySeq(seq, fields) {
  updateMessageBySeqStmt.run(
    fields.message_ref || null,
    fields.delivery_status || null,
    nowIso(),
    fields.error_code || null,
    fields.error_detail || null,
    Number(seq)
  );
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
  return state.ws && state.ws.readyState === WebSocket.OPEN;
}

function startSimplexChild() {
  if (state.simplexProcess && !state.simplexProcess.killed) return;
  if (!fs.existsSync(SIMPLEX_BINARY) && !process.env.PATH) {
    state.transportStatus = 'degraded';
    state.transportError = 'simplex-chat binary is not installed';
    return;
  }
  const dbPrefix = path.join(path.dirname(DB_PATH), 'simplex-bridge');
  try {
    state.simplexProcess = spawn(SIMPLEX_BINARY, ['-p', String(SIMPLEX_WS_PORT), '-d', dbPrefix], {
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
  if (isWebSocketOpen()) {
    return Promise.resolve();
  }
  startSimplexChild();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${SIMPLEX_WS_PORT}`);
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
  await ensureWsConnection();
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
  const resp = await sendCommand('/users');
  if (resp.type === 'usersList' && Array.isArray(resp.users)) return resp.users;
  if (resp.type === 'chatCmdError') throw new Error(resp.chatError && resp.chatError.type ? resp.chatError.type : 'users_error');
  return [];
}

async function showActiveUser() {
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
  const resp = await sendCommand(`/_user ${userId}`);
  if (resp.type !== 'activeUser' || !resp.user) {
    throw new Error(`Could not set active user: ${resp.type || 'unknown'}`);
  }
  state.activeUserId = String(resp.user.userId);
  metaSet('last_active_user_id', state.activeUserId);
  return resp.user;
}

async function createUser(profile) {
  const newUser = {
    profile,
    pastTimestamp: false,
    userChatRelay: false
  };
  const resp = await sendCommand(`/_create user ${JSON.stringify(newUser)}`);
  if (resp.type !== 'activeUser' || !resp.user) {
    throw new Error(`Could not create user: ${resp.type || 'unknown'}`);
  }
  state.activeUserId = String(resp.user.userId);
  return resp.user;
}

async function enableOwnerAddress(userId) {
  await sendCommand(`/_profile_address ${userId} on`);
  await sendCommand(`/_address_settings ${userId} ${JSON.stringify({
    businessAddress: false,
    autoAccept: { acceptIncognito: true }
  })}`);
}

async function ensureOwnerUser() {
  await ensureChatStarted();
  const users = await listUsers();
  if (state.ownerUserId) {
    const existing = users.find((user) => String(user.userId) === String(state.ownerUserId));
    if (existing) {
      await setActiveUser(existing.userId);
      return existing;
    }
  }

  const active = await showActiveUser();
  if (active) {
    state.ownerUserId = String(active.userId);
    metaSet('owner_user_id', state.ownerUserId);
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
    shortDescr: 'Secure chat website bridge',
    peerType: 'bot'
  });
  return created;
}

async function listContacts(userId) {
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

async function connectBridgeToInvitation(bridgeUserId, link) {
  const resp = await sendCommand(`/_connect ${bridgeUserId} ${link}`);
  if (resp.type === 'sentConfirmation' || resp.type === 'sentInvitation' || resp.type === 'contactAlreadyExists') {
    return resp;
  }
  throw new Error(`Could not connect bridge profile: ${resp.type || 'unknown'}`);
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
    const invitation = await createInvitation(ownerUserId);
    await setActiveUser(bridgeUserId);
    await connectBridgeToInvitation(bridgeUserId, invitation);
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
    db.prepare('DELETE FROM secure_chat_contacts WHERE npub = ?').run(String(body.npub || ''));
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

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.on('exit', () => {
  try { fs.unlinkSync(SOCKET_PATH); } catch (_err) {}
});
