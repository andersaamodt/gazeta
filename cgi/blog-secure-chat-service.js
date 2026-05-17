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
const BROWSER_OWNER_CONTACT_LINK = String(process.env.SECURE_CHAT_BROWSER_OWNER_CONTACT_LINK || '').trim();
const MAX_UPLOAD_BYTES = Number(process.env.SECURE_CHAT_MAX_UPLOAD_BYTES || 25 * 1024 * 1024);
const ATTACHMENT_MARKER = 'simplex-web-file:v1:';
const ATTACHMENT_CHUNK_MARKER = 'simplex-web-file-chunk:v1:';
const LEGACY_SECURE_CHAT_IDENTITY_MARKER = 'simplex-web-identity:v1:';
const MAX_ATTACHMENT_DATA_URL_LENGTH = Number(process.env.SECURE_CHAT_MAX_ATTACHMENT_DATA_URL_LENGTH || 1200000);
const MESSAGE_CACHE_LIMIT = 500;
const COMMAND_TIMEOUT_MS = Number(process.env.SECURE_CHAT_COMMAND_TIMEOUT_MS || 90000);
const PROVISION_TIMEOUT_MS = Number(process.env.SECURE_CHAT_PROVISION_TIMEOUT_MS || 90000);
const RECONCILE_CHAT_ITEM_LIMIT = Number(process.env.SECURE_CHAT_RECONCILE_CHAT_ITEM_LIMIT || 100);
const RECONCILE_MIN_INTERVAL_MS = Number(process.env.SECURE_CHAT_RECONCILE_MIN_INTERVAL_MS || 1500);
const OWL_EXPORT_RECONCILE_TIMEOUT_MS = Number(process.env.SECURE_CHAT_OWL_EXPORT_RECONCILE_TIMEOUT_MS || 5000);
const SERVICE_LOG_PATH = path.join(path.dirname(SOCKET_PATH || '/tmp/service.sock'), 'service.log');
const OWL_SEND_RECEIPT_LIMIT = 1000;
const OWL_SEND_RECEIPT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

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
const OWNER_DIRECT_MESSAGES_FILE = path.join(STORE_ROOT, 'owner-direct-messages.json');
const OWL_SEND_RECEIPTS_FILE = path.join(STORE_ROOT, 'owl-send-receipts.json');

for (const dir of [STORE_ROOT, CONTACTS_DIR, MESSAGES_DIR, META_DIR, path.dirname(SOCKET_PATH), UPLOADS_DIR, DOWNLOADS_DIR, path.join(STORE_ROOT, 'simplex-tmp')]) {
  fs.mkdirSync(dir, { recursive: true });
}

try {
  fs.unlinkSync(SOCKET_PATH);
} catch (_err) {
  // ignore stale sockets
}

let cachedNativeSimplex = undefined;
let cachedNativeSimplexError = '';
let nativeSimplexDisabled = false;

function tryRequire(moduleId) {
  try {
    return require(moduleId);
  } catch (err) {
    cachedNativeSimplexError = err && err.message ? err.message : String(err || 'unknown error');
    return null;
  }
}

function loadNativeSimplexModule() {
  if (nativeSimplexDisabled) return null;
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

function disableNativeSimplexDriver(err) {
  nativeSimplexDisabled = true;
  cachedNativeSimplex = null;
  cachedNativeSimplexError = err && err.message ? err.message : String(err || 'native simplex-chat driver failed');
  logEvent('native_driver_disabled', {
    error: errorDetail(err)
  });
  state.nativeSimplex = null;
  state.nativeChat = null;
  state.driverType = 'unknown';
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

function optionalNpub(npub) {
  try {
    return npub ? validateNpub(npub) : '';
  } catch (_err) {
    return '';
  }
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
    last_error: row.last_error || '',
    bridge_display_name: row.bridge_display_name == null ? '' : String(row.bridge_display_name),
    bridge_full_name: row.bridge_full_name == null ? '' : String(row.bridge_full_name)
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
    text: row.text == null ? '' : String(row.text),
    attachment_name: row.attachment_name == null ? '' : String(row.attachment_name),
    attachment_mime: row.attachment_mime == null ? '' : String(row.attachment_mime),
    attachment_size: row.attachment_size == null || row.attachment_size === '' ? null : Number(row.attachment_size),
    attachment_path: row.attachment_path == null ? '' : String(row.attachment_path),
    upload_id: row.upload_id == null ? '' : String(row.upload_id),
    error_code: row.error_code == null ? '' : String(row.error_code),
    error_detail: row.error_detail == null ? '' : String(row.error_detail)
  };
}

function normalizeOwnerDirectMessageRow(row) {
  if (!row || typeof row !== 'object') return null;
  const seq = Number(row.seq);
  if (!Number.isFinite(seq) || seq <= 0) return null;
  const contactId = String(row.contact_id || '').trim();
  const messageRef = String(row.message_ref || '').trim();
  if (!contactId || !messageRef) return null;
  return {
    seq,
    contact_id: contactId,
    thread_id: String(row.thread_id || `secure-chat-contact-${contactId}`),
    npub: optionalNpub(row.npub),
    contact_name: sanitizeSimplexDisplayName(row.contact_name || '', `SimpleX ${contactId}`),
    message_ref: messageRef,
    message_kind: String(row.message_kind || 'text'),
    direction: String(row.direction || 'incoming'),
    delivery_status: String(row.delivery_status || 'received'),
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
    text: row.text == null ? '' : String(row.text),
    attachment_name: row.attachment_name == null ? '' : String(row.attachment_name),
    attachment_mime: row.attachment_mime == null ? '' : String(row.attachment_mime),
    attachment_size: row.attachment_size == null || row.attachment_size === '' ? null : Number(row.attachment_size),
    attachment_path: row.attachment_path == null ? '' : String(row.attachment_path),
    attachment_data_url: row.attachment_data_url == null ? '' : String(row.attachment_data_url),
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

function loadOwnerDirectMessages() {
  const rows = readJsonFileSync(OWNER_DIRECT_MESSAGES_FILE, []);
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeOwnerDirectMessageRow)
    .filter(Boolean)
    .sort((a, b) => a.seq - b.seq);
}

function saveOwnerDirectMessages(rows) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map(normalizeOwnerDirectMessageRow)
    .filter(Boolean)
    .sort((a, b) => a.seq - b.seq);
  writeJsonFileAtomicSync(OWNER_DIRECT_MESSAGES_FILE, normalized);
  return normalized;
}

function normalizeOwlSendClientMessageId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/[^A-Za-z0-9:._@+-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200);
}

function loadOwlSendReceipts() {
  const raw = readJsonFileSync(OWL_SEND_RECEIPTS_FILE, {});
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const cutoff = Date.now() - OWL_SEND_RECEIPT_TTL_MS;
  const rows = [];
  for (const [clientMessageId, receipt] of Object.entries(source)) {
    const id = normalizeOwlSendClientMessageId(clientMessageId);
    if (!id || !receipt || typeof receipt !== 'object') continue;
    const createdAt = String(receipt.created_at || '');
    const createdMs = Date.parse(createdAt);
    if (Number.isFinite(createdMs) && createdMs < cutoff) continue;
    rows.push([id, Object.assign({}, receipt, { client_message_id: id, created_at: createdAt || nowIso() })]);
  }
  rows.sort((a, b) => String(b[1].created_at || '').localeCompare(String(a[1].created_at || '')));
  return Object.fromEntries(rows.slice(0, OWL_SEND_RECEIPT_LIMIT));
}

function saveOwlSendReceipts(receipts) {
  const rows = Object.entries(receipts || {})
    .map(([clientMessageId, receipt]) => [normalizeOwlSendClientMessageId(clientMessageId), receipt])
    .filter(([clientMessageId, receipt]) => clientMessageId && receipt && typeof receipt === 'object')
    .sort((a, b) => String(b[1].created_at || '').localeCompare(String(a[1].created_at || '')))
    .slice(0, OWL_SEND_RECEIPT_LIMIT);
  writeJsonFileAtomicSync(OWL_SEND_RECEIPTS_FILE, Object.fromEntries(rows));
}

function getOwlSendReceipt(clientMessageId) {
  const id = normalizeOwlSendClientMessageId(clientMessageId);
  if (!id) return null;
  return loadOwlSendReceipts()[id] || null;
}

