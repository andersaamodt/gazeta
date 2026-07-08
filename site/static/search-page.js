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

    window.__wizardryLoadPublicPageFragment({
      endpoint: '/cgi/blog-search?q=' + encodeURIComponent(query),
      contentNode: content,
      slug: 'search',
      markPageReady: true,
      consoleLabel: 'Search page',
      fallbackText: 'Search results are still loading. The latest search data was not available yet.',
      emptyMessage: 'Search returned no content.',
      afterRender: function () {
        focusPageSearchInput();
      }
    });
  }

  if (form instanceof HTMLFormElement && pageInput instanceof HTMLInputElement) {
    form.addEventListener('submit', function () {
      syncSearchInputs(String(pageInput.value || '').trim());
    });
  }

  load();
})();
