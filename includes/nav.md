<a class="skip-link" href="#main-content">Skip to content</a>
<nav class="site-nav">
<div class="nav-center">
<a href="/pages/index.html" data-page="index">Home</a>
<a href="/pages/about.html" data-page="about">About</a>
<a href="/pages/oeuvre.html" data-page="oeuvre">Oeuvre</a>
<a href="/pages/archive.html" data-page="archive">Archive</a>
<a href="/pages/tags.html" data-page="tags">Categories</a>
</div>
<div class="nav-right">
<form class="nav-search" method="get" action="/cgi/blog-search">
<input type="text" name="q" placeholder="Search..." />
<button type="submit" aria-label="Search">
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.5"/>
<path d="M11 11L14.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
</button>
</form>
<div class="nav-compose-tools" id="nav-compose-tools" style="display:none;">
<a href="/pages/admin.html#compose" class="nav-compose nav-compose-icon" aria-label="Compose post" title="Compose post">
<!-- Icon is replaced by nav-auth.js -->
<svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4"/>
</svg>
</a>
</div>
<span id="nav-user-name" class="nav-username" style="display:none;"></span>
<div class="nav-user-menu" id="nav-user-menu" style="display:none;">
  <button class="nav-menu-btn" id="nav-menu-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="User menu">...</button>
  <div class="nav-menu-panel" id="nav-menu-panel" role="menu" hidden>
    <a id="nav-menu-primary-link" class="nav-menu-item" href="/pages/admin.html" role="menuitem">Admin</a>
    <button id="nav-menu-logout-everywhere" class="nav-menu-item" type="button" role="menuitem" style="display:none;">Log out other sessions</button>
    <button id="nav-menu-logout" class="nav-menu-item nav-menu-item-danger" type="button" role="menuitem">Logout</button>
  </div>
</div>
<div class="nav-login-split" id="nav-login-split" style="display:none;">
  <button class="btn-login btn-login-main" id="login-btn" type="button">Login</button>
  <button class="btn-login btn-login-caret" id="login-more-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="More login options">▼</button>
  <div class="nav-login-menu" id="nav-login-menu" role="menu" hidden>
    <button id="login-menu-register" class="nav-menu-item" type="button" role="menuitem">Register...</button>
    <button id="login-menu-phone" class="nav-menu-item" type="button" role="menuitem">Use phone signer (QR)</button>
    <button id="login-menu-manual" class="nav-menu-item" type="button" role="menuitem">Use signed challenge (manual)</button>
    <button id="login-menu-learn" class="nav-menu-item" type="button" role="menuitem">Learn about Nostr sign-in</button>
  </div>
</div>
</div>
</nav>
<script>
(function () {
  try {
    var token = localStorage.getItem('session_token') || '';
    var cachedName = localStorage.getItem('last_auth_username') || '';
    var loginSplit = document.getElementById('nav-login-split');
    var userMenu = document.getElementById('nav-user-menu');
    var userName = document.getElementById('nav-user-name');
    if (token) {
      if (loginSplit) {
        loginSplit.style.display = 'none';
      }
      if (userMenu) {
        userMenu.style.display = 'inline-flex';
      }
      if (userName) {
        userName.style.display = 'inline-block';
        userName.textContent = cachedName || 'signed-in';
      }
      return;
    }
    if (loginSplit) {
      loginSplit.style.display = 'inline-flex';
    }
    if (userMenu) {
      userMenu.style.display = 'none';
    }
    if (userName) {
      userName.style.display = 'none';
      userName.textContent = '';
    }
  } catch (_err) {
    // Ignore storage access issues and let nav-auth.js reconcile state.
  }
})();
</script>

<div id="nav-top-toast-host" class="nav-top-toast-host" aria-live="polite" aria-atomic="true"></div>

