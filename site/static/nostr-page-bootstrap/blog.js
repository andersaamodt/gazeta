(function () {
  window.__wizardryNostrPageBootstrap = window.__wizardryNostrPageBootstrap || {};
  var slug = "blog";
  var payload = 
{"success":true,"slug":"blog","page_type":"blog","nav_title":"Blog","kind":30023,"is_admin":false,"view_mode":"canonical","canonical_exists":false,"draft_exists":false,"draft_differs":false,"state":{"slug":"blog","type":"blog","title":"Blog","content":"","product_enabled":false,"product_type":"software","price":"","currency":"USD","crypto_discount_percent":0,"purchase_endpoint":"/purchase/blog","repo":"","tag":"latest","extras_after":"","extras_after_format":"markdown","default_tag":""},"canonical_state":{"slug":"blog","type":"blog","title":"Blog","content":"","product_enabled":false,"product_type":"software","price":"","currency":"USD","crypto_discount_percent":0,"purchase_endpoint":"/purchase/blog","repo":"","tag":"latest","extras_after":"","extras_after_format":"markdown","default_tag":""},"canonical_event":null,"zap_config":{"enabled":true,"lud16":"zap@andersaamodt.com","lud16_source":"configured","default_amount_sats":1000,"demo_wallet_available":false,"relays":[]},"validation":{"errors":[],"warnings":[],"can_publish":true},"bootstrap_posts":[]};
  window.__wizardryNostrPageBootstrap[slug] = payload;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function markdownInline(value) {
    var text = escapeHtml(value || '');
    return text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  }

  function voteArrow(direction) {
    var path = String(direction || '') === 'down'
      ? 'M12 20 4.5 10.8h4.25V4h6.5v6.8h4.25L12 20Z'
      : 'M12 4 19.5 13.2h-4.25V20h-6.5v-6.8H4.5L12 4Z';
    return '<svg class="list-entry-vote-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + path + '" fill="currentColor"/></svg>';
  }

  function overflowMenuIcon() {
    return '<svg class="overflow-menu-icon-svg" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="5.5" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="18.5" r="1.9" fill="currentColor"/></svg>';
  }

  function hasLikelyAuthenticatedSession() {
    try {
      return !!(localStorage.getItem('session_token') && localStorage.getItem('csrf_token'));
    } catch (_err) {
      return false;
    }
  }

  function paintListFirstFrame() {
    if (!payload || !payload.state || (payload.page_type !== 'list' && payload.page_type !== 'icon-gallery')) {
      return false;
    }
    var root = document.getElementById('list-page-root') || document.getElementById('icon-gallery-root');
    if (!root) {
      return false;
    }
    var content = document.getElementById('list-page-content');
    if (!content || content.children.length) {
      return false;
    }
    var state = payload.state || {};
    var elements = Array.isArray(state.elements) ? state.elements : (Array.isArray(state.entries) ? state.entries : []);
    var allowSubmissions = !!state.allow_signed_in_submissions;
    var allowVotes = !!state.allow_signed_in_votes;
    var signedIn = hasLikelyAuthenticatedSession();
    var html = '';
    if (allowSubmissions) {
      html += '<section class="list-public-submit" aria-label="Add list entry"><div class="list-public-submit-inline"><input type="text" id="list-public-submit-title" placeholder="New entry"><button type="button" class="list-admin-primary-btn list-public-submit-add" data-list-public-action="submit">Add</button></div></section>';
    }
    if (elements.length) {
      html += '<ul class="list-entries">';
      elements.forEach(function (entry) {
        var line = String(entry && entry.markdown || '').trim();
        if (!line) {
          return;
        }
        var entryId = String(entry && entry._list_entry_id || '');
        var voteControls = '';
        if (allowVotes && entryId) {
          var viewerVote = Number(entry && entry.viewer_vote || 0) || 0;
          var viewerCanVoteNow = !entry || entry.viewer_can_vote_now !== false;
          var upvoteClass = 'list-entry-vote-btn is-upvote' + (viewerVote > 0 ? (viewerCanVoteNow ? ' is-stale' : ' is-active') : '');
          var downvoteClass = 'list-entry-vote-btn is-downvote' + (viewerVote < 0 ? (viewerCanVoteNow ? ' is-stale' : ' is-active') : '');
          voteControls = '<span class="list-entry-vote-controls" data-list-entry-id="' + escapeHtml(entryId) + '" aria-label="Entry score">' +
            '<button type="button" class="' + upvoteClass + '" data-list-public-action="vote" data-list-entry-id="' + escapeHtml(entryId) + '" data-list-vote-value="1" aria-label="Upvote" title="Upvote">' + voteArrow('up') + '</button>' +
            '<span class="list-entry-score" title="Score">' + escapeHtml(String(Number(entry && entry.list_score || 0) || 0)) + '</span>' +
            '<button type="button" class="' + downvoteClass + '" data-list-public-action="vote" data-list-entry-id="' + escapeHtml(entryId) + '" data-list-vote-value="-1" aria-label="Downvote" title="Downvote">' + voteArrow('down') + '</button>' +
          '</span>';
        }
        var rightMeta = '';
        if (signedIn) {
          var menuUid = String(entry && (entry._public_entry_id || entry._list_entry_id) || '');
          if (menuUid) {
            rightMeta = '<span class="list-entry-meta-right"><span class="list-entry-read-menu list-inline-row-menu-wrap"><button type="button" class="list-inline-row-menu-trigger" data-list-read-action="toggle-menu" data-element-uid="' + escapeHtml(menuUid) + '" aria-label="Row actions" aria-haspopup="menu" aria-expanded="false">' + overflowMenuIcon() + '</button></span></span>';
          }
        }
        html += '<li class="list-entry-line"><div class="list-entry-first-line' + (voteControls ? ' has-votes' : '') + '">' + voteControls + '<span class="list-entry-main-inline"><span class="list-entry-markdown">' + markdownInline(line) + '</span></span>' + rightMeta + '</div></li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="list-page-empty-state">No content yet.</p>';
    }
    content.innerHTML = html;
    root.classList.remove('is-loading');
    root.setAttribute('data-prerender-painted', 'true');
    try {
      window.__wizardryPageInitialContentReady = true;
      window.dispatchEvent(new CustomEvent('blog-page-initial-content-ready', { detail: { slug: slug, prerendered: true } }));
    } catch (_err) {}
    try {
      var gate = window.__wizardryHydration;
      if (gate && typeof gate.markPageReady === 'function') {
        gate.markPageReady();
      }
    } catch (_gateErr) {}
    return true;
  }

  if (document.getElementById('list-page-root') || document.getElementById('icon-gallery-root')) {
    paintListFirstFrame();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paintListFirstFrame, { once: true });
  } else {
    paintListFirstFrame();
  }
})();
