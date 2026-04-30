<script>
(function () {
  var docEl = document.documentElement;
  var navReady = false;
  var pageReady = false;
  var revealed = false;

  function hasDynamicPageRoot() {
    return !!(
      document.getElementById('blog-page-root') ||
      document.getElementById('nip23-page-root') ||
      document.getElementById('list-page-root') ||
      document.getElementById('public-ranking-root') ||
      document.getElementById('contact-page-root') ||
      document.getElementById('search-page-root') ||
      document.getElementById('admin-panel')
    );
  }

  function reveal() {
    if (revealed) {
      return;
    }
    revealed = true;
    if (docEl) {
      docEl.classList.remove('app-hydrating');
    }
  }

  function maybeReveal() {
    if (navReady && pageReady) {
      reveal();
    }
  }

  window.__wizardryHydration = {
    markNavReady: function () {
      navReady = true;
      maybeReveal();
    },
    markPageReady: function () {
      pageReady = true;
      maybeReveal();
    },
    forceReveal: reveal
  };

  setTimeout(function () {
    reveal();
  }, 6000);
})();
</script>
<a class="skip-link" href="#main-content">Skip to content</a>
<nav class="site-nav">
<div class="nav-overflow-menu" id="nav-overflow-menu" hidden>
  <button class="nav-menu-btn nav-overflow-btn" id="nav-overflow-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="More pages">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 4.25H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M3 8H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M3 11.75H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span class="nav-overflow-count" id="nav-overflow-count" hidden>0</span>
  </button>
  <div class="nav-menu-panel nav-overflow-panel" id="nav-overflow-panel" role="menu" hidden></div>
</div>
<span id="nav-site-signature" class="nav-site-signature" aria-hidden="true">Site</span>
<div class="nav-center">
<a href="/" data-page="blog">Blog</a>
</div>
<div class="nav-right">
<form class="nav-search" method="get" action="/search">
<input type="text" name="q" placeholder="Search..." />
<button type="submit" aria-label="Search">
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/>
<path d="M11 11L14.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
</button>
</form>
<div class="nav-compose-tools" id="nav-compose-tools" style="display:none;">
<a href="/admin#compose" class="nav-compose nav-compose-icon" aria-label="Compose post" title="Compose post">
<!-- Icon is replaced by nav-auth.js -->
<svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4"/>
</svg>
</a>
</div>
<button id="nav-cart-toggle" class="nav-cart-toggle" type="button" aria-label="Open cart" aria-expanded="false" hidden>
<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<path d="M3 4H5L7 16H18L21 7H6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="9" cy="20" r="1.7" fill="currentColor"/>
<circle cx="17" cy="20" r="1.7" fill="currentColor"/>
</svg>
<span id="nav-cart-count" class="nav-cart-count" hidden>0</span>
</button>
<a id="nav-user-name" class="nav-username" href="/admin#account" style="display:none;"></a>
<div class="nav-user-menu" id="nav-user-menu" style="display:none;">
  <button class="nav-menu-btn" id="nav-menu-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="User menu">⋮</button>
  <div class="nav-menu-panel" id="nav-menu-panel" role="menu" hidden>
    <a id="nav-menu-primary-link" class="nav-menu-item" href="/admin" role="menuitem">Admin</a>
    <button id="nav-menu-logout-everywhere" class="nav-menu-item" type="button" role="menuitem" style="display:none;">Log out other sessions</button>
    <button id="nav-menu-logout" class="nav-menu-item nav-menu-item-danger" type="button" role="menuitem">Logout</button>
  </div>
</div>
<div class="nav-login-split" id="nav-login-split" style="display:none;">
  <button class="btn-login btn-login-main" id="login-btn" type="button">Login</button>
  <button class="btn-login btn-login-caret" id="login-more-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="More login options">▼</button>
  <div class="nav-login-menu" id="nav-login-menu" role="menu" hidden>
    <button id="login-menu-register" class="nav-menu-item" type="button" role="menuitem">Use browser signer...</button>
    <button id="login-menu-phone" class="nav-menu-item" type="button" role="menuitem">Use phone signer (QR)</button>
    <button id="login-menu-manual" class="nav-menu-item" type="button" role="menuitem">Advanced...</button>
    <button id="login-menu-learn" class="nav-menu-item" type="button" role="menuitem">Learn about Nostr sign-in</button>
  </div>