function recordOwlSendReceipt(clientMessageId, result) {
  const id = normalizeOwlSendClientMessageId(clientMessageId);
  if (!id) return null;
  const receipts = loadOwlSendReceipts();
  receipts[id] = {
    client_message_id: id,
    created_at: nowIso(),
    result: result && typeof result === 'object' ? result : {}
  };
  saveOwlSendReceipts(receipts);
  return receipts[id];
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
  run(npub, simplexContactId, bridgeUserId, bridgeContactId, status, createdAt, updatedAt, lastProvisionedAt, bridgeDisplayName, bridgeFullName) {
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
      last_error: '',
      bridge_display_name: bridgeDisplayName || '',
      bridge_full_name: bridgeFullName || ''
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

function sanitizeSimplexDisplayName(name, fallback) {
  const value = String(name || '')
    .replace(/[^A-Za-z0-9 ._-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (value || fallback).slice(0, 64);
}

function sessionDisplayNameFromBody(body) {
  return sanitizeSimplexDisplayName(body && body.sessionDisplayName, '');
}

function bridgeProfileForSession(npub, sessionDisplayName) {
  const short = String(npub || '').slice(0, 20);
  const displayName = sanitizeSimplexDisplayName(sessionDisplayName, `nostr-${short}`);
  return {
    displayName,
    fullName: displayName || `Nostr Visitor ${short}`
  };
}

function mappingBridgeDisplayMatches(mapping, sessionDisplayName) {
  const wanted = sanitizeSimplexDisplayName(sessionDisplayName, '');
  if (!wanted) return true;
  return String(mapping && mapping.bridge_display_name || '') === wanted;
}

function truncateForLog(value, maxLength) {
  const text = String(value == null ? '' : value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function chatErrorDetail(value) {
  if (!value || typeof value !== 'object') return '';
  const chatError = value.chatError ||
    (value.response && value.response.chatError) ||
    (value.type === 'chatCmdError' ? value.chatError : null);
  if (!chatError || typeof chatError !== 'object') {
    if (value.response && typeof value.response === 'object') {
      try {
        return truncateForLog(JSON.stringify(value.response), 1000);
      } catch (_err) {
        return truncateForLog(String(value.response.type || 'chatResponse'), 1000);
      }
    }
    return '';
  }
  try {
    return truncateForLog(JSON.stringify(chatError), 1000);
  } catch (_err) {
    return truncateForLog(String(chatError.type || 'chatError'), 1000);
  }
}

function errorDetail(err) {
  const detail = chatErrorDetail(err);
  if (detail) return detail;
  return truncateForLog(err && err.message ? err.message : String(err || 'unknown error'), 1000);
}

function chatCommandErrorMessage(prefix, value) {
  const detail = chatErrorDetail(value);
  return detail ? `${prefix}: ${detail}` : prefix;
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
    last_error: row.last_error || '',
    bridge_display_name: row.bridge_display_name == null ? '' : String(row.bridge_display_name),
    bridge_full_name: row.bridge_full_name == null ? '' : String(row.bridge_full_name)
  };
}

function mapMessageRow(row) {
  const extra = recentMessageText.get(Number(row.seq)) || {};
  let text = extra.text || row.text || '';
  const parsedAttachment = parseAttachmentMarker(text);
  if (parsedAttachment) {
    text = parsedAttachment.text;
  }
  let attachmentName = row.attachment_name || (parsedAttachment && parsedAttachment.attachment ? parsedAttachment.attachment.name : '');
  const attachmentMime = row.attachment_mime || (parsedAttachment && parsedAttachment.attachment ? parsedAttachment.attachment.mime : '') || mimeFromName(attachmentName);
  const attachmentSize = row.attachment_size != null ? row.attachment_size : (parsedAttachment && parsedAttachment.attachment ? parsedAttachment.attachment.size : null);
  const attachmentDataUrl = parsedAttachment && parsedAttachment.attachment
    ? parsedAttachment.attachment.data_url
    : row.attachment_data_url
      ? String(row.attachment_data_url)
    : dataUrlFromAttachmentPath(row.attachment_path, attachmentMime, attachmentSize);
  if (
    String(row.message_kind || '') === 'file' &&
    attachmentName &&
    /^upl-[^-]+-/.test(String(attachmentName)) &&
    extra.text &&
    String(extra.text || '').trim()
  ) {
    attachmentName = String(extra.text || '').trim();
  }
  return {
    seq: Number(row.seq),
    direction: String(row.direction || 'outgoing'),
    message_ref: row.message_ref == null ? '' : String(row.message_ref),
    message_kind: String(row.message_kind || 'text'),
    delivery_status: String(row.delivery_status || 'unknown'),
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
    text,
    attachment: attachmentName ? {
      name: attachmentName,
      mime: attachmentMime || '',
      size: Number(attachmentSize || 0),
      data_url: attachmentDataUrl,
      upload_id: row.upload_id || ''
    } : null,
    error_code: row.error_code || '',
    error_detail: row.error_detail || ''
  };
}

function parseAttachmentMarker(value) {
  const text = String(value || '');
  const idx = text.indexOf(ATTACHMENT_MARKER);
  if (idx < 0) return null;
  const marker = text.slice(idx + ATTACHMENT_MARKER.length).trim().split(/\s+/)[0] || '';
  const parts = marker.split(':');
  if (parts.length < 2) return null;
  try {
    const rawMeta = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = rawMeta + '='.repeat((4 - rawMeta.length % 4) % 4);
    const meta = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    const dataBase64 = String(parts[1] || '').replace(/[^A-Za-z0-9+/=]/g, '');
    const mime = String(meta.mime || 'application/octet-stream');
    const dataUrl = dataBase64 && dataBase64.length <= MAX_ATTACHMENT_DATA_URL_LENGTH
      ? `data:${mime};base64,${dataBase64}`
      : '';
    return {
      text: text.slice(0, idx).trimEnd(),
      attachment: {
        name: sanitizeName(meta.name || 'attachment.bin'),
        mime,
        size: Number(meta.size || 0) || 0,
        data_url: dataUrl
      }
    };
  } catch (_err) {
    return null;
  }
}

function stripLegacySecureChatIdentityMarker(value) {
  const text = String(value || '');
  const idx = text.indexOf(LEGACY_SECURE_CHAT_IDENTITY_MARKER);
  if (idx < 0) return text;
  const marker = text.slice(idx + LEGACY_SECURE_CHAT_IDENTITY_MARKER.length).trim().split(/\s+/)[0] || '';
  return (text.slice(0, idx) + text.slice(idx + LEGACY_SECURE_CHAT_IDENTITY_MARKER.length + marker.length)).trim();
}

function parseBase64UrlJson(value) {
  const raw = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = raw + '='.repeat((4 - raw.length % 4) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

function encodeAttachmentMarkerText(text, meta, dataBase64) {
  const metaText = Buffer.from(JSON.stringify(meta), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return String(text || '').trimEnd() + '\n\n' + ATTACHMENT_MARKER + metaText + ':' + String(dataBase64 || '');
}

function parseAttachmentChunkMarker(value) {
  const text = String(value || '');
  const idx = text.indexOf(ATTACHMENT_CHUNK_MARKER);
  if (idx < 0) return null;
  const marker = text.slice(idx + ATTACHMENT_CHUNK_MARKER.length).trim().split(/\s+/)[0] || '';
  const parts = marker.split(':');
  if (parts.length < 4) return null;
  try {
    const meta = parseBase64UrlJson(parts[0]);
    const index = Number(parts[1] || 0);
    const total = Number(parts[2] || meta.total || 0);
    const data = String(parts[3] || '').replace(/[^A-Za-z0-9+/=]/g, '');
    if (!meta || !meta.id || !Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 1 || index > total || !data) {
      return null;
    }
    return {
      text: text.slice(0, idx).trimEnd(),
      meta,
      index,
      total,
      data
    };
  } catch (_err) {
    return null;
  }
}

function mimeFromName(name) {
  const value = String(name || '').toLowerCase();
  if (/\.(apng)$/.test(value)) return 'image/apng';
  if (/\.(avif)$/.test(value)) return 'image/avif';
  if (/\.(gif)$/.test(value)) return 'image/gif';
  if (/\.(jpe?g)$/.test(value)) return 'image/jpeg';
  if (/\.(png)$/.test(value)) return 'image/png';
  if (/\.(webp)$/.test(value)) return 'image/webp';
  if (/\.(m4a)$/.test(value)) return 'audio/mp4';
  if (/\.(mp3)$/.test(value)) return 'audio/mpeg';
  if (/\.(ogg|oga)$/.test(value)) return 'audio/ogg';
  if (/\.(wav)$/.test(value)) return 'audio/wav';
  if (/\.(m4v|mp4)$/.test(value)) return 'video/mp4';
  if (/\.(webm)$/.test(value)) return 'video/webm';
  if (/\.(txt|md)$/.test(value)) return 'text/plain';
  return '';
}

function dataUrlFromAttachmentPath(filePath, mime, size) {
  const resolved = String(filePath || '');
  const bytes = Number(size || 0);
  if (!resolved || !bytes || bytes > MAX_ATTACHMENT_DATA_URL_LENGTH) return '';
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile() || stat.size > MAX_ATTACHMENT_DATA_URL_LENGTH) return '';
    const mediaType = String(mime || mimeFromName(resolved) || 'application/octet-stream');
    return `data:${mediaType};base64,${fs.readFileSync(resolved).toString('base64')}`;
  } catch (_err) {
    return '';
  }
}

function mapOwlExportRow(mapping, row) {
  const message = mapMessageRow(row);
  const text = String(message.text || '').trim();
  const attachment = message.attachment || null;
  const body = text || (attachment ? `Attachment: ${attachment.name}` : '');
  return Object.assign({}, message, {
    id: `nostr-blog-secure-chat:${row.npub}:${row.seq}`,
    npub: String(row.npub || ''),
    thread_id: String(row.npub || ''),
    contact_name: String(mapping && mapping.bridge_display_name || '').trim() || `Nostr ${String(row.npub || '').slice(0, 12)}`,
    simplex_address: mapping && mapping.simplex_contact_id ? `secure-chat:${mapping.simplex_contact_id}` : '',
    body,
    subject: 'Website Secure Chat',
    from_self: String(row.direction || '') === 'incoming',
    in_inbox: String(row.direction || '') === 'outgoing',
    source: 'nostr-blog-secure-chat'
  });
}

function mapOwnerDirectOwlExportRow(row) {
  const cleanText = stripLegacySecureChatIdentityMarker(row.text || '');
  const parsedAttachment = parseAttachmentMarker(cleanText);
  const text = parsedAttachment ? parsedAttachment.text : String(cleanText || '');
  const displayName = sanitizeSimplexDisplayName(row.contact_name || '', '');
  const attachmentName = row.attachment_name || (parsedAttachment && parsedAttachment.attachment ? parsedAttachment.attachment.name : '');
  const attachmentMime = row.attachment_mime || (parsedAttachment && parsedAttachment.attachment ? parsedAttachment.attachment.mime : '') || mimeFromName(attachmentName);
  const attachmentSize = row.attachment_size != null ? row.attachment_size : (parsedAttachment && parsedAttachment.attachment ? parsedAttachment.attachment.size : null);
  const attachmentDataUrl = parsedAttachment && parsedAttachment.attachment
    ? parsedAttachment.attachment.data_url
    : row.attachment_data_url
      ? String(row.attachment_data_url)
    : dataUrlFromAttachmentPath(row.attachment_path, attachmentMime, attachmentSize);
  const body = String(text || '').trim() || (attachmentName ? `Attachment: ${attachmentName}` : '');
  const stableThreadId = String(row.npub || '').trim() || String(row.thread_id || `secure-chat-contact-${row.contact_id}`);
  return {
    seq: Number(row.seq),
    direction: String(row.direction || 'incoming'),
    message_ref: String(row.message_ref || ''),
    message_kind: attachmentName ? 'file' : String(row.message_kind || 'text'),
    delivery_status: String(row.delivery_status || 'received'),
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
    text: String(text || ''),
    attachment: attachmentName ? {
      name: attachmentName,
      mime: attachmentMime || '',
      size: Number(attachmentSize || 0),
      data_url: attachmentDataUrl,
      upload_id: ''
    } : null,
    error_code: row.error_code || '',
    error_detail: row.error_detail || '',
    id: `simplex-owner-direct:${row.contact_id}:${row.message_ref}`,
    npub: String(row.npub || ''),
    thread_id: stableThreadId,
    contact_name: displayName || `SimpleX ${row.contact_id}`,
    simplex_address: `secure-chat:${row.contact_id}`,
    body,
    subject: 'Website Secure Chat',
    from_self: String(row.direction || '') !== 'incoming',
    in_inbox: String(row.direction || '') === 'incoming',
    source: 'simplex-owner-direct'
  };
}

function visibleMessageRow(row) {
  if (!row || typeof row !== 'object') return false;
  switch (String(row.message_kind || '')) {
    case 'text':
    case 'file':
      return true;
    default:
      return false;
  }
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
      if (fields.text != null) row.text = String(fields.text);
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

function upsertMessageByRef(row, text, attachmentPreview) {
  const normalized = normalizeMessageRow(Object.assign({ seq: 1 }, row, { text: String(text || row.text || '') }));
  if (!normalized) {
    throw new Error('Invalid secure chat message row');
  }
  const ref = String(normalized.message_ref || '');
  if (!ref) {
    const seq = insertMessage(normalized);
    rememberMessageText(seq, text, attachmentPreview || null);
    return seq;
  }
  const rows = loadMessages(normalized.npub);
  for (const existing of rows) {
    if (String(existing.message_ref || '') !== ref) continue;
    existing.simplex_contact_id = normalized.simplex_contact_id || existing.simplex_contact_id;
    existing.bridge_user_id = normalized.bridge_user_id || existing.bridge_user_id;
    existing.bridge_contact_id = normalized.bridge_contact_id || existing.bridge_contact_id;
    existing.direction = normalized.direction || existing.direction;
    existing.message_kind = normalized.message_kind || existing.message_kind;
    existing.delivery_status = normalized.delivery_status || existing.delivery_status;
    existing.text = normalized.text || existing.text || '';
    existing.created_at = normalized.created_at || existing.created_at;
    existing.updated_at = normalized.updated_at || nowIso();
    if (!existing.attachment_name && normalized.attachment_name) {
      existing.attachment_name = normalized.attachment_name;
    }
    if (!existing.attachment_mime && normalized.attachment_mime) {
      existing.attachment_mime = normalized.attachment_mime;
    }
    if ((existing.attachment_size == null || existing.attachment_size === 0) && normalized.attachment_size != null) {
      existing.attachment_size = normalized.attachment_size;
    }
    if (!existing.attachment_path && normalized.attachment_path) {
      existing.attachment_path = normalized.attachment_path;
    }
    existing.upload_id = normalized.upload_id || existing.upload_id || '';
    existing.error_code = normalized.error_code || existing.error_code || '';
    existing.error_detail = normalized.error_detail || existing.error_detail || '';
    saveMessages(normalized.npub, rows);
    rememberMessageIndex(existing);
    rememberMessageText(existing.seq, text, attachmentPreview || null);
    return Number(existing.seq);
  }
  const seq = insertMessage(normalized);
  rememberMessageText(seq, text, attachmentPreview || null);
  return seq;
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
const recentReconciles = new Map();
const owlSendClientLocks = new Map();

const state = {
  startedAt: nowIso(),
  ownerUserId: metaGet('owner_user_id') || '',
  ownerContactLink: BROWSER_OWNER_CONTACT_LINK || metaGet('owner_contact_link') || '',
  ws: null,
  wsConnected: false,
  commandSeq: 0,
  activeUserId: metaGet('last_active_user_id') || '',
  ownerAddressCheckedUserId: '',
  transportStatus: 'starting',
  transportError: '',
  simplexProcess: null,
  driverType: 'unknown',
  nativeSimplex: null,
  nativeChat: null,
  operations: Promise.resolve(),
  transportOperations: Promise.resolve()
};

function withLock(fn) {
  const current = state.operations.then(fn, fn);
  state.operations = current.catch(() => undefined);
  return current;
}

function withTransportLock(fn) {
  const current = state.transportOperations.then(fn, fn);
  state.transportOperations = current.catch(() => undefined);
  return current;
}

function withOwlSendClientLock(clientMessageId, fn) {
  const id = normalizeOwlSendClientMessageId(clientMessageId);
  if (!id) return fn();
  const previous = owlSendClientLocks.get(id) || Promise.resolve();
  const current = previous.catch(() => undefined).then(fn);
  const stored = current.finally(() => {
    if (owlSendClientLocks.get(id) === stored) {
      owlSendClientLocks.delete(id);
    }
  });
  owlSendClientLocks.set(id, stored);
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

async function ensureNativeChatStarted() {
  const chat = await ensureNativeChatApi();
  if (!chat.started) {
    await chat.startChat();
  }
  state.transportStatus = 'connected';
  state.transportError = '';
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
  const botDisplayName = sanitizeSimplexDisplayName(`${SITE_TITLE} Secure Chat`, 'Secure Chat');
  const simplexArgs = [
    '--create-bot-display-name',
    botDisplayName,
    '--create-bot-allow-files',
    '--yes-migrate',
    '--log-level',
    'error',
    '--log-file',
    SERVICE_LOG_PATH,
    '--files-folder',
    DOWNLOADS_DIR,
    '--temp-folder',
    path.join(STORE_ROOT, 'simplex-tmp'),
    '--allow-instant-files',
    '--auto-accept-files',
    String(MAX_UPLOAD_BYTES),
    '-p',
    String(SIMPLEX_WS_PORT),
    '-d',
    dbPrefix
  ];
  try {
    const childLogFd = fs.openSync(SERVICE_LOG_PATH, 'a');
    state.simplexProcess = spawn(SIMPLEX_BINARY, simplexArgs, {
      stdio: ['ignore', childLogFd, childLogFd]
    });
    state.simplexProcess.on('exit', (code) => {
      logEvent('simplex_exit', { code });
      state.simplexProcess = null;
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

function chatFileLocalPath(file) {
  const source = file && file.fileSource && typeof file.fileSource === 'object' ? file.fileSource : {};
  const status = file && file.fileStatus && typeof file.fileStatus === 'object' ? file.fileStatus : {};
  return String(
    (file && (file.filePath || file.file_path || file.path)) ||
    source.filePath ||
    source.file_path ||
    status.filePath ||
    status.file_path ||
    status.path ||
    ''
  );
}

function deliveryStatusFromChatItem(chatItem) {
  const itemStatus = chatItem && chatItem.meta && chatItem.meta.itemStatus;
  if (!itemStatus || typeof itemStatus.type !== 'string') return 'queued';
  switch (itemStatus.type) {
    case 'sndNew':
      return 'sending';
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
  let messageKind = chatItemKind(chatItem);
  const deliveryStatus = deliveryStatusFromChatItem(chatItem);
  const createdAt = (chatItem.meta && (chatItem.meta.itemTs || chatItem.meta.createdAt)) || nowIso();
  const messageRef = chatItem.meta && chatItem.meta.itemId != null ? String(chatItem.meta.itemId) : '';
  const text = chatItemText(chatItem);
  const parsedAttachment = parseAttachmentMarker(text);
  const displayText = parsedAttachment ? parsedAttachment.text : text;
  if (parsedAttachment) {
    messageKind = 'file';
  }
  let attachmentName = chatItem.file && chatItem.file.fileName ? String(chatItem.file.fileName) : '';
  if (!attachmentName && parsedAttachment && parsedAttachment.attachment) attachmentName = parsedAttachment.attachment.name;
  const attachmentMime = (parsedAttachment && parsedAttachment.attachment ? parsedAttachment.attachment.mime : '') || mimeFromName(attachmentName);
  const attachmentSize = chatItem.file && chatItem.file.fileSize != null ? Number(chatItem.file.fileSize) : (parsedAttachment && parsedAttachment.attachment ? parsedAttachment.attachment.size : null);
  const attachmentPath = chatFileLocalPath(chatItem.file);
  if (
    messageKind === 'file' &&
    attachmentName &&
    /^upl-[^-]+-/.test(attachmentName) &&
    String(displayText || '').trim()
  ) {
    attachmentName = String(displayText || '').trim();
  }

  upsertMessageByRef({
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
    attachment_path: attachmentPath,
    upload_id: '',
    error_code: '',
    error_detail: ''
  }, text, attachmentName ? { name: attachmentName, size: attachmentSize || 0 } : null);
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

function openWsConnection() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(`ws://127.0.0.1:${SIMPLEX_WS_PORT}`);
    let settled = false;
    function finish(fn, value) {
      if (settled) return;
      settled = true;
      fn(value);
    }
    const timer = setTimeout(() => {
      finish(reject, new Error('Timed out connecting to simplex-chat local WebSocket'));
      try { ws.close(); } catch (_err) {}
    }, 2000);

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
      finish(resolve);
    });
    ws.addEventListener('error', (err) => {
      clearTimeout(timer);
      finish(reject, err);
      try { ws.close(); } catch (_closeErr) {}
    });
  });
}

async function ensureWsConnection() {
  if (nativeDriverAvailable()) {
    try {
      const chat = await ensureNativeChatApi();
      state.wsConnected = true;
      state.transportStatus = 'connected';
      state.transportError = '';
      return chat;
    } catch (err) {
      disableNativeSimplexDriver(err);
      state.transportStatus = 'degraded';
      state.transportError = err && err.message ? err.message : 'Could not initialize simplex-chat native driver';
    }
  }
  if (isWebSocketOpen()) {
    return Promise.resolve();
  }
  startSimplexChild();
  const started = Date.now();
  let lastError = null;
  while ((Date.now() - started) < 12000) {
    try {
      await openWsConnection();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  state.transportStatus = 'degraded';
  state.transportError = lastError && lastError.message ? lastError.message : 'WebSocket error';
  throw lastError || new Error('Timed out connecting to simplex-chat local WebSocket');
}

function openCommandWsConnection() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(`ws://127.0.0.1:${SIMPLEX_WS_PORT}`);
    let settled = false;
    function finish(fn, value) {
      if (settled) return;
      settled = true;
      fn(value);
    }
    const timer = setTimeout(() => {
      finish(reject, new Error('Timed out connecting to simplex-chat command WebSocket'));
      try { ws.close(); } catch (_err) {}
    }, 2000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      finish(resolve, ws);
    });
    ws.addEventListener('error', (err) => {
      clearTimeout(timer);
      finish(reject, err);
      try { ws.close(); } catch (_closeErr) {}
    });
  });
}

function closeSharedWsConnection() {
  if (state.ws) {
    try { state.ws.close(); } catch (_closeErr) {}
  }
  state.ws = null;
  state.wsConnected = false;
}

async function sendCommand(cmd) {
  const transport = await ensureWsConnection();
  if (state.driverType === 'native' && transport && typeof transport.sendChatCmd === 'function') {
    return transport.sendChatCmd(cmd);
  }
  closeSharedWsConnection();
  const commandWs = await openCommandWsConnection();
  try {
    return await sendCommandOnConnection(commandWs, cmd);
  } finally {
    try { commandWs.close(); } catch (_closeErr) {}
  }
}

function sendCommandOnConnection(commandWs, cmd) {
  const corrId = `secure-chat-${Date.now()}-${++state.commandSeq}`;
  const payload = JSON.stringify({ corrId, cmd });
  return new Promise((resolve, reject) => {
    function cleanup() {
      clearTimeout(timer);
      commandWs.removeEventListener('message', onMessage);
      commandWs.removeEventListener('error', onError);
    }
    function onMessage(event) {
      const envelope = parseResponseEnvelope(event.data);
      if (!envelope || !envelope.resp) return;
      if (envelope.corrId === corrId) {
        cleanup();
        resolve(envelope.resp);
        return;
      }
      handleIncomingEvent(envelope.resp);
    }
    function onError(err) {
      cleanup();
      reject(err);
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`SimpleX command timed out: ${cmd}`));
    }, COMMAND_TIMEOUT_MS);
    commandWs.addEventListener('message', onMessage);
    commandWs.addEventListener('error', onError);
    commandWs.send(payload);
  });
}

function sendPlainTextMessageViaChild(activeUserId, chatRef, text) {
  const script = `
const WebSocket = globalThis.WebSocket || (() => {
  try {
    return require('undici').WebSocket;
  } catch (_err) {
    return null;
  }
})();
if (!WebSocket) {
  throw new Error('Node.js WebSocket runtime is unavailable');
}
const [port, userId, chatRef, text] = process.argv.slice(1);
let seq = 0;
function parse(message) {
  try { return JSON.parse(String(message || '')); } catch (_err) { return null; }
}
function openWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port);
    const timer = setTimeout(() => {
      try { ws.close(); } catch (_err) {}
      reject(new Error('Timed out connecting to simplex-chat command WebSocket'));
    }, 2000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
function send(ws, cmd) {
  const corrId = 'secure-chat-child-' + Date.now() + '-' + (++seq);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('SimpleX command timed out: ' + cmd));
    }, Number(process.env.SECURE_CHAT_COMMAND_TIMEOUT_MS || 90000));
    function cleanup() {
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('error', onError);
    }
    function onMessage(event) {
      const envelope = parse(event.data);
      if (!envelope || envelope.corrId !== corrId) return;
      cleanup();
      resolve(envelope.resp);
    }
    function onError(err) {
      cleanup();
      reject(err);
    }
    ws.addEventListener('message', onMessage);
    ws.addEventListener('error', onError);
    ws.send(JSON.stringify({ corrId, cmd }));
  });
}
(async () => {
  const ws = await openWs();
  try {
    const active = await send(ws, '/_user ' + userId);
    if (!active || active.type !== 'activeUser') {
      throw new Error('Could not activate user ' + userId + ': ' + (active && active.type || 'unknown'));
    }
    const resp = await send(ws, '/_send ' + chatRef + ' text ' + text);
    process.stdout.write(JSON.stringify(resp));
  } finally {
    try { ws.close(); } catch (_err) {}
  }
})().catch((err) => {
  process.stderr.write((err && err.message ? err.message : String(err || 'send failed')) + '\\n');
  process.exit(1);
});
`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script, String(SIMPLEX_WS_PORT), String(activeUserId), String(chatRef), String(text || '')], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, {
        SECURE_CHAT_COMMAND_TIMEOUT_MS: String(COMMAND_TIMEOUT_MS)
      })
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (_err) {}
      reject(new Error(`SimpleX command timed out: /_send ${chatRef} text ${String(text || '')}`));
    }, COMMAND_TIMEOUT_MS + 5000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `SimpleX child sender exited with ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || '{}'));
      } catch (err) {
        reject(new Error(`Could not parse SimpleX child sender response: ${err.message}`));
      }
    });
  });
}

async function sendCommandAsUser(userId, cmd) {
  const transport = await ensureWsConnection();
  if (state.driverType === 'native' && transport && typeof transport.sendChatCmd === 'function') {
    await setActiveUser(userId);
    return transport.sendChatCmd(cmd);
  }
  closeSharedWsConnection();
  const commandWs = await openCommandWsConnection();
  try {
    const userResp = await sendCommandOnConnection(commandWs, `/_user ${userId}`);
    if (userResp.type !== 'activeUser') {
      throw new Error(chatCommandErrorMessage(`Could not activate user ${userId}: ${userResp.type || 'unknown'}`, userResp));
    }
    state.activeUserId = String(userId);
    return await sendCommandOnConnection(commandWs, cmd);
  } finally {
    try { commandWs.close(); } catch (_closeErr) {}
  }
}

async function ensureChatStarted() {
  if (nativeDriverAvailable()) {
    try {
      await ensureNativeChatStarted();
      return;
    } catch (err) {
      disableNativeSimplexDriver(err);
      try {
        await stopNativeChat();
      } catch (_stopErr) {}
      if (!nativeDriverAvailable()) {
        startSimplexChild();
      } else {
        state.transportStatus = 'degraded';
        state.transportError = err && err.message ? err.message : 'Could not start simplex-chat native driver';
        throw err;
      }
    }
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
    const chat = await ensureNativeChatStarted();
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
    const chat = await ensureNativeChatStarted();
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
    const chat = await ensureNativeChatStarted();
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
  const command = profile && profile.peerType === 'bot'
    ? `/create bot ${displayName}`
    : `/create user ${displayName}`;
  const resp = nativeDriverAvailable()
    ? await (await ensureNativeChatStarted()).sendChatCmd(command)
    : await sendCommand(command);
  if (resp.type !== 'activeUser' || !resp.user) {
    throw new Error(chatCommandErrorMessage(`Could not create user: ${resp.type || 'unknown'}`, resp));
  }
  state.activeUserId = String(resp.user.userId);
  return resp.user;
}

function userDisplayName(user) {
  return String(
    (user && user.localDisplayName) ||
    (user && user.profile && user.profile.displayName) ||
    ''
  );
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

function isReusableSimplexContactLink(link) {
  return /^simplex:\/contact#/i.test(String(link || '').trim());
}

async function enableOwnerAddress(userId) {
  if (nativeDriverAvailable()) {
    const chat = await ensureNativeChatStarted();
    if (String(state.activeUserId || '') !== String(userId)) {
      await setActiveUser(userId);
    }
    let address = await chat.apiGetUserAddress(Number(userId));
    if (!address) {
      await chat.apiCreateUserAddress(Number(userId));
      address = await chat.apiGetUserAddress(Number(userId));
    }
    if (!address) {
      throw new Error('Could not load owner contact address');
    }
    await chat.apiSetAddressSettings(Number(userId), {
      autoAccept: { acceptIncognito: true },
      businessAddress: false
    });
    return address;
  }
  // SimpleX v6.5 can provision direct invitations without a user contact link.
  // On fresh bot profiles these address-management commands return
  // userContactLinkNotFound, which is non-fatal for the bridge flow.
  const addressResp = await sendCommand(`/_profile_address ${userId} on`).catch((err) => {
    logEvent('owner_address_enable_skipped', { error: errorDetail(err) });
    return null;
  });
  if (!addressResp) return;
  if (isMissingUserContactLinkError(addressResp)) {
    return;
  }
  if (addressResp && addressResp.type === 'chatCmdError') {
    throw new Error(`Could not enable owner profile address: ${addressResp.chatError && addressResp.chatError.type ? addressResp.chatError.type : 'chatCmdError'}`);
  }
  const settingsResp = await sendCommand(`/_address_settings ${userId} ${JSON.stringify({
    businessAddress: false,
    autoAccept: { acceptIncognito: true }
  })}`).catch((err) => {
    logEvent('owner_address_settings_skipped', { error: errorDetail(err) });
    return null;
  });
  if (!settingsResp) return;
  if (isMissingUserContactLinkError(settingsResp)) {
    return;
  }
  if (settingsResp && settingsResp.type === 'chatCmdError') {
    throw new Error(`Could not configure owner address settings: ${settingsResp.chatError && settingsResp.chatError.type ? settingsResp.chatError.type : 'chatCmdError'}`);
  }
}

async function recreateOwnerAddress(userId) {
  if (!nativeDriverAvailable()) {
    throw new Error('Owner address recreation requires native SimpleX API');
  }
  const chat = await ensureNativeChatStarted();
  if (String(state.activeUserId || '') !== String(userId)) {
    await setActiveUser(userId);
  }
  await chat.apiDeleteUserAddress(Number(userId)).catch(() => undefined);
  await chat.apiCreateUserAddress(Number(userId));
  const address = await chat.apiGetUserAddress(Number(userId));
  if (!address) {
    throw new Error('Could not recreate owner contact address');
  }
  await chat.apiSetAddressSettings(Number(userId), {
    autoAccept: true,
    businessAddress: false
  });
  return address;
}

async function ensureUsableOwnerAddress(userId) {
  if (String(state.ownerAddressCheckedUserId || '') === String(userId)) {
    return;
  }
  try {
    const address = await enableOwnerAddress(userId);
    state.ownerAddressCheckedUserId = String(userId);
    return address;
  } catch (err) {
    if (!nativeDriverAvailable()) throw err;
    logEvent('owner_address_recreate_after_error', {
      error: err && err.message ? err.message : String(err || 'unknown error')
    });
    const address = await recreateOwnerAddress(userId);
    state.ownerAddressCheckedUserId = String(userId);
    return address;
  }
}

function isOwnerUserCandidate(user) {
  const profile = user && user.profile ? user.profile : {};
  const displayName = String(profile.displayName || user.localDisplayName || '');
  const peerType = String(profile.peerType || '');
  const expected = sanitizeSimplexDisplayName(`${SITE_TITLE} Secure Chat`, 'Secure Chat');
  return peerType === 'bot' && (
    displayName === expected ||
    displayName.endsWith(' Secure Chat')
  );
}

function findOwnerUserCandidate(users) {
  return users.find(isOwnerUserCandidate) || null;
}

async function ensureOwnerUser() {
  const users = await listUsers();
  const active = await showActiveUser();
  let savedOwner = null;
  if (state.ownerUserId) {
    savedOwner = users.find((user) => String(user.userId) === String(state.ownerUserId)) || null;
    if (savedOwner && !isOwnerUserCandidate(savedOwner)) {
      logEvent('owner_user_id_ignored_non_owner_profile', { user_id: String(savedOwner.userId) });
      savedOwner = null;
    }
  }
  const preferredOwner = savedOwner || findOwnerUserCandidate(users);
  if (preferredOwner && (!active || String(preferredOwner.userId) !== String(active.userId))) {
    const owner = await setActiveUser(preferredOwner.userId);
    state.ownerUserId = String(owner.userId);
    metaSet('owner_user_id', state.ownerUserId);
    await ensureChatStarted();
    await ensureUsableOwnerAddress(owner.userId);
    return owner;
  }
  if (active) {
    await ensureChatStarted();
    if (isOwnerUserCandidate(active)) {
      state.ownerUserId = String(active.userId);
      metaSet('owner_user_id', state.ownerUserId);
      await ensureUsableOwnerAddress(active.userId);
      return active;
    }
  }

  const created = await createUser({
    displayName: sanitizeSimplexDisplayName(`${SITE_TITLE} Secure Chat`, 'Secure Chat'),
    fullName: sanitizeSimplexDisplayName(`${SITE_TITLE} Secure Chat`, 'Secure Chat'),
    shortDescr: 'Website secure chat bridge',
    peerType: 'bot'
  });
  state.ownerUserId = String(created.userId);
  metaSet('owner_user_id', state.ownerUserId);
  await ensureChatStarted();
  await ensureUsableOwnerAddress(created.userId);
  return created;
}

async function ensureBridgeUser(npub, sessionDisplayName) {
  const row = selectContactByNpubStmt.get(npub);
  const users = await listUsers();
  const profile = bridgeProfileForSession(npub, sessionDisplayName);
  if (row && row.bridge_user_id) {
    const existing = users.find((user) => String(user.userId) === String(row.bridge_user_id));
    if (existing && userDisplayName(existing) === profile.displayName) {
      return existing;
    }
  }
  const displayName = profile.displayName;
  const existingByName = users.find((user) => userDisplayName(user) === displayName);
  if (existingByName) {
    return existingByName;
  }
  const created = await createUser({
    displayName,
    fullName: profile.fullName,
    shortDescr: 'Secure chat website bridge'
  }).catch((err) => {
    if (String(err && err.message || '').includes('userExists')) {
      const existing = users.find((user) => userDisplayName(user) === displayName);
      if (existing) return existing;
    }
    throw err;
  });
  return created;
}

async function listContacts(userId) {
  if (nativeDriverAvailable()) {
    const chat = await ensureNativeChatStarted();
    if (String(state.activeUserId || '') !== String(userId)) {
      await setActiveUser(userId);
    }
    return chat.apiListContacts(Number(userId));
  }
  if (String(state.activeUserId || '') !== String(userId)) {
    await setActiveUser(userId);
  }
  const resp = await sendCommand(`/_contacts ${userId}`);
  if (resp.type === 'contactsList' && Array.isArray(resp.contacts)) {
    return resp.contacts;
  }
  throw new Error(chatCommandErrorMessage(`Could not list contacts: ${resp.type || 'unknown'}`, resp));
}

function diffContactIds(before, after) {
  const known = new Set(before.map((item) => String(item.contactId)));
  return after.filter((item) => !known.has(String(item.contactId)));
}

function contactConnStatus(contact) {
  return contact && contact.activeConn && contact.activeConn.connStatus && contact.activeConn.connStatus.type
    ? String(contact.activeConn.connStatus.type)
    : '';
}

function contactReadyForSend(contact) {
  const status = contactConnStatus(contact);
  return status === 'ready' || status === 'sndReady';
}

function contactDisplayName(contact) {
  const profile = contact && contact.profile ? contact.profile : {};
  return sanitizeSimplexDisplayName(
    contact && (contact.localDisplayName || contact.displayName) ||
    profile.displayName ||
    profile.fullName ||
    '',
    contact && contact.contactId != null ? `SimpleX ${contact.contactId}` : 'SimpleX Contact'
  );
}

function contactNpub(contact) {
  const profile = contact && contact.profile ? contact.profile : {};
  const text = [
    profile.fullName,
    profile.full_name,
    profile.displayName,
    profile.display_name,
    contact && contact.fullName,
    contact && contact.displayName,
    contact && contact.localDisplayName
  ].filter(Boolean).join(' ');
  const match = text.match(/\bnostr-pubkey:([0-9a-f]{64})\b/i);
  if (!match) return '';
  try {
    return pubkeyToNpub(match[1]);
  } catch (_err) {
    return '';
  }
}

function findExistingProvisionedContacts(ownerContacts, bridgeContacts, ownerUser, bridgeUser) {
  const ownerName = userDisplayName(ownerUser);
  const bridgeName = userDisplayName(bridgeUser);
  const ownerContact = ownerContacts.find((contact) => (
    contactReadyForSend(contact) &&
    String(contact.localDisplayName || '') === bridgeName
  ));
  const bridgeContact = bridgeContacts.find((contact) => (
    contactReadyForSend(contact) &&
    String(contact.localDisplayName || '') === ownerName
  ));
  if (!ownerContact || !bridgeContact) return null;
  return {
    ownerContactId: String(ownerContact.contactId),
    bridgeContactId: String(bridgeContact.contactId)
  };
}

async function createInvitation(ownerUserId) {
  if (String(state.activeUserId || '') !== String(ownerUserId)) {
    await setActiveUser(ownerUserId);
  }
  const resp = await sendCommand(`/_connect ${ownerUserId}`);
  if (resp.type !== 'invitation' || !resp.connLinkInvitation || !resp.connLinkInvitation.connFullLink) {
    throw new Error(chatCommandErrorMessage(`Could not create owner invitation: ${resp.type || 'unknown'}`, resp));
  }
  return String(resp.connLinkInvitation.connFullLink);
}

async function ownerAddressLink(ownerUserId, forceNew) {
  if (nativeDriverAvailable()) {
    const address = forceNew ? await recreateOwnerAddress(ownerUserId) : await enableOwnerAddress(ownerUserId);
    const connLink = address && address.connLinkContact ? address.connLinkContact : null;
    if (!connLink || (!connLink.connFullLink && !connLink.connShortLink)) {
      throw new Error('Could not load owner contact address');
    }
    return connLink.connFullLink || connLink.connShortLink;
  }
  return createInvitation(ownerUserId);
}

async function connectBridgeToInvitation(bridgeUserId, link) {
  if (String(state.activeUserId || '') !== String(bridgeUserId)) {
    await setActiveUser(bridgeUserId);
  }
  const resp = await sendCommand(`/_connect ${bridgeUserId} ${link}`);
  if (resp.type === 'sentConfirmation' || resp.type === 'sentInvitation' || resp.type === 'contactAlreadyExists') {
    return resp;
  }
  throw new Error(chatCommandErrorMessage(`Could not connect bridge profile: ${resp.type || 'unknown'}`, resp));
}

async function connectBridgeToOwnerAddress(bridgeUserId, link) {
  if (nativeDriverAvailable()) {
    const chat = await ensureNativeChatStarted();
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
    const ownerReady = ownerNew.find(contactReadyForSend);
    const bridgeReady = bridgeNew.find(contactReadyForSend);
    if (ownerReady && bridgeReady) {
      return {
        ownerContactId: String(ownerReady.contactId),
        bridgeContactId: String(bridgeReady.contactId)
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error('Timed out waiting for SimpleX contacts to provision');
}

async function provisionContact(npub, sessionDisplayName) {
  const profile = bridgeProfileForSession(npub, sessionDisplayName);
  let cached = contactRowToJson(selectContactByNpubStmt.get(npub));
  if (cached && cached.status === 'active' && cached.simplex_contact_id && cached.bridge_user_id && cached.bridge_contact_id && mappingBridgeDisplayMatches(cached, sessionDisplayName)) {
    return cached;
  }
  if (cached && cached.status === 'active' && !mappingBridgeDisplayMatches(cached, sessionDisplayName)) {
    logEvent('provision_recreate_for_display_name', {
      npub,
      previous_bridge_display_name: cached.bridge_display_name || '',
      next_bridge_display_name: profile.displayName
    });
    deleteContact(npub);
    cached = null;
  }
  if (provisionLocks.has(npub)) {
    return provisionLocks.get(npub);
  }
  const promise = withLock(async () => {
    logEvent('provision_start', { npub, bridge_display_name: profile.displayName });
    const owner = await ensureOwnerUser();
    const ownerUserId = String(owner.userId);
    const bridgeUser = await ensureBridgeUser(npub, sessionDisplayName);
    let bridgeUserId = String(bridgeUser.userId);
    logEvent('provision_users_ready', {
      npub,
      owner_user_id: ownerUserId,
      bridge_user_id: bridgeUserId
    });

    let ownerBefore = await listContacts(ownerUserId);
    let bridgeBefore = await listContacts(bridgeUserId);
    const existingIds = findExistingProvisionedContacts(ownerBefore, bridgeBefore, owner, bridgeUser);
    if (existingIds) {
      upsertContactStmt.run(
        npub,
        existingIds.ownerContactId,
        bridgeUserId,
        existingIds.bridgeContactId,
        'active',
        nowIso(),
        nowIso(),
        nowIso(),
        profile.displayName,
        profile.fullName
      );
      logEvent('provision_reused_contacts', {
        npub,
        owner_contact_id: existingIds.ownerContactId,
        bridge_contact_id: existingIds.bridgeContactId,
        bridge_display_name: profile.displayName
      });
      return contactRowToJson(selectContactByNpubStmt.get(npub));
    }
    let link;
    try {
      logEvent('provision_owner_address', { npub, owner_user_id: ownerUserId });
      link = await ownerAddressLink(ownerUserId, false);
    } catch (err) {
      if (!nativeDriverAvailable()) throw err;
      logEvent('provision_retry_recreate_owner_address', { npub, error: errorDetail(err) });
      link = await ownerAddressLink(ownerUserId, true);
    }
    await setActiveUser(bridgeUserId);
    try {
      logEvent('provision_connect_bridge', { npub, bridge_user_id: bridgeUserId });
      await connectBridgeToOwnerAddress(bridgeUserId, link);
    } catch (err) {
      if (!nativeDriverAvailable()) throw err;
      logEvent('provision_retry_recreate_owner_address', { npub, error: errorDetail(err) });
      link = await ownerAddressLink(ownerUserId, true);
      const retryBridge = await createUser({
        displayName: `${profile.displayName.slice(0, 48)}-${Date.now().toString(36)}`,
        fullName: profile.fullName,
        shortDescr: 'Secure chat website bridge'
      });
      bridgeUserId = String(retryBridge.userId);
      ownerBefore = await listContacts(ownerUserId);
      bridgeBefore = await listContacts(bridgeUserId);
      await setActiveUser(bridgeUserId);
      logEvent('provision_connect_retry_bridge', { npub, bridge_user_id: bridgeUserId });
      await connectBridgeToOwnerAddress(bridgeUserId, link);
    }
    logEvent('provision_wait_contacts', { npub, owner_user_id: ownerUserId, bridge_user_id: bridgeUserId });
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
      nowIso(),
      profile.displayName,
      profile.fullName
    );
    logEvent('provision_active', {
      npub,
      owner_contact_id: ids.ownerContactId,
      bridge_user_id: bridgeUserId,
      bridge_contact_id: ids.bridgeContactId,
      bridge_display_name: profile.displayName
    });
    return contactRowToJson(selectContactByNpubStmt.get(npub));
  }).catch((err) => {
    updateContactStatusStmt.run('error', nowIso(), null, errorDetail(err), npub);
    throw err;
  }).finally(() => {
    provisionLocks.delete(npub);
  });
  provisionLocks.set(npub, promise);
  return promise;
}

async function ensureMappingForPubkey(pubkeyHex, sessionDisplayName) {
  const npub = pubkeyToNpub(pubkeyHex);
  const mapping = await provisionContact(npub, sessionDisplayName);
  return { npub, mapping };
}

async function sendComposedMessages(activeUserId, chatRef, composedMessages) {
  return withTransportLock(async () => {
    if (nativeDriverAvailable()) {
      await setActiveUser(activeUserId);
      const chat = await ensureNativeChatStarted();
      const resp = await chat.apiSendMessages(simplexChatRef(chatRef), composedMessages).catch((err) => {
        throw new Error(chatCommandErrorMessage('SimpleX send failed', err));
      });
      if (!Array.isArray(resp)) {
        throw new Error(chatCommandErrorMessage('Unexpected send response', resp));
      }
      return resp;
    }
    const chatItems = [];
    for (const composedMessage of composedMessages) {
      const resp = await sendCommandAsUser(activeUserId, `/_send ${chatRef} json ${JSON.stringify([composedMessage])}`);
      if (resp.type !== 'newChatItems' || !Array.isArray(resp.chatItems)) {
        throw new Error(chatCommandErrorMessage(`Unexpected send response: ${resp.type || 'unknown'}`, resp));
      }
      chatItems.push(...resp.chatItems);
    }
    return chatItems;
  });
}

async function sendPlainTextMessage(activeUserId, chatRef, text) {
  return withTransportLock(async () => {
    const cmd = `/_send ${chatRef} text ${String(text || '')}`;
    const resp = nativeDriverAvailable()
      ? await (async () => {
        await setActiveUser(activeUserId);
        return (await ensureNativeChatStarted()).apiSendTextMessage(simplexChatRef(chatRef), String(text || ''));
      })()
      : await sendPlainTextMessageViaChild(activeUserId, chatRef, text);
    if (nativeDriverAvailable()) {
      if (!Array.isArray(resp)) {
        throw new Error(chatCommandErrorMessage('Unexpected send response', resp));
      }
      return resp;
    }
    if (resp.type !== 'newChatItems' || !Array.isArray(resp.chatItems)) {
      throw new Error(chatCommandErrorMessage(`Unexpected send response: ${resp.type || 'unknown'}`, resp));
    }
    return resp.chatItems;
  });
}

function simplexChatRef(chatRef) {
  const value = String(chatRef || '').trim();
  const match = value.match(/^@(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported SimpleX chat reference: ${value || 'empty'}`);
  }
  return { chatType: 'direct', chatId: Number(match[1]) };
}

