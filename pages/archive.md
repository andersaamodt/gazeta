---
title: Archive
---

Browse all published posts grouped by month.

<div id="archive-list"></div>

<script>
(function () {
  var ARCHIVE_CACHE_KEY = 'wizardry_archive_html_v1';

  function readCache() {
    try {
      return String(localStorage.getItem(ARCHIVE_CACHE_KEY) || '');
    } catch (_err) {
      return '';
    }
  }

  function writeCache(html) {
    try {
      localStorage.setItem(ARCHIVE_CACHE_KEY, String(html || ''));
    } catch (_err) {
      // Ignore cache write failures.
    }
  }

  function renderArchiveHtml(html) {
    var container = document.getElementById('archive-list');
    if (!container) {
      return;
    }
    container.innerHTML = String(html || '');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cached = readCache();
    if (cached) {
      renderArchiveHtml(cached);
    }

    fetch('/cgi/blog-archive', { credentials: 'same-origin' })
      .then(function (res) { return res.text(); })
      .then(function (html) {
        var next = String(html || '');
        if (!next) {
          return;
        }
        writeCache(next);
        if (next !== cached) {
          renderArchiveHtml(next);
        }
      })
      .catch(function () {
        // Keep cache-only rendering on fetch failure.
      });
  });
})();
</script>
