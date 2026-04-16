(function () {
  'use strict';

  if (window.blogNostrPublishDialog && typeof window.blogNostrPublishDialog.open === 'function') {
    return;
  }

  var state = {
    root: null,
    panel: null,
    subtitle: null,
    status: null,
    error: null,
    meta: null,
    warnings: null,
    json: null,
    cancelButton: null,
    publishButton: null,
    closeButton: null,
    isOpen: false,
    isBusy: false,
    pageSlug: '',
    pageLabel: '',
    previewEvent: null,
    resolve: null,
    onPublished: null
  };

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function authPayload(extra) {
    var payload = Object.assign({}, extra || {});
    payload.session_token = String(localStorage.getItem('session_token') || '').trim();
    payload.csrf_token = String(localStorage.getItem('csrf_token') || '').trim();
    return payload;
  }

  async function apiPost(url, data) {
    var body = new URLSearchParams(data || {});
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      credentials: 'same-origin'
    });
    var raw = await res.text();
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_err) {
      throw new Error('Invalid JSON response');
    }
    if (!res.ok || !parsed || parsed.success !== true) {
      throw new Error((parsed && (parsed.error || parsed.message)) || ('Request failed: ' + res.status));
    }
    return parsed;
  }

  function closeDialog(published) {
    if (!state.root || !state.isOpen) {
      return;
    }
    state.isOpen = false;
    state.isBusy = false;
    state.root.hidden = true;
    document.body.classList.remove('nostr-publish-dialog-open');
    var resolve = state.resolve;
    state.resolve = null;
    state.previewEvent = null;
    state.onPublished = null;
    if (typeof resolve === 'function') {
      resolve(!!published);
    }
  }

  function setBusy(next) {
    state.isBusy = !!next;
    if (state.cancelButton) {
      state.cancelButton.disabled = state.isBusy;
    }
    if (state.closeButton) {
      state.closeButton.disabled = state.isBusy;
    }
    if (state.publishButton) {
      state.publishButton.disabled = state.isBusy || !state.previewEvent;
    }
  }

  function setStatus(message) {
    if (!state.status) {
      return;
    }
    state.status.textContent = String(message || '');
    state.status.hidden = !message;
  }

  function setError(message) {
    if (!state.error) {
      return;
    }
    state.error.textContent = String(message || '');
    state.error.hidden = !message;
  }

  function renderMeta(preview) {
    if (!state.meta) {
      return;
    }
    var event = preview && preview.event ? preview.event : null;
    var kind = event && typeof event.kind !== 'undefined' ? String(event.kind) : '-';
    var eventId = event && event.id ? String(event.id) : '-';
    var pubkey = event && event.pubkey ? String(event.pubkey) : '-';
    var pageType = preview && preview.page_type ? String(preview.page_type) : '-';
    state.meta.innerHTML = '' +
      '<div class="nostr-publish-meta-item"><strong>Slug</strong><span>' + escapeHtml(state.pageSlug) + '</span></div>' +
      '<div class="nostr-publish-meta-item"><strong>Type</strong><span>' + escapeHtml(pageType) + '</span></div>' +
      '<div class="nostr-publish-meta-item"><strong>Kind</strong><span>' + escapeHtml(kind) + '</span></div>' +
      '<div class="nostr-publish-meta-item"><strong>Event ID</strong><span class="nostr-publish-code-inline">' + escapeHtml(eventId) + '</span></div>' +
      '<div class="nostr-publish-meta-item"><strong>Pubkey</strong><span class="nostr-publish-code-inline">' + escapeHtml(pubkey) + '</span></div>';
  }

  function renderWarnings(preview) {
    if (!state.warnings) {
      return;
    }
    var warnings = [];
    if (preview && preview.validation && Array.isArray(preview.validation.warnings)) {
      warnings = preview.validation.warnings.filter(function (item) { return !!String(item || '').trim(); });
    }
    if (!warnings.length) {
      state.warnings.hidden = true;
      state.warnings.innerHTML = '';
      return;
    }
    var html = '<strong>Validation warnings</strong><ul>';
    warnings.forEach(function (warning) {
      html += '<li>' + escapeHtml(String(warning || '')) + '</li>';
    });
    html += '</ul>';
    state.warnings.innerHTML = html;
    state.warnings.hidden = false;
  }

  function renderJson(preview) {
    if (!state.json) {
      return;
    }
    var event = preview && preview.event ? preview.event : null;
    state.previewEvent = event || null;
    if (!event) {
      state.json.textContent = '';
      return;
    }
    state.json.textContent = JSON.stringify(event, null, 2);
  }

  async function loadPreview() {
    setBusy(true);
    setError('');
    setStatus('Preparing signed event preview...');
    renderWarnings(null);
    renderJson(null);
    renderMeta(null);
    try {
      var preview = await apiPost('/cgi/blog-publish-nostr-page', authPayload({
        page_slug: state.pageSlug,
        preview_only: 'true'
      }));
      renderMeta(preview);
      renderWarnings(preview);
      renderJson(preview);
      setStatus('Preview ready.');
      setBusy(false);
    } catch (err) {
      setStatus('');
      setError(err && err.message ? err.message : 'Could not prepare preview');
      setBusy(false);
    }
  }

  async function publishExactEvent() {
    if (!state.previewEvent) {
      return;
    }
    setBusy(true);
    setError('');
    setStatus('Publishing to Nostr...');
    try {
      var result = await apiPost('/cgi/blog-publish-nostr-page', authPayload({
        page_slug: state.pageSlug,
        event_json: JSON.stringify(state.previewEvent)
      }));
      if (typeof state.onPublished === 'function') {
        try {
          state.onPublished(result);
        } catch (_err) {
          // Ignore callback errors from caller.
        }
      }
      closeDialog(true);
    } catch (err) {
      setError(err && err.message ? err.message : 'Could not publish to Nostr');
      setStatus('');
      setBusy(false);
    }
  }

  function ensureDom() {
    if (state.root) {
      return;
    }
    var container = document.createElement('div');
    container.className = 'nostr-publish-modal';
    container.hidden = true;
    container.innerHTML = '' +
      '<div class="nostr-publish-modal-backdrop" data-nostr-publish-close="backdrop"></div>' +
      '<div class="nostr-publish-modal-panel" role="dialog" aria-modal="true" aria-labelledby="nostr-publish-modal-title">' +
      '<button type="button" class="nostr-publish-modal-close unobtrusive-icon-button" data-nostr-publish-close="button" aria-label="Close publish dialog">×</button>' +
      '<h2 id="nostr-publish-modal-title">Publish to Nostr</h2>' +
      '<p class="nostr-publish-modal-subtitle" id="nostr-publish-modal-subtitle"></p>' +
      '<p class="nostr-publish-modal-status" id="nostr-publish-modal-status" hidden></p>' +
      '<p class="nostr-publish-modal-error" id="nostr-publish-modal-error" hidden></p>' +
      '<div class="nostr-publish-meta" id="nostr-publish-modal-meta"></div>' +
      '<div class="nostr-publish-warnings" id="nostr-publish-modal-warnings" hidden></div>' +
      '<div class="nostr-publish-json-wrap"><div class="nostr-publish-json-label">Nostr event JSON</div><pre class="nostr-publish-json" id="nostr-publish-modal-json"></pre></div>' +
      '<div class="nostr-publish-modal-actions">' +
      '<button type="button" id="nostr-publish-modal-cancel">Cancel</button>' +
      '<button type="button" id="nostr-publish-modal-confirm" class="list-admin-primary-btn" disabled>Publish to Nostr</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(container);

    state.root = container;
    state.panel = container.querySelector('.nostr-publish-modal-panel');
    state.subtitle = document.getElementById('nostr-publish-modal-subtitle');
    state.status = document.getElementById('nostr-publish-modal-status');
    state.error = document.getElementById('nostr-publish-modal-error');
    state.meta = document.getElementById('nostr-publish-modal-meta');
    state.warnings = document.getElementById('nostr-publish-modal-warnings');
    state.json = document.getElementById('nostr-publish-modal-json');
    state.cancelButton = document.getElementById('nostr-publish-modal-cancel');
    state.publishButton = document.getElementById('nostr-publish-modal-confirm');
    state.closeButton = container.querySelector('.nostr-publish-modal-close');

    container.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (!state.isBusy && target.hasAttribute('data-nostr-publish-close')) {
        closeDialog(false);
        return;
      }
      if (target === state.publishButton) {
        publishExactEvent();
      }
      if (target === state.cancelButton && !state.isBusy) {
        closeDialog(false);
      }
    });

    window.addEventListener('keydown', function (event) {
      if (!state.isOpen || state.isBusy) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog(false);
      }
    });
  }

  function openDialog(options) {
    ensureDom();
    var opts = options || {};
    var pageSlug = String(opts.pageSlug || '').trim();
    if (!pageSlug) {
      return Promise.resolve(false);
    }
    state.pageSlug = pageSlug;
    state.pageLabel = String(opts.pageLabel || pageSlug).trim() || pageSlug;
    state.onPublished = (typeof opts.onPublished === 'function') ? opts.onPublished : null;
    state.previewEvent = null;

    if (state.subtitle) {
      state.subtitle.textContent = 'Review the exact signed event for "' + state.pageLabel + '" before publishing.';
    }
    setError('');
    setStatus('');
    renderMeta(null);
    renderWarnings(null);
    renderJson(null);

    state.root.hidden = false;
    state.isOpen = true;
    document.body.classList.add('nostr-publish-dialog-open');

    return new Promise(function (resolve) {
      state.resolve = resolve;
      loadPreview();
    });
  }

  window.blogNostrPublishDialog = {
    open: openDialog
  };
})();