async function freshMappingAfterSendFailure(npub, reason, pubkeyHex, sessionDisplayName) {
  logEvent('send_retry_reprovision_mapping', {
    npub,
    error: truncateForLog(reason || 'send failed', 1000)
  });
  deleteContact(npub);
  return (await ensureMappingForPubkey(pubkeyHex, sessionDisplayName)).mapping;
}

function shouldReconcileNpub(npub) {
  const now = Date.now();
  const last = Number(recentReconciles.get(npub) || 0);
  if (last && (now - last) < RECONCILE_MIN_INTERVAL_MS) return false;
  recentReconciles.set(npub, now);
  return true;
}

function wrapApiChatItems(resp) {
  if (!resp || resp.type !== 'apiChat' || !resp.chat) return [];
  return wrapApiChat(resp.chat);
}

function wrapApiChat(chat) {
  if (!chat || typeof chat !== 'object') return [];
  const chatInfo = chat.chatInfo || null;
  const chatItems = Array.isArray(chat.chatItems) ? chat.chatItems : [];
  if (!chatInfo) return [];
  return chatItems.map((chatItem) => ({ chatInfo, chatItem }));
}

async function fetchRecentDirectChatItems(activeUserId, bridgeContactId, count) {
  return withTransportLock(async () => {
    const cmd = `/_get chat @${bridgeContactId} count=${count}`;
    if (nativeDriverAvailable()) {
      await setActiveUser(activeUserId);
      const chat = await ensureNativeChatStarted();
      return wrapApiChat(await chat.apiGetChat('direct', Number(bridgeContactId), Number(count)));
    }
    const resp = await sendCommandAsUser(activeUserId, cmd);
    if (resp.type === 'apiChat') return wrapApiChatItems(resp);
    if (resp.type === 'chatCmdError') {
      throw new Error(resp.chatError && resp.chatError.type ? resp.chatError.type : 'chatCmdError');
    }
    throw new Error(`Unexpected chat history response: ${resp.type || 'unknown'}`);
  });
}

