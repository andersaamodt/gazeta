(function () {
  const GODOT_BUILD_PATH = '/static/overworld-godot/v20260523-page-help/';
  const GODOT_URL = GODOT_BUILD_PATH + 'index.html';
  const GODOT_SERVICE_WORKER_URL = GODOT_BUILD_PATH + 'index.service.worker.js';
  const GODOT_SERVICE_WORKER_SCOPE = GODOT_BUILD_PATH;
  const GODOT_CACHE_NAME = 'Overworld-sw-cache-1779582932|1469358';
  const BOOTSTRAP_CACHE_MAX_AGE_MS = 15000;
  const GODOT_CACHE_FILES = [
    'index.html',
    'index.js',
    'index.wasm',
    'index.pck'
  ];
  const DOWNLOAD_LABEL = 'Download (6.8 MB)';
  const CACHED_LABEL = 'Play cached game';
  const OVERWORLD_STATIC_SHELL_HTML = [
    '<div class="overworld-godot-shell" data-overworld-static-shell="true">',
    '<div class="overworld-godot-frame-wrap">',
    '<div class="overworld-godot-splash">',
    '<div class="overworld-godot-splash-panel">',
    '<h2 class="overworld-godot-title">Overworld</h2>',
    '<button type="button" class="overworld-godot-download">Download (6.8 MB)</button>',
    '</div>',
    '</div>',
    '</div>',
    '<div class="overworld-godot-status">Waiting for download</div>',
    '<div class="overworld-godot-help">',
    '<div class="overworld-godot-keys"><span class="overworld-godot-key">Enter: note</span><span class="overworld-godot-key">I: inventory</span><span class="overworld-godot-key">B: spells</span><span class="overworld-godot-key">C: character</span></div>',
    '<div class="overworld-godot-login-note">Anonymous players can inspect the starting room. Log in with Nostr to walk through doors into the server.</div>',
    '</div>',
    '</div>'
  ].join('');

  const state = {
    payload: null
  };

  function markInitialContentPainted(host) {
    window.__wizardryNotifyInitialContentPainted(overworldSlug(), {
      rootNode: host || null,
      markPageReady: true
    });
  }

  function bootstrapPayload() {
    return state.payload || {};
  }

  function overworldSlug() {
    return String(document.querySelector('[data-page-slug]')?.getAttribute('data-page-slug') || 'overworld').trim() || 'overworld';
  }

  function isExpectedPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    return String(payload.slug || '').trim() === overworldSlug() &&
      String(payload.page_type || '').trim().toLowerCase() === 'overworld';
  }

  function renderBootstrapPayload(payload) {
    if (!isExpectedPayload(payload)) {
      return false;
    }
    state.payload = payload;
    return true;
  }

  function renderSyncStatusPill() {
    const payload = bootstrapPayload();
    window.__wizardryRenderReadOnlyPageHead({
      pageTitle: 'Overworld',
      titleNode: document.getElementById('overworld-page-title'),
      titleText: 'Overworld',
      syncStatus: payload && payload.sync_status
    });
  }

  function hasCacheStorage() {
    return 'caches' in window && window.isSecureContext;
  }

  function waitForServiceWorker(registration) {
    const worker = registration.active || registration.waiting || registration.installing;
    if (!worker || worker.state === 'activated') {
      return Promise.resolve(registration);
    }
    return new Promise(function (resolve) {
      worker.addEventListener('statechange', function onStateChange() {
        if (worker.state === 'activated') {
          worker.removeEventListener('statechange', onStateChange);
          resolve(registration);
        }
      });
    });
  }

  function registerGodotServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.register(GODOT_SERVICE_WORKER_URL, {
      scope: GODOT_SERVICE_WORKER_SCOPE
    }).then(waitForServiceWorker).catch(function (error) {
      console.warn('Overworld cache worker registration failed:', error);
      return null;
    });
  }

  function hasCurrentGodotCache() {
    if (!hasCacheStorage()) {
      return Promise.resolve(false);
    }
    return caches.open(GODOT_CACHE_NAME).then(function (cache) {
      return Promise.all(GODOT_CACHE_FILES.map(function (file) {
        return cache.match(new URL(file, new URL(GODOT_BUILD_PATH, window.location.href)).toString());
      }));
    }).then(function (matches) {
      return matches.every(Boolean);
    }).catch(function () {
      return false;
    });
  }

  function ensureStaticShell(host, payload) {
    if (!(host instanceof HTMLElement)) {
      return null;
    }
    window.__wizardryRenderResolvedReadOnlyContent({
      targetNode: host,
      payload: payload,
      name: 'content',
      renderFallback: function () {
        return OVERWORLD_STATIC_SHELL_HTML;
      }
    });
    return host.querySelector('.overworld-godot-shell');
  }

  function resolveShellParts(host, payload) {
    const shell = ensureStaticShell(host, payload);
    if (!shell) {
      return null;
    }
    const frameWrap = shell.querySelector('.overworld-godot-frame-wrap');
    const downloadButton = shell.querySelector('.overworld-godot-download');
    const status = shell.querySelector('.overworld-godot-status');
    if (!(frameWrap instanceof HTMLElement) ||
        !(downloadButton instanceof HTMLButtonElement) ||
        !(status instanceof HTMLElement)) {
      return null;
    }
    return {
      shell: shell,
      frameWrap: frameWrap,
      downloadButton: downloadButton,
      status: status
    };
  }

  function mount(host) {
    if (!host || host.dataset.overworldMounted === '1') {
      return;
    }
    host.dataset.overworldMounted = '1';

    const payload = bootstrapPayload();
    const parts = resolveShellParts(host, payload);
    if (!parts) {
      markInitialContentPainted(host);
      return;
    }

    const frameWrap = parts.frameWrap;
    const downloadButton = parts.downloadButton;
    const status = parts.status;
    const existingFrame = frameWrap.querySelector('.overworld-godot-frame');
    let started = existingFrame instanceof HTMLIFrameElement;

    if (started) {
      downloadButton.disabled = true;
      downloadButton.textContent = 'Starting';
      status.classList.add('is-ready');
      status.textContent = 'Godot Overworld is running';
    } else {
      downloadButton.disabled = false;
      downloadButton.textContent = DOWNLOAD_LABEL;
      status.classList.remove('is-ready');
      status.textContent = 'Waiting for download';
    }

    function startDownload(options) {
      if (started) {
        return;
      }
      started = true;
      const startOptions = options || {};
      downloadButton.disabled = true;
      downloadButton.textContent = startOptions.fromCache ? 'Starting' : 'Downloading';
      status.textContent = startOptions.fromCache ? 'Starting cached Godot Overworld' : 'Downloading Godot Overworld';

      const frame = document.createElement('iframe');
      frame.className = 'overworld-godot-frame';
      frame.title = 'Overworld';
      frame.setAttribute('allow', 'fullscreen; gamepad');
      frame.setAttribute('loading', 'eager');
      frame.addEventListener('load', function () {
        status.classList.add('is-ready');
        status.textContent = 'Godot Overworld is running';
      });
      frame.src = GODOT_URL;
      frameWrap.replaceChildren(frame);
    }

    if (downloadButton.dataset.overworldBound !== '1') {
      downloadButton.dataset.overworldBound = '1';
      downloadButton.addEventListener('click', function () {
        registerGodotServiceWorker().then(function () {
          return hasCurrentGodotCache();
        }).then(function (isCached) {
          startDownload({ fromCache: isCached });
        });
      });
    }

    markInitialContentPainted(host);

    registerGodotServiceWorker().then(function () {
      return hasCurrentGodotCache();
    }).then(function (isCached) {
      if (!isCached || started) {
        return;
      }
      downloadButton.textContent = CACHED_LABEL;
      status.classList.add('is-ready');
      status.textContent = 'Cached Godot Overworld is ready';
    });
  }

  function init() {
    window.__wizardryRenderManagedNostrBootstrapSources({
      slug: overworldSlug(),
      maxAgeMs: BOOTSTRAP_CACHE_MAX_AGE_MS,
      authSignature: window.__wizardrySessionAuthSignature,
      isExpectedPayload: isExpectedPayload,
      renderPayload: renderBootstrapPayload
    });
    renderSyncStatusPill();
    const mounts = Array.from(document.querySelectorAll('[data-overworld-game], .overworld-game-mount'));
    mounts.forEach(mount);
    if (!mounts.length) {
      markInitialContentPainted(null);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
