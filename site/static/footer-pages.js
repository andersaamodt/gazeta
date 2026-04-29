(function () {
  'use strict';

  var CACHE_KEY = 'cached_footer_pages_v1';

  function pageTitle(page) {
    return String((page && (page.title || page.placeholder_title || page.slug)) || '').trim();
  }

  function pagePath(page) {
    return String((page && page.path) || '').trim() || '/';
  }

  function validPages(value) {
    return (Array.isArray(value) ? value : []).filter(function (page) {
      return page && pageTitle(page) && pagePath(page);
    });
  }

  function renderFooterPages(pages) {
    var nav = document.getElementById('footer-pages');
    if (!nav) {
      return;
    }
    var rows = validPages(pages);
    if (!rows.length) {
      nav.innerHTML = '';
      nav.hidden = true;
      return;
    }
    nav.innerHTML = rows.map(function (page) {
      var a = document.createElement('a');
      a.className = 'footer-page-link';
      a.href = pagePath(page);
      a.textContent = pageTitle(page);
      return a.outerHTML;
    }).join('');
    nav.hidden = false;
  }

  function bootstrapPages() {
    if (window.__wizardrySiteBootstrap && Array.isArray(window.__wizardrySiteBootstrap.footer_pages)) {
      return window.__wizardrySiteBootstrap.footer_pages;
    }
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    } catch (_err) {
      return [];
    }
  }

  function cachePages(pages) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(validPages(pages)));
    } catch (_err) {
      // Ignore cache write failures.
    }
  }

  function refreshFromStatic() {
    fetch('/static/footer-pages.json', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('footer pages unavailable');
        }
        return res.json();
      })
      .then(function (data) {
        var pages = validPages(data && data.pages);
        cachePages(pages);
        renderFooterPages(pages);
      })
      .catch(function () {
        // Keep the bootstrapped/cached footer rather than flashing empty.
      });
  }

  renderFooterPages(bootstrapPages());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      renderFooterPages(bootstrapPages());
      refreshFromStatic();
    }, { once: true });
  } else {
    refreshFromStatic();
  }
  window.addEventListener('wizardry-footer-refresh-request', function (event) {
    var pages = event && event.detail && Array.isArray(event.detail.pages) ? event.detail.pages : [];
    cachePages(pages);
    renderFooterPages(pages);
  });
})();