async function reconcileMappingMessages(mapping) {
  if (!mapping || mapping.status !== 'active' || !mapping.bridge_user_id || !mapping.bridge_contact_id) return;
  const items = await fetchRecentDirectChatItems(
    String(mapping.bridge_user_id),
    String(mapping.bridge_contact_id),
    RECONCILE_CHAT_ITEM_LIMIT
  );
  for (const item of items) {
    handleChatItemEvent({ userId: mapping.bridge_user_id }, item);
    handleChatItemStatusEvent({ userId: mapping.bridge_user_id }, item);
  }
}

async function reconcileAllMappingMessages() {
  await ensureRuntime();
  const mappings = selectMappingsStmt.all(500).map(contactRowToJson);
  for (const mapping of mappings) {
    if (!mapping || mapping.status !== 'active') continue;
    try {
      await reconcileMappingMessages(mapping);
    } catch (err) {
      logEvent('reconcile_error', {
        npub: mapping.npub || '',
        error: err && err.message ? err.message : String(err || 'unknown error')
      });
    }
  }
}

async function reconcileAllMappingMessagesForOwlExport() {
  try {
    await Promise.race([
      reconcileAllMappingMessages(),
      new Promise((resolve) => setTimeout(resolve, OWL_EXPORT_RECONCILE_TIMEOUT_MS))
    ]);
  } catch (err) {
    logEvent('owl_export_reconcile_error', {
      error: err && err.message ? err.message : String(err || 'unknown error')
    });
  }
}

