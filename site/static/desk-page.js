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
    createRoomOpen: false,
    threshold: thresholdFromStorage(),
    showSurfacedOnly: false,
    inFlight: 0
  };
  var modeCloseTimer = null;

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
      return String(new URL(window.location.href).searchParams.get('room') || '').trim();
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

  function roomUrl(room) {
    var clean = String(room || '').trim();
    return clean ? '/desk?room=' + encodeURIComponent(clean) : '/desk';
  }

  function setRoom(room, replace) {
    var clean = String(room || '').trim();
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
    if (!message) {
      slot.innerHTML = '';
      return;
    }
    slot.innerHTML = '<p class="desk-message' + (isError ? ' is-error' : '') + '">' + escapeHtml(message) + '</p>';
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

  function statusButtons(data) {
    var current = data && data.status && data.status.online_status ? data.status.online_status : 'quiet';
    return '<div class="desk-status" aria-label="Desk status">' +
      ['available', 'quiet', 'offline'].map(function (value) {
        return '<button type="button" class="desk-status-btn' + (current === value ? ' is-active' : '') + '" data-desk-status="' + value + '">' + escapeHtml(statusLabel(value)) + '</button>';
      }).join('') +
      '</div>';
  }

  function thresholdControl() {
    var values = [1, 2, 3, 5];
    if (values.indexOf(state.threshold) === -1) {
      values.push(state.threshold);
      values.sort(function (left, right) { return left - right; });
    }
    return '<label class="desk-threshold-control"><span class="desk-visually-hidden">Surface at</span><select class="desk-select" data-desk-threshold aria-label="Surface threshold">' +
      values.map(function (value) {
        return '<option value="' + value + '"' + (value === state.threshold ? ' selected' : '') + '>+' + value + '</option>';
      }).join('') +
      '</select></label>';
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
      for (var a = 0; a < anchors.length; a += 1) {
        var anchor = anchors[a];
        var sideOrder = rotateDirections(anchor.seed);
        for (var d = 0; d < sideOrder.length; d += 1) {
          var side = sideOrder[d];
          var x = anchor.point.x + side.dx;
          var y = anchor.point.y + side.dy;
          var key = x + ',' + y;
          if (occupied[key] == null) {
            layout[roomPath] = { x: x, y: y, attachedTo: anchor.path };
            occupied[key] = roomPath;
            doors.push({ from: anchor.path, to: roomPath, side: side.name });
            return;
          }
        }
      }
    }

    rooms.forEach(placeRoom);
    return { cells: layout, doors: doors, occupied: occupied };
  }

  function exteriorSides(point, occupied) {
    return {
      north: occupied[point.x + ',' + (point.y - 1)] == null,
      east: occupied[(point.x + 1) + ',' + point.y] == null,
      south: occupied[point.x + ',' + (point.y + 1)] == null,
      west: occupied[(point.x - 1) + ',' + point.y] == null
    };
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

  function roomWallAdornments(x, y, w, h, exterior) {
    var paths = [];
    if (exterior.north) {
      paths.push('M ' + (x + w * 0.08) + ' ' + y + ' v -10 M ' + (x + w * 0.92) + ' ' + y + ' v -10');
    }
    if (exterior.east) {
      paths.push('M ' + (x + w) + ' ' + (y + h * 0.08) + ' h 10 M ' + (x + w) + ' ' + (y + h * 0.92) + ' h 10');
    }
    if (exterior.south) {
      paths.push('M ' + (x + w * 0.08) + ' ' + (y + h) + ' v 10 M ' + (x + w * 0.92) + ' ' + (y + h) + ' v 10');
    }
    if (exterior.west) {
      paths.push('M ' + x + ' ' + (y + h * 0.08) + ' h -10 M ' + x + ' ' + (y + h * 0.92) + ' h -10');
    }
    return paths.map(function (path) {
      return '<path class="desk-map-wall-adornment" d="' + path + '"></path>';
    }).join('');
  }

  function renderDoor(door, layout, unitW, unitH) {
    var from = layout[door.from];
    var to = layout[door.to];
    if (!from || !to) return '';
    var x;
    var y;
    if (door.side === 'east' || door.side === 'west') {
      x = (door.side === 'east' ? from.x + 1 : from.x) * unitW;
      y = (Math.max(from.y, to.y) * unitH) + unitH / 2;
      var swingX = x + (door.side === 'east' ? 20 : -20);
      return '<g class="desk-map-door"><path d="M ' + x + ' ' + (y - 15) + ' V ' + (y + 15) + '"></path><path d="M ' + x + ' ' + (y - 15) + ' Q ' + swingX + ' ' + y + ' ' + x + ' ' + (y + 15) + '"></path></g>';
    }
    x = (Math.max(from.x, to.x) * unitW) + unitW / 2;
    y = (door.side === 'south' ? from.y + 1 : from.y) * unitH;
    var swingY = y + (door.side === 'south' ? 20 : -20);
    return '<g class="desk-map-door"><path d="M ' + (x - 15) + ' ' + y + ' H ' + (x + 15) + '"></path><path d="M ' + (x - 15) + ' ' + y + ' Q ' + x + ' ' + swingY + ' ' + (x + 15) + ' ' + y + '"></path></g>';
  }

  function renderMap(data) {
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
    var roomShapes = rooms.map(function (room) {
      var path = String(room.path || '');
      var point = layout[path];
      var x = point.x * unitW;
      var y = point.y * unitH;
      var exterior = exteriorSides(point, plan.occupied);
      var isCurrent = path === String(state.currentRoom || '');
      var title = room.title || 'Room';
      return '<a href="' + escapeHtml(room.url || roomUrl(path)) + '" data-desk-room-link="' + escapeHtml(path) + '" class="desk-map-room-link">' +
        '<g class="desk-map-room' + (isCurrent ? ' is-current' : '') + '" style="--room-color:' + escapeHtml(roomColor(room)) + '">' +
        '<path class="desk-map-room-shape" d="' + architecturalRoomPath(x, y, unitW, unitH, exterior, path || 'office') + '"></path>' +
        roomWallAdornments(x, y, unitW, unitH, exterior) +
        '<text x="' + (x + unitW / 2) + '" y="' + (y + 47) + '" text-anchor="middle">' + escapeHtml(title) + '</text>' +
        '<text class="desk-map-room-meta" x="' + (x + unitW / 2) + '" y="' + (y + 70) + '" text-anchor="middle">+' + escapeHtml(room.visible_task_count || 0) + ' / ' + escapeHtml(room.sleeping_task_count || 0) + '</text>' +
        '</g>' +
        '</a>';
    }).join('');
    var doorShapes = plan.doors.map(function (door) {
      return renderDoor(door, layout, unitW, unitH);
    }).join('');
    return '<section class="desk-mode-panel desk-map-panel' + (state.closingMode === 'map' ? ' is-closing' : '') + '" aria-label="Room map">' +
      '<div class="desk-map-scroll" aria-label="Desk mansion map">' +
      '<svg class="desk-map-svg" viewBox="' + viewX + ' ' + viewY + ' ' + viewW + ' ' + viewH + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Top-down mansion map of Desk rooms">' +
      '<defs><pattern id="desk-map-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none"></path></pattern></defs>' +
      '<rect class="desk-map-parchment" x="' + viewX + '" y="' + viewY + '" width="' + viewW + '" height="' + viewH + '"></rect>' +
      '<rect class="desk-map-grid" x="' + viewX + '" y="' + viewY + '" width="' + viewW + '" height="' + viewH + '"></rect>' +
      roomShapes + doorShapes +
      '</svg>' +
      '</div>' +
      '<button type="button" class="desk-map-create-btn" data-desk-create-room-open aria-label="Create room">+</button>' +
      (state.createRoomOpen ? renderCreateRoomModal(data) : '') +
      '</section>';
  }

  function renderTodo(data) {
    var room = data.current_room || data.office || {};
    var tasks = data.tasks || [];
    var visibleTasks = state.showSurfacedOnly ? tasks.filter(taskIsSurfaced) : tasks;
    var done = data.done_tasks || [];
    return '<section class="desk-mode-panel desk-todo-panel" aria-label="Checklist">' +
      '<form class="desk-room-name-form" data-desk-form="room-title">' +
      '<input type="hidden" name="room" value="' + escapeHtml(room.path || '') + '">' +
      '<label><span class="desk-visually-hidden">Room name</span><input class="desk-input desk-room-name-input" name="room_title" value="' + escapeHtml(room.title || 'Room') + '" maxlength="96" aria-label="Room name" required></label>' +
      '<button type="submit" class="desk-btn subtle">Save</button>' +
      '</form>' +
      '<div class="desk-panel-tools">' +
      '<form class="desk-color-form" data-desk-form="room-color"><input type="hidden" name="room" value="' + escapeHtml(room.path || '') + '"><label><span class="desk-visually-hidden">Room Color</span><input class="desk-color-input" type="color" name="room_color" value="' + escapeHtml(roomColor(room)) + '" aria-label="Room color"></label><button type="submit" class="desk-btn subtle">Set</button></form></div>' +
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
      '<button type="button" class="desk-mode-launch desk-mode-map' + (state.mode === 'map' && state.closingMode !== 'map' ? ' is-active' : '') + '" data-desk-mode="map" aria-label="' + (state.mode === 'map' && state.closingMode !== 'map' ? 'Close room map' : 'Open room map') + '" aria-pressed="' + (state.mode === 'map' && state.closingMode !== 'map' ? 'true' : 'false') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5l5-2 8 2 5-2v15l-5 2-8-2-5 2z"></path><path d="M8 3.5v15"></path><path d="M16 5.5v15"></path></svg></button>' +
      '<button type="button" class="desk-mode-launch desk-mode-compose' + (state.mode === 'compose' ? ' is-active' : '') + '" data-desk-mode="compose" aria-label="Compose on the desk"><span>✎</span></button>' +
      '<button type="button" class="desk-mode-launch desk-mode-todo' + (state.mode === 'todo' ? ' is-active' : '') + '" data-desk-mode="todo" aria-label="Open checklist"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h13"></path><path d="M7 10h13"></path><path d="M7 15.5h13"></path><path d="M3.5 4.5l.8.8 1.6-1.8"></path><path d="M3.5 10l.8.8L5.9 9"></path><path d="M3.5 15.5l.8.8 1.6-1.8"></path></svg></button>' +
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

  function openMode(mode) {
    clearModeCloseTimer();
    state.mode = mode || 'map';
    state.closingMode = '';
    state.search = null;
    state.createRoomOpen = false;
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

  function renderChromeControls(data) {
    return '<div class="desk-chrome-controls">' + statusButtons(data) + thresholdControl() + '</div>';
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
    root.innerHTML = '<div class="desk-loading"><h1>Desk</h1></div>';
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

    var roomLink = event.target.closest('[data-desk-room-link]');
    if (roomLink) {
      event.preventDefault();
      state.mode = 'map';
      setRoom(roomLink.getAttribute('data-desk-room-link') || '', false);
      return;
    }

    var status = event.target.closest('[data-desk-status]');
    if (status) {
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
  });

  root.addEventListener('change', function (event) {
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
    state.currentRoom = roomFromLocation();
    loadState();
  });

  window.addEventListener('storage', function (event) {
    if (event.key === 'session_token' || event.key === 'csrf_token') {
      loadState();
    }
  });

  window.addEventListener('blog-auth-changed', loadState);

  loadState();
})();
