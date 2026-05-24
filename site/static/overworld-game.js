(function () {
  const GODOT_URL = '/static/overworld-godot/v20260523-page-help/index.html';
  const DOWNLOAD_LABEL = 'Download (6.8 MB)';

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
  background:
    linear-gradient(180deg, rgba(16,19,16,.38), rgba(16,19,16,.86)),
    url("/static/overworld-godot/v20260523-page-help/index.png") center / min(48%, 320px) no-repeat,
    #101310;
}
.overworld-godot-splash-panel {
  display: grid;
  justify-items: center;
  gap: 10px;
  max-width: 34rem;
  text-align: center;
}
.overworld-godot-kicker {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(247,241,223,.26);
  border-radius: 999px;
  padding: 4px 9px;
  font-size: .78rem;
  line-height: 1.15;
  color: rgba(247,241,223,.82);
  background: rgba(247,241,223,.10);
}
.overworld-godot-title {
  margin: 0;
  font-size: clamp(1.35rem, 2vw, 2.2rem);
  line-height: 1.08;
  color: #fff8e8;
}
.overworld-godot-copy {
  margin: 0;
  max-width: 28rem;
  color: rgba(247,241,223,.82);
  line-height: 1.35;
}
.overworld-godot-download {
  appearance: none;
  width: auto;
  border: 1px solid rgba(255,250,231,.44);
  border-radius: 7px;
  padding: 9px 13px;
  font: inherit;
  font-weight: 700;
  color: #17221b;
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
    background:
      linear-gradient(180deg, rgba(16,19,16,.34), rgba(16,19,16,.88)),
      url("/static/overworld-godot/v20260523-page-help/index.png") center / min(62%, 240px) no-repeat,
      #101310;
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

  function mount(host) {
    if (!host || host.dataset.overworldMounted === '1') {
      return;
    }
    host.dataset.overworldMounted = '1';
    injectStyles();

    const shell = document.createElement('div');
    shell.className = 'overworld-godot-shell';

    const frameWrap = document.createElement('div');
    frameWrap.className = 'overworld-godot-frame-wrap';

    const splash = document.createElement('div');
    splash.className = 'overworld-godot-splash';

    const splashPanel = document.createElement('div');
    splashPanel.className = 'overworld-godot-splash-panel';

    const kicker = document.createElement('div');
    kicker.className = 'overworld-godot-kicker';
    kicker.textContent = 'Godot Web';

    const title = document.createElement('h2');
    title.className = 'overworld-godot-title';
    title.textContent = 'Overworld';

    const copy = document.createElement('p');
    copy.className = 'overworld-godot-copy';
    copy.textContent = 'The game loads a compressed Godot Web build before play starts.';

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.className = 'overworld-godot-download';
    downloadButton.textContent = DOWNLOAD_LABEL;

    const status = document.createElement('div');
    status.className = 'overworld-godot-status';
    status.textContent = 'Waiting for download';

    const help = document.createElement('div');
    help.className = 'overworld-godot-help';

    const keys = document.createElement('div');
    keys.className = 'overworld-godot-keys';
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

    const loginNote = document.createElement('div');
    loginNote.className = 'overworld-godot-login-note';
    loginNote.textContent = 'Anonymous players can inspect the starting room. Log in with Nostr to walk through doors into the server.';

    function startDownload() {
      downloadButton.disabled = true;
      downloadButton.textContent = 'Downloading';
      status.textContent = 'Downloading Godot Overworld';

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
      startDownload();
    });

    splashPanel.appendChild(kicker);
    splashPanel.appendChild(title);
    splashPanel.appendChild(copy);
    splashPanel.appendChild(downloadButton);
    splash.appendChild(splashPanel);
    frameWrap.appendChild(splash);
    shell.appendChild(frameWrap);
    shell.appendChild(status);
    help.appendChild(keys);
    help.appendChild(loginNote);
    shell.appendChild(help);
    host.replaceChildren(shell);
    markReady();
  }

  function init() {
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