function ownerDirectRowFromChatItem(contact, aChatItem) {
  if (!contact || !aChatItem || !aChatItem.chatItem) return null;
  const chatItem = aChatItem.chatItem;
  const messageRef = chatItem.meta && chatItem.meta.itemId != null ? String(chatItem.meta.itemId) : '';
  if (!messageRef) return null;
  const contactId = String(contact.contactId || '');
  let messageKind = chatItemKind(chatItem);
  const text = stripLegacySecureChatIdentityMarker(chatItemText(chatItem));
  const parsedAttachment = parseAttachmentMarker(text);
  const displayText = parsedAttachment ? parsedAttachment.text : text;
  if (parsedAttachment) {
    messageKind = 'file';
  }
  let attachmentName = chatItem.file && chatItem.file.fileName ? String(chatItem.file.fileName) : '';
  if (!attachmentName && parsedAttachment && parsedAttachment.attachment) attachmentName = parsedAttachment.attachment.name;
  const attachmentSize = chatItem.file && chatItem.file.fileSize != null ? Number(chatItem.file.fileSize) : (parsedAttachment && parsedAttachment.attachment ? parsedAttachment.attachment.size : null);
  const attachmentMime = (parsedAttachment && parsedAttachment.attachment ? parsedAttachment.attachment.mime : '') || mimeFromName(attachmentName);
  const attachmentPath = chatFileLocalPath(chatItem.file);
  if (
    messageKind === 'file' &&
    attachmentName &&
    /^upl-[^-]+-/.test(attachmentName) &&
    String(displayText || '').trim()
  ) {
    attachmentName = String(displayText || '').trim();
  }
  const row = {
    seq: 1,
    contact_id: contactId,
    thread_id: `secure-chat-contact-${contactId}`,
    npub: contactNpub(contact),
    contact_name: contactDisplayName(contact),
    message_ref: messageRef,
    message_kind: messageKind,
    direction: chatItem.chatDir && chatItem.chatDir.type === 'directRcv' ? 'incoming' : 'outgoing',
    delivery_status: deliveryStatusFromChatItem(chatItem),
    created_at: (chatItem.meta && (chatItem.meta.itemTs || chatItem.meta.createdAt)) || nowIso(),
    updated_at: nowIso(),
    text,
    attachment_name: attachmentName,
    attachment_mime: attachmentMime,
    attachment_size: attachmentSize,
    attachment_path: attachmentPath,
    error_code: '',
    error_detail: ''
  };
  return row;
}

