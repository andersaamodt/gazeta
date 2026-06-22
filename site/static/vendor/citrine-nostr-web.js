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
    bindSignerReturnRefresh: bindSignerReturnRefresh
  };
}));
