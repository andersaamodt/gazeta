(function () {
  'use strict';

  var CACHE_KEY = 'wizardry_blog_posts_v2';
  var POSTS_CACHE_MAX_AGE_MS = 15000;
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
    empty: document.getElementById('blog-empty'),
    composeFab: null,
    composeSlot: null
  };

  var state = {
    payload: null,
    posts: [],
    postsLoading: true,
    initialContentPainted: false,
    initialPageStateLoaded: false,
    initialPostsLoaded: false,
    renderSignature: '',
    defaultFiltersApplied: false,
    pageSettingsOpen: false,
    filters: {
      tags: new Set(),
      years: new Set(),
      types: new Set()
    },
    compose: {
      open: false,
      preview: false,
      draftId: '',
      postTypeChosen: false,
      tags: [],
      tagsOpen: false,
      postType: 'longform',
      postTypeToolbarCollapsed: false,
      postTypeToolbarCollapseTimer: null,
      publishDestination: 'local_only',
      shortformLimit: 280,
      shortformLimitEditing: false,
      linkUrl: '',
      linkBody: '',
      cameraStream: null,
      cameraStarting: false,
      cameraError: '',
      audioStream: null,
      audioRecorder: null,
      audioChunks: [],
      audioStarting: false,
      audioRecording: false,
      audioError: '',
      uploading: 0,
      autosaveTimer: null,
      busy: false,
      output: '',
      outputTone: '',
      saveStatus: ''
    }
  };
  var panelHideTimer = null;
  var pageSettingsHideTimer = null;
  var composeToggleGuardUntil = 0;
  var COMPOSE_POST_TYPES = ['shortform', 'longform', 'capture-media', 'upload-media', 'attachment', 'audio-note', 'link-share', 'go-live'];
  var routeSelfHealTriggered = false;

  function ensureComposeStateShape() {
    if (!state.compose || typeof state.compose !== 'object') {
      state.compose = {};
    }
    if (typeof state.compose.open !== 'boolean') state.compose.open = false;
    if (typeof state.compose.preview !== 'boolean') state.compose.preview = false;
    if (typeof state.compose.draftId !== 'string') state.compose.draftId = '';
    if (typeof state.compose.postTypeChosen !== 'boolean') state.compose.postTypeChosen = false;
    if (!Array.isArray(state.compose.tags)) state.compose.tags = [];
    if (typeof state.compose.tagsOpen !== 'boolean') state.compose.tagsOpen = false;
    if (typeof state.compose.postType !== 'string') state.compose.postType = 'longform';
    if (typeof state.compose.postTypeToolbarCollapsed !== 'boolean') state.compose.postTypeToolbarCollapsed = false;
    if (typeof state.compose.postTypeToolbarCollapseTimer === 'undefined') state.compose.postTypeToolbarCollapseTimer = null;
    if (typeof state.compose.publishDestination !== 'string') state.compose.publishDestination = 'local_only';
    if (typeof state.compose.shortformLimit !== 'number' || !isFinite(state.compose.shortformLimit)) state.compose.shortformLimit = 280;
    if (typeof state.compose.shortformLimitEditing !== 'boolean') state.compose.shortformLimitEditing = false;
    if (typeof state.compose.linkUrl !== 'string') state.compose.linkUrl = '';
    if (typeof state.compose.linkBody !== 'string') state.compose.linkBody = '';
    if (typeof state.compose.cameraStarting !== 'boolean') state.compose.cameraStarting = false;
    if (typeof state.compose.cameraError !== 'string') state.compose.cameraError = '';
    if (typeof state.compose.cameraStream === 'undefined') state.compose.cameraStream = null;
    if (typeof state.compose.audioStream === 'undefined') state.compose.audioStream = null;
    if (typeof state.compose.audioRecorder === 'undefined') state.compose.audioRecorder = null;
    if (!Array.isArray(state.compose.audioChunks)) state.compose.audioChunks = [];
    if (typeof state.compose.audioStarting !== 'boolean') state.compose.audioStarting = false;
    if (typeof state.compose.audioRecording !== 'boolean') state.compose.audioRecording = false;
    if (typeof state.compose.audioError !== 'string') state.compose.audioError = '';
    if (typeof state.compose.uploading !== 'number' || !isFinite(state.compose.uploading)) state.compose.uploading = 0;
    if (typeof state.compose.autosaveTimer === 'undefined') state.compose.autosaveTimer = null;
    if (typeof state.compose.busy !== 'boolean') state.compose.busy = false;
    if (typeof state.compose.output !== 'string') state.compose.output = '';
    if (typeof state.compose.outputTone !== 'string') state.compose.outputTone = '';
    if (typeof state.compose.saveStatus !== 'string') state.compose.saveStatus = '';
  }

  function normalizeSlug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function slugFromPath(pathname) {
    var path = String(pathname || '').trim();
    if (!path) {
      return 'index';
    }
    path = path.split('?')[0].split('#')[0];
    path = path.replace(/\/+$/, '');
    if (!path || path === '/') {
      return 'index';
    }
    if (path.indexOf('/pages/') === 0) {
      path = path.slice('/pages/'.length);
    } else if (path.charAt(0) === '/') {
      path = path.slice(1);
    }
    path = path.replace(/\.html?$/i, '');
    if (path.indexOf('/') >= 0) {
      return '';
    }
    return normalizeSlug(path);
  }

  function slugsEquivalent(aRaw, bRaw) {
    var a = normalizeSlug(aRaw);
    var b = normalizeSlug(bRaw);
    if (!a || !b) {
      return false;
    }
    if (a === b) {
      return true;
    }
    return (a === 'index' && b === 'blog') || (a === 'blog' && b === 'index');
  }

  function maybeRepairRoute(reason) {
    if (routeSelfHealTriggered) {
      return;
    }
    routeSelfHealTriggered = true;
    var url;
    try {
      url = new URL(window.location.href);
    } catch (_err) {
      window.location.reload();
      return;
    }
    var attempted = url.searchParams.get('__route_repair') === '1';
    if (attempted) {
      return;
    }
    url.searchParams.set('__route_repair', '1');
    fetch('/cgi/blog-list-navbar-pages', { cache: 'no-store' })
      .catch(function () {
        // Ignore sync hint errors; still attempt one repair reload.
      })
      .finally(function () {
        window.setTimeout(function () {
          if (reason) {
            // Preserve last reason for debugging in browser console/state.
            try {
              sessionStorage.setItem('wizardry_last_route_repair_reason', String(reason));
            } catch (_storageErr) {
              // Ignore storage errors.
            }
          }
          window.location.replace(url.toString());
        }, 220);
      });
  }

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
      els.title.hidden = false;
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
    var errors = (Array.isArray(validation.errors) ? validation.errors : []).filter(function (msg) {
      var text = String(msg || '').trim().toLowerCase();
      if (!text) {
        return false;
      }
      return !(/could not validate .*state/.test(text) || /validation .*temporarily unavailable/.test(text));
    });
    var warnings = (Array.isArray(validation.warnings) ? validation.warnings : []).filter(function (msg) {
      var text = String(msg || '').trim().toLowerCase();
      if (!text) {
        return false;
      }
      return !(/could not validate .*state/.test(text) || /validation .*temporarily unavailable/.test(text));
    });
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

  function pageSettingsTags() {
    var seen = {};
    var tags = [];
    (Array.isArray(state.posts) ? state.posts : []).forEach(function (post) {
      var list = Array.isArray(post && post.tags) ? post.tags : [];
      list.forEach(function (raw) {
        var tag = String(raw || '').trim();
        if (!tag || seen[tag]) {
          return;
        }
        seen[tag] = true;
        tags.push(tag);
      });
    });
    tags.sort(function (a, b) {
      return a.localeCompare(b);
    });
    return tags;
  }

  function setPageSettingsOpen(open) {
    if (!els.admin) {
      return;
    }
    var next = !!open;
    state.pageSettingsOpen = next;
    var editToggle = document.querySelector('[data-blog-action="toggle-page-settings"]');
    if (editToggle instanceof HTMLElement) {
      editToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
    }
    if (pageSettingsHideTimer) {
      window.clearTimeout(pageSettingsHideTimer);
      pageSettingsHideTimer = null;
    }
    if (next) {
      els.admin.hidden = false;
      els.admin.classList.remove('is-open');
      void els.admin.offsetHeight;
      window.requestAnimationFrame(function () {
        if (els.admin) {
          els.admin.classList.add('is-open');
        }
      });
      return;
    }
    els.admin.classList.remove('is-open');
    pageSettingsHideTimer = window.setTimeout(function () {
      pageSettingsHideTimer = null;
      if (els.admin && !state.pageSettingsOpen) {
        els.admin.hidden = true;
      }
    }, 240);
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
      state.pageSettingsOpen = false;
      els.admin.hidden = true;
      els.admin.innerHTML = '';
      return;
    }
    if (actionsHost) {
      actionsHost.innerHTML = '<span class="list-page-admin-bar"><button type="button" class="list-admin-primary-btn" data-blog-action="toggle-page-settings" aria-expanded="' + (state.pageSettingsOpen ? 'true' : 'false') + '" aria-controls="blog-page-settings-panel">Edit</button></span>';
    }
    var page = getRenderState();
    var selectedTag = String(page.default_tag || '').trim();
    var tags = pageSettingsTags();
    var options = '<option value="">All posts</option>' + tags.map(function (tag) {
      return '<option value="' + escapeHtml(tag) + '"' + (selectedTag === tag ? ' selected' : '') + '>' + escapeHtml(tag) + '</option>';
    }).join('');
    els.admin.innerHTML = '' +
      '<div id="blog-page-settings-panel" class="blog-page-settings-panel' + (state.pageSettingsOpen ? ' is-open' : '') + '">' +
        '<label><span>Show posts</span><select data-blog-setting="default-tag">' + options + '</select></label>' +
      '</div>';
    if (state.pageSettingsOpen) {
      els.admin.hidden = false;
      els.admin.classList.add('is-open');
    } else {
      els.admin.hidden = true;
      els.admin.classList.remove('is-open');
    }
  }

  function ensureComposeHosts() {
    if (!els.list || !els.list.parentNode) {
      return;
    }
    if (!els.composeSlot) {
      var slot = document.createElement('div');
      slot.className = 'blog-compose-slot';
      slot.hidden = true;
      els.list.parentNode.insertBefore(slot, els.list);
      els.composeSlot = slot;
    }
    if (!els.composeFab) {
      var fab = document.createElement('button');
      fab.type = 'button';
      fab.className = 'blog-compose-fab list-admin-primary-btn';
      fab.setAttribute('data-blog-action', 'toggle-compose');
      fab.setAttribute('aria-label', 'Compose');
      fab.innerHTML = '<span class="blog-compose-fab-icon" aria-hidden="true">+</span>';
      fab.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleComposeFromUi(!state.compose.open);
      });
      fab.hidden = true;
      root.appendChild(fab);
      els.composeFab = fab;
    }
  }

  function normalizeComposePostType(raw) {
    var picked = String(raw || '').trim().toLowerCase();
    if (COMPOSE_POST_TYPES.indexOf(picked) >= 0) {
      return picked;
    }
    return 'longform';
  }

  function composePostType() {
    ensureComposeStateShape();
    return normalizeComposePostType(state.compose.postType);
  }

  function composePostTypeIsTextual(type) {
    var picked = normalizeComposePostType(type);
    return picked === 'shortform' || picked === 'longform';
  }

  function composeBuildLinkMarkdown(urlValue, bodyValue, titleValue) {
    var url = String(urlValue || '').trim();
    if (!url) {
      return '';
    }
    var label = String(titleValue || '').trim() || url;
    var out = '[' + label + '](' + url + ')';
    var body = String(bodyValue || '').trim();
    if (body) {
      out += '\n\n' + body;
    }
    return out;
  }

  function composeNostrTarget(postType) {
    var type = normalizeComposePostType(postType);
    if (type === 'shortform') {
      return { kind: '1', tags: 't=short, alt' };
    }
    if (type === 'longform') {
      return { kind: '30023', tags: 'd, title, summary, published_at' };
    }
    if (type === 'capture-media') {
      return { kind: '20 or 21', tags: 'url, m=image/*|video/*, alt, dim|duration' };
    }
    if (type === 'upload-media') {
      return { kind: '20 or 21', tags: 'url, m=image/*|video/*, ox, size, dim|duration' };
    }
    if (type === 'attachment') {
      return { kind: '15', tags: 'url, m, size, ox' };
    }
    if (type === 'audio-note') {
      return { kind: '21', tags: 'url, m=audio/*, duration, alt' };
    }
    if (type === 'link-share') {
      return { kind: '1', tags: 'r, title, summary, image' };
    }
    return { kind: '30311', tags: 'streaming, starts, status=live' };
  }

  function composePostTypeLabel(postType) {
    var type = normalizeComposePostType(postType);
    if (type === 'shortform') return 'Shortform Post';
    if (type === 'longform') return 'Longform Post';
    if (type === 'capture-media') return 'Take Photo/Video';
    if (type === 'upload-media') return 'Upload Photo/Video';
    if (type === 'attachment') return 'Upload Attachment/File';
    if (type === 'audio-note') return 'Audio Note';
    if (type === 'link-share') return 'Link Share';
    return 'Go Live';
  }

  function composeNostrPillsHtml(postType) {
    var type = normalizeComposePostType(postType);
    var target = composeNostrTarget(type);
    var typeLabel = composePostTypeLabel(type);
    var kindLabel = 'kind ' + target.kind;
    var combined = typeLabel + ' · ' + kindLabel;
    return '<span class="nostr-target-pill is-pages-pill" title="' + escapeHtml(combined + ' · ' + target.tags) + '">' + escapeHtml(combined) + '</span>';
  }

  function clearComposePostTypeCollapseTimer() {
    ensureComposeStateShape();
    if (state.compose.postTypeToolbarCollapseTimer) {
      window.clearTimeout(state.compose.postTypeToolbarCollapseTimer);
      state.compose.postTypeToolbarCollapseTimer = null;
    }
  }

  function applyComposePostTypeControlState() {
    if (!els.composeSlot) {
      return;
    }
    var control = els.composeSlot.querySelector('[data-compose-type-control]');
    var headRow = els.composeSlot.querySelector('[data-compose-head-row]');
    if (!control) {
      return;
    }
    control.classList.toggle('is-collapsed', !!state.compose.postTypeToolbarCollapsed);
    if (headRow) {
      headRow.classList.toggle('is-type-collapsed', !!state.compose.postTypeToolbarCollapsed);
    }
  }

  function setComposePostTypeToolbarCollapsed(collapsed, options) {
    ensureComposeStateShape();
    var opts = options || {};
    state.compose.postTypeToolbarCollapsed = !!collapsed;
    if (opts.clearTimer !== false && collapsed) {
      clearComposePostTypeCollapseTimer();
    }
    if (opts.skipDom) {
      return;
    }
    applyComposePostTypeControlState();
  }

  function scheduleComposePostTypeCollapse(delayMs) {
    ensureComposeStateShape();
    clearComposePostTypeCollapseTimer();
    if (!state.compose.open) {
      return;
    }
    state.compose.postTypeToolbarCollapseTimer = window.setTimeout(function () {
      state.compose.postTypeToolbarCollapseTimer = null;
      if (!state.compose.open) {
        return;
      }
      setComposePostTypeToolbarCollapsed(true);
    }, Math.max(800, Number(delayMs) || 2600));
  }

  function composePostTypeIconSvg(type) {
    var picked = normalizeComposePostType(type);
    if (picked === 'shortform') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M5 8H15M5 12H13M5 16H15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>';
    }
    if (picked === 'longform') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M5 7H19M5 11H19M5 15H17M5 19H19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>';
    }
    if (picked === 'capture-media') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<rect x="4" y="7" width="16" height="11" rx="2.2" stroke="currentColor" stroke-width="1.8"/>' +
        '<circle cx="12" cy="12.5" r="2.6" stroke="currentColor" stroke-width="1.8"/>' +
        '<path d="M9.2 7L10.4 5.2H13.6L14.8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>';
    }
    if (picked === 'upload-media') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<rect x="3.8" y="5.1" width="16.4" height="13.8" rx="2.1" stroke="currentColor" stroke-width="1.8"/>' +
        '<circle cx="9.1" cy="10.1" r="1.2" fill="currentColor"/>' +
        '<path d="M6.1 16L10.5 11.8L12.9 14.2L15.3 12.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M17.2 8.1V12.2M15.5 10.4L17.2 8.1L18.9 10.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    }
    if (picked === 'attachment') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M9.2 12.8L14.4 7.6C15.8 6.2 18 6.2 19.4 7.6C20.8 9 20.8 11.2 19.4 12.6L11.2 20.8C8.9 23.1 5.2 23.1 2.9 20.8C0.6 18.5 0.6 14.8 2.9 12.5L11 4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    }
    if (picked === 'audio-note') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<rect x="9" y="4.2" width="6" height="10" rx="3" stroke="currentColor" stroke-width="1.8"/>' +
        '<path d="M6.6 11.2C6.6 14.4 9.1 16.9 12 16.9C14.9 16.9 17.4 14.4 17.4 11.2M12 16.9V20.2M9.3 20.2H14.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>';
    }
    if (picked === 'link-share') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M10.2 13.8L13.8 10.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
        '<path d="M8.3 15.7L6.5 17.5C5 19 2.6 19 1.1 17.5C-0.4 16 -0.4 13.6 1.1 12.1L2.9 10.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
        '<path d="M15.7 8.3L17.5 6.5C19 5 21.4 5 22.9 6.5C24.4 8 24.4 10.4 22.9 11.9L21.1 13.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>';
    }
    return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="2.4" fill="currentColor"/>' +
      '<path d="M4.4 12H2.2M21.8 12H19.6M17.7 6.3L16.1 7.9M7.9 16.1L6.3 17.7M17.7 17.7L16.1 16.1M7.9 7.9L6.3 6.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>';
  }

  function composePreviewToggleIconSvg() {
    return '<svg class="compose-preview-toggle-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M7.2 3.8H13.4L18.9 9.3V18.5C18.9 19.4 18.2 20.1 17.3 20.1H7.2C6.3 20.1 5.6 19.4 5.6 18.5V5.4C5.6 4.5 6.3 3.8 7.2 3.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="M13.4 3.8V9.3H18.9" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<circle cx="10.6" cy="13.8" r="2.1" stroke="currentColor" stroke-width="1.8"/>' +
      '<path d="M12.1 15.3L14.3 17.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>';
  }

  function composeTypeButtonsHtml(activeType) {
    var current = normalizeComposePostType(activeType);
    function btn(type, label, disabled) {
      var cls = 'compose-post-type-pill';
      if (type === current) {
        cls += ' is-active';
      }
      if (disabled) {
        cls += ' is-disabled';
      }
      var icon = composePostTypeIconSvg(type);
      var title = disabled ? ('Coming soon: ' + label) : label;
      return '<button type="button" class="' + cls + '" data-compose-action="set-post-type" data-compose-post-type="' + escapeHtml(type) + '"' +
        (disabled ? ' disabled aria-disabled="true"' : '') +
        ' aria-pressed="' + (type === current ? 'true' : 'false') + '"' +
        ' aria-label="' + escapeHtml(label) + '"' +
        ' title="' + escapeHtml(title) + '"' +
        '>' + icon + '</button>';
    }
    return '' +
      '<div class="compose-post-type-toolbar" role="tablist" aria-label="Post type">' +
      btn('shortform', 'Shortform Post', false) +
      btn('longform', 'Longform Post', false) +
      btn('capture-media', 'Take Photo/Video', false) +
      btn('upload-media', 'Upload Photo/Video', false) +
      btn('attachment', 'Upload Attachment/File', false) +
      btn('audio-note', 'Audio Note', false) +
      btn('link-share', 'Link Share', false) +
      btn('go-live', 'Go Live', true) +
      '</div>';
  }

  function normalizeComposeShortformLimit(raw) {
    var n = parseInt(String(raw || '').trim(), 10);
    if (!isFinite(n) || n < 1) {
      return 280;
    }
    return Math.max(1, Math.min(5000, n));
  }

  function currentComposeShortformLimit() {
    ensureComposeStateShape();
    state.compose.shortformLimit = normalizeComposeShortformLimit(state.compose.shortformLimit);
    return state.compose.shortformLimit;
  }

  function enforceComposeShortformLimitOnFields(fields) {
    var data = fields || readComposeFields();
    if (!data) {
      return;
    }
    if (normalizeComposePostType(data.postType) !== 'shortform') {
      return;
    }
    var limit = currentComposeShortformLimit();
    if (String(data.content || '').length <= limit) {
      return;
    }
    var next = String(data.content || '').slice(0, limit);
    if (els.composeSlot) {
      var contentField = els.composeSlot.querySelector('[data-compose-field="content"]');
      if (contentField instanceof HTMLTextAreaElement) {
        contentField.value = next;
      }
    }
  }

  function composeShortformMeterHtml(contentValue) {
    var limit = currentComposeShortformLimit();
    var count = String(contentValue || '').length;
    var editing = !!state.compose.shortformLimitEditing;
    return '' +
      '<div class="blog-compose-shortform-meter">' +
        '<button type="button" class="unobtrusive-icon-button blog-compose-shortform-limit-btn" data-compose-action="shortform-limit-toggle" title="Click to toggle 280/140. Double-click to set custom limit."' + (editing ? ' hidden' : '') + '>' + escapeHtml(String(count) + '/' + String(limit)) + '</button>' +
        '<input type="number" class="blog-compose-shortform-limit-input" data-compose-field="shortform-limit" min="1" step="1" inputmode="numeric" value="' + escapeHtml(String(limit)) + '"' + (editing ? '' : ' hidden') + '>' +
      '</div>';
  }

  function setComposeShortformLimit(raw, opts) {
    var options = opts || {};
    state.compose.shortformLimit = normalizeComposeShortformLimit(raw);
    if (options.editing === true || options.editing === false) {
      state.compose.shortformLimitEditing = !!options.editing;
    }
    enforceComposeShortformLimitOnFields();
    if (!options.skipRender) {
      renderComposeUi();
    }
    if (!options.skipAutosave) {
      queueComposeAutosave();
    }
  }

  function composeTextareaRows(postType) {
    var type = normalizeComposePostType(postType);
    if (type === 'shortform') {
      return 9;
    }
    if (composePostTypeIsTextual(type)) {
      return 14;
    }
    return 8;
  }

  function setComposePostType(nextType, options) {
    var opts = options || {};
    var normalized = normalizeComposePostType(nextType);
    if (normalized === 'go-live') {
      setComposeOutput('Go Live is a future feature.', 'warn');
      renderComposeStatusOnly();
      return;
    }
    state.compose.postType = normalized;
    state.compose.postTypeChosen = true;
    state.compose.postTypeToolbarCollapsed = false;
    if (!opts.skipRender) {
      renderComposeUi();
    }
    if (!opts.skipAutosave) {
      queueComposeAutosave();
    }
    if (opts.interactive) {
      scheduleComposePostTypeCollapse(2400);
      if (normalized === 'upload-media' || normalized === 'attachment') {
        setTimeout(function () {
          openComposePickerForType(normalized);
        }, 0);
      } else if (normalized === 'capture-media' || normalized === 'audio-note') {
        setTimeout(function () {
          applyComposeModeEffects(normalized);
        }, 0);
      }
    }
  }

  function normalizeTagValue(tag) {
    var value = String(tag || '').trim();
    if (!value) {
      return '';
    }
    value = value.replace(/^\[+|\]+$/g, '');
    value = value.replace(/^["']+|["']+$/g, '');
    value = value.replace(/\\+/g, '');
    value = value.replace(/\s+/g, '-');
    value = value.replace(/^-+|-+$/g, '');
    if (!/[A-Za-z0-9]/.test(value)) {
      return '';
    }
    if (/[\[\]{}]/.test(value)) {
      return '';
    }
    value = value.replace(/[^A-Za-z0-9._:+/-]/g, '');
    value = value.replace(/^-+|-+$/g, '');
    if (!value || value.length > 64) {
      return '';
    }
    return value;
  }

  function syncComposeTagsField() {
    if (!els.composeSlot) {
      return;
    }
    var hidden = els.composeSlot.querySelector('[data-compose-field="tags"]');
    if (hidden instanceof HTMLInputElement) {
      hidden.value = state.compose.tags.join(',');
    }
  }

  function setComposeTags(tags) {
    var list = Array.from(tags || [])
      .map(normalizeTagValue)
      .filter(Boolean);
    state.compose.tags = list.filter(function (tag, idx) {
      return list.indexOf(tag) === idx;
    });
    syncComposeTagsField();
  }

  function addComposeTag(rawTag) {
    var tag = normalizeTagValue(rawTag);
    if (!tag || state.compose.tags.indexOf(tag) !== -1) {
      return false;
    }
    state.compose.tags.push(tag);
    state.compose.tagsOpen = true;
    syncComposeTagsField();
    return true;
  }

  function removeComposeTag(tag) {
    setComposeTags(state.compose.tags.filter(function (item) {
      return item !== tag;
    }));
  }

  function commitComposeTagInput() {
    if (!els.composeSlot) {
      return false;
    }
    var input = els.composeSlot.querySelector('[data-compose-field="tags-input"]');
    if (!(input instanceof HTMLInputElement)) {
      return false;
    }
    var parts = String(input.value || '').split(',');
    var changed = false;
    parts.forEach(function (part) {
      if (addComposeTag(part)) {
        changed = true;
      }
    });
    input.value = '';
    return changed;
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('Failed to read file')); };
      reader.readAsDataURL(file);
    });
  }

  function composeUploadMarkdown(url, file) {
    var safeUrl = String(url || '').trim();
    if (!safeUrl) {
      return '';
    }
    var name = String((file && file.name) || 'file').trim();
    var mime = String((file && file.type) || '').toLowerCase();
    var alt = name.replace(/\.[^.]+$/, '') || 'media';
    if (mime.indexOf('image/') === 0) {
      return '![' + alt + '](' + safeUrl + ')';
    }
    if (mime.indexOf('video/') === 0) {
      return '<video controls src="' + safeUrl + '"></video>';
    }
    if (mime.indexOf('audio/') === 0) {
      return '<audio controls src="' + safeUrl + '"></audio>';
    }
    return '[' + name + '](' + safeUrl + ')';
  }

  function appendComposeContent(text) {
    if (!els.composeSlot) {
      return;
    }
    var source = els.composeSlot.querySelector('[data-compose-field="content"]');
    if (!(source instanceof HTMLTextAreaElement)) {
      return;
    }
    var addition = String(text || '').trim();
    if (!addition) {
      return;
    }
    var current = String(source.value || '');
    source.value = current.trim() ? (current.replace(/\s*$/, '') + '\n\n' + addition) : addition;
  }

  function uploadComposeFile(file) {
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      return Promise.reject(new Error('Sign in again to upload.'));
    }
    return readFileAsDataUrl(file).then(function (dataUrl) {
      return apiPost('/cgi/blog-upload-media', {
        session_token: auth.session_token,
        csrf_token: auth.csrf_token,
        draft_id: String(state.compose.draftId || ''),
        filename: String((file && file.name) || 'upload.bin'),
        mime_type: String((file && file.type) || ''),
        data_base64: String(dataUrl || '')
      });
    });
  }

  function handleComposeUploads(files, preferredType) {
    var list = Array.from(files || []).filter(function (file) {
      return file && file.size >= 0;
    });
    if (!list.length) {
      return Promise.resolve();
    }
    if (preferredType) {
      setComposePostType(preferredType, { skipAutosave: true });
    }
    state.compose.uploading += 1;
    setComposeOutput('Uploading ' + list.length + ' file(s)...', 'warn');
    renderComposeStatusOnly();
    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () {
        return uploadComposeFile(file).then(function (data) {
          if (data && data.draft_id) {
            state.compose.draftId = String(data.draft_id);
          }
          appendComposeContent(composeUploadMarkdown(data && data.url, file));
        });
      });
    });
    return chain.then(function () {
      setComposeOutput('Upload complete. Added to body.', 'ok');
      queueComposeAutosave();
      renderComposeUi();
    }).catch(function (err) {
      setComposeOutput('Upload error: ' + ((err && err.message) ? err.message : 'Upload failed'), 'error');
      renderComposeStatusOnly();
    }).finally(function () {
      state.compose.uploading = Math.max(0, state.compose.uploading - 1);
      renderComposeStatusOnly();
    });
  }

  function composePickerFieldByType(type) {
    var picked = normalizeComposePostType(type);
    if (picked === 'capture-media') return 'capture-upload';
    if (picked === 'upload-media') return 'media-upload';
    if (picked === 'attachment') return 'file-upload';
    if (picked === 'audio-note') return 'audio-upload';
    return '';
  }

  function openComposePickerForType(type) {
    if (!els.composeSlot) {
      return false;
    }
    var field = composePickerFieldByType(type);
    if (!field) {
      return false;
    }
    var picker = els.composeSlot.querySelector('[data-compose-field="' + field + '"]');
    if (!(picker instanceof HTMLInputElement)) {
      return false;
    }
    picker.click();
    return true;
  }

  function stopComposeCameraStream() {
    ensureComposeStateShape();
    var stream = state.compose.cameraStream;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach(function (track) {
        if (track && typeof track.stop === 'function') {
          track.stop();
        }
      });
    }
    state.compose.cameraStream = null;
    state.compose.cameraStarting = false;
  }

  function attachComposeCameraPreview() {
    if (!els.composeSlot) {
      return;
    }
    var video = els.composeSlot.querySelector('[data-compose-camera-preview]');
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }
    if (state.compose.cameraStream && video.srcObject !== state.compose.cameraStream) {
      video.srcObject = state.compose.cameraStream;
    }
    if (video.srcObject) {
      video.play().catch(function () {
        // Ignore autoplay restrictions; controls are still available.
      });
    }
  }

  function ensureComposeCameraStream() {
    ensureComposeStateShape();
    if (state.compose.cameraStream || state.compose.cameraStarting) {
      attachComposeCameraPreview();
      return;
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      state.compose.cameraError = 'Camera is unavailable in this browser.';
      renderComposeUi();
      return;
    }
    state.compose.cameraStarting = true;
    state.compose.cameraError = '';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .catch(function () {
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      })
      .then(function (stream) {
        state.compose.cameraStream = stream || null;
      })
      .catch(function (err) {
        state.compose.cameraError = String((err && err.message) || 'Could not access camera.');
      })
      .finally(function () {
        state.compose.cameraStarting = false;
        renderComposeUi();
      });
  }

  function stopComposeAudioStream() {
    ensureComposeStateShape();
    var recorder = state.compose.audioRecorder;
    if (recorder && recorder.state === 'recording') {
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        recorder.stop();
      } catch (_err) {
        // Ignore stop errors.
      }
    }
    var stream = state.compose.audioStream;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach(function (track) {
        if (track && typeof track.stop === 'function') {
          track.stop();
        }
      });
    }
    state.compose.audioStream = null;
    state.compose.audioRecorder = null;
    state.compose.audioChunks = [];
    state.compose.audioStarting = false;
    state.compose.audioRecording = false;
  }

  function ensureComposeAudioStream() {
    ensureComposeStateShape();
    if (state.compose.audioStream) {
      return Promise.resolve(state.compose.audioStream);
    }
    if (state.compose.audioStarting) {
      return Promise.resolve(null);
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      state.compose.audioError = 'Microphone is unavailable in this browser.';
      renderComposeUi();
      return Promise.resolve(null);
    }
    state.compose.audioStarting = true;
    state.compose.audioError = '';
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(function (stream) {
        state.compose.audioStream = stream || null;
        return state.compose.audioStream;
      })
      .catch(function (err) {
        state.compose.audioError = String((err && err.message) || 'Could not access microphone.');
        return null;
      })
      .finally(function () {
        state.compose.audioStarting = false;
        renderComposeUi();
      });
  }

  function startComposeAudioRecording() {
    ensureComposeStateShape();
    if (state.compose.audioRecording || state.compose.audioStarting) {
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      state.compose.audioError = 'Audio recording is unavailable in this browser.';
      renderComposeUi();
      return;
    }
    ensureComposeAudioStream().then(function (stream) {
      if (!stream || state.compose.audioRecording) {
        return;
      }
      var recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      } catch (_err) {
        try {
          recorder = new MediaRecorder(stream);
        } catch (fallbackErr) {
          state.compose.audioError = String((fallbackErr && fallbackErr.message) || 'Could not start recording.');
          renderComposeUi();
          return;
        }
      }
      state.compose.audioChunks = [];
      state.compose.audioRecorder = recorder;
      state.compose.audioError = '';
      recorder.ondataavailable = function (event) {
        if (event && event.data && event.data.size > 0) {
          state.compose.audioChunks.push(event.data);
        }
      };
      recorder.onerror = function (event) {
        state.compose.audioError = String((event && event.error && event.error.message) || 'Recording failed.');
      };
      recorder.onstop = function () {
        var chunks = Array.isArray(state.compose.audioChunks) ? state.compose.audioChunks.slice() : [];
        state.compose.audioChunks = [];
        state.compose.audioRecorder = null;
        state.compose.audioRecording = false;
        if (!chunks.length) {
          renderComposeUi();
          return;
        }
        var mime = (chunks[0] && chunks[0].type) ? String(chunks[0].type) : 'audio/webm';
        var blob = new Blob(chunks, { type: mime });
        var ext = mime.indexOf('ogg') >= 0 ? 'ogg' : (mime.indexOf('mp4') >= 0 ? 'm4a' : 'webm');
        var file = new File([blob], 'voice-note-' + Date.now() + '.' + ext, { type: mime });
        handleComposeUploads([file], 'audio-note');
        renderComposeUi();
      };
      try {
        recorder.start(250);
        state.compose.audioRecording = true;
      } catch (err) {
        state.compose.audioRecorder = null;
        state.compose.audioRecording = false;
        state.compose.audioError = String((err && err.message) || 'Could not start recording.');
      }
      renderComposeUi();
    });
  }

  function stopComposeAudioRecording() {
    ensureComposeStateShape();
    var recorder = state.compose.audioRecorder;
    if (!recorder || recorder.state !== 'recording') {
      return;
    }
    try {
      recorder.stop();
    } catch (_err) {
      state.compose.audioRecording = false;
      state.compose.audioRecorder = null;
      renderComposeUi();
    }
  }

  function capturePhotoFromComposeCamera() {
    if (!els.composeSlot) {
      return;
    }
    var video = els.composeSlot.querySelector('[data-compose-camera-preview]');
    if (!(video instanceof HTMLVideoElement)) {
      setComposeOutput('Camera preview is not ready yet.', 'warn');
      renderComposeStatusOnly();
      return;
    }
    var width = video.videoWidth;
    var height = video.videoHeight;
    if (!width || !height) {
      setComposeOutput('Camera preview is still starting. Try again in a moment.', 'warn');
      renderComposeStatusOnly();
      return;
    }
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      setComposeOutput('Could not capture from camera.', 'error');
      renderComposeStatusOnly();
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(function (blob) {
      if (!blob) {
        setComposeOutput('Could not capture photo.', 'error');
        renderComposeStatusOnly();
        return;
      }
      var file = new File([blob], 'capture-' + Date.now() + '.jpg', { type: 'image/jpeg' });
      handleComposeUploads([file], 'capture-media');
    }, 'image/jpeg', 0.92);
  }

  function isEditableTarget(target) {
    if (!target || !(target instanceof Element)) {
      return false;
    }
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      return true;
    }
    if (target.isContentEditable) {
      return true;
    }
    return !!target.closest('textarea, input, [contenteditable="true"], [contenteditable=""]');
  }

  function clipboardImageFiles(event) {
    var out = [];
    var clip = event && event.clipboardData;
    if (!clip) {
      return out;
    }
    var items = clip.items ? Array.from(clip.items) : [];
    items.forEach(function (item) {
      if (!item || item.kind !== 'file' || String(item.type || '').indexOf('image/') !== 0) {
        return;
      }
      var file = item.getAsFile ? item.getAsFile() : null;
      if (file) {
        out.push(file);
      }
    });
    if (out.length) {
      return out;
    }
    var files = clip.files ? Array.from(clip.files) : [];
    return files.filter(function (file) {
      return file && String(file.type || '').indexOf('image/') === 0;
    });
  }

  function composeLocalToIso(value) {
    if (!value) {
      return '';
    }
    var dt = new Date(value);
    if (isNaN(dt.getTime())) {
      return '';
    }
    return dt.toISOString().replace('.000Z', 'Z');
  }

  function composePublishMode() {
    if (!els.composeSlot) {
      return 'immediate';
    }
    var checked = els.composeSlot.querySelector('input[name="blog-inline-compose-mode"]:checked');
    var value = checked ? String(checked.value || '') : 'immediate';
    if (value === 'scheduled' || value === 'drip' || value === 'immediate') {
      return value;
    }
    return 'immediate';
  }

  function normalizeComposePublishDestination(raw) {
    var picked = String(raw || '').trim().toLowerCase();
    if (picked === 'nostr_now') {
      return 'nostr_now';
    }
    return 'local_only';
  }

  function composePublishDestination() {
    ensureComposeStateShape();
    if (!els.composeSlot) {
      return normalizeComposePublishDestination(state.compose.publishDestination);
    }
    var checked = els.composeSlot.querySelector('input[name="blog-inline-compose-destination"]:checked');
    var value = checked ? String(checked.value || '') : String(state.compose.publishDestination || '');
    return normalizeComposePublishDestination(value);
  }

  function composePrimaryLabel(mode, destination) {
    if (mode === 'scheduled') {
      return 'Schedule Post';
    }
    if (mode === 'drip') {
      return 'Enqueue Post';
    }
    if (normalizeComposePublishDestination(destination) === 'local_only') {
      return 'Publish to Server';
    }
    return 'Publish Now';
  }

  function composeModeAction(mode, destination) {
    if (mode === 'scheduled') {
      return 'queue_scheduled';
    }
    if (mode === 'drip') {
      return 'queue_drip';
    }
    if (normalizeComposePublishDestination(destination) === 'local_only') {
      return 'save_draft';
    }
    return 'publish_now';
  }

  function composeToolbarButtonHtml(action, label, icon) {
    return '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="' + escapeHtml(action) + '" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '">' + icon + '</button>';
  }

  function composeToolbarHtml() {
    return '' +
      '<div class="toolbar blog-compose-toolbar" aria-label="Markdown toolbar">' +
        composeToolbarButtonHtml('bold', 'Bold', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 4.8H13.2C15.7 4.8 17.7 6.8 17.7 9.3C17.7 11.7 15.7 13.8 13.2 13.8H6.5V4.8Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M6.5 10.6H14.2C16.8 10.6 18.9 12.7 18.9 15.3C18.9 17.9 16.8 20 14.2 20H6.5V10.6Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>') +
        composeToolbarButtonHtml('italic', 'Italic', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 5H16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M8 19H14" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M14 5L10 19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>') +
        composeToolbarButtonHtml('h2', 'Heading 2', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5V19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M10 5V19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M4 12H10" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M15 10C15.2 8.9 16 8.2 17.1 8.2C18.3 8.2 19.1 9 19.1 10C19.1 10.8 18.6 11.4 17.8 11.9L15.4 13.6H19.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>') +
        composeToolbarButtonHtml('h3', 'Heading 3', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5V19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M10 5V19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M4 12H10" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M14.8 9.3H19.2L16.6 12L19.2 14.7H14.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>') +
        composeToolbarButtonHtml('code', 'Inline code', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 8.5L5 12L9 15.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 8.5L19 12L15 15.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>') +
        composeToolbarButtonHtml('code_block', 'Code block', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.8" y="5.2" width="16.4" height="13.6" rx="2.1" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 10L7.2 12L9.5 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 10L16.8 12L14.5 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>') +
        composeToolbarButtonHtml('link', 'Insert link', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 13.9L8.4 15.5C6.8 17.1 4.2 17.1 2.6 15.5C1 13.9 1 11.3 2.6 9.7L4.2 8.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14 10.1L15.6 8.5C17.2 6.9 19.8 6.9 21.4 8.5C23 10.1 23 12.7 21.4 14.3L19.8 15.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9 12H15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>') +
        composeToolbarButtonHtml('quote', 'Quote', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 10.2H10V14.2H7.3C7.4 15.5 8 16.4 9.1 17" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.2 10.2H17.2V14.2H14.5C14.6 15.5 15.2 16.4 16.3 17" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/></svg>') +
        composeToolbarButtonHtml('ul', 'Bullet list', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="5.1" cy="7.2" r="1.2" fill="currentColor"/><circle cx="5.1" cy="12" r="1.2" fill="currentColor"/><circle cx="5.1" cy="16.8" r="1.2" fill="currentColor"/><path d="M9.2 7.2H19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M9.2 12H19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M9.2 16.8H19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>') +
        composeToolbarButtonHtml('ol', 'Numbered list', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V6.1L3 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.1 15.1C3.1 14.1 3.9 13.4 4.9 13.4C5.8 13.4 6.6 14.1 6.6 15C6.6 15.8 6.2 16.3 5.5 16.8L3.2 18.3H6.9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.4 7.2H19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M9.4 16.8H19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>') +
        composeToolbarButtonHtml('image', 'Insert image', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.6" y="5.1" width="16.8" height="13.8" rx="2.1" stroke="currentColor" stroke-width="1.8"/><circle cx="9.2" cy="10.2" r="1.2" fill="currentColor"/><path d="M6.2 16.1L10.7 11.7L13.2 14.2L16.1 11.5L17.8 13.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>') +
        composeToolbarButtonHtml('attachment', 'Attach file', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.2 12.8L14.4 7.6C15.8 6.2 18 6.2 19.4 7.6C20.8 9 20.8 11.2 19.4 12.6L11.2 20.8C8.9 23.1 5.2 23.1 2.9 20.8C0.6 18.5 0.6 14.8 2.9 12.5L11 4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>') +
      '</div>';
  }

  function composeModePanelHtml(postType, fields) {
    var type = normalizeComposePostType(postType);
    if (type === 'capture-media') {
      return '' +
        '<div class="compose-media-tools compose-mode-panel compose-camera-panel">' +
          '<div class="compose-camera-shell">' +
            '<video class="compose-camera-preview" data-compose-camera-preview playsinline autoplay muted></video>' +
          '</div>' +
          '<div class="compose-media-actions">' +
            '<button type="button" class="unobtrusive-icon-button compose-media-btn compose-media-btn-primary" data-compose-action="capture-photo">Capture Photo</button>' +
            '<button type="button" class="unobtrusive-icon-button compose-media-btn" data-compose-action="open-mode-picker" data-compose-mode-target="capture-media">Use Camera App / Upload</button>' +
          '</div>' +
          '<div class="compose-camera-status">' +
            (state.compose.cameraStarting
              ? 'Requesting camera access...'
              : (state.compose.cameraError ? escapeHtml(state.compose.cameraError) : 'Camera is live. Capture a frame or upload media.')) +
          '</div>' +
        '</div>';
    }
    if (type === 'upload-media') {
      return '' +
        '<div class="compose-media-tools compose-mode-panel">' +
          '<div class="compose-media-actions">' +
            '<button type="button" class="unobtrusive-icon-button compose-media-btn compose-media-btn-primary" data-compose-action="open-mode-picker" data-compose-mode-target="upload-media">Upload Photo/Video</button>' +
          '</div>' +
        '</div>';
    }
    if (type === 'attachment') {
      return '' +
        '<div class="compose-media-tools compose-mode-panel">' +
          '<div class="compose-media-actions">' +
            '<button type="button" class="unobtrusive-icon-button compose-media-btn compose-media-btn-primary" data-compose-action="open-mode-picker" data-compose-mode-target="attachment">Browse Attachment/File</button>' +
          '</div>' +
        '</div>';
    }
    if (type === 'audio-note') {
      var audioStatus = state.compose.audioRecording
        ? 'Recording... press Stop to finish and attach audio.'
        : (state.compose.audioStarting
            ? 'Requesting microphone access...'
            : (state.compose.audioError
                ? escapeHtml(state.compose.audioError)
                : 'Microphone is ready. Press Record to capture audio.'));
      return '' +
        '<div class="compose-media-tools compose-mode-panel compose-audio-panel">' +
          '<div class="compose-media-actions">' +
            '<button type="button" class="unobtrusive-icon-button compose-media-btn compose-media-btn-primary" data-compose-action="audio-record-toggle">' + (state.compose.audioRecording ? 'Stop Recording' : 'Start Recording') + '</button>' +
            '<button type="button" class="unobtrusive-icon-button compose-media-btn" data-compose-action="open-mode-picker" data-compose-mode-target="audio-note">Upload Audio File</button>' +
          '</div>' +
          '<div class="compose-audio-status">' + audioStatus + '</div>' +
        '</div>';
    }
    if (type === 'link-share') {
      return '' +
        '<div class="compose-media-tools compose-mode-panel">' +
          '<div class="compose-link-fields">' +
            '<label><strong>Link URL</strong></label>' +
            '<input type="url" data-compose-field="link-url" placeholder="https://example.com" value="' + escapeHtml(fields.linkUrl) + '">' +
            '<label><strong>Body</strong></label>' +
            '<textarea rows="3" data-compose-field="link-body" placeholder="Optional note">' + escapeHtml(fields.linkBody) + '</textarea>' +
          '</div>' +
        '</div>';
    }
    return '';
  }

  function applyComposeModeEffects(postType) {
    var type = normalizeComposePostType(postType);
    root.classList.remove('blog-camera-mode');
    if (!state.compose.open || type !== 'capture-media') {
      stopComposeCameraStream();
    } else {
      ensureComposeCameraStream();
      attachComposeCameraPreview();
    }
    if (!state.compose.open || type !== 'audio-note') {
      stopComposeAudioStream();
    } else {
      ensureComposeAudioStream();
    }
  }

  function renderComposePreviewHtml(title, content) {
    var body = String(content || '').trim();
    var heading = String(title || '').trim();
    if (!body && !heading) {
      return '<p class="placeholder">Preview will appear here...</p>';
    }
    var html = '';
    if (heading) {
      html += '<h2>' + escapeHtml(heading) + '</h2>';
    }
    if (body) {
      html += markdownBlock(body);
    }
    return html;
  }

  function composeTrashIconSvg() {
    return '<svg class="trash-icon-svg" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>';
  }

  function readComposeFields() {
    if (!els.composeSlot) {
      return null;
    }
    var title = els.composeSlot.querySelector('[data-compose-field="title"]');
    var content = els.composeSlot.querySelector('[data-compose-field="content"]');
    var scheduled = els.composeSlot.querySelector('[data-compose-field="scheduled-at"]');
    var tags = els.composeSlot.querySelector('[data-compose-field="tags"]');
    var linkUrl = els.composeSlot.querySelector('[data-compose-field="link-url"]');
    var linkBody = els.composeSlot.querySelector('[data-compose-field="link-body"]');
    return {
      title: title instanceof HTMLInputElement ? String(title.value || '') : '',
      content: content instanceof HTMLTextAreaElement ? String(content.value || '') : '',
      scheduledAt: scheduled instanceof HTMLInputElement ? String(scheduled.value || '') : '',
      tags: tags instanceof HTMLInputElement ? String(tags.value || '') : '',
      linkUrl: linkUrl instanceof HTMLInputElement ? String(linkUrl.value || '') : String(state.compose.linkUrl || ''),
      linkBody: linkBody instanceof HTMLTextAreaElement ? String(linkBody.value || '') : String(state.compose.linkBody || ''),
      postType: composePostType()
    };
  }

  function composePayload(action) {
    commitComposeTagInput();
    var fields = readComposeFields();
    if (!fields) {
      return null;
    }
    var payloadContent = fields.content;
    if (fields.postType === 'link-share') {
      var linkMd = composeBuildLinkMarkdown(fields.linkUrl, fields.linkBody, fields.title);
      if (linkMd) {
        payloadContent = linkMd;
      }
      state.compose.linkUrl = String(fields.linkUrl || '');
      state.compose.linkBody = String(fields.linkBody || '');
    }
    return {
      action: action,
      draft_id: String(state.compose.draftId || ''),
      title: fields.title.trim(),
      tags: fields.tags.trim(),
      summary: '',
      content: payloadContent,
      post_type: fields.postType,
      scheduled_at: composeLocalToIso(fields.scheduledAt),
      publish_mode: composePublishMode(),
      publish_destination: composePublishDestination()
    };
  }

  function setComposeOutput(message, tone) {
    state.compose.output = String(message || '');
    state.compose.outputTone = String(tone || '');
  }

  function queueComposeAutosave() {
    if (!isAdmin() || !state.compose.open) {
      return;
    }
    if (state.compose.autosaveTimer) {
      clearTimeout(state.compose.autosaveTimer);
    }
    state.compose.saveStatus = 'saving';
    renderComposeStatusOnly();
    state.compose.autosaveTimer = setTimeout(function () {
      state.compose.autosaveTimer = null;
      autosaveCompose();
    }, 1500);
  }

  function afterComposePublishSuccess() {
    state.compose.draftId = '';
    state.compose.postTypeChosen = false;
    state.compose.saveStatus = '';
    state.compose.uploading = 0;
    state.compose.postType = 'longform';
    state.compose.tagsOpen = false;
    state.compose.publishDestination = 'local_only';
    state.compose.shortformLimitEditing = false;
    state.compose.linkUrl = '';
    state.compose.linkBody = '';
    stopComposeCameraStream();
    stopComposeAudioStream();
    setComposeTags([]);
    var fields = readComposeFields();
    if (!fields || !els.composeSlot) {
      return;
    }
    var title = els.composeSlot.querySelector('[data-compose-field="title"]');
    var content = els.composeSlot.querySelector('[data-compose-field="content"]');
    var schedule = els.composeSlot.querySelector('[data-compose-field="scheduled-at"]');
    var immediateMode = els.composeSlot.querySelector('input[name="blog-inline-compose-mode"][value="immediate"]');
    if (title instanceof HTMLInputElement) {
      title.value = '';
    }
    if (content instanceof HTMLTextAreaElement) {
      content.value = '';
    }
    if (schedule instanceof HTMLInputElement) {
      schedule.value = '';
    }
    if (immediateMode instanceof HTMLInputElement) {
      immediateMode.checked = true;
    }
    var localOnlyTarget = els.composeSlot.querySelector('input[name="blog-inline-compose-destination"][value="local_only"]');
    if (localOnlyTarget instanceof HTMLInputElement) {
      localOnlyTarget.checked = true;
    }
  }

  function saveCompose(action) {
    if (state.compose.busy || !isAdmin()) {
      return;
    }
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      setComposeOutput('Sign in again to compose posts.', 'error');
      renderComposeStatusOnly();
      return;
    }
    var payload = composePayload(action);
    if (!payload) {
      return;
    }
    if (action === 'publish_now' && !payload.content.trim()) {
      setComposeOutput('Cannot publish an empty post.', 'warn');
      renderComposeStatusOnly();
      return;
    }
    if (action === 'queue_scheduled' && !payload.scheduled_at) {
      setComposeOutput('Scheduled posts need a release date/time.', 'warn');
      renderComposeStatusOnly();
      return;
    }
    payload.session_token = auth.session_token;
    payload.csrf_token = auth.csrf_token;
    state.compose.busy = true;
    state.compose.saveStatus = action === 'autosave' ? 'saving' : '';
    renderComposeStatusOnly();
    apiPost('/cgi/blog-save-post', payload).then(function (data) {
      if (data && data.draft_id) {
        state.compose.draftId = String(data.draft_id);
      }
      if (action === 'autosave') {
        state.compose.saveStatus = 'saved';
        renderComposeStatusOnly();
        return;
      }
      if (action === 'publish_now') {
        setComposeOutput('Published. Rebuild may take a few seconds.', 'ok');
        afterComposePublishSuccess();
      } else {
        setComposeOutput((data && data.message) || 'Saved.', 'ok');
      }
      renderComposeUi();
      loadPosts();
      setTimeout(function () { loadPosts(); }, 2500);
    }).catch(function (err) {
      var message = err && err.message ? err.message : 'Save failed';
      if (action === 'autosave') {
        state.compose.saveStatus = 'error';
      } else {
        setComposeOutput('Error: ' + message, 'error');
      }
      renderComposeStatusOnly();
    }).finally(function () {
      state.compose.busy = false;
      renderComposeStatusOnly();
    });
  }

  function clearComposeFields() {
    state.compose.draftId = '';
    state.compose.postTypeChosen = false;
    state.compose.saveStatus = '';
    state.compose.uploading = 0;
    state.compose.postType = 'longform';
    state.compose.tagsOpen = false;
    state.compose.publishDestination = 'local_only';
    state.compose.shortformLimitEditing = false;
    state.compose.linkUrl = '';
    state.compose.linkBody = '';
    stopComposeCameraStream();
    stopComposeAudioStream();
    setComposeOutput('', '');
    setComposeTags([]);
    if (!els.composeSlot) {
      renderComposeStatusOnly();
      return;
    }
    var title = els.composeSlot.querySelector('[data-compose-field="title"]');
    var content = els.composeSlot.querySelector('[data-compose-field="content"]');
    var schedule = els.composeSlot.querySelector('[data-compose-field="scheduled-at"]');
    var immediateMode = els.composeSlot.querySelector('input[name="blog-inline-compose-mode"][value="immediate"]');
    if (title instanceof HTMLInputElement) {
      title.value = '';
    }
    if (content instanceof HTMLTextAreaElement) {
      content.value = '';
    }
    if (schedule instanceof HTMLInputElement) {
      schedule.value = '';
    }
    if (immediateMode instanceof HTMLInputElement) {
      immediateMode.checked = true;
    }
    var localOnlyTarget = els.composeSlot.querySelector('input[name="blog-inline-compose-destination"][value="local_only"]');
    if (localOnlyTarget instanceof HTMLInputElement) {
      localOnlyTarget.checked = true;
    }
    renderComposeUi();
  }

  function deleteComposeDraft() {
    var fields = readComposeFields() || { title: '', content: '' };
    var hasContent = !!String(fields.title || '').trim() ||
      !!String(fields.content || '').trim() ||
      !!String(fields.linkUrl || '').trim() ||
      !!String(fields.linkBody || '').trim() ||
      state.compose.tags.length > 0 ||
      !!state.compose.draftId;
    if (hasContent && !window.confirm('Delete this draft?')) {
      return;
    }
    if (!state.compose.draftId) {
      clearComposeFields();
      return;
    }
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      setComposeOutput('Sign in again to delete draft.', 'error');
      renderComposeStatusOnly();
      return;
    }
    state.compose.busy = true;
    renderComposeStatusOnly();
    apiPost('/cgi/blog-delete-draft', {
      draft_id: String(state.compose.draftId || ''),
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function () {
      clearComposeFields();
      setComposeOutput('Draft deleted.', 'ok');
      renderComposeStatusOnly();
    }).catch(function (err) {
      setComposeOutput('Error: ' + ((err && err.message) ? err.message : 'Delete failed'), 'error');
      renderComposeStatusOnly();
    }).finally(function () {
      state.compose.busy = false;
      renderComposeStatusOnly();
    });
  }

  function autosaveCompose() {
    var payload = composePayload('autosave');
    if (!payload) {
      return;
    }
    if (!payload.title.trim() && !payload.content.trim()) {
      state.compose.saveStatus = '';
      renderComposeStatusOnly();
      return;
    }
    saveCompose('autosave');
  }

  function setComposeOpen(open) {
    ensureComposeStateShape();
    state.compose.open = !!open;
    if (!state.compose.open) {
      clearComposePostTypeCollapseTimer();
      state.compose.postTypeToolbarCollapsed = false;
    } else {
      state.compose.postTypeToolbarCollapsed = false;
      state.compose.postTypeChosen = false;
    }
    try {
      renderComposeUi();
    } catch (err) {
      state.compose.open = false;
      clearComposePostTypeCollapseTimer();
      stopComposeCameraStream();
      stopComposeAudioStream();
      if (window && window.console && typeof window.console.error === 'function') {
        window.console.error('Compose render failed', err);
      }
      if (els.composeSlot) {
        els.composeSlot.hidden = true;
        els.composeSlot.classList.remove('is-open');
        els.composeSlot.innerHTML = '';
      }
      if (els.composeFab) {
        els.composeFab.classList.remove('is-open');
        els.composeFab.setAttribute('aria-expanded', 'false');
        els.composeFab.setAttribute('aria-pressed', 'false');
        els.composeFab.setAttribute('aria-label', 'Compose');
      }
      setComposeOutput('Compose failed to open. Reload and try again.', 'error');
      return;
    }
    if (state.compose.open && els.composeSlot) {
      setTimeout(function () {
        if (els.composeSlot && typeof els.composeSlot.scrollIntoView === 'function') {
          try {
            els.composeSlot.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
          } catch (_err) {
            els.composeSlot.scrollIntoView(true);
          }
        }
        var focusTarget = els.composeSlot.querySelector('[data-compose-action="toggle-post-type-toolbar"]');
        if (!state.compose.postTypeChosen) {
          focusTarget = els.composeSlot.querySelector('[data-compose-post-type]');
        } else if (!focusTarget) {
          focusTarget = els.composeSlot.querySelector('[data-compose-field="title"]');
        }
        if (focusTarget && typeof focusTarget.focus === 'function') {
          focusTarget.focus();
        }
      }, 30);
    }
  }

  function toggleComposeFromUi(nextOpen) {
    var now = Date.now();
    if (now < composeToggleGuardUntil) {
      return;
    }
    composeToggleGuardUntil = now + 120;
    setComposeOpen(!!nextOpen);
  }

  function composeToolbarAction(action) {
    if (!els.composeSlot) {
      return;
    }
    var textarea = els.composeSlot.querySelector('[data-compose-field="content"]');
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return;
    }
    function placeCursor(start, end) {
      textarea.focus();
      textarea.setSelectionRange(start, end);
    }
    function replaceSelection(transformer) {
      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;
      var selected = textarea.value.slice(start, end);
      var updated = transformer(selected);
      var prefix = textarea.value.slice(0, start);
      var suffix = textarea.value.slice(end);
      textarea.value = prefix + updated.text + suffix;
      placeCursor(start + updated.cursorStart, start + updated.cursorEnd);
    }
    function replaceSelectedLines(transformer) {
      var value = textarea.value;
      var selStart = textarea.selectionStart;
      var selEnd = textarea.selectionEnd;
      var lineStart = value.lastIndexOf('\n', Math.max(0, selStart - 1)) + 1;
      var lineEndIdx = value.indexOf('\n', selEnd);
      var lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
      var source = value.slice(lineStart, lineEnd);
      var lines = source.split('\n');
      var result = transformer(lines);
      if (!result || !Array.isArray(result.lines)) {
        return;
      }
      var next = result.lines.join('\n');
      textarea.value = value.slice(0, lineStart) + next + value.slice(lineEnd);
      placeCursor(lineStart, lineStart + next.length);
    }

    if (action === 'bold' || action === 'italic' || action === 'code') {
      var token = action === 'bold' ? '**' : (action === 'italic' ? '*' : '`');
      replaceSelection(function (selected) {
        var s = selected || 'text';
        if (s.startsWith(token) && s.endsWith(token)) {
          var unwrapped = s.slice(token.length, s.length - token.length);
          return { text: unwrapped, cursorStart: 0, cursorEnd: unwrapped.length };
        }
        var wrapped = token + s + token;
        return { text: wrapped, cursorStart: token.length, cursorEnd: token.length + s.length };
      });
    } else if (action === 'h2' || action === 'h3') {
      var heading = action === 'h2' ? '## ' : '### ';
      replaceSelectedLines(function (lines) {
        var line = lines[0] || '';
        var stripped = line.replace(/^#{1,6}\s+/, '');
        lines[0] = line.startsWith(heading) ? stripped : (heading + stripped);
        return { lines: lines };
      });
    } else if (action === 'quote' || action === 'ul') {
      var prefix = action === 'quote' ? '> ' : '- ';
      replaceSelectedLines(function (lines) {
        var nonEmpty = lines.filter(function (line) { return line.trim() !== ''; });
        var allHave = nonEmpty.length > 0 && nonEmpty.every(function (line) {
          return line.startsWith(prefix);
        });
        return {
          lines: lines.map(function (line) {
            if (line.trim() === '') {
              return line;
            }
            if (allHave) {
              return line.startsWith(prefix) ? line.slice(prefix.length) : line;
            }
            return prefix + line;
          })
        };
      });
    } else if (action === 'ol') {
      replaceSelectedLines(function (lines) {
        var nonEmpty = lines.filter(function (line) { return line.trim() !== ''; });
        var allOrdered = nonEmpty.length > 0 && nonEmpty.every(function (line) {
          return /^\d+\.\s+/.test(line);
        });
        var index = 1;
        return {
          lines: lines.map(function (line) {
            if (line.trim() === '') {
              return line;
            }
            if (allOrdered) {
              return line.replace(/^\d+\.\s+/, '');
            }
            var text = line.replace(/^\d+\.\s+/, '').replace(/^-+\s+/, '');
            var out = index + '. ' + text;
            index += 1;
            return out;
          })
        };
      });
    } else if (action === 'code_block') {
      replaceSelection(function (selected) {
        var source = selected || '';
        if (/^```[\s\S]*```$/.test(source.trim())) {
          var unwrapped = source.trim().replace(/^```[\n]?/, '').replace(/\n?```$/, '');
          return { text: unwrapped, cursorStart: 0, cursorEnd: unwrapped.length };
        }
        var wrapped = '```\n' + source + '\n```';
        return { text: wrapped, cursorStart: 4, cursorEnd: wrapped.length - 4 };
      });
    } else if (action === 'link') {
      replaceSelection(function (selected) {
        var label = selected || 'link text';
        var text = '[' + label + '](https://)';
        var start = text.indexOf('https://');
        return { text: text, cursorStart: start, cursorEnd: start + 8 };
      });
    } else if (action === 'image') {
      replaceSelection(function (selected) {
        var label = selected || 'image';
        var text = '![' + label + '](https://)';
        var start = text.indexOf('https://');
        return { text: text, cursorStart: start, cursorEnd: start + 8 };
      });
    } else if (action === 'attachment') {
      openComposePickerForType('attachment');
      return;
    }

    queueComposeAutosave();
    renderComposeUi();
  }

  function renderComposeUi() {
    ensureComposeStateShape();
    ensureComposeHosts();
    if (!els.composeSlot || !els.composeFab) {
      return;
    }
    var admin = isAdmin();
    els.composeFab.hidden = !admin;
    if (!admin) {
      state.compose.open = false;
      applyComposeModeEffects('longform');
      els.composeSlot.hidden = true;
      els.composeSlot.classList.remove('is-open');
      els.composeSlot.innerHTML = '';
      return;
    }
    els.composeFab.classList.toggle('is-open', state.compose.open);
    els.composeFab.setAttribute('aria-expanded', state.compose.open ? 'true' : 'false');
    els.composeFab.setAttribute('aria-pressed', state.compose.open ? 'true' : 'false');
    els.composeFab.setAttribute('aria-label', state.compose.open ? 'Close compose' : 'Compose');
    if (!state.compose.open) {
      applyComposeModeEffects('longform');
      els.composeSlot.classList.remove('is-open');
      setTimeout(function () {
        if (!state.compose.open && els.composeSlot) {
          els.composeSlot.hidden = true;
          els.composeSlot.innerHTML = '';
        }
      }, 240);
      return;
    }

    var fields = readComposeFields() || {
      title: '',
      content: '',
      scheduledAt: '',
      tags: '',
      linkUrl: String(state.compose.linkUrl || ''),
      linkBody: String(state.compose.linkBody || ''),
      postType: composePostType()
    };
    var mode = composePublishMode();
    var destination = composePublishDestination();
    var postType = normalizeComposePostType(fields.postType);
    if (postType !== 'shortform') {
      state.compose.shortformLimitEditing = false;
    }
    state.compose.postType = postType;
    state.compose.publishDestination = destination;
    state.compose.linkUrl = String(fields.linkUrl || '');
    state.compose.linkBody = String(fields.linkBody || '');
    var waitingForPostType = !state.compose.postTypeChosen;
    if (waitingForPostType) {
      var chooseHeadRowClass = 'field-row blog-compose-head-row is-type-picker-only';
      var chooseTypeControlClass = 'compose-post-type-control';
      els.composeSlot.hidden = false;
      els.composeSlot.innerHTML = '' +
        '<article class="post-item blog-post-item blog-compose-card blog-compose-type-only">' +
          '<div class="blog-compose-body">' +
            '<div class="' + chooseHeadRowClass + '" data-compose-head-row>' +
              '<div class="' + chooseTypeControlClass + '" data-compose-type-control>' +
                '<button type="button" class="compose-post-type-current-btn unobtrusive-icon-button" data-compose-action="toggle-post-type-toolbar" aria-label="Choose post type" title="Choose post type">' + composePostTypeIconSvg(postType) + '</button>' +
                '<div class="compose-post-type-toolbar-wrap"><div class="compose-post-type-row">' + composeTypeButtonsHtml(postType) + '</div></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</article>';
      els.composeSlot.classList.add('is-open');
      requestAnimationFrame(function () {
        if (els.composeSlot) {
          els.composeSlot.classList.add('is-open');
        }
      });
      return;
    }
    if (postType === 'shortform') {
      enforceComposeShortformLimitOnFields(fields);
      var shortLimit = currentComposeShortformLimit();
      if (String(fields.content || '').length > shortLimit) {
        fields.content = String(fields.content || '').slice(0, shortLimit);
      }
    }
    var previewContent = fields.content;
    if (postType === 'link-share') {
      var linkPreview = composeBuildLinkMarkdown(fields.linkUrl, fields.linkBody, fields.title);
      if (linkPreview) {
        previewContent = linkPreview;
      }
    }
    var previewHtml = renderComposePreviewHtml(fields.title, previewContent);
    var contentLabel = composePostTypeIsTextual(postType) ? 'Content' : 'Body';
    var contentPlaceholder = '# Write in Markdown';
    if (postType === 'shortform') {
      contentPlaceholder = 'Write a short post...';
    } else if (postType === 'link-share') {
      contentPlaceholder = 'Optional commentary...';
    } else if (postType === 'capture-media') {
      contentPlaceholder = 'Optional caption for captured media...';
    } else if (postType === 'upload-media') {
      contentPlaceholder = 'Optional caption for uploaded media...';
    } else if (postType === 'attachment') {
      contentPlaceholder = 'Optional note for attached files...';
    } else if (postType === 'audio-note') {
      contentPlaceholder = 'Optional note for uploaded audio...';
    }
    var titlePlaceholder = 'Post title';
    if (postType === 'shortform') {
      titlePlaceholder = 'Short post';
    } else if (postType === 'link-share') {
      titlePlaceholder = 'Link title (optional)';
    } else if (postType === 'capture-media' || postType === 'upload-media') {
      titlePlaceholder = 'Media title (optional)';
    }
    var mediaToolsHtml = composeModePanelHtml(postType, fields);
    var previewIslandLayout = !!(state.compose.preview && window.matchMedia && window.matchMedia('(min-width: 1220px)').matches);
    var headRowClass = 'field-row blog-compose-head-row' + (state.compose.postTypeToolbarCollapsed ? ' is-type-collapsed' : '');
    var typeControlClass = state.compose.postTypeToolbarCollapsed ? 'compose-post-type-control is-collapsed' : 'compose-post-type-control';
    var editorBlockHtml = '' +
      '<div class="field-row">' +
        '<label><strong>' + escapeHtml(contentLabel) + '</strong></label>' +
        '<div class="editor-shell blog-compose-editor-shell">' +
          composeToolbarHtml() +
          '<textarea data-compose-field="content" rows="' + String(composeTextareaRows(postType)) + '"' + (postType === 'shortform' ? (' maxlength="' + escapeHtml(String(currentComposeShortformLimit())) + '"') : '') + ' placeholder="' + escapeHtml(contentPlaceholder) + '">' + escapeHtml(fields.content) + '</textarea>' +
        '</div>' +
        (postType === 'shortform' ? composeShortformMeterHtml(fields.content) : '') +
      '</div>';
    var contentPaneHtml = '';
    if (state.compose.preview && !previewIslandLayout) {
      contentPaneHtml = '<div class="preview-box blog-compose-preview">' + previewHtml + '</div>' +
        '<textarea data-compose-field="content" rows="14" hidden>' + escapeHtml(fields.content) + '</textarea>';
    } else {
      contentPaneHtml = editorBlockHtml;
    }
    var tagsHtml = state.compose.tags.map(function (tag) {
      return '<span class="tag-pill"><span>' + escapeHtml(tag) + '</span><button type="button" class="tag-pill-remove" data-compose-action="remove-tag" data-compose-tag="' + escapeHtml(tag) + '" aria-label="Remove tag ' + escapeHtml(tag) + '">×</button></span>';
    }).join('');
    var outputClass = 'output';
    if (state.compose.outputTone) {
      outputClass += ' ' + state.compose.outputTone;
    }
    var composeCardClass = 'post-item blog-post-item blog-compose-card' + (previewIslandLayout ? ' is-wide-preview' : '');
    var previewIslandHtml = previewIslandLayout
      ? '<aside class="blog-compose-side-preview"><label><strong>Preview</strong></label><div class="preview-box blog-compose-preview">' + previewHtml + '</div></aside>'
      : '';

    els.composeSlot.hidden = false;
    els.composeSlot.innerHTML = '' +
      '<article class="' + composeCardClass + '">' +
        '<div class="blog-compose-main-shell">' +
          '<div class="blog-compose-body">' +
            '<div class="' + headRowClass + '" data-compose-head-row>' +
              '<div class="' + typeControlClass + '" data-compose-type-control>' +
                '<button type="button" class="compose-post-type-current-btn unobtrusive-icon-button" data-compose-action="toggle-post-type-toolbar" aria-label="Choose post type" title="Choose post type">' + composePostTypeIconSvg(postType) + '</button>' +
                '<div class="compose-post-type-toolbar-wrap"><div class="compose-post-type-row">' + composeTypeButtonsHtml(postType) + '</div></div>' +
              '</div>' +
              '<div class="compose-nostr-target-row">' + composeNostrPillsHtml(postType) + '</div>' +
              '<button type="button" class="list-admin-primary-btn blog-compose-preview-toggle blog-compose-btn" data-compose-action="toggle-preview" aria-label="' + (state.compose.preview ? 'Edit' : 'Preview') + '" title="' + (state.compose.preview ? 'Edit' : 'Preview') + '">' + composePreviewToggleIconSvg() + '<span class="sr-only">' + (state.compose.preview ? 'Edit' : 'Preview') + '</span></button>' +
            '</div>' +
            '<div class="field-row blog-compose-title-row">' +
              '<input type="text" data-compose-field="title" placeholder="' + escapeHtml(titlePlaceholder) + '" value="' + escapeHtml(fields.title) + '">' +
            '</div>' +
            mediaToolsHtml +
            contentPaneHtml +
            '<input type="file" data-compose-field="capture-upload" data-compose-upload="capture-media" accept="image/*,video/*" capture="environment" multiple hidden>' +
            '<input type="file" data-compose-field="media-upload" data-compose-upload="upload-media" accept="image/*,video/*" multiple hidden>' +
            '<input type="file" data-compose-field="file-upload" data-compose-upload="attachment" multiple hidden>' +
            '<input type="file" data-compose-field="audio-upload" data-compose-upload="audio-note" accept="audio/*" multiple hidden>' +
            '<div class="grid-two">' +
              '<div class="field-row">' +
                '<label><strong>Tags</strong></label>' +
                '<input type="hidden" data-compose-field="tags" value="' + escapeHtml(fields.tags) + '">' +
                (state.compose.tagsOpen
                  ? '<div class="tag-editor' + (state.compose.tags.length ? ' has-tags' : '') + '" role="group" aria-label="Post tags">' +
                      '<div class="tag-editor-pills">' + tagsHtml + '</div>' +
                      '<input type="text" class="tag-editor-input" data-compose-field="tags-input" placeholder="tag, tag, tag">' +
                      '<button type="button" class="unobtrusive-icon-button compose-tags-toggle" data-compose-action="toggle-tags" aria-expanded="true">Hide tags</button>' +
                    '</div>'
                  : '<button type="button" class="unobtrusive-icon-button compose-tags-toggle" data-compose-action="toggle-tags" aria-expanded="false">+tags</button>') +
              '</div>' +
            '</div>' +
            '<div class="field-row compose-release-row">' +
              '<strong>Release Mode</strong>' +
              '<div class="mode-row">' +
                '<label><input type="radio" name="blog-inline-compose-mode" value="immediate"' + (mode === 'immediate' ? ' checked' : '') + '> Immediate</label>' +
                '<label><input type="radio" name="blog-inline-compose-mode" value="scheduled"' + (mode === 'scheduled' ? ' checked' : '') + '> Scheduled Date</label>' +
                '<label><input type="radio" name="blog-inline-compose-mode" value="drip"' + (mode === 'drip' ? ' checked' : '') + '> Drip Queue</label>' +
              '</div>' +
            '</div>' +
            '<div class="field-row compose-destination-row">' +
              '<strong>Publish Destination</strong>' +
              '<div class="mode-row">' +
                '<label><input type="radio" name="blog-inline-compose-destination" value="local_only"' + (destination === 'local_only' ? ' checked' : '') + '> Publish to server only</label>' +
                '<label><input type="radio" name="blog-inline-compose-destination" value="nostr_now"' + (destination === 'nostr_now' ? ' checked' : '') + '> Publish to Nostr now</label>' +
              '</div>' +
            '</div>' +
            '<div class="field-row scheduled-row' + (mode === 'scheduled' ? '' : ' is-hidden') + '">' +
              '<label><strong>Scheduled Release Date/Time</strong></label>' +
              '<input type="datetime-local" data-compose-field="scheduled-at" value="' + escapeHtml(fields.scheduledAt) + '">' +
            '</div>' +
          '</div>' +
          previewIslandHtml +
        '</div>' +
        '<div class="compose-footer blog-compose-footer">' +
          '<div class="compose-actions blog-compose-footer-actions">' +
            '<button type="button" class="icon-danger unobtrusive-icon-button blog-compose-delete" data-compose-action="delete" aria-label="Delete draft" title="Delete draft"' + (state.compose.busy ? ' disabled aria-disabled="true"' : '') + '>' + composeTrashIconSvg() + '</button>' +
            '<button type="button" class="list-admin-primary-btn blog-compose-btn" data-compose-action="publish"' + (state.compose.busy ? ' disabled aria-disabled="true"' : '') + '>' + escapeHtml(composePrimaryLabel(mode, destination)) + '</button>' +
          '</div>' +
          '<div class="blog-compose-status-row">' +
            '<div class="autosave-indicator' + (state.compose.saveStatus === 'saving' ? ' is-saving' : '') + (state.compose.saveStatus === 'error' ? ' is-error' : '') + '"' + (state.compose.saveStatus ? '' : ' hidden') + '>' + (state.compose.saveStatus === 'saving' ? 'Saving...' : (state.compose.saveStatus === 'error' ? 'Save failed' : 'Saved')) + '</div>' +
            '<div class="' + outputClass + '">' + escapeHtml(state.compose.output) + '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
    els.composeSlot.classList.add('is-open');
    requestAnimationFrame(function () {
      applyComposeModeEffects(postType);
    });
  }

  function renderComposeStatusOnly() {
    if (!els.composeSlot || !state.compose.open) {
      return;
    }
    var mode = composePublishMode();
    var destination = composePublishDestination();
    state.compose.publishDestination = destination;
    var publishBtn = els.composeSlot.querySelector('[data-compose-action="publish"]');
    if (publishBtn instanceof HTMLButtonElement) {
      publishBtn.textContent = composePrimaryLabel(mode, destination);
      publishBtn.disabled = !!state.compose.busy || state.compose.uploading > 0;
    }
    var scheduledRow = els.composeSlot.querySelector('.scheduled-row');
    if (scheduledRow) {
      scheduledRow.classList.toggle('is-hidden', mode !== 'scheduled');
    }
    var output = els.composeSlot.querySelector('.output');
    if (output) {
      output.textContent = state.compose.output || '';
      output.className = 'output' + (state.compose.outputTone ? (' ' + state.compose.outputTone) : '');
    }
    var autosave = els.composeSlot.querySelector('.autosave-indicator');
    if (autosave) {
      var modeStatus = String(state.compose.saveStatus || '');
      if (state.compose.uploading > 0) {
        autosave.hidden = false;
        autosave.classList.remove('is-error');
        autosave.classList.add('is-saving');
        autosave.textContent = 'Uploading...';
        return;
      }
      autosave.hidden = !modeStatus;
      autosave.classList.toggle('is-saving', modeStatus === 'saving');
      autosave.classList.toggle('is-error', modeStatus === 'error');
      autosave.textContent = modeStatus === 'saving' ? 'Saving...' : (modeStatus === 'error' ? 'Save failed' : 'Saved');
    }
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
    var hasFilters = state.filters.tags.size || state.filters.years.size || state.filters.types.size;

    if (!shown.length) {
      els.list.innerHTML = '';
      if (!state.posts.length && !hasFilters) {
        els.empty.textContent = 'No posts published yet.';
      } else {
        els.empty.textContent = 'No posts match these filters.';
      }
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
    renderComposeUi();
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
      var savedAt = Number(parsed && parsed.saved_at || 0);
      if (!isFinite(savedAt) || savedAt <= 0 || (Date.now() - savedAt) > POSTS_CACHE_MAX_AGE_MS) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
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
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        posts: posts || [],
        saved_at: Date.now()
      }));
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function renderSignature() {
    function sortedSet(setObj) {
      return Array.from(setObj || []).sort();
    }
    return JSON.stringify({
      payload: (state.payload && state.payload.state) ? state.payload.state : null,
      posts: Array.isArray(state.posts) ? state.posts : [],
      filters: {
        tags: sortedSet(state.filters.tags),
        years: sortedSet(state.filters.years),
        types: sortedSet(state.filters.types)
      }
    });
  }

  function loadPageState(options) {
    var opts = options || {};
    var expectedSlug = slugFromPath(window.location.pathname || '/');
    var requestedSlug = expectedSlug || slug;
    if (expectedSlug && !slugsEquivalent(expectedSlug, slug)) {
      maybeRepairRoute('blog-root-slug-mismatch');
      return Promise.resolve();
    }
    var auth = authPayload();
    return apiPost('/cgi/blog-get-nostr-page', {
      page_slug: requestedSlug,
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (data) {
      var pageType = String(data && data.page_type || '').trim().toLowerCase();
      if (pageType && pageType !== 'blog') {
        maybeRepairRoute('blog-template-page-type-mismatch:' + pageType);
        return;
      }
      state.payload = data;
      applyDefaultFilters();
      if (!opts.deferRender) {
        renderAll();
      }
    }).catch(function (err) {
      var message = String(err && err.message || '');
      if (/unknown nostr page slug/i.test(message) || /unknown_page/i.test(message)) {
        maybeRepairRoute('unknown-page-slug');
      }
      if (!opts.deferRender) {
        renderAll();
      }
    }).finally(function () {
      if (!opts.deferInitialFlags) {
        state.initialPageStateLoaded = true;
        maybeMarkInitialContentPainted();
      }
    });
  }

  function loadPosts(options) {
    var opts = options || {};
    state.postsLoading = true;
    if (!opts.deferRender) {
      renderList();
    }
    return fetch('/cgi/blog-list-public-posts', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success || !Array.isArray(data.posts)) {
          return;
        }
        state.posts = data.posts;
        writeCache(state.posts);
        if (!opts.deferRender) {
          renderFilters();
          renderList();
        }
      })
      .catch(function () {
        // Keep cached posts if fetch fails.
      })
      .finally(function () {
        state.postsLoading = false;
        if (!opts.deferInitialFlags) {
          state.initialPostsLoaded = true;
          maybeMarkInitialContentPainted();
        }
        if (!opts.deferRender) {
          renderList();
        }
      });
  }

  root.addEventListener('click', function (event) {
    var composeFab = event.target && event.target.closest('[data-blog-action="toggle-compose"]');
    if (composeFab) {
      event.preventDefault();
      event.stopPropagation();
      toggleComposeFromUi(!state.compose.open);
      return;
    }

    var composeAction = event.target && event.target.closest('[data-compose-action]');
    if (composeAction) {
      event.preventDefault();
      var actionName = String(composeAction.getAttribute('data-compose-action') || '');
      if (actionName === 'toggle-preview') {
        state.compose.preview = !state.compose.preview;
        renderComposeUi();
        return;
      }
      if (actionName === 'set-post-type') {
        setComposePostType(String(composeAction.getAttribute('data-compose-post-type') || ''), { interactive: true });
        return;
      }
      if (actionName === 'toggle-post-type-toolbar') {
        if (!state.compose.postTypeChosen) {
          setComposePostTypeToolbarCollapsed(false);
          return;
        }
        if (state.compose.postTypeToolbarCollapsed) {
          setComposePostTypeToolbarCollapsed(false);
          scheduleComposePostTypeCollapse(2600);
        } else {
          setComposePostTypeToolbarCollapsed(true);
        }
        return;
      }
      if (actionName === 'publish') {
        saveCompose(composeModeAction(composePublishMode(), composePublishDestination()));
        return;
      }
      if (actionName === 'delete') {
        deleteComposeDraft();
        return;
      }
      if (actionName === 'remove-tag') {
        removeComposeTag(String(composeAction.getAttribute('data-compose-tag') || ''));
        renderComposeUi();
        queueComposeAutosave();
        return;
      }
      if (actionName === 'toggle-tags') {
        state.compose.tagsOpen = !state.compose.tagsOpen;
        renderComposeUi();
        return;
      }
      if (actionName === 'open-mode-picker') {
        openComposePickerForType(String(composeAction.getAttribute('data-compose-mode-target') || composePostType()));
        return;
      }
      if (actionName === 'capture-photo') {
        capturePhotoFromComposeCamera();
        return;
      }
      if (actionName === 'audio-record-toggle') {
        if (state.compose.audioRecording) {
          stopComposeAudioRecording();
        } else {
          startComposeAudioRecording();
        }
        return;
      }
      if (actionName === 'shortform-limit-toggle') {
        if (event.detail > 1) {
          return;
        }
        if (composePostType() !== 'shortform' || state.compose.shortformLimitEditing) {
          return;
        }
        var currentLimit = currentComposeShortformLimit();
        setComposeShortformLimit(currentLimit === 280 ? 140 : 280, { editing: false });
        return;
      }
      if (actionName === 'pick-capture-media' || actionName === 'pick-upload-media' || actionName === 'pick-upload-file' || actionName === 'pick-upload-audio') {
        var field = '';
        var type = '';
        if (actionName === 'pick-capture-media') {
          field = 'capture-upload';
          type = 'capture-media';
        } else if (actionName === 'pick-upload-media') {
          field = 'media-upload';
          type = 'upload-media';
        } else if (actionName === 'pick-upload-file') {
          field = 'file-upload';
          type = 'attachment';
        } else {
          type = 'audio-note';
          setComposePostType(type, { skipAutosave: true, interactive: true });
          return;
        }
        setComposePostType(type, { skipAutosave: true, skipRender: true });
        var picker = els.composeSlot.querySelector('[data-compose-field="' + field + '"]');
        if (picker instanceof HTMLInputElement) {
          picker.click();
        }
        return;
      }
    }

    var composeToolbar = event.target && event.target.closest('[data-compose-toolbar]');
    if (composeToolbar) {
      event.preventDefault();
      composeToolbarAction(String(composeToolbar.getAttribute('data-compose-toolbar') || ''));
      return;
    }

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
      if (action.getAttribute('data-blog-action') === 'toggle-page-settings') {
        setPageSettingsOpen(!state.pageSettingsOpen);
      }
    }
  });

  root.addEventListener('change', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    if (!target.matches('[data-blog-setting="default-tag"]')) {
      return;
    }
    var picked = String(target.value || '').trim();
    if (state.payload && state.payload.state) {
      state.payload.state.default_tag = picked;
    }
    state.defaultFiltersApplied = true;
    state.filters.tags.clear();
    state.filters.years.clear();
    state.filters.types.clear();
    if (picked) {
      state.filters.tags.add(picked);
    }
    renderFilters();
    renderList();
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    var navCompose = target.closest('.nav-compose');
    if (!navCompose) {
      return;
    }
    if (!isAdmin()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    toggleComposeFromUi(true);
  });

  root.addEventListener('dblclick', function (event) {
    var toggle = event.target && event.target.closest('[data-compose-action="shortform-limit-toggle"]');
    if (!toggle || !state.compose.open || composePostType() !== 'shortform') {
      return;
    }
    event.preventDefault();
    state.compose.shortformLimitEditing = true;
    renderComposeUi();
    if (els.composeSlot) {
      var input = els.composeSlot.querySelector('[data-compose-field="shortform-limit"]');
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    }
  });

  root.addEventListener('input', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement) || !state.compose.open) {
      return;
    }
    if (target.matches('[data-compose-field="shortform-limit"]')) {
      return;
    }
    if (target.matches('[data-compose-field="title"], [data-compose-field="content"], [data-compose-field="scheduled-at"], [data-compose-field="link-url"], [data-compose-field="link-body"]')) {
      if (target.matches('[data-compose-field="link-url"], [data-compose-field="link-body"]')) {
        if (target.matches('[data-compose-field="link-url"]')) {
          state.compose.linkUrl = String(target.value || '');
        } else {
          state.compose.linkBody = String(target.value || '');
        }
        if (composePostType() !== 'link-share') {
          state.compose.postType = 'link-share';
          state.compose.postTypeChosen = true;
        }
      }
      if (target.matches('[data-compose-field="content"]') && composePostType() === 'shortform') {
        enforceComposeShortformLimitOnFields();
        if (els.composeSlot) {
          var meterButton = els.composeSlot.querySelector('[data-compose-action="shortform-limit-toggle"]');
          if (meterButton instanceof HTMLButtonElement) {
            meterButton.textContent = String(target.value || '').length + '/' + String(currentComposeShortformLimit());
          }
        }
      }
      queueComposeAutosave();
      if (state.compose.preview) {
        renderComposeUi();
      } else {
        renderComposeStatusOnly();
      }
      return;
    }
    if (target.matches('input[name="blog-inline-compose-mode"], input[name="blog-inline-compose-destination"]')) {
      renderComposeUi();
      queueComposeAutosave();
    }
  });

  root.addEventListener('change', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLInputElement) || !state.compose.open) {
      return;
    }
    if (target.matches('[data-compose-field="shortform-limit"]')) {
      setComposeShortformLimit(target.value, { editing: false });
      return;
    }
    if (!target.matches('[data-compose-upload]')) {
      return;
    }
    var uploadType = String(target.getAttribute('data-compose-upload') || '').trim();
    var files = target.files ? Array.from(target.files) : [];
    if (!files.length) {
      return;
    }
    handleComposeUploads(files, uploadType).finally(function () {
      target.value = '';
    });
  });

  root.addEventListener('keydown', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement) || !state.compose.open) {
      return;
    }
    if (target.matches('[data-compose-field="shortform-limit"]')) {
      if (event.key === 'Enter') {
        event.preventDefault();
        setComposeShortformLimit(target.value, { editing: false });
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        state.compose.shortformLimitEditing = false;
        renderComposeUi();
        return;
      }
    }
    if (target.matches('[data-compose-field="tags-input"]')) {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        if (commitComposeTagInput()) {
          renderComposeUi();
          queueComposeAutosave();
        }
        return;
      }
      if (event.key === 'Backspace') {
        var input = target;
        if (!String(input.value || '').trim() && state.compose.tags.length) {
          removeComposeTag(state.compose.tags[state.compose.tags.length - 1]);
          renderComposeUi();
          queueComposeAutosave();
        }
      }
    }
  });

  root.addEventListener('focusout', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLInputElement) || !state.compose.open) {
      return;
    }
    if (!target.matches('[data-compose-field="shortform-limit"]')) {
      return;
    }
    if (!state.compose.shortformLimitEditing) {
      return;
    }
    setComposeShortformLimit(target.value, { editing: false });
  });

  document.addEventListener('paste', function (event) {
    if (!isAdmin()) {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    var images = clipboardImageFiles(event);
    if (!images.length) {
      return;
    }
    event.preventDefault();
    if (!state.compose.open) {
      setComposeOpen(true);
    }
    setComposePostType('upload-media', { skipAutosave: true, skipRender: true });
    handleComposeUploads(images, 'upload-media');
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

  window.addEventListener('beforeunload', function () {
    clearComposePostTypeCollapseTimer();
    stopComposeCameraStream();
    stopComposeAudioStream();
  });

  var composeResizeTimer = null;
  window.addEventListener('resize', function () {
    if (!state.compose.open || !state.compose.preview) {
      return;
    }
    if (composeResizeTimer) {
      window.clearTimeout(composeResizeTimer);
    }
    composeResizeTimer = window.setTimeout(function () {
      composeResizeTimer = null;
      if (state.compose.open && state.compose.preview) {
        renderComposeUi();
      }
    }, 120);
  });

  removeLegacyTitleBlock();
  ensureFilterGutterLayout();

  (function bootstrapOnce() {
    var cached = readCache();
    if (cached) {
      state.posts = cached;
    }
    state.postsLoading = false;
    renderAll();
    state.renderSignature = renderSignature();
    state.initialPageStateLoaded = true;
    state.initialPostsLoaded = true;
    markInitialContentPainted();

    Promise.allSettled([
      loadPageState({ deferRender: true, deferInitialFlags: true }),
      loadPosts({ deferRender: true, deferInitialFlags: true })
    ]).finally(function () {
      state.postsLoading = false;
      var nextSignature = renderSignature();
      if (state.renderSignature !== nextSignature) {
        state.renderSignature = nextSignature;
        renderAll();
      }
    });
  })();
})();