</div>
</div>
</nav>
<script>
(function () {
  function dedupeTopLevelNav() {
    try {
      var navs = document.querySelectorAll('nav.site-nav');
      if (navs && navs.length > 1) {
        for (var i = 1; i < navs.length; i += 1) {
          var node = navs[i];
          if (node && node.parentNode) {
            node.parentNode.removeChild(node);
          }
        }
      }
      var skips = document.querySelectorAll('.skip-link');
      if (skips && skips.length > 1) {
        for (var j = 1; j < skips.length; j += 1) {
          var skip = skips[j];
          if (skip && skip.parentNode) {
            skip.parentNode.removeChild(skip);
          }
        }
      }
    } catch (_dedupeErr) {
      // Ignore non-fatal nav dedupe issues.
    }
  }

  dedupeTopLevelNav();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dedupeTopLevelNav, { once: true });
  } else {
    setTimeout(dedupeTopLevelNav, 0);
  }

  try {
    var SITE_TITLE_CACHE_KEY = 'wizardry_blog_site_title_v1';
    var siteSignature = document.getElementById('nav-site-signature');
    function normalizeSiteTitle(value) {
      var text = String(value || '').replace(/\s+/g, ' ').trim();
      return text || 'Site';
    }
    function applySiteTitleSignature(value) {
      if (!siteSignature) {
        return;
      }
      var title = normalizeSiteTitle(value);
      siteSignature.textContent = title;
      siteSignature.setAttribute('title', title);
    }
    try {
      applySiteTitleSignature(localStorage.getItem(SITE_TITLE_CACHE_KEY) || '');
    } catch (_siteTitleErr) {
      applySiteTitleSignature('Site');
    }

    var token = String(localStorage.getItem('session_token') || '').trim();
    var hasToken = !!token && token !== 'null' && token !== 'undefined';
    var cachedPlayerName = String(localStorage.getItem('last_auth_player_name') || '').trim();
    var loginSplit = document.getElementById('nav-login-split');
    var userMenu = document.getElementById('nav-user-menu');
    var userName = document.getElementById('nav-user-name');
    var composeTools = document.getElementById('nav-compose-tools');
    var cachedIsAdmin = String(localStorage.getItem('last_auth_is_admin') || '') === '1';

    if (loginSplit) {
      loginSplit.style.display = 'none';
    }
    if (userMenu) {
      userMenu.style.display = 'none';
    }
    if (userName) {
      userName.style.display = 'none';
      userName.textContent = '';
      userName.setAttribute('href', '/admin#account');
    }

    if (hasToken) {
      if (composeTools) {
        composeTools.style.display = cachedIsAdmin ? 'inline-flex' : 'none';
      }
      if (userMenu) {
        userMenu.style.display = 'inline-flex';
      }
      if (userName) {
        userName.style.display = 'inline-block';
        userName.textContent = cachedPlayerName || 'signed-in';
        userName.setAttribute('aria-label', 'Open account settings');
        userName.setAttribute('href', '/admin#account');
      }
    } else if (loginSplit) {
      loginSplit.style.display = 'inline-flex';
    }
  } catch (_err) {
    // Ignore storage failures and let nav-auth.js reconcile state.
  }

  try {
    var navCenter = document.querySelector('.nav-center');
    var cachedRaw = localStorage.getItem('cached_navbar_pages_v1');
    if (navCenter && cachedRaw) {
      var cachedPages = JSON.parse(cachedRaw);
      if (!Array.isArray(cachedPages)) {
        cachedPages = [];
      }
      var basePages = [
        { slug: 'blog', title: 'Blog', path: '/' }
      ];
      var seen = {};
      var html = '';
      function esc(text) {
        return String(text || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }
      basePages.forEach(function (page) {
        seen[page.slug] = true;
        html += '<a href="' + esc(page.path) + '" data-page="' + esc(page.slug) + '">' + esc(page.title) + '</a>';
      });
      cachedPages.forEach(function (page) {
        var slug = String(page && page.slug || '').trim();
        var title = String(page && page.title || '').trim();
        var path = String(page && page.path || '').trim();
        if (!slug || !path || seen[slug]) {
          return;
        }
        seen[slug] = true;
        html += '<a href="' + esc(path) + '" data-page="' + esc(slug) + '">' + esc(title || slug) + '</a>';
      });
      if (html) {
        navCenter.innerHTML = html;
      }
    }
  } catch (_err2) {
    // Ignore cache parse failures and let runtime fetch reconcile state.
  }

  document.addEventListener('DOMContentLoaded', function () {
    var hasDynamicNostrPage = !!(
      document.getElementById('blog-page-root') ||
      document.getElementById('nip23-page-root') ||
      document.getElementById('list-page-root') ||
      document.getElementById('public-ranking-root') ||
      document.getElementById('contact-page-root') ||
      document.getElementById('search-page-root') ||
      document.getElementById('admin-panel')
    );
    if (hasDynamicNostrPage) {
      return;
    }
    var gate = window.__wizardryHydration;
    if (gate && typeof gate.markPageReady === 'function') {
      gate.markPageReady();
    }
  });
})();
</script>