function ownerDirectChunkRowFromGroup(contact, group) {
  if (!contact || !group || !group.firstItem || !group.meta || !group.parts) return null;
  const total = Number(group.total || group.meta.total || 0);
  if (!Number.isInteger(total) || total < 1 || group.parts.size !== total) return null;
  let dataBase64 = '';
  for (let index = 1; index <= total; index += 1) {
    const part = group.parts.get(index);
    if (!part || !part.data) return null;
    dataBase64 += part.data;
  }
  const expectedBytes = Number(group.meta.size || 0) || 0;
  if (!dataBase64 || dataBase64.length > MAX_ATTACHMENT_DATA_URL_LENGTH || (expectedBytes && Math.ceil(expectedBytes / 3) * 4 > MAX_ATTACHMENT_DATA_URL_LENGTH)) {
    return null;
  }
  const text = encodeAttachmentMarkerText(stripLegacySecureChatIdentityMarker(group.text || ''), {
    name: sanitizeName(group.meta.name || 'attachment.bin'),
    mime: String(group.meta.mime || 'application/octet-stream'),
    size: expectedBytes
  }, dataBase64);
  const first = group.firstItem.chatItem || {};
  return ownerDirectRowFromChatItem(contact, {
    chatInfo: group.firstItem.chatInfo,
    chatItem: Object.assign({}, first, {
      file: null,
      text,
      content: { msgContent: { type: 'text', text } },
      meta: Object.assign({}, first.meta || {}, {
        itemId: String(group.meta.id || (first.meta && first.meta.itemId) || ''),
        itemText: text
      })
    })
  });
}

function upsertOwnerDirectRow(byKey, next) {
  if (!next || !String(next.text || next.attachment_name || '').trim()) return false;
  const key = `${next.contact_id}:${next.message_ref}`;
  const existing = byKey.get(key);
  if (existing) {
    existing.contact_name = next.contact_name || existing.contact_name;
    existing.thread_id = next.thread_id || existing.thread_id;
    existing.npub = next.npub || existing.npub || '';
    existing.delivery_status = next.delivery_status || existing.delivery_status;
    existing.updated_at = nowIso();
    existing.text = next.text || existing.text || '';
    existing.attachment_name = existing.attachment_name || next.attachment_name || '';
    existing.attachment_mime = existing.attachment_mime || next.attachment_mime || '';
    existing.attachment_size = existing.attachment_size || next.attachment_size || null;
    existing.attachment_path = existing.attachment_path || next.attachment_path || '';
    existing.attachment_data_url = existing.attachment_data_url || next.attachment_data_url || '';
    return true;
  }
  next.seq = nextMessageSeq();
  byKey.set(key, normalizeOwnerDirectMessageRow(next));
  return true;
}

function ownerDirectStateRow(row) {
  if (!row || typeof row !== 'object') return null;
  const direction = String(row.direction || '') === 'incoming' ? 'outgoing' : 'incoming';
  return Object.assign({}, row, { direction });
}

