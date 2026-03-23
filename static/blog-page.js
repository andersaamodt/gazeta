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
    initialContentPainted: false,
    initialPageStateLoaded: false,
    initialPostsLoaded: false,
    defaultFiltersApplied: false,
    filters: {
      tags: new Set(),
      years: new Set(),
      types: new Set()
    },
    compose: {
      open: false,
      preview: false,
      draftId: '',
      tags: [],
      autosaveTimer: null,
      busy: false,
      output: '',
      outputTone: '',
      saveStatus: ''
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
      fab.textContent = 'Compose';
      fab.hidden = true;
      root.appendChild(fab);
      els.composeFab = fab;
    }
  }

  function normalizeTagValue(tag) {
    return String(tag || '').trim().replace(/\s+/g, '-');
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

  function composePrimaryLabel(mode) {
    if (mode === 'scheduled') {
      return 'Schedule Post';
    }
    if (mode === 'drip') {
      return 'Enqueue Post';
    }
    return 'Publish Now';
  }

  function composeModeAction(mode) {
    if (mode === 'scheduled') {
      return 'queue_scheduled';
    }
    if (mode === 'drip') {
      return 'queue_drip';
    }
    return 'publish_now';
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

  function readComposeFields() {
    if (!els.composeSlot) {
      return null;
    }
    var title = els.composeSlot.querySelector('[data-compose-field="title"]');
    var content = els.composeSlot.querySelector('[data-compose-field="content"]');
    var scheduled = els.composeSlot.querySelector('[data-compose-field="scheduled-at"]');
    var tags = els.composeSlot.querySelector('[data-compose-field="tags"]');
    return {
      title: title instanceof HTMLInputElement ? String(title.value || '') : '',
      content: content instanceof HTMLTextAreaElement ? String(content.value || '') : '',
      scheduledAt: scheduled instanceof HTMLInputElement ? String(scheduled.value || '') : '',
      tags: tags instanceof HTMLInputElement ? String(tags.value || '') : ''
    };
  }

  function composePayload(action) {
    commitComposeTagInput();
    var fields = readComposeFields();
    if (!fields) {
      return null;
    }
    return {
      action: action,
      draft_id: String(state.compose.draftId || ''),
      title: fields.title.trim(),
      tags: fields.tags.trim(),
      summary: '',
      content: fields.content,
      scheduled_at: composeLocalToIso(fields.scheduledAt),
      publish_mode: composePublishMode()
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
    state.compose.saveStatus = '';
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
    state.compose.open = !!open;
    renderComposeUi();
    if (state.compose.open && els.composeSlot) {
      setTimeout(function () {
        var title = els.composeSlot.querySelector('[data-compose-field="title"]');
        if (title && typeof title.focus === 'function') {
          title.focus();
        }
      }, 30);
    }
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
    }

    queueComposeAutosave();
    renderComposeUi();
  }

  function renderComposeUi() {
    ensureComposeHosts();
    if (!els.composeSlot || !els.composeFab) {
      return;
    }
    var admin = isAdmin();
    els.composeFab.hidden = !admin;
    if (!admin) {
      state.compose.open = false;
      els.composeSlot.hidden = true;
      els.composeSlot.classList.remove('is-open');
      els.composeSlot.innerHTML = '';
      return;
    }
    els.composeFab.textContent = state.compose.open ? 'Close' : 'Compose';
    els.composeFab.setAttribute('aria-expanded', state.compose.open ? 'true' : 'false');
    if (!state.compose.open) {
      els.composeSlot.classList.remove('is-open');
      setTimeout(function () {
        if (!state.compose.open && els.composeSlot) {
          els.composeSlot.hidden = true;
          els.composeSlot.innerHTML = '';
        }
      }, 240);
      return;
    }

    var fields = readComposeFields() || { title: '', content: '', scheduledAt: '', tags: '' };
    var mode = composePublishMode();
    var previewHtml = renderComposePreviewHtml(fields.title, fields.content);
    var tagsHtml = state.compose.tags.map(function (tag) {
      return '<span class="tag-pill"><span>' + escapeHtml(tag) + '</span><button type="button" class="tag-pill-remove" data-compose-action="remove-tag" data-compose-tag="' + escapeHtml(tag) + '" aria-label="Remove tag ' + escapeHtml(tag) + '">×</button></span>';
    }).join('');
    var outputClass = 'output';
    if (state.compose.outputTone) {
      outputClass += ' ' + state.compose.outputTone;
    }

    els.composeSlot.hidden = false;
    els.composeSlot.innerHTML = '' +
      '<article class="post-item blog-post-item blog-compose-card">' +
        '<div class="post-head blog-compose-head">' +
          '<div class="post-head-main">' +
            '<h2 class="post-title">New post</h2>' +
          '</div>' +
          '<div class="blog-compose-head-actions">' +
            '<button type="button" class="list-admin-primary-btn blog-compose-preview-toggle" data-compose-action="toggle-preview">' + (state.compose.preview ? 'Edit' : 'Preview') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="blog-compose-body">' +
          '<div class="field-row"><label><strong>Post title</strong></label><input type="text" data-compose-field="title" placeholder="My post" value="' + escapeHtml(fields.title) + '"></div>' +
          (state.compose.preview
            ? '<div class="preview-box blog-compose-preview">' + previewHtml + '</div>'
            : '<div class="field-row">' +
                '<label><strong>Content</strong></label>' +
                '<div class="editor-shell blog-compose-editor-shell">' +
                  '<div class="toolbar blog-compose-toolbar" aria-label="Markdown toolbar">' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="bold" title="Bold">B</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="italic" title="Italic">I</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="h2" title="Heading 2">H2</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="h3" title="Heading 3">H3</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="code" title="Inline code">&lt;/&gt;</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="code_block" title="Code block">```</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="link" title="Insert link">Link</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="quote" title="Quote">Quote</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="ul" title="Bullet list">• List</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="ol" title="Numbered list">1. List</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="image" title="Insert image">Image</button>' +
                  '</div>' +
                  '<textarea data-compose-field="content" rows="14" placeholder="# Write in Markdown">' + escapeHtml(fields.content) + '</textarea>' +
                '</div>' +
              '</div>') +
          '<div class="grid-two">' +
            '<div class="field-row">' +
              '<label><strong>Tags</strong></label>' +
              '<input type="hidden" data-compose-field="tags" value="' + escapeHtml(fields.tags) + '">' +
              '<div class="tag-editor' + (state.compose.tags.length ? ' has-tags' : '') + '" role="group" aria-label="Post tags">' +
                '<div class="tag-editor-pills">' + tagsHtml + '</div>' +
                '<input type="text" class="tag-editor-input" data-compose-field="tags-input" placeholder="tag, tag, tag">' +
              '</div>' +
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
          '<div class="field-row scheduled-row' + (mode === 'scheduled' ? '' : ' is-hidden') + '">' +
            '<label><strong>Scheduled Release Date/Time</strong></label>' +
            '<input type="datetime-local" data-compose-field="scheduled-at" value="' + escapeHtml(fields.scheduledAt) + '">' +
          '</div>' +
        '</div>' +
        '<div class="compose-footer blog-compose-footer">' +
          '<div class="compose-actions">' +
            '<button type="button" class="list-admin-primary-btn" data-compose-action="publish"' + (state.compose.busy ? ' disabled aria-disabled="true"' : '') + '>' + escapeHtml(composePrimaryLabel(mode)) + '</button>' +
          '</div>' +
          '<div class="blog-compose-status-row">' +
            '<div class="autosave-indicator' + (state.compose.saveStatus === 'saving' ? ' is-saving' : '') + (state.compose.saveStatus === 'error' ? ' is-error' : '') + '"' + (state.compose.saveStatus ? '' : ' hidden') + '>' + (state.compose.saveStatus === 'saving' ? 'Saving...' : (state.compose.saveStatus === 'error' ? 'Save failed' : 'Saved')) + '</div>' +
            '<div class="' + outputClass + '">' + escapeHtml(state.compose.output) + '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
    requestAnimationFrame(function () {
      if (els.composeSlot) {
        els.composeSlot.classList.add('is-open');
      }
    });
  }

  function renderComposeStatusOnly() {
    if (!els.composeSlot || !state.compose.open) {
      return;
    }
    var mode = composePublishMode();
    var publishBtn = els.composeSlot.querySelector('[data-compose-action="publish"]');
    if (publishBtn instanceof HTMLButtonElement) {
      publishBtn.textContent = composePrimaryLabel(mode);
      publishBtn.disabled = !!state.compose.busy;
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
    var composeFab = event.target && event.target.closest('[data-blog-action="toggle-compose"]');
    if (composeFab) {
      event.preventDefault();
      setComposeOpen(!state.compose.open);
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
      if (actionName === 'publish') {
        saveCompose(composeModeAction(composePublishMode()));
        return;
      }
      if (actionName === 'remove-tag') {
        removeComposeTag(String(composeAction.getAttribute('data-compose-tag') || ''));
        renderComposeUi();
        queueComposeAutosave();
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
      if (action.getAttribute('data-blog-action') === 'open-admin') {
        openAdminPage();
      }
    }
  });

  root.addEventListener('input', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement) || !state.compose.open) {
      return;
    }
    if (target.matches('[data-compose-field="title"], [data-compose-field="content"], [data-compose-field="scheduled-at"]')) {
      queueComposeAutosave();
      if (state.compose.preview) {
        renderComposeUi();
      } else {
        renderComposeStatusOnly();
      }
      return;
    }
    if (target.matches('input[name="blog-inline-compose-mode"]')) {
      renderComposeUi();
      queueComposeAutosave();
    }
  });

  root.addEventListener('keydown', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement) || !state.compose.open) {
      return;
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
