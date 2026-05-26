(function () {
  'use strict';

  var APP_SLUG = 'pieplate';
  var STORAGE_KEY = 'pieplate.card.v1';
  var PREF_KEY = 'pieplate.prefs.v1';
  var GRID_SIZE = 25;
  var HEADER_SIZE = 5;

  var els = {};
  var state = {
    card: defaultCard(),
    projectName: 'bingo',
    projectDirty: true,
    savedProjects: [],
    autosave: false,
    autosaveTimer: null,
    autosaveBusy: false,
    versions: [],
    activeVersionId: 'original',
    propertiesOpen: false,
    rightOpen: false,
    rightMode: 'randomizer',
    printOptions: {
      count: 1,
      randomized: false,
      title: true,
      description: true,
      key: false
    },
    editingImage: null,
    imageDrag: null,
    cellDrag: null,
    imageUndo: null,
    forcedImage: null,
    lastPointer: null,
    toastTimer: null,
    versionSerial: 0,
    bridgeReady: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function defaultCard() {
    var cells = [];
    for (var i = 0; i < GRID_SIZE; i += 1) {
      cells.push({ id: 'c' + i, text: '', image: null });
    }
    return {
      title: 'Bingo',
      description: 'Click any square to edit text. Drop an image into a square to place it.',
      headers: ['B', 'I', 'N', 'G', 'O'],
      cells: cells
    };
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function bridgeAvailable() {
    return !!(window.wizardry && window.wizardry.exec);
  }

  function inferBackendCandidates() {
    var candidates = [];
    try {
      var pagePath = decodeURIComponent(String(window.location.pathname || ''));
      var appIndex = pagePath.lastIndexOf('/app/index.html');
      if (appIndex >= 0) {
        candidates.push(pagePath.slice(0, appIndex) + '/app/scripts/pieplate-backend.sh');
      }
      var bundleIndex = pagePath.lastIndexOf('/index.html');
      if (bundleIndex >= 0) {
        candidates.push(pagePath.slice(0, bundleIndex) + '/scripts/pieplate-backend.sh');
      }
    } catch (_err) {
      // Browser URL decoding can fail on malformed paths; backend fallback handles that case.
    }
    return candidates.filter(function (value, index, arr) {
      return value && arr.indexOf(value) === index;
    });
  }

  async function bridgeExec(argv) {
    if (!bridgeAvailable()) {
      throw new Error('wizardry bridge unavailable');
    }
    return window.wizardry.exec(argv);
  }

  async function backendExec(action, args) {
    var candidates = inferBackendCandidates();
    var list = Array.isArray(args) ? args.slice(0) : [];
    for (var i = 0; i < candidates.length; i += 1) {
      try {
        var res = await bridgeExec(['sh', candidates[i], action].concat(list));
        if (typeof res.exit_code !== 'undefined' && res.exit_code !== 0) {
          throw new Error((res.stderr || res.stdout || 'backend error').trim());
        }
        return res;
      } catch (err) {
        var msg = String(err && err.message ? err.message : err).toLowerCase();
        if (msg.indexOf('no such file') < 0 && msg.indexOf('not found') < 0 && msg.indexOf('cannot open') < 0) {
          throw err;
        }
      }
    }
    throw new Error('Pieplate backend could not be resolved');
  }

  function currentCard() {
    if (state.activeVersionId === 'original') {
      return state.card;
    }
    var version = state.versions.find(function (item) {
      return item.id === state.activeVersionId;
    });
    return version ? version.card : state.card;
  }

  function persistCard() {
    markProjectDirty();
    persistBrowserDraft();
    scheduleAutosave();
  }

  function markProjectDirty() {
    state.projectDirty = true;
    updateProjectControls();
  }

  function persistBrowserDraft() {
    if (bridgeAvailable()) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      projectName: state.projectName || projectSlug(state.card.title),
      card: state.card
    }));
  }

  function persistPrefs() {
    var payload = JSON.stringify({
      propertiesOpen: state.propertiesOpen,
      rightOpen: state.rightOpen,
      rightMode: state.rightMode,
      autosave: state.autosave,
      printOptions: state.printOptions
    });
    localStorage.setItem(PREF_KEY, payload);
    if (bridgeAvailable()) {
      backendExec('set-ui-pref', ['properties_open', state.propertiesOpen ? '1' : '0']).catch(function () {});
      backendExec('set-ui-pref', ['right_open', state.rightOpen ? '1' : '0']).catch(function () {});
      backendExec('set-ui-pref', ['right_mode', state.rightMode]).catch(function () {});
      backendExec('set-ui-pref', ['autosave', state.autosave ? '1' : '0']).catch(function () {});
    }
  }

  async function loadCard() {
    state.card = defaultCard();
    state.projectName = projectSlug(state.card.title);
    state.projectDirty = true;
    if (bridgeAvailable()) {
      await refreshSavedProjects();
      return;
    }
    var stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      var draft = JSON.parse(stored);
      if (draft && draft.card) {
        state.card = normalizeCard(draft.card);
        state.projectName = projectSlug(draft.projectName || state.card.title);
      } else {
        state.card = normalizeCard(draft);
        state.projectName = projectSlug(state.card.title);
      }
    } catch (_err) {
      state.card = defaultCard();
      state.projectName = projectSlug(state.card.title);
    }
  }

  function loadPrefs() {
    var stored = localStorage.getItem(PREF_KEY);
    if (!stored) {
      return;
    }
    try {
      var prefs = JSON.parse(stored);
      if (prefs && prefs.printOptions) {
        Object.assign(state.printOptions, prefs.printOptions);
      }
      if (prefs && typeof prefs.propertiesOpen === 'boolean') {
        state.propertiesOpen = prefs.propertiesOpen;
      }
      if (prefs && typeof prefs.rightOpen === 'boolean') {
        state.rightOpen = prefs.rightOpen;
      }
      if (prefs && (prefs.rightMode === 'randomizer' || prefs.rightMode === 'key' || prefs.rightMode === 'print')) {
        state.rightMode = prefs.rightMode;
      }
      if (prefs && typeof prefs.autosave === 'boolean') {
        state.autosave = prefs.autosave;
      }
    } catch (_err) {
      // Bad preference data should not block startup.
    }
  }

  async function loadBackendPrefs() {
    if (!bridgeAvailable()) {
      return;
    }
    try {
      var res = await backendExec('get-ui-prefs', []);
      String(res.stdout || '').split(/\r?\n/).forEach(function (line) {
        var index = line.indexOf('=');
        if (index < 0) {
          return;
        }
        var key = line.slice(0, index);
        var value = line.slice(index + 1);
        if (key === 'properties_open') state.propertiesOpen = value === '1';
        if (key === 'right_open') state.rightOpen = value === '1';
        if (key === 'right_mode' && (value === 'randomizer' || value === 'key' || value === 'print')) state.rightMode = value;
        if (key === 'autosave') state.autosave = value === '1';
      });
    } catch (_err) {
      // Browser-only and first-run desktop sessions can continue with defaults.
    }
  }

  function normalizeCard(card) {
    var out = defaultCard();
    if (!card || typeof card !== 'object') {
      return out;
    }
    out.title = typeof card.title === 'string' ? card.title : out.title;
    out.description = typeof card.description === 'string' ? card.description : out.description;
    if (Array.isArray(card.headers)) {
      for (var h = 0; h < HEADER_SIZE; h += 1) {
        out.headers[h] = String(card.headers[h] || out.headers[h] || '').slice(0, 1).toUpperCase();
      }
    }
    if (Array.isArray(card.cells)) {
      for (var i = 0; i < GRID_SIZE; i += 1) {
        var src = card.cells[i] || {};
        out.cells[i] = {
          id: typeof src.id === 'string' && src.id ? src.id : 'c' + i,
          text: typeof src.text === 'string' ? src.text : '',
          image: src.image && src.image.src ? src.image : null
        };
      }
    }
    return out;
  }

  function render() {
    var card = currentCard();
    els.previewTitle.textContent = card.title;
    els.previewDescription.textContent = card.description;
    updateProjectControls();
    document.body.classList.toggle('print-no-title', !state.printOptions.title);
    document.body.classList.toggle('print-no-description', !state.printOptions.description);
    document.body.classList.toggle('print-include-key', !!state.printOptions.key);
    els.backToBase.classList.toggle('hidden', state.activeVersionId === 'original');
    renderGrid(card);
    renderPrintKey(els.printKey, card);
    renderVersions();
    renderSidebars();
  }

  function renderGrid(card) {
    els.grid.innerHTML = '';
    card.headers.forEach(function (letter, index) {
      var cell = document.createElement('div');
      cell.className = 'cell header editable-cell';
      cell.setAttribute('role', 'textbox');
      cell.setAttribute('aria-label', 'Header letter ' + (index + 1));
      cell.innerHTML = '<span class="cell-text" contenteditable="' + (state.activeVersionId === 'original' ? 'true' : 'false') + '" spellcheck="false"></span>';
      var text = cell.querySelector('.cell-text');
      text.textContent = letter || '';
      text.addEventListener('input', function () {
        var next = String(text.textContent || '').trim().slice(0, 1).toUpperCase();
        state.card.headers[index] = next;
        if (text.textContent !== next) {
          text.textContent = next;
          placeCaretAtEnd(text);
        }
        persistCard();
        renderVersions();
      });
      text.addEventListener('keydown', function (event) {
        handleHeaderKeydown(event, index);
      });
      cell.addEventListener('pointerdown', function (event) {
        focusEditableText(event, text);
      });
      els.grid.appendChild(cell);
    });
    card.cells.forEach(function (cell, index) {
      var tile = document.createElement('div');
      tile.className = 'cell body editable-cell' + (!cell.text && !cell.image ? ' empty' : '');
      tile.draggable = cellHasContent(cell);
      tile.dataset.cellIndex = String(index);
      tile.style.viewTransitionName = 'bingo-cell-' + safeTransitionName(cell.id || ('c' + index));
      tile.setAttribute('role', 'textbox');
      tile.setAttribute('aria-label', 'Bingo square ' + cellLabel(index, card.headers));
      tile.addEventListener('dragover', function (event) {
        if (hasFileDrop(event) || hasCellDrop(event)) {
          event.preventDefault();
        }
      });
      tile.addEventListener('drop', function (event) {
        if (hasFileDrop(event)) {
          handleImageDrop(event, index);
          return;
        }
        handleCellDrop(event, index);
      });
      tile.addEventListener('dragstart', function (event) {
        startCellDrag(event, index);
      });
      tile.addEventListener('dragend', function (event) {
        finishCellDrag(event);
      });
      if (cell.image && cell.image.src) {
        var img = document.createElement('img');
        img.src = cell.image.src;
        img.alt = '';
        applyImagePlacement(img, cell.image);
        tile.appendChild(img);
      }
      var span = document.createElement('span');
      span.className = 'cell-text';
      span.contentEditable = 'true';
      span.draggable = false;
      span.spellcheck = true;
      span.textContent = cell.text || '';
      span.addEventListener('input', function () {
        currentCard().cells[index].text = span.textContent;
        tile.classList.toggle('empty', !span.textContent && !currentCard().cells[index].image);
        if (state.activeVersionId === 'original') {
          persistCard();
        }
        if (state.rightOpen && state.rightMode === 'key') {
          updateKeyField(index, span.textContent);
        }
      });
      span.addEventListener('keydown', function (event) {
        handleBodyKeydown(event, index);
      });
      tile.addEventListener('pointerdown', function (event) {
        if (state.forcedImage) {
          event.preventDefault();
          placeForcedImage(index);
          return;
        }
        focusEditableText(event, span);
      });
      tile.appendChild(span);
      els.grid.appendChild(tile);
    });
  }

  function renderVersions() {
    els.versionList.innerHTML = '';
    var rows = [{ id: 'original', name: 'Base card', tag: 'saved' }].concat(state.versions.map(function (item, index) {
      return { id: item.id, name: versionLabel(item.id), tag: 'random ' + (index + 1) };
    }));
    rows.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'version-row';
      row.setAttribute('role', 'option');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-selected', String(item.id === state.activeVersionId));
      row.innerHTML = '<button type="button" class="version-select"></button><button type="button" class="version-delete hidden" aria-label="Delete random version" title="Delete random version">' + trashIconSvg() + '</button>';
      row.querySelector('.version-select').innerHTML = '<span class="version-name"></span><span class="tag"></span>';
      row.querySelector('.version-name').textContent = item.name;
      row.querySelector('.tag').textContent = item.tag;
      row.querySelector('.version-select').addEventListener('click', function () {
        state.activeVersionId = item.id;
        render();
      });
      row.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          state.activeVersionId = item.id;
          render();
        }
      });
      if (item.id !== 'original') {
        var deleteButton = row.querySelector('.version-delete');
        deleteButton.classList.remove('hidden');
        deleteButton.setAttribute('aria-label', 'Delete ' + item.name);
        deleteButton.addEventListener('click', function (event) {
          event.stopPropagation();
          deleteVersion(item.id);
        });
      }
      els.versionList.appendChild(row);
    });
  }

  function updateProjectControls() {
    if (!els.projectName) {
      return;
    }
    els.autosaveWrap.classList.toggle('hidden', !bridgeAvailable());
    els.autosaveToggle.checked = !!state.autosave;
    if (document.activeElement !== els.projectName) {
      els.projectName.value = state.projectName || projectSlug(state.card.title);
    }
    els.saveProject.disabled = !state.projectName;
    els.savedProjects.innerHTML = state.savedProjects.length ? state.savedProjects.map(function (name) {
      return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>';
    }).join('') : '<option value="">No saved folders</option>';
    if (state.savedProjects.indexOf(state.projectName) >= 0) {
      els.savedProjects.value = state.projectName;
    }
    els.openSavedProject.disabled = !els.savedProjects.value;
    els.projectStatus.textContent = bridgeAvailable()
      ? ((state.autosave && state.autosaveBusy ? 'Autosaving' : (state.projectDirty ? 'Unsaved changes' : 'Saved')) + ' as project folder')
      : ((state.projectDirty ? 'Autosaved browser draft' : 'Downloaded project archive') + '; download to keep a file');
  }

  function trashIconSvg() {
    return '<svg class="trash-icon-svg" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>';
  }

  function deleteVersion(id) {
    state.versions = state.versions.filter(function (item) {
      return item.id !== id;
    });
    if (state.activeVersionId === id) {
      state.activeVersionId = 'original';
    }
    toast('Random version deleted.');
    render();
  }

  function projectSlug(value) {
    var slug = String(value || 'bingo').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || 'bingo';
  }

  async function refreshSavedProjects() {
    if (!bridgeAvailable()) {
      state.savedProjects = [];
      return;
    }
    try {
      var res = await backendExec('list-projects', []);
      state.savedProjects = String(res.stdout || '').split(/\r?\n/).filter(Boolean);
      state.bridgeReady = true;
    } catch (_err) {
      state.savedProjects = [];
    }
  }

  async function saveProject(options) {
    var silent = options && options.silent;
    state.projectName = projectSlug(els.projectName.value || state.card.title);
    els.projectName.value = state.projectName;
    if (!bridgeAvailable()) {
      downloadProject();
      return;
    }
    state.autosaveBusy = !!silent;
    updateProjectControls();
    var res = await backendExec('save-project', [state.projectName, JSON.stringify(state.card)]);
    state.projectDirty = false;
    state.autosaveBusy = false;
    await refreshSavedProjects();
    updateProjectControls();
    if (!silent) {
      toast('Saved project folder.');
    }
    if (res && res.stdout) {
      els.projectStatus.textContent = 'Saved: ' + String(res.stdout).trim();
    }
  }

  function scheduleAutosave() {
    if (!bridgeAvailable() || !state.autosave) {
      return;
    }
    window.clearTimeout(state.autosaveTimer);
    state.autosaveTimer = window.setTimeout(function () {
      saveProject({ silent: true }).catch(function (err) {
        state.autosaveBusy = false;
        updateProjectControls();
        toast('Autosave failed: ' + (err && err.message ? err.message : err), 9000);
      });
    }, 900);
  }

  async function openSavedProject() {
    var name = els.savedProjects.value;
    if (!name) {
      return;
    }
    var res = await backendExec('load-project', [name]);
    applyLoadedProject(JSON.parse(res.stdout), name);
    toast('Opened project folder.');
  }

  async function openProjectArchive(file) {
    if (!file) {
      return;
    }
    var entries = parseTar(new Uint8Array(await file.arrayBuffer()));
    var cardBytes = entries['card.json'];
    if (!cardBytes) {
      throw new Error('Project archive is missing card.json');
    }
    var card = JSON.parse(new TextDecoder().decode(cardBytes));
    (Array.isArray(card.cells) ? card.cells : []).forEach(function (cell) {
      if (!cell.image || !cell.image.src || cell.image.src.indexOf('data:') === 0) {
        return;
      }
      var imageBytes = entries[cell.image.src];
      if (!imageBytes) {
        cell.image = null;
        return;
      }
      var mime = cell.image.mime || mimeFromPath(cell.image.src);
      cell.image.src = bytesToDataUrl(imageBytes, mime);
    });
    applyLoadedProject(card, projectSlug(file.name.replace(/\.pieplate\.tar$|\.tar$/i, '')));
    toast('Opened project archive.');
  }

  function applyLoadedProject(card, name) {
    state.card = normalizeCard(card);
    state.projectName = projectSlug(name || state.card.title);
    state.projectDirty = false;
    state.versions = [];
    state.activeVersionId = 'original';
    els.title.value = state.card.title;
    els.description.value = state.card.description;
    persistBrowserDraft();
    render();
  }

  function downloadProject() {
    state.projectName = projectSlug(els.projectName.value || state.card.title);
    els.projectName.value = state.projectName;
    var blob = makeProjectTar(state.card);
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = state.projectName + '.pieplate.tar';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(link.href);
    }, 1000);
    state.projectDirty = false;
    persistBrowserDraft();
    updateProjectControls();
    toast('Downloaded project archive.');
  }

  function makeProjectTar(card) {
    var project = cardToProjectFiles(card);
    var files = [{ path: 'card.json', bytes: new TextEncoder().encode(JSON.stringify(project.card, null, 2) + '\n') }].concat(project.images);
    return new Blob([writeTar(files)], { type: 'application/x-tar' });
  }

  function cardToProjectFiles(card) {
    var next = clone(card);
    var images = [];
    next.cells.forEach(function (cell, index) {
      if (!cell.image || !cell.image.src || cell.image.src.indexOf('data:') !== 0) {
        return;
      }
      var parsed = dataUrlToBytes(cell.image.src);
      var path = 'images/cell-' + String(index + 1).padStart(2, '0') + mimeExtension(parsed.mime);
      images.push({ path: path, bytes: parsed.bytes });
      cell.image.src = path;
      cell.image.mime = parsed.mime;
    });
    return { card: next, images: images };
  }

  function dataUrlToBytes(src) {
    var match = String(src).match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) {
      return { mime: 'application/octet-stream', bytes: new Uint8Array() };
    }
    var mime = match[1] || 'application/octet-stream';
    var data = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    var bytes = new Uint8Array(data.length);
    for (var i = 0; i < data.length; i += 1) {
      bytes[i] = data.charCodeAt(i);
    }
    return { mime: mime, bytes: bytes };
  }

  function bytesToDataUrl(bytes, mime) {
    var binary = '';
    for (var i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return 'data:' + (mime || 'application/octet-stream') + ';base64,' + btoa(binary);
  }

  function mimeExtension(mime) {
    return ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg' })[mime] || '.bin';
  }

  function mimeFromPath(path) {
    var lower = String(path || '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    return 'application/octet-stream';
  }

  function writeTar(files) {
    var blocks = [];
    files.forEach(function (file) {
      var header = new Uint8Array(512);
      writeTarString(header, 0, 100, file.path);
      writeTarOctal(header, 100, 8, 420);
      writeTarOctal(header, 108, 8, 0);
      writeTarOctal(header, 116, 8, 0);
      writeTarOctal(header, 124, 12, file.bytes.length);
      writeTarOctal(header, 136, 12, Math.floor(Date.now() / 1000));
      for (var i = 148; i < 156; i += 1) header[i] = 32;
      header[156] = '0'.charCodeAt(0);
      writeTarString(header, 257, 6, 'ustar');
      writeTarString(header, 263, 2, '00');
      var sum = 0;
      for (var j = 0; j < 512; j += 1) sum += header[j];
      writeTarOctal(header, 148, 8, sum);
      blocks.push(header, file.bytes, new Uint8Array((512 - (file.bytes.length % 512)) % 512));
    });
    blocks.push(new Uint8Array(1024));
    return new Blob(blocks);
  }

  function writeTarString(header, offset, length, value) {
    var bytes = new TextEncoder().encode(value);
    header.set(bytes.slice(0, length - 1), offset);
  }

  function writeTarOctal(header, offset, length, value) {
    var text = value.toString(8).padStart(length - 1, '0') + '\0';
    writeTarString(header, offset, length, text);
  }

  function parseTar(bytes) {
    var entries = {};
    for (var offset = 0; offset + 512 <= bytes.length;) {
      var name = readTarString(bytes, offset, 100);
      if (!name) break;
      var size = parseInt(readTarString(bytes, offset + 124, 12).trim() || '0', 8);
      if (name.indexOf('..') >= 0 || name[0] === '/') {
        throw new Error('Project archive contains an unsafe path');
      }
      entries[name] = bytes.slice(offset + 512, offset + 512 + size);
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    return entries;
  }

  function readTarString(bytes, offset, length) {
    var end = offset;
    while (end < offset + length && bytes[end] !== 0) end += 1;
    return new TextDecoder().decode(bytes.slice(offset, end));
  }

  function renderSidebars() {
    document.body.classList.toggle('properties-open', state.propertiesOpen);
    document.body.classList.toggle('options-open', state.rightOpen);
    els.properties.classList.toggle('is-open', state.propertiesOpen);
    els.properties.setAttribute('aria-hidden', String(!state.propertiesOpen));
    els.rightSidebar.classList.toggle('is-open', state.rightOpen);
    els.rightSidebar.setAttribute('aria-hidden', String(!state.rightOpen));
    els.toggleProperties.setAttribute('aria-pressed', String(state.propertiesOpen));
    els.toggleRandomizer.setAttribute('aria-pressed', String(state.rightOpen && state.rightMode === 'randomizer'));
    els.toggleKey.setAttribute('aria-pressed', String(state.rightOpen && state.rightMode === 'key'));
    if (state.rightOpen) {
      if (state.rightMode === 'key') {
        renderKeyPanel();
      } else if (state.rightMode === 'print') {
        renderPrintPanel();
      } else {
        renderRandomizerPanel();
      }
    }
  }

  function renderRandomizerPanel() {
    els.rightSidebar.innerHTML = [
      '<header class="sidebar-head"><h2>Randomization</h2><button type="button" class="icon-btn compact" data-close-sidebar="right" aria-label="Close randomization">x</button></header>',
      '<section class="drawer-section option-stack">',
      '  <button id="sidebar-randomize" type="button" class="polite-btn primary">New random version</button>',
      '</section>',
      '<section class="drawer-section option-stack">',
      '  <h3>Print Multiple</h3>',
      '  <label class="option-row">Copies <input id="print-count" class="number-input" type="number" min="1" max="100" value="' + state.printOptions.count + '"></label>',
      '  <label class="check-row"><input id="print-randomized" type="checkbox" ' + (state.printOptions.randomized ? 'checked' : '') + '> Randomize each copy</label>',
      '  <label class="check-row"><input id="print-title-option" type="checkbox" ' + (state.printOptions.title ? 'checked' : '') + '> Include title</label>',
      '  <label class="check-row"><input id="print-description-option" type="checkbox" ' + (state.printOptions.description ? 'checked' : '') + '> Include description</label>',
      '  <label class="check-row"><input id="print-key-option" type="checkbox" ' + (state.printOptions.key ? 'checked' : '') + '> Include key</label>',
      '  <button id="sidebar-print-batch" type="button" class="polite-btn primary">Print batch</button>',
      '</section>'
    ].join('');
    wireSidebarBasics();
    $('sidebar-randomize').addEventListener('click', createRandomVersion);
    $('sidebar-print-batch').addEventListener('click', printBatch);
    ['print-count', 'print-randomized', 'print-title-option', 'print-description-option', 'print-key-option'].forEach(function (id) {
      $(id).addEventListener('change', readPrintOptions);
    });
  }

  function renderPrintPanel() {
    els.rightSidebar.innerHTML = [
      '<header class="sidebar-head"><h2>Print</h2><button type="button" class="icon-btn compact" data-close-sidebar="right" aria-label="Close print options">x</button></header>',
      '<section class="drawer-section option-stack">',
      '  <label class="check-row"><input id="print-title-option" type="checkbox" ' + (state.printOptions.title ? 'checked' : '') + '> Include title</label>',
      '  <label class="check-row"><input id="print-description-option" type="checkbox" ' + (state.printOptions.description ? 'checked' : '') + '> Include description</label>',
      '  <label class="check-row"><input id="print-key-option" type="checkbox" ' + (state.printOptions.key ? 'checked' : '') + '> Include key</label>',
      '  <button id="sidebar-print-current" type="button" class="polite-btn primary">Print this card</button>',
      '</section>'
    ].join('');
    wireSidebarBasics();
    $('sidebar-print-current').addEventListener('click', printCurrent);
    ['print-title-option', 'print-description-option', 'print-key-option'].forEach(function (id) {
      $(id).addEventListener('change', readPrintOptions);
    });
  }

  function renderKeyPanel() {
    var card = currentCard();
    var rows = card.cells.map(function (cell, index) {
      var label = cellLabel(index, card.headers);
      return '<div class="key-row"><label for="key-cell-' + index + '">' + label + '</label><textarea id="key-cell-' + index + '" data-key-index="' + index + '">' + escapeHtml(cell.text || '') + '</textarea></div>';
    });
    els.rightSidebar.innerHTML = [
      '<header class="sidebar-head"><h2>Key</h2><button type="button" class="icon-btn compact" data-close-sidebar="right" aria-label="Close key">x</button></header>',
      '<section class="drawer-section key-list">',
      rows.join(''),
      '</section>'
    ].join('');
    wireSidebarBasics();
    Array.prototype.forEach.call(els.rightSidebar.querySelectorAll('[data-key-index]'), function (field) {
      field.addEventListener('input', function () {
        var cardForEdit = currentCard();
        var index = Number(field.getAttribute('data-key-index'));
        cardForEdit.cells[index].text = field.value;
        if (state.activeVersionId === 'original') {
          persistCard();
        }
        renderGrid(cardForEdit);
      });
    });
  }

  function wireSidebarBasics() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-close-sidebar]'), function (button) {
      button.addEventListener('click', function () {
        var target = button.getAttribute('data-close-sidebar');
        if (target === 'properties') {
          state.propertiesOpen = false;
        }
        if (target === 'right') {
          state.rightOpen = false;
        }
        persistPrefs();
        render();
      });
    });
  }

  function readPrintOptions() {
    var count = $('print-count');
    var randomized = $('print-randomized');
    var title = $('print-title-option');
    var description = $('print-description-option');
    var key = $('print-key-option');
    if (count) {
      state.printOptions.count = Math.max(1, Math.min(100, Number(count.value || 1)));
    }
    if (randomized) {
      state.printOptions.randomized = randomized.checked;
    }
    if (title) {
      state.printOptions.title = title.checked;
    }
    if (description) {
      state.printOptions.description = description.checked;
    }
    if (key) {
      state.printOptions.key = key.checked;
    }
    persistPrefs();
    render();
  }

  function hasFileDrop(event) {
    var types = event.dataTransfer && event.dataTransfer.types ? Array.prototype.slice.call(event.dataTransfer.types) : [];
    return types.indexOf('Files') >= 0;
  }

  function hasCellDrop(event) {
    var types = event.dataTransfer && event.dataTransfer.types ? Array.prototype.slice.call(event.dataTransfer.types) : [];
    return types.indexOf('application/x-pieplate-cell') >= 0;
  }

  function cellHasContent(cell) {
    return !!(cell && ((cell.text && String(cell.text).length) || (cell.image && cell.image.src)));
  }

  function cloneCellContent(cell) {
    return {
      id: cell.id,
      text: cell.text || '',
      image: cell.image && cell.image.src ? clone(cell.image) : null
    };
  }

  function clearCellContent(card, index, keepText) {
    card.cells[index].text = keepText ? (card.cells[index].text || '') : '';
    card.cells[index].image = null;
  }

  function assignCellContent(card, index, content) {
    card.cells[index].id = content.id || card.cells[index].id || ('c' + index);
    card.cells[index].text = content.text || '';
    card.cells[index].image = content.image && content.image.src ? clone(content.image) : null;
  }

  function safeTransitionName(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  function startCellDrag(event, index) {
    var card = currentCard();
    if (!cellHasContent(card.cells[index])) {
      event.preventDefault();
      return;
    }
    state.cellDrag = {
      index: index,
      dropped: false,
      content: cloneCellContent(card.cells[index]),
      element: event.currentTarget
    };
    event.currentTarget.classList.add('dragging-cell');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-pieplate-cell', String(index));
    event.dataTransfer.setData('text/plain', card.cells[index].text || 'Pieplate square');
    if (event.dataTransfer.setDragImage) {
      event.dataTransfer.setDragImage(event.currentTarget, event.currentTarget.offsetWidth / 2, event.currentTarget.offsetHeight / 2);
    }
  }

  function handleCellDrop(event, targetIndex) {
    if (!hasCellDrop(event)) {
      return;
    }
    event.preventDefault();
    var sourceIndex = Number(event.dataTransfer.getData('application/x-pieplate-cell'));
    if (!Number.isFinite(sourceIndex) || sourceIndex < 0 || sourceIndex >= GRID_SIZE || sourceIndex === targetIndex) {
      return;
    }
    if (state.cellDrag) {
      state.cellDrag.dropped = true;
    }
    mutateCard(function (card) {
      var source = cloneCellContent(card.cells[sourceIndex]);
      var target = cloneCellContent(card.cells[targetIndex]);
      if (!cellHasContent(source)) {
        return;
      }
      assignCellContent(card, targetIndex, source);
      if (cellHasContent(target)) {
        assignCellContent(card, sourceIndex, target);
      } else {
        clearCellContent(card, sourceIndex, false);
        card.cells[sourceIndex].id = target.id || ('c' + sourceIndex);
      }
    });
  }

  function finishCellDrag(event) {
    if (!state.cellDrag) {
      return;
    }
    var drag = state.cellDrag;
    state.cellDrag = null;
    if (drag.element) {
      drag.element.classList.remove('dragging-cell');
    }
    if (drag.dropped || !drag.content.image || !drag.content.image.src) {
      return;
    }
    var gridRect = els.grid.getBoundingClientRect();
    var x = event.clientX;
    var y = event.clientY;
    var outsideGrid = x < gridRect.left || x > gridRect.right || y < gridRect.top || y > gridRect.bottom;
    if (!outsideGrid) {
      return;
    }
    removeDraggedImage(drag.index, drag.content.image);
  }

  function mutateCard(mutator) {
    var card = currentCard();
    var apply = function () {
      mutator(card);
      if (state.activeVersionId === 'original') {
        persistCard();
      }
      if (state.rightOpen && state.rightMode === 'key') {
        renderKeyPanel();
      }
      render();
    };
    if (document.startViewTransition) {
      document.startViewTransition(apply);
      return;
    }
    apply();
  }

  function removeDraggedImage(index, image) {
    mutateCard(function (card) {
      card.cells[index].image = null;
    });
    state.imageUndo = {
      image: clone(image),
      index: index
    };
    toastUndo('Image was removed', undoRemovedImage);
  }

  function undoRemovedImage() {
    if (!state.imageUndo) {
      return;
    }
    var undo = state.imageUndo;
    state.imageUndo = null;
    var card = currentCard();
    if (!cellHasContent(card.cells[undo.index])) {
      mutateCard(function (nextCard) {
        nextCard.cells[undo.index].image = clone(undo.image);
      });
      return;
    }
    state.forcedImage = {
      image: clone(undo.image),
      index: undo.index
    };
    document.body.classList.add('forcing-image-placement');
    updateForcedImageGhost(state.lastPointer);
    toast('Drop the image into a square, or drop it off the card to remove it.');
  }

  function placeForcedImage(index) {
    if (!state.forcedImage) {
      return;
    }
    var image = clone(state.forcedImage.image);
    state.forcedImage = null;
    document.body.classList.remove('forcing-image-placement');
    updateForcedImageGhost(null);
    mutateCard(function (card) {
      card.cells[index].image = image;
    });
  }

  function deleteForcedImage() {
    if (!state.forcedImage) {
      return;
    }
    state.imageUndo = {
      image: clone(state.forcedImage.image),
      index: state.forcedImage.index || 0
    };
    state.forcedImage = null;
    document.body.classList.remove('forcing-image-placement');
    updateForcedImageGhost(null);
    toastUndo('Image was removed', undoRemovedImage);
  }

  function handleImageDrop(event, index) {
    event.preventDefault();
    var files = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : [];
    if (!files.length || !/^image\//.test(files[0].type || '')) {
      toast('Drop an image file into a square.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      openImageModal(index, String(reader.result || ''));
    };
    reader.readAsDataURL(files[0]);
  }

  function openImageModal(index, src) {
    state.editingImage = { index: index, src: src, zoom: 1, x: 0, y: 0 };
    els.cropImage.src = src;
    els.imageZoom.value = '1';
    els.imageModal.classList.remove('hidden');
    updateCropImage();
  }

  function closeImageModal() {
    state.editingImage = null;
    state.imageDrag = null;
    els.imageModal.classList.add('hidden');
  }

  function updateCropImage() {
    if (!state.editingImage) {
      return;
    }
    var edit = state.editingImage;
    els.cropImage.style.width = (100 * edit.zoom) + '%';
    els.cropImage.style.height = (100 * edit.zoom) + '%';
    els.cropImage.style.objectFit = 'contain';
    els.cropImage.style.transform = 'translate(calc(-50% + ' + edit.x + 'px), calc(-50% + ' + edit.y + 'px))';
  }

  function confirmImage() {
    if (!state.editingImage) {
      return;
    }
    var card = currentCard();
    card.cells[state.editingImage.index].image = clone(state.editingImage);
    delete card.cells[state.editingImage.index].image.index;
    if (state.activeVersionId === 'original') {
      persistCard();
    }
    closeImageModal();
    render();
  }

  function applyImagePlacement(img, placement) {
    img.style.width = (100 * (placement.zoom || 1)) + '%';
    img.style.height = (100 * (placement.zoom || 1)) + '%';
    img.style.objectFit = 'contain';
    img.style.transform = 'translate(calc(-50% + ' + (placement.x || 0) + 'px), calc(-50% + ' + (placement.y || 0) + 'px))';
  }

  function randomizeCard(source) {
    var next = clone(source || state.card);
    var cells = next.cells.slice();
    for (var i = cells.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = cells[i];
      cells[i] = cells[j];
      cells[j] = tmp;
    }
    next.cells = cells;
    return next;
  }

  function createRandomVersion() {
    var id = uniqueVersionId();
    state.versions.unshift({ id: id, createdAt: new Date().toISOString(), card: randomizeCard(state.card) });
    state.activeVersionId = id;
    toast('Random version created.');
    render();
  }

  function uniqueVersionId() {
    var id;
    do {
      state.versionSerial += 1;
      id = 'v' + Date.now().toString(36) + '-' + state.versionSerial.toString(36);
    } while (state.versions.some(function (item) {
      return item.id === id;
    }));
    return id;
  }

  function versionLabel(id) {
    var index = state.versions.findIndex(function (item) {
      return item.id === id;
    });
    return index >= 0 ? 'Random version ' + (index + 1) : 'Random version';
  }

  function printCurrent() {
    window.print();
  }

  function returnToBaseCard() {
    state.activeVersionId = 'original';
    render();
  }

  function printBatch() {
    var count = Math.max(1, state.printOptions.count || 1);
    var cards = [];
    for (var i = 0; i < count; i += 1) {
      cards.push(state.printOptions.randomized ? randomizeCard(state.card) : currentCard());
    }
    renderPrintBatch(cards);
    document.body.classList.add('printing-batch');
    window.print();
    window.setTimeout(function () {
      document.body.classList.remove('printing-batch');
      els.printBatchOutput.classList.add('hidden');
      els.printBatchOutput.innerHTML = '';
    }, 250);
  }

  function renderPrintBatch(cards) {
    els.printBatchOutput.innerHTML = '';
    cards.forEach(function (card) {
      var sheet = document.createElement('section');
      sheet.className = 'print-sheet';
      sheet.innerHTML = '<header class="card-copy"><h2></h2><p></p></header><div class="bingo-grid"></div>';
      sheet.querySelector('h2').textContent = card.title;
      sheet.querySelector('p').textContent = card.description;
      var grid = sheet.querySelector('.bingo-grid');
      card.headers.forEach(function (letter) {
        var header = document.createElement('div');
        header.className = 'cell header';
        header.innerHTML = '<span class="cell-text"></span>';
        header.querySelector('.cell-text').textContent = letter || '';
        grid.appendChild(header);
      });
      card.cells.forEach(function (cell) {
        var tile = document.createElement('div');
        tile.className = 'cell body' + (!cell.text && !cell.image ? ' empty' : '');
        if (cell.image && cell.image.src) {
          var img = document.createElement('img');
          img.src = cell.image.src;
          img.alt = '';
          applyImagePlacement(img, cell.image);
          tile.appendChild(img);
        }
        var span = document.createElement('span');
        span.className = 'cell-text';
        span.textContent = cell.text || '';
        tile.appendChild(span);
        grid.appendChild(tile);
      });
      els.printBatchOutput.appendChild(sheet);
      if (state.printOptions.key) {
        var key = document.createElement('section');
        key.className = 'print-key';
        renderPrintKey(key, card);
        els.printBatchOutput.appendChild(key);
      }
    });
    els.printBatchOutput.classList.remove('hidden');
  }

  function renderPrintKey(target, card) {
    var rows = card.cells.map(function (cell, index) {
      return '<div class="print-key-row"><span class="print-key-label">' + escapeHtml(cellLabel(index, card.headers)) + '</span><span>' + escapeHtml(cell.text || '') + '</span></div>';
    });
    target.innerHTML = '<h2>Key</h2><div class="print-key-grid">' + rows.join('') + '</div>';
    target.classList.toggle('hidden', !state.printOptions.key);
  }

  function cellLabel(index, headers) {
    var col = index % 5;
    var row = Math.floor(index / 5) + 1;
    return (headers[col] || String(col + 1)) + row;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function singleLineEdit(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  function handleHeaderKeydown(event, index) {
    if (handleHeaderArrowNavigation(event, index)) {
      return;
    }
    singleLineEdit(event);
  }

  function handleBodyKeydown(event, index) {
    if (handleBodyArrowNavigation(event, index)) {
      return;
    }
    singleLineEdit(event);
  }

  function handleBodyArrowNavigation(event, index) {
    if (!isPlainArrowKey(event)) {
      return false;
    }
    var next = index;
    if (event.key === 'ArrowLeft') {
      next = (index + GRID_SIZE - 1) % GRID_SIZE;
    } else if (event.key === 'ArrowRight') {
      next = (index + 1) % GRID_SIZE;
    } else if (event.key === 'ArrowUp') {
      next = (index + GRID_SIZE - 5) % GRID_SIZE;
    } else if (event.key === 'ArrowDown') {
      next = (index + 5) % GRID_SIZE;
    }
    event.preventDefault();
    focusBodyCell(next);
    return true;
  }

  function handleHeaderArrowNavigation(event, index) {
    if (!isPlainArrowKey(event)) {
      return false;
    }
    event.preventDefault();
    if (event.key === 'ArrowLeft') {
      focusHeaderCell((index + HEADER_SIZE - 1) % HEADER_SIZE);
      return true;
    }
    if (event.key === 'ArrowRight') {
      focusHeaderCell((index + 1) % HEADER_SIZE);
      return true;
    }
    if (event.key === 'ArrowUp') {
      focusBodyCell(GRID_SIZE - HEADER_SIZE + index);
      return true;
    }
    focusBodyCell(index);
    return true;
  }

  function isPlainArrowKey(event) {
    return /^Arrow/.test(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  }

  function focusHeaderCell(index) {
    var text = els.grid.querySelector('.cell.header:nth-child(' + (index + 1) + ') .cell-text');
    if (!text) {
      return;
    }
    text.focus();
    placeCaretAtEnd(text);
  }

  function focusBodyCell(index) {
    var text = els.grid.querySelector('.cell.body[data-cell-index="' + index + '"] .cell-text');
    if (!text) {
      return;
    }
    text.focus();
    placeCaretAtEnd(text);
  }

  function focusEditableText(event, text) {
    if (event.button && event.button !== 0) {
      return;
    }
    if (event.target === text || text.contains(event.target)) {
      return;
    }
    event.preventDefault();
    text.focus();
    placeCaretAtEnd(text);
  }

  function placeCaretAtEnd(node) {
    var range = document.createRange();
    var selection = window.getSelection();
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function updateKeyField(index, value) {
    var field = $('key-cell-' + index);
    if (field && field.value !== value) {
      field.value = value;
    }
  }

  function toast(message, duration) {
    window.clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    state.toastTimer = window.setTimeout(function () {
      els.toast.classList.add('hidden');
    }, duration || 2400);
  }

  function toastUndo(message, handler) {
    window.clearTimeout(state.toastTimer);
    els.toast.textContent = '';
    var text = document.createElement('span');
    text.textContent = message + ' ';
    var undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'toast-link';
    undo.textContent = 'Undo';
    undo.addEventListener('click', function (event) {
      state.lastPointer = { clientX: event.clientX, clientY: event.clientY };
      window.clearTimeout(state.toastTimer);
      els.toast.classList.add('hidden');
      handler();
    });
    els.toast.appendChild(text);
    els.toast.appendChild(undo);
    els.toast.classList.remove('hidden');
    state.toastTimer = window.setTimeout(function () {
      els.toast.classList.add('hidden');
    }, 9000);
  }

  function updateForcedImageGhost(event) {
    if (!els.forcedImageGhost) {
      return;
    }
    if (!state.forcedImage || !state.forcedImage.image || !state.forcedImage.image.src) {
      els.forcedImageGhost.classList.add('hidden');
      els.forcedImageGhost.removeAttribute('src');
      return;
    }
    els.forcedImageGhost.src = state.forcedImage.image.src;
    els.forcedImageGhost.style.transform = 'translate(-50%, -50%)';
    if (event) {
      els.forcedImageGhost.style.left = event.clientX + 'px';
      els.forcedImageGhost.style.top = event.clientY + 'px';
    }
    els.forcedImageGhost.classList.remove('hidden');
  }

  function bindEvents() {
    els.title.addEventListener('input', function () {
      state.card.title = els.title.value;
      persistCard();
      render();
    });
    els.description.addEventListener('input', function () {
      state.card.description = els.description.value;
      persistCard();
      render();
    });
    els.projectName.addEventListener('input', function () {
      state.projectName = projectSlug(els.projectName.value);
      persistBrowserDraft();
      scheduleAutosave();
      updateProjectControls();
    });
    els.autosaveToggle.addEventListener('change', function () {
      state.autosave = els.autosaveToggle.checked;
      persistPrefs();
      updateProjectControls();
      if (state.autosave && state.projectDirty) {
        scheduleAutosave();
      }
    });
    els.saveProject.addEventListener('click', function () {
      saveProject().catch(function (err) {
        state.autosaveBusy = false;
        toast('Save failed: ' + (err && err.message ? err.message : err), 9000);
      });
    });
    els.downloadProject.addEventListener('click', downloadProject);
    els.openProjectFile.addEventListener('click', function () {
      els.projectFile.value = '';
      els.projectFile.click();
    });
    els.projectFile.addEventListener('change', function () {
      openProjectArchive(els.projectFile.files && els.projectFile.files[0]).catch(function (err) {
        toast('Open failed: ' + (err && err.message ? err.message : err), 9000);
      });
    });
    els.openSavedProject.addEventListener('click', function () {
      openSavedProject().catch(function (err) {
        toast('Open failed: ' + (err && err.message ? err.message : err), 9000);
      });
    });
    els.toggleProperties.addEventListener('click', function () {
      state.propertiesOpen = !state.propertiesOpen;
      persistPrefs();
      render();
    });
    els.toggleRandomizer.addEventListener('click', function () {
      state.rightOpen = !(state.rightOpen && state.rightMode === 'randomizer');
      state.rightMode = 'randomizer';
      persistPrefs();
      render();
    });
    els.toggleKey.addEventListener('click', function () {
      state.rightOpen = !(state.rightOpen && state.rightMode === 'key');
      state.rightMode = 'key';
      persistPrefs();
      render();
    });
    els.randomizeNow.addEventListener('click', createRandomVersion);
    els.backToBase.addEventListener('click', returnToBaseCard);
    els.printCurrent.addEventListener('click', function () {
      state.rightOpen = true;
      state.rightMode = 'print';
      persistPrefs();
      render();
    });
    els.cancelImage.addEventListener('click', closeImageModal);
    els.confirmImage.addEventListener('click', confirmImage);
    els.fitImage.addEventListener('click', function () {
      if (!state.editingImage) {
        return;
      }
      state.editingImage.zoom = 1;
      state.editingImage.x = 0;
      state.editingImage.y = 0;
      els.imageZoom.value = '1';
      updateCropImage();
    });
    els.imageZoom.addEventListener('input', function () {
      if (!state.editingImage) {
        return;
      }
      state.editingImage.zoom = Number(els.imageZoom.value || 1);
      updateCropImage();
    });
    els.cropStage.addEventListener('pointerdown', function (event) {
      if (!state.editingImage) {
        return;
      }
      state.imageDrag = { startX: event.clientX, startY: event.clientY, x: state.editingImage.x, y: state.editingImage.y };
      els.cropStage.setPointerCapture(event.pointerId);
    });
    els.cropStage.addEventListener('pointermove', function (event) {
      if (!state.editingImage || !state.imageDrag) {
        return;
      }
      state.editingImage.x = state.imageDrag.x + event.clientX - state.imageDrag.startX;
      state.editingImage.y = state.imageDrag.y + event.clientY - state.imageDrag.startY;
      updateCropImage();
    });
    els.cropStage.addEventListener('pointerup', function () {
      state.imageDrag = null;
    });
    document.addEventListener('pointermove', function (event) {
      state.lastPointer = { clientX: event.clientX, clientY: event.clientY };
      if (state.forcedImage) {
        updateForcedImageGhost(event);
      }
    });
    document.addEventListener('pointerdown', function (event) {
      state.lastPointer = { clientX: event.clientX, clientY: event.clientY };
      if (!state.forcedImage || event.target.closest('.cell.body')) {
        return;
      }
      deleteForcedImage();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (!els.imageModal.classList.contains('hidden')) {
          closeImageModal();
          return;
        }
        if (state.rightOpen) {
          state.rightOpen = false;
        } else if (state.propertiesOpen) {
          state.propertiesOpen = false;
        }
        persistPrefs();
        render();
      }
    });
  }

  function collectEls() {
    els.appShell = $('app-shell');
    els.bootSplash = $('boot-splash');
    els.properties = $('properties-sidebar');
    els.rightSidebar = $('right-sidebar');
    els.toggleProperties = $('toggle-properties');
    els.autosaveWrap = $('autosave-toggle-wrap');
    els.autosaveToggle = $('autosave-toggle');
    els.toggleRandomizer = $('toggle-randomizer');
    els.toggleKey = $('toggle-key');
    els.randomizeNow = $('randomize-now');
    els.backToBase = $('back-to-base');
    els.printCurrent = $('print-current');
    els.title = $('card-title');
    els.description = $('card-description');
    els.projectName = $('project-name');
    els.saveProject = $('save-project');
    els.downloadProject = $('download-project');
    els.openProjectFile = $('open-project-file');
    els.openSavedProject = $('open-saved-project');
    els.savedProjects = $('saved-projects');
    els.projectFile = $('project-file');
    els.projectStatus = $('project-status');
    els.previewTitle = $('preview-title');
    els.previewDescription = $('preview-description');
    els.grid = $('bingo-grid');
    els.printKey = $('print-key');
    els.printBatchOutput = $('print-batch-output');
    els.versionList = $('version-list');
    els.toast = $('toast');
    els.imageModal = $('image-modal');
    els.cropStage = $('image-crop-stage');
    els.cropImage = $('crop-image');
    els.imageZoom = $('image-zoom');
    els.cancelImage = $('cancel-image');
    els.confirmImage = $('confirm-image');
    els.fitImage = $('fit-image');
    els.forcedImageGhost = document.createElement('img');
    els.forcedImageGhost.className = 'forced-image-ghost hidden';
    els.forcedImageGhost.alt = '';
    document.body.appendChild(els.forcedImageGhost);
  }

  async function boot() {
    collectEls();
    loadPrefs();
    await loadBackendPrefs();
    await loadCard();
    els.title.value = state.card.title;
    els.description.value = state.card.description;
    els.projectName.value = state.projectName;
    bindEvents();
    render();
    document.documentElement.classList.remove('pieplate-booting');
    document.body.classList.remove('pieplate-booting');
    document.body.classList.add('booted');
    els.bootSplash.classList.add('hidden');
    els.appShell.classList.remove('hidden');
    els.appShell.removeAttribute('aria-hidden');
    if (window.__wizardry_host_boot_ready) {
      window.__wizardry_host_boot_ready();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