<div class="auth-modal" id="auth-modal" hidden>
  <div class="auth-modal-backdrop" data-close-auth-modal></div>
  <div class="auth-modal-panel" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
    <button class="auth-modal-close" type="button" aria-label="Close login" data-close-auth-modal>&times;</button>
    <div class="auth-modal-scroll">
    <h2 id="auth-modal-title">Sign in</h2>
    <p class="auth-modal-help">Accounts are Nostr-key based only. No email, password, or recovery. If your Nostr key is lost, the account is lost by design.</p>
    <p class="auth-modal-help">Desktop login uses NIP-07 when available. Phone login uses NIP-46 pairing via QR/deep-link.</p>

    <div class="auth-tabs" role="tablist" aria-label="Sign-in methods">
      <button id="auth-tab-register" class="auth-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="auth-register-panel">Register</button>
      <button id="auth-tab-phone" class="auth-tab" type="button" role="tab" aria-selected="false" aria-controls="auth-phone-panel">Phone signer</button>
      <button id="auth-tab-manual" class="auth-tab" type="button" role="tab" aria-selected="false" aria-controls="auth-manual-panel">Signed challenge</button>
    </div>

    <div id="auth-modal-message" class="auth-modal-message" aria-live="polite"></div>

    <div class="auth-tab-frame">
      <div id="auth-register-panel" class="auth-panel" role="tabpanel" aria-labelledby="auth-tab-register">
        <p class="auth-modal-help">Accounts are created on first successful signer approval and are permanently tied to that Nostr key.</p>
        <label for="auth-register-username"><strong>Username</strong></label>
        <input id="auth-register-username" class="auth-input auth-username-input" type="text" maxlength="24" autocomplete="username" placeholder="optional (letters, numbers, ., _, -)">
        <p class="auth-modal-help">Login is tied to your Nostr key, not your username. Usernames must be unique.</p>
        <div class="auth-actions">
          <button id="auth-register-btn" class="auth-primary-btn" type="button">Register with desktop signer</button>
          <span class="auth-action-reco">Recommended: <a class="auth-inline-link" href="https://addons.mozilla.org/en-US/firefox/addon/nos2x-fox/" target="_blank" rel="noopener noreferrer">nos2x-fox</a></span>
        </div>
      </div>

      <div id="auth-phone-panel" class="auth-panel" role="tabpanel" aria-labelledby="auth-tab-phone" hidden>
        <p class="auth-modal-help">Scan this with your phone signer app (Nostr Connect / NIP-46), or open via deep link.</p>
        <div id="auth-nip46-qr" class="auth-qr" aria-label="Nostr Connect QR code"></div>
        <a id="auth-nip46-open" class="auth-inline-link" href="#" target="_blank" rel="noopener noreferrer">Open nostrconnect:// link</a>
        <p class="auth-nip46-uri" id="auth-nip46-uri"></p>
        <div class="auth-actions">
          <button id="auth-phone-connect-btn" class="auth-secondary-btn" type="button">Connect phone signer (QR)</button>
          <button id="auth-phone-btn" class="auth-primary-btn" type="button" disabled>Continue with phone signer</button>
        </div>
        <p class="auth-action-reco">Recommended: <a class="auth-inline-link" href="https://play.google.com/store/apps/details?id=com.vitorpamplona.amethyst" target="_blank" rel="noopener noreferrer">Amethyst</a></p>
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
    </div>
  </div>
</div>

<div class="auth-modal" id="nostr-info-modal" hidden>
  <div class="auth-modal-backdrop" data-close-auth-info></div>
  <div class="auth-modal-panel auth-info-modal-panel" role="dialog" aria-modal="true" aria-labelledby="nostr-info-modal-title">
    <button class="auth-modal-close" type="button" aria-label="Close Nostr info" data-close-auth-info>&times;</button>
    <div class="auth-modal-scroll">
    <h2 id="nostr-info-modal-title">Nostr Sign-In</h2>
    <p class="auth-modal-help">Your account identity is your Nostr public key. The site verifies signed events and never asks for private keys.</p>
    <p class="auth-modal-help">Desktop sign-in uses a NIP-07 extension. Phone sign-in uses Nostr Connect (NIP-46) pairing via QR/deep link.</p>
    <p class="auth-modal-help">For full details, visit <a class="auth-inline-link" href="https://github.com/nostr-protocol/nips" target="_blank" rel="noopener noreferrer">the official Nostr NIPs repository</a>.</p>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/nostr-tools@2.7.2/lib/nostr.bundle.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js"></script>
<script src="/static/nav-auth.js?v=20260227-logintabs2"></script>
