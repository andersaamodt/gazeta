(function () {
  'use strict';

  var root = document.getElementById('archive-page-root');
  if (!root) {
    return;
  }

  var content = document.getElementById('archive-page-content');
  if (!content) {
    return;
  }

  function markInitialContentPainted() {
    window.__wizardryNotifyInitialContentPainted('archive', {
      markPageReady: true
    });
  }

  function renderLoadFallback(err) {
    if (err && window.console && typeof window.console.warn === 'function') {
      window.console.warn('Archive page request failed:', err);
    }
    content.innerHTML = '<p class="placeholder">Archive entries are still loading. The latest archive data was not available yet.</p>';
  }

  fetch('/cgi/blog-archive', {
    cache: 'no-store',
    credentials: 'same-origin'
  })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      if (!String(html || '').trim()) {
        throw new Error('Archive returned no content.');
      }
      content.innerHTML = html;
    })
    .catch(function (err) {
      renderLoadFallback(err);
    })
    .finally(function () {
      markInitialContentPainted();
    });
})();
