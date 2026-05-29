(function () {
  const root = document.getElementById('artificer-web-root');
  if (!root) return;

  const status = root.querySelector('.artificer-web-status');
  let settingsPanel = null;

  function showError(message) {
    if (!status) return;
    status.classList.add('artificer-web-error');
    status.innerHTML = '<h1>Artificer Web</h1><p></p>';
    status.querySelector('p').textContent = message;
  }

  function showLoginGate() {
    root.innerHTML = '<div class="artificer-web-login-gate"><button type="button" class="artificer-web-login-btn" data-artificer-login>Login</button></div>';
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return '';
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      // Ignore storage failures.
    }
  }

  function bridgeUrl(path, extra) {
    const params = new URLSearchParams(extra || {});
    params.set('session_token', String(storageGet('session_token') || '').trim());
    params.set('csrf_token', String(storageGet('csrf_token') || '').trim());
    if (path) params.set('path', path);
    return '/cgi/blog-artificer-web?' + params.toString();
  }

  function closeSettings() {
    const button = root.querySelector('[data-artificer-settings]');
    if (settingsPanel) settingsPanel.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function toggleSettings() {
    const button = root.querySelector('[data-artificer-settings]');
    settingsPanel = root.querySelector('[data-artificer-settings-panel]');
    if (!button || !settingsPanel) return;
    const willOpen = settingsPanel.hidden;
    settingsPanel.hidden = !willOpen;
    button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }

  function logout() {
    const token = String(storageGet('session_token') || '').trim();
    const csrf = String(storageGet('csrf_token') || '').trim();
    const body = new URLSearchParams();
    if (token) body.set('session_token', token);
    if (csrf) body.set('csrf_token', csrf);
    return fetch('/cgi/ssh-auth-logout', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }).catch(function () {
      return null;
    }).finally(function () {
      storageRemove('session_token');
      storageRemove('csrf_token');
      storageRemove('last_auth_method');
      try {
        window.dispatchEvent(new CustomEvent('blog-auth-changed'));
      } catch (err) {
        // Ignore event dispatch failures.
      }
      loadStatus();
    });
  }

  function renderRemoteFrame() {
    const frame = document.createElement('iframe');
    frame.className = 'artificer-web-frame';
    frame.title = 'Artificer Web';
    frame.src = bridgeUrl('/');

    const toolbar = document.createElement('div');
    toolbar.className = 'artificer-web-toolbar';
    toolbar.innerHTML = '' +
      '<button type="button" class="artificer-web-settings-btn" data-artificer-settings aria-haspopup="menu" aria-expanded="false" aria-label="Settings" title="Settings">' +
      '<img src="/static/icons/settings-gear.svg" alt="" aria-hidden="true" decoding="async">' +
      '</button>' +
      '<div class="artificer-web-settings-panel" data-artificer-settings-panel role="menu" hidden>' +
      '<button type="button" role="menuitem" data-artificer-logout>Logout</button>' +
      '</div>';

    root.replaceChildren(frame, toolbar);
  }

  function loadStatus() {
    fetch(bridgeUrl('', { action: 'status' }), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then((response) => response.json())
      .then((state) => {
        if (!state || state.success !== true) {
          const code = state && state.code ? String(state.code) : '';
          if (code === 'auth_required' || code === 'admin_nostr_required' || code === 'owner_required') {
            showLoginGate();
          } else {
            showError(state && state.error ? state.error : 'Artificer Web could not authenticate.');
          }
          return;
        }
        if (!state.configured) {
          showError('Artificer Web is not connected yet. Set artificer_remote_base and the remote token on the server.');
          return;
        }
        renderRemoteFrame();
      })
      .catch(() => {
        showError('Artificer Web could not reach the site bridge.');
      });
  }

  root.addEventListener('click', function (event) {
    const login = event.target.closest('[data-artificer-login]');
    if (login) {
      const loginButton = document.getElementById('login-btn');
      if (loginButton) loginButton.click();
      return;
    }
    if (event.target.closest('[data-artificer-settings]')) {
      event.preventDefault();
      event.stopPropagation();
      toggleSettings();
      return;
    }
    if (event.target.closest('[data-artificer-logout]')) {
      event.preventDefault();
      closeSettings();
      logout();
      return;
    }
    if (settingsPanel && !settingsPanel.hidden && !event.target.closest('[data-artificer-settings-panel]')) {
      closeSettings();
    }
  });

  document.addEventListener('click', function (event) {
    if (!settingsPanel || settingsPanel.hidden) return;
    if (root.contains(event.target)) return;
    closeSettings();
  });

  window.addEventListener('storage', function (event) {
    if (event.key === 'session_token' || event.key === 'csrf_token') {
      loadStatus();
    }
  });
  window.addEventListener('blog-auth-changed', loadStatus);

  loadStatus();
})();
