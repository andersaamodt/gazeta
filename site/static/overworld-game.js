(function () {
  const GODOT_BUILD_PATH = '/static/overworld-godot/v20260523-page-help/';
  const GODOT_URL = GODOT_BUILD_PATH + 'index.html';
  const GODOT_SERVICE_WORKER_URL = GODOT_BUILD_PATH + 'index.service.worker.js';
  const GODOT_SERVICE_WORKER_SCOPE = GODOT_BUILD_PATH;
  const GODOT_CACHE_NAME = 'Overworld-sw-cache-1779582932|1469358';
  const GODOT_CACHE_FILES = [
    'index.html',
    'index.js',
    'index.wasm',
    'index.pck'
  ];
  const DOWNLOAD_LABEL = 'Download (6.8 MB)';
  const CACHED_LABEL = 'Play cached game';

  function injectStyles() {
    if (document.getElementById('overworld-game-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'overworld-game-styles';
    style.textContent = `
.overworld-page-shell {
  max-width: min(1180px, calc(100vw - 32px));
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 18px 0 36px;
}
.overworld-page-head {
  margin-bottom: 12px;
}
.overworld-godot-shell {
  display: grid;
  gap: 10px;
}
.overworld-godot-frame-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: min(64vh, 640px);
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 8px;
  overflow: hidden;
  background: #101310;
  touch-action: none;
}
.overworld-godot-splash {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  color: #f7f1df;
  background: linear-gradient(180deg, #101310, #080a08);
}
.overworld-godot-splash-panel {
  display: grid;
  justify-items: center;
  gap: 12px;
  max-width: 34rem;
  text-align: center;
}
.overworld-godot-title {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font-size: clamp(1.35rem, 2vw, 2.2rem);
  line-height: 1.08;
  color: #fff8e8 !important;
  -webkit-text-fill-color: #fff8e8;
  text-decoration: none;
  text-shadow: 0 2px 12px rgba(0,0,0,.48);
}
.overworld-godot-copy {
  margin: 0;
  max-width: 28rem;
  color: rgba(247,241,223,.88);
  -webkit-text-fill-color: rgba(247,241,223,.88);
  line-height: 1.35;
}
.overworld-godot-download {
  appearance: none;
  width: auto;
  border: 1px solid rgba(255,250,231,.44);
  border-radius: 7px;
  padding: 9px 13px;
  font: inherit;
  line-height: 1.2;
  font-weight: 700;
  color: #17221b;
  -webkit-text-fill-color: #17221b;
  background: #fff1b8;
  box-shadow: 0 10px 24px rgba(0,0,0,.24);
  cursor: pointer;
}
.overworld-godot-download:hover,
.overworld-godot-download:focus-visible {
  background: #fff6d1;
  outline: 2px solid rgba(255,246,209,.42);
  outline-offset: 3px;
}
.overworld-godot-download[disabled] {
  cursor: default;
  opacity: .72;
}
.overworld-godot-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  background: #101310;
  touch-action: none;
}
.overworld-godot-status {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 8px;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 7px;
  padding: 6px 9px;
  font-size: .86rem;
  color: color-mix(in srgb, currentColor 72%, transparent);
  background: color-mix(in srgb, canvas 91%, #dfe8da 9%);
}
.overworld-godot-status::before {
  content: "";
  width: .55rem;
  height: .55rem;
  border-radius: 999px;
  background: #b78f31;
  box-shadow: 0 0 0 3px color-mix(in srgb, #b78f31 18%, transparent);
}
.overworld-godot-status.is-ready::before {
  background: #2f7b55;
  box-shadow: 0 0 0 3px color-mix(in srgb, #2f7b55 18%, transparent);
}
.overworld-godot-help {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  color: color-mix(in srgb, currentColor 76%, transparent);
  font-size: .9rem;
  line-height: 1.35;
}
.overworld-godot-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.overworld-godot-key {
  display: inline-flex;
  align-items: center;
  min-height: 1.75rem;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  border-radius: 6px;
  padding: 2px 8px;
  background: color-mix(in srgb, canvas 88%, currentColor 5%);
  color: color-mix(in srgb, currentColor 84%, transparent);
}
.overworld-godot-login-note {
  max-width: 42rem;
}
@media (max-width: 720px) {
  .overworld-page-shell {
    max-width: 100%;
    padding: 8px 0 24px;
  }
  .overworld-godot-frame-wrap {
    aspect-ratio: auto;
    min-height: 0;
    height: min(78vh, 640px);
    height: min(78svh, 640px);
    max-height: calc(100vh - 96px);
    max-height: calc(100svh - 96px);
    border-radius: 6px;
  }
  .overworld-godot-splash {
    padding: 12px;
    background: linear-gradient(180deg, #101310, #080a08);
  }
  .overworld-godot-splash-panel {
    gap: 8px;
    max-width: min(21rem, 100%);
  }
  .overworld-godot-title {
    font-size: clamp(1.25rem, 7vw, 1.8rem);
  }
  .overworld-godot-copy,
  .overworld-godot-status {
    font-size: .9rem;
  }
  .overworld-godot-download {
    min-height: 44px;
    padding: 10px 14px;
    touch-action: manipulation;
  }
  .overworld-godot-status {
    justify-self: center;
    max-width: calc(100vw - 20px);
  }
  .overworld-godot-help {
    justify-content: center;
    padding-inline: 10px;
    text-align: center;
  }
  .overworld-godot-keys {
    justify-content: center;
  }
}
@media (max-width: 480px) {
  .overworld-godot-frame-wrap {
    height: min(76vh, 600px);
    height: min(76svh, 600px);
    max-height: calc(100vh - 88px);
    max-height: calc(100svh - 88px);
  }
  .overworld-godot-copy {
    max-width: 18rem;
  }
}
@media (orientation: landscape) and (max-height: 520px) {
  .overworld-page-shell {
    max-width: 100%;
    padding-block: 6px 12px;
  }
  .overworld-godot-frame-wrap {
    height: calc(100vh - 70px);
    height: calc(100svh - 70px);
    min-height: 280px;
    max-height: none;
  }
  .overworld-godot-splash-panel {
    max-width: min(26rem, calc(100vw - 24px));
  }
}
`;
    document.head.appendChild(style);
  }

  function markReady() {
    const gate = window.__wizardryHydration;
    if (gate && typeof gate.markPageReady === 'function') {
      gate.markPageReady();
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function syncStatusConfig(status) {
    switch (status) {
      case 'local_newer_than_nostr':
        return {
          label: 'Server newer',
          message: 'Server copy is newer than the latest published Nostr state. Visitors see the server copy.',
          className: 'status-local-newer-than-nostr'
        };
      case 'nostr_newer_than_local':
        return {
          label: 'Nostr newer',
          message: 'Published Nostr state is newer than the server copy. Visitors still see the server copy until the site source changes.',
          className: 'status-nostr-newer-than-local'
        };
      case 'in_sync':
        return {
          label: 'Synced',
          message: 'Server copy and published Nostr state are in sync.',
          className: 'status-in-sync'
        };
      case 'unpublished_local_changes':
        return {
          label: 'Server only',
          message: 'This page exists only on the server so far. Visitors see the server copy.',
          className: 'status-unpublished-local-changes'
        };
      default:
        return {
          label: 'Sync unknown',
          message: 'Cannot determine local-vs-Nostr sync status yet.',
          className: 'status-unknown'
        };
    }
  }

  function bootstrapPayload() {
    const slug = String(document.querySelector('[data-page-slug]')?.getAttribute('data-page-slug') || 'overworld').trim() || 'overworld';
    const bootstraps = window.__gazetaNostrPageBootstraps;
    if (bootstraps && bootstraps[slug] && typeof bootstraps[slug] === 'object') {
      return bootstraps[slug];
    }
    return {};
  }

  function pageSyncStatusPillHtml() {
    const payload = bootstrapPayload();
    const sync = payload && payload.sync_status && typeof payload.sync_status === 'object' ? payload.sync_status : {};
    const status = String(sync.status || 'unknown').trim();
    const config = syncStatusConfig(status);
    const message = String(sync.message || config.message).trim();
    return '<span class="page-sync-status-pill ' + config.className + '" title="' + escapeHtml(message) + '">' + escapeHtml(config.label) + '</span>';
  }

  function renderSyncStatusPill() {
    const title = document.getElementById('overworld-page-title');
    if (!title) {
      return;
    }
    let text = title.querySelector('.list-page-title-text');
    if (!text) {
      text = document.createElement('span');
      text.className = 'list-page-title-text';
      text.textContent = title.textContent || 'Overworld';
      title.replaceChildren(text);
    }
    let actions = document.getElementById('overworld-page-title-actions');
    if (!actions) {
      actions = document.createElement('span');
      actions.id = 'overworld-page-title-actions';
      actions.className = 'list-page-title-actions';
      title.appendChild(actions);
    }
    actions.innerHTML = pageSyncStatusPillHtml();
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

	  function ensureChild(parent, child, before) {
	    if (!parent || !child || child.parentNode === parent) {
	      return;
	    }
	    if (before && before.parentNode === parent) {
	      parent.insertBefore(child, before);
	    } else {
	      parent.appendChild(child);
	    }
	  }

	  function mount(host) {
    if (!host || host.dataset.overworldMounted === '1') {
      return;
    }
    host.dataset.overworldMounted = '1';
    injectStyles();

	    const existingShell = host.querySelector('.overworld-godot-shell');
	    const shell = existingShell || document.createElement('div');
	    shell.className = 'overworld-godot-shell';

	    const frameWrap = shell.querySelector('.overworld-godot-frame-wrap') || document.createElement('div');
	    frameWrap.className = 'overworld-godot-frame-wrap';

	    const splash = frameWrap.querySelector('.overworld-godot-splash') || document.createElement('div');
	    splash.className = 'overworld-godot-splash';

	    const splashPanel = splash.querySelector('.overworld-godot-splash-panel') || document.createElement('div');
	    splashPanel.className = 'overworld-godot-splash-panel';

	    const kicker = splashPanel.querySelector('.overworld-godot-kicker');
	    if (kicker) {
	      kicker.remove();
	    }

	    const title = splashPanel.querySelector('.overworld-godot-title') || document.createElement('h2');
	    title.className = 'overworld-godot-title';
	    title.textContent = 'Overworld';

	    const copy = splashPanel.querySelector('.overworld-godot-copy');
	    if (copy) {
	      copy.remove();
	    }

	    let downloadButton = splashPanel.querySelector('.overworld-godot-download');
	    if (!(downloadButton instanceof HTMLButtonElement)) {
	      downloadButton = document.createElement('button');
	    }
	    downloadButton.type = 'button';
	    downloadButton.className = 'overworld-godot-download';
	    downloadButton.textContent = DOWNLOAD_LABEL;

	    const status = shell.querySelector('.overworld-godot-status') || document.createElement('div');
	    status.className = 'overworld-godot-status';
	    status.textContent = 'Waiting for download';

	    const help = shell.querySelector('.overworld-godot-help') || document.createElement('div');
	    help.className = 'overworld-godot-help';

	    const keys = help.querySelector('.overworld-godot-keys') || document.createElement('div');
	    keys.className = 'overworld-godot-keys';
	    if (!keys.querySelector('.overworld-godot-key')) {
	      [
	        'Enter: note',
	        'I: inventory',
	        'B: spells',
	        'C: character'
	      ].forEach(function (label) {
	        const key = document.createElement('span');
	        key.className = 'overworld-godot-key';
	        key.textContent = label;
	        keys.appendChild(key);
	      });
	    }

	    const loginNote = help.querySelector('.overworld-godot-login-note') || document.createElement('div');
	    loginNote.className = 'overworld-godot-login-note';
	    loginNote.textContent = 'Anonymous players can inspect the starting room. Log in with Nostr to walk through doors into the server.';

    let started = false;

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

    downloadButton.addEventListener('click', function () {
      registerGodotServiceWorker().then(function () {
        return hasCurrentGodotCache();
      }).then(function (isCached) {
        startDownload({ fromCache: isCached });
      });
    });

	    ensureChild(splashPanel, title);
	    ensureChild(splashPanel, downloadButton);
	    ensureChild(splash, splashPanel);
	    if (!frameWrap.querySelector('.overworld-godot-frame')) {
	      ensureChild(frameWrap, splash);
	    }
	    ensureChild(shell, frameWrap, shell.firstChild);
	    ensureChild(shell, status);
	    ensureChild(help, keys);
	    ensureChild(help, loginNote);
	    ensureChild(shell, help);
	    if (!existingShell || shell.parentNode !== host) {
	      host.replaceChildren(shell);
	    }
	    markReady();

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
    renderSyncStatusPill();
    const mounts = Array.from(document.querySelectorAll('[data-overworld-game], .overworld-game-mount'));
    mounts.forEach(mount);
    if (!mounts.length) {
      markReady();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
