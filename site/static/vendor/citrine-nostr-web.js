(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CitrineNostrWeb = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var NIP46_KIND = 24133;
  var DEFAULT_RETRY_DELAYS = [1200, 2400, 4800];

  function normalizeHex(value, length) {
    var text = String(value || '').trim().toLowerCase();
    var re = new RegExp('^[0-9a-f]{' + String(length) + '}$');
    return re.test(text) ? text : '';
  }

  function normalizePubkeyHex(value) {
    return normalizeHex(value, 64);
  }

  function bytesToHex(bytes) {
    return Array.prototype.map.call(bytes || [], function (byte) {
      return ('0' + Number(byte).toString(16)).slice(-2);
    }).join('');
  }

  function hexToBytes(hex) {
    var value = normalizeHex(hex, String(hex || '').length);
    if (!value || value.length % 2 !== 0) {
      throw new Error('Invalid hex string.');
    }
    var out = new Uint8Array(value.length / 2);
    for (var i = 0; i < value.length; i += 2) {
      out[i / 2] = parseInt(value.slice(i, i + 2), 16);
    }
    return out;
  }

  function randomHex(bytes, randomSource) {
    var count = Math.max(1, Number(bytes || 16));
    var out = new Uint8Array(count);
    var source = randomSource || (typeof crypto !== 'undefined' ? crypto : null);
    if (source && typeof source.getRandomValues === 'function') {
      source.getRandomValues(out);
      return bytesToHex(out);
    }
    for (var i = 0; i < count; i += 1) {
      out[i] = Math.floor(Math.random() * 256);
    }
    return bytesToHex(out);
  }

  function validRelay(value) {
    var relay = String(value || '').trim();
    return /^wss:\/\/[^ ]+$/i.test(relay) ? relay : '';
  }

  function cleanRelays(relays, fallbackRelays) {
    var out = (Array.isArray(relays) ? relays : []).map(validRelay).filter(Boolean);
    if (out.length) return out;
    return (Array.isArray(fallbackRelays) ? fallbackRelays : []).map(validRelay).filter(Boolean);
  }

  function buildNostrConnectUri(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var appPubkey = normalizePubkeyHex(opts.appPubkey || '');
    var pairSecret = String(opts.pairSecret || '').trim();
    var relays = cleanRelays(opts.relays || [], []);
    var params = new URLSearchParams();
    if (!appPubkey) throw new Error('Nostr Connect app pubkey is required.');
    if (!pairSecret) throw new Error('Nostr Connect pair secret is required.');
    relays.forEach(function (relay) {
      params.append('relay', relay);
    });
    params.set('secret', pairSecret);
    if (opts.name) params.set('name', String(opts.name));
    if (opts.metadata) params.set('metadata', JSON.stringify(opts.metadata));
    if (opts.perms) params.set('perms', Array.isArray(opts.perms) ? opts.perms.join(',') : String(opts.perms));
    return 'nostrconnect://' + appPubkey + '?' + params.toString();
  }

  function parseJson(value) {
    if (value && typeof value === 'object') return value;
    return JSON.parse(String(value || '{}'));
  }

  function extractConnectSecret(msg) {
    if (!msg || typeof msg !== 'object') return '';
    if (typeof msg.result === 'string') return msg.result;
    if (typeof msg.secret === 'string') return msg.secret;
    if (Array.isArray(msg.params)) {
      if (typeof msg.params[1] === 'string') return msg.params[1];
      if (typeof msg.params[0] === 'string' && msg.params.length === 1) return msg.params[0];
      if (msg.params[0] && typeof msg.params[0] === 'object' && typeof msg.params[0].secret === 'string') {
        return msg.params[0].secret;
      }
    }
    return '';
  }

  function isConnectAck(msg, launchPending) {
    if (!msg || typeof msg !== 'object' || msg.error) return false;
    if (String(msg.result || '').trim().toLowerCase() === 'ack') return true;
    if (typeof msg.result === 'string' && msg.result === '' && msg.id && launchPending) return true;
    return String(msg.method || '').trim() === 'connect' && !extractConnectSecret(msg);
  }

  function createAuthEventTemplate(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var tags = [];
    var challenge = String(opts.challenge || '').trim();
    var domain = String(opts.domain || opts.host || '').trim();
    var origin = String(opts.origin || '').trim();
    var url = String(opts.url || '').trim();
    var method = String(opts.method || '').trim().toUpperCase();
    var action = String(opts.action || 'login').trim();
    var pubkey = normalizePubkeyHex(opts.pubkey || '');
    if (challenge) tags.push(['challenge', challenge]);
    if (origin) tags.push(['origin', origin]);
    if (domain) tags.push(['domain', domain]);
    if (url) tags.push(['u', url]);
    if (method) tags.push(['method', method]);
    if (action && action !== 'login') tags.push(['action', action]);
    if (Array.isArray(opts.extraTags)) {
      opts.extraTags.forEach(function (tag) {
        if (Array.isArray(tag) && tag.length && tag[0]) {
          tags.push(tag.map(function (part) { return String(part); }));
        }
      });
    }
    var event = {
      kind: Number(opts.kind || 22242),
      created_at: Number(opts.createdAt || Math.floor(Date.now() / 1000)),
      tags: tags,
      content: String(opts.content || '')
    };
    if (pubkey) event.pubkey = pubkey;
    return event;
  }

  function wait(delayMs) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, Number(delayMs || 0)));
    });
  }

  function withTimedOutRetry(task, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var delays = Array.isArray(opts.delays) ? opts.delays : DEFAULT_RETRY_DELAYS;
    var waitFn = typeof opts.wait === 'function' ? opts.wait : wait;
    var onRetry = typeof opts.onRetry === 'function' ? opts.onRetry : function () {};
    var attempt = 0;

    function run() {
      return Promise.resolve().then(task).catch(function (err) {
        var message = String((err && err.message) || '');
        if (attempt >= delays.length || message.indexOf('timed out') < 0) {
          throw err;
        }
        var delayMs = Number(delays[attempt] || 0);
        attempt += 1;
        onRetry({ attempt: attempt, delayMs: delayMs, error: err });
        return Promise.resolve(waitFn(delayMs)).then(run);
      });
    }

    return run();
  }

  function createSessionStorageAdapter(storage, key) {
    var target = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    var storageKey = key || 'citrine.nip46.v1';
    return {
      load: function () {
        if (!target) return null;
        try {
          return parseJson(target.getItem(storageKey) || 'null');
        } catch (_err) {
          return null;
        }
      },
      save: function (value) {
        if (!target) return;
        target.setItem(storageKey, JSON.stringify(value || {}));
      },
      clear: function () {
        if (!target) return;
        target.removeItem(storageKey);
      }
    };
  }

  function createMemoryStorageAdapter(initial) {
    var value = initial || null;
    return {
      load: function () { return value; },
      save: function (next) { value = next || null; },
      clear: function () { value = null; }
    };
  }

  function defaultState(relays) {
    return {
      active: false,
      appSecretHex: '',
      appPubkey: '',
      pairSecret: '',
      relays: relays || [],
      signerPubkey: '',
      accountPubkey: '',
      pending: {},
      pendingTimers: {},
      seenEvents: {},
      launchPending: false,
      subscription: null,
      pool: null
    };
  }

  function createNip46Client(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var nostrTools = opts.nostrTools || null;
    var relays = cleanRelays(opts.relays || [], opts.defaultRelays || []);
    var storage = opts.storage || createMemoryStorageAdapter();
    var nowEpoch = typeof opts.nowEpoch === 'function' ? opts.nowEpoch : function () {
      return Math.floor(Date.now() / 1000);
    };
    var randomHexFn = typeof opts.randomHex === 'function' ? opts.randomHex : randomHex;
    var status = typeof opts.onStatus === 'function' ? opts.onStatus : function () {};
    var state = defaultState(relays);

    function requireTools() {
      if (!nostrTools) throw new Error('Nostr tools are required.');
      return nostrTools;
    }

    function save() {
      if (!state.active || !state.appSecretHex || !state.appPubkey) return;
      storage.save({
        appSecretHex: state.appSecretHex,
        appPubkey: state.appPubkey,
        pairSecret: state.pairSecret,
        relays: state.relays,
        signerPubkey: normalizePubkeyHex(state.signerPubkey || ''),
        accountPubkey: normalizePubkeyHex(state.accountPubkey || '')
      });
    }

    function load() {
      var saved = storage.load();
      if (!saved || typeof saved !== 'object') return false;
      state.active = true;
      state.appSecretHex = String(saved.appSecretHex || '');
      state.appPubkey = normalizePubkeyHex(saved.appPubkey || '');
      state.pairSecret = String(saved.pairSecret || '');
      state.relays = cleanRelays(saved.relays || [], relays);
      state.signerPubkey = normalizePubkeyHex(saved.signerPubkey || '');
      state.accountPubkey = normalizePubkeyHex(saved.accountPubkey || '');
      return !!(state.appSecretHex && state.appPubkey && state.pairSecret);
    }

    function ensurePairing() {
      var tools = requireTools();
      if (state.active && state.appPubkey && state.pairSecret) return Promise.resolve(api);
      if (load()) return Promise.resolve(api);
      state.active = true;
      state.appSecretHex = bytesToHex(tools.generateSecretKey());
      state.appPubkey = tools.getPublicKey(hexToBytes(state.appSecretHex));
      state.pairSecret = randomHexFn(16);
      state.relays = relays.slice();
      state.pending = {};
      state.pendingTimers = {};
      state.seenEvents = {};
      save();
      return Promise.resolve(api);
    }

    function currentUri(uriOptions) {
      var extra = uriOptions && typeof uriOptions === 'object' ? uriOptions : {};
      return buildNostrConnectUri({
        appPubkey: state.appPubkey,
        pairSecret: state.pairSecret,
        relays: state.relays,
        name: extra.name || opts.name || '',
        metadata: extra.metadata || opts.metadata || null,
        perms: extra.perms || opts.perms || 'get_public_key'
      });
    }

    function closeSubscription() {
      if (state.subscription && typeof state.subscription.close === 'function') state.subscription.close();
      state.subscription = null;
    }

    function ensurePool() {
      var tools = requireTools();
      if (!state.pool) state.pool = new tools.SimplePool();
      return state.pool;
    }

    function subscribe(lookbackSeconds) {
      if (!state.appPubkey) return;
      closeSubscription();
      var pool = ensurePool();
      state.subscription = pool.subscribeMany(
        state.relays,
        [{ kinds: [NIP46_KIND], '#p': [state.appPubkey], since: nowEpoch() - Math.max(30, Number(lookbackSeconds || 180)) }],
        { onevent: handleRelayEvent }
      );
    }

    function decryptEvent(event) {
      var tools = requireTools();
      if (tools.nip44 && typeof tools.nip44.getConversationKey === 'function') {
        try {
          var conversationKey = tools.nip44.getConversationKey(hexToBytes(state.appSecretHex), event.pubkey);
          return Promise.resolve(tools.nip44.decrypt(event.content, conversationKey));
        } catch (_err) {}
      }
      return tools.nip04.decrypt(hexToBytes(state.appSecretHex), event.pubkey, event.content);
    }

    function encrypt(pubkey, plaintext) {
      var tools = requireTools();
      if (tools.nip44 && typeof tools.nip44.getConversationKey === 'function') {
        var conversationKey = tools.nip44.getConversationKey(hexToBytes(state.appSecretHex), pubkey);
        return Promise.resolve(tools.nip44.encrypt(plaintext, conversationKey));
      }
      return tools.nip04.encrypt(hexToBytes(state.appSecretHex), pubkey, plaintext);
    }

    function resolvePending(id, payload, isError) {
      var entry = state.pending[id];
      if (!entry) return;
      delete state.pending[id];
      if (state.pendingTimers[id]) {
        clearTimeout(state.pendingTimers[id]);
        delete state.pendingTimers[id];
      }
      if (isError) entry.reject(new Error(payload || 'Nostr Connect request failed.'));
      else entry.resolve(payload);
    }

    function handleRelayEvent(event) {
      if (!event || !event.id || state.seenEvents[event.id]) return Promise.resolve(false);
      state.seenEvents[event.id] = true;
      return decryptEvent(event).then(function (plain) {
        var msg = parseJson(plain);
        var secret = extractConnectSecret(msg);
        if (msg && msg.id && state.pending[msg.id]) {
          resolvePending(msg.id, msg.error || msg.result, !!msg.error);
          return true;
        }
        if ((msg && msg.method === 'connect' && (!secret || secret === state.pairSecret)) || secret === state.pairSecret || isConnectAck(msg, state.launchPending)) {
          var signerPubkey = normalizePubkeyHex(event.pubkey || '');
          if (signerPubkey && state.signerPubkey && state.signerPubkey !== signerPubkey) {
            state.accountPubkey = '';
          }
          state.signerPubkey = signerPubkey;
          save();
          status({ type: 'connected', signerPubkey: signerPubkey });
          return true;
        }
        return false;
      });
    }

    function sendRpc(method, params, timeoutMs) {
      if (typeof opts.rpcRequest === 'function') {
        return opts.rpcRequest(method, params || [], { state: state, timeoutMs: timeoutMs });
      }
      if (!state.signerPubkey) return Promise.reject(new Error('Phone signer is not paired yet.'));
      var tools = requireTools();
      var requestId = randomHexFn(12);
      return encrypt(state.signerPubkey, JSON.stringify({ id: requestId, method: method, params: params || [] })).then(function (ciphertext) {
        var eventTemplate = {
          kind: NIP46_KIND,
          created_at: nowEpoch(),
          tags: [['p', state.signerPubkey]],
          content: ciphertext
        };
        var signed = tools.finalizeEvent(eventTemplate, hexToBytes(state.appSecretHex));
        return new Promise(function (resolve, reject) {
          state.pending[requestId] = { resolve: resolve, reject: reject };
          state.pendingTimers[requestId] = setTimeout(function () {
            resolvePending(requestId, 'Phone signer timed out.', true);
          }, Number(timeoutMs || 60000));
          ensurePool().publish(state.relays, signed);
        });
      });
    }

    function getAccountPubkey(options) {
      var account = normalizePubkeyHex(state.accountPubkey || '');
      var forceRefresh = options && options.forceRefresh === true;
      if (account && !forceRefresh) return Promise.resolve(account);
      if (forceRefresh) state.accountPubkey = '';
      return sendRpc('get_public_key', [], 30000).then(function (pubkey) {
        var normalized = normalizePubkeyHex(pubkey || '');
        if (!normalized) throw new Error('Phone signer did not provide a valid public key.');
        state.accountPubkey = normalized;
        save();
        return normalized;
      });
    }

    function getAccountPubkeyWithRetry(options) {
      return withTimedOutRetry(function () {
        return getAccountPubkey(options);
      }, {
        delays: opts.retryDelays || DEFAULT_RETRY_DELAYS,
        wait: opts.wait,
        onRetry: function (event) {
          status({ type: 'retry', attempt: event.attempt, delayMs: event.delayMs });
        }
      });
    }

    function clear() {
      closeSubscription();
      state = defaultState(relays);
      storage.clear();
    }

    var api = {
      state: function () { return state; },
      ensurePairing: ensurePairing,
      currentUri: currentUri,
      subscribe: subscribe,
      handleRelayEvent: handleRelayEvent,
      sendRpc: sendRpc,
      getAccountPubkey: getAccountPubkey,
      getAccountPubkeyWithRetry: getAccountPubkeyWithRetry,
      clear: clear,
      save: save,
      load: load
    };
    return api;
  }

  function getNip07Signer(target) {
    var root = target || (typeof window !== 'undefined' ? window : {});
    var signer = root.nostr || null;
    if (!signer) throw new Error('No browser signer detected.');
    if (typeof signer.getPublicKey !== 'function') throw new Error('Browser signer is missing getPublicKey.');
    if (typeof signer.signEvent !== 'function') throw new Error('Browser signer is missing signEvent.');
    return signer;
  }

  function bindSignerReturnRefresh(target, refresh) {
    var root = target || (typeof window !== 'undefined' ? window : null);
    var fn = typeof refresh === 'function' ? refresh : function () {};
    if (!root || typeof root.addEventListener !== 'function') return function () {};
    function onVisibility() {
      var doc = root.document || (typeof document !== 'undefined' ? document : null);
      if (!doc || !doc.hidden) fn('visibility');
    }
    function onPageshow() { fn('pageshow'); }
    function onFocus() { fn('focus'); }
    root.addEventListener('pageshow', onPageshow);
    root.addEventListener('focus', onFocus);
    if (root.document && typeof root.document.addEventListener === 'function') {
      root.document.addEventListener('visibilitychange', onVisibility);
    }
    return function unbind() {
      root.removeEventListener('pageshow', onPageshow);
      root.removeEventListener('focus', onFocus);
      if (root.document && typeof root.document.removeEventListener === 'function') {
        root.document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }

  function nostrLoginDialogHtml(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var title = String(opts.title || 'Sign in');
    return '' +
      '<div class="auth-modal" id="auth-modal" hidden>' +
      '<div class="auth-modal-backdrop" data-close-auth-modal></div>' +
      '<div class="auth-modal-panel" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">' +
      '<button class="auth-modal-close" type="button" aria-label="Close login" data-close-auth-modal>&times;</button>' +
      '<div class="auth-modal-scroll">' +
      '<h2 id="auth-modal-title">' + escapeHtml(title) + '</h2>' +
      '<div class="auth-platform-grid" role="list" aria-label="Signer platform">' +
      authPlatformButton('auth-tab-register', 'register', 'desktop', true, 'desktop', 'Desktop') +
      authPlatformButton('auth-tab-phone', 'phone', 'android', false, 'android', 'Android') +
      authPlatformButton('', 'phone', 'ios', false, 'ios', 'iPhone') +
      authPlatformButton('', 'phone', 'remote', false, 'remote', 'Remote Signer') +
      '</div>' +
      '<button id="auth-tab-manual" class="auth-advanced-toggle" type="button" data-auth-route="manual" data-auth-flavor="manual" aria-pressed="false">Advanced...</button>' +
      '<div class="auth-tab-frame">' +
      '<div id="auth-register-panel" class="auth-panel" role="tabpanel" aria-labelledby="auth-tab-register">' +
      '<p class="auth-modal-help">Recommended: Firefox with nos2x-fox. Browser sign-in uses a NIP-07 extension.</p>' +
      '<div class="auth-actions">' +
      '<button id="auth-register-btn" class="auth-primary-btn" type="button">Continue with browser signer</button>' +
      '<span class="auth-action-reco">Recommended: <a class="auth-inline-link" href="https://addons.mozilla.org/en-US/firefox/addon/nos2x-fox/" target="_blank" rel="noopener noreferrer">nos2x-fox</a></span>' +
      '</div>' +
      '</div>' +
      '<div id="auth-phone-panel" class="auth-panel" role="tabpanel" aria-labelledby="auth-tab-phone" hidden>' +
      '<div class="auth-nip46-pairing">' +
      '<div id="auth-nip46-qr" class="auth-qr" aria-label="Nostr Connect QR code"></div>' +
      '<div class="auth-nip46-controls">' +
      '<ol class="auth-nip46-steps" aria-label="Phone signer login steps">' +
      '<li><span>1</span><strong>Signer app</strong><small>App link or QR.</small></li>' +
      '<li><span>2</span><strong>Pairing approval</strong><small>Return here after approval.</small></li>' +
      '<li><span>3</span><strong>Login approval</strong><small>Sign-in finishes here.</small></li>' +
      '</ol>' +
      '<div class="auth-nip46-link-actions">' +
      '<a id="auth-nip46-open" class="auth-secondary-btn auth-nip46-open-link" href="#">Connect Nostr</a>' +
      '<button id="auth-nip46-uri-copy" class="machine-string-copy" type="button" aria-label="Copy Nostr Connect link" title="Copy Nostr Connect link">' +
      '<svg class="machine-copy-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M8 7.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z"></path>' +
      '<path d="M5 15.5V5.75A2.75 2.75 0 0 1 7.75 3H15"></path>' +
      '</svg>' +
      '</button>' +
      '</div>' +
      '<p class="auth-nip46-uri" id="auth-nip46-uri" hidden></p>' +
      '<p class="auth-nip46-diagnostics" id="auth-nip46-diagnostics" aria-live="polite"></p>' +
      '<div class="auth-actions"><button id="auth-phone-btn" class="auth-primary-btn" type="button" disabled hidden>Continue sign-in</button></div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div id="auth-manual-panel" class="auth-panel" role="tabpanel" aria-labelledby="auth-tab-manual" hidden>' +
      '<p class="auth-modal-help">Manual fallback: sign the challenge event outside this page and paste signed JSON.</p>' +
      '<div class="auth-actions"><button id="auth-manual-start" class="auth-secondary-btn" type="button">Create challenge</button></div>' +
      '<div class="auth-manual-grid">' +
      '<label for="auth-manual-request-id"><strong>Request ID</strong></label><input class="auth-input" id="auth-manual-request-id" type="text" readonly>' +
      '<label for="auth-manual-challenge"><strong>Challenge</strong></label><input class="auth-input" id="auth-manual-challenge" type="text" readonly>' +
      '<label for="auth-manual-expires"><strong>Expires At (epoch)</strong></label><input class="auth-input" id="auth-manual-expires" type="text" readonly>' +
      '</div>' +
      '<label for="auth-manual-template"><strong>Unsigned Auth Event Template</strong></label>' +
      '<textarea id="auth-manual-template" class="auth-input auth-key-input" readonly></textarea>' +
      '<label for="auth-manual-event"><strong>Signed Auth Event JSON</strong></label>' +
      '<textarea id="auth-manual-event" class="auth-input auth-key-input" placeholder=\'{"kind":22242,...,"sig":"..."}\'></textarea>' +
      '<div class="auth-actions"><button id="auth-manual-submit" class="auth-primary-btn" type="button">Submit signed login</button></div>' +
      '</div>' +
      '</div>' +
      '<div id="auth-modal-message" class="auth-modal-message" aria-live="polite"></div>' +
      '<section class="auth-recommended-apps auth-reco-card" aria-labelledby="auth-reco-title">' +
      '<h3 id="auth-reco-title"><span class="auth-apps-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" focusable="false"><rect x="4" y="4" width="6.2" height="6.2" rx="1.35"></rect><rect x="13.8" y="4" width="6.2" height="6.2" rx="1.35"></rect><rect x="4" y="13.8" width="6.2" height="6.2" rx="1.35"></rect><rect x="13.8" y="13.8" width="6.2" height="6.2" rx="1.35"></rect></svg>' +
      '</span><span>Recommended Apps</span></h3>' +
      '<div class="auth-reco-group auth-login-onboarding"><p id="auth-login-summary" class="auth-reco-summary"></p><p id="auth-login-note" class="auth-reco-note"></p><ul id="auth-login-apps" class="auth-reco-apps"></ul></div>' +
      '<div class="auth-reco-group auth-zap-onboarding"><p id="auth-zap-summary" class="auth-reco-summary auth-zap-summary"></p><p id="auth-zap-note" class="auth-reco-note auth-zap-note"></p><ul id="auth-zap-apps" class="auth-reco-apps auth-zap-apps"></ul></div>' +
      '<p class="auth-zap-updated">Recommendations Updated May 2026</p>' +
      '</section>' +
      '</div>' +
      '</div>' +
      '</div>';
  }

  function authPlatformButton(id, route, flavor, active, icon, label) {
    var idAttr = id ? ' id="' + id + '"' : '';
    return '<button' + idAttr + ' class="auth-platform-card' + (active ? ' is-active' : '') + '" type="button" data-auth-route="' + route + '" data-auth-flavor="' + flavor + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
      '<span class="auth-platform-icon" aria-hidden="true">' + platformIconSvg(icon) + '</span>' +
      '<span class="auth-platform-copy"><strong>' + escapeHtml(label) + '</strong></span>' +
      '</button>';
  }

  function platformIconSvg(icon) {
    if (icon === 'android') return '<svg viewBox="0 0 24 24" focusable="false"><path d="M7 9.5h10v7.5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"></path><path d="M8.5 7 6.8 5.3"></path><path d="M15.5 7l1.7-1.7"></path><path d="M9 13h.01"></path><path d="M15 13h.01"></path></svg>';
    if (icon === 'ios') return '<svg viewBox="0 0 24 24" focusable="false"><path d="M9 3.5h6a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"></path><path d="M11 6h2"></path><path d="M12 17.8h.01"></path></svg>';
    if (icon === 'remote') return '<svg viewBox="0 0 24 24" focusable="false"><path d="M7 7.5h10"></path><path d="M7 16.5h10"></path><path d="M8 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"></path><path d="M16 14a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"></path></svg>';
    return '<svg viewBox="0 0 24 24" focusable="false"><path d="M5 6.5h14v9H5z"></path><path d="M9 19h6"></path><path d="M12 15.5V19"></path></svg>';
  }

  function ensureNostrLoginDialog(target, options) {
    var doc = target || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    var existing = doc.getElementById('auth-modal');
    if (existing) return existing;
    var wrap = doc.createElement('div');
    wrap.innerHTML = nostrLoginDialogHtml(options);
    var modal = wrap.firstChild;
    var anchor = doc.querySelector('script[src*="citrine-nostr-web.js"]') || doc.body.firstChild;
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(modal, anchor);
    } else if (doc.body) {
      doc.body.appendChild(modal);
    }
    return modal;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function signInHelperMessage(tabName) {
    var base = 'Choose a sign-in method. Your Nostr public key is your account, and the site never asks for a private key. First successful sign-in creates your account automatically. You can change your username after you log in.';
    var tab = String(tabName || 'register');
    if (tab === 'phone') return base + ' Connect Nostr with the link or QR. Sign-in continues after pairing.';
    if (tab === 'manual') return base + ' Create a challenge, then paste the signed event JSON.';
    return base;
  }

  function recommendationPlatformLabel(tabName, flavor) {
    var tab = String(tabName || 'register');
    var key = String(flavor || '').trim();
    if (tab === 'phone' && key === 'android') return 'Android';
    if (tab === 'phone' && key === 'ios') return 'iPhone / iPad';
    if (tab === 'phone' && key === 'remote') return 'Remote signer';
    if (tab === 'manual') return 'Manual login';
    return 'Desktop';
  }

  function nostrLoginRecommendation(tabName, flavor) {
    var tab = String(tabName || 'register');
    var key = String(flavor || '').trim();
    var platformLabel = recommendationPlatformLabel(tab, key);
    var amberFDroid = { source: 'F-Droid', label: 'Download Amber', url: 'https://f-droid.org/packages/com.greenart7c3.nostrsigner/' };
    if (tab === 'phone' && key === 'ios') return recommendation(platformLabel + ' login', 'Recommended for iPhone and iPad Nostr Connect login.', [{ iconKey: 'nostr-connect', name: 'Nostr Connect-compatible signer', platformLabel: platformLabel, purpose: 'Login via Nostr', url: 'https://github.com/nostr-protocol/nips/blob/master/46.md', stores: [{ source: 'NIP-46', label: 'Protocol details', url: 'https://github.com/nostr-protocol/nips/blob/master/46.md' }] }]);
    if (tab === 'phone' && key === 'remote') return recommendation(platformLabel + ' login', 'Recommended for remote Nostr Connect signers.', [{ iconKey: 'nostr-connect', name: 'Nostr Connect remote signer', platformLabel: platformLabel, purpose: 'Login via Nostr', url: 'https://github.com/nostr-protocol/nips/blob/master/46.md', stores: [{ source: 'NIP-46', label: 'Protocol details', url: 'https://github.com/nostr-protocol/nips/blob/master/46.md' }] }]);
    if (tab === 'phone') return recommendation(platformLabel + ' login', 'Recommended for Android Nostr Connect login.', [{ iconKey: 'amber', name: 'Amber', platformLabel: platformLabel, purpose: 'Login via Nostr', url: 'https://github.com/greenart7c3/Amber', stores: [amberFDroid] }]);
    if (tab === 'manual') return recommendation(platformLabel, 'Fallback for signing the login challenge outside this page.', [{ iconKey: 'signed-challenge', name: 'Signed challenge', platformLabel: 'Any platform', purpose: 'Login via Nostr', url: 'https://github.com/nostr-protocol/nips/blob/master/98.md', stores: [{ source: 'NIP-98', label: 'Protocol details', url: 'https://github.com/nostr-protocol/nips/blob/master/98.md' }] }]);
    return recommendation(platformLabel + ' login', 'Recommended for desktop browser sign-in.', [{ iconKey: 'nos2x', name: 'nos2x-fox', platformLabel: 'Desktop Firefox', purpose: 'Login via Nostr', url: 'https://addons.mozilla.org/en-US/firefox/addon/nos2x-fox/', stores: [{ source: 'Firefox Add-ons', label: 'Download nos2x-fox', url: 'https://addons.mozilla.org/en-US/firefox/addon/nos2x-fox/' }] }]);
  }

  function nostrZapRecommendation(tabName, flavor) {
    var tab = String(tabName || 'register');
    var key = String(flavor || '').trim();
    var platformLabel = recommendationPlatformLabel(tab, key);
    var amethystDownload = { source: 'GitHub', label: 'Download Amethyst', url: 'https://github.com/vitorpamplona/amethyst#installation' };
    var zeusDownload = { source: 'ZEUS', label: 'Download ZEUS', url: 'https://github.com/ZeusLN/zeus#app-store-links' };
    var auroraStore = { source: 'Aurora', label: 'Download Aurora Store', url: 'https://auroraoss.com/downloads/AuroraStore/' };
    if (tab === 'phone' && key === 'ios') return recommendation(platformLabel + ' zaps', 'Recommended for sending zaps from iPhone and iPad.', [
      { iconKey: 'damus', name: 'Damus', platformLabel: platformLabel, purpose: 'Zaps: Nostr client', url: 'https://damus.io/', stores: [{ source: 'App Store', label: 'Download Damus', url: 'https://apps.apple.com/us/app/damus/id1628663131' }] },
      { iconKey: 'nostur', name: 'Nostur', platformLabel: platformLabel, purpose: 'Zaps: Nostr client', url: 'https://nostur.com/', stores: [{ source: 'App Store', label: 'Download Nostur', url: 'https://nostur.com/appstore' }] },
      { iconKey: 'zeus', name: 'ZEUS', platformLabel: platformLabel, purpose: 'Zaps: Lightning wallet', url: 'https://github.com/ZeusLN/zeus#app-store-links', stores: [{ source: 'App Store', label: 'Download ZEUS', url: 'https://apps.apple.com/us/app/zeus-ln/id1456038895' }] }
    ]);
    if (tab === 'phone' && key === 'remote') return recommendation(platformLabel + ' zaps', 'Recommended when the signer is remote or the current platform is unknown.', [{ iconKey: 'zeus', name: 'ZEUS', platformLabel: 'Remote signer', purpose: 'Zaps: Lightning wallet', url: 'https://github.com/ZeusLN/zeus#app-store-links', stores: [zeusDownload, auroraStore] }]);
    if (tab === 'phone') return recommendation(platformLabel + ' zaps', 'Recommended for sending zaps from Android.', [
      { iconKey: 'amethyst', name: 'Amethyst', platformLabel: platformLabel, purpose: 'Zaps: Nostr client', url: 'https://github.com/vitorpamplona/amethyst#installation', stores: [amethystDownload, auroraStore] },
      { iconKey: 'zeus', name: 'ZEUS', platformLabel: platformLabel, purpose: 'Zaps: Lightning wallet', url: 'https://github.com/ZeusLN/zeus#app-store-links', stores: [zeusDownload, auroraStore] }
    ]);
    if (tab === 'manual') return recommendation('Manual login zaps', 'Zap recommendations are separate from manual login and can use any compatible wallet.', [{ iconKey: 'zeus', name: 'ZEUS', platformLabel: 'Any platform', purpose: 'Zaps: Lightning wallet', url: 'https://github.com/ZeusLN/zeus#app-store-links', stores: [zeusDownload, auroraStore] }]);
    return recommendation(platformLabel + ' zaps', 'Recommended for desktop or browser-based zap flows.', [{ iconKey: 'zeus', name: 'ZEUS', platformLabel: 'Desktop / web', purpose: 'Zaps: Lightning wallet', url: 'https://github.com/ZeusLN/zeus#app-store-links', stores: [zeusDownload, auroraStore] }]);
  }

  function recommendation(summary, note, apps) {
    return { summary: summary, note: note, apps: apps || [] };
  }

  function renderNostrRecommendations(options) {
    var opts = options && typeof options === 'object' ? options : {};
    renderRecommendationList(opts.loginSummary, opts.loginApps, opts.loginNote, nostrLoginRecommendation(opts.tab, opts.flavor), opts.iconAssets || {});
    renderRecommendationList(opts.zapSummary, opts.zapApps, opts.zapNote, nostrZapRecommendation(opts.tab, opts.flavor), opts.iconAssets || {});
  }

  function renderRecommendationList(summaryEl, appsEl, noteEl, recommendationData, iconAssets) {
    if (!summaryEl || !appsEl) return;
    summaryEl.textContent = recommendationData.summary || 'Install:';
    if (noteEl) noteEl.textContent = recommendationData.note || '';
    appsEl.innerHTML = '';
    recommendationData.apps.forEach(function (app) {
      var doc = appsEl.ownerDocument || document;
      var item = doc.createElement('li');
      var appLink = doc.createElement('a');
      var icon = doc.createElement('span');
      var label = doc.createElement('span');
      var name = doc.createElement('strong');
      var purpose = doc.createElement('span');
      var platform = doc.createElement('span');
      var stores = doc.createElement('span');
      appLink.className = 'auth-reco-app-link';
      appLink.href = app.url;
      appLink.target = '_blank';
      appLink.rel = 'noopener noreferrer';
      icon.className = 'auth-reco-app-icon';
      renderRecommendationIcon(icon, app, iconAssets);
      label.className = 'auth-reco-app-label';
      name.textContent = app.name;
      purpose.className = 'auth-reco-app-purpose';
      purpose.textContent = app.purpose || recommendationData.purpose || '';
      platform.className = 'auth-reco-platform';
      platform.textContent = app.platformLabel || recommendationData.platformLabel || '';
      label.appendChild(name);
      if (purpose.textContent) label.appendChild(purpose);
      if (platform.textContent) label.appendChild(platform);
      appLink.appendChild(icon);
      appLink.appendChild(label);
      stores.className = 'auth-reco-store-links';
      (app.stores || []).forEach(function (store, idx) {
        var link = doc.createElement('a');
        var source = String(store.source || '').trim();
        link.href = store.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = store.label;
        if (source) stores.appendChild(doc.createTextNode(source + ': '));
        stores.appendChild(link);
        if (idx < app.stores.length - 1) stores.appendChild(doc.createTextNode(' / '));
      });
      item.appendChild(appLink);
      item.appendChild(stores);
      appsEl.appendChild(item);
    });
  }

  function renderRecommendationIcon(icon, app, iconAssets) {
    var asset = iconAssets && iconAssets[app.iconKey] ? iconAssets[app.iconKey] : '';
    icon.textContent = '';
    if (asset) {
      var img = (icon.ownerDocument || document).createElement('img');
      img.className = 'auth-reco-app-img';
      img.src = asset;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      icon.appendChild(img);
      return;
    }
    icon.innerHTML = recommendationIconSvg(app.iconKey);
  }

  function recommendationIconSvg(iconKey) {
    var key = String(iconKey || '').trim();
    var icons = {
      'nostr-connect': '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7.5h10"></path><path d="M7 16.5h10"></path><circle cx="7" cy="7.5" r="2.3"></circle><circle cx="17" cy="16.5" r="2.3"></circle></svg>',
      'signed-challenge': '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.5 8.5 5 12l3.5 3.5"></path><path d="M15.5 8.5 19 12l-3.5 3.5"></path><path d="m13.5 7-3 10"></path></svg>',
      'fallback': '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3 20 10l-8 11-8-11z"></path><path d="M4 10h16"></path><path d="M8 10l4 11 4-11"></path><path d="M8 10l4-7 4 7"></path></svg>'
    };
    return icons[key] || icons.fallback;
  }

  return {
    NIP46_KIND: NIP46_KIND,
    DEFAULT_RETRY_DELAYS: DEFAULT_RETRY_DELAYS.slice(),
    normalizePubkeyHex: normalizePubkeyHex,
    bytesToHex: bytesToHex,
    hexToBytes: hexToBytes,
    randomHex: randomHex,
    buildNostrConnectUri: buildNostrConnectUri,
    extractConnectSecret: extractConnectSecret,
    isConnectAck: isConnectAck,
    createAuthEventTemplate: createAuthEventTemplate,
    withTimedOutRetry: withTimedOutRetry,
    createSessionStorageAdapter: createSessionStorageAdapter,
    createMemoryStorageAdapter: createMemoryStorageAdapter,
    createNip46Client: createNip46Client,
    getNip07Signer: getNip07Signer,
    bindSignerReturnRefresh: bindSignerReturnRefresh,
    nostrLoginDialogHtml: nostrLoginDialogHtml,
    ensureNostrLoginDialog: ensureNostrLoginDialog,
    signInHelperMessage: signInHelperMessage,
    recommendationPlatformLabel: recommendationPlatformLabel,
    nostrLoginRecommendation: nostrLoginRecommendation,
    nostrZapRecommendation: nostrZapRecommendation,
    renderNostrRecommendations: renderNostrRecommendations
  };
}));
