(function () {
  'use strict';

  var WIDGET_SELECTOR = '[data-video-chat]';
  var WIDGET_MOUNTED_ATTR = 'data-video-chat-mounted';
  var INSTANCE_COUNTER = { value: 0 };
  var INSTANCE_BY_ELEMENT = new WeakMap();

  function compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function toLower(value) {
    return compact(value).toLowerCase();
  }

  function toBool(value, fallback) {
    if (value === true || value === false) {
      return value;
    }
    var text = toLower(value);
    if (!text) {
      return !!fallback;
    }
    if (text === '1' || text === 'true' || text === 'yes' || text === 'on') {
      return true;
    }
    if (text === '0' || text === 'false' || text === 'no' || text === 'off') {
      return false;
    }
    return !!fallback;
  }

  function toInt(value, fallback, minValue, maxValue) {
    var parsed = parseInt(String(value || ''), 10);
    if (!isFinite(parsed)) {
      parsed = Number(fallback || 0);
    }
    if (!isFinite(parsed)) {
      parsed = 0;
    }
    if (isFinite(minValue) && parsed < minValue) {
      parsed = minValue;
    }
    if (isFinite(maxValue) && parsed > maxValue) {
      parsed = maxValue;
    }
    return parsed;
  }

  function shallowCopy(obj) {
    var out = {};
    var src = obj && typeof obj === 'object' ? obj : {};
    Object.keys(src).forEach(function (key) {
      out[key] = src[key];
    });
    return out;
  }

  function mergeObjects() {
    var out = {};
    var idx;
    for (idx = 0; idx < arguments.length; idx += 1) {
      var src = arguments[idx] && typeof arguments[idx] === 'object' ? arguments[idx] : {};
      Object.keys(src).forEach(function (key) {
        if (src[key] !== undefined) {
          out[key] = src[key];
        }
      });
    }
    return out;
  }

  function randomId(prefix) {
    var salt = Math.random().toString(36).slice(2, 10);
    var epoch = Date.now().toString(36);
    return String(prefix || 'id') + '-' + epoch + '-' + salt;
  }

  function safeJsonParse(raw, fallback) {
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return fallback;
    }
  }

  function slugifyRoom(value) {
    var text = toLower(value)
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!text) {
      text = randomId('room').replace(/^room-/, '').slice(0, 12);
    }
    return text;
  }

  function isGlobalFeatureEnabled() {
    if (window.__wizardryPlugins && typeof window.__wizardryPlugins === 'object') {
      if (window.__wizardryPlugins.video_chat === false) {
        return false;
      }
    }
    if (window.__wizardryVideoChatEnabled === false) {
      return false;
    }
    return true;
  }

  function isWsUrl(value) {
    var text = compact(value);
    return /^wss?:\/\//i.test(text);
  }

  function isHttpUrl(value) {
    var text = compact(value);
    return /^https?:\/\//i.test(text);
  }

  function resolveMaybeFunction(value) {
    if (typeof value === 'function') {
      return value;
    }
    var name = compact(value);
    if (!name) {
      return null;
    }
    var ref = window;
    var parts = name.split('.');
    var idx;
    for (idx = 0; idx < parts.length; idx += 1) {
      var key = parts[idx];
      if (!ref || typeof ref !== 'object' || !(key in ref)) {
        return null;
      }
      ref = ref[key];
    }
    return typeof ref === 'function' ? ref : null;
  }

  function parseIceServers(rawValue) {
    if (!rawValue) {
      return null;
    }
    var value = rawValue;
    if (typeof value === 'string') {
      value = safeJsonParse(value, null);
    }
    if (!Array.isArray(value)) {
      return null;
    }
    var out = value.map(function (entry) {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      var urls = entry.urls;
      if (!urls) {
        return null;
      }
      var normalized = {
        urls: urls
      };
      if (entry.username) {
        normalized.username = String(entry.username);
      }
      if (entry.credential) {
        normalized.credential = String(entry.credential);
      }
      return normalized;
    }).filter(Boolean);
    return out.length ? out : null;
  }

  function parseQueryParams(search) {
    var params;
    try {
      params = new URLSearchParams(String(search || ''));
    } catch (_err) {
      params = new URLSearchParams('');
    }
    function first(keys) {
      var i;
      for (i = 0; i < keys.length; i += 1) {
        var key = keys[i];
        var value = params.get(key);
        if (value !== null && compact(value)) {
          return String(value);
        }
      }
      return '';
    }
    var out = {};
    var room = first(['room', 'room_id', 'vroom', 'video_room']);
    if (room) {
      out.roomId = room;
    }
    var token = first(['token', 'room_token', 'vtoken']);
    if (token) {
      out.inviteToken = token;
    }
    var display = first(['display', 'display_name', 'name']);
    if (display) {
      out.displayName = display;
    }
    var signaling = first(['signaling_wss', 'signaling', 'signal']);
    if (signaling) {
      out.signalingEndpoint = signaling;
    }
    var janus = first(['janus_wss', 'janus']);
    if (janus) {
      out.janusEndpoint = janus;
    }
    var tokenEndpoint = first(['token_endpoint', 'tokenEndpoint']);
    if (tokenEndpoint) {
      out.tokenEndpoint = tokenEndpoint;
    }
    var participantLimit = first(['participant_limit', 'participants', 'max_participants']);
    if (participantLimit) {
      out.participantLimit = toInt(participantLimit, 6, 2, 24);
    }
    var maxParticipants = first(['max_tiles', 'max_participants', 'max']);
    if (maxParticipants) {
      out.maxParticipants = toInt(maxParticipants, 6, 1, 16);
    }
    var roomPolicy = first(['room_policy']);
    if (roomPolicy) {
      out.roomPolicy = roomPolicy;
    }
    var joinLink = first(['invite', 'join_link']);
    if (joinLink) {
      out.initialInviteLink = joinLink;
    }
    var featureEnabled = first(['video_chat_enabled', 'feature_enabled']);
    if (featureEnabled) {
      out.featureEnabled = toBool(featureEnabled, true);
    }
    return out;
  }

  function datasetOptions(el) {
    var json = safeJsonParse(el.getAttribute('data-video-chat-options'), {});
    var out = shallowCopy(json);
    function read(name) {
      return el.getAttribute(name);
    }
    var roomId = read('data-video-chat-room-id');
    if (roomId) {
      out.roomId = roomId;
    }
    var displayName = read('data-video-chat-display-name');
    if (displayName) {
      out.displayName = displayName;
    }
    var tokenEndpoint = read('data-video-chat-token-endpoint');
    if (tokenEndpoint) {
      out.tokenEndpoint = tokenEndpoint;
    }
    var janusEndpoint = read('data-video-chat-janus-endpoint');
    if (janusEndpoint) {
      out.janusEndpoint = janusEndpoint;
    }
    var signalingEndpoint = read('data-video-chat-signaling-endpoint');
    if (signalingEndpoint) {
      out.signalingEndpoint = signalingEndpoint;
    }
    var roomPolicy = read('data-video-chat-room-policy');
    if (roomPolicy) {
      out.roomPolicy = roomPolicy;
    }
    var inviteToken = read('data-video-chat-token');
    if (inviteToken) {
      out.inviteToken = inviteToken;
    }
    var inviteBase = read('data-video-chat-invite-base-url');
    if (inviteBase) {
      out.inviteBaseUrl = inviteBase;
    }
    var participantLimit = read('data-video-chat-participant-limit');
    if (participantLimit) {
      out.participantLimit = toInt(participantLimit, 6, 2, 24);
    }
    var maxParticipants = read('data-video-chat-max-participants');
    if (maxParticipants) {
      out.maxParticipants = toInt(maxParticipants, 6, 1, 16);
    }
    var allowJoin = read('data-video-chat-allow-join-link');
    if (allowJoin) {
      out.allowJoinViaLink = toBool(allowJoin, true);
    }
    var includeToken = read('data-video-chat-include-token-in-invite');
    if (includeToken) {
      out.includeTokenInInvite = toBool(includeToken, false);
    }
    var featureEnabled = read('data-video-chat-feature-enabled');
    if (featureEnabled) {
      out.featureEnabled = toBool(featureEnabled, true);
    }
    var metricsCallback = read('data-video-chat-metrics-callback');
    if (metricsCallback) {
      out.metricsCallback = metricsCallback;
    }
    var rawIce = read('data-video-chat-ice-servers');
    if (rawIce) {
      out.iceServers = parseIceServers(rawIce);
    }
    return out;
  }

  function normalizeOptions(raw) {
    var query = parseQueryParams(window.location.search || '');
    var defaults = {
      featureEnabled: true,
      tokenEndpoint: '/cgi/blog-video-chat-token',
      janusEndpoint: '',
      signalingEndpoint: '',
      roomId: '',
      inviteToken: '',
      inviteBaseUrl: '',
      displayName: 'Guest',
      participantLimit: 6,
      maxParticipants: 6,
      roomPolicy: 'open',
      allowJoinViaLink: true,
      includeTokenInInvite: false,
      reconnectBaseDelayMs: 1200,
      reconnectMaxAttempts: 8,
      autoMount: true,
      readQueryParams: true,
      mediaConstraints: { audio: true, video: true },
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ],
      metricsCallback: null,
      onMetric: null,
      onJoin: null,
      onLeave: null,
      onError: null,
      debug: false
    };
    var user = raw && typeof raw === 'object' ? raw : {};
    var merged = mergeObjects(defaults, defaults.readQueryParams === false ? {} : query, user);
    merged.featureEnabled = toBool(merged.featureEnabled, true);
    merged.allowJoinViaLink = toBool(merged.allowJoinViaLink, true);
    merged.includeTokenInInvite = toBool(merged.includeTokenInInvite, false);
    merged.readQueryParams = toBool(merged.readQueryParams, true);
    merged.autoMount = toBool(merged.autoMount, true);
    merged.participantLimit = toInt(merged.participantLimit, 6, 2, 24);
    merged.maxParticipants = toInt(merged.maxParticipants, merged.participantLimit, 1, 16);
    merged.reconnectBaseDelayMs = toInt(merged.reconnectBaseDelayMs, 1200, 250, 30000);
    merged.reconnectMaxAttempts = toInt(merged.reconnectMaxAttempts, 8, 1, 100);
    merged.roomPolicy = toLower(merged.roomPolicy || 'open');
    merged.roomId = slugifyRoom(merged.roomId || '');
    merged.displayName = compact(merged.displayName || 'Guest') || 'Guest';
    merged.tokenEndpoint = compact(merged.tokenEndpoint || '/cgi/blog-video-chat-token');
    merged.janusEndpoint = compact(merged.janusEndpoint || '');
    merged.signalingEndpoint = compact(merged.signalingEndpoint || '');
    merged.inviteToken = compact(merged.inviteToken || '');
    merged.inviteBaseUrl = compact(merged.inviteBaseUrl || '');
    merged.initialInviteLink = compact(merged.initialInviteLink || '');
    merged.metricsCallback = resolveMaybeFunction(merged.metricsCallback);
    merged.onMetric = resolveMaybeFunction(merged.onMetric) || null;
    merged.onJoin = resolveMaybeFunction(merged.onJoin) || null;
    merged.onLeave = resolveMaybeFunction(merged.onLeave) || null;
    merged.onError = resolveMaybeFunction(merged.onError) || null;

    var parsedIce = parseIceServers(merged.iceServers);
    if (parsedIce) {
      merged.iceServers = parsedIce;
    } else {
      merged.iceServers = defaults.iceServers;
    }

    return merged;
  }

  function resolveTarget(target) {
    if (!target) {
      return null;
    }
    if (target instanceof HTMLElement) {
      return target;
    }
    if (typeof target === 'string') {
      return document.querySelector(target);
    }
    return null;
  }

  function makeWidgetError(code, message) {
    var err = new Error(message || 'Video chat error');
    err.code = code || 'video_chat_error';
    return err;
  }

  function roomHashToNumber(roomId) {
    var text = String(roomId || 'room');
    if (/^[0-9]+$/.test(text)) {
      return toInt(text, 0, 1, 2147483646);
    }
    var hash = 2166136261;
    var i;
    for (i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    var normalized = Math.abs(hash >>> 0);
    return (normalized % 2147483000) + 1000;
  }

  function JanusTransport(options) {
    this.url = String((options && options.url) || '');
    this.token = String((options && options.token) || '');
    this.apiSecret = String((options && options.apiSecret) || '');
    this.onDisconnect = typeof (options && options.onDisconnect) === 'function' ? options.onDisconnect : null;
    this.onRawMessage = typeof (options && options.onRawMessage) === 'function' ? options.onRawMessage : null;
    this.ws = null;
    this.sessionId = 0;
    this.keepaliveTimer = 0;
    this.closedByClient = false;
    this.transactions = Object.create(null);
    this.handleListeners = Object.create(null);
  }

  JanusTransport.prototype.connect = function () {
    var self = this;
    if (!isWsUrl(self.url)) {
      return Promise.reject(makeWidgetError('invalid_janus_url', 'Invalid Janus WSS endpoint.'));
    }
    if (self.ws && (self.ws.readyState === WebSocket.OPEN || self.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }
    self.closedByClient = false;
    return new Promise(function (resolve, reject) {
      var opened = false;
      var ws;
      try {
        ws = new WebSocket(self.url);
      } catch (err) {
        reject(makeWidgetError('janus_connect_failed', err && err.message ? err.message : 'Could not open Janus WebSocket.'));
        return;
      }
      self.ws = ws;
      ws.addEventListener('open', function () {
        opened = true;
        resolve();
      });
      ws.addEventListener('message', function (evt) {
        self._handleRaw(evt && evt.data ? evt.data : '');
      });
      ws.addEventListener('close', function () {
        self._rejectAllTransactions(makeWidgetError('janus_disconnected', 'Janus WebSocket closed.'));
        self._clearKeepalive();
        if (!self.closedByClient && typeof self.onDisconnect === 'function') {
          self.onDisconnect();
        }
      });
      ws.addEventListener('error', function () {
        if (!opened) {
          reject(makeWidgetError('janus_connect_failed', 'Could not connect to Janus over WSS.'));
        }
      });
    });
  };

  JanusTransport.prototype._clearKeepalive = function () {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = 0;
    }
  };

  JanusTransport.prototype._startKeepalive = function () {
    var self = this;
    self._clearKeepalive();
    self.keepaliveTimer = setInterval(function () {
      if (!self.ws || self.ws.readyState !== WebSocket.OPEN || !self.sessionId) {
        return;
      }
      self.send({ janus: 'keepalive' }, false).catch(function () {
        // Ignore keepalive write failures.
      });
    }, 25000);
  };

  JanusTransport.prototype._nextTransaction = function () {
    return randomId('janus-tx');
  };

  JanusTransport.prototype._rejectAllTransactions = function (error) {
    var self = this;
    Object.keys(self.transactions).forEach(function (tx) {
      var pending = self.transactions[tx];
      if (pending && pending.timeout) {
        clearTimeout(pending.timeout);
      }
      if (pending && typeof pending.reject === 'function') {
        pending.reject(error);
      }
      delete self.transactions[tx];
    });
  };

  JanusTransport.prototype._handleRaw = function (raw) {
    var self = this;
    if (typeof self.onRawMessage === 'function') {
      self.onRawMessage(raw);
    }
    var parsed;
    try {
      parsed = JSON.parse(String(raw || ''));
    } catch (_err) {
      return;
    }
    if (Array.isArray(parsed)) {
      parsed.forEach(function (item) {
        self._handleMessage(item);
      });
      return;
    }
    self._handleMessage(parsed);
  };

  JanusTransport.prototype._handleMessage = function (msg) {
    if (!msg || typeof msg !== 'object') {
      return;
    }
    var tx = msg.transaction ? String(msg.transaction) : '';
    if (tx && this.transactions[tx]) {
      if (msg.janus === 'ack') {
        return;
      }
      var pending = this.transactions[tx];
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      delete this.transactions[tx];
      if (msg.janus === 'error') {
        var reason = (msg.error && msg.error.reason) ? String(msg.error.reason) : 'Janus request failed.';
        pending.reject(makeWidgetError('janus_request_failed', reason));
      } else {
        pending.resolve(msg);
      }
    }

    var handleId = Number(msg.sender || msg.handle_id || 0);
    if (handleId && this.handleListeners[handleId]) {
      this.handleListeners[handleId](msg);
    }
  };

  JanusTransport.prototype.setHandleListener = function (handleId, listener) {
    var id = Number(handleId || 0);
    if (!id) {
      return;
    }
    if (typeof listener === 'function') {
      this.handleListeners[id] = listener;
      return;
    }
    delete this.handleListeners[id];
  };

  JanusTransport.prototype.send = function (payload, expectResponse) {
    var self = this;
    var responseExpected = expectResponse !== false;
    if (!self.ws || self.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(makeWidgetError('janus_not_connected', 'Janus socket is not connected.'));
    }
    var body = shallowCopy(payload || {});
    var janusVerb = String(body.janus || '').toLowerCase();
    if (!janusVerb) {
      return Promise.reject(makeWidgetError('janus_invalid_payload', 'Missing Janus verb.'));
    }
    if (!body.transaction) {
      body.transaction = self._nextTransaction();
    }
    if (self.sessionId && !body.session_id && janusVerb !== 'create') {
      body.session_id = self.sessionId;
    }
    if (self.token && !body.token) {
      body.token = self.token;
    }
    if (self.apiSecret && !body.apisecret) {
      body.apisecret = self.apiSecret;
    }

    var wire = JSON.stringify(body);
    try {
      self.ws.send(wire);
    } catch (err) {
      return Promise.reject(makeWidgetError('janus_write_failed', err && err.message ? err.message : 'Failed to send Janus message.'));
    }

    if (!responseExpected) {
      return Promise.resolve(null);
    }

    return new Promise(function (resolve, reject) {
      var timeout = setTimeout(function () {
        delete self.transactions[body.transaction];
        reject(makeWidgetError('janus_timeout', 'Janus request timed out.'));
      }, 20000);
      self.transactions[body.transaction] = {
        resolve: resolve,
        reject: reject,
        timeout: timeout
      };
    });
  };

  JanusTransport.prototype.createSession = function () {
    var self = this;
    return self.send({ janus: 'create' }, true).then(function (msg) {
      var id = Number(msg && msg.data && msg.data.id);
      if (!id) {
        throw makeWidgetError('janus_create_failed', 'Janus did not return a session id.');
      }
      self.sessionId = id;
      self._startKeepalive();
      return id;
    });
  };

  JanusTransport.prototype.attachPlugin = function (pluginName) {
    var plugin = compact(pluginName);
    if (!plugin) {
      return Promise.reject(makeWidgetError('janus_invalid_plugin', 'Missing plugin name.'));
    }
    return this.send({ janus: 'attach', plugin: plugin }, true).then(function (msg) {
      var id = Number(msg && msg.data && msg.data.id);
      if (!id) {
        throw makeWidgetError('janus_attach_failed', 'Janus did not return a plugin handle id.');
      }
      return id;
    });
  };

  JanusTransport.prototype.pluginMessage = function (handleId, body, jsep) {
    var payload = {
      janus: 'message',
      handle_id: Number(handleId || 0),
      body: body && typeof body === 'object' ? body : {}
    };
    if (jsep && typeof jsep === 'object') {
      payload.jsep = jsep;
    }
    return this.send(payload, true);
  };

  JanusTransport.prototype.trickle = function (handleId, candidate) {
    var payload = {
      janus: 'trickle',
      handle_id: Number(handleId || 0),
      candidate: candidate && typeof candidate === 'object' ? candidate : { completed: true }
    };
    return this.send(payload, false);
  };

  JanusTransport.prototype.detachHandle = function (handleId) {
    var id = Number(handleId || 0);
    if (!id) {
      return Promise.resolve(false);
    }
    delete this.handleListeners[id];
    return this.send({ janus: 'detach', handle_id: id }, false).catch(function () {
      return false;
    });
  };

  JanusTransport.prototype.destroy = function () {
    var self = this;
    self.closedByClient = true;
    self._clearKeepalive();
    var closeTasks = [];
    Object.keys(self.handleListeners).forEach(function (key) {
      closeTasks.push(self.detachHandle(Number(key)));
    });
    if (self.sessionId) {
      closeTasks.push(self.send({ janus: 'destroy' }, false).catch(function () {
        return false;
      }));
    }
    return Promise.all(closeTasks).then(function () {
      if (self.ws) {
        try {
          self.ws.close();
        } catch (_err) {
          // Ignore websocket close errors.
        }
      }
      self.ws = null;
      self.sessionId = 0;
      self.handleListeners = Object.create(null);
      self._rejectAllTransactions(makeWidgetError('janus_closed', 'Janus session closed.'));
      return true;
    });
  };

  function VideoChatWidget(target, rawOptions) {
    this.target = target;
    this.instanceId = String(++INSTANCE_COUNTER.value);

    var merged = normalizeOptions(rawOptions || {});
    this.options = merged;

    this.shadowRoot = target.shadowRoot || target.attachShadow({ mode: 'open' });
    this.nodes = null;

    this.janus = null;
    this.janusPublisherHandle = 0;
    this.signalingWs = null;
    this.signalingReconnectTimer = 0;

    this.state = {
      joining: false,
      joined: false,
      leaving: false,
      featureDisabled: false,
      roomFull: false,
      roomId: merged.roomId,
      roomNumeric: roomHashToNumber(merged.roomId),
      inviteToken: merged.inviteToken,
      capabilityToken: '',
      tokenExpiresAt: 0,
      participantLimit: merged.participantLimit,
      privateId: 0,
      ownFeedId: 0,
      localStream: null,
      publisherPc: null,
      subscribersByFeed: Object.create(null),
      subscribersByHandle: Object.create(null),
      reconnectAttempts: 0,
      reconnectTimer: 0,
      iceRestartTimer: 0,
      online: navigator.onLine !== false,
      hasSeenRelayCandidate: false,
      micEnabled: true,
      cameraEnabled: true,
      prefilledInviteLink: merged.initialInviteLink || ''
    };

    this.boundOnOnline = this._handleOnline.bind(this);
    this.boundOnOffline = this._handleOffline.bind(this);

    this._render();
    this._bindUi();
    this._syncFeatureFlag();

    if (!this.state.featureDisabled && this.state.prefilledInviteLink && this.nodes.inviteInput) {
      this.nodes.inviteInput.value = this.state.prefilledInviteLink;
    }
    if (!this.state.featureDisabled && this.nodes.roomInput && this.state.roomId) {
      this.nodes.roomInput.value = this.state.roomId;
    }

    window.addEventListener('online', this.boundOnOnline);
    window.addEventListener('offline', this.boundOnOffline);

    target.setAttribute(WIDGET_MOUNTED_ATTR, this.instanceId);
  }

  VideoChatWidget.prototype._render = function () {
    var showJoinByLink = this.options.allowJoinViaLink !== false;
    var style = ''
      + '.vcw-shell{font-family:Georgia,\'Times New Roman\',serif;color:#1f1a14;background:rgba(255,255,255,0.18);border:1px solid rgba(96,70,32,0.28);border-radius:14px;padding:12px;max-width:100%;box-sizing:border-box;}'
      + '.vcw-status{font-size:0.9rem;line-height:1.35;min-height:1.2em;margin-bottom:10px;color:#5d4a2f;}'
      + '.vcw-status[data-tone="error"]{color:#8b1f1f;}'
      + '.vcw-status[data-tone="ok"]{color:#256041;}'
      + '.vcw-status[data-tone="warn"]{color:#7a5c14;}'
      + '.vcw-precall,.vcw-call{display:flex;flex-direction:column;gap:10px;}'
      + '.vcw-precall[hidden],.vcw-call[hidden],.vcw-fullroom[hidden]{display:none;}'
      + '.vcw-fullroom{padding:12px;border-radius:10px;background:rgba(180,42,42,0.08);border:1px solid rgba(180,42,42,0.28);color:#7f2323;font-size:0.95rem;}'
      + '.vcw-label{display:flex;flex-direction:column;gap:4px;font-size:0.88rem;color:#4f4537;}'
      + '.vcw-input{appearance:none;border:1px solid rgba(96,70,32,0.35);border-radius:9px;padding:8px 10px;font:inherit;font-size:0.95rem;background:rgba(255,255,255,0.84);color:#1f1a14;max-width:100%;box-sizing:border-box;}'
      + '.vcw-input:focus{outline:2px solid rgba(59,102,203,0.35);outline-offset:1px;border-color:rgba(59,102,203,0.72);}'
      + '.vcw-precall-actions,.vcw-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}'
      + '.vcw-btn{appearance:none;border:1px solid rgba(96,70,32,0.42);background:rgba(246,237,219,0.93);color:#2b2417;border-radius:999px;padding:7px 11px;cursor:pointer;font:inherit;font-size:0.92rem;line-height:1;display:inline-flex;align-items:center;gap:6px;}'
      + '.vcw-btn:hover{background:rgba(247,241,229,0.98);}'
      + '.vcw-btn:disabled{opacity:0.55;cursor:default;}'
      + '.vcw-btn.vcw-btn-primary{background:#2f63be;color:#fff;border-color:#2b56a4;}'
      + '.vcw-btn.vcw-btn-primary:hover{background:#345fc2;}'
      + '.vcw-btn .vcw-icon{display:inline-block;width:14px;height:14px;stroke:currentColor;stroke-width:1.9;fill:none;}'
      + '.vcw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;align-items:stretch;}'
      + '.vcw-tile{position:relative;overflow:hidden;border:1px solid rgba(96,70,32,0.26);border-radius:11px;background:rgba(23,24,29,0.84);min-height:120px;display:flex;align-items:center;justify-content:center;}'
      + '.vcw-tile video{width:100%;height:100%;object-fit:cover;display:block;background:#17181d;min-height:120px;}'
      + '.vcw-tile-label{position:absolute;left:6px;bottom:6px;display:inline-block;font-size:0.78rem;line-height:1;padding:3px 7px;border-radius:999px;background:rgba(245,234,212,0.92);color:#2b2417;}'
      + '.vcw-call-help{margin:0;font-size:0.84rem;color:#5a4935;}'
      + '.vcw-precall-help{margin:0;font-size:0.82rem;color:#6f5b42;}'
      + '.vcw-join-row[hidden]{display:none;}'
      + '@media (max-width:560px){.vcw-shell{padding:10px}.vcw-btn{padding:8px 12px}.vcw-grid{grid-template-columns:repeat(auto-fit,minmax(126px,1fr));}}';

    var joinRowHidden = showJoinByLink ? '' : ' hidden';

    this.shadowRoot.innerHTML = ''
      + '<style>' + style + '</style>'
      + '<section class="vcw-shell" part="container">'
      + '  <div class="vcw-status" data-tone="info" role="status" aria-live="polite"></div>'
      + '  <section class="vcw-precall" part="precall">'
      + '    <label class="vcw-label">Room ID<input class="vcw-input vcw-room-input" type="text" autocomplete="off" placeholder="room-id"></label>'
      + '    <div class="vcw-join-row"' + joinRowHidden + '>'
      + '      <label class="vcw-label">Invite Link<input class="vcw-input vcw-invite-input" type="text" autocomplete="off" placeholder="https://example.com/contact?room=..."></label>'
      + '    </div>'
      + '    <div class="vcw-precall-actions">'
      + '      <button type="button" class="vcw-btn vcw-btn-primary vcw-start-btn">Start Call</button>'
      + (showJoinByLink ? '<button type="button" class="vcw-btn vcw-join-link-btn">Join via Link</button>' : '')
      + '    </div>'
      + '    <p class="vcw-precall-help">Media access starts only after you click a call button.</p>'
      + '  </section>'
      + '  <section class="vcw-fullroom" hidden></section>'
      + '  <section class="vcw-call" part="call" hidden>'
      + '    <div class="vcw-toolbar">'
      + '      <button type="button" class="vcw-btn vcw-mic-btn" aria-pressed="true" title="Mute or unmute microphone">'
      + '        <svg class="vcw-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V7a3 3 0 0 0-3-3Z"></path><path d="M5 11v1a7 7 0 0 0 14 0v-1"></path><path d="M12 19v3"></path></svg>'
      + '        Mic'
      + '      </button>'
      + '      <button type="button" class="vcw-btn vcw-camera-btn" aria-pressed="true" title="Turn camera on or off">'
      + '        <svg class="vcw-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"></path><path d="m16 10 6-3v10l-6-3"></path></svg>'
      + '        Camera'
      + '      </button>'
      + '      <button type="button" class="vcw-btn vcw-copy-btn" title="Copy invite link">'
      + '        <svg class="vcw-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="13" rx="2"></rect><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
      + '        Copy invite'
      + '      </button>'
      + '      <button type="button" class="vcw-btn vcw-leave-btn" title="Leave call">'
      + '        <svg class="vcw-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7 5 12l5 5"></path><path d="M5 12h11"></path><path d="M15 5h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4"></path></svg>'
      + '        Leave'
      + '      </button>'
      + '    </div>'
      + '    <div class="vcw-grid" part="grid"></div>'
      + '    <p class="vcw-call-help">Up to ' + String(this.options.maxParticipants) + ' participants displayed.</p>'
      + '  </section>'
      + '</section>';

    this.nodes = {
      status: this.shadowRoot.querySelector('.vcw-status'),
      preCall: this.shadowRoot.querySelector('.vcw-precall'),
      fullRoom: this.shadowRoot.querySelector('.vcw-fullroom'),
      call: this.shadowRoot.querySelector('.vcw-call'),
      roomInput: this.shadowRoot.querySelector('.vcw-room-input'),
      inviteInput: this.shadowRoot.querySelector('.vcw-invite-input'),
      startBtn: this.shadowRoot.querySelector('.vcw-start-btn'),
      joinViaLinkBtn: this.shadowRoot.querySelector('.vcw-join-link-btn'),
      micBtn: this.shadowRoot.querySelector('.vcw-mic-btn'),
      cameraBtn: this.shadowRoot.querySelector('.vcw-camera-btn'),
      leaveBtn: this.shadowRoot.querySelector('.vcw-leave-btn'),
      copyBtn: this.shadowRoot.querySelector('.vcw-copy-btn'),
      grid: this.shadowRoot.querySelector('.vcw-grid')
    };
  };

  VideoChatWidget.prototype._bindUi = function () {
    var self = this;
    if (self.nodes.startBtn) {
      self.nodes.startBtn.addEventListener('click', function () {
        self.startCall().catch(function () {
          // Errors are already surfaced in UI.
        });
      });
    }
    if (self.nodes.joinViaLinkBtn) {
      self.nodes.joinViaLinkBtn.addEventListener('click', function () {
        self.joinViaInvite().catch(function () {
          // Errors are already surfaced in UI.
        });
      });
    }
    if (self.nodes.micBtn) {
      self.nodes.micBtn.addEventListener('click', function () {
        self.toggleMic();
      });
    }
    if (self.nodes.cameraBtn) {
      self.nodes.cameraBtn.addEventListener('click', function () {
        self.toggleCamera();
      });
    }
    if (self.nodes.leaveBtn) {
      self.nodes.leaveBtn.addEventListener('click', function () {
        self.leaveCall('user').catch(function () {
          // Ignore leave errors.
        });
      });
    }
    if (self.nodes.copyBtn) {
      self.nodes.copyBtn.addEventListener('click', function () {
        self.copyInviteLink();
      });
    }
  };

  VideoChatWidget.prototype._setStatus = function (message, tone) {
    if (!this.nodes || !this.nodes.status) {
      return;
    }
    this.nodes.status.textContent = String(message || '');
    this.nodes.status.setAttribute('data-tone', tone || 'info');
  };

  VideoChatWidget.prototype._syncFeatureFlag = function () {
    var enabled = this.options.featureEnabled !== false && isGlobalFeatureEnabled();
    this.state.featureDisabled = !enabled;
    if (!enabled) {
      this._setStatus('Video calling is currently disabled for this site.', 'warn');
      if (this.nodes.startBtn) {
        this.nodes.startBtn.disabled = true;
      }
      if (this.nodes.joinViaLinkBtn) {
        this.nodes.joinViaLinkBtn.disabled = true;
      }
      return;
    }
    this._setStatus('Ready. Choose a room and start when you are ready.', 'info');
  };

  VideoChatWidget.prototype._setJoinUiBusy = function (busy) {
    if (this.nodes.startBtn) {
      this.nodes.startBtn.disabled = !!busy || this.state.featureDisabled;
      this.nodes.startBtn.textContent = busy ? 'Connecting...' : 'Start Call';
    }
    if (this.nodes.joinViaLinkBtn) {
      this.nodes.joinViaLinkBtn.disabled = !!busy || this.state.featureDisabled;
    }
    if (this.nodes.roomInput) {
      this.nodes.roomInput.disabled = !!busy;
    }
    if (this.nodes.inviteInput) {
      this.nodes.inviteInput.disabled = !!busy;
    }
  };

  VideoChatWidget.prototype._emitLifecycle = function (name, detail) {
    var callback = null;
    if (name === 'join') {
      callback = this.options.onJoin;
    } else if (name === 'leave') {
      callback = this.options.onLeave;
    } else if (name === 'error') {
      callback = this.options.onError;
    }
    if (typeof callback === 'function') {
      try {
        callback(detail || {});
      } catch (_err) {
        // Ignore callback exceptions.
      }
    }
    try {
      this.target.dispatchEvent(new CustomEvent('videochat:' + name, {
        detail: detail || {}
      }));
    } catch (_err2) {
      // Ignore dispatch issues in restrictive environments.
    }
  };

  VideoChatWidget.prototype._emitMetric = function (name, payload) {
    var detail = mergeObjects({
      metric: String(name || ''),
      roomId: this.state.roomId || '',
      ts: Date.now()
    }, payload || {});
    if (typeof this.options.onMetric === 'function') {
      try {
        this.options.onMetric(detail);
      } catch (_err) {
        // Ignore callback exceptions.
      }
    }
    if (typeof this.options.metricsCallback === 'function') {
      try {
        this.options.metricsCallback(detail);
      } catch (_err2) {
        // Ignore callback exceptions.
      }
    }
  };

  VideoChatWidget.prototype._parseInviteLink = function (raw) {
    var value = compact(raw || '');
    if (!value) {
      return null;
    }
    try {
      var parsed = new URL(value, window.location.origin);
      var query = parseQueryParams(parsed.search || '');
      var roomId = slugifyRoom(query.roomId || '');
      return {
        roomId: roomId,
        token: compact(query.inviteToken || ''),
        displayName: compact(query.displayName || ''),
        raw: parsed.toString()
      };
    } catch (_err) {
      return null;
    }
  };

  VideoChatWidget.prototype._ensureRoomId = function () {
    var roomText = '';
    if (this.nodes && this.nodes.roomInput) {
      roomText = compact(this.nodes.roomInput.value || '');
    }
    if (!roomText && this.state.roomId) {
      roomText = this.state.roomId;
    }
    roomText = slugifyRoom(roomText || '');
    this.state.roomId = roomText;
    this.state.roomNumeric = roomHashToNumber(roomText);
    if (this.nodes && this.nodes.roomInput) {
      this.nodes.roomInput.value = roomText;
    }
    return roomText;
  };

  VideoChatWidget.prototype._fetchCapabilityToken = function (roomId, inviteToken) {
    var self = this;
    if (!self.options.tokenEndpoint) {
      return Promise.reject(makeWidgetError('missing_token_endpoint', 'Missing capability token endpoint.'));
    }
    var body = new URLSearchParams();
    body.set('room_id', roomId);
    body.set('room', roomId);
    body.set('client_id', randomId('vcw-client'));
    if (inviteToken) {
      body.set('provided_token', inviteToken);
    }
    return fetch(self.options.tokenEndpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: body.toString()
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = safeJsonParse(text, null);
        if (!res.ok || !data || data.success !== true) {
          var msg = data && data.error ? String(data.error) : ('Token request failed (' + String(res.status) + ').');
          throw makeWidgetError('token_request_failed', msg);
        }
        return data;
      });
    }).then(function (data) {
      self.state.capabilityToken = compact(data.token || '');
      self.state.tokenExpiresAt = toInt(data.expires_at, 0, 0, Number.MAX_SAFE_INTEGER);
      self.state.participantLimit = toInt(data.participant_limit, self.options.participantLimit, 2, 24);
      if (isWsUrl(data.janus_wss || '')) {
        self.options.janusEndpoint = String(data.janus_wss);
      }
      if (isWsUrl(data.signaling_wss || '')) {
        self.options.signalingEndpoint = String(data.signaling_wss);
      }
      return data;
    });
  };

  VideoChatWidget.prototype._connectSignaling = function () {
    var self = this;
    if (!isWsUrl(self.options.signalingEndpoint || '')) {
      return Promise.resolve(false);
    }
    if (self.signalingWs && (self.signalingWs.readyState === WebSocket.OPEN || self.signalingWs.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      var opened = false;
      var ws;
      try {
        ws = new WebSocket(self.options.signalingEndpoint);
      } catch (_err) {
        resolve(false);
        return;
      }
      self.signalingWs = ws;
      ws.addEventListener('open', function () {
        opened = true;
        self._sendSignaling({
          type: 'join',
          room_id: self.state.roomId,
          token: self.state.capabilityToken,
          participant_limit: self.state.participantLimit
        });
        resolve(true);
      });
      ws.addEventListener('message', function (evt) {
        self._handleSignalingMessage(evt && evt.data ? evt.data : '');
      });
      ws.addEventListener('close', function () {
        if (!self.state.leaving && self.state.joined) {
          self._scheduleSignalingReconnect();
        }
      });
      ws.addEventListener('error', function () {
        if (!opened) {
          resolve(false);
        }
      });
    });
  };

  VideoChatWidget.prototype._sendSignaling = function (payload) {
    if (!this.signalingWs || this.signalingWs.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      this.signalingWs.send(JSON.stringify(payload || {}));
    } catch (_err) {
      // Ignore signaling write failures.
    }
  };

  VideoChatWidget.prototype._handleSignalingMessage = function (raw) {
    var msg = safeJsonParse(raw, null);
    if (!msg || typeof msg !== 'object') {
      return;
    }
    if (msg.type === 'room_full' || msg.full === true) {
      this.state.roomFull = true;
      this._showRoomFull('Room is full right now.');
      if (this.state.joined || this.state.joining) {
        this.leaveCall('room_full').catch(function () {
          // Ignore leave errors.
        });
      }
      return;
    }
    if (msg.type === 'participants' && isFinite(Number(msg.count))) {
      this._setStatus('Participants in room: ' + String(Number(msg.count)), 'info');
      return;
    }
    if (msg.type === 'error' && msg.message) {
      this._setStatus(String(msg.message), 'warn');
    }
  };

  VideoChatWidget.prototype._scheduleSignalingReconnect = function () {
    var self = this;
    if (self.signalingReconnectTimer || !isWsUrl(self.options.signalingEndpoint || '')) {
      return;
    }
    self.signalingReconnectTimer = setTimeout(function () {
      self.signalingReconnectTimer = 0;
      if (!self.state.joined || self.state.leaving) {
        return;
      }
      self._connectSignaling().catch(function () {
        self._scheduleSignalingReconnect();
      });
    }, 1600);
  };

  VideoChatWidget.prototype._clearSignaling = function () {
    if (this.signalingReconnectTimer) {
      clearTimeout(this.signalingReconnectTimer);
      this.signalingReconnectTimer = 0;
    }
    if (this.signalingWs) {
      try {
        this.signalingWs.close();
      } catch (_err) {
        // Ignore close failures.
      }
    }
    this.signalingWs = null;
  };

  VideoChatWidget.prototype._ensureJanus = function () {
    var self = this;
    if (!isWsUrl(self.options.janusEndpoint || '')) {
      return Promise.reject(makeWidgetError('missing_janus_endpoint', 'Missing Janus WSS endpoint.'));
    }
    if (self.janus) {
      return Promise.resolve(self.janus);
    }
    self.janus = new JanusTransport({
      url: self.options.janusEndpoint,
      token: self.state.capabilityToken,
      onDisconnect: function () {
        self._handleJanusDisconnect();
      }
    });
    return self.janus.connect()
      .then(function () {
        return self.janus.createSession();
      })
      .then(function () {
        return self.janus;
      });
  };

  VideoChatWidget.prototype._ensureRoomReady = function () {
    var self = this;
    var roomNumber = self.state.roomNumeric;
    var publisherHandle = self.janusPublisherHandle;

    function extractData(msg) {
      return (msg && msg.plugindata && msg.plugindata.data) ? msg.plugindata.data : {};
    }

    return self.janus.pluginMessage(publisherHandle, {
      request: 'exists',
      room: roomNumber
    }).then(function (msg) {
      var data = extractData(msg);
      if (data.exists === true) {
        return true;
      }
      if (self.options.roomPolicy === 'strict') {
        throw makeWidgetError('missing_room', 'Room does not exist.');
      }
      return self.janus.pluginMessage(publisherHandle, {
        request: 'create',
        room: roomNumber,
        description: self.state.roomId,
        publishers: self.state.participantLimit,
        permanent: false,
        notify_joining: true
      }).then(function () {
        return true;
      }).catch(function (err) {
        // If room already exists between exists/create race, continue.
        if (err && /already exists/i.test(String(err.message || ''))) {
          return true;
        }
        throw err;
      });
    }).then(function () {
      return self.janus.pluginMessage(publisherHandle, {
        request: 'listparticipants',
        room: roomNumber
      });
    }).then(function (msg) {
      var data = extractData(msg);
      var list = Array.isArray(data.participants) ? data.participants : [];
      if (list.length >= self.state.participantLimit) {
        throw makeWidgetError('room_full', 'Room is full.');
      }
      return true;
    });
  };

  VideoChatWidget.prototype._acquireLocalMedia = function () {
    var self = this;
    if (self.state.localStream) {
      return Promise.resolve(self.state.localStream);
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      return Promise.reject(makeWidgetError('media_not_supported', 'Browser media capture is not available.'));
    }
    return navigator.mediaDevices.getUserMedia(self.options.mediaConstraints || { audio: true, video: true }).then(function (stream) {
      self.state.localStream = stream;
      self._emitMetric('local_media_granted', {
        audio_tracks: stream.getAudioTracks().length,
        video_tracks: stream.getVideoTracks().length
      });
      return stream;
    });
  };

  VideoChatWidget.prototype._buildPeerConnection = function (kind, handleId, feedId) {
    var self = this;
    var pc = new RTCPeerConnection({
      iceServers: self.options.iceServers || []
    });

    pc.addEventListener('icecandidate', function (evt) {
      var candidate = evt && evt.candidate ? evt.candidate : null;
      if (!candidate) {
        self.janus.trickle(handleId, { completed: true }).catch(function () {
          // Ignore trickle completion errors.
        });
        return;
      }
      if (!self.state.hasSeenRelayCandidate && / typ relay /i.test(String(candidate.candidate || ''))) {
        self.state.hasSeenRelayCandidate = true;
        self._emitMetric('turn_usage_detected', {
          source: kind,
          feed_id: feedId || 0
        });
      }
      self.janus.trickle(handleId, {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex
      }).catch(function () {
        // Ignore trickle write failures.
      });
    });

    pc.addEventListener('iceconnectionstatechange', function () {
      var state = String(pc.iceConnectionState || '');
      self._emitMetric('ice_state', {
        source: kind,
        feed_id: feedId || 0,
        state: state
      });
      if (kind === 'publisher' && (state === 'failed' || state === 'disconnected')) {
        self._scheduleIceRestart();
      }
    });

    return pc;
  };

  VideoChatWidget.prototype._joinPublisher = function () {
    var self = this;
    return self.janus.pluginMessage(self.janusPublisherHandle, {
      request: 'join',
      ptype: 'publisher',
      room: self.state.roomNumeric,
      display: self.options.displayName
    }).then(function (msg) {
      var data = (msg && msg.plugindata && msg.plugindata.data) ? msg.plugindata.data : {};
      if (!data || String(data.videoroom || '').toLowerCase() !== 'joined') {
        throw makeWidgetError('join_failed', 'Could not join Janus videoroom as publisher.');
      }
      self.state.privateId = Number(data.private_id || 0);
      self.state.ownFeedId = Number(data.id || 0);
      var publishers = Array.isArray(data.publishers) ? data.publishers : [];
      return publishers;
    });
  };

  VideoChatWidget.prototype._publishLocalStream = function () {
    var self = this;
    self.state.publisherPc = self._buildPeerConnection('publisher', self.janusPublisherHandle, self.state.ownFeedId);

    self.janus.setHandleListener(self.janusPublisherHandle, function (msg) {
      self._handlePublisherMessage(msg);
    });

    var local = self.state.localStream;
    local.getTracks().forEach(function (track) {
      self.state.publisherPc.addTrack(track, local);
    });

    return self.state.publisherPc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
      .then(function (offer) {
        return self.state.publisherPc.setLocalDescription(offer).then(function () {
          return offer;
        });
      })
      .then(function (offer) {
        return self.janus.pluginMessage(self.janusPublisherHandle, {
          request: 'configure',
          audio: !!self.state.micEnabled,
          video: !!self.state.cameraEnabled
        }, offer);
      })
      .then(function (msg) {
        if (msg && msg.jsep && msg.jsep.type === 'answer') {
          return self.state.publisherPc.setRemoteDescription(msg.jsep);
        }
        return true;
      });
  };

  VideoChatWidget.prototype._handlePublisherMessage = function (msg) {
    var self = this;
    if (!msg || typeof msg !== 'object') {
      return;
    }
    if (msg.jsep && self.state.publisherPc) {
      if (msg.jsep.type === 'answer') {
        self.state.publisherPc.setRemoteDescription(msg.jsep).catch(function () {
          // Ignore late answer application errors.
        });
      } else if (msg.jsep.type === 'offer') {
        self.state.publisherPc.setRemoteDescription(msg.jsep)
          .then(function () {
            return self.state.publisherPc.createAnswer();
          })
          .then(function (answer) {
            return self.state.publisherPc.setLocalDescription(answer).then(function () {
              return answer;
            });
          })
          .then(function (answer) {
            return self.janus.pluginMessage(self.janusPublisherHandle, {
              request: 'configure',
              audio: !!self.state.micEnabled,
              video: !!self.state.cameraEnabled
            }, answer);
          })
          .catch(function () {
            // Ignore renegotiation failures and let reconnection handle it if needed.
          });
      }
    }

    var data = (msg && msg.plugindata && msg.plugindata.data) ? msg.plugindata.data : {};
    if (String(data.videoroom || '').toLowerCase() === 'event') {
      if (Array.isArray(data.publishers)) {
        data.publishers.forEach(function (pub) {
          var feed = Number(pub && pub.id);
          if (!feed || feed === self.state.ownFeedId) {
            return;
          }
          if (self.state.subscribersByFeed[feed]) {
            return;
          }
          self._subscribeToFeed(feed, compact(pub.display || '') || ('Participant ' + String(feed))).catch(function (err) {
            self._setStatus('Could not subscribe to participant: ' + String(err && err.message ? err.message : err), 'warn');
          });
        });
      }

      var leavingFeed = Number(data.leaving || 0);
      if (leavingFeed) {
        self._removeSubscriberByFeed(leavingFeed);
      }
      if (data.unpublished && data.unpublished !== 'ok') {
        var unpublishedFeed = Number(data.unpublished || 0);
        if (unpublishedFeed) {
          self._removeSubscriberByFeed(unpublishedFeed);
        }
      }
    }
  };

  VideoChatWidget.prototype._subscribeToFeed = function (feedId, displayName) {
    var self = this;
    var feed = Number(feedId || 0);
    if (!feed || self.state.subscribersByFeed[feed]) {
      return Promise.resolve(false);
    }
    if (Object.keys(self.state.subscribersByFeed).length + 1 >= self.options.maxParticipants) {
      return Promise.resolve(false);
    }

    var subscriber = {
      feedId: feed,
      displayName: compact(displayName || '') || ('Participant ' + String(feed)),
      handleId: 0,
      pc: null,
      stream: null
    };

    return self.janus.attachPlugin('janus.plugin.videoroom').then(function (handleId) {
      subscriber.handleId = handleId;
      subscriber.pc = self._buildPeerConnection('subscriber', handleId, feed);

      subscriber.pc.addEventListener('track', function (evt) {
        var stream = evt && evt.streams && evt.streams[0] ? evt.streams[0] : null;
        if (!stream) {
          return;
        }
        subscriber.stream = stream;
        self.state.subscribersByFeed[feed] = subscriber;
        self.state.subscribersByHandle[handleId] = subscriber;
        self._renderGrid();
      });

      self.janus.setHandleListener(handleId, function (msg) {
        self._handleSubscriberMessage(subscriber, msg);
      });

      return self.janus.pluginMessage(handleId, {
        request: 'join',
        ptype: 'subscriber',
        room: self.state.roomNumeric,
        feed: feed,
        private_id: self.state.privateId
      });
    }).then(function (msg) {
      if (!msg || !msg.jsep) {
        return true;
      }
      return subscriber.pc.setRemoteDescription(msg.jsep)
        .then(function () {
          return subscriber.pc.createAnswer();
        })
        .then(function (answer) {
          return subscriber.pc.setLocalDescription(answer).then(function () {
            return answer;
          });
        })
        .then(function (answer) {
          return self.janus.pluginMessage(subscriber.handleId, {
            request: 'start',
            room: self.state.roomNumeric
          }, answer);
        });
    });
  };

  VideoChatWidget.prototype._handleSubscriberMessage = function (subscriber, msg) {
    var self = this;
    if (!subscriber || !msg || typeof msg !== 'object') {
      return;
    }
    if (msg.jsep && subscriber.pc) {
      if (msg.jsep.type === 'offer') {
        subscriber.pc.setRemoteDescription(msg.jsep)
          .then(function () {
            return subscriber.pc.createAnswer();
          })
          .then(function (answer) {
            return subscriber.pc.setLocalDescription(answer).then(function () {
              return answer;
            });
          })
          .then(function (answer) {
            return self.janus.pluginMessage(subscriber.handleId, {
              request: 'start',
              room: self.state.roomNumeric
            }, answer);
          })
          .catch(function () {
            // Ignore renegotiation issues.
          });
      } else if (msg.jsep.type === 'answer') {
        subscriber.pc.setRemoteDescription(msg.jsep).catch(function () {
          // Ignore late answer application errors.
        });
      }
    }

    var data = (msg && msg.plugindata && msg.plugindata.data) ? msg.plugindata.data : {};
    var leavingFeed = Number(data.leaving || data.unpublished || 0);
    if (leavingFeed) {
      self._removeSubscriberByFeed(leavingFeed);
    }
  };

  VideoChatWidget.prototype._removeSubscriberByFeed = function (feedId) {
    var feed = Number(feedId || 0);
    if (!feed) {
      return;
    }
    var subscriber = this.state.subscribersByFeed[feed];
    if (!subscriber) {
      return;
    }
    delete this.state.subscribersByFeed[feed];
    if (subscriber.handleId) {
      delete this.state.subscribersByHandle[subscriber.handleId];
      if (this.janus) {
        this.janus.detachHandle(subscriber.handleId).catch(function () {
          // Ignore detach errors.
        });
      }
    }
    if (subscriber.pc) {
      try {
        subscriber.pc.close();
      } catch (_err) {
        // Ignore close errors.
      }
    }
    this._renderGrid();
  };

  VideoChatWidget.prototype._renderGrid = function () {
    if (!this.nodes || !this.nodes.grid) {
      return;
    }
    var grid = this.nodes.grid;
    grid.innerHTML = '';

    var maxTiles = this.options.maxParticipants;
    var added = 0;

    function appendTile(stream, label, muted) {
      var wrap = document.createElement('article');
      wrap.className = 'vcw-tile';
      var video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = !!muted;
      video.setAttribute('aria-label', label);
      if (stream) {
        video.srcObject = stream;
      }
      wrap.appendChild(video);
      var badge = document.createElement('span');
      badge.className = 'vcw-tile-label';
      badge.textContent = label;
      wrap.appendChild(badge);
      grid.appendChild(wrap);
      added += 1;
    }

    if (this.state.localStream && added < maxTiles) {
      appendTile(this.state.localStream, this.options.displayName + ' (You)', true);
    }

    var self = this;
    Object.keys(this.state.subscribersByFeed).sort(function (a, b) {
      return Number(a) - Number(b);
    }).forEach(function (feedKey) {
      if (added >= maxTiles) {
        return;
      }
      var sub = self.state.subscribersByFeed[feedKey];
      appendTile(sub && sub.stream ? sub.stream : null, (sub && sub.displayName) ? sub.displayName : ('Participant ' + String(feedKey)), false);
    });
  };

  VideoChatWidget.prototype._showCallUi = function () {
    if (this.nodes && this.nodes.preCall) {
      this.nodes.preCall.hidden = true;
    }
    if (this.nodes && this.nodes.call) {
      this.nodes.call.hidden = false;
    }
    if (this.nodes && this.nodes.fullRoom) {
      this.nodes.fullRoom.hidden = true;
      this.nodes.fullRoom.textContent = '';
    }
    this._setControlButtonStates();
  };

  VideoChatWidget.prototype._showPreCallUi = function () {
    if (this.nodes && this.nodes.preCall) {
      this.nodes.preCall.hidden = false;
    }
    if (this.nodes && this.nodes.call) {
      this.nodes.call.hidden = true;
    }
    this._setControlButtonStates();
  };

  VideoChatWidget.prototype._showRoomFull = function (message) {
    this.state.roomFull = true;
    if (this.nodes && this.nodes.fullRoom) {
      this.nodes.fullRoom.hidden = false;
      this.nodes.fullRoom.textContent = message || 'Room is full.';
    }
    this._showPreCallUi();
    this._setStatus(message || 'Room is full.', 'warn');
  };

  VideoChatWidget.prototype._setControlButtonStates = function () {
    if (this.nodes && this.nodes.micBtn) {
      this.nodes.micBtn.setAttribute('aria-pressed', this.state.micEnabled ? 'true' : 'false');
      this.nodes.micBtn.textContent = this.state.micEnabled ? 'Mic' : 'Mic Off';
    }
    if (this.nodes && this.nodes.cameraBtn) {
      this.nodes.cameraBtn.setAttribute('aria-pressed', this.state.cameraEnabled ? 'true' : 'false');
      this.nodes.cameraBtn.textContent = this.state.cameraEnabled ? 'Camera' : 'Camera Off';
    }
  };

  VideoChatWidget.prototype._handleJanusDisconnect = function () {
    if (this.state.leaving || !this.state.joined) {
      return;
    }
    this._setStatus('Connection lost. Reconnecting…', 'warn');
    this._scheduleReconnect();
  };

  VideoChatWidget.prototype._scheduleReconnect = function () {
    var self = this;
    if (self.state.reconnectTimer || self.state.leaving || !self.state.joined) {
      return;
    }
    self.state.reconnectAttempts += 1;
    if (self.state.reconnectAttempts > self.options.reconnectMaxAttempts) {
      self._setStatus('Could not reconnect automatically. Please leave and rejoin.', 'error');
      self._emitMetric('reconnect_failed', {
        attempts: self.state.reconnectAttempts
      });
      return;
    }
    var delay = self.options.reconnectBaseDelayMs * Math.pow(2, Math.min(self.state.reconnectAttempts - 1, 5));
    self.state.reconnectTimer = setTimeout(function () {
      self.state.reconnectTimer = 0;
      self._reconnectNow().catch(function () {
        self._scheduleReconnect();
      });
    }, delay);
  };

  VideoChatWidget.prototype._reconnectNow = function () {
    var self = this;
    if (self.state.leaving || !self.state.roomId) {
      return Promise.resolve(false);
    }
    return self._teardownJanusOnly(true).then(function () {
      return self._connectSignaling();
    }).then(function () {
      return self._ensureJanus();
    }).then(function () {
      return self.janus.attachPlugin('janus.plugin.videoroom');
    }).then(function (publisherHandle) {
      self.janusPublisherHandle = publisherHandle;
      return self._joinPublisher();
    }).then(function (publishers) {
      return self._publishLocalStream().then(function () {
        return publishers;
      });
    }).then(function (publishers) {
      var jobs = [];
      (publishers || []).forEach(function (pub) {
        var feed = Number(pub && pub.id);
        if (!feed || feed === self.state.ownFeedId) {
          return;
        }
        jobs.push(self._subscribeToFeed(feed, compact(pub.display || '') || ('Participant ' + String(feed))));
      });
      return Promise.all(jobs);
    }).then(function () {
      self.state.reconnectAttempts = 0;
      self._setStatus('Reconnected.', 'ok');
      self._emitMetric('reconnect_success', {});
      self._renderGrid();
      return true;
    });
  };

  VideoChatWidget.prototype._scheduleIceRestart = function () {
    var self = this;
    if (self.state.iceRestartTimer || !self.state.publisherPc || self.state.leaving || !self.state.joined) {
      return;
    }
    self.state.iceRestartTimer = setTimeout(function () {
      self.state.iceRestartTimer = 0;
      self.restartIce().catch(function () {
        self._scheduleReconnect();
      });
    }, 900);
  };

  VideoChatWidget.prototype.restartIce = function () {
    var self = this;
    if (!self.state.publisherPc || !self.janus || !self.janusPublisherHandle) {
      return Promise.resolve(false);
    }
    self._setStatus('Refreshing network path…', 'warn');
    return self.state.publisherPc.createOffer({ iceRestart: true })
      .then(function (offer) {
        return self.state.publisherPc.setLocalDescription(offer).then(function () {
          return offer;
        });
      })
      .then(function (offer) {
        return self.janus.pluginMessage(self.janusPublisherHandle, {
          request: 'configure',
          audio: !!self.state.micEnabled,
          video: !!self.state.cameraEnabled
        }, offer);
      })
      .then(function (msg) {
        if (msg && msg.jsep && msg.jsep.type === 'answer') {
          return self.state.publisherPc.setRemoteDescription(msg.jsep);
        }
        return true;
      })
      .then(function () {
        self._setStatus('Connection stabilized.', 'ok');
        self._emitMetric('ice_restart', { success: true });
        return true;
      });
  };

  VideoChatWidget.prototype._handleOnline = function () {
    this.state.online = true;
    if (this.state.joined) {
      this._setStatus('Network restored. Verifying call…', 'info');
      this._connectSignaling().catch(function () {
        // Ignore signaling reconnect errors.
      });
      this._scheduleIceRestart();
    }
  };

  VideoChatWidget.prototype._handleOffline = function () {
    this.state.online = false;
    if (this.state.joined) {
      this._setStatus('You are offline. Reconnect when network returns.', 'warn');
    }
  };

  VideoChatWidget.prototype.startCall = function () {
    var self = this;
    if (self.state.featureDisabled) {
      return Promise.reject(makeWidgetError('plugin_disabled', 'Video calling is disabled.'));
    }
    if (self.state.joining || self.state.joined) {
      return Promise.resolve(false);
    }
    self.state.roomFull = false;
    var roomId = self._ensureRoomId();
    return self._startJoinFlow(roomId, self.state.inviteToken || '');
  };

  VideoChatWidget.prototype.joinViaInvite = function () {
    var self = this;
    if (self.state.featureDisabled) {
      return Promise.reject(makeWidgetError('plugin_disabled', 'Video calling is disabled.'));
    }
    if (self.state.joining || self.state.joined) {
      return Promise.resolve(false);
    }
    var inviteRaw = '';
    if (self.nodes && self.nodes.inviteInput) {
      inviteRaw = compact(self.nodes.inviteInput.value || '');
    }
    if (!inviteRaw && self.options.initialInviteLink) {
      inviteRaw = self.options.initialInviteLink;
    }
    var parsed = self._parseInviteLink(inviteRaw || window.location.href);
    if (!parsed || !parsed.roomId) {
      self._setStatus('Enter a valid invite link with a room id.', 'warn');
      return Promise.resolve(false);
    }
    if (parsed.displayName) {
      self.options.displayName = parsed.displayName;
    }
    self.state.roomId = parsed.roomId;
    self.state.roomNumeric = roomHashToNumber(parsed.roomId);
    if (self.nodes && self.nodes.roomInput) {
      self.nodes.roomInput.value = parsed.roomId;
    }
    return self._startJoinFlow(parsed.roomId, parsed.token || '');
  };

  VideoChatWidget.prototype._startJoinFlow = function (roomId, inviteToken) {
    var self = this;
    var normalizedRoomId = slugifyRoom(roomId || '');
    if (!normalizedRoomId) {
      self._setStatus('Room id is required.', 'warn');
      return Promise.resolve(false);
    }
    self.state.roomId = normalizedRoomId;
    self.state.roomNumeric = roomHashToNumber(normalizedRoomId);
    self.state.inviteToken = compact(inviteToken || '');

    self.state.joining = true;
    self.state.leaving = false;
    self._setJoinUiBusy(true);
    self._showPreCallUi();
    self._setStatus('Requesting call capability…', 'info');

    return self._fetchCapabilityToken(normalizedRoomId, self.state.inviteToken)
      .then(function () {
        return self._connectSignaling();
      })
      .then(function () {
        self._setStatus('Connecting to Janus…', 'info');
        return self._ensureJanus();
      })
      .then(function () {
        return self.janus.attachPlugin('janus.plugin.videoroom');
      })
      .then(function (publisherHandle) {
        self.janusPublisherHandle = publisherHandle;
        return self._ensureRoomReady();
      })
      .then(function () {
        self._setStatus('Waiting for camera and microphone permission…', 'info');
        return self._acquireLocalMedia();
      })
      .then(function () {
        self._setStatus('Joining room…', 'info');
        return self._joinPublisher();
      })
      .then(function (publishers) {
        return self._publishLocalStream().then(function () {
          return publishers;
        });
      })
      .then(function (publishers) {
        var jobs = [];
        (publishers || []).forEach(function (pub) {
          var feed = Number(pub && pub.id);
          if (!feed || feed === self.state.ownFeedId) {
            return;
          }
          jobs.push(self._subscribeToFeed(feed, compact(pub.display || '') || ('Participant ' + String(feed))));
        });
        return Promise.all(jobs);
      })
      .then(function () {
        self.state.joined = true;
        self.state.joining = false;
        self.state.reconnectAttempts = 0;
        self._showCallUi();
        self._renderGrid();
        self._setStatus('Connected to room ' + self.state.roomId + '.', 'ok');
        self._emitLifecycle('join', {
          roomId: self.state.roomId,
          participantLimit: self.state.participantLimit
        });
        self._emitMetric('join_success', {
          participant_limit: self.state.participantLimit
        });
        self._setJoinUiBusy(false);
        return true;
      })
      .catch(function (err) {
        self.state.joining = false;
        self._setJoinUiBusy(false);
        if (err && err.code === 'room_full') {
          self._showRoomFull('Room is full. Try again later.');
          self._emitMetric('join_full_room', {
            roomId: self.state.roomId
          });
          return self._teardownCall(true, false).then(function () {
            return false;
          });
        }
        self._handleError(err, 'Could not start call.');
        return self._teardownCall(true, false).then(function () {
          return false;
        });
      });
  };

  VideoChatWidget.prototype._handleError = function (err, fallbackMessage) {
    var message = fallbackMessage || 'Video chat error.';
    if (err && err.message) {
      message = String(err.message);
    }
    this._setStatus(message, 'error');
    this._emitLifecycle('error', {
      code: err && err.code ? String(err.code) : 'video_chat_error',
      message: message
    });
    this._emitMetric('error', {
      code: err && err.code ? String(err.code) : 'video_chat_error',
      message: message
    });
  };

  VideoChatWidget.prototype._teardownJanusOnly = function (keepLocalStream) {
    var self = this;
    if (self.state.reconnectTimer) {
      clearTimeout(self.state.reconnectTimer);
      self.state.reconnectTimer = 0;
    }
    if (self.state.iceRestartTimer) {
      clearTimeout(self.state.iceRestartTimer);
      self.state.iceRestartTimer = 0;
    }

    Object.keys(self.state.subscribersByFeed).forEach(function (feedKey) {
      var sub = self.state.subscribersByFeed[feedKey];
      if (sub && sub.pc) {
        try {
          sub.pc.close();
        } catch (_err) {
          // Ignore close errors.
        }
      }
    });
    self.state.subscribersByFeed = Object.create(null);
    self.state.subscribersByHandle = Object.create(null);

    if (self.state.publisherPc) {
      try {
        self.state.publisherPc.close();
      } catch (_err2) {
        // Ignore close errors.
      }
      self.state.publisherPc = null;
    }

    self.janusPublisherHandle = 0;

    var closeJanus = Promise.resolve(true);
    if (self.janus) {
      closeJanus = self.janus.destroy().catch(function () {
        return false;
      }).then(function () {
        self.janus = null;
        return true;
      });
    }

    return closeJanus.then(function () {
      if (!keepLocalStream && self.state.localStream) {
        self.state.localStream.getTracks().forEach(function (track) {
          try {
            track.stop();
          } catch (_err3) {
            // Ignore stop errors.
          }
        });
        self.state.localStream = null;
      }
      return true;
    });
  };

  VideoChatWidget.prototype._teardownCall = function (clearSignaling, keepLocalStream) {
    var self = this;
    if (clearSignaling) {
      self._clearSignaling();
    }
    return self._teardownJanusOnly(keepLocalStream).then(function () {
      self.state.joined = false;
      self.state.joining = false;
      self.state.ownFeedId = 0;
      self.state.privateId = 0;
      self._renderGrid();
      self._showPreCallUi();
      return true;
    });
  };

  VideoChatWidget.prototype.leaveCall = function (reason) {
    var self = this;
    var exitReason = compact(reason || 'user') || 'user';
    self.state.leaving = true;
    self._setStatus('Leaving call…', 'info');

    var leaveMessage = Promise.resolve(true);
    if (self.janus && self.janusPublisherHandle) {
      leaveMessage = self.janus.pluginMessage(self.janusPublisherHandle, {
        request: 'leave'
      }).catch(function () {
        return false;
      });
    }

    return leaveMessage
      .then(function () {
        return self._teardownCall(true, false);
      })
      .then(function () {
        self.state.leaving = false;
        self._setStatus('Call ended.', 'info');
        self._emitLifecycle('leave', {
          roomId: self.state.roomId,
          reason: exitReason
        });
        self._emitMetric('leave', {
          reason: exitReason
        });
        return true;
      });
  };

  VideoChatWidget.prototype.toggleMic = function () {
    var self = this;
    self.state.micEnabled = !self.state.micEnabled;
    if (self.state.localStream) {
      self.state.localStream.getAudioTracks().forEach(function (track) {
        track.enabled = !!self.state.micEnabled;
      });
    }
    self._setControlButtonStates();
    if (self.state.joined && self.janus && self.janusPublisherHandle) {
      self.janus.pluginMessage(self.janusPublisherHandle, {
        request: 'configure',
        audio: !!self.state.micEnabled,
        video: !!self.state.cameraEnabled
      }).catch(function () {
        // Ignore transient configure errors.
      });
    }
    self._emitMetric('toggle_mic', {
      enabled: !!self.state.micEnabled
    });
  };

  VideoChatWidget.prototype.toggleCamera = function () {
    var self = this;
    self.state.cameraEnabled = !self.state.cameraEnabled;
    if (self.state.localStream) {
      self.state.localStream.getVideoTracks().forEach(function (track) {
        track.enabled = !!self.state.cameraEnabled;
      });
    }
    self._setControlButtonStates();
    if (self.state.joined && self.janus && self.janusPublisherHandle) {
      self.janus.pluginMessage(self.janusPublisherHandle, {
        request: 'configure',
        audio: !!self.state.micEnabled,
        video: !!self.state.cameraEnabled
      }).catch(function () {
        // Ignore transient configure errors.
      });
    }
    self._emitMetric('toggle_camera', {
      enabled: !!self.state.cameraEnabled
    });
  };

  VideoChatWidget.prototype._buildInviteUrl = function () {
    var base = this.options.inviteBaseUrl;
    if (!base) {
      base = window.location.origin + window.location.pathname;
    }
    var url;
    try {
      url = new URL(base, window.location.origin);
    } catch (_err) {
      url = new URL(window.location.origin + window.location.pathname);
    }
    url.searchParams.set('room', this.state.roomId || this._ensureRoomId());
    if (this.options.includeTokenInInvite && this.state.capabilityToken) {
      url.searchParams.set('token', this.state.capabilityToken);
    }
    return url.toString();
  };

  VideoChatWidget.prototype.copyInviteLink = function () {
    var self = this;
    var link = self._buildInviteUrl();
    function success() {
      self._setStatus('Invite link copied.', 'ok');
      self._emitMetric('copy_invite_link', {});
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(link).then(success).catch(function () {
        // Fall through to legacy copy path.
        var el = document.createElement('textarea');
        el.value = link;
        document.body.appendChild(el);
        el.focus();
        el.select();
        try {
          document.execCommand('copy');
          success();
        } catch (_err) {
          self._setStatus('Copy failed. Invite: ' + link, 'warn');
        }
        document.body.removeChild(el);
      });
      return;
    }
    self._setStatus('Invite: ' + link, 'info');
  };

  VideoChatWidget.prototype.unmount = function () {
    var self = this;
    window.removeEventListener('online', self.boundOnOnline);
    window.removeEventListener('offline', self.boundOnOffline);
    return self._teardownCall(true, false).finally(function () {
      if (self.target) {
        self.target.removeAttribute(WIDGET_MOUNTED_ATTR);
      }
      try {
        if (self.shadowRoot) {
          self.shadowRoot.innerHTML = '';
        }
      } catch (_err) {
        // Ignore cleanup errors.
      }
      INSTANCE_BY_ELEMENT.delete(self.target);
    });
  };

  function initVideoChatWidget(target, options) {
    var element = resolveTarget(target);
    if (!element) {
      throw makeWidgetError('invalid_target', 'initVideoChatWidget target was not found.');
    }
    var existing = INSTANCE_BY_ELEMENT.get(element);
    if (existing) {
      return existing;
    }

    var mergedOptions = normalizeOptions(mergeObjects(datasetOptions(element), options || {}));
    var instance = new VideoChatWidget(element, mergedOptions);
    INSTANCE_BY_ELEMENT.set(element, instance);
    return instance;
  }

  function unmountByElement(element) {
    var inst = INSTANCE_BY_ELEMENT.get(element);
    if (!inst) {
      return;
    }
    inst.unmount().catch(function () {
      // Ignore unmount errors.
    });
  }

  function gatherMountTargets(rootNode) {
    var root = rootNode || document;
    var out = [];
    if (root instanceof HTMLElement && root.matches(WIDGET_SELECTOR)) {
      out.push(root);
    }
    var list = root.querySelectorAll ? root.querySelectorAll(WIDGET_SELECTOR) : [];
    var i;
    for (i = 0; i < list.length; i += 1) {
      out.push(list[i]);
    }
    return out;
  }

  var autoMountObserver = null;

  function scanForAutoMount(rootNode) {
    var targets = gatherMountTargets(rootNode);
    var mounted = 0;
    targets.forEach(function (el) {
      if (!(el instanceof HTMLElement)) {
        return;
      }
      if (INSTANCE_BY_ELEMENT.get(el)) {
        return;
      }
      try {
        initVideoChatWidget(el, {});
        mounted += 1;
      } catch (_err) {
        // Keep scan resilient even when one mount fails.
      }
    });
    return mounted;
  }

  function observeAutoMount() {
    if (autoMountObserver || !document.body || typeof MutationObserver !== 'function') {
      return;
    }
    autoMountObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (!mutation) {
          return;
        }
        var idx;
        if (mutation.addedNodes && mutation.addedNodes.length) {
          for (idx = 0; idx < mutation.addedNodes.length; idx += 1) {
            var added = mutation.addedNodes[idx];
            if (!(added instanceof HTMLElement)) {
              continue;
            }
            scanForAutoMount(added);
          }
        }
        if (mutation.removedNodes && mutation.removedNodes.length) {
          for (idx = 0; idx < mutation.removedNodes.length; idx += 1) {
            var removed = mutation.removedNodes[idx];
            if (!(removed instanceof HTMLElement)) {
              continue;
            }
            gatherMountTargets(removed).forEach(function (el) {
              unmountByElement(el);
            });
          }
        }
      });
    });
    autoMountObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function disconnectAutoMountObserver() {
    if (!autoMountObserver) {
      return;
    }
    autoMountObserver.disconnect();
    autoMountObserver = null;
  }

  window.initVideoChatWidget = initVideoChatWidget;
  window.VideoChatWidgetAutoMount = {
    scan: scanForAutoMount,
    observe: observeAutoMount,
    disconnect: disconnectAutoMountObserver,
    unmount: function (target) {
      var element = resolveTarget(target);
      if (!element) {
        return false;
      }
      unmountByElement(element);
      return true;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      scanForAutoMount(document);
      observeAutoMount();
    });
  } else {
    scanForAutoMount(document);
    observeAutoMount();
  }
})();
