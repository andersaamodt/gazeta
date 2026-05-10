#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STORE_ROOT = process.env.SECURE_CHAT_STORE_DIR || '';

if (!STORE_ROOT) {
  process.stdout.write(JSON.stringify({
    success: false,
    error: 'Secure Chat fast state is not configured',
    code: 'fast_state_unavailable'
  }) + '\n');
  process.exit(0);
}

const CONTACTS_DIR = path.join(STORE_ROOT, 'contacts');
const MESSAGES_DIR = path.join(STORE_ROOT, 'messages');
const UPLOADS_DIR = path.join(STORE_ROOT, '..', 'uploads');

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return fallback;
  }
}

function validateNpub(npub) {
  const value = String(npub || '').trim().toLowerCase();
  if (!/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(value)) throw new Error('Invalid npub');
  return value;
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
  for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
  return bytes;
}

function pubkeyToNpub(pubkeyHex) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const data = convertBits(hexToBytes(pubkeyHex), 8, 5);
  return 'npub1' + data.concat(bech32CreateChecksum('npub', data)).map((value) => alphabet[value]).join('');
}

function contactFilePath(npub) {
  return path.join(CONTACTS_DIR, `${validateNpub(npub)}.json`);
}

function messagesFilePath(npub) {
  return path.join(MESSAGES_DIR, `${validateNpub(npub)}.json`);
}

function normalizeContactRow(row, npub) {
  if (!row || typeof row !== 'object') {
    return npub ? {
      npub,
      simplex_contact_id: '',
      bridge_user_id: '',
      bridge_contact_id: '',
      status: 'queued',
      created_at: '',
      updated_at: '',
      deactivated_at: '',
      last_provisioned_at: '',
      last_error: ''
    } : null;
  }
  let normalizedNpub;
  try {
    normalizedNpub = validateNpub(row.npub || npub);
  } catch (_err) {
    return null;
  }
  return {
    npub: normalizedNpub,
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

function loadMessages(npub) {
  const rows = readJsonFile(messagesFilePath(npub), []);
  return Array.isArray(rows) ? rows.map(normalizeMessageRow).filter(Boolean) : [];
}

function listMappings() {
  let names;
  try {
    names = fs.readdirSync(CONTACTS_DIR);
  } catch (_err) {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.json'))
    .map((name) => normalizeContactRow(readJsonFile(path.join(CONTACTS_DIR, name), null), null))
    .filter(Boolean);
}

function loadUploadTickets(npub) {
  const rows = readJsonFile(path.join(UPLOADS_DIR, `${validateNpub(npub)}.json`), []);
  return Array.isArray(rows) ? rows : [];
}

function main() {
  const payload = readJsonFile(process.argv[2] || '', null);
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Secure Chat state payload');
  const npub = pubkeyToNpub(payload.sessionPubkey);
  const since = Number(payload.sinceSeq || payload.since_seq || 0) || 0;
  const includeAdmin = payload.admin === true;
  const mapping = normalizeContactRow(readJsonFile(contactFilePath(npub), null), npub);
  const messages = loadMessages(npub)
    .filter((row) => Number(row.seq || 0) > since)
    .filter(visibleMessageRow)
    .map(mapMessageRow)
    .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  const cursorSeq = messages.length ? Number(messages[messages.length - 1].seq || since || 0) : since;
  const response = {
    success: true,
    npub,
    service: { status: 'file-state' },
    mapping,
    cursor_seq: cursorSeq,
    messages,
    uploads: loadUploadTickets(npub)
  };
  if (includeAdmin) {
    response.admin = { mappings: listMappings() };
  }
  process.stdout.write(JSON.stringify(response) + '\n');
}

try {
  main();
} catch (err) {
  process.stdout.write(JSON.stringify({
    success: false,
    error: err && err.message ? err.message : String(err || 'Secure Chat fast state failed'),
    code: 'fast_state_failed'
  }) + '\n');
}
