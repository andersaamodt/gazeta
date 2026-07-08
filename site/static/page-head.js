(function () {
  var ROUTE_REFRESH_PARAM = '__route_refresh';
  var ROUTE_REPAIR_PARAM = '__route_repair';
  var SITE_TITLE_CACHE_KEY = 'wizardry_blog_site_title_v1';
  var APPEND_SITE_TITLE_CACHE_KEY = 'wizardry_blog_append_site_title_to_page_title_v1';
  var routeFailureTimer = 0;
  var cachedBasePageTitle = '';
  var nostrPublishDialogPromise = null;

  function normalizeSiteTitle(value) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    return text || 'Site';
  }

  function normalizeAppendSiteTitleEnabled(value) {
    if (value === true || value === 1 || value === '1') {
      return true;
    }
    if (typeof value === 'string') {
      var text = value.trim().toLowerCase();
      return text === 'true' || text === 'yes' || text === 'on';
    }
    return false;
  }

  function readCachedSiteTitle() {
    try {
      return normalizeSiteTitle(localStorage.getItem(SITE_TITLE_CACHE_KEY) || '');
    } catch (_err) {
      return 'Site';
    }
  }

  function readCachedAppendSiteTitleEnabled() {
    try {
      return normalizeAppendSiteTitleEnabled(localStorage.getItem(APPEND_SITE_TITLE_CACHE_KEY) || '');
    } catch (_err) {
      return false;
    }
  }

  function titleConfig(overrides) {
    var opts = overrides && typeof overrides === 'object' ? overrides : {};
    var siteTitle = Object.prototype.hasOwnProperty.call(opts, 'siteTitle')
      ? normalizeSiteTitle(opts.siteTitle)
      : readCachedSiteTitle();
    var appendSiteTitle = Object.prototype.hasOwnProperty.call(opts, 'appendSiteTitle')
      ? normalizeAppendSiteTitleEnabled(opts.appendSiteTitle)
      : readCachedAppendSiteTitleEnabled();
    return { siteTitle: siteTitle, appendSiteTitle: appendSiteTitle };
  }

  function renderPageTitle(baseTitle, config) {
    var base = String(baseTitle || '').trim();
    var siteTitle = normalizeSiteTitle(config && config.siteTitle);
    if (!base || !config || config.appendSiteTitle !== true || !siteTitle) {
      return base;
    }
    if (base.toLowerCase() === siteTitle.toLowerCase()) {
      return base;
    }
    var suffix = ' - ' + siteTitle;
    return base.slice(-suffix.length) === suffix ? base : base + suffix;
  }

  function applyPageTitle(baseTitle, overrides) {
    if (typeof baseTitle !== 'undefined' && baseTitle !== null) {
      cachedBasePageTitle = String(baseTitle).trim();
    } else if (!cachedBasePageTitle) {
      cachedBasePageTitle = String(document.title || '').trim();
    }
    var nextTitle = renderPageTitle(cachedBasePageTitle, titleConfig(overrides));
    if (document.title !== nextTitle) {
      document.title = nextTitle;
    }
    return nextTitle;
  }

  function removeLegacyTitleBlock(rootNode) {
    var root = rootNode || null;
    if (!root) {
      return;
    }
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

  function ensureReadOnlyTitleShell(titleNode, options) {
    if (!titleNode) {
      return { text: null, actions: null };
    }
    var opts = options && typeof options === 'object' ? options : {};
    var actionsId = String(opts.actionsId || '').trim();
    var actionsClassName = String(opts.actionsClassName || 'list-page-title-actions').trim() || 'list-page-title-actions';
    var fallbackText = String(opts.fallbackText || '').trim();
    var text = titleNode.querySelector('.list-page-title-text');
    var actions = actionsId ? document.getElementById(actionsId) : titleNode.querySelector('.list-page-title-actions');
    if (!text) {
      text = document.createElement('span');
      text.className = 'list-page-title-text';
      var child = titleNode.firstChild;
      while (child) {
        var next = child.nextSibling;
        if (child !== actions) {
          text.appendChild(child);
        }
        child = next;
      }
      if (!text.textContent && fallbackText) {
        text.textContent = fallbackText;
      }
      if (actions && actions.parentNode === titleNode) {
        titleNode.insertBefore(text, actions);
      } else {
        titleNode.appendChild(text);
      }
    }
    if (!actions) {
      actions = document.createElement('span');
      if (actionsId) {
        actions.id = actionsId;
      }
      actions.className = actionsClassName;
      titleNode.appendChild(actions);
    } else {
      if (actionsId && actions.id !== actionsId) {
        actions.id = actionsId;
      }
      if (actions.className !== actionsClassName) {
        actions.className = actionsClassName;
      }
      if (actions.parentNode !== titleNode) {
        titleNode.appendChild(actions);
      }
    }
    return { text: text, actions: actions };
  }

  function ensureReadOnlyDescriptionShell(descriptionNode) {
    if (!descriptionNode) {
      return null;
    }
    var text = descriptionNode.querySelector('.list-page-description-text');
    if (!text) {
      text = document.createElement('span');
      text.className = 'list-page-description-text';
      while (descriptionNode.firstChild) {
        text.appendChild(descriptionNode.firstChild);
      }
      descriptionNode.appendChild(text);
    }
    return text;
  }

  function renderReadOnlyTitleShell(titleNode, textValue, options) {
    var shell = ensureReadOnlyTitleShell(titleNode, options);
    if (shell && shell.text) {
      shell.text.textContent = String(textValue || '');
    }
    return shell;
  }

  function renderReadOnlyTitleShellWithSync(titleNode, textValue, syncStatus, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var shell = renderReadOnlyTitleShell(titleNode, textValue, opts);
    if (titleNode && opts.unhide !== false) {
      titleNode.hidden = false;
    }
    var syncTarget = opts.syncTarget || opts.actionsId || (shell && shell.actions ? shell.actions : null);
    if (syncTarget) {
      renderSyncStatusPill(syncTarget, syncStatus, opts.syncOptions);
    }
    return shell;
  }

  function renderReadOnlyDescriptionShell(descriptionNode, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var text = ensureReadOnlyDescriptionShell(descriptionNode);
    if (!text) {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'html')) {
      text.innerHTML = String(opts.html || '');
    } else if (Object.prototype.hasOwnProperty.call(opts, 'text')) {
      text.textContent = String(opts.text || '');
    }
    if (descriptionNode && Object.prototype.hasOwnProperty.call(opts, 'hidden')) {
      descriptionNode.hidden = !!opts.hidden;
    }
    return text;
  }

  function renderReadOnlyPrerenderDescriptionShell(descriptionNode, payload, name) {
    var fragment = readPrerenderHtmlFragment(payload, name);
    if (!fragment) {
      return false;
    }
    renderReadOnlyDescriptionShell(descriptionNode, {
      html: fragment.html,
      hidden: fragment.hidden
    });
    return true;
  }

  function renderReadOnlyDescriptionShellFromPrerender(descriptionNode, payload, name, options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (opts.allowPrerender !== false && renderReadOnlyPrerenderDescriptionShell(descriptionNode, payload, name)) {
      return true;
    }
    renderReadOnlyDescriptionShell(descriptionNode, opts.fallback);
    return false;
  }

  function renderReadOnlyPageHead(options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (Object.prototype.hasOwnProperty.call(opts, 'pageTitle') && opts.pageTitle !== null && typeof opts.pageTitle !== 'undefined') {
      var pageTitle = String(opts.pageTitle || '').trim();
      if (pageTitle) {
        applyPageTitle(pageTitle);
      }
    }
    if (opts.titleNode) {
      renderReadOnlyTitleShellWithSync(opts.titleNode, opts.titleText, opts.syncStatus, opts.titleOptions);
    }
    if (opts.descriptionNode && Object.prototype.hasOwnProperty.call(opts, 'descriptionFallback')) {
      renderReadOnlyDescriptionShellFromPrerender(opts.descriptionNode, opts.descriptionPayload, String(opts.descriptionName || 'description'), {
        allowPrerender: opts.allowPrerenderDescription,
        fallback: opts.descriptionFallback
      });
    }
  }

  function htmlAttr(name, value) {
    var attrName = String(name || '').trim();
    if (!attrName) {
      return '';
    }
    return ' ' + attrName + '="' + escapeHtml(value) + '"';
  }

  function renderEditablePageHeadTitle(targetNode, options) {
    if (!targetNode) {
      return false;
    }
    var opts = options && typeof options === 'object' ? options : {};
    var activeField = String(opts.activeField || '').trim().toLowerCase();
    var value = String(opts.value || opts.fallbackText || '');
    var actionsHtml = String(opts.actionsHtml || '');
    var editLabel = String(opts.editLabel || 'Edit...');
    var inputId = String(opts.inputId || '').trim();
    var inputAttrName = String(opts.inputAttrName || '').trim();
    var editAttrName = String(opts.editAttrName || '').trim();
    var saveAttrName = String(opts.saveAttrName || '').trim();
    var showSaveButton = opts.showSaveButton === true;
    if (activeField === 'title') {
      targetNode.innerHTML = '<span class="list-page-title-edit-wrap"><input id="' + escapeHtml(inputId) + '" class="list-head-inline-input" type="text" value="' + escapeHtml(value) + '"' + htmlAttr(inputAttrName, 'title') + '></span>' +
        (showSaveButton ? ' <button type="button" class="list-inline-edit-link"' + htmlAttr(saveAttrName, 'title') + '>Save</button>' : '') +
        actionsHtml;
      return true;
    }
    targetNode.innerHTML = '<span class="list-page-title-text">' + escapeHtml(value) + '</span>' +
      (opts.editMode ? ' <button type="button" class="list-inline-edit-link"' + htmlAttr(editAttrName, 'title') + '>' + escapeHtml(editLabel) + '</button>' : '') +
      actionsHtml;
    return true;
  }

  function renderEditablePageHeadDescription(targetNode, options) {
    if (!targetNode) {
      return false;
    }
    var opts = options && typeof options === 'object' ? options : {};
    var activeField = String(opts.activeField || '').trim().toLowerCase();
    var text = String(opts.text || '');
    var textHtml = String(opts.textHtml || '');
    var editLabel = String(opts.editLabel || 'Edit...');
    var emptyHtml = String(opts.emptyHtml || '<span class="list-page-description-empty">No description.</span>');
    var inputId = String(opts.inputId || '').trim();
    var inputAttrName = String(opts.inputAttrName || '').trim();
    var editAttrName = String(opts.editAttrName || '').trim();
    var saveAttrName = String(opts.saveAttrName || '').trim();
    var editingExtraHtml = String(opts.editingExtraHtml || '');
    if (opts.suppressEmpty === true) {
      targetNode.hidden = true;
      targetNode.innerHTML = '';
      return true;
    }
    targetNode.hidden = false;
    if (activeField === 'description') {
      targetNode.innerHTML = '<span class="list-page-description-edit-wrap"><textarea id="' + escapeHtml(inputId) + '" class="list-head-description-input" rows="4"' + htmlAttr(inputAttrName, 'description') + '>' + escapeHtml(text) + '</textarea></span> <button type="button" class="list-inline-edit-link"' + htmlAttr(saveAttrName, 'description') + '>Save</button>' + editingExtraHtml;
      return true;
    }
    if (opts.editMode) {
      targetNode.innerHTML = (text.trim()
        ? '<span class="list-page-description-text">' + textHtml + '</span>'
        : emptyHtml) +
        ' <button type="button" class="list-inline-edit-link"' + htmlAttr(editAttrName, 'description') + '>' + escapeHtml(editLabel) + '</button>';
      return true;
    }
    if (text.trim()) {
      targetNode.innerHTML = '<span class="list-page-description-text">' + textHtml + '</span>';
      return true;
    }
    if (opts.hideWhenEmpty === true) {
      targetNode.hidden = true;
      targetNode.innerHTML = '';
      return true;
    }
    targetNode.innerHTML = emptyHtml;
    return true;
  }

  function renderEditableNavbarTitleRow(targetNode, options) {
    if (!targetNode) {
      return false;
    }
    var opts = options && typeof options === 'object' ? options : {};
    if (opts.hidden === true) {
      targetNode.hidden = true;
      targetNode.innerHTML = '';
      return true;
    }
    var currentText = String(opts.currentText || '');
    var editing = opts.editing === true;
    var labelText = String(opts.labelText || 'Navbar title');
    var inputValue = String(opts.inputValue || currentText);
    var inputAriaLabel = String(opts.inputAriaLabel || labelText);
    var inputAttrName = String(opts.inputAttrName || 'data-page-nav-title-input').trim();
    var actionAttrName = String(opts.actionAttrName || 'data-page-nav-title-action').trim();
    var editLabel = String(opts.editLabel || 'Edit...');
    var editButtonClassName = String(opts.editButtonClassName || 'list-inline-edit-link').trim() || 'list-inline-edit-link';
    var saveButtonClassName = String(opts.saveButtonClassName || editButtonClassName).trim() || editButtonClassName;
    var saveDisabled = opts.saveDisabled === true;
    var html = '<div class="list-page-nav-title-row">';
    html += '<span class="list-page-nav-title-label">' + escapeHtml(labelText) + '</span>';
    if (editing) {
      html += '<span class="list-page-nav-title-edit-wrap">';
      html += '<input type="text" class="list-page-nav-title-input" value="' + escapeHtml(inputValue) + '"' + htmlAttr(inputAttrName, 'true') + ' aria-label="' + escapeHtml(inputAriaLabel) + '">';
      html += '<button type="button" class="' + escapeHtml(saveButtonClassName) + '"' + htmlAttr(actionAttrName, 'save') + (saveDisabled ? ' disabled aria-disabled="true"' : '') + '>OK</button>';
      html += '</span>';
    } else {
      html += '<span class="list-page-nav-title-value">' + escapeHtml(currentText) + '</span>';
      html += '<button type="button" class="' + escapeHtml(editButtonClassName) + '"' + htmlAttr(actionAttrName, 'edit') + '>' + escapeHtml(editLabel) + '</button>';
    }
    html += '</div>';
    targetNode.hidden = false;
    targetNode.innerHTML = html;
    return true;
  }

  function focusEditablePageHeadField(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var activeField = String(opts.activeField || '').trim().toLowerCase();
    if (!activeField) {
      return false;
    }
    requestAnimationFrame(function () {
      var inputId = activeField === 'title'
        ? String(opts.titleInputId || '').trim()
        : String(opts.descriptionInputId || '').trim();
      var input = inputId ? document.getElementById(inputId) : null;
      if (input && typeof input.focus === 'function') {
        input.focus();
        if (opts.selectOnFocus !== false && typeof input.select === 'function') {
          input.select();
        }
      }
      if (typeof opts.afterFocus === 'function') {
        opts.afterFocus(input || null);
      }
    });
    return true;
  }

  function focusEditableNavbarTitleInput(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var targetNode = opts.targetNode || null;
    if (!targetNode || !targetNode.querySelector) {
      return false;
    }
    var inputAttrName = String(opts.inputAttrName || 'data-page-nav-title-input').trim();
    if (!inputAttrName) {
      return false;
    }
    requestAnimationFrame(function () {
      var input = targetNode.querySelector('[' + inputAttrName + '="true"]');
      if (input && typeof input.focus === 'function') {
        input.focus();
        if (opts.selectOnFocus !== false && typeof input.select === 'function') {
          input.select();
        }
      }
    });
    return true;
  }

  function resolveReadOnlyContentFromPrerender(options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (opts.allowPrerender !== false) {
      var fragment = readPrerenderHtmlFragment(opts.payload, String(opts.name || 'content'));
      if (fragment) {
        return {
          adopted: true,
          html: fragment.html,
          hidden: fragment.hidden
        };
      }
    }
    if (typeof opts.renderFallback === 'function') {
      var fallback = opts.renderFallback();
      if (fallback && typeof fallback === 'object') {
        return {
          adopted: false,
          html: String(fallback.html || ''),
          hidden: !!fallback.hidden
        };
      }
      if (typeof fallback === 'string') {
        return {
          adopted: false,
          html: fallback,
          hidden: false
        };
      }
      return {
        adopted: false,
        html: '',
        hidden: false
      };
    }
    return null;
  }

  function ensureMatchingStaticShell(rootNode, hostNode, payload, options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (!hostNode) {
      return null;
    }
    var selector = String(opts.selector || '').trim();
    var fallbackHtml = String(opts.fallbackHtml || '');
    if (!hasMatchingStaticPrerender(rootNode || null, hostNode, payload) && fallbackHtml) {
      hostNode.innerHTML = fallbackHtml;
    }
    var shell = selector ? hostNode.querySelector(selector) : hostNode.firstElementChild;
    if (!shell && fallbackHtml) {
      hostNode.innerHTML = fallbackHtml;
      shell = selector ? hostNode.querySelector(selector) : hostNode.firstElementChild;
    }
    return shell instanceof HTMLElement ? shell : null;
  }

  function reconcileAdoptedPrerenderRefresh(options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (!opts.hasChanges) {
      if (typeof opts.renderStable === 'function') {
        opts.renderStable();
      }
      return 'unchanged';
    }
    if (opts.canPreserve === true) {
      if (typeof opts.renderPreserved === 'function') {
        opts.renderPreserved();
      }
      return 'preserved';
    }
    if (typeof opts.beforeRepaint === 'function') {
      opts.beforeRepaint();
    }
    if (typeof opts.renderRepainted === 'function') {
      opts.renderRepainted();
    }
    return 'repainted';
  }

  function renderResolvedReadOnlyContent(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var targetNode = opts.targetNode || null;
    var resolved = resolveReadOnlyContentFromPrerender({
      payload: opts.payload,
      name: opts.name,
      allowPrerender: opts.allowPrerender,
      renderFallback: opts.renderFallback
    });
    if (!resolved || !targetNode) {
      return resolved;
    }
    if (resolved.adopted) {
      mountPrerenderHtmlFragment(targetNode, opts.payload, String(opts.name || 'content'), opts.mountOptions);
      if (typeof opts.afterAdopt === 'function') {
        opts.afterAdopt(resolved);
      }
    } else {
      var mountOptions = opts.mountOptions && typeof opts.mountOptions === 'object' ? opts.mountOptions : {};
      if (typeof mountOptions.applyHtml === 'function') {
        mountOptions.applyHtml(resolved.html);
      } else {
        targetNode.innerHTML = resolved.html;
      }
      targetNode.hidden = !!resolved.hidden;
    }
    if (typeof opts.afterRender === 'function') {
      opts.afterRender(resolved);
    }
    return resolved;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function syncStatusDefaults(status, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var variant = String(opts.messageVariant || 'server_copy').trim().toLowerCase();
    switch (status) {
      case 'local_newer_than_nostr':
        return {
          label: 'Server newer',
          message: variant === 'local_source'
            ? 'Local source is newer than latest published Nostr state.'
            : 'Server copy is newer than the latest published Nostr state. Visitors see the server copy.',
          className: 'status-local-newer-than-nostr'
        };
      case 'nostr_newer_than_local':
        return {
          label: 'Nostr newer',
          message: variant === 'local_source'
            ? 'Published Nostr state is newer than local source.'
            : 'Published Nostr state is newer than the server copy. Visitors still see the server copy until the site source changes.',
          className: 'status-nostr-newer-than-local'
        };
      case 'in_sync':
        return {
          label: 'Synced',
          message: variant === 'local_source'
            ? 'Local source and published state are in sync.'
            : 'Server copy and published Nostr state are in sync.',
          className: 'status-in-sync'
        };
      case 'unpublished_local_changes':
        return {
          label: 'Server only',
          message: variant === 'local_source'
            ? 'No published Nostr state yet for this page.'
            : 'This page exists only on the server so far. Visitors see the server copy.',
          className: 'status-unpublished-local-changes'
        };
      default:
        return {
          label: 'Sync unknown',
          message: 'Cannot determine local-vs-Nostr sync status yet.',
          className: 'status-unknown'
        };
    }
  }

  function syncStatusPillHtml(syncStatus, options) {
    var sync = syncStatus && typeof syncStatus === 'object' ? syncStatus : {};
    var status = String(sync.status || 'unknown').trim();
    var config = syncStatusDefaults(status, options);
    var message = String(sync.message || config.message).trim();
    return '<span class="page-sync-status-pill ' + config.className + '" title="' + escapeHtml(message) + '">' + escapeHtml(config.label) + '</span>';
  }

  function renderSyncStatusPill(actionsHostOrId, syncStatus, options) {
    var host = typeof actionsHostOrId === 'string'
      ? document.getElementById(String(actionsHostOrId || '').trim())
      : actionsHostOrId;
    if (!host) {
      return false;
    }
    var opts = options && typeof options === 'object' ? options : {};
    var hostClassName = String(opts.hostClassName || '').trim();
    if (hostClassName && host.classList) {
      host.classList.add(hostClassName);
    }
    host.innerHTML = syncStatusPillHtml(syncStatus, opts);
    return true;
  }

  function stripLegacyNostrSyncPills(value) {
    return String(value || '').replace(/<\s*(?:nostr-sync-pill|gazeta-sync-pill)\b[^>]*>(?:\s*<\/\s*(?:nostr-sync-pill|gazeta-sync-pill)\s*>)?/gi, '').trim();
  }

  function readNostrPageBootstrap(slug, isExpectedPayload) {
    try {
      var allPayloads = window.__wizardryNostrPageBootstrap;
      if (!allPayloads || typeof allPayloads !== 'object') {
        return null;
      }
      var payload = allPayloads[String(slug || '')];
      if (!payload || typeof payload !== 'object') {
        return null;
      }
      if (typeof isExpectedPayload === 'function' && !isExpectedPayload(payload)) {
        return null;
      }
      return payload;
    } catch (_err) {
      return null;
    }
  }

  function prerenderFragment(payload, key) {
    return String(payload && payload.prerender && payload.prerender[key] || '');
  }

  function readPrerenderHtmlFragment(payload, name) {
    var fragmentName = String(name || '').trim();
    if (!fragmentName) {
      return null;
    }
    var html = prerenderFragment(payload, fragmentName + '_html');
    if (!html) {
      return null;
    }
    return {
      html: html,
      hidden: /\bhidden\b/i.test(prerenderFragment(payload, fragmentName + '_attrs'))
    };
  }

  function mountPrerenderHtmlFragment(targetNode, payload, name, options) {
    var fragment = readPrerenderHtmlFragment(payload, name);
    if (!targetNode || !fragment) {
      return false;
    }
    var opts = options && typeof options === 'object' ? options : {};
    if (typeof opts.applyHtml === 'function') {
      opts.applyHtml(fragment.html);
    } else {
      targetNode.innerHTML = fragment.html;
    }
    targetNode.hidden = fragment.hidden;
    return true;
  }

  function hasMatchingStaticPrerender(rootNode, contentNode, payload) {
    var signature = String(payload && payload.prerender_signature || '').trim();
    if (!signature || !rootNode || !contentNode) {
      return false;
    }
    if (rootNode.getAttribute('data-prerender-painted') !== 'true' || contentNode.getAttribute('data-prerender-painted') !== 'true') {
      return false;
    }
    return rootNode.getAttribute('data-prerender-signature') === signature ||
      contentNode.getAttribute('data-prerender-signature') === signature;
  }

  function pageBootstrapCacheKey(slug) {
    return 'nostr_page_bootstrap_v1:' + String(slug || '').trim();
  }

  function readBootstrapCache(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var storageKey = String(opts.storageKey || '').trim();
    if (!storageKey) {
      return null;
    }
    var clearOnDeny = opts.clearOnDeny !== false;
    try {
      if (typeof opts.allowRead === 'function' && opts.allowRead() === false) {
        if (clearOnDeny) {
          localStorage.removeItem(storageKey);
        }
        return null;
      }
      var raw = localStorage.getItem(storageKey);
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      var savedAt = Number(parsed.saved_at || 0);
      var maxAgeMs = Number(opts.maxAgeMs || 0);
      if (!isFinite(savedAt) || savedAt <= 0 || (maxAgeMs > 0 && (Date.now() - savedAt) > maxAgeMs)) {
        localStorage.removeItem(storageKey);
        return null;
      }
      var expectedAuthSignature = typeof opts.authSignature === 'function'
        ? String(opts.authSignature() || '')
        : String(opts.authSignature || '');
      if (String(parsed.auth_signature || '') !== expectedAuthSignature) {
        return null;
      }
      if (!parsed.payload || typeof parsed.payload !== 'object') {
        return null;
      }
      if (typeof opts.isExpectedPayload === 'function' && !opts.isExpectedPayload(parsed.payload)) {
        localStorage.removeItem(storageKey);
        return null;
      }
      return parsed.payload;
    } catch (_err) {
      return null;
    }
  }

  function writeBootstrapCache(payload, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var storageKey = String(opts.storageKey || '').trim();
    if (!storageKey || !payload || typeof payload !== 'object') {
      return;
    }
    var clearOnDeny = opts.clearOnDeny !== false;
    try {
      if (typeof opts.allowWrite === 'function' && opts.allowWrite(payload) === false) {
        if (clearOnDeny) {
          localStorage.removeItem(storageKey);
        }
        return;
      }
      var authSignature = typeof opts.authSignature === 'function'
        ? String(opts.authSignature() || '')
        : String(opts.authSignature || '');
      localStorage.setItem(storageKey, JSON.stringify({
        auth_signature: authSignature,
        payload: payload,
        saved_at: Date.now()
      }));
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function sessionAuthSignature() {
    var auth = authPayload();
    return String(auth.session_token || '') + '|' + String(auth.csrf_token || '');
  }

  function writePageBootstrapCache(payload, options) {
    var opts = options && typeof options === 'object' ? options : {};
    return writeBootstrapCache(payload, {
      storageKey: pageBootstrapCacheKey(opts.slug),
      authSignature: opts.authSignature || sessionAuthSignature,
      allowWrite: opts.allowWrite,
      clearOnDeny: opts.clearOnDeny
    });
  }

  function bindSessionAuthRefresh(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : null;
    if (!onChange) {
      return false;
    }
    var onVisible = typeof opts.onVisible === 'function' ? opts.onVisible : null;
    var onHidden = typeof opts.onHidden === 'function' ? opts.onHidden : null;
    var storageKeys = Array.isArray(opts.storageKeys) ? opts.storageKeys.map(function (key) {
      return String(key || '');
    }).filter(Boolean) : ['session_token', 'csrf_token'];
    window.addEventListener('blog-auth-changed', onChange);
    window.addEventListener('storage', function (event) {
      if (!event || !event.key) {
        return;
      }
      if (storageKeys.indexOf(String(event.key || '')) !== -1) {
        onChange(event);
      }
    });
    window.addEventListener('focus', onChange);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        if (onVisible) {
          onVisible();
          return;
        }
        onChange();
        return;
      }
      if (onHidden) {
        onHidden();
      }
    });
    var pollState = opts.pollState && typeof opts.pollState === 'object' ? opts.pollState : null;
    var pollDurationMs = Math.max(0, Number(opts.pollDurationMs || 0) || 0);
    if (pollState && pollDurationMs > 0 && !pollState.timer) {
      pollState.startedAt = Date.now();
      pollState.timer = window.setInterval(function () {
        if (Date.now() - Number(pollState.startedAt || 0) > pollDurationMs) {
          window.clearInterval(pollState.timer);
          pollState.timer = 0;
          return;
        }
        onChange();
        if (typeof opts.stopWhen === 'function' && opts.stopWhen()) {
          window.clearInterval(pollState.timer);
          pollState.timer = 0;
        }
      }, Math.max(100, Number(opts.pollIntervalMs || 500) || 500));
    }
    return true;
  }

  function authPayload() {
    try {
      return {
        session_token: String(localStorage.getItem('session_token') || '').trim(),
        csrf_token: String(localStorage.getItem('csrf_token') || '').trim()
      };
    } catch (_err) {
      return { session_token: '', csrf_token: '' };
    }
  }

  function hasLikelyAuthenticatedSession() {
    var auth = authPayload();
    return !!(auth && auth.session_token && auth.csrf_token);
  }

  function canUseVisitorPrerenderReadOnly(options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (opts.isAdmin === true) {
      return false;
    }
    if (opts.allowAuthenticated !== true && hasLikelyAuthenticatedSession()) {
      return false;
    }
    if (typeof opts.extraCheck === 'function') {
      return opts.extraCheck() !== false;
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'extraAllowed')) {
      return opts.extraAllowed !== false;
    }
    return true;
  }

  function ensureNostrPublishDialog() {
    if (window.blogNostrPublishDialog && typeof window.blogNostrPublishDialog.open === 'function') {
      return Promise.resolve(true);
    }
    if (nostrPublishDialogPromise) {
      return nostrPublishDialogPromise;
    }
    nostrPublishDialogPromise = new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = '/static/nostr-publish-dialog.js';
      script.async = true;
      script.onload = function () {
        resolve(!!(window.blogNostrPublishDialog && typeof window.blogNostrPublishDialog.open === 'function'));
      };
      script.onerror = function () {
        nostrPublishDialogPromise = null;
        resolve(false);
      };
      document.head.appendChild(script);
    });
    return nostrPublishDialogPromise;
  }

  function markedParserReady() {
    return !!(window.marked && typeof window.marked.parse === 'function' && typeof window.marked.parseInline === 'function');
  }

  function scheduleMarkedUpgrade(upgradeState, onReady) {
    var state = upgradeState && typeof upgradeState === 'object' ? upgradeState : null;
    if (!state || typeof onReady !== 'function' || markedParserReady()) {
      return false;
    }
    if (state.timer) {
      return false;
    }
    state.attempts = 0;
    function pollForMarked() {
      if (markedParserReady()) {
        state.timer = 0;
        onReady();
        return;
      }
      state.attempts += 1;
      if (state.attempts >= 50) {
        state.timer = 0;
        return;
      }
      state.timer = window.setTimeout(pollForMarked, 100);
    }
    state.timer = window.setTimeout(pollForMarked, 100);
    return true;
  }

  function normalizeSlug(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  }

  function slugFromPath(pathname) {
    var path = String(pathname || '').trim();
    if (!path) {
      return 'index';
    }
    path = path.split('?')[0].split('#')[0].replace(/\/+$/, '');
    if (!path || path === '/') {
      return 'index';
    }
    if (path.indexOf('/pages/') === 0) {
      path = path.slice('/pages/'.length);
    } else if (path.charAt(0) === '/') {
      path = path.slice(1);
    }
    path = path.replace(/\.html?$/i, '');
    return path.indexOf('/') >= 0 ? '' : normalizeSlug(path);
  }

  function routeRootSlugFromDom() {
    var blogRoot = document.getElementById('blog-page-root');
    if (blogRoot) {
      return normalizeSlug(blogRoot.getAttribute('data-page-slug') || blogRoot.getAttribute('data-blog-slug') || '');
    }
    var nip23Root = document.getElementById('nip23-page-root');
    if (nip23Root) {
      return normalizeSlug(nip23Root.getAttribute('data-page-slug') || '');
    }
    var listRoot = document.getElementById('list-page-root') || document.getElementById('icon-gallery-root');
    if (listRoot) {
      return normalizeSlug(listRoot.getAttribute('data-list-slug') || '');
    }
    var rankingRoot = document.getElementById('public-ranking-root');
    if (rankingRoot) {
      return normalizeSlug(rankingRoot.getAttribute('data-ranking-slug') || '');
    }
    var contactRoot = document.getElementById('contact-page-root');
    if (contactRoot) {
      return normalizeSlug(contactRoot.getAttribute('data-page-slug') || '');
    }
    return '';
  }

  function slugsEquivalent(expected, root) {
    var a = normalizeSlug(expected);
    var b = normalizeSlug(root);
    return !!(a && b && (a === b || (a === 'index' && b === 'blog') || (a === 'blog' && b === 'index')));
  }

  function forceHydrationReveal() {
    try {
      var gate = window.__wizardryHydration;
      if (gate && typeof gate.forceReveal === 'function') {
        gate.forceReveal();
        return;
      }
    } catch (_gateErr) {
      // Ignore hydration gate issues.
    }
    if (document.documentElement) {
      document.documentElement.classList.remove('app-hydrating');
    }
  }

  function markHydrationPageReady() {
    try {
      var gate = window.__wizardryHydration;
      if (gate && typeof gate.markPageReady === 'function') {
        gate.markPageReady();
      }
    } catch (_gateErr) {
      // Ignore hydration gate issues.
    }
  }

  function notifyInitialContentPainted(slug, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var state = opts.state && typeof opts.state === 'object' ? opts.state : null;
    if (state && state.initialContentPainted) {
      return false;
    }
    if (state) {
      state.initialContentPainted = true;
    }
    var rootNode = opts.rootNode || null;
    var loadingClass = String(opts.loadingClass || '').trim();
    if (rootNode && rootNode.classList && loadingClass) {
      rootNode.classList.remove(loadingClass);
    }
    try {
      window.__wizardryPageInitialContentReady = true;
      window.dispatchEvent(new CustomEvent('blog-page-initial-content-ready', {
        detail: { slug: String(slug || '') }
      }));
    } catch (_err) {
      // Ignore event dispatch failures.
    }
    if (opts.markPageReady === true) {
      markHydrationPageReady();
    }
    return true;
  }

  function renderLoadFallback(err, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var consoleLabel = String(opts.consoleLabel || 'Page').trim() || 'Page';
    if (err && window.console && typeof window.console.warn === 'function') {
      window.console.warn(consoleLabel + ' refresh failed:', err);
    }
    var state = opts.state && typeof opts.state === 'object' ? opts.state : null;
    var contentNode = opts.contentNode || null;
    if ((state && state.initialContentPainted) || !contentNode) {
      return false;
    }
    var fallbackText = String(opts.fallbackText || 'Page content is still loading.');
    contentNode.innerHTML = '<p class="placeholder">' + fallbackText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;') + '</p>';
    return notifyInitialContentPainted(opts.slug || '', opts);
  }

  function renderFromBootstrapSources(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var renderPayload = typeof opts.renderPayload === 'function' ? opts.renderPayload : null;
    if (!renderPayload) {
      return false;
    }
    if (typeof opts.readCache === 'function') {
      if (renderPayload(opts.readCache())) {
        return true;
      }
    }
    if (typeof opts.readPrerender !== 'function') {
      return false;
    }
    var prerenderedPayload = opts.readPrerender();
    if (!prerenderedPayload) {
      return false;
    }
    if (!renderPayload(prerenderedPayload)) {
      return false;
    }
    if (typeof opts.writeCache === 'function') {
      opts.writeCache(prerenderedPayload);
    }
    return true;
  }

  function renderManagedNostrBootstrapPayload(payload, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var isExpectedPayload = typeof opts.isExpectedPayload === 'function' ? opts.isExpectedPayload : null;
    if (!payload || (isExpectedPayload && !isExpectedPayload(payload))) {
      return false;
    }
    var authenticated = window.__wizardryHasLikelyAuthenticatedSession();
    var optimisticPayload = payload;
    if (opts.promoteAuthenticated !== false && !optimisticPayload.is_admin && authenticated) {
      optimisticPayload = Object.assign({}, optimisticPayload, { is_admin: true });
    }
    if (typeof opts.applyState !== 'function') {
      return false;
    }
    opts.applyState(optimisticPayload, payload, authenticated);
    var canAdoptStaticPrerender = typeof opts.canAdoptStaticPrerender === 'function'
      ? opts.canAdoptStaticPrerender(optimisticPayload, payload, authenticated)
      : true;
    var matchesStaticPrerender = canAdoptStaticPrerender
      && typeof opts.hasMatchingStaticPrerender === 'function'
      && opts.hasMatchingStaticPrerender(optimisticPayload, payload, authenticated);
    if (matchesStaticPrerender) {
      if (typeof opts.renderAdoptedPrerender === 'function') {
        opts.renderAdoptedPrerender(optimisticPayload, payload, authenticated);
      }
      if (typeof opts.afterRender === 'function') {
        opts.afterRender(optimisticPayload, payload, authenticated);
      }
      if (typeof opts.markInitialContentPainted === 'function') {
        opts.markInitialContentPainted();
      }
      return true;
    }
    if (typeof opts.renderAll !== 'function') {
      return false;
    }
    opts.renderAll(optimisticPayload, payload, authenticated);
    if (typeof opts.afterRender === 'function') {
      opts.afterRender(optimisticPayload, payload, authenticated);
    }
    if (typeof opts.markInitialContentPainted === 'function') {
      opts.markInitialContentPainted();
    }
    return true;
  }

  function renderManagedNostrPageBootstrapPayload(payload, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var rootNode = opts.rootNode || null;
    var contentNode = opts.contentNode || null;
    return renderManagedNostrBootstrapPayload(payload, {
      isExpectedPayload: opts.isExpectedPayload,
      applyState: opts.applyState,
      canAdoptStaticPrerender: opts.canAdoptStaticPrerender,
      promoteAuthenticated: opts.promoteAuthenticated,
      hasMatchingStaticPrerender: typeof opts.hasMatchingStaticPrerender === 'function'
        ? opts.hasMatchingStaticPrerender
        : function (optimisticPayload) {
            return hasMatchingStaticPrerender(rootNode, contentNode, optimisticPayload);
          },
      renderAdoptedPrerender: typeof opts.renderAdoptedPrerender === 'function'
        ? opts.renderAdoptedPrerender
        : function () {
            if (typeof opts.renderHead === 'function') {
              opts.renderHead();
            }
            if (typeof opts.renderAdmin === 'function') {
              opts.renderAdmin();
            }
            if (typeof opts.renderValidation === 'function') {
              opts.renderValidation();
            }
          },
      renderAll: opts.renderAll,
      afterRender: opts.afterRender,
      markInitialContentPainted: opts.markInitialContentPainted
    });
  }

  function renderManagedNostrBootstrapSources(options) {
    var opts = options && typeof options === 'object' ? options : {};
    return renderFromBootstrapSources({
      readCache: function () {
        return readBootstrapCache({
          storageKey: pageBootstrapCacheKey(opts.slug),
          maxAgeMs: opts.maxAgeMs,
          authSignature: opts.authSignature || sessionAuthSignature,
          isExpectedPayload: opts.isExpectedPayload,
          allowRead: opts.allowRead,
          clearOnDeny: opts.clearOnDeny
        });
      },
      readPrerender: function () {
        return readNostrPageBootstrap(opts.slug, opts.isExpectedPayload);
      },
      renderPayload: opts.renderPayload,
      writeCache: opts.writeCache || function (payload) {
        writePageBootstrapCache(payload, {
          slug: opts.slug,
          authSignature: opts.authSignature || sessionAuthSignature,
          allowWrite: opts.allowWrite,
          clearOnDeny: opts.clearOnDeny
        });
      }
    });
  }

  function refreshManagedNostrPage(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var endpoint = String(opts.endpoint || '/cgi/blog-get-nostr-page').trim() || '/cgi/blog-get-nostr-page';
    var slug = String(opts.slug || '').trim();
    var requestSlug = Object.prototype.hasOwnProperty.call(opts, 'pageSlug')
      ? String(opts.pageSlug || slug).trim()
      : slug;
    var auth = authPayload();
    var params = new URLSearchParams({
      page_slug: requestSlug,
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    });
    return fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: params.toString()
    }).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (_err) {
          throw new Error('Invalid JSON response');
        }
        if (!res.ok || !data || data.success === false) {
          if (typeof opts.handleFailurePayload === 'function' && opts.handleFailurePayload(data || null, res) === true) {
            return null;
          }
          var err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
          err.code = data && data.code ? String(data.code) : '';
          err.payload = data || null;
          throw err;
        }
        return data;
      });
    }).then(function (payload) {
      if (!payload) {
        return null;
      }
      if (typeof opts.isExpectedPayload === 'function' && !opts.isExpectedPayload(payload)) {
        throw new Error(String(opts.unexpectedPayloadMessage || 'Unexpected managed page payload'));
      }
      writePageBootstrapCache(payload, {
        slug: slug || requestSlug,
        authSignature: opts.authSignature || sessionAuthSignature,
        allowWrite: opts.allowWrite,
        clearOnDeny: opts.clearOnDeny
      });
      if (typeof opts.renderPayload === 'function') {
        opts.renderPayload(payload);
      }
      if (typeof opts.afterRender === 'function') {
        opts.afterRender(payload);
      }
      return payload;
    }).catch(function (err) {
      if (typeof opts.handleError === 'function') {
        opts.handleError(err);
        return null;
      }
      throw err;
    }).finally(function () {
      if (typeof opts.onFinally === 'function') {
        opts.onFinally();
      }
    });
  }

  function postFormJson(url, payload, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var body = new URLSearchParams(payload || {});
    return fetch(String(url || ''), {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString()
    }).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (_err) {
          throw new Error(String(opts.invalidJsonMessage || 'Invalid JSON response'));
        }
        if (!res.ok || !data || data.success === false) {
          var err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
          err.code = data && data.code ? String(data.code) : '';
          err.payload = data || null;
          throw err;
        }
        return data;
      });
    });
  }

  function showRouteLoadFailure() {
    var mainContainer = document.querySelector('main');
    var nav = document.querySelector('nav.site-nav');
    var body = document.body;
    var parent = mainContainer || (nav && nav.parentNode) || body;
    if (!parent) {
      return;
    }
    var existing = document.getElementById('route-load-failure');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    var panel = document.createElement('section');
    panel.id = 'route-load-failure';
    panel.className = 'route-load-failure';
    panel.innerHTML = '<h1>Page is still loading.</h1><p>Try refreshing in a moment.</p>';
    if (mainContainer) {
      mainContainer.insertBefore(panel, mainContainer.firstChild || null);
    } else if (nav && nav.parentNode) {
      nav.insertAdjacentElement('afterend', panel);
    } else {
      body.insertBefore(panel, body.firstChild || null);
    }
    forceHydrationReveal();
  }

  function cancelRouteLoadFailure() {
    if (routeFailureTimer) {
      window.clearTimeout(routeFailureTimer);
      routeFailureTimer = 0;
    }
    var existing = document.getElementById('route-load-failure');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  function scheduleRouteLoadFailure() {
    cancelRouteLoadFailure();
    routeFailureTimer = window.setTimeout(function () {
      routeFailureTimer = 0;
      if (!window.__wizardryPageInitialContentReady) {
        showRouteLoadFailure();
      }
    }, 2200);
  }

  function themeFromConfig() {
    var theme = 'lapidarist';
    try {
      var bootstrap = window.__wizardrySiteBootstrap || {};
      var config = bootstrap && bootstrap.config && typeof bootstrap.config === 'object' ? bootstrap.config : {};
      var hasConfiguredTheme = Object.prototype.hasOwnProperty.call(config, 'theme');
      var cachedTheme = hasConfiguredTheme ? '' : (localStorage.getItem('wizardry_blog_theme_v1') || '');
      var nextTheme = String(hasConfiguredTheme ? config.theme : cachedTheme).trim();
      if (nextTheme) {
        theme = nextTheme;
      }
    } catch (_err) {
      // Ignore storage failures.
    }
    return theme;
  }

  function themeStylesheetVersion() {
    return String(window.__wizardryThemeStylesheetVersion || '20260622-lapidarist-restore1');
  }

  function reconcileThemeLink() {
    var theme = themeFromConfig();
    var href = '/static/themes/' + encodeURIComponent(theme) + '.css?v=' + encodeURIComponent(themeStylesheetVersion());
    var link = document.getElementById('theme-stylesheet');
    if (!link) {
      link = document.createElement('link');
      link.id = 'theme-stylesheet';
      link.rel = 'stylesheet';
      (document.head || document.documentElement).appendChild(link);
    }
    var currentHref = String(link.getAttribute('data-theme-href') || link.getAttribute('href') || '').trim();
    if (currentHref !== href) {
      var preloader = document.createElement('link');
      preloader.rel = 'stylesheet';
      preloader.href = href;
      preloader.media = 'not all';
      preloader.setAttribute('data-theme-preload', 'true');
      var committed = false;
      function commit() {
        if (committed) {
          return;
        }
        committed = true;
        link.setAttribute('href', href);
        if (preloader.parentNode) {
          preloader.parentNode.removeChild(preloader);
        }
      }
      preloader.addEventListener('load', commit, { once: true });
      preloader.addEventListener('error', commit, { once: true });
      (link.parentNode || document.head || document.documentElement).appendChild(preloader);
      window.setTimeout(commit, 1500);
    }
    link.setAttribute('data-theme-href', href);
  }

  window.__wizardryApplyPageTitle = function (baseTitle) {
    return applyPageTitle(baseTitle);
  };

  window.__wizardryMarkHydrationPageReady = markHydrationPageReady;
  window.__wizardryNotifyInitialContentPainted = notifyInitialContentPainted;
  window.__wizardryRenderLoadFallback = renderLoadFallback;
  window.__wizardryRenderManagedNostrPageBootstrapPayload = renderManagedNostrPageBootstrapPayload;
  window.__wizardryRemoveLegacyTitleBlock = removeLegacyTitleBlock;
  window.__wizardryRenderReadOnlyPageHead = renderReadOnlyPageHead;
  window.__wizardryRenderEditablePageHeadTitle = renderEditablePageHeadTitle;
  window.__wizardryRenderEditablePageHeadDescription = renderEditablePageHeadDescription;
  window.__wizardryFocusEditablePageHeadField = focusEditablePageHeadField;
  window.__wizardryRenderEditableNavbarTitleRow = renderEditableNavbarTitleRow;
  window.__wizardryFocusEditableNavbarTitleInput = focusEditableNavbarTitleInput;
  window.__wizardryEnsureMatchingStaticShell = ensureMatchingStaticShell;
  window.__wizardryReconcileAdoptedPrerenderRefresh = reconcileAdoptedPrerenderRefresh;
  window.__wizardryRenderResolvedReadOnlyContent = renderResolvedReadOnlyContent;
  window.__wizardrySyncStatusPillHtml = syncStatusPillHtml;
  window.__wizardryRenderSyncStatusPill = renderSyncStatusPill;
  window.__wizardryStripLegacyNostrSyncPills = stripLegacyNostrSyncPills;
  window.__wizardryWritePageBootstrapCache = writePageBootstrapCache;
  window.__wizardryAuthPayload = authPayload;
  window.__wizardrySessionAuthSignature = sessionAuthSignature;
  window.__wizardryBindSessionAuthRefresh = bindSessionAuthRefresh;
  window.__wizardryHasLikelyAuthenticatedSession = hasLikelyAuthenticatedSession;
  window.__wizardryCanUseVisitorPrerenderReadOnly = canUseVisitorPrerenderReadOnly;
  window.__wizardryEnsureNostrPublishDialog = ensureNostrPublishDialog;
  window.__wizardryScheduleMarkedUpgrade = scheduleMarkedUpgrade;
  window.__wizardryRenderManagedNostrBootstrapSources = renderManagedNostrBootstrapSources;
  window.__wizardryRefreshManagedNostrPage = refreshManagedNostrPage;
  window.__wizardryPostFormJson = postFormJson;

  window.__wizardrySetPageTitleConfig = function (siteTitle, appendSiteTitle) {
    var normalizedSiteTitle = normalizeSiteTitle(siteTitle);
    var enabled = normalizeAppendSiteTitleEnabled(appendSiteTitle);
    try {
      localStorage.setItem(SITE_TITLE_CACHE_KEY, normalizedSiteTitle);
      localStorage.setItem(APPEND_SITE_TITLE_CACHE_KEY, enabled ? '1' : '0');
    } catch (_err) {
      // Ignore storage failures.
    }
    return applyPageTitle(undefined, { siteTitle: normalizedSiteTitle, appendSiteTitle: enabled });
  };

  reconcileThemeLink();
  applyPageTitle(document.title);

  var canonical = document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = window.location.origin + window.location.pathname;
  document.head.appendChild(canonical);

  var ogUrl = document.createElement('meta');
  ogUrl.setAttribute('property', 'og:url');
  ogUrl.setAttribute('content', canonical.href);
  document.head.appendChild(ogUrl);

  document.addEventListener('DOMContentLoaded', function () {
    var firstHeading = document.querySelector('h1[id]') || document.querySelector('h1');
    if (firstHeading && !firstHeading.id) {
      firstHeading.id = 'main-content';
    }

    try {
      var currentUrl = new URL(window.location.href);
      var expectedSlug = slugFromPath(currentUrl.pathname || '/');
      var rootSlug = routeRootSlugFromDom();
      var hasRefreshParam = currentUrl.searchParams.get(ROUTE_REFRESH_PARAM) === '1';
      var hasRepairParam = currentUrl.searchParams.get(ROUTE_REPAIR_PARAM) === '1';
      if (expectedSlug && rootSlug && !slugsEquivalent(expectedSlug, rootSlug)) {
        if (!hasRefreshParam) {
          currentUrl.searchParams.set(ROUTE_REFRESH_PARAM, '1');
          window.location.replace(currentUrl.toString());
          return;
        }
        scheduleRouteLoadFailure();
        return;
      }
      if ((hasRefreshParam || hasRepairParam) && window.history && typeof window.history.replaceState === 'function') {
        currentUrl.searchParams.delete(ROUTE_REFRESH_PARAM);
        currentUrl.searchParams.delete(ROUTE_REPAIR_PARAM);
        var next = currentUrl.pathname;
        var query = currentUrl.searchParams.toString();
        if (query) {
          next += '?' + query;
        }
        if (currentUrl.hash) {
          next += currentUrl.hash;
        }
        window.history.replaceState(null, '', next);
      }
    } catch (_routeErr) {
      // Ignore URL parsing/runtime failures.
    }
  });

  window.addEventListener('blog-page-initial-content-ready', function () {
    cancelRouteLoadFailure();
  });
})();
