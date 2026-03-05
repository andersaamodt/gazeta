(function () {
  const state = {
    currentUser: '',
    fingerprint: '',
    registrationChallenge: '',
    sessionToken: localStorage.getItem('session_token') || '',
    csrfToken: localStorage.getItem('csrf_token') || ''
  };

  const els = {
    regUsernameMud: document.getElementById('reg-username-mud'),
    regUsername: document.getElementById('reg-username'),
    regSshKey: document.getElementById('reg-ssh-key'),
    loginUsername: document.getElementById('login-username'),
    outputRegisterMud: document.getElementById('output-register-mud'),
    outputRegister: document.getElementById('output-register-ssh'),
    outputBind: document.getElementById('output-bind-webauthn'),
    outputLogin: document.getElementById('output-login'),
    outputDelegates: document.getElementById('output-delegates')
  };

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function fromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function fromBase64url(base64url) {
    const normalized = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    return fromBase64(normalized + '='.repeat(padLen));
  }

  function showOutput(target, message, kind) {
    const bg = kind === 'ok' ? '#e8f5e9' : (kind === 'warn' ? '#fff8e1' : '#ffebee');
    const border = kind === 'ok' ? '#4caf50' : (kind === 'warn' ? '#f9a825' : '#e53935');
    target.innerHTML = '<div class="notice" style="background:' + bg + ';border-color:' + border + ';">' + message + '</div>';
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error('Invalid JSON response');
    }
    return data;
  }

  async function postForm(url, payload) {
    const body = new URLSearchParams(payload || {});
    return fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
  }

  function rememberAuth(data) {
    state.sessionToken = data.session_token || '';
    state.csrfToken = data.csrf_token || '';
    if (state.sessionToken) {
      localStorage.setItem('session_token', state.sessionToken);
    }
    if (state.csrfToken) {
      localStorage.setItem('csrf_token', state.csrfToken);
    }
  }

  function updateCurrentIdentity(data) {
    state.currentUser = data.username || state.currentUser;
    state.fingerprint = data.fingerprint || state.fingerprint;
    state.registrationChallenge = data.challenge || state.registrationChallenge;
    if (state.currentUser && !els.loginUsername.value.trim()) {
      els.loginUsername.value = state.currentUser;
    }
    if (state.currentUser) {
      localStorage.setItem('last_auth_username', state.currentUser);
    }
  }

  async function registerMud() {
    const username = els.regUsernameMud.value.trim();
    if (!username) {
      showOutput(els.outputRegisterMud, 'Enter your MUD player name.', 'warn');
      return;
    }

    showOutput(els.outputRegisterMud, 'Looking up MUD account...', 'warn');
    const data = await postForm('/cgi/ssh-auth-register-mud', { username: username });
    if (!data.success) {
      throw new Error(data.error || 'Registration failed');
    }

    updateCurrentIdentity(data);
    showOutput(
      els.outputRegisterMud,
      'Registered <strong>' + escapeHtml(data.username) + '</strong> with SSH fingerprint <code>' + escapeHtml(data.fingerprint) + '</code>. Continue to passkey binding.',
      'ok'
    );
  }

  async function registerManual() {
    const username = els.regUsername.value.trim();
    const sshKey = els.regSshKey.value.trim();

    if (!username || !sshKey) {
      showOutput(els.outputRegister, 'Provide username and SSH public key.', 'warn');
      return;
    }

    showOutput(els.outputRegister, 'Registering SSH key...', 'warn');
    const data = await postForm('/cgi/ssh-auth-register', {
      username: username,
      ssh_public_key: sshKey
    });

    if (!data.success) {
      throw new Error(data.error || 'Registration failed');
    }

    updateCurrentIdentity(data);
    showOutput(
      els.outputRegister,
      'Registered <strong>' + escapeHtml(data.username) + '</strong>. Fingerprint <code>' + escapeHtml(data.fingerprint) + '</code>. Continue to passkey binding.',
      'ok'
    );
  }

  async function bindPasskey() {
    if (!state.currentUser || !state.fingerprint || !state.registrationChallenge) {
      showOutput(els.outputBind, 'Register your SSH identity first.', 'warn');
      return;
    }

    if (!window.PublicKeyCredential) {
      showOutput(els.outputBind, 'WebAuthn is not supported in this browser.', 'error');
      return;
    }

    showOutput(els.outputBind, 'Creating passkey credential...', 'warn');

    const challengeBuffer = fromBase64(state.registrationChallenge);
    const userId = new TextEncoder().encode(state.fingerprint);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: challengeBuffer,
        rp: {
          name: 'Wizardry Blog',
          id: window.location.hostname
        },
        user: {
          id: userId,
          name: state.currentUser,
          displayName: state.currentUser
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'cross-platform',
          residentKey: 'discouraged',
          userVerification: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      }
    });

    const publicKey = credential.response.getPublicKey ? credential.response.getPublicKey() : null;
    if (!publicKey) {
      throw new Error('Browser did not expose credential public key; use a modern browser.');
    }

    const data = await postForm('/cgi/ssh-auth-bind-webauthn', {
      username: state.currentUser,
      fingerprint: state.fingerprint,
      credential_id: credential.id,
      public_key: toBase64(publicKey),
      client_data_json: toBase64(credential.response.clientDataJSON)
    });

    if (!data.success) {
      throw new Error(data.error || 'Binding failed');
    }

    showOutput(
      els.outputBind,
      'Passkey bound. Delegate ID: <code>' + escapeHtml(data.delegate_id) + '</code>. You can now sign in.',
      'ok'
    );
  }

  async function loginWithPasskey() {
    const username = els.loginUsername.value.trim() || state.currentUser;
    if (!username) {
      showOutput(els.outputLogin, 'Enter username to sign in.', 'warn');
      return;
    }

    showOutput(els.outputLogin, 'Starting login challenge...', 'warn');
    const begin = await postForm('/cgi/ssh-auth-login-begin', { username: username });
    if (!begin.success) {
      throw new Error(begin.error || 'Unable to start login');
    }

    const allowCredentials = (begin.allow_credentials || []).map(function (id) {
      return {
        id: fromBase64url(id),
        type: 'public-key'
      };
    });

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: fromBase64(begin.challenge),
        allowCredentials: allowCredentials,
        userVerification: 'preferred',
        timeout: 60000
      }
    });

    const finish = await postForm('/cgi/ssh-auth-login-finish', {
      username: username,
      credential_id: assertion.id,
      authenticator_data: toBase64(assertion.response.authenticatorData),
      client_data_json: toBase64(assertion.response.clientDataJSON),
      signature: toBase64(assertion.response.signature)
    });

    if (!finish.success) {
      throw new Error(finish.error || 'Login failed');
    }

    rememberAuth(finish);
    updateCurrentIdentity({ username: finish.username, fingerprint: finish.fingerprint });
    showOutput(
      els.outputLogin,
      'Signed in as <strong>' + escapeHtml(finish.username) + '</strong>. <a href="admin.html">Open admin panel</a>.',
      'ok'
    );
  }

  async function listDelegates() {
    if (!state.sessionToken || !state.csrfToken) {
      showOutput(els.outputDelegates, 'Sign in first to list delegates.', 'warn');
      return;
    }

    const username = els.loginUsername.value.trim() || state.currentUser;
    const data = await postForm('/cgi/ssh-auth-list-delegates', {
      session_token: state.sessionToken,
      csrf_token: state.csrfToken,
      username: username
    });

    if (!data.success) {
      throw new Error(data.error || 'Unable to list delegates');
    }

    const delegates = data.delegates || [];
    if (!delegates.length) {
      showOutput(els.outputDelegates, 'No delegates registered yet.', 'warn');
      return;
    }

    let html = '<div class="notice" style="background:#e3f2fd;border-color:#1976d2;">';
    html += '<p><strong>User:</strong> ' + escapeHtml(data.username || username) + '</p>';
    html += '<p><strong>Total delegates:</strong> ' + delegates.length + '</p>';
    html += '<div class="delegate-grid">';
    delegates.forEach(function (d) {
      html += '<div class="delegate-card">';
      html += '<div><strong>ID</strong>: <code>' + escapeHtml(d.delegate_id) + '</code></div>';
      html += '<div><strong>Credential</strong>: <code>' + escapeHtml((d.credential_id || '').slice(0, 40)) + '...</code></div>';
      html += '<div><strong>Created</strong>: ' + escapeHtml(d.created_at || '') + '</div>';
      html += '<div><strong>Sign count</strong>: ' + escapeHtml(String(d.sign_count || 0)) + '</div>';
      html += '<button type="button" class="danger" data-revoke="' + escapeHtml(d.delegate_id) + '" data-username="' + escapeHtml(data.username || username) + '">Revoke</button>';
      html += '</div>';
    });
    html += '</div></div>';
    els.outputDelegates.innerHTML = html;
  }

  async function revokeDelegate(delegateId, username) {
    const data = await postForm('/cgi/ssh-auth-revoke-delegate', {
      session_token: state.sessionToken,
      csrf_token: state.csrfToken,
      delegate_id: delegateId,
      username: username
    });

    if (!data.success) {
      throw new Error(data.error || 'Failed to revoke delegate');
    }

    await listDelegates();
  }

  async function logout() {
    if (!state.sessionToken) {
      return;
    }

    try {
      await postForm('/cgi/ssh-auth-logout', { session_token: state.sessionToken });
    } catch (_) {
      // best effort
    }

    state.sessionToken = '';
    state.csrfToken = '';
    localStorage.removeItem('session_token');
    localStorage.removeItem('csrf_token');
    showOutput(els.outputLogin, 'Signed out.', 'ok');
  }

  function bindEvents() {
    document.getElementById('btn-register-mud').addEventListener('click', function () {
      registerMud().catch(function (err) {
        showOutput(els.outputRegisterMud, err.message, 'error');
      });
    });

    document.getElementById('btn-register-ssh').addEventListener('click', function () {
      registerManual().catch(function (err) {
        showOutput(els.outputRegister, err.message, 'error');
      });
    });

    document.getElementById('btn-bind-webauthn').addEventListener('click', function () {
      bindPasskey().catch(function (err) {
        showOutput(els.outputBind, err.message, 'error');
      });
    });

    document.getElementById('btn-login').addEventListener('click', function () {
      loginWithPasskey().catch(function (err) {
        showOutput(els.outputLogin, err.message, 'error');
      });
    });

    document.getElementById('btn-list-delegates').addEventListener('click', function () {
      listDelegates().catch(function (err) {
        showOutput(els.outputDelegates, err.message, 'error');
      });
    });

    document.getElementById('btn-logout').addEventListener('click', function () {
      logout().catch(function (err) {
        showOutput(els.outputLogin, err.message, 'error');
      });
    });

    els.outputDelegates.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const delegateId = target.getAttribute('data-revoke');
      const username = target.getAttribute('data-username');
      if (!delegateId) {
        return;
      }
      const confirmed = window.confirm('Revoke this delegate?');
      if (!confirmed) {
        return;
      }
      revokeDelegate(delegateId, username || state.currentUser).catch(function (err) {
        showOutput(els.outputDelegates, err.message, 'error');
      });
    });
  }

  bindEvents();
})();
