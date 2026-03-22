(function () {
  'use strict';

  var CACHE_KEY = 'wizardry_blog_posts_v2';
  var root = document.getElementById('blog-page-root');
  if (!root) {
    return;
  }

  var slug = String(root.getAttribute('data-blog-slug') || 'blog').trim() || 'blog';
  var els = {
    title: document.getElementById('blog-page-title'),
    description: document.getElementById('blog-page-description'),
    admin: document.getElementById('blog-page-admin'),
    validation: document.getElementById('blog-page-validation'),
    content: document.getElementById('blog-page-content'),
    toggle: document.getElementById('blog-filter-toggle'),
    panel: document.getElementById('blog-filter-panel'),
    tags: document.getElementById('blog-filter-tags'),
    years: document.getElementById('blog-filter-years'),
    types: document.getElementById('blog-filter-types'),
    clear: document.getElementById('blog-clear-filters'),
    list: document.getElementById('blog-post-list'),
    empty: document.getElementById('blog-empty')
  };

  var state = {
    payload: null,
    posts: [],
    initialContentPainted: false,
    initialPageStateLoaded: false,
    initialPostsLoaded: false,
    defaultFiltersApplied: false,
    filters: {
      tags: new Set(),
      years: new Set(),
      types: new Set()
    }
  };
  var panelHideTimer = null;

  function removeLegacyTitleBlock() {
    var prev = root.previousElementSibling;
    if (!prev || prev.tagName !== 'HEADER') {
      return;
    }
    if (!prev.querySelector || !prev.querySelector('.title')) {
      return;
    }
    if (prev.parentNode) {
      prev.parentNode.removeChild(prev);
    }
  }

  function markHydrationPageReady() {
    var gate = window.__wizardryHydration;
    if (gate && typeof gate.markPageReady === 'function') {
      gate.markPageReady();
    }
  }

  function markInitialContentPainted() {
    if (state.initialContentPainted) {
      return;
    }
    state.initialContentPainted = true;
    try {
      window.__wizardryPageInitialContentReady = true;
      window.dispatchEvent(new CustomEvent('blog-page-initial-content-ready', {
        detail: { slug: slug }
      }));
    } catch (_err) {
      // Ignore event dispatch failures.
    }
    markHydrationPageReady();
  }

  function maybeMarkInitialContentPainted() {
    if (state.initialPageStateLoaded && state.initialPostsLoaded) {
      markInitialContentPainted();
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function markdownInline(md) {
    var value = String(md || '');
    if (!value) {
      return '';
    }
    if (window.marked && typeof window.marked.parseInline === 'function') {
      return window.marked.parseInline(value);
    }
    return escapeHtml(value);
  }

  function markdownBlock(md) {
    var value = String(md || '');
    if (!value) {
      return '';
    }
    if (window.marked && typeof window.marked.parse === 'function') {
      return window.marked.parse(value);
    }
    return '<p>' + escapeHtml(value).replace(/\n/g, '<br>') + '</p>';
  }

  function titleizeSlug(value) {
    var text = String(value || '').trim().replace(/-/g, ' ');
    if (!text || text === 'index') {
      return 'Blog';
    }
    return text.split(/\s+/).map(function (word) {
      return word ? (word.charAt(0).toUpperCase() + word.slice(1)) : '';
    }).join(' ');
  }

  function normalizePageState(raw) {
    var src = raw || {};
    return {
      slug: String(src.slug || slug),
      title: String(src.title || ''),
      content: String(src.content || ''),
      default_tag: String(src.default_tag || '').trim(),
      extras_after: String(src.extras_after || ''),
      extras_after_format: String(src.extras_after_format || 'markdown').trim().toLowerCase() === 'html' ? 'html' : 'markdown'
    };
  }

  function getRenderState() {
    if (state.payload && state.payload.state) {
      return normalizePageState(state.payload.state);
    }
    return normalizePageState({ title: titleizeSlug(slug) });
  }

  function isAdmin() {
    return !!(state.payload && state.payload.is_admin);
  }

  function authPayload() {
    return {
      session_token: String(localStorage.getItem('session_token') || '').trim(),
      csrf_token: String(localStorage.getItem('csrf_token') || '').trim()
    };
  }

  function apiPost(url, payload) {
    var body = new URLSearchParams(payload || {});
    return fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (_err) {
          throw new Error('Invalid JSON response');
        }
        if (!res.ok || !data || data.success === false) {
          throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
        }
        return data;
      });
    });
  }

  function renderHead() {
    var page = getRenderState();
    var title = String(page.title || '').trim() || titleizeSlug(slug);
    document.title = title;
    if (els.title) {
      els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(title) + '</span><span id="blog-page-title-actions" class="list-page-title-actions"></span>';
    }
    if (!els.description) {
      return;
    }
    var text = String(page.content || '').trim();
    if (text) {
      els.description.innerHTML = '<span class="list-page-description-text">' + markdownInline(text) + '</span>';
      els.description.hidden = false;
    } else {
      els.description.innerHTML = '';
      els.description.hidden = true;
    }
  }

  function ensureFilterGutterLayout() {
    if (!root || !els.toggle) {
      return;
    }

    var layout = root.querySelector('.blog-layout');
    if (!layout) {
      layout = document.createElement('div');
      layout.className = 'blog-layout';
      while (root.firstChild) {
        layout.appendChild(root.firstChild);
      }
      root.appendChild(layout);
    }

    var filterCol = layout.querySelector('.blog-filter-column');
    if (!filterCol) {
      filterCol = document.createElement('div');
      filterCol.className = 'blog-filter-column';
      layout.insertBefore(filterCol, layout.firstChild);
    }

    var mainCol = layout.querySelector('.blog-main-column');
    if (!mainCol) {
      mainCol = document.createElement('div');
      mainCol.className = 'blog-main-column';
      var cursor = filterCol.nextSibling;
      while (cursor) {
        var next = cursor.nextSibling;
        mainCol.appendChild(cursor);
        cursor = next;
      }
      layout.appendChild(mainCol);
    }

    if (els.toggle.parentNode !== filterCol) {
      filterCol.appendChild(els.toggle);
    }
  }

  function renderValidation() {
    if (!els.validation) {
      return;
    }
    var validation = (state.payload && state.payload.validation) ? state.payload.validation : {};
    var errors = Array.isArray(validation.errors) ? validation.errors : [];
    var warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
    if (!isAdmin() || (!errors.length && !warnings.length)) {
      els.validation.hidden = true;
      els.validation.innerHTML = '';
      return;
    }
    var html = '';
    if (errors.length) {
      html += '<div class="list-validation-block is-error"><strong>Validation errors</strong><ul>';
      errors.forEach(function (msg) {
        html += '<li>' + escapeHtml(msg) + '</li>';
      });
      html += '</ul></div>';
    }
    if (warnings.length) {
      html += '<div class="list-validation-block is-warn"><strong>Validation warnings</strong><ul>';
      warnings.forEach(function (msg) {
        html += '<li>' + escapeHtml(msg) + '</li>';
      });
      html += '</ul></div>';
    }
    els.validation.hidden = false;
    els.validation.innerHTML = html;
  }

  function openAdminPage() {
    window.location.href = '/pages/admin.html#nostr-pages';
  }

  function renderAdmin() {
    var actionsHost = document.getElementById('blog-page-title-actions');
    if (actionsHost) {
      actionsHost.innerHTML = '';
    }
    if (!els.admin) {
      return;
    }
    if (!isAdmin()) {
      els.admin.hidden = true;
      els.admin.innerHTML = '';
      return;
    }
    if (actionsHost) {
      actionsHost.innerHTML = '<span class="list-page-admin-bar"><button type="button" class="list-admin-primary-btn" data-blog-action="open-admin">Edit</button></span>';
    }
    els.admin.hidden = true;
    els.admin.innerHTML = '';
  }

  function renderExtrasAfter() {
    if (!els.content) {
      return;
    }
    var page = getRenderState();
    var after = String(page.extras_after || '').trim();
    if (!after) {
      els.content.hidden = true;
      els.content.innerHTML = '';
      return;
    }
    els.content.hidden = false;
    els.content.innerHTML = markdownBlock(after);
  }

  function formatType(value) {
    var raw = String(value || '').trim();
    if (!raw) {
      return 'Post';
    }
    return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  function matchFacet(set, value) {
    if (!set || !set.size) {
      return true;
    }
    return set.has(String(value || ''));
  }

  function matchTags(postTags) {
    if (!state.filters.tags.size) {
      return true;
    }
    var tags = Array.isArray(postTags) ? postTags : [];
    for (var i = 0; i < tags.length; i += 1) {
      if (state.filters.tags.has(String(tags[i]))) {
        return true;
      }
    }
    return false;
  }

  function filteredPosts() {
    return state.posts.filter(function (post) {
      return matchTags(post.tags) &&
        matchFacet(state.filters.years, post.year) &&
        matchFacet(state.filters.types, post.type);
    });
  }

  function filterButtonHtml(group, value, label, isActive) {
    return '<button type="button" class="blog-filter-chip' + (isActive ? ' is-active' : '') + '" data-filter-group="' + escapeHtml(group) + '" data-filter-value="' + escapeHtml(value) + '" aria-pressed="' + (isActive ? 'true' : 'false') + '">' + escapeHtml(label) + '</button>';
  }

  function uniqueSorted(items, compareFn) {
    var map = {};
    items.forEach(function (item) {
      var key = String(item || '');
      if (!key) {
        return;
      }
      map[key] = true;
    });
    var out = Object.keys(map);
    out.sort(compareFn);
    return out;
  }

  function renderFilters() {
    if (!els.tags || !els.years || !els.types) {
      return;
    }

    var tags = uniqueSorted(state.posts.reduce(function (acc, post) {
      return acc.concat(Array.isArray(post.tags) ? post.tags : []);
    }, []), function (a, b) {
      return a.localeCompare(b);
    });

    var years = uniqueSorted(state.posts.map(function (post) {
      return post.year || '';
    }), function (a, b) {
      var an = Number(a);
      var bn = Number(b);
      if (isFinite(an) && isFinite(bn)) {
        return bn - an;
      }
      return a.localeCompare(b);
    });

    var types = uniqueSorted(state.posts.map(function (post) {
      return post.type || 'post';
    }), function (a, b) {
      return formatType(a).localeCompare(formatType(b));
    });

    els.tags.innerHTML = tags.map(function (tag) {
      return filterButtonHtml('tags', tag, tag, state.filters.tags.has(tag));
    }).join('');

    els.years.innerHTML = years.map(function (year) {
      return filterButtonHtml('years', year, year, state.filters.years.has(year));
    }).join('');

    els.types.innerHTML = types.map(function (type) {
      return filterButtonHtml('types', type, formatType(type), state.filters.types.has(type));
    }).join('');
  }

  function renderList() {
    if (!els.list || !els.empty) {
      return;
    }
    var shown = filteredPosts();

    if (!shown.length) {
      els.list.innerHTML = '';
      els.empty.hidden = false;
      return;
    }

    els.empty.hidden = true;
    els.list.innerHTML = shown.map(function (post) {
      var tagsHtml = (post.tags || []).map(function (tag) {
        return '<button type="button" class="tag blog-inline-tag" data-inline-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button>';
      }).join('');
      var comments = Number(post.comment_count || 0);
      var commentsLabel = comments === 1 ? '1 comment' : String(comments) + ' comments';
      var author = String(post.author || '').trim();
      if (!author) {
        author = 'Blog Author';
      }

      return '' +
        '<article class="post-item blog-post-item">' +
          '<div class="post-head">' +
            '<div class="post-head-main">' +
              '<h2 class="post-title"><a href="' + escapeHtml(post.url || '#') + '">' + escapeHtml(post.title || 'Untitled') + '</a></h2>' +
              '<div class="post-author">' + escapeHtml(author) + '</div>' +
            '</div>' +
            '<div class="post-meta"><span class="post-date">' + escapeHtml(post.pub_date || 'Unknown date') + '</span> <span class="post-comments-count">' + escapeHtml(commentsLabel) + '</span></div>' +
          '</div>' +
          (post.summary ? '<p class="post-summary">' + escapeHtml(post.summary) + '</p>' : '') +
          '<div class="blog-meta-row"><span class="blog-type-pill">' + escapeHtml(formatType(post.type)) + '</span> <span class="blog-year-pill">' + escapeHtml(post.year || 'Unknown') + '</span></div>' +
          (tagsHtml ? '<div class="tags">' + tagsHtml + '</div>' : '') +
        '</article>';
    }).join('');
  }

  function renderAll() {
    renderHead();
    renderAdmin();
    renderValidation();
    renderExtrasAfter();
    renderFilters();
    renderList();
  }

  function toggleFilter(group, value, multi) {
    var key = String(group || '');
    var target = state.filters[key];
    if (!target) {
      return;
    }
    var normalized = String(value || '');
    if (!normalized) {
      return;
    }

    if (multi) {
      if (target.has(normalized)) {
        target.delete(normalized);
      } else {
        target.add(normalized);
      }
    } else {
      if (target.size === 1 && target.has(normalized)) {
        target.clear();
      } else {
        target.clear();
        target.add(normalized);
      }
    }
    renderFilters();
    renderList();
  }

  function clearFilters() {
    state.filters.tags.clear();
    state.filters.years.clear();
    state.filters.types.clear();
    renderFilters();
    renderList();
  }

  function applyDefaultFilters() {
    if (state.defaultFiltersApplied) {
      return;
    }
    var page = getRenderState();
    var defaultTag = String(page.default_tag || '').trim();
    if (!defaultTag) {
      state.defaultFiltersApplied = true;
      return;
    }
    if (!state.filters.tags.size && !state.filters.years.size && !state.filters.types.size) {
      state.filters.tags.add(defaultTag);
    }
    state.defaultFiltersApplied = true;
  }

  function setPanelOpen(open) {
    if (!els.panel || !els.toggle) {
      return;
    }
    var isOpen = !!open;
    els.toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (panelHideTimer) {
      window.clearTimeout(panelHideTimer);
      panelHideTimer = null;
    }

    if (isOpen) {
      var wasHidden = !!els.panel.hidden;
      els.panel.hidden = false;
      if (wasHidden) {
        els.panel.classList.remove('is-open');
        void els.panel.offsetHeight;
        window.requestAnimationFrame(function () {
          els.panel.classList.add('is-open');
        });
      } else {
        els.panel.classList.add('is-open');
      }
      return;
    }

    els.panel.classList.remove('is-open');
    panelHideTimer = window.setTimeout(function () {
      panelHideTimer = null;
      if (!els.panel.classList.contains('is-open')) {
        els.panel.hidden = true;
      }
    }, 420);
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.posts)) {
        return parsed.posts;
      }
    } catch (_err) {
      return null;
    }
    return null;
  }

  function writeCache(posts) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ posts: posts || [] }));
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function loadPageState() {
    var auth = authPayload();
    return apiPost('/cgi/blog-get-nostr-page', {
      page_slug: slug,
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (data) {
      state.payload = data;
      applyDefaultFilters();
      renderAll();
    }).catch(function () {
      renderAll();
    }).finally(function () {
      state.initialPageStateLoaded = true;
      maybeMarkInitialContentPainted();
    });
  }

  function loadPosts() {
    return fetch('/cgi/blog-list-public-posts', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success || !Array.isArray(data.posts)) {
          return;
        }
        state.posts = data.posts;
        writeCache(state.posts);
        renderFilters();
        renderList();
      })
      .catch(function () {
        // Keep cached posts if fetch fails.
      })
      .finally(function () {
        state.initialPostsLoaded = true;
        maybeMarkInitialContentPainted();
      });
  }

  root.addEventListener('click', function (event) {
    var toggle = event.target && event.target.closest('[data-filter-group][data-filter-value]');
    if (toggle) {
      event.preventDefault();
      toggleFilter(
        toggle.getAttribute('data-filter-group'),
        toggle.getAttribute('data-filter-value'),
        !!(event.metaKey || event.ctrlKey)
      );
      return;
    }

    var inlineTag = event.target && event.target.closest('[data-inline-tag]');
    if (inlineTag) {
      event.preventDefault();
      setPanelOpen(true);
      toggleFilter('tags', inlineTag.getAttribute('data-inline-tag'), !!(event.metaKey || event.ctrlKey));
      return;
    }

    var action = event.target && event.target.closest('[data-blog-action]');
    if (action) {
      event.preventDefault();
      if (action.getAttribute('data-blog-action') === 'open-admin') {
        openAdminPage();
      }
    }
  });

  if (els.toggle) {
    els.toggle.addEventListener('click', function () {
      var open = els.toggle.getAttribute('aria-expanded') !== 'true';
      setPanelOpen(open);
    });
  }

  if (els.clear) {
    els.clear.addEventListener('click', function () {
      clearFilters();
    });
  }

  removeLegacyTitleBlock();
  ensureFilterGutterLayout();
  var cached = readCache();
  if (cached) {
    state.posts = cached;
  }
  renderAll();
  loadPageState();
  loadPosts();
})();