function ownerDirectContactContext(contactId) {
  const rows = loadOwnerDirectMessages().filter((row) => String(row.contact_id || '') === String(contactId || ''));
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row && (row.npub || row.contact_name)) {
      return {
        npub: row.npub || '',
        contact_name: row.contact_name || ''
      };
    }
  }
  return { npub: '', contact_name: '' };
}

function rememberOwnerDirectSentAttachment(contactId, attachment, text, chatItems) {
  const first = chatItems && chatItems[0] && chatItems[0].chatItem ? chatItems[0].chatItem : null;
  const messageRef = first && first.meta && first.meta.itemId != null ? String(first.meta.itemId) : '';
  if (!messageRef || !attachment) return;
  const context = ownerDirectContactContext(contactId);
  const rows = loadOwnerDirectMessages();
  const byKey = new Map(rows.map((row) => [`${row.contact_id}:${row.message_ref}`, row]));
  const createdAt = first && first.meta && (first.meta.itemTs || first.meta.createdAt) ? String(first.meta.itemTs || first.meta.createdAt) : nowIso();
  upsertOwnerDirectRow(byKey, {
    seq: 1,
    contact_id: String(contactId),
    thread_id: `secure-chat-contact-${contactId}`,
    npub: context.npub,
    contact_name: context.contact_name || `SimpleX ${contactId}`,
    message_ref: messageRef,
    message_kind: 'file',
    direction: 'outgoing',
    delivery_status: first ? deliveryStatusFromChatItem(first) : 'sent',
    created_at: createdAt,
    updated_at: nowIso(),
    text: String(text || ''),
    attachment_name: attachment.fileName || '',
    attachment_mime: attachment.mimeType || '',
    attachment_size: attachment.fileSize || null,
    attachment_path: attachment.filePath || '',
    attachment_data_url: dataUrlFromAttachmentPath(attachment.filePath, attachment.mimeType, attachment.fileSize),
    error_code: '',
    error_detail: ''
  });
  saveOwnerDirectMessages(Array.from(byKey.values()).filter(Boolean));
}

async function reconcileOwnerDirectMessages() {
  const owner = await ensureOwnerUser();
  const ownerUserId = String(owner.userId);
  const mappedOwnerContacts = new Set(
    selectMappingsStmt.all(1000)
      .map(contactRowToJson)
      .filter((row) => row && row.status === 'active' && row.simplex_contact_id)
      .map((row) => String(row.simplex_contact_id))
  );
  const contacts = (await listContacts(ownerUserId)).filter((contact) => (
    contact &&
    contact.contactId != null &&
    contactReadyForSend(contact) &&
    !mappedOwnerContacts.has(String(contact.contactId))
  ));
  if (!contacts.length) return;

  const rows = loadOwnerDirectMessages();
  const byKey = new Map(rows.map((row) => [`${row.contact_id}:${row.message_ref}`, row]));
  let changed = false;
  for (const contact of contacts) {
    const items = await fetchRecentDirectChatItems(ownerUserId, String(contact.contactId), RECONCILE_CHAT_ITEM_LIMIT);
    const chunkGroups = new Map();
    for (const item of items) {
      const chunk = parseAttachmentChunkMarker(chatItemText(item && item.chatItem));
      if (chunk) {
        const id = String(chunk.meta.id || '').slice(0, 256);
        const key = `${String(contact.contactId)}:${id}`;
        let group = chunkGroups.get(key);
        if (!group) {
          group = {
            firstItem: item,
            meta: chunk.meta,
            total: chunk.total,
            text: chunk.text,
            parts: new Map()
          };
          chunkGroups.set(key, group);
        }
        if (chunk.text && !group.text) group.text = chunk.text;
        group.parts.set(chunk.index, chunk);
        continue;
      }
      const next = ownerDirectRowFromChatItem(contact, item);
      changed = upsertOwnerDirectRow(byKey, next) || changed;
    }
    for (const group of chunkGroups.values()) {
      changed = upsertOwnerDirectRow(byKey, ownerDirectChunkRowFromGroup(contact, group)) || changed;
    }
  }
  if (changed) {
    saveOwnerDirectMessages(Array.from(byKey.values()).filter(Boolean));
  }
}

async function reconcileOwnerDirectMessagesForOwlExport() {
  try {
    await Promise.race([
      reconcileOwnerDirectMessages(),
      new Promise((resolve) => setTimeout(resolve, OWL_EXPORT_RECONCILE_TIMEOUT_MS))
    ]);
  } catch (err) {
    logEvent('owl_export_owner_direct_reconcile_error', {
      error: err && err.message ? err.message : String(err || 'unknown error')
    });
  }
}

async function reconcileStateMessages(pubkeyHex) {
  const npub = pubkeyToNpub(pubkeyHex);
  const mapping = contactRowToJson(selectContactByNpubStmt.get(npub));
  if (!mapping || !shouldReconcileNpub(npub)) return;
  try {
    await ensureRuntime();
    await reconcileMappingMessages(mapping);
  } catch (err) {
    logEvent('reconcile_error', {
      npub,
      error: err && err.message ? err.message : String(err || 'unknown error')
    });
  }
}

async function sendTextMessage(pubkeyHex, text, sessionDisplayName, retried) {
  const ensured = await ensureMappingForPubkey(pubkeyHex, sessionDisplayName);
  const npub = ensured.npub;
  let mapping = ensured.mapping;
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
    text: String(text || ''),
    attachment_name: '',
    attachment_mime: '',
    attachment_size: null,
    upload_id: '',
    error_code: '',
    error_detail: ''
  });
  rememberMessageText(seq, text, null);
  let chatItems;
  try {
    chatItems = await sendPlainTextMessage(mapping.bridge_user_id, `@${mapping.bridge_contact_id}`, text);
  } catch (err) {
    const detail = errorDetail(err);
    if (!retried) {
      try {
        mapping = await freshMappingAfterSendFailure(npub, detail, pubkeyHex, sessionDisplayName);
        chatItems = await sendPlainTextMessage(mapping.bridge_user_id, `@${mapping.bridge_contact_id}`, text);
      } catch (retryErr) {
        updateMessageBySeq(seq, {
          delivery_status: 'failed',
          error_code: 'send_failed',
          error_detail: errorDetail(retryErr)
        });
        throw retryErr;
      }
    } else {
      updateMessageBySeq(seq, {
        delivery_status: 'failed',
        error_code: 'send_failed',
        error_detail: detail
      });
      throw err;
    }
  }
  const first = chatItems[0] && chatItems[0].chatItem ? chatItems[0].chatItem : null;
  const messageRef = first && first.meta && first.meta.itemId != null ? String(first.meta.itemId) : '';
  updateMessageBySeq(seq, {
    message_ref: messageRef,
    delivery_status: first ? deliveryStatusFromChatItem(first) : 'sent'
  });
  return { npub, seq };
}

async function sendOwnerTextMessage(npubValue, text) {
  const npub = validateNpub(npubValue);
  const owner = await ensureOwnerUser();
  let mapping = contactRowToJson(selectContactByNpubStmt.get(npub));
  if (
    mapping &&
    mapping.status === 'active' &&
    mapping.bridge_user_id &&
    String(mapping.bridge_user_id) === String(owner.userId)
  ) {
    logEvent('owl_send_reprovision_legacy_mapping', { npub });
    deleteContact(npub);
    mapping = null;
  }
  if (!mapping || mapping.status !== 'active' || !mapping.simplex_contact_id) {
    mapping = contactRowToJson(await provisionContact(npub, mapping && mapping.bridge_display_name || ''));
  }
  if (!mapping || mapping.status !== 'active' || !mapping.simplex_contact_id) {
    throw new Error('Secure Chat contact is not provisioned');
  }
  await sendPlainTextMessage(String(owner.userId), `@${mapping.simplex_contact_id}`, text);
  await reconcileMappingMessages(mapping);
  return { npub };
}

function adminAttachmentFromBody(body) {
  const raw = body && body.attachment && typeof body.attachment === 'object' ? body.attachment : null;
  if (!raw) return null;
  const filePath = String(raw.filePath || raw.file_path || raw.path || '').trim();
  if (!filePath) {
    throw new Error('attachment.filePath is required');
  }
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (_err) {
    throw new Error('attachment file is not readable');
  }
  if (!stat.isFile()) {
    throw new Error('attachment path is not a regular file');
  }
  if (stat.size > MAX_UPLOAD_BYTES) {
    throw new Error('attachment exceeds server size limit');
  }
  const fileName = sanitizeName(raw.fileName || raw.file_name || raw.name || path.basename(filePath) || 'attachment.bin');
  const mimeType = String(raw.mimeType || raw.mime_type || raw.mime || 'application/octet-stream').trim().toLowerCase() || 'application/octet-stream';
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType)) {
    throw new Error('attachment MIME type is invalid');
  }
  const stagingDir = fs.mkdtempSync(path.join(STORE_ROOT, 'simplex-tmp', 'owl-send-'));
  const stagedPath = path.join(stagingDir, fileName);
  fs.copyFileSync(filePath, stagedPath);
  return {
    filePath: stagedPath,
    fileName,
    mimeType,
    fileSize: Number(raw.fileSize || raw.file_size || raw.size || stat.size || 0) || 0,
    cleanupPath: stagingDir
  };
}

function cleanupAdminAttachment(attachment) {
  const cleanupPath = attachment && attachment.cleanupPath ? String(attachment.cleanupPath) : '';
  if (!cleanupPath) return;
  const tmpRoot = path.join(STORE_ROOT, 'simplex-tmp') + path.sep;
  if (!cleanupPath.startsWith(tmpRoot)) return;
  fs.rm(cleanupPath, { recursive: true, force: true }, () => {});
}

function fileComposedMessage(attachment, text) {
  return {
    fileSource: { filePath: attachment.filePath },
    msgContent: { type: 'file', text: String(text || attachment.fileName || '') },
    mentions: {}
  };
}

async function sendOwnerFileMessage(npubValue, attachment, text) {
  const npub = validateNpub(npubValue);
  const owner = await ensureOwnerUser();
  let mapping = contactRowToJson(selectContactByNpubStmt.get(npub));
  if (
    mapping &&
    mapping.status === 'active' &&
    mapping.bridge_user_id &&
    String(mapping.bridge_user_id) === String(owner.userId)
  ) {
    logEvent('owl_file_send_reprovision_legacy_mapping', { npub });
    deleteContact(npub);
    mapping = null;
  }
  if (!mapping || mapping.status !== 'active' || !mapping.simplex_contact_id) {
    mapping = contactRowToJson(await provisionContact(npub, mapping && mapping.bridge_display_name || ''));
  }
  if (!mapping || mapping.status !== 'active' || !mapping.simplex_contact_id) {
    throw new Error('Secure Chat contact is not provisioned');
  }
  await sendComposedMessages(String(owner.userId), `@${mapping.simplex_contact_id}`, [
    fileComposedMessage(attachment, text)
  ]);
  await reconcileMappingMessages(mapping);
  return { npub };
}

