#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STORE_ROOT = process.env.SECURE_CHAT_STORE_DIR || '';

if (!STORE_ROOT) {
  process.stdout.write(JSON.stringify({
    success: false,
    error: 'Secure Chat fast Owl export is not configured',
    code: 'fast_export_unavailable'
  }) + '\n');
  process.exit(0);
}

const CONTACTS_DIR = path.join(STORE_ROOT, 'contacts');
const MESSAGES_DIR = path.join(STORE_ROOT, 'messages');

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return fallback;
  }
}

function validateNpub(npub) {
  const value = String(npub || '').trim().toLowerCase();
  if (!/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(value)) {
    throw new Error('Invalid npub');
  }
  return value;
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
    status: String(row.status || 'queued'),
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
    text: row.text == null ? '' : String(row.text),
    attachment_name: row.attachment_name == null ? '' : String(row.attachment_name),
    attachment_mime: row.attachment_mime == null ? '' : String(row.attachment_mime),
    attachment_size: row.attachment_size == null || row.attachment_size === '' ? null : Number(row.attachment_size),
    upload_id: row.upload_id == null ? '' : String(row.upload_id),
    error_code: row.error_code == null ? '' : String(row.error_code),
    error_detail: row.error_detail == null ? '' : String(row.error_detail)
  };
}

function visibleMessageRow(row) {
  return row && (row.message_kind === 'text' || row.message_kind === 'file');
}

function mapMessageRow(row) {
  const attachmentName = row.attachment_name || '';
  return {
    seq: Number(row.seq),
    direction: String(row.direction || 'outgoing'),
    message_ref: row.message_ref == null ? '' : String(row.message_ref),
    message_kind: String(row.message_kind || 'text'),
    delivery_status: String(row.delivery_status || 'unknown'),
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
    text: row.text || '',
    attachment: attachmentName ? {
      name: attachmentName,
      mime: row.attachment_mime || '',
      size: Number(row.attachment_size || 0),
      upload_id: row.upload_id || ''
    } : null,
    error_code: row.error_code || '',
    error_detail: row.error_detail || ''
  };
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
    contact_name: `Nostr ${String(row.npub || '').slice(0, 12)}`,
    simplex_address: mapping && mapping.simplex_contact_id ? `secure-chat:${mapping.simplex_contact_id}` : '',
    body,
    subject: 'Website Secure Chat',
    from_self: String(row.direction || '') === 'incoming',
    in_inbox: String(row.direction || '') === 'outgoing',
    source: 'nostr-blog-secure-chat'
  });
}

function listJsonRows(dirPath) {
  let names;
  try {
    names = fs.readdirSync(dirPath);
  } catch (_err) {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJsonFile(path.join(dirPath, name), null));
}

function loadMappings() {
  return listJsonRows(CONTACTS_DIR).map(normalizeContactRow).filter(Boolean);
}

function loadMessages(npub) {
  const rows = readJsonFile(path.join(MESSAGES_DIR, `${validateNpub(npub)}.json`), []);
  return Array.isArray(rows) ? rows.map(normalizeMessageRow).filter(Boolean) : [];
}

function main() {
  const since = Number(process.argv[2] || 0) || 0;
  const mappings = loadMappings();
  const messages = [];
  for (const mapping of mappings) {
    for (const row of loadMessages(mapping.npub)) {
      if (Number(row.seq || 0) <= since || !visibleMessageRow(row)) continue;
      messages.push(mapOwlExportRow(mapping, row));
    }
  }
  messages.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  const cursorSeq = messages.length ? Number(messages[messages.length - 1].seq || since || 0) : since;
  process.stdout.write(JSON.stringify({
    success: true,
    service: { status: 'file-export' },
    cursor_seq: cursorSeq,
    mappings,
    messages
  }) + '\n');
}

try {
  main();
} catch (err) {
  process.stdout.write(JSON.stringify({
    success: false,
    error: err && err.message ? err.message : String(err || 'Secure Chat fast Owl export failed'),
    code: 'fast_export_failed'
  }) + '\n');
}
