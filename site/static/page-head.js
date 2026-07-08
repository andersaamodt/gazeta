(function () {
  var ROUTE_REFRESH_PARAM = '__route_refresh';
  var ROUTE_REPAIR_PARAM = '__route_repair';
  var SITE_TITLE_CACHE_KEY = 'wizardry_blog_site_title_v1';
  var APPEND_SITE_TITLE_CACHE_KEY = 'wizardry_blog_append_site_title_to_page_title_v1';
  var routeFailureTimer = 0;
  var pageInitialContentReady = false;
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

  function ensureReadOnlyTitleShell(titleNode) {
    if (!titleNode) {
      return { text: null, actions: null };
    }
    var existingActions = titleNode.querySelector('.list-page-title-actions');
    var actionsId = String(existingActions && existingActions.id || '').trim();
    var actionsClassName = String(existingActions && existingActions.className || 'list-page-title-actions').trim() || 'list-page-title-actions';
    var text = titleNode.querySelector('.list-page-title-text');
    var actions = actionsId ? document.getElementById(actionsId) : existingActions;
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

  function titleActionsHostHtml(titleNode) {
    var existingActions = titleNode && titleNode.querySelector
      ? titleNode.querySelector('.list-page-title-actions')
      : null;
    var actionsId = String(existingActions && existingActions.id || '').trim();
    var actionsClassName = String(existingActions && existingActions.className || 'list-page-title-actions').trim() || 'list-page-title-actions';
    return '<span' +
      (actionsId ? ' id="' + escapeHtml(actionsId) + '"' : '') +
      ' class="' + escapeHtml(actionsClassName) + '"></span>';
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

  function renderReadOnlyTitleShell(titleNode, textValue) {
    var shell = ensureReadOnlyTitleShell(titleNode);
    if (shell && shell.text) {
      shell.text.textContent = String(textValue || '');
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
    var actionsHtml = titleActionsHostHtml(targetNode);
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

  function managedPageHeadDescriptionState(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var format = String(opts.format || '').trim().toLowerCase() === 'text' ? 'text' : 'html';
    var text = String(opts.text || '');
    var hidden = Object.prototype.hasOwnProperty.call(opts, 'hidden')
      ? !!opts.hidden
      : (!text.trim() && opts.hideWhenEmpty === true);
    if (format === 'text') {
      return {
        descriptionFallback: {
          text: text,
          hidden: hidden
        }
      };
    }
    return {
      descriptionFallback: {
        html: String(opts.html || ''),
        hidden: hidden
      }
    };
  }

  function managedPageHeadTitleState(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var renderState = opts.renderState && typeof opts.renderState === 'object' ? opts.renderState : null;
    var payload = opts.payload && typeof opts.payload === 'object' ? opts.payload : null;
    var fallbackTitleText = String(opts.fallbackTitleText || '').trim() || 'Untitled';
    var explicitTitleText = Object.prototype.hasOwnProperty.call(opts, 'titleText')
      ? String(opts.titleText || '').trim()
      : '';
    var renderTitle = String(renderState && renderState.title || '').trim();
    var titleText = explicitTitleText || renderTitle || fallbackTitleText;
    var pageTitle = null;
    if (Object.prototype.hasOwnProperty.call(opts, 'pageTitle')) {
      pageTitle = opts.pageTitle === null || typeof opts.pageTitle === 'undefined'
        ? null
        : String(opts.pageTitle || '').trim();
    } else if (renderTitle) {
      pageTitle = renderTitle;
    } else if (opts.useFallbackForPageTitle === true) {
      pageTitle = titleText;
    }
    var syncStatus = payload && Object.prototype.hasOwnProperty.call(payload, 'sync_status')
      ? payload.sync_status
      : null;
    var syncMessageVariant = String(opts.syncMessageVariant || '').trim();
    return {
      pageTitle: pageTitle,
      titleText: titleText,
      syncStatus: syncStatus,
      titleSyncOptions: syncMessageVariant ? { messageVariant: syncMessageVariant } : null
    };
  }

  function managedPageHeadFieldState(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var renderState = opts.renderState && typeof opts.renderState === 'object' ? opts.renderState : null;
    var titleState = managedPageHeadTitleState({
      renderState: renderState,
      payload: opts.payload,
      fallbackTitleText: opts.fallbackTitleText,
      syncMessageVariant: opts.syncMessageVariant
    });
    var titleText = titleState.titleText;
    var activeField = String(opts.activeField || '').trim().toLowerCase();
    var isAdmin = opts.isAdmin === true;
    var titleInputId = String(opts.titleInputId || '').trim();
    var descriptionInputId = String(opts.descriptionInputId || '').trim();
    var inputAttrName = String(opts.inputAttrName || '').trim();
    var editAttrName = String(opts.editAttrName || '').trim();
    var saveAttrName = String(opts.saveAttrName || '').trim();
    var descriptionText = String(opts.descriptionText || '');
    var descriptionHtml = String(opts.descriptionHtml || '');
    var hasMainContent = opts.hasMainContent === true;
    var focusOptions = null;
    if (isAdmin && activeField && opts.enableFocus === true) {
      focusOptions = {
        activeField: activeField,
        titleInputId: titleInputId,
        descriptionInputId: descriptionInputId
      };
      if (Object.prototype.hasOwnProperty.call(opts, 'focusSelectOnFocus')) {
        focusOptions.selectOnFocus = opts.focusSelectOnFocus;
      }
      if (typeof opts.focusAfter === 'function') {
        focusOptions.afterFocus = opts.focusAfter;
      }
    }
    return {
      pageTitle: titleState.pageTitle,
      titleText: titleState.titleText,
      syncStatus: titleState.syncStatus,
      titleSyncOptions: titleState.titleSyncOptions,
      titleEditOptions: {
        activeField: activeField,
        editMode: opts.editMode === true,
        value: titleText,
        fallbackText: String(opts.fallbackTitleText || '').trim() || 'Untitled',
        inputId: titleInputId,
        inputAttrName: inputAttrName,
        editAttrName: editAttrName,
        saveAttrName: saveAttrName,
        showSaveButton: opts.showTitleSaveButton === true
      },
      descriptionEditOptions: {
        activeField: activeField,
        editMode: opts.editMode === true,
        text: descriptionText,
        textHtml: descriptionHtml,
        suppressEmpty: !descriptionText.trim() && !hasMainContent && activeField !== 'description',
        hideWhenEmpty: opts.descriptionHideWhenEmpty === true,
        inputId: descriptionInputId,
        inputAttrName: inputAttrName,
        editAttrName: editAttrName,
        saveAttrName: saveAttrName,
        editingExtraHtml: String(opts.descriptionEditingExtraHtml || '')
      },
      focusOptions: focusOptions
    };
  }

  function renderManagedPageHeadForPage(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var payload = opts.payload && typeof opts.payload === 'object' ? opts.payload : null;
    var titleNode = opts.titleNode || null;
    var descriptionNode = opts.descriptionNode || null;
    var usingFieldState = opts.fieldStateOptions && typeof opts.fieldStateOptions === 'object';
    var headStateOptions = usingFieldState
      ? Object.assign({}, opts.fieldStateOptions)
      : Object.assign({}, opts.titleStateOptions && typeof opts.titleStateOptions === 'object'
          ? opts.titleStateOptions
          : {});
    if (!Object.prototype.hasOwnProperty.call(headStateOptions, 'payload')) {
      headStateOptions.payload = payload;
    }
    var headState = usingFieldState
      ? managedPageHeadFieldState(headStateOptions)
      : managedPageHeadTitleState(headStateOptions);
    var navbarTitleOptions = null;
    if (opts.navbarTitleOptions && typeof opts.navbarTitleOptions === 'object') {
      navbarTitleOptions = managedNavbarTitlePageOptions(Object.assign({}, opts.navbarTitleOptions, {
        payload: Object.prototype.hasOwnProperty.call(opts.navbarTitleOptions, 'payload')
          ? opts.navbarTitleOptions.payload
          : payload,
        titleNode: Object.prototype.hasOwnProperty.call(opts.navbarTitleOptions, 'titleNode')
          ? opts.navbarTitleOptions.titleNode
          : titleNode
      }));
    }
    var renderOptions = {
      isAdmin: opts.isAdmin === true,
      pageTitle: headState.pageTitle,
      titleNode: titleNode,
      titleText: headState.titleText,
      titleSyncOptions: headState.titleSyncOptions,
      syncStatus: headState.syncStatus,
      navbarTitleOptions: navbarTitleOptions
    };
    if (descriptionNode && opts.descriptionStateOptions && typeof opts.descriptionStateOptions === 'object') {
      renderOptions.descriptionNode = descriptionNode;
      renderOptions.descriptionPayload = payload;
      renderOptions.descriptionFallback = managedPageHeadDescriptionState(opts.descriptionStateOptions).descriptionFallback;
      if (Object.prototype.hasOwnProperty.call(opts, 'allowPrerenderDescription')) {
        renderOptions.allowPrerenderDescription = opts.allowPrerenderDescription;
      }
    }
    if (usingFieldState) {
      renderOptions.titleEditOptions = headState.titleEditOptions;
      renderOptions.descriptionEditOptions = headState.descriptionEditOptions;
      renderOptions.focusOptions = headState.focusOptions;
    }
    renderManagedPageHead(renderOptions);
    return {
      headState: headState,
      navbarTitleOptions: navbarTitleOptions,
      renderOptions: renderOptions
    };
  }

  function renderManagedPageHead(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var admin = opts.isAdmin === true;
    if (admin) {
      if (opts.titleNode) {
        renderEditablePageHeadTitle(opts.titleNode, opts.titleEditOptions);
      }
      if (opts.descriptionNode) {
        renderEditablePageHeadDescription(opts.descriptionNode, opts.descriptionEditOptions);
      }
      if (opts.focusOptions && typeof opts.focusOptions === 'object') {
        focusEditablePageHeadField(opts.focusOptions);
      }
      if (opts.navbarTitleOptions && typeof opts.navbarTitleOptions === 'object') {
        renderManagedNavbarTitleState(opts.navbarTitleOptions);
      }
      return true;
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'pageTitle') && opts.pageTitle !== null && typeof opts.pageTitle !== 'undefined') {
      var pageTitle = String(opts.pageTitle || '').trim();
      if (pageTitle) {
        applyPageTitle(pageTitle);
      }
    }
    if (opts.titleNode) {
      var titleShell = renderReadOnlyTitleShell(opts.titleNode, opts.titleText);
      opts.titleNode.hidden = false;
      if (titleShell && titleShell.actions) {
        renderSyncStatusPill(titleShell.actions, opts.syncStatus, opts.titleSyncOptions);
      }
    }
    if (opts.descriptionNode && Object.prototype.hasOwnProperty.call(opts, 'descriptionFallback')) {
      var descriptionFragment = null;
      if (opts.allowPrerenderDescription !== false) {
        descriptionFragment = readPrerenderHtmlFragment(opts.descriptionPayload, 'description');
      }
      if (descriptionFragment) {
        renderReadOnlyDescriptionShell(opts.descriptionNode, {
          html: descriptionFragment.html,
          hidden: descriptionFragment.hidden
        });
      } else {
        renderReadOnlyDescriptionShell(opts.descriptionNode, opts.descriptionFallback);
      }
    }
    if (opts.navbarTitleOptions && typeof opts.navbarTitleOptions === 'object') {
      renderManagedNavbarTitleState(opts.navbarTitleOptions);
    }
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
    var editButtonClassName = String(opts.editButtonClassName || 'list-inline-edit-link').trim() || 'list-inline-edit-link';
    var saveButtonClassName = String(opts.saveButtonClassName || editButtonClassName).trim() || editButtonClassName;
    var saveDisabled = opts.saveDisabled === true;
    var html = '<div class="list-page-nav-title-row">';
    html += '<span class="list-page-nav-title-label">' + escapeHtml(labelText) + '</span>';
    if (editing) {
      html += '<span class="list-page-nav-title-edit-wrap">';
      html += '<input type="text" class="list-page-nav-title-input" value="' + escapeHtml(inputValue) + '" data-page-nav-title-input="true" aria-label="' + escapeHtml(inputAriaLabel) + '">';
      html += '<button type="button" class="' + escapeHtml(saveButtonClassName) + '" data-page-nav-title-action="save"' + (saveDisabled ? ' disabled aria-disabled="true"' : '') + '>OK</button>';
      html += '</span>';
    } else {
      html += '<span class="list-page-nav-title-value">' + escapeHtml(currentText) + '</span>';
      html += '<button type="button" class="' + escapeHtml(editButtonClassName) + '" data-page-nav-title-action="edit">Edit...</button>';
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
    requestAnimationFrame(function () {
      var input = targetNode.querySelector('[data-page-nav-title-input="true"]');
      if (input && typeof input.focus === 'function') {
        input.focus();
        if (opts.selectOnFocus !== false && typeof input.select === 'function') {
          input.select();
        }
      }
    });
    return true;
  }

  function renderManagedNavbarTitleRow(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var titleNode = opts.titleNode || null;
    var resolvedTarget = titleNode && titleNode.querySelector
      ? titleNode.querySelector('[data-page-nav-title-host="true"]')
      : null;
    if (!resolvedTarget) {
      return false;
    }
    var shouldShow = opts.isAdmin === true && opts.editMode === true;
    if (titleNode && titleNode.classList) {
      titleNode.classList.toggle('has-nav-title-row', shouldShow);
    }
    if (!shouldShow) {
      return renderEditableNavbarTitleRow(resolvedTarget, { hidden: true });
    }
    var editing = opts.editing === true;
    var rendered = renderEditableNavbarTitleRow(resolvedTarget, {
      currentText: opts.currentText,
      editing: editing,
      inputValue: opts.inputValue,
      labelText: opts.labelText,
      inputAriaLabel: opts.inputAriaLabel,
      editButtonClassName: opts.editButtonClassName,
      saveButtonClassName: opts.saveButtonClassName,
      saveDisabled: opts.saveDisabled
    });
    if (rendered && editing) {
      focusEditableNavbarTitleInput({
        targetNode: resolvedTarget,
        selectOnFocus: opts.selectOnFocus
      });
    }
    return rendered;
  }

  function resolveRootAttributeFallbackText(rootNode, attributeNames, fallbackText) {
    var root = rootNode || null;
    var names = Array.isArray(attributeNames) ? attributeNames : [];
    if (root && typeof root.getAttribute === 'function') {
      for (var i = 0; i < names.length; i += 1) {
        var attrName = String(names[i] || '').trim();
        if (!attrName) {
          continue;
        }
        var attrValue = String(root.getAttribute(attrName) || '').trim();
        if (attrValue) {
          return attrValue;
        }
      }
    }
    return String(fallbackText || '').trim();
  }

  function resolveManagedNavbarTitle(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var configured = String(opts.configuredText || '').trim();
    if (configured) {
      return configured;
    }
    var payload = opts.payload && typeof opts.payload === 'object' ? opts.payload : null;
    var payloadTitle = String(payload && payload.nav_title || '').trim();
    if (payloadTitle) {
      return payloadTitle;
    }
    var renderState = opts.renderState && typeof opts.renderState === 'object' ? opts.renderState : null;
    var renderTitle = String(renderState && renderState.title || '').trim();
    if (renderTitle) {
      return renderTitle;
    }
    var fallbackText = resolveRootAttributeFallbackText(
      opts.rootNode || null,
      Array.isArray(opts.fallbackAttributeNames) ? opts.fallbackAttributeNames : ['data-page-title'],
      opts.fallbackText
    );
    if (fallbackText) {
      return fallbackText;
    }
    return 'Untitled';
  }

  function renderManagedNavbarTitleState(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var current = resolveManagedNavbarTitle({
      configuredText: opts.configuredText,
      payload: opts.payload,
      renderState: opts.renderState,
      rootNode: opts.rootNode,
      fallbackAttributeNames: opts.fallbackAttributeNames,
      fallbackText: opts.fallbackText
    });
    renderManagedNavbarTitleRow({
      isAdmin: opts.isAdmin,
      editMode: opts.editMode,
      titleNode: opts.titleNode,
      currentText: current,
      editing: opts.editing,
      inputValue: Object.prototype.hasOwnProperty.call(opts, 'inputValue') ? opts.inputValue : current,
      labelText: opts.labelText,
      inputAriaLabel: opts.inputAriaLabel,
      editButtonClassName: opts.editButtonClassName,
      saveButtonClassName: opts.saveButtonClassName,
      saveDisabled: opts.saveDisabled,
      selectOnFocus: opts.selectOnFocus
    });
    return current;
  }

  function managedNavbarTitleOptions(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var result = {
      rootNode: opts.rootNode || null,
      fallbackAttributeNames: Array.isArray(opts.fallbackAttributeNames)
        ? opts.fallbackAttributeNames.slice()
        : ['data-page-title'],
      fallbackText: String(opts.fallbackText || '').trim() || 'Untitled'
    };
    [
      'configuredText',
      'payload',
      'renderState',
      'isAdmin',
      'editMode',
      'titleNode',
      'editing',
      'inputValue',
      'labelText',
      'inputAriaLabel',
      'editButtonClassName',
      'saveButtonClassName',
      'saveDisabled',
      'selectOnFocus',
      'currentText'
    ].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(opts, key)) {
        result[key] = opts[key];
      }
    });
    return result;
  }

  function managedNavbarTitlePageActionOptions(options) {
    var opts = options && typeof options === 'object' ? options : {};
    return Object.assign(
      managedNavbarTitleOptions({
        configuredText: opts.configuredText,
        payload: opts.payload,
        renderState: opts.renderState,
        rootNode: opts.rootNode,
        fallbackAttributeNames: opts.fallbackAttributeNames,
        fallbackText: opts.fallbackText,
        isAdmin: opts.isAdmin,
        editMode: opts.editMode,
        titleNode: opts.titleNode,
        editing: opts.editing,
        inputValue: opts.inputValue,
        labelText: opts.labelText,
        inputAriaLabel: opts.inputAriaLabel,
        editButtonClassName: opts.editButtonClassName,
        saveButtonClassName: opts.saveButtonClassName,
        saveDisabled: opts.saveDisabled,
        selectOnFocus: opts.selectOnFocus
      }),
      {
        state: opts.state,
        payload: opts.payload,
        rootNode: opts.rootNode || null,
        slug: opts.slug,
        isAdmin: opts.isAdmin,
        renderHead: opts.renderHead
      }
    );
  }

  function managedNavbarTitlePageOptions(options) {
    var opts = options && typeof options === 'object' ? options : {};
    return Object.assign(
      managedNavbarTitleOptions({
        configuredText: opts.configuredText,
        payload: opts.payload,
        renderState: opts.renderState,
        rootNode: opts.rootNode,
        fallbackAttributeNames: opts.fallbackAttributeNames,
        fallbackText: opts.fallbackText,
        isAdmin: opts.isAdmin,
        editMode: opts.editMode,
        titleNode: opts.titleNode,
        editing: opts.editing,
        inputValue: opts.inputValue,
        labelText: opts.labelText,
        inputAriaLabel: opts.inputAriaLabel,
        editButtonClassName: opts.editButtonClassName,
        saveButtonClassName: opts.saveButtonClassName,
        saveDisabled: opts.saveDisabled,
        selectOnFocus: opts.selectOnFocus
      }),
      {
        state: opts.state,
        payload: opts.payload,
        rootNode: opts.rootNode || null,
        slug: opts.slug,
        isAdmin: opts.isAdmin,
        renderHead: opts.renderHead
      }
    );
  }

  function renderManagedValidationSummary(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var containerNode = opts.containerNode || null;
    if (!containerNode) {
      return false;
    }
    var visible = opts.visible === true;
    var errors = Array.isArray(opts.errors) ? opts.errors : [];
    var warnings = Array.isArray(opts.warnings) ? opts.warnings : [];
    if (!visible || (!errors.length && !warnings.length)) {
      containerNode.hidden = true;
      containerNode.innerHTML = '';
      return false;
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
    containerNode.hidden = false;
    containerNode.innerHTML = html;
    return true;
  }

  function filterManagedValidationMessages(messages, options) {
    var list = Array.isArray(messages) ? messages : [];
    var opts = options && typeof options === 'object' ? options : {};
    if (opts.suppressTransientStateErrors !== true) {
      return list.slice();
    }
    return list.filter(function (msg) {
      var text = String(msg || '').trim().toLowerCase();
      if (!text) {
        return false;
      }
      return !(/could not validate .*state/.test(text) || /validation .*temporarily unavailable/.test(text));
    });
  }

  function renderManagedPayloadValidationSummary(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var payload = opts.payload && typeof opts.payload === 'object' ? opts.payload : null;
    var validation = payload && payload.validation && typeof payload.validation === 'object'
      ? payload.validation
      : {};
    return renderManagedValidationSummary({
      containerNode: opts.containerNode || null,
      visible: opts.visible === true,
      errors: filterManagedValidationMessages(validation.errors, {
        suppressTransientStateErrors: opts.suppressTransientStateErrors === true
      }),
      warnings: opts.includeWarnings === false
        ? []
        : filterManagedValidationMessages(validation.warnings, {
            suppressTransientStateErrors: opts.suppressTransientStateErrors === true
          })
    });
  }

  function renderManagedSaveStatus(node, status) {
    if (!node) {
      return false;
    }
    var nextStatus = String(status || '').trim();
    node.classList.toggle('is-error', nextStatus === 'error');
    if (nextStatus === 'saving') {
      node.innerHTML = '<span class="save-spinner" aria-hidden="true"></span>Saving...';
      return true;
    }
    if (nextStatus === 'error') {
      node.textContent = 'Save failed';
      return true;
    }
    node.textContent = 'Saved';
    return true;
  }

  function managedSaveStatusHtml(options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (opts.visible !== true) {
      return '';
    }
    var statusId = String(opts.statusId || '').trim();
    var status = String(opts.status || '').trim();
    var html = '<span';
    if (statusId) {
      html += ' id="' + escapeHtml(statusId) + '"';
    }
    html += ' class="list-admin-save-status" aria-live="polite">';
    if (status === 'saving') {
      html += '<span class="save-spinner" aria-hidden="true"></span>Saving...';
    } else if (status === 'error') {
      html += 'Save failed';
    } else {
      html += 'Saved';
    }
    html += '</span>';
    return html;
  }

  function renderManagedAdminActionBarHtml(options) {
    var opts = options && typeof options === 'object' ? options : {};
    function actionAttr(name, value) {
      var attrName = String(name || '').trim();
      if (!attrName) {
        return '';
      }
      return ' ' + attrName + '="' + escapeHtml(String(value || '')) + '"';
    }
    var html = '<span class="list-page-admin-bar">';
    html += managedSaveStatusHtml({
      visible: opts.saveIndicatorVisible === true,
      statusId: opts.saveStatusId,
      status: opts.saveStatus
    });
    if (opts.showRevert === true) {
      html += '<button type="button"'
        + actionAttr(opts.revertActionAttrName || 'data-action', String(opts.revertAction || 'revert'))
        + htmlAttr('title', String(opts.revertTitle || ''))
        + (opts.canRevert === true ? '' : ' disabled aria-disabled="true"')
        + '>Revert</button>';
    }
    html += syncStatusPillHtml(opts.syncStatus, opts.syncOptions);
    if (opts.showPublish === true) {
      html += '<button type="button" class="' + escapeHtml(String(opts.primaryButtonClassName || 'list-admin-primary-btn')) + '"'
        + actionAttr(opts.publishActionAttrName || 'data-action', String(opts.publishAction || 'publish'))
        + '>' + escapeHtml(String(opts.publishLabel || 'Publish to Nostr...')) + '</button>';
    }
    html += '<button type="button" class="' + escapeHtml(String(opts.primaryButtonClassName || 'list-admin-primary-btn')) + '"'
      + actionAttr(opts.editActionAttrName || 'data-action', String(opts.editAction || 'toggle-edit'))
      + '>' + escapeHtml(opts.editMode ? String(opts.doneLabel || 'Done') : String(opts.editLabel || 'Edit')) + '</button>';
    html += '</span>';
    return html;
  }

  function renderManagedAdminActionBar(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var adminNode = opts.adminNode || null;
    var actionsHostNode = opts.actionsHostNode || null;
    if (actionsHostNode && opts.clearActionsHost !== false) {
      actionsHostNode.innerHTML = '';
    }
    if (opts.isAdmin !== true) {
      if (typeof opts.onHide === 'function') {
        opts.onHide();
      }
      if (adminNode) {
        adminNode.hidden = true;
        adminNode.innerHTML = '';
      }
      return false;
    }
    var payload = opts.payload && typeof opts.payload === 'object' ? opts.payload : {};
    var hasCanonical = !!payload.canonical_exists;
    var hasDraftChanges = !!payload.draft_differs;
    var canRevert = Object.prototype.hasOwnProperty.call(opts, 'canRevert')
      ? opts.canRevert === true
      : (hasCanonical && hasDraftChanges);
    var html = renderManagedAdminActionBarHtml({
      saveIndicatorVisible: opts.saveIndicatorVisible === true,
      saveStatusId: opts.saveStatusId,
      saveStatus: opts.saveStatus,
      showRevert: Object.prototype.hasOwnProperty.call(opts, 'showRevert')
        ? opts.showRevert === true
        : opts.editMode === true,
      revertActionAttrName: opts.revertActionAttrName,
      revertAction: opts.revertAction,
      revertTitle: String(
        opts.revertTitle || (
          canRevert
            ? 'Revert draft to Nostr version'
            : (hasCanonical ? 'No local changes to revert' : 'No Nostr version found')
        )
      ),
      canRevert: canRevert,
      syncStatus: payload.sync_status,
      syncOptions: opts.syncOptions,
      showPublish: Object.prototype.hasOwnProperty.call(opts, 'showPublish')
        ? opts.showPublish === true
        : (opts.editMode === true || hasDraftChanges),
      publishActionAttrName: opts.publishActionAttrName,
      publishAction: opts.publishAction,
      publishLabel: opts.publishLabel,
      editActionAttrName: opts.editActionAttrName,
      editAction: opts.editAction,
      editMode: opts.editMode === true,
      editLabel: opts.editLabel,
      doneLabel: opts.doneLabel,
      primaryButtonClassName: opts.primaryButtonClassName
    });
    if (actionsHostNode) {
      actionsHostNode.innerHTML = html;
    }
    if (adminNode) {
      adminNode.hidden = true;
      adminNode.innerHTML = '';
    }
    return true;
  }

  function startManagedNavbarTitleEdit(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var state = opts.state && typeof opts.state === 'object' ? opts.state : null;
    if (!state) {
      return false;
    }
    state.navTitleEditing = true;
    state.navTitleInput = resolveManagedNavbarTitle(opts);
    if (typeof opts.renderHead === 'function') {
      opts.renderHead();
    }
    return true;
  }

  function saveManagedNavbarTitle(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var state = opts.state && typeof opts.state === 'object' ? opts.state : null;
    var isAdmin = typeof opts.isAdmin === 'function' ? opts.isAdmin() : opts.isAdmin === true;
    if (!state || !isAdmin || state.navTitleBusy) {
      return Promise.resolve(false);
    }
    var rootNode = opts.rootNode || null;
    var input = rootNode && rootNode.querySelector ? rootNode.querySelector('[data-page-nav-title-input="true"]') : null;
    if (input instanceof HTMLInputElement) {
      state.navTitleInput = String(input.value || '');
    }
    var nextTitle = String(state.navTitleInput || '').trim();
    var slug = String(opts.slug || '').trim();
    state.navTitleBusy = true;
    var auth = authPayload();
    return postFormJson('/cgi/blog-update-nostr-page-nav-title', {
      page_slug: slug,
      nav_title: nextTitle,
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (data) {
      var updated = String((data && data.nav_title) || nextTitle || resolveManagedNavbarTitle(opts)).trim();
      state.navTitle = updated;
      state.navTitleEditing = false;
      state.navTitleInput = '';
      if (opts.payload && typeof opts.payload === 'object') {
        opts.payload.nav_title = updated;
      } else if (state.payload && typeof state.payload === 'object') {
        state.payload.nav_title = updated;
      }
      try {
        window.dispatchEvent(new CustomEvent('wizardry-navbar-refresh-request'));
      } catch (_err) {
        // Ignore navbar refresh dispatch failures.
      }
      if (typeof opts.renderHead === 'function') {
        opts.renderHead();
      }
      return true;
    }).catch(function (err) {
      window.alert(err && err.message ? err.message : 'Could not save navbar title');
      return false;
    }).finally(function () {
      state.navTitleBusy = false;
      if (typeof opts.renderHead === 'function') {
        opts.renderHead();
      }
    });
  }

  function saveManagedNavbarTitleForPage(options) {
    return saveManagedNavbarTitle(managedNavbarTitlePageActionOptions(options));
  }

  function startManagedNavbarTitleEditForPage(options) {
    return startManagedNavbarTitleEdit(managedNavbarTitlePageActionOptions(options));
  }

  function resetManagedNavbarTitleState(state, options) {
    var targetState = state && typeof state === 'object' ? state : null;
    var opts = options && typeof options === 'object' ? options : {};
    if (!targetState) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'payload')) {
      targetState.navTitle = String(opts.payload && opts.payload.nav_title || '').trim();
    } else if (Object.prototype.hasOwnProperty.call(opts, 'navTitle')) {
      targetState.navTitle = String(opts.navTitle || '').trim();
    } else if (!Object.prototype.hasOwnProperty.call(targetState, 'navTitle')) {
      targetState.navTitle = '';
    }
    targetState.navTitleEditing = false;
    targetState.navTitleInput = '';
    targetState.navTitleBusy = false;
    return true;
  }

  function renderResolvedReadOnlyContent(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var targetNode = opts.targetNode || null;
    var resolved = null;
    if (opts.allowPrerender !== false) {
      var fragment = readPrerenderHtmlFragment(opts.payload, 'content');
      if (fragment) {
        resolved = {
          adopted: true,
          html: fragment.html,
          hidden: fragment.hidden
        };
      }
    }
    if (!resolved && typeof opts.renderFallback === 'function') {
      var fallback = opts.renderFallback();
      resolved = {
        adopted: false,
        html: typeof fallback === 'string' ? fallback : '',
        hidden: false
      };
    }
    if (!resolved || !targetNode) {
      return resolved;
    }
    if (resolved.adopted) {
      mountPrerenderHtmlFragment(targetNode, opts.payload, 'content', opts.mountOptions);
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
    host.innerHTML = syncStatusPillHtml(syncStatus, options);
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

  function readPrerenderHtmlFragment(payload, name, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var fragmentName = String(name || '').trim();
    if (!fragmentName) {
      return null;
    }
    var html = prerenderFragment(payload, fragmentName + '_html');
    if (!html && opts.allowEmpty !== true) {
      return null;
    }
    return {
      html: html,
      hidden: /\bhidden\b/i.test(prerenderFragment(payload, fragmentName + '_attrs'))
    };
  }

  function mountPrerenderHtmlFragment(targetNode, payload, name, options) {
    var fragment = readPrerenderHtmlFragment(payload, name, options);
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

  function renderManagedBlogFilterFragments(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var payload = opts.payload && typeof opts.payload === 'object' ? opts.payload : null;
    var tagsNode = opts.tagsNode || null;
    var yearsNode = opts.yearsNode || null;
    var typesNode = opts.typesNode || null;
    if (!payload || !tagsNode || !yearsNode || !typesNode) {
      return false;
    }
    return mountPrerenderHtmlFragment(tagsNode, payload, 'filter_tags', { allowEmpty: true }) &&
      mountPrerenderHtmlFragment(yearsNode, payload, 'filter_years', { allowEmpty: true }) &&
      mountPrerenderHtmlFragment(typesNode, payload, 'filter_types', { allowEmpty: true });
  }

  function managedBlogFilterCatalogSignature(posts) {
    return JSON.stringify((Array.isArray(posts) ? posts : []).map(function (post) {
      var tags = Array.isArray(post && post.tags)
        ? post.tags.map(function (tag) {
            return String(tag || '').trim();
          }).filter(Boolean)
        : (typeof (post && post.tags) === 'string'
            ? String(post.tags).split(',').map(function (tag) {
                return String(tag || '').trim();
              }).filter(Boolean)
            : []);
      return {
        tags: tags,
        year: String(post && post.year || ''),
        type: String(post && post.type || 'post')
      };
    }).sort(function (a, b) {
      var left = JSON.stringify(a);
      var right = JSON.stringify(b);
      return left.localeCompare(right);
    }));
  }

  function syncManagedBlogFilterPanelState(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var activeFilters = opts.activeFilters && typeof opts.activeFilters === 'object' ? opts.activeFilters : {};
    [opts.tagsNode || null, opts.yearsNode || null, opts.typesNode || null].forEach(function (host) {
      if (!host) {
        return;
      }
      host.querySelectorAll('[data-filter-group][data-filter-value]').forEach(function (button) {
        var group = String(button.getAttribute('data-filter-group') || '');
        var value = String(button.getAttribute('data-filter-value') || '');
        var filterSet = activeFilters[group];
        var active = !!(filterSet && filterSet.has && filterSet.has(value));
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    });
  }

  function renderManagedBlogFilterPanel(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var tagsNode = opts.tagsNode || null;
    var yearsNode = opts.yearsNode || null;
    var typesNode = opts.typesNode || null;
    if (!tagsNode || !yearsNode || !typesNode) {
      return false;
    }
    var activeFilters = opts.activeFilters && typeof opts.activeFilters === 'object' ? opts.activeFilters : {};
    var payload = opts.payload && typeof opts.payload === 'object' ? opts.payload : null;
    var posts = Array.isArray(opts.posts) ? opts.posts : [];
    var prerenderedPosts = typeof opts.readPayloadPosts === 'function'
      ? opts.readPayloadPosts(payload)
      : null;
    if (payload && prerenderedPosts &&
        managedBlogFilterCatalogSignature(posts) === managedBlogFilterCatalogSignature(prerenderedPosts) &&
        renderManagedBlogFilterFragments({
          payload: payload,
          tagsNode: tagsNode,
          yearsNode: yearsNode,
          typesNode: typesNode
        })) {
      syncManagedBlogFilterPanelState({
        tagsNode: tagsNode,
        yearsNode: yearsNode,
        typesNode: typesNode,
        activeFilters: activeFilters
      });
      return true;
    }
    syncManagedBlogFilterPanelState({
      tagsNode: tagsNode,
      yearsNode: yearsNode,
      typesNode: typesNode,
      activeFilters: activeFilters
    });
    return false;
  }

  function resolveManagedPagePreviewHtml(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var payload = opts.payload && typeof opts.payload === 'object' ? opts.payload : null;
    if (!payload) {
      return '';
    }
    var matches = false;
    if (typeof opts.matchesPayload === 'function') {
      matches = opts.matchesPayload(payload) === true;
    } else if (typeof opts.normalizeState === 'function') {
      var normalizeState = opts.normalizeState;
      var payloadState = normalizeState((payload && payload.state) || null);
      var renderState = normalizeState(opts.renderState || null);
      matches = JSON.stringify(payloadState) === JSON.stringify(renderState);
    }
    if (!matches) {
      return '';
    }
    var fragment = readPrerenderHtmlFragment(payload, 'content');
    if (!fragment || fragment.hidden) {
      return '';
    }
    return String(fragment.html || '');
  }

  function hasPaintedPrerenderShell(rootNode, contentNode) {
    if (!rootNode || rootNode.getAttribute('data-prerender-painted') !== 'true') {
      return false;
    }
    if (!contentNode) {
      return true;
    }
    return contentNode.getAttribute('data-prerender-painted') === 'true';
  }

  function hasMatchingStaticPrerender(rootNode, contentNode, payload) {
    var signature = String(payload && payload.prerender_signature || '').trim();
    if (!signature || !rootNode || !contentNode) {
      return false;
    }
    if (!hasPaintedPrerenderShell(rootNode, contentNode)) {
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

  function commitManagedPagePayload(targetPayload, sourcePayload, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var target = mergeManagedPagePayload(targetPayload, sourcePayload, {
      includeState: opts.includeState,
      validationFallback: opts.validationFallback,
      passthroughFields: opts.passthroughFields
    });
    if (!target) {
      return target;
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'draftExists')) {
      target.draft_exists = !!opts.draftExists;
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'draftDiffers')) {
      target.draft_differs = !!opts.draftDiffers;
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'statePayload')) {
      target.state = opts.statePayload;
    }
    if (opts.persist !== false && opts.slug) {
      writePageBootstrapCache(target, {
        slug: opts.slug,
        authSignature: opts.authSignature || sessionAuthSignature,
        clearOnDeny: opts.clearOnDeny,
        allowWrite: managedBootstrapAllowWriteForPersistMode(opts.persistMode)
      });
    }
    return target;
  }

  function reconcileManagedPageRefreshRender(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var state = opts.state && typeof opts.state === 'object' ? opts.state : null;
    if (!state) {
      return false;
    }
    var previousSignature = String(opts.previousSignature || '');
    var nextRenderSignature = String(opts.nextRenderSignature || '');
    var shouldRepaint = !state.initialContentPainted || previousSignature !== nextRenderSignature;
    if (!shouldRepaint || (typeof opts.shouldPreserveAdoptedPrerender === 'function' && opts.shouldPreserveAdoptedPrerender() === true)) {
      if (typeof opts.renderPreserved === 'function') {
        opts.renderPreserved();
      }
      state.renderSignature = nextRenderSignature;
      return false;
    }
    if (typeof opts.beforeRenderAll === 'function') {
      opts.beforeRenderAll();
    }
    if (typeof opts.renderAll === 'function') {
      opts.renderAll();
    }
    state.renderSignature = nextRenderSignature;
    return true;
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

  function hasLikelyAdminSession() {
    if (!hasLikelyAuthenticatedSession()) {
      return false;
    }
    try {
      return String(localStorage.getItem('last_auth_is_admin') || '') === '1';
    } catch (_err) {
      return false;
    }
  }

  function viewerAuthSignature() {
    return sessionAuthSignature() + '|' + (hasLikelyAdminSession() ? 'admin' : 'visitor');
  }

  function managedBootstrapAllowWriteForPersistMode(persistMode) {
    var mode = String(persistMode || 'always').trim().toLowerCase();
    return function (nextPayload) {
      if (mode === 'authenticated_admin') {
        return !!(nextPayload && nextPayload.is_admin && hasLikelyAuthenticatedSession());
      }
      return true;
    };
  }

  function eventHasVerifiedAdminState(event) {
    return !!(event && event.detail && event.detail.authenticated === true && typeof event.detail.is_admin !== 'undefined');
  }

  function authEventIsLikelyAdmin(event) {
    if (eventHasVerifiedAdminState(event)) {
      return event.detail.is_admin === true;
    }
    return hasLikelyAdminSession();
  }

  function canUseVisitorPrerenderReadOnly(options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (opts.isAdmin === true && opts.allowAdmin !== true) {
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

  function canUsePayloadPrerenderReadOnly(payload, options) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    var opts = options && typeof options === 'object' ? options : {};
    var allowAuthenticated = false;
    var allowAdmin = false;
    if (typeof opts.allowAuthenticated === 'function') {
      allowAuthenticated = opts.allowAuthenticated(payload) === true;
    } else if (typeof opts.allowAuthenticatedField === 'string' && opts.allowAuthenticatedField) {
      allowAuthenticated = payload[opts.allowAuthenticatedField] === true;
    } else if (Object.prototype.hasOwnProperty.call(opts, 'allowAuthenticated')) {
      allowAuthenticated = opts.allowAuthenticated === true;
    }
    if (typeof opts.allowAdmin === 'function') {
      allowAdmin = opts.allowAdmin(payload) === true;
    } else if (typeof opts.allowAdminField === 'string' && opts.allowAdminField) {
      allowAdmin = payload[opts.allowAdminField] === true;
    } else if (Object.prototype.hasOwnProperty.call(opts, 'allowAdmin')) {
      allowAdmin = opts.allowAdmin === true;
    }
    return canUseVisitorPrerenderReadOnly({
      isAdmin: !!payload.is_admin,
      allowAuthenticated: allowAuthenticated,
      allowAdmin: allowAdmin,
      extraCheck: opts.extraCheck,
      extraAllowed: opts.extraAllowed
    });
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

  function resolveManagedPageReadySlug(slug) {
    var explicitSlug = String(slug || '').trim();
    if (explicitSlug) {
      return explicitSlug;
    }
    return routeRootSlugFromDom() || slugFromPath(window.location.pathname || '/') || '';
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
    pageInitialContentReady = true;
    try {
      window.dispatchEvent(new CustomEvent('blog-page-initial-content-ready', {
        detail: { slug: resolveManagedPageReadySlug(slug) }
      }));
    } catch (_err) {
      // Ignore event dispatch failures.
    }
    if (opts.markPageReady === true) {
      markHydrationPageReady();
    }
    return true;
  }

  function notifyCurrentManagedPageReady(options) {
    var opts = options && typeof options === 'object' ? options : {};
    return notifyInitialContentPainted(
      Object.prototype.hasOwnProperty.call(opts, 'slug') ? opts.slug : '',
      opts
    );
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

  function renderManagedNostrBootstrapPayload(payload, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var isExpectedPayload = typeof opts.isExpectedPayload === 'function' ? opts.isExpectedPayload : null;
    if (!payload || (isExpectedPayload && !isExpectedPayload(payload))) {
      return false;
    }
    var authenticated = window.__wizardryHasLikelyAuthenticatedSession();
    var likelyAdmin = hasLikelyAdminSession();
    var optimisticPayload = payload;
    if (opts.promoteAuthenticated !== false && !optimisticPayload.is_admin && likelyAdmin) {
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
    var bootstrapNotify = opts.markInitialContentPainted;
    if (!bootstrapNotify && opts.notifyInitialContentPainted && typeof opts.notifyInitialContentPainted === 'object') {
      bootstrapNotify = function () {
        notifyInitialContentPainted(
          Object.prototype.hasOwnProperty.call(opts.notifyInitialContentPainted, 'slug')
            ? opts.notifyInitialContentPainted.slug
            : '',
          opts.notifyInitialContentPainted
        );
      };
    }
    if (!bootstrapNotify && opts.notifyInitialContentPainted !== false) {
      var shouldSynthesizeNotify = Object.prototype.hasOwnProperty.call(opts, 'state')
        || Object.prototype.hasOwnProperty.call(opts, 'rootNode')
        || Object.prototype.hasOwnProperty.call(opts, 'loadingClass')
        || Object.prototype.hasOwnProperty.call(opts, 'markPageReady')
        || Object.prototype.hasOwnProperty.call(opts, 'slug');
      if (shouldSynthesizeNotify) {
        var notifyOptions = {};
        if (Object.prototype.hasOwnProperty.call(opts, 'state')) {
          notifyOptions.state = opts.state;
        }
        if (Object.prototype.hasOwnProperty.call(opts, 'rootNode')) {
          notifyOptions.rootNode = opts.rootNode;
        }
        if (Object.prototype.hasOwnProperty.call(opts, 'loadingClass')) {
          notifyOptions.loadingClass = opts.loadingClass;
        }
        if (Object.prototype.hasOwnProperty.call(opts, 'markPageReady')) {
          notifyOptions.markPageReady = opts.markPageReady;
        }
        if (Object.prototype.hasOwnProperty.call(opts, 'slug')) {
          notifyOptions.slug = opts.slug;
        }
        bootstrapNotify = function () {
          notifyInitialContentPainted(
            Object.prototype.hasOwnProperty.call(notifyOptions, 'slug') ? notifyOptions.slug : '',
            notifyOptions
          );
        };
      }
    }
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
      markInitialContentPainted: bootstrapNotify
    });
  }

  function renderManagedNostrBootstrapSources(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var renderPayload = typeof opts.renderPayload === 'function' ? opts.renderPayload : null;
    if (!renderPayload) {
      return false;
    }
    var cachedPayload = readBootstrapCache({
      storageKey: pageBootstrapCacheKey(opts.slug),
      maxAgeMs: opts.maxAgeMs,
      authSignature: opts.authSignature || sessionAuthSignature,
      isExpectedPayload: opts.isExpectedPayload,
      allowRead: opts.allowRead,
      clearOnDeny: opts.clearOnDeny
    });
    if (renderPayload(cachedPayload)) {
      return true;
    }
    var prerenderedPayload = readNostrPageBootstrap(opts.slug, opts.isExpectedPayload);
    if (!prerenderedPayload || !renderPayload(prerenderedPayload)) {
      return false;
    }
    writePageBootstrapCache(prerenderedPayload, {
      slug: opts.slug,
      authSignature: opts.authSignature || sessionAuthSignature,
      allowWrite: opts.allowWrite || managedBootstrapAllowWriteForPersistMode(opts.persistMode),
      clearOnDeny: opts.clearOnDeny
    });
    return true;
  }

  function refreshManagedNostrPage(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var endpoint = String(opts.endpoint || '/cgi/blog-get-nostr-page').trim() || '/cgi/blog-get-nostr-page';
    var slug = String(opts.slug || '').trim();
    var requestSlug = Object.prototype.hasOwnProperty.call(opts, 'pageSlug')
      ? String(opts.pageSlug || slug).trim()
      : slug;
    var retryAttempts = Math.max(1, Math.floor(Number(opts.retryAttempts || 1) || 1));
    var auth = authPayload();
    var params = new URLSearchParams({
      page_slug: requestSlug,
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    });
    var extraParams = opts.extraParams && typeof opts.extraParams === 'object' ? opts.extraParams : null;
    if (extraParams) {
      Object.keys(extraParams).forEach(function (key) {
        var name = String(key || '').trim();
        if (!name) {
          return;
        }
        var value = extraParams[key];
        if (value === undefined || value === null) {
          return;
        }
        params.set(name, String(value));
      });
    }

    function resolveRetryDelayMs(attempt, err) {
      if (attempt >= retryAttempts) {
        return -1;
      }
      var configured = opts.retryDelayMs;
      if (typeof configured === 'function') {
        configured = configured(attempt, err);
      }
      var delayMs = Number(configured);
      if (!isFinite(delayMs) || delayMs < 0) {
        delayMs = 0;
      }
      return delayMs;
    }

    function fetchManagedPageOnce() {
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
        if (opts.persist !== false) {
          writePageBootstrapCache(payload, {
            slug: slug || requestSlug,
            authSignature: opts.authSignature || sessionAuthSignature,
            allowWrite: opts.allowWrite || managedBootstrapAllowWriteForPersistMode(opts.persistMode),
            clearOnDeny: opts.clearOnDeny
          });
        }
        if (typeof opts.renderPayload === 'function') {
          opts.renderPayload(payload);
        }
        if (typeof opts.afterRender === 'function') {
          opts.afterRender(payload);
        }
        return payload;
      });
    }

    function fetchManagedPageAttempt(attempt) {
      return fetchManagedPageOnce().catch(function (err) {
        var delayMs = resolveRetryDelayMs(attempt, err);
        if (delayMs >= 0) {
          return new Promise(function (resolve) {
            window.setTimeout(resolve, delayMs);
          }).then(function () {
            return fetchManagedPageAttempt(attempt + 1);
          });
        }
        throw err;
      });
    }

    return fetchManagedPageAttempt(1).catch(function (err) {
      if (typeof opts.handleError === 'function') {
        opts.handleError(err);
        return null;
      }
      if (opts.loadFallback && typeof opts.loadFallback === 'object') {
        var fallbackOptions = Object.assign({}, opts.loadFallback);
        if (!Object.prototype.hasOwnProperty.call(fallbackOptions, 'slug')) {
          fallbackOptions.slug = slug || requestSlug;
        }
        renderLoadFallback(err, fallbackOptions);
        return null;
      }
      throw err;
    }).finally(function () {
      if (typeof opts.onFinally === 'function') {
        opts.onFinally();
        return;
      }
      if (opts.notifyInitialContentPainted && typeof opts.notifyInitialContentPainted === 'object') {
        var notifyOptions = Object.assign({}, opts.notifyInitialContentPainted);
        notifyInitialContentPainted(
          Object.prototype.hasOwnProperty.call(notifyOptions, 'slug') ? notifyOptions.slug : (slug || requestSlug),
          notifyOptions
        );
      }
    });
  }

  function refreshManagedNostrPageView(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var refreshOptions = Object.assign({}, opts);
    delete refreshOptions.consoleLabel;
    delete refreshOptions.state;
    delete refreshOptions.contentNode;
    delete refreshOptions.fallbackText;
    delete refreshOptions.rootNode;
    delete refreshOptions.loadingClass;
    delete refreshOptions.markPageReady;

    if (opts.loadFallback !== false) {
      var loadFallback = opts.loadFallback && typeof opts.loadFallback === 'object'
        ? Object.assign({}, opts.loadFallback)
        : {};
      if (!Object.prototype.hasOwnProperty.call(loadFallback, 'consoleLabel') && Object.prototype.hasOwnProperty.call(opts, 'consoleLabel')) {
        loadFallback.consoleLabel = opts.consoleLabel;
      }
      if (!Object.prototype.hasOwnProperty.call(loadFallback, 'state') && Object.prototype.hasOwnProperty.call(opts, 'state')) {
        loadFallback.state = opts.state;
      }
      if (!Object.prototype.hasOwnProperty.call(loadFallback, 'contentNode') && Object.prototype.hasOwnProperty.call(opts, 'contentNode')) {
        loadFallback.contentNode = opts.contentNode;
      }
      if (!Object.prototype.hasOwnProperty.call(loadFallback, 'fallbackText') && Object.prototype.hasOwnProperty.call(opts, 'fallbackText')) {
        loadFallback.fallbackText = opts.fallbackText;
      }
      if (!Object.prototype.hasOwnProperty.call(loadFallback, 'rootNode') && Object.prototype.hasOwnProperty.call(opts, 'rootNode')) {
        loadFallback.rootNode = opts.rootNode;
      }
      if (!Object.prototype.hasOwnProperty.call(loadFallback, 'loadingClass') && Object.prototype.hasOwnProperty.call(opts, 'loadingClass')) {
        loadFallback.loadingClass = opts.loadingClass;
      }
      refreshOptions.loadFallback = loadFallback;
    } else {
      delete refreshOptions.loadFallback;
    }

    if (opts.notifyInitialContentPainted !== false) {
      var notifyOptions = opts.notifyInitialContentPainted && typeof opts.notifyInitialContentPainted === 'object'
        ? Object.assign({}, opts.notifyInitialContentPainted)
        : {};
      if (!Object.prototype.hasOwnProperty.call(notifyOptions, 'state') && Object.prototype.hasOwnProperty.call(opts, 'state')) {
        notifyOptions.state = opts.state;
      }
      if (!Object.prototype.hasOwnProperty.call(notifyOptions, 'rootNode') && Object.prototype.hasOwnProperty.call(opts, 'rootNode')) {
        notifyOptions.rootNode = opts.rootNode;
      }
      if (!Object.prototype.hasOwnProperty.call(notifyOptions, 'loadingClass') && Object.prototype.hasOwnProperty.call(opts, 'loadingClass')) {
        notifyOptions.loadingClass = opts.loadingClass;
      }
      if (!Object.prototype.hasOwnProperty.call(notifyOptions, 'markPageReady') && Object.prototype.hasOwnProperty.call(opts, 'markPageReady')) {
        notifyOptions.markPageReady = opts.markPageReady;
      }
      refreshOptions.notifyInitialContentPainted = notifyOptions;
    } else {
      delete refreshOptions.notifyInitialContentPainted;
    }

    return refreshManagedNostrPage(refreshOptions);
  }

  function mergeManagedPagePayload(targetPayload, sourcePayload, options) {
    var target = targetPayload && typeof targetPayload === 'object' ? targetPayload : null;
    var source = sourcePayload && typeof sourcePayload === 'object' ? sourcePayload : null;
    var opts = options && typeof options === 'object' ? options : {};
    if (!target || !source) {
      return target;
    }
    if (opts.includeState !== false && source.state && typeof source.state === 'object') {
      target.state = source.state;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'sync_status')) {
      target.sync_status = source.sync_status;
    }
    var hasValidationFallback = Object.prototype.hasOwnProperty.call(opts, 'validationFallback');
    if (Object.prototype.hasOwnProperty.call(source, 'validation')) {
      target.validation = source.validation || (hasValidationFallback ? opts.validationFallback : target.validation);
    } else if (hasValidationFallback) {
      target.validation = opts.validationFallback;
    }
    ['canonical_exists', 'draft_exists', 'draft_differs'].forEach(function (fieldName) {
      if (Object.prototype.hasOwnProperty.call(source, fieldName)) {
        target[fieldName] = !!source[fieldName];
      }
    });
    ['prerender', 'prerender_signature'].forEach(function (fieldName) {
      if (Object.prototype.hasOwnProperty.call(source, fieldName)) {
        target[fieldName] = source[fieldName];
      }
    });
    var passthroughFields = Array.isArray(opts.passthroughFields) ? opts.passthroughFields : [];
    passthroughFields.forEach(function (fieldName) {
      if (!fieldName || !Object.prototype.hasOwnProperty.call(source, fieldName)) {
        return;
      }
      target[fieldName] = source[fieldName];
    });
    return target;
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
      if (!pageInitialContentReady) {
        showRouteLoadFailure();
      }
    }, 2200);
  }

  function clearManagedRouteParams(url, options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (!url || typeof url !== 'object' || !url.searchParams) {
      return false;
    }
    if (opts.removeRefresh !== false) {
      url.searchParams.delete(ROUTE_REFRESH_PARAM);
    }
    if (opts.removeRepair !== false) {
      url.searchParams.delete(ROUTE_REPAIR_PARAM);
    }
    if (!window.history || typeof window.history.replaceState !== 'function') {
      return false;
    }
    var next = url.pathname;
    var query = url.searchParams.toString();
    if (query) {
      next += '?' + query;
    }
    if (url.hash) {
      next += url.hash;
    }
    window.history.replaceState(null, '', next);
    return true;
  }

  function requestManagedRouteRepair(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var url;
    try {
      url = Object.prototype.hasOwnProperty.call(opts, 'url')
        ? new URL(String(opts.url || ''), window.location.href)
        : new URL(window.location.href);
    } catch (_err) {
      if (typeof opts.onUrlError === 'function') {
        opts.onUrlError();
        return false;
      }
      window.location.reload();
      return false;
    }
    if (url.searchParams.get(ROUTE_REPAIR_PARAM) === '1') {
      clearManagedRouteParams(url, { removeRefresh: false });
      return false;
    }
    url.searchParams.set(ROUTE_REPAIR_PARAM, '1');
    var preflight = typeof opts.preflight === 'function' ? opts.preflight() : null;
    Promise.resolve(preflight)
      .catch(function () {
        // Ignore preflight failures; still attempt one repair reload.
      })
      .finally(function () {
        window.setTimeout(function () {
          if (opts.reason) {
            try {
              sessionStorage.setItem('wizardry_last_route_repair_reason', String(opts.reason));
            } catch (_storageErr) {
              // Ignore storage errors.
            }
          }
          window.location.replace(url.toString());
        }, Math.max(0, Number(opts.delayMs || 220) || 0));
      });
    return true;
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

  window.__wizardryNotifyInitialContentPainted = notifyInitialContentPainted;
  window.__wizardryNotifyCurrentManagedPageReady = notifyCurrentManagedPageReady;
  window.__wizardryRenderLoadFallback = renderLoadFallback;
  window.__wizardryRenderManagedNostrPageBootstrapPayload = renderManagedNostrPageBootstrapPayload;
  window.__wizardryRemoveLegacyTitleBlock = removeLegacyTitleBlock;
  window.__wizardryRenderManagedPageHeadForPage = renderManagedPageHeadForPage;
  window.__wizardryRenderManagedPageHead = renderManagedPageHead;
  window.__wizardryManagedNavbarTitlePageOptions = managedNavbarTitlePageOptions;
  window.__wizardryRenderManagedPayloadValidationSummary = renderManagedPayloadValidationSummary;
  window.__wizardryRenderManagedSaveStatus = renderManagedSaveStatus;
  window.__wizardryRenderManagedAdminActionBar = renderManagedAdminActionBar;
  window.__wizardryStartManagedNavbarTitleEdit = startManagedNavbarTitleEdit;
  window.__wizardryStartManagedNavbarTitleEditForPage = startManagedNavbarTitleEditForPage;
  window.__wizardrySaveManagedNavbarTitle = saveManagedNavbarTitle;
  window.__wizardrySaveManagedNavbarTitleForPage = saveManagedNavbarTitleForPage;
  window.__wizardryResolveRootAttributeFallbackText = resolveRootAttributeFallbackText;
  window.__wizardryResetManagedNavbarTitleState = resetManagedNavbarTitleState;
  window.__wizardryRenderResolvedReadOnlyContent = renderResolvedReadOnlyContent;
  window.__wizardryRenderManagedBlogFilterPanel = renderManagedBlogFilterPanel;
  window.__wizardrySyncStatusPillHtml = syncStatusPillHtml;
  window.__wizardryStripLegacyNostrSyncPills = stripLegacyNostrSyncPills;
  window.__wizardryAuthPayload = authPayload;
  window.__wizardrySessionAuthSignature = sessionAuthSignature;
  window.__wizardryViewerAuthSignature = viewerAuthSignature;
  window.__wizardryHasPaintedPrerenderShell = hasPaintedPrerenderShell;
  window.__wizardryBindSessionAuthRefresh = bindSessionAuthRefresh;
  window.__wizardryHasLikelyAuthenticatedSession = hasLikelyAuthenticatedSession;
  window.__wizardryHasLikelyAdminSession = hasLikelyAdminSession;
  window.__wizardryEventHasVerifiedAdminState = eventHasVerifiedAdminState;
  window.__wizardryAuthEventIsLikelyAdmin = authEventIsLikelyAdmin;
  window.__wizardryCanUseVisitorPrerenderReadOnly = canUseVisitorPrerenderReadOnly;
  window.__wizardryCanUsePayloadPrerenderReadOnly = canUsePayloadPrerenderReadOnly;
  window.__wizardryEnsureNostrPublishDialog = ensureNostrPublishDialog;
  window.__wizardryScheduleMarkedUpgrade = scheduleMarkedUpgrade;
  window.__wizardryNormalizeManagedSlug = normalizeSlug;
  window.__wizardryManagedSlugFromPath = slugFromPath;
  window.__wizardryManagedSlugsEquivalent = slugsEquivalent;
  window.__wizardryClearManagedRouteParams = clearManagedRouteParams;
  window.__wizardryRequestManagedRouteRepair = requestManagedRouteRepair;
  window.__wizardryRenderManagedNostrBootstrapSources = renderManagedNostrBootstrapSources;
  window.__wizardryRefreshManagedNostrPage = refreshManagedNostrPage;
  window.__wizardryRefreshManagedNostrPageView = refreshManagedNostrPageView;
  window.__wizardryResolveManagedPagePreviewHtml = resolveManagedPagePreviewHtml;
  window.__wizardryCommitManagedPagePayload = commitManagedPagePayload;
  window.__wizardryReconcileManagedPageRefreshRender = reconcileManagedPageRefreshRender;
  window.__wizardryPostFormJson = postFormJson;

  window.__wizardrySetPageTitleConfig = function (options) {
    var opts = options && typeof options === 'object' ? options : {};
    var overrides = {};
    if (Object.prototype.hasOwnProperty.call(opts, 'siteTitle')) {
      var normalizedSiteTitle = normalizeSiteTitle(opts.siteTitle);
      overrides.siteTitle = normalizedSiteTitle;
      try {
        localStorage.setItem(SITE_TITLE_CACHE_KEY, normalizedSiteTitle);
      } catch (_err) {
        // Ignore storage failures.
      }
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'appendSiteTitle')) {
      var enabled = normalizeAppendSiteTitleEnabled(opts.appendSiteTitle);
      overrides.appendSiteTitle = enabled;
      try {
        localStorage.setItem(APPEND_SITE_TITLE_CACHE_KEY, enabled ? '1' : '0');
      } catch (_err) {
        // Ignore storage failures.
      }
    }
    return applyPageTitle(
      Object.prototype.hasOwnProperty.call(opts, 'baseTitle') ? opts.baseTitle : undefined,
      overrides
    );
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
        clearManagedRouteParams(currentUrl);
      }
    } catch (_routeErr) {
      // Ignore URL parsing/runtime failures.
    }
  });

  window.addEventListener('blog-page-initial-content-ready', function () {
    cancelRouteLoadFailure();
  });
})();