<div id="nav-top-toast-host" class="nav-top-toast-host" aria-live="polite" aria-atomic="true"></div>
<aside id="nav-cart-drawer" class="nav-cart-drawer" hidden>
  <div class="nav-cart-drawer-head">
    <h2>Shopping Cart</h2>
    <button id="nav-cart-close" type="button" aria-label="Close cart">&times;</button>
  </div>
  <p id="nav-cart-empty" class="nav-cart-empty">Your cart is empty.</p>
  <ul id="nav-cart-items" class="nav-cart-items"></ul>
  <div class="nav-cart-drawer-footer">
    <div class="nav-cart-subtotal-row"><span>Subtotal</span><strong id="nav-cart-subtotal">$0.00</strong></div>
    <div class="nav-cart-drawer-links">
      <a href="/cart" class="nav-cart-link-button">View Cart</a>
      <a href="/checkout" class="nav-cart-link-button nav-cart-link-button-primary">Checkout</a>
    </div>
  </div>
</aside>

<div class="auth-modal" id="auth-modal" hidden>
  <div class="auth-modal-backdrop" data-close-auth-modal></div>
  <div class="auth-modal-panel" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
    <button class="auth-modal-close" type="button" aria-label="Close login" data-close-auth-modal>&times;</button>
    <div class="auth-modal-scroll">
    <h2 id="auth-modal-title">Sign in</h2>
    <p class="auth-modal-help">Choose where your signer lives. The site never asks for a private key.</p>
    <p class="auth-modal-help">Your account identity is your Nostr public key. Sign-in verifies a signed event from your browser extension, phone signer, or remote signer.</p>

    <div class="auth-platform-grid" role="list" aria-label="Signer platform">
      <button id="auth-tab-register" class="auth-platform-card is-active" type="button" data-auth-route="register" data-auth-flavor="desktop" aria-pressed="true">
        <span class="auth-platform-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M5 6.5h14v9H5z"></path>
            <path d="M9 19h6"></path>
            <path d="M12 15.5V19"></path>
          </svg>
        </span>
        <span class="auth-platform-copy"><strong>Desktop</strong></span>
      </button>
      <button id="auth-tab-phone" class="auth-platform-card" type="button" data-auth-route="phone" data-auth-flavor="android" aria-pressed="false">
        <span class="auth-platform-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M7 9.5h10v7.5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"></path>
            <path d="M8.5 7 6.8 5.3"></path>
            <path d="M15.5 7l1.7-1.7"></path>
            <path d="M9 13h.01"></path>
            <path d="M15 13h.01"></path>
          </svg>
        </span>
        <span class="auth-platform-copy"><strong>Android</strong></span>
      </button>
      <button class="auth-platform-card" type="button" data-auth-route="phone" data-auth-flavor="ios" aria-pressed="false">
        <span class="auth-platform-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M9 3.5h6a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"></path>
            <path d="M11 6h2"></path>
            <path d="M12 17.8h.01"></path>
          </svg>
        </span>
        <span class="auth-platform-copy"><strong>iPhone</strong></span>
      </button>
      <button class="auth-platform-card" type="button" data-auth-route="phone" data-auth-flavor="remote" aria-pressed="false">
        <span class="auth-platform-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M7 7.5h10"></path>
            <path d="M7 16.5h10"></path>
            <path d="M8 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"></path>
            <path d="M16 14a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"></path>
          </svg>
        </span>
        <span class="auth-platform-copy"><strong>Remote Signer</strong></span>
      </button>
    </div>
    <button id="auth-tab-manual" class="auth-advanced-toggle" type="button" data-auth-route="manual" data-auth-flavor="manual" aria-pressed="false">Advanced...</button>

    <div class="auth-tab-frame">
      <div id="auth-register-panel" class="auth-panel" role="tabpanel" aria-labelledby="auth-tab-register">
        <p class="auth-modal-help">Recommended: Firefox with nos2x-fox. Browser sign-in uses a NIP-07 extension.</p>
        <div class="auth-actions">
          <button id="auth-register-btn" class="auth-primary-btn" type="button">Continue with browser signer</button>
          <span class="auth-action-reco">Recommended: <a class="auth-inline-link" href="https://addons.mozilla.org/en-US/firefox/addon/nos2x-fox/" target="_blank" rel="noopener noreferrer">nos2x-fox</a></span>
        </div>
      </div>

      <div id="auth-phone-panel" class="auth-panel" role="tabpanel" aria-labelledby="auth-tab-phone" hidden>
        <div id="auth-nip46-qr" class="auth-qr" aria-label="Nostr Connect QR code"></div>
        <div class="auth-nip46-link-actions">
          <a id="auth-nip46-open" class="auth-secondary-btn auth-nip46-open-link" href="#">Connect Nostr</a>
          <button id="auth-nip46-uri-copy" class="machine-string-copy" type="button" aria-label="Copy Nostr Connect link">
            <svg class="machine-copy-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M8 7.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z"></path>
              <path d="M5 15.5V5.75A2.75 2.75 0 0 1 7.75 3H15"></path>
            </svg>
          </button>
        </div>
        <p class="auth-nip46-uri" id="auth-nip46-uri" hidden></p>
        <p class="auth-nip46-diagnostics" id="auth-nip46-diagnostics" aria-live="polite"></p>
        <div class="auth-actions">
          <button id="auth-phone-btn" class="auth-primary-btn" type="button" disabled hidden>Finish sign-in</button>
        </div>
      </div>

      <div id="auth-manual-panel" class="auth-panel" role="tabpanel" aria-labelledby="auth-tab-manual" hidden>
        <p class="auth-modal-help">Manual fallback: sign the challenge event outside this page and paste signed JSON.</p>
        <div class="auth-actions">
          <button id="auth-manual-start" class="auth-secondary-btn" type="button">Create challenge</button>
        </div>
        <div class="auth-manual-grid">
          <label for="auth-manual-request-id"><strong>Request ID</strong></label>
          <input class="auth-input" id="auth-manual-request-id" type="text" readonly>
          <label for="auth-manual-challenge"><strong>Challenge</strong></label>
          <input class="auth-input" id="auth-manual-challenge" type="text" readonly>
          <label for="auth-manual-expires"><strong>Expires At (epoch)</strong></label>
          <input class="auth-input" id="auth-manual-expires" type="text" readonly>
        </div>
        <label for="auth-manual-template"><strong>Unsigned Auth Event Template</strong></label>
        <textarea id="auth-manual-template" class="auth-input auth-key-input" readonly></textarea>
        <label for="auth-manual-event"><strong>Signed Auth Event JSON</strong></label>
        <textarea id="auth-manual-event" class="auth-input auth-key-input" placeholder='{"kind":22242,...,"sig":"..."}'></textarea>
        <div class="auth-actions">
          <button id="auth-manual-submit" class="auth-primary-btn" type="button">Submit signed login</button>
        </div>
      </div>
    </div>

    <div id="auth-modal-message" class="auth-modal-message" aria-live="polite"></div>

    <section class="auth-recommended-apps auth-reco-card" aria-labelledby="auth-reco-title">
      <h3 id="auth-reco-title">
        <span class="auth-apps-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <rect x="4" y="4" width="6.2" height="6.2" rx="1.35"></rect>
            <rect x="13.8" y="4" width="6.2" height="6.2" rx="1.35"></rect>
            <rect x="4" y="13.8" width="6.2" height="6.2" rx="1.35"></rect>
            <rect x="13.8" y="13.8" width="6.2" height="6.2" rx="1.35"></rect>
          </svg>
        </span>
        <span>Recommended Apps</span>
      </h3>
      <div class="auth-reco-group auth-login-onboarding">
        <p id="auth-login-summary" class="auth-reco-summary"></p>
        <p id="auth-login-note" class="auth-reco-note"></p>
        <ul id="auth-login-apps" class="auth-reco-apps"></ul>
      </div>
      <div class="auth-reco-group auth-zap-onboarding">
        <p id="auth-zap-summary" class="auth-reco-summary auth-zap-summary"></p>
        <p id="auth-zap-note" class="auth-reco-note auth-zap-note"></p>
        <ul id="auth-zap-apps" class="auth-reco-apps auth-zap-apps"></ul>
      </div>
      <p class="auth-zap-updated">Recommendations Updated May 2026</p>
    </section>
    </div>
  </div>
</div>

<script src="/static/nav-auth.js?v=20260430-signin-learn1"></script>
<script src="/static/shop-cart.js?v=20260324-cartv3"></script>
<script async src="https://cdn.jsdelivr.net/npm/nostr-tools@2.7.2/lib/nostr.bundle.js"></script>
<script async src="https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js"></script>
