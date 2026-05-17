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

  function normalizeAdminRow(value) {
    var next = value && typeof value === 'object' ? value : {};
    return {
      npub: limitString(next.npub || '', MAX_LABEL_LENGTH),
      simplex_contact_id: limitString(next.simplex_contact_id || '', MAX_LABEL_LENGTH),
      status: limitString(next.status || '', MAX_STATUS_LENGTH)
    };
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
      recentEmojis: normalizeRecentEmojis(next.recentEmojis),
      voiceNoteSupported: next.voiceNoteSupported !== false,
      voicePermission: normalizeVoicePermission(next.voicePermission),
      voiceRecording: next.voiceRecording === true,
      simplexWebIntroDismissed: next.simplexWebIntroDismissed === true,
      chatStarted: next.chatStarted !== false,
      chatOpening: next.chatOpening === true,
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
    html += '<div class="secure-chat-emoji-mode-row" role="tablist" aria-label="Emoji modes"><button type="button" class="is-active" role="tab" aria-selected="true">Emoji</button></div>';
    if (state.recentEmojis.length) {
      html += '<section class="secure-chat-emoji-recent" aria-label="Recently Used"><h3>Recently Used</h3><div class="secure-chat-emoji-recent-grid">';
      state.recentEmojis.forEach(function (emoji) {
        html += '<button type="button" class="secure-chat-emoji-recent-btn" data-secure-chat-action="emoji-recent" data-secure-chat-emoji="' + escapeAttr(emoji) + '" aria-label="Insert ' + escapeAttr(emoji) + '">' + escapeHtml(emoji) + '</button>';
      });
      html += '</div></section>';
    }
    if (state.emojiPickerError) {
      html += '<p class="secure-chat-emoji-status is-error">' + escapeHtml(state.emojiPickerError) + '</p>';
    } else {
      if (state.emojiPickerLoading) {
        html += '<p class="secure-chat-emoji-status">Loading emoji...</p>';
      }
      html += '<emoji-picker class="secure-chat-emoji-picker" emoji-version="17.0"></emoji-picker>';
    }
    html += '</div>';
    return html;
  }

  function renderPanel(model) {
    // renderPanel is pure: model in, HTML string out. Event handling lives in
    // mount(), which keeps UI rendering testable without a browser framework.
    var state = normalizeModel(model);
    var html = '<section class="secure-chat-panel' + (state.chatStarted ? ' is-chat-started' : '') + (state.chatOpening ? ' is-chat-opening' : '') + '" aria-labelledby="secure-chat-title">';
    html += '<div class="secure-chat-head">';
    html += '<div class="secure-chat-heading"><h2 id="secure-chat-title">Secure Chat</h2></div>';
    if (!state.loggedIn && state.loading) {
      html += '<div class="secure-chat-loading" role="status" aria-live="polite"><span>Loading...</span>' + spinnerHtml('secure-chat-loading-spinner') + '</div>';
    } else if (!state.loggedIn) {
      html += '<button type="button" class="list-admin-primary-btn secure-chat-login-btn" data-secure-chat-action="login">Login...</button>';
    } else if (!state.chatStarted) {
      html += '<button type="button" class="list-admin-primary-btn secure-chat-login-btn" data-secure-chat-action="start">Start Chat</button>';
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
    html += '<div class="secure-chat-body' + (state.chatOpening ? ' is-opening' : '') + '"><div class="secure-chat-body-inner">';
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
      if (!target || target.id !== 'secure-chat-input') return;
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
