(function () {
  'use strict';

  var CACHE_KEY = 'wizardry_blog_posts_v2';
  var root = document.getElementById('blog-page-root');
  if (!root) {
    return;
  }

  var els = {
    toggle: document.getElementById('blog-filter-toggle'),
    panel: document.getElementById('blog-filter-panel'),
    tags: document.getElementById('blog-filter-tags'),
    years: document.getElementById('blog-filter-years'),
    types: document.getElementById('blog-filter-types'),
    clear: document.getElementById('blog-clear-filters'),
    list: document.getElementById('blog-post-list'),
    empty: document.getElementById('blog-empty'),
    summary: document.getElementById('blog-result-summary')
  };

  var state = {
    posts: [],
    filters: {
      tags: new Set(),
      years: new Set(),
      types: new Set()
    }
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatType(value) {
    var raw = String(value || '').trim();
    if (!raw) {
      return 'Post';
    }
    return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  function renderSummary(total, shown) {
    if (!els.summary) {
      return;
    }
    if (total <= 0) {
      els.summary.textContent = 'No posts yet';
      return;
    }
    if (shown === total) {
      els.summary.textContent = String(total) + ' posts';
      return;
    }
    els.summary.textContent = String(shown) + ' of ' + String(total) + ' posts';
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
    renderSummary(state.posts.length, shown.length);

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

  function applyRender() {
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
    applyRender();
  }

  function clearFilters() {
    state.filters.tags.clear();
    state.filters.years.clear();
    state.filters.types.clear();
    applyRender();
  }

  function setPanelOpen(open) {
    if (!els.panel || !els.toggle) {
      return;
    }
    var isOpen = !!open;
    els.toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

    if (isOpen) {
      els.panel.hidden = false;
      els.panel.classList.add('is-open');
      return;
    }

    els.panel.classList.remove('is-open');
    window.setTimeout(function () {
      if (!els.panel.classList.contains('is-open')) {
        els.panel.hidden = true;
      }
    }, 240);
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

  function loadPosts() {
    return fetch('/cgi/blog-list-public-posts', { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success || !Array.isArray(data.posts)) {
          return;
        }
        state.posts = data.posts;
        writeCache(state.posts);
        applyRender();
      })
      .catch(function () {
        // Keep cached rendering on fetch failure.
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

  var cached = readCache();
  if (cached) {
    state.posts = cached;
    applyRender();
  }

  loadPosts();
})();
