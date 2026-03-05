(function () {
  var currentRelPath = '';
  var currentNostrAddress = '';
  var currentNostrEventId = '';
  var refreshInFlight = false;
  var submitInFlight = false;

  function isPostPage(pathname) {
    var path = String(pathname || '');
    if (/^\/pages\/posts\/.+\.html$/.test(path)) {
      return true;
    }
    if (path === '/cgi/blog-open-post') {
      return true;
    }
    return false;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureMeta(name, value, attrType) {
    if (!value) {
      return;
    }
    var selector = attrType === 'property'
      ? 'meta[property="' + name + '"]'
      : 'meta[name="' + name + '"]';
    var node = document.querySelector(selector);
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute(attrType === 'property' ? 'property' : 'name', name);
      document.head.appendChild(node);
    }
    node.setAttribute('content', value);
  }

  function renderTags(tags) {
    var clean = Array.isArray(tags) ? tags : [];
    if (!clean.length) {
      return '';
    }
    var chips = clean.map(function (tag) {
      var t = String(tag || '').trim();
      if (!t) {
        return '';
      }
      return '<a class="tag" href="/pages/tags.html#' + encodeURIComponent(t) + '">' + escapeHtml(t) + '</a>';
    }).filter(Boolean);
    if (!chips.length) {
      return '';
    }
    return '<div class="tags post-context-tags">' + chips.join('') + '</div>';
  }

  function renderPostMeta(current) {
    var summary = current.summary ? '<p class="post-context-summary">' + escapeHtml(current.summary) + '</p>' : '';
    var author = current.author ? '<span class="post-context-author">' + escapeHtml(current.author) + '</span>' : '';
    var detail = [
      author,
      author ? '<span aria-hidden="true">•</span>' : '',
      '<span class="post-context-date">' + escapeHtml(current.published_date || '') + '</span>',
      '<span aria-hidden="true">•</span>',
      '<span class="post-context-reading">' + escapeHtml(String(current.reading_minutes || 1)) + ' min read</span>',
      '<span aria-hidden="true">•</span>',
      '<span class="post-context-words">' + escapeHtml(String(current.word_count || 0)) + ' words</span>'
    ].join(' ');

    return '<section class="post-context-card">' +
      '<div class="post-context-detail">' + detail + '</div>' +
      summary +
      '</section>';
  }

  function ensureSinglePostCard(current) {
    var root = document.body;
    if (!root) {
      return null;
    }
    var existingCard = root.querySelector('.post-single-item');
    if (existingCard) {
      return {
        anchor: root,
        card: existingCard,
        body: existingCard.querySelector('.post-single-body') || existingCard
      };
    }

    var heading = document.querySelector('h1.title, h1');
    var footer = document.querySelector('.site-footer');
    var nav = document.querySelector('.site-nav');

    var card = document.createElement('article');
    card.className = 'post-item post-single-item';

    var head = document.createElement('div');
    head.className = 'post-head';
    head.innerHTML =
      '<div class="post-head-main">' +
      '<h1 id="main-content" class="post-title">' + escapeHtml(current.title || document.title || 'Untitled') + '</h1>' +
      '<div class="post-author">' + escapeHtml(current.author || 'Blog Author') + '</div>' +
      '</div>' +
      '<div class="post-meta"><span class="post-date">' + escapeHtml(current.published_date || '') + '</span> <span aria-hidden="true">•</span> <span class="post-context-reading">' + escapeHtml(String(current.reading_minutes || 1)) + ' min read</span></div>';

    var body = document.createElement('div');
    body.className = 'post-single-body';

    var node = nav ? nav.nextSibling : root.firstChild;
    while (node && node !== footer) {
      var next = node.nextSibling;
      if (!(node.nodeType === 1 && node.classList && node.classList.contains('site-footer'))) {
        body.appendChild(node);
      }
      node = next;
    }

    var titleBlock = body.querySelector('#title-block-header');
    if (titleBlock) {
      titleBlock.remove();
    }

    if (heading && heading.parentNode && heading.parentNode !== card && heading.parentNode !== body) {
      heading.remove();
    }

    Array.prototype.forEach.call(body.querySelectorAll('h1.title, p.author, p.date'), function (el) {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });

    card.appendChild(head);
    card.appendChild(body);
    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(card, footer);
    } else {
      root.appendChild(card);
    }

    return { anchor: root, card: card, body: body };
  }

  function renderNostrProof(nostr) {
    if (!nostr || !nostr.id) {
      return '';
    }
    return '<section class="post-nostr-proof">' +
      '<h3>Nostr Proof</h3>' +
      '<dl class="post-nostr-proof-list">' +
      '<div><dt>ID</dt><dd><code>' + escapeHtml(nostr.id || '') + '</code></dd></div>' +
      '<div><dt>Pubkey</dt><dd><code>' + escapeHtml(nostr.pubkey || '') + '</code></dd></div>' +
      '<div><dt>Kind</dt><dd><code>' + escapeHtml(String(nostr.kind || '')) + '</code></dd></div>' +
      '<div><dt>URI</dt><dd><code>' + escapeHtml(nostr.uri || '') + '</code></dd></div>' +
      '</dl>' +
      '</section>';
  }

  function renderPostEndTags(tags) {
    var content = renderTags(tags);
    if (!content) {
      return '';
    }
    return '<section class="post-end-tags">' +
      '<p class="post-end-tags-label">Tags</p>' +
      content +
      '</section>';
  }

  function navColumn(label, post, cls) {
    if (!post) {
      return '<div class="' + cls + '"><span class="post-nav-empty">' + escapeHtml(label) + ': none</span></div>';
    }
    return '<div class="' + cls + '">' +
      '<span class="post-nav-label">' + escapeHtml(label) + '</span>' +
      '<a href="' + escapeHtml(post.url || '#') + '">' + escapeHtml(post.title || 'Untitled') + '</a>' +
      '</div>';
  }

  function renderPostNav(payload) {
    return '<nav class="post-nav post-nav-enhanced" aria-label="Post navigation">' +
      navColumn('Newer', payload.newer, 'post-nav-prev') +
      navColumn('Older', payload.older, 'post-nav-next') +
      '</nav>';
  }

  function renderCommentRow(comment) {
    var created = comment.created_at_iso ? escapeHtml(comment.created_at_iso.replace('T', ' ').replace('Z', ' UTC')) : '';
    var pubkey = escapeHtml(String(comment.pubkey || '').slice(0, 16));
    var body = escapeHtml(comment.content || '').replace(/\n/g, '<br>');
    return '<article class="post-comment">' +
      '<header><span class="post-comment-author">' + pubkey + '</span>' + (created ? ' <span class="post-comment-time">' + created + '</span>' : '') + '</header>' +
      '<p>' + body + '</p>' +
      '</article>';
  }

  function renderComments(comments) {
    var list = Array.isArray(comments) ? comments : [];
    var container = document.getElementById('post-comments-list');
    if (!container) {
      return;
    }
    if (!list.length) {
      container.innerHTML = '<p class="placeholder">No comments mirrored yet.</p>';
      return;
    }
    container.innerHTML = list.map(renderCommentRow).join('');
  }

  function setCommentCount(count) {
    var badge = document.getElementById('post-comments-count');
    if (!badge) {
      return;
    }
    var n = Number(count || 0);
    if (!Number.isFinite(n) || n < 0) {
      n = 0;
    }
    badge.textContent = String(n);
  }

  function setCommentStatus(message, kind) {
    var status = document.getElementById('post-comments-status');
    if (!status) {
      return;
    }
    status.className = 'post-comments-status';
    if (kind) {
      status.classList.add('is-' + kind);
    }
    status.textContent = message || '';
  }

  function setRefreshBusy(isBusy) {
    refreshInFlight = !!isBusy;
    var button = document.getElementById('post-comments-refresh');
    if (!button) {
      return;
    }
    button.disabled = refreshInFlight;
    button.textContent = refreshInFlight ? 'Refreshing...' : 'Refresh comments';
  }

  function setSubmitBusy(isBusy) {
    submitInFlight = !!isBusy;
    var button = document.getElementById('post-comment-submit');
    if (!button) {
      return;
    }
    button.disabled = submitInFlight;
    button.textContent = submitInFlight ? 'Posting...' : 'Post comment';
  }

  function loadComments() {
    if (!currentRelPath) {
      return;
    }
    fetch('/cgi/blog-comments?path=' + encodeURIComponent(currentRelPath), { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success) {
          return;
        }
        var list = data.comments || [];
        renderComments(list);
        setCommentCount(list.length || 0);
        setCommentStatus('', '');
      })
      .catch(function () {
        setCommentStatus('Failed to load mirrored comments.', 'warn');
      });
  }

  function refreshComments() {
    if (refreshInFlight) {
      return;
    }
    if (!currentRelPath) {
      return;
    }
    setRefreshBusy(true);
    setCommentStatus('Refreshing comments from relays...', 'info');
    fetch('/cgi/blog-refresh-comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'path=' + encodeURIComponent(currentRelPath),
      credentials: 'same-origin'
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success) {
          var msg = (data && data.error) ? data.error : 'Comment refresh failed.';
          setCommentStatus(msg, 'warn');
          return;
        }
        loadComments();
        setCommentStatus('Comments refreshed.', 'ok');
      })
      .catch(function () {
        setCommentStatus('Comment refresh failed.', 'warn');
      })
      .finally(function () {
        setRefreshBusy(false);
      });
  }

  function parseEventJson(raw) {
    try {
      return JSON.parse(String(raw || ''));
    } catch (_) {
      return null;
    }
  }

  function signCommentEvent(payload) {
    if (!window.nostr) {
      return Promise.reject(new Error('No browser Nostr signer detected. Install a NIP-07 extension.'));
    }
    if (typeof window.nostr.signEvent === 'function') {
      return Promise.resolve(window.nostr.signEvent(payload));
    }
    return Promise.reject(new Error('Browser signer does not expose signEvent.'));
  }

  function submitComment() {
    if (submitInFlight) {
      return;
    }
    var textarea = document.getElementById('post-comment-input');
    if (!textarea) {
      return;
    }
    var content = String(textarea.value || '').trim();
    if (!content) {
      setCommentStatus('Comment text is required.', 'warn');
      return;
    }
    if (!currentNostrAddress || !currentNostrEventId) {
      setCommentStatus('Post Nostr metadata is missing for comment submit.', 'warn');
      return;
    }
    var sessionToken = localStorage.getItem('session_token') || '';
    var csrfToken = localStorage.getItem('csrf_token') || '';
    if (!sessionToken || !csrfToken) {
      setCommentStatus('Sign in first to post comments.', 'warn');
      return;
    }

    var createdAt = Math.floor(Date.now() / 1000);
    var draftEvent = {
      kind: 1,
      created_at: createdAt,
      tags: [
        ['a', currentNostrAddress],
        ['e', currentNostrEventId, '', 'reply']
      ],
      content: content
    };

    setSubmitBusy(true);
    setCommentStatus('Signing comment event...', 'info');
    signCommentEvent(draftEvent)
      .then(function (signed) {
        var signedEvent = signed;
        if (typeof signedEvent === 'string') {
          signedEvent = parseEventJson(signedEvent);
        }
        if (!signedEvent || typeof signedEvent !== 'object') {
          throw new Error('Signer returned an invalid event payload.');
        }
        setCommentStatus('Submitting signed comment...', 'info');
        return fetch('/cgi/blog-submit-comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'session_token=' + encodeURIComponent(sessionToken) +
            '&csrf_token=' + encodeURIComponent(csrfToken) +
            '&path=' + encodeURIComponent(currentRelPath) +
            '&event_json=' + encodeURIComponent(JSON.stringify(signedEvent)),
          credentials: 'same-origin'
        });
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success) {
          var msg = (data && data.error) ? data.error : 'Comment submit failed.';
          throw new Error(msg);
        }
        textarea.value = '';
        setCommentStatus('Comment stored locally. Refreshing comments...', 'ok');
        loadComments();
      })
      .catch(function (err) {
        setCommentStatus(err.message || 'Comment submit failed.', 'warn');
      })
      .finally(function () {
        setSubmitBusy(false);
      });
  }

  function ensureCommentShell() {
    if (document.querySelector('.post-comments-shell')) {
      return;
    }
    var anchor = document.querySelector('#main-content') || document.body;
    anchor.insertAdjacentHTML('beforeend',
      '<section class="post-comments-shell">' +
      '<div class="post-comments-head">' +
      '<h3>Comments (<span id="post-comments-count">0</span>)</h3>' +
      '<button type="button" id="post-comments-refresh">Refresh comments</button>' +
      '</div>' +
      '<div class="post-comments-compose">' +
      '<textarea id="post-comment-input" rows="3" placeholder="Write a Nostr-signed reply..."></textarea>' +
      '<button type="button" id="post-comment-submit">Post comment</button>' +
      '</div>' +
      '<p class="post-comments-shortcut">Press Ctrl/Cmd + Enter to post quickly.</p>' +
      '<p id="post-comments-status" class="post-comments-status"></p>' +
      '<div id="post-comments-list" class="post-comments-list"><p class="placeholder">No comments mirrored yet.</p></div>' +
      '</section>'
    );
    var refreshButton = document.getElementById('post-comments-refresh');
    if (refreshButton) {
      refreshButton.addEventListener('click', refreshComments);
    }
    var submitButton = document.getElementById('post-comment-submit');
    if (submitButton) {
      submitButton.addEventListener('click', submitComment);
    }
    var input = document.getElementById('post-comment-input');
    if (input) {
      input.addEventListener('keydown', function (event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          submitComment();
        }
      });
    }
  }

  function applyEnhancements(payload) {
    if (!payload || !payload.current) {
      return;
    }

    var layout = ensureSinglePostCard(payload.current);
    if (!layout || !layout.body) {
      return;
    }

    if (!layout.body.querySelector('.post-end-tags')) {
      var tagsHtml = renderPostEndTags(payload.current.tags);
      if (tagsHtml) {
        layout.body.insertAdjacentHTML('beforeend', tagsHtml);
      }
    }

    if (!layout.body.querySelector('.post-nav-enhanced')) {
      layout.body.insertAdjacentHTML('beforeend', renderPostNav(payload));
    }

    if (payload.current.nostr && !document.querySelector('.post-nostr-proof')) {
      currentNostrAddress = payload.current.nostr.address || '';
      currentNostrEventId = payload.current.nostr.id || '';
      var proof = renderNostrProof(payload.current.nostr);
      if (proof) {
        var proofAnchor = document.querySelector('#main-content') || document.body;
        proofAnchor.insertAdjacentHTML('beforeend', proof);
      }
      ensureCommentShell();
      loadComments();
    }

    ensureMeta('description', payload.current.summary || '', 'name');
    ensureMeta('og:description', payload.current.summary || '', 'property');
    ensureMeta('article:published_time', payload.current.published_at || '', 'property');
    ensureMeta('twitter:description', payload.current.summary || '', 'name');
  }

  function loadPostContext() {
    if (!isPostPage(window.location.pathname)) {
      return;
    }
    if (window.location.pathname === '/cgi/blog-open-post') {
      var query = new URLSearchParams(window.location.search || '');
      currentRelPath = query.get('path') || '';
      currentRelPath = String(currentRelPath || '')
        .replace(/^https?:\/\/[^/]+\//, '')
        .replace(/^pages\/posts\//, '')
        .replace(/^posts\//, '');
    } else {
      currentRelPath = window.location.pathname.replace(/^\/pages\/posts\//, '');
    }
    if (!currentRelPath) {
      return;
    }
    fetch('/cgi/blog-post-context?path=' + encodeURIComponent(currentRelPath), { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success) {
          return;
        }
        applyEnhancements(data);
      })
      .catch(function () {
        // Post page should remain readable even if enhancement fetch fails.
      });
  }

  document.addEventListener('DOMContentLoaded', loadPostContext);
})();
