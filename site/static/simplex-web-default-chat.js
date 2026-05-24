(function (global) {
  'use strict';

  // SPDX-License-Identifier: AGPL-3.0-only
  //
  // This file is deliberately framework-free. Host pages pass in a plain chat
  // model, this module turns that model into escaped HTML, and mount() wires
  // browser events back to callbacks supplied by the host page.

  var MAX_RENDER_MESSAGES = 200;
  var MAX_RENDER_UPLOADS = 50;
  var MAX_TEXT_LENGTH = 4000;
  var MAX_LABEL_LENGTH = 256;
  var MAX_STATUS_LENGTH = 64;
  var MAX_ATTACHMENT_DATA_URL_LENGTH = 1200000;
  var SPINNER_ANIMATION_MS = 800;

  function escapeHtml(value) {
    // Every value that came from storage, SimpleX, or user input is treated as
    // hostile until it passes through this function before entering HTML.
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function limitString(value, maxLength) {
    return String(value == null ? '' : value).slice(0, maxLength);
  }

  function clampProgress(value) {
    var progress = Number(value);
    if (!isFinite(progress)) {
      return 0;
    }
    progress = Math.floor(progress);
    if (progress < 0) return 0;
    if (progress > 100) return 100;
    return progress;
  }

  function clampNonNegativeInteger(value) {
    var count = Number(value);
    if (!isFinite(count) || count < 0) {
      return 0;
    }
    return Math.floor(count);
  }

  function normalizeAttachment(value) {
    // Normalize imported attachment metadata to one predictable shape and clamp
    // every field before the renderer decides whether anything can be loaded.
    var next = value && typeof value === 'object' ? value : null;
    if (!next) {
      return null;
    }
    return {
      name: limitString(next.name || 'Attachment', MAX_LABEL_LENGTH),
      mime: limitString(next.mime || '', MAX_LABEL_LENGTH),
      size: clampNonNegativeInteger(next.size),
      upload_id: limitString(next.upload_id || '', MAX_LABEL_LENGTH),
      data_url: limitString(next.data_url || next.dataUrl || '', MAX_ATTACHMENT_DATA_URL_LENGTH),
      url: limitString(next.url || '', MAX_TEXT_LENGTH)
    };
  }

  function attachmentKind(attachment) {
    var mime = String(attachment && attachment.mime || '').toLowerCase();
    if (mime.indexOf('image/') === 0) return 'image';
    if (mime.indexOf('video/') === 0) return 'video';
    if (mime.indexOf('audio/') === 0) return 'audio';
    return 'file';
  }

  function formatBytes(size) {
    var value = clampNonNegativeInteger(size);
    if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' MB';
    if (value >= 1024) return (value / 1024).toFixed(1).replace(/\.0$/, '') + ' KB';
    return String(value) + ' B';
  }

  function dataMimeMatchesKind(mime, kind) {
    var value = String(mime || '').toLowerCase();
    if (!value || value === 'image/svg+xml') return false;
    if (kind === 'image') return value.indexOf('image/') === 0;
    if (kind === 'video') return value.indexOf('video/') === 0;
    if (kind === 'audio') return value.indexOf('audio/') === 0;
    return value === 'application/octet-stream' ||
      value === 'application/pdf' ||
      value === 'text/plain' ||
      value.indexOf('image/') === 0 ||
      value.indexOf('video/') === 0 ||
      value.indexOf('audio/') === 0;
  }

  function safeAttachmentUrl(value, kind) {
    // Only inline data URLs with safe media MIME types and local blob URLs are
    // allowed to auto-load. Network URLs, including loopback URLs, are rendered
    // as inert labels so imported history cannot force browser fetches.
    var raw = String(value || '').trim();
    var match;
    if (!raw || /[\x00-\x20\x7f]/.test(raw)) return '';
    match = raw.match(/^data:([^;,]+);base64,[A-Za-z0-9+/=]+$/i);
    if (match) {
      return dataMimeMatchesKind(match[1], kind) ? raw : '';
    }
    if (/^data:/i.test(raw)) return '';
    if (/^blob:/i.test(raw)) return raw;
    return '';
  }

  function renderAttachment(message) {
    // Render the media preview when a safe URL exists, but always include a
    // plain attachment label so unsafe URLs still show useful metadata.
    var attachment = message && message.attachment;
    if (!attachment) return '';
    var name = String(attachment.name || 'Attachment');
    var mime = String(attachment.mime || 'application/octet-stream');
    var dataUrl = String(attachment.data_url || attachment.dataUrl || '');
    var kind = attachmentKind(attachment);
    var mediaUrl = safeAttachmentUrl(dataUrl, kind) || safeAttachmentUrl(attachment.url || '', kind);
    var meta = '<span class="secure-chat-attachment-meta">' + escapeHtml(mime || 'file') + ' · ' + escapeHtml(formatBytes(attachment.size)) + '</span>';
    var html = '<div class="secure-chat-attachment secure-chat-attachment-' + kind + '">';
    if (mediaUrl && kind === 'image') {
      html += '<img class="secure-chat-attachment-media" src="' + escapeAttr(mediaUrl) + '" alt="' + escapeAttr(name) + '" loading="lazy">';
    } else if (mediaUrl && kind === 'video') {
      html += '<video class="secure-chat-attachment-media" src="' + escapeAttr(mediaUrl) + '" controls preload="metadata"></video>';
    } else if (mediaUrl && kind === 'audio') {
      html += '<audio class="secure-chat-attachment-audio" src="' + escapeAttr(mediaUrl) + '" controls preload="metadata"></audio>';
    }
    html += '<a class="secure-chat-attachment-file" href="' + (mediaUrl ? escapeAttr(mediaUrl) : '#') + '" download="' + escapeAttr(name) + '">';
    html += '<span class="secure-chat-attachment-line"><span class="secure-chat-attachment-name">' + escapeHtml(name) + '</span>' + meta + '</span></a>';
    html += '</div>';
    return html;
  }

  function normalizeMessage(value) {
    var next = value && typeof value === 'object' ? value : {};
    var direction = String(next.direction || '').trim().toLowerCase() === 'incoming' ? 'incoming' : 'outgoing';
    return {
      direction: direction,
      message_ref: limitString(next.message_ref || next.messageRef || '', MAX_LABEL_LENGTH),
      message_kind: String(next.message_kind || '').trim().toLowerCase() === 'file' ? 'file' : 'text',
      delivery_status: limitString(next.delivery_status || '', MAX_STATUS_LENGTH),
      created_at: limitString(next.created_at || '', MAX_LABEL_LENGTH),
      text: limitString(next.text || '', MAX_TEXT_LENGTH),
      attachment: normalizeAttachment(next.attachment)
    };
  }

  function normalizeUpload(value) {
    var next = value && typeof value === 'object' ? value : {};
    return {
      upload_id: limitString(next.upload_id || '', MAX_LABEL_LENGTH),
      name: limitString(next.name || 'Attachment', MAX_LABEL_LENGTH),
      status: limitString(next.status || 'queued', MAX_STATUS_LENGTH),
      progress: clampProgress(next.progress)
    };
  }

  function normalizePendingFile(value, index) {
    var next = value && typeof value === 'object' ? value : {};
    return {
      id: limitString(next.id || next.upload_id || next.name || String(index || 0), MAX_LABEL_LENGTH),
      name: limitString(next.name || 'Attachment', MAX_LABEL_LENGTH),
      mime: limitString(next.mime || next.type || '', MAX_LABEL_LENGTH),
      size: clampNonNegativeInteger(next.size)
    };
  }

  function normalizeVoicePermission(value) {
    var raw = String(value || '').trim().toLowerCase();
    return raw === 'granted' || raw === 'requested' || raw === 'denied' ? raw : 'locked';
  }

  function normalizeEmoji(value) {
    return limitString(String(value || '').trim(), 32);
  }

  function normalizeRecentEmojis(value) {
    var seen = {};
    var out = [];
    (Array.isArray(value) ? value : []).forEach(function (item) {
      var emoji = normalizeEmoji(item);
      if (!emoji || seen[emoji]) return;
      seen[emoji] = true;
      out.push(emoji);
    });
    return out.slice(0, 32);
  }

  function normalizeEmojiLabel(value) {
    return limitString(String(value || '').trim(), MAX_LABEL_LENGTH);
  }

  function normalizeEmojiItem(value) {
    var next = value && typeof value === 'object' ? value : {};
    var unicode = normalizeEmoji(next.unicode || next.emoji || '');
    if (!unicode) return null;
    return {
      unicode: unicode,
      label: normalizeEmojiLabel(next.label || next.annotation || next.name || unicode)
    };
  }

  function normalizeEmojiGroups(value) {
    return (Array.isArray(value) ? value : []).slice(0, 12).map(function (group) {
      var next = group && typeof group === 'object' ? group : {};
      return {
        id: normalizeEmojiLabel(next.id || ''),
        label: normalizeEmojiLabel(next.label || ''),
        emojis: (Array.isArray(next.emojis) ? next.emojis : []).slice(0, 400).map(normalizeEmojiItem).filter(Boolean)
      };
    }).filter(function (group) {
      return group.id && group.label;
    });
  }

  function normalizeEmojiItems(value) {
    return (Array.isArray(value) ? value : []).slice(0, 200).map(normalizeEmojiItem).filter(Boolean);
  }

  function normalizeAdminRow(value) {
    var next = value && typeof value === 'object' ? value : {};
    return {
      npub: limitString(next.npub || '', MAX_LABEL_LENGTH),
      simplex_contact_id: limitString(next.simplex_contact_id || '', MAX_LABEL_LENGTH),
      status: limitString(next.status || '', MAX_STATUS_LENGTH)
    };
  }

  function normalizeSavedCount(value) {
    var count = Number(value);
    if (!isFinite(count) || count < 0) {
      return 0;
    }
    return Math.floor(count);
  }

  function normalizeSavedSummary(value) {
    var next = value && typeof value === 'object' ? value : {};
    return {
      messages: normalizeSavedCount(next.messages),
      attachments: normalizeSavedCount(next.attachments)
    };
  }

  function pluralizeCount(count, singular, plural) {
    return String(count) + ' ' + (count === 1 ? singular : (plural || singular + 's'));
  }

  function savedSummaryText(summary) {
    var messages = Number(summary && summary.messages || 0);
    var attachments = Number(summary && summary.attachments || 0);
    if (messages <= 0 && attachments <= 0) {
      return '';
    }
    var parts = [];
    if (messages > 0) {
      parts.push(pluralizeCount(messages, 'message'));
    }
    if (attachments > 0) {
      parts.push(pluralizeCount(attachments, 'attachment'));
    }
    return parts.join(', ');
  }

  function normalizeService(value) {
    var next = value && typeof value === 'object' ? value : null;
    if (!next) {
      return null;
    }
    return {
      transport_status: limitString(next.transport_status || '', MAX_STATUS_LENGTH),
      transport_error: limitString(next.transport_error || '', MAX_TEXT_LENGTH)
    };
  }

  function statusLabel(message) {
    var raw = limitString(message && message.delivery_status || '', MAX_STATUS_LENGTH).trim();
    switch (raw) {
      case 'sndRcvd':
      case 'delivered':
        return 'Delivered';
      case 'read':
      case 'sndRead':
      case 'readReceipt':
        return 'Read';
      case 'sndSent':
      case 'sent':
        return 'Sent';
      case 'file-invitation-sent':
      case 'contact-requested':
        return 'Sending...';
      case 'failed':
      case 'sndError':
      case 'sndErrorAuth':
        return 'Failed';
      case 'warning':
      case 'sndWarning':
        return 'Warning';
      case 'received':
      case 'rcvNew':
      case 'rcvRead':
        return 'Received';
      case 'sndNew':
      case 'sending':
        return 'Sending...';
      case 'uploading':
        return 'Uploading';
      default:
        return raw ? raw : 'Queued';
    }
  }

  function statusIsSending(message) {
    var raw = limitString(message && message.delivery_status || '', MAX_STATUS_LENGTH).trim();
    return raw === 'sndNew' || raw === 'sending' || raw === 'file-invitation-sent';
  }

  function spinnerPhaseStyle() {
    var clock = global && global.performance && typeof global.performance.now === 'function'
      ? global.performance
      : null;
    var now = clock ? clock.now() : Date.now();
    var phase = Math.floor(Math.abs(Number(now) || 0) % SPINNER_ANIMATION_MS);
    return ' style="animation-delay:-' + String(phase) + 'ms"';
  }

  function spinnerHtml(className) {
    return '<span class="save-spinner ' + className + '"' + spinnerPhaseStyle() + ' aria-hidden="true"></span>';
  }

  function statusIconHtml(label) {
    if (label === 'Delivered' || label === 'Read') {
      return '<span class="secure-chat-status is-delivered" aria-label="' + escapeAttr(label) + '" title="' + escapeAttr(label) + '"><span class="secure-chat-status-check" aria-hidden="true">✓✓</span></span>';
    }
    if (label === 'Sent') {
      return '<span class="secure-chat-status is-sent" aria-label="' + escapeAttr(label) + '" title="' + escapeAttr(label) + '"><span class="secure-chat-status-check" aria-hidden="true">✓</span></span>';
    }
    return '';
  }

  function statusHtml(message) {
    var label = statusLabel(message);
    var icon = statusIconHtml(label);
    if (statusIsSending(message)) {
      return '<span class="secure-chat-status is-sending"><span>' + escapeHtml(label) + '</span>' + spinnerHtml('secure-chat-status-spinner') + '</span>';
    }
    if (icon) return icon;
    return '<span class="secure-chat-status">' + escapeHtml(label) + '</span>';
  }

  function formatRelativeTime(value, nowMs) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var then = Date.parse(raw);
    if (!isFinite(then)) return raw;
    var now = isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    var seconds = Math.max(0, Math.floor((now - then) / 1000));
    if (seconds < 60) return 'just now';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return String(minutes) + 'm ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return String(hours) + 'h ago';
    var days = Math.floor(hours / 24);
    if (days < 7) return String(days) + 'd ago';
    var weeks = Math.floor(days / 7);
    if (weeks < 5) return String(weeks) + 'w ago';
    var months = Math.floor(days / 30);
    if (months < 12) return String(Math.max(1, months)) + 'mo ago';
    return String(Math.max(1, Math.floor(days / 365))) + 'y ago';
  }

  function timeHtml(value) {
    var raw = String(value || '');
    if (!raw) return '<time></time>';
    return '<time datetime="' + escapeAttr(raw) + '" title="' + escapeAttr(raw) + '">' + escapeHtml(formatRelativeTime(raw)) + '</time>';
  }

  function platformText() {
    var nav = global && global.navigator ? global.navigator : null;
    var userAgentData = nav && nav.userAgentData && typeof nav.userAgentData.platform === 'string'
      ? nav.userAgentData.platform
      : '';
    return [
      userAgentData,
      nav && typeof nav.platform === 'string' ? nav.platform : '',
      nav && typeof nav.userAgent === 'string' ? nav.userAgent : ''
    ].join(' ').toLowerCase();
  }

  function shortcutModifierLabel(model) {
    var configured = model && typeof model.shortcutModifierLabel === 'string'
      ? limitString(model.shortcutModifierLabel.trim(), MAX_LABEL_LENGTH)
      : '';
    if (configured) {
      return configured;
    }
    return /\bmac|iphone|ipad|ipod/.test(platformText()) ? '⌘' : 'Ctrl';
  }

  function normalizeModel(model) {
    // The renderer has a narrow input contract. This defensive pass lets old
    // state, malformed adapter responses, and hostile storage values degrade
    // into bounded defaults instead of changing the DOM shape.
    var next = model && typeof model === 'object' ? model : {};
    var messages = Array.isArray(next.messages) ? next.messages.slice(-MAX_RENDER_MESSAGES).map(normalizeMessage) : [];
    var uploads = Array.isArray(next.uploads) ? next.uploads.slice(-MAX_RENDER_UPLOADS).map(normalizeUpload) : [];
    var pendingFiles = Array.isArray(next.pendingFiles) ? next.pendingFiles.slice(0, MAX_RENDER_UPLOADS).map(normalizePendingFile) : [];
    var adminMappings = Array.isArray(next.adminMappings) ? next.adminMappings.slice(0, MAX_RENDER_MESSAGES).map(normalizeAdminRow) : [];
    return {
      loggedIn: !!next.loggedIn,
      loading: !!next.loading,
      hasSigner: next.hasSigner !== false,
      error: limitString(next.error || '', MAX_TEXT_LENGTH),
      sending: !!next.sending,
      draftText: limitString(next.draftText || '', MAX_TEXT_LENGTH),
      service: normalizeService(next.service),
      messages: messages,
      uploads: uploads,
      pendingFiles: pendingFiles,
      sendWithModifier: next.sendWithModifier === true,
      shortcutModifierLabel: shortcutModifierLabel(next),
      emojiPickerOpen: next.emojiPickerOpen === true,
      emojiPickerLoading: next.emojiPickerLoading === true,
      emojiPickerError: limitString(next.emojiPickerError || '', MAX_TEXT_LENGTH),
      emojiPickerQuery: limitString(next.emojiPickerQuery || '', MAX_LABEL_LENGTH),
      emojiGroups: normalizeEmojiGroups(next.emojiGroups),
      emojiSearchResults: normalizeEmojiItems(next.emojiSearchResults),
      recentEmojis: normalizeRecentEmojis(next.recentEmojis),
      voiceNoteSupported: next.voiceNoteSupported !== false,
      voicePermission: normalizeVoicePermission(next.voicePermission),
      voiceRecording: next.voiceRecording === true,
      simplexWebIntroDismissed: next.simplexWebIntroDismissed === true,
      chatStarted: next.chatStarted !== false,
      chatOpening: next.chatOpening === true,
      chatClosing: next.chatClosing === true,
      hideHeading: next.hideHeading === true,
      savedSummary: normalizeSavedSummary(next.savedSummary),
      admin: !!next.admin,
      adminMappings: adminMappings
    };
  }

  function renderSimplexWebIntro() {
    var html = '<aside class="secure-chat-simplex-info" role="note">';
    html += '<button type="button" class="secure-chat-simplex-dismiss" data-secure-chat-action="dismiss-simplex-info" aria-label="Dismiss Secure Chat info" title="Dismiss">';
    html += '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    html += '</button>';
    html += '<p>Messages are sent over SimpleX Chat using <a href="https://github.com/andersaamodt/simplex-web" rel="noopener noreferrer">simplex-web</a>, so encryption and delivery happen in the browser instead of exposing plaintext to this server. SimpleX uses end-to-end encrypted pairwise queues, so relays do not need public user identities to pass messages.</p>';
    html += '</aside>';
    return html;
  }

  function renderSendIcon() {
    return '<svg class="secure-chat-send-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 9-18 9 4-9-4-9Z"/><path d="M7 12h14"/></svg>';
  }

  function renderMicIcon() {
    return '<svg class="secure-chat-mic-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/><path d="M8 22h8"/></svg>';
  }

  function renderEmojiIcon() {
    return '<svg class="secure-chat-emoji-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M8.4 10.1h.01M15.6 10.1h.01M8.6 14.2c.78 1.2 1.9 1.8 3.4 1.8s2.62-.6 3.4-1.8"/></svg>';
  }

  function renderEmojiSectionIcon(id) {
    var icons = {
      recent: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v6l4 2"/><path d="M4 12a8 8 0 1 0 2.35-5.65"/><path d="M4 4v5h5"/></svg>',
      'smileys-emotion': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M8.5 10h.01M15.5 10h.01M8.5 14.4c1.7 1.6 5.3 1.6 7 0"/></svg>',
      'people-body': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a2 2 0 0 1 4 0v3"/><path d="M11 10V6a2 2 0 0 1 4 0v5"/><path d="M15 11V8a2 2 0 0 1 4 0v5c0 4-2.6 7-6.6 7H11c-3.4 0-6-2.6-6-6v-2.5a1.8 1.8 0 0 1 3.2-1.1L10 13"/></svg>',
      'animals-nature': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 14c3-5 8-7 14-7-1 6-4 11-10 12"/><path d="M5 14c1.2 1.2 2.5 2.5 4 5"/><path d="M7 13c3 0 6-1 9-4"/></svg>',
      'food-drink': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7c1.7-2.4 4-1.8 5.1-.3 2.2 3 .1 10.3-5.1 12-5.2-1.7-7.3-9-5.1-12C8 5.2 10.3 4.6 12 7Z"/><path d="M12 7c0-2 1-3.5 3-4"/></svg>',
      'travel-places': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13l2-5h12l2 5"/><path d="M5 13h14v5H5z"/><path d="M7 18v2M17 18v2M7.5 15h.01M16.5 15h.01"/></svg>',
      activities: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M5 10c4 0 7-2 9-5"/><path d="M9 20c.3-4 2.7-7.3 8-10"/><path d="M4 14c4 .2 7 2 9 6"/></svg>',
      objects: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M8 14c-1.5-1.2-2.5-3-2.5-5a6.5 6.5 0 0 1 13 0c0 2-1 3.8-2.5 5-.7.6-1 1.2-1 2H9c0-.8-.3-1.4-1-2Z"/></svg>',
      symbols: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14v12H5z"/><path d="M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01"/></svg>',
      flags: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4"/><path d="M6 5h11l-2 4 2 4H6"/></svg>'
    };
    return icons[id] || icons['smileys-emotion'];
  }

  function renderEmojiSectionTabs() {
    var tabs = [
      ['recent', 'Recently Used'],
      ['smileys-emotion', 'Smileys & Emotion'],
      ['people-body', 'People & Body'],
      ['animals-nature', 'Animals & Nature'],
      ['food-drink', 'Food & Drink'],
      ['travel-places', 'Travel & Places'],
      ['activities', 'Activities'],
      ['objects', 'Objects'],
      ['symbols', 'Symbols'],
      ['flags', 'Flags']
    ];
    var html = '<div class="secure-chat-emoji-section-tabs" role="tablist" aria-label="Emoji sections">';
    tabs.forEach(function (tab, index) {
      html += '<button type="button" class="' + (index === 0 ? 'is-active' : '') + '" role="tab" aria-selected="' + (index === 0 ? 'true' : 'false') + '" data-secure-chat-action="emoji-section" data-secure-chat-section="' + escapeAttr(tab[0]) + '" aria-label="Show ' + escapeAttr(tab[1]) + '" title="' + escapeAttr(tab[1]) + '">' + renderEmojiSectionIcon(tab[0]) + '</button>';
    });
    html += '</div>';
    return html;
  }

  function renderEmojiGrid(emojis, emptyText) {
    if (!emojis.length) {
      return '<p class="secure-chat-emoji-empty">' + escapeHtml(emptyText || 'No emojis found.') + '</p>';
    }
    var html = '<div class="secure-chat-emoji-grid">';
    emojis.forEach(function (emoji) {
      html += '<button type="button" class="secure-chat-emoji-choice" data-secure-chat-action="emoji-pick" data-secure-chat-emoji="' + escapeAttr(emoji.unicode) + '" aria-label="Insert ' + escapeAttr(emoji.label) + '">' + escapeHtml(emoji.unicode) + '</button>';
    });
    html += '</div>';
    return html;
  }

  function recentEmojiItems(state) {
    return normalizeRecentEmojis(state.recentEmojis).map(function (emoji) {
      return { unicode: emoji, label: emoji };
    });
  }

  function renderEmojiScrollableSections(state) {
    var query = String(state.emojiPickerQuery || '').trim();
    var html = '<div class="secure-chat-emoji-scroll" data-secure-chat-emoji-scroll>';
    html += '<section class="secure-chat-emoji-section secure-chat-emoji-recent" data-secure-chat-section-panel="recent" aria-label="Recently Used"><h3>Recently Used</h3>';
    html += renderEmojiGrid(recentEmojiItems(state), 'No recent emojis yet.');
    html += '</section>';
    if (query) {
      html += '<section class="secure-chat-emoji-section" data-secure-chat-section-panel="search" aria-label="Search Results"><h3>Search Results</h3>';
      html += renderEmojiGrid(state.emojiSearchResults, 'No matching emojis.');
      html += '</section>';
    } else {
      state.emojiGroups.forEach(function (group) {
        html += '<section class="secure-chat-emoji-section" data-secure-chat-section-panel="' + escapeAttr(group.id) + '" aria-label="' + escapeAttr(group.label) + '"><h3>' + escapeHtml(group.label) + '</h3>';
        html += renderEmojiGrid(group.emojis, 'No emojis in this section.');
        html += '</section>';
      });
    }
    html += '</div>';
    return html;
  }

  function voiceButtonLabel(state) {
    if (!state.voiceNoteSupported) return 'Voice notes are not supported in this browser';
    if (state.voiceRecording) return 'Stop recording voice note';
    if (state.voicePermission === 'granted') return 'Record voice note';
    if (state.voicePermission === 'requested') return 'Voice note permission requested';
    return 'Ask permission to send voice notes';
  }

  function renderRemoveIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  }

  function renderEmojiPicker(state) {
    if (state.emojiPickerOpen !== true) return '';
    var html = '<div class="secure-chat-emoji-popover" role="dialog" aria-label="Emoji picker">';
    html += '<div class="secure-chat-emoji-search-wrap"><input class="secure-chat-emoji-search" type="search" placeholder="Search emoji" value="' + escapeAttr(state.emojiPickerQuery) + '" data-secure-chat-action="emoji-search" aria-label="Search emoji" autocomplete="off" spellcheck="false"></div>';
    if (state.emojiPickerError) {
      html += '<p class="secure-chat-emoji-status is-error">' + escapeHtml(state.emojiPickerError) + '</p>';
    } else {
      if (state.emojiPickerLoading) {
        html += '<p class="secure-chat-emoji-status">Loading emoji...</p>';
      }
      html += renderEmojiScrollableSections(state);
    }
    html += renderEmojiSectionTabs();
    html += '</div>';
    return html;
  }

  function renderStartGate(state) {
    var label = savedSummaryText(state.savedSummary);
    var html = '<div class="secure-chat-start-gate">';
    if (label) {
      html += '<span class="secure-chat-saved-hint">' + escapeHtml(label) + '</span>';
    }
    html += '<button type="button" class="list-admin-primary-btn secure-chat-login-btn" data-secure-chat-action="start">' + (label ? 'Open Chat' : 'Start Chat') + '</button>';
    html += '</div>';
    return html;
  }

  function renderPanel(model) {
    // renderPanel is pure: model in, HTML string out. Event handling lives in
    // mount(), which keeps UI rendering testable without a browser framework.
    var state = normalizeModel(model);
    var html = '<section class="secure-chat-panel' + (state.chatStarted ? ' is-chat-started' : '') + (state.chatOpening ? ' is-chat-opening' : '') + (state.chatClosing ? ' is-chat-closing' : '') + '" aria-labelledby="secure-chat-title">';
    html += '<div class="secure-chat-head">';
    if (!state.hideHeading) {
      html += '<div class="secure-chat-heading"><h2 id="secure-chat-title">Secure Chat</h2></div>';
    }
    if (!state.loggedIn && state.loading) {
      html += '<div class="secure-chat-loading" role="status" aria-live="polite"><span>Loading...</span>' + spinnerHtml('secure-chat-loading-spinner') + '</div>';
    } else if (!state.loggedIn) {
      html += '<div class="secure-chat-login-gate"><p class="secure-chat-login-note">Login with Nostr to chat.</p><button type="button" class="list-admin-primary-btn secure-chat-login-btn" data-secure-chat-action="login">Login...</button></div>';
    } else if (!state.chatStarted) {
      html += renderStartGate(state);
    } else {
      html += '<button type="button" class="secure-chat-close-btn" data-secure-chat-action="close" aria-label="Close Secure Chat" title="Close Secure Chat"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
    }
    html += '</div>';
    if (!state.loggedIn) {
      html += '</section>';
      return html;
    }
    if (!state.chatStarted) {
      html += '</section>';
      return html;
    }
    html += '<div class="secure-chat-body' + (state.chatOpening ? ' is-opening' : '') + (state.chatClosing ? ' is-closing' : '') + '"><div class="secure-chat-body-inner">';
    if (!state.hasSigner) {
      html += '<p class="secure-chat-empty">Secure Chat requires a browser signer extension so each request can be signed.</p>';
      html += '</div>';
      html += '</div>';
      html += '</section>';
      return html;
    }
    if (state.error) {
      html += '<div class="secure-chat-banner is-error">' + escapeHtml(state.error) + '</div>';
    }
    if (state.service && state.service.transport_status && state.service.transport_status !== 'connected') {
      html += '<div class="secure-chat-banner is-warn">Transport status: ' + escapeHtml(String(state.service.transport_status || 'unknown'));
      if (state.service.transport_error) {
        html += ' · ' + escapeHtml(String(state.service.transport_error || ''));
      }
      html += '</div>';
    }
    html += '<div class="secure-chat-thread" id="secure-chat-thread">';
    if (!state.simplexWebIntroDismissed) {
      html += renderSimplexWebIntro();
    }
    if (state.messages.length) {
      state.messages.forEach(function (message) {
        var incoming = String(message && message.direction || '') === 'incoming';
        html += '<article class="secure-chat-message' + (incoming ? ' is-incoming' : ' is-outgoing') + '" data-secure-chat-message-ref="' + escapeAttr(message && message.message_ref || '') + '">';
        html += '<div class="secure-chat-bubble">';
        if (message && message.text) {
          html += '<p class="secure-chat-text">' + escapeHtml(String(message.text || '')).replace(/\n/g, '<br>') + '</p>';
        }
        html += renderAttachment(message);
        html += '<div class="secure-chat-meta"><span data-secure-chat-status="true">' + statusHtml(message) + '</span>' + timeHtml(message && message.created_at) + '</div>';
        html += '</div>';
        html += '</article>';
      });
    } else {
      html += '<p class="secure-chat-empty">No secure chat messages yet.</p>';
    }
    html += '</div>';
    if (state.uploads.length) {
      html += '<div class="secure-chat-uploads">';
      state.uploads.forEach(function (upload) {
        var progress = clampProgress(upload && upload.progress);
        html += '<div class="secure-chat-upload-row">';
        html += '<div class="secure-chat-upload-name">' + escapeHtml(String(upload && upload.name || 'Attachment')) + '</div>';
        html += '<div class="secure-chat-upload-meta"><span>' + escapeHtml(String(upload && upload.status || 'queued')) + '</span><span>' + String(progress) + '%</span></div>';
        html += '<div class="secure-chat-upload-bar"><span style="width:' + String(progress) + '%"></span></div>';
        html += '</div>';
      });
      html += '</div>';
    }
    html += '<div class="secure-chat-compose">';
    html += '<div class="secure-chat-input-wrap' + (state.pendingFiles.length ? ' has-pending-files' : '') + '">';
    if (state.pendingFiles.length) {
      html += '<div class="secure-chat-pending-files" aria-label="Selected attachments">';
      state.pendingFiles.forEach(function (file) {
        html += '<span class="secure-chat-pending-file">';
        html += '<span class="secure-chat-pending-file-name">' + escapeHtml(file.name) + '</span>';
        html += '<span class="secure-chat-pending-file-meta">' + escapeHtml(formatBytes(file.size)) + '</span>';
        html += '<button type="button" class="secure-chat-pending-file-remove" data-secure-chat-action="remove-pending-file" data-secure-chat-file-id="' + escapeAttr(file.id) + '" aria-label="Remove ' + escapeAttr(file.name) + '" title="Remove attachment">' + renderRemoveIcon() + '</button>';
        html += '</span>';
      });
      html += '</div>';
    }
    html += '<textarea id="secure-chat-input" class="secure-chat-input" rows="2" placeholder="Write a secure message">' + escapeHtml(state.draftText) + '</textarea>';
    html += '<label class="secure-chat-attach-button" aria-label="Attach files" title="Attach files"><input id="secure-chat-file-input" class="secure-chat-file-input" type="file" multiple><svg class="secure-chat-attach-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.9-9.9a4 4 0 0 1 5.66 5.66l-9.9 9.9a2 2 0 1 1-2.83-2.83l8.49-8.49"/></svg></label>';
    html += '<button type="button" class="secure-chat-emoji-button" data-secure-chat-action="emoji-toggle" aria-label="Insert emoji" title="Insert emoji" aria-haspopup="dialog" aria-expanded="' + (state.emojiPickerOpen === true ? 'true' : 'false') + '">' + renderEmojiIcon() + '</button>';
    html += renderEmojiPicker(state);
    html += '<button type="button" class="secure-chat-voice-btn' + (state.voiceRecording ? ' is-recording' : '') + (state.voicePermission !== 'granted' ? ' is-locked' : '') + '" data-secure-chat-action="voice-note" aria-label="' + escapeAttr(voiceButtonLabel(state)) + '" title="' + escapeAttr(voiceButtonLabel(state)) + '"' + (!state.voiceNoteSupported || state.sending ? ' disabled' : '') + '>' + renderMicIcon() + '</button>';
    html += '<button type="button" class="secure-chat-send-btn" data-secure-chat-action="send" aria-label="' + (state.sending ? 'Sending...' : 'Send secure message') + '" title="' + (state.sending ? 'Sending...' : 'Send secure message') + '"' + (state.sending ? ' disabled aria-busy="true"' : '') + '>' + (state.sending ? spinnerHtml('secure-chat-send-spinner') : renderSendIcon()) + '</button>';
    html += '</div>';
    html += '<label class="secure-chat-compose-hint secure-chat-send-shortcut"><input id="secure-chat-send-modifier" type="checkbox"' + (state.sendWithModifier === true ? ' checked' : '') + '> ' + escapeHtml(state.shortcutModifierLabel) + ' + Enter to send</label>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '</section>';
    return html;
  }

  function mount(root, model, handlers) {
    // mount() is the only function that mutates the DOM. It renders once, then
    // uses event delegation so repeated re-renders do not attach duplicate
    // handlers to individual buttons, inputs, or attachment controls.
    if (!root || typeof root.innerHTML === 'undefined') {
      throw new Error('A root element is required');
    }
    var state = normalizeModel(model);
    var api = {};
    var actions = handlers && typeof handlers === 'object' ? handlers : {};

    function render(nextModel) {
      if (nextModel && typeof nextModel === 'object') {
        state = normalizeModel(nextModel);
      }
      // Preserve the intro node across renders when possible. This avoids
      // resetting focus/selection inside that notice during frequent updates.
      var stableSimplexInfo = root.querySelector('.secure-chat-thread > .secure-chat-simplex-info');
      root.innerHTML = renderPanel(state);
      if (stableSimplexInfo && state.simplexWebIntroDismissed !== true) {
        var nextSimplexInfo = root.querySelector('.secure-chat-thread > .secure-chat-simplex-info');
        if (nextSimplexInfo && nextSimplexInfo !== stableSimplexInfo) {
          nextSimplexInfo.replaceWith(stableSimplexInfo);
        }
      }
      return state;
    }

    function currentDraftValue() {
      var field = root.querySelector('#secure-chat-input');
      if (field && typeof field.value === 'string') {
        return limitString(field.value || '', MAX_TEXT_LENGTH);
      }
      return state.draftText;
    }

    function containsActionNode(node) {
      // Delegated events can cross shadow/DOM boundaries in surprising ways;
      // actions are ignored unless the action element belongs to this mount.
      if (!node) return false;
      if (node === root) return true;
      if (typeof root.contains === 'function') {
        return root.contains(node);
      }
      return true;
    }

    function onClick(event) {
      var target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      var actionNode = target.closest('[data-secure-chat-action]');
      if (!actionNode) return;
      if (!containsActionNode(actionNode)) return;
      var action = String(actionNode.getAttribute('data-secure-chat-action') || '').trim().toLowerCase();
      if (!action) return;
      if (action === 'login' && typeof actions.onLogin === 'function') {
        actions.onLogin();
        return;
      }
      if (action === 'start' && typeof actions.onStart === 'function') {
        actions.onStart();
        return;
      }
      if (action === 'send' && typeof actions.onSend === 'function') {
        actions.onSend(currentDraftValue());
        return;
      }
      if (action === 'voice-note' && typeof actions.onVoiceNoteAction === 'function') {
        actions.onVoiceNoteAction(currentDraftValue());
        return;
      }
      if (action === 'emoji-toggle' && typeof actions.onEmojiToggle === 'function') {
        actions.onEmojiToggle(state.emojiPickerOpen !== true);
        return;
      }
      if (action === 'emoji-recent' && typeof actions.onEmojiSelect === 'function') {
        actions.onEmojiSelect(normalizeEmoji(actionNode.getAttribute('data-secure-chat-emoji') || ''));
        return;
      }
      if (action === 'emoji-pick' && typeof actions.onEmojiSelect === 'function') {
        actions.onEmojiSelect(normalizeEmoji(actionNode.getAttribute('data-secure-chat-emoji') || ''));
        return;
      }
      if (action === 'emoji-section' && typeof actions.onEmojiSection === 'function') {
        actions.onEmojiSection(limitString(actionNode.getAttribute('data-secure-chat-section') || '', MAX_LABEL_LENGTH));
        return;
      }
      if (action === 'remove-pending-file' && typeof actions.onRemovePendingFile === 'function') {
        actions.onRemovePendingFile(limitString(actionNode.getAttribute('data-secure-chat-file-id') || '', MAX_LABEL_LENGTH));
        return;
      }
      if (action === 'admin-refresh' && typeof actions.onAdminRefresh === 'function') {
        actions.onAdminRefresh();
        return;
      }
      var npub = limitString(actionNode.getAttribute('data-secure-chat-npub') || '', MAX_LABEL_LENGTH);
      if (action === 'deactivate' && typeof actions.onAdminDeactivate === 'function') {
        actions.onAdminDeactivate(npub);
        return;
      }
      if (action === 'delete' && typeof actions.onAdminDelete === 'function') {
        actions.onAdminDelete(npub);
      }
    }

    function onInput(event) {
      var target = event.target;
      if (!target) return;
      if (target.id !== 'secure-chat-input') {
        if (target.getAttribute && target.getAttribute('data-secure-chat-action') === 'emoji-search' && typeof actions.onEmojiSearch === 'function') {
          actions.onEmojiSearch(limitString(target.value || '', MAX_LABEL_LENGTH));
        }
        return;
      }
      state.draftText = limitString(target.value || '', MAX_TEXT_LENGTH);
      if (typeof actions.onDraftChange === 'function') {
        actions.onDraftChange(state.draftText);
      }
    }

    function onChange(event) {
      var target = event.target;
      if (!target) return;
      if (target.id === 'secure-chat-send-modifier') {
        state.sendWithModifier = target.checked === true;
        if (typeof actions.onSendShortcutChange === 'function') {
          actions.onSendShortcutChange(state.sendWithModifier);
        }
        return;
      }
      if (target.id !== 'secure-chat-file-input' || !target.files) return;
      if (typeof actions.onFilesSelected === 'function') {
        actions.onFilesSelected(Array.prototype.slice.call(target.files));
      }
      target.value = '';
    }

    function onKeyDown(event) {
      var target = event.target;
      if (!target || target.id !== 'secure-chat-input') return;
      if (event.key === 'Enter' && typeof actions.onSend === 'function') {
        if (event.shiftKey) {
          return;
        }
        if (state.sendWithModifier === true && !(event.metaKey || event.ctrlKey)) {
          return;
        }
        event.preventDefault();
        actions.onSend(currentDraftValue());
      }
    }

    function setFileDropOver(active) {
      var panel = root.querySelector && root.querySelector('.secure-chat-panel');
      if (panel && panel.classList) {
        panel.classList.toggle('is-file-drop-over', active === true);
      } else if (root.classList && typeof root.classList.toggle === 'function') {
        root.classList.toggle('is-file-drop-over', active === true);
      }
    }

    function onDragOver(event) {
      // Drag/drop accepts actual File payloads only. Text/URI drops are ignored
      // because they could smuggle unexpected paths or remote URLs into chat.
      if (!event || !event.dataTransfer) return;
      var hasFiles = event.dataTransfer.files && event.dataTransfer.files.length;
      if (!hasFiles && event.dataTransfer.types && typeof event.dataTransfer.types.indexOf === 'function') {
        hasFiles = event.dataTransfer.types.indexOf('Files') >= 0;
      }
      if (!hasFiles) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setFileDropOver(true);
    }

    function onDrop(event) {
      if (!event || !event.dataTransfer || !event.dataTransfer.files || !event.dataTransfer.files.length) return;
      event.preventDefault();
      setFileDropOver(false);
      if (typeof actions.onFilesSelected === 'function') {
        actions.onFilesSelected(Array.prototype.slice.call(event.dataTransfer.files));
      }
    }

    function onDragLeave() {
      setFileDropOver(false);
    }

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('dragleave', onDragLeave);

    api.render = render;
    api.getState = function () {
      return normalizeModel(state);
    };
    api.destroy = function () {
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('drop', onDrop);
      root.removeEventListener('dragleave', onDragLeave);
    };

    render(state);
    return api;
  }

  var api = {
    MAX_RENDER_MESSAGES: MAX_RENDER_MESSAGES,
    MAX_RENDER_UPLOADS: MAX_RENDER_UPLOADS,
    MAX_TEXT_LENGTH: MAX_TEXT_LENGTH,
    MAX_LABEL_LENGTH: MAX_LABEL_LENGTH,
    MAX_STATUS_LENGTH: MAX_STATUS_LENGTH,
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    clampProgress: clampProgress,
    normalizeModel: normalizeModel,
    statusLabel: statusLabel,
    formatRelativeTime: formatRelativeTime,
    spinnerPhaseStyle: spinnerPhaseStyle,
    spinnerHtml: spinnerHtml,
    statusHtml: statusHtml,
    renderPanel: renderPanel,
    renderAttachment: renderAttachment,
    mount: mount
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.SimplexWebDefaultChat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
