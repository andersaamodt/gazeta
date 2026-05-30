(function () {
  const root = document.getElementById('artificer-web-root');
  if (!root) return;

  const status = root.querySelector('.artificer-web-status');
  let overflowPanel = null;

  function showError(message) {
    if (!status) return;
    status.classList.add('artificer-web-error');
    status.innerHTML = '<h1>Artificer Web</h1><p></p>';
    status.querySelector('p').textContent = message;
  }

  function showLoginGate() {
    root.innerHTML = '<div class="artificer-web-login-gate"><button type="button" class="artificer-web-login-btn" data-artificer-login>Login</button></div>';
  }

  function openSiteLogin() {
    if (window.blogAuth && typeof window.blogAuth.startLogin === 'function') {
      window.blogAuth.startLogin({ fallbackModal: false }).catch(function () {
        // The shared auth layer reports signer failures and may show fallback UI.
      });
      return true;
    }
    const loginButton = document.getElementById('login-btn');
    if (loginButton) {
      loginButton.click();
      return true;
    }
    return false;
  }

  function isAuthFailure(state) {
    const code = state && state.code ? String(state.code) : '';
    const message = state && state.error ? String(state.error) : '';
    return code === 'auth_required' ||
      code === 'admin_nostr_required' ||
      code === 'owner_required' ||
      code === 'nostr_key_required' ||
      /\bsign in\b/i.test(message);
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

  function closeOverflow() {
    const button = root.querySelector('[data-artificer-overflow]');
    if (overflowPanel) overflowPanel.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function toggleOverflow() {
    const button = root.querySelector('[data-artificer-overflow]');
    overflowPanel = root.querySelector('[data-artificer-overflow-panel]');
    if (!button || !overflowPanel) return;
    const willOpen = overflowPanel.hidden;
    overflowPanel.hidden = !willOpen;
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
      '<button type="button" class="artificer-web-overflow-btn" data-artificer-overflow aria-haspopup="menu" aria-expanded="false" aria-label="Artificer Web menu" title="Artificer Web menu">' +
      '<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>' +
      '</button>' +
      '<div class="artificer-web-overflow-panel" data-artificer-overflow-panel role="menu" hidden>' +
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
          if (isAuthFailure(state)) {
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
      event.preventDefault();
      if (openSiteLogin()) return;
      setTimeout(openSiteLogin, 120);
      return;
    }
    if (event.target.closest('[data-artificer-overflow]')) {
      event.preventDefault();
      event.stopPropagation();
      toggleOverflow();
      return;
    }
    if (event.target.closest('[data-artificer-logout]')) {
      event.preventDefault();
      closeOverflow();
      logout();
      return;
    }
    if (overflowPanel && !overflowPanel.hidden && !event.target.closest('[data-artificer-overflow-panel]')) {
      closeOverflow();
    }
  });

  document.addEventListener('click', function (event) {
    if (!overflowPanel || overflowPanel.hidden) return;
    if (root.contains(event.target)) return;
    closeOverflow();
  });

  window.addEventListener('storage', function (event) {
    if (event.key === 'session_token' || event.key === 'csrf_token') {
      loadStatus();
    }
  });
  window.addEventListener('blog-auth-changed', loadStatus);

  loadStatus();
})();
