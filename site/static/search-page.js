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

  var form = document.getElementById('search-page-form');
  var pageInput = document.getElementById('search-page-input');

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function markInitialContentPainted() {
    window.__wizardryNotifyInitialContentPainted('search', {
      markPageReady: true
    });
  }

  function setInputValue(input, value) {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    input.value = value;
  }

  function syncSearchInputs(query) {
    setInputValue(pageInput, query);
    setInputValue(document.querySelector('.nav-search input[name="q"]'), query);
  }

  function renderSearchLoadFallback(err) {
    if (err && window.console && typeof window.console.warn === 'function') {
      window.console.warn('Search page request failed:', err);
    }
    content.innerHTML = '<p class="placeholder">Search results are still loading. The latest search data was not available yet.</p>';
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

  function focusPageSearchInput() {
    if (!(pageInput instanceof HTMLInputElement)) {
      focusNavbarSearchInput();
      return;
    }
    try {
      pageInput.focus({ preventScroll: true });
    } catch (_err) {
      pageInput.focus();
    }
    pageInput.select();
  }

  function renderEmptyState() {
    content.innerHTML = '<p class="placeholder">Enter a search term to find posts.</p>';
    focusPageSearchInput();
    markInitialContentPainted();
  }

  function load() {
    var params = new URLSearchParams(window.location.search || '');
    var query = String(params.get('q') || '').trim();
    syncSearchInputs(query);
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
      })
      .catch(function (err) {
        renderSearchLoadFallback(err);
      })
      .finally(function () {
        focusPageSearchInput();
        markInitialContentPainted();
      });
  }

  if (form instanceof HTMLFormElement && pageInput instanceof HTMLInputElement) {
    form.addEventListener('submit', function () {
      syncSearchInputs(String(pageInput.value || '').trim());
    });
  }

  load();
})();