function ownerContactIdFromTarget(target) {
  const value = String(target || '').trim();
  let match = value.match(/^secure-chat-contact-(\d+)$/);
  if (match) return match[1];
  match = value.match(/^secure-chat:(\d+)$/);
  if (match) return match[1];
  return '';
}

async function sendOwnerDirectTextMessage(target, text) {
  const contactId = ownerContactIdFromTarget(target);
  if (!contactId) {
    throw new Error('Secure Chat owner contact id is required');
  }
  const owner = await ensureOwnerUser();
  await sendPlainTextMessage(String(owner.userId), `@${contactId}`, text);
  return { target: `secure-chat-contact-${contactId}` };
}

async function sendOwnerDirectFileMessage(target, attachment, text) {
  const contactId = ownerContactIdFromTarget(target);
  if (!contactId) {
    throw new Error('Secure Chat owner contact id is required');
  }
  const owner = await ensureOwnerUser();
  const chatItems = await sendComposedMessages(String(owner.userId), `@${contactId}`, [
    fileComposedMessage(attachment, text)
  ]);
  rememberOwnerDirectSentAttachment(contactId, attachment, text, chatItems);
  return { target: `secure-chat-contact-${contactId}` };
}

async function dispatchOwlSend(target, attachment, text) {
  return attachment
    ? (ownerContactIdFromTarget(target)
      ? await sendOwnerDirectFileMessage(target, attachment, text)
      : await sendOwnerFileMessage(target, attachment, text))
    : (ownerContactIdFromTarget(target)
      ? await sendOwnerDirectTextMessage(target, text)
      : await sendOwnerTextMessage(target, text));
}

async function handleOwlSendPayload(body, target, attachment, text) {
  const clientMessageId = normalizeOwlSendClientMessageId(
    body.client_message_id ||
    body.clientMessageId ||
    body.outbox_id ||
    body.outboxId ||
    body.message_id ||
    body.messageId ||
    ''
  );
  const sendOnce = async () => {
    const existing = getOwlSendReceipt(clientMessageId);
    if (existing) {
      logEvent('owl_send_idempotent_replay', { client_message_id: clientMessageId });
      return Object.assign(
        { success: true, duplicate: true, client_message_id: clientMessageId },
        existing.result && typeof existing.result === 'object' ? existing.result : {}
      );
    }
    const result = await dispatchOwlSend(target, attachment, text);
    if (clientMessageId) {
      recordOwlSendReceipt(clientMessageId, result);
    }
    return Object.assign(
      { success: true },
      clientMessageId ? { duplicate: false, client_message_id: clientMessageId } : {},
      result
    );
  };
  return clientMessageId ? withOwlSendClientLock(clientMessageId, sendOnce) : sendOnce();
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

async function sendAttachmentMetadata(pubkeyHex, ticket, sessionDisplayName) {
  const descriptor = `Attachment: ${ticket.name} (${ticket.size} bytes, ${ticket.mime})`;
  await sendTextMessage(pubkeyHex, descriptor, sessionDisplayName);
}

async function sendFileMessage(pubkeyHex, uploadId, filePath, mimeType, fileSize, fileName, sessionDisplayName, retried) {
  const ensured = await ensureMappingForPubkey(pubkeyHex, sessionDisplayName);
  const npub = ensured.npub;
  let mapping = ensured.mapping;
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
    text: '',
    attachment_name: fileName,
    attachment_mime: mimeType,
    attachment_size: fileSize,
    attachment_path: filePath,
    upload_id: uploadId,
    error_code: '',
    error_detail: ''
  });
  rememberMessageText(seq, '', { name: fileName, size: fileSize });
  let chatItems;
  try {
    chatItems = await sendComposedMessages(mapping.bridge_user_id, `@${mapping.bridge_contact_id}`, [{
      fileSource: { filePath },
      msgContent: { type: 'file', text: fileName },
      mentions: {}
    }]);
  } catch (err) {
    const detail = errorDetail(err);
    if (!retried) {
      try {
        mapping = await freshMappingAfterSendFailure(npub, detail, pubkeyHex, sessionDisplayName);
        chatItems = await sendComposedMessages(mapping.bridge_user_id, `@${mapping.bridge_contact_id}`, [{
          fileSource: { filePath },
          msgContent: { type: 'file', text: fileName },
          mentions: {}
        }]);
      } catch (retryErr) {
        updateMessageBySeq(seq, {
          delivery_status: 'failed',
          error_code: 'send_failed',
          error_detail: errorDetail(retryErr)
        });
        throw retryErr;
      }
    } else {
      updateMessageBySeq(seq, {
        delivery_status: 'failed',
        error_code: 'send_failed',
        error_detail: detail
      });
      throw err;
    }
  }
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
    owner_contact_link: state.ownerContactLink || '',
    max_upload_bytes: MAX_UPLOAD_BYTES
  };
}

async function ensureRuntime() {
  try {
    if (BROWSER_OWNER_CONTACT_LINK) {
      state.ownerContactLink = BROWSER_OWNER_CONTACT_LINK;
      metaSet('owner_contact_link', state.ownerContactLink);
      state.transportStatus = 'connected';
      state.transportError = '';
      return;
    }
    const owner = await ensureOwnerUser();
    if (owner && owner.userId && !isReusableSimplexContactLink(state.ownerContactLink)) {
      const ownerLink = await ownerAddressLink(String(owner.userId), false);
      if (ownerLink) {
        state.ownerContactLink = ownerLink;
        metaSet('owner_contact_link', state.ownerContactLink);
      }
    }
    state.transportStatus = 'connected';
    state.transportError = '';
  } catch (err) {
    state.transportStatus = 'degraded';
    state.transportError = err && err.message ? err.message : 'Secure Chat transport unavailable';
  }
}

function statePayload(pubkeyHex, sinceSeq, admin, sessionDisplayName) {
  const npub = pubkeyToNpub(pubkeyHex);
  const mapping = contactRowToJson(selectContactByNpubStmt.get(npub));
  const limit = 100;
  const mappedRows = sinceSeq > 0
    ? selectMessagesSinceStmt.all(npub, Number(sinceSeq), limit)
    : selectRecentMessagesStmt.all(npub, limit).reverse();
  const ownerDirectRows = loadOwnerDirectMessages()
    .filter((row) => row.npub === npub)
    .filter((row) => sinceSeq <= 0 || Number(row.seq || 0) > sinceSeq)
    .map(ownerDirectStateRow)
    .filter(Boolean);
  const rawRows = mappedRows.concat(ownerDirectRows)
    .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))
    .slice(-limit);
  const cursorSeq = rawRows.length
    ? Math.max(Number(sinceSeq || 0), ...rawRows.map((row) => Number(row.seq || 0) || 0))
    : Number(sinceSeq || 0);
  const rows = rawRows.filter(visibleMessageRow);
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
    cursor_seq: cursorSeq,
    session_display_name: sanitizeSimplexDisplayName(sessionDisplayName, ''),
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

async function owlExportPayload(sinceSeq) {
  await reconcileAllMappingMessagesForOwlExport();
  await reconcileOwnerDirectMessagesForOwlExport();
  const since = Number(sinceSeq || 0);
  const messages = [];
  const mappings = selectMappingsStmt.all(500).map(contactRowToJson);
  for (const mapping of mappings) {
    if (!mapping || !mapping.npub || mapping.status !== 'active') continue;
    const rows = loadMessages(mapping.npub)
      .filter((row) => Number(row.seq || 0) > since)
      .filter(visibleMessageRow);
    for (const row of rows) {
      messages.push(mapOwlExportRow(mapping, row));
    }
  }
  for (const row of loadOwnerDirectMessages()
    .filter((item) => Number(item.seq || 0) > since)
    .filter((item) => String(item.direction || '') === 'incoming')) {
    if (visibleMessageRow(row)) {
      messages.push(mapOwnerDirectOwlExportRow(row));
    }
  }
  messages.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  const cursorSeq = messages.length ? Number(messages[messages.length - 1].seq || since || 0) : since;
  return {
    success: true,
    service: currentServiceStatus(),
    cursor_seq: cursorSeq,
    mappings,
    messages
  };
}

async function handleState(req, res) {
  const body = await parseJsonBody(req);
  const pubkeyHex = String(body.sessionPubkey || '').trim().toLowerCase();
  const sessionDisplayName = sessionDisplayNameFromBody(body);
  const sinceSeq = Number(body.sinceSeq || 0);
  const admin = body.admin === true;
  if (pubkeyHex) {
    await reconcileStateMessages(pubkeyHex);
  }
  safeJson(res, 200, statePayload(pubkeyHex, sinceSeq, admin, sessionDisplayName));
}

async function handleSend(req, res) {
  const body = await parseJsonBody(req);
  const pubkeyHex = String(body.sessionPubkey || '').trim().toLowerCase();
  const sessionDisplayName = sessionDisplayNameFromBody(body);
  const text = String(body.text || '');
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (!pubkeyHex) {
    safeJson(res, 400, { success: false, error: 'sessionPubkey is required' });
    return;
  }
  const tickets = [];
  if (text.trim()) {
    await sendTextMessage(pubkeyHex, text, sessionDisplayName);
  }
  for (const attachment of attachments) {
    const ticket = queueUploadTicket(pubkeyHex, attachment || {});
    tickets.push(ticket);
    await sendAttachmentMetadata(pubkeyHex, ticket, sessionDisplayName);
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
  const sessionDisplayName = sanitizeSimplexDisplayName(req.headers['x-session-display-name'] || '', '');
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
    await sendFileMessage(pubkeyHex, uploadId, diskPath, mimeType, received, safeName, sessionDisplayName);
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
  } else if (action === 'rotate-owner-address') {
    const owner = await ensureOwnerUser();
    state.ownerContactLink = await ownerAddressLink(String(owner.userId), true);
    metaSet('owner_contact_link', state.ownerContactLink);
  } else if (action === 'owl-export') {
    safeJson(res, 200, await owlExportPayload(body.sinceSeq || body.since_seq || 0));
    return;
  } else if (action === 'owl-send') {
    await ensureRuntime();
    const text = String(body.text || '');
    let attachment = null;
    try {
      attachment = adminAttachmentFromBody(body);
    } catch (err) {
      safeJson(res, 400, { success: false, error: err && err.message ? err.message : 'attachment is invalid' });
      return;
    }
    if (!text.trim() && !attachment) {
      safeJson(res, 400, { success: false, error: 'text is required' });
      return;
    }
    const target = String(body.target || body.npub || '').trim();
    let result;
    try {
      result = await handleOwlSendPayload(body, target, attachment, text);
    } finally {
      cleanupAdminAttachment(attachment);
    }
    safeJson(res, 200, result);
    return;
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
    const detail = errorDetail(err);
    logEvent('request_error', { error: detail });
    safeJson(res, 500, { success: false, error: detail || 'Internal error' });
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
