(function () {
  'use strict';

  var root = document.getElementById('desk-page-root');
  if (!root) {
    return;
  }

  var flashlightSteps = [
    { label: '5m', fadeMs: 5 * 60 * 1000, buildMs: 4 * 60 * 1000 },
    { label: '10m', fadeMs: 10 * 60 * 1000, buildMs: 3 * 60 * 1000 },
    { label: '30m', fadeMs: 30 * 60 * 1000, buildMs: 2 * 60 * 1000 },
    { label: '1h', fadeMs: 60 * 60 * 1000, buildMs: 90 * 1000 },
    { label: '3h', fadeMs: 3 * 60 * 60 * 1000, buildMs: 60 * 1000 },
    { label: '12h', fadeMs: 12 * 60 * 60 * 1000, buildMs: 45 * 1000 },
    { label: '18h', fadeMs: 18 * 60 * 60 * 1000, buildMs: 30 * 1000 },
    { label: '1d', fadeMs: 24 * 60 * 60 * 1000, buildMs: 20 * 1000 }
  ];

  var state = {
    data: null,
    search: null,
    currentRoom: roomFromLocation(),
    mode: 'map',
    closingMode: '',
    paperSwitchFrom: '',
    draggedRoom: '',
    suppressRoomClick: false,
    suppressMapAnimation: true,
    suppressTodoAnimation: false,
    secretPassageSource: null,
    lastEnteredDoor: null,
    createRoomOpen: false,
    todoAddOpen: false,
    composePaper: 'printer',
    threshold: thresholdFromStorage(),
    showSurfacedOnly: false,
    pointerRoomDrag: null,
    pointerDocDrag: null,
    pointerMapPan: null,
    mapZoomMode: 'full',
    mapPanX: 0,
    mapPanY: 0,
    mapPropsOpen: false,
    mapRenameRoom: null,
    mapRenameValue: '',
    composeDocId: '',
    composeDocText: '',
    composeDocTitle: '',
    composeDocType: 'shortform',
    composeTargetRoom: '',
    composeAdvanced: false,
    composeMenuOpen: false,
    composeRenameOpen: false,
    composeRenameValue: '',
    composeDirty: false,
    composeSaving: false,
    composeSavedPulse: false,
    presence: {},
    presenceTick: Date.now(),
    flashlightStrength: flashlightStrengthFromStorage(),
    inFlight: 0,
    pendingStatus: '',
    forgottenOpen: false,
    taskMenuKey: '',
    editingTask: null
  };
  var modeCloseTimer = null;
  var presenceTimer = null;
  var suppressRoomClickTimer = null;
  var messageTimer = null;
  var composeAutosaveTimer = null;
  var composeForceSaveTimer = null;
  var typewriterQueue = [];
  var typewriterTimer = null;
  var deskSounds = {
    mapOpen: createSound('/static/sounds/desk/cpage2.wav', 0.72),
    mapClose: createSound('/static/sounds/desk/cpage1.wav', 0.72),
    book: createSound('/static/sounds/desk/book.wav', 0.68)
  };

  function markPageReady() {
    var gate = window.__wizardryHydration;
    if (gate && typeof gate.markPageReady === 'function') {
      gate.markPageReady();
    }
  }

  function createSound(src, volume) {
    return {
      src: src,
      volume: volume
    };
  }

  function playSound(sound) {
    if (!sound || !sound.src) {
      return;
    }
    try {
      var clip = new Audio(sound.src);
      clip.volume = typeof sound.volume === 'number' ? sound.volume : 0.8;
      clip.play().catch(function () {
        // Ignore blocked autoplay attempts.
      });
    } catch (_err) {
      // Ignore audio errors in unsupported environments.
    }
  }

  function composePaperOptions() {
    return [
      { value: 'printer', label: 'Printer', icon: 'sheet', color: '#f4f8ff' },
      { value: 'typewriter', label: 'Typewriter', icon: 'type', color: '#eadfc8' },
      { value: 'card25x3', label: 'half-index card', icon: 'card', color: '#f1d6aa' },
      { value: 'card3x5', label: '3x5 index card', icon: 'wide-card', color: '#f0cf9d' },
      { value: 'lined', label: 'Lined paper', icon: 'lined', color: '#f9fbff' },
      { value: 'lavender', label: 'Stationery', icon: 'stationery', color: '#dfd4ff' }
    ];
  }

  function composeTypeOptions() {
    return [
      { value: 'shortform', label: 'Shortform' },
      { value: 'article', label: 'Article' }
    ];
  }

  function composePaperClass() {
    var value = String(state.composePaper || 'printer');
    if (!/^(printer|typewriter|card25x3|card3x5|lined|lavender)$/.test(value)) {
      return 'printer';
    }
    return value;
  }

  function applyComposePaperToDom() {
    var paper = composePaperClass();
    var sheet = root.querySelector('.desk-compose-sheet');
    var textarea = root.querySelector('.desk-compose-textarea');
    if (!sheet || !textarea) {
      if (state.data) {
        render(state.data);
      }
      return;
    }
    sheet.className = 'desk-compose-sheet desk-compose-sheet-' + paper;
    textarea.className = 'desk-textarea desk-compose-textarea desk-compose-textarea-' + paper;
    root.querySelectorAll('[data-desk-compose-paper]').forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-desk-compose-paper') === paper ? 'true' : 'false');
    });
    applyDeskTooltips();
  }

  function composePaperIcon(option) {
    var color = escapeHtml(option.color || '#f4f0df');
    var icon = String(option.icon || 'sheet');
    if (icon === 'type') {
      return '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="7" y="5" width="14" height="18" rx="1.4" fill="' + color + '"></rect><path d="M10 10h8M10 14h8M10 18h5" stroke="#3a2b1e" stroke-width="1.5" stroke-linecap="round"></path><path d="M8 23h12" stroke="#3a2b1e" stroke-width="1.5" stroke-linecap="round"></path></svg>';
    }
    if (icon === 'card' || icon === 'wide-card') {
      var w = icon === 'card' ? 18 : 21;
      var x = icon === 'card' ? 5 : 3.5;
      return '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="' + x + '" y="8" width="' + w + '" height="12" rx="1.5" fill="' + color + '"></rect><path d="M8 13h12M8 16h9" stroke="#8a6331" stroke-width="1.2" stroke-linecap="round"></path></svg>';
    }
    if (icon === 'lined') {
      return '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="6" y="4" width="16" height="20" rx="1.4" fill="' + color + '"></rect><path d="M10 8v13" stroke="#c95b5b" stroke-width="1"></path><path d="M8 11h12M8 15h12M8 19h12" stroke="#7da2e1" stroke-width="1.1"></path></svg>';
    }
    if (icon === 'stationery') {
      return '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="7" y="4.5" width="14" height="19" rx="2" fill="' + color + '"></rect><path d="M10 8c2.7 1.5 5.4 1.5 8 0" stroke="#876ec4" stroke-width="1.2" fill="none" stroke-linecap="round"></path><circle cx="18" cy="20" r="1.4" fill="#b99ee8"></circle></svg>';
    }
    return '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="7" y="4" width="14" height="20" rx="1.5" fill="' + color + '"></rect><path d="M10 9h8M10 13h8M10 17h6" stroke="#637082" stroke-width="1.2" stroke-linecap="round"></path></svg>';
  }

  function composeTypeIcon(option) {
    if (option.value === 'article') {
      return '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="6" y="5" width="16" height="18" rx="1.5"></rect><path d="M9 10h10M9 14h10M9 18h7"></path></svg>';
    }
    return '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M7 9h14M7 14h10"></path><circle cx="19" cy="17" r="2.2"></circle></svg>';
  }

  function queueTypewriterOp(op) {
    typewriterQueue.push(op);
    if (typewriterTimer) {
      return;
    }
    typewriterTimer = window.setInterval(function () {
      var field = root.querySelector('.desk-compose-textarea');
      if (!field || composePaperClass() !== 'typewriter') {
        typewriterQueue = [];
        window.clearInterval(typewriterTimer);
        typewriterTimer = null;
        return;
      }
      var next = typewriterQueue.shift();
      if (!next) {
        window.clearInterval(typewriterTimer);
        typewriterTimer = null;
        return;
      }
      var start = Number(field.selectionStart || 0);
      var end = Number(field.selectionEnd || 0);
      if (next.type === 'backspace') {
        if (start !== end) {
          field.value = field.value.slice(0, start) + field.value.slice(end);
          field.selectionStart = field.selectionEnd = start;
        } else if (start > 0) {
          field.value = field.value.slice(0, start - 1) + field.value.slice(end);
          field.selectionStart = field.selectionEnd = start - 1;
        }
      } else if (next.type === 'insert') {
        field.value = field.value.slice(0, start) + next.text + field.value.slice(end);
        field.selectionStart = field.selectionEnd = start + next.text.length;
      } else if (next.type === 'enter') {
        field.value = field.value.slice(0, start) + '\n' + field.value.slice(end);
        field.selectionStart = field.selectionEnd = start + 1;
      }
      playTypewriterTick();
    }, 72);
  }

  function playTypewriterTick() {
    try {
      var audioContext = window.AudioContext || window.webkitAudioContext;
      if (!audioContext) {
        return;
      }
      if (!window.__deskTypewriterContext) {
        window.__deskTypewriterContext = new audioContext();
      }
      var ctx = window.__deskTypewriterContext;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 1480;
      gain.gain.value = 0.013;
      osc.connect(gain);
      gain.connect(ctx.destination);
      var now = ctx.currentTime;
      gain.gain.setValueAtTime(0.013, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch (_err) {
      // Ignore environments that restrict transient audio contexts.
    }
  }

  function scheduleComposeAutosave() {
    if (!state.composeDirty || state.mode !== 'compose') {
      return;
    }
    if (composeAutosaveTimer) {
      window.clearTimeout(composeAutosaveTimer);
    }
    if (!composeForceSaveTimer) {
      composeForceSaveTimer = window.setTimeout(function () {
        composeForceSaveTimer = null;
        saveComposeDocument(true);
      }, 180000);
    }
    composeAutosaveTimer = window.setTimeout(function () {
      composeAutosaveTimer = null;
      saveComposeDocument(true);
    }, 30000);
  }

  function clearComposeAutosaveTimers() {
    if (composeAutosaveTimer) {
      window.clearTimeout(composeAutosaveTimer);
      composeAutosaveTimer = null;
    }
    if (composeForceSaveTimer) {
      window.clearTimeout(composeForceSaveTimer);
      composeForceSaveTimer = null;
    }
  }

  function setComposeSavedPulse() {
    state.composeSaving = false;
    state.composeSavedPulse = true;
    if (state.data) {
      render(state.data);
    }
    window.setTimeout(function () {
      state.composeSavedPulse = false;
      if (state.data) {
        render(state.data);
      }
    }, 1500);
  }

  function inferComposeTitle() {
    var explicit = String(state.composeDocTitle || '').trim();
    if (explicit) {
      return explicit;
    }
    var first = String(state.composeDocText || '').split('\n').map(function (line) { return line.trim(); }).filter(Boolean)[0] || '';
    return first ? first.split(/\s+/).slice(0, 8).join(' ') : '';
  }

  function composeWordCount() {
    return String(state.composeDocText || '').trim().split(/\s+/).filter(Boolean).length;
  }

  function saveComposeDocument(silent) {
    if (!state.composeDirty || state.mode !== 'compose') {
      return Promise.resolve(null);
    }
    if (composeWordCount() < 1) {
      clearComposeAutosaveTimers();
      return Promise.resolve(null);
    }
    state.composeSaving = true;
    if (state.data) {
      render(state.data);
    }
    var payload = {
      room: state.composeTargetRoom || state.currentRoom,
      doc_id: state.composeDocId,
      doc_title: state.composeDocTitle,
      doc_type: state.composeDocType,
      doc_body: state.composeDocText
    };
    return api('save-document', payload).then(function (data) {
      if (!data || data.success === false) {
        state.composeSaving = false;
        if (!silent) {
          showMessage(data && data.error ? data.error : 'Save failed.', true);
        }
        if (state.data) {
          render(state.data);
        }
        return null;
      }
      if (data.saved_document) {
        state.composeDocId = data.saved_document.id || state.composeDocId;
      }
      state.composeDirty = false;
      refreshFrom(data, state.currentRoom);
      setComposeSavedPulse();
      clearComposeAutosaveTimers();
      return data;
    }).catch(function () {
      state.composeSaving = false;
      if (state.data) {
        render(state.data);
      }
      return null;
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseViewBoxText(value) {
    var parts = String(value || '').trim().split(/\s+/).map(Number);
    if (parts.length !== 4 || parts.some(function (part) { return !Number.isFinite(part); })) {
      return null;
    }
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  }

  function formatViewBox(viewBox) {
    return [viewBox.x, viewBox.y, viewBox.w, viewBox.h].map(function (number) {
      return Number(number).toFixed(3);
    }).join(' ');
  }

  function easeMapZoom(progress) {
    return progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
  }

  function animateMapViewBox(svg, fromViewBox, toViewBox) {
    if (!svg || !fromViewBox || !toViewBox) {
      return;
    }
    if (svg._deskMapZoomFrame) {
      window.cancelAnimationFrame(svg._deskMapZoomFrame);
    }
    var startedAt = window.performance && window.performance.now ? window.performance.now() : Date.now();
    var duration = 320;
    function step(now) {
      var elapsed = now - startedAt;
      var progress = Math.min(1, Math.max(0, elapsed / duration));
      var eased = easeMapZoom(progress);
      var nextViewBox = {
        x: fromViewBox.x + (toViewBox.x - fromViewBox.x) * eased,
        y: fromViewBox.y + (toViewBox.y - fromViewBox.y) * eased,
        w: fromViewBox.w + (toViewBox.w - fromViewBox.w) * eased,
        h: fromViewBox.h + (toViewBox.h - fromViewBox.h) * eased
      };
      svg.setAttribute('viewBox', formatViewBox(nextViewBox));
      if (progress < 1) {
        svg._deskMapZoomFrame = window.requestAnimationFrame(step);
      } else {
        svg._deskMapZoomFrame = 0;
        svg.setAttribute('viewBox', formatViewBox(toViewBox));
      }
    }
    svg._deskMapZoomFrame = window.requestAnimationFrame(step);
  }

  function applyMapZoomToDom() {
    var svg = root.querySelector('[data-desk-map-svg]');
    if (!svg) {
      if (state.data) {
        render(state.data);
      }
      return;
    }
    var scroll = svg.closest('.desk-map-scroll');
    var zoomButton = root.querySelector('[data-desk-map-zoom]');
    var targetAttr = state.mapZoomMode === 'room' ? 'data-desk-room-viewbox' : 'data-desk-full-viewbox';
    var targetViewBox = parseViewBoxText(svg.getAttribute(targetAttr));
    var currentViewBox = parseViewBoxText(svg.getAttribute('viewBox')) || targetViewBox;
    if (!targetViewBox) {
      if (state.data) {
        render(state.data);
      }
      return;
    }
    if (scroll) {
      scroll.classList.toggle('is-closeup', state.mapZoomMode === 'room');
    }
    if (zoomButton) {
      var zoomLabel = state.mapZoomMode === 'room' ? 'Show whole map' : 'Zoom to current room';
      zoomButton.classList.toggle('is-active', state.mapZoomMode === 'room');
      zoomButton.setAttribute('aria-label', zoomLabel);
      zoomButton.setAttribute('title', zoomLabel);
    }
    animateMapViewBox(svg, currentViewBox, targetViewBox);
  }

  function storageGet(key) {
    try {
      if (!window.localStorage) {
        return '';
      }
      return window.localStorage.getItem(key) || '';
    } catch (_err) {
      return '';
    }
  }

  function storageSet(key, value) {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (_err) {
      // Storage may be unavailable in restricted browser contexts.
    }
  }

  function roomFromLocation() {
    try {
      var url = new URL(window.location.href);
      var legacy = String(url.searchParams.get('room') || '').trim();
      if (legacy) {
        return legacy;
      }
      var path = String(url.pathname || '').replace(/\/+$/, '');
      if (path === '' || path === '/') {
        return '';
      }
      if (path.charAt(0) === '/') {
        return decodeURIComponent(path.slice(1));
      }
      return '';
    } catch (_err) {
      return '';
    }
  }

  function isDeskRootHost() {
    try {
      return String(window.location.hostname || '').toLowerCase().indexOf('desk.') === 0;
    } catch (_err) {
      return false;
    }
  }

  function thresholdFromStorage() {
    var stored = Number(storageGet('desk_visibility_threshold') || 1);
    if (!Number.isFinite(stored) || stored < 1) {
      return 1;
    }
    return Math.min(100, Math.floor(stored));
  }

  function flashlightStrengthFromStorage() {
    var stored = Number(storageGet('desk_flashlight_strength_v1') || 4);
    if (!Number.isFinite(stored)) {
      return 4;
    }
    return Math.max(0, Math.min(flashlightSteps.length - 1, Math.round(stored)));
  }

  function flashlightStep() {
    return flashlightSteps[Math.max(0, Math.min(flashlightSteps.length - 1, Number(state.flashlightStrength || 0)))] || flashlightSteps[3];
  }

  function readPresence() {
    try {
      var parsed = JSON.parse(storageGet('desk_room_presence_v1') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_err) {
      return {};
    }
  }

  function writePresence(presence) {
    storageSet('desk_room_presence_v1', JSON.stringify(presence || {}));
  }

  function clampPresence(value) {
    var number = Number(value || 0);
    if (!Number.isFinite(number) || number < 0) {
      return 0;
    }
    return Math.min(1, number);
  }

  function updatePresence(now) {
    var current = Number(now || Date.now());
    var elapsed = Math.max(0, Math.min(5 * 60 * 1000, current - (state.presenceTick || current)));
    var strength = flashlightStep();
    var rooms = Object.assign({}, state.presence || readPresence());
    var roomKeys = Object.keys(rooms);
    roomKeys.forEach(function (room) {
      rooms[room] = clampPresence(Number(rooms[room] || 0) - elapsed / strength.fadeMs);
      if (rooms[room] <= 0.002) {
        delete rooms[room];
      }
    });
    var currentRoom = String(state.currentRoom || '');
    rooms[currentRoom] = clampPresence(Number(rooms[currentRoom] || 0) + elapsed / strength.buildMs);
    state.presence = rooms;
    state.presenceTick = current;
    writePresence(rooms);
    return rooms;
  }

  function dimPresenceForRoom(room) {
    var key = String(room || '');
    var rooms = updatePresence(Date.now());
    if (Object.prototype.hasOwnProperty.call(rooms, key)) {
      rooms[key] = clampPresence(Number(rooms[key] || 0) * 0.82);
      state.presence = rooms;
      writePresence(rooms);
    }
  }

  function applyPresenceToMap() {
    var rooms = updatePresence(Date.now());
    applyPresenceValues(rooms);
  }

  function applyPresenceValues(rooms) {
    root.querySelectorAll('[data-desk-room-presence], [data-desk-room-dim]').forEach(function (node) {
      var room = node.getAttribute('data-desk-room-presence') || node.getAttribute('data-desk-room-dim') || '';
      node.style.setProperty('--presence', String(clampPresence(rooms[room])));
    });
  }

  function startPresenceTimer() {
    if (presenceTimer) {
      return;
    }
    state.presence = readPresence();
    state.presenceTick = Date.now();
    presenceTimer = window.setInterval(applyPresenceToMap, 1500);
  }

  function roomUrl(room) {
    var clean = String(room || '').trim();
    var encoded = clean.split('/').filter(Boolean).map(function (part) {
      return encodeURIComponent(part);
    }).join('/');
    return encoded ? '/' + encoded : '/';
  }

  function setRoom(room, replace) {
    var clean = String(room || '').trim();
    if (clean !== state.currentRoom) {
      dimPresenceForRoom(state.currentRoom);
      applyPresenceValues(state.presence);
      if (state.mode === 'map' || state.mode === 'todo' || state.mode === 'compose') {
        state.suppressMapAnimation = true;
      }
      state.mapZoomMode = 'room';
      state.mapPanX = 0;
      state.mapPanY = 0;
    }
    state.currentRoom = clean;
    var next = roomUrl(clean);
    if (replace) {
      window.history.replaceState({ room: clean }, '', next);
    } else {
      window.history.pushState({ room: clean }, '', next);
    }
    loadState();
  }

  function authPayload() {
    return {
      session_token: String(storageGet('session_token') || '').trim(),
      csrf_token: String(storageGet('csrf_token') || '').trim()
    };
  }

  function api(action, payload, options) {
    var body = new URLSearchParams();
    var auth = authPayload();
    var silentBusy = Boolean(options && options.silentBusy);
    body.set('session_token', auth.session_token);
    body.set('csrf_token', auth.csrf_token);
    body.set('action', action);
    body.set('visibility_threshold', String(state.threshold || 1));
    Object.keys(payload || {}).forEach(function (key) {
      if (payload[key] != null) {
        body.set(key, String(payload[key]));
      }
    });
    if (!silentBusy) {
      setBusy(true);
    }
    return fetch('/cgi/blog-desk', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString()
    }).then(function (response) {
      return response.json().catch(function () {
        return { success: false, error: 'Desk returned an unreadable response.' };
      });
    }).finally(function () {
      if (!silentBusy) {
        setBusy(false);
      }
    });
  }

  function setBusy(isBusy) {
    state.inFlight = Math.max(0, state.inFlight + (isBusy ? 1 : -1));
    if (!root) {
      return;
    }
    var busy = state.inFlight > 0;
    root.dataset.busy = busy ? 'true' : 'false';
    root.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function showMessage(message, isError) {
    var slot = root.querySelector('[data-desk-message]');
    if (!slot) {
      return;
    }
    if (messageTimer) {
      window.clearTimeout(messageTimer);
      messageTimer = null;
    }
    if (!message) {
      slot.innerHTML = '';
      return;
    }
    slot.innerHTML = '<p class="desk-message' + (isError ? ' is-error' : '') + '">' + escapeHtml(message) + '</p>';
    messageTimer = window.setTimeout(function () {
      var messageNode = slot.querySelector('.desk-message');
      if (messageNode) {
        messageNode.classList.add('is-leaving');
      }
      messageTimer = window.setTimeout(function () {
        slot.innerHTML = '';
        messageTimer = null;
      }, 220);
    }, isError ? 6500 : 3600);
  }

  function roomTone(room) {
    var text = String(room || 'office');
    var sum = 0;
    for (var i = 0; i < text.length; i += 1) {
      sum += text.charCodeAt(i);
    }
    return String(sum % 3);
  }

  function statusLabel(value) {
    if (value === 'available') return 'Online';
    if (value === 'offline') return 'Away';
    return 'Quiet';
  }

  function statusTitle(value, isCurrent) {
    var label = statusLabel(value);
    var detail = 'present, but visitor calls stay quiet';
    if (value === 'available') {
      detail = 'online; allow sparse visitor calls';
    } else if (value === 'offline') {
      detail = 'away; visitors cannot call';
    }
    return (isCurrent ? label + ': ' + detail : 'Set ' + label + ': ' + detail);
  }

  function statusIcon(value) {
    if (value === 'available') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.8"></circle><path d="M12 8.2v3.8l2.7 2.1"></path></svg>';
    }
    if (value === 'offline') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17.2c2.9 2.4 7.2 2.2 9.8-.4 2.6-2.6 2.8-6.9.4-9.8-1.7 4.3-5.9 8.5-10.2 10.2z"></path></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 10.5a3.8 3.8 0 0 1 7.6 0c0 4 1.7 4.6 1.7 4.6h-11s1.7-.6 1.7-4.6z"></path><path d="M10.8 18a1.6 1.6 0 0 0 2.4 0"></path><path d="M5.5 5.5l13 13"></path></svg>';
  }

  function statusButtons(data) {
    var current = state.pendingStatus || (data && data.status && data.status.online_status ? data.status.online_status : 'quiet');
    return '<div class="desk-status" aria-label="Desk status">' +
      ['available', 'quiet', 'offline'].map(function (value) {
        var label = statusLabel(value);
        var isCurrent = current === value;
        var title = statusTitle(value, isCurrent);
        return '<button type="button" class="desk-status-btn" data-desk-status="' + value + '" aria-label="' + escapeHtml(title) + '" title="' + escapeHtml(title) + '" aria-pressed="' + (isCurrent ? 'true' : 'false') + '">' + statusIcon(value) + '</button>';
      }).join('') +
      '</div>';
  }

  function applyDeskTooltips() {
    var specs = [
      ['[data-desk-login]', 'Sign in with the owner Nostr identity'],
      ['[data-desk-close-map]', 'Close the room map'],
      ['[data-desk-map-zoom]', 'Toggle between the full mansion map and a closeup of this room'],
      ['[data-desk-map-props]', 'Edit this room kind and color'],
      ['[data-desk-secret-passage]', 'Choose two rooms to connect with a secret passage'],
      ['[data-desk-create-room-open]', 'Create a room connected to this one'],
      ['[data-desk-close-todo]', 'Close the checklist'],
      ['[data-desk-close-compose]', 'Close the composition book'],
      ['[data-desk-compose-menu]', 'Document options'],
      ['[data-desk-compose-advanced]', 'Show paper and post-type controls'],
      ['[data-desk-doc-drag]', 'Drag this document onto a room to move it'],
      ['[data-desk-compose-paper]', 'Choose this paper style'],
      ['[data-desk-compose-type]', 'Choose this document type'],
      ['[data-desk-mode="map"]', 'Open the room map'],
      ['[data-desk-mode="compose"]', 'Open the composition book'],
      ['[data-desk-mode="todo"]', 'Open this room checklist'],
      ['[data-desk-task-action="vote"]', 'Upvote this task'],
      ['[data-desk-task-action="complete"]', 'Mark this task done'],
      ['[data-desk-task-action="archive"]', 'Archive this done task'],
      ['[data-desk-task-action="trash"]', 'Move this task to trash'],
      ['[data-desk-task-action="forget"]', 'Sleep this task for later'],
      ['[data-desk-task-action="remember"]', 'Return this slept task to the checklist'],
      ['[data-desk-task-menu]', 'Task options'],
      ['[data-desk-forgotten-toggle]', 'Show or hide slept tasks'],
      ['[data-desk-create-room-close]', 'Close create room'],
      ['[data-desk-compose-rename-close]', 'Close rename document'],
      ['[data-desk-clear-search]', 'Clear search results'],
      ['[data-desk-threshold]', 'Minimum upvotes for tasks surfaced on the map'],
      ['[data-desk-flashlight-strength]', 'How long room light lingers after activity'],
      ['.desk-map-room-title', 'Double-click to rename this room'],
      ['.desk-map-rename-input', 'Edit room name'],
      ['.desk-todo-add-textarea', 'Type a task and press Enter'],
      ['.desk-compose-textarea', 'Write in the composition book'],
      ['input[name="room_title"]', 'Room name'],
      ['select[name="room"]', 'Choose the room this connects from'],
      ['select[name="room_kind"]', 'Choose indoor or outdoor rendering'],
      ['input[name="room_color"]', 'Choose this room color'],
      ['input[name="doc_title"]', 'Document name']
    ];
    specs.forEach(function (spec) {
      root.querySelectorAll(spec[0]).forEach(function (node) {
        node.setAttribute('title', spec[1]);
        if (!node.getAttribute('aria-label') && /^(BUTTON|INPUT|TEXTAREA|SELECT)$/.test(node.tagName)) {
          node.setAttribute('aria-label', spec[1]);
        }
      });
    });
    root.querySelectorAll('button[aria-label], a[aria-label], input[aria-label], textarea[aria-label], select[aria-label]').forEach(function (node) {
      if (!node.getAttribute('title')) {
        node.setAttribute('title', node.getAttribute('aria-label') || '');
      }
    });
  }

  function handleStatusClick(status) {
    var value = status.getAttribute('data-desk-status') || 'quiet';
    if (value === state.pendingStatus || status.getAttribute('aria-pressed') === 'true') {
      showMessage(statusLabel(value) + ' is already selected.', false);
      return;
    }
    state.pendingStatus = value;
    if (state.data) {
      render(state.data);
    }
    api('set-status', {
      room: state.currentRoom,
      online_status: value
    }, { silentBusy: true }).then(function (data) {
      if (state.mode === 'map' || state.mode === 'todo' || state.mode === 'compose') {
        state.suppressMapAnimation = true;
      }
      if (state.pendingStatus === value) {
        state.pendingStatus = '';
      }
      if (!data || data.success === false) {
        if (state.data) {
          render(state.data);
        }
        showMessage(data && data.error ? data.error : 'Desk status failed.', true);
        return;
      }
      refreshFrom(data);
    }).catch(function (err) {
      if (state.pendingStatus === value) {
        state.pendingStatus = '';
      }
      showMessage(err && err.message ? err.message : 'Desk status failed.', true);
      if (state.data) {
        render(state.data);
      }
    });
  }

  function todoTypePrompt() {
    if (window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches) {
      return 'Tap to type';
    }
    return 'Click to type';
  }

  function resizeTodoAddTextarea(field) {
    if (!field) {
      return;
    }
    var lineHeight = parseFloat(window.getComputedStyle(field).lineHeight || '0') || 30;
    field.style.height = lineHeight + 'px';
    var nextLines = Math.max(1, Math.ceil(field.scrollHeight / lineHeight));
    field.style.height = (nextLines * lineHeight) + 'px';
  }

  function thresholdControl() {
    var values = [1, 2, 3, 5];
    if (values.indexOf(state.threshold) === -1) {
      values.push(state.threshold);
      values.sort(function (left, right) { return left - right; });
    }
    return '<label class="desk-threshold-control"><span>Surface at</span><select class="desk-select" data-desk-threshold aria-label="Surface threshold">' +
      values.map(function (value) {
        return '<option value="' + value + '"' + (value === state.threshold ? ' selected' : '') + '>+' + value + '</option>';
      }).join('') +
      '</select></label>';
  }

  function flashlightIcon(bright) {
    var beam = bright
      ? '<path class="desk-flashlight-beam" d="M14 10l11-5v22l-11-5z"></path>'
      : '<path class="desk-flashlight-beam" d="M14 12l8-3v14l-8-3z"></path>';
    return '<svg class="desk-flashlight-icon' + (bright ? ' is-bright' : '') + '" viewBox="0 0 32 32" aria-hidden="true"><path class="desk-flashlight-body" d="M4 12.2h7.3l4.2 2.8v2l-4.2 2.8H4z"></path>' + beam + '<path class="desk-flashlight-line" d="M6.5 15.8h5.7"></path></svg>';
  }

  function renderFlashlightControl() {
    var max = flashlightSteps.length - 1;
    var value = Math.max(0, Math.min(max, Number(state.flashlightStrength || 0)));
    return '<div class="desk-map-flashlight" aria-label="Room light persistence">' +
      flashlightIcon(false) +
      '<label class="desk-map-flashlight-control"><span class="desk-visually-hidden">Flashlight strength</span>' +
      '<input type="range" min="0" max="' + max + '" step="1" value="' + value + '" data-desk-flashlight-strength aria-label="Flashlight strength">' +
      '<span class="desk-flashlight-steps" aria-hidden="true">' + flashlightSteps.map(function (step) {
        return '<span>' + escapeHtml(step.label) + '</span>';
      }).join('') + '</span></label>' +
      flashlightIcon(true) +
      '</div>';
  }

  function syncDeskMenuSettings() {
    var panel = document.getElementById('nav-menu-panel');
    if (!panel) {
      return;
    }
    var deskLink = document.getElementById('nav-menu-desk-link');
    if (deskLink && deskLink.parentNode) {
      deskLink.parentNode.removeChild(deskLink);
    }
    var existing = panel.querySelector('[data-desk-menu-settings]');
    var html = '<div class="desk-menu-settings" data-desk-menu-settings role="none">' +
      '<h2 class="desk-menu-heading">Settings</h2>' +
      thresholdControl() +
      '</div>';
    if (existing) {
      existing.outerHTML = html;
      return;
    }
    panel.insertAdjacentHTML('beforeend', html);
  }

  function humanizePathPart(value) {
    return String(value || 'room').replace(/[-_]+/g, ' ').replace(/\b\w/g, function (letter) {
      return letter.toUpperCase();
    });
  }

  function roomPathLabel(room, roomsByPath) {
    var path = String(room && room.path || '');
    if (!path) {
      return 'Office';
    }
    var parts = path.split('/');
    return ['Office'].concat(parts.map(function (_part, index) {
      var partial = parts.slice(0, index + 1).join('/');
      var matched = roomsByPath[partial];
      return matched && matched.title ? matched.title : humanizePathPart(parts[index]);
    })).join(' → ');
  }

  function roomOptionRows(data, selected) {
    var rooms = [{ path: '', title: 'Office' }].concat((data && data.rooms) || []);
    var roomsByPath = {};
    rooms.forEach(function (room) {
      roomsByPath[String(room.path || '')] = room;
    });
    return rooms.map(function (room) {
      var path = String(room.path || '');
      return '<option value="' + escapeHtml(path) + '"' + (path === selected ? ' selected' : '') + '>' + escapeHtml(roomPathLabel(room, roomsByPath)) + '</option>';
    }).join('');
  }

  function roomImmediateOptionRows(data, selected) {
    var rooms = [{ path: '', title: 'Office' }].concat((data && data.rooms) || []);
    return rooms.map(function (room) {
      var path = String(room.path || '');
      var title = path ? String(room.title || humanizePathPart(path.split('/').pop())) : 'Office';
      return '<option value="' + escapeHtml(path) + '"' + (path === selected ? ' selected' : '') + '>' + escapeHtml(title) + '</option>';
    }).join('');
  }

  function moveOptionRows(data, currentRoom) {
    var current = String(currentRoom || '');
    var rooms = [{ path: '', title: 'Office' }].concat((data && data.rooms) || []);
    var roomsByPath = {};
    rooms.forEach(function (room) {
      roomsByPath[String(room.path || '')] = room;
    });
    var options = rooms.filter(function (room) {
      return String(room.path || '') !== current;
    });
    if (!options.length) {
      return '<option value="' + escapeHtml(current) + '">No other rooms</option>';
    }
    return options.map(function (room) {
      var path = String(room.path || '');
      return '<option value="' + escapeHtml(path) + '">' + escapeHtml(roomPathLabel(room, roomsByPath)) + '</option>';
    }).join('');
  }

  function heatWidth(heat) {
    var value = Math.max(8, Math.min(100, Number(heat || 0) * 10 + 8));
    return value + '%';
  }

  function hashText(value) {
    var text = String(value || 'office');
    var hash = 0;
    for (var i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function roomColor(room) {
    var value = String(room && room.color || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      return value;
    }
    var palette = ['#b85c6a', '#4f8fbd', '#d59a3a', '#6f77c8', '#3f9b73', '#b06ab3', '#c66f3d', '#5276ad'];
    return palette[hashText(room && room.path) % palette.length];
  }

  function roomKind(room) {
    return String(room && room.kind || '').trim().toLowerCase() === 'outdoor' ? 'outdoor' : 'indoor';
  }

  function roomIsOutdoor(room) {
    return roomKind(room) === 'outdoor';
  }

  function roomPathParent(path) {
    var text = String(path || '');
    if (!text || text.indexOf('/') === -1) {
      return '';
    }
    return text.split('/').slice(0, -1).join('/');
  }

  function mapRooms(data) {
    var office = Object.assign({}, data.office || {}, {
      path: '',
      title: (data.office && data.office.title) || 'Office',
      depth: 0,
      parent_path: ''
    });
    var rooms = [office].concat((data.rooms || []).map(function (room) {
      var path = String(room.path || '');
      return Object.assign({}, room, {
        path: path,
        parent_path: typeof room.parent_path === 'string' ? room.parent_path : roomPathParent(path)
      });
    }));
    rooms.sort(function (left, right) {
      var lp = String(left.path || '');
      var rp = String(right.path || '');
      if (lp === rp) return 0;
      if (lp === '') return -1;
      if (rp === '') return 1;
      return lp.localeCompare(rp);
    });
    return rooms;
  }

  function mansionLayout(rooms) {
    var layout = { '': { x: 0, y: 4, w: 1, h: 1, originX: 0, originY: 4, attachedTo: '' } };
    var occupied = { '0,4': '' };
    var footprints = { '': [{ x: 0, y: 4 }] };
    var doors = [];
    var directions = [
      { name: 'north', dx: 0, dy: -1, px: 1, py: 0 },
      { name: 'west', dx: -1, dy: 0, px: 0, py: -1 },
      { name: 'east', dx: 1, dy: 0, px: 0, py: 1 },
      { name: 'south', dx: 0, dy: 1, px: -1, py: 0 }
    ];
    var roomsByPath = {};
    var childrenByParent = {};
    rooms.forEach(function (room) {
      var path = String(room.path || '');
      var parentPath = path ? String(room.parent_path || '') : '';
      roomsByPath[path] = room;
      if (path) {
        if (!childrenByParent[parentPath]) childrenByParent[parentPath] = [];
        childrenByParent[parentPath].push(room);
      }
    });
    Object.keys(childrenByParent).forEach(function (parentPath) {
      childrenByParent[parentPath].sort(function (left, right) {
        return String(left.path || '').localeCompare(String(right.path || ''));
      });
    });

    function addFootprintCell(path, x, y) {
      if (!footprints[path]) {
        footprints[path] = [];
      }
      if (occupied[x + ',' + y] != null) {
        return false;
      }
      footprints[path].push({ x: x, y: y });
      occupied[x + ',' + y] = path;
      return true;
    }

    function updateBounds(path) {
      var cells = footprints[path] || [];
      var xs = cells.map(function (point) { return point.x; });
      var ys = cells.map(function (point) { return point.y; });
      layout[path].x = Math.min.apply(null, xs);
      layout[path].y = Math.min.apply(null, ys);
      layout[path].w = Math.max.apply(null, xs) - layout[path].x + 1;
      layout[path].h = Math.max.apply(null, ys) - layout[path].y + 1;
    }

    function cellFree(x, y) {
      return occupied[x + ',' + y] == null;
    }

    function cellFreeOrOwned(x, y, path) {
      var owner = occupied[x + ',' + y];
      return owner == null || owner === path;
    }

    function sideForDelta(dx, dy) {
      if (dx > 0) return 'east';
      if (dx < 0) return 'west';
      if (dy > 0) return 'south';
      return 'north';
    }

    function directionByName(name) {
      return directions.filter(function (direction) {
        return direction.name === name;
      })[0] || directions[0];
    }

    function rootDirectionNames() {
      return ['west', 'east', 'north', 'north', 'west', 'east', 'north', 'north'];
    }

    function directionNamesForParent(parentPath) {
      return parentPath ? ['west', 'east', 'north', 'south'] : rootDirectionNames();
    }

    function manorEntranceDirection(index) {
      var sequence = rootDirectionNames();
      return directionByName(sequence[index % sequence.length]);
    }

    function preferredSiblingSlot(parentPath, index) {
      if (!parentPath) {
        var rootDirections = rootDirectionNames();
        var rootName = rootDirections[index % rootDirections.length];
        var rootDirection = directionByName(rootName);
        return {
          direction: rootDirection,
          side: index % 2 === 0 ? -1 : 1
        };
      }
      var parent = layout[parentPath] || layout[''] || { w: 1, h: 1 };
      var wideParent = (parent.w || 1) >= (parent.h || 1);
      var pairSequence = wideParent
        ? ['north', 'south', 'west', 'east']
        : ['west', 'east', 'north', 'south'];
      var offset = hashText(parentPath || 'office') % 2;
      if (offset && pairSequence.length >= 2) {
        pairSequence = [pairSequence[1], pairSequence[0]].concat(pairSequence.slice(2));
      }
      return {
        direction: directionByName(pairSequence[index % pairSequence.length]),
        side: index % 2 === 0 ? -1 : 1
      };
    }

    function balancedWingDirection(parentPath, index) {
      if (!parentPath) {
        return manorEntranceDirection(index);
      }
      return preferredSiblingSlot(parentPath, index).direction;
    }

    function primaryWingDirection(parentPath) {
      return balancedWingDirection(parentPath, 0);
    }

    function roomBalanceScore(x, y) {
      var keys = Object.keys(occupied);
      var minX = x;
      var maxX = x;
      var minY = y;
      var maxY = y;
      keys.forEach(function (key) {
        var parts = key.split(',');
        var ox = Number(parts[0]);
        var oy = Number(parts[1]);
        minX = Math.min(minX, ox);
        maxX = Math.max(maxX, ox);
        minY = Math.min(minY, oy);
        maxY = Math.max(maxY, oy);
      });
      var centerX = (minX + maxX) / 2;
      var centerY = (minY + maxY) / 2;
      var manorEntranceBias = Math.abs(centerY + 0.35);
      var width = maxX - minX + 1;
      var height = maxY - minY + 1;
      var tallPenalty = Math.max(0, height - width * 0.72) * 4.5;
      var narrowReward = Math.max(0, width - height) * -0.2;
      return Math.abs(centerX) * 4 + manorEntranceBias * 3 + tallPenalty + narrowReward;
    }

    function rootCenteredSpreadScore(x, y) {
      var root = layout[''] || { originX: 0, originY: 0 };
      var rootX = Number.isFinite(root.originX) ? root.originX : 0;
      var rootY = Number.isFinite(root.originY) ? root.originY : 0;
      var dx = Math.abs(x - rootX);
      var dy = Math.abs(y - rootY);
      var longWingPenalty = Math.max(0, dx - 4) * 24 + Math.max(0, dy - 4) * 30;
      var tallMapPenalty = Math.max(0, dy - dx * 0.82 - 1.2) * 10;
      return longWingPenalty + tallMapPenalty;
    }

    function ownerAllowed(owner, allowedOwners) {
      return (allowedOwners || []).some(function (allowedOwner) {
        return String(allowedOwner || '') === String(owner || '');
      });
    }

    function doorlessWallPenalty(cells, allowedOwners) {
      var allowed = {};
      (allowedOwners || []).forEach(function (owner) {
        allowed[String(owner || '')] = true;
      });
      var penalty = 0;
      cells.forEach(function (cell) {
        directions.forEach(function (direction) {
          var owner = occupied[(cell.x + direction.dx) + ',' + (cell.y + direction.dy)];
          if (owner != null && !allowed[String(owner || '')]) {
            penalty += 48;
          }
        });
      });
      return penalty;
    }

    function symmetryFallbackPenalty(parentPath) {
      return roomIsOutdoor(roomsByPath[String(parentPath || '')]) ? 176 : 128;
    }

    function outdoorWrapPenalty(cells, roomPath, allowedOwners) {
      var room = roomsByPath[String(roomPath || '')] || {};
      if (roomIsOutdoor(room)) return 0;
      var penalty = 0;
      cells.forEach(function (cell) {
        directions.forEach(function (direction) {
          var owner = occupied[(cell.x + direction.dx) + ',' + (cell.y + direction.dy)];
          if (owner != null && !ownerAllowed(owner, allowedOwners) && roomIsOutdoor(roomsByPath[String(owner || '')])) {
            penalty += 120;
          }
        });
      });
      return penalty;
    }

    function symmetricCorridorCells(parentPath, direction, corridor) {
      var parent = layout[parentPath] || layout[''];
      var baseX = Number.isFinite(parent.originX) ? parent.originX : parent.x + Math.floor((parent.w - 1) / 2);
      var baseY = Number.isFinite(parent.originY) ? parent.originY : parent.y + Math.floor((parent.h - 1) / 2);
      var cells = corridor.slice();
      corridor.forEach(function (cell) {
        var mirrorX = baseX - (cell.x - baseX);
        var mirrorY = baseY - (cell.y - baseY);
        cells.push({ x: mirrorX, y: mirrorY });
      });
      if (direction.dx !== 0) {
        cells.push({ x: baseX, y: baseY - 1 });
        cells.push({ x: baseX, y: baseY + 1 });
      } else {
        cells.push({ x: baseX - 1, y: baseY });
        cells.push({ x: baseX + 1, y: baseY });
      }
      var seen = {};
      return cells.filter(function (cell) {
        var key = cell.x + ',' + cell.y;
        if (seen[key]) {
          return false;
        }
        seen[key] = true;
        return cell.x !== baseX || cell.y !== baseY;
      });
    }

    function canClaimCorridorCells(cells, parentPath, childPoint) {
      return cells.every(function (cell) {
        if (childPoint && cell.x === childPoint.x && cell.y === childPoint.y) {
          return false;
        }
        return cellFreeOrOwned(cell.x, cell.y, parentPath);
      });
    }

    function doorForAdjacentCells(parentPath, roomPath, parentCell, childCell) {
      var dx = childCell.x - parentCell.x;
      var dy = childCell.y - parentCell.y;
      var side = sideForDelta(dx, dy);
      return {
        from: parentPath,
        to: roomPath,
        side: side,
        child_side: sideForDelta(-dx, -dy),
        x: parentCell.x + (dx > 0 ? 1 : dx < 0 ? 0 : 0.5),
        y: parentCell.y + (dy > 0 ? 1 : dy < 0 ? 0 : 0.5)
      };
    }

    function compactAttachment(parentPath, index, roomPath) {
      var parentCells = (footprints[parentPath] || [layout[parentPath] || layout['']]).slice();
      var directionOrder = directionNamesForParent(parentPath);
      var offset = (index + hashText(parentPath || 'office')) % directionOrder.length;
      var candidates = [];
      directionOrder.forEach(function (_name, orderIndex) {
        var direction = directionByName(directionOrder[(orderIndex + offset) % directionOrder.length]);
        parentCells.forEach(function (cell) {
          var child = { x: cell.x + direction.dx, y: cell.y + direction.dy };
          if (!cellFree(child.x, child.y)) return;
          candidates.push({
            parentCell: { x: cell.x, y: cell.y },
            child: child,
            direction: direction,
            score: 80 + roomBalanceScore(child.x, child.y) + rootCenteredSpreadScore(child.x, child.y) + doorlessWallPenalty([child], [parentPath]) + outdoorWrapPenalty([child], roomPath, [parentPath]) + orderIndex * 0.7 + Math.abs(child.y) * 0.28
          });
        });
      });
      candidates.sort(function (left, right) {
        return left.score - right.score;
      });
      return candidates[0] || null;
    }

    function findCompactAttachment(parentPath, index, roomPath) {
      for (var offset = 0; offset < 24; offset += 1) {
        var compact = compactAttachment(parentPath, index + offset, roomPath);
        if (compact) return compact;
      }
      if (parentPath) {
        for (offset = 0; offset < 24; offset += 1) {
          compact = compactAttachment('', index + offset, roomPath);
          if (compact) return compact;
        }
      }
      return null;
    }

    function wingAttachment(parentPath, index, roomPath) {
      var directionNames = directionNamesForParent(parentPath);
      var offset = (index + hashText(parentPath || 'office')) % directionNames.length;
      var candidates = [];
      var preferred = preferredSiblingSlot(parentPath, index);
      directionNames.forEach(function (_name, orderIndex) {
        var direction = directionByName(directionNames[(orderIndex + offset) % directionNames.length]);
        for (var wingIndex = 0; wingIndex < 6; wingIndex += 1) {
          var attach = attachPoint(parentPath, direction, index + wingIndex, direction.name === preferred.direction.name ? preferred.side : null);
          var child = attach.child;
          if (!cellFree(child.x, child.y)) continue;
          var symmetricCorridor = symmetricCorridorCells(parentPath, direction, attach.corridor);
          var symmetricOpen = canClaimCorridorCells(symmetricCorridor, parentPath, child);
          var corridor = symmetricOpen ? symmetricCorridor : attach.corridor;
          if (!canClaimCorridorCells(corridor, parentPath, child)) continue;
          var directionPenalty = direction.name === preferred.direction.name ? -96 : 420 + orderIndex * 18;
          var sidePenalty = attach.side === preferred.side ? 0 : 120;
          candidates.push({
            parentCell: attach.hall,
            hall: attach.hall,
            child: child,
            corridor: corridor,
            symmetric: symmetricOpen,
            score: roomBalanceScore(child.x, child.y) + rootCenteredSpreadScore(child.x, child.y) + doorlessWallPenalty(corridor.concat([child]), [parentPath]) + outdoorWrapPenalty(corridor.concat([child]), roomPath, [parentPath]) + (symmetricOpen ? -42 : symmetryFallbackPenalty(parentPath)) + directionPenalty + sidePenalty + wingIndex * 0.42 + Math.abs(child.y) * 0.24
          });
        }
      });
      candidates.sort(function (left, right) {
        return left.score - right.score;
      });
      return candidates[0] || null;
    }

    function findWingAttachment(parentPath, index, roomPath) {
      for (var offset = 0; offset < 32; offset += 1) {
        var wing = wingAttachment(parentPath, index + offset, roomPath);
        if (wing) return wing;
      }
      if (parentPath) {
        for (offset = 0; offset < 32; offset += 1) {
          wing = wingAttachment('', index + offset, roomPath);
          if (wing) return wing;
        }
      }
      return null;
    }

    function globalAttachment(index, roomPath) {
      var candidates = [];
      Object.keys(occupied).forEach(function (key) {
        var owner = occupied[key];
        var parts = key.split(',');
        var parentCell = { x: Number(parts[0]), y: Number(parts[1]) };
        directions.forEach(function (direction, orderIndex) {
          var child = { x: parentCell.x + direction.dx, y: parentCell.y + direction.dy };
          if (!cellFree(child.x, child.y)) return;
          candidates.push({
            owner: owner,
            parentCell: parentCell,
            child: child,
            score: roomBalanceScore(child.x, child.y) + rootCenteredSpreadScore(child.x, child.y) + doorlessWallPenalty([child], [owner]) + outdoorWrapPenalty([child], roomPath, [owner]) + orderIndex * 0.9 + (index || 0) * 0.03
          });
        });
      });
      candidates.sort(function (left, right) {
        return left.score - right.score;
      });
      return candidates[0] || null;
    }

    function attachPoint(parentPath, direction, index, forcedSide) {
      var parent = layout[parentPath] || layout[''];
      var baseX = Number.isFinite(parent.originX) ? parent.originX : parent.x + Math.floor((parent.w - 1) / 2);
      var baseY = Number.isFinite(parent.originY) ? parent.originY : parent.y + Math.floor((parent.h - 1) / 2);
      var maxWingAlong = 4;
      var along = Math.min(maxWingAlong, Math.floor(index / 2) + 2);
      var side = forcedSide === -1 || forcedSide === 1 ? forcedSide : (index % 2 === 0 ? -1 : 1);
      var hallX = baseX + direction.dx * along;
      var hallY = baseY + direction.dy * along;
      var childX = hallX + direction.px * side;
      var childY = hallY + direction.py * side;
      var corridor = [];
      for (var step = 1; step <= along; step += 1) {
        corridor.push({ x: baseX + direction.dx * step, y: baseY + direction.dy * step });
      }
      for (var nudge = 0; nudge < maxWingAlong && along < maxWingAlong && (!cellFree(childX, childY) || corridor.some(function (cell) { return !cellFreeOrOwned(cell.x, cell.y, parentPath); })); nudge += 1) {
        along += 1;
        hallX = baseX + direction.dx * along;
        hallY = baseY + direction.dy * along;
        childX = hallX + direction.px * side;
        childY = hallY + direction.py * side;
        corridor = [];
        for (step = 1; step <= along; step += 1) {
          corridor.push({ x: baseX + direction.dx * step, y: baseY + direction.dy * step });
        }
      }
      return {
        hall: { x: hallX, y: hallY },
        child: { x: childX, y: childY },
        corridor: corridor,
        side: side,
        doorSide: sideForDelta(direction.px * side, direction.py * side),
        childSide: sideForDelta(direction.px * -side, direction.py * -side)
      };
    }

    function placeRoomAtAttachment(parentPath, roomPath, chosen, corridorCells, door) {
      if (!chosen || !cellFree(chosen.child.x, chosen.child.y)) {
        return false;
      }
      if (corridorCells && !canClaimCorridorCells(corridorCells, parentPath, chosen.child)) {
        return false;
      }
      (corridorCells || []).forEach(function (cell) {
        if (cellFree(cell.x, cell.y)) addFootprintCell(parentPath, cell.x, cell.y);
      });
      updateBounds(parentPath);
      layout[roomPath] = { x: chosen.child.x, y: chosen.child.y, w: 1, h: 1, originX: chosen.child.x, originY: chosen.child.y, attachedTo: parentPath };
      addFootprintCell(roomPath, chosen.child.x, chosen.child.y);
      doors.push(door);
      return true;
    }

    function placeChildRoom(parentPath, roomPath, index) {
      var wing = findWingAttachment(parentPath, index, roomPath);
      if (wing) {
        return placeRoomAtAttachment(
          parentPath,
          roomPath,
          { child: wing.child },
          wing.corridor,
          doorForAdjacentCells(parentPath, roomPath, wing.parentCell, wing.child)
        );
      }
      var compact = findCompactAttachment(parentPath, index, roomPath);
      if (compact) {
        return placeRoomAtAttachment(
          parentPath,
          roomPath,
          { child: compact.child },
          [],
          doorForAdjacentCells(parentPath, roomPath, compact.parentCell, compact.child)
        );
      }
      if (!compact) {
        var global = globalAttachment(index, roomPath);
        if (!global) return false;
        return placeRoomAtAttachment(
          global.owner,
          roomPath,
          { child: global.child },
          [],
          doorForAdjacentCells(global.owner, roomPath, global.parentCell, global.child)
        );
      }
      return false;
    }

    function placeSubtree(parentPath) {
      var children = childrenByParent[parentPath] || [];
      children.forEach(function (room, index) {
        var roomPath = String(room.path || '');
        if (!roomPath || layout[roomPath]) return;
        if (placeChildRoom(parentPath, roomPath, index)) {
          placeSubtree(roomPath);
        }
      });
    }

    placeSubtree('');
    rooms.forEach(function (room) {
      var roomPath = String(room.path || '');
      if (!roomPath || layout[roomPath]) return;
      var parentPath = layout[String(room.parent_path || '')] ? String(room.parent_path || '') : '';
      placeChildRoom(parentPath, roomPath, Object.keys(layout).length);
    });
    Object.keys(layout).forEach(updateBounds);
    return { cells: layout, doors: doors, occupied: occupied, footprints: footprints };
  }

  function exteriorSides(point, occupied, roomsByPath, room) {
    if (roomIsOutdoor(room)) {
      return { north: true, east: true, south: true, west: true };
    }
    function isExterior(dx, dy) {
      var neighbor = occupied[(point.x + dx) + ',' + (point.y + dy)];
      return neighbor == null || roomIsOutdoor(roomsByPath[neighbor]);
    }
    return {
      north: isExterior(0, -1),
      east: isExterior(1, 0),
      south: isExterior(0, 1),
      west: isExterior(-1, 0)
    };
  }

  function contourSegmentPath(from, to, unitW, unitH, seed, index, ornate, outward) {
    var x0 = from.x * unitW;
    var y0 = from.y * unitH;
    var x1 = to.x * unitW;
    var y1 = to.y * unitH;
    var dx = x1 - x0;
    var dy = y1 - y0;
    if (!ornate || (dx === 0 && dy === 0)) {
      return ' L ' + x1 + ' ' + y1;
    }
    var bay = 9 + (hashText(String(seed || 'room') + ':grid-wall:' + index) % 4);
    var inset = 13 + (hashText(String(seed || 'room') + ':grid-wall-deep:' + index) % 4);
    if (dy === 0 && Math.abs(dx) >= unitW) {
      var outY = outward && Number.isFinite(outward.y) && outward.y !== 0 ? Math.sign(outward.y) : (dx > 0 ? -1 : 1);
      var shallowY = y0 + outY * bay;
      var deepY = y0 + outY * inset;
      return ' L ' + (x0 + dx * 0.18) + ' ' + y0 +
        ' L ' + (x0 + dx * 0.24) + ' ' + shallowY +
        ' L ' + (x0 + dx * 0.42) + ' ' + shallowY +
        ' L ' + (x0 + dx * 0.48) + ' ' + y0 +
        ' L ' + (x0 + dx * 0.66) + ' ' + y0 +
        ' L ' + (x0 + dx * 0.72) + ' ' + deepY +
        ' L ' + (x0 + dx * 0.84) + ' ' + deepY +
        ' L ' + (x0 + dx * 0.9) + ' ' + y0 +
        ' L ' + x1 + ' ' + y1;
    }
    if (dx === 0 && Math.abs(dy) >= unitH) {
      var outX = outward && Number.isFinite(outward.x) && outward.x !== 0 ? Math.sign(outward.x) : (dy > 0 ? 1 : -1);
      var shallowX = x0 + outX * bay;
      var deepX = x0 + outX * inset;
      return ' L ' + x0 + ' ' + (y0 + dy * 0.2) +
        ' L ' + shallowX + ' ' + (y0 + dy * 0.28) +
        ' L ' + shallowX + ' ' + (y0 + dy * 0.46) +
        ' L ' + x0 + ' ' + (y0 + dy * 0.54) +
        ' L ' + x0 + ' ' + (y0 + dy * 0.72) +
        ' L ' + deepX + ' ' + (y0 + dy * 0.78) +
        ' L ' + deepX + ' ' + (y0 + dy * 0.9) +
        ' L ' + x1 + ' ' + y1;
    }
    return ' L ' + x1 + ' ' + y1;
  }

  function renderGreenbelt(cells, occupied, unitW, unitH) {
    if (!cells.length) return '';
    var edges = [];
    function addEdge(x1, y1, x2, y2) {
      edges.push({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
    }
    cells.forEach(function (cell) {
      if (occupied[cell.x + ',' + (cell.y - 1)] == null) {
        addEdge(cell.x, cell.y, cell.x + 1, cell.y);
      }
      if (occupied[(cell.x + 1) + ',' + cell.y] == null) {
        addEdge(cell.x + 1, cell.y, cell.x + 1, cell.y + 1);
      }
      if (occupied[cell.x + ',' + (cell.y + 1)] == null) {
        addEdge(cell.x + 1, cell.y + 1, cell.x, cell.y + 1);
      }
      if (occupied[(cell.x - 1) + ',' + cell.y] == null) {
        addEdge(cell.x, cell.y + 1, cell.x, cell.y);
      }
    });
    function pointKey(point) {
      return point.x + ',' + point.y;
    }
    function px(point) {
      return { x: point.x * unitW, y: point.y * unitH };
    }
    var adjacency = {};
    edges.forEach(function (edge, index) {
      var aKey = pointKey(edge.a);
      var bKey = pointKey(edge.b);
      if (!adjacency[aKey]) adjacency[aKey] = [];
      if (!adjacency[bKey]) adjacency[bKey] = [];
      adjacency[aKey].push({ index: index, point: edge.b, key: bKey });
      adjacency[bKey].push({ index: index, point: edge.a, key: aKey });
    });
    var visited = {};
    var loops = [];
    edges.forEach(function (edge, startIndex) {
      if (visited[startIndex]) {
        return;
      }
      var start = edge.a;
      var current = edge.b;
      var previousKey = pointKey(start);
      var currentKey = pointKey(current);
      var loop = [px(start), px(current)];
      visited[startIndex] = true;
      while (currentKey !== pointKey(start)) {
        var options = adjacency[currentKey] || [];
        var next = null;
        for (var i = 0; i < options.length; i += 1) {
          var candidate = options[i];
          if (visited[candidate.index]) {
            continue;
          }
          if (candidate.key === previousKey && options.length > 1) {
            continue;
          }
          next = candidate;
          break;
        }
        if (!next) {
          break;
        }
        visited[next.index] = true;
        previousKey = currentKey;
        current = next.point;
        currentKey = next.key;
        loop.push(px(current));
      }
      if (loop.length > 2) {
        loops.push(loop);
      }
    });
    var contourPaths = loops.map(function (loop, loopIndex) {
      var path = 'M ' + loop[0].x + ' ' + loop[0].y;
      for (var i = 1; i < loop.length; i += 1) {
        path += contourSegmentPath(
          { x: loop[i - 1].x / unitW, y: loop[i - 1].y / unitH },
          { x: loop[i].x / unitW, y: loop[i].y / unitH },
          unitW,
          unitH,
          'building-greenbelt-' + loopIndex,
          i,
          true
        );
      }
      return path + ' Z';
    }).join(' ');
    return '<g class="desk-map-greenbelt" aria-hidden="true">' +
      '<path class="desk-map-greenbelt-strip" d="' + contourPaths + '"></path>' +
      '</g>';
  }

  function outdoorFringePath(cells, occupied, roomsByPath, unitW, unitH) {
    var paths = [];
    var local = {};
    cells.forEach(function (cell) {
      local[cell.x + ',' + cell.y] = true;
    });
    function neighborIsOpen(x, y) {
      if (local[x + ',' + y]) return false;
      var owner = occupied[x + ',' + y];
      if (owner == null) return true;
      return false;
    }
    function addEdge(x1, y1, x2, y2) {
      var from = { x: x1, y: y1 };
      var to = { x: x2, y: y2 };
      var index = paths.length + 1;
      paths.push(
        'M ' + (from.x * unitW) + ' ' + (from.y * unitH) +
        contourSegmentPath(from, to, unitW, unitH, 'outdoor-fringe-' + index, index, false)
      );
    }
    cells.forEach(function (cell) {
      if (neighborIsOpen(cell.x, cell.y - 1)) addEdge(cell.x, cell.y, cell.x + 1, cell.y);
      if (neighborIsOpen(cell.x + 1, cell.y)) addEdge(cell.x + 1, cell.y, cell.x + 1, cell.y + 1);
      if (neighborIsOpen(cell.x, cell.y + 1)) addEdge(cell.x + 1, cell.y + 1, cell.x, cell.y + 1);
      if (neighborIsOpen(cell.x - 1, cell.y)) addEdge(cell.x, cell.y + 1, cell.x, cell.y);
    });
    return paths.join(' ');
  }

  function outdoorExposedOutlinePath(cells, occupied, roomsByPath, unitW, unitH) {
    var paths = [];
    var local = {};
    cells.forEach(function (cell) {
      local[cell.x + ',' + cell.y] = true;
    });
    function neighborShowsOutdoorEdge(x, y) {
      if (local[x + ',' + y]) return false;
      var owner = occupied[x + ',' + y];
      if (owner == null) return true;
      return roomIsOutdoor(roomsByPath[String(owner || '')]);
    }
    function addEdge(x1, y1, x2, y2) {
      paths.push('M ' + (x1 * unitW) + ' ' + (y1 * unitH) + ' L ' + (x2 * unitW) + ' ' + (y2 * unitH));
    }
    cells.forEach(function (cell) {
      if (neighborShowsOutdoorEdge(cell.x, cell.y - 1)) addEdge(cell.x, cell.y, cell.x + 1, cell.y);
      if (neighborShowsOutdoorEdge(cell.x + 1, cell.y)) addEdge(cell.x + 1, cell.y, cell.x + 1, cell.y + 1);
      if (neighborShowsOutdoorEdge(cell.x, cell.y + 1)) addEdge(cell.x + 1, cell.y + 1, cell.x, cell.y + 1);
      if (neighborShowsOutdoorEdge(cell.x - 1, cell.y)) addEdge(cell.x, cell.y + 1, cell.x, cell.y);
    });
    return paths.join(' ');
  }

  function footprintBounds(cells) {
    var xs = cells.map(function (point) { return point.x; });
    var ys = cells.map(function (point) { return point.y; });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function segmentHasDoor(from, to, doorSegments) {
    if (!doorSegments || !doorSegments.length) return false;
    var minX = Math.min(from.x, to.x);
    var maxX = Math.max(from.x, to.x);
    var minY = Math.min(from.y, to.y);
    var maxY = Math.max(from.y, to.y);
    return doorSegments.some(function (door) {
      if (!Number.isFinite(door.x) || !Number.isFinite(door.y)) return false;
      if (from.y === to.y && Math.abs(door.y - from.y) < 0.001) {
        return door.x > minX + 0.001 && door.x < maxX - 0.001;
      }
      if (from.x === to.x && Math.abs(door.x - from.x) < 0.001) {
        return door.y > minY + 0.001 && door.y < maxY - 0.001;
      }
      return false;
    });
  }

  function footprintContourPath(cells, unitW, unitH, seed, ornate, occupied, doorSegments) {
    if (!cells.length) return '';
    var local = {};
    cells.forEach(function (cell) {
      local[cell.x + ',' + cell.y] = true;
    });
    var edges = [];
    function addEdge(x1, y1, x2, y2) {
      edges.push({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
    }
    cells.forEach(function (cell) {
      if (!local[cell.x + ',' + (cell.y - 1)]) addEdge(cell.x, cell.y, cell.x + 1, cell.y);
      if (!local[(cell.x + 1) + ',' + cell.y]) addEdge(cell.x + 1, cell.y, cell.x + 1, cell.y + 1);
      if (!local[cell.x + ',' + (cell.y + 1)]) addEdge(cell.x + 1, cell.y + 1, cell.x, cell.y + 1);
      if (!local[(cell.x - 1) + ',' + cell.y]) addEdge(cell.x, cell.y + 1, cell.x, cell.y);
    });
    var byStart = {};
    edges.forEach(function (edge, index) {
      edge.index = index;
      var key = edge.a.x + ',' + edge.a.y;
      if (!byStart[key]) byStart[key] = [];
      byStart[key].push(edge);
    });
    var start = edges.slice().sort(function (left, right) {
      if (left.a.y !== right.a.y) return left.a.y - right.a.y;
      return left.a.x - right.a.x;
    })[0];
    var points = [start.a, start.b];
    var current = start.b;
    var visited = {};
    visited[start.index] = true;
    var guard = 0;
    while (guard < edges.length + 4) {
      guard += 1;
      if (current.x === points[0].x && current.y === points[0].y) {
        break;
      }
      var key = current.x + ',' + current.y;
      var choices = byStart[key] || [];
      var next = choices.filter(function (edge) {
        return !visited[edge.index];
      })[0];
      if (!next) break;
      visited[next.index] = true;
      if (next.b.x === points[0].x && next.b.y === points[0].y) {
        break;
      }
      points.push(next.b);
      current = next.b;
    }
    var path = 'M ' + (points[0].x * unitW) + ' ' + (points[0].y * unitH);
    function segmentPath(from, to, index) {
      var outsideDirection = null;
      function isOpenCell(x, y) {
        return !occupied || occupied[x + ',' + y] == null;
      }
      if (from.y === to.y) {
        var horizontalCellX = Math.floor(Math.min(from.x, to.x));
        var aboveY = from.y - 1;
        var belowY = from.y;
        if (isOpenCell(horizontalCellX, aboveY)) {
          outsideDirection = { x: 0, y: -1 };
        } else if (isOpenCell(horizontalCellX, belowY)) {
          outsideDirection = { x: 0, y: 1 };
        }
      } else if (from.x === to.x) {
        var verticalCellY = Math.floor(Math.min(from.y, to.y));
        var leftX = from.x - 1;
        var rightX = from.x;
        if (isOpenCell(leftX, verticalCellY)) {
          outsideDirection = { x: -1, y: 0 };
        } else if (isOpenCell(rightX, verticalCellY)) {
          outsideDirection = { x: 1, y: 0 };
        }
      }
      var isBuildingExterior = !occupied || outsideDirection !== null;
      var hasDoor = segmentHasDoor(from, to, doorSegments);
      return contourSegmentPath(from, to, unitW, unitH, seed, index, ornate && isBuildingExterior && !hasDoor, outsideDirection);
    }
    for (var p = 1; p < points.length; p += 1) {
      path += segmentPath(points[p - 1], points[p], p);
    }
    var finalPoint = points[points.length - 1];
    var firstPoint = points[0];
    if (finalPoint && firstPoint && (finalPoint.x !== firstPoint.x || finalPoint.y !== firstPoint.y)) {
      path += segmentPath(finalPoint, firstPoint, points.length);
    }
    return path + ' Z';
  }

  function architecturalRoomPath(x, y, w, h, exterior, seed) {
    var inset = 12 + (hashText(seed) % 5);
    var bay = 9 + (hashText(seed + ':bay') % 5);
    var path = 'M ' + x + ' ' + y;
    if (exterior.north) {
      path += ' H ' + (x + w * 0.18) + ' L ' + (x + w * 0.24) + ' ' + (y - bay) + ' H ' + (x + w * 0.42) + ' L ' + (x + w * 0.48) + ' ' + y +
        ' H ' + (x + w * 0.66) + ' L ' + (x + w * 0.72) + ' ' + (y - inset) + ' H ' + (x + w * 0.84) + ' L ' + (x + w * 0.9) + ' ' + y + ' H ' + (x + w);
    } else {
      path += ' H ' + (x + w);
    }
    if (exterior.east) {
      path += ' V ' + (y + h * 0.2) + ' L ' + (x + w + bay) + ' ' + (y + h * 0.28) + ' V ' + (y + h * 0.46) + ' L ' + (x + w) + ' ' + (y + h * 0.54) +
        ' V ' + (y + h * 0.72) + ' L ' + (x + w + inset) + ' ' + (y + h * 0.78) + ' V ' + (y + h * 0.9) + ' L ' + (x + w) + ' ' + (y + h);
    } else {
      path += ' V ' + (y + h);
    }
    if (exterior.south) {
      path += ' H ' + (x + w * 0.82) + ' L ' + (x + w * 0.76) + ' ' + (y + h + bay) + ' H ' + (x + w * 0.58) + ' L ' + (x + w * 0.52) + ' ' + (y + h) +
        ' H ' + (x + w * 0.34) + ' L ' + (x + w * 0.28) + ' ' + (y + h + inset) + ' H ' + (x + w * 0.16) + ' L ' + (x + w * 0.1) + ' ' + (y + h) + ' H ' + x;
    } else {
      path += ' H ' + x;
    }
    if (exterior.west) {
      path += ' V ' + (y + h * 0.8) + ' L ' + (x - bay) + ' ' + (y + h * 0.72) + ' V ' + (y + h * 0.54) + ' L ' + x + ' ' + (y + h * 0.46) +
        ' V ' + (y + h * 0.28) + ' L ' + (x - inset) + ' ' + (y + h * 0.22) + ' V ' + (y + h * 0.1) + ' L ' + x + ' ' + y;
    } else {
      path += ' V ' + y;
    }
    return path + ' Z';
  }

  function renderDoorGlyph(x, y, side, isSecret, isLastEntered) {
    var secretClass = isSecret ? ' desk-map-secret-door' : '';
    var enteredClass = isLastEntered ? ' is-last-entered' : '';
    var open = 13;
    var leaf = 24;
    var label = isSecret
      ? '<text class="desk-map-secret-door-label" x="' + x + '" y="' + (y + 5) + '" text-anchor="middle"' + (side === 'north' || side === 'south' ? ' transform="rotate(90 ' + x + ' ' + y + ')"' : '') + '>S</text>'
      : '';
    if (side === 'east' || side === 'west') {
      var xDirection = side === 'east' ? 1 : -1;
      var xLeaf = x + xDirection * leaf;
      return '<g class="desk-map-door' + secretClass + enteredClass + '"><path class="desk-map-door-gap" d="M ' + x + ' ' + (y - open) + ' V ' + (y + open) + '"></path><path class="desk-map-door-leaf" d="M ' + x + ' ' + (y + open) + ' L ' + xLeaf + ' ' + (y + open) + '"></path><path class="desk-map-door-swing" d="M ' + xLeaf + ' ' + (y + open) + ' Q ' + xLeaf + ' ' + y + ' ' + x + ' ' + (y - open) + '"></path>' + label + '</g>';
    }
    var yDirection = side === 'south' ? 1 : -1;
    var yLeaf = y + yDirection * leaf;
    return '<g class="desk-map-door' + secretClass + enteredClass + '"><path class="desk-map-door-gap" d="M ' + (x - open) + ' ' + y + ' H ' + (x + open) + '"></path><path class="desk-map-door-leaf" d="M ' + (x - open) + ' ' + y + ' L ' + (x - open) + ' ' + yLeaf + '"></path><path class="desk-map-door-swing" d="M ' + (x - open) + ' ' + yLeaf + ' Q ' + x + ' ' + yLeaf + ' ' + (x + open) + ' ' + y + '"></path>' + label + '</g>';
  }

  function isLastEnteredDoor(door) {
    var entered = state.lastEnteredDoor;
    if (!entered) return false;
    var from = String(door.from || '');
    var to = String(door.to || '');
    var enteredFrom = String(entered.from || '');
    var enteredTo = String(entered.to || '');
    return (from === enteredFrom && to === enteredTo) || (from === enteredTo && to === enteredFrom);
  }

  function renderDoor(door, layout, unitW, unitH) {
    var from = layout[door.from];
    var to = layout[door.to];
    if (!from || !to) return '';
    var isLastEntered = isLastEnteredDoor(door);
    if (Number.isFinite(door.x) && Number.isFinite(door.y)) {
      return renderDoorGlyph(door.x * unitW, door.y * unitH, door.side, false, isLastEntered);
    }
    var x;
    var y;
    if (door.side === 'east' || door.side === 'west') {
      x = (door.side === 'east' ? from.x + 1 : from.x) * unitW;
      y = (Math.max(from.y, to.y) * unitH) + unitH / 2;
      return renderDoorGlyph(x, y, door.side, false, isLastEntered);
    }
    x = (Math.max(from.x, to.x) * unitW) + unitW / 2;
    y = (door.side === 'south' ? from.y + 1 : from.y) * unitH;
    return renderDoorGlyph(x, y, door.side, false, isLastEntered);
  }

  function rootEntranceDoorSegment(layout, occupied) {
    var root = layout[''];
    if (!root || !Number.isFinite(root.originX) || !Number.isFinite(root.originY)) return null;
    if (occupied[root.originX + ',' + (root.originY + 1)] != null) return null;
    return { x: root.originX + 0.5, y: root.originY + 1 };
  }

  function renderRootEntranceDoor(layout, occupied, unitW, unitH) {
    var entrance = rootEntranceDoorSegment(layout, occupied);
    if (!entrance) return '';
    var x = entrance.x * unitW;
    var y = entrance.y * unitH;
    var opening = 22;
    var leaf = 26;
    return '<g class="desk-map-door desk-map-entrance-door"><path class="desk-map-door-gap" d="M ' + (x - opening) + ' ' + y + ' H ' + (x + opening) + '"></path><path class="desk-map-door-leaf" d="M ' + (x - 3) + ' ' + y + ' L ' + (x - opening) + ' ' + (y + leaf) + '"></path><path class="desk-map-door-leaf" d="M ' + (x + 3) + ' ' + y + ' L ' + (x + opening) + ' ' + (y + leaf) + '"></path><path class="desk-map-door-swing" d="M ' + (x - opening) + ' ' + (y + leaf) + ' Q ' + (x - opening) + ' ' + y + ' ' + x + ' ' + y + '"></path><path class="desk-map-door-swing" d="M ' + (x + opening) + ' ' + (y + leaf) + ' Q ' + (x + opening) + ' ' + y + ' ' + x + ' ' + y + '"></path></g>';
  }

  function secretDoorPoint(room, target, unitW, unitH) {
    var centerX = room.x * unitW + (room.w || 1) * unitW / 2;
    var centerY = room.y * unitH + (room.h || 1) * unitH / 2;
    var targetX = target.x * unitW + (target.w || 1) * unitW / 2;
    var targetY = target.y * unitH + (target.h || 1) * unitH / 2;
    var dx = targetX - centerX;
    var dy = targetY - centerY;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return {
        x: centerX + (dx >= 0 ? (room.w || 1) * unitW / 2 : -(room.w || 1) * unitW / 2),
        y: centerY,
        side: dx >= 0 ? 'east' : 'west'
      };
    }
    return {
      x: centerX,
      y: centerY + (dy >= 0 ? (room.h || 1) * unitH / 2 : -(room.h || 1) * unitH / 2),
      side: dy >= 0 ? 'south' : 'north'
    };
  }

  function renderSecretPassageParts(passage, layout, unitW, unitH) {
    var from = layout[String(passage.from || '')];
    var to = layout[String(passage.to || '')];
    if (!from || !to) return { line: '', doors: '' };
    var first = secretDoorPoint(from, to, unitW, unitH);
    var second = secretDoorPoint(to, from, unitW, unitH);
    var x1 = first.x;
    var y1 = first.y;
    var x2 = second.x;
    var y2 = second.y;
    var cx = (x1 + x2) / 2;
    var cy = (y1 + y2) / 2 - 42;
    return {
      line: '<path class="desk-map-secret-passage" d="M ' + x1 + ' ' + y1 + ' Q ' + cx + ' ' + cy + ' ' + x2 + ' ' + y2 + '"></path>',
      doors: renderDoorGlyph(first.x, first.y, first.side, true, false) + renderDoorGlyph(second.x, second.y, second.side, true, false)
    };
  }

  function renderMap(data) {
    var presence = updatePresence(Date.now());
    var rooms = mapRooms(data);
    var plan = mansionLayout(rooms);
    var layout = plan.cells;
    var unitW = 168;
    var unitH = 112;
    var cells = Object.keys(plan.occupied).map(function (key) {
      var parts = key.split(',');
      return { x: Number(parts[0]), y: Number(parts[1]) };
    });
    var minX = Math.min.apply(null, cells.map(function (cell) { return cell.x; }));
    var maxX = Math.max.apply(null, cells.map(function (cell) { return cell.x + 1; }));
    var minY = Math.min.apply(null, cells.map(function (cell) { return cell.y; }));
    var maxY = Math.max.apply(null, cells.map(function (cell) { return cell.y + 1; }));
    var rootCell = layout[''] || { originX: 0, originY: 0 };
    var rootCenterX = (Number.isFinite(rootCell.originX) ? rootCell.originX : 0) + 0.5;
    var rootCenterY = (Number.isFinite(rootCell.originY) ? rootCell.originY : 0) + 0.5;
    var halfMapWidth = Math.max(rootCenterX - minX, maxX - rootCenterX);
    var desiredRootYRatio = 0.62;
    var actualTopSpan = rootCenterY - minY;
    var actualBottomSpan = maxY - rootCenterY;
    var biasedTopSpan = actualBottomSpan * (desiredRootYRatio / (1 - desiredRootYRatio));
    var rootTopSpan = Math.max(actualTopSpan, Math.min(biasedTopSpan, actualTopSpan + 2));
    var rootBottomSpan = Math.max(actualBottomSpan, rootTopSpan * ((1 - desiredRootYRatio) / desiredRootYRatio));
    var pad = 70;
    var viewX = (rootCenterX - halfMapWidth) * unitW - pad;
    var viewY = (rootCenterY - rootTopSpan) * unitH - pad;
    var viewW = halfMapWidth * 2 * unitW + pad * 2;
    var viewH = (rootTopSpan + rootBottomSpan) * unitH + pad * 2;
    var fullViewBox = { x: viewX, y: viewY, w: viewW, h: viewH };
    var roomsByPath = {};
    rooms.forEach(function (item) {
      roomsByPath[String(item.path || '')] = item;
    });
    var renderRooms = rooms.filter(function (room) {
      return !!layout[String(room.path || '')];
    });
    var currentPath = String(state.currentRoom || '');
    var currentRoom = roomsByPath[currentPath] || roomsByPath[''] || { path: '', title: 'Office', kind: 'indoor', color: '#4f8fbd' };
    function closeupViewBoxForRoom(path) {
      var panX = arguments.length > 1 ? Number(arguments[1] || 0) : Number(state.mapPanX || 0);
      var panY = arguments.length > 2 ? Number(arguments[2] || 0) : Number(state.mapPanY || 0);
      var roomCell = layout[path] || layout[''];
      var footprint = plan.footprints[path] || (roomCell ? [roomCell] : []);
      if (!footprint.length) {
        return fullViewBox;
      }
      var bounds = footprintBounds(footprint);
      var aspect = fullViewBox.w / fullViewBox.h;
      var closePadX = unitW * 0.56;
      var closePadY = unitH * 0.72;
      var width = Math.max(unitW * 2.35, bounds.w * unitW + closePadX * 2);
      var height = Math.max(unitH * 2.35, bounds.h * unitH + closePadY * 2);
      if (width / height > aspect) {
        height = width / aspect;
      } else {
        width = height * aspect;
      }
      width = Math.min(fullViewBox.w, width);
      height = Math.min(fullViewBox.h, height);
      var centerX = (bounds.x + bounds.w / 2) * unitW + panX;
      var centerY = (bounds.y + bounds.h / 2) * unitH + panY;
      var x = centerX - width / 2;
      var y = centerY - height / 2;
      x = Math.max(fullViewBox.x, Math.min(fullViewBox.x + fullViewBox.w - width, x));
      y = Math.max(fullViewBox.y, Math.min(fullViewBox.y + fullViewBox.h - height, y));
      return { x: x, y: y, w: width, h: height };
    }
    var mapViewBox = state.mapZoomMode === 'room' ? closeupViewBoxForRoom(currentPath) : fullViewBox;
    var roomViewBox = closeupViewBoxForRoom(currentPath, 0, 0);
    function roomClipId(path) {
      return 'desk-room-presence-clip-' + hashText(path || 'office');
    }
    var buildingOccupied = {};
    var buildingCells = [];
    Object.keys(plan.occupied).forEach(function (key) {
      var owner = String(plan.occupied[key] || '');
      if (roomIsOutdoor(roomsByPath[owner])) {
        return;
      }
      buildingOccupied[key] = owner;
      var parts = key.split(',');
      buildingCells.push({ x: Number(parts[0]), y: Number(parts[1]) });
    });
    var greenbelt = renderGreenbelt(buildingCells, buildingOccupied, unitW, unitH);
    function doorSegmentsForRoom(path) {
      var segments = plan.doors.filter(function (door) {
        return String(door.from || '') === path || String(door.to || '') === path;
      }).map(function (door) {
        return { x: Number(door.x), y: Number(door.y) };
      });
      if (path === '') {
        var entrance = rootEntranceDoorSegment(layout, plan.occupied);
        if (entrance) segments.push(entrance);
      }
      return segments;
    }
    var roomClipPaths = renderRooms.map(function (room) {
      var path = String(room.path || '');
      var footprint = plan.footprints[path] || [layout[path]];
      var roomDoorSegments = doorSegmentsForRoom(path);
      var bounds = footprintBounds(footprint);
      var x = bounds.x * unitW;
      var y = bounds.y * unitH;
      var w = bounds.w * unitW;
      var h = bounds.h * unitH;
      var overlayPad = Math.max(unitW, unitH);
      var overlayX = x - overlayPad;
      var overlayY = y - overlayPad;
      var overlayW = w + overlayPad * 2;
      var overlayH = h + overlayPad * 2;
      var contour = roomIsOutdoor(room)
        ? footprintContourPath(footprint, unitW, unitH, path || 'office', false, null, roomDoorSegments)
        : footprintContourPath(footprint, unitW, unitH, path || 'office', true, buildingOccupied, roomDoorSegments);
      if (roomIsOutdoor(room)) {
        return '<clipPath id="' + roomClipId(path) + '"><path d="' + contour + '"></path></clipPath>';
      }
      return '<clipPath id="' + roomClipId(path) + '"><path d="' + contour + '"></path></clipPath>';
    }).join('');
    var roomParts = renderRooms.map(function (room) {
      var path = String(room.path || '');
      var footprint = plan.footprints[path] || [layout[path]];
      var bounds = footprintBounds(footprint);
      var x = bounds.x * unitW;
      var y = bounds.y * unitH;
      var w = bounds.w * unitW;
      var h = bounds.h * unitH;
      var overlayPad = Math.max(unitW, unitH);
      var overlayX = x - overlayPad;
      var overlayY = y - overlayPad;
      var overlayW = w + overlayPad * 2;
      var overlayH = h + overlayPad * 2;
      var origin = layout[path] || {};
      var labelX = (Number.isFinite(origin.originX) ? origin.originX : bounds.x) * unitW + unitW / 2;
      var labelY = (Number.isFinite(origin.originY) ? origin.originY : bounds.y) * unitH + unitH / 2;
      var isCurrent = path === String(state.currentRoom || '');
      var isPassageSource = state.secretPassageSource === path;
      var title = room.title || 'Room';
      var visibleCount = Number(room.visible_task_count || 0);
      var countLabel = visibleCount > 0
        ? '<text class="desk-map-room-meta" x="' + labelX + '" y="' + (labelY + 27) + '" text-anchor="middle">' + escapeHtml(visibleCount) + '</text>'
        : '';
      var isOutdoor = roomIsOutdoor(room);
      var roomDoorSegments = doorSegmentsForRoom(path);
      var roomPathShape = isOutdoor
        ? footprintContourPath(footprint, unitW, unitH, path || 'office', false, null, roomDoorSegments)
        : footprintContourPath(footprint, unitW, unitH, path || 'office', true, buildingOccupied, roomDoorSegments);
      var roomPassiveOutlineShape = isOutdoor
        ? outdoorExposedOutlinePath(footprint, plan.occupied, roomsByPath, unitW, unitH)
        : roomPathShape;
      var outdoorFringe = isOutdoor ? outdoorFringePath(footprint, plan.occupied, roomsByPath, unitW, unitH) : '';
      var backgroundShape = isOutdoor
        ? '<g class="desk-map-room-grass-area"><path class="desk-map-room-grass-edge desk-map-room-grass-edge-soft" d="' + outdoorFringe + '"></path><path class="desk-map-room-grass" d="' + roomPathShape + '"></path><path class="desk-map-room-grass-edge desk-map-room-grass-edge-core" d="' + outdoorFringe + '"></path></g>'
        : '';
      var roomShape = isOutdoor
        ? '<path class="desk-map-room-outdoor-hit" d="' + roomPathShape + '"></path>'
        : '<path class="desk-map-room-shape" d="' + roomPathShape + '"></path>';
      var currentTint = isCurrent
        ? (isOutdoor
          ? '<path class="desk-map-room-current-tint" fill="' + escapeHtml(roomColor(room)) + '" d="' + roomPathShape + '"></path>'
          : '<path class="desk-map-room-current-tint" fill="' + escapeHtml(roomColor(room)) + '" d="' + roomPathShape + '"></path>')
        : '';
      var hoverTint = '<path class="desk-map-room-hover-tint" fill="' + escapeHtml(roomColor(room)) + '" d="' + roomPathShape + '"></path>';
      var dimLayer = '<rect class="desk-map-room-dim' + (isOutdoor ? ' is-outdoor' : '') + '" data-desk-room-dim="' + escapeHtml(path) + '" style="--presence:' + escapeHtml(clampPresence(presence[path])) + '" clip-path="url(#' + roomClipId(path) + ')" x="' + overlayX + '" y="' + overlayY + '" width="' + overlayW + '" height="' + overlayH + '"></rect>';
      var presenceGlow = '<rect class="desk-map-room-presence' + (isOutdoor ? ' is-outdoor' : '') + '" data-desk-room-presence="' + escapeHtml(path) + '" style="--presence:' + escapeHtml(clampPresence(presence[path])) + '" clip-path="url(#' + roomClipId(path) + ')" x="' + overlayX + '" y="' + overlayY + '" width="' + overlayW + '" height="' + overlayH + '"></rect>';
      var titleNode = state.mapRenameRoom !== null && state.mapRenameRoom === path
        ? '<foreignObject x="' + (labelX - unitW / 2 + 18) + '" y="' + (labelY - 20) + '" width="' + (unitW - 36) + '" height="36"><form xmlns="http://www.w3.org/1999/xhtml" class="desk-map-rename-form" data-desk-form="rename-room-inline"><input type="hidden" name="room" value="' + escapeHtml(path) + '"><input class="desk-map-rename-input" name="room_title" value="' + escapeHtml(state.mapRenameValue || title) + '" maxlength="96" required></form></foreignObject>'
        : '<text class="desk-map-room-title" x="' + labelX + '" y="' + (labelY + 5) + '" text-anchor="middle" tabindex="0">' + escapeHtml(title) + '</text>';
      var foregroundShape = '<a href="' + escapeHtml(room.url || roomUrl(path)) + '" data-desk-room-link="' + escapeHtml(path) + '" data-desk-room-drop="' + escapeHtml(path) + '"' + (path ? ' draggable="false"' : '') + ' class="desk-map-room-link' + (isCurrent ? ' is-current' : '') + '">' +
        '<g class="desk-map-room' + (isOutdoor ? ' is-outdoor' : '') + (isCurrent ? ' is-current' : '') + (isPassageSource ? ' is-passage-source' : '') + '" style="--room-color:' + escapeHtml(roomColor(room)) + '">' +
        roomShape +
        dimLayer +
        currentTint +
        hoverTint +
        presenceGlow +
        titleNode +
        countLabel +
        '</g>' +
        '</a>';
      var outlineShape = '<path class="desk-map-room-outline' + (isCurrent ? ' is-current' : '') + (isPassageSource ? ' is-passage-source' : '') + '" data-desk-room-outline="' + escapeHtml(path) + '" style="--room-color:' + escapeHtml(roomColor(room)) + '" d="' + roomPassiveOutlineShape + '"></path>';
      var hoverOutlineShape = '<path class="desk-map-room-outline desk-map-room-hover-outline" data-desk-room-hover-outline="' + escapeHtml(path) + '" style="--room-color:' + escapeHtml(roomColor(room)) + '" d="' + roomPathShape + '"></path>';
      return { background: backgroundShape, foreground: foregroundShape, outline: outlineShape, hoverOutline: hoverOutlineShape };
    });
    var outdoorBackgroundShapes = roomParts.map(function (part) { return part.background; }).join('');
    var roomShapes = roomParts.map(function (part) { return part.foreground; }).join('');
    var roomOutlines = roomParts.map(function (part) { return part.outline; }).join('');
    var roomHoverOutlines = roomParts.map(function (part) { return part.hoverOutline; }).join('');
    var doorShapes = plan.doors.map(function (door) {
      return renderDoor(door, layout, unitW, unitH);
    }).join('');
    var entranceDoorShape = renderRootEntranceDoor(layout, plan.occupied, unitW, unitH);
    var passageParts = ((data && data.secret_passages) || []).map(function (passage) {
      return renderSecretPassageParts(passage, layout, unitW, unitH);
    });
    var passageShapes = passageParts.map(function (part) { return part.line; }).join('');
    var passageDoorShapes = passageParts.map(function (part) { return part.doors; }).join('');
    var propsPanel = state.mapPropsOpen
      ? '<aside class="desk-map-properties" aria-label="Room properties"><form class="desk-map-properties-form" data-desk-form="room-properties"><input type="hidden" name="room" value="' + escapeHtml(currentRoom.path || '') + '"><label><span>Kind</span><select class="desk-map-prop-select" name="room_kind"><option value="indoor"' + (roomKind(currentRoom) === 'indoor' ? ' selected' : '') + '>Indoor</option><option value="outdoor"' + (roomKind(currentRoom) === 'outdoor' ? ' selected' : '') + '>Outdoor</option></select></label><label><span>Color</span><input class="desk-map-prop-color" type="color" name="room_color" value="' + escapeHtml(roomColor(currentRoom)) + '"></label><div class="desk-map-properties-actions"><button type="submit" class="desk-map-prop-save">Apply</button></div></form></aside>'
      : '';
    var mapAspect = fullViewBox.w && fullViewBox.h ? (fullViewBox.w / fullViewBox.h).toFixed(5) : '1.33333';
    var viewBoxText = formatViewBox(mapViewBox);
    var zoomLabel = state.mapZoomMode === 'room' ? 'Show whole map' : 'Zoom to current room';
    return '<section class="desk-mode-panel desk-map-panel' + (state.closingMode === 'map' ? ' is-closing' : '') + (state.suppressMapAnimation ? ' is-steady' : '') + '" aria-label="Room map" style="--desk-map-aspect:' + escapeHtml(mapAspect) + ';">' +
      '<div class="desk-map-scroll' + (state.mapZoomMode === 'room' ? ' is-closeup' : '') + '" aria-label="Desk mansion map">' +
      '<svg class="desk-map-svg" data-desk-map-svg data-desk-full-viewbox="' + escapeHtml(formatViewBox(fullViewBox)) + '" data-desk-room-viewbox="' + escapeHtml(formatViewBox(roomViewBox)) + '" viewBox="' + viewBoxText + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Top-down mansion map of Desk rooms">' +
      '<defs><filter id="desk-map-greenery-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8"></feGaussianBlur></filter><linearGradient id="desk-map-greenbelt-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6f7f55" stop-opacity="0.28"></stop><stop offset="0.28" stop-color="#87936a" stop-opacity="0.82"></stop><stop offset="0.62" stop-color="#94a373" stop-opacity="0.72"></stop><stop offset="1" stop-color="#6f7f55" stop-opacity="0.18"></stop></linearGradient><radialGradient id="desk-map-presence-glow" cx="50%" cy="47%" r="76%"><stop offset="0" stop-color="#ffce76" stop-opacity="0.92"></stop><stop offset="0.42" stop-color="#ffbe5c" stop-opacity="0.38"></stop><stop offset="1" stop-color="#ffb14b" stop-opacity="0"></stop></radialGradient><linearGradient id="desk-map-presence-glow-outdoor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffeaa2" stop-opacity="0.38"></stop><stop offset="0.55" stop-color="#ffd66f" stop-opacity="0.22"></stop><stop offset="1" stop-color="#f3c65f" stop-opacity="0.08"></stop></linearGradient><pattern id="desk-map-parchment-texture" width="96" height="96" patternUnits="userSpaceOnUse"><rect width="96" height="96" fill="#dcc17f"></rect><path d="M20 0v96M68 0v96M0 31h96M0 77h96" stroke="rgba(255,244,194,0.07)" stroke-width="1" fill="none"></path></pattern><pattern id="desk-map-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" stroke="rgba(84,55,28,0.23)" stroke-width="1" fill="none"></path></pattern><pattern id="desk-map-room-paper" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="#d7b46f"></rect><path d="M 28 0 L 0 0 0 28" stroke="rgba(84,55,28,0.23)" stroke-width="1" fill="none"></path></pattern><pattern id="desk-map-grass" width="72" height="72" patternUnits="userSpaceOnUse"><rect width="72" height="72" fill="#87936a"></rect><path d="M8 16c7-4 12-4 19 0M38 13c8-5 14-3 22 1M12 43c10-5 18-4 27 1M46 49c7-4 12-4 18 0" stroke="rgba(74,81,49,0.16)" stroke-width="2.2" fill="none" stroke-linecap="round"></path><path d="M4 68h68M0 28h72" stroke="rgba(206,199,137,0.1)" stroke-width="1" fill="none"></path></pattern>' + roomClipPaths + '</defs>' +
      '<rect class="desk-map-grid" x="' + fullViewBox.x + '" y="' + fullViewBox.y + '" width="' + fullViewBox.w + '" height="' + fullViewBox.h + '"></rect>' +
      greenbelt + outdoorBackgroundShapes + passageShapes + '<g class="desk-map-room-layer">' + roomShapes + '</g><g class="desk-map-door-layer">' + doorShapes + entranceDoorShape + passageDoorShapes + '</g><g class="desk-map-room-outline-layer">' + roomOutlines + '</g><g class="desk-map-room-hover-outline-layer">' + roomHoverOutlines + '</g>' +
      '</svg>' +
      '<button type="button" class="desk-map-close" data-desk-close-map aria-label="Close map" title="Close map">×</button>' +
      '<button type="button" class="desk-map-zoom-btn' + (state.mapZoomMode === 'room' ? ' is-active' : '') + '" data-desk-map-zoom aria-label="' + escapeHtml(zoomLabel) + '" title="' + escapeHtml(zoomLabel) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.4" cy="10.4" r="5.7"></circle><path d="M14.7 14.7 20 20"></path><path d="M10.4 7.8v5.2M7.8 10.4H13"></path></svg></button>' +
      '<button type="button" class="desk-map-props-btn' + (state.mapPropsOpen ? ' is-active' : '') + '" data-desk-map-props aria-label="Room properties" title="Room properties"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="desk-blueprint-sheet" d="M5 3.8h10.3L19 7.5v12.7H5z"></path><path class="desk-blueprint-fold" d="M15.3 3.8v4h3.9"></path><path class="desk-blueprint-grid" d="M8 9.2h8M8 13h8M8 16.8h4M9.7 7v12M14.4 9.2v9.8"></path><path class="desk-blueprint-mark" d="M13.1 16.8l1.4 1.4 2.8-3.2"></path></svg></button>' +
      propsPanel +
      '<button type="button" class="desk-map-passage-btn' + (state.secretPassageSource !== null ? ' is-active' : '') + '" data-desk-secret-passage aria-label="Create secret passage" title="Create secret passage"><svg viewBox="0 0 32 32" aria-hidden="true"><g class="desk-passage-books"><path class="desk-passage-book side left" d="M7 8h5v16H7z"></path><path class="desk-passage-book-cover desk-passage-book middle" d="M13.5 6.5h5v18.5h-5z"></path><path class="desk-passage-book side right" d="M20 8h5v16h-5z"></path><path class="desk-passage-book-line" d="M9.5 11.5h0M16 10.5h0M22.5 11.5h0M9.5 20.5h0M16 21.5h0M22.5 20.5h0"></path></g></svg></button>' +
      renderFlashlightControl() +
      '<button type="button" class="desk-map-create-btn" data-desk-create-room-open aria-label="Create room">+</button>' +
      '</div>' +
      (state.createRoomOpen ? renderCreateRoomModal(data) : '') +
      '</section>';
  }

  function renderTodo(data) {
    var room = data.current_room || data.office || {};
    var tasks = data.tasks || [];
    var visibleTasks = state.showSurfacedOnly ? tasks.filter(taskIsSurfaced) : tasks;
    var done = data.done_tasks || [];
    var forgotten = data.forgotten_tasks || [];
    var files = data.documents || [];
    var forgottenLines = state.forgottenOpen ? forgotten.length + 3 : (forgotten.length ? 1 : 0);
    var todoLines = Math.max(10, Math.min(28, 4 + visibleTasks.length + forgottenLines + 1 + (done.length ? done.length : 0)));
    var taskList = visibleTasks.length ? '<ul class="desk-task-list desk-notebook-list">' + visibleTasks.map(notebookTaskItem).join('') + '</ul>' : '';
    var forgottenList = renderForgottenTasks(forgotten);
    var doneList = done.length ? '<ul class="desk-done-list">' + done.map(function (task) {
      return '<li class="desk-task"><h3>' + escapeHtml(task.title || 'Task') + '</h3>' + (task.body ? '<p class="desk-task-body">' + escapeHtml(task.body) + '</p>' : '') + taskMeta(task) +
        '<div class="desk-task-actions"><button type="button" class="desk-btn subtle" data-desk-task-action="restore" data-room="' + escapeHtml(task.room || '') + '" data-task-id="' + escapeHtml(task.id || '') + '">Restore</button></div></li>';
    }).join('') + '</ul>' : '';
    var addPrompt = todoTypePrompt();
    var filesPanel = files.length
      ? '<aside class="desk-files-frame" aria-label="Files"><h3>Files</h3><ul class="desk-files-list">' + files.map(function (doc) {
        return '<li><button type="button" class="desk-file-link" data-desk-open-doc="' + escapeHtml(doc.id || '') + '">' + escapeHtml(doc.title || doc.id || 'Untitled') + '</button></li>';
      }).join('') + '</ul></aside>'
      : '';
    return '<section class="desk-mode-panel desk-todo-panel' + (state.closingMode === 'todo' ? ' is-closing' : '') + (state.suppressTodoAnimation ? ' is-steady' : '') + '" aria-label="Checklist" style="--todo-lines:' + escapeHtml(todoLines) + '">' +
      '<button type="button" class="desk-todo-close" data-desk-close-todo aria-label="Close checklist" title="Close checklist">×</button>' +
      '<h2 class="desk-room-name-title"><span>' + escapeHtml(room.title || 'Room') + '</span></h2>' +
      filesPanel +
      '<div class="desk-panel-tools">' +
      '<form class="desk-kind-form" data-desk-form="room-kind"><input type="hidden" name="room" value="' + escapeHtml(room.path || '') + '"><label><span class="desk-visually-hidden">Room Type</span><select class="desk-select" name="room_kind" aria-label="Room type"><option value="indoor"' + (roomKind(room) === 'indoor' ? ' selected' : '') + '>Indoor</option><option value="outdoor"' + (roomKind(room) === 'outdoor' ? ' selected' : '') + '>Outdoor</option></select></label><button type="submit" class="desk-btn subtle">Set</button></form>' +
      '<form class="desk-color-form" data-desk-form="room-color"><input type="hidden" name="room" value="' + escapeHtml(room.path || '') + '"><label><span class="desk-visually-hidden">Room Color</span><input class="desk-color-input" type="color" name="room_color" value="' + escapeHtml(roomColor(room)) + '" aria-label="Room color"></label><button type="submit" class="desk-btn subtle">Set</button></form></div>' +
      '<div class="desk-room-actions">' +
      '<a class="desk-link-btn" href="' + escapeHtml(roomUrl('')) + '" data-desk-room-link="">Office</a>' +
      '<a class="desk-link-btn" href="' + escapeHtml(room.overworld_url || '/overworld') + '">Open in Overworld</a>' +
      (room.has_public_file ? '<span class="desk-pill gold">public.md present</span>' : '<span class="desk-pill">private interior</span>') +
      '<span class="desk-pill">' + escapeHtml(room.sleeping_task_count || 0) + ' below threshold</span>' +
      '</div>' +
      roomTaskFilterControls(tasks) +
      taskList +
      forgottenList +
      '<form class="desk-todo-add" data-desk-form="room-add" aria-label="Add task" novalidate>' +
      '<input type="hidden" name="destination_room" value="' + escapeHtml(room.path || '') + '">' +
      '<label class="desk-todo-add-line"><span class="desk-visually-hidden">New task</span><textarea class="desk-textarea desk-todo-add-textarea" name="task_text" rows="1" placeholder="' + escapeHtml(addPrompt) + '" aria-label="New task"></textarea></label>' +
      '<button type="submit" class="desk-visually-hidden">Save task</button>' +
      '</form>' +
      doneList +
      '</section>';
  }

  function taskMenuKey(task) {
    return String(task.status || 'open') + ':' + String(task.id || '');
  }

  function taskIcon(name) {
    if (name === 'archive') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14l-1 12H6L5 7Z"></path><path d="M4 5h16M9 11h6"></path></svg>';
    }
    if (name === 'trash') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7Z"></path><path d="M4 7h16M9 7V4h6v3"></path></svg>';
    }
    if (name === 'remember') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M7 10l5-5 5 5"></path><path d="M6 19h12"></path></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="12" cy="19" r="1.4"></circle></svg>';
  }

  function renderTaskMenu(task) {
    var key = taskMenuKey(task);
    var room = String(task.room || '');
    var status = String(task.status || 'open');
    return '<span class="desk-notebook-row-actions">' +
      (status === 'open' && task.completed_at ? '<button type="button" class="desk-notebook-row-icon is-archive" title="Archive" aria-label="Archive" data-desk-task-action="archive" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '">' + taskIcon('archive') + '</button><button type="button" class="desk-notebook-row-icon is-trash" title="Trash" aria-label="Trash" data-desk-task-action="trash" data-task-status="open" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '">' + taskIcon('trash') + '</button>' : '') +
      (status === 'forgotten' ? '<button type="button" class="desk-notebook-row-icon is-remember" title="Remember" aria-label="Remember" data-desk-task-action="remember" data-task-status="forgotten" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '">' + taskIcon('remember') + '</button>' : '') +
      '<button type="button" class="desk-notebook-menu-btn" title="Task menu" aria-label="Task menu" data-desk-task-menu="' + escapeHtml(key) + '">' + taskIcon('menu') + '</button>' +
      (state.taskMenuKey === key ? '<span class="desk-notebook-task-menu" role="menu">' +
        (status === 'open' ? '<button type="button" role="menuitem" data-desk-task-action="forget" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '">Forget</button>' : '<button type="button" role="menuitem" data-desk-task-action="remember" data-task-status="forgotten" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '">Remember</button>') +
        '<button type="button" role="menuitem" data-desk-task-action="clear-upvotes" data-task-status="' + escapeHtml(status) + '" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '">Clear upvotes</button>' +
        '<button type="button" role="menuitem" data-desk-task-action="trash" data-task-status="' + escapeHtml(status) + '" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '">Delete</button>' +
      '</span>' : '') +
    '</span>';
  }

  function renderForgottenTasks(tasks) {
    if (!tasks.length) {
      return '';
    }
    return '<section class="desk-forgotten-section' + (state.forgottenOpen ? ' is-open' : '') + '">' +
      '<button type="button" class="desk-forgotten-toggle" data-desk-forgotten-toggle aria-expanded="' + (state.forgottenOpen ? 'true' : 'false') + '">' + escapeHtml(tasks.length) + ' forgotten ' + (tasks.length === 1 ? 'task' : 'tasks') + '</button>' +
      '<div class="desk-forgotten-drawer">' +
      '<ul class="desk-task-list desk-notebook-list desk-forgotten-list">' + tasks.map(notebookTaskItem).join('') + '</ul>' +
      '</div>' +
      '</section>';
  }

  function renderCompose(data) {
    var selected = data.current_room && data.current_room.path ? data.current_room.path : '';
    var paper = composePaperClass();
    var showTitle = state.composeDocType !== 'shortform';
    var advancedIcon = state.composeAdvanced
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"></path><path d="M9 3v6M15 3v6M9 15v6M15 15v6"></path></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"></path><path d="M8 4v16M16 4v16"></path></svg>';
    var paperOptions = composePaperOptions().map(function (option) {
      return '<button type="button" class="desk-compose-paper-option" data-desk-compose-paper="' + escapeHtml(option.value) + '" aria-label="' + escapeHtml(option.label) + '" title="' + escapeHtml(option.label) + '" aria-pressed="' + (paper === option.value ? 'true' : 'false') + '">' + composePaperIcon(option) + '</button>';
    }).join('');
    var typeOptions = composeTypeOptions().map(function (option) {
      return '<button type="button" class="desk-compose-paper-option desk-compose-type-option" data-desk-compose-type="' + escapeHtml(option.value) + '" aria-label="' + escapeHtml(option.label) + '" title="' + escapeHtml(option.label) + '" aria-pressed="' + (state.composeDocType === option.value ? 'true' : 'false') + '">' + composeTypeIcon(option) + '</button>';
    }).join('');
    var docMenu = state.composeMenuOpen
      ? '<div class="desk-compose-doc-menu" role="menu"><button type="button" role="menuitem" data-desk-compose-rename-open>Rename...</button></div>'
      : '';
    return '<section class="desk-mode-panel desk-compose-panel' + (state.closingMode === 'compose' ? ' is-closing' : '') + '" aria-label="Compose">' +
      '<div class="desk-compose-toolbar">' +
      '<div class="desk-compose-paper-picker" role="group" aria-label="Compose paper style">' + paperOptions + '</div>' +
      (state.composeAdvanced ? '<div class="desk-compose-paper-picker desk-compose-type-picker" role="group" aria-label="Compose post type">' + typeOptions + '</div>' : '') +
      '<button type="button" class="desk-icon-btn desk-compose-advanced-toggle' + (state.composeAdvanced ? ' is-active' : '') + '" data-desk-compose-advanced aria-label="Toggle full compose controls" title="Toggle full compose controls">' + advancedIcon + '</button>' +
      '</div>' +
      '<form class="desk-form desk-compose-form" data-desk-form="compose-doc">' +
      '<div class="desk-compose-drag-handle-wrap"><button type="button" class="desk-compose-drag-handle" data-desk-doc-drag aria-label="Drag document to another room" title="Drag document to another room">::</button></div>' +
      (state.composeAdvanced && showTitle ? '<label><span>Title</span><input class="desk-input" type="text" name="doc_title" value="' + escapeHtml(state.composeDocTitle) + '" maxlength="180"></label>' : '') +
      '<div class="desk-compose-sheet desk-compose-sheet-' + escapeHtml(paper) + '">' +
      '<button type="button" class="desk-compose-close" data-desk-close-compose aria-label="Close compose" title="Close compose">×</button>' +
      '<div class="desk-compose-doc-actions">' +
      '<button type="button" class="desk-compose-doc-menu-btn" data-desk-compose-menu aria-label="Document menu" title="Document menu" aria-expanded="' + (state.composeMenuOpen ? 'true' : 'false') + '">⋮</button>' +
      docMenu +
      '</div>' +
      '<textarea class="desk-textarea desk-compose-textarea desk-compose-textarea-' + escapeHtml(paper) + '" name="doc_body" spellcheck="true" rows="12" required>' + escapeHtml(state.composeDocText) + '</textarea>' +
      '<div class="desk-compose-save-indicator" aria-live="polite" aria-label="' + (state.composeSaving ? 'Saving' : (state.composeSavedPulse ? 'Saved' : 'Unsaved changes')) + '">' +
      (state.composeSaving ? '<span class="desk-compose-spinner"></span>' : (state.composeSavedPulse ? '<span class="desk-compose-check">✓</span>' : '<span class="desk-compose-dot"></span>')) +
      '</div>' +
      '</div>' +
      '</form>' +
      (state.composeRenameOpen ? renderDocumentRenameModal() : '') +
      '</section>';
  }

  function renderCompositionBookIcon() {
    return '<svg class="desk-compose-book-icon" viewBox="0 0 72 72" aria-hidden="true">' +
      '<defs>' +
      '<clipPath id="desk-compose-book-clip"><rect x="11" y="6" width="50" height="60" rx="5.5"></rect></clipPath>' +
      '<pattern id="desk-compose-marble" width="34" height="34" patternUnits="userSpaceOnUse">' +
      '<rect width="34" height="34" fill="#f8f6ee"></rect>' +
      '<path class="desk-compose-marble-vein heavy" d="M-5 5C2 -2 8 10 15 4S26 -2 39 6M-4 18C4 7 11 28 20 14S30 9 39 17M-2 31C7 18 13 39 23 25S31 22 38 28"></path>' +
      '<path class="desk-compose-marble-vein mid" d="M1 0C6 8 10 8 16 1M18 2c4 7 9 7 15 1M0 12c8 -4 14 -2 20 4M13 20c7 -5 12 -4 20 3M2 27c5 5 10 5 16 0M22 30c3 -5 7 -5 13 -1"></path>' +
      '<path class="desk-compose-marble-vein fine" d="M5 5c3 2 5 2 8 0M23 7c2 2 4 2 7 0M7 16c3 -2 5 -1 8 1M25 18c3 -2 5 -2 8 1M9 24c2 2 4 2 7 0M27 27c2 2 4 1 6 -1"></path>' +
      '<circle class="desk-compose-marble-speck dark" cx="6" cy="9" r="0.9"></circle><circle class="desk-compose-marble-speck dark" cx="29" cy="12" r="0.75"></circle><circle class="desk-compose-marble-speck dark" cx="17" cy="28" r="0.7"></circle>' +
      '<circle class="desk-compose-marble-speck light" cx="11" cy="19" r="0.8"></circle><circle class="desk-compose-marble-speck light" cx="25" cy="3" r="0.65"></circle>' +
      '</pattern>' +
      '</defs>' +
      '<g class="desk-compose-book-art">' +
      '<rect x="11" y="6" width="50" height="60" rx="5.5" class="desk-compose-book-cover"></rect>' +
      '<g clip-path="url(#desk-compose-book-clip)">' +
      '<rect x="11" y="6" width="50" height="60" class="desk-compose-book-marble"></rect>' +
      '<rect x="11" y="6" width="12.5" height="60" class="desk-compose-book-spine"></rect>' +
      '<path class="desk-compose-book-spine-line" d="M23.5 7v58"></path>' +
      '<path class="desk-compose-book-spine-stitch" d="M15.5 10v52M19.5 10v52"></path>' +
      '</g>' +
      '<rect x="28" y="22" width="27" height="18" rx="2.3" class="desk-compose-book-label"></rect>' +
      '<path class="desk-compose-book-label-line" d="M32 28h19M32 34h17"></path>' +
      '<path class="desk-compose-book-edge" d="M15 65h42"></path>' +
      '</g>' +
      '</svg>';
  }

  function isMapVisibleMode(mode) {
    return mode === 'map' || mode === 'todo' || mode === 'compose';
  }

  function renderModeDock() {
    return '<div class="desk-mode-dock" aria-label="Desk modes">' +
      (isMapVisibleMode(state.mode) ? '' : '<button type="button" class="desk-mode-launch desk-mode-map" data-desk-mode="map" aria-label="Open room map" aria-pressed="false"><svg class="desk-map-fold-icon" viewBox="0 0 72 72" aria-hidden="true"><g class="desk-map-fold-art"><path class="desk-map-fold-shadow" d="M8 58L27 43L45 50L64 34"></path><path class="desk-map-fold-panel left" d="M8 20L27 12V55L8 64Z"></path><path class="desk-map-fold-panel mid" d="M27 12L45 20V62L27 55Z"></path><path class="desk-map-fold-panel right" d="M45 20L64 11V51L45 62Z"></path><path class="desk-map-fold-crease" d="M27 12V55M45 20V62"></path><path class="desk-map-fold-grid" d="M13 29l10-4M13 39l10-4M32 25l9 4M32 37l9 4M50 28l9-4M50 40l9-4"></path><path class="desk-map-fold-route" d="M12 52c7-11 13-2 21-13 6-8 11-3 15-10 3-5 7-7 12-8"></path></g></svg></button>') +
      (state.mode === 'compose' ? '' : '<button type="button" class="desk-mode-launch desk-mode-compose" data-desk-mode="compose" aria-label="Compose on the desk">' + renderCompositionBookIcon() + '</button>') +
      (state.mode === 'todo' ? '' : '<button type="button" class="desk-mode-launch desk-mode-todo" data-desk-mode="todo" aria-label="Open checklist"><svg class="desk-checklist-notebook-icon" viewBox="0 0 64 72" aria-hidden="true"><path class="desk-checklist-page" d="M15 7h37c2.6 0 4.8 2.1 4.8 4.8v48.6c0 2.6-2.1 4.8-4.8 4.8H15c-2.6 0-4.8-2.1-4.8-4.8V11.8C10.2 9.1 12.4 7 15 7Z"></path><path class="desk-checklist-margin" d="M22 8v56"></path><path class="desk-checklist-rule" d="M27 21h20M27 34h20M27 47h20"></path><path class="desk-checklist-check" d="M15.8 21.2l2.4 2.4 4.4-5.1M15.8 34.2l2.4 2.4 4.4-5.1M15.8 47.2l2.4 2.4 4.4-5.1"></path></svg></button>') +
      '</div>';
  }

  function renderMapSafely(data) {
    try {
      return renderMap(data);
    } catch (err) {
      var message = err && err.message ? err.message : 'Map failed to render.';
      return '<section class="desk-mode-panel desk-map-panel desk-map-panel-error" aria-label="Room map unavailable">' +
        '<div class="desk-map-error"><p>Map unavailable</p><small>' + escapeHtml(message) + '</small></div>' +
        '</section>';
    }
  }

  function renderStage(data) {
    var content = '';
    var isPaperSwitching = state.paperSwitchFrom && state.closingMode === state.paperSwitchFrom && (state.mode === 'todo' || state.mode === 'compose');
    if (state.mode === 'todo') {
      content = renderMapSafely(data) + (isPaperSwitching && state.paperSwitchFrom === 'compose' ? renderCompose(data) : '') + renderTodo(data);
    } else if (state.mode === 'compose') {
      content = renderMapSafely(data) + (isPaperSwitching && state.paperSwitchFrom === 'todo' ? renderTodo(data) : '') + renderCompose(data);
    } else if (state.mode === 'map') {
      content = renderMapSafely(data);
    }
    return '<div class="desk-stage' + (isPaperSwitching ? ' is-paper-switching' : '') + '" data-desk-stage-mode="' + escapeHtml(state.mode) + '">' + content + '</div>' + renderModeDock();
  }

  function clearModeCloseTimer() {
    if (modeCloseTimer) {
      window.clearTimeout(modeCloseTimer);
      modeCloseTimer = null;
    }
  }

  function suppressRoomClickFor(delay) {
    state.suppressRoomClick = true;
    if (suppressRoomClickTimer) {
      window.clearTimeout(suppressRoomClickTimer);
    }
    suppressRoomClickTimer = window.setTimeout(function () {
      state.suppressRoomClick = false;
      suppressRoomClickTimer = null;
    }, delay || 180);
  }

  function openMode(mode) {
    var nextMode = mode || 'map';
    var previousMode = state.mode;
    var mapResizeRect = previousMode === 'map' && (nextMode === 'todo' || nextMode === 'compose') ? captureMapPanelRect() : null;
    clearModeCloseTimer();
    if ((previousMode === 'todo' || previousMode === 'compose') && (nextMode === 'todo' || nextMode === 'compose') && previousMode !== nextMode && !state.closingMode) {
      switchPaperModeTogether(previousMode, nextMode);
      return;
    }
    state.mode = nextMode;
    state.closingMode = '';
    state.paperSwitchFrom = '';
    state.search = null;
    state.createRoomOpen = false;
    state.secretPassageSource = null;
    state.todoAddOpen = false;
    if (nextMode === 'compose' && !state.composeTargetRoom) {
      state.composeTargetRoom = state.currentRoom;
    }
    if (nextMode === 'map' && previousMode !== 'map') {
      playSound(deskSounds.mapOpen);
    } else if ((nextMode === 'todo' || nextMode === 'compose') && previousMode !== nextMode) {
      playSound(deskSounds.book);
    }
    if (state.data) {
      renderWithMapResize(state.data, mapResizeRect);
    }
  }

  function switchPaperModeTogether(previousMode, nextMode) {
    playSound(deskSounds.book);
    state.mode = nextMode;
    state.closingMode = previousMode;
    state.paperSwitchFrom = previousMode;
    state.search = null;
    state.createRoomOpen = false;
    state.secretPassageSource = null;
    state.todoAddOpen = false;
    state.suppressMapAnimation = true;
    if (nextMode === 'compose' && !state.composeTargetRoom) {
      state.composeTargetRoom = state.currentRoom;
    }
    if (state.data) {
      render(state.data);
    }
    modeCloseTimer = window.setTimeout(function () {
      state.closingMode = '';
      state.paperSwitchFrom = '';
      modeCloseTimer = null;
      state.suppressMapAnimation = true;
      if (state.data) {
        render(state.data);
      }
    }, 380);
  }

  function closeMapMode() {
    if (state.mode !== 'map' || state.closingMode === 'map') {
      return;
    }
    clearModeCloseTimer();
    playSound(deskSounds.mapClose);
    state.closingMode = 'map';
    state.search = null;
    state.createRoomOpen = false;
    state.secretPassageSource = null;
    if (state.data) {
      render(state.data);
    }
    modeCloseTimer = window.setTimeout(function () {
      state.mode = 'closed';
      state.closingMode = '';
      state.paperSwitchFrom = '';
      modeCloseTimer = null;
      if (state.data) {
        render(state.data);
      }
    }, 360);
  }

  function closeOpenMode() {
    var previousMode = state.mode;
    if (previousMode === 'closed' || state.closingMode) {
      return;
    }
    clearModeCloseTimer();
    if (previousMode === 'map') {
      playSound(deskSounds.mapClose);
    } else if (previousMode === 'todo' || previousMode === 'compose') {
      playSound(deskSounds.book);
    }
    state.closingMode = previousMode;
    state.search = null;
    state.createRoomOpen = false;
    state.secretPassageSource = null;
    if (state.data) {
      render(state.data);
    }
    modeCloseTimer = window.setTimeout(function () {
      state.mode = 'closed';
      state.closingMode = '';
      state.paperSwitchFrom = '';
      modeCloseTimer = null;
      if (state.data) {
        render(state.data);
      }
    }, 380);
  }

  function closeTodoMode() {
    if (state.mode !== 'todo' || state.closingMode === 'todo') {
      return;
    }
    clearModeCloseTimer();
    playSound(deskSounds.book);
    state.closingMode = 'todo';
    state.search = null;
    state.createRoomOpen = false;
    state.secretPassageSource = null;
    state.suppressMapAnimation = true;
    if (state.data) {
      render(state.data);
    }
    modeCloseTimer = window.setTimeout(function () {
      state.mode = 'map';
      state.closingMode = '';
      state.paperSwitchFrom = '';
      modeCloseTimer = null;
      state.suppressMapAnimation = true;
      if (state.data) {
        render(state.data);
      }
    }, 380);
  }

  function closeComposeMode() {
    if (state.mode !== 'compose' || state.closingMode === 'compose') {
      return;
    }
    clearModeCloseTimer();
    playSound(deskSounds.book);
    state.closingMode = 'compose';
    state.search = null;
    state.createRoomOpen = false;
    state.secretPassageSource = null;
    state.composeMenuOpen = false;
    state.composeRenameOpen = false;
    state.suppressMapAnimation = true;
    if (state.data) {
      render(state.data);
    }
    modeCloseTimer = window.setTimeout(function () {
      state.mode = 'map';
      state.closingMode = '';
      state.paperSwitchFrom = '';
      modeCloseTimer = null;
      state.suppressMapAnimation = true;
      if (state.data) {
        render(state.data);
      }
    }, 380);
  }

  function isDeskBackgroundClick(event) {
    var target = event.target;
    if (state.mode === 'closed') {
      return false;
    }
    if (target.closest('button, a, input, select, textarea, label, form, .desk-modal, .desk-todo-panel, .desk-compose-panel, .desk-map-room-link')) {
      return false;
    }
    if (target.closest && target.closest('.desk-stage')) {
      return false;
    }
    if (target.closest && target.closest('.desk-mode-dock, .desk-chrome-controls')) {
      return false;
    }
    return target === root || Boolean(target.closest && target.closest('.desk-shell'));
  }

  function renderChromeControls(data) {
    return '<div class="desk-chrome-controls">' + statusButtons(data) + '</div>';
  }

  function renderDeskSurface(data) {
    var selected = data.current_room && data.current_room.path ? data.current_room.path : '';
    return '<aside class="desk-surface" aria-labelledby="desk-capture-heading">' +
      '<h2 id="desk-capture-heading">Desk Surface</h2>' +
      '<form class="desk-form" data-desk-form="capture">' +
      '<label><span>Capture</span><textarea class="desk-textarea" name="task_text" rows="7" required></textarea></label>' +
      '<div class="desk-form-row">' +
      '<label><span>Room</span><select class="desk-select" name="destination_room">' + roomOptionRows(data, selected) + '</select></label>' +
      '<button type="submit" class="desk-btn primary">Capture</button>' +
      '</div>' +
      '</form>' +
      '<form class="desk-form desk-search-form" data-desk-form="search">' +
      '<div class="desk-form-row">' +
      '<label><span>Search</span><input class="desk-input" type="search" name="q" minlength="2" required></label>' +
      '<button type="submit" class="desk-btn subtle">Search</button>' +
      '</div>' +
      '</form>' +
      '</aside>';
  }

  function surfacedTaskList(tasks) {
    if (!tasks || !tasks.length) {
      return '<p class="desk-empty">No surfaced tasks.</p>';
    }
    return '<ul class="desk-surfaced-list">' + tasks.map(function (task) {
      return '<li class="desk-surfaced-task"><strong>' + escapeHtml(task.title || 'Task') + '</strong>' +
        '<span class="desk-muted"> ' + escapeHtml(task.upvotes || 0) + '</span></li>';
    }).join('') + '</ul>';
  }

  function renderRoomCard(room) {
    return '<article class="desk-room-card">' +
      '<div class="desk-room-card-head">' +
      '<h3>' + escapeHtml(room.title || 'Room') + '</h3>' +
      '<div class="desk-heat" aria-label="Room heat">' +
      '<span>' + escapeHtml(room.heat || 0) + ' heat</span>' +
      '<div class="desk-heat-bar"><i style="--heat-width:' + heatWidth(room.heat) + '"></i></div>' +
      '</div>' +
      '</div>' +
      '<div class="desk-count-row">' +
      '<span class="desk-pill gold">' + escapeHtml(room.visible_task_count || 0) + ' surfaced</span>' +
      '<span class="desk-pill">' + escapeHtml(room.sleeping_task_count || 0) + ' below threshold</span>' +
      (room.has_public_file ? '<span class="desk-pill gold">public.md</span>' : '<span class="desk-pill">private</span>') +
      '</div>' +
      surfacedTaskList(room.surfaced_tasks || []) +
      '<div class="desk-card-actions">' +
      '<a class="desk-link-btn" href="' + escapeHtml(room.url || roomUrl(room.path)) + '" data-desk-room-link="' + escapeHtml(room.path || '') + '">Go to room</a>' +
      '<a class="desk-link-btn" href="' + escapeHtml(room.overworld_url || '/overworld') + '">Open in Overworld</a>' +
      '</div>' +
      '</article>';
  }

  function renderCreateRoom(data) {
    var current = data.current_room && data.current_room.path ? data.current_room.path : '';
    return '<form class="desk-form desk-create-room-form" data-desk-form="create-room">' +
      '<div class="desk-create-room-fields">' +
      '<label><span>Room name</span><input class="desk-input" name="room_title" placeholder="New room" aria-label="Room name" required></label>' +
      '<label><span>Connects from</span><select class="desk-select" name="room" aria-label="Connects from">' + roomImmediateOptionRows(data, current) + '</select></label>' +
      '</div>' +
      '<button type="submit" class="desk-btn subtle">Create room</button>' +
      '</form>';
  }

  function renderCreateRoomModal(data) {
    return '<div class="desk-modal-backdrop" data-desk-modal-backdrop>' +
      '<div class="desk-modal" role="dialog" aria-modal="true" aria-labelledby="desk-create-room-title">' +
      '<button type="button" class="desk-modal-close" data-desk-create-room-close aria-label="Close">×</button>' +
      '<h2 id="desk-create-room-title" class="desk-modal-title">Create room</h2>' +
      renderCreateRoom(data) +
      '</div>' +
      '</div>';
  }

  function renderDocumentRenameModal() {
    return '<div class="desk-modal-backdrop" data-desk-compose-rename-backdrop>' +
      '<div class="desk-modal" role="dialog" aria-modal="true" aria-labelledby="desk-rename-document-title">' +
      '<button type="button" class="desk-modal-close" data-desk-compose-rename-close aria-label="Close">×</button>' +
      '<h2 id="desk-rename-document-title" class="desk-modal-title">Rename document</h2>' +
      '<form class="desk-create-room-form" data-desk-form="rename-document">' +
      '<div class="desk-create-room-fields">' +
      '<label><span>Name</span><input class="desk-input" name="doc_title" value="' + escapeHtml(state.composeRenameValue || state.composeDocTitle || inferComposeTitle()) + '" maxlength="120" required></label>' +
      '</div>' +
      '<div class="desk-modal-actions"><button type="submit" class="desk-btn primary">Rename</button></div>' +
      '</form>' +
      '</div>' +
      '</div>';
  }

  function renderOffice(data) {
    var office = data.office || {};
    var rooms = data.rooms || [];
    return '<section class="desk-office-panel">' +
      '<h2>Office Wall</h2>' +
      '<div class="desk-room-actions">' +
      '<span class="desk-pill gold">' + escapeHtml(office.visible_task_count || 0) + ' surfaced here</span>' +
      '<span class="desk-pill">' + escapeHtml(office.sleeping_task_count || 0) + ' below-threshold local</span>' +
      (office.has_public_file ? '<span class="desk-pill gold">public.md present</span>' : '<span class="desk-pill">no public.md</span>') +
      '<a class="desk-link-btn" href="' + escapeHtml(office.overworld_url || '/overworld') + '">Open in Overworld</a>' +
      '</div>' +
      surfacedTaskList(office.surfaced_tasks || []) +
      '<div class="desk-room-actions">' + renderCreateRoom(data) + '</div>' +
      '<h2>Rooms</h2>' +
      (rooms.length ? '<div class="desk-room-grid">' + rooms.map(renderRoomCard).join('') + '</div>' : '<p class="desk-empty">No rooms yet.</p>') +
      '</section>';
  }

  function taskMeta(task) {
    var bits = [String(task.upvotes || 0)];
    if (task.soonness) {
      bits.push('soon ' + task.soonness);
    }
    if (task.can_vote_now === false && task.next_vote_at) {
      bits.push('revote later');
    }
    return '<div class="desk-task-meta">' + bits.map(function (bit) {
      return '<span class="desk-pill">' + escapeHtml(bit) + '</span>';
    }).join('') + '</div>';
  }

  function taskIsSurfaced(task) {
    var upvotes = Number(task && task.upvotes || 0);
    if (upvotes >= state.threshold) {
      return true;
    }
    var soon = Number(task && task.soonness_epoch || 0);
    if (!soon) {
      return false;
    }
    return soon <= Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  }

  function cloneDeskDataForRollback(data) {
    if (!data || typeof data !== 'object') {
      return null;
    }
    try {
      return JSON.parse(JSON.stringify(data));
    } catch (err) {
      return null;
    }
  }

  function normalizeTaskRoom(room) {
    return String(room || '').replace(/^\/+|\/+$/g, '');
  }

  function sortDeskTasks(tasks) {
    return (tasks || []).slice().sort(function (left, right) {
      var voteDiff = Number(right.upvotes || 0) - Number(left.upvotes || 0);
      if (voteDiff) {
        return voteDiff;
      }
      var leftSoon = Number(left.soonness_epoch || 0) || 9999999999;
      var rightSoon = Number(right.soonness_epoch || 0) || 9999999999;
      if (leftSoon !== rightSoon) {
        return leftSoon - rightSoon;
      }
      return String(left.title || '').toLowerCase().localeCompare(String(right.title || '').toLowerCase());
    });
  }

  function findDeskTask(tasks, room, taskId) {
    var targetRoom = normalizeTaskRoom(room);
    var targetId = String(taskId || '');
    if (!targetId) {
      return null;
    }
    for (var i = 0; i < (tasks || []).length; i += 1) {
      var task = tasks[i] || {};
      if (String(task.id || '') !== targetId) {
        continue;
      }
      if (normalizeTaskRoom(task.room) === targetRoom) {
        return task;
      }
    }
    return null;
  }

  function updateOptimisticRoomSummary(data, room) {
    if (!data) {
      return;
    }
    var targetRoom = normalizeTaskRoom(room);
    var tasks = normalizeTaskRoom(data.current_room && data.current_room.path) === targetRoom ? (data.tasks || []) : [];
    var visibleTasks = tasks.filter(taskIsSurfaced);
    var summaryTargets = [];
    if (normalizeTaskRoom(data.current_room && data.current_room.path) === targetRoom) {
      summaryTargets.push(data.current_room);
    }
    if (targetRoom) {
      (data.rooms || []).forEach(function (candidate) {
        if (normalizeTaskRoom(candidate && candidate.path) === targetRoom) {
          summaryTargets.push(candidate);
        }
      });
    } else if (data.office) {
      summaryTargets.push(data.office);
    }
    summaryTargets.forEach(function (summary) {
      if (!summary) {
        return;
      }
      summary.task_count = tasks.length;
      summary.visible_task_count = visibleTasks.length;
      summary.sleeping_task_count = Math.max(0, tasks.length - visibleTasks.length);
      summary.surfaced_tasks = visibleTasks.slice(0, 3);
      summary.heat = tasks.reduce(function (total, task) {
        return total + Math.max(0, Number(task.upvotes || 0)) + (taskIsSurfaced(task) ? 2 : 0);
      }, 0);
    });
  }

  function applyOptimisticDeskVote(room, taskId) {
    if (!state.data || !Array.isArray(state.data.tasks)) {
      return false;
    }
    var targetRoom = normalizeTaskRoom(room || state.currentRoom);
    var task = findDeskTask(state.data.tasks, targetRoom, taskId);
    if (!task) {
      return false;
    }
    var now = Math.floor(Date.now() / 1000);
    task.upvotes = Number(task.upvotes || 0) + 1;
    task.last_vote_at = now;
    task.next_vote_at = now + Number(state.data.revote_window_seconds || 18 * 60 * 60);
    task.can_vote_now = false;
    state.data.tasks = sortDeskTasks(state.data.tasks);
    updateOptimisticRoomSummary(state.data, targetRoom);
    return true;
  }

  function captureNotebookTaskRects() {
    var map = {};
    if (!root) {
      return map;
    }
    root.querySelectorAll('.desk-notebook-task[data-task-id]').forEach(function (node) {
      var id = node.getAttribute('data-task-id') || '';
      if (id) {
        map[id] = node.getBoundingClientRect();
      }
    });
    return map;
  }

  function animateNotebookTaskFlip(beforeRects) {
    if (!root || !beforeRects) {
      return;
    }
    root.querySelectorAll('.desk-notebook-task[data-task-id]').forEach(function (node) {
      var id = node.getAttribute('data-task-id') || '';
      var first = beforeRects[id];
      if (!first) {
        return;
      }
      var last = node.getBoundingClientRect();
      var dx = first.left - last.left;
      var dy = first.top - last.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        return;
      }
      node.animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px)' },
        { transform: 'translate(0,0)' }
      ], {
        duration: 230,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
      });
    });
  }

  function captureMapPanelRect() {
    if (!root) {
      return null;
    }
    var panel = root.querySelector('.desk-map-panel:not(.is-closing)');
    return panel ? panel.getBoundingClientRect() : null;
  }

  function animateMapPanelResize(beforeRect) {
    if (!root || !beforeRect) {
      return;
    }
    var panel = root.querySelector('.desk-map-panel:not(.is-closing)');
    if (!panel || !panel.animate) {
      return;
    }
    var afterRect = panel.getBoundingClientRect();
    if (!afterRect.width || !afterRect.height || !beforeRect.width || !beforeRect.height) {
      return;
    }
    var dx = beforeRect.left - afterRect.left;
    var dy = beforeRect.top - afterRect.top;
    var sx = beforeRect.width / afterRect.width;
    var sy = beforeRect.height / afterRect.height;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) {
      return;
    }
    var finalTransform = window.getComputedStyle(panel).transform;
    if (!finalTransform || finalTransform === 'none') {
      finalTransform = '';
    }
    var firstTransform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')' + (finalTransform ? ' ' + finalTransform : '');
    panel.style.transformOrigin = 'left top';
    var animation = panel.animate([
      { transform: firstTransform },
      { transform: finalTransform || 'none' }
    ], {
      duration: 360,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
    });
    animation.addEventListener('finish', function () {
      panel.style.transformOrigin = '';
    });
    animation.addEventListener('cancel', function () {
      panel.style.transformOrigin = '';
    });
  }

  function renderWithMapResize(data, beforeRect) {
    render(data);
    if (beforeRect) {
      requestAnimationFrame(function () {
        animateMapPanelResize(beforeRect);
      });
    }
  }

  function renderDeskDataSteady(data, beforeRects) {
    state.suppressTodoAnimation = true;
    render(data);
    if (beforeRects) {
      requestAnimationFrame(function () {
        animateNotebookTaskFlip(beforeRects);
      });
    }
  }

  function restoreDeskVoteSnapshot(snapshot, beforeRects, message) {
    if (snapshot) {
      renderDeskDataSteady(snapshot, beforeRects);
    }
    showMessage(message || 'Desk vote failed.', true);
  }

  function normalizeEditableTaskText(node) {
    return String(node && node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function saveEditableTask(node) {
    if (!node) {
      return;
    }
    var next = normalizeEditableTaskText(node);
    var original = String(node.getAttribute('data-original-text') || '').trim();
    if (!next) {
      node.textContent = original || 'Task';
      return;
    }
    if (next === original) {
      return;
    }
    state.suppressTodoAnimation = state.mode === 'todo';
    api('edit-task', {
      room: node.getAttribute('data-room') || state.currentRoom,
      task_id: node.getAttribute('data-task-id') || '',
      task_status: node.getAttribute('data-task-status') || 'open',
      task_text: next
    }, { silentBusy: true }).then(function (data) {
      if (!data || data.success === false) {
        node.textContent = original || 'Task';
        showMessage(data && data.error ? data.error : 'Task edit failed.', true);
        return;
      }
      refreshFrom(data);
    }).catch(function (err) {
      node.textContent = original || 'Task';
      showMessage(err && err.message ? err.message : 'Task edit failed.', true);
    });
  }

  function roomTaskFilterControls(tasks) {
    var surfaced = (tasks || []).filter(taskIsSurfaced).length;
    return '<div class="desk-filter-controls" aria-label="Room task filter">' +
      '<button type="button" class="desk-status-btn' + (!state.showSurfacedOnly ? ' is-active' : '') + '" data-desk-filter="all">All ' + escapeHtml((tasks || []).length) + '</button>' +
      '<button type="button" class="desk-status-btn' + (state.showSurfacedOnly ? ' is-active' : '') + '" data-desk-filter="surfaced">Surfaced ' + escapeHtml(surfaced) + '</button>' +
      '</div>';
  }

  function taskItem(task, data) {
    var room = String(task.room || '');
    var body = task.body ? '<p class="desk-task-body">' + escapeHtml(task.body) + '</p>' : '';
    return '<li class="desk-task" data-task-id="' + escapeHtml(task.id || '') + '">' +
      '<h3>' + escapeHtml(task.title || 'Task') + '</h3>' +
      body +
      taskMeta(task) +
      '<div class="desk-task-actions">' +
      '<button type="button" class="desk-icon-btn" title="Upvote" aria-label="Upvote" data-desk-task-action="vote" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '">▲</button>' +
      '<button type="button" class="desk-btn subtle" data-desk-task-action="complete" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '">Done</button>' +
      '<form class="desk-move-form" data-desk-form="move-task">' +
      '<input type="hidden" name="room" value="' + escapeHtml(room) + '">' +
      '<input type="hidden" name="task_id" value="' + escapeHtml(task.id || '') + '">' +
      '<select class="desk-select" name="target_room">' + moveOptionRows(data, room) + '</select>' +
      '<button type="submit" class="desk-btn subtle">Move</button>' +
      '</form>' +
      '<form class="desk-soonness-form" data-desk-form="soonness">' +
      '<input type="hidden" name="room" value="' + escapeHtml(room) + '">' +
      '<input type="hidden" name="task_id" value="' + escapeHtml(task.id || '') + '">' +
      '<input class="desk-input" type="date" name="soonness" value="' + escapeHtml(dateValue(task.soonness || '')) + '">' +
      '<button type="submit" class="desk-btn subtle">Soon</button>' +
      '</form>' +
      '</div>' +
      '</li>';
  }

  function notebookTaskItem(task) {
    var room = String(task.room || '');
    var completed = String(task.completed_at || '') ? ' is-complete' : '';
    var forgotten = String(task.status || '') === 'forgotten' ? ' is-forgotten' : '';
    return '<li class="desk-task desk-notebook-task' + completed + forgotten + '" data-task-id="' + escapeHtml(task.id || '') + '" draggable="' + (forgotten ? 'true' : 'false') + '" data-desk-task-drag="' + escapeHtml(task.id || '') + '" data-task-status="' + escapeHtml(task.status || 'open') + '">' +
      '<span class="desk-notebook-vote-controls" aria-label="Task votes">' +
      '<button type="button" class="desk-notebook-vote-btn" title="Upvote" aria-label="Upvote" data-desk-task-action="vote" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '"><svg class="desk-notebook-vote-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4 19.5 13.2h-4.25V20h-6.5v-6.8H4.5L12 4Z" fill="currentColor"></path></svg></button>' +
      '<span class="desk-notebook-votes">' + escapeHtml(task.upvotes || 0) + '</span>' +
      '</span>' +
      '<button type="button" class="desk-notebook-check" title="Done" aria-label="Done" data-desk-task-action="complete" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '"><svg class="desk-notebook-check-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path class="desk-notebook-check-box" d="M6.2 6.9c4.8-.8 10.8-.7 19.1-.3 1.1 5.9 1 12.3.2 18.6-6.1.8-12.1.8-18.7.2C5.9 19.1 5.7 12.7 6.2 6.9Z"></path><path class="desk-notebook-check-shadow" d="M8.2 8.1c4.2-.4 9.8-.3 15.4.1"></path></svg></button>' +
      '<span class="desk-notebook-title" contenteditable="plaintext-only" spellcheck="true" role="textbox" aria-label="Edit task" data-desk-edit-task data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '" data-task-status="' + escapeHtml(task.status || 'open') + '" data-original-text="' + escapeHtml(task.title || 'Task') + '">' + escapeHtml(task.title || 'Task') + '</span>' +
      renderTaskMenu(task) +
      '</li>';
  }

  function dateValue(value) {
    var text = String(value || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function renderRoom(data) {
    var room = data.current_room || {};
    var tasks = data.tasks || [];
    var visibleTasks = state.showSurfacedOnly ? tasks.filter(taskIsSurfaced) : tasks;
    var done = data.done_tasks || [];
    return '<section class="desk-room-panel">' +
      '<div class="desk-room-actions">' +
      '<a class="desk-link-btn" href="' + escapeHtml(roomUrl('')) + '" data-desk-room-link="">Office</a>' +
      '<a class="desk-link-btn" href="' + escapeHtml(room.overworld_url || '/overworld') + '">Open in Overworld</a>' +
      (room.has_public_file ? '<span class="desk-pill gold">public.md present</span>' : '<span class="desk-pill">private interior</span>') +
      '<span class="desk-pill">' + escapeHtml(room.sleeping_task_count || 0) + ' below threshold</span>' +
      '</div>' +
      '<form class="desk-form" data-desk-form="room-add">' +
      '<input type="hidden" name="destination_room" value="' + escapeHtml(room.path || '') + '">' +
      '<label><span>Add Task</span><textarea class="desk-textarea" name="task_text" rows="4" required></textarea></label>' +
      '<button type="submit" class="desk-btn primary">Add to Room</button>' +
      '</form>' +
      '<h2>Room Tasks</h2>' +
      roomTaskFilterControls(tasks) +
      (visibleTasks.length ? '<ul class="desk-task-list">' + visibleTasks.map(function (task) { return taskItem(task, data); }).join('') + '</ul>' : '<p class="desk-empty">No tasks match this view.</p>') +
      '<h2>Done</h2>' +
      (done.length ? '<ul class="desk-done-list">' + done.map(function (task) {
        return '<li class="desk-task"><h3>' + escapeHtml(task.title || 'Task') + '</h3>' + (task.body ? '<p class="desk-task-body">' + escapeHtml(task.body) + '</p>' : '') + taskMeta(task) +
          '<div class="desk-task-actions"><button type="button" class="desk-btn subtle" data-desk-task-action="restore" data-room="' + escapeHtml(task.room || '') + '" data-task-id="' + escapeHtml(task.id || '') + '">Restore</button></div></li>';
      }).join('') + '</ul>' : '<p class="desk-empty">No archived tasks here.</p>') +
      '</section>';
  }

  function renderSearch(data) {
    if (!data) {
      return '';
    }
    var results = data.results || [];
    return '<section class="desk-search-panel">' +
      '<div class="desk-panel-title-row"><h2>Search Results</h2><button type="button" class="desk-btn subtle" data-desk-clear-search>Clear</button></div>' +
      '<p class="desk-room-note">' + escapeHtml(results.length) + ' result' + (results.length === 1 ? '' : 's') + ' for "' + escapeHtml(data.query || '') + '"</p>' +
      (results.length ? '<ul class="desk-search-list">' + results.map(function (result) {
        var title = result.kind === 'room' ? result.title : result.title + ' · ' + result.room_title;
        return '<li class="desk-search-result">' +
          '<div class="desk-count-row"><span class="desk-pill gold">' + escapeHtml(result.kind || 'result') + '</span></div>' +
          '<h3>' + escapeHtml(title || 'Result') + '</h3>' +
          '<a class="desk-link-btn" href="' + escapeHtml(result.url || roomUrl(result.room)) + '" data-desk-room-link="' + escapeHtml(result.room || '') + '">Go to room</a>' +
          '</li>';
      }).join('') + '</ul>' : '<p class="desk-empty">No matches.</p>') +
      '</section>';
  }

  function syncComposeState(data) {
    if (!data || state.mode !== 'compose') {
      return;
    }
    var docs = Array.isArray(data.documents) ? data.documents : [];
    if (!state.composeTargetRoom) {
      state.composeTargetRoom = state.currentRoom;
    }
    if (state.composeDocId) {
      var existing = docs.find(function (doc) { return doc && doc.id === state.composeDocId; });
      if (existing && !state.composeDirty) {
        state.composeDocText = String(existing.body || '');
        state.composeDocTitle = String(existing.title || '');
        state.composeDocType = String(existing.type || 'shortform') === 'article' ? 'article' : 'shortform';
      }
      return;
    }
    if (docs.length) {
      state.composeDocId = String(docs[0].id || '');
      state.composeDocText = String(docs[0].body || '');
      state.composeDocTitle = String(docs[0].title || '');
      state.composeDocType = String(docs[0].type || 'shortform') === 'article' ? 'article' : 'shortform';
      state.composeDirty = false;
      return;
    }
    if (!state.composeDocText) {
      state.composeDocType = 'shortform';
      state.composeDocTitle = '';
    }
  }

  function render(data) {
    try {
      state.data = data;
      syncComposeState(data);
      root.dataset.roomTone = roomTone(data.current_room && data.current_room.path);
      root.innerHTML = renderChromeControls(data) +
        '<div data-desk-message></div>' +
        renderStage(data);
      state.suppressMapAnimation = false;
      state.suppressTodoAnimation = false;
      syncDeskMenuSettings();
      applyDeskTooltips();
      markPageReady();
    } catch (err) {
      root.innerHTML = renderChromeControls(data || {}) +
        '<div data-desk-message></div>' +
        '<div class="desk-stage" data-desk-stage-mode="closed"><section class="desk-mode-panel desk-map-panel-error"><div class="desk-map-error"><p>Desk panel unavailable</p><small>' + escapeHtml(err && err.message ? err.message : 'Render failed.') + '</small></div></section></div>' +
        renderModeDock();
      applyDeskTooltips();
      markPageReady();
    }
  }

  function showGate(message) {
    root.innerHTML = '<div class="desk-access-gate">' +
      '<p class="desk-kicker">Private Interior</p>' +
      '<h1>Desk</h1>' +
      '<p>' + escapeHtml(message || 'Sign in with the owner Nostr identity to enter.') + '</p>' +
      '<button type="button" class="desk-btn primary" data-desk-login>Login</button>' +
      '</div>';
    applyDeskTooltips();
    markPageReady();
  }

  function loadState() {
    if (!state.data) {
      root.innerHTML = '<div class="desk-loading" aria-hidden="true"></div>';
    }
    api('state', { room: state.currentRoom }).then(function (data) {
      if (!data || data.success === false) {
        if (data && data.code === 'missing_room' && state.currentRoom) {
          showGate('That Desk room does not exist.');
          return;
        }
        showGate(data && data.error ? data.error : 'Desk is not available.');
        return;
      }
      if (state.mode === 'map' || state.mode === 'todo' || state.mode === 'compose') {
        state.suppressMapAnimation = true;
      }
      render(data);
    }).catch(function (err) {
      showGate(err && err.message ? err.message : 'Desk is not available.');
    });
  }

  function refreshFrom(data, fallbackRoom) {
    if (!data || data.success === false) {
      showMessage(data && data.error ? data.error : 'Desk action failed.', true);
      return;
    }
    state.search = null;
    if (data.current_room && typeof data.current_room.path === 'string') {
      state.currentRoom = data.current_room.path;
      window.history.replaceState({ room: state.currentRoom }, '', roomUrl(state.currentRoom));
    } else if (fallbackRoom != null) {
      state.currentRoom = fallbackRoom;
    }
    render(data);
  }

  function formValue(form, name) {
    var field = form.elements[name];
    return field ? field.value : '';
  }

  function roomByPath(data, path) {
    var roomPath = String(path || '');
    if (!data) {
      return null;
    }
    if (!roomPath) {
      return data.office || null;
    }
    var rooms = data.rooms || [];
    for (var i = 0; i < rooms.length; i += 1) {
      if (String(rooms[i].path || '') === roomPath) {
        return rooms[i];
      }
    }
    return null;
  }

  function beginMapRoomRename(roomPath) {
    var room = roomByPath(state.data, roomPath);
    state.mapRenameRoom = roomPath;
    state.mapRenameValue = room && room.title ? room.title : (roomPath ? roomPath.split('/').pop() : 'Office');
    if (state.data) {
      render(state.data);
    }
    window.setTimeout(function () {
      var field = root.querySelector('.desk-map-rename-input');
      if (field && typeof field.focus === 'function') {
        field.focus();
        if (typeof field.select === 'function') {
          field.select();
        }
      }
    }, 0);
  }

  function clearRoomDragClasses() {
    root.querySelectorAll('.is-drop-target, .is-dragging').forEach(function (node) {
      node.classList.remove('is-drop-target', 'is-dragging');
    });
  }

  function currentParentRoom(sourceRoom) {
    var room = roomByPath(state.data, sourceRoom);
    if (room && typeof room.parent_path === 'string') {
      return room.parent_path;
    }
    return roomPathParent(sourceRoom);
  }

  function roomDropTargetAt(x, y, sourceRoom, rejectCurrentParent) {
    var currentParent = rejectCurrentParent ? currentParentRoom(sourceRoom) : null;
    function isValidDropRoom(roomId) {
      return roomId != null && roomId !== sourceRoom && (!rejectCurrentParent || roomId !== currentParent);
    }
    if (typeof document.elementsFromPoint === 'function') {
      var stack = document.elementsFromPoint(x, y);
      for (var i = 0; i < stack.length; i += 1) {
        var candidate = stack[i];
        var targetLink = candidate && candidate.closest ? candidate.closest('[data-desk-room-drop]') : null;
        if (!targetLink || !root.contains(targetLink)) {
          continue;
        }
        var roomId = targetLink.getAttribute('data-desk-room-drop');
        if (isValidDropRoom(roomId)) {
          return targetLink;
        }
      }
      return null;
    }
    var node = document.elementFromPoint(x, y);
    var target = node && node.closest ? node.closest('[data-desk-room-drop]') : null;
    if (!target || !root.contains(target)) {
      return null;
    }
    var targetRoom = target.getAttribute('data-desk-room-drop');
    if (!isValidDropRoom(targetRoom)) {
      return null;
    }
    return target;
  }

  function markRoomDropTarget(target) {
    root.querySelectorAll('.desk-map-room-link.is-drop-target').forEach(function (node) {
      if (node !== target) {
        node.classList.remove('is-drop-target');
      }
    });
    if (target) {
      target.classList.add('is-drop-target');
    }
  }

  function setHoveredRoomOutline(roomPath) {
    root.querySelectorAll('.desk-map-room-hover-outline.is-hovered').forEach(function (node) {
      if (node.getAttribute('data-desk-room-hover-outline') !== roomPath) {
        node.classList.remove('is-hovered');
      }
    });
    if (roomPath == null || roomPath === state.currentRoom) {
      return;
    }
    root.querySelectorAll('.desk-map-room-hover-outline').forEach(function (node) {
      if (node.getAttribute('data-desk-room-hover-outline') === roomPath) {
        node.classList.add('is-hovered');
      }
    });
  }

  function finishRoomMove(sourceRoom, targetRoom, hasValidTarget) {
    if (!hasValidTarget || !sourceRoom || sourceRoom === targetRoom || targetRoom === currentParentRoom(sourceRoom)) {
      return;
    }
    api('move-room', {
      room: sourceRoom,
      target_room: targetRoom
    }).then(function (data) {
      refreshFrom(data);
      if (data && data.success !== false && data.moved_room) {
        showMessage('Room moved.', false);
      }
    });
  }

  root.addEventListener('click', function (event) {
    var login = event.target.closest('[data-desk-login]');
    if (login) {
      var loginButton = document.getElementById('login-btn');
      if (loginButton) {
        loginButton.click();
      }
      return;
    }

    var status = event.target.closest('[data-desk-status]');
    if (status) {
      event.preventDefault();
      handleStatusClick(status);
      return;
    }

    var modeButton = event.target.closest('[data-desk-mode]');
    if (modeButton) {
      var requestedMode = modeButton.getAttribute('data-desk-mode') || 'map';
      if (requestedMode === 'map' && state.mode === 'map' && state.closingMode !== 'map') {
        closeMapMode();
      } else if (requestedMode === 'compose' && state.mode === 'compose' && state.closingMode !== 'compose') {
        closeComposeMode();
      } else {
        openMode(requestedMode);
      }
      return;
    }

    if (event.target.closest('[data-desk-create-room-open]')) {
      state.createRoomOpen = true;
      state.secretPassageSource = null;
      if (state.data) {
        render(state.data);
      }
      return;
    }

    if (event.target.closest('[data-desk-secret-passage]')) {
      state.secretPassageSource = state.secretPassageSource === null ? '' : null;
      if (state.data) {
        render(state.data);
      }
      showMessage(state.secretPassageSource === null ? '' : 'Choose two rooms for the secret passage.', false);
      return;
    }

    if (event.target.closest('[data-desk-close-todo]')) {
      event.preventDefault();
      closeTodoMode();
      return;
    }

    if (event.target.closest('[data-desk-close-compose]')) {
      event.preventDefault();
      closeComposeMode();
      return;
    }

    if (event.target.closest('[data-desk-close-map]')) {
      event.preventDefault();
      if (state.mode === 'map') {
        closeMapMode();
      } else {
        closeOpenMode();
      }
      return;
    }

    if (event.target.closest('[data-desk-map-props]')) {
      event.preventDefault();
      state.mapPropsOpen = !state.mapPropsOpen;
      state.suppressMapAnimation = true;
      state.suppressTodoAnimation = state.mode === 'todo';
      if (state.data) {
        render(state.data);
      }
      return;
    }

    if (event.target.closest('[data-desk-map-zoom]')) {
      event.preventDefault();
      state.mapZoomMode = state.mapZoomMode === 'room' ? 'full' : 'room';
      state.mapPanX = 0;
      state.mapPanY = 0;
      state.suppressMapAnimation = true;
      applyMapZoomToDom();
      return;
    }

    var openDoc = event.target.closest('[data-desk-open-doc]');
    if (openDoc) {
      event.preventDefault();
      var docId = openDoc.getAttribute('data-desk-open-doc') || '';
      var docs = (state.data && state.data.documents) || [];
      var doc = docs.find(function (item) { return item && item.id === docId; });
      if (!doc) {
        return;
      }
      state.composeDocId = docId;
      state.composeDocText = String(doc.body || '');
      state.composeDocTitle = String(doc.title || '');
      state.composeDocType = String(doc.type || 'shortform') === 'article' ? 'article' : 'shortform';
      state.composeTargetRoom = state.currentRoom;
      state.composeDirty = false;
      state.todoAddOpen = false;
      openMode('compose');
      return;
    }

    if (event.target.closest('[data-desk-compose-menu]')) {
      event.preventDefault();
      state.composeMenuOpen = !state.composeMenuOpen;
      if (state.data) {
        render(state.data);
      }
      return;
    }

    if (event.target.closest('[data-desk-compose-rename-open]')) {
      event.preventDefault();
      state.composeMenuOpen = false;
      state.composeRenameOpen = true;
      state.composeRenameValue = state.composeDocTitle || inferComposeTitle();
      if (state.data) {
        render(state.data);
      }
      return;
    }

    if (event.target.closest('[data-desk-compose-rename-close]') || event.target.matches('[data-desk-compose-rename-backdrop]')) {
      event.preventDefault();
      state.composeRenameOpen = false;
      state.composeRenameValue = '';
      if (state.data) {
        render(state.data);
      }
      return;
    }

    if (event.target.closest('[data-desk-compose-advanced]')) {
      event.preventDefault();
      state.composeAdvanced = !state.composeAdvanced;
      if (state.data) {
        render(state.data);
      }
      return;
    }

    var composePaperButton = event.target.closest('[data-desk-compose-paper]');
    if (composePaperButton) {
      event.preventDefault();
      state.composePaper = composePaperButton.getAttribute('data-desk-compose-paper') || 'printer';
      applyComposePaperToDom();
      window.setTimeout(function () {
        var field = root.querySelector('.desk-compose-textarea');
        if (field && typeof field.focus === 'function') {
          field.focus();
        }
      }, 0);
      return;
    }

    var composeTypeButton = event.target.closest('[data-desk-compose-type]');
    if (composeTypeButton) {
      event.preventDefault();
      state.composeDocType = composeTypeButton.getAttribute('data-desk-compose-type') === 'article' ? 'article' : 'shortform';
      state.composeDirty = true;
      scheduleComposeAutosave();
      if (state.data) {
        render(state.data);
      }
      return;
    }

    if (event.target.closest('[data-desk-create-room-close]')) {
      state.createRoomOpen = false;
      if (state.data) {
        render(state.data);
      }
      return;
    }

    if (event.target.matches('[data-desk-modal-backdrop]')) {
      state.createRoomOpen = false;
      if (state.data) {
        render(state.data);
      }
      return;
    }

    if (isDeskBackgroundClick(event)) {
      event.preventDefault();
      closeOpenMode();
      return;
    }

    var roomLink = event.target.closest('[data-desk-room-link]');
    if (roomLink) {
      event.preventDefault();
      if (state.mapRenameRoom !== null) {
        return;
      }
      if (state.suppressRoomClick) {
        return;
      }
      var clickedRoom = roomLink.getAttribute('data-desk-room-link') || '';
      if (event.target.closest('.desk-map-room-title') && clickedRoom === state.currentRoom) {
        return;
      }
      if (state.secretPassageSource !== null) {
        if (state.secretPassageSource === clickedRoom) {
          showMessage('Choose a different room for the other end of the passage.', true);
          return;
        }
        if (state.secretPassageSource === '') {
          state.secretPassageSource = clickedRoom;
          if (state.data) {
            render(state.data);
          }
          showMessage('Choose the other room.', false);
          return;
        }
        api('create-secret-passage', {
          room: state.secretPassageSource,
          target_room: clickedRoom
        }).then(function (data) {
          state.secretPassageSource = null;
          refreshFrom(data);
        });
        return;
      }
      state.mode = 'map';
      if (clickedRoom !== state.currentRoom) {
        state.lastEnteredDoor = {
          from: state.currentRoom,
          to: clickedRoom
        };
      }
      state.mapZoomMode = 'room';
      state.mapPanX = 0;
      state.mapPanY = 0;
      setRoom(clickedRoom, false);
      return;
    }

    var filter = event.target.closest('[data-desk-filter]');
    if (filter) {
      state.showSurfacedOnly = filter.getAttribute('data-desk-filter') === 'surfaced';
      if (state.data) {
        render(state.data);
      }
      return;
    }

    var clearSearch = event.target.closest('[data-desk-clear-search]');
    if (clearSearch) {
      state.search = null;
      if (state.data) {
        render(state.data);
      }
      return;
    }

    var taskAction = event.target.closest('[data-desk-task-action]');
    if (taskAction) {
      var action = taskAction.getAttribute('data-desk-task-action');
      var actionMap = {
        vote: 'vote-task',
        restore: 'restore-task',
        complete: 'complete-task',
        archive: 'archive-task',
        trash: 'trash-task',
        forget: 'forget-task',
        remember: 'remember-task',
        'clear-upvotes': 'clear-task-upvotes'
      };
      var apiAction = actionMap[action] || 'complete-task';
      var taskRoom = taskAction.getAttribute('data-room') || state.currentRoom;
      var taskId = taskAction.getAttribute('data-task-id') || '';
      state.taskMenuKey = '';
      state.suppressTodoAnimation = state.mode === 'todo';
      if (action === 'vote') {
        var beforeVoteRects = captureNotebookTaskRects();
        var rollbackData = cloneDeskDataForRollback(state.data);
        var optimisticallyChanged = applyOptimisticDeskVote(taskRoom, taskId);
        if (optimisticallyChanged) {
          renderDeskDataSteady(state.data, beforeVoteRects);
        }
        api(apiAction, {
          room: taskRoom,
          task_id: taskId
        }, { silentBusy: true }).then(function (data) {
          if (!data || data.success === false) {
            restoreDeskVoteSnapshot(rollbackData, beforeVoteRects, data && data.error ? data.error : 'Desk vote failed.');
            return;
          }
          renderDeskDataSteady(data, captureNotebookTaskRects());
        }).catch(function (err) {
          restoreDeskVoteSnapshot(rollbackData, beforeVoteRects, err && err.message ? err.message : 'Desk vote failed.');
        });
        return;
      }
      api(apiAction, {
        room: taskRoom,
        task_id: taskId,
        task_status: taskAction.getAttribute('data-task-status') || 'open'
      }).then(function (data) {
        state.suppressTodoAnimation = state.mode === 'todo';
        refreshFrom(data);
      }).catch(function (err) {
        showMessage(err && err.message ? err.message : 'Desk action failed.', true);
      });
      return;
    }

    var taskMenu = event.target.closest('[data-desk-task-menu]');
    if (taskMenu) {
      event.preventDefault();
      var key = taskMenu.getAttribute('data-desk-task-menu') || '';
      state.taskMenuKey = state.taskMenuKey === key ? '' : key;
      state.suppressTodoAnimation = state.mode === 'todo';
      if (state.data) {
        render(state.data);
      }
      return;
    }

    if (event.target.closest('[data-desk-forgotten-toggle]')) {
      event.preventDefault();
      state.forgottenOpen = !state.forgottenOpen;
      state.suppressTodoAnimation = true;
      if (state.data) {
        render(state.data);
      }
      return;
    }

  });

  root.addEventListener('pointerover', function (event) {
    var roomLink = event.target.closest('[data-desk-room-link]');
    if (!roomLink || !root.contains(roomLink)) {
      return;
    }
    setHoveredRoomOutline(roomLink.getAttribute('data-desk-room-link') || '');
  });

  root.addEventListener('pointerout', function (event) {
    var roomLink = event.target.closest('[data-desk-room-link]');
    if (!roomLink || !root.contains(roomLink)) {
      return;
    }
    var related = event.relatedTarget && event.relatedTarget.closest ? event.relatedTarget.closest('[data-desk-room-link]') : null;
    if (related === roomLink) {
      return;
    }
    setHoveredRoomOutline(null);
  });

  root.addEventListener('focusin', function (event) {
    var roomLink = event.target.closest('[data-desk-room-link]');
    if (!roomLink || !root.contains(roomLink)) {
      return;
    }
    setHoveredRoomOutline(roomLink.getAttribute('data-desk-room-link') || '');
  });

  root.addEventListener('focusout', function (event) {
    var roomLink = event.target.closest('[data-desk-room-link]');
    if (!roomLink || !root.contains(roomLink)) {
      return;
    }
    setHoveredRoomOutline(null);
  });

  root.addEventListener('dblclick', function (event) {
    var roomLink = event.target.closest('[data-desk-room-link]');
    if (!roomLink || !root.contains(roomLink)) {
      return;
    }
    event.preventDefault();
    var roomPath = roomLink.getAttribute('data-desk-room-link') || '';
    if (event.target.closest('.desk-map-room-title') && (event.shiftKey || roomPath === state.currentRoom)) {
      beginMapRoomRename(roomPath);
      return;
    }
    state.mapRenameRoom = null;
    state.mapRenameValue = '';
    if (roomPath === state.currentRoom && state.mode === 'todo' && state.closingMode !== 'todo') {
      return;
    }
    state.suppressTodoAnimation = false;
    state.suppressMapAnimation = true;
    var wasTodoOpen = state.mode === 'todo';
    state.mode = 'todo';
    state.closingMode = '';
    if (roomPath !== state.currentRoom) {
      state.lastEnteredDoor = {
        from: state.currentRoom,
        to: roomPath
      };
      setRoom(roomPath, false);
      return;
    }
    if (!wasTodoOpen) {
      playSound(deskSounds.book);
    }
    if (state.data) {
      render(state.data);
    }
  });

  root.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || !event.shiftKey) {
      return;
    }
    if (!event.target.closest('.desk-map-room-title')) {
      return;
    }
    var roomLink = event.target.closest('[data-desk-room-link]');
    if (!roomLink || !root.contains(roomLink)) {
      return;
    }
    event.preventDefault();
    var roomPath = roomLink.getAttribute('data-desk-room-link') || '';
    beginMapRoomRename(roomPath);
  });

  root.addEventListener('keydown', function (event) {
    var taskEdit = event.target.closest('[data-desk-edit-task]');
    if (taskEdit) {
      if (event.key === 'Escape') {
        event.preventDefault();
        taskEdit.textContent = taskEdit.getAttribute('data-original-text') || 'Task';
        taskEdit.blur();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        taskEdit.blur();
      }
    }
  });

  root.addEventListener('focusout', function (event) {
    var taskEdit = event.target.closest('[data-desk-edit-task]');
    if (!taskEdit) {
      return;
    }
    saveEditableTask(taskEdit);
  });

  root.addEventListener('input', function (event) {
    var taskEdit = event.target.closest('[data-desk-edit-task]');
    if (!taskEdit) {
      return;
    }
    taskEdit.dataset.deskDirty = 'true';
  });

  root.addEventListener('keydown', function (event) {
    var todoInput = event.target.closest('.desk-todo-add-textarea');
    if (!todoInput) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      todoInput.blur();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    var form = todoInput.closest('[data-desk-form="room-add"]');
    if (form && typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    }

    return;
  });

  root.addEventListener('keydown', function (event) {
    var composeField = event.target.closest('.desk-compose-textarea');
    if (!composeField || composePaperClass() !== 'typewriter') {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      queueTypewriterOp({ type: 'backspace' });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      queueTypewriterOp({ type: 'enter' });
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      queueTypewriterOp({ type: 'insert', text: '  ' });
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      queueTypewriterOp({ type: 'insert', text: event.key });
    }
  });

  root.addEventListener('paste', function (event) {
    var composeField = event.target.closest('.desk-compose-textarea');
    if (!composeField || composePaperClass() !== 'typewriter') {
      return;
    }
    event.preventDefault();
    var text = '';
    try {
      text = (event.clipboardData && event.clipboardData.getData('text/plain')) || '';
    } catch (_err) {
      text = '';
    }
    if (!text) {
      return;
    }
    queueTypewriterOp({ type: 'insert', text: text });
  });

  root.addEventListener('dragstart', function (event) {
    var taskDrag = event.target.closest('[data-desk-task-drag]');
    if (taskDrag && taskDrag.getAttribute('data-task-status') === 'forgotten') {
      event.dataTransfer.setData('application/x-desk-task-id', taskDrag.getAttribute('data-desk-task-drag') || '');
      event.dataTransfer.effectAllowed = 'move';
      return;
    }
    var roomLink = event.target.closest('[data-desk-room-link]');
    if (roomLink) {
      event.preventDefault();
    }
  });

  root.addEventListener('pointerdown', function (event) {
    var docHandle = event.target.closest('[data-desk-doc-drag]');
    if (docHandle && state.mode === 'compose') {
      state.pointerDocDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false
      };
      return;
    }
    var mapSvg = event.target.closest('[data-desk-map-svg]');
    if (mapSvg && state.mapZoomMode === 'room' && !event.target.closest('[data-desk-room-link]') && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      var view = mapSvg.viewBox && mapSvg.viewBox.baseVal;
      var rect = mapSvg.getBoundingClientRect();
      var fullParts = String(mapSvg.getAttribute('data-desk-full-viewbox') || '').split(/\s+/).map(Number);
      if (view && rect.width > 0 && rect.height > 0 && fullParts.length === 4 && fullParts.every(Number.isFinite)) {
        state.pointerMapPan = {
          pointerId: event.pointerId,
          svg: mapSvg,
          startX: event.clientX,
          startY: event.clientY,
          startPanX: Number(state.mapPanX || 0),
          startPanY: Number(state.mapPanY || 0),
          baseCenterX: view.x + view.width / 2 - Number(state.mapPanX || 0),
          baseCenterY: view.y + view.height / 2 - Number(state.mapPanY || 0),
          viewX: view.x,
          viewY: view.y,
          viewW: view.width,
          viewH: view.height,
          fullX: fullParts[0],
          fullY: fullParts[1],
          fullW: fullParts[2],
          fullH: fullParts[3],
          scaleX: view.width / rect.width,
          scaleY: view.height / rect.height,
          active: false
        };
        if (mapSvg.setPointerCapture) {
          try {
            mapSvg.setPointerCapture(event.pointerId);
          } catch (_err) {
            // SVG pointer capture is best-effort.
          }
        }
      }
      return;
    }
    var roomLink = event.target.closest('[data-desk-room-link]');
    if (!roomLink || state.secretPassageSource !== null) {
      return;
    }
    var room = roomLink.getAttribute('data-desk-room-link') || '';
    if (!room || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    state.pointerRoomDrag = {
      room: room,
      link: roomLink,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false
    };
  });

  root.addEventListener('pointermove', function (event) {
    var mapPan = state.pointerMapPan;
    if (mapPan && mapPan.pointerId === event.pointerId) {
      var panMoved = Math.abs(event.clientX - mapPan.startX) + Math.abs(event.clientY - mapPan.startY);
      if (!mapPan.active && panMoved < 5) {
        return;
      }
      event.preventDefault();
      mapPan.active = true;
      var nextX = mapPan.viewX - (event.clientX - mapPan.startX) * mapPan.scaleX;
      var nextY = mapPan.viewY - (event.clientY - mapPan.startY) * mapPan.scaleY;
      nextX = Math.max(mapPan.fullX, Math.min(mapPan.fullX + mapPan.fullW - mapPan.viewW, nextX));
      nextY = Math.max(mapPan.fullY, Math.min(mapPan.fullY + mapPan.fullH - mapPan.viewH, nextY));
      state.mapPanX = nextX + mapPan.viewW / 2 - mapPan.baseCenterX;
      state.mapPanY = nextY + mapPan.viewH / 2 - mapPan.baseCenterY;
      if (mapPan.svg) {
        mapPan.svg.setAttribute('viewBox', [nextX, nextY, mapPan.viewW, mapPan.viewH].map(function (number) {
          return Number(number).toFixed(3);
        }).join(' '));
      }
      return;
    }
    var docDrag = state.pointerDocDrag;
    if (docDrag && docDrag.pointerId === event.pointerId) {
      var docMoved = Math.abs(event.clientX - docDrag.startX) + Math.abs(event.clientY - docDrag.startY);
      if (!docDrag.active && docMoved < 8) {
        return;
      }
      event.preventDefault();
      docDrag.active = true;
      markRoomDropTarget(roomDropTargetAt(event.clientX, event.clientY, state.currentRoom));
      return;
    }
    var drag = state.pointerRoomDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    var moved = Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY);
    if (!drag.active && moved < 8) {
      return;
    }
    event.preventDefault();
    if (!drag.active) {
      drag.active = true;
      state.draggedRoom = drag.room;
      suppressRoomClickFor(1200);
      drag.link.classList.add('is-dragging');
      if (drag.link.setPointerCapture) {
        try {
          drag.link.setPointerCapture(event.pointerId);
        } catch (_err) {
          // Pointer capture may fail for SVG links in older browsers.
        }
      }
    }
    markRoomDropTarget(roomDropTargetAt(event.clientX, event.clientY, drag.room, true));
  });

  root.addEventListener('pointerup', function (event) {
    var mapPan = state.pointerMapPan;
    if (mapPan && mapPan.pointerId === event.pointerId) {
      if (mapPan.active) {
        event.preventDefault();
        suppressRoomClickFor(180);
      }
      state.pointerMapPan = null;
      return;
    }
    var docDrag = state.pointerDocDrag;
    if (docDrag && docDrag.pointerId === event.pointerId) {
      var docTarget = docDrag.active ? roomDropTargetAt(event.clientX, event.clientY, state.currentRoom) : null;
      var dropRoom = docTarget ? docTarget.getAttribute('data-desk-room-drop') || '' : '';
      if (docDrag.active && dropRoom && state.composeDocId && dropRoom !== state.currentRoom) {
        event.preventDefault();
        api('move-document', {
          room: state.currentRoom,
          doc_id: state.composeDocId,
          target_room: dropRoom
        }).then(function (data) {
          if (data && data.success !== false) {
            state.composeDocId = '';
            state.composeDocText = '';
            state.composeDocTitle = '';
            state.composeDirty = false;
          }
          refreshFrom(data, dropRoom || state.currentRoom);
        });
      }
      clearRoomDragClasses();
      state.pointerDocDrag = null;
      return;
    }
    var drag = state.pointerRoomDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    var target = drag.active ? roomDropTargetAt(event.clientX, event.clientY, drag.room, true) : null;
    var targetRoom = target ? target.getAttribute('data-desk-room-drop') || '' : '';
    if (drag.active) {
      event.preventDefault();
      finishRoomMove(drag.room, targetRoom, Boolean(target));
      suppressRoomClickFor(220);
    }
    clearRoomDragClasses();
    state.pointerRoomDrag = null;
    state.draggedRoom = '';
  });

  root.addEventListener('pointercancel', function () {
    state.pointerMapPan = null;
    state.pointerDocDrag = null;
    var drag = state.pointerRoomDrag;
    if (drag && drag.active) {
      suppressRoomClickFor(220);
    }
    clearRoomDragClasses();
    state.pointerRoomDrag = null;
    state.draggedRoom = '';
  });

  root.addEventListener('dragover', function (event) { event.preventDefault(); });
  root.addEventListener('drop', function (event) {
    var taskId = event.dataTransfer ? event.dataTransfer.getData('application/x-desk-task-id') : '';
    if (taskId && event.target.closest('.desk-task-list, .desk-todo-add, .desk-room-name-title')) {
      event.preventDefault();
      state.suppressTodoAnimation = true;
      api('remember-task', {
        room: state.currentRoom,
        task_id: taskId,
        task_status: 'forgotten'
      }).then(refreshFrom);
      return;
    }
    event.preventDefault();
  });

  document.addEventListener('change', function (event) {
    var threshold = event.target.closest('[data-desk-threshold]');
    if (!threshold) {
      return;
    }
    var next = Number(threshold.value || 1);
    if (!Number.isFinite(next) || next < 1) {
      next = 1;
    }
    state.threshold = Math.min(100, Math.floor(next));
    storageSet('desk_visibility_threshold', String(state.threshold));
    loadState();
  });

  root.addEventListener('input', function (event) {
    var flashlight = event.target.closest('[data-desk-flashlight-strength]');
    if (flashlight) {
      var strength = Number(flashlight.value || 3);
      if (!Number.isFinite(strength)) {
        strength = 3;
      }
      state.flashlightStrength = Math.max(0, Math.min(flashlightSteps.length - 1, Math.round(strength)));
      storageSet('desk_flashlight_strength_v1', String(state.flashlightStrength));
      applyPresenceToMap();
      return;
    }
    var todoAddField = event.target.closest('.desk-todo-add-textarea');
    if (todoAddField) {
      resizeTodoAddTextarea(todoAddField);
      return;
    }
    var composeBody = event.target.closest('.desk-compose-textarea');
    if (composeBody) {
      state.composeDocText = composeBody.value;
      state.composeDirty = true;
      scheduleComposeAutosave();
      return;
    }
    var composeTitle = event.target.closest('input[name="doc_title"]');
    if (composeTitle) {
      if (composeTitle.closest('[data-desk-form="rename-document"]')) {
        state.composeRenameValue = composeTitle.value;
        return;
      }
      state.composeDocTitle = composeTitle.value;
      state.composeDirty = true;
      scheduleComposeAutosave();
    }
    var mapRenameInput = event.target.closest('.desk-map-rename-input');
    if (mapRenameInput) {
      state.mapRenameValue = mapRenameInput.value;
    }
  });

  root.addEventListener('submit', function (event) {
    var form = event.target.closest('[data-desk-form]');
    if (!form) {
      return;
    }
    event.preventDefault();
    var type = form.getAttribute('data-desk-form');
    if (type === 'capture' || type === 'room-add') {
      var originRoom = state.currentRoom;
      var destinationRoom = formValue(form, 'destination_room');
      var taskText = formValue(form, 'task_text');
      if (type === 'room-add' && !taskText.trim()) {
        var emptyTaskField = form.querySelector('.desk-todo-add-textarea');
        if (emptyTaskField && typeof emptyTaskField.focus === 'function') {
          emptyTaskField.focus();
        }
        return;
      }
      api('add-task', {
        destination_room: destinationRoom,
        task_text: taskText
      }).then(function (data) {
        if (data && data.success !== false) {
          form.reset();
        }
        if (type === 'capture' && data && data.success !== false && destinationRoom !== originRoom) {
          var destinationTitle = data.current_room && data.current_room.title ? data.current_room.title : 'room';
          state.currentRoom = originRoom;
          api('state', { room: originRoom }).then(function (nextData) {
            refreshFrom(nextData, originRoom);
            showMessage('Captured to ' + destinationTitle + '.', false);
          });
          return;
        }
        if (type === 'room-add' && data && data.success !== false) {
          state.suppressTodoAnimation = true;
        }
        refreshFrom(data);
        if (type === 'room-add' && data && data.success !== false) {
          window.setTimeout(function () {
            var field = root.querySelector('.desk-todo-add-textarea');
            if (field && typeof field.focus === 'function') {
              resizeTodoAddTextarea(field);
              field.focus();
            }
          }, 0);
        }
      });
      return;
    }
    if (type === 'compose-doc') {
      state.composeDocText = formValue(form, 'doc_body');
      state.composeDocTitle = formValue(form, 'doc_title');
      state.composeTargetRoom = state.currentRoom;
      state.composeDirty = true;
      saveComposeDocument(false);
      return;
    }
    if (type === 'rename-document') {
      var nextTitle = formValue(form, 'doc_title');
      if (!state.composeDocId) {
        state.composeDocTitle = nextTitle;
        state.composeRenameOpen = false;
        state.composeRenameValue = '';
        state.composeDirty = true;
        scheduleComposeAutosave();
        if (state.data) {
          render(state.data);
        }
        return;
      }
      api('rename-document', {
        room: state.currentRoom,
        doc_id: state.composeDocId,
        doc_title: nextTitle
      }).then(function (data) {
        if (data && data.renamed_document) {
          state.composeDocId = data.renamed_document.id || state.composeDocId;
          state.composeDocTitle = data.renamed_document.title || nextTitle;
          state.composeDirty = false;
        }
        state.composeRenameOpen = false;
        state.composeRenameValue = '';
        refreshFrom(data);
      });
      return;
    }
    if (type === 'create-room') {
      api('create-room', {
        room: formValue(form, 'room'),
        room_title: formValue(form, 'room_title')
      }).then(function (data) {
        if (data && data.created_room) {
          state.currentRoom = data.created_room.path || '';
        }
        state.createRoomOpen = false;
        refreshFrom(data);
      });
      return;
    }
    if (type === 'rename-room-inline') {
      var renameSource = formValue(form, 'room');
      var renameTitle = formValue(form, 'room_title');
      var renameAction = renameSource === state.currentRoom ? 'set-room-title' : 'rename-room';
      api(renameAction, {
        room: renameSource,
        room_title: renameTitle
      }).then(function (data) {
        state.mapRenameRoom = null;
        state.mapRenameValue = '';
        if (data && data.renamed_room && data.renamed_room.from === state.currentRoom) {
          state.currentRoom = data.renamed_room.to || state.currentRoom;
        }
        refreshFrom(data);
      });
      return;
    }
    if (type === 'room-properties') {
      var sourceRoom = formValue(form, 'room');
      var nextKind = formValue(form, 'room_kind');
      var nextColor = formValue(form, 'room_color');
      api('set-room-kind', {
        room: sourceRoom,
        room_kind: nextKind
      }).then(function (data) {
        if (!data || data.success === false) {
          refreshFrom(data);
          return;
        }
        api('set-room-color', {
          room: sourceRoom,
          room_color: nextColor
        }).then(refreshFrom);
      });
      return;
    }
    if (type === 'room-color') {
      api('set-room-color', {
        room: formValue(form, 'room'),
        room_color: formValue(form, 'room_color')
      }).then(refreshFrom);
      return;
    }
    if (type === 'room-kind') {
      api('set-room-kind', {
        room: formValue(form, 'room'),
        room_kind: formValue(form, 'room_kind')
      }).then(refreshFrom);
      return;
    }
    if (type === 'move-task') {
      var sourceRoom = formValue(form, 'room');
      var targetRoom = formValue(form, 'target_room');
      if (sourceRoom === targetRoom) {
        showMessage('Choose a different room to move this task.', true);
        return;
      }
      api('move-task', {
        room: sourceRoom,
        task_id: formValue(form, 'task_id'),
        target_room: targetRoom
      }).then(refreshFrom);
      return;
    }
    if (type === 'soonness') {
      api('set-soonness', {
        room: formValue(form, 'room'),
        task_id: formValue(form, 'task_id'),
        soonness: formValue(form, 'soonness')
      }).then(refreshFrom);
      return;
    }
    if (type === 'search') {
      api('search', { q: formValue(form, 'q') }).then(function (data) {
        if (!data || data.success === false) {
          showMessage(data && data.error ? data.error : 'Search failed.', true);
          return;
        }
        state.search = data;
        if (state.data) {
          render(state.data);
        }
      });
    }
  });

  window.addEventListener('popstate', function () {
    dimPresenceForRoom(state.currentRoom);
    state.currentRoom = roomFromLocation();
    loadState();
  });

  window.addEventListener('storage', function (event) {
    if (event.key === 'session_token' || event.key === 'csrf_token') {
      loadState();
    }
  });

  window.addEventListener('blog-auth-changed', loadState);

  startPresenceTimer();
  loadState();
})();
