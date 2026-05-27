(function () {
  'use strict';

  var root = document.getElementById('desk-page-root');
  if (!root) {
    return;
  }

  var state = {
    data: null,
    search: null,
    currentRoom: roomFromLocation(),
    mode: 'map',
    closingMode: '',
    draggedRoom: '',
    suppressRoomClick: false,
    secretPassageSource: null,
    lastEnteredDoor: null,
    createRoomOpen: false,
    todoAddOpen: false,
    threshold: thresholdFromStorage(),
    showSurfacedOnly: false,
    pointerRoomDrag: null,
    presence: {},
    presenceTick: Date.now(),
    inFlight: 0
  };
  var modeCloseTimer = null;
  var presenceTimer = null;
  var suppressRoomClickTimer = null;
  var messageTimer = null;

  function markPageReady() {
    var gate = window.__wizardryHydration;
    if (gate && typeof gate.markPageReady === 'function') {
      gate.markPageReady();
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
      if (path === '/desk' || path === '') {
        return '';
      }
      if (path.indexOf('/desk/') === 0) {
        return decodeURIComponent(path.slice('/desk/'.length));
      }
      return '';
    } catch (_err) {
      return '';
    }
  }

  function thresholdFromStorage() {
    var stored = Number(storageGet('desk_visibility_threshold') || 1);
    if (!Number.isFinite(stored) || stored < 1) {
      return 1;
    }
    return Math.min(100, Math.floor(stored));
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
    var elapsed = Math.max(0, Math.min(30000, current - (state.presenceTick || current)));
    var rooms = Object.assign({}, state.presence || readPresence());
    var roomKeys = Object.keys(rooms);
    roomKeys.forEach(function (room) {
      rooms[room] = clampPresence(Number(rooms[room] || 0) - elapsed / 1800000);
      if (rooms[room] <= 0.002) {
        delete rooms[room];
      }
    });
    var currentRoom = String(state.currentRoom || '');
    rooms[currentRoom] = clampPresence(Number(rooms[currentRoom] || 0) + elapsed / 600000);
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
    root.querySelectorAll('[data-desk-room-presence]').forEach(function (node) {
      var room = node.getAttribute('data-desk-room-presence') || '';
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
    return clean ? '/desk/' + encodeURIComponent(clean) : '/desk';
  }

  function setRoom(room, replace) {
    var clean = String(room || '').trim();
    if (clean !== state.currentRoom) {
      dimPresenceForRoom(state.currentRoom);
      applyPresenceValues(state.presence);
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

  function api(action, payload) {
    var body = new URLSearchParams();
    var auth = authPayload();
    body.set('session_token', auth.session_token);
    body.set('csrf_token', auth.csrf_token);
    body.set('action', action);
    body.set('visibility_threshold', String(state.threshold || 1));
    Object.keys(payload || {}).forEach(function (key) {
      if (payload[key] != null) {
        body.set(key, String(payload[key]));
      }
    });
    setBusy(true);
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
      setBusy(false);
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

  function statusTooltip(value, isCurrent) {
    var label = statusLabel(value);
    return (isCurrent ? label + ' is current' : 'Set status: ' + label);
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
    var current = data && data.status && data.status.online_status ? data.status.online_status : 'quiet';
    return '<div class="desk-status" aria-label="Desk status">' +
      ['available', 'quiet', 'offline'].map(function (value) {
        var label = statusLabel(value);
        var isCurrent = current === value;
        var tooltip = statusTooltip(value, isCurrent);
        return '<button type="button" class="desk-status-btn" data-desk-status="' + value + '" aria-label="' + escapeHtml(tooltip) + '" title="' + escapeHtml(tooltip) + '" data-desk-tooltip="' + escapeHtml(tooltip) + '" aria-pressed="' + (isCurrent ? 'true' : 'false') + '">' + statusIcon(value) + '</button>';
      }).join('') +
      '</div>';
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

  function syncDeskMenuSettings() {
    var panel = document.getElementById('nav-menu-panel');
    if (!panel) {
      return;
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
    var layout = { '': { x: 0, y: 0, attachedTo: '' } };
    var occupied = { '0,0': '' };
    var doors = [];
    var directions = [
      { name: 'north', dx: 0, dy: -1 },
      { name: 'east', dx: 1, dy: 0 },
      { name: 'south', dx: 0, dy: 1 },
      { name: 'west', dx: -1, dy: 0 }
    ];

    function rotateDirections(seed) {
      var offset = hashText(seed) % directions.length;
      return directions.slice(offset).concat(directions.slice(0, offset));
    }

    function distanceTo(point, target) {
      return Math.abs(point.x - target.x) + Math.abs(point.y - target.y);
    }

    function layoutBoundsWith(candidate) {
      var points = Object.keys(layout).map(function (path) {
        return layout[path];
      }).concat([{ x: candidate.x, y: candidate.y }]);
      var xs = points.map(function (point) { return point.x; });
      var ys = points.map(function (point) { return point.y; });
      var minX = Math.min.apply(null, xs);
      var maxX = Math.max.apply(null, xs);
      var minY = Math.min.apply(null, ys);
      var maxY = Math.max.apply(null, ys);
      return {
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        area: (maxX - minX + 1) * (maxY - minY + 1)
      };
    }

    function compactnessScore(candidate, parentPath, room) {
      var bounds = layoutBoundsWith(candidate);
      var maxSpan = Math.max(bounds.width, bounds.height);
      var minSpan = Math.min(bounds.width, bounds.height);
      var spreadPenalty = Math.max(0, maxSpan - 4) * 34 + Math.max(0, minSpan - 3) * 18;
      var semanticPenalty = candidate.anchor.path === parentPath ? 0 : 28;
      var anchorDistance = distanceTo(candidate.anchor.point, layout[parentPath] || layout['']);
      var outsideBias = roomIsOutdoor(room) ? -openSidesForCandidate(candidate) * 2 : 0;
      return spreadPenalty + semanticPenalty + bounds.area * 1.4 + anchorDistance * 1.6 + candidate.order * 0.01 + outsideBias;
    }

    function openSidesForCandidate(candidate) {
      return directions.filter(function (direction) {
        return occupied[(candidate.x + direction.dx) + ',' + (candidate.y + direction.dy)] == null;
      }).length;
    }

    function anchorsFor(parentPath, roomPath) {
      var parent = layout[parentPath] || layout[''];
      return Object.keys(layout).sort(function (left, right) {
        if (left === parentPath) return -1;
        if (right === parentPath) return 1;
        var leftDistance = distanceTo(layout[left], parent);
        var rightDistance = distanceTo(layout[right], parent);
        if (leftDistance !== rightDistance) return leftDistance - rightDistance;
        return String(left).localeCompare(String(right));
      }).map(function (path) {
        return { path: path, point: layout[path], seed: roomPath + ':' + path };
      });
    }

    function placeRoom(room) {
      var roomPath = String(room.path || '');
      if (!roomPath || layout[roomPath]) return;
      var parentPath = layout[String(room.parent_path || '')] ? String(room.parent_path || '') : '';
      var anchors = anchorsFor(parentPath, roomPath);
      var candidates = [];
      for (var a = 0; a < anchors.length; a += 1) {
        var anchor = anchors[a];
        var sideOrder = rotateDirections(anchor.seed);
        for (var d = 0; d < sideOrder.length; d += 1) {
          var side = sideOrder[d];
          var x = anchor.point.x + side.dx;
          var y = anchor.point.y + side.dy;
          var key = x + ',' + y;
          if (occupied[key] == null) {
            candidates.push({ anchor: anchor, side: side, x: x, y: y, key: key, order: candidates.length });
          }
        }
      }
      if (!candidates.length) return;
      candidates.sort(function (left, right) {
        var scoreDelta = compactnessScore(left, parentPath, room) - compactnessScore(right, parentPath, room);
        if (scoreDelta) return scoreDelta;
        return left.order - right.order;
      });
      var chosen = candidates[0];
      layout[roomPath] = { x: chosen.x, y: chosen.y, attachedTo: chosen.anchor.path };
      occupied[chosen.key] = roomPath;
      doors.push({ from: chosen.anchor.path, to: roomPath, side: chosen.side.name });
    }

    rooms.forEach(placeRoom);
    return { cells: layout, doors: doors, occupied: occupied };
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

  function renderOutdoorEdgeFades(x, y, w, h, exterior) {
    var band = 18;
    var pieces = [];
    if (exterior.north) pieces.push('<rect class="desk-map-outdoor-fade" x="' + x + '" y="' + y + '" width="' + w + '" height="' + band + '" fill="url(#desk-map-grass-fade-n)"></rect>');
    if (exterior.east) pieces.push('<rect class="desk-map-outdoor-fade" x="' + (x + w - band) + '" y="' + y + '" width="' + band + '" height="' + h + '" fill="url(#desk-map-grass-fade-e)"></rect>');
    if (exterior.south) pieces.push('<rect class="desk-map-outdoor-fade" x="' + x + '" y="' + (y + h - band) + '" width="' + w + '" height="' + band + '" fill="url(#desk-map-grass-fade-s)"></rect>');
    if (exterior.west) pieces.push('<rect class="desk-map-outdoor-fade" x="' + x + '" y="' + y + '" width="' + band + '" height="' + h + '" fill="url(#desk-map-grass-fade-w)"></rect>');
    return pieces.join('');
  }

  function renderGreenbelt(cells, occupied, unitW, unitH) {
    if (!cells.length) return '';
    var boundary = [];
    function addEdge(x1, y1, x2, y2) {
      boundary.push('M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2);
    }
    cells.forEach(function (cell) {
      var x = cell.x * unitW;
      var y = cell.y * unitH;
      if (occupied[cell.x + ',' + (cell.y - 1)] == null) {
        addEdge(x, y, x + unitW, y);
      }
      if (occupied[(cell.x + 1) + ',' + cell.y] == null) {
        addEdge(x + unitW, y, x + unitW, y + unitH);
      }
      if (occupied[cell.x + ',' + (cell.y + 1)] == null) {
        addEdge(x + unitW, y + unitH, x, y + unitH);
      }
      if (occupied[(cell.x - 1) + ',' + cell.y] == null) {
        addEdge(x, y + unitH, x, y);
      }
    });
    return '<g class="desk-map-greenbelt" aria-hidden="true">' +
      '<path class="desk-map-greenbelt-strip" d="' + boundary.join(' ') + '"></path>' +
      '</g>';
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

  function secretDoorPoint(room, target, unitW, unitH) {
    var centerX = room.x * unitW + unitW / 2;
    var centerY = room.y * unitH + unitH / 2;
    var targetX = target.x * unitW + unitW / 2;
    var targetY = target.y * unitH + unitH / 2;
    var dx = targetX - centerX;
    var dy = targetY - centerY;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return {
        x: centerX + (dx >= 0 ? unitW / 2 : -unitW / 2),
        y: centerY,
        side: dx >= 0 ? 'east' : 'west'
      };
    }
    return {
      x: centerX,
      y: centerY + (dy >= 0 ? unitH / 2 : -unitH / 2),
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
    var unitW = 170;
    var unitH = 118;
    var cells = Object.keys(layout).map(function (path) { return layout[path]; });
    var minX = Math.min.apply(null, cells.map(function (cell) { return cell.x; }));
    var maxX = Math.max.apply(null, cells.map(function (cell) { return cell.x; }));
    var minY = Math.min.apply(null, cells.map(function (cell) { return cell.y; }));
    var maxY = Math.max.apply(null, cells.map(function (cell) { return cell.y; }));
    var pad = 94;
    var viewX = minX * unitW - pad;
    var viewY = minY * unitH - pad;
    var viewW = (maxX - minX + 1) * unitW + pad * 2;
    var viewH = (maxY - minY + 1) * unitH + pad * 2;
    var roomsByPath = {};
    rooms.forEach(function (item) {
      roomsByPath[String(item.path || '')] = item;
    });
    var greenbelt = renderGreenbelt(cells, plan.occupied, unitW, unitH);
    var roomShapes = rooms.map(function (room) {
      var path = String(room.path || '');
      var point = layout[path];
      var x = point.x * unitW;
      var y = point.y * unitH;
      var exterior = exteriorSides(point, plan.occupied, roomsByPath, room);
      var isCurrent = path === String(state.currentRoom || '');
      var isPassageSource = state.secretPassageSource === path;
      var title = room.title || 'Room';
      var visibleCount = Number(room.visible_task_count || 0);
      var countLabel = visibleCount > 0
        ? '<text class="desk-map-room-meta" x="' + (x + unitW / 2) + '" y="' + (y + 70) + '" text-anchor="middle">+' + escapeHtml(visibleCount) + '</text>'
        : '';
      var isOutdoor = roomIsOutdoor(room);
      var roomPathShape = architecturalRoomPath(x, y, unitW, unitH, exterior, path || 'office');
      var roomShape = isOutdoor
        ? '<rect class="desk-map-room-grass" x="' + x + '" y="' + y + '" width="' + unitW + '" height="' + unitH + '" rx="10"></rect>' + renderOutdoorEdgeFades(x, y, unitW, unitH, exterior)
        : '<path class="desk-map-room-shape" d="' + roomPathShape + '"></path>';
      var currentTint = isCurrent
        ? (isOutdoor
          ? '<rect class="desk-map-room-current-tint" fill="' + escapeHtml(roomColor(room)) + '" x="' + x + '" y="' + y + '" width="' + unitW + '" height="' + unitH + '" rx="10"></rect>'
          : '<path class="desk-map-room-current-tint" fill="' + escapeHtml(roomColor(room)) + '" d="' + roomPathShape + '"></path>')
        : '';
      var presenceGlow = '<ellipse class="desk-map-room-presence' + (roomIsOutdoor(room) ? ' is-outdoor' : '') + '" data-desk-room-presence="' + escapeHtml(path) + '" style="--presence:' + escapeHtml(clampPresence(presence[path])) + '" cx="' + (x + unitW / 2) + '" cy="' + (y + unitH / 2) + '" rx="' + (unitW * 0.38) + '" ry="' + (unitH * 0.34) + '"></ellipse>';
      return '<a href="' + escapeHtml(room.url || roomUrl(path)) + '" data-desk-room-link="' + escapeHtml(path) + '" data-desk-room-drop="' + escapeHtml(path) + '"' + (path ? ' draggable="true"' : '') + ' class="desk-map-room-link">' +
        '<g class="desk-map-room' + (isOutdoor ? ' is-outdoor' : '') + (isCurrent ? ' is-current' : '') + (isPassageSource ? ' is-passage-source' : '') + '" style="--room-color:' + escapeHtml(roomColor(room)) + '">' +
        roomShape +
        currentTint +
        presenceGlow +
        '<text x="' + (x + unitW / 2) + '" y="' + (y + 47) + '" text-anchor="middle">' + escapeHtml(title) + '</text>' +
        countLabel +
        '</g>' +
        '</a>';
    }).join('');
    var doorShapes = plan.doors.map(function (door) {
      return renderDoor(door, layout, unitW, unitH);
    }).join('');
    var passageParts = ((data && data.secret_passages) || []).map(function (passage) {
      return renderSecretPassageParts(passage, layout, unitW, unitH);
    });
    var passageShapes = passageParts.map(function (part) { return part.line; }).join('');
    var passageDoorShapes = passageParts.map(function (part) { return part.doors; }).join('');
    return '<section class="desk-mode-panel desk-map-panel' + (state.closingMode === 'map' ? ' is-closing' : '') + '" aria-label="Room map">' +
      '<div class="desk-map-scroll" aria-label="Desk mansion map">' +
      '<svg class="desk-map-svg" viewBox="' + viewX + ' ' + viewY + ' ' + viewW + ' ' + viewH + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Top-down mansion map of Desk rooms">' +
      '<defs><pattern id="desk-map-parchment-texture" width="96" height="96" patternUnits="userSpaceOnUse"><rect width="96" height="96" fill="#dcc17f"></rect><path d="M4 16C25 11 42 20 64 13S87 8 96 13M0 58C20 53 39 63 60 56s27-11 38-4M16 90C33 82 54 93 76 85" stroke="rgba(116,69,31,0.11)" stroke-width="1.3" fill="none"></path><path d="M20 0v96M68 0v96M0 31h96M0 77h96" stroke="rgba(255,244,194,0.07)" stroke-width="1" fill="none"></path></pattern><pattern id="desk-map-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" stroke="rgba(84,55,28,0.23)" stroke-width="1" fill="none"></path></pattern><pattern id="desk-map-room-paper" width="96" height="96" patternUnits="userSpaceOnUse"><rect width="96" height="96" fill="#d7b46f"></rect><path d="M4 16C25 11 42 20 64 13S87 8 96 13M0 58C20 53 39 63 60 56s27-11 38-4M16 90C33 82 54 93 76 85" stroke="rgba(105,50,24,0.13)" stroke-width="1.3" fill="none"></path><path d="M 28 0 L 0 0 0 28" stroke="rgba(122,66,37,0.18)" stroke-width="1" fill="none"></path></pattern><pattern id="desk-map-grass" width="72" height="72" patternUnits="userSpaceOnUse"><rect width="72" height="72" fill="#7d9b5f"></rect><circle cx="12" cy="14" r="9" fill="rgba(129,169,101,0.35)"></circle><circle cx="54" cy="18" r="13" fill="rgba(83,124,70,0.22)"></circle><circle cx="32" cy="52" r="16" fill="rgba(158,184,106,0.28)"></circle><circle cx="70" cy="62" r="18" fill="rgba(65,105,61,0.2)"></circle><path d="M0 42C18 35 34 37 50 28S66 16 72 18M-4 70C18 61 40 64 76 50" stroke="rgba(238,224,146,0.16)" stroke-width="3" fill="none" stroke-linecap="round"></path></pattern><linearGradient id="desk-map-grass-fade-n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dcc17f" stop-opacity="0.76"></stop><stop offset="1" stop-color="#dcc17f" stop-opacity="0"></stop></linearGradient><linearGradient id="desk-map-grass-fade-e" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#dcc17f" stop-opacity="0.76"></stop><stop offset="1" stop-color="#dcc17f" stop-opacity="0"></stop></linearGradient><linearGradient id="desk-map-grass-fade-s" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#dcc17f" stop-opacity="0.76"></stop><stop offset="1" stop-color="#dcc17f" stop-opacity="0"></stop></linearGradient><linearGradient id="desk-map-grass-fade-w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#dcc17f" stop-opacity="0.76"></stop><stop offset="1" stop-color="#dcc17f" stop-opacity="0"></stop></linearGradient></defs>' +
      '<rect class="desk-map-parchment" x="' + viewX + '" y="' + viewY + '" width="' + viewW + '" height="' + viewH + '"></rect>' +
      '<rect class="desk-map-grid" x="' + viewX + '" y="' + viewY + '" width="' + viewW + '" height="' + viewH + '"></rect>' +
      greenbelt + passageShapes + roomShapes + doorShapes + passageDoorShapes +
      '</svg>' +
      '</div>' +
      '<button type="button" class="desk-map-passage-btn' + (state.secretPassageSource !== null ? ' is-active' : '') + '" data-desk-secret-passage aria-label="Create secret passage" title="Create secret passage"><svg viewBox="0 0 32 32" aria-hidden="true"><g class="desk-passage-books"><path class="desk-passage-book side left" d="M7 8h5v16H7z"></path><path class="desk-passage-book-cover desk-passage-book middle" d="M13.5 6.5h5v18.5h-5z"></path><path class="desk-passage-book side right" d="M20 8h5v16h-5z"></path><path class="desk-passage-book-line" d="M9.5 11.5h0M16 10.5h0M22.5 11.5h0M9.5 20.5h0M16 21.5h0M22.5 20.5h0"></path></g></svg></button>' +
      '<button type="button" class="desk-map-create-btn" data-desk-create-room-open aria-label="Create room">+</button>' +
      (state.createRoomOpen ? renderCreateRoomModal(data) : '') +
      '</section>';
  }

  function renderTodo(data) {
    var room = data.current_room || data.office || {};
    var tasks = data.tasks || [];
    var visibleTasks = state.showSurfacedOnly ? tasks.filter(taskIsSurfaced) : tasks;
    var done = data.done_tasks || [];
    var addExpanded = state.todoAddOpen === true;
    return '<section class="desk-mode-panel desk-todo-panel" aria-label="Checklist">' +
      '<form class="desk-room-name-form" data-desk-form="room-title">' +
      '<input type="hidden" name="room" value="' + escapeHtml(room.path || '') + '">' +
      '<label><span class="desk-visually-hidden">Room name</span><input class="desk-input desk-room-name-input" name="room_title" value="' + escapeHtml(room.title || 'Room') + '" maxlength="96" aria-label="Room name" required></label>' +
      '<button type="submit" class="desk-btn subtle">Save</button>' +
      '</form>' +
      '<div class="desk-panel-tools">' +
      '<form class="desk-kind-form" data-desk-form="room-kind"><input type="hidden" name="room" value="' + escapeHtml(room.path || '') + '"><label><span class="desk-visually-hidden">Room Type</span><select class="desk-select" name="room_kind" aria-label="Room type"><option value="indoor"' + (roomKind(room) === 'indoor' ? ' selected' : '') + '>Indoor</option><option value="outdoor"' + (roomKind(room) === 'outdoor' ? ' selected' : '') + '>Outdoor</option></select></label><button type="submit" class="desk-btn subtle">Set</button></form>' +
      '<form class="desk-color-form" data-desk-form="room-color"><input type="hidden" name="room" value="' + escapeHtml(room.path || '') + '"><label><span class="desk-visually-hidden">Room Color</span><input class="desk-color-input" type="color" name="room_color" value="' + escapeHtml(roomColor(room)) + '" aria-label="Room color"></label><button type="submit" class="desk-btn subtle">Set</button></form></div>' +
      '<div class="desk-room-actions">' +
      '<a class="desk-link-btn" href="/desk" data-desk-room-link="">Office</a>' +
      '<a class="desk-link-btn" href="' + escapeHtml(room.overworld_url || '/overworld') + '">Open in Overworld</a>' +
      (room.has_public_file ? '<span class="desk-pill gold">public.md present</span>' : '<span class="desk-pill">private interior</span>') +
      '<span class="desk-pill">' + escapeHtml(room.sleeping_task_count || 0) + ' below threshold</span>' +
      '</div>' +
      '<form class="desk-todo-add' + (addExpanded ? ' is-expanded' : '') + '" data-desk-form="room-add" aria-label="Add task">' +
      '<input type="hidden" name="destination_room" value="' + escapeHtml(room.path || '') + '">' +
      '<div class="desk-todo-add-inline">' +
      '<div class="desk-todo-add-reveal" ' + (addExpanded ? '' : 'aria-hidden="true"') + '>' +
      '<div class="desk-todo-add-fields">' +
      '<textarea class="desk-textarea desk-todo-add-textarea" name="task_text" rows="2" placeholder="New task" aria-label="New task"' + (addExpanded ? ' required' : '') + '></textarea>' +
      '<button type="submit" class="desk-btn primary desk-todo-add-submit">Add</button>' +
      '</div>' +
      '</div>' +
      '<button type="button" class="desk-todo-add-toggle" data-desk-todo-add-toggle aria-label="' + (addExpanded ? 'Close add task' : 'Add task') + '" title="' + (addExpanded ? 'Close add task' : 'Add task') + '" aria-expanded="' + (addExpanded ? 'true' : 'false') + '"><span class="desk-todo-add-toggle-icon" aria-hidden="true">+</span></button>' +
      '</div>' +
      '</form>' +
      roomTaskFilterControls(tasks) +
      (visibleTasks.length ? '<ul class="desk-task-list desk-notebook-list">' + visibleTasks.map(notebookTaskItem).join('') + '</ul>' : '<p class="desk-empty">No tasks match this view.</p>') +
      (done.length ? '<ul class="desk-done-list">' + done.map(function (task) {
        return '<li class="desk-task"><h3>' + escapeHtml(task.title || 'Task') + '</h3>' + (task.body ? '<p class="desk-task-body">' + escapeHtml(task.body) + '</p>' : '') + taskMeta(task) +
          '<div class="desk-task-actions"><button type="button" class="desk-btn subtle" data-desk-task-action="restore" data-room="' + escapeHtml(task.room || '') + '" data-task-id="' + escapeHtml(task.id || '') + '">Restore</button></div></li>';
      }).join('') + '</ul>' : '<p class="desk-empty">No archived tasks here.</p>') +
      '</section>';
  }

  function renderCompose(data) {
    var selected = data.current_room && data.current_room.path ? data.current_room.path : '';
    return '<section class="desk-mode-panel desk-compose-panel" aria-label="Compose">' +
      '<div class="desk-panel-tools"><a class="desk-link-btn" href="/admin#compose">Full Composer</a></div>' +
      '<form class="desk-form desk-compose-form" data-desk-form="capture">' +
      '<label><span>Post or Capture</span><textarea class="desk-textarea desk-compose-textarea" name="task_text" rows="12" required></textarea></label>' +
      '<div class="desk-form-row">' +
      '<label><span>Room</span><select class="desk-select" name="destination_room">' + roomOptionRows(data, selected) + '</select></label>' +
      '<button type="submit" class="desk-btn primary">Pin as Task</button>' +
      '</div>' +
      '</form>' +
      '<form class="desk-form desk-search-form" data-desk-form="search">' +
      '<div class="desk-form-row">' +
      '<label><span>Search Desk</span><input class="desk-input" type="search" name="q" minlength="2" required></label>' +
      '<button type="submit" class="desk-btn subtle">Search</button>' +
      '</div>' +
      '</form>' +
      renderSearch(state.search) +
      '</section>';
  }

  function renderModeDock() {
    return '<div class="desk-mode-dock" aria-label="Desk modes">' +
      '<button type="button" class="desk-mode-launch desk-mode-map' + (state.mode === 'map' && state.closingMode !== 'map' ? ' is-active' : '') + '" data-desk-mode="map" aria-label="' + (state.mode === 'map' && state.closingMode !== 'map' ? 'Close room map' : 'Open room map') + '" aria-pressed="' + (state.mode === 'map' && state.closingMode !== 'map' ? 'true' : 'false') + '"><svg class="desk-map-fold-icon" viewBox="0 0 72 72" aria-hidden="true"><g class="desk-map-fold-art"><path class="desk-map-fold-shadow" d="M8 58L27 43L45 50L64 34"></path><path class="desk-map-fold-panel left" d="M8 20L27 12V55L8 64Z"></path><path class="desk-map-fold-panel mid" d="M27 12L45 20V62L27 55Z"></path><path class="desk-map-fold-panel right" d="M45 20L64 11V51L45 62Z"></path><path class="desk-map-fold-crease" d="M27 12V55M45 20V62"></path><path class="desk-map-fold-grid" d="M13 29l10-4M13 39l10-4M32 25l9 4M32 37l9 4M50 28l9-4M50 40l9-4"></path><path class="desk-map-fold-route" d="M12 52c7-11 13-2 21-13 6-8 11-3 15-10 3-5 7-7 12-8"></path></g></svg></button>' +
      '<button type="button" class="desk-mode-launch desk-mode-compose' + (state.mode === 'compose' ? ' is-active' : '') + '" data-desk-mode="compose" aria-label="Compose on the desk"><svg class="desk-compose-quill-icon" viewBox="0 0 256 256" aria-hidden="true"><g class="desk-compose-quill-mark" transform="translate(-4 4)"><path fill="currentColor" d="m229.66 58.34l-32-32a8 8 0 0 0-11.32 0l-96 96A8 8 0 0 0 88 128v32a8 8 0 0 0 8 8h32a8 8 0 0 0 5.66-2.34l96-96a8 8 0 0 0 0-11.32M124.69 152H104v-20.69l64-64L188.69 88ZM200 76.69L179.31 56L192 43.31L212.69 64ZM224 128v80a16 16 0 0 1-16 16H48a16 16 0 0 1-16-16V48a16 16 0 0 1 16-16h80a8 8 0 0 1 0 16H48v160h160v-80a8 8 0 0 1 16 0"></path></g></svg></button>' +
      '<button type="button" class="desk-mode-launch desk-mode-todo' + (state.mode === 'todo' ? ' is-active' : '') + '" data-desk-mode="todo" aria-label="Open checklist"><svg class="desk-checklist-notebook-icon" viewBox="0 0 64 72" aria-hidden="true"><path class="desk-checklist-page" d="M15 7h37c2.6 0 4.8 2.1 4.8 4.8v48.6c0 2.6-2.1 4.8-4.8 4.8H15c-2.6 0-4.8-2.1-4.8-4.8V11.8C10.2 9.1 12.4 7 15 7Z"></path><path class="desk-checklist-margin" d="M22 8v56"></path><path class="desk-checklist-rule" d="M27 21h20M27 34h20M27 47h20"></path><path class="desk-checklist-check" d="M15.8 21.2l2.4 2.4 4.4-5.1M15.8 34.2l2.4 2.4 4.4-5.1M15.8 47.2l2.4 2.4 4.4-5.1"></path></svg></button>' +
      '</div>';
  }

  function renderStage(data) {
    var content = '';
    if (state.mode === 'todo') {
      content = renderMap(data) + renderTodo(data);
    } else if (state.mode === 'compose') {
      content = renderCompose(data);
    } else if (state.mode === 'map') {
      content = renderMap(data);
    }
    return '<div class="desk-stage" data-desk-stage-mode="' + escapeHtml(state.mode) + '">' + content + '</div>' + renderModeDock();
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
    clearModeCloseTimer();
    state.mode = mode || 'map';
    state.closingMode = '';
    state.search = null;
    state.createRoomOpen = false;
    state.secretPassageSource = null;
    if (state.data) {
      render(state.data);
    }
  }

  function closeMapMode() {
    if (state.mode !== 'map' || state.closingMode === 'map') {
      return;
    }
    clearModeCloseTimer();
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
      modeCloseTimer = null;
      if (state.data) {
        render(state.data);
      }
    }, 360);
  }

  function closeOpenMode() {
    clearModeCloseTimer();
    state.mode = 'closed';
    state.closingMode = '';
    state.search = null;
    state.createRoomOpen = false;
    state.secretPassageSource = null;
    if (state.data) {
      render(state.data);
    }
  }

  function isDeskBackgroundClick(event) {
    var target = event.target;
    var stage = target.closest && target.closest('.desk-stage');
    if (!stage) {
      return false;
    }
    if (state.mode === 'closed') {
      return false;
    }
    if (target.closest('button, a, input, select, textarea, label, form, .desk-modal, .desk-todo-panel, .desk-compose-panel, .desk-map-room-link')) {
      return false;
    }
    return target === stage || Boolean(target.closest('.desk-map-scroll'));
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
        '<span class="desk-muted"> +' + escapeHtml(task.upvotes || 0) + '</span></li>';
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
      '<span class="desk-pill">' + escapeHtml(room.sleeping_task_count || 0) + ' sleeping</span>' +
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
      '<div class="desk-form-row">' +
      '<label><span class="desk-visually-hidden">New Room</span><input class="desk-input" name="room_title" placeholder="New room" aria-label="New room" required></label>' +
      '<label><span class="desk-visually-hidden">Connects from</span><select class="desk-select" name="room" aria-label="Connects from">' + roomOptionRows(data, current) + '</select></label>' +
      '<button type="submit" class="desk-btn subtle" aria-label="Create room">+</button>' +
      '</div>' +
      '</form>';
  }

  function renderCreateRoomModal(data) {
    return '<div class="desk-modal-backdrop" data-desk-modal-backdrop>' +
      '<div class="desk-modal" role="dialog" aria-modal="true" aria-label="Create room">' +
      '<button type="button" class="desk-modal-close" data-desk-create-room-close aria-label="Close">×</button>' +
      renderCreateRoom(data) +
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
      '<span class="desk-pill">' + escapeHtml(office.sleeping_task_count || 0) + ' sleeping local</span>' +
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
    var bits = ['+' + (task.upvotes || 0)];
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
    return '<li class="desk-task desk-notebook-task" data-task-id="' + escapeHtml(task.id || '') + '">' +
      '<span class="desk-notebook-check">□</span>' +
      '<span class="desk-notebook-title">' + escapeHtml(task.title || 'Task') + '</span>' +
      '<span class="desk-notebook-votes">+' + escapeHtml(task.upvotes || 0) + '</span>' +
      '<button type="button" class="desk-notebook-btn" title="Upvote" aria-label="Upvote" data-desk-task-action="vote" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '">▲</button>' +
      '<button type="button" class="desk-notebook-btn" title="Done" aria-label="Done" data-desk-task-action="complete" data-room="' + escapeHtml(room) + '" data-task-id="' + escapeHtml(task.id || '') + '">✓</button>' +
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
      '<a class="desk-link-btn" href="/desk" data-desk-room-link="">Office</a>' +
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

  function render(data) {
    state.data = data;
    root.dataset.roomTone = roomTone(data.current_room && data.current_room.path);
    root.innerHTML = renderChromeControls(data) +
      '<div data-desk-message></div>' +
      renderStage(data);
    syncDeskMenuSettings();
    markPageReady();
  }

  function showGate(message) {
    root.innerHTML = '<div class="desk-access-gate">' +
      '<p class="desk-kicker">Private Interior</p>' +
      '<h1>Desk</h1>' +
      '<p>' + escapeHtml(message || 'Sign in with the owner Nostr identity to enter.') + '</p>' +
      '<button type="button" class="desk-btn primary" data-desk-login>Login</button>' +
      '</div>';
    markPageReady();
  }

  function loadState() {
    if (!state.data) {
      root.innerHTML = '<div class="desk-loading"><h1>Desk</h1></div>';
    }
    api('state', { room: state.currentRoom }).then(function (data) {
      if (!data || data.success === false) {
        showGate(data && data.error ? data.error : 'Desk is not available.');
        return;
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

  function clearRoomDragClasses() {
    root.querySelectorAll('.is-drop-target, .is-dragging').forEach(function (node) {
      node.classList.remove('is-drop-target', 'is-dragging');
    });
  }

  function roomDropTargetAt(x, y, sourceRoom) {
    var node = document.elementFromPoint(x, y);
    var target = node && node.closest ? node.closest('[data-desk-room-drop]') : null;
    if (!target || !root.contains(target)) {
      return null;
    }
    var targetRoom = target.getAttribute('data-desk-room-drop') || '';
    if (targetRoom === sourceRoom) {
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

  function finishRoomMove(sourceRoom, targetRoom, hasValidTarget) {
    if (!hasValidTarget || !sourceRoom || sourceRoom === targetRoom) {
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

    var modeButton = event.target.closest('[data-desk-mode]');
    if (modeButton) {
      var requestedMode = modeButton.getAttribute('data-desk-mode') || 'map';
      if (requestedMode === 'map' && state.mode === 'map' && state.closingMode !== 'map') {
        closeMapMode();
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
      if (state.suppressRoomClick) {
        return;
      }
      var clickedRoom = roomLink.getAttribute('data-desk-room-link') || '';
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
      setRoom(clickedRoom, false);
      return;
    }

    var status = event.target.closest('[data-desk-status]');
    if (status) {
      if (status.getAttribute('aria-pressed') === 'true') {
        showMessage(statusLabel(status.getAttribute('data-desk-status') || 'quiet') + ' is already selected.', false);
        return;
      }
      api('set-status', {
        room: state.currentRoom,
        online_status: status.getAttribute('data-desk-status') || 'quiet'
      }).then(refreshFrom);
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
      var apiAction = action === 'vote' ? 'vote-task' : (action === 'restore' ? 'restore-task' : 'complete-task');
      api(apiAction, {
        room: taskAction.getAttribute('data-room') || state.currentRoom,
        task_id: taskAction.getAttribute('data-task-id') || ''
      }).then(refreshFrom);
    }

    var todoAddToggle = event.target.closest('[data-desk-todo-add-toggle]');
    if (todoAddToggle) {
      event.preventDefault();
      state.todoAddOpen = !state.todoAddOpen;
      if (state.data) {
        render(state.data);
      }
      if (state.todoAddOpen) {
        window.setTimeout(function () {
          var field = root.querySelector('.desk-todo-add-textarea');
          if (field && typeof field.focus === 'function') {
            field.focus();
          }
        }, 0);
      }
    }
  });

  root.addEventListener('dragstart', function (event) {
    var roomLink = event.target.closest('[data-desk-room-link]');
    if (!roomLink) {
      return;
    }
    var room = roomLink.getAttribute('data-desk-room-link') || '';
    if (!room) {
      event.preventDefault();
      return;
    }
    state.draggedRoom = room;
    suppressRoomClickFor(1200);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', room);
    roomLink.classList.add('is-dragging');
  });

  root.addEventListener('pointerdown', function (event) {
    var roomLink = event.target.closest('[data-desk-room-link]');
    if (!roomLink || state.secretPassageSource !== null) {
      return;
    }
    var room = roomLink.getAttribute('data-desk-room-link') || '';
    if (!room || event.button !== 0) {
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
    markRoomDropTarget(roomDropTargetAt(event.clientX, event.clientY, drag.room));
  });

  root.addEventListener('pointerup', function (event) {
    var drag = state.pointerRoomDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    var target = drag.active ? roomDropTargetAt(event.clientX, event.clientY, drag.room) : null;
    var targetRoom = target ? target.getAttribute('data-desk-room-drop') || '' : '';
    if (drag.active) {
      event.preventDefault();
      finishRoomMove(drag.room, targetRoom, Boolean(target));
    }
    clearRoomDragClasses();
    state.pointerRoomDrag = null;
    state.draggedRoom = '';
    suppressRoomClickFor(220);
  });

  root.addEventListener('pointercancel', function () {
    clearRoomDragClasses();
    state.pointerRoomDrag = null;
    state.draggedRoom = '';
    suppressRoomClickFor(220);
  });

  root.addEventListener('dragover', function (event) {
    var target = event.target.closest('[data-desk-room-drop]');
    if (!target || !state.draggedRoom) {
      return;
    }
    var targetRoom = target.getAttribute('data-desk-room-drop') || '';
    if (targetRoom === state.draggedRoom) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    target.classList.add('is-drop-target');
  });

  root.addEventListener('dragleave', function (event) {
    var target = event.target.closest('[data-desk-room-drop]');
    if (target) {
      target.classList.remove('is-drop-target');
    }
  });

  root.addEventListener('drop', function (event) {
    var target = event.target.closest('[data-desk-room-drop]');
    var source = state.draggedRoom || (event.dataTransfer && event.dataTransfer.getData('text/plain')) || '';
    if (!target || !source) {
      return;
    }
    event.preventDefault();
    var targetRoom = target.getAttribute('data-desk-room-drop') || '';
    clearRoomDragClasses();
    state.draggedRoom = '';
    suppressRoomClickFor(220);
    finishRoomMove(source, targetRoom, true);
  });

  root.addEventListener('dragend', function () {
    clearRoomDragClasses();
    state.draggedRoom = '';
    suppressRoomClickFor(220);
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
      api('add-task', {
        destination_room: destinationRoom,
        task_text: formValue(form, 'task_text')
      }).then(function (data) {
        if (data && data.success !== false) {
          form.reset();
          if (type === 'room-add') {
            state.todoAddOpen = false;
          }
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
    if (type === 'room-title') {
      api('set-room-title', {
        room: formValue(form, 'room'),
        room_title: formValue(form, 'room_title')
      }).then(function (data) {
        refreshFrom(data);
        if (data && data.success !== false) {
          showMessage('Room name saved.', false);
        }
      });
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
