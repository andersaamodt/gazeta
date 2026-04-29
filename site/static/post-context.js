(function () {
  var currentRelPath = '';
  var currentNostrAddress = '';
  var currentNostrEventId = '';
  var currentNostrPubkey = '';
  var currentNostrKind = '';
  var currentNostrD = '';
  var currentNostrRelays = [];
  var refreshInFlight = false;
  var submitInFlight = false;
  var postMenuBusy = false;
  var addToListState = {
    postPath: '',
    loading: false,
    submitting: false,
    lists: [],
    message: '',
    tone: ''
  };
  var inlineEditState = {
    open: false,
    busy: false,
    draftId: '',
    sourcePostPath: '',
    postFilename: '',
    postFilenameEditing: false,
    postType: 'longform',
    title: '',
    content: '',
    tags: '',
    output: '',
    outputTone: '',
    autosaveTimer: null,
    saveStatus: ''
  };

  function isPostPage(pathname) {
    var path = String(pathname || '');
    if (/^\/posts\/[^/?#]+\/?$/.test(path)) {
      return true;
    }
    if (/^\/pages\/posts\/[^/?#]+(?:\.html?)?\/?$/.test(path)) {
      return true;
    }
    if (path === '/cgi/blog-open-post' || path.indexOf('/cgi/blog-open-post/') === 0) {
      return true;
    }
    return false;
  }

  function normalizePostMdPath(raw) {
    var value = String(raw || '').trim();
    if (!value) {
      return '';
    }
    value = value
      .replace(/^https?:\/\/[^/]+\//, '')
      .replace(/^\/+/, '')
      .replace(/^pages\//, '')
      .replace(/^posts\//, '');
    if (!value) {
      return '';
    }
    if (/\.html?$/i.test(value)) {
      value = value.replace(/\.html?$/i, '');
    } else if (/\.md$/i.test(value)) {
      value = value.replace(/\.md$/i, '');
    }
    value = value.replace(/^\/*/, '').replace(/\/*$/, '');
    if (!value || value.indexOf('..') !== -1 || value.indexOf('\\') !== -1) {
      return '';
    }
    return 'posts/' + value + '.md';
  }

  function normalizePostFilename(raw) {
    var value = String(raw || '').trim();
    if (!value) {
      return '';
    }
    value = value
      .replace(/^https?:\/\/[^/]+\//i, '')
      .replace(/^\/+/, '')
      .replace(/^pages\//i, '')
      .replace(/^posts\//i, '');
    if (value.indexOf('/') >= 0) {
      value = value.split('/').pop();
    }
    value = value.replace(/\.html?$/i, '').replace(/\.md$/i, '');
    value = value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return value;
  }

  function postSlugFromMdPath(mdPath) {
    var normalized = normalizePostMdPath(mdPath);
    if (!normalized) {
      return '';
    }
    return normalized.replace(/^posts\//, '').replace(/\.md$/i, '');
  }

  function maybeRepairWrongPostShell(mdPath) {
    var blogRoot = document.getElementById('blog-page-root');
    if (!blogRoot) {
      return false;
    }
    var slug = postSlugFromMdPath(mdPath);
    if (!slug) {
      return false;
    }
    if (window.__wizardryPostRouteRepairing) {
      return true;
    }
    window.__wizardryPostRouteRepairing = true;
    var endpoint = '/cgi/blog-open-post?path=' + encodeURIComponent(slug) + '&__route_repair=1';
    fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('repair fetch failed');
        }
        return res.text();
      })
      .then(function (html) {
        var text = String(html || '');
        if (text.indexOf('<html') === -1) {
          throw new Error('repair payload invalid');
        }
        document.open();
        document.write(text);
        document.close();
      })
      .catch(function () {
        window.location.replace(endpoint);
      });
    return true;
  }

  function filenameFromPostPath(rawPath) {
    return normalizePostFilename(normalizePostMdPath(rawPath));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeListSlug(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function getSessionToken() {
    try {
      return String(localStorage.getItem('session_token') || '').trim();
    } catch (_err) {
      return '';
    }
  }

  function getCsrfToken() {
    try {
      return String(localStorage.getItem('csrf_token') || '').trim();
    } catch (_err) {
      return '';
    }
  }

  function postForm(path, payload) {
    var params = new URLSearchParams();
    Object.keys(payload || {}).forEach(function (key) {
      var value = payload[key];
      if (value === undefined || value === null) {
        return;
      }
      params.set(key, String(value));
    });
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      credentials: 'same-origin',
      body: params.toString()
    }).then(function (res) { return res.json(); });
  }

  function closePostPageMenu() {
    var panel = document.querySelector('.post-page-menu-panel');
    var trigger = document.querySelector('.post-page-menu-trigger');
    if (panel) {
      panel.hidden = true;
    }
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    }
  }

  function togglePostPageMenu() {
    var panel = document.querySelector('.post-page-menu-panel');
    var trigger = document.querySelector('.post-page-menu-trigger');
    if (!panel || !trigger) {
      return;
    }
    var nextOpen = !!panel.hidden;
    panel.hidden = !nextOpen;
    trigger.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  }

  function nostrToolsNip19() {
    return window.NostrTools && window.NostrTools.nip19 ? window.NostrTools.nip19 : null;
  }

  function currentNostrNaddr() {
    var nip19 = nostrToolsNip19();
    var kind = parseInt(currentNostrKind, 10);
    if (nip19 && typeof nip19.naddrEncode === 'function' && currentNostrPubkey && Number.isFinite(kind) && currentNostrD) {
      return nip19.naddrEncode({
        identifier: currentNostrD,
        pubkey: currentNostrPubkey,
        kind: kind,
        relays: currentNostrRelays
      });
    }
    return currentNostrAddress || '';
  }

  function currentNostrNevent() {
    var nip19 = nostrToolsNip19();
    var kind = parseInt(currentNostrKind, 10);
    if (nip19 && typeof nip19.neventEncode === 'function' && currentNostrEventId) {
      return nip19.neventEncode({
        id: currentNostrEventId,
        author: currentNostrPubkey || undefined,
        kind: Number.isFinite(kind) ? kind : undefined,
        relays: currentNostrRelays
      });
    }
    return currentNostrEventId || '';
  }

  function currentNostrOpenValue() {
    return currentNostrNaddr() || currentNostrNevent();
  }

  function writeClipboardText(value) {
    var text = String(value || '').trim();
    if (!text) {
      return Promise.reject(new Error('Nothing to copy yet.'));
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var node = document.createElement('textarea');
      node.value = text;
      node.setAttribute('readonly', 'readonly');
      node.style.position = 'fixed';
      node.style.left = '-9999px';
      node.style.top = '0';
      document.body.appendChild(node);
      node.select();
      try {
        if (document.execCommand('copy')) {
          resolve();
        } else {
          reject(new Error('Copy was not available in this browser.'));
        }
      } catch (err) {
        reject(err);
      } finally {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    });
  }

  function setReaderMenuEnabled() {
    var hasAddress = !!currentNostrAddress || (!!currentNostrPubkey && !!currentNostrKind && !!currentNostrD);
    var hasEvent = !!currentNostrEventId;
    document.querySelectorAll('[data-post-page-reader-action="copy_nostr_address"]').forEach(function (node) {
      node.hidden = !hasAddress;
    });
    document.querySelectorAll('[data-post-page-reader-action="copy_nostr_event"]').forEach(function (node) {
      node.hidden = !hasEvent;
    });
    document.querySelectorAll('[data-post-page-reader-action="open_nostr"]').forEach(function (node) {
      node.hidden = !(hasAddress || hasEvent);
    });
    return hasAddress || hasEvent;
  }

  function ensurePostPageMenu(layout) {
    if (!layout || !layout.card) {
      return null;
    }
    var head = layout.card.querySelector('.post-head');
    if (!head) {
      return null;
    }
    var existing = head.querySelector('.post-page-menu');
    if (existing) {
      return existing;
    }
    var wrap = document.createElement('div');
    wrap.className = 'post-page-menu';
    wrap.hidden = true;
    wrap.innerHTML = '' +
      '<button type="button" class="post-page-menu-trigger" aria-label="Post menu" aria-haspopup="menu" aria-expanded="false">⋮</button>' +
      '<div class="post-page-menu-panel" role="menu" hidden>' +
      '<button type="button" data-post-page-action="copy_nostr_address" data-post-page-reader-action="copy_nostr_address" role="menuitem" hidden>Copy Nostr address</button>' +
      '<button type="button" data-post-page-action="copy_nostr_event" data-post-page-reader-action="copy_nostr_event" role="menuitem" hidden>Copy Nostr event</button>' +
      '<button type="button" data-post-page-action="open_nostr" data-post-page-reader-action="open_nostr" role="menuitem" hidden>Open in Nostr client</button>' +
      '<div class="post-page-menu-separator" data-post-page-admin-separator hidden></div>' +
      '<button type="button" data-post-page-action="edit_post" data-post-page-admin-action role="menuitem" hidden>Edit post...</button>' +
      '<button type="button" data-post-page-action="add_to_list" data-post-page-admin-action role="menuitem" hidden>Add to list...</button>' +
      '<button type="button" class="post-page-menu-delete" data-post-page-action="delete_post" data-post-page-admin-action role="menuitem" hidden>Delete post...</button>' +
      '</div>';
    head.appendChild(wrap);
    return wrap;
  }

  function checkAdminSession() {
    var token = getSessionToken();
    if (!token || token === 'undefined' || token === 'null') {
      return Promise.resolve(false);
    }
    return fetch('/cgi/ssh-auth-check-session?session_token=' + encodeURIComponent(token), {
      credentials: 'same-origin'
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        return !!(data && data.authenticated && data.is_admin);
      })
      .catch(function () {
        return false;
      });
  }

  function refreshPostPageMenuVisibility() {
    var menu = document.querySelector('.post-page-menu');
    if (!menu) {
      return;
    }
    var hasReaderActions = setReaderMenuEnabled();
    checkAdminSession().then(function (isAdmin) {
      menu.querySelectorAll('[data-post-page-admin-action]').forEach(function (node) {
        node.hidden = !isAdmin;
      });
      menu.querySelectorAll('[data-post-page-admin-separator]').forEach(function (node) {
        node.hidden = !(isAdmin && hasReaderActions);
      });
      menu.hidden = !(isAdmin || hasReaderActions);
      if (menu.hidden) {
        closePostPageMenu();
      }
    });
  }

  function addToListDialogNode() {
    return document.getElementById('post-page-add-to-list-dialog');
  }

  function closeAddToListDialog() {
    var dialog = addToListDialogNode();
    if (dialog && dialog.parentNode) {
      dialog.parentNode.removeChild(dialog);
    }
    addToListState.postPath = '';
    addToListState.loading = false;
    addToListState.submitting = false;
    addToListState.lists = [];
    addToListState.message = '';
    addToListState.tone = '';
  }

  function addToListSelectedSlug(dialog) {
    var select = dialog ? dialog.querySelector('[data-post-add-list-select]') : null;
    var newInput = dialog ? dialog.querySelector('[data-post-add-list-new-slug]') : null;
    var selected = select ? String(select.value || '').trim() : '';
    if (selected === '__new__') {
      return normalizeListSlug(newInput ? newInput.value : '');
    }
    return normalizeListSlug(selected || 'list');
  }

  function syncAddToListDialogNewRow(dialog) {
    var select = dialog ? dialog.querySelector('[data-post-add-list-select]') : null;
    var row = dialog ? dialog.querySelector('[data-post-add-list-new-row]') : null;
    var newInput = dialog ? dialog.querySelector('[data-post-add-list-new-slug]') : null;
    if (!select || !row) {
      return;
    }
    var useNew = String(select.value || '') === '__new__';
    row.hidden = !useNew;
    if (useNew && newInput) {
      newInput.focus();
      newInput.select();
    }
  }

  function renderAddToListDialog() {
    var dialog = addToListDialogNode();
    if (!dialog) {
      dialog = document.createElement('div');
      dialog.id = 'post-page-add-to-list-dialog';
      dialog.className = 'post-page-modal-shell';
      dialog.setAttribute('role', 'presentation');
      document.body.appendChild(dialog);
    }

    var lists = Array.isArray(addToListState.lists) ? addToListState.lists : [];
    var optionsHtml = '';
    lists.forEach(function (item) {
      var slug = normalizeListSlug(item && item.slug);
      if (!slug) {
        return;
      }
      var title = String((item && item.title) || slug).trim();
      optionsHtml += '<option value="' + escapeHtml(slug) + '">' + escapeHtml(title || slug) + '</option>';
    });
    optionsHtml += '<option value="__new__">New list...</option>';
    var disabledAttr = addToListState.loading || addToListState.submitting ? ' disabled aria-disabled="true"' : '';
    var statusHtml = addToListState.message
      ? '<p class="post-page-modal-status is-' + escapeHtml(addToListState.tone || 'info') + '">' + escapeHtml(addToListState.message) + '</p>'
      : '';

    dialog.innerHTML = '' +
      '<div class="post-page-modal-backdrop" data-post-add-list-action="cancel"></div>' +
      '<form class="post-page-modal-panel" data-post-add-list-form="true" role="dialog" aria-modal="true" aria-labelledby="post-page-add-to-list-title">' +
        '<h3 id="post-page-add-to-list-title">Add Post to List</h3>' +
        '<label class="post-page-modal-field">' +
          '<span>List</span>' +
          '<select data-post-add-list-select="true"' + disabledAttr + '>' + optionsHtml + '</select>' +
        '</label>' +
        '<label class="post-page-modal-field" data-post-add-list-new-row="true" hidden>' +
          '<span>New list slug</span>' +
          '<input type="text" data-post-add-list-new-slug="true" placeholder="new-list"' + disabledAttr + '>' +
        '</label>' +
        '<label class="post-page-modal-field">' +
          '<span>Date <small>(optional)</small></span>' +
          '<input type="text" data-post-add-list-date="true" placeholder="YYYY or YYYY-MM or YYYY-MM-DD"' + disabledAttr + '>' +
        '</label>' +
        '<label class="post-page-modal-field">' +
          '<span>Text <small>(optional)</small></span>' +
          '<input type="text" data-post-add-list-markdown="true" placeholder="Markdown line for this entry"' + disabledAttr + '>' +
        '</label>' +
        statusHtml +
        '<div class="post-page-modal-actions">' +
          '<button type="button" data-post-add-list-action="cancel"' + disabledAttr + '>Cancel</button>' +
          '<button type="submit" class="post-page-modal-primary"' + disabledAttr + '>' + (addToListState.submitting ? 'Adding...' : 'Add to list') + '</button>' +
        '</div>' +
      '</form>';

    var select = dialog.querySelector('[data-post-add-list-select]');
    if (select && lists.length) {
      select.value = normalizeListSlug(lists[0] && lists[0].slug) || 'list';
    } else if (select) {
      select.value = '__new__';
    }
    syncAddToListDialogNewRow(dialog);
    var firstField = dialog.querySelector(lists.length ? '[data-post-add-list-select]' : '[data-post-add-list-new-slug]');
    if (firstField && !addToListState.loading && !addToListState.submitting) {
      firstField.focus();
    }
  }

  function openAddToListDialog(postPath, token, csrf) {
    addToListState.postPath = postPath;
    addToListState.loading = true;
    addToListState.submitting = false;
    addToListState.lists = [];
    addToListState.message = 'Loading lists...';
    addToListState.tone = 'info';
    renderAddToListDialog();
    postMenuBusy = true;
    postForm('/cgi/blog-list-pages', {
      session_token: token,
      csrf_token: csrf
    }).then(function (listsData) {
      if (!listsData || !listsData.success) {
        throw new Error((listsData && listsData.error) || 'Could not load lists');
      }
      addToListState.lists = Array.isArray(listsData.lists) ? listsData.lists : [];
      addToListState.message = '';
      addToListState.tone = '';
    }).catch(function (err) {
      addToListState.lists = [{ slug: 'list', title: 'List' }];
      addToListState.message = err && err.message ? err.message : 'Could not load lists. You can still choose a list slug.';
      addToListState.tone = 'error';
    }).finally(function () {
      addToListState.loading = false;
      postMenuBusy = false;
      renderAddToListDialog();
    });
  }

  function submitAddToListDialog(form) {
    if (addToListState.submitting || !addToListState.postPath) {
      return;
    }
    var token = getSessionToken();
    var csrf = getCsrfToken();
    if (!token || !csrf) {
      addToListState.message = 'Sign in as admin first.';
      addToListState.tone = 'error';
      renderAddToListDialog();
      return;
    }
    var slug = addToListSelectedSlug(form);
    if (!slug) {
      addToListState.message = 'List slug is required.';
      addToListState.tone = 'error';
      renderAddToListDialog();
      return;
    }
    var dateInput = form.querySelector('[data-post-add-list-date]');
    var markdownInput = form.querySelector('[data-post-add-list-markdown]');
    addToListState.submitting = true;
    addToListState.message = 'Adding post to list draft...';
    addToListState.tone = 'info';
    renderAddToListDialog();
    postForm('/cgi/blog-add-post-to-list', {
      list_slug: slug,
      post_path: addToListState.postPath,
      date: dateInput ? String(dateInput.value || '').trim() : '',
      markdown: markdownInput ? String(markdownInput.value || '').trim() : '',
      marker: 'list',
      session_token: token,
      csrf_token: csrf
    }).then(function (data) {
      if (!data || !data.success) {
        throw new Error((data && data.error) || 'Could not add post to list');
      }
      addToListState.message = (data && data.message) || ('Added to ' + slug + ' draft.');
      addToListState.tone = 'ok';
      addToListState.submitting = false;
      renderAddToListDialog();
      window.setTimeout(closeAddToListDialog, 700);
    }).catch(function (err) {
      addToListState.message = err && err.message ? err.message : 'Could not add post to list.';
      addToListState.tone = 'error';
      addToListState.submitting = false;
      renderAddToListDialog();
    });
  }

  function runPostPageAction(action) {
    var picked = String(action || '').trim();
    if (!picked || postMenuBusy || !currentRelPath) {
      return;
    }

    if (picked === 'copy_nostr_address') {
      writeClipboardText(currentNostrNaddr())
        .then(function () {
          closePostPageMenu();
        })
        .catch(function (err) {
          window.alert((err && err.message) || 'Could not copy Nostr address.');
        });
      return;
    }

    if (picked === 'copy_nostr_event') {
      writeClipboardText(currentNostrNevent())
        .then(function () {
          closePostPageMenu();
        })
        .catch(function (err) {
          window.alert((err && err.message) || 'Could not copy Nostr event.');
        });
      return;
    }

    if (picked === 'open_nostr') {
      var openValue = currentNostrOpenValue();
      if (!openValue) {
        window.alert('This post does not have a Nostr address yet.');
        return;
      }
      closePostPageMenu();
      window.location.href = openValue.indexOf('nostr:') === 0 ? openValue : 'nostr:' + openValue;
      return;
    }

    var token = getSessionToken();
    var csrf = getCsrfToken();
    if (!token || !csrf) {
      window.alert('Sign in as admin first.');
      return;
    }

    if (picked === 'edit_post') {
      postMenuBusy = true;
      postForm('/cgi/blog-create-draft-from-post', {
        post_path: currentRelPath,
        session_token: token,
        csrf_token: csrf
      })
        .then(function (data) {
          if (!data || !data.success) {
            throw new Error((data && data.error) || 'Could not create draft from post');
          }
          closePostPageMenu();
          var draftId = String((data && data.draft_id) || '').trim();
          if (!draftId) {
            throw new Error('Draft was created but no draft id was returned');
          }
          return openInlineEditorForDraft(draftId);
        })
        .catch(function (err) {
          window.alert(err.message || 'Could not create draft from post');
        })
        .finally(function () {
          postMenuBusy = false;
        });
      return;
    }

    if (picked === 'add_to_list') {
      closePostPageMenu();
      openAddToListDialog(currentRelPath, token, csrf);
      return;
    }

    if (picked === 'delete_post') {
      if (!window.confirm('Delete this published post from this site? This cannot be undone.')) {
        return;
      }
      postMenuBusy = true;
      postForm('/cgi/blog-manage-post', {
        action: 'delete',
        post_path: currentRelPath,
        session_token: token,
        csrf_token: csrf
      })
        .then(function (data) {
          if (!data || !data.success) {
            throw new Error((data && data.error) || 'Delete failed');
          }
          window.location.href = '/archive';
        })
        .catch(function (err) {
          window.alert(err.message || 'Delete failed');
        })
        .finally(function () {
          postMenuBusy = false;
        });
    }
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
      return '<a class="tag" href="/tags#' + encodeURIComponent(t) + '">' + escapeHtml(t) + '</a>';
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
      '<div class="post-byline post-byline-top">' +
      '<span class="post-author">' + escapeHtml(current.author || 'Blog Author') + '</span>' +
      '<span class="post-date">' + escapeHtml(current.published_date || '') + '</span>' +
      '</div>' +
      '<div class="post-head-divider" aria-hidden="true"></div>' +
      '<div class="post-byline post-byline-bottom">' +
      '<span class="post-reading-inline">' + escapeHtml(String(current.reading_minutes || 1)) + ' min read</span>' +
      '</div>' +
      '</div>';

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

  function ensureZapHost(layout) {
    if (!layout || !layout.card) {
      return null;
    }
    var existing = layout.card.querySelector('.zap-inline-host.is-compact');
    if (existing) {
      return existing;
    }
    var head = layout.card.querySelector('.post-head');
    if (!head) {
      return null;
    }
    var host = document.createElement('div');
    host.className = 'post-zap-host';
    head.appendChild(host);
    return host;
  }

  function renderPostZapUi(payload, layout) {
    if (!window.blogZapUi || typeof window.blogZapUi.render !== 'function') {
      return;
    }
    var host = ensureZapHost(layout);
    if (!host) {
      return;
    }
    var current = payload && payload.current ? payload.current : null;
    var nostr = current && current.nostr ? current.nostr : null;
    window.blogZapUi.render(host, {
      zapConfig: payload ? payload.zap_config : null,
      display: 'compact',
      title: current ? current.title : '',
      target: {
        label: 'post',
        title: current ? current.title : '',
        recipientPubkey: nostr ? nostr.pubkey : '',
        eventId: nostr ? nostr.id : '',
        address: nostr ? nostr.address : '',
        kind: nostr ? nostr.kind : ''
      }
    });
  }

  function normalizeInlinePostType(raw) {
    var value = String(raw || '').trim().toLowerCase();
    return value || 'longform';
  }

  function normalizeInlineTags(raw) {
    var seen = {};
    return String(raw || '')
      .split(',')
      .map(function (tag) { return String(tag || '').trim(); })
      .filter(function (tag) {
        if (!tag || seen[tag]) {
          return false;
        }
        seen[tag] = true;
        return true;
      })
      .join(', ');
  }

  function inlinePostTypeLabel(postType) {
    var value = normalizeInlinePostType(postType);
    if (value === 'shortform') return 'Shortform';
    if (value === 'capture-media') return 'Capture Media';
    if (value === 'upload-media') return 'Upload Media';
    if (value === 'attachment') return 'Attachment';
    if (value === 'audio-note') return 'Audio Note';
    if (value === 'link-share') return 'Link Share';
    if (value === 'go-live') return 'Go Live';
    return 'Longform';
  }

  function inlineAuthPayload() {
    return {
      session_token: getSessionToken(),
      csrf_token: getCsrfToken()
    };
  }

  function ensureInlineEditorHost() {
    var card = document.querySelector('.post-single-item');
    if (!card) {
      return null;
    }
    var existing = card.querySelector('.post-inline-editor-host');
    if (existing) {
      return existing;
    }
    var host = document.createElement('div');
    host.className = 'post-inline-editor-host';
    var body = card.querySelector('.post-single-body');
    if (body && body.parentNode === card) {
      card.insertBefore(host, body);
    } else {
      card.appendChild(host);
    }
    return host;
  }

  function renderInlineEditor() {
    var host = ensureInlineEditorHost();
    if (!host) {
      return;
    }
    if (!inlineEditState.open) {
      host.innerHTML = '';
      host.hidden = true;
      return;
    }
    host.hidden = false;
    var outputClass = 'output';
    if (inlineEditState.outputTone) {
      outputClass += ' ' + inlineEditState.outputTone;
    }
    var hasEditableFilename = !!String(inlineEditState.sourcePostPath || '').trim();
    var showTitleField = normalizeInlinePostType(inlineEditState.postType) !== 'shortform';
    var currentFilename = normalizePostFilename(inlineEditState.postFilename || filenameFromPostPath(inlineEditState.sourcePostPath));
    if (!currentFilename) {
      currentFilename = 'post';
    }
    var filenameDisplayHidden = inlineEditState.postFilenameEditing ? ' hidden' : '';
    var filenameEditHidden = inlineEditState.postFilenameEditing ? '' : ' hidden';
    var filenameRow = '';
    if (hasEditableFilename) {
      filenameRow = '' +
        '<div class="field-row compose-post-filename-row">' +
          '<label><strong>Slug/Filename</strong></label>' +
          '<div class="compose-post-filename-display"' + filenameDisplayHidden + '>' +
            '<code class="compose-post-filename-value">posts/' + escapeHtml(currentFilename) + '.md</code>' +
            '<button type="button" class="list-inline-edit-link" data-post-inline-action="edit_filename">Edit...</button>' +
          '</div>' +
          '<div class="compose-post-filename-edit-wrap"' + filenameEditHidden + '>' +
            '<span class="compose-post-filename-prefix">posts/</span>' +
            '<input type="text" data-post-inline-field="post_filename" inputmode="url" spellcheck="false" value="' + escapeHtml(currentFilename) + '" placeholder="my-post-slug">' +
            '<span class="compose-post-filename-suffix">.md</span>' +
          '</div>' +
        '</div>';
    }
    host.innerHTML = '' +
      '<article class="post-item blog-post-item blog-compose-card">' +
        '<div class="blog-compose-body">' +
          '<div class="field-row blog-compose-head-row is-type-collapsed">' +
            '<div class="compose-nostr-target-row">' +
              '<span class="nostr-target-pill is-pages-pill">Post type: ' + escapeHtml(inlinePostTypeLabel(inlineEditState.postType)) + ' (locked)</span>' +
            '</div>' +
            '<button type="button" class="list-admin-primary-btn blog-compose-btn" data-post-inline-action="close">Done</button>' +
          '</div>' +
          '<div class="field-row blog-compose-title-row"' + (showTitleField ? '' : ' hidden aria-hidden="true"') + '>' +
            '<input type="text" data-post-inline-field="title" placeholder="Post title" value="' + escapeHtml(inlineEditState.title) + '">' +
          '</div>' +
          filenameRow +
          '<div class="field-row">' +
            '<label><strong>Content</strong></label>' +
            '<div class="editor-shell blog-compose-editor-shell">' +
              '<textarea data-post-inline-field="content" rows="14" placeholder="# Write in Markdown">' + escapeHtml(inlineEditState.content) + '</textarea>' +
              '<div class="autosave-indicator compose-editor-autosave' + (inlineEditState.saveStatus === 'saving' ? ' is-saving' : '') + (inlineEditState.saveStatus === 'error' ? ' is-error' : '') + '"' + (inlineEditState.saveStatus ? '' : ' hidden') + '>' + (inlineEditState.saveStatus === 'saving' ? 'Saving...' : (inlineEditState.saveStatus === 'error' ? 'Save failed' : 'Saved')) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="field-row">' +
            '<label><strong>Tags</strong></label>' +
            '<input type="text" data-post-inline-field="tags" value="' + escapeHtml(inlineEditState.tags) + '" placeholder="tag, tag, tag">' +
          '</div>' +
        '</div>' +
        '<div class="compose-footer blog-compose-footer">' +
          '<div class="compose-actions blog-compose-footer-actions">' +
            '<button type="button" class="icon-danger unobtrusive-icon-button blog-compose-delete" data-post-inline-action="delete"' + (inlineEditState.busy ? ' disabled aria-disabled="true"' : '') + '>Delete Draft</button>' +
            '<button type="button" class="list-admin-primary-btn blog-compose-btn" data-post-inline-action="save"' + (inlineEditState.busy ? ' disabled aria-disabled="true"' : '') + '>Save Draft</button>' +
            '<button type="button" class="list-admin-primary-btn blog-compose-btn" data-post-inline-action="publish"' + (inlineEditState.busy ? ' disabled aria-disabled="true"' : '') + '>Publish Changes</button>' +
          '</div>' +
          '<div class="blog-compose-status-row">' +
            '<div class="' + outputClass + '">' + escapeHtml(inlineEditState.output) + '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function setInlineOutput(message, tone) {
    inlineEditState.output = String(message || '');
    inlineEditState.outputTone = String(tone || '');
  }

  function inlineEditorPayload(action) {
    var postType = normalizeInlinePostType(inlineEditState.postType || 'longform');
    return {
      action: action,
      draft_id: String(inlineEditState.draftId || ''),
      source_post_path: String(inlineEditState.sourcePostPath || ''),
      post_filename: String(inlineEditState.postFilename || ''),
      title: postType === 'shortform' ? '' : String(inlineEditState.title || '').trim(),
      tags: normalizeInlineTags(inlineEditState.tags || ''),
      summary: '',
      content: String(inlineEditState.content || ''),
      post_type: postType,
      scheduled_at: '',
      publish_mode: 'immediate',
      publish_destination: 'local_only'
    };
  }

  function saveInlineDraft(action) {
    if (!inlineEditState.open || inlineEditState.busy) {
      return Promise.resolve(false);
    }
    var auth = inlineAuthPayload();
    if (!auth.session_token || !auth.csrf_token) {
      setInlineOutput('Sign in again to edit this post.', 'error');
      renderInlineEditor();
      return Promise.resolve(false);
    }
    var payload = inlineEditorPayload(action);
    payload.session_token = auth.session_token;
    payload.csrf_token = auth.csrf_token;
    inlineEditState.busy = true;
    if (action === 'autosave') {
      inlineEditState.saveStatus = 'saving';
    }
    renderInlineEditor();
    return postForm('/cgi/blog-save-post', payload).then(function (data) {
      if (data && data.draft_id) {
        inlineEditState.draftId = String(data.draft_id || '').trim();
      }
      inlineEditState.tags = normalizeInlineTags(inlineEditState.tags || '');
      inlineEditState.postFilename = normalizePostFilename(inlineEditState.postFilename || filenameFromPostPath(inlineEditState.sourcePostPath));
      if (action === 'autosave') {
        inlineEditState.saveStatus = 'saved';
      }
      if (action === 'publish_now') {
        setInlineOutput('Published. Reloading post…', 'ok');
        renderInlineEditor();
        window.setTimeout(function () {
          window.location.reload();
        }, 350);
      }
      return true;
    }).catch(function (err) {
      if (action === 'autosave') {
        inlineEditState.saveStatus = 'error';
      } else {
        setInlineOutput(err && err.message ? err.message : 'Save failed', 'error');
      }
      renderInlineEditor();
      return false;
    }).finally(function () {
      inlineEditState.busy = false;
      renderInlineEditor();
    });
  }

  function queueInlineAutosave() {
    if (!inlineEditState.open) {
      return;
    }
    if (inlineEditState.autosaveTimer) {
      window.clearTimeout(inlineEditState.autosaveTimer);
    }
    inlineEditState.saveStatus = 'saving';
    renderInlineEditor();
    inlineEditState.autosaveTimer = window.setTimeout(function () {
      inlineEditState.autosaveTimer = null;
      saveInlineDraft('autosave');
    }, 1200);
  }

  function closeInlineEditor() {
    if (inlineEditState.autosaveTimer) {
      window.clearTimeout(inlineEditState.autosaveTimer);
      inlineEditState.autosaveTimer = null;
    }
    inlineEditState.open = false;
    inlineEditState.busy = false;
    inlineEditState.draftId = '';
    inlineEditState.sourcePostPath = '';
    inlineEditState.postFilename = '';
    inlineEditState.postFilenameEditing = false;
    inlineEditState.postType = 'longform';
    inlineEditState.title = '';
    inlineEditState.content = '';
    inlineEditState.tags = '';
    inlineEditState.output = '';
    inlineEditState.outputTone = '';
    inlineEditState.saveStatus = '';
    renderInlineEditor();
  }

  function deleteInlineDraft() {
    if (!inlineEditState.draftId || inlineEditState.busy) {
      closeInlineEditor();
      return;
    }
    if (!window.confirm('Delete this draft?')) {
      return;
    }
    var auth = inlineAuthPayload();
    if (!auth.session_token || !auth.csrf_token) {
      setInlineOutput('Sign in again to delete this draft.', 'error');
      renderInlineEditor();
      return;
    }
    inlineEditState.busy = true;
    renderInlineEditor();
    postForm('/cgi/blog-delete-draft', {
      draft_id: String(inlineEditState.draftId || ''),
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function () {
      closeInlineEditor();
    }).catch(function (err) {
      inlineEditState.busy = false;
      setInlineOutput(err && err.message ? err.message : 'Could not delete draft', 'error');
      renderInlineEditor();
    });
  }

  function openInlineEditorForDraft(draftId) {
    var auth = inlineAuthPayload();
    if (!auth.session_token || !auth.csrf_token) {
      return Promise.reject(new Error('Sign in as admin first.'));
    }
    return postForm('/cgi/blog-get-draft', {
      draft_id: String(draftId || ''),
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (data) {
      if (!data || !data.success || !data.draft) {
        throw new Error((data && data.error) || 'Could not load draft');
      }
      var draft = data.draft || {};
      inlineEditState.open = true;
      inlineEditState.busy = false;
      inlineEditState.draftId = String(draft.draft_id || draftId || '').trim();
      inlineEditState.sourcePostPath = normalizePostMdPath(draft.source_post_path || '');
      inlineEditState.postFilename = normalizePostFilename(draft.post_filename || filenameFromPostPath(inlineEditState.sourcePostPath));
      inlineEditState.postFilenameEditing = false;
      inlineEditState.postType = normalizeInlinePostType(draft.post_type || 'longform');
      inlineEditState.title = String(draft.title || '');
      inlineEditState.content = String(draft.content || '');
      inlineEditState.tags = normalizeInlineTags(draft.tags || '');
      inlineEditState.output = '';
      inlineEditState.outputTone = '';
      inlineEditState.saveStatus = '';
      renderInlineEditor();
      var host = ensureInlineEditorHost();
      if (host && typeof host.scrollIntoView === 'function') {
        host.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      }
      return true;
    });
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

  function ensureCommentShell(layout) {
    if (document.querySelector('.post-comments-shell')) {
      return;
    }
    var anchor = layout && layout.card ? layout.card : document.body;
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
    var canonicalPath = normalizePostMdPath(payload.current.path || payload.current.url || '');
    if (canonicalPath) {
      currentRelPath = canonicalPath;
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

    ensurePostPageMenu(layout);
    refreshPostPageMenuVisibility();
    renderPostZapUi(payload, layout);

    if (payload.current.nostr) {
      currentNostrAddress = payload.current.nostr.address || '';
      currentNostrEventId = payload.current.nostr.id || '';
      currentNostrPubkey = payload.current.nostr.pubkey || '';
      currentNostrKind = payload.current.nostr.kind || '';
      currentNostrD = payload.current.nostr.d || '';
      currentNostrRelays = Array.isArray(payload.current.nostr.relays) ? payload.current.nostr.relays.slice() : [];
      refreshPostPageMenuVisibility();
      ensureCommentShell(layout);
      loadComments();
    } else {
      currentNostrAddress = '';
      currentNostrEventId = '';
      currentNostrPubkey = '';
      currentNostrKind = '';
      currentNostrD = '';
      currentNostrRelays = [];
      refreshPostPageMenuVisibility();
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
    if (window.location.pathname === '/cgi/blog-open-post' || window.location.pathname.indexOf('/cgi/blog-open-post/') === 0) {
      var query = new URLSearchParams(window.location.search || '');
      var fromPathInfo = String(window.location.pathname || '').replace(/^\/cgi\/blog-open-post\/?/, '');
      currentRelPath = normalizePostMdPath(query.get('path') || fromPathInfo || '');
    } else {
      currentRelPath = normalizePostMdPath(window.location.pathname || '');
    }
    if (!currentRelPath) {
      return;
    }
    if (maybeRepairWrongPostShell(currentRelPath)) {
      return;
    }
    fetch('/cgi/blog-post-context?path=' + encodeURIComponent(currentRelPath), { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success) {
          return;
        }
        try {
          applyEnhancements(data);
        } catch (err) {
          window.__postContextError = err && err.message ? err.message : String(err || 'post context error');
          if (window.console && typeof window.console.warn === 'function') {
            window.console.warn('Post context enhancement failed:', err);
          }
        }
      })
      .catch(function () {
        // Post page should remain readable even if enhancement fetch fails.
      });
  }

  function resolveCurrentPostPathFromLocation() {
    if (!isPostPage(window.location.pathname)) {
      return '';
    }
    if (window.location.pathname === '/cgi/blog-open-post' || window.location.pathname.indexOf('/cgi/blog-open-post/') === 0) {
      var query = new URLSearchParams(window.location.search || '');
      var fromPathInfo = String(window.location.pathname || '').replace(/^\/cgi\/blog-open-post\/?/, '');
      return normalizePostMdPath(query.get('path') || fromPathInfo || '');
    }
    return normalizePostMdPath(window.location.pathname || '');
  }

  function triggerEarlyPostRouteRepair() {
    if (!isPostPage(window.location.pathname)) {
      return false;
    }
    var blogRoot = document.getElementById('blog-page-root');
    if (!blogRoot) {
      return false;
    }
    var resolvedPath = resolveCurrentPostPathFromLocation();
    if (!resolvedPath) {
      return false;
    }
    if (document.querySelector('.post-single-item')) {
      return false;
    }
    currentRelPath = resolvedPath;
    // Keep current shell visible while we fetch and swap in the canonical
    // post document so navigation never flashes to a blank frame.
    maybeRepairWrongPostShell(currentRelPath);
    return true;
  }

  document.addEventListener('click', function (event) {
    if (!isPostPage(window.location.pathname)) {
      return;
    }
    var target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    var trigger = target.closest('.post-page-menu-trigger');
    if (trigger) {
      event.preventDefault();
      togglePostPageMenu();
      return;
    }
    var actionNode = target.closest('[data-post-page-action]');
    if (actionNode instanceof HTMLElement) {
      event.preventDefault();
      var action = actionNode.getAttribute('data-post-page-action');
      runPostPageAction(action);
      return;
    }
    var addListAction = target.closest('[data-post-add-list-action]');
    if (addListAction instanceof HTMLElement) {
      event.preventDefault();
      if (String(addListAction.getAttribute('data-post-add-list-action') || '') === 'cancel') {
        closeAddToListDialog();
      }
      return;
    }
    var menu = document.querySelector('.post-page-menu');
    if (menu && !menu.hidden && !menu.contains(target)) {
      closePostPageMenu();
    }

    var inlineAction = target.closest('[data-post-inline-action]');
    if (inlineAction instanceof HTMLElement) {
      event.preventDefault();
      var actionName = String(inlineAction.getAttribute('data-post-inline-action') || '');
      if (actionName === 'close') {
        closeInlineEditor();
      } else if (actionName === 'save') {
        saveInlineDraft('save_draft');
      } else if (actionName === 'publish') {
        saveInlineDraft('publish_now');
      } else if (actionName === 'delete') {
        deleteInlineDraft();
      } else if (actionName === 'edit_filename') {
        inlineEditState.postFilenameEditing = true;
        renderInlineEditor();
        window.setTimeout(function () {
          var input = document.querySelector('[data-post-inline-field="post_filename"]');
          if (input && typeof input.focus === 'function') {
            input.focus();
          }
          if (input && typeof input.select === 'function') {
            input.select();
          }
        }, 0);
      }
      return;
    }
  });

  document.addEventListener('input', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }
    if (!inlineEditState.open) {
      return;
    }
    var field = String(target.getAttribute('data-post-inline-field') || '');
    if (!field) {
      return;
    }
    if (field === 'title') {
      inlineEditState.title = String(target.value || '');
    } else if (field === 'content') {
      inlineEditState.content = String(target.value || '');
    } else if (field === 'tags') {
      inlineEditState.tags = String(target.value || '');
    } else if (field === 'post_filename') {
      inlineEditState.postFilename = normalizePostFilename(String(target.value || ''));
    }
    queueInlineAutosave();
  });

  document.addEventListener('change', function (event) {
    var target = event.target;
    if (target instanceof Element && target.closest('[data-post-add-list-select]')) {
      syncAddToListDialogNewRow(addToListDialogNode());
      return;
    }
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!inlineEditState.open) {
      return;
    }
    if (!target.hasAttribute('data-post-inline-field')) {
      return;
    }
    var changedField = String(target.getAttribute('data-post-inline-field') || '');
    if (changedField === 'tags') {
      inlineEditState.tags = normalizeInlineTags(target.value || '');
      target.value = inlineEditState.tags;
      queueInlineAutosave();
      return;
    }
    if (changedField === 'post_filename') {
      var nextFilename = normalizePostFilename(target.value || filenameFromPostPath(inlineEditState.sourcePostPath));
      if (!nextFilename) {
        nextFilename = filenameFromPostPath(inlineEditState.sourcePostPath) || 'post';
      }
      inlineEditState.postFilename = nextFilename;
      inlineEditState.postFilenameEditing = false;
      target.value = nextFilename;
      renderInlineEditor();
      queueInlineAutosave();
    }
  });

  document.addEventListener('submit', function (event) {
    if (!isPostPage(window.location.pathname)) {
      return;
    }
    var form = event.target;
    if (!(form instanceof Element) || !form.closest('[data-post-add-list-form]')) {
      return;
    }
    event.preventDefault();
    submitAddToListDialog(form);
  });

  if (!triggerEarlyPostRouteRepair()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', loadPostContext);
    } else {
      loadPostContext();
    }
    window.addEventListener('blog-auth-changed', refreshPostPageMenuVisibility);
  }
})();
