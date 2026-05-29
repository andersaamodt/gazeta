(function () {
  const root = document.getElementById('artificer-web-root');
  if (!root) return;

  const status = root.querySelector('.artificer-web-status');

  function showError(message) {
    if (!status) return;
    status.classList.add('artificer-web-error');
    status.innerHTML = '<h1>Artificer Web</h1><p></p>';
    status.querySelector('p').textContent = message;
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return '';
    }
  }

  function bridgeUrl(path, extra) {
    const params = new URLSearchParams(extra || {});
    params.set('session_token', String(storageGet('session_token') || '').trim());
    params.set('csrf_token', String(storageGet('csrf_token') || '').trim());
    if (path) params.set('path', path);
    return '/cgi/blog-artificer-web?' + params.toString();
  }

  fetch(bridgeUrl('', { action: 'status' }), {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
    .then((response) => response.json())
    .then((state) => {
      if (!state || state.success !== true) {
        showError(state && state.error ? state.error : 'Sign in with the owner Nostr identity to open Artificer Web.');
        return;
      }
      if (!state.configured) {
        showError('Artificer Web is not connected yet. Set artificer_remote_base and the remote token on the server.');
        return;
      }
      const frame = document.createElement('iframe');
      frame.className = 'artificer-web-frame';
      frame.title = 'Artificer Web';
      frame.src = bridgeUrl('/');
      root.replaceChildren(frame);
    })
    .catch(() => {
      showError('Artificer Web could not reach the site bridge.');
    });
})();
