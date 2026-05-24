(function () {
  var root = document.getElementById('contact-page-root');
  if (!root) {
    return;
  }

  function removeLegacyTitleBlock() {
    var prev = root.previousElementSibling;
    if (!prev || prev.tagName !== 'HEADER') {
      return;
    }
    if (!prev.querySelector || !prev.querySelector('.title')) {
      return;
    }
    if (prev.parentNode) {
      prev.parentNode.removeChild(prev);
    }
  }

  removeLegacyTitleBlock();

  var query = new URLSearchParams(window.location.search || '');
  var slug = String(root.getAttribute('data-page-slug') || query.get('page_slug') || query.get('slug') || 'contact').trim() || 'contact';
  var secureChatSimplexXftpUrl = 'https://new.andersaamodt.com:18443/';
  var secureChatSimplexXftpKeyHash = 'R-xa4iaMWHaCAK8iMzmJKFtODWn-nSw1FSl3ycoqDXQ=';
  var secureChatEmojiPickerModuleUrl = 'https://cdn.jsdelivr.net/npm/emoji-picker-element@^1/index.js';
  var secureChatEmojiPickerLoadPromise = null;
  var secureChatEmojiPickerModule = null;
  var secureChatEmojiDatabase = null;
  var secureChatEmojiGroupsLoadPromise = null;
  var secureChatRecentEmojiLimit = 32;
  var secureChatEmojiSectionDefs = [
    { id: 'recent', label: 'Recently Used', group: null },
    { id: 'smileys-emotion', label: 'Smileys & Emotion', pickerLabel: 'Smileys and emoticons', group: 0 },
    { id: 'people-body', label: 'People & Body', pickerLabel: 'People and body', group: 1 },
    { id: 'animals-nature', label: 'Animals & Nature', pickerLabel: 'Animals and nature', group: 2 },
    { id: 'food-drink', label: 'Food & Drink', pickerLabel: 'Food and drink', group: 3 },
    { id: 'travel-places', label: 'Travel & Places', pickerLabel: 'Travel and places', group: 4 },
    { id: 'activities', label: 'Activities', pickerLabel: 'Activities', group: 5 },
    { id: 'objects', label: 'Objects', pickerLabel: 'Objects', group: 6 },
    { id: 'symbols', label: 'Symbols', pickerLabel: 'Symbols', group: 7 },
    { id: 'flags', label: 'Flags', pickerLabel: 'Flags', group: 8 }
  ];

  var els = {
    title: document.getElementById('contact-page-title'),
    description: document.getElementById('contact-page-description'),
    admin: document.getElementById('contact-page-admin'),
    validation: document.getElementById('contact-page-validation'),
    content: document.getElementById('contact-page-content')
  };

  var state = {
    payload: null,
    draft: null,
    editMode: false,
    activeHeadField: '',
    headFocusPending: false,
    activeRowIndex: -1,
    activeRowField: '',
    draggingRowUid: '',
    dragOverRowUid: '',
    dragMoved: false,
    dragDropped: false,
    dragStartRows: null,
    pendingFlipPositions: null,
    rowUidSeq: 0,
    navTitle: '',
    navTitleEditing: false,
    navTitleInput: '',
    navTitleBusy: false,
    busy: false,
    autosaveQueued: false,
    pendingToggleEditOff: false,
    saveTimer: null,
    saveStatus: 'saved',
    saveIndicatorVisible: false,
    initialContentPainted: false,
    lastContentHtml: '',
    chat: {
      available: false,
      loading: false,
      sending: false,
      draftText: '',
      npub: '',
      service: null,
      mapping: null,
      messages: [],
      uploads: [],
      localUploads: {},
      pendingFiles: [],
      lastSeq: 0,
      sendWithModifier: false,
      sessionVerified: false,
      authRejected: false,
      authChecking: false,
      authCheckComplete: false,
      authCheckPromise: null,
      sessionDisplayName: '',
      error: '',
      pollTimer: null,
      browserReceiveInFlight: false,
      attachedFilesToken: 0,
      emojiPickerOpen: false,
      emojiPickerLoading: false,
      emojiPickerError: '',
      emojiPickerQuery: '',
      emojiGroups: [],
      emojiSearchResults: [],
      recentEmojis: [],
      filePickerOpen: false,
      renderDeferredWhileFilePickerOpen: false,
      threadPinnedToBottom: true,
      simplexBrowserTransportConfigured: false,
      simplexWebIntroDismissed: false,
      adminMappings: [],
      chatStarted: false,
      chatOpening: false,
      chatClosing: false,
      voicePermission: 'locked',
      voiceRecording: false,
      voiceRecorder: null,
      voiceStream: null,
      voiceChunks: [],
      voiceNotesRequested: false
    }
  };
  var videoChatScriptLoading = null;
  var pageLifecycleClosing = false;
  var PAGE_BOOTSTRAP_CACHE_PREFIX = 'nostr_page_bootstrap_v1:';
  var BOOTSTRAP_CACHE_MAX_AGE_MS = 15000;
  var SECURE_CHAT_STATE_TIMEOUT_MS = 12000;
  var SECURE_CHAT_VOICE_REQUEST_TEXT = 'Voice note permission request';
  var SECURE_CHAT_VOICE_GRANTED_TEXT = 'allow voice notes';
  var SECURE_CHAT_VOICE_DENIED_TEXT = 'deny voice notes';

  function markPageLifecycleClosing() {
    pageLifecycleClosing = true;
  }

  function clearPageLifecycleClosing() {
    pageLifecycleClosing = false;
  }

  function isPageLifecycleClosing() {
    return pageLifecycleClosing;
  }

  function videoChatPluginEnabled() {
    var bootstrapConfig = window.__wizardrySiteBootstrap && window.__wizardrySiteBootstrap.config;
    if (bootstrapConfig && bootstrapConfig.plugins && typeof bootstrapConfig.plugins === 'object') {
      return bootstrapConfig.plugins.video_chat === true;
    }
    var plugins = window.__wizardryPlugins;
    if (plugins && typeof plugins === 'object') {
      return plugins.video_chat === true;
    }
    return window.__wizardryVideoChatEnabled === true;
  }

  function ensureVideoChatWidgetScript() {
    if (window.initVideoChatWidget && typeof window.initVideoChatWidget === 'function') {
      return Promise.resolve(true);
    }
    if (videoChatScriptLoading) {
      return videoChatScriptLoading;
    }
    videoChatScriptLoading = new Promise(function (resolve) {
      var existing = document.querySelector('script[data-video-chat-widget="1"]');
      if (existing) {
        existing.addEventListener('load', function () {
          resolve(!!(window.initVideoChatWidget && typeof window.initVideoChatWidget === 'function'));
        }, { once: true });
        existing.addEventListener('error', function () { resolve(false); }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = '/static/video-chat-widget.js?v=20260524-room-themes1';
      script.async = true;
      script.setAttribute('data-video-chat-widget', '1');
      script.onload = function () {
        resolve(!!(window.initVideoChatWidget && typeof window.initVideoChatWidget === 'function'));
      };
      script.onerror = function () { resolve(false); };
      document.head.appendChild(script);
    });
    return videoChatScriptLoading;
  }

  function maybeLoadVideoChatWidget() {
    if (!videoChatPluginEnabled()) {
      return;
    }
    ensureVideoChatWidgetScript().then(function (ok) {
      if (!ok) {
        return;
      }
      if (window.VideoChatWidgetAutoMount && typeof window.VideoChatWidgetAutoMount.scan === 'function') {
        window.VideoChatWidgetAutoMount.scan(document);
      }
    }).catch(function () {
      // Keep contact page resilient even if widget bundle fails.
    });
  }

  function nextRowUid() {
    state.rowUidSeq = Number(state.rowUidSeq || 0) + 1;
    return 'contact-row-' + String(state.rowUidSeq);
  }

  function normalizeRowUid(value) {
    var raw = String(value || '').trim();
    if (raw) {
      return raw;
    }
    return nextRowUid();
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function markdownBlock(md) {
    var value = String(md || '');
    if (!value) {
      return '';
    }
    if (window.marked && typeof window.marked.parse === 'function') {
      return window.marked.parse(value);
    }
    return '<p>' + escapeHtml(value).replace(/\n/g, '<br>') + '</p>';
  }

  function normalizeWidgetIncludeName(value) {
    var name = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
    if (name === 'video-calling' || name === 'video-call' || name === 'videochat') {
      return 'video-chat';
    }
    if (name === 'securechat' || name === 'simplex-chat' || name === 'simplex') {
      return 'secure-chat';
    }
    if (name === 'video-chat' || name === 'secure-chat') {
      return name;
    }
    return '';
  }

  function renderWidgetInclude(name) {
    var widget = normalizeWidgetIncludeName(name);
    if (widget === 'secure-chat') {
      return renderSecureChatPanel();
    }
    if (widget === 'video-chat') {
      var videoConfig = {};
      try {
        videoConfig = (window.__wizardrySiteBootstrap && window.__wizardrySiteBootstrap.config && window.__wizardrySiteBootstrap.config.video_chat) || {};
      } catch (_err) {
        videoConfig = {};
      }
      var publicRooms = videoConfig && videoConfig.public_rooms === true;
      var activeRooms = Array.isArray(videoConfig && videoConfig.active_rooms) ? videoConfig.active_rooms : videoConfig && videoConfig.rooms;
      var rooms = Array.isArray(activeRooms) ? activeRooms.join(',') : '';
      var roomThemeImages = videoConfig && videoConfig.room_theme_images && typeof videoConfig.room_theme_images === 'object'
        ? JSON.stringify(videoConfig.room_theme_images)
        : '{}';
      return '<section class="contact-widget contact-widget-video-chat" aria-label="Video calling">' +
        renderContactSectionHeading('Call', 'contact-call-title') +
        '<div data-video-chat ' +
        'data-video-chat-token-endpoint="/cgi/blog-video-chat-token" ' +
        'data-video-chat-call-room-id="call-me" ' +
        'data-video-chat-call-label="Call Anders Now" ' +
        'data-video-chat-show-heading="false" ' +
        'data-video-chat-center-precall="true" ' +
        'data-video-chat-owner-call-private="true" ' +
        'data-video-chat-public-rooms="' + (publicRooms ? 'true' : 'false') + '" ' +
        'data-video-chat-room-list="' + escapeHtml(rooms) + '" ' +
        'data-video-chat-room-theme-images="' + escapeAttr(roomThemeImages) + '" ' +
        'data-video-chat-room-policy="open" ' +
        'data-video-chat-max-participants="6" ' +
        'data-video-chat-allow-join-link="true"></div>' +
        '</section>';
    }
    return '';
  }

  function textHasWidgetInclude(text, widgetName) {
    var wanted = normalizeWidgetIncludeName(widgetName);
    if (!wanted) {
      return false;
    }
    var re = /\{\{\s*([a-z0-9 _-]+)\s*\}\}/ig;
    var match;
    while ((match = re.exec(String(text || '')))) {
      if (normalizeWidgetIncludeName(match[1]) === wanted) {
        return true;
      }
    }
    return false;
  }

  function renderMarkdownWithWidgetIncludes(md, skipWidgetName) {
    var value = String(md || '');
    if (!value) {
      return '';
    }
    var skipWidget = normalizeWidgetIncludeName(skipWidgetName || '');
    var re = /(^|\n)[ \t]*\{\{\s*([a-z0-9 _-]+)\s*\}\}[ \t]*(?=\n|$)/ig;
    var html = '';
    var lastIndex = 0;
    var match;
    while ((match = re.exec(value))) {
      var widgetName = normalizeWidgetIncludeName(match[2]);
      var shouldSkipWidget = !!(widgetName && widgetName === skipWidget);
      var includeHtml = widgetName && !shouldSkipWidget ? renderWidgetInclude(widgetName) : '';
      if (!includeHtml && !shouldSkipWidget) {
        continue;
      }
      var markdownBefore = value.slice(lastIndex, match.index);
      if (markdownBefore) {
        html += markdownBlock(markdownBefore);
      }
      if (includeHtml) {
        html += includeHtml;
      }
      lastIndex = re.lastIndex;
      if (value.charAt(lastIndex) === '\n') {
        lastIndex += 1;
      }
    }
    var markdownAfter = value.slice(lastIndex);
    if (markdownAfter) {
      html += markdownBlock(markdownAfter);
    }
    return html;
  }

  function markdownInline(md) {
    var value = String(md || '');
    if (!value) {
      return '';
    }
    if (window.marked && typeof window.marked.parseInline === 'function') {
      return window.marked.parseInline(value);
    }
    return escapeHtml(value);
  }

  function normalizeExtraFormat(value) {
    var next = String(value || '').trim().toLowerCase();
    return next === 'html' ? 'html' : 'markdown';
  }

  function normalizeDraftState(raw) {
    var src = raw || {};
    return {
      slug: String(src.slug || slug),
      type: String(src.type || 'contact'),
      title: String(src.title || ''),
      description: String(src.description || ''),
      publish_intro_to_nostr: !!src.publish_intro_to_nostr,
      extras_after: String(src.extras_after || ''),
      extras_after_format: normalizeExtraFormat(src.extras_after_format || 'markdown'),
      rows: normalizeRows(src.rows || [])
    };
  }

  function authPayload() {
    return {
      session_token: String(localStorage.getItem('session_token') || '').trim(),
      csrf_token: String(localStorage.getItem('csrf_token') || '').trim()
    };
  }

  function storedSessionToken() {
    return String(localStorage.getItem('session_token') || '').trim();
  }

  function hasLikelyAuthenticatedSession() {
    var auth = authPayload();
    return !!(auth && auth.session_token && auth.csrf_token);
  }

  function ensureNostrPublishDialog() {
    if (window.blogNostrPublishDialog && typeof window.blogNostrPublishDialog.open === 'function') {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = '/static/nostr-publish-dialog.js';
      script.async = true;
      script.onload = function () {
        resolve(!!(window.blogNostrPublishDialog && typeof window.blogNostrPublishDialog.open === 'function'));
      };
      script.onerror = function () {
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  function authSignature() {
    var auth = authPayload();
    return String(auth.session_token || '') + '|' + String(auth.csrf_token || '');
  }

  function secureChatAuthMethod() {
    return String(localStorage.getItem('last_auth_method') || '').trim().toLowerCase();
  }

  function secureChatStoredPubkey() {
    return String(localStorage.getItem('last_auth_pubkey') || '').trim().toLowerCase();
  }

  function secureChatStoredAuthHint() {
    return [
      secureChatAuthMethod(),
      secureChatStoredPubkey(),
      String(localStorage.getItem('last_auth_player_name') || '').trim(),
      String(localStorage.getItem('last_auth_username') || '').trim()
    ].some(function (value) {
      return !!String(value || '').trim();
    });
  }

  function secureChatAuthSignature() {
    var auth = authPayload();
    return [
      String(auth.session_token || ''),
      String(auth.csrf_token || ''),
      secureChatAuthMethod(),
      secureChatStoredPubkey()
    ].join('|');
  }

  function secureChatSessionStore() {
    var store = window.SimplexWebSessionStore;
    if (!store || typeof store.readSession !== 'function' || typeof store.writeSession !== 'function') {
      return null;
    }
    return store;
  }

  function secureChatStorageSiteKey() {
    var host = String(window.location.host || window.location.hostname || 'site').trim().toLowerCase();
    return host + ':' + slug + ':secure-chat';
  }

  function secureChatStorageAccountKey() {
    var storedPubkey = secureChatStoredPubkey();
    if (secureChatAuthMethod() !== 'nostr' && !storedPubkey) {
      return '';
    }
    if (storedPubkey) {
      return storedPubkey;
    }
    var npub = String(state.chat.npub || '').trim().toLowerCase();
    if (npub) {
      return npub;
    }
    return secureChatStoredPubkey();
  }

  function secureChatRecentEmojiStorageKey() {
    var accountKey = secureChatStorageAccountKey() || 'anonymous';
    return 'secure-chat-recent-emoji-v1:' + secureChatStorageSiteKey() + ':' + accountKey;
  }

  function normalizeSecureChatEmoji(value) {
    return String(value || '').trim().slice(0, 32);
  }

  function normalizeSecureChatRecentEmojis(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    var seen = {};
    var out = [];
    value.forEach(function (item) {
      var emoji = normalizeSecureChatEmoji(item);
      if (!emoji || seen[emoji]) {
        return;
      }
      seen[emoji] = true;
      out.push(emoji);
    });
    return out.slice(0, secureChatRecentEmojiLimit);
  }

  function loadSecureChatRecentEmojis() {
    try {
      state.chat.recentEmojis = normalizeSecureChatRecentEmojis(JSON.parse(window.localStorage.getItem(secureChatRecentEmojiStorageKey()) || '[]'));
    } catch (_err) {
      state.chat.recentEmojis = [];
    }
    return state.chat.recentEmojis;
  }

  function saveSecureChatRecentEmojis() {
    try {
      window.localStorage.setItem(secureChatRecentEmojiStorageKey(), JSON.stringify(normalizeSecureChatRecentEmojis(state.chat.recentEmojis)));
      return true;
    } catch (_err) {
      return false;
    }
  }

  function recordSecureChatRecentEmoji(emoji) {
    var nextEmoji = normalizeSecureChatEmoji(emoji);
    if (!nextEmoji) {
      return;
    }
    var recents = normalizeSecureChatRecentEmojis(state.chat.recentEmojis);
    state.chat.recentEmojis = [nextEmoji].concat(recents.filter(function (item) {
      return item !== nextEmoji;
    })).slice(0, secureChatRecentEmojiLimit);
    saveSecureChatRecentEmojis();
  }

  function secureChatSimplexInfoDismissStorageKey() {
    var accountKey = secureChatStorageAccountKey();
    if (!accountKey) {
      return '';
    }
    return 'secure-chat-simplex-web-info-dismissed-v2:' + secureChatStorageSiteKey() + ':' + accountKey;
  }

  function secureChatSimplexInfoDismissedFromBrowser() {
    var key = secureChatSimplexInfoDismissStorageKey();
    if (!key) {
      return false;
    }
    try {
      return window.localStorage.getItem(key) === '1';
    } catch (_err) {
      return false;
    }
  }

  function persistSecureChatSimplexInfoDismissal() {
    var key = secureChatSimplexInfoDismissStorageKey();
    if (!key) {
      return false;
    }
    try {
      window.localStorage.setItem(key, '1');
      return true;
    } catch (_err) {
      return false;
    }
  }

  function markInitialContentPainted() {
    if (state.initialContentPainted) {
      return;
    }
    state.initialContentPainted = true;
    try {
      window.__wizardryPageInitialContentReady = true;
      window.dispatchEvent(new CustomEvent('blog-page-initial-content-ready', {
        detail: { slug: slug }
      }));
    } catch (_err) {
      // Ignore event dispatch failures.
    }
  }

  function renderLoadFallback(err, fallbackText) {
    if (err && window.console && typeof window.console.warn === 'function') {
      window.console.warn('Contact page refresh failed:', err);
    }
    if (state.initialContentPainted || !els.content) {
      return;
    }
    els.content.innerHTML = '<p class="placeholder">' + escapeHtml(fallbackText || 'Page content is still loading.') + '</p>';
    markInitialContentPainted();
  }

  function bootstrapCacheKey() {
    return PAGE_BOOTSTRAP_CACHE_PREFIX + slug;
  }

  function isExpectedPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    var payloadSlug = String(payload.slug || '').trim();
    var payloadType = String(payload.page_type || '').trim().toLowerCase();
    return payloadSlug === slug && payloadType === 'contact';
  }

  function readBootstrapCache() {
    try {
      var raw = localStorage.getItem(bootstrapCacheKey());
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      var savedAt = Number(parsed.saved_at || 0);
      if (!isFinite(savedAt) || savedAt <= 0 || (Date.now() - savedAt) > BOOTSTRAP_CACHE_MAX_AGE_MS) {
        localStorage.removeItem(bootstrapCacheKey());
        return null;
      }
      if (String(parsed.auth_signature || '') !== authSignature()) {
        return null;
      }
      if (!parsed.payload || typeof parsed.payload !== 'object') {
        return null;
      }
      if (!isExpectedPayload(parsed.payload)) {
        localStorage.removeItem(bootstrapCacheKey());
        return null;
      }
      return parsed.payload;
    } catch (_err) {
      return null;
    }
  }

  function writeBootstrapCache(payload) {
    try {
      if (!payload || typeof payload !== 'object') {
        return;
      }
      localStorage.setItem(bootstrapCacheKey(), JSON.stringify({
        auth_signature: authSignature(),
        payload: payload,
        saved_at: Date.now()
      }));
    } catch (_err) {
      // Ignore cache write failures.
    }
  }

  function readPrerenderBootstrap() {
    try {
      var allPayloads = window.__wizardryNostrPageBootstrap;
      if (!allPayloads || typeof allPayloads !== 'object') {
        return null;
      }
      var payload = allPayloads[slug];
      if (!isExpectedPayload(payload)) {
        return null;
      }
      return payload;
    } catch (_err) {
      return null;
    }
  }

  function renderFromBootstrapPayload(payload) {
    if (!payload || !isExpectedPayload(payload)) {
      return false;
    }
    var optimisticPayload = payload;
    if (!optimisticPayload.is_admin && hasLikelyAuthenticatedSession()) {
      optimisticPayload = Object.assign({}, optimisticPayload, { is_admin: true });
    }
    state.payload = optimisticPayload;
    state.draft = normalizeDraftState((payload && payload.state) || { title: '', description: '', rows: [] });
    state.navTitle = String((payload && payload.nav_title) || '').trim();
    state.navTitleEditing = false;
    state.navTitleInput = '';
    state.navTitleBusy = false;
    state.activeHeadField = '';
    state.activeRowIndex = -1;
    state.activeRowField = '';
    state.saveIndicatorVisible = false;
    setSaveStatus('saved');
    renderAll();
    markInitialContentPainted();
    markHydrationPageReady();
    return true;
  }

  function renderFromBootstrapCache() {
    var cachedPayload = readBootstrapCache();
    if (!cachedPayload) {
      return false;
    }
    return renderFromBootstrapPayload(cachedPayload);
  }

  function renderFromPrerenderBootstrap() {
    var prerenderedPayload = readPrerenderBootstrap();
    if (!prerenderedPayload) {
      return false;
    }
    if (!renderFromBootstrapPayload(prerenderedPayload)) {
      return false;
    }
    writeBootstrapCache(prerenderedPayload);
    return true;
  }

  function isAdmin() {
    return !!(state.payload && state.payload.is_admin && state.draft);
  }

  function markHydrationPageReady() {
    var gate = window.__wizardryHydration;
    if (gate && typeof gate.markPageReady === 'function') {
      gate.markPageReady();
    }
  }

  function apiPost(url, payload) {
    var body = new URLSearchParams(payload || {});
    return fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).then(function (res) { return res.text(); }).then(function (text) {
      var data;
      try {
        data = JSON.parse(text);
      } catch (_err) {
        throw new Error('Invalid JSON response');
      }
      if (!data || data.success === false) {
        throw new Error((data && data.error) || 'Request failed');
      }
      return data;
    });
  }

  function hasSecureChatSession() {
    var auth = authPayload();
    return !!(auth.session_token && auth.csrf_token);
  }

  function secureChatAuthPending() {
    return !hasSecureChatSession() && !!storedSessionToken() && state.chat.authCheckComplete !== true;
  }

  function verifySecureChatStoredAuth() {
    if (hasSecureChatSession()) {
      state.chat.authChecking = false;
      state.chat.authCheckComplete = true;
      state.chat.authRejected = false;
      return Promise.resolve(true);
    }
    var token = storedSessionToken();
    if (!token) {
      state.chat.authChecking = false;
      state.chat.authCheckComplete = true;
      return Promise.resolve(false);
    }
    if (state.chat.authCheckPromise) {
      return state.chat.authCheckPromise;
    }
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout = controller ? window.setTimeout(function () {
      controller.abort();
    }, 8000) : null;
    state.chat.authChecking = true;
    if (state.payload) {
      renderContent();
    }
    state.chat.authCheckPromise = fetch('/cgi/ssh-auth-check-session?session_token=' + encodeURIComponent(token), {
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.authenticated) {
          state.chat.authRejected = true;
          return false;
        }
        if (data.csrf_token) {
          localStorage.setItem('csrf_token', data.csrf_token);
        }
        if (data.nostr_pubkey) {
          localStorage.setItem('last_auth_pubkey', data.nostr_pubkey);
        }
        if (data.session_auth_method) {
          localStorage.setItem('last_auth_method', data.session_auth_method);
        } else if (data.nostr_pubkey || secureChatStoredPubkey()) {
          localStorage.setItem('last_auth_method', 'nostr');
        }
        if (data.player_name) {
          localStorage.setItem('last_auth_player_name', data.player_name);
        }
        if (data.username) {
          localStorage.setItem('last_auth_username', data.username);
        }
        if (typeof data.is_admin !== 'undefined') {
          localStorage.setItem('last_auth_is_admin', data.is_admin ? '1' : '0');
        }
        state.chat.authRejected = false;
        return hasSecureChatSession();
      }).catch(function () {
        return false;
      }).finally(function () {
        if (timeout) {
          window.clearTimeout(timeout);
        }
        state.chat.authChecking = false;
        state.chat.authCheckComplete = true;
        state.chat.authCheckPromise = null;
        if (state.payload) {
          renderContent();
        }
      });
    return state.chat.authCheckPromise;
  }

  function secureChatEndpointUrl(pathname) {
    return new URL(String(pathname || ''), window.location.origin).toString();
  }

  function secureChatRequestHeaders() {
    if (!hasSecureChatSession()) {
      return Promise.reject(new Error('Secure Chat requires an authenticated Nostr session.'));
    }
    var auth = authPayload();
    return Promise.resolve({
      'X-Session-Token': auth.session_token,
      'X-CSRF-Token': auth.csrf_token
    });
  }

  function secureChatFormPost(url, payload) {
    var absoluteUrl = secureChatEndpointUrl(url);
    var body = new URLSearchParams(payload || {});
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout = controller ? window.setTimeout(function () {
      controller.abort();
    }, SECURE_CHAT_STATE_TIMEOUT_MS) : null;
    return secureChatRequestHeaders(absoluteUrl, 'POST').then(function (headers) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      return fetch(absoluteUrl, {
        method: 'POST',
        cache: 'no-store',
        headers: headers,
        body: body.toString(),
        signal: controller ? controller.signal : undefined
      });
    }).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (_err) {
          throw new Error('Invalid Secure Chat response');
        }
        if (!data || data.success === false) {
          var responseError = new Error((data && data.error) || 'Secure Chat request failed');
          responseError.code = data && data.code ? String(data.code) : '';
          throw responseError;
        }
        return data;
      });
    }).catch(function (err) {
      if (err && err.name === 'AbortError') {
        var timeoutError = new Error('Secure Chat request timed out. Try again in a moment.');
        timeoutError.code = 'timeout';
        throw timeoutError;
      }
      throw err;
    }).finally(function () {
      if (timeout) {
        window.clearTimeout(timeout);
      }
    });
  }

  function secureChatBrowserTransport() {
    var transport = window.SimplexWebTransport || window.SimplexWebClient || null;
    if (!transport || typeof transport.sendText !== 'function') {
      return null;
    }
    return transport;
  }

  function secureChatTransportUnavailableError() {
    return new Error('Browser-native simplex-web transport is unavailable. Message was not sent to the server.');
  }

  function secureChatTransportContactId() {
    var mapping = state.chat.mapping && typeof state.chat.mapping === 'object' ? state.chat.mapping : {};
    return String(mapping.bridge_contact_id || mapping.simplex_contact_id || '').trim();
  }

  function secureChatStableLinkHash(value) {
    var text = String(value || '');
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function secureChatOwnerContactId(ownerContactLink) {
    if (ownerContactLink) {
      return 'owner-native-inline-v7-' + secureChatStableLinkHash(ownerContactLink + '|' + secureChatStorageAccountKey());
    }
    return secureChatTransportContactId();
  }

  function secureChatSessionDisplayName() {
    return String(
      state.chat.sessionDisplayName ||
      localStorage.getItem('last_auth_username') ||
      localStorage.getItem('last_auth_player_name') ||
      ''
    ).trim();
  }

  function secureChatBrowserProfile() {
    var displayName = secureChatSessionDisplayName();
    if (!displayName) return {};
    var pubkey = String(localStorage.getItem('last_auth_pubkey') || '').trim().toLowerCase();
    var fullName = displayName;
    if (/^[0-9a-f]{64}$/.test(pubkey)) {
      fullName += ' nostr-pubkey:' + pubkey;
    }
    return {
      displayName: displayName,
      fullName: fullName
    };
  }

  function secureChatOwnerContactLink() {
    var service = state.chat.service && typeof state.chat.service === 'object' ? state.chat.service : {};
    return String(service.owner_contact_link || service.ownerContactLink || '').trim();
  }

  function secureChatSendDestination() {
    var ownerContactLink = secureChatOwnerContactLink();
    var contactId = secureChatOwnerContactId(ownerContactLink);
    return {
      ownerContactLink: ownerContactLink,
      contactId: contactId,
      userId: ownerContactLink ? '' : (state.chat.mapping && state.chat.mapping.bridge_user_id ? String(state.chat.mapping.bridge_user_id) : '')
    };
  }

  function waitForSecureChatSendDestination(timeoutMs) {
    var deadline = Date.now() + Math.max(100, Number(timeoutMs || 2500) || 2500);
    function currentOrRefresh() {
      var destination = secureChatSendDestination();
      if (destination.ownerContactLink || destination.contactId) {
        return Promise.resolve(destination);
      }
      if (Date.now() >= deadline) {
        return Promise.reject(new Error('Secure Chat destination is still loading. Try sending again in a moment.'));
      }
      return refreshSecureChatState().then(function () {
        destination = secureChatSendDestination();
        if (destination.ownerContactLink || destination.contactId) {
          return destination;
        }
        return new Promise(function (resolve) {
          window.setTimeout(resolve, 100);
        }).then(currentOrRefresh);
      });
    }
    return currentOrRefresh();
  }

  function secureChatClientMessageId() {
    return 'secure-chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function keepSecureChatLocalOutgoingStable() {
    state.chat.localOutgoingVolatileUntil = Date.now() + 300000;
  }

  function secureChatRegisterBrowserNativeTransport() {
    var bootstrap = window.SimplexWebBrowserAdapter;
    if (!bootstrap || typeof bootstrap.registerConfiguredSimplexWebTransport !== 'function') {
      return false;
    }
    try {
      var ownerContactLink = secureChatOwnerContactLink();
      var transportConfig = {
        namespace: 'gazeta-secure-chat',
        defaultContactId: secureChatOwnerContactId(ownerContactLink) || 'secure-chat-owner',
        ownerContactLink: ownerContactLink,
        profile: secureChatBrowserProfile()
      };
      if (!ownerContactLink) {
        transportConfig.xftpWebUrl = secureChatSimplexXftpUrl;
        transportConfig.xftpKeyHash = secureChatSimplexXftpKeyHash;
      }
      var result = bootstrap.registerConfiguredSimplexWebTransport(transportConfig);
      state.chat.simplexBrowserTransportConfigured = !!(result && result.registered);
      return state.chat.simplexBrowserTransportConfigured;
    } catch (_err) {
      state.chat.simplexBrowserTransportConfigured = false;
      return false;
    }
  }

  function waitForSecureChatBrowserNativeTransport(timeoutMs) {
    var deadline = Date.now() + Math.max(100, Number(timeoutMs || 2000) || 2000);
    return new Promise(function (resolve) {
      function attempt() {
        secureChatRegisterBrowserNativeTransport();
        var transport = secureChatBrowserTransport();
        var status = transport && typeof transport.getStatus === 'function'
          ? transport.getStatus()
          : null;
        if (transport && (!status || status.available !== false)) {
          resolve(transport);
          return;
        }
        if (Date.now() >= deadline) {
          resolve(transport || null);
          return;
        }
        window.setTimeout(attempt, 50);
      }
      attempt();
    });
  }

  function secureChatMergeMessages(nextMessages) {
    var incoming = Array.isArray(nextMessages) ? nextMessages : [];
    var seen = {};
    var merged = [];
    var localRows = secureChatLocalBrowserRows(state.chat.messages);
    (state.chat.messages || []).forEach(function (msg) {
      var seq = Number(msg && msg.seq);
      if (!seq || seen[seq]) {
        return;
      }
      seen[seq] = true;
      merged.push(msg);
    });
    incoming.forEach(function (msg) {
      var seq = Number(msg && msg.seq);
      if (!seq || seen[seq]) {
        return;
      }
      seen[seq] = true;
      merged.push(msg);
    });
    localRows.forEach(function (msg) {
      var ref = String(msg && msg.message_ref || '');
      var hasServerMatch = !!ref && merged.some(function (serverMsg) {
        return String(serverMsg && serverMsg.message_ref || '') === ref && String(serverMsg && serverMsg.direction || '') === String(msg.direction || '');
      });
      if (!hasServerMatch) {
        merged.push(msg);
      }
    });
    merged.sort(function (a, b) {
      var aTime = String(a && (a.created_at || a.updated_at) || '');
      var bTime = String(b && (b.created_at || b.updated_at) || '');
      if (aTime || bTime) {
        return aTime.localeCompare(bTime);
      }
      return Number(a.seq || 0) - Number(b.seq || 0);
    });
    state.chat.messages = merged;
    state.chat.lastSeq = secureChatInferLastSeq(merged);
  }

  function secureChatHasIncomingServerRows(rows) {
    return (Array.isArray(rows) ? rows : []).some(function (message) {
      return Number(message && message.seq || 0) > 0 && String(message && message.direction || '') === 'incoming';
    });
  }

  function secureChatLocalBrowserRows(messages) {
    return (Array.isArray(messages) ? messages : []).filter(function (msg) {
      return !!(msg && !Number(msg.seq || 0));
    });
  }

  function secureChatLocalOutgoingRows(messages) {
    return secureChatLocalBrowserRows(messages).filter(function (msg) {
      return String(msg.direction || '') === 'outgoing';
    });
  }

  function secureChatStoredLocalOutgoingRows() {
    var store = secureChatSessionStore();
    var accountKey = secureChatStorageAccountKey();
    if (!store || !accountKey) {
      return [];
    }
    var session = store.readSession(window.localStorage, secureChatStorageSiteKey(), accountKey);
    return secureChatLocalOutgoingRows(session.messages);
  }

  function secureChatStoredLocalBrowserRows() {
    var store = secureChatSessionStore();
    var accountKey = secureChatStorageAccountKey();
    if (!store || !accountKey) {
      return [];
    }
    var session = store.readSession(window.localStorage, secureChatStorageSiteKey(), accountKey);
    return secureChatLocalBrowserRows(session.messages);
  }

  function secureChatStoredHistorySummary() {
    var store = secureChatSessionStore();
    var accountKey = secureChatStorageAccountKey();
    if (!store || !accountKey) {
      return { messages: 0, attachments: 0 };
    }
    var session = store.readSession(window.localStorage, secureChatStorageSiteKey(), accountKey);
    var messages = Array.isArray(session.messages) ? session.messages : [];
    var uploads = Array.isArray(session.uploads) ? session.uploads : [];
    var attachmentCount = messages.reduce(function (count, message) {
      return count + (message && message.attachment ? 1 : 0);
    }, 0);
    return {
      messages: messages.length,
      attachments: Math.max(attachmentCount, uploads.length)
    };
  }

  function secureChatPlural(count, singular, plural) {
    return String(count) + ' ' + (count === 1 ? singular : (plural || singular + 's'));
  }

  function secureChatSavedHistorySummaryText(summary) {
    var messages = Number(summary && summary.messages || 0);
    var attachments = Number(summary && summary.attachments || 0);
    if (messages <= 0 && attachments <= 0) {
      return '';
    }
    var parts = [];
    if (messages > 0) {
      parts.push(secureChatPlural(messages, 'message'));
    }
    if (attachments > 0) {
      parts.push(secureChatPlural(attachments, 'attachment'));
    }
    return parts.join(', ');
  }

  function renderSecureChatStartGate(summary) {
    var label = secureChatSavedHistorySummaryText(summary);
    var html = '<div class="secure-chat-start-gate">';
    if (label) {
      html += '<span class="secure-chat-saved-hint">' + escapeHtml(label) + '</span>';
    }
    html += '<button type="button" class="list-admin-primary-btn secure-chat-login-btn" data-secure-chat-action="start">' + (label ? 'Open Chat' : 'Start Chat') + '</button>';
    html += '</div>';
    return html;
  }

  function secureChatMergeLocalOutgoingRows(rows) {
    var incoming = secureChatLocalOutgoingRows(rows);
    return secureChatMergeLocalBrowserRows(incoming);
  }

  function secureChatMergeLocalBrowserRows(rows) {
    var incoming = secureChatLocalBrowserRows(rows);
    if (!incoming.length) {
      return false;
    }
    var changed = false;
    var current = Array.isArray(state.chat.messages) ? state.chat.messages.slice() : [];
    incoming.forEach(function (row) {
      var ref = String(row && row.message_ref || '');
      var text = String(row && row.text || '');
      var exists = current.some(function (message) {
        return String(message && message.direction || '') === String(row.direction || '') &&
          ((ref && String(message && message.message_ref || '') === ref) ||
            (!ref && text && String(message && message.text || '') === text));
      });
      if (!exists) {
        current.push(row);
        changed = true;
      }
    });
    if (changed) {
      state.chat.messages = current;
    }
    return changed;
  }

  function secureChatCursorSeq(value) {
    var next = Number(value || 0);
    return Number.isFinite(next) && next > 0 ? next : 0;
  }

  function secureChatLocalUploads() {
    var uploads = state.chat.localUploads || {};
    return Object.keys(uploads).map(function (key) {
      return uploads[key];
    }).sort(function (a, b) {
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
  }

  function secureChatPersistableUploads() {
    var combined = (state.chat.uploads || []).slice();
    secureChatLocalUploads().forEach(function (upload) {
      if (!combined.some(function (existing) { return existing.upload_id === upload.upload_id; })) {
        combined.push(upload);
      }
    });
    return combined;
  }

  function secureChatPendingFileMeta(fileRef) {
    var file = fileRef && fileRef.file ? fileRef.file : fileRef;
    return {
      id: String(fileRef && fileRef.id || ''),
      name: String(file && file.name || 'Attachment'),
      mime: String(file && file.type || ''),
      size: Number(file && file.size || 0) || 0,
      preparing: fileRef && fileRef.preparing === true
    };
  }

  function secureChatPendingFileMetas() {
    return (Array.isArray(state.chat.pendingFiles) ? state.chat.pendingFiles : []).map(secureChatPendingFileMeta);
  }

  function secureChatVoicePermissionStorageKey() {
    return [
      'secure-chat-voice-permission-v1',
      secureChatStorageSiteKey(),
      secureChatStorageAccountKey(),
      secureChatOwnerContactId(secureChatOwnerContactLink() || '')
    ].join(':');
  }

  function normalizeSecureChatVoicePermission(value) {
    var raw = String(value || '').trim().toLowerCase();
    return raw === 'granted' || raw === 'requested' || raw === 'denied' ? raw : 'locked';
  }

  function loadSecureChatVoicePermissionFromBrowser() {
    try {
      state.chat.voicePermission = normalizeSecureChatVoicePermission(window.localStorage.getItem(secureChatVoicePermissionStorageKey()));
    } catch (_err) {
      state.chat.voicePermission = normalizeSecureChatVoicePermission(state.chat.voicePermission);
    }
  }

  function saveSecureChatVoicePermissionToBrowser(value) {
    var next = normalizeSecureChatVoicePermission(value);
    state.chat.voicePermission = next;
    state.chat.voiceNotesRequested = next === 'requested';
    try {
      window.localStorage.setItem(secureChatVoicePermissionStorageKey(), next);
    } catch (_err) {
      // Losing this preference should not break text or attachment messaging.
    }
    persistSecureChatSessionToBrowser();
  }

  function secureChatVoiceNoteSupported() {
    return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && typeof window.MediaRecorder === 'function' && typeof window.File === 'function');
  }

  function secureChatVoiceMimeType() {
    var choices = [
      'audio/mp4',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    if (!window.MediaRecorder || typeof window.MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }
    for (var i = 0; i < choices.length; i += 1) {
      if (window.MediaRecorder.isTypeSupported(choices[i])) {
        return choices[i];
      }
    }
    return '';
  }

  function secureChatVoiceExtension(mime) {
    var raw = String(mime || '').toLowerCase();
    if (raw.indexOf('audio/mp4') === 0) return 'm4a';
    if (raw.indexOf('audio/ogg') === 0) return 'ogg';
    return 'webm';
  }

  function secureChatAudioFileLike(file) {
    var mime = String(file && file.type || '').toLowerCase();
    var name = String(file && file.name || '').toLowerCase();
    return mime.indexOf('audio/') === 0 || /\.(m4a|mp3|ogg|oga|opus|wav|webm)$/.test(name);
  }

  function secureChatApplyVoicePermissionMessages(messages) {
    var changed = false;
    (Array.isArray(messages) ? messages : []).forEach(function (message) {
      if (!message || String(message.direction || '') !== 'incoming') return;
      var text = String(message.text || '').trim().toLowerCase();
      if (!text) return;
      if (text === '/allow-voice-notes' || text === SECURE_CHAT_VOICE_GRANTED_TEXT || text === 'voice notes allowed' || text === 'yes voice notes') {
        if (state.chat.voicePermission !== 'granted') {
          saveSecureChatVoicePermissionToBrowser('granted');
          changed = true;
        }
      } else if (text === '/deny-voice-notes' || text === SECURE_CHAT_VOICE_DENIED_TEXT || text === 'voice notes denied' || text === 'no voice notes') {
        if (state.chat.voicePermission !== 'denied') {
          saveSecureChatVoicePermissionToBrowser('denied');
          changed = true;
        }
      }
    });
    return changed;
  }

  function secureChatPendingFileReceipt(fileRef, messageRef) {
    var meta = secureChatPendingFileMeta(fileRef);
    return {
      message_ref: messageRef,
      delivery_status: 'sending',
      attachment: {
        name: meta.name,
        mime: meta.mime,
        size: meta.size,
        url: String(fileRef && fileRef.previewUrl || '')
      }
    };
  }

  function secureChatHasPendingFiles() {
    return Array.isArray(state.chat.pendingFiles) && state.chat.pendingFiles.length > 0;
  }

  function secureChatDataTransferHasFiles(dataTransfer) {
    if (!dataTransfer) {
      return false;
    }
    if (dataTransfer.files && dataTransfer.files.length) {
      return true;
    }
    if (dataTransfer.types && typeof dataTransfer.types.indexOf === 'function') {
      return dataTransfer.types.indexOf('Files') >= 0;
    }
    return false;
  }

  function secureChatPreviewUrl(file) {
    if (!file || !window.URL || typeof window.URL.createObjectURL !== 'function') {
      return '';
    }
    var mime = String(file.type || '').toLowerCase();
    if (mime.indexOf('image/') !== 0 && mime.indexOf('video/') !== 0 && mime.indexOf('audio/') !== 0) {
      return '';
    }
    try {
      return window.URL.createObjectURL(file);
    } catch (_err) {
      return '';
    }
  }

  function stableSecureChatFile(file, previewUrl) {
    if (!file || typeof file.arrayBuffer !== 'function' || typeof window.File !== 'function') {
      return Promise.resolve(file);
    }
    return Promise.resolve(file.arrayBuffer()).then(function (buffer) {
      var stable = new window.File([buffer], file.name || 'attachment.bin', {
        type: file.type || 'application/octet-stream',
        lastModified: file.lastModified || Date.now()
      });
      if (previewUrl) {
        try {
          stable.simplexPreviewUrl = previewUrl;
        } catch (_err) {
          // Preview metadata is optional; the cloned file still sends correctly.
        }
      }
      return stable;
    });
  }

  function revokeSecureChatPreviewUrl(url) {
    if (!url || !window.URL || typeof window.URL.revokeObjectURL !== 'function') {
      return;
    }
    try {
      window.URL.revokeObjectURL(url);
    } catch (_err) {
      // Object URL cleanup should never interfere with attachment handling.
    }
  }

  function addSecureChatPendingFiles(files) {
    var blockedAudio = false;
    var list = Array.prototype.slice.call(files || []).filter(Boolean).filter(function (file) {
      if (secureChatAudioFileLike(file) && state.chat.voicePermission !== 'granted') {
        blockedAudio = true;
        return false;
      }
      return true;
    });
    if (blockedAudio) {
      state.chat.error = 'Voice notes are locked for this chat. Ask permission before sending audio.';
    }
    if (!list.length) {
      if (blockedAudio) renderContent();
      return false;
    }
    var current = Array.isArray(state.chat.pendingFiles) ? state.chat.pendingFiles.slice() : [];
    list.forEach(function (file) {
      state.chat.attachedFilesToken += 1;
      var previewUrl = secureChatPreviewUrl(file);
      if (previewUrl) {
        try {
          file.simplexPreviewUrl = previewUrl;
        } catch (_err) {
          // Non-extensible File objects still send normally; they just skip the local preview URL.
        }
      }
      var item = {
        id: 'pending-' + String(Date.now()) + '-' + String(state.chat.attachedFilesToken),
        file: file,
        previewUrl: previewUrl,
        preparing: true
      };
      item.filePromise = stableSecureChatFile(file, previewUrl).then(function (stableFile) {
        item.file = stableFile || file;
        item.preparing = false;
        renderContent();
        return item.file;
      }, function (err) {
        item.preparing = false;
        state.chat.error = err && err.message ? err.message : 'Could not prepare the selected attachment.';
        renderContent();
        throw err;
      });
      item.filePromise.catch(function () {
        // The send path reports preparation errors; this prevents idle selected files from creating unhandled rejections.
      });
      current.push(item);
    });
    state.chat.pendingFiles = current;
    state.chat.error = blockedAudio ? state.chat.error : '';
    renderContent();
    return true;
  }

  function removeSecureChatPendingFile(fileId) {
    var id = String(fileId || '');
    var current = Array.isArray(state.chat.pendingFiles) ? state.chat.pendingFiles : [];
    current.forEach(function (item) {
      if (String(item && item.id || '') === id) {
        revokeSecureChatPreviewUrl(String(item && item.previewUrl || ''));
      }
    });
    state.chat.pendingFiles = current.filter(function (item) {
      return String(item && item.id || '') !== id;
    });
    renderContent();
  }

  function secureChatReadyPendingFiles(pending) {
    return Promise.all((Array.isArray(pending) ? pending : []).map(function (item) {
      if (!item) return null;
      if (item.filePromise && typeof item.filePromise.then === 'function') {
        return item.filePromise;
      }
      return item.file || null;
    })).then(function (files) {
      return files.filter(Boolean);
    });
  }

  function stopSecureChatVoiceTracks() {
    var stream = state.chat.voiceStream;
    state.chat.voiceStream = null;
    if (!stream || typeof stream.getTracks !== 'function') return;
    stream.getTracks().forEach(function (track) {
      try {
        track.stop();
      } catch (_err) {
        // Track cleanup is best-effort after MediaRecorder finishes.
      }
    });
  }

  function finishSecureChatVoiceRecording() {
    var chunks = Array.isArray(state.chat.voiceChunks) ? state.chat.voiceChunks.slice() : [];
    var mime = state.chat.voiceMime || (chunks[0] && chunks[0].type) || 'audio/webm';
    state.chat.voiceChunks = [];
    state.chat.voiceRecorder = null;
    state.chat.voiceRecording = false;
    stopSecureChatVoiceTracks();
    if (!chunks.length) {
      state.chat.error = 'No voice note audio was recorded.';
      renderContent();
      return;
    }
    var blob = new Blob(chunks, { type: mime });
    var ext = secureChatVoiceExtension(mime);
    var file = new File([blob], 'voice-note-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext, {
      type: mime || 'audio/webm',
      lastModified: Date.now()
    });
    addSecureChatPendingFiles([file]);
    state.chat.error = '';
    renderContent();
  }

  function startSecureChatVoiceRecording() {
    if (!secureChatVoiceNoteSupported()) {
      state.chat.error = 'Voice recording is not supported in this browser.';
      renderContent();
      return Promise.resolve(false);
    }
    if (state.chat.voicePermission !== 'granted') {
      return requestSecureChatVoicePermission();
    }
    state.chat.error = '';
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var mime = secureChatVoiceMimeType();
      var options = mime ? { mimeType: mime } : {};
      var recorder = new window.MediaRecorder(stream, options);
      state.chat.voiceStream = stream;
      state.chat.voiceRecorder = recorder;
      state.chat.voiceChunks = [];
      state.chat.voiceMime = mime || recorder.mimeType || 'audio/webm';
      recorder.addEventListener('dataavailable', function (event) {
        if (event && event.data && event.data.size > 0) {
          state.chat.voiceChunks.push(event.data);
        }
      });
      recorder.addEventListener('stop', finishSecureChatVoiceRecording);
      recorder.addEventListener('error', function () {
        state.chat.voiceRecording = false;
        state.chat.error = 'Voice recording failed.';
        stopSecureChatVoiceTracks();
        renderContent();
      });
      recorder.start();
      state.chat.voiceRecording = true;
      renderContent();
      return true;
    }).catch(function (err) {
      state.chat.voiceRecording = false;
      stopSecureChatVoiceTracks();
      state.chat.error = err && err.message ? err.message : 'Microphone permission was not granted.';
      renderContent();
      return false;
    });
  }

  function stopSecureChatVoiceRecording() {
    var recorder = state.chat.voiceRecorder;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      return true;
    }
    state.chat.voiceRecording = false;
    stopSecureChatVoiceTracks();
    renderContent();
    return false;
  }

  function requestSecureChatVoicePermission() {
    if (state.chat.voicePermission === 'requested') {
      state.chat.error = 'Voice note permission has already been requested. Your contact can reply "allow voice notes" to unlock recording.';
      renderContent();
      return Promise.resolve(false);
    }
    var ok = true;
    if (typeof window.confirm === 'function') {
      ok = window.confirm('Ask this contact for permission to send voice notes?');
    }
    if (!ok) return Promise.resolve(false);
    saveSecureChatVoicePermissionToBrowser('requested');
    state.chat.error = 'Voice note permission request sent. Your contact can reply "allow voice notes" to unlock recording.';
    renderContent();
    return sendSecureChatMessage(SECURE_CHAT_VOICE_REQUEST_TEXT);
  }

  function handleSecureChatVoiceNoteAction() {
    if (state.chat.sending) {
      return Promise.resolve(false);
    }
    if (state.chat.voiceRecording) {
      return Promise.resolve(stopSecureChatVoiceRecording());
    }
    return startSecureChatVoiceRecording();
  }

  function secureChatInferLastSeq(messages) {
    return (Array.isArray(messages) ? messages : []).reduce(function (maxSeq, message) {
      var seq = Number(message && message.seq || 0);
      return seq > maxSeq ? seq : maxSeq;
    }, 0);
  }

  function secureChatLocalDeliveryStatus(receipt) {
    var status = String(receipt && (receipt.delivery_status || receipt.transport_status || receipt.status) || 'queued').trim();
    return status || 'queued';
  }

  function secureChatSendIcon() {
    return '<svg class="secure-chat-send-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 9-18 9 4-9-4-9Z"/><path d="M7 12h14"/></svg>';
  }

  function secureChatMicIcon() {
    return '<svg class="secure-chat-mic-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/><path d="M8 22h8"/></svg>';
  }

  function secureChatVoiceButtonLabel() {
    if (!secureChatVoiceNoteSupported()) return 'Voice notes are not supported in this browser';
    if (state.chat.voiceRecording) return 'Stop recording voice note';
    if (state.chat.voicePermission === 'granted') return 'Record voice note';
    if (state.chat.voicePermission === 'requested') return 'Voice note permission requested';
    return 'Ask permission to send voice notes';
  }

  function secureChatRemoveIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  }

  function secureChatEmojiIcon() {
    return '<svg class="secure-chat-emoji-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M8.4 10.1h.01M15.6 10.1h.01M8.6 14.2c.78 1.2 1.9 1.8 3.4 1.8s2.62-.6 3.4-1.8"/></svg>';
  }

  function secureChatEmojiSectionIcon(id) {
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

  function renderSecureChatEmojiSectionTabs() {
    var html = '<div class="secure-chat-emoji-section-tabs" role="tablist" aria-label="Emoji sections">';
    secureChatEmojiSectionDefs.forEach(function (section, index) {
      html += '<button type="button" class="' + (index === 0 ? 'is-active' : '') + '" role="tab" aria-selected="' + (index === 0 ? 'true' : 'false') + '" data-secure-chat-action="emoji-section" data-secure-chat-section="' + escapeHtml(section.id) + '" aria-label="Show ' + escapeHtml(section.label) + '" title="' + escapeHtml(section.label) + '">' + secureChatEmojiSectionIcon(section.id) + '</button>';
    });
    html += '</div>';
    return html;
  }

  function renderSecureChatEmojiGrid(emojis, emptyText) {
    if (!emojis.length) {
      return '<p class="secure-chat-emoji-empty">' + escapeHtml(emptyText || 'No emojis found.') + '</p>';
    }
    var html = '<div class="secure-chat-emoji-grid">';
    emojis.forEach(function (emoji) {
      var item = emoji && typeof emoji === 'object' ? emoji : { unicode: String(emoji || ''), label: String(emoji || '') };
      if (!item.unicode) return;
      html += '<button type="button" class="secure-chat-emoji-choice" data-secure-chat-action="emoji-pick" data-secure-chat-emoji="' + escapeHtml(item.unicode) + '" aria-label="Insert ' + escapeHtml(item.label || item.unicode) + '">' + escapeHtml(item.unicode) + '</button>';
    });
    html += '</div>';
    return html;
  }

  function renderSecureChatEmojiScrollableSections() {
    var query = String(state.chat.emojiPickerQuery || '').trim();
    var recentItems = normalizeSecureChatRecentEmojis(state.chat.recentEmojis).map(function (emoji) {
      return { unicode: emoji, label: emoji };
    });
    var html = '<div class="secure-chat-emoji-scroll" data-secure-chat-emoji-scroll>';
    html += '<section class="secure-chat-emoji-section secure-chat-emoji-recent" data-secure-chat-section-panel="recent" aria-label="Recently Used"><h3>Recently Used</h3>';
    html += renderSecureChatEmojiGrid(recentItems, 'No recent emojis yet.');
    html += '</section>';
    if (query) {
      html += '<section class="secure-chat-emoji-section" data-secure-chat-section-panel="search" aria-label="Search Results"><h3>Search Results</h3>';
      html += renderSecureChatEmojiGrid(state.chat.emojiSearchResults || [], 'No matching emojis.');
      html += '</section>';
    } else {
      (Array.isArray(state.chat.emojiGroups) ? state.chat.emojiGroups : []).forEach(function (group) {
        html += '<section class="secure-chat-emoji-section" data-secure-chat-section-panel="' + escapeHtml(group.id || '') + '" aria-label="' + escapeHtml(group.label || '') + '"><h3>' + escapeHtml(group.label || '') + '</h3>';
        html += renderSecureChatEmojiGrid(group.emojis || [], 'No emojis in this section.');
        html += '</section>';
      });
    }
    html += '</div>';
    return html;
  }

  function renderSecureChatEmojiPicker() {
    if (state.chat.emojiPickerOpen !== true) {
      return '';
    }
    var html = '<div class="secure-chat-emoji-popover" role="dialog" aria-label="Emoji picker">';
    html += '<div class="secure-chat-emoji-search-wrap"><input class="secure-chat-emoji-search" type="search" placeholder="Search emoji" value="' + escapeHtml(state.chat.emojiPickerQuery || '') + '" data-secure-chat-action="emoji-search" aria-label="Search emoji" autocomplete="off" spellcheck="false"></div>';
    if (state.chat.emojiPickerError) {
      html += '<p class="secure-chat-emoji-status is-error">' + escapeHtml(state.chat.emojiPickerError) + '</p>';
    } else {
      if (state.chat.emojiPickerLoading) {
        html += '<p class="secure-chat-emoji-status">Loading emoji...</p>';
      }
      html += renderSecureChatEmojiScrollableSections();
    }
    html += renderSecureChatEmojiSectionTabs();
    html += '</div>';
    return html;
  }

  function secureChatComparableMessage(message) {
    return JSON.stringify({
      direction: String(message && message.direction || ''),
      message_ref: String(message && message.message_ref || ''),
      message_kind: String(message && message.message_kind || ''),
      delivery_status: secureChatLocalDeliveryStatus(message),
      created_at: String(message && message.created_at || ''),
      updated_at: String(message && message.updated_at || ''),
      text: String(message && message.text || ''),
      attachment: message && message.attachment ? message.attachment : null
    });
  }

  function secureChatMessageRefSelector(messageRef) {
    var ref = String(messageRef || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return '[data-secure-chat-message-ref="' + ref + '"]';
  }

  function syncSecureChatComposeControls() {
    var sendButton = document.querySelector('[data-secure-chat-action="send"]');
    if (sendButton instanceof HTMLButtonElement) {
      sendButton.disabled = state.chat.sending === true;
      sendButton.setAttribute('aria-label', state.chat.sending ? 'Sending...' : 'Send secure message');
      sendButton.setAttribute('title', state.chat.sending ? 'Sending...' : 'Send secure message');
      if (state.chat.sending) {
        sendButton.setAttribute('aria-busy', 'true');
        sendButton.innerHTML = secureChatSpinnerHtml('secure-chat-send-spinner');
      } else {
        sendButton.removeAttribute('aria-busy');
        sendButton.innerHTML = secureChatSendIcon();
      }
    }
    var voiceButton = document.querySelector('[data-secure-chat-action="voice-note"]');
    if (voiceButton instanceof HTMLButtonElement) {
      voiceButton.disabled = state.chat.sending === true || !secureChatVoiceNoteSupported();
      voiceButton.classList.toggle('is-recording', state.chat.voiceRecording === true);
      voiceButton.classList.toggle('is-locked', state.chat.voicePermission !== 'granted');
      voiceButton.setAttribute('aria-label', secureChatVoiceButtonLabel());
      voiceButton.setAttribute('title', secureChatVoiceButtonLabel());
    }
  }

  function patchSecureChatMessageStatus(message) {
    var ref = String(message && message.message_ref || '').trim();
    if (!ref) return false;
    var row = document.querySelector(secureChatMessageRefSelector(ref));
    if (!(row instanceof HTMLElement)) return false;
    var statusHost = row.querySelector('[data-secure-chat-status="true"]');
    if (!(statusHost instanceof HTMLElement)) return false;
    statusHost.innerHTML = secureChatStatusHtml(message);
    return true;
  }

  function normalizeSecureChatPersistedMessages(messages) {
    return Array.isArray(messages) ? messages : [];
  }

  function secureChatUpdateLocalOutgoingStatus(messageRef, receipt) {
    var ref = String((receipt && receipt.message_ref) || messageRef || '').trim();
    if (!ref) {
      return false;
    }
    var updated = false;
    var rows = (Array.isArray(state.chat.messages) ? state.chat.messages : []).map(function (message) {
      if (!message || typeof message !== 'object' || String(message.message_ref || '') !== ref) {
        return message;
      }
      var next = Object.assign({}, message);
      next.delivery_status = secureChatLocalDeliveryStatus(receipt);
      next.updated_at = new Date().toISOString();
      if (receipt && receipt.message_ref) {
        next.message_ref = String(receipt.message_ref || '');
      }
      updated = true;
      return next;
    });
    if (!updated) {
      return false;
    }
    state.chat.messages = rows;
    persistSecureChatSessionToBrowser();
    patchSecureChatMessageStatus(rows.find(function (message) {
      return message && String(message.message_ref || '') === ref;
    }));
    syncSecureChatLastContentHtml();
    syncSecureChatComposeControls();
    return true;
  }

  function secureChatKeepPendingFilesSending(pending, pendingRefs) {
    var files = Array.isArray(pending) ? pending : [];
    (Array.isArray(pendingRefs) ? pendingRefs : []).forEach(function (ref, index) {
      var current = (Array.isArray(state.chat.messages) ? state.chat.messages : []).find(function (message) {
        return message && String(message.message_ref || '') === String(ref || '');
      });
      var status = secureChatLocalDeliveryStatus(current);
      if (status && status !== 'queued' && status !== 'sending' && status !== 'sndNew') return;
      var receipt = {
        message_ref: ref,
        delivery_status: 'sending',
        attachment: secureChatPendingFileReceipt(files[index], ref).attachment
      };
      if (!secureChatUpdateLocalOutgoingStatus(ref, receipt)) {
        patchSecureChatMessageStatus(receipt);
        syncSecureChatLastContentHtmlFromDom();
      }
    });
    files.forEach(function (fileRef) {
      var meta = secureChatPendingFileMeta(fileRef);
      var rows = document.querySelectorAll('#secure-chat-thread .secure-chat-message.is-outgoing');
      Array.prototype.forEach.call(rows, function (row) {
        if (!(row instanceof HTMLElement) || String(row.getAttribute('data-secure-chat-message-ref') || '').trim()) return;
        if (meta.name && row.innerText.indexOf(meta.name) < 0) return;
        var statusHost = row.querySelector('[data-secure-chat-status="true"]');
        if (!(statusHost instanceof HTMLElement) || !/Sending/i.test(statusHost.innerText || '')) return;
        statusHost.innerHTML = secureChatStatusHtml({ delivery_status: 'sending' });
      });
    });
    persistSecureChatSessionToBrowser();
    syncSecureChatLastContentHtmlFromDom();
    syncSecureChatComposeControls();
  }

  function secureChatAppendLocalOutgoing(text, receipt) {
    var rows = Array.isArray(state.chat.messages) ? state.chat.messages.slice() : [];
    var messageRef = String(receipt && receipt.message_ref || '');
    var attachment = receipt && receipt.attachment && typeof receipt.attachment === 'object'
      ? {
        name: String(receipt.attachment.name || 'Attachment'),
        mime: String(receipt.attachment.mime || ''),
        size: Number(receipt.attachment.size || 0) || 0,
        data_url: String(receipt.attachment.data_url || receipt.attachment.dataUrl || ''),
        url: String(receipt.attachment.url || ''),
        file_path: String(receipt.attachment.file_path || receipt.attachment.filePath || '')
      }
      : null;
    var now = new Date().toISOString();
    var next = {
      seq: 0,
      direction: 'outgoing',
      message_ref: messageRef,
      message_kind: attachment ? 'file' : 'text',
      delivery_status: secureChatLocalDeliveryStatus(receipt),
      created_at: now,
      updated_at: now,
      text: String(text || ''),
      attachment: attachment
    };
    var existingIndex = messageRef ? rows.findIndex(function (message) {
      return message && String(message.direction || '') === 'outgoing' &&
        String(message.message_ref || '') === messageRef;
    }) : -1;
    if (existingIndex >= 0) {
      next.created_at = String(rows[existingIndex].created_at || now);
      rows[existingIndex] = Object.assign({}, rows[existingIndex], next);
    } else {
      rows.push(next);
    }
    state.chat.messages = rows;
  }

  function secureChatMergeBrowserTransportMessages(messages) {
    var incoming = secureChatLocalBrowserRows(Array.isArray(messages) ? messages : []);
    if (!incoming.length) {
      return false;
    }
    var rows = Array.isArray(state.chat.messages) ? state.chat.messages.slice() : [];
    var changed = false;
    incoming.forEach(function (message) {
      var ref = String(message && message.message_ref || '').trim();
      var direction = String(message && message.direction || '') === 'incoming' ? 'incoming' : 'outgoing';
      var existingIndex = rows.findIndex(function (row) {
        return String(row && row.direction || '') === direction &&
          !!ref &&
          String(row && row.message_ref || '') === ref;
      });
      var next = Object.assign({}, message, {
        seq: 0,
        direction: direction,
        delivery_status: secureChatLocalDeliveryStatus(message),
        updated_at: String(message && message.updated_at || '') || new Date().toISOString()
      });
      if (existingIndex >= 0) {
        var merged = Object.assign({}, rows[existingIndex], next);
        if (secureChatComparableMessage(rows[existingIndex]) !== secureChatComparableMessage(merged)) {
          rows[existingIndex] = merged;
          changed = true;
        }
        return;
      }
      var text = String(next.text || '');
      var duplicateText = !ref && text && rows.some(function (row) {
        return String(row && row.direction || '') === direction && String(row && row.text || '') === text;
      });
      if (!duplicateText) {
        rows.push(next);
        changed = true;
      }
    });
    if (!changed) {
      return false;
    }
    rows.sort(function (a, b) {
      var aTime = String(a && (a.created_at || a.updated_at) || '');
      var bTime = String(b && (b.created_at || b.updated_at) || '');
      return aTime.localeCompare(bTime);
    });
    state.chat.messages = rows;
    secureChatApplyVoicePermissionMessages(rows);
    return true;
  }

  function refreshSecureChatBrowserMessages() {
    var transport = secureChatBrowserTransport();
    if (!transport || typeof transport.getMessages !== 'function' || state.chat.browserReceiveInFlight) {
      return Promise.resolve(false);
    }
    var ownerContactLink = secureChatOwnerContactLink();
    var contactId = secureChatOwnerContactId(ownerContactLink);
    if (!ownerContactLink && !contactId) {
      return Promise.resolve(false);
    }
    state.chat.browserReceiveInFlight = true;
    return Promise.resolve(transport.getMessages({
      contact_id: contactId,
      contact_link: ownerContactLink,
      user_id: ownerContactLink ? '' : (state.chat.mapping && state.chat.mapping.bridge_user_id ? String(state.chat.mapping.bridge_user_id) : ''),
      accountKey: secureChatStorageAccountKey(),
      siteKey: secureChatStorageSiteKey(),
      count: 50
    })).then(function (messages) {
      var changed = secureChatMergeBrowserTransportMessages(messages);
      if (changed) {
        persistSecureChatSessionToBrowser();
        renderContent();
      }
      return changed;
    }).catch(function () {
      return false;
    }).finally(function () {
      state.chat.browserReceiveInFlight = false;
    });
  }

  function hydrateSecureChatSessionFromBrowser() {
    var store = secureChatSessionStore();
    var accountKey = secureChatStorageAccountKey();
    if (!store || !accountKey) {
      return false;
    }
    var session = store.readSession(window.localStorage, secureChatStorageSiteKey(), accountKey);
    if (!session || (!String(session.draftText || '') && !(session.messages || []).length && !(session.uploads || []).length)) {
      return false;
    }
    state.chat.draftText = String(session.draftText || '');
    state.chat.messages = normalizeSecureChatPersistedMessages(session.messages);
    state.chat.uploads = Array.isArray(session.uploads) ? session.uploads : [];
    state.chat.service = session.service && typeof session.service === 'object' ? session.service : state.chat.service;
    state.chat.mapping = session.mapping && typeof session.mapping === 'object' ? session.mapping : state.chat.mapping;
    state.chat.voicePermission = normalizeSecureChatVoicePermission(session.voicePermission || state.chat.voicePermission);
    loadSecureChatVoicePermissionFromBrowser();
    state.chat.localUploads = {};
    state.chat.lastSeq = Number(session.lastSeq || secureChatInferLastSeq(state.chat.messages) || 0);
    state.chat.simplexWebIntroDismissed = secureChatSimplexInfoDismissedFromBrowser();
    loadSecureChatRecentEmojis();
    return true;
  }

  function persistSecureChatSessionToBrowser() {
    var store = secureChatSessionStore();
    var accountKey = secureChatStorageAccountKey();
    if (!store || !accountKey) {
      return false;
    }
    store.writeSession(window.localStorage, secureChatStorageSiteKey(), accountKey, {
      draftText: state.chat.draftText || '',
      lastSeq: Number(state.chat.lastSeq || secureChatInferLastSeq(state.chat.messages) || 0),
      messages: state.chat.messages || [],
      uploads: secureChatPersistableUploads(),
      service: state.chat.service || null,
      mapping: state.chat.mapping || null,
      voicePermission: normalizeSecureChatVoicePermission(state.chat.voicePermission)
    });
    return true;
  }

  function resetSecureChatState() {
    if (state.chat.pollTimer) {
      clearTimeout(state.chat.pollTimer);
    }
    state.chat.pollTimer = null;
    state.chat.browserReceiveInFlight = false;
    state.chat.available = false;
    state.chat.loading = false;
    state.chat.sending = false;
    state.chat.npub = '';
    state.chat.service = null;
    state.chat.mapping = null;
    state.chat.messages = [];
    state.chat.uploads = [];
    state.chat.localUploads = {};
    state.chat.pendingFiles = [];
    state.chat.lastSeq = 0;
    state.chat.sendWithModifier = false;
    state.chat.sessionVerified = false;
    state.chat.authRejected = false;
    state.chat.authChecking = false;
    state.chat.authCheckComplete = false;
    state.chat.authCheckPromise = null;
    state.chat.error = '';
    state.chat.emojiPickerOpen = false;
    state.chat.emojiPickerLoading = false;
    state.chat.emojiPickerError = '';
    state.chat.filePickerOpen = false;
    state.chat.renderDeferredWhileFilePickerOpen = false;
    state.chat.simplexWebIntroDismissed = false;
    state.chat.adminMappings = [];
    state.chat.chatStarted = false;
    state.chat.chatOpening = false;
    state.chat.chatClosing = false;
    state.chat.voicePermission = 'locked';
    state.chat.voiceRecording = false;
    state.chat.voiceRecorder = null;
    state.chat.voiceChunks = [];
    stopSecureChatVoiceTracks();
  }

  function hasVerifiedSecureChatSession() {
    return hasSecureChatSession() && state.chat.sessionVerified === true;
  }

  function hasUsableSecureChatSession() {
    var browserSession = hasSecureChatSession() || (!!storedSessionToken() && secureChatStoredAuthHint());
    return browserSession && state.chat.authRejected !== true && (
      state.chat.sessionVerified === true || state.chat.authCheckComplete === true || secureChatStoredAuthHint()
    );
  }

  function secureChatLoadingBeforeVerification(loggedIn) {
    return !loggedIn && !state.chat.authRejected && (
      state.chat.loading || state.chat.authChecking || secureChatAuthPending() ||
      (hasSecureChatSession() && state.chat.authCheckComplete !== true && !state.chat.error)
    );
  }

  function renderSecureChatThreadState() {
    return renderSecureChatThreadScrollState(null);
  }

  function secureChatPanelSignature() {
    var chat = state.chat || {};
    return JSON.stringify({
      available: !!chat.available,
      loading: !!chat.loading,
      sending: !!chat.sending,
      error: String(chat.error || ''),
      service: chat.service || null,
      mapping: chat.mapping || null,
      uploads: chat.uploads || [],
      messages: chat.messages || [],
      pendingFiles: secureChatPendingFileMetas(),
      draftText: String(chat.draftText || ''),
      simplexWebIntroDismissed: chat.simplexWebIntroDismissed === true,
      sendWithModifier: chat.sendWithModifier === true,
      emojiPickerOpen: chat.emojiPickerOpen === true,
      emojiPickerLoading: chat.emojiPickerLoading === true,
      emojiPickerError: String(chat.emojiPickerError || ''),
      recentEmojis: normalizeSecureChatRecentEmojis(chat.recentEmojis),
      chatStarted: chat.chatStarted === true,
      chatOpening: chat.chatOpening === true,
      chatClosing: chat.chatClosing === true,
      voicePermission: String(chat.voicePermission || ''),
      voiceRecording: chat.voiceRecording === true
    });
  }

  function renderSecureChatContentIfChanged(previousSignature, force) {
    var nextSignature = secureChatPanelSignature();
    if (force || previousSignature !== nextSignature) {
      if (!force && secureChatHasVolatileLocalOutgoingRows()) {
        syncSecureChatLastContentHtmlFromDom();
        return false;
      }
      renderContent();
      return true;
    }
    return false;
  }

  function secureChatHasVolatileLocalOutgoingRows() {
    if (Number(state.chat.localOutgoingVolatileUntil || 0) > Date.now()) {
      return true;
    }
    return (Array.isArray(state.chat.messages) ? state.chat.messages : []).some(function (message) {
      if (!message || String(message.direction || '') !== 'outgoing') return false;
      if (!Number(message.seq || 0)) {
        var created = Date.parse(String(message.created_at || message.updated_at || ''));
        if (Number.isFinite(created) && Date.now() - created < 300000) return true;
      }
      var status = secureChatLocalDeliveryStatus(message);
      return status === 'sending' || status === 'sndNew' || status === 'file-invitation-sent';
    });
  }

  function renderSecureChatThreadScrollState(previous) {
    var thread = document.getElementById('secure-chat-thread');
    if (!(thread instanceof HTMLElement)) {
      return;
    }
    var maxTop = Math.max(0, Number(thread.scrollHeight || 0) - Number(thread.clientHeight || 0));
    if (previous && previous.threadHadScrollState && previous.threadWasAtBottom !== true) {
      var previousDistance = Number(previous.threadDistanceFromBottom || 0);
      var nextTop = maxTop - previousDistance;
      thread.scrollTop = Math.max(0, Math.min(nextTop, maxTop));
      state.chat.threadPinnedToBottom = secureChatThreadDistanceFromBottom(thread) <= 24;
      return;
    }
    if (thread.querySelector('.secure-chat-simplex-info') && !(previous && previous.threadHadScrollState)) {
      thread.scrollTop = 0;
      state.chat.threadPinnedToBottom = false;
      return;
    }
    thread.scrollTop = maxTop;
    state.chat.threadPinnedToBottom = true;
  }

  function secureChatThreadDistanceFromBottom(thread) {
    if (!(thread instanceof HTMLElement)) {
      return 0;
    }
    return Math.max(0, Number(thread.scrollHeight || 0) - Number(thread.clientHeight || 0) - Number(thread.scrollTop || 0));
  }

  function secureChatScrollThreadToBottom() {
    var thread = document.getElementById('secure-chat-thread');
    if (thread instanceof HTMLElement) {
      thread.scrollTop = Math.max(0, Number(thread.scrollHeight || 0) - Number(thread.clientHeight || 0));
    }
  }

  function refreshSecureChatState(opts) {
    if (!hasSecureChatSession()) {
      state.chat.available = false;
      state.chat.loading = false;
      state.chat.error = '';
      renderContent();
      return Promise.resolve(false);
    }
    var options = opts || {};
    var previousSignature = secureChatPanelSignature();
    state.chat.available = true;
    state.chat.loading = true;
    secureChatMergeLocalBrowserRows(secureChatStoredLocalBrowserRows());
    if (options.reset) {
      state.chat.messages = secureChatLocalBrowserRows(state.chat.messages);
      state.chat.lastSeq = 0;
    }
    return secureChatFormPost('/cgi/blog-secure-chat-state', {
      since_seq: String(options.reset ? 0 : (state.chat.lastSeq || 0)),
      include_admin: 'false'
    }).then(function (data) {
      state.chat.loading = false;
      state.chat.error = '';
      state.chat.authRejected = false;
      state.chat.sessionVerified = true;
      state.chat.npub = String(data.npub || state.chat.npub || '');
      state.chat.sessionDisplayName = String(data.session_display_name || state.chat.sessionDisplayName || secureChatSessionDisplayName() || '');
      state.chat.service = data.service || null;
      state.chat.mapping = data.mapping || null;
      loadSecureChatVoicePermissionFromBrowser();
      secureChatRegisterBrowserNativeTransport();
      state.chat.uploads = Array.isArray(data.uploads) ? data.uploads : [];
      state.chat.adminMappings = data.admin && Array.isArray(data.admin.mappings) ? data.admin.mappings : [];
      var serverMessages = data.messages || [];
      var hasIncomingServerRows = secureChatHasIncomingServerRows(serverMessages);
      secureChatMergeMessages(serverMessages);
      if (secureChatCursorSeq(data.cursor_seq) > Number(state.chat.lastSeq || 0)) {
        state.chat.lastSeq = secureChatCursorSeq(data.cursor_seq);
      }
      persistSecureChatSessionToBrowser();
      renderSecureChatContentIfChanged(previousSignature, !!options.reset || hasIncomingServerRows);
      reconcileSecureChatPendingLocalOutgoing();
      refreshSecureChatBrowserMessages();
      return true;
    }).catch(function (err) {
      if (isPageLifecycleClosing()) {
        return false;
      }
      state.chat.loading = false;
      if (err && (err.code === 'auth_required' || err.code === 'csrf_invalid')) {
        state.chat.sessionVerified = false;
        state.chat.authRejected = true;
      }
      if (err && err.code === 'timeout' && hasUsableSecureChatSession()) {
        state.chat.error = '';
      } else {
        state.chat.error = err && err.message ? err.message : 'Could not refresh Secure Chat.';
      }
      renderContent();
      return false;
    });
  }

  function reconcileSecureChatPendingLocalOutgoing() {
    var transport = secureChatBrowserTransport();
    if (!transport || typeof transport.getMessageStatus !== 'function') {
      return;
    }
    var pending = secureChatLocalOutgoingRows(state.chat.messages)
      .filter(secureChatLocalOutgoingNeedsStatus)
      .slice(-5);
    if (!pending.length) {
      return;
    }
    var ownerContactLink = secureChatOwnerContactLink();
    var contactId = secureChatOwnerContactId(ownerContactLink);
    var userId = ownerContactLink ? '' : (state.chat.mapping && state.chat.mapping.bridge_user_id ? String(state.chat.mapping.bridge_user_id) : '');
    pending.forEach(function (message) {
      Promise.resolve(transport.getMessageStatus({
        contact_id: contactId,
        contact_link: ownerContactLink,
        user_id: userId,
        message_ref: String(message.message_ref || ''),
        accountKey: secureChatStorageAccountKey(),
        siteKey: secureChatStorageSiteKey()
      })).then(function (receipt) {
        var status = secureChatLocalDeliveryStatus(receipt);
        if (status && status !== 'unknown' && status !== 'queued') {
          secureChatUpdateLocalOutgoingStatus(String(message.message_ref || ''), receipt || {});
        }
      }).catch(function () {
        // Pending rows keep their last SimpleX status when a browser-local lookup fails.
      });
    });
  }

  function scheduleSecureChatPoll() {
    if (state.chat.pollTimer) {
      clearTimeout(state.chat.pollTimer);
      state.chat.pollTimer = null;
    }
    if (document.hidden || !hasSecureChatSession()) {
      return;
    }
    state.chat.pollTimer = window.setTimeout(function () {
      refreshSecureChatBrowserMessages();
      refreshSecureChatState().finally(function () {
        scheduleSecureChatPoll();
      });
    }, 2500);
  }

  function sendSecureChatMessage(text) {
    var message = String(text || '');
    if (secureChatHasPendingFiles()) {
      return sendSecureChatPendingFiles(message);
    }
    if (!message.trim()) {
      return Promise.resolve(false);
    }
    var clientMessageId = secureChatClientMessageId();
    state.chat.sending = true;
    keepSecureChatLocalOutgoingStable();
    state.chat.error = '';
    state.chat.draftText = '';
    secureChatAppendLocalOutgoing(message, {
      message_ref: clientMessageId,
      delivery_status: 'sending'
    });
    persistSecureChatSessionToBrowser();
    renderContent();
    return waitForSecureChatSendDestination(3000).then(function (destination) {
      return waitForSecureChatBrowserNativeTransport(2500).then(function (transport) {
        return { destination: destination, transport: transport };
      });
    }).then(function (ready) {
      var transport = ready && ready.transport;
      var destination = ready && ready.destination ? ready.destination : secureChatSendDestination();
      if (!transport || typeof transport.sendText !== 'function') {
        throw secureChatTransportUnavailableError();
      }
      return transport.sendText({
        contact_id: destination.contactId,
        contact_link: destination.ownerContactLink,
        user_id: destination.userId,
        text: message,
        client_message_id: clientMessageId,
        timeout_ms: 15000,
        status_timeout_ms: 60000,
        accountKey: secureChatStorageAccountKey(),
        siteKey: secureChatStorageSiteKey(),
        on_status: function (receipt) {
          secureChatUpdateLocalOutgoingStatus(clientMessageId, receipt || {});
        }
      });
    }).then(function (receipt) {
      state.chat.sending = false;
      if (!secureChatUpdateLocalOutgoingStatus(clientMessageId, receipt || {})) {
        secureChatAppendLocalOutgoing(message, receipt || {});
        renderContent();
      }
      persistSecureChatSessionToBrowser();
      syncSecureChatComposeControls();
      return true;
    }).catch(function (err) {
      if (isPageLifecycleClosing()) {
        return false;
      }
      state.chat.sending = false;
      state.chat.error = err && err.message ? err.message : 'Could not send Secure Chat message.';
      secureChatUpdateLocalOutgoingStatus(clientMessageId, {
        message_ref: clientMessageId,
        delivery_status: 'failed'
      });
      syncSecureChatComposeControls();
      return false;
    });
  }

  function handleSecureChatLoginClick() {
    if (hasSecureChatSession()) {
      state.chat.error = '';
      state.chat.loading = true;
      renderContent();
      return refreshSecureChatState({ reset: true }).then(function (ok) {
        if (ok) {
          scheduleSecureChatPoll();
        }
        return ok;
      });
    }
    if (window.blogAuth && typeof window.blogAuth.startLogin === 'function') {
      return window.blogAuth.startLogin().then(function () {
        return true;
      }).catch(function () {
        return false;
      });
    }
    if (window.blogAuth && typeof window.blogAuth.openLoginModal === 'function') {
      window.blogAuth.openLoginModal('auto');
    } else {
      state.chat.error = 'Login is still loading. The Secure Chat sign-in panel will be available in a moment.';
      renderContent();
    }
    return Promise.resolve(false);
  }

  function handleSecureChatStartClick() {
    state.chat.chatStarted = true;
    state.chat.chatOpening = true;
    state.chat.chatClosing = false;
    state.chat.error = '';
    state.chat.loading = true;
    renderContent();
    window.setTimeout(function () {
      state.chat.chatOpening = false;
      renderContent();
    }, 260);
    return refreshSecureChatState({ reset: true }).finally(function () {
      scheduleSecureChatPoll();
    });
  }

  function handleSecureChatCloseClick() {
    if (state.chat.chatStarted !== true || state.chat.chatClosing === true) {
      return;
    }
    state.chat.chatOpening = false;
    state.chat.chatClosing = true;
    state.chat.emojiPickerOpen = false;
    renderContent();
    window.setTimeout(function () {
      if (state.chat.chatClosing !== true) {
        return;
      }
      state.chat.chatStarted = false;
      state.chat.chatClosing = false;
      state.chat.threadPinnedToBottom = true;
      renderContent();
    }, 240);
  }

  function sendSecureChatPendingFiles(text) {
    var pending = Array.isArray(state.chat.pendingFiles) ? state.chat.pendingFiles.slice() : [];
    var message = String(text || '');
    if (!pending.length) {
      return Promise.resolve(false);
    }
    var clientMessageId = secureChatClientMessageId();
    var pendingRefs = pending.map(function (_item, index) {
      return clientMessageId + (pending.length > 1 ? '-' + index : '');
    });
    state.chat.sending = true;
    keepSecureChatLocalOutgoingStable();
    state.chat.error = '';
    state.chat.draftText = '';
    state.chat.pendingFiles = [];
    pending.forEach(function (item, index) {
      secureChatAppendLocalOutgoing(message, secureChatPendingFileReceipt(item, pendingRefs[index]));
    });
    persistSecureChatSessionToBrowser();
    renderContent();
    return secureChatReadyPendingFiles(pending).then(function (list) {
      if (!list.length) {
        throw new Error('No selected attachments are ready to send.');
      }
      return waitForSecureChatSendDestination(3000).then(function (destination) {
        return waitForSecureChatBrowserNativeTransport(2500).then(function (transport) {
          return { transport: transport, destination: destination, files: list };
        });
      });
    }).then(function (ready) {
      var transport = ready && ready.transport;
      var destination = ready && ready.destination ? ready.destination : secureChatSendDestination();
      var list = ready && ready.files;
      if (!transport || typeof transport.sendFiles !== 'function') {
        throw secureChatTransportUnavailableError();
      }
      return transport.sendFiles({
        files: list,
        contact_id: destination.contactId,
        contact_link: destination.ownerContactLink,
        user_id: destination.userId,
        text: message,
        client_message_id: clientMessageId,
        timeout_ms: 30000,
        status_timeout_ms: 60000,
        accountKey: secureChatStorageAccountKey(),
        siteKey: secureChatStorageSiteKey()
      });
    }).then(function (receipts) {
      state.chat.sending = false;
      receipts = Array.isArray(receipts) ? receipts : [];
      if (!receipts.length) {
        receipts = pendingRefs.map(function (ref, index) {
          return {
            message_ref: ref,
            delivery_status: 'sending',
            attachment: secureChatPendingFileReceipt(pending[index], ref).attachment
          };
        });
      }
      receipts.forEach(function (receipt) {
        var ref = String(receipt && receipt.message_ref || '');
        if (!secureChatUpdateLocalOutgoingStatus(ref, receipt || {})) {
          patchSecureChatMessageStatus(receipt || {});
        }
      });
      secureChatKeepPendingFilesSending(pending, pendingRefs);
      persistSecureChatSessionToBrowser();
      syncSecureChatComposeControls();
      return true;
    }).catch(function (err) {
      if (isPageLifecycleClosing()) {
        return false;
      }
      state.chat.sending = false;
      state.chat.error = err && err.message ? err.message : 'Could not send Secure Chat attachments.';
      pendingRefs.forEach(function (ref) {
        secureChatUpdateLocalOutgoingStatus(ref, {
          message_ref: ref,
          delivery_status: 'failed'
        });
      });
      persistSecureChatSessionToBrowser();
      syncSecureChatComposeControls();
      return false;
    });
  }

  function secureChatStatusLabel(message) {
    var raw = String(message && message.delivery_status || '').trim();
    switch (raw) {
      case 'sndRcvd':
      case 'delivered':
        return 'Delivered';
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

  function secureChatAttachmentKind(attachment) {
    var mime = String(attachment && attachment.mime || '').toLowerCase();
    if (mime.indexOf('image/') === 0) return 'image';
    if (mime.indexOf('video/') === 0) return 'video';
    if (mime.indexOf('audio/') === 0) return 'audio';
    return 'file';
  }

  function secureChatFormatBytes(size) {
    var value = Math.max(0, Math.floor(Number(size || 0) || 0));
    if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' MB';
    if (value >= 1024) return (value / 1024).toFixed(1).replace(/\.0$/, '') + ' KB';
    return String(value) + ' B';
  }

  function secureChatAttachmentHtml(message) {
    var attachment = message && message.attachment;
    if (!attachment) return '';
    var name = String(attachment.name || 'Attachment');
    var mime = String(attachment.mime || 'application/octet-stream');
    var dataUrl = String(attachment.data_url || attachment.dataUrl || '');
    var mediaUrl = dataUrl || String(attachment.url || '');
    var kind = secureChatAttachmentKind(attachment);
    var html = '<div class="secure-chat-attachment secure-chat-attachment-' + kind + '">';
    if (mediaUrl && kind === 'image') {
      html += '<img class="secure-chat-attachment-media" src="' + escapeHtml(mediaUrl) + '" alt="' + escapeHtml(name) + '" loading="lazy">';
    } else if (mediaUrl && kind === 'video') {
      html += '<video class="secure-chat-attachment-media" src="' + escapeHtml(mediaUrl) + '" controls preload="metadata"></video>';
    } else if (mediaUrl && kind === 'audio') {
      html += '<audio class="secure-chat-attachment-audio" src="' + escapeHtml(mediaUrl) + '" controls preload="metadata"></audio>';
    }
    html += '<a class="secure-chat-attachment-file" href="' + (mediaUrl ? escapeHtml(mediaUrl) : '#') + '" download="' + escapeHtml(name) + '">';
    html += '<span class="secure-chat-attachment-line"><span class="secure-chat-attachment-name">' + escapeHtml(name) + '</span>';
    html += '<span class="secure-chat-attachment-meta">' + escapeHtml(mime || 'file') + ' · ' + escapeHtml(secureChatFormatBytes(attachment.size)) + '</span></span>';
    html += '</a></div>';
    return html;
  }

  function secureChatStatusIsSending(message) {
    var raw = String(message && message.delivery_status || '').trim();
    return raw === 'sndNew' || raw === 'sending' || raw === 'file-invitation-sent';
  }

  function secureChatStatusNeedsFollowup(message) {
    var raw = String(message && message.delivery_status || '').trim();
    return raw === 'sndNew' || raw === 'sending' || raw === 'file-invitation-sent' || raw === 'sndSent' || raw === 'sent';
  }

  function secureChatLocalOutgoingNeedsStatus(message) {
    return !!(message && !Number(message.seq || 0) &&
      String(message.direction || '') === 'outgoing' &&
      String(message.message_ref || '').trim() &&
      secureChatStatusNeedsFollowup(message));
  }

  function secureChatSpinnerPhaseStyle() {
    var clock = window.performance && typeof window.performance.now === 'function'
      ? window.performance
      : null;
    var now = clock ? clock.now() : Date.now();
    var phase = Math.floor(Math.abs(Number(now) || 0) % 800);
    return ' style="animation-delay:-' + String(phase) + 'ms"';
  }

  function secureChatSpinnerHtml(className) {
    return '<span class="save-spinner ' + className + '"' + secureChatSpinnerPhaseStyle() + ' aria-hidden="true"></span>';
  }

  function secureChatStatusIconHtml(label) {
    if (label === 'Delivered' || label === 'Read') {
      return '<span class="secure-chat-status is-delivered" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '"><span class="secure-chat-status-check" aria-hidden="true">✓✓</span></span>';
    }
    if (label === 'Sent') {
      return '<span class="secure-chat-status is-sent" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '"><span class="secure-chat-status-check" aria-hidden="true">✓</span></span>';
    }
    return '';
  }

  function secureChatStatusHtml(message) {
    var label = secureChatStatusLabel(message);
    var icon = secureChatStatusIconHtml(label);
    if (secureChatStatusIsSending(message)) {
      return '<span class="secure-chat-status is-sending"><span>' + escapeHtml(label) + '</span>' + secureChatSpinnerHtml('secure-chat-status-spinner') + '</span>';
    }
    if (icon) return icon;
    return '<span class="secure-chat-status">' + escapeHtml(label) + '</span>';
  }

  function secureChatRelativeTime(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var then = Date.parse(raw);
    if (!Number.isFinite(then)) return raw;
    var seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
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

  function secureChatTimeHtml(value) {
    var raw = String(value || '');
    if (!raw) return '<time></time>';
    return '<time datetime="' + escapeHtml(raw) + '" title="' + escapeHtml(raw) + '">' + escapeHtml(secureChatRelativeTime(raw)) + '</time>';
  }

  function secureChatPlatformText() {
    var nav = window.navigator || {};
    var userAgentData = nav.userAgentData && typeof nav.userAgentData.platform === 'string'
      ? nav.userAgentData.platform
      : '';
    return [
      userAgentData,
      typeof nav.platform === 'string' ? nav.platform : '',
      typeof nav.userAgent === 'string' ? nav.userAgent : ''
    ].join(' ').toLowerCase();
  }

  function secureChatShortcutModifierLabel() {
    return /\bmac|iphone|ipad|ipod/.test(secureChatPlatformText()) ? '⌘' : 'Ctrl';
  }

  function runSecureChatAdminAction(action, npub) {
    var auth = authPayload();
    return apiPost('/cgi/blog-secure-chat-admin', {
      action: String(action || ''),
      npub: String(npub || ''),
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (data) {
      state.chat.service = data.service || state.chat.service || null;
      state.chat.adminMappings = Array.isArray(data.mappings) ? data.mappings : [];
      renderContent();
      return data;
    });
  }

  function renderSecureChatPanel() {
    var sharedRenderer = window.SimplexWebDefaultChat && typeof window.SimplexWebDefaultChat.renderPanel === 'function'
      ? window.SimplexWebDefaultChat
      : null;
    if (sharedRenderer) {
      var combinedUploads = secureChatPersistableUploads();
      var loggedIn = hasUsableSecureChatSession();
      return renderContactSectionHeading('Secure Chat', 'secure-chat-title') + sharedRenderer.renderPanel({
        loggedIn: loggedIn,
        loading: secureChatLoadingBeforeVerification(loggedIn),
        hasSigner: true,
        error: state.chat.error,
        sending: state.chat.sending,
        draftText: state.chat.draftText || '',
        service: state.chat.service || null,
        messages: state.chat.messages || [],
        uploads: combinedUploads,
        pendingFiles: secureChatPendingFileMetas(),
        sendWithModifier: state.chat.sendWithModifier === true,
        shortcutModifierLabel: secureChatShortcutModifierLabel(),
        emojiPickerOpen: state.chat.emojiPickerOpen === true,
        emojiPickerLoading: state.chat.emojiPickerLoading === true,
        emojiPickerError: state.chat.emojiPickerError || '',
        emojiPickerQuery: state.chat.emojiPickerQuery || '',
        emojiGroups: state.chat.emojiGroups || [],
        emojiSearchResults: state.chat.emojiSearchResults || [],
        recentEmojis: normalizeSecureChatRecentEmojis(state.chat.recentEmojis),
        voiceNoteSupported: secureChatVoiceNoteSupported(),
        voicePermission: state.chat.voicePermission || 'locked',
        voiceRecording: state.chat.voiceRecording === true,
        simplexWebIntroDismissed: state.chat.simplexWebIntroDismissed === true,
        chatStarted: state.chat.chatStarted === true,
        chatOpening: state.chat.chatOpening === true,
        chatClosing: state.chat.chatClosing === true,
        hideHeading: true,
        savedSummary: secureChatStoredHistorySummary(),
        admin: isAdmin(),
        adminMappings: state.chat.adminMappings || []
      });
    }

    var html = renderContactSectionHeading('Secure Chat', 'secure-chat-title');
    html += '<section class="secure-chat-panel' + (state.chat.chatStarted === true ? ' is-chat-started' : '') + (state.chat.chatOpening === true ? ' is-chat-opening' : '') + (state.chat.chatClosing === true ? ' is-chat-closing' : '') + '" aria-labelledby="secure-chat-title">';
    html += '<div class="secure-chat-head">';
    var fallbackLoggedIn = hasUsableSecureChatSession();
    var fallbackLoading = secureChatLoadingBeforeVerification(fallbackLoggedIn);
    if (!fallbackLoggedIn && fallbackLoading) {
      html += '<div class="secure-chat-loading" role="status" aria-live="polite"><span>Loading...</span>' + secureChatSpinnerHtml('secure-chat-loading-spinner') + '</div>';
    } else if (!fallbackLoggedIn) {
      html += '<div class="secure-chat-login-gate"><p class="secure-chat-login-note">Login with Nostr to chat.</p><button type="button" class="list-admin-primary-btn secure-chat-login-btn" data-secure-chat-action="login">Login...</button></div>';
    } else if (state.chat.chatStarted !== true) {
      html += renderSecureChatStartGate(secureChatStoredHistorySummary());
    } else {
      html += '<button type="button" class="secure-chat-close-btn" data-secure-chat-action="close" aria-label="Close Secure Chat" title="Close Secure Chat"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
    }
    html += '</div>';
    if (!fallbackLoggedIn) {
      html += '</section>';
      return html;
    }
    if (state.chat.chatStarted !== true) {
      html += '</section>';
      return html;
    }
    html += '<div class="secure-chat-body' + (state.chat.chatOpening === true ? ' is-opening' : '') + (state.chat.chatClosing === true ? ' is-closing' : '') + '"><div class="secure-chat-body-inner">';
    if (state.chat.error) {
      html += '<div class="secure-chat-banner is-error">' + escapeHtml(state.chat.error) + '</div>';
    }
    if (state.chat.service && state.chat.service.transport_status && state.chat.service.transport_status !== 'connected') {
      html += '<div class="secure-chat-banner is-warn">Transport status: ' + escapeHtml(String(state.chat.service.transport_status || 'unknown')) + (state.chat.service.transport_error ? ' · ' + escapeHtml(String(state.chat.service.transport_error || '')) : '') + '</div>';
    }
    html += '<div class="secure-chat-thread" id="secure-chat-thread">';
    if (state.chat.simplexWebIntroDismissed !== true) {
      html += '<aside class="secure-chat-simplex-info" role="note">';
      html += '<button type="button" class="secure-chat-simplex-dismiss" data-secure-chat-action="dismiss-simplex-info" aria-label="Dismiss Secure Chat info" title="Dismiss"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
      html += '<p>Messages are sent over SimpleX Chat using <a href="https://github.com/andersaamodt/simplex-web" rel="noopener noreferrer">simplex-web</a>, so encryption and delivery happen in the browser instead of exposing plaintext to this server. SimpleX uses end-to-end encrypted pairwise queues, so relays do not need public user identities to pass messages.</p>';
      html += '</aside>';
    }
    if (state.chat.messages.length) {
      state.chat.messages.forEach(function (message) {
        var incoming = String(message.direction || '') === 'incoming';
        html += '<article class="secure-chat-message' + (incoming ? ' is-incoming' : ' is-outgoing') + '" data-secure-chat-message-ref="' + escapeAttr(message.message_ref || '') + '">';
        html += '<div class="secure-chat-bubble">';
        if (message.text) {
          html += '<p class="secure-chat-text">' + escapeHtml(String(message.text || '')).replace(/\n/g, '<br>') + '</p>';
        }
        html += secureChatAttachmentHtml(message);
        html += '<div class="secure-chat-meta"><span data-secure-chat-status="true">' + secureChatStatusHtml(message) + '</span>' + secureChatTimeHtml(message.created_at) + '</div>';
        html += '</div>';
        html += '</article>';
      });
    } else {
      html += '<p class="secure-chat-empty">No secure chat messages yet.</p>';
    }
    html += '</div>';
    var combinedUploads = secureChatPersistableUploads();
    if (combinedUploads.length) {
      html += '<div class="secure-chat-uploads">';
      combinedUploads.forEach(function (upload) {
        var progress = Number(upload.progress || 0);
        html += '<div class="secure-chat-upload-row">';
        html += '<div class="secure-chat-upload-name">' + escapeHtml(String(upload.name || 'Attachment')) + '</div>';
        html += '<div class="secure-chat-upload-meta"><span>' + escapeHtml(String(upload.status || 'queued')) + '</span><span>' + String(progress) + '%</span></div>';
        html += '<div class="secure-chat-upload-bar"><span style="width:' + String(progress) + '%"></span></div>';
        html += '</div>';
      });
      html += '</div>';
    }
    var pendingFiles = secureChatPendingFileMetas();
    html += '<div class="secure-chat-compose">';
    html += '<div class="secure-chat-input-wrap' + (pendingFiles.length ? ' has-pending-files' : '') + '">';
    if (pendingFiles.length) {
      html += '<div class="secure-chat-pending-files" aria-label="Selected attachments">';
      pendingFiles.forEach(function (file) {
        html += '<span class="secure-chat-pending-file">';
        html += '<span class="secure-chat-pending-file-name">' + escapeHtml(file.name) + '</span>';
        html += '<span class="secure-chat-pending-file-meta">' + escapeHtml(secureChatFormatBytes(file.size)) + '</span>';
        html += '<button type="button" class="secure-chat-pending-file-remove" data-secure-chat-action="remove-pending-file" data-secure-chat-file-id="' + escapeHtml(file.id) + '" aria-label="Remove ' + escapeHtml(file.name) + '" title="Remove attachment">' + secureChatRemoveIcon() + '</button>';
        html += '</span>';
      });
      html += '</div>';
    }
    html += '<textarea id="secure-chat-input" class="secure-chat-input" rows="2" placeholder="Write a secure message">' + escapeHtml(state.chat.draftText || '') + '</textarea>';
    html += '<label class="secure-chat-attach-button" aria-label="Attach files" title="Attach files"><input id="secure-chat-file-input" class="secure-chat-file-input" type="file" multiple><svg class="secure-chat-attach-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.9-9.9a4 4 0 0 1 5.66 5.66l-9.9 9.9a2 2 0 1 1-2.83-2.83l8.49-8.49"/></svg></label>';
    html += '<button type="button" class="secure-chat-emoji-button" data-secure-chat-action="emoji-toggle" aria-label="Insert emoji" title="Insert emoji" aria-haspopup="dialog" aria-expanded="' + (state.chat.emojiPickerOpen === true ? 'true' : 'false') + '">' + secureChatEmojiIcon() + '</button>';
    html += renderSecureChatEmojiPicker();
    html += '<button type="button" class="secure-chat-voice-btn' + (state.chat.voiceRecording ? ' is-recording' : '') + (state.chat.voicePermission !== 'granted' ? ' is-locked' : '') + '" data-secure-chat-action="voice-note" aria-label="' + escapeHtml(secureChatVoiceButtonLabel()) + '" title="' + escapeHtml(secureChatVoiceButtonLabel()) + '"' + (!secureChatVoiceNoteSupported() || state.chat.sending ? ' disabled' : '') + '>' + secureChatMicIcon() + '</button>';
    html += '<button type="button" class="secure-chat-send-btn" data-secure-chat-action="send" aria-label="' + (state.chat.sending ? 'Sending...' : 'Send secure message') + '" title="' + (state.chat.sending ? 'Sending...' : 'Send secure message') + '"' + (state.chat.sending ? ' disabled aria-busy="true"' : '') + '>' + (state.chat.sending ? secureChatSpinnerHtml('secure-chat-send-spinner') : secureChatSendIcon()) + '</button>';
    html += '</div>';
    html += '<label class="secure-chat-compose-hint secure-chat-send-shortcut"><input id="secure-chat-send-modifier" type="checkbox"' + (state.chat.sendWithModifier === true ? ' checked' : '') + '> ' + escapeHtml(secureChatShortcutModifierLabel()) + ' + Enter to send</label>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '</section>';
    return html;
  }

  function captureSecureChatRenderState() {
    var active = document.activeElement;
    var chatInput = active instanceof HTMLTextAreaElement && active.id === 'secure-chat-input'
      ? active
      : null;
    var thread = document.getElementById('secure-chat-thread');
    var threadHadScrollState = thread instanceof HTMLElement;
    var threadScrollTop = threadHadScrollState ? Number(thread.scrollTop || 0) : 0;
    var threadMaxScrollTop = threadHadScrollState
      ? Math.max(0, Number(thread.scrollHeight || 0) - Number(thread.clientHeight || 0))
      : 0;
    var threadDistanceFromBottom = threadHadScrollState
      ? Math.max(0, threadMaxScrollTop - threadScrollTop)
      : 0;
    return {
      inputFocused: !!chatInput,
      selectionStart: chatInput ? Number(chatInput.selectionStart || 0) : 0,
      selectionEnd: chatInput ? Number(chatInput.selectionEnd || 0) : 0,
      threadHadScrollState: threadHadScrollState,
      threadScrollTop: threadScrollTop,
      threadMaxScrollTop: threadMaxScrollTop,
      threadDistanceFromBottom: threadDistanceFromBottom,
      threadWasAtBottom: threadHadScrollState ? threadDistanceFromBottom <= 24 : true
    };
  }

  function restoreSecureChatRenderState(previous) {
    if (!previous || typeof previous !== 'object') {
      return;
    }
    if (!previous.inputFocused) {
      return;
    }
    var input = document.getElementById('secure-chat-input');
    if (!(input instanceof HTMLTextAreaElement) || typeof input.focus !== 'function') {
      return;
    }
    input.focus({ preventScroll: true });
    if (typeof input.setSelectionRange === 'function') {
      var length = String(input.value || '').length;
      var start = Math.max(0, Math.min(Number(previous.selectionStart || 0), length));
      var end = Math.max(start, Math.min(Number(previous.selectionEnd || start), length));
      input.setSelectionRange(start, end);
    }
  }

  function currentSecureChatDraftValue() {
    var input = document.getElementById('secure-chat-input');
    if (input instanceof HTMLTextAreaElement) {
      return String(input.value || '');
    }
    return String(state.chat.draftText || '');
  }

  function setSecureChatEmojiSectionActive(section) {
    var tabs = root.querySelectorAll('[data-secure-chat-action="emoji-section"]');
    Array.prototype.forEach.call(tabs, function (button) {
      var active = String(button.getAttribute('data-secure-chat-section') || '') === section;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function focusSecureChatEmojiSearchSoon() {
    window.setTimeout(function () {
      var input = root.querySelector('.secure-chat-emoji-search');
      if (input && typeof input.focus === 'function') {
        input.focus();
      }
    }, 120);
  }

  function jumpSecureChatEmojiSection(section) {
    var nextSection = String(section || '').trim();
    if (!nextSection) {
      return;
    }
    setSecureChatEmojiSectionActive(nextSection);
    if (state.chat.emojiPickerQuery) {
      state.chat.emojiPickerQuery = '';
      state.chat.emojiSearchResults = [];
      renderContent();
      window.setTimeout(function () {
        jumpSecureChatEmojiSection(nextSection);
      }, 0);
      return;
    }
    var panel = root.querySelector('[data-secure-chat-section-panel="' + nextSection.replace(/"/g, '') + '"]');
    var scroll = root.querySelector('[data-secure-chat-emoji-scroll]');
    if (panel && scroll) {
      scroll.scrollTop = panel.offsetTop - scroll.offsetTop;
    }
  }

  function ensureSecureChatEmojiPickerLoaded() {
    if (!secureChatEmojiPickerLoadPromise) {
      state.chat.emojiPickerLoading = true;
      state.chat.emojiPickerError = '';
      secureChatEmojiPickerLoadPromise = import(secureChatEmojiPickerModuleUrl).then(function (module) {
        secureChatEmojiPickerModule = module;
        return module;
      });
    }
    return secureChatEmojiPickerLoadPromise.then(function (module) {
      if (!secureChatEmojiDatabase) {
        secureChatEmojiDatabase = new module.Database();
      }
      if (!secureChatEmojiGroupsLoadPromise) {
        secureChatEmojiGroupsLoadPromise = Promise.all(secureChatEmojiSectionDefs.filter(function (section) {
          return typeof section.group === 'number';
        }).map(function (section) {
          return secureChatEmojiDatabase.getEmojiByGroup(section.group).then(function (emojis) {
            return {
              id: section.id,
              label: section.label,
              emojis: (Array.isArray(emojis) ? emojis : []).map(function (emoji) {
                return {
                  unicode: String(emoji && emoji.unicode || ''),
                  label: String(emoji && (emoji.annotation || emoji.label || emoji.name || emoji.unicode) || '')
                };
              }).filter(function (emoji) {
                return emoji.unicode;
              })
            };
          });
        }));
      }
      return secureChatEmojiGroupsLoadPromise;
    }).then(function (groups) {
      state.chat.emojiGroups = groups;
      state.chat.emojiPickerLoading = false;
      state.chat.emojiPickerError = '';
      renderContent();
      focusSecureChatEmojiSearchSoon();
      return true;
    }).catch(function () {
      secureChatEmojiPickerLoadPromise = null;
      secureChatEmojiGroupsLoadPromise = null;
      state.chat.emojiPickerLoading = false;
      state.chat.emojiPickerError = 'Emoji could not be loaded.';
      renderContent();
      return false;
    });
  }

  function searchSecureChatEmoji(query) {
    var nextQuery = String(query || '').trim();
    state.chat.emojiPickerQuery = nextQuery;
    if (!nextQuery) {
      state.chat.emojiSearchResults = [];
      renderContent();
      return;
    }
    ensureSecureChatEmojiPickerLoaded().then(function () {
      if (!secureChatEmojiDatabase) {
        return;
      }
      return secureChatEmojiDatabase.getEmojiBySearchQuery(nextQuery).then(function (results) {
        if (state.chat.emojiPickerQuery !== nextQuery) {
          return;
        }
        state.chat.emojiSearchResults = (Array.isArray(results) ? results : []).map(function (emoji) {
          return {
            unicode: String(emoji && emoji.unicode || ''),
            label: String(emoji && (emoji.annotation || emoji.label || emoji.name || emoji.unicode) || '')
          };
        }).filter(function (emoji) {
          return emoji.unicode;
        });
        renderContent();
        focusSecureChatEmojiSearchSoon();
      });
    });
  }

  function setSecureChatEmojiPickerOpen(open) {
    state.chat.emojiPickerOpen = open === true;
    if (state.chat.emojiPickerOpen) {
      loadSecureChatRecentEmojis();
      ensureSecureChatEmojiPickerLoaded();
    }
    renderContent();
  }

  function insertSecureChatEmoji(emoji) {
    var nextEmoji = normalizeSecureChatEmoji(emoji);
    if (!nextEmoji) {
      return;
    }
    var input = document.getElementById('secure-chat-input');
    var current = currentSecureChatDraftValue();
    var start = current.length;
    var end = current.length;
    if (input instanceof HTMLTextAreaElement) {
      start = Number(input.selectionStart || 0);
      end = Number(input.selectionEnd || start);
    }
    state.chat.draftText = current.slice(0, start) + nextEmoji + current.slice(end);
    persistSecureChatSessionToBrowser();
    recordSecureChatRecentEmoji(nextEmoji);
    if (input instanceof HTMLTextAreaElement) {
      input.value = state.chat.draftText;
      input.focus();
      var caret = start + nextEmoji.length;
      try {
        input.setSelectionRange(caret, caret);
      } catch (_err) {
        // Ignore unsupported selection updates.
      }
    } else {
      renderContent();
    }
    syncSecureChatLastContentHtmlFromDom();
  }

  function normalizeRows(rows) {
    var list = Array.isArray(rows) ? rows : [];
    return list.map(function (row) {
      var transport = String(row && row.transport || '').trim().toLowerCase();
      var uid = normalizeRowUid(row && row._uid);
      if (row && typeof row === 'object' && !row._uid) {
        row._uid = uid;
      }
      return {
        _uid: uid,
        transport: transport,
        value: normalizeContactRowValue(transport, String(row && row.value || '')),
        qualifier: String(row && row.qualifier || '').trim().toLowerCase()
      };
    });
  }

  function getRenderState() {
    if (isAdmin()) {
      state.draft = normalizeDraftState(state.draft);
      return state.draft;
    }
    return normalizeDraftState((state.payload && state.payload.state) || { title: 'Profile', description: '', rows: [] });
  }

  function defaultNavbarTitle(renderState) {
    var s = renderState || getRenderState();
    var fallback = String(root.getAttribute('data-page-title') || '').trim();
    var title = String((s && s.title) || fallback || 'Untitled').trim();
    return title || 'Untitled';
  }

  function currentNavbarTitle(renderState) {
    var configured = String(state.navTitle || '').trim();
    if (configured) {
      return configured;
    }
    return defaultNavbarTitle(renderState);
  }

  function navbarTitleHost() {
    if (!els.title) {
      return null;
    }
    var host = els.title.querySelector('[data-page-nav-title-host="true"]');
    if (host instanceof HTMLElement) {
      return host;
    }
    host = document.createElement('span');
    host.setAttribute('data-page-nav-title-host', 'true');
    host.className = 'list-page-nav-title-row-wrap';
    var actionsHost = document.getElementById('contact-page-title-actions');
    if (actionsHost instanceof HTMLElement && actionsHost.parentNode === els.title) {
      actionsHost.insertAdjacentElement('afterend', host);
    } else {
      els.title.appendChild(host);
    }
    return host;
  }

  function renderNavbarTitleRow(renderState) {
    var host = navbarTitleHost();
    if (!host) {
      return;
    }
    if (!isAdmin() || !state.editMode) {
      if (els.title) {
        els.title.classList.remove('has-nav-title-row');
      }
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    if (els.title) {
      els.title.classList.add('has-nav-title-row');
    }
    var current = currentNavbarTitle(renderState);
    var editing = !!state.navTitleEditing;
    var html = '<div class="list-page-nav-title-row">';
    html += '<span class="list-page-nav-title-label">Link:</span>';
    if (editing) {
      var value = state.navTitleInput || current;
      html += '<span class="list-page-nav-title-edit-wrap">';
      html += '<input type="text" class="list-page-nav-title-input" data-page-nav-title-input="true" value="' + escapeHtml(value) + '" aria-label="Link title">';
      html += '<button type="button" class="list-inline-edit-link list-page-nav-title-edit-link" data-page-nav-title-action="save"' + (state.navTitleBusy ? ' disabled aria-disabled="true"' : '') + '>OK</button>';
      html += '</span>';
    } else {
      html += '<span class="list-page-nav-title-value">' + escapeHtml(current) + '</span>';
      html += '<button type="button" class="list-inline-edit-link list-page-nav-title-edit-link" data-page-nav-title-action="edit">Edit...</button>';
    }
    html += '</div>';
    host.hidden = false;
    host.innerHTML = html;
    if (editing) {
      requestAnimationFrame(function () {
        var input = host.querySelector('[data-page-nav-title-input="true"]');
        if (input && typeof input.focus === 'function') {
          input.focus();
          if (typeof input.select === 'function') {
            input.select();
          }
        }
      });
    }
  }

  function qualifierLabel(qualifier) {
    var q = String(qualifier || '').trim().toLowerCase();
    if (!q) {
      return '';
    }
    var labels = {
      preferred: 'Preferred',
      unpreferred: 'Not preferred',
      public: 'Public',
      primary: 'Primary',
      secondary: 'Secondary',
      emergency: 'Emergencies only',
      archive: 'Archived'
    };
    return labels[q] || q;
  }

  function renderQualifierSelectOptions(selected) {
    var current = String(selected || '').trim().toLowerCase();
    var html = '';
    html += '<option value=""' + (!current ? ' selected' : '') + '>(none)</option>';
    html += '<option value="preferred"' + (current === 'preferred' ? ' selected' : '') + '>preferred</option>';
    html += '<option value="unpreferred"' + (current === 'unpreferred' ? ' selected' : '') + '>unpreferred</option>';
    html += '<option value="public"' + (current === 'public' ? ' selected' : '') + '>public</option>';
    html += '<option value="primary"' + (current === 'primary' ? ' selected' : '') + '>primary</option>';
    html += '<option value="secondary"' + (current === 'secondary' ? ' selected' : '') + '>secondary</option>';
    html += '<option value="emergency"' + (current === 'emergency' ? ' selected' : '') + '>emergency</option>';
    html += '<option value="archive"' + (current === 'archive' ? ' selected' : '') + '>archive</option>';
    return html;
  }

  function hasVisibleMainContent(rows, extrasAfter) {
    if (String(extrasAfter || '').trim()) {
      return true;
    }
    return normalizeRows(rows || []).some(function (row) {
      return String(row.transport || '').trim() && String(row.value || '').trim();
    });
  }

  function setActiveRowField(idx, field) {
    if (!Number.isInteger(idx) || idx < 0 || !field) {
      state.activeRowIndex = -1;
      state.activeRowField = '';
      return;
    }
    state.activeRowIndex = idx;
    state.activeRowField = String(field || '').trim().toLowerCase();
  }

  function clearActiveRowField() {
    state.activeRowIndex = -1;
    state.activeRowField = '';
  }

  function isActiveRowField(idx, field) {
    return Number(state.activeRowIndex) === Number(idx) && String(state.activeRowField || '') === String(field || '');
  }

  function syncDraftRowField(idx, field, value) {
    if (!Number.isInteger(idx) || idx < 0) {
      return false;
    }
    var key = String(field || '').trim();
    if (key !== 'transport' && key !== 'value' && key !== 'qualifier') {
      return false;
    }
    state.draft = normalizeDraftState(state.draft);
    state.draft.rows = normalizeRows(state.draft.rows || []);
    if (!state.draft.rows[idx]) {
      return false;
    }
    state.draft.rows[idx][key] = String(value || '');
    return true;
  }

  function captureRowFlipPositions() {
    var map = {};
    if (!els.content) {
      return map;
    }
    var nodes = els.content.querySelectorAll('.contact-profile-row[data-row-uid]');
    Array.prototype.forEach.call(nodes, function (node) {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      var uid = String(node.getAttribute('data-row-uid') || '').trim();
      if (!uid) {
        return;
      }
      map[uid] = node.getBoundingClientRect().top;
    });
    return map;
  }

  function playRowFlipAnimation(previous) {
    if (!els.content || !previous || typeof previous !== 'object') {
      return;
    }
    var nodes = els.content.querySelectorAll('.contact-profile-row[data-row-uid]');
    Array.prototype.forEach.call(nodes, function (node) {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      var uid = String(node.getAttribute('data-row-uid') || '').trim();
      if (!uid || !Object.prototype.hasOwnProperty.call(previous, uid)) {
        return;
      }
      var nextTop = node.getBoundingClientRect().top;
      var delta = Number(previous[uid]) - nextTop;
      if (!isFinite(delta) || Math.abs(delta) < 0.5) {
        return;
      }
      node.style.transition = 'none';
      node.style.transform = 'translateY(' + String(delta) + 'px)';
      node.getBoundingClientRect();
      node.style.transition = 'transform 240ms cubic-bezier(0.2, 0, 0, 1)';
      node.style.transform = '';
      var clear = function () {
        node.style.transition = '';
        node.style.transform = '';
      };
      node.addEventListener('transitionend', clear, { once: true });
      window.setTimeout(clear, 280);
    });
  }

  function dragGripIconSvg() {
    return '' +
      '<svg class="contact-drag-handle-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
      '<circle cx="5" cy="3" r="1.1" fill="currentColor"/>' +
      '<circle cx="11" cy="3" r="1.1" fill="currentColor"/>' +
      '<circle cx="5" cy="8" r="1.1" fill="currentColor"/>' +
      '<circle cx="11" cy="8" r="1.1" fill="currentColor"/>' +
      '<circle cx="5" cy="13" r="1.1" fill="currentColor"/>' +
      '<circle cx="11" cy="13" r="1.1" fill="currentColor"/>' +
      '</svg>';
  }

  function deleteIconSvg() {
    return '' +
      '<svg class="contact-delete-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.2" d="M6 6l12 12M18 6L6 18"/>' +
      '</svg>';
  }

  function reorderDraftRowsByUid(fromUid, toUid) {
    var sourceUid = String(fromUid || '').trim();
    var targetUid = String(toUid || '').trim();
    if (!sourceUid || !targetUid || sourceUid === targetUid) {
      return false;
    }
    state.draft = normalizeDraftState(state.draft);
    var rows = normalizeRows(state.draft.rows || []);
    var fromIdx = -1;
    var toIdx = -1;
    for (var i = 0; i < rows.length; i += 1) {
      var uid = String(rows[i] && rows[i]._uid || '').trim();
      if (uid === sourceUid) {
        fromIdx = i;
      }
      if (uid === targetUid) {
        toIdx = i;
      }
    }
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) {
      return false;
    }
    var moving = rows.splice(fromIdx, 1)[0];
    if (fromIdx < toIdx) {
      toIdx -= 1;
    }
    rows.splice(toIdx, 0, moving);
    state.draft.rows = rows;
    state.payload.state = normalizeDraftState(state.draft);
    return true;
  }

  function focusActiveInlineFieldSoon() {
    if (!isAdmin() || !state.editMode || !Number.isInteger(state.activeRowIndex) || state.activeRowIndex < 0 || !state.activeRowField) {
      return;
    }
    requestAnimationFrame(function () {
      var selector = '[data-contact-inline-field="' + String(state.activeRowField) + '"][data-row-index="' + String(state.activeRowIndex) + '"]';
      var node = root.querySelector(selector);
      if (!(node instanceof HTMLElement) || typeof node.focus !== 'function') {
        return;
      }
      node.focus();
      if (node instanceof HTMLInputElement && typeof node.select === 'function') {
        node.select();
      }
    });
  }

  function normalizeTransportKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function transportTokens(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(function (part) { return !!part; });
  }

  function transportHasToken(value, token) {
    var target = String(token || '').trim().toLowerCase();
    if (!target) {
      return false;
    }
    return transportTokens(value).indexOf(target) >= 0;
  }

  function isSafeContactHref(href) {
    var value = String(href || '').trim();
    return /^(https?:\/\/|mailto:|tel:|sms:|signal:)/i.test(value);
  }

  function splitTrailingPunctuation(urlText) {
    var value = String(urlText || '');
    var trailing = '';
    while (value && /[.,;!?]$/.test(value)) {
      trailing = value.slice(-1) + trailing;
      value = value.slice(0, -1);
    }
    while (value && /\)$/.test(value)) {
      var opens = (value.match(/\(/g) || []).length;
      var closes = (value.match(/\)/g) || []).length;
      if (closes <= opens) {
        break;
      }
      trailing = ')' + trailing;
      value = value.slice(0, -1);
    }
    return {
      url: value,
      trailing: trailing
    };
  }

  function renderContactHref(href, label) {
    var safeHref = String(href || '').trim();
    var text = String(label || safeHref || '');
    if (!isSafeContactHref(safeHref)) {
      return escapeHtml(text);
    }
    var lower = safeHref.toLowerCase();
    if (lower.indexOf('mailto:') === 0) {
      if (!text || text === safeHref || /^mailto:/i.test(text)) {
        text = safeHref.slice(7);
      }
      return '<a class="contact-value-link" href="' + escapeAttr(safeHref) + '">' + escapeHtml(text || safeHref) + '</a>';
    }
    if (lower.indexOf('tel:') === 0) {
      if (!text || text === safeHref || /^tel:/i.test(text)) {
        text = safeHref.slice(4);
      }
      return '<a class="contact-value-link" href="' + escapeAttr(safeHref) + '">' + escapeHtml(text || safeHref) + '</a>';
    }
    return '<a class="contact-value-link" href="' + escapeAttr(safeHref) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(text) + '</a>';
  }

  function linkifyBareEmailText(text) {
    var raw = String(text || '');
    if (!raw) {
      return '';
    }
    var html = '';
    var pattern = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/ig;
    var lastIndex = 0;
    var match;
    while ((match = pattern.exec(raw)) !== null) {
      html += escapeHtml(raw.slice(lastIndex, match.index)).replace(/\n/g, '<br>');
      html += renderContactHref('mailto:' + match[1], match[1]);
      lastIndex = match.index + match[0].length;
    }
    html += escapeHtml(raw.slice(lastIndex)).replace(/\n/g, '<br>');
    return html;
  }

  function renderPlainContactChunk(text, transport) {
    var raw = String(text || '');
    if (!raw) {
      return '';
    }
    var transportKey = normalizeTransportKey(transport);
    if (transportKey === 'email' || transportKey === 'mail' || transportHasToken(transport, 'email') || transportHasToken(transport, 'mail')) {
      return linkifyBareEmailText(raw);
    }
    if (transportKey === 'phone' || transportKey === 'tel' || transportKey === 'telephone' || transportHasToken(transport, 'phone') || transportHasToken(transport, 'tel') || transportHasToken(transport, 'telephone')) {
      var trimmed = raw.trim();
      if (trimmed && /^(\+?[0-9][0-9\s().-]{6,}[0-9])$/.test(trimmed)) {
        var telTarget = 'tel:' + trimmed.replace(/[^\d+]/g, '');
        return renderContactHref(telTarget, trimmed);
      }
    }
    return escapeHtml(raw).replace(/\n/g, '<br>');
  }

  function normalizeContactHrefForComparison(href) {
    var raw = String(href || '').trim();
    if (!raw) {
      return '';
    }
    if (/^mailto:/i.test(raw)) {
      return 'mailto:' + raw.slice(7).trim().toLowerCase();
    }
    try {
      var parsed = new URL(raw);
      var path = String(parsed.pathname || '/').replace(/\/+$/, '');
      if (!path) {
        path = '/';
      }
      return parsed.protocol.toLowerCase() + '//' + parsed.host.toLowerCase() + path + String(parsed.search || '');
    } catch (_err) {
      return raw.toLowerCase().replace(/\/+$/, '');
    }
  }

  function normalizeLegacyContactUrl(rawUrl) {
    var value = String(rawUrl || '').trim();
    if (!value) {
      return '';
    }
    if (/^http:\/\//i.test(value)) {
      return 'https://' + value.slice(7);
    }
    return value;
  }

  function inferContactHrefFromTransport(value, transport) {
    var raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    var transportKey = normalizeTransportKey(transport);
    var match;
    if (transportKey === 'email' || transportKey === 'mail' || transportHasToken(transport, 'email') || transportHasToken(transport, 'mail')) {
      match = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (match && match[0]) {
        return 'mailto:' + match[0];
      }
    }
    if (transportKey === 'telegram') {
      if (/^@?[a-z0-9_]{3,}$/i.test(raw)) {
        return 'https://t.me/' + raw.replace(/^@/, '');
      }
    }
    if (transportKey === 'twitter' || transportKey === 'x') {
      if (/^@?[a-z0-9_]{1,15}$/i.test(raw)) {
        return 'https://x.com/' + raw.replace(/^@/, '');
      }
    }
    if (transportKey === 'reddit') {
      if (/^\/?u\/[a-z0-9_-]+$/i.test(raw)) {
        return 'https://reddit.com/' + raw.replace(/^\//, '');
      }
      if (/^[a-z0-9_-]+$/i.test(raw)) {
        return 'https://reddit.com/u/' + raw;
      }
    }
    if (transportKey === 'github') {
      if (/^[a-z0-9][a-z0-9-]{0,38}$/i.test(raw) && !/--/.test(raw) && !/-$/.test(raw)) {
        return 'https://github.com/' + raw;
      }
    }
    if (transportKey === 'facebook' && /^[a-z0-9.]{3,}$/i.test(raw)) {
      return 'https://facebook.com/' + raw;
    }
    if (transportKey === 'signal' || transportHasToken(transport, 'signal')) {
      if (/^(\+?[0-9][0-9\s().-]{6,}[0-9])$/.test(raw)) {
        var signalPhone = raw.replace(/[^\d+]/g, '');
        if (signalPhone) {
          return 'https://signal.me/#p/' + signalPhone;
        }
      }
      if (/^@?[a-z0-9_]{3,32}\.[0-9]{2,}$/i.test(raw)) {
        var signalUsername = raw.replace(/^@/, '');
        return 'https://signal.me/#eu/' + signalUsername;
      }
    }
    if (transportKey === 'tumblr') {
      if (/^[a-z0-9-]+\.tumblr\.com$/i.test(raw)) {
        return 'https://' + raw;
      }
      if (/^[a-z0-9-]+$/i.test(raw)) {
        return 'https://' + raw + '.tumblr.com';
      }
    }
    return '';
  }

  function inferContactLinkFromTransport(value, transport) {
    var href = inferContactHrefFromTransport(value, transport);
    if (!href) {
      return '';
    }
    return renderContactHref(href, String(value || '').trim());
  }

  function normalizeContactValue(transport, value) {
    var raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    var normalized = raw;

    normalized = normalized.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/ig, function (_m, labelRaw, hrefRaw) {
      var label = String(labelRaw || '').trim();
      var href = normalizeLegacyContactUrl(hrefRaw);
      if (!label) {
        return href;
      }
      if (/^mailto:/i.test(href)) {
        var addr = href.slice(7).trim();
        if (/^mailto:/i.test(label) || label.toLowerCase() === addr.toLowerCase()) {
          return addr;
        }
      }
      var inferred = inferContactHrefFromTransport(label, transport);
      if (inferred && normalizeContactHrefForComparison(inferred) === normalizeContactHrefForComparison(href)) {
        return label;
      }
      return label + ' (' + href + ')';
    });

    normalized = normalized.replace(/(.+?)\s*\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/ig, function (_m, labelRaw, hrefRaw) {
      var label = String(labelRaw || '').trim();
      var href = normalizeLegacyContactUrl(hrefRaw);
      if (!label) {
        return href;
      }
      if (/^mailto:/i.test(href)) {
        var email = href.slice(7).trim();
        if (/^mailto:/i.test(label) || label.toLowerCase() === email.toLowerCase()) {
          return email;
        }
      }
      var inferred = inferContactHrefFromTransport(label, transport);
      if (inferred && normalizeContactHrefForComparison(inferred) === normalizeContactHrefForComparison(href)) {
        return label;
      }
      return label + ' (' + href + ')';
    });

    if (normalizeTransportKey(transport) === 'email') {
      normalized = normalized.replace(/^mailto:\s*/i, '');
    }
    if (normalizeTransportKey(transport) === 'github') {
      normalized = normalized.replace(/^https?:\/\/(?:www\.)?github\.com\/([a-z0-9][a-z0-9-]{0,38})\/?$/i, '$1');
      normalized = normalized.replace(/^@([a-z0-9][a-z0-9-]{0,38})$/i, '$1');
    }

    normalized = normalized.replace(/\s*;\s*/g, '; ');
    normalized = normalized.replace(/\s{2,}/g, ' ').trim();
    return normalized;
  }

  function normalizeContactRowValue(transport, value) {
    return normalizeContactValue(transport, value);
  }

  function linkifyPlainContactText(text, transport) {
    var raw = String(text || '');
    if (!raw) {
      return '';
    }
    var html = '';
    var pattern = /(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+)/ig;
    var lastIndex = 0;
    var match;
    while ((match = pattern.exec(raw)) !== null) {
      html += renderPlainContactChunk(raw.slice(lastIndex, match.index), transport);
      var candidate = splitTrailingPunctuation(match[0]);
      if (candidate.url && isSafeContactHref(candidate.url)) {
        html += renderContactHref(candidate.url, candidate.url);
      } else {
        html += escapeHtml(match[0]);
      }
      if (candidate.trailing) {
        html += escapeHtml(candidate.trailing);
      }
      lastIndex = match.index + match[0].length;
    }
    html += renderPlainContactChunk(raw.slice(lastIndex), transport);
    return html;
  }

  function linkifyContactValue(value, transport) {
    var raw = String(value || '');
    if (!raw) {
      return '';
    }
    var html = '';
    var pattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
    var lastIndex = 0;
    var match;
    while ((match = pattern.exec(raw)) !== null) {
      html += linkifyPlainContactText(raw.slice(lastIndex, match.index), transport);
      var label = String(match[1] || '').trim();
      var href = String(match[2] || '').trim();
      if (isSafeContactHref(href)) {
        html += renderContactHref(href, label || href);
      } else {
        html += escapeHtml(match[0]);
      }
      lastIndex = match.index + match[0].length;
    }
    html += linkifyPlainContactText(raw.slice(lastIndex), transport);
    if (html.indexOf('<a ') !== -1) {
      return html;
    }
    return inferContactLinkFromTransport(raw, transport) || html;
  }

  function renderValidation() {
    if (!els.validation) {
      return;
    }
    var v = (state.payload && state.payload.validation) ? state.payload.validation : {};
    var errors = Array.isArray(v.errors) ? v.errors : [];
    var warnings = Array.isArray(v.warnings) ? v.warnings : [];
    if (!isAdmin() || (!errors.length && !warnings.length)) {
      els.validation.hidden = true;
      els.validation.innerHTML = '';
      return;
    }
    var html = '';
    if (errors.length) {
      html += '<div class="list-validation-block is-error"><strong>Validation errors</strong><ul>';
      errors.forEach(function (msg) {
        html += '<li>' + escapeHtml(msg) + '</li>';
      });
      html += '</ul></div>';
    }
    if (warnings.length) {
      html += '<div class="list-validation-block is-warn"><strong>Validation warnings</strong><ul>';
      warnings.forEach(function (msg) {
        html += '<li>' + escapeHtml(msg) + '</li>';
      });
      html += '</ul></div>';
    }
    els.validation.hidden = false;
    els.validation.innerHTML = html;
  }

  function setSaveStatus(next) {
    state.saveStatus = next;
    var node = document.getElementById('contact-admin-save-status');
    if (!node) {
      return;
    }
    node.classList.toggle('is-error', next === 'error');
    if (next === 'saving') {
      node.innerHTML = '<span class="save-spinner" aria-hidden="true"></span>Saving...';
      return;
    }
    if (next === 'error') {
      node.textContent = 'Save failed';
      return;
    }
    node.textContent = 'Saved';
  }

  function queueAutosave(delayMs) {
    if (!isAdmin()) {
      return;
    }
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
    }
    state.saveIndicatorVisible = true;
    renderAdmin();
    state.saveTimer = setTimeout(function () {
      state.saveTimer = null;
      persistDraft({ alertOnError: false });
    }, Number(delayMs) > 0 ? Number(delayMs) : 500);
  }

  function renderHead() {
    var s = getRenderState();
    if (s && s.title) {
      if (typeof window.__wizardryApplyPageTitle === 'function') {
        window.__wizardryApplyPageTitle(String(s.title));
      } else {
        document.title = String(s.title);
      }
    }
    if (els.title) {
      if (isAdmin()) {
        if (state.activeHeadField === 'title') {
          els.title.innerHTML = '<span class="list-page-title-edit-wrap"><input id="contact-head-title-input" class="list-head-inline-input" type="text" value="' + escapeHtml(s.title || 'Profile') + '" data-contact-head-input="title"></span> <button type="button" class="list-inline-edit-link" data-contact-head-save="title">Save</button><span id="contact-page-title-actions" class="list-page-title-actions"></span>';
        } else if (state.editMode) {
          els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'Profile') + '</span> <button type="button" class="list-inline-edit-link" data-contact-head-edit="title">Edit...</button><span id="contact-page-title-actions" class="list-page-title-actions"></span>';
        } else {
          els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'Profile') + '</span><span id="contact-page-title-actions" class="list-page-title-actions"></span>';
        }
      } else {
        els.title.textContent = s.title || 'Profile';
      }
    }
    renderNavbarTitleRow(s);
    if (els.description) {
      var text = String(s.description || '').trim();
      var hasMainContent = hasVisibleMainContent(s.rows || [], s.extras_after || '');
      if (isAdmin()) {
        var suppressEmptyDescription = !text && !hasMainContent && state.activeHeadField !== 'description';
        els.description.hidden = suppressEmptyDescription;
        if (suppressEmptyDescription) {
          els.description.innerHTML = '';
        } else if (state.activeHeadField === 'description') {
          els.description.innerHTML = '<span class="list-page-description-edit-wrap"><textarea id="contact-head-description-input" class="list-head-description-input" rows="4" data-contact-head-input="description">' + escapeHtml(text) + '</textarea></span> <button type="button" class="list-inline-edit-link" data-contact-head-save="description">Save</button> <label class="checkbox-control contact-description-publish-toggle"><input type="checkbox" data-contact-intro-publish="true"' + (s.publish_intro_to_nostr ? ' checked' : '') + '> <span>Nostr</span></label>';
        } else if (state.editMode) {
          if (text) {
            els.description.innerHTML = '<span class="list-page-description-text">' + markdownInline(text) + '</span> <button type="button" class="list-inline-edit-link" data-contact-head-edit="description">Edit...</button>';
          } else {
            els.description.innerHTML = '<span class="list-page-description-empty">No description.</span> <button type="button" class="list-inline-edit-link" data-contact-head-edit="description">Edit...</button>';
          }
        } else if (text) {
          els.description.innerHTML = '<span class="list-page-description-text">' + markdownInline(text) + '</span>';
          els.description.hidden = false;
        } else if (!hasMainContent) {
          els.description.hidden = true;
          els.description.innerHTML = '';
        } else {
          els.description.hidden = true;
          els.description.innerHTML = '';
        }
      } else if (text) {
        els.description.hidden = false;
        els.description.innerHTML = markdownInline(text);
      } else if (!hasMainContent) {
        els.description.hidden = true;
        els.description.innerHTML = '';
      } else {
        els.description.hidden = true;
        els.description.innerHTML = '';
      }
    }
    if (isAdmin() && state.activeHeadField && state.headFocusPending) {
      requestAnimationFrame(function () {
        var id = state.activeHeadField === 'title' ? 'contact-head-title-input' : 'contact-head-description-input';
        var input = document.getElementById(id);
        if (input && typeof input.focus === 'function') {
          input.focus();
        }
        state.headFocusPending = false;
      });
    }
  }

  function renderAdmin() {
    if (!els.admin) {
      return;
    }
    if (!isAdmin()) {
      els.admin.hidden = true;
      els.admin.innerHTML = '';
      return;
    }

    var hasCanonical = !!state.payload.canonical_exists;
    var hasDraftChanges = !!state.payload.draft_differs;
    var showRevert = !!state.editMode;
    var showPublish = !!state.editMode || hasDraftChanges;
    var canRevert = hasCanonical && hasDraftChanges;
    var revertTitle = canRevert ? 'Revert draft to Nostr version' : (hasCanonical ? 'No local changes to revert' : 'No Nostr version found');

    var actionsHost = document.getElementById('contact-page-title-actions');
    var html = '<span class="list-page-admin-bar">';
    if (state.saveIndicatorVisible) {
      html += '<span id="contact-admin-save-status" class="list-admin-save-status" aria-live="polite">';
      if (state.saveStatus === 'saving') {
        html += '<span class="save-spinner" aria-hidden="true"></span>Saving...';
      } else if (state.saveStatus === 'error') {
        html += 'Save failed';
      } else {
        html += 'Saved';
      }
      html += '</span>';
    }
    if (showRevert) {
      html += '<button type="button" data-contact-action="revert" title="' + escapeHtml(revertTitle) + '"' + (canRevert ? '' : ' disabled aria-disabled="true"') + '>Revert</button>';
    }
    if (showPublish) {
      html += '<button type="button" class="list-admin-primary-btn" data-contact-action="publish">Publish to Nostr...</button>';
    }
    html += '<button type="button" class="list-admin-primary-btn" data-contact-action="toggle-edit">' + (state.editMode ? 'Done' : 'Edit') + '</button>';
    html += '</span>';

    if (actionsHost) {
      actionsHost.innerHTML = html;
    }
    els.admin.hidden = true;
    els.admin.innerHTML = '';
  }

  function renderProfileTable(rows, editable) {
    var list = Array.isArray(rows) ? rows : [];
    var html = '<div class="contact-profile-table-wrap"><table class="contact-profile-table' + (editable ? ' is-editing' : '') + '">';
    if (editable) {
      html += '<thead><tr class="contact-profile-head-row">';
      html += '<th class="contact-profile-head-cell contact-profile-head-cell-handle" scope="col"></th>';
      html += '<th class="contact-profile-head-cell contact-profile-head-cell-platform" scope="col">Protocol</th>';
      html += '<th class="contact-profile-head-cell contact-profile-head-cell-value" scope="col"><span class="contact-profile-head-grid"><span class="contact-profile-head-contact">Contact</span><span class="contact-profile-head-qualifier">Qualifier</span><button type="button" class="unobtrusive-icon-button contact-head-add-row" data-contact-action="add-row" title="Add profile row" aria-label="Add profile row">+</button></span></th>';
      html += '</tr></thead>';
    }
    html += '<tbody>';
    list.forEach(function (row, idx) {
      var transport = String(row.transport || '').trim();
      var value = String(row.value || '');
      var qValue = String(row.qualifier || '').trim().toLowerCase();
      var qLabel = qualifierLabel(qValue);
      var uid = String(row._uid || '').trim();

      var rowClasses = 'contact-profile-row';
      if (editable && state.dragOverRowUid && state.dragOverRowUid === uid) {
        rowClasses += ' is-drag-over';
      }
      if (editable && state.draggingRowUid && state.draggingRowUid === uid) {
        rowClasses += ' is-dragging';
      }
      html += '<tr class="' + rowClasses + '" data-row-index="' + String(idx) + '" data-row-uid="' + escapeAttr(uid) + '">';
      if (editable) {
        html += '<td class="contact-handle-cell"><button type="button" class="unobtrusive-icon-button contact-drag-handle" data-contact-drag-handle="true" data-row-uid="' + escapeAttr(uid) + '" title="Drag to reorder" aria-label="Drag to reorder" draggable="true">' + dragGripIconSvg() + '</button></td>';
      }
      html += '<th scope="row" class="contact-platform-cell">';
      if (editable && isActiveRowField(idx, 'transport')) {
        html += '<input type="text" class="contact-inline-input" data-contact-inline-field="transport" data-row-index="' + String(idx) + '" value="' + escapeHtml(transport) + '" placeholder="transport">';
      } else if (editable) {
        html += '<button type="button" class="contact-inline-open contact-platform-open" data-contact-inline-action="edit-cell" data-contact-inline-field="transport" data-row-index="' + String(idx) + '"><span class="contact-inline-open-value">' + (transport ? escapeHtml(transport) : '<span class="list-inline-placeholder">Add transport...</span>') + '</span></button>';
      } else {
        html += escapeHtml(transport);
      }
      html += '</th>';

      html += '<td class="contact-value-cell">';
      if (editable && isActiveRowField(idx, 'value')) {
        html += '<input type="text" class="contact-inline-input contact-value-inline-input" data-contact-inline-field="value" data-row-index="' + String(idx) + '" value="' + escapeHtml(value) + '" placeholder="value">';
      } else if (editable) {
        html += '<button type="button" class="contact-inline-open contact-value-open" data-contact-inline-action="edit-cell" data-contact-inline-field="value" data-row-index="' + String(idx) + '"><span class="contact-inline-open-value">' + (String(value || '').trim() ? escapeHtml(value).replace(/\n/g, '<br>') : '<span class="list-inline-placeholder">Add value...</span>') + '</span></button>';
      } else {
        html += '<div class="contact-value-main">' + linkifyContactValue(value, transport) + '</div>';
      }

      if (editable) {
        html += '<select class="contact-inline-select contact-qualifier-select" data-contact-inline-field="qualifier" data-row-index="' + String(idx) + '">';
        html += renderQualifierSelectOptions(qValue);
        html += '</select>';
        html += '<button type="button" class="icon-danger unobtrusive-icon-button contact-row-delete" data-contact-action="remove-row" data-row-index="' + String(idx) + '" title="Delete this entry" aria-label="Delete this entry">' + deleteIconSvg() + '</button>';
      } else if (qLabel) {
        html += '<span class="contact-qualifier-pill contact-qualifier-open" data-qualifier="' + escapeAttr(qValue) + '">' + escapeHtml(qLabel) + '</span>';
      }
      html += '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderContactSectionHeading(label, id) {
    var idAttr = id ? ' id="' + escapeAttr(id) + '"' : '';
    return '<h2' + idAttr + ' class="contact-section-heading"><span>' + escapeHtml(label) + '</span></h2>';
  }

  function renderContactInformationHeading() {
    return renderContactSectionHeading('Contact Information', '');
  }

  function renderReadOnly(rows, editable) {
    var normalized = normalizeRows(rows || []);
    var filtered = editable ? normalized : normalized.filter(function (row) {
      return String(row.transport || '').trim() && String(row.value || '').trim();
    });
    var html = '';
    if (!filtered.length) {
      if (editable) {
        return renderProfileTable(filtered, true) + '<p class="list-page-empty-state">No content yet.</p>';
      }
      return html + '<p class="list-page-empty-state">No content yet.</p>';
    }
    if (editable) {
      html += renderContactInformationHeading() + renderProfileTable(filtered, true);
      return html;
    }
    var archivedRows = filtered.filter(function (row) {
      return String(row.qualifier || '').trim().toLowerCase() === 'archive';
    });
    var visibleRows = filtered.filter(function (row) {
      return String(row.qualifier || '').trim().toLowerCase() !== 'archive';
    });
    if (visibleRows.length) {
      html += renderContactInformationHeading() + renderProfileTable(visibleRows, false);
    }
    if (archivedRows.length) {
      html += '<details class="contact-archived-group">';
      html += '<summary class="contact-archived-toggle"><span class="contact-archived-toggle-label">Archived</span></summary>';
      html += renderProfileTable(archivedRows, false);
      html += '</details>';
    }
    return html;
  }

  function managedLightningNoteHtml() {
    var zapConfig = state.payload && state.payload.zap_config && typeof state.payload.zap_config === 'object'
      ? state.payload.zap_config
      : null;
    if (!isAdmin() || !state.editMode || !zapConfig || !zapConfig.enabled || !zapConfig.lud16) {
      return '';
    }
    return '<p class="contact-managed-lightning-note">Lightning zaps use <code>' + escapeHtml(String(zapConfig.lud16 || '')) + '</code> from Admin &gt; Zaps. Wallet changes sync your public Nostr profile automatically; publish this page after editing the contact content itself.</p>';
  }

  function renderContentHtml() {
    var s = getRenderState();
    var rows = normalizeRows(s.rows || []);
    var extrasAfter = String(s.extras_after || '');
    var renderedAfter = String(extrasAfter).trim() ? renderMarkdownWithWidgetIncludes(extrasAfter, 'video-chat') : '';
    var afterContent = '';
    if (String(renderedAfter || '').trim()) {
      afterContent = '<section class="nostr-page-extra nostr-page-extra-after">' +
        renderedAfter +
        '</section>';
    }
    var inlineMode = isAdmin() && state.editMode;
    root.classList.toggle('contact-edit-mode', inlineMode);
    var secureChatHtml = textHasWidgetInclude(extrasAfter, 'secure-chat') ? '' : renderSecureChatPanel();
    var videoChatHtml = videoChatPluginEnabled() || textHasWidgetInclude(extrasAfter, 'video-chat') ? renderWidgetInclude('video-chat') : '';
    return secureChatHtml + videoChatHtml + managedLightningNoteHtml() + renderReadOnly(rows, inlineMode) + afterContent;
  }

  function syncSecureChatLastContentHtml() {
    if (els.content) {
      state.lastContentHtml = stableSecureChatContentHtml(renderContentHtml());
    }
  }

  function syncSecureChatLastContentHtmlFromDom() {
    if (els.content) {
      state.lastContentHtml = stableSecureChatContentHtml(els.content.innerHTML);
    }
  }

  function stableSecureChatContentHtml(html) {
    return String(html || '').replace(/animation-delay:-[0-9]+ms/g, 'animation-delay:-0ms');
  }

  function captureVideoChatWidgetHost() {
    if (!els.content) {
      return null;
    }
    var host = els.content.querySelector('[data-video-chat]');
    if (!host || !host.shadowRoot) {
      return null;
    }
    if (!window.__wizardryVideoChatRoomId) {
      return null;
    }
    return host;
  }

  function restoreVideoChatWidgetHost(host) {
    if (!host || !els.content) {
      return;
    }
    var nextHost = els.content.querySelector('[data-video-chat]');
    if (nextHost && nextHost !== host) {
      nextHost.replaceWith(host);
    }
  }

  function disconnectVideoChatAutoMountForRender(host) {
    if (!host || !window.VideoChatWidgetAutoMount || typeof window.VideoChatWidgetAutoMount.disconnect !== 'function') {
      return false;
    }
    window.VideoChatWidgetAutoMount.disconnect();
    return true;
  }

  function reconnectVideoChatAutoMountAfterRender(disconnected) {
    if (!disconnected || !window.VideoChatWidgetAutoMount || typeof window.VideoChatWidgetAutoMount.observe !== 'function') {
      return;
    }
    window.VideoChatWidgetAutoMount.observe();
  }

  function renderContent() {
    if (!els.content) {
      return;
    }
    if (state.chat.filePickerOpen) {
      state.chat.renderDeferredWhileFilePickerOpen = true;
      return;
    }
    var secureChatRenderState = captureSecureChatRenderState();
    var videoChatHost = captureVideoChatWidgetHost();
    var videoChatObserverPaused = disconnectVideoChatAutoMountForRender(videoChatHost);
    var stableSimplexInfo = document.querySelector('#secure-chat-thread > .secure-chat-simplex-info');
    var inlineMode = isAdmin() && state.editMode;
    var nextContentHtml = renderContentHtml();
    var nextContentSignature = stableSecureChatContentHtml(nextContentHtml);
    if (state.lastContentHtml === nextContentSignature) {
      restoreSecureChatRenderState(secureChatRenderState);
      renderSecureChatThreadScrollState(secureChatRenderState);
      return;
    }
    state.lastContentHtml = nextContentSignature;
    els.content.innerHTML = nextContentHtml;
    restoreVideoChatWidgetHost(videoChatHost);
    reconnectVideoChatAutoMountAfterRender(videoChatObserverPaused);
    if (stableSimplexInfo && state.chat.simplexWebIntroDismissed !== true) {
      var nextSimplexInfo = document.querySelector('#secure-chat-thread > .secure-chat-simplex-info');
      if (nextSimplexInfo && nextSimplexInfo !== stableSimplexInfo) {
        nextSimplexInfo.replaceWith(stableSimplexInfo);
      }
    }
    if (state.pendingFlipPositions) {
      playRowFlipAnimation(state.pendingFlipPositions);
      state.pendingFlipPositions = null;
    }
    if (inlineMode) {
      focusActiveInlineFieldSoon();
    }
    restoreSecureChatRenderState(secureChatRenderState);
    renderSecureChatThreadScrollState(secureChatRenderState);
  }

  function markSecureChatFilePickerOpen() {
    state.chat.filePickerOpen = true;
    state.chat.renderDeferredWhileFilePickerOpen = false;
  }

  function releaseSecureChatFilePicker(renderDeferred) {
    state.chat.filePickerOpen = false;
    if (renderDeferred && state.chat.renderDeferredWhileFilePickerOpen) {
      state.chat.renderDeferredWhileFilePickerOpen = false;
      renderContent();
      return;
    }
    state.chat.renderDeferredWhileFilePickerOpen = false;
  }

  function releaseSecureChatFilePickerSoon() {
    window.setTimeout(function () {
      if (state.chat.filePickerOpen) {
        releaseSecureChatFilePicker(true);
      }
    }, 250);
  }

  function renderAll() {
    renderHead();
    renderAdmin();
    renderContent();
    renderValidation();
    maybeLoadVideoChatWidget();
  }

  function saveNavbarTitle() {
    if (!isAdmin() || state.navTitleBusy) {
      return Promise.resolve(false);
    }
    var input = root.querySelector('[data-page-nav-title-input="true"]');
    if (input instanceof HTMLInputElement) {
      state.navTitleInput = String(input.value || '');
    }
    var nextTitle = String(state.navTitleInput || '').trim();
    state.navTitleBusy = true;
    var auth = authPayload();
    return apiPost('/cgi/blog-update-nostr-page-nav-title', {
      page_slug: slug,
      nav_title: nextTitle,
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (data) {
      var updated = String((data && data.nav_title) || nextTitle || defaultNavbarTitle()).trim();
      state.navTitle = updated;
      state.navTitleEditing = false;
      state.navTitleInput = '';
      if (state.payload && typeof state.payload === 'object') {
        state.payload.nav_title = updated;
      }
      try {
        window.dispatchEvent(new CustomEvent('wizardry-navbar-refresh-request'));
      } catch (_err) {
        // Ignore navbar refresh dispatch failures.
      }
      renderHead();
      return true;
    }).catch(function (err) {
      window.alert(err && err.message ? err.message : 'Could not save navbar title');
      return false;
    }).finally(function () {
      state.navTitleBusy = false;
      renderHead();
    });
  }

  function persistDraft(opts) {
    if (state.busy || !isAdmin()) {
      if (isAdmin()) {
        state.autosaveQueued = true;
      }
      return Promise.resolve(false);
    }
    var options = opts || {};
    var serializedBeforeSave = JSON.stringify(state.draft || {});
    state.busy = true;
    setSaveStatus('saving');
    var payload = authPayload();
    return apiPost('/cgi/blog-save-nostr-page-draft', {
      page_slug: slug,
      state_json: JSON.stringify(state.draft || {}),
      session_token: payload.session_token,
      csrf_token: payload.csrf_token
    }).then(function (data) {
      state.payload.validation = data.validation || { errors: [], warnings: [], can_publish: true };
      state.payload.draft_exists = true;
      var localChangedDuringSave = JSON.stringify(state.draft || {}) !== serializedBeforeSave;
      state.payload.draft_differs = localChangedDuringSave;
      if (!localChangedDuringSave) {
        state.payload.state = data.state || state.payload.state;
        state.draft = normalizeDraftState(data.state || state.draft);
      } else {
        state.payload.state = normalizeDraftState(state.draft || {});
      }
      setSaveStatus('saved');
      if (state.activeHeadField === 'title' || state.activeHeadField === 'description') {
        // Avoid replacing the active head input while autosave returns.
        renderAdmin();
        renderValidation();
      } else {
        renderAll();
      }
      return true;
    }).catch(function (err) {
      setSaveStatus('error');
      if (options.alertOnError !== false) {
        window.alert(err.message || 'Could not save draft');
      }
      return false;
    }).finally(function () {
      state.busy = false;
      if (state.autosaveQueued) {
        state.autosaveQueued = false;
        // Flush queued edits immediately after an in-flight save completes so
        // drag reorders are durable even if the user refreshes right away.
        persistDraft({ alertOnError: false });
      }
      maybeFinalizeEditModeExit();
    });
  }

  function exitEditModeNow() {
    state.editMode = false;
    state.pendingToggleEditOff = false;
    state.navTitleEditing = false;
    state.navTitleInput = '';
    state.activeHeadField = '';
    state.headFocusPending = false;
    clearActiveRowField();
    state.draggingRowUid = '';
    state.dragOverRowUid = '';
    renderAll();
  }

  function maybeFinalizeEditModeExit() {
    if (!state.pendingToggleEditOff) {
      return;
    }
    if (state.busy || state.autosaveQueued || state.saveTimer) {
      return;
    }
    exitEditModeNow();
  }

  function requestExitEditModeWithSave() {
    if (!isAdmin() || !state.editMode) {
      return;
    }
    state.pendingToggleEditOff = true;
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
    state.saveIndicatorVisible = true;
    renderAdmin();
    if (state.busy) {
      return;
    }
    persistDraft({ alertOnError: false }).then(function () {
      maybeFinalizeEditModeExit();
    });
  }

  async function publishDraft() {
    if (state.busy || !isAdmin()) {
      return;
    }
    var saved = await persistDraft({ alertOnError: true });
    if (!saved) {
      return;
    }
    var hasDialog = await ensureNostrPublishDialog();
    if (!hasDialog) {
      window.alert('Publish dialog unavailable');
      return;
    }
    var published = await window.blogNostrPublishDialog.open({
      pageSlug: slug,
      pageLabel: String((state.draft && state.draft.title) || slug || 'page').trim()
    });
    if (!published) {
      return;
    }
    load();
    setSaveStatus('saved');
  }

  function revertDraft() {
    if (state.busy || !isAdmin()) {
      return;
    }
    if (!window.confirm('Discard local draft changes and restore canonical Nostr version?')) {
      return;
    }
    var payload = authPayload();
    state.busy = true;
    setSaveStatus('saving');
    apiPost('/cgi/blog-revert-nostr-page-draft', {
      page_slug: slug,
      session_token: payload.session_token,
      csrf_token: payload.csrf_token
    }).then(function (data) {
      state.payload.state = data.state;
      state.payload.validation = data.validation || { errors: [], warnings: [], can_publish: true };
      state.payload.draft_exists = true;
      state.payload.draft_differs = false;
      state.draft = normalizeDraftState(data.state);
      setSaveStatus('saved');
      renderAll();
    }).catch(function (err) {
      setSaveStatus('error');
      window.alert(err.message || 'Could not revert draft');
    }).finally(function () {
      state.busy = false;
    });
  }

  function bindEvents() {
    root.addEventListener('pointerdown', function (event) {
      var target = event.target;
      if (target instanceof HTMLInputElement && target.id === 'secure-chat-file-input') {
        markSecureChatFilePickerOpen();
      }
    });

    root.addEventListener('scroll', function (event) {
      var target = event.target;
      if (target instanceof HTMLElement && target.id === 'secure-chat-thread') {
        state.chat.threadPinnedToBottom = secureChatThreadDistanceFromBottom(target) <= 24;
      }
    }, true);

    root.addEventListener('load', function (event) {
      var target = event.target;
      if (target instanceof HTMLImageElement && target.closest('#secure-chat-thread') && state.chat.threadPinnedToBottom !== false) {
        secureChatScrollThreadToBottom();
      }
    }, true);

    root.addEventListener('loadedmetadata', function (event) {
      var target = event.target;
      if ((target instanceof HTMLVideoElement || target instanceof HTMLAudioElement) && target.closest('#secure-chat-thread') && state.chat.threadPinnedToBottom !== false) {
        secureChatScrollThreadToBottom();
      }
    }, true);

    root.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target instanceof HTMLInputElement && target.id === 'secure-chat-file-input') {
        markSecureChatFilePickerOpen();
        return;
      }
      var secureChatActionNode = target.closest('[data-secure-chat-action]');
      if (secureChatActionNode instanceof Element) {
        event.preventDefault();
        var secureChatAction = String(secureChatActionNode.getAttribute('data-secure-chat-action') || '').trim().toLowerCase();
        if (secureChatAction === 'login') {
          handleSecureChatLoginClick();
          return;
        }
        if (secureChatAction === 'start') {
          handleSecureChatStartClick();
          return;
        }
        if (secureChatAction === 'close') {
          handleSecureChatCloseClick();
          return;
        }
        if (secureChatAction === 'send') {
          var secureChatDraft = currentSecureChatDraftValue();
          if (!state.chat.sending && (String(secureChatDraft || '').trim() || secureChatHasPendingFiles())) {
            sendSecureChatMessage(secureChatDraft);
          }
          return;
        }
        if (secureChatAction === 'emoji-toggle') {
          setSecureChatEmojiPickerOpen(state.chat.emojiPickerOpen !== true);
          return;
        }
        if (secureChatAction === 'emoji-recent') {
          insertSecureChatEmoji(secureChatActionNode.getAttribute('data-secure-chat-emoji') || '');
          renderContent();
          return;
        }
        if (secureChatAction === 'emoji-pick') {
          insertSecureChatEmoji(secureChatActionNode.getAttribute('data-secure-chat-emoji') || '');
          renderContent();
          return;
        }
        if (secureChatAction === 'emoji-section') {
          jumpSecureChatEmojiSection(secureChatActionNode.getAttribute('data-secure-chat-section') || '');
          return;
        }
        if (secureChatAction === 'voice-note') {
          handleSecureChatVoiceNoteAction();
          return;
        }
        if (secureChatAction === 'remove-pending-file') {
          removeSecureChatPendingFile(secureChatActionNode.getAttribute('data-secure-chat-file-id') || '');
          return;
        }
        if (secureChatAction === 'dismiss-simplex-info') {
          state.chat.simplexWebIntroDismissed = true;
          persistSecureChatSimplexInfoDismissal();
          persistSecureChatSessionToBrowser();
          renderContent();
          return;
        }
        if (!isAdmin()) {
          return;
        }
        if (secureChatAction === 'admin-refresh') {
          runSecureChatAdminAction('status', '').catch(function (err) {
            state.chat.error = err && err.message ? err.message : 'Could not refresh Secure Chat admin state.';
            renderContent();
          });
          return;
        }
        if (secureChatAction === 'deactivate' || secureChatAction === 'delete') {
          var mappingNpub = String(secureChatActionNode.getAttribute('data-secure-chat-npub') || '');
          if (!mappingNpub) {
            return;
          }
          var confirmMessage = secureChatAction === 'delete'
            ? 'Delete this Secure Chat mapping and allow reprovisioning on the next message?'
            : 'Deactivate this Secure Chat mapping?';
          if (!window.confirm(confirmMessage)) {
            return;
          }
          runSecureChatAdminAction(secureChatAction, mappingNpub).catch(function (err) {
            state.chat.error = err && err.message ? err.message : 'Could not update Secure Chat mapping.';
            renderContent();
          });
          return;
        }
      }
      if (state.chat.emojiPickerOpen && !target.closest('.secure-chat-emoji-popover, .secure-chat-emoji-button')) {
        setSecureChatEmojiPickerOpen(false);
      }
      if (isAdmin() && state.editMode) {
        var navTitleActionNode = target.closest('[data-page-nav-title-action]');
        if (navTitleActionNode instanceof HTMLElement) {
          event.preventDefault();
          var navTitleAction = String(navTitleActionNode.getAttribute('data-page-nav-title-action') || '');
          if (navTitleAction === 'edit') {
            state.navTitleEditing = true;
            state.navTitleInput = currentNavbarTitle();
            renderHead();
            return;
          }
          if (navTitleAction === 'save') {
            saveNavbarTitle();
            return;
          }
        }
        var headEditNode = target.closest('[data-contact-head-edit]');
        if (headEditNode instanceof HTMLElement) {
          event.preventDefault();
          state.activeHeadField = String(headEditNode.getAttribute('data-contact-head-edit') || '').trim().toLowerCase();
          state.headFocusPending = true;
          renderHead();
          return;
        }
        var headSaveNode = target.closest('[data-contact-head-save]');
        if (headSaveNode instanceof HTMLElement) {
          event.preventDefault();
          state.activeHeadField = '';
          state.headFocusPending = false;
          renderHead();
          renderAdmin();
          queueAutosave(250);
          return;
        }
        var inlineActionNode = target.closest('[data-contact-inline-action]');
        if (inlineActionNode instanceof HTMLElement) {
          event.preventDefault();
          var inlineAction = String(inlineActionNode.getAttribute('data-contact-inline-action') || '');
          if (inlineAction === 'edit-cell') {
            var inlineIdx = Number(inlineActionNode.getAttribute('data-row-index'));
            var inlineField = String(inlineActionNode.getAttribute('data-contact-inline-field') || '').trim().toLowerCase();
            if (Number.isInteger(inlineIdx) && inlineIdx >= 0 && (inlineField === 'transport' || inlineField === 'value' || inlineField === 'qualifier')) {
              setActiveRowField(inlineIdx, inlineField);
              renderContent();
            }
            return;
          }
        }
      }
      var actionNode = target.closest('[data-contact-action]');
      if (!(actionNode instanceof HTMLElement) || !isAdmin()) {
        return;
      }
      var action = String(actionNode.getAttribute('data-contact-action') || '');
      if (action === 'toggle-edit') {
        if (state.editMode) {
          requestExitEditModeWithSave();
        } else {
          state.editMode = true;
          renderAll();
        }
        return;
      }
      if (action === 'publish') {
        publishDraft();
        return;
      }
      if (action === 'revert') {
        if (actionNode.hasAttribute('disabled')) {
          return;
        }
        revertDraft();
        return;
      }
      if (action === 'add-row') {
        state.draft = normalizeDraftState(state.draft);
        state.draft.rows.push({ _uid: nextRowUid(), transport: '', value: '', qualifier: '' });
        setActiveRowField(state.draft.rows.length - 1, 'transport');
        renderAll();
        return;
      }
      if (action === 'remove-row') {
        var idx = Number(actionNode.getAttribute('data-row-index'));
        if (!Number.isInteger(idx) || idx < 0) {
          return;
        }
        state.draft.rows = normalizeRows(state.draft.rows || []).filter(function (_row, i) {
          return i !== idx;
        });
        if (state.activeRowIndex === idx) {
          clearActiveRowField();
        } else if (state.activeRowIndex > idx) {
          state.activeRowIndex -= 1;
        }
        renderAll();
        queueAutosave(500);
      }
    });

    root.addEventListener('dragstart', function (event) {
      if (!isAdmin() || !state.editMode) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var handle = target.closest('[data-contact-drag-handle]');
      if (!(handle instanceof HTMLElement)) {
        return;
      }
      var uid = String(handle.getAttribute('data-row-uid') || '').trim();
      if (!uid) {
        return;
      }
      state.draggingRowUid = uid;
      state.dragOverRowUid = uid;
      state.dragMoved = false;
      state.dragDropped = false;
      state.dragStartRows = normalizeRows((state.draft && state.draft.rows) || []);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        try {
          event.dataTransfer.setData('text/plain', uid);
        } catch (_err) {
          // Ignore dataTransfer restrictions.
        }
      }
      var row = handle.closest('.contact-profile-row[data-row-uid]');
      if (row instanceof HTMLElement) {
        row.classList.add('is-dragging');
      }
    });

    root.addEventListener('dragover', function (event) {
      var secureChatTarget = event.target;
      if (secureChatDataTransferHasFiles(event.dataTransfer) && secureChatTarget instanceof HTMLElement) {
        var chatPanel = secureChatTarget.closest('.secure-chat-panel');
        if (chatPanel instanceof HTMLElement) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          chatPanel.classList.add('is-file-drop-over');
          return;
        }
      }
      if (!isAdmin() || !state.editMode || !state.draggingRowUid) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var row = target.closest('.contact-profile-row[data-row-uid]');
      if (!(row instanceof HTMLElement)) {
        return;
      }
      var uid = String(row.getAttribute('data-row-uid') || '').trim();
      if (!uid) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      if (state.dragOverRowUid !== uid) {
        state.dragOverRowUid = uid;
        var sourceUid = String(state.draggingRowUid || '').trim();
        if (sourceUid && uid !== sourceUid) {
          var before = captureRowFlipPositions();
          var changed = reorderDraftRowsByUid(sourceUid, uid);
          if (changed) {
            state.pendingFlipPositions = before;
            state.dragMoved = true;
          }
        }
        renderContent();
      }
    });

    root.addEventListener('drop', function (event) {
      var secureChatTarget = event.target;
      if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length && secureChatTarget instanceof HTMLElement) {
        var chatPanel = secureChatTarget.closest('.secure-chat-panel');
        if (chatPanel instanceof HTMLElement) {
          event.preventDefault();
          chatPanel.classList.remove('is-file-drop-over');
          addSecureChatPendingFiles(event.dataTransfer.files);
          return;
        }
      }
      if (!isAdmin() || !state.editMode || !state.draggingRowUid) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var row = target.closest('.contact-profile-row[data-row-uid]');
      if (!(row instanceof HTMLElement)) {
        return;
      }
      event.preventDefault();
      var targetUid = String(row.getAttribute('data-row-uid') || '').trim();
      var sourceUid = String(state.draggingRowUid || '').trim();
      state.dragDropped = true;
      if (!sourceUid || !targetUid || sourceUid === targetUid) {
        state.draggingRowUid = '';
        state.dragOverRowUid = '';
        state.dragMoved = false;
        state.dragDropped = false;
        state.dragStartRows = null;
        renderContent();
        return;
      }
      var moved = false;
      if (state.dragMoved) {
        moved = true;
      } else {
        state.pendingFlipPositions = captureRowFlipPositions();
        moved = reorderDraftRowsByUid(sourceUid, targetUid);
      }
      state.draggingRowUid = '';
      state.dragOverRowUid = '';
      state.dragMoved = false;
      state.dragDropped = false;
      state.dragStartRows = null;
      if (moved) {
        clearActiveRowField();
        renderContent();
        state.saveIndicatorVisible = true;
        renderAdmin();
        persistDraft({ alertOnError: false });
      } else {
        state.pendingFlipPositions = null;
        renderContent();
      }
    });

    root.addEventListener('dragleave', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var chatPanel = target.closest('.secure-chat-panel');
      if (!(chatPanel instanceof HTMLElement)) {
        return;
      }
      var related = event.relatedTarget;
      if (!(related instanceof Node) || !chatPanel.contains(related)) {
        chatPanel.classList.remove('is-file-drop-over');
      }
    });

    root.addEventListener('dragend', function () {
      if (!isAdmin() || !state.editMode) {
        return;
      }
      if (!state.dragDropped && state.dragMoved) {
        state.saveIndicatorVisible = true;
        renderAdmin();
        persistDraft({ alertOnError: false });
      }
      state.draggingRowUid = '';
      state.dragOverRowUid = '';
      state.dragMoved = false;
      state.dragDropped = false;
      state.dragStartRows = null;
      renderContent();
    });

    root.addEventListener('input', function (event) {
      var secureChatTarget = event.target;
      if (secureChatTarget instanceof HTMLTextAreaElement && secureChatTarget.id === 'secure-chat-input') {
        state.chat.draftText = String(secureChatTarget.value || '');
        persistSecureChatSessionToBrowser();
        return;
      }
      if (secureChatTarget instanceof HTMLInputElement && secureChatTarget.getAttribute('data-secure-chat-action') === 'emoji-search') {
        searchSecureChatEmoji(secureChatTarget.value || '');
        return;
      }
      if (!isAdmin() || !state.editMode) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-page-nav-title-input')) {
        state.navTitleInput = String(target.value || '');
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-contact-intro-publish')) {
        state.draft = normalizeDraftState(state.draft);
        state.draft.publish_intro_to_nostr = !!target.checked;
        queueAutosave(500);
        return;
      }
      if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.hasAttribute('data-contact-head-input')) {
        var headField = String(target.getAttribute('data-contact-head-input') || '').trim().toLowerCase();
        state.draft = normalizeDraftState(state.draft);
        if (headField === 'title') {
          state.draft.title = String(target.value || '');
        } else if (headField === 'description') {
          state.draft.description = String(target.value || '');
        } else {
          return;
        }
        queueAutosave(500);
        return;
      }

      var field = String(target.getAttribute('data-contact-inline-field') || '').trim().toLowerCase();
      var idx = Number(target.getAttribute('data-row-index'));
      if (!Number.isInteger(idx) || idx < 0 || (field !== 'transport' && field !== 'value' && field !== 'qualifier')) {
        return;
      }
      if (!syncDraftRowField(idx, field, target.value || '')) {
        return;
      }
      queueAutosave(500);
    });

    root.addEventListener('emoji-click', function (event) {
      if (!event || !event.detail) {
        return;
      }
      insertSecureChatEmoji(event.detail.unicode || '');
      renderContent();
    });

    root.addEventListener('change', function (event) {
      var secureChatTarget = event.target;
      if (secureChatTarget instanceof HTMLInputElement && secureChatTarget.id === 'secure-chat-file-input') {
        releaseSecureChatFilePicker(false);
        if (secureChatTarget.files && secureChatTarget.files.length) {
          addSecureChatPendingFiles(secureChatTarget.files);
        }
        secureChatTarget.value = '';
        return;
      }
      if (secureChatTarget instanceof HTMLInputElement && secureChatTarget.id === 'secure-chat-send-modifier') {
        state.chat.sendWithModifier = secureChatTarget.checked === true;
        return;
      }
      if (!isAdmin() || !state.editMode) {
        return;
      }
      var target = event.target;
      if (target instanceof HTMLInputElement && target.hasAttribute('data-contact-intro-publish')) {
        state.draft = normalizeDraftState(state.draft);
        state.draft.publish_intro_to_nostr = !!target.checked;
        queueAutosave(500);
        renderHead();
        return;
      }
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
        return;
      }
      var field = String(target.getAttribute('data-contact-inline-field') || '').trim().toLowerCase();
      var idx = Number(target.getAttribute('data-row-index'));
      if (!Number.isInteger(idx) || idx < 0 || (field !== 'transport' && field !== 'value' && field !== 'qualifier')) {
        return;
      }
      if (!syncDraftRowField(idx, field, target.value || '')) {
        return;
      }
      queueAutosave(500);
      if (field === 'qualifier') {
        clearActiveRowField();
        renderContent();
      }
    });

    root.addEventListener('focusin', function (event) {
      if (!isAdmin() || !state.editMode) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.hasAttribute('data-contact-inline-field')) {
        var field = String(target.getAttribute('data-contact-inline-field') || '').trim().toLowerCase();
        var idx = Number(target.getAttribute('data-row-index'));
        if (Number.isInteger(idx) && idx >= 0 && (field === 'transport' || field === 'value' || field === 'qualifier')) {
          setActiveRowField(idx, field);
        }
        return;
      }
      if (target.hasAttribute('data-contact-head-input')) {
        state.activeHeadField = String(target.getAttribute('data-contact-head-input') || '').trim().toLowerCase();
      }
    });

    root.addEventListener('focusout', function (event) {
      if (!isAdmin() || !state.editMode) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var leavingInline = target.hasAttribute('data-contact-inline-field');
      var leavingHead = target.hasAttribute('data-contact-head-input');
      if (!leavingInline && !leavingHead) {
        return;
      }
      window.setTimeout(function () {
        var active = document.activeElement;
        if (active instanceof HTMLElement && root.contains(active) && (active.hasAttribute('data-contact-inline-field') || active.hasAttribute('data-contact-head-input') || active.hasAttribute('data-page-nav-title-input'))) {
          return;
        }
        if (leavingInline && state.activeRowIndex >= 0) {
          clearActiveRowField();
          renderContent();
          return;
        }
        if (leavingHead && state.activeHeadField) {
          state.activeHeadField = '';
          state.headFocusPending = false;
          renderHead();
        }
      }, 0);
    });

    root.addEventListener('keydown', function (event) {
      var target = event.target;
      if (state.chat.emojiPickerOpen && event.key === 'Escape') {
        event.preventDefault();
        setSecureChatEmojiPickerOpen(false);
        return;
      }
      if (target instanceof HTMLTextAreaElement && target.id === 'secure-chat-input' && event.key === 'Enter') {
        if (event.shiftKey) {
          return;
        }
        if (state.chat.sendWithModifier === true && !(event.metaKey || event.ctrlKey)) {
          return;
        }
        event.preventDefault();
        var secureChatDraft = currentSecureChatDraftValue();
        if (!state.chat.sending && (String(secureChatDraft || '').trim() || secureChatHasPendingFiles())) {
          sendSecureChatMessage(secureChatDraft);
        }
        return;
      }
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-page-nav-title-input') && event.key === 'Enter') {
        event.preventDefault();
        saveNavbarTitle();
        return;
      }
      if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.hasAttribute('data-contact-head-input') && event.key === 'Enter') {
        if (target instanceof HTMLTextAreaElement) {
          return;
        }
        event.preventDefault();
        state.activeHeadField = '';
        state.headFocusPending = false;
        renderHead();
        queueAutosave(250);
        return;
      }
      if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.hasAttribute('data-contact-head-input') && event.key === 'Escape') {
        event.preventDefault();
        state.activeHeadField = '';
        state.headFocusPending = false;
        renderHead();
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-contact-inline-field') && event.key === 'Enter') {
        event.preventDefault();
        clearActiveRowField();
        renderContent();
        queueAutosave(250);
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-contact-inline-field') && event.key === 'Escape') {
        event.preventDefault();
        clearActiveRowField();
        renderContent();
      }
    });
  }

  function maybeReloadForAuthChange() {
    var nextSig = secureChatAuthSignature();
    var lastSig = state.authSignature || '';
    if (nextSig !== lastSig) {
      state.authSignature = nextSig;
      resetSecureChatState();
      if (state.payload) {
        renderContent();
      }
      load();
      return;
    }
    if (hasSecureChatSession()) {
      refreshSecureChatState();
      scheduleSecureChatPoll();
      return;
    }
    if (storedSessionToken()) {
      verifySecureChatStoredAuth().then(function (ok) {
        if (ok) {
          refreshSecureChatState({ reset: true }).finally(function () {
            scheduleSecureChatPoll();
          });
        }
      });
    }
  }

  function initializeSecureChatAfterLoad() {
    return verifySecureChatStoredAuth().then(function (ok) {
      if (!ok) {
        return false;
      }
      state.chat.simplexWebIntroDismissed = secureChatSimplexInfoDismissedFromBrowser();
      if (hydrateSecureChatSessionFromBrowser()) {
        renderContent();
      }
      return refreshSecureChatState({ reset: true }).finally(function () {
        scheduleSecureChatPoll();
      });
    });
  }

  function load() {
    var auth = authPayload();
    state.authSignature = secureChatAuthSignature();
    resetSecureChatState();
    if (!hasSecureChatSession() && storedSessionToken()) {
      state.chat.authChecking = true;
    }
    return apiPost('/cgi/blog-get-nostr-page', {
      page_slug: slug,
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (payload) {
      if (!isExpectedPayload(payload)) {
        throw new Error('Unexpected page payload for profile page');
      }
      state.payload = payload;
      state.draft = normalizeDraftState(payload.state || { title: '', description: '', rows: [] });
      state.navTitle = String(payload.nav_title || '').trim();
      state.navTitleEditing = false;
      state.navTitleInput = '';
      state.navTitleBusy = false;
      state.activeHeadField = '';
      state.headFocusPending = false;
      state.activeRowIndex = -1;
      state.activeRowField = '';
      state.saveIndicatorVisible = false;
      setSaveStatus('saved');
      writeBootstrapCache(payload);
      renderAll();
      markInitialContentPainted();
      initializeSecureChatAfterLoad();
    }).catch(function (err) {
      renderLoadFallback(err, 'Page content is still loading. The latest page data was not available yet.');
    }).finally(function () {
      markHydrationPageReady();
    });
  }

  bindEvents();
  window.addEventListener('beforeunload', markPageLifecycleClosing);
  window.addEventListener('pagehide', markPageLifecycleClosing);
  window.addEventListener('pageshow', clearPageLifecycleClosing);
  window.addEventListener('blog-auth-changed', maybeReloadForAuthChange);
  window.addEventListener('storage', function (event) {
    if (!event || !event.key) {
      return;
    }
    if (event.key === 'session_token' || event.key === 'csrf_token' || event.key === 'last_auth_method' || event.key === 'last_auth_pubkey') {
      maybeReloadForAuthChange();
    }
  });
  window.addEventListener('focus', maybeReloadForAuthChange);
  window.addEventListener('focus', releaseSecureChatFilePickerSoon);
  window.addEventListener('wizardry-plugins-ready', maybeLoadVideoChatWidget);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      maybeReloadForAuthChange();
      scheduleSecureChatPoll();
      return;
    }
    if (state.chat.pollTimer) {
      clearTimeout(state.chat.pollTimer);
      state.chat.pollTimer = null;
    }
  });
  if (!renderFromBootstrapCache()) {
    renderFromPrerenderBootstrap();
  }
  secureChatRegisterBrowserNativeTransport();
  load();
})();
