(function () {
  'use strict';

  var root = document.getElementById('search-page-root');
  if (!root) {
    return;
  }

  var content = document.getElementById('search-page-content');
  if (!content) {
    return;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function markInitialContentPainted() {
    try {
      window.__wizardryPageInitialContentReady = true;
      window.dispatchEvent(new CustomEvent('blog-page-initial-content-ready', {
        detail: { slug: 'search' }
      }));
    } catch (_err) {
      // Ignore event dispatch failures.
    }
  }

  function rewriteEmbeddedSearchForms() {
    var forms = content.querySelectorAll('form[action="/cgi/blog-search"]');
    forms.forEach(function (form) {
      if (form && form.parentNode) {
        form.parentNode.removeChild(form);
      }
    });
  }

  function focusNavbarSearchInput() {
    var input = document.querySelector('.nav-search input[name="q"]');
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    try {
      input.focus({ preventScroll: true });
    } catch (_err) {
      input.focus();
    }
    input.select();
  }

  function renderEmptyState() {
    content.innerHTML = '<p class="placeholder">Enter a search term to find posts.</p>';
    focusNavbarSearchInput();
    markInitialContentPainted();
  }

  function load() {
    var params = new URLSearchParams(window.location.search || '');
    var query = String(params.get('q') || '').trim();
    if (!query) {
      renderEmptyState();
      return;
    }

    content.innerHTML = '<p class="placeholder">Searching for <strong>' + escapeHtml(query) + '</strong>...</p>';

    fetch('/cgi/blog-search?q=' + encodeURIComponent(query), {
      credentials: 'same-origin'
    })
      .then(function (res) { return res.text(); })
      .then(function (html) {
        if (!String(html || '').trim()) {
          throw new Error('Search returned no content.');
        }
        content.innerHTML = html;
        rewriteEmbeddedSearchForms();
      })
      .catch(function (err) {
        content.innerHTML = '<p class="placeholder">Error: ' + escapeHtml(err && err.message ? err.message : 'Could not load search results.') + '</p>';
      })
      .finally(function () {
        focusNavbarSearchInput();
        markInitialContentPainted();
      });
  }

  load();
})();
