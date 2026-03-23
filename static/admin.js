(function () {
  const SITE_TITLE_CACHE_KEY = 'wizardry_blog_site_title_v1';

  const state = {
    sessionToken: localStorage.getItem('session_token') || '',
    csrfToken: localStorage.getItem('csrf_token') || '',
    username: '',
    playerName: '',
    nostrPubkey: '',
    sshFingerprint: '',
    isAdmin: false,
    composeTags: [],
    currentDraftId: '',
    autosaveTimer: null,
    suspendAutosave: false,
    previewVisible: localStorage.getItem('blog_admin_preview_hidden') !== '1',
    nostrBridgeEnabled: false,
    lastLinkedSshKeyText: '',
    users: [],
    actorRank: 0,
    activeSection: '',
    usersPollTimer: null,
    draftsPollTimer: null,
    queuePollTimer: null,
    postsPollTimer: null,
    nosterPollTimer: null,
    zapsPollTimer: null,
    btcpayPollTimer: null,
    moderationPollTimer: null,
    userDragActive: false,
    userDragUsername: '',
    userDropAfterUsername: '',
    usersMenuOpenFor: '',
    usersActionInFlight: false,
    usersSortColumn: '',
    usersSortDirection: '',
    postsMenuOpenFor: '',
    draftsMenuOpenFor: '',
    postsActionInFlight: false,
    moderationActionInFlight: false,
    files: [],
    fileUploads: [],
    activeUploadCount: 0,
    filesSectionLoadedOnce: false,
    pendingAddToListPostPath: '',
    dripQueueAhead: 0,
    dripQueueEtaMinutes: 0,
    dripQueueInfoReady: false,
    dripQueueItemCount: 0,
    nextDripTitle: '',
    nextDripExcerpt: '',
    configSaveTimer: null,
    nostrBridgeSaveTimer: null,
    nosterSettingsSaveTimer: null,
    isLoadingConfig: false,
    queueItemCount: 0,
    localDripWorkerTimer: null,
    localDripWorkerBusy: false,
    localDripLeader: false,
    localDripEnabled: localStorage.getItem('blog_local_drip_enabled_v1') !== '0',
    localDripTabId: '',
    localDripLastTickAt: 0,
    nostrPages: [],
    nostrPagesAvailableTags: [],
    nostrPagesSaveBusy: false,
    nostrPagesSaveQueued: false,
    nostrPagesEditingSlugIndex: -1,
    nostrPagesEditingSlugValue: '',
    nostrPagesEditingNavTitleIndex: -1,
    nostrPagesEditingNavTitleValue: '',
    nostrPagesDragActive: false,
    nostrPagesDragSlug: '',
    nostrPagesDragLastTarget: '',
    nostrPagesDragDropped: false,
    nostrPagesDragSnapshot: [],
    nostrPagesMenuOpenFor: '',
    moderationItems: [],
    moderationAgeFilter: '30d',
    nosterRuntime: null,
    nosterActionInFlight: false,
    zapsRuntimeInfo: null,
    zapsActionInFlight: false,
    btcpayRuntimeInfo: null,
    btcpayActionInFlight: false,
    initialContentPainted: false,
    loadedAdminSections: {},
    sidebarCollapsed: false
  };

  const els = {
    authStatus: document.getElementById('admin-access-message'),
    adminPanel: document.getElementById('admin-panel'),
    outputConfig: document.getElementById('output-config'),
    outputNostrBridge: document.getElementById('output-nostr-bridge'),
    outputCompose: document.getElementById('output-compose'),
    outputQueue: document.getElementById('output-queue'),
    outputPosts: document.getElementById('output-posts'),
    outputNostrPages: document.getElementById('output-nostr-pages'),
    outputFiles: document.getElementById('output-files'),
    outputModeration: document.getElementById('output-moderation'),
    outputAccount: document.getElementById('output-account'),
    outputZaps: document.getElementById('output-zaps'),
    outputBtcpay: document.getElementById('output-btcpay'),
    outputUsers: document.getElementById('output-users'),
    nosterRuntime: document.getElementById('noster-runtime'),
    navNosterStatus: document.getElementById('admin-nav-noster-status'),
    navZapsStatus: document.getElementById('admin-nav-zaps-status'),
    navBtcpayStatus: document.getElementById('admin-nav-btcpay-status'),
    siteTitle: document.getElementById('site-title'),
    adminTheme: document.getElementById('admin-theme'),
    registrationEnabled: document.getElementById('registration-enabled'),
    dripInterval: document.getElementById('drip-interval'),
    dripRandomness: document.getElementById('drip-randomness'),
    feedFullText: document.getElementById('feed-full-text'),
    feedItems: document.getElementById('feed-items'),
    nostrBridgeEnabled: document.getElementById('nostr-bridge-enabled'),
    nostrAuthors: document.getElementById('nostr-authors'),
    nostrRelays: document.getElementById('nostr-relays'),
    nostrBlocklist: document.getElementById('nostr-blocklist'),
    zapsEnabled: document.getElementById('zaps-enabled'),
    zapLud16: document.getElementById('zap-lud16'),
    zapDefaultAmountSats: document.getElementById('zap-default-amount-sats'),
    zapsRuntime: document.getElementById('zaps-runtime'),
    btcpayRuntime: document.getElementById('btcpay-runtime'),
    nostrAuthorsSaveStatus: document.getElementById('nostr-authors-save-status'),
    nostrRelaysSaveStatus: document.getElementById('nostr-relays-save-status'),
    nostrBlocklistSaveStatus: document.getElementById('nostr-blocklist-save-status'),
    newUsersAreAdmins: document.getElementById('new-users-are-admins'),
    postTitle: document.getElementById('post-title'),
    postTags: document.getElementById('post-tags'),
    postTagsInput: document.getElementById('post-tags-input'),
    postTagsEditor: document.getElementById('post-tags-editor'),
    postTagsPills: document.getElementById('post-tags-pills'),
    postContent: document.getElementById('post-content'),
    postScheduleAt: document.getElementById('post-scheduled-at'),
    scheduledPickerButton: document.getElementById('btn-scheduled-picker'),
    navDraftsCount: document.getElementById('admin-nav-drafts-count'),
    navQueueCount: document.getElementById('admin-nav-queue-count'),
    navPostsCount: document.getElementById('admin-nav-posts-count'),
    dripQueuePill: document.getElementById('drip-queue-pill'),
    scheduledRow: document.getElementById('scheduled-row'),
    markdownPreview: document.getElementById('markdown-preview'),
    composeShell: document.querySelector('.compose-shell'),
    togglePreviewButton: document.getElementById('btn-toggle-preview'),
    draftsList: document.getElementById('drafts-list'),
    queueList: document.getElementById('queue-list'),
    queueLocalDripStatus: document.getElementById('queue-local-drip-status'),
    queueLocalDripStatusText: document.getElementById('queue-local-drip-status-text'),
    localDripToggleButton: document.getElementById('btn-local-drip-toggle'),
    runSchedulerButton: document.getElementById('btn-run-scheduler'),
    postsList: document.getElementById('posts-list'),
    filesList: document.getElementById('files-list'),
    filesDropzone: document.getElementById('files-dropzone'),
    filesUploadJobs: document.getElementById('files-upload-jobs'),
    filesUploadSummary: document.getElementById('files-upload-summary'),
    uploadFileButton: document.getElementById('btn-upload-file'),
    moderationList: document.getElementById('moderation-list'),
    moderationAgeOptions: Array.from(document.querySelectorAll('[data-moderation-age]')),
    newPostButton: document.getElementById('btn-new-post'),
    postAddToListDialog: document.getElementById('post-add-to-list-dialog'),
    postAddToListForm: document.getElementById('post-add-to-list-form'),
    postAddToListSelect: document.getElementById('post-add-to-list-select'),
    postAddToListNewRow: document.getElementById('post-add-to-list-new-row'),
    postAddToListNewSlug: document.getElementById('post-add-to-list-new-slug'),
    postAddToListDate: document.getElementById('post-add-to-list-date'),
    postAddToListMarkdown: document.getElementById('post-add-to-list-markdown'),
    postAddToListCancel: document.getElementById('post-add-to-list-cancel'),
    nostrPagesList: document.getElementById('nostr-pages-list'),
    createNostrPageButton: document.getElementById('btn-create-nostr-page'),
    nostrPageCreateDialog: document.getElementById('nostr-page-create-dialog'),
    nostrPageCreateForm: document.getElementById('nostr-page-create-form'),
    nostrPageCreateCancel: document.getElementById('nostr-page-create-cancel'),
    nostrPageTypeSelect: document.getElementById('nostr-page-type-select'),
    nostrPageSlugInput: document.getElementById('nostr-page-slug-input'),
    usersList: document.getElementById('users-list'),
    currentDraftLabel: document.getElementById('current-draft-label'),
    accountPlayerName: document.getElementById('account-player-name'),
    accountNostrPubkey: document.getElementById('account-nostr-pubkey'),
    accountNostrPubkeyCopyButton: document.getElementById('btn-account-pubkey-copy'),
    accountNostrPubkeyToggleButton: document.getElementById('btn-account-pubkey-toggle'),
    accountSshPublicKey: document.getElementById('account-ssh-public-key'),
    autosaveStatus: document.getElementById('autosave-status'),
    publishNowButton: document.getElementById('btn-publish-now'),
    mirrorNostrButton: document.getElementById('btn-mirror-nostr'),
    bindPasskeyButton: document.getElementById('btn-bind-passkey'),
    generateSshButton: document.getElementById('btn-generate-ssh'),
    linkSshButton: document.getElementById('btn-link-ssh'),
    imagePicker: document.getElementById('image-picker'),
    filePicker: document.getElementById('file-picker'),
    dropOverlay: document.getElementById('drop-overlay'),
    sidebarToggleButton: document.getElementById('btn-admin-sidebar-toggle'),
    sidebarRevealButton: document.getElementById('btn-admin-sidebar-reveal'),
    adminContent: document.querySelector('.admin-content'),
    sectionButtons: Array.from(document.querySelectorAll('[data-admin-nav]')),
    sections: Array.from(document.querySelectorAll('[data-admin-section]'))
  };
  let themeSwitchVisualTimer = null;

  const publishModeInputs = Array.from(document.querySelectorAll('input[name="publish-mode"]'));
  const ADMIN_SIDEBAR_COLLAPSED_KEY = 'blog_admin_sidebar_collapsed_v1';
  const LOCAL_DRIP_LEASE_KEY = 'blog_local_drip_lease_v1';
  const LOCAL_DRIP_ENABLED_KEY = 'blog_local_drip_enabled_v1';
  const LOCAL_DRIP_LEASE_MS = 45000;
  const LOCAL_DRIP_TICK_MS = 15000;
  let themeSwapToken = 0;

  function markHydrationPageReady() {
    const gate = window.__wizardryHydration;
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
        detail: { slug: 'admin' }
      }));
    } catch (_err) {
      // Ignore event dispatch issues.
    }
  }

  function setAuthMessage(message, type) {
    if (!els.authStatus) {
      return;
    }
    if (!message) {
      els.authStatus.hidden = true;
      els.authStatus.className = 'admin-access-message';
      els.authStatus.innerHTML = '';
      return;
    }
    els.authStatus.hidden = false;
    els.authStatus.className = 'admin-access-message';
    if (type) {
      els.authStatus.classList.add('is-' + type);
    }
    els.authStatus.innerHTML = message;
  }

  function getSectionFromHash() {
    const name = (window.location.hash || '').replace(/^#/, '');
    if (!name) {
      return state.isAdmin ? 'settings' : 'account';
    }
    const known = els.sections.some(function (section) {
      return section.getAttribute('data-admin-section') === name;
    });
    if (!known) {
      return state.isAdmin ? 'settings' : 'account';
    }
    if (!state.isAdmin && name !== 'account') {
      return 'account';
    }
    return name;
  }

  function adminSectionDisplayTitle(sectionName) {
    const key = String(sectionName || '').trim().toLowerCase();
    if (key === 'settings') {
      return 'Site Settings';
    }
    if (key === 'compose') {
      return 'Compose';
    }
    if (key === 'drafts') {
      return 'Drafts';
    }
    if (key === 'queue') {
      return 'Queue';
    }
    if (key === 'posts') {
      return 'Posts';
    }
    if (key === 'account') {
      return 'Account';
    }
    if (key === 'nostr-pages' || key === 'pages') {
      return 'Pages';
    }
    if (key === 'files') {
      return 'Files';
    }
    if (key === 'moderation') {
      return 'Moderation';
    }
    if (key === 'users') {
      return 'Users';
    }
    if (key === 'nostr-bridge') {
      return 'Nostr';
    }
    if (key === 'zaps') {
      return 'Zaps';
    }
    if (key === 'btcpay') {
      return 'BTCPay';
    }
    return 'Admin';
  }

  function syncAdminDocumentTitle(sectionName) {
    const sectionTitle = adminSectionDisplayTitle(sectionName);
    document.title = sectionTitle === 'Admin' ? 'Admin' : (sectionTitle + ' · Admin');
  }

  function activateSection(name, updateHash) {
    const sectionName = (!state.isAdmin ? 'account' : (name || 'settings'));
    state.activeSection = sectionName;
    syncAdminDocumentTitle(sectionName);
    if (els.dropOverlay) {
      els.dropOverlay.textContent = sectionName === 'files'
        ? 'Drop files to upload'
        : 'Drop images to upload and insert into your draft';
    }
    if (els.filesDropzone) {
      els.filesDropzone.classList.remove('is-drop-active');
    }
    els.sectionButtons.forEach(function (button) {
      const active = button.getAttribute('data-admin-nav') === sectionName;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });
    els.sections.forEach(function (section) {
      const active = section.getAttribute('data-admin-section') === sectionName;
      section.classList.toggle('is-active', active);
      section.hidden = !active;
    });
    if (updateHash) {
      if (window.location.hash !== '#' + sectionName) {
        history.replaceState(null, '', '#' + sectionName);
      }
    }
    syncUsersAutoRefresh();
    syncDraftsAutoRefresh();
    syncQueueAutoRefresh();
    syncPostsAutoRefresh();
    syncNosterAutoRefresh();
    syncZapsAutoRefresh();
    syncBtcpayAutoRefresh();
    syncModerationAutoRefresh();
    renderUploadJobs();
    maybeLoadAdminSection(sectionName, true);
  }

  async function maybeLoadAdminSection(sectionName, silent) {
    const section = String(sectionName || '').trim();
    if (!state.isAdmin || !section || section === 'account') {
      return;
    }
    if (state.loadedAdminSections[section]) {
      return;
    }
    state.loadedAdminSections[section] = true;
    try {
      if (section === 'settings') {
        await loadConfig();
        return;
      }
      if (section === 'nostr-bridge') {
        await loadNosterRuntime();
        return;
      }
      if (section === 'zaps') {
        await loadConfig();
        await loadZapsRuntime();
        return;
      }
      if (section === 'btcpay') {
        await loadBtcpayRuntime();
        return;
      }
      if (section === 'users') {
        await loadUsers(false);
        return;
      }
      if (section === 'drafts') {
        await loadDrafts();
        return;
      }
      if (section === 'queue') {
        await loadQueue();
        return;
      }
      if (section === 'posts') {
        await loadPosts();
        return;
      }
      if (section === 'nostr-pages' || section === 'pages') {
        await loadNostrPages();
        return;
      }
      if (section === 'files') {
        await loadFiles();
        return;
      }
      if (section === 'moderation') {
        await loadModeration();
      }
    } catch (err) {
      state.loadedAdminSections[section] = false;
      if (silent) {
        return;
      }
      if (section === 'settings') {
        setOutput(els.outputConfig, 'Error: ' + err.message, 'error');
        return;
      }
      if (section === 'nostr-bridge') {
        setOutput(els.outputNostrBridge, 'Error: ' + err.message, 'error');
        return;
      }
      if (section === 'zaps') {
        setOutput(els.outputZaps, 'Error: ' + err.message, 'error');
        return;
      }
      if (section === 'btcpay') {
        setOutput(els.outputBtcpay, 'Error: ' + err.message, 'error');
        return;
      }
      if (section === 'users') {
        setOutput(els.outputUsers, 'Error: ' + err.message, 'error');
        return;
      }
      if (section === 'files') {
        setOutput(els.outputFiles, 'Error: ' + err.message, 'error');
        return;
      }
      if (section === 'drafts' || section === 'queue') {
        setOutput(els.outputQueue, 'Error: ' + err.message, 'error');
        return;
      }
      if (section === 'posts') {
        setOutput(els.outputPosts, 'Error: ' + err.message, 'error');
        return;
      }
      if (section === 'pages') {
        setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
        return;
      }
      if (section === 'moderation') {
        setOutput(els.outputModeration, 'Error: ' + err.message, 'error');
      }
    }
  }

  async function preloadAdminFirstPaint() {
    if (!state.isAdmin) {
      return;
    }

    const configTask = loadConfig();
    const jobs = [
      {
        sections: ['settings'],
        task: configTask
      },
      {
        sections: ['nostr-bridge'],
        task: loadNosterRuntime()
      },
      {
        sections: ['zaps'],
        task: configTask.then(function () { return loadZapsRuntime(); })
      },
      {
        sections: ['btcpay'],
        task: loadBtcpayRuntime()
      },
      {
        sections: ['users'],
        task: loadUsers(false)
      },
      {
        sections: ['drafts'],
        task: loadDrafts()
      },
      {
        sections: ['queue'],
        task: loadQueue()
      },
      {
        sections: ['posts'],
        task: loadPosts()
      },
      {
        sections: ['nostr-pages', 'pages'],
        task: loadNostrPages()
      },
      {
        sections: ['files'],
        task: loadFiles()
      },
      {
        sections: ['moderation'],
        task: loadModeration()
      }
    ];

    await Promise.all(jobs.map(async function (job) {
      try {
        await job.task;
        job.sections.forEach(function (section) {
          state.loadedAdminSections[section] = true;
        });
      } catch (_err) {
        job.sections.forEach(function (section) {
          state.loadedAdminSections[section] = false;
        });
      }
    }));
  }

  function initSectionNavigation() {
    if (!els.sectionButtons.length || !els.sections.length) {
      return;
    }
    activateSection(getSectionFromHash(), false);
    els.sectionButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        const targetSection = button.getAttribute('data-admin-nav') || 'settings';
        if (targetSection === state.activeSection) {
          return;
        }
        activateSection(targetSection, true);
      });
    });
    window.addEventListener('hashchange', function () {
      activateSection(getSectionFromHash(), false);
    });
  }

  function setAccountOnlyMode(enabled) {
    if (!els.adminPanel) {
      return;
    }
    els.adminPanel.classList.toggle('account-only', !!enabled);
    if (enabled) {
      els.adminPanel.classList.remove('sidebar-collapsed');
      if (els.sidebarRevealButton) {
        els.sidebarRevealButton.hidden = true;
      }
    } else {
      applySidebarCollapseState(state.sidebarCollapsed, false);
    }
    els.sectionButtons.forEach(function (button) {
      const section = button.getAttribute('data-admin-nav') || '';
      const visible = !enabled || section === 'account';
      button.hidden = !visible;
      button.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
  }

  function readSidebarCollapsePreference() {
    try {
      return localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_KEY) === '1';
    } catch (_err) {
      return false;
    }
  }

  function persistSidebarCollapsePreference(collapsed) {
    try {
      localStorage.setItem(ADMIN_SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function applySidebarCollapseState(collapsed, persist) {
    const next = !!collapsed;
    state.sidebarCollapsed = next;
    if (els.adminPanel) {
      els.adminPanel.classList.toggle('sidebar-collapsed', next && !els.adminPanel.classList.contains('account-only'));
    }
    if (els.sidebarRevealButton) {
      els.sidebarRevealButton.hidden = !next || !!(els.adminPanel && els.adminPanel.classList.contains('account-only'));
    }
    if (els.sidebarToggleButton) {
      els.sidebarToggleButton.setAttribute('aria-label', next ? 'Show admin sidebar' : 'Hide admin sidebar');
      els.sidebarToggleButton.setAttribute('title', next ? 'Show sidebar' : 'Hide sidebar');
      els.sidebarToggleButton.setAttribute('aria-pressed', next ? 'false' : 'true');
    }
    if (persist !== false) {
      persistSidebarCollapsePreference(next);
    }
  }

  function showGlobalToast(message, kind) {
    const text = String(message || '').trim();
    if (!text) {
      return;
    }
    const tone = kind === 'ok' ? 'ok' : (kind === 'warn' ? 'warn' : 'error');
    if (window.blogAuth && typeof window.blogAuth.showToast === 'function') {
      window.blogAuth.showToast(text, tone, 4200);
      return;
    }
    let host = document.getElementById('nav-top-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'nav-top-toast-host';
      host.className = 'nav-top-toast-host';
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-atomic', 'true');
      document.body.appendChild(host);
    }
    host.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = 'nav-top-toast';
    if (tone) {
      toast.classList.add('is-' + tone);
    }
    toast.textContent = text;
    host.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add('is-visible');
    });
    setTimeout(function () {
      toast.classList.add('is-closing');
      setTimeout(function () {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 230);
    }, 4200);
  }

  function setOutput(target, message, kind) {
    showGlobalToast(message, kind);
    if (target) {
      target.innerHTML = '';
    }
  }

  function updateQueueLocalDripStatus() {
    if (!els.queueLocalDripStatus) {
      return;
    }
    if (!state.queueItemCount) {
      els.queueLocalDripStatus.hidden = true;
      return;
    }
    els.queueLocalDripStatus.hidden = false;
    els.queueLocalDripStatus.classList.toggle('is-paused', !state.localDripEnabled);
    if (els.queueLocalDripStatusText) {
      els.queueLocalDripStatusText.textContent = !state.localDripEnabled
        ? 'Local drip paused.'
        : (state.localDripLeader
        ? 'Local drip running. Keep this tab open.'
        : 'Queue active. Keep one admin tab open for local drip.');
    }
  }

  function syncRunSchedulerButtonUi() {
    if (!els.runSchedulerButton) {
      return;
    }
    const hasDripItems = Number(state.dripQueueItemCount || 0) > 0;
    els.runSchedulerButton.disabled = !hasDripItems;
    els.runSchedulerButton.setAttribute('aria-disabled', hasDripItems ? 'false' : 'true');
    els.runSchedulerButton.title = hasDripItems ? 'Run drip now' : 'No drip queue items yet';
  }

  function syncLocalDripToggleUi() {
    if (!els.localDripToggleButton) {
      return;
    }
    const enabled = !!state.localDripEnabled;
    els.localDripToggleButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    els.localDripToggleButton.setAttribute('aria-label', enabled ? 'Pause local drip' : 'Resume local drip');
    els.localDripToggleButton.setAttribute('title', enabled ? 'Pause local drip' : 'Resume local drip');
  }

  function setLocalDripEnabled(enabled) {
    state.localDripEnabled = !!enabled;
    localStorage.setItem(LOCAL_DRIP_ENABLED_KEY, state.localDripEnabled ? '1' : '0');
    syncLocalDripToggleUi();
    updateQueueLocalDripStatus();
    if (state.localDripEnabled) {
      startLocalDripWorker();
      localDripWorkerTick(true).catch(function () {});
    } else {
      stopLocalDripWorker();
    }
  }

  function localDripLeaseRead() {
    try {
      const raw = localStorage.getItem(LOCAL_DRIP_LEASE_KEY) || '';
      if (!raw) {
        return null;
      }
      const data = JSON.parse(raw);
      if (!data || typeof data.owner !== 'string') {
        return null;
      }
      const expiresAt = Number(data.expires_at || 0);
      if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
        return null;
      }
      return { owner: data.owner, expires_at: expiresAt };
    } catch (_err) {
      return null;
    }
  }

  function localDripLeaseWrite(expiresAt) {
    const payload = {
      owner: state.localDripTabId,
      expires_at: Math.max(0, Math.floor(expiresAt))
    };
    localStorage.setItem(LOCAL_DRIP_LEASE_KEY, JSON.stringify(payload));
  }

  function localDripTryAcquireLease() {
    const now = Date.now();
    const lease = localDripLeaseRead();
    if (!lease || lease.expires_at <= now || lease.owner === state.localDripTabId) {
      localDripLeaseWrite(now + LOCAL_DRIP_LEASE_MS);
      return true;
    }
    return false;
  }

  function localDripReleaseLease() {
    const lease = localDripLeaseRead();
    if (!lease || lease.owner !== state.localDripTabId) {
      return;
    }
    localStorage.removeItem(LOCAL_DRIP_LEASE_KEY);
  }

  function setLocalDripLeader(active) {
    state.localDripLeader = !!active;
    updateQueueLocalDripStatus();
  }

  async function localDripWorkerTick(force) {
    if (!state.localDripEnabled) {
      setLocalDripLeader(false);
      localDripReleaseLease();
      return;
    }
    if (!state.isAdmin || !state.sessionToken) {
      setLocalDripLeader(false);
      localDripReleaseLease();
      return;
    }
    if (document.visibilityState !== 'visible') {
      setLocalDripLeader(false);
      localDripReleaseLease();
      return;
    }
    if (state.localDripWorkerBusy) {
      return;
    }
    if (!localDripTryAcquireLease()) {
      setLocalDripLeader(false);
      return;
    }
    setLocalDripLeader(true);
    const now = Date.now();
    if (!force && now - state.localDripLastTickAt < LOCAL_DRIP_TICK_MS - 500) {
      return;
    }
    state.localDripLastTickAt = now;
    state.localDripWorkerBusy = true;
    try {
      const data = await apiPost('/cgi/blog-run-scheduler', {}, true);
      if (!data.success) {
        throw new Error(data.error || 'Local drip tick failed');
      }
      const scheduled = Number(data.scheduled_published || 0);
      const drip = Number(data.drip_published || 0);
      if (scheduled > 0 || drip > 0) {
        await Promise.all([loadDrafts(), loadQueue(), loadPosts()]);
        setOutput(els.outputQueue, 'Local drip published queued content.', 'ok');
      }
    } catch (_err) {
      // Local drip runs continuously; user-facing errors should stay on manual actions.
    } finally {
      state.localDripWorkerBusy = false;
    }
  }

  function stopLocalDripWorker() {
    if (state.localDripWorkerTimer) {
      clearInterval(state.localDripWorkerTimer);
      state.localDripWorkerTimer = null;
    }
    setLocalDripLeader(false);
    localDripReleaseLease();
  }

  function startLocalDripWorker() {
    if (!state.localDripEnabled || !state.isAdmin || !state.sessionToken) {
      stopLocalDripWorker();
      return;
    }
    if (!state.localDripTabId) {
      state.localDripTabId = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    }
    if (state.localDripWorkerTimer) {
      return;
    }
    state.localDripWorkerTimer = setInterval(function () {
      localDripWorkerTick(false).catch(function () {});
    }, LOCAL_DRIP_TICK_MS);
    localDripWorkerTick(true).catch(function () {});
  }

  function lockNostrPubkeyField() {
    if (!els.accountNostrPubkey) {
      return;
    }
    const lockedValue = String(els.accountNostrPubkey.value || '');
    els.accountNostrPubkey.readOnly = true;
    els.accountNostrPubkey.setAttribute('readonly', 'readonly');
    els.accountNostrPubkey.setAttribute('aria-readonly', 'true');
    els.accountNostrPubkey.addEventListener('beforeinput', function (event) {
      event.preventDefault();
    });
    els.accountNostrPubkey.addEventListener('input', function () {
      if (els.accountNostrPubkey.value !== lockedValue) {
        els.accountNostrPubkey.value = lockedValue;
      }
    });
    setNostrPubkeyVisibility(false);
    syncNostrPubkeyActionState();
  }

  function setNostrPubkeyVisibility(visible) {
    if (!els.accountNostrPubkey) {
      return;
    }
    const shown = !!visible;
    els.accountNostrPubkey.classList.toggle('is-visible', shown);
    if (els.accountNostrPubkeyToggleButton) {
      els.accountNostrPubkeyToggleButton.classList.toggle('is-visible', shown);
      els.accountNostrPubkeyToggleButton.setAttribute('aria-label', shown ? 'Hide Nostr pubkey' : 'Show Nostr pubkey');
      els.accountNostrPubkeyToggleButton.setAttribute('title', shown ? 'Hide Nostr pubkey' : 'Show Nostr pubkey');
    }
  }

  async function copyTextToClipboard(text) {
    const value = String(text || '');
    if (!value) {
      return false;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_) {
        // Fall back to execCommand path below.
      }
    }
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (_) {
      ok = false;
    }
    area.remove();
    return ok;
  }

  function syncNostrPubkeyActionState() {
    const hasKey = !!(els.accountNostrPubkey && String(els.accountNostrPubkey.value || '').trim());
    if (els.accountNostrPubkeyCopyButton) {
      els.accountNostrPubkeyCopyButton.disabled = !hasKey;
    }
    if (els.accountNostrPubkeyToggleButton) {
      els.accountNostrPubkeyToggleButton.disabled = !hasKey;
    }
  }

  function applyThemePreview(theme) {
    const pickedTheme = (theme || '').trim() || 'adept';
    const themeLink = document.getElementById('theme-stylesheet');
    if (themeLink) {
      const href = '/static/themes/' + encodeURIComponent(pickedTheme) + '.css';
      const absoluteHref = new URL(href, window.location.href).href;
      const currentHref = String(themeLink.href || '');
      const currentRequested = String(themeLink.getAttribute('data-theme-href') || '');
      if (!(currentHref === absoluteHref || currentRequested === href || currentRequested === absoluteHref)) {
        const root = document.documentElement;
        const body = document.body;
        if (root) {
          root.classList.add('theme-switching');
        }
        if (body) {
          body.classList.add('theme-switching');
        }
        if (themeSwitchVisualTimer) {
          clearTimeout(themeSwitchVisualTimer);
        }
        themeSwitchVisualTimer = setTimeout(function () {
          if (root) {
            root.classList.remove('theme-switching');
          }
          if (body) {
            body.classList.remove('theme-switching');
          }
          themeSwitchVisualTimer = null;
        }, 90);
        const token = ++themeSwapToken;
        const preloader = document.createElement('link');
        preloader.rel = 'stylesheet';
        preloader.href = href;
        preloader.media = 'not all';
        preloader.setAttribute('data-theme-preload', 'true');
        const commit = function () {
          if (token !== themeSwapToken) {
            if (preloader.parentNode) {
              preloader.parentNode.removeChild(preloader);
            }
            return;
          }
          themeLink.href = href;
          themeLink.setAttribute('data-theme-href', href);
          if (preloader.parentNode) {
            preloader.parentNode.removeChild(preloader);
          }
        };
        preloader.addEventListener('load', commit, { once: true });
        preloader.addEventListener('error', commit, { once: true });
        (themeLink.parentNode || document.head || document.documentElement).appendChild(preloader);
        setTimeout(commit, 1500);
      }
    }
    const navThemeSelect = document.getElementById('theme-select');
    if (navThemeSelect && navThemeSelect.value !== pickedTheme) {
      navThemeSelect.value = pickedTheme;
    }
  }

  function normalizeSiteTitle(value) {
    const text = String(value || '').trim();
    return text || 'My Blog';
  }

  function applyNavSiteTitle(value) {
    const title = normalizeSiteTitle(value);
    const node = document.getElementById('nav-site-signature');
    if (node) {
      node.textContent = title;
      node.setAttribute('title', title);
    }
    try {
      localStorage.setItem(SITE_TITLE_CACHE_KEY, title);
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function parsePossiblyWrappedJson(text) {
    let raw = String(text || '');
    if (raw.charCodeAt(0) === 0xfeff) {
      raw = raw.slice(1);
    }
    try {
      return { ok: true, data: JSON.parse(raw) };
    } catch (_) {}
    const objectStart = raw.indexOf('{');
    const arrayStart = raw.indexOf('[');
    let start = -1;
    if (objectStart >= 0 && arrayStart >= 0) {
      start = Math.min(objectStart, arrayStart);
    } else if (objectStart >= 0) {
      start = objectStart;
    } else if (arrayStart >= 0) {
      start = arrayStart;
    }
    if (start > 0) {
      const trimmed = raw.slice(start);
      try {
        return { ok: true, data: JSON.parse(trimmed) };
      } catch (_) {}
    }
    return { ok: false, preview: raw.slice(0, 180).replace(/\s+/g, ' ').trim() };
  }

  async function fetchJson(url, options) {
    const request = Object.assign({ cache: 'no-store' }, options || {});
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await fetch(url, request);
      const text = await res.text();
      const parsed = parsePossiblyWrappedJson(text);
      if (parsed.ok) {
        return parsed.data;
      }
      if (attempt === 0) {
        await new Promise(function (resolve) { setTimeout(resolve, 120); });
        continue;
      }
      const detail = parsed.preview ? (': ' + parsed.preview) : '';
      throw new Error('Invalid JSON response' + detail);
    }
    throw new Error('Invalid JSON response');
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(String(base64 || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function buildAuthPayload(data) {
    syncAuthStateFromStorage();
    return Object.assign({
      session_token: state.sessionToken,
      csrf_token: state.csrfToken
    }, data || {});
  }

  function maybePromptInteractiveApproval(data) {
    if (!data || data.code !== 'interactive_signature_required') {
      return;
    }
    if (window.blogAuth && typeof window.blogAuth.openLoginModal === 'function') {
      window.blogAuth.openLoginModal();
    }
  }

  function syncAuthStateFromStorage() {
    state.sessionToken = localStorage.getItem('session_token') || '';
    state.csrfToken = localStorage.getItem('csrf_token') || '';
  }

  function refreshAuthFromStorage() {
    syncAuthStateFromStorage();
    checkAuth().catch(function (err) {
      setAuthMessage('Error: ' + err.message, 'error');
    });
  }

  function emitAuthChanged() {
    try {
      window.dispatchEvent(new CustomEvent('blog-auth-changed', {
        detail: { session_token: state.sessionToken || '', csrf_token: state.csrfToken || '' }
      }));
    } catch (_err) {
      // Ignore event dispatch issues.
    }
  }

  function clearStoredAuth() {
    localStorage.removeItem('session_token');
    localStorage.removeItem('csrf_token');
    state.sessionToken = '';
    state.csrfToken = '';
    emitAuthChanged();
  }

  async function apiPost(url, data, includeAuth) {
    const payload = includeAuth ? buildAuthPayload(data || {}) : (data || {});
    const body = new URLSearchParams(payload);
    const res = await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    maybePromptInteractiveApproval(res);
    return res;
  }

  function ensureNostrPublishDialog() {
    if (window.blogNostrPublishDialog && typeof window.blogNostrPublishDialog.open === 'function') {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      const script = document.createElement('script');
      script.src = '/static/nostr-publish-dialog.js';
      script.async = true;
      script.onload = function () {
        resolve(!!(window.blogNostrPublishDialog && typeof window.blogNostrPublishDialog.open === 'function'));
      };
      script.onerror = function () {
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  function fileAccessUrl(url) {
    syncAuthStateFromStorage();
    const raw = String(url || '').trim();
    if (!raw || raw.indexOf('/cgi/blog-file?') !== 0) {
      return raw;
    }
    const params = new URLSearchParams(raw.split('?')[1] || '');
    if (!params.get('session_token') && state.sessionToken) {
      params.set('session_token', state.sessionToken);
    }
    if (!params.get('csrf_token') && state.csrfToken) {
      params.set('csrf_token', state.csrfToken);
    }
    return '/cgi/blog-file?' + params.toString();
  }

  function rewritePreviewPrivateFileLinks() {
    if (!els.markdownPreview) {
      return;
    }
    const nodes = els.markdownPreview.querySelectorAll('img[src], source[src], audio[src], video[src], a[href]');
    nodes.forEach(function (node) {
      const attr = node.hasAttribute('href') ? 'href' : 'src';
      const current = node.getAttribute(attr);
      const next = fileAccessUrl(current);
      if (next && next !== current) {
        node.setAttribute(attr, next);
      }
    });
  }

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes || 0));
    if (value < 1024) {
      return value + ' B';
    }
    if (value < 1024 * 1024) {
      return (value / 1024).toFixed(value < 10240 ? 1 : 0) + ' KB';
    }
    return (value / (1024 * 1024)).toFixed(value < 10485760 ? 1 : 0) + ' MB';
  }

  function addUploadJob(file, kind) {
    const job = {
      id: 'upload-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      name: String((file && file.name) || 'upload.bin'),
      size: Number((file && file.size) || 0),
      mime_type: String((file && file.type) || ''),
      kind: kind || 'file',
      progress: 0,
      status: 'Queued',
      done: false,
      error: ''
    };
    state.fileUploads = state.fileUploads.concat([job]);
    state.activeUploadCount += 1;
    renderUploadJobs();
    if (job.kind === 'file') {
      renderFilesList(state.files);
    }
    return job;
  }

  function updateUploadJob(jobId, patch) {
    state.fileUploads = state.fileUploads.map(function (job) {
      if (job.id !== jobId) {
        return job;
      }
      return Object.assign({}, job, patch || {});
    });
    renderUploadJobs();
    renderFilesList(state.files);
  }

  function finishUploadJob(jobId, errorMessage) {
    state.fileUploads = state.fileUploads.map(function (job) {
      if (job.id !== jobId) {
        return job;
      }
      return Object.assign({}, job, {
        done: true,
        progress: errorMessage ? job.progress : 100,
        status: errorMessage ? 'Failed' : 'Done',
        error: errorMessage || ''
      });
    });
    state.activeUploadCount = Math.max(0, state.activeUploadCount - 1);
    renderUploadJobs();
    renderFilesList(state.files);
  }

  function renderUploadJobs() {
    if (!els.filesUploadJobs || !els.filesUploadSummary) {
      return;
    }
    const jobs = state.fileUploads.slice(-6);
    els.filesUploadJobs.hidden = true;
    els.filesUploadJobs.innerHTML = '';
    if (!jobs.length) {
      els.filesUploadSummary.hidden = true;
      els.filesUploadSummary.textContent = '';
      return;
    }
    let active = 0;
    jobs.forEach(function (job) {
      if (!job.done) {
        active += 1;
      }
    });
    if (active > 0) {
      els.filesUploadSummary.hidden = false;
      els.filesUploadSummary.textContent = active + ' upload' + (active === 1 ? '' : 's') + ' in progress';
      return;
    }
    els.filesUploadSummary.hidden = true;
    els.filesUploadSummary.textContent = '';
  }

  function pendingFileRows() {
    return state.fileUploads
      .filter(function (job) { return job && job.kind === 'file'; })
      .slice(-12)
      .reverse();
  }

  function normalizeUploadDataBase64(dataUrl) {
    const raw = String(dataUrl || '').trim();
    if (!raw) {
      return '';
    }
    const commaIdx = raw.indexOf(',');
    if (commaIdx > 0 && /^data:/i.test(raw.slice(0, commaIdx))) {
      return raw.slice(commaIdx + 1);
    }
    return raw;
  }

  function isMissingUploadPayloadError(data, statusCode) {
    if (!data || typeof data !== 'object') {
      return false;
    }
    const code = String(data.code || '').toLowerCase();
    const message = String(data.error || '').toLowerCase();
    return statusCode >= 400 && code === 'invalid_request' && message.indexOf('filename and data_base64 are required') >= 0;
  }

  function uploadFileWithProgress(file, options) {
    const opts = options || {};
    const includeAuth = opts.includeAuth !== false;
    const extraData = Object.assign({}, opts.data || {});
    const job = addUploadJob(file, opts.kind || 'file');

    return readFileAsDataUrl(file).then(function (dataUrl) {
      const rawDataUrl = String(dataUrl || '').trim();
      const bareDataBase64 = normalizeUploadDataBase64(rawDataUrl);
      const safeFilename = String((file && file.name) || job.name || 'upload.bin').trim() || 'upload.bin';
      const safeMimeType = String((file && file.type) || '');
      if (!rawDataUrl) {
        finishUploadJob(job.id, 'Could not read file data');
        return Promise.reject(new Error('Failed to read file'));
      }
      return new Promise(function (resolve, reject) {
        let fallbackAttempted = false;

        function buildPayload(useBareData) {
          const payload = includeAuth ? buildAuthPayload(extraData) : Object.assign({}, extraData);
          payload.filename = safeFilename;
          payload.mime_type = safeMimeType;
          payload.data_base64 = useBareData ? bareDataBase64 : rawDataUrl;
          return payload;
        }

        function sendAttempt(useBareData) {
          const body = new URLSearchParams(buildPayload(useBareData)).toString();
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/cgi/blog-upload-media', true);
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
          xhr.upload.addEventListener('progress', function (event) {
            if (!event.lengthComputable) {
              return;
            }
            const pct = Math.round((event.loaded / event.total) * 100);
            updateUploadJob(job.id, {
              progress: pct,
              status: pct >= 100 ? 'Finalizing' : 'Uploading',
              error: ''
            });
          });
          xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) {
              return;
            }
            let data;
            try {
              data = JSON.parse(String(xhr.responseText || ''));
            } catch (_err) {
              finishUploadJob(job.id, 'Invalid response');
              reject(new Error('Invalid JSON response'));
              return;
            }
            maybePromptInteractiveApproval(data);
            if (xhr.status < 200 || xhr.status >= 300 || !data.success) {
              if (!useBareData && !fallbackAttempted && isMissingUploadPayloadError(data, xhr.status)) {
                fallbackAttempted = true;
                updateUploadJob(job.id, {
                  status: 'Retrying',
                  error: '',
                  progress: Math.max(5, Number(job.progress || 0))
                });
                sendAttempt(true);
                return;
              }
              const message = data && data.error ? String(data.error) : 'Upload failed';
              finishUploadJob(job.id, message);
              reject(new Error(message));
              return;
            }
            finishUploadJob(job.id, '');
            resolve(data);
          };
          xhr.onerror = function () {
            finishUploadJob(job.id, 'Upload failed');
            reject(new Error('Upload failed'));
          };
          xhr.send(body);
        }

        sendAttempt(false);
      });
    });
  }

  function getPublishMode() {
    const picked = publishModeInputs.find(function (input) { return input.checked; });
    return picked ? picked.value : 'immediate';
  }

  function normalizeComposePublishMode(mode) {
    const raw = String(mode || '').trim().toLowerCase();
    if (raw === 'scheduled' || raw === 'drip' || raw === 'immediate') {
      return raw;
    }
    if (raw === 'draft' || raw === '') {
      return 'immediate';
    }
    return 'immediate';
  }

  function setPublishMode(mode) {
    const normalized = normalizeComposePublishMode(mode);
    publishModeInputs.forEach(function (input) {
      input.checked = input.value === normalized;
    });
    updatePrimaryPublishButton(normalized);
    updateScheduledRowVisibility(normalized);
    updateDripQueuePill(normalized);
  }

  function updatePrimaryPublishButton(mode) {
    if (!els.publishNowButton) {
      return;
    }
    const picked = mode || getPublishMode();
    if (picked === 'scheduled') {
      els.publishNowButton.textContent = 'Schedule Post';
      return;
    }
    if (picked === 'drip') {
      els.publishNowButton.textContent = 'Enqueue Post';
      return;
    }
    els.publishNowButton.textContent = 'Publish Now';
  }

  function updateScheduledRowVisibility(mode) {
    if (!els.scheduledRow) {
      return;
    }
    const picked = mode || getPublishMode();
    const isScheduled = picked === 'scheduled';
    els.scheduledRow.classList.toggle('is-hidden', !isScheduled);
    if (isScheduled && els.postScheduleAt) {
      window.setTimeout(function () {
        try {
          els.postScheduleAt.focus();
          if (typeof els.postScheduleAt.showPicker === 'function') {
            els.postScheduleAt.showPicker();
          }
        } catch (_) {
          // Browser may block programmatic picker open; focus is still useful.
        }
      }, 40);
    }
  }

  function formatEtaMinutes(minutes) {
    const total = Math.max(0, Number(minutes || 0));
    if (!total) {
      return 'next';
    }
    if (total < 60) {
      return total + 'm';
    }
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? (h + 'h ' + m + 'm') : (h + 'h');
  }

  function updateDripQueuePill(mode) {
    if (!els.dripQueuePill) {
      return;
    }
    const picked = mode || getPublishMode();
    if (picked !== 'drip') {
      els.dripQueuePill.hidden = true;
      els.dripQueuePill.textContent = '';
      return;
    }
    if (!state.dripQueueInfoReady) {
      els.dripQueuePill.hidden = true;
      els.dripQueuePill.textContent = '';
      return;
    }
    const ahead = Math.max(0, Number(state.dripQueueAhead || 0));
    if (ahead === 0) {
      els.dripQueuePill.textContent = 'next';
      els.dripQueuePill.hidden = false;
      return;
    }
    els.dripQueuePill.textContent = ahead + ' ahead • ~' + formatEtaMinutes(state.dripQueueEtaMinutes);
    els.dripQueuePill.hidden = false;
  }

  function setAutosaveStatus(kind, detail) {
    if (!els.autosaveStatus) {
      return;
    }
    const mode = String(kind || '').trim();
    if (!mode) {
      els.autosaveStatus.hidden = true;
      els.autosaveStatus.textContent = '';
      els.autosaveStatus.removeAttribute('title');
      els.autosaveStatus.classList.remove('is-saving', 'is-error');
      return;
    }
    els.autosaveStatus.hidden = false;
    els.autosaveStatus.classList.toggle('is-saving', mode === 'saving');
    els.autosaveStatus.classList.toggle('is-error', mode === 'error');
    if (mode === 'saving') {
      els.autosaveStatus.textContent = 'Saving...';
      els.autosaveStatus.removeAttribute('title');
      return;
    }
    if (mode === 'saved') {
      els.autosaveStatus.textContent = '✓ Saved';
      if (detail) {
        els.autosaveStatus.setAttribute('title', String(detail));
      } else {
        els.autosaveStatus.removeAttribute('title');
      }
      return;
    }
    els.autosaveStatus.textContent = 'Save failed';
    if (detail) {
      els.autosaveStatus.setAttribute('title', String(detail));
    } else {
      els.autosaveStatus.removeAttribute('title');
    }
  }

  function setPreviewVisibility(visible) {
    state.previewVisible = !!visible;
    if (els.composeShell) {
      els.composeShell.classList.toggle('preview-hidden', !state.previewVisible);
    }
    if (els.togglePreviewButton) {
      const label = state.previewVisible ? 'Hide preview' : 'Show preview';
      els.togglePreviewButton.setAttribute('aria-pressed', state.previewVisible ? 'true' : 'false');
      els.togglePreviewButton.setAttribute('aria-label', label);
      els.togglePreviewButton.setAttribute('title', label);
    }
    localStorage.setItem('blog_admin_preview_hidden', state.previewVisible ? '0' : '1');
  }

  function localToIso(value) {
    if (!value) {
      return '';
    }
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) {
      return '';
    }
    return dt.toISOString().replace('.000Z', 'Z');
  }

  function isoToLocal(isoValue) {
    if (!isoValue) {
      return '';
    }
    const dt = new Date(isoValue);
    if (Number.isNaN(dt.getTime())) {
      return '';
    }
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function readComposer() {
    commitTagInput();
    return {
      draft_id: state.currentDraftId,
      title: els.postTitle.value.trim(),
      tags: els.postTags.value.trim(),
      summary: '',
      content: els.postContent.value,
      scheduled_at: localToIso(els.postScheduleAt.value),
      publish_mode: getPublishMode()
    };
  }

  function populateComposer(draft) {
    const status = String((draft && draft.status) || '').trim().toLowerCase();
    const rawMode = String((draft && draft.publish_mode) || '').trim().toLowerCase();
    let mode = rawMode;
    if (status === 'queued') {
      mode = 'drip';
    } else if (status === 'scheduled') {
      mode = 'scheduled';
    } else {
      mode = normalizeComposePublishMode(mode);
    }

    state.suspendAutosave = true;
    state.currentDraftId = draft.draft_id || '';
    els.postTitle.value = draft.title || '';
    setComposeTagsFromString(draft.tags || '');
    els.postContent.value = draft.content || '';
    els.postScheduleAt.value = isoToLocal(draft.scheduled_at || '');
    setPublishMode(mode || 'immediate');
    renderPreview();
    refreshDraftLabel();
    setTimeout(function () {
      state.suspendAutosave = false;
    }, 0);
  }

  function resetComposer() {
    state.currentDraftId = '';
    els.postTitle.value = '';
    setComposeTags([]);
    els.postContent.value = '';
    els.postScheduleAt.value = '';
    setPublishMode('immediate');
    renderPreview();
    refreshDraftLabel();
  }

  function refreshDraftLabel() {
    if (!els.currentDraftLabel) {
      updateDripQueuePill();
      return;
    }
    if (state.currentDraftId) {
      els.currentDraftLabel.textContent = 'Editing draft: ' + state.currentDraftId;
    } else {
      els.currentDraftLabel.textContent = 'New draft';
    }
    updateDripQueuePill();
  }

  function syncComposeTagsField() {
    if (!els.postTags) {
      return;
    }
    els.postTags.value = state.composeTags.join(', ');
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderComposeTags() {
    if (!els.postTagsPills) {
      return;
    }
    if (els.postTagsEditor) {
      els.postTagsEditor.classList.toggle('has-tags', state.composeTags.length > 0);
    }
    if (!state.composeTags.length) {
      els.postTagsPills.innerHTML = '';
      return;
    }
    let html = '';
    state.composeTags.forEach(function (tag) {
      html += '<span class="tag-pill">';
      html += '<span>' + escapeHtml(tag) + '</span>';
      html += '<button type="button" class="tag-pill-remove" data-remove-tag="' + escapeAttr(tag) + '" aria-label="Remove tag ' + escapeAttr(tag) + '">×</button>';
      html += '</span>';
    });
    els.postTagsPills.innerHTML = html;
  }

  function normalizeTagValue(tag) {
    return String(tag || '').trim().replace(/\s+/g, '-');
  }

  function setComposeTags(tags) {
    const list = Array.from(tags || [])
      .map(normalizeTagValue)
      .filter(function (tag) { return !!tag; });
    state.composeTags = list.filter(function (tag, idx) {
      return list.indexOf(tag) === idx;
    });
    syncComposeTagsField();
    renderComposeTags();
  }

  function setComposeTagsFromString(tagsValue) {
    const list = String(tagsValue || '')
      .split(',')
      .map(normalizeTagValue)
      .filter(function (tag) { return !!tag; });
    setComposeTags(list);
  }

  function addComposeTag(rawTag) {
    const tag = normalizeTagValue(rawTag);
    if (!tag) {
      return false;
    }
    if (state.composeTags.indexOf(tag) !== -1) {
      return false;
    }
    state.composeTags.push(tag);
    syncComposeTagsField();
    renderComposeTags();
    return true;
  }

  function removeComposeTag(tag) {
    const next = state.composeTags.filter(function (item) { return item !== tag; });
    setComposeTags(next);
  }

  function commitTagInput() {
    if (!els.postTagsInput) {
      return false;
    }
    const raw = els.postTagsInput.value || '';
    const parts = raw.split(',');
    let changed = false;
    parts.forEach(function (part) {
      if (addComposeTag(part)) {
        changed = true;
      }
    });
    els.postTagsInput.value = '';
    return changed;
  }

  function renderPreview() {
    const md = els.postContent.value;
    if (!md.trim()) {
      els.markdownPreview.innerHTML = '<p class="placeholder">Preview will appear here...</p>';
      return;
    }
    els.markdownPreview.innerHTML = marked.parse(md);
    rewritePreviewRelativeLinks();
    rewritePreviewPrivateFileLinks();
  }

  function isRelativeContentPath(raw) {
    const value = String(raw || '').trim();
    if (!value) {
      return false;
    }
    if (value[0] === '#' || value[0] === '/') {
      return false;
    }
    if (value.indexOf('//') === 0) {
      return false;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
      return false;
    }
    return true;
  }

  function draftAssetUrl(raw) {
    const value = String(raw || '').trim();
    if (!state.currentDraftId || !isRelativeContentPath(value)) {
      return value;
    }
    return '/cgi/blog-draft-asset?draft_id=' +
      encodeURIComponent(state.currentDraftId) +
      '&path=' + encodeURIComponent(value);
  }

  function rewritePreviewRelativeLinks() {
    if (!els.markdownPreview || !state.currentDraftId) {
      return;
    }
    const nodes = els.markdownPreview.querySelectorAll('img[src], source[src], audio[src], video[src], a[href]');
    nodes.forEach(function (node) {
      const attr = node.hasAttribute('href') ? 'href' : 'src';
      const current = node.getAttribute(attr);
      const next = draftAssetUrl(current);
      if (next && next !== current) {
        node.setAttribute(attr, next);
      }
    });
  }

  function placeCursor(textarea, start, end) {
    textarea.focus();
    textarea.setSelectionRange(start, end);
  }

  function replaceSelection(transformer) {
    const textarea = els.postContent;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    const updated = transformer(selected);
    const prefix = textarea.value.slice(0, start);
    const suffix = textarea.value.slice(end);
    textarea.value = prefix + updated.text + suffix;
    placeCursor(textarea, start + updated.cursorStart, start + updated.cursorEnd);
    renderPreview();
    queueAutosave('saving');
  }

  function toggleWrap(left, right) {
    replaceSelection(function (selected) {
      const s = selected || 'text';
      if (s.startsWith(left) && s.endsWith(right)) {
        const unwrapped = s.slice(left.length, s.length - right.length);
        return {
          text: unwrapped,
          cursorStart: 0,
          cursorEnd: unwrapped.length
        };
      }
      const wrapped = left + s + right;
      return {
        text: wrapped,
        cursorStart: left.length,
        cursorEnd: left.length + s.length
      };
    });
  }

  function replaceSelectedLines(transformer) {
    const textarea = els.postContent;
    const value = textarea.value;
    const selStart = textarea.selectionStart;
    const selEnd = textarea.selectionEnd;
    const lineStart = value.lastIndexOf('\n', Math.max(0, selStart - 1)) + 1;
    const lineEndIdx = value.indexOf('\n', selEnd);
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
    const source = value.slice(lineStart, lineEnd);
    const lines = source.split('\n');
    const result = transformer(lines);
    if (!result || !Array.isArray(result.lines)) {
      return;
    }
    const next = result.lines.join('\n');
    textarea.value = value.slice(0, lineStart) + next + value.slice(lineEnd);
    placeCursor(textarea, lineStart, lineStart + next.length);
    renderPreview();
    queueAutosave('saving');
  }

  function toggleHeadingOnCurrentLine(level) {
    const heading = '#'.repeat(level) + ' ';
    replaceSelectedLines(function (lines) {
      const line = lines[0] || '';
      const stripped = line.replace(/^#{1,6}\s+/, '');
      if (line.startsWith(heading)) {
        lines[0] = stripped;
      } else {
        lines[0] = heading + stripped;
      }
      return { lines: lines };
    });
  }

  function togglePrefixOnLines(prefix) {
    replaceSelectedLines(function (lines) {
      const nonEmpty = lines.filter(function (line) { return line.trim() !== ''; });
      const allHave = nonEmpty.length > 0 && nonEmpty.every(function (line) {
        return line.startsWith(prefix);
      });
      const next = lines.map(function (line) {
        if (line.trim() === '') {
          return line;
        }
        if (allHave) {
          return line.startsWith(prefix) ? line.slice(prefix.length) : line;
        }
        return prefix + line;
      });
      return { lines: next };
    });
  }

  function toggleOrderedListOnLines() {
    replaceSelectedLines(function (lines) {
      const nonEmpty = lines.filter(function (line) { return line.trim() !== ''; });
      const allOrdered = nonEmpty.length > 0 && nonEmpty.every(function (line) {
        return /^\d+\.\s+/.test(line);
      });
      let idx = 1;
      const next = lines.map(function (line) {
        if (line.trim() === '') {
          return line;
        }
        if (allOrdered) {
          return line.replace(/^\d+\.\s+/, '');
        }
        const text = line.replace(/^\d+\.\s+/, '').replace(/^-+\s+/, '');
        const out = idx + '. ' + text;
        idx += 1;
        return out;
      });
      return { lines: next };
    });
  }

  function toggleCodeBlock() {
    replaceSelection(function (selected) {
      const source = selected || '';
      if (/^```[\s\S]*```$/.test(source.trim())) {
        const unwrapped = source.trim().replace(/^```[\n]?/, '').replace(/\n?```$/, '');
        return {
          text: unwrapped,
          cursorStart: 0,
          cursorEnd: unwrapped.length
        };
      }
      const wrapped = '```\n' + source + '\n```';
      return {
        text: wrapped,
        cursorStart: 4,
        cursorEnd: wrapped.length - 4
      };
    });
  }

  function insertLink() {
    replaceSelection(function (selected) {
      const label = selected || 'link text';
      const text = '[' + label + '](https://)';
      return {
        text: text,
        cursorStart: text.indexOf('https://'),
        cursorEnd: text.indexOf('https://') + 8
      };
    });
  }

  function insertImage(url, alt) {
    replaceSelection(function (selected) {
      const label = alt || selected || 'image';
      const text = '![' + label + '](' + url + ')';
      return {
        text: text,
        cursorStart: text.length,
        cursorEnd: text.length
      };
    });
  }

  async function checkAuth() {
    syncAuthStateFromStorage();
    if (!state.sessionToken) {
      stopLocalDripWorker();
      setAuthMessage('Not logged in. Use the Login button in the top navigation to sign in with Nostr.', 'error');
      markInitialContentPainted();
      markHydrationPageReady();
      return;
    }

    try {
      const data = await fetchJson('/cgi/ssh-auth-check-session?session_token=' + encodeURIComponent(state.sessionToken));
      if (!data.authenticated) {
        clearStoredAuth();
        stopLocalDripWorker();
        setAuthMessage('Session expired. Use the Login button in the top navigation to sign in again.', 'error');
        markInitialContentPainted();
        markHydrationPageReady();
        return;
      }

      state.username = data.username;
      state.playerName = data.player_name || data.username || '';
      state.nostrPubkey = data.nostr_pubkey || '';
      state.sshFingerprint = data.ssh_fingerprint || '';
      state.isAdmin = !!data.is_admin;
      state.csrfToken = data.csrf_token || state.csrfToken;
      localStorage.setItem('csrf_token', state.csrfToken || '');
      setAuthMessage('', '');
      if (els.accountPlayerName) {
        els.accountPlayerName.value = state.playerName;
      }
      if (els.accountNostrPubkey) {
        els.accountNostrPubkey.value = state.nostrPubkey;
        lockNostrPubkeyField();
      }
      if (els.accountSshPublicKey) {
        els.accountSshPublicKey.placeholder = state.sshFingerprint
          ? ('SSH linked (' + state.sshFingerprint.slice(0, 16) + '...)')
          : 'ssh-ed25519 AAAA...';
      }
      syncSshAccountActionState();

      if (!state.isAdmin) {
        stopLocalDripWorker();
        setAccountOnlyMode(true);
        activateSection('account', true);
        els.adminPanel.style.display = 'grid';
        markInitialContentPainted();
        markHydrationPageReady();
        return;
      }

      syncLocalDripToggleUi();
      startLocalDripWorker();
      setAccountOnlyMode(false);
      activateSection(getSectionFromHash(), false);
      els.adminPanel.style.display = 'grid';
      renderPreview();
      try {
        await preloadAdminFirstPaint();
      } catch (_preloadErr) {
        // Keep first paint resilient; section-specific loaders surface errors.
      }
      try {
        await maybeLoadAdminSection(state.activeSection, false);
      } catch (_sectionErr) {
        // Section loader already writes actionable status output.
      }
      markInitialContentPainted();
      markHydrationPageReady();
    } catch (err) {
      const msg = String((err && err.message) || '');
      if (/\bnot authenticated\b/i.test(msg) || /\bauth(?:entication)?\s+required\b/i.test(msg)) {
        clearStoredAuth();
      }
      stopLocalDripWorker();
      setAuthMessage('Authentication check failed: ' + err.message, 'error');
      markInitialContentPainted();
      markHydrationPageReady();
    }
  }

  async function loadConfig() {
    state.isLoadingConfig = true;
    try {
      const data = await fetchJson('/cgi/blog-get-config');
      if (!data.success) {
        throw new Error(data.error || 'Failed to load configuration');
      }
      els.siteTitle.value = normalizeSiteTitle(data.site_title);
      applyNavSiteTitle(els.siteTitle.value);
      if (els.adminTheme && data.theme) {
        els.adminTheme.value = data.theme;
      }
      els.registrationEnabled.checked = data.registration_enabled !== false;
      if (typeof data.drip_interval_hours !== 'undefined') {
        els.dripInterval.value = String(data.drip_interval_hours);
      } else {
        const legacyMinutes = Number(data.drip_interval_minutes || 240);
        els.dripInterval.value = String(Math.max(legacyMinutes / 60, 1 / 60));
      }
      if (typeof data.drip_randomness_minutes !== 'undefined') {
        els.dripRandomness.value = String(data.drip_randomness_minutes || 0);
      } else {
        els.dripRandomness.value = String(data.drip_jitter_minutes || 0);
      }
      els.feedFullText.checked = data.feed_full_text !== false;
      els.feedItems.value = String(data.feed_items || 50);
      state.nostrBridgeEnabled = !!data.nostr_bridge_enabled;
      if (els.nostrBridgeEnabled) {
        els.nostrBridgeEnabled.checked = state.nostrBridgeEnabled;
      }
      if (els.nostrAuthors) {
        els.nostrAuthors.value = Array.isArray(data.nostr_authors) ? data.nostr_authors.join('\n') : '';
      }
      if (els.nostrRelays) {
        els.nostrRelays.value = Array.isArray(data.nostr_relays) ? data.nostr_relays.join('\n') : '';
      }
      if (els.nostrBlocklist) {
        els.nostrBlocklist.value = Array.isArray(data.nostr_blocklist) ? data.nostr_blocklist.join('\n') : '';
      }
      if (els.newUsersAreAdmins) {
        els.newUsersAreAdmins.checked = !!data.new_users_are_admins;
      }
      if (els.zapsEnabled) {
        els.zapsEnabled.checked = !!data.zaps_enabled;
      }
      if (els.zapLud16) {
        els.zapLud16.value = String(data.zap_lud16 || '');
      }
      if (els.zapDefaultAmountSats) {
        els.zapDefaultAmountSats.value = String(data.zap_default_amount_sats || 210);
      }
      syncZapsEnabledAvailability();
      if (els.mirrorNostrButton) {
        els.mirrorNostrButton.disabled = !state.nostrBridgeEnabled;
      }
    } finally {
      state.isLoadingConfig = false;
    }
  }

  async function saveConfig() {
    try {
      const shouldRefreshQueue = state.activeSection === 'queue';
      const normalizedSiteTitle = normalizeSiteTitle(els.siteTitle ? els.siteTitle.value : '');
      if (els.siteTitle) {
        els.siteTitle.value = normalizedSiteTitle;
      }
      applyNavSiteTitle(normalizedSiteTitle);
      const data = await apiPost('/cgi/blog-update-config', {
        site_title: normalizedSiteTitle,
        theme: els.adminTheme ? els.adminTheme.value : '',
        registration_enabled: els.registrationEnabled.checked ? 'true' : 'false',
        drip_interval_hours: els.dripInterval.value.trim(),
        drip_randomness_minutes: els.dripRandomness.value.trim(),
        feed_full_text: els.feedFullText.checked ? 'true' : 'false',
        feed_items: els.feedItems.value.trim(),
        new_users_are_admins: (els.newUsersAreAdmins && els.newUsersAreAdmins.checked) ? 'true' : 'false',
        zaps_enabled: (els.zapsEnabled && els.zapsEnabled.checked) ? 'true' : 'false',
        zap_lud16: els.zapLud16 ? els.zapLud16.value.trim() : '',
        zap_default_amount_sats: els.zapDefaultAmountSats ? els.zapDefaultAmountSats.value.trim() : ''
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to save config');
      }
      if (els.outputConfig) {
        els.outputConfig.innerHTML = '';
      }
      if (shouldRefreshQueue) {
        await loadQueue();
      }
    } catch (err) {
      setOutput(els.outputConfig, 'Error: ' + err.message, 'error');
    }
  }

  function queueConfigAutosave(delayMs) {
    if (state.isLoadingConfig) {
      return;
    }
    if (state.configSaveTimer) {
      clearTimeout(state.configSaveTimer);
    }
    state.configSaveTimer = setTimeout(function () {
      saveConfig().catch(function () {});
    }, Math.max(150, Number(delayMs || 500)));
  }

  function normalizeLineList(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return !!line; })
      .join('\n');
  }

  function setNostrBridgeSaveStatus(kind, detail) {
    const nodes = [els.nostrAuthorsSaveStatus, els.nostrRelaysSaveStatus, els.nostrBlocklistSaveStatus].filter(Boolean);
    if (!nodes.length) {
      return;
    }
    const mode = String(kind || '').trim();
    nodes.forEach(function (node) {
      if (!mode) {
        node.hidden = true;
        node.textContent = '';
        node.removeAttribute('title');
        node.classList.remove('is-saving', 'is-error');
        return;
      }
      node.hidden = false;
      node.classList.toggle('is-saving', mode === 'saving');
      node.classList.toggle('is-error', mode === 'error');
      if (mode === 'saving') {
        node.textContent = 'Saving...';
        node.removeAttribute('title');
      } else if (mode === 'saved') {
        node.textContent = '✓ Saved';
        if (detail) {
          node.setAttribute('title', String(detail));
        } else {
          node.removeAttribute('title');
        }
      } else {
        node.textContent = 'Save failed';
        if (detail) {
          node.setAttribute('title', String(detail));
        } else {
          node.removeAttribute('title');
        }
      }
    });
  }

  async function saveNostrBridgeConfig() {
    try {
      const data = await apiPost('/cgi/blog-update-config', {
        nostr_lists_update: 'true',
        nostr_bridge_enabled: (els.nostrBridgeEnabled && els.nostrBridgeEnabled.checked) ? 'true' : 'false',
        nostr_authors: normalizeLineList(els.nostrAuthors ? els.nostrAuthors.value : ''),
        nostr_relays: normalizeLineList(els.nostrRelays ? els.nostrRelays.value : ''),
        nostr_blocklist: normalizeLineList(els.nostrBlocklist ? els.nostrBlocklist.value : '')
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to save Nostr bridge settings');
      }
      state.nostrBridgeEnabled = !!(els.nostrBridgeEnabled && els.nostrBridgeEnabled.checked);
      if (els.mirrorNostrButton) {
        els.mirrorNostrButton.disabled = !state.nostrBridgeEnabled;
      }
      setNostrBridgeSaveStatus('saved', 'Saved at ' + new Date().toLocaleString());
      if (els.outputNostrBridge) {
        els.outputNostrBridge.innerHTML = '';
      }
    } catch (err) {
      setNostrBridgeSaveStatus('error', 'Autosave failed (' + err.message + ')');
      setOutput(els.outputNostrBridge, 'Error: ' + err.message, 'error');
    }
  }

  function queueNostrBridgeAutosave(delayMs) {
    if (state.isLoadingConfig) {
      return;
    }
    if (state.nostrBridgeSaveTimer) {
      clearTimeout(state.nostrBridgeSaveTimer);
    }
    setNostrBridgeSaveStatus('saving');
    state.nostrBridgeSaveTimer = setTimeout(function () {
      saveNostrBridgeConfig().catch(function () {});
    }, Math.max(180, Number(delayMs || 700)));
  }

  function bindSettingsAutosave() {
    const configFields = [
      els.siteTitle,
      els.adminTheme,
      els.registrationEnabled,
      els.feedFullText,
      els.feedItems,
      els.newUsersAreAdmins,
      els.zapsEnabled,
      els.zapLud16,
      els.zapDefaultAmountSats,
      els.dripInterval,
      els.dripRandomness
    ].filter(Boolean);

    configFields.forEach(function (field) {
      const tag = (field.tagName || '').toLowerCase();
      const inputType = (field.type || '').toLowerCase();
      if (inputType === 'checkbox' || tag === 'select') {
        field.addEventListener('change', function () { queueConfigAutosave(200); });
        return;
      }
      field.addEventListener('input', function () {
        queueConfigAutosave(500);
      });
      field.addEventListener('change', function () { queueConfigAutosave(220); });
      field.addEventListener('blur', function () { queueConfigAutosave(180); });
    });

    if (els.nostrBridgeEnabled) {
      els.nostrBridgeEnabled.addEventListener('change', function () { queueNostrBridgeAutosave(180); });
    }

    [els.nostrAuthors, els.nostrRelays, els.nostrBlocklist].filter(Boolean).forEach(function (field) {
      field.addEventListener('input', function () { queueNostrBridgeAutosave(850); });
      field.addEventListener('change', function () { queueNostrBridgeAutosave(250); });
      field.addEventListener('blur', function () { queueNostrBridgeAutosave(220); });
    });
  }

  function setNosterNavStatus(runtime) {
    if (!els.navNosterStatus) {
      return;
    }
    const info = runtime && typeof runtime === 'object' ? runtime : {};
    const stonrInstalled = !!(info.stonr_installed || info.stoner_installed);
    const stonrRunning = !!(info.stonr_running || info.stoner_running);
    let label = 'Not Installed';
    let statusClass = 'is-offline';
    if (info.relay_connected) {
      label = 'Connected';
      statusClass = 'is-connected';
    } else if (stonrRunning) {
      label = 'Online';
      statusClass = 'is-online';
    } else if (stonrInstalled) {
      label = 'Installed';
      statusClass = 'is-installed';
    }
    els.navNosterStatus.textContent = label;
    els.navNosterStatus.className = 'admin-nav-status-pill ' + statusClass;
  }

  function setZapsNavStatus(runtime) {
    if (!els.navZapsStatus) {
      return;
    }
    const info = runtime && typeof runtime === 'object' ? runtime : {};
    const wizardryReady = !!info.wizardry_installed;
    const bitcoinReady = !!info.bitcoin_installed;
    const lightningReady = !!info.lightning_installed;
    let label = 'Not Installed';
    let statusClass = 'is-offline';
    if (lightningReady) {
      label = 'Ready';
      statusClass = 'is-connected';
    } else if (wizardryReady || bitcoinReady) {
      label = 'Partial';
      statusClass = 'is-installed';
    }
    els.navZapsStatus.textContent = label;
    els.navZapsStatus.className = 'admin-nav-status-pill ' + statusClass;
  }

  function setBtcpayNavStatus(runtime) {
    if (!els.navBtcpayStatus) {
      return;
    }
    const info = runtime && typeof runtime === 'object' ? runtime : {};
    const btcpayInstalled = !!info.btcpay_installed;
    const btcpayRunning = !!info.btcpay_running;
    let label = 'Not Installed';
    let statusClass = 'is-offline';
    if (btcpayRunning) {
      label = 'Online';
      statusClass = 'is-online';
    } else if (btcpayInstalled) {
      label = 'Installed';
      statusClass = 'is-installed';
    }
    els.navBtcpayStatus.textContent = label;
    els.navBtcpayStatus.className = 'admin-nav-status-pill ' + statusClass;
  }

  function setNosterButtonsBusy(isBusy) {
    const cardButtons = els.nosterRuntime ? Array.from(els.nosterRuntime.querySelectorAll('button[data-noster-action]')) : [];
    const settingInputs = els.nosterRuntime ? Array.from(els.nosterRuntime.querySelectorAll('input[data-noster-setting]')) : [];
    const runtimeInfo = state.nosterRuntime && typeof state.nosterRuntime === 'object' ? state.nosterRuntime : {};
    const stonrInstalled = !!(runtimeInfo.stonr_installed || runtimeInfo.stoner_installed);
    cardButtons.forEach(function (button) {
      const action = String(button.getAttribute('data-noster-action') || '').toLowerCase();
      const requiresInstalled = action === 'start' || action === 'stop' || action === 'activate_relay_url';
      if (isBusy) {
        button.disabled = true;
        return;
      }
      if (requiresInstalled && !stonrInstalled) {
        button.disabled = true;
        return;
      }
      button.disabled = false;
    });
    settingInputs.forEach(function (input) {
      input.disabled = !!isBusy;
    });
  }

  function readNosterSettingsFromRuntime(info) {
    const runtime = info && typeof info === 'object' ? info : {};
    const settings = runtime.settings && typeof runtime.settings === 'object' ? runtime.settings : {};
    return {
      general_relay: !!settings.general_relay,
      mirror_posts: (typeof settings.mirror_posts === 'boolean') ? settings.mirror_posts : true,
      mirror_comments: (typeof settings.mirror_comments === 'boolean') ? settings.mirror_comments : true,
      auto_start: !!settings.auto_start
    };
  }

  function readNosterSettingsFromUi() {
    const fallback = readNosterSettingsFromRuntime(state.nosterRuntime || {});
    const readCheckbox = function (name, fallbackValue) {
      if (!els.nosterRuntime) {
        return fallbackValue;
      }
      const node = els.nosterRuntime.querySelector('input[data-noster-setting="' + name + '"]');
      if (!(node instanceof HTMLInputElement)) {
        return fallbackValue;
      }
      return !!node.checked;
    };
    return {
      general_relay: readCheckbox('general_relay', fallback.general_relay),
      mirror_posts: readCheckbox('mirror_posts', fallback.mirror_posts),
      mirror_comments: readCheckbox('mirror_comments', fallback.mirror_comments),
      auto_start: readCheckbox('auto_start', fallback.auto_start)
    };
  }

  function renderNosterRuntime(runtime, logText, message) {
    if (!els.nosterRuntime) {
      return;
    }
    const info = runtime && typeof runtime === 'object' ? runtime : {};
    state.nosterRuntime = info;
    setNosterNavStatus(info);

    const stonrInstalled = !!(info.stonr_installed || info.stoner_installed);
    const stonrRunning = !!(info.stonr_running || info.stoner_running);
    const relayConnected = !!info.relay_connected;
    const relayUrl = String(info.relay_url || '').trim();
    const relaySslStatus = String(info.relay_ssl_status || '').trim().toLowerCase();
    const settings = readNosterSettingsFromRuntime(info);
    const stonrPath = info.stonr_path || info.stoner_path || '';
    const actionDisabledAttr = state.nosterActionInFlight ? ' disabled' : '';
    const startDisabledAttr = (!stonrInstalled || state.nosterActionInFlight) ? ' disabled' : '';
    const relayUrlDisabledAttr = (!stonrInstalled || state.nosterActionInFlight) ? ' disabled' : '';
    const relaySslIcon = relaySslStatus === 'ok'
      ? '<span class="noster-relay-ssl is-ok" title="SSL ready" aria-label="SSL ready"></span>'
      : (relaySslStatus === 'warn'
        ? '<span class="noster-relay-ssl is-warn" title="SSL issue" aria-label="SSL issue"></span>'
        : '');
    const relayUrlHtml = relayUrl
      ? ('<span class="noster-relay-url">' + relaySslIcon + '<span class="noster-relay-url-text">' + escapeHtml(relayUrl) + '</span></span>')
      : '<span class="zaps-runtime-value is-warn">Not set</span>';

    let html = '';
    html += '<div class="field-row"><div class="setting-label"><strong>Install Stonr</strong></div>'
      + (stonrInstalled
        ? '<div class="zaps-runtime-value is-ok">Installed</div>'
        : ('<button type="button" class="zaps-runtime-action" data-noster-action="install"' + actionDisabledAttr + '>Install Stonr</button>'))
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Relay URL Setup</strong></div>'
      + '<button type="button" class="zaps-runtime-action" data-noster-action="activate_relay_url"' + relayUrlDisabledAttr + '>Activate Relay URL Flow</button>'
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Process</strong></div>'
      + '<button type="button" class="zaps-runtime-action" data-noster-action="' + (stonrRunning ? 'stop' : 'start') + '"' + startDisabledAttr + '>' + (stonrRunning ? 'Stop Stonr' : 'Start Stonr') + '</button>'
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Relay URL</strong></div><div class="zaps-runtime-value">' + relayUrlHtml + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Relay Connection</strong></div><div class="zaps-runtime-value ' + (relayConnected ? 'is-ok' : 'is-warn') + '">' + (relayConnected ? 'Connected' : 'Disconnected') + '</div></div>';
    html += '<h4>Settings</h4>';
    html += '<div class="field-row checkbox-row"><div class="setting-label"><strong>Also act as a general relay</strong></div><label class="checkbox-control checkbox-control-plain"><input type="checkbox" data-noster-setting="general_relay"' + (settings.general_relay ? ' checked' : '') + actionDisabledAttr + '><span>Enabled</span></label></div>';
    html += '<div class="field-row checkbox-row"><div class="setting-label"><strong>Mirror posts from configured authors</strong></div><label class="checkbox-control checkbox-control-plain"><input type="checkbox" data-noster-setting="mirror_posts"' + (settings.mirror_posts ? ' checked' : '') + actionDisabledAttr + '><span>Enabled</span></label></div>';
    html += '<div class="field-row checkbox-row"><div class="setting-label"><strong>Mirror comments for mirrored posts</strong></div><label class="checkbox-control checkbox-control-plain"><input type="checkbox" data-noster-setting="mirror_comments"' + (settings.mirror_comments ? ' checked' : '') + actionDisabledAttr + '><span>Enabled</span></label></div>';
    html += '<div class="field-row checkbox-row"><div class="setting-label"><strong>Auto-start Stonr</strong></div><label class="checkbox-control checkbox-control-plain"><input type="checkbox" data-noster-setting="auto_start"' + (settings.auto_start ? ' checked' : '') + actionDisabledAttr + '><span>Enabled</span></label></div>';
    if (stonrPath) {
      html += '<div class="field-row"><div class="setting-label"><strong>Stonr Path</strong></div><div class="zaps-runtime-value">' + escapeHtml(String(stonrPath)) + '</div></div>';
    }
    if (info.config_path) {
      html += '<div class="field-row"><div class="setting-label"><strong>Config Path</strong></div><div class="zaps-runtime-value">' + escapeHtml(String(info.config_path)) + '</div></div>';
    }
    if (info.pid) {
      html += '<div class="field-row"><div class="setting-label"><strong>PID</strong></div><div class="zaps-runtime-value">' + escapeHtml(String(info.pid)) + '</div></div>';
    }
    if (message) {
      html += '<pre class="zaps-runtime-log">' + escapeHtml(String(message)) + (logText ? '\n\n' + escapeHtml(String(logText)) : '') + '</pre>';
    } else if (logText) {
      html += '<pre class="zaps-runtime-log">' + escapeHtml(String(logText)) + '</pre>';
    }
    els.nosterRuntime.innerHTML = html;
  }

  async function saveNosterSettings() {
    const settings = readNosterSettingsFromUi();
    const request = {
      action: 'save_settings',
      general_relay: settings.general_relay ? 'true' : 'false',
      mirror_posts: settings.mirror_posts ? 'true' : 'false',
      mirror_comments: settings.mirror_comments ? 'true' : 'false',
      auto_start: settings.auto_start ? 'true' : 'false'
    };
    state.nosterActionInFlight = true;
    setNosterButtonsBusy(true);
    try {
      const data = await apiPost('/cgi/blog-manage-noster', request, true);
      if (!data.success) {
        renderNosterRuntime(data.runtime || {}, data.log || '', 'Nostr settings save failed.');
        throw new Error(data.error || 'Could not save Nostr settings');
      }
      renderNosterRuntime(data.runtime || {}, data.log || '', data.message || '');
      setOutput(els.outputNostrBridge, data.message || 'Nostr settings saved.', 'ok');
    } catch (err) {
      setOutput(els.outputNostrBridge, 'Error: ' + err.message, 'error');
    } finally {
      state.nosterActionInFlight = false;
      setNosterButtonsBusy(false);
    }
  }

  function queueNosterSettingsAutosave(delayMs) {
    if (state.nosterSettingsSaveTimer) {
      clearTimeout(state.nosterSettingsSaveTimer);
    }
    state.nosterSettingsSaveTimer = setTimeout(function () {
      saveNosterSettings().catch(function () {});
    }, Math.max(100, Number(delayMs || 220)));
  }

  async function loadNosterRuntime() {
    if (!els.nosterRuntime) {
      return;
    }
    setNosterButtonsBusy(true);
    try {
      const data = await apiPost('/cgi/blog-manage-noster', { action: 'status' }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to load Nostr runtime');
      }
      renderNosterRuntime(data.runtime || {}, '', data.message || '');
      if (els.outputNostrBridge) {
        els.outputNostrBridge.innerHTML = '';
      }
    } catch (err) {
      renderNosterRuntime({}, '', '');
      setOutput(els.outputNostrBridge, 'Error: ' + err.message, 'error');
    } finally {
      setNosterButtonsBusy(false);
    }
  }

  async function runNosterAction(action) {
    const picked = String(action || '').trim();
    if (!picked) {
      return;
    }
    const request = { action: picked };
    let message = '';
    if (picked === 'install') {
      message = 'Install Stonr on this server now?';
    } else if (picked === 'start') {
      message = 'Start Stonr now?';
    } else if (picked === 'stop') {
      message = 'Stop Stonr now?';
    } else if (picked === 'activate_relay_url') {
      message = 'Activate Stonr Relay URL setup flow now?';
    }
    if (message && !window.confirm(message)) {
      return;
    }
    state.nosterActionInFlight = true;
    setNosterButtonsBusy(true);
    renderNosterRuntime(state.nosterRuntime || {}, '', 'Running ' + picked + '...');
    try {
      const data = await apiPost('/cgi/blog-manage-noster', request, true);
      if (!data.success) {
        renderNosterRuntime(data.runtime || {}, data.log || '', 'Nostr action failed.');
        throw new Error(data.error || 'Nostr action failed');
      }
      renderNosterRuntime(data.runtime || {}, data.log || '', data.message || '');
      setOutput(els.outputNostrBridge, data.message || 'Nostr updated.', 'ok');
    } catch (err) {
      setOutput(els.outputNostrBridge, 'Error: ' + err.message, 'error');
    } finally {
      state.nosterActionInFlight = false;
      setNosterButtonsBusy(false);
    }
  }

  function stopNosterPolling() {
    if (state.nosterPollTimer) {
      clearInterval(state.nosterPollTimer);
      state.nosterPollTimer = null;
    }
  }

  function syncNosterAutoRefresh() {
    const nosterVisible = state.isAdmin && state.activeSection === 'nostr-bridge';
    if (!nosterVisible) {
      stopNosterPolling();
      return;
    }
    loadNosterRuntime().catch(function (err) {
      setOutput(els.outputNostrBridge, 'Error: ' + err.message, 'error');
    });
    if (state.nosterPollTimer) {
      return;
    }
    state.nosterPollTimer = setInterval(function () {
      if (!(state.isAdmin && state.activeSection === 'nostr-bridge')) {
        stopNosterPolling();
        return;
      }
      if (document.visibilityState !== 'visible') {
        return;
      }
      loadNosterRuntime().catch(function () {});
    }, 10000);
  }

  function setZapsButtonsBusy(isBusy) {
    const cardButtons = els.zapsRuntime ? Array.from(els.zapsRuntime.querySelectorAll('button[data-zaps-action]')) : [];
    cardButtons.filter(Boolean).forEach(function (button) {
      button.disabled = !!isBusy;
    });
  }

  function syncZapsEnabledAvailability() {
    if (!els.zapsEnabled) {
      return;
    }
    const info = state.zapsRuntimeInfo && typeof state.zapsRuntimeInfo === 'object'
      ? state.zapsRuntimeInfo
      : {};
    const canEnable = !!info.bitcoin_installed && !!info.lightning_installed;
    els.zapsEnabled.disabled = !canEnable;
    const row = els.zapsEnabled.closest('.field-row');
    if (row) {
      row.classList.toggle('is-control-disabled', !canEnable);
    }
    if (canEnable) {
      els.zapsEnabled.removeAttribute('title');
      return;
    }
    els.zapsEnabled.setAttribute('title', 'Install both Bitcoin and Lightning to enable zaps.');
  }

  function stopZapsPolling() {
    if (state.zapsPollTimer) {
      clearInterval(state.zapsPollTimer);
      state.zapsPollTimer = null;
    }
  }

  function syncZapsAutoRefresh() {
    const zapsVisible = state.isAdmin && state.activeSection === 'zaps';
    if (!zapsVisible) {
      stopZapsPolling();
      return;
    }
    loadZapsRuntime().catch(function (err) {
      setOutput(els.outputZaps, 'Error: ' + err.message, 'error');
    });
    if (state.zapsPollTimer) {
      return;
    }
    state.zapsPollTimer = setInterval(function () {
      if (!(state.isAdmin && state.activeSection === 'zaps')) {
        stopZapsPolling();
        return;
      }
      if (document.visibilityState !== 'visible' || state.zapsActionInFlight) {
        return;
      }
      loadZapsRuntime().catch(function () {});
    }, 10000);
  }

  function renderZapsRuntime(runtime, logText, message) {
    if (!els.zapsRuntime) {
      return;
    }
    const info = runtime && typeof runtime === 'object' ? runtime : {};
    state.zapsRuntimeInfo = info;
    syncZapsEnabledAvailability();
    setZapsNavStatus(info);
    const wizardryReady = !!info.wizardry_installed;
    const bitcoinReady = !!info.bitcoin_installed;
    const lightningReady = !!info.lightning_installed;
    const wizardryPath = String(info.wizardry_path || '').trim();
    const installDisabledAttr = state.zapsActionInFlight ? ' disabled' : '';
    let html = '';
    html += '<div class="field-row"><div class="setting-label"><strong>Wizardry</strong></div>'
      + (wizardryReady
        ? ('<div class="zaps-runtime-value is-ok">' + escapeHtml(wizardryPath ? ('Installed to ' + wizardryPath) : 'Installed') + '</div>')
        : ('<button type="button" class="zaps-runtime-action" data-zaps-action="install_wizardry"' + installDisabledAttr + '>Install</button>'))
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Bitcoin</strong></div>'
      + (bitcoinReady
        ? '<div class="zaps-runtime-value is-ok">Installed</div>'
        : ('<button type="button" class="zaps-runtime-action" data-zaps-action="install_bitcoin"' + installDisabledAttr + '>Install (~500 MB)</button>'))
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Lightning</strong></div>'
      + (lightningReady
        ? '<div class="zaps-runtime-value is-ok">Installed</div>'
        : ('<button type="button" class="zaps-runtime-action" data-zaps-action="install_lightning"' + installDisabledAttr + '>Install (~150 MB)</button>'))
      + '</div>';
    if (message) {
      html += '<pre class="zaps-runtime-log">' + escapeHtml(String(message)) + (logText ? '\n\n' + escapeHtml(String(logText)) : '') + '</pre>';
    } else if (logText) {
      html += '<pre class="zaps-runtime-log">' + escapeHtml(String(logText)) + '</pre>';
    }
    els.zapsRuntime.innerHTML = html;
  }

  async function loadZapsRuntime() {
    if (!els.zapsRuntime) {
      return;
    }
    setZapsButtonsBusy(true);
    try {
      const data = await apiPost('/cgi/blog-manage-zaps', { action: 'status' }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to load zap runtime');
      }
      renderZapsRuntime(data.runtime || {}, '', '');
      if (els.outputZaps) {
        els.outputZaps.innerHTML = '';
      }
    } catch (err) {
      renderZapsRuntime({}, '', '');
      setOutput(els.outputZaps, 'Error: ' + err.message, 'error');
    } finally {
      setZapsButtonsBusy(false);
    }
  }

  async function runZapsInstall(action) {
    const picked = String(action || '').trim();
    if (!picked) {
      return;
    }
    const label = picked === 'install_wizardry'
      ? 'Wizardry'
      : (picked === 'install_bitcoin' ? 'Bitcoin' : (picked === 'install_lightning' ? 'Lightning' : ''));
    if (!label) {
      return;
    }
    if (!window.confirm('Run the ' + label + ' installer on this server now?')) {
      return;
    }
    state.zapsActionInFlight = true;
    setZapsButtonsBusy(true);
    renderZapsRuntime(state.zapsRuntimeInfo || {}, '', 'Running ' + label + ' installer...');
    try {
      const data = await apiPost('/cgi/blog-manage-zaps', { action: picked }, true);
      if (!data.success) {
        renderZapsRuntime(data.runtime || {}, data.log || '', label + ' installer failed.');
        throw new Error(data.error || (label + ' install failed'));
      }
      renderZapsRuntime(data.runtime || {}, data.log || '', data.message || '');
      setOutput(els.outputZaps, data.message || (label + ' install completed.'), 'ok');
    } catch (err) {
      setOutput(els.outputZaps, 'Error: ' + err.message, 'error');
    } finally {
      state.zapsActionInFlight = false;
      setZapsButtonsBusy(false);
    }
  }

  function setBtcpayButtonsBusy(isBusy) {
    const cardButtons = els.btcpayRuntime ? Array.from(els.btcpayRuntime.querySelectorAll('button[data-btcpay-action]')) : [];
    cardButtons.filter(Boolean).forEach(function (button) {
      button.disabled = !!isBusy;
    });
  }

  function stopBtcpayPolling() {
    if (state.btcpayPollTimer) {
      clearInterval(state.btcpayPollTimer);
      state.btcpayPollTimer = null;
    }
  }

  function syncBtcpayAutoRefresh() {
    const btcpayVisible = state.isAdmin && state.activeSection === 'btcpay';
    if (!btcpayVisible) {
      stopBtcpayPolling();
      return;
    }
    loadBtcpayRuntime().catch(function (err) {
      setOutput(els.outputBtcpay, 'Error: ' + err.message, 'error');
    });
    if (state.btcpayPollTimer) {
      return;
    }
    state.btcpayPollTimer = setInterval(function () {
      if (!(state.isAdmin && state.activeSection === 'btcpay')) {
        stopBtcpayPolling();
        return;
      }
      if (document.visibilityState !== 'visible' || state.btcpayActionInFlight) {
        return;
      }
      loadBtcpayRuntime().catch(function () {});
    }, 10000);
  }

  function renderBtcpayRuntime(runtime, logText, message) {
    if (!els.btcpayRuntime) {
      return;
    }
    const info = runtime && typeof runtime === 'object' ? runtime : {};
    state.btcpayRuntimeInfo = info;
    setBtcpayNavStatus(info);

    const wizardryReady = !!info.wizardry_installed;
    const btcpayReady = !!info.btcpay_installed;
    const btcpayRunning = !!info.btcpay_running;
    const wizardryPath = String(info.wizardry_path || '').trim();
    const btcpayHost = String(info.btcpay_host || '').trim();
    const btcpayUrl = String(info.btcpay_url || '').trim();
    const actionDisabledAttr = state.btcpayActionInFlight ? ' disabled' : '';

    let html = '';
    html += '<div class="field-row"><div class="setting-label"><strong>Wizardry</strong></div>'
      + (wizardryReady
        ? ('<div class="zaps-runtime-value is-ok">' + escapeHtml(wizardryPath ? ('Installed to ' + wizardryPath) : 'Installed') + '</div>')
        : '<div class="zaps-runtime-value is-warn">Not installed</div>')
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>BTCPay Server</strong></div>'
      + (btcpayReady
        ? '<div class="zaps-runtime-value is-ok">Installed</div>'
        : ('<button type="button" class="zaps-runtime-action" data-btcpay-action="install_btcpay"' + actionDisabledAttr + '>Install</button>'))
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Process</strong></div>'
      + '<div class="zaps-runtime-value ' + (btcpayRunning ? 'is-ok' : 'is-warn') + '">' + (btcpayRunning ? 'Running' : 'Stopped') + '</div>'
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Host</strong></div>'
      + '<div class="zaps-runtime-value">' + (btcpayHost ? escapeHtml(btcpayHost) : '<span class="zaps-runtime-value is-warn">Not set</span>') + '</div>'
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>URL</strong></div>'
      + '<div class="zaps-runtime-value">' + (btcpayUrl ? ('<a href="' + escapeAttr(btcpayUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(btcpayUrl) + '</a>') : '<span class="zaps-runtime-value is-warn">Unavailable</span>') + '</div>'
      + '</div>';
    if (message) {
      html += '<pre class="zaps-runtime-log">' + escapeHtml(String(message)) + (logText ? '\n\n' + escapeHtml(String(logText)) : '') + '</pre>';
    } else if (logText) {
      html += '<pre class="zaps-runtime-log">' + escapeHtml(String(logText)) + '</pre>';
    }
    els.btcpayRuntime.innerHTML = html;
  }

  async function loadBtcpayRuntime() {
    if (!els.btcpayRuntime) {
      return;
    }
    setBtcpayButtonsBusy(true);
    try {
      const data = await apiPost('/cgi/blog-manage-btcpay', { action: 'status' }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to load BTCPay runtime');
      }
      renderBtcpayRuntime(data.runtime || {}, '', '');
      if (els.outputBtcpay) {
        els.outputBtcpay.innerHTML = '';
      }
    } catch (err) {
      renderBtcpayRuntime({}, '', '');
      setOutput(els.outputBtcpay, 'Error: ' + err.message, 'error');
    } finally {
      setBtcpayButtonsBusy(false);
    }
  }

  async function runBtcpayAction(action) {
    const picked = String(action || '').trim();
    if (!picked) {
      return;
    }
    if (picked !== 'install_btcpay' && picked !== 'uninstall_btcpay') {
      return;
    }
    const label = picked === 'install_btcpay' ? 'BTCPay Server installer' : 'BTCPay Server uninstall';
    if (!window.confirm('Run the ' + label + ' on this server now?')) {
      return;
    }
    state.btcpayActionInFlight = true;
    setBtcpayButtonsBusy(true);
    renderBtcpayRuntime(state.btcpayRuntimeInfo || {}, '', 'Running ' + label + '...');
    try {
      const data = await apiPost('/cgi/blog-manage-btcpay', { action: picked }, true);
      if (!data.success) {
        renderBtcpayRuntime(data.runtime || {}, data.log || '', 'BTCPay action failed.');
        throw new Error(data.error || 'BTCPay action failed');
      }
      renderBtcpayRuntime(data.runtime || {}, data.log || '', data.message || '');
      setOutput(els.outputBtcpay, data.message || 'BTCPay updated.', 'ok');
    } catch (err) {
      setOutput(els.outputBtcpay, 'Error: ' + err.message, 'error');
    } finally {
      state.btcpayActionInFlight = false;
      setBtcpayButtonsBusy(false);
    }
  }

  async function saveAccount() {
    if (!els.accountPlayerName) {
      return;
    }
    const nextName = els.accountPlayerName.value.trim();
    const currentName = String(state.playerName || state.username || '').trim();
    let renameAuthoredPosts = false;
    try {
      if (nextName && currentName && nextName !== currentName) {
        const preview = await apiPost('/cgi/blog-update-account', {
          player_name: nextName,
          preview_rename: 'true'
        }, true);
        if (!preview.success) {
          throw new Error(preview.error || 'Could not check authored posts');
        }
        const candidateCount = Number(preview.rename_candidate_count || 0);
        const oldNameForPrompt = String(preview.old_player_name || currentName || '').trim();
        if (candidateCount > 0) {
          renameAuthoredPosts = window.confirm(
            'Posts were found authored under your old name.\n\n' +
            'Would you like to update the author field of all these posts to your new name?\n\n' +
            'Old name: "' + oldNameForPrompt + '"\n' +
            'New name: "' + nextName + '"\n' +
            'Matching posts: ' + candidateCount
          );
        }
      }
      const data = await apiPost('/cgi/blog-update-account', {
        player_name: nextName,
        rename_authored_posts: renameAuthoredPosts ? 'true' : 'false'
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to save account');
      }
      state.playerName = data.player_name || state.username;
      const navName = document.getElementById('nav-user-name');
      if (navName) {
        navName.textContent = state.playerName;
      }
      const renamedPosts = Number(data.renamed_posts || 0);
      if (renameAuthoredPosts) {
        setOutput(
          els.outputAccount,
          renamedPosts > 0
            ? ('Account updated. Author name updated on ' + renamedPosts + ' post' + (renamedPosts === 1 ? '' : 's') + '.')
            : 'Account updated. No authored posts matched your old name.',
          'ok'
        );
      } else {
        setOutput(els.outputAccount, 'Account updated.', 'ok');
      }
    } catch (err) {
      setOutput(els.outputAccount, 'Error: ' + err.message, 'error');
    }
  }

  function concatUint8Arrays(parts) {
    let total = 0;
    parts.forEach(function (part) { total += part.length; });
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach(function (part) {
      out.set(part, offset);
      offset += part.length;
    });
    return out;
  }

  function u32be(value) {
    return new Uint8Array([
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff
    ]);
  }

  function packSshString(bytes) {
    return concatUint8Arrays([u32be(bytes.length), bytes]);
  }

  function normalizeMpint(bytes) {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) {
      start += 1;
    }
    let out = bytes.slice(start);
    if (!out.length) {
      out = new Uint8Array([0]);
    }
    if (out[0] & 0x80) {
      const prefixed = new Uint8Array(out.length + 1);
      prefixed[0] = 0;
      prefixed.set(out, 1);
      out = prefixed;
    }
    return out;
  }

  function base64urlToBytes(input) {
    const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const binary = atob(normalized + '='.repeat(padLen));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  function pemEncode(label, buffer) {
    const b64 = arrayBufferToBase64(buffer);
    const chunks = b64.match(/.{1,64}/g) || [];
    return '-----BEGIN ' + label + '-----\n' + chunks.join('\n') + '\n-----END ' + label + '-----\n';
  }

  function triggerTextDownload(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function generateBrowserSshKeyPair() {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('Web Crypto API is unavailable in this browser.');
    }
    const keyPair = await window.crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    }, true, ['sign', 'verify']);

    const jwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const pkcs8 = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    const nBytes = normalizeMpint(base64urlToBytes(jwk.n || ''));
    const eBytes = normalizeMpint(base64urlToBytes(jwk.e || ''));
    const algo = new TextEncoder().encode('ssh-rsa');
    const blob = concatUint8Arrays([
      packSshString(algo),
      packSshString(eBytes),
      packSshString(nBytes)
    ]);
    const comment = (state.username || 'player') + '@wizardry';
    const publicKey = 'ssh-rsa ' + arrayBufferToBase64(blob.buffer) + ' ' + comment;
    const privateKeyPem = pemEncode('PRIVATE KEY', pkcs8);
    return {
      publicKey: publicKey,
      privateKeyPem: privateKeyPem
    };
  }

  function createPasskeyOptions(username, fingerprint, challengeB64) {
    return {
      publicKey: {
        challenge: base64ToArrayBuffer(challengeB64),
        rp: {
          name: 'Wizardry Blog',
          id: window.location.hostname
        },
        user: {
          id: new TextEncoder().encode(fingerprint),
          name: username,
          displayName: username
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        authenticatorSelection: {
          // Prefer hardware security keys over platform passkeys where supported.
          authenticatorAttachment: 'cross-platform',
          residentKey: 'discouraged',
          userVerification: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      }
    };
  }

  async function bindPasskeyForAccount() {
    if (!window.PublicKeyCredential) {
      throw new Error('WebAuthn is not supported in this browser.');
    }
    const begin = await apiPost('/cgi/nostr-auth-passkey-begin', {}, true);
    if (!begin.success) {
      throw new Error(begin.error || 'Unable to start passkey binding.');
    }
    const credential = await navigator.credentials.create(createPasskeyOptions(begin.username, begin.fingerprint, begin.challenge));
    const publicKey = credential.response.getPublicKey ? credential.response.getPublicKey() : null;
    if (!publicKey) {
      throw new Error('Passkey registration requires a newer browser.');
    }
    const finish = await apiPost('/cgi/ssh-auth-bind-webauthn', {
      username: begin.username,
      fingerprint: begin.fingerprint,
      credential_id: credential.id,
      public_key: arrayBufferToBase64(publicKey),
      client_data_json: arrayBufferToBase64(credential.response.clientDataJSON)
    }, false);
    if (!finish.success) {
      throw new Error(finish.error || 'Passkey bind failed.');
    }
  }

  async function linkSshForAccount() {
    const raw = els.accountSshPublicKey ? String(els.accountSshPublicKey.value || '').trim() : '';
    if (!raw) {
      throw new Error('Enter or generate an SSH public key first.');
    }
    const data = await apiPost('/cgi/nostr-auth-link-ssh', {
      ssh_public_key: raw
    }, true);
    if (!data.success) {
      throw new Error(data.error || 'SSH link failed.');
    }
    state.sshFingerprint = data.ssh_fingerprint || '';
    state.lastLinkedSshKeyText = raw;
    syncSshAccountActionState();
  }

  function syncSshAccountActionState() {
    if (!els.accountSshPublicKey) {
      return;
    }
    const raw = String(els.accountSshPublicKey.value || '').trim();
    if (els.generateSshButton) {
      els.generateSshButton.disabled = raw.length > 0;
    }
    if (els.linkSshButton) {
      els.linkSshButton.disabled = (raw.length === 0 || raw === state.lastLinkedSshKeyText);
    }
  }

  function renderDraftList(drafts) {
    if (!drafts.length) {
      els.draftsList.innerHTML = '<div class="draft-rows"><p class="placeholder table-empty">No drafts yet.</p></div>';
      return;
    }

    let html = '<div class="draft-rows">';
    drafts.forEach(function (draft) {
      const title = String(draft.title || 'Untitled');
      const excerpt = String(draft.content_excerpt || '').trim();
      const draftId = escapeAttr(draft.draft_id || '');
      html += '<div class="draft-row" data-draft-id="' + draftId + '">';
      html += '<div class="draft-row-main">';
      html += '<div class="draft-row-line" title="' + escapeAttr(title) + '">' +
        '<a href="#" class="draft-row-open" data-draft-action="open" data-draft-id="' + draftId + '">' + escapeHtml(title) + '</a>' +
        '</div>';
      if (excerpt) {
        html += '<div class="draft-row-excerpt" title="' + escapeAttr(excerpt) + '">' + escapeHtml(excerpt) + '</div>';
      }
      html += '</div>';
      html += '<div class="draft-row-actions">';
      html += '<div class="post-menu draft-menu">';
      html += '<button type="button" class="unobtrusive-icon-button post-menu-trigger draft-menu-trigger" data-draft-action="toggle_menu" data-draft-id="' + draftId + '" aria-label="Draft actions" title="Draft actions">' + overflowMenuIconSvg() + '</button>';
      html += '<div class="post-menu-panel draft-menu-panel" data-draft-menu-panel="' + draftId + '" hidden>';
      html += '<button type="button" data-draft-action="edit" data-draft-id="' + draftId + '">Edit...</button>';
      html += '<button type="button" class="post-delete draft-delete" data-draft-action="delete" data-draft-id="' + draftId + '">' + prioritiesTrashIconSvg() + '<span>Delete...</span></button>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    els.draftsList.innerHTML = html;
  }

  function renderQueue(data) {
    const queue = data.queue || [];
    if (!queue.length) {
      els.queueList.innerHTML = '<div class="queue-rows"><p class="placeholder table-empty">Queue is empty.</p></div>';
      return;
    }
    let html = '<div class="queue-rows">';
    queue.forEach(function (item) {
      const rowClass = (item && item.publish_mode === 'drip') ? ' queue-row queue-row-drip' : ' queue-row queue-row-scheduled';
      html += '<div class="' + rowClass + '">';
      html += '<div class="queue-row-main">';
      html += '<div class="queue-row-title"><button type="button" class="queue-row-open" data-queue-action="edit" data-draft-id="' + escapeAttr(item.draft_id || '') + '">' + escapeHtml(item.title || 'Untitled') + '</button></div>';
      if (item.scheduled_at) {
        html += '<div class="muted">Scheduled: ' + escapeHtml(item.scheduled_at) + '</div>';
      }
      html += '</div>';
      html += '<div class="queue-row-actions">';
      html += '<button type="button" data-queue-action="unqueue" data-draft-id="' + escapeAttr(item.draft_id || '') + '">Unqueue</button>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    els.queueList.innerHTML = html;
  }

  async function loadDrafts() {
    const data = await apiPost('/cgi/blog-list-drafts', {}, true);
    if (!data.success) {
      throw new Error(data.error || 'Failed to load drafts');
    }
    const drafts = Array.isArray(data.drafts) ? data.drafts : [];
    if (els.navDraftsCount) {
      els.navDraftsCount.textContent = '(' + drafts.length + ')';
    }
    renderDraftList(drafts);
  }

  async function loadQueue() {
    const data = await apiPost('/cgi/blog-list-queue', {}, true);
    if (!data.success) {
      throw new Error(data.error || 'Failed to load queue');
    }
    const queue = Array.isArray(data.queue) ? data.queue : [];
    state.queueItemCount = queue.length;
    if (els.navQueueCount) {
      els.navQueueCount.textContent = '(' + queue.length + ')';
    }
    updateQueueLocalDripStatus();
    const dripQueue = queue.filter(function (item) {
      return item && item.publish_mode === 'drip' && item.status === 'queued';
    });
    state.dripQueueItemCount = dripQueue.length;
    syncRunSchedulerButtonUi();
    state.nextDripTitle = dripQueue.length ? String(dripQueue[0].title || 'Untitled') : '';
    state.nextDripExcerpt = dripQueue.length ? String(dripQueue[0].content_excerpt || '').trim() : '';
    let ahead = dripQueue.length;
    if (state.currentDraftId) {
      const currentIdx = dripQueue.findIndex(function (item) {
        return item && item.draft_id === state.currentDraftId;
      });
      if (currentIdx >= 0) {
        ahead = currentIdx;
      }
    }
    const intervalHours = Number(data.drip_interval_hours || 0);
    const intervalMinutes = Math.max(1, Math.round(intervalHours * 60));
    state.dripQueueAhead = ahead;
    state.dripQueueEtaMinutes = ahead * intervalMinutes;
    state.dripQueueInfoReady = true;
    updateDripQueuePill();
    renderQueue(data);
  }

  async function unqueueDraft(draftId) {
    const id = String(draftId || '').trim();
    if (!id) {
      return;
    }
    const data = await apiPost('/cgi/blog-unqueue-draft', { draft_id: id }, true);
    if (!data.success) {
      throw new Error(data.error || 'Failed to unqueue draft');
    }
    await Promise.all([loadDrafts(), loadQueue()]);
    setOutput(els.outputQueue, data.message || 'Draft moved back to drafts.', 'ok');
  }

  function formatPostPublishedAt(isoValue) {
    const raw = String(isoValue || '').trim();
    if (!raw) {
      return 'Unknown date';
    }
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) {
      return raw;
    }
    return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function postActionButton(label, action, postPath, className, extraAttrs) {
    const classes = className ? ' class="' + className + '"' : '';
    const attrs = extraAttrs ? (' ' + extraAttrs) : '';
    return '<button type="button"' + classes + ' data-post-action="' + escapeAttr(action) + '" data-post-path="' + escapeAttr(postPath) + '"' + attrs + '>' + label + '</button>';
  }

  function overflowMenuIconSvg() {
    return '<svg class="overflow-menu-icon-svg" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="5.5" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="18.5" r="1.9" fill="currentColor"/></svg>';
  }

  function dragGripIconSvg() {
    return '<svg class="drag-grip-icon-svg" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
      '<circle cx="5" cy="3.5" r="1.1"/><circle cx="11" cy="3.5" r="1.1"/>' +
      '<circle cx="5" cy="8" r="1.1"/><circle cx="11" cy="8" r="1.1"/>' +
      '<circle cx="5" cy="12.5" r="1.1"/><circle cx="11" cy="12.5" r="1.1"/>' +
      '</svg>';
  }

  function renderPostsList(posts) {
    if (!els.postsList) {
      return;
    }
    if (!posts.length) {
      els.postsList.innerHTML = '<p class="placeholder table-empty">No published posts yet.</p>';
      return;
    }

    let html = '';
    posts.forEach(function (post) {
      const title = String(post.title || 'Untitled');
      const path = String(post.path || '');
      const source = String(post.source || 'local');
      const author = String(post.author || '').trim();
      const sourceLabel = source === 'nostr' ? 'Nostr' : 'Local';
      const sourceClass = source === 'nostr' ? ' is-nostr' : ' is-local';
      const openUrl = String(post.open_url || '');
      const dateLabel = formatPostPublishedAt(post.published_at);

      html += '<div class="post-row">';
      html += '<div class="post-row-main">';
      if (openUrl) {
        html += '<a class="post-row-open post-row-title" title="' + escapeAttr(title) + '" href="' + escapeAttr(openUrl) + '">' + escapeHtml(title) + '</a>';
      } else {
        html += '<span class="post-row-title" title="' + escapeAttr(title) + '">' + escapeHtml(title) + '</span>';
      }
      html += '<span class="post-pill' + sourceClass + '">' + escapeHtml(sourceLabel) + '</span>';
      html += '<span class="post-pill">' + escapeHtml(dateLabel) + '</span>';
      if (author) {
        html += '<span class="post-pill is-author">' + escapeHtml(author) + '</span>';
      }
      html += '</div>';
      html += '<div class="post-row-actions">';
      html += '<button type="button" class="post-row-delete post-delete" data-post-action="delete" data-post-path="' + escapeAttr(path) + '"' +
        (post.can_delete ? ' aria-label="Delete post" title="Delete post"' : ' aria-label="Cannot delete this post" title="Cannot delete this post" disabled') +
        '>' + prioritiesTrashIconSvg() + '</button>';
      html += '<div class="post-menu">';
      html += '<button type="button" class="post-menu-trigger" data-post-action="toggle_menu" data-post-path="' + escapeAttr(path) + '" aria-label="Post actions" title="Post actions">' + overflowMenuIconSvg() + '</button>';
      html += '<div class="post-menu-panel" data-post-menu-panel="' + escapeAttr(path) + '" hidden>';
      if (openUrl) {
        html += postActionButton('Copy link', 'copy_link', path, '', 'data-post-url="' + escapeAttr(openUrl) + '"');
      }
      html += postActionButton('Add to list...', 'add_to_list', path, '');
      html += postActionButton('Edit post...', 'edit_post', path, '');
      if (post.can_hide) {
        html += postActionButton('Hide from site...', 'hide', path, 'post-hide');
      }
      html += '</div>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });
    els.postsList.innerHTML = html;
  }

  async function loadPosts() {
    const data = await apiPost('/cgi/blog-list-posts', {}, true);
    if (!data.success) {
      throw new Error(data.error || 'Failed to load posts');
    }
    const posts = Array.isArray(data.posts) ? data.posts : [];
    if (els.navPostsCount) {
      els.navPostsCount.textContent = '(' + posts.length + ')';
    }
    renderPostsList(posts);
  }

  function renderFilesList(files) {
    if (!els.filesList) {
      return;
    }
    const pending = pendingFileRows();
    if (!files.length && !pending.length) {
      els.filesList.innerHTML = '<p class="placeholder files-list-empty table-empty">No attachments uploaded yet.</p>';
      return;
    }
    let html = '<div class="files-table">';
    html += '<div class="file-table-header" aria-hidden="true">';
    html += '<div class="file-col file-col-name"><span class="file-col-head">Name</span></div>';
    html += '<div class="file-col file-col-size"><span class="file-col-head">Size</span></div>';
    html += '<div class="file-col file-col-type"><span class="file-col-head">Type</span></div>';
    html += '<div class="file-col file-col-date"><span class="file-col-head">Date</span></div>';
    html += '<div class="file-col file-col-visibility"><span class="file-col-head">Visibility</span></div>';
    html += '</div>';
    pending.forEach(function (job) {
      const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
      const status = job.error ? job.error : (job.status || (job.done ? 'Done' : 'Uploading'));
      const mimeType = String(job.mime_type || 'application/octet-stream');
      const rowClass = 'post-row file-row file-row-uploading' + (job.done ? (job.error ? ' is-failed' : ' is-done') : '');
      html += '<div class="' + rowClass + '">';
      html += '<div class="file-col file-col-name">';
      html += '<span class="file-row-title" title="' + escapeAttr(job.name || 'Uploading file') + '">' + escapeHtml(job.name || 'Uploading file') + '</span>';
      html += '</div>';
      html += '<div class="file-col file-col-size">';
      html += '<span class="file-pill">' + escapeHtml(formatBytes(job.size)) + '</span>';
      html += '</div>';
      html += '<div class="file-col file-col-type">';
      html += '<span class="file-pill">' + escapeHtml(mimeType) + '</span>';
      html += '</div>';
      html += '<div class="file-col file-col-date">';
      html += '<span class="file-pill">-</span>';
      html += '</div>';
      html += '<div class="file-col file-col-visibility">';
      html += '<span class="file-pill is-uploading">' + escapeHtml(status) + '</span>';
      if (!job.done) {
        html += '<div class="file-upload-inline">';
        html += '<div class="file-upload-inline-meta">' + escapeHtml(status) + ' · ' + String(progress) + '%</div>';
        html += '<div class="file-upload-inline-bar"><div class="file-upload-inline-fill" style="inline-size:' + String(progress) + '%;"></div></div>';
        html += '</div>';
      }
      html += '<div class="file-row-actions">';
      if (!job.done) {
        html += '<button type="button" disabled aria-label="Upload in progress" title="Upload in progress">Uploading...</button>';
      }
      html += '<button type="button" class="unobtrusive-icon-button" disabled aria-label="Copy file URL" title="File URL available after upload">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M9 9H19V19H9V9Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M5 15H4.8C3.8 15 3 14.2 3 13.2V4.8C3 3.8 3.8 3 4.8 3H13.2C14.2 3 15 3.8 15 4.8V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '</svg></button>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });
    files.forEach(function (file) {
      const fileId = String(file.file_id || '');
      const title = String(file.original_name || file.safe_name || 'Attachment');
      const mimeType = String(file.mime_type || 'application/octet-stream');
      const createdAt = String(file.created_at || '');
      const draftId = String(file.draft_id || '');
      const postPath = String(file.post_path || '');
      const explicitPublic = !!file.explicit_public;
      const effectivePublic = !!file.effective_public;
      const url = String(file.url || '');
      const openFileUrl = fileAccessUrl(url);
      const accessLabel = effectivePublic ? (explicitPublic ? 'Public' : 'Public via post') : 'Private';
      const accessClass = effectivePublic ? ' is-public' : ' is-private';
      html += '<div class="post-row file-row">';
      html += '<div class="file-col file-col-name">';
      if (openFileUrl) {
        html += '<a class="file-row-title file-row-title-link" title="' + escapeAttr(title) + '" href="' + escapeAttr(openFileUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(title) + '</a>';
      } else {
        html += '<span class="file-row-title" title="' + escapeAttr(title) + '">' + escapeHtml(title) + '</span>';
      }
      if (postPath) {
        html += '<span class="file-row-submeta">Post: ' + escapeHtml(postPath) + '</span>';
      } else if (draftId) {
        html += '<span class="file-row-submeta">Draft</span>';
      }
      html += '</div>';
      html += '<div class="file-col file-col-size">';
      html += '<span class="file-pill">' + escapeHtml(formatBytes(file.size_bytes)) + '</span>';
      html += '</div>';
      html += '<div class="file-col file-col-type">';
      html += '<span class="file-pill">' + escapeHtml(mimeType) + '</span>';
      html += '</div>';
      html += '<div class="file-col file-col-date">';
      html += '<span class="file-pill">' + escapeHtml(createdAt ? formatPostPublishedAt(createdAt) : '-') + '</span>';
      html += '</div>';
      html += '<div class="file-col file-col-visibility">';
      html += '<span class="file-pill' + accessClass + '">' + escapeHtml(accessLabel) + '</span>';
      html += '<div class="file-row-actions">';
      html += '<button type="button" data-file-action="toggle-public" data-file-id="' + escapeAttr(fileId) + '" data-make-public="' + escapeAttr(explicitPublic ? 'false' : 'true') + '">' + (explicitPublic ? 'Make Private' : 'Make Public') + '</button>';
      html += '<button type="button" class="unobtrusive-icon-button" data-file-action="copy-url" data-file-url="' + escapeAttr(url) + '"' +
        (effectivePublic ? '' : ' disabled') +
        ' aria-label="Copy file URL" title="' + (effectivePublic ? 'Copy file URL' : 'File is private') + '">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M9 9H19V19H9V9Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M5 15H4.8C3.8 15 3 14.2 3 13.2V4.8C3 3.8 3.8 3 4.8 3H13.2C14.2 3 15 3.8 15 4.8V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '</svg></button>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    els.filesList.innerHTML = html;
  }

  async function loadFiles() {
    const data = await apiPost('/cgi/blog-list-files', {}, true);
    if (!data.success) {
      throw new Error(data.error || 'Failed to load files');
    }
    state.files = Array.isArray(data.files) ? data.files : [];
    state.fileUploads = state.fileUploads.filter(function (job) {
      return !(job && job.kind === 'file' && job.done && !job.error);
    });
    renderFilesList(state.files);
    renderUploadJobs();
  }

  async function setFilePublicState(fileId, makePublic) {
    const data = await apiPost('/cgi/blog-set-file-visibility', {
      file_id: fileId,
      make_public: makePublic ? 'true' : 'false'
    }, true);
    if (!data.success) {
      throw new Error(data.error || 'Failed to update file visibility');
    }
    await loadFiles();
    setOutput(els.outputFiles, makePublic ? 'File is now public.' : 'File is private unless exposed by a public post.', 'ok');
  }

  function normalizeNostrPageSlug(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function pathFromNostrPageSlug(slug, pageType) {
    const safeSlug = normalizeNostrPageSlug(slug);
    if (!safeSlug || safeSlug === 'index') {
      return '/';
    }
    return '/' + safeSlug;
  }

  function normalizeNostrPagePathInput(raw, slug, pageType) {
    return pathFromNostrPageSlug(slug, pageType);
  }

  function slugFromPathInput(raw) {
    let text = String(raw || '').trim();
    if (!text) {
      return '';
    }
    text = text.replace(/^https?:\/\/[^/]+/i, '');
    if (text === '/') {
      return 'index';
    }
    text = text.replace(/^\/+/, '');
    text = text.replace(/^pages\//i, '');
    text = text.replace(/^\/?pages\//i, '');
    text = text.replace(/\/+$/, '');
    text = text.replace(/\.html?$/i, '');
    const slug = normalizeNostrPageSlug(text);
    if (slug === '') {
      return '';
    }
    return slug;
  }

  function defaultNostrPageTitleFromSlug(slug) {
    const text = String(slug || '').replace(/-/g, ' ').trim();
    if (!text) {
      return 'Untitled';
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function nostrPageTypeLabel(pageType) {
    const type = String(pageType || '').trim().toLowerCase();
    if (type === 'blog') {
      return 'Blog Index (kind 30023)';
    }
    if (type === 'icon-gallery') {
      return 'Icon Gallery (kind 30004)';
    }
    if (type === 'public-ranking') {
      return 'Public Ranking (kind 30040)';
    }
    if (type === 'contact') {
      return 'User Metadata (kind 0)';
    }
    if (type === 'nip23') {
      return 'Long-form Content (kind 30023)';
    }
    return 'List Page (kind 30004)';
  }

  function nostrPageTypePillClass(pageType) {
    const type = String(pageType || '').trim().toLowerCase();
    if (type === 'blog') {
      return 'is-type-blog';
    }
    if (type === 'icon-gallery') {
      return 'is-type-icon-gallery';
    }
    if (type === 'public-ranking') {
      return 'is-type-public-ranking';
    }
    if (type === 'contact') {
      return 'is-type-contact';
    }
    if (type === 'nip23') {
      return 'is-type-nip23';
    }
    return 'is-type-list';
  }

  function uniqueSortedNostrPageTags(tags) {
    const seen = {};
    const out = [];
    (Array.isArray(tags) ? tags : []).forEach(function (tag) {
      const text = String(tag || '').trim();
      if (!text || seen[text]) {
        return;
      }
      seen[text] = true;
      out.push(text);
    });
    out.sort(function (a, b) {
      return a.localeCompare(b);
    });
    return out;
  }

  function renderNostrPageDefaultTagOptions(selectedTag) {
    const selected = String(selectedTag || '').trim();
    let tags = uniqueSortedNostrPageTags(state.nostrPagesAvailableTags || []);
    if (selected && tags.indexOf(selected) < 0) {
      tags = [selected].concat(tags);
      tags = uniqueSortedNostrPageTags(tags);
    }
    let html = '<option value="">All posts</option>';
    tags.forEach(function (tag) {
      html += '<option value="' + escapeAttr(tag) + '"' + (tag === selected ? ' selected' : '') + '>' + escapeHtml(tag) + '</option>';
    });
    return html;
  }

  function navbarRowsFromNostrPages(pages) {
    const rows = [];
    (Array.isArray(pages) ? pages : []).forEach(function (page) {
      const showInNav = (typeof page.show_in_nav === 'undefined') ? true : !!page.show_in_nav;
      if (!showInNav) {
        return;
      }
      const slug = normalizeNostrPageSlug(String(page.slug || ''));
      if (!slug) {
        return;
      }
      const title = String(page.placeholder_title || page.title || defaultNostrPageTitleFromSlug(slug) || 'Untitled');
      const path = pathFromNostrPageSlug(slug, page.type);
      rows.push({
        slug: slug,
        title: title,
        path: path
      });
    });
    return rows;
  }

  function dispatchNavbarRefresh(pages, skipFetch) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
      return;
    }
    try {
      if (!skipFetch) {
        window.dispatchEvent(new CustomEvent('wizardry-navbar-refresh-request'));
        return;
      }
      window.dispatchEvent(new CustomEvent('wizardry-navbar-refresh-request', {
        detail: {
          pages: navbarRowsFromNostrPages(pages),
          skipFetch: !!skipFetch
        }
      }));
    } catch (_err) {
      // Ignore navbar refresh event failures.
    }
  }

  function captureNostrPageRects() {
    const map = {};
    if (!els.nostrPagesList) {
      return map;
    }
    const rows = Array.from(els.nostrPagesList.querySelectorAll('.nostr-page-row[data-slug]'));
    rows.forEach(function (row) {
      const slug = row.getAttribute('data-slug');
      if (!slug) {
        return;
      }
      map[slug] = row.getBoundingClientRect();
    });
    return map;
  }

  function animateNostrPagesFlip(previousRects) {
    if (!els.nostrPagesList) {
      return;
    }
    requestAnimationFrame(function () {
      const rows = Array.from(els.nostrPagesList.querySelectorAll('.nostr-page-row[data-slug]'));
      rows.forEach(function (row) {
        const slug = row.getAttribute('data-slug');
        if (!slug || !previousRects[slug]) {
          return;
        }
        const oldRect = previousRects[slug];
        const newRect = row.getBoundingClientRect();
        const dy = oldRect.top - newRect.top;
        if (Math.abs(dy) < 1) {
          return;
        }
        row.style.transition = 'none';
        row.style.transform = 'translateY(' + dy + 'px)';
        requestAnimationFrame(function () {
          row.style.transition = 'transform 220ms ease';
          row.style.transform = 'translateY(0)';
          setTimeout(function () {
            row.style.transition = '';
            row.style.transform = '';
          }, 240);
        });
      });
    });
  }

  function reorderNostrPagesBySlug(dragSlug, targetSlug, placeAfter) {
    if (!dragSlug || !targetSlug || dragSlug === targetSlug) {
      return false;
    }
    const from = state.nostrPages.findIndex(function (page) { return String(page.slug || '') === dragSlug; });
    const to = state.nostrPages.findIndex(function (page) { return String(page.slug || '') === targetSlug; });
    if (from < 0 || to < 0) {
      return false;
    }
    const next = state.nostrPages.slice();
    const item = next[from];
    next.splice(from, 1);
    let insertAt = to;
    if (from < to) {
      insertAt = to - 1;
    }
    if (placeAfter) {
      insertAt += 1;
    }
    if (insertAt < 0) {
      insertAt = 0;
    }
    if (insertAt > next.length) {
      insertAt = next.length;
    }
    next.splice(insertAt, 0, item);
    const beforeSig = state.nostrPages.map(function (page) { return String(page.slug || ''); }).join('|');
    const afterSig = next.map(function (page) { return String(page.slug || ''); }).join('|');
    if (beforeSig === afterSig) {
      return false;
    }
    state.nostrPages = next;
    return true;
  }

  function closeNostrPageMenus() {
    state.nostrPagesMenuOpenFor = '';
    if (!els.nostrPagesList) {
      return;
    }
    Array.from(els.nostrPagesList.querySelectorAll('[data-nostr-page-menu-panel]')).forEach(function (panel) {
      panel.hidden = true;
    });
  }

  function renderNostrPagesList(pages, animate) {
    if (!els.nostrPagesList) {
      return;
    }
    const previousRects = animate ? captureNostrPageRects() : {};
    const list = Array.isArray(pages) ? pages : [];
    if (!list.length) {
      els.nostrPagesList.innerHTML = '<div class="nostr-pages-rows"><p class="placeholder table-empty">No Nostr-backed pages configured yet.</p></div>';
      return;
    }

    let html = '<div class="nostr-pages-rows">';
    html += '<div class="nostr-pages-header" aria-hidden="true">';
    html += '<div class="nostr-pages-header-leading"></div>';
    html += '<div class="nostr-pages-header-name"><span class="nostr-pages-header-type-label">Navbar Link</span></div>';
    html += '<div class="nostr-pages-header-path"><span class="nostr-pages-header-type-label">Path</span></div>';
    html += '<div class="nostr-pages-header-type"><span class="nostr-pages-header-type-label">Type</span></div>';
    html += '<div class="nostr-pages-header-settings"><span class="nostr-pages-header-type-label">Settings</span></div>';
    html += '<div class="nostr-pages-header-nav-col"><span class="nostr-pages-header-nav">Show in Navbar</span></div>';
    html += '<div class="nostr-pages-header-publish-col"><span class="nostr-pages-header-nav">Publish</span></div>';
    html += '<div class="nostr-pages-header-actions"><span class="nostr-pages-header-spacer"></span></div>';
    html += '</div>';
    list.forEach(function (page, idx) {
      const title = String(page.placeholder_title || defaultNostrPageTitleFromSlug(page.slug || '') || 'Untitled');
      const slug = String(page.slug || '');
      const pageType = String(page.type || 'list');
      const path = String(page.path || pathFromNostrPageSlug(slug));
      const isEditingSlug = state.nostrPagesEditingSlugIndex === idx;
      const navTitle = String(page.placeholder_title || defaultNostrPageTitleFromSlug(slug) || 'Untitled');
      const isEditingNavTitle = state.nostrPagesEditingNavTitleIndex === idx;
      const showInNav = !!page.show_in_nav;
      const draftDiffers = !!page.draft_differs;
      const typeLabel = nostrPageTypeLabel(pageType);
      const typePillClass = nostrPageTypePillClass(pageType);
      html += '<div class="nostr-page-row" data-index="' + String(idx) + '" data-slug="' + escapeAttr(slug) + '" draggable="false">';
      html += '<div class="nostr-page-leading">';
      html += '<button type="button" class="unobtrusive-icon-button nostr-page-drag-handle" data-nostr-page-action="drag-handle" data-index="' + String(idx) + '" draggable="true" aria-label="Drag to reorder" title="Drag to reorder">' + dragGripIconSvg() + '</button>';
      html += '</div>';
      html += '<div class="nostr-page-name-col">';
      html += '<div class="nostr-page-title-row"><div class="nostr-page-title"><a href="' + escapeAttr(path) + '">' + escapeHtml(title) + '</a></div>';
      if (isEditingNavTitle) {
        html += '<span class="nostr-page-nav-title-edit-wrap"><input type="text" class="nostr-page-nav-title-input" data-nostr-page-action="edit-nav-title-input" data-index="' + String(idx) + '" value="' + escapeAttr(state.nostrPagesEditingNavTitleValue || navTitle) + '" aria-label="Edit navbar link title"><button type="button" class="nostr-page-nav-title-ok" data-nostr-page-action="save-nav-title" data-index="' + String(idx) + '" aria-label="Apply navbar link title">OK</button></span>';
      } else {
        html += '<a href="#" class="nostr-page-nav-title-edit nostr-page-title-change" data-nostr-page-action="edit-nav-title" data-index="' + String(idx) + '" aria-label="Change navbar link title">Change...</a>';
      }
      html += '</div>';
      html += '</div>';
      html += '<div class="nostr-page-path-col">';
      if (isEditingSlug) {
        html += '<input type="text" class="nostr-page-slug-input" data-nostr-page-action="edit-slug-input" data-index="' + String(idx) + '" value="' + escapeAttr(state.nostrPagesEditingSlugValue || path) + '" aria-label="Edit page slug/path">';
        html += '<button type="button" class="nostr-page-path-ok" data-nostr-page-action="save-slug" data-index="' + String(idx) + '" aria-label="Apply page path">OK</button>';
      } else {
        html += '<span class="nostr-page-path">' + escapeHtml(path) + '</span>';
        html += '<a href="#" class="nostr-page-path-edit" data-nostr-page-action="edit-slug" data-index="' + String(idx) + '" aria-label="Change page path">Change...</a>';
      }
      html += '</div>';
      html += '<div class="nostr-page-type-col">';
      html += '<span class="nostr-page-kind-badge ' + escapeAttr(typePillClass) + '" data-page-type="' + escapeAttr(pageType) + '">' + escapeHtml(typeLabel) + '</span>';
      html += '</div>';
      html += '<div class="nostr-page-settings-col">';
      if (pageType === 'blog') {
        const defaultTag = String(page.default_tag || '').trim();
        html += '<div class="nostr-page-settings-blog-tools">';
        html += '<label class="nostr-page-default-tag"><select data-nostr-page-action="default-tag" data-index="' + String(idx) + '" aria-label="Default blog page tag filter">' + renderNostrPageDefaultTagOptions(defaultTag) + '</select></label>';
        html += '</div>';
      }
      html += '</div>';
      html += '<div class="nostr-page-nav-col">';
      html += '<label class="checkbox-control nostr-page-nav-check nostr-page-nav-check-only" title="Show in navbar"><input type="checkbox" data-nostr-page-action="toggle-nav" data-index="' + String(idx) + '"' + (showInNav ? ' checked' : '') + ' aria-label="Show in navbar"></label>';
      html += '</div>';
      html += '<div class="nostr-page-publish-col">';
      if (draftDiffers) {
        html += '<button type="button" class="nostr-page-publish-btn" data-nostr-page-action="publish" data-index="' + String(idx) + '" aria-label="Publish page to Nostr">Publish...</button>';
      } else {
        html += '<span class="nostr-page-publish-empty" aria-hidden="true"></span>';
      }
      html += '</div>';
      html += '<div class="nostr-page-actions">';
      html += '<div class="post-menu nostr-page-menu">';
      html += '<button type="button" class="unobtrusive-icon-button post-menu-trigger nostr-page-menu-trigger" data-nostr-page-action="toggle_menu" data-index="' + String(idx) + '" aria-label="Page actions" title="Page actions">' + overflowMenuIconSvg() + '</button>';
      html += '<div class="post-menu-panel nostr-page-menu-panel" data-nostr-page-menu-panel="' + String(idx) + '" hidden>';
      html += '<button type="button" class="post-delete" data-nostr-page-action="remove" data-index="' + String(idx) + '" aria-label="Remove page from site" title="Remove from this site (keeps Nostr event)">' + prioritiesTrashIconSvg() + '<span>Delete...</span></button>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    els.nostrPagesList.innerHTML = html;
    if (animate) {
      animateNostrPagesFlip(previousRects);
    }
  }

  function focusNostrPageSlugInput(index) {
    if (!els.nostrPagesList) {
      return;
    }
    window.requestAnimationFrame(function () {
      const input = els.nostrPagesList.querySelector('.nostr-page-slug-input[data-index="' + String(index) + '"]');
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    });
  }

  function beginNostrPageSlugEdit(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.nostrPages.length) {
      return;
    }
    const page = state.nostrPages[index] || {};
    const currentSlug = String(page.slug || '');
    const currentPath = pathFromNostrPageSlug(currentSlug, page.type);
    state.nostrPagesEditingSlugIndex = index;
    state.nostrPagesEditingSlugValue = currentPath;
    state.nostrPagesEditingNavTitleIndex = -1;
    state.nostrPagesEditingNavTitleValue = '';
    renderNostrPagesList(state.nostrPages, false);
    focusNostrPageSlugInput(index);
  }

  function cancelNostrPageSlugEdit() {
    if (state.nostrPagesEditingSlugIndex < 0) {
      return;
    }
    state.nostrPagesEditingSlugIndex = -1;
    state.nostrPagesEditingSlugValue = '';
    renderNostrPagesList(state.nostrPages, false);
  }

  function focusNostrPageNavTitleInput(index) {
    if (!els.nostrPagesList) {
      return;
    }
    window.requestAnimationFrame(function () {
      const input = els.nostrPagesList.querySelector('.nostr-page-nav-title-input[data-index="' + String(index) + '"]');
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    });
  }

  async function publishNostrPageFromList(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.nostrPages.length) {
      return;
    }
    const hasDialog = await ensureNostrPublishDialog();
    if (!hasDialog) {
      throw new Error('Publish dialog unavailable');
    }
    const page = state.nostrPages[index] || {};
    const slug = normalizeNostrPageSlug(page.slug || '');
    if (!slug) {
      throw new Error('Page slug missing');
    }
    const label = String(page.title || page.placeholder_title || slug || 'page').trim();
    const published = await window.blogNostrPublishDialog.open({
      pageSlug: slug,
      pageLabel: label
    });
    if (!published) {
      return;
    }
    setOutput(els.outputNostrPages, 'Published ' + label + ' to Nostr.', 'ok');
    await loadNostrPages();
  }

  function beginNostrPageNavTitleEdit(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.nostrPages.length) {
      return;
    }
    const page = state.nostrPages[index] || {};
    const currentSlug = String(page.slug || '');
    const currentNavTitle = String(page.placeholder_title || defaultNostrPageTitleFromSlug(currentSlug) || 'Untitled');
    state.nostrPagesEditingSlugIndex = -1;
    state.nostrPagesEditingSlugValue = '';
    state.nostrPagesEditingNavTitleIndex = index;
    state.nostrPagesEditingNavTitleValue = currentNavTitle;
    renderNostrPagesList(state.nostrPages, false);
    focusNostrPageNavTitleInput(index);
  }

  function cancelNostrPageNavTitleEdit() {
    if (state.nostrPagesEditingNavTitleIndex < 0) {
      return;
    }
    state.nostrPagesEditingNavTitleIndex = -1;
    state.nostrPagesEditingNavTitleValue = '';
    renderNostrPagesList(state.nostrPages, false);
  }

  async function commitNostrPageNavTitleEdit(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.nostrPages.length) {
      cancelNostrPageNavTitleEdit();
      return;
    }
    const page = state.nostrPages[index] || {};
    const prevSlug = String(page.slug || '');
    const prevNavTitle = String(page.placeholder_title || '').trim();
    let liveValue = state.nostrPagesEditingNavTitleValue;
    if (els.nostrPagesList) {
      const input = els.nostrPagesList.querySelector('.nostr-page-nav-title-input[data-index="' + String(index) + '"]');
      if (input instanceof HTMLInputElement) {
        liveValue = input.value;
        state.nostrPagesEditingNavTitleValue = input.value;
      }
    }
    const nextNavTitle = String(liveValue || '').trim();
    state.nostrPagesEditingNavTitleIndex = -1;
    state.nostrPagesEditingNavTitleValue = '';
    if (nextNavTitle === prevNavTitle) {
      renderNostrPagesList(state.nostrPages, false);
      return;
    }
    const before = state.nostrPages.slice();
    const next = state.nostrPages.slice();
    next[index] = Object.assign({}, next[index], {
      placeholder_title: nextNavTitle
    });
    state.nostrPages = next;
    renderNostrPagesList(state.nostrPages, false);
    dispatchNavbarRefresh(state.nostrPages, true);
    try {
      await saveNostrPagesConfig();
      if (nextNavTitle) {
        setOutput(els.outputNostrPages, 'Updated navbar link title for ' + pathFromNostrPageSlug(prevSlug, page.type) + ' to "' + nextNavTitle + '".', 'ok');
      } else {
        setOutput(els.outputNostrPages, 'Cleared custom navbar link title for ' + pathFromNostrPageSlug(prevSlug, page.type) + '.', 'ok');
      }
    } catch (err) {
      state.nostrPages = before;
      renderNostrPagesList(state.nostrPages, false);
      dispatchNavbarRefresh(state.nostrPages, true);
      setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
    }
  }

  async function commitNostrPageSlugEdit(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.nostrPages.length) {
      cancelNostrPageSlugEdit();
      return;
    }
    const page = state.nostrPages[index] || {};
    const prevSlug = String(page.slug || '');
    const prevPath = pathFromNostrPageSlug(prevSlug, page.type);
    let liveValue = state.nostrPagesEditingSlugValue;
    if (els.nostrPagesList) {
      const input = els.nostrPagesList.querySelector('.nostr-page-slug-input[data-index="' + String(index) + '"]');
      if (input instanceof HTMLInputElement) {
        liveValue = input.value;
        state.nostrPagesEditingSlugValue = input.value;
      }
    }
    const nextSlug = slugFromPathInput(liveValue);
    const nextPath = normalizeNostrPagePathInput(liveValue, nextSlug, page.type);
    if (!nextSlug) {
      setOutput(els.outputNostrPages, 'A valid slug/path is required.', 'warn');
      focusNostrPageSlugInput(index);
      return;
    }
    if (nextSlug !== prevSlug && state.nostrPages.some(function (row, i) {
      return i !== index && String(row.slug || '') === nextSlug;
    })) {
      setOutput(els.outputNostrPages, 'A page with this slug already exists.', 'warn');
      focusNostrPageSlugInput(index);
      return;
    }
    state.nostrPagesEditingSlugIndex = -1;
    state.nostrPagesEditingSlugValue = '';
    if (nextSlug === prevSlug && nextPath === prevPath) {
      renderNostrPagesList(state.nostrPages, false);
      return;
    }
    const before = state.nostrPages.slice();
    const next = state.nostrPages.slice();
    next[index] = Object.assign({}, next[index], {
      slug: nextSlug,
      path: nextPath
    });
    state.nostrPages = next;
    renderNostrPagesList(state.nostrPages, false);
    renderModerationPageFilterOptions();
    dispatchNavbarRefresh(state.nostrPages, true);
    try {
      await saveNostrPagesConfig();
      setOutput(els.outputNostrPages, 'Updated page path to ' + pathFromNostrPageSlug(nextSlug, page.type) + '.', 'ok');
    } catch (err) {
      state.nostrPages = before;
      renderNostrPagesList(state.nostrPages, false);
      renderModerationPageFilterOptions();
      dispatchNavbarRefresh(state.nostrPages, true);
      setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
    }
  }

  async function loadNostrPages() {
    if (!state.isAdmin) {
      return;
    }
    const data = await apiPost('/cgi/blog-list-nostr-pages', {}, true);
    if (!data.success) {
      throw new Error(data.error || 'Failed to load Nostr pages');
    }
    state.nostrPagesAvailableTags = Array.isArray(data.available_tags) ? data.available_tags.slice() : [];
    state.nostrPages = Array.isArray(data.pages) ? data.pages.slice() : [];
    renderNostrPagesList(state.nostrPages, false);
    renderModerationPageFilterOptions();
  }

  async function saveNostrPagesConfig() {
    if (state.nostrPagesSaveBusy) {
      state.nostrPagesSaveQueued = true;
      return;
    }
    state.nostrPagesSaveBusy = true;
    try {
      const connectedPostsBySlug = {};
      (state.nostrPages || []).forEach(function (page) {
        const slug = String(page && page.slug || '');
        if (!slug) {
          return;
        }
        const count = Number(page.connected_posts || 0);
        if (isFinite(count)) {
          connectedPostsBySlug[slug] = count;
        }
      });
      const data = await apiPost('/cgi/blog-save-nostr-pages', {
        pages_json: JSON.stringify(state.nostrPages || [])
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to save Nostr pages');
      }
      state.nostrPages = (Array.isArray(data.pages) ? data.pages.slice() : []).map(function (page) {
        const row = Object.assign({}, page || {});
        const slug = String(row.slug || '');
        if (typeof row.connected_posts === 'undefined' && Object.prototype.hasOwnProperty.call(connectedPostsBySlug, slug)) {
          row.connected_posts = connectedPostsBySlug[slug];
        }
        return row;
      });
      renderNostrPagesList(state.nostrPages, false);
      renderModerationPageFilterOptions();
      dispatchNavbarRefresh(state.nostrPages, true);
      setOutput(els.outputNostrPages, data.message || 'Nostr page settings saved.', 'ok');
    } finally {
      state.nostrPagesSaveBusy = false;
      if (state.nostrPagesSaveQueued) {
        state.nostrPagesSaveQueued = false;
        return saveNostrPagesConfig();
      }
    }
  }

  function createNostrPageFromInput(pickedType, rawSlug) {
    const normalizedType = (pickedType === 'profile' || pickedType === 'metadata')
      ? 'contact'
      : ((pickedType === 'long-form')
        ? 'nip23'
        : ((pickedType === 'blog-index' || pickedType === 'blog_page')
          ? 'blog'
          : ((pickedType === 'public_ranking' || pickedType === 'ranking') ? 'public-ranking' : pickedType)));
    if (normalizedType !== 'list' && normalizedType !== 'contact' && normalizedType !== 'nip23' && normalizedType !== 'blog' && normalizedType !== 'public-ranking') {
      setOutput(els.outputNostrPages, 'Invalid page type. Use blog, list, public-ranking, metadata, or long-form.', 'warn');
      return false;
    }
    if (normalizedType === 'contact' && state.nostrPages.some(function (page) { return String(page.type || '') === 'contact'; })) {
      setOutput(els.outputNostrPages, 'Only one profile page is supported.', 'warn');
      return false;
    }
    const slug = normalizeNostrPageSlug(rawSlug);
    if (!slug) {
      setOutput(els.outputNostrPages, 'A valid slug is required.', 'warn');
      return false;
    }
    if (state.nostrPages.some(function (page) { return String(page.slug || '') === slug; })) {
      setOutput(els.outputNostrPages, 'A page with this slug already exists.', 'warn');
      return false;
    }
    const next = state.nostrPages.slice();
    next.push({
      slug: slug,
      type: normalizedType,
      kind: (normalizedType === 'contact' ? 0 : (normalizedType === 'public-ranking' ? 30040 : ((normalizedType === 'nip23' || normalizedType === 'blog') ? 30023 : 30004))),
      show_in_nav: true,
      placeholder_title: defaultNostrPageTitleFromSlug(slug),
      path: pathFromNostrPageSlug(slug, normalizedType)
    });
    state.nostrPages = next;
    saveNostrPagesConfig().catch(function (err) {
      setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
    });
    return true;
  }

  function syncNostrPageCreateDefaults() {
    if (!els.nostrPageTypeSelect) {
      return;
    }
    const hasContactPage = state.nostrPages.some(function (page) {
      return String(page.type || '') === 'contact';
    });
    Array.from(els.nostrPageTypeSelect.options || []).forEach(function (opt) {
      if (String(opt.value || '') === 'contact') {
        opt.disabled = hasContactPage;
      }
    });
    const currentType = String(els.nostrPageTypeSelect.value || '').trim().toLowerCase();
    if ((currentType === 'contact' && hasContactPage) || !currentType) {
      els.nostrPageTypeSelect.value = hasContactPage ? 'list' : 'contact';
    }
    if (els.nostrPageSlugInput && String(els.nostrPageSlugInput.dataset.autoSuggest || '1') === '1') {
      if (els.nostrPageTypeSelect.value === 'blog') {
        els.nostrPageSlugInput.value = 'blog';
      } else if (els.nostrPageTypeSelect.value === 'public-ranking') {
        els.nostrPageSlugInput.value = 'ranking';
      } else if (els.nostrPageTypeSelect.value === 'contact') {
        els.nostrPageSlugInput.value = 'profile';
      } else if (els.nostrPageTypeSelect.value === 'nip23') {
        els.nostrPageSlugInput.value = '';
      } else {
        els.nostrPageSlugInput.value = '';
      }
    }
  }

  function promptCreateNostrPage() {
    if (!(els.nostrPageCreateDialog instanceof HTMLDialogElement)) {
      const pickedTypeRaw = window.prompt('Page type: blog, list, public-ranking, metadata, or long-form', 'blog');
      if (pickedTypeRaw === null) {
        return;
      }
      const fallbackType = String(pickedTypeRaw || '').trim().toLowerCase();
      const fallbackSlug = window.prompt('Page slug/path (example: essay)', (fallbackType === 'blog' || fallbackType === 'blog-index') ? 'blog' : ((fallbackType === 'public-ranking' || fallbackType === 'public_ranking' || fallbackType === 'ranking') ? 'ranking' : ((fallbackType === 'contact' || fallbackType === 'profile' || fallbackType === 'metadata') ? 'profile' : '')));
      if (fallbackSlug === null) {
        return;
      }
      createNostrPageFromInput(fallbackType, fallbackSlug);
      return;
    }
    if (els.nostrPageSlugInput) {
      els.nostrPageSlugInput.dataset.autoSuggest = '1';
    }
    syncNostrPageCreateDefaults();
    els.nostrPageCreateDialog.showModal();
    if (els.nostrPageTypeSelect) {
      els.nostrPageTypeSelect.focus();
    }
  }

  function stopPostsPolling() {
    if (state.postsPollTimer) {
      clearInterval(state.postsPollTimer);
      state.postsPollTimer = null;
    }
  }

  function syncPostsAutoRefresh() {
    const postsVisible = state.isAdmin && state.activeSection === 'posts';
    if (!postsVisible) {
      stopPostsPolling();
      return;
    }
    loadPosts().catch(function (err) {
      setOutput(els.outputPosts, 'Error: ' + err.message, 'error');
    });
    if (state.postsPollTimer) {
      return;
    }
    state.postsPollTimer = setInterval(function () {
      if (!(state.isAdmin && state.activeSection === 'posts')) {
        stopPostsPolling();
        return;
      }
      if (state.postsActionInFlight || state.postsMenuOpenFor) {
        return;
      }
      loadPosts().catch(function () {});
    }, 7000);
  }

  function normalizeModerationAgeFilter(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === '24h' || value === '7d' || value === '30d' || value === 'older') {
      return value;
    }
    return '30d';
  }

  function syncModerationAgeFilterUi() {
    const selected = normalizeModerationAgeFilter(state.moderationAgeFilter);
    state.moderationAgeFilter = selected;
    (Array.isArray(els.moderationAgeOptions) ? els.moderationAgeOptions : []).forEach(function (button) {
      const age = normalizeModerationAgeFilter(button && button.getAttribute ? button.getAttribute('data-moderation-age') : '');
      const active = age === selected;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setModerationAgeFilter(nextAge) {
    const normalized = normalizeModerationAgeFilter(nextAge);
    if (normalized === state.moderationAgeFilter) {
      return;
    }
    state.moderationAgeFilter = normalized;
    syncModerationAgeFilterUi();
    if (state.isAdmin && state.activeSection === 'moderation') {
      loadModeration().catch(function (err) {
        setOutput(els.outputModeration, 'Error: ' + err.message, 'error');
      });
    }
  }

  function renderModerationPageFilterOptions() {
    syncModerationAgeFilterUi();
  }

  function renderModerationList(items) {
    if (!els.moderationList) {
      return;
    }
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      els.moderationList.innerHTML = '<div class=\"post-row moderation-empty-row\"><p class=\"placeholder table-empty\">No pending moderation actions.</p></div>';
      return;
    }
    let html = '';
    list.forEach(function (item) {
      const nodeCoord = String(item && item.coordinate || '');
      const pageSlug = normalizeNostrPageSlug(item && item.page_slug);
      const pagePath = String(item && item.page_path || (pageSlug === 'index' ? '/' : ('/' + pageSlug)));
      const title = String(item && item.title || nodeCoord || 'Untitled');
      const summary = String(item && item.summary || '');
      const content = String(item && item.content || '');
      const itemType = String(item && item.item_type || 'entry');
      const ageSeconds = Number(item && item.age_seconds || 0);
      const ageHours = Math.max(0, Math.floor(ageSeconds / 3600));
      html += '<div class=\"post-row\" data-moderation-node=\"' + escapeAttr(nodeCoord) + '\" data-moderation-page=\"' + escapeAttr(pageSlug) + '\">';
      html += '<div class=\"post-row-main\">';
      html += '<div class=\"post-row-title\">' + escapeHtml(title) + '</div>';
      if (summary) {
        html += '<div class=\"post-row-summary\">' + escapeHtml(summary) + '</div>';
      }
      html += '<div class=\"moderation-item-meta\">Type: <strong>' + escapeHtml(itemType) + '</strong> • Age: <strong>' + escapeHtml(String(ageHours)) + 'h</strong></div>';
      html += '<div class=\"moderation-item-path\"><a href=\"' + escapeAttr(pagePath) + '\" target=\"_blank\" rel=\"noopener noreferrer\">Open page</a></div>';
      html += '<details class=\"post-menu-panel\" open>';
      html += '<summary>Edit pending entry</summary>';
      html += '<label><span>Title</span><input type=\"text\" data-moderation-field=\"title\" value=\"' + escapeAttr(title) + '\"></label>';
      html += '<label><span>Summary</span><input type=\"text\" data-moderation-field=\"summary\" value=\"' + escapeAttr(summary) + '\"></label>';
      html += '<label><span>Content</span><textarea rows=\"3\" data-moderation-field=\"content\">' + escapeHtml(content) + '</textarea></label>';
      html += '</details>';
      html += '</div>';
      html += '<div class=\"post-row-actions\">';
      html += '<button type=\"button\" data-moderation-action=\"approve\" data-node-coord=\"' + escapeAttr(nodeCoord) + '\" data-page-slug=\"' + escapeAttr(pageSlug) + '\">Approve</button>';
      html += '<button type=\"button\" data-moderation-action=\"reject\" data-node-coord=\"' + escapeAttr(nodeCoord) + '\" data-page-slug=\"' + escapeAttr(pageSlug) + '\" class=\"post-hide\">Reject</button>';
      html += '<button type=\"button\" data-moderation-action=\"edit\" data-node-coord=\"' + escapeAttr(nodeCoord) + '\" data-page-slug=\"' + escapeAttr(pageSlug) + '\">Save Edit</button>';
      html += '</div>';
      html += '</div>';
    });
    els.moderationList.innerHTML = html;
  }

  async function loadModeration() {
    if (!state.isAdmin) {
      return;
    }
    const filterAge = normalizeModerationAgeFilter(state.moderationAgeFilter);
    state.moderationAgeFilter = filterAge;
    syncModerationAgeFilterUi();
    const data = await apiPost('/cgi/blog-list-public-ranking-moderation', {
      age: filterAge
    }, true);
    if (!data.success) {
      throw new Error(data.error || 'Failed to load moderation items');
    }
    state.moderationItems = Array.isArray(data.items) ? data.items : [];
    renderModerationList(state.moderationItems);
  }

  async function runModerationAction(action, nodeCoord, pageSlug, row) {
    if (state.moderationActionInFlight) {
      return;
    }
    const pickedAction = String(action || '').trim();
    const coord = String(nodeCoord || '').trim();
    const slug = normalizeNostrPageSlug(pageSlug);
    if (!pickedAction || !coord || !slug) {
      return;
    }
    state.moderationActionInFlight = true;
    try {
      const titleField = row ? row.querySelector('[data-moderation-field=\"title\"]') : null;
      const summaryField = row ? row.querySelector('[data-moderation-field=\"summary\"]') : null;
      const contentField = row ? row.querySelector('[data-moderation-field=\"content\"]') : null;
      const data = await apiPost('/cgi/blog-moderate-public-ranking-node', {
        page_slug: slug,
        action: pickedAction,
        node_coord: coord,
        title: titleField instanceof HTMLInputElement ? String(titleField.value || '') : '',
        summary: summaryField instanceof HTMLInputElement ? String(summaryField.value || '') : '',
        content: contentField instanceof HTMLTextAreaElement ? String(contentField.value || '') : ''
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Moderation action failed');
      }
      await loadModeration();
      setOutput(els.outputModeration, data.message || 'Moderation action completed.', 'ok');
    } finally {
      state.moderationActionInFlight = false;
    }
  }

  function stopModerationPolling() {
    if (state.moderationPollTimer) {
      clearInterval(state.moderationPollTimer);
      state.moderationPollTimer = null;
    }
  }

  function syncModerationAutoRefresh() {
    const visible = state.isAdmin && state.activeSection === 'moderation';
    if (!visible) {
      stopModerationPolling();
      return;
    }
    loadModeration().catch(function (err) {
      setOutput(els.outputModeration, 'Error: ' + err.message, 'error');
    });
    if (state.moderationPollTimer) {
      return;
    }
    state.moderationPollTimer = setInterval(function () {
      if (!(state.isAdmin && state.activeSection === 'moderation')) {
        stopModerationPolling();
        return;
      }
      if (state.moderationActionInFlight) {
        return;
      }
      loadModeration().catch(function () {});
    }, 7000);
  }

  async function runPostAction(action, postPath, postUrl) {
    const pickedAction = String(action || '').trim();
    const path = String(postPath || '').trim();
    const url = String(postUrl || '').trim();
    if (!pickedAction || !path) {
      return;
    }
    if (pickedAction === 'open') {
      if (url) {
        window.open(url, '_blank', 'noopener');
      }
      return;
    }
    if (pickedAction === 'copy_link') {
      if (!url) {
        return;
      }
      const absoluteUrl = new URL(url, window.location.origin).toString();
      const copied = await copyTextToClipboard(absoluteUrl);
      state.postsMenuOpenFor = '';
      if (els.postsList) {
        Array.from(els.postsList.querySelectorAll('[data-post-menu-panel]')).forEach(function (panel) {
          panel.hidden = true;
        });
      }
      setOutput(
        els.outputPosts,
        copied ? ('Copied "' + absoluteUrl + '" to clipboard.') : 'Could not copy post link.',
        copied ? 'ok' : 'warn'
      );
      return;
    }
    if (pickedAction === 'edit_post') {
      if (state.postsActionInFlight) {
        return;
      }
      state.postsActionInFlight = true;
      try {
        const data = await apiPost('/cgi/blog-create-draft-from-post', {
          post_path: path
        }, true);
        if (!data.success || !data.draft_id) {
          throw new Error(data.error || 'Could not create draft from post');
        }
        state.postsMenuOpenFor = '';
        await loadDraft(data.draft_id);
        setOutput(els.outputCompose, data.message || 'Draft created from post.', 'ok');
      } finally {
        state.postsActionInFlight = false;
      }
      return;
    }
    if (pickedAction === 'add_to_list') {
      await openAddToListDialog(path);
      return;
    }

    if (state.postsActionInFlight) {
      return;
    }
    if (pickedAction === 'delete') {
      if (!window.confirm('Delete this published post from this site? This cannot be undone.')) {
        return;
      }
    }
    if (pickedAction === 'hide') {
      if (!window.confirm('Hide this Nostr-projected post from this site?')) {
        return;
      }
    }

    state.postsActionInFlight = true;
    try {
      const data = await apiPost('/cgi/blog-manage-post', {
        action: pickedAction,
        post_path: path
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Post action failed');
      }
      state.postsMenuOpenFor = '';
      await loadPosts();
      setOutput(els.outputPosts, data.message || 'Post updated.', 'ok');
    } finally {
      state.postsActionInFlight = false;
    }
  }

  function syncAddToListNewRowVisibility() {
    if (!els.postAddToListSelect || !els.postAddToListNewRow) {
      return;
    }
    const selected = String(els.postAddToListSelect.value || '').trim();
    const useNew = selected === '__new__';
    els.postAddToListNewRow.hidden = !useNew;
    if (useNew && els.postAddToListNewSlug) {
      els.postAddToListNewSlug.focus();
      els.postAddToListNewSlug.select();
    }
  }

  async function submitAddPostToList(postPath, slug, dateText, markdownText) {
    state.postsActionInFlight = true;
    try {
      const addData = await apiPost('/cgi/blog-add-post-to-list', {
        list_slug: slug,
        post_path: postPath,
        date: dateText,
        markdown: markdownText,
        marker: 'list'
      }, true);
      if (!addData.success) {
        throw new Error(addData.error || 'Could not add post to list');
      }
      state.postsMenuOpenFor = '';
      setOutput(els.outputPosts, addData.message || ('Added to ' + slug + ' draft.'), 'ok');
    } finally {
      state.postsActionInFlight = false;
    }
  }

  async function openAddToListDialog(postPath) {
    const path = String(postPath || '').trim();
    if (!path) {
      return;
    }
    if (!(els.postAddToListDialog instanceof HTMLDialogElement) ||
        !els.postAddToListSelect ||
        !els.postAddToListDate ||
        !els.postAddToListMarkdown) {
      const fallback = window.prompt('List slug:', 'oeuvre');
      if (fallback === null) {
        return;
      }
      const fallbackSlug = normalizeNostrPageSlug(fallback);
      if (!fallbackSlug) {
        setOutput(els.outputPosts, 'List slug is required.', 'warn');
        return;
      }
      await submitAddPostToList(path, fallbackSlug, '', '');
      return;
    }

    const listsData = await apiPost('/cgi/blog-list-pages', {}, true);
    if (!listsData.success) {
      throw new Error(listsData.error || 'Could not load lists');
    }
    const lists = Array.isArray(listsData.lists) ? listsData.lists : [];
    const options = lists
      .map(function (item) {
        return {
          slug: normalizeNostrPageSlug(item && item.slug),
          title: String((item && item.title) || '').trim()
        };
      })
      .filter(function (item) { return !!item.slug; });

    let html = '';
    options.forEach(function (item) {
      html += '<option value="' + escapeAttr(item.slug) + '">' + escapeHtml(item.title || item.slug) + '</option>';
    });
    html += '<option value="__new__">New list...</option>';
    els.postAddToListSelect.innerHTML = html;
    els.postAddToListSelect.value = options.length ? options[0].slug : '__new__';
    state.pendingAddToListPostPath = path;
    els.postAddToListDate.value = '';
    els.postAddToListMarkdown.value = '';
    if (els.postAddToListNewSlug) {
      els.postAddToListNewSlug.value = '';
    }
    syncAddToListNewRowVisibility();
    els.postAddToListDialog.showModal();
    if (els.postAddToListSelect.value === '__new__' && els.postAddToListNewSlug) {
      els.postAddToListNewSlug.focus();
    } else {
      els.postAddToListSelect.focus();
    }
  }

  function userCardActionButton(label, action, username, className, extraAttrs) {
    const classes = className ? ' class="' + className + '"' : '';
    const attrs = extraAttrs ? (' ' + extraAttrs) : '';
    return '<button type="button"' + classes + attrs + ' data-user-action="' + escapeAttr(action) + '" data-username="' + escapeAttr(username) + '">' + label + '</button>';
  }

  function prioritiesTrashIconSvg() {
    return '<svg class="trash-icon-svg" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>';
  }

  function userDropZone(afterUsername) {
    return '<div class="user-drop-zone" data-user-drop-after="' + escapeAttr(afterUsername) + '" aria-hidden="true"></div>';
  }

  function captureUserCardRects() {
    const map = {};
    if (!els.usersList) {
      return map;
    }
    const cards = Array.from(els.usersList.querySelectorAll('.user-card[data-username]'));
    cards.forEach(function (card) {
      const username = card.getAttribute('data-username');
      if (!username) {
        return;
      }
      map[username] = card.getBoundingClientRect();
    });
    return map;
  }

  function animateUsersFlip(previousRects) {
    if (!els.usersList) {
      return;
    }
    requestAnimationFrame(function () {
      const cards = Array.from(els.usersList.querySelectorAll('.user-card[data-username]'));
      cards.forEach(function (card) {
        const username = card.getAttribute('data-username');
        if (!username || !previousRects[username]) {
          return;
        }
        const oldRect = previousRects[username];
        const newRect = card.getBoundingClientRect();
        const dy = oldRect.top - newRect.top;
        if (Math.abs(dy) < 1) {
          return;
        }
        card.style.transition = 'none';
        card.style.transform = 'translateY(' + dy + 'px)';
        requestAnimationFrame(function () {
          card.style.transition = 'transform 240ms ease';
          card.style.transform = 'translateY(0)';
          setTimeout(function () {
            card.style.transition = '';
            card.style.transform = '';
          }, 260);
        });
      });
    });
  }

  function normalizeUsersSortColumn(raw) {
    const col = String(raw || '').trim().toLowerCase();
    if (col === 'name' || col === 'created' || col === 'role') {
      return col;
    }
    return '';
  }

  function usersSortDefaultDirection(column) {
    if (column === 'created') {
      return 'desc';
    }
    if (column === 'role') {
      return 'desc';
    }
    return 'asc';
  }

  function usersSortNextDirection(column) {
    const col = normalizeUsersSortColumn(column);
    if (!col) {
      return '';
    }
    if (state.usersSortColumn !== col) {
      return usersSortDefaultDirection(col);
    }
    return state.usersSortDirection === 'asc' ? 'desc' : 'asc';
  }

  function userRoleSortRank(user) {
    if (!user || typeof user !== 'object') {
      return 0;
    }
    if (user.is_admin) {
      return 3;
    }
    if (user.is_author) {
      return 2;
    }
    return 1;
  }

  function userSortCreatedEpoch(user) {
    const raw = String(user && user.created_at || '').trim();
    if (!raw) {
      return 0;
    }
    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.floor(parsed / 1000);
  }

  function sortUsersForDisplay(users) {
    const col = normalizeUsersSortColumn(state.usersSortColumn);
    const dir = state.usersSortDirection === 'desc' ? -1 : 1;
    const list = Array.isArray(users) ? users.slice() : [];
    if (!col) {
      return list;
    }
    list.sort(function (a, b) {
      let cmp = 0;
      if (col === 'name') {
        const aName = String((a && (a.player_name || a.username)) || '').toLowerCase();
        const bName = String((b && (b.player_name || b.username)) || '').toLowerCase();
        cmp = aName.localeCompare(bName);
      } else if (col === 'created') {
        cmp = userSortCreatedEpoch(a) - userSortCreatedEpoch(b);
      } else if (col === 'role') {
        cmp = userRoleSortRank(a) - userRoleSortRank(b);
      }
      if (cmp === 0) {
        const aUser = String(a && a.username || '').toLowerCase();
        const bUser = String(b && b.username || '').toLowerCase();
        cmp = aUser.localeCompare(bUser);
      }
      return cmp * dir;
    });
    return list;
  }

  function renderUsersList(animate) {
    if (!els.usersList) {
      return;
    }
    const previousRects = animate ? captureUserCardRects() : {};
    if (!state.users.length) {
      els.usersList.innerHTML = '<p class="placeholder table-empty">No users found yet.</p>';
      return;
    }
    let html = '';
    const displayedUsers = sortUsersForDisplay(state.users);
    const sortColumn = normalizeUsersSortColumn(state.usersSortColumn);
    const sortDirection = state.usersSortDirection === 'desc' ? 'desc' : 'asc';
    const sortArrow = function (col) {
      if (sortColumn !== col) {
        return '';
      }
      return sortDirection === 'desc' ? ' ↓' : ' ↑';
    };
    html += '<div class="users-table-header">';
    html += '<div class="users-col users-col-name"><button type="button" class="users-col-sort" data-users-sort="name" aria-sort="' + (sortColumn === 'name' ? sortDirection : 'none') + '">Name' + sortArrow('name') + '</button></div>';
    html += '<div class="users-col users-col-created"><button type="button" class="users-col-sort" data-users-sort="created" aria-sort="' + (sortColumn === 'created' ? sortDirection : 'none') + '">Created' + sortArrow('created') + '</button></div>';
    html += '<div class="users-col users-col-role"><button type="button" class="users-col-sort" data-users-sort="role" aria-sort="' + (sortColumn === 'role' ? sortDirection : 'none') + '">Role' + sortArrow('role') + '</button></div>';
    html += '<div class="users-col users-col-actions"><span class="users-col-head" aria-hidden="true"></span></div>';
    html += '</div>';
    const actorName = state.username || '';
    const actorRank = Number(state.actorRank || 0);
    let seenBelow = false;
    displayedUsers.forEach(function (user, idx) {
      const username = String(user.username || '');
      const rank = Number(user.rank || 0);
      const isSelf = !!user.is_self || username === actorName;
      const isAdmin = !!user.is_admin;
      const createdAtRaw = String(user.created_at || '');
      const createdLabel = createdAtRaw ? formatPostPublishedAt(createdAtRaw) : '-';
      const isBelow = actorRank > 0 && rank > actorRank;
      const canDrag = !sortColumn && !isSelf && isBelow;
      const dragAttrs = canDrag ? ' draggable="true" data-can-drag="true"' : ' data-can-drag="false"';
      if (!seenBelow && isBelow) {
        html += userDropZone(actorName);
        seenBelow = true;
      }

      html += '<div class="user-card' + (canDrag ? ' is-draggable' : '') + ((idx % 2) === 1 ? ' user-row-alt' : '') + '"' + dragAttrs + ' data-username="' + escapeAttr(username) + '" data-rank="' + escapeAttr(String(rank)) + '">';
      html += '<div class="user-card-main users-col users-col-name">';
      html += '<div class="user-card-name">' + escapeHtml(user.player_name || username);
      if (isSelf) {
        html += ' <strong class="user-self-label">You</strong>';
      }
      html += '</div>';
      html += '</div>';
      html += '<div class="user-card-created users-col users-col-created"><span class="user-card-meta">' + escapeHtml(createdLabel) + '</span></div>';
      html += '<div class="user-card-role users-col users-col-role">';
      if (isAdmin) {
        html += '<span class="user-pill is-admin">Admin</span>';
      }
      if (user.is_author) {
        html += '<span class="user-pill is-author">Author</span>';
      }
      if (!isAdmin && !user.is_author) {
        html += '<span class="user-pill">Member</span>';
      }
      html += '</div>';
      html += '<div class="user-card-actions users-col users-col-actions">';
      if (!isSelf && (isBelow || !isAdmin)) {
        html += '<div class="user-menu">';
        html += userCardActionButton(
          overflowMenuIconSvg(),
          'toggle_menu',
          username,
          'unobtrusive-icon-button user-menu-trigger',
          'aria-label="User actions" title="User actions"'
        );
        html += '<div class="user-menu-panel" data-user-menu-panel="' + escapeAttr(username) + '" hidden>';
        if (state.nostrBridgeEnabled && user.nostr_pubkey) {
          if (user.is_author) {
            html += userCardActionButton('Revoke Author', 'remove_author', username, 'user-author-action');
          } else {
            html += userCardActionButton('Grant Author', 'grant_author', username, 'user-author-action');
          }
        }
        if (!isAdmin) {
          html += userCardActionButton('Grant Admin', 'grant_admin', username, '');
        }
        if (isAdmin && isBelow) {
          html += userCardActionButton('Remove Admin', 'remove_admin', username, '');
        }
        if (isBelow) {
          html += userCardActionButton('Promote Above...', 'promote_above', username, '');
        }
        if (state.nostrBridgeEnabled && user.nostr_pubkey) {
          if (user.is_blocked) {
            html += userCardActionButton('Unblock Account', 'unblock_account', username, 'user-block-action');
          } else {
            html += userCardActionButton('Block Account...', 'block_account', username, 'user-block-action');
          }
        }
        html += userCardActionButton(prioritiesTrashIconSvg() + '<span>Delete account...</span>', 'delete', username, 'user-delete');
        html += '</div>';
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
      if (isBelow) {
        html += userDropZone(username);
      }
    });
    els.usersList.innerHTML = html;
    if (animate) {
      animateUsersFlip(previousRects);
    }
  }

  async function loadUsers(animate) {
    const data = await apiPost('/cgi/blog-list-users', {}, true);
    if (!data.success) {
      throw new Error(data.error || 'Failed to load users');
    }
    state.users = Array.isArray(data.users) ? data.users : [];
    state.actorRank = Number(data.actor_rank || 0);
    renderUsersList(!!animate);
  }

  function stopUsersPolling() {
    if (state.usersPollTimer) {
      clearInterval(state.usersPollTimer);
      state.usersPollTimer = null;
    }
  }

  function syncUsersAutoRefresh() {
    const usersVisible = state.isAdmin && state.activeSection === 'users';
    if (!usersVisible) {
      stopUsersPolling();
      return;
    }

    loadUsers(false).catch(function (err) {
      setOutput(els.outputUsers, 'Error: ' + err.message, 'error');
    });

    if (state.usersPollTimer) {
      return;
    }
    state.usersPollTimer = setInterval(function () {
      if (!(state.isAdmin && state.activeSection === 'users')) {
        stopUsersPolling();
        return;
      }
      if (state.userDragActive || state.usersActionInFlight || state.usersMenuOpenFor) {
        return;
      }
      loadUsers(false).catch(function () {
        // Keep polling silently; avoid noisy toasts for transient failures.
      });
    }, 6000);
  }

  async function runUserAction(action, username) {
    if (state.usersActionInFlight) {
      return;
    }
    const user = state.users.find(function (item) { return item.username === username; });
    if (!user) {
      throw new Error('User not found');
    }
    if (action === 'promote_above') {
      const warning = user.is_admin
        ? 'Promote this admin above you? They will have power over you and you will not be able to remove their admin access.'
        : 'Promote this user above you in the list?';
      if (!window.confirm(warning)) {
        return;
      }
    }
    if (action === 'delete') {
      if (!window.confirm('Delete this user account? This cannot be undone.')) {
        return;
      }
    }
    let deleteAccountWithBlock = false;
    if (action === 'block_account') {
      if (!window.confirm('Block this account for Nostr bridge content?')) {
        return;
      }
      deleteAccountWithBlock = window.confirm('Also delete this local account now?');
    }
    state.usersActionInFlight = true;
    try {
      const data = await apiPost('/cgi/blog-manage-user', {
        action: action,
        username: username,
        delete_account: deleteAccountWithBlock ? 'true' : 'false'
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'User action failed');
      }
      state.usersMenuOpenFor = '';
      await loadUsers(false);
      setOutput(els.outputUsers, data.message || 'User updated.', 'ok');
    } finally {
      state.usersActionInFlight = false;
    }
  }

  async function runUserMoveAfter(username, afterUsername) {
    if (state.usersActionInFlight) {
      return;
    }
    state.usersActionInFlight = true;
    try {
      const data = await apiPost('/cgi/blog-manage-user', {
        action: 'move_after',
        username: username,
        after_username: afterUsername
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Reorder failed');
      }
      state.usersMenuOpenFor = '';
      await loadUsers(true);
    } finally {
      state.usersActionInFlight = false;
    }
  }

  async function loadDraft(draftId) {
    const data = await apiPost('/cgi/blog-get-draft', { draft_id: draftId }, true);
    if (!data.success || !data.draft) {
      throw new Error(data.error || 'Failed to load draft');
    }
    populateComposer(data.draft);
    activateSection('compose', true);
    setOutput(els.outputCompose, 'Draft loaded.', 'ok');
  }

  async function deleteDraft(draftId) {
    const confirmed = window.confirm('Delete this draft? This cannot be undone.');
    if (!confirmed) {
      return;
    }
    const data = await apiPost('/cgi/blog-delete-draft', { draft_id: draftId }, true);
    if (!data.success) {
      throw new Error(data.error || 'Failed to delete draft');
    }
    if (state.currentDraftId === draftId) {
      resetComposer();
    }
    await Promise.all([loadDrafts(), loadQueue()]);
    setOutput(els.outputCompose, 'Draft deleted.', 'ok');
  }

  function stopDraftsPolling() {
    if (state.draftsPollTimer) {
      clearInterval(state.draftsPollTimer);
      state.draftsPollTimer = null;
    }
  }

  function syncDraftsAutoRefresh() {
    const draftsVisible = state.isAdmin && state.activeSection === 'drafts';
    if (!draftsVisible) {
      stopDraftsPolling();
      return;
    }
    loadDrafts().catch(function () {});
    if (state.draftsPollTimer) {
      return;
    }
    state.draftsPollTimer = setInterval(function () {
      if (!(state.isAdmin && state.activeSection === 'drafts')) {
        stopDraftsPolling();
        return;
      }
      loadDrafts().catch(function () {});
    }, 6000);
  }

  function stopQueuePolling() {
    if (state.queuePollTimer) {
      clearInterval(state.queuePollTimer);
      state.queuePollTimer = null;
    }
  }

  function syncQueueAutoRefresh() {
    const queueVisible = state.isAdmin && state.activeSection === 'queue';
    if (!queueVisible) {
      stopQueuePolling();
      return;
    }
    loadQueue().catch(function () {});
    if (state.queuePollTimer) {
      return;
    }
    state.queuePollTimer = setInterval(function () {
      if (!(state.isAdmin && state.activeSection === 'queue')) {
        stopQueuePolling();
        return;
      }
      loadQueue().catch(function () {});
    }, 6000);
  }

  async function saveComposer(action) {
    const payload = readComposer();
    payload.action = action;

    if (action === 'queue_scheduled' && !payload.scheduled_at) {
      setOutput(els.outputCompose, 'Scheduled posts need a release date/time.', 'warn');
      return;
    }

    if (action === 'publish_now' && !payload.content.trim()) {
      setOutput(els.outputCompose, 'Cannot publish an empty post.', 'warn');
      return;
    }

    try {
      const data = await apiPost('/cgi/blog-save-post', payload, true);
      if (!data.success) {
        throw new Error(data.error || 'Save failed');
      }

      if (data.draft_id) {
        state.currentDraftId = data.draft_id;
        refreshDraftLabel();
      }

      if (action === 'publish_now') {
        const filename = String(data.filename || '').trim();
        const baseMessage = data.message
          ? String(data.message)
          : ('Published: ' + (filename || 'post'));
        setOutput(
          els.outputCompose,
          baseMessage + ' Updating front page/search can take a few seconds while rebuild finishes.',
          'ok'
        );
        resetComposer();
      } else {
        setOutput(els.outputCompose, data.message || 'Saved.', 'ok');
      }

      await Promise.all([loadDrafts(), loadQueue(), loadPosts()]);
      setAutosaveStatus('saved', 'Autosaved at ' + new Date().toLocaleString());
    } catch (err) {
      setOutput(els.outputCompose, 'Error: ' + err.message, 'error');
    }
  }

  async function autosave() {
    if (state.suspendAutosave) {
      return;
    }
    const payload = readComposer();
    if (!payload.title.trim() && !payload.content.trim()) {
      return;
    }
    payload.action = 'autosave';

    try {
      const data = await apiPost('/cgi/blog-save-post', payload, true);
      if (data.success && data.draft_id) {
        state.currentDraftId = data.draft_id;
        refreshDraftLabel();
        setAutosaveStatus('saved', 'Autosaved at ' + new Date().toLocaleString());
      }
    } catch (err) {
      setAutosaveStatus('error', 'Autosave failed (' + err.message + ')');
    }
  }

  function queueAutosave(reason) {
    if (state.suspendAutosave) {
      return;
    }
    if (state.autosaveTimer) {
      clearTimeout(state.autosaveTimer);
    }
    setAutosaveStatus('saving');
    state.autosaveTimer = setTimeout(autosave, 1500);
  }

  async function runSchedulerNow() {
    if (Number(state.dripQueueItemCount || 0) <= 0) {
      syncRunSchedulerButtonUi();
      setOutput(els.outputQueue, 'No content in drip queue yet.', 'warn');
      return;
    }
    const nextTitle = String(state.nextDripTitle || '').trim();
    const nextExcerpt = String(state.nextDripExcerpt || '').trim();
    const prompt = nextTitle
      ? ('Drip now and publish the next queued draft?\n\n' + nextTitle + (nextExcerpt ? ('\n\n' + nextExcerpt + '...') : ''))
      : 'Run drip now?';
    if (!window.confirm(prompt)) {
      return;
    }
    try {
      const data = await apiPost('/cgi/blog-run-scheduler', {}, true);
      if (!data.success) {
        throw new Error(data.error || 'Scheduler failed');
      }
      await Promise.all([loadDrafts(), loadQueue(), loadPosts()]);
      setOutput(els.outputQueue, 'Drip run complete. Scheduled published: ' + data.scheduled_published + ', drip published: ' + data.drip_published + '.', 'ok');
    } catch (err) {
      setOutput(els.outputQueue, 'Error: ' + err.message, 'error');
    }
  }

  async function runNostrMirror() {
    if (els.mirrorNostrButton && els.mirrorNostrButton.disabled) {
      return;
    }
    if (els.mirrorNostrButton) {
      els.mirrorNostrButton.disabled = true;
      els.mirrorNostrButton.classList.add('is-loading');
      els.mirrorNostrButton.setAttribute('aria-busy', 'true');
      els.mirrorNostrButton.dataset.originalLabel = els.mirrorNostrButton.textContent || 'Sync from Nostr';
      els.mirrorNostrButton.textContent = 'Syncing...';
    }
    try {
      const data = await apiPost('/cgi/blog-nostr-mirror', {}, true);
      if (!data.success) {
        throw new Error(data.error || 'Nostr mirror failed');
      }
      await Promise.all([loadDrafts(), loadQueue()]);
      setOutput(
        els.outputQueue,
        'Nostr mirror complete. Posts mirrored: ' + String(data.posts_mirrored || 0) +
          ', comments mirrored: ' + String(data.comments_mirrored || 0) + '.',
        'ok'
      );
    } catch (err) {
      setOutput(els.outputQueue, 'Error: ' + err.message, 'error');
    } finally {
      if (els.mirrorNostrButton) {
        els.mirrorNostrButton.disabled = false;
        els.mirrorNostrButton.classList.remove('is-loading');
        els.mirrorNostrButton.removeAttribute('aria-busy');
        els.mirrorNostrButton.textContent = els.mirrorNostrButton.dataset.originalLabel || 'Sync from Nostr';
        delete els.mirrorNostrButton.dataset.originalLabel;
      }
    }
  }

  async function uploadImageFile(file) {
    const data = await uploadFileWithProgress(file, {
      kind: 'image',
      data: {
        draft_id: state.currentDraftId || ''
      }
    });
    if (!data.success) {
      throw new Error(data.error || 'Upload failed');
    }
    insertImage(data.url, file.name.replace(/\.[^.]+$/, ''));
    return data.url;
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('Failed to read file')); };
      reader.readAsDataURL(file);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function handleDroppedFiles(files) {
    const imageFiles = Array.from(files || []).filter(function (file) {
      return file && file.type && file.type.indexOf('image/') === 0;
    });
    if (!imageFiles.length) {
      return;
    }

    setOutput(els.outputCompose, 'Uploading ' + imageFiles.length + ' image(s)...', 'warn');
    try {
      for (const file of imageFiles) {
        await uploadImageFile(file);
      }
      setOutput(els.outputCompose, 'Images inserted into markdown.', 'ok');
    } catch (err) {
      setOutput(els.outputCompose, 'Upload error: ' + err.message, 'error');
    }
  }

  async function uploadAdminFiles(files) {
    const picked = Array.from(files || []).filter(function (file) {
      return file && file.size >= 0;
    });
    if (!picked.length) {
      return;
    }
    setOutput(els.outputFiles, 'Uploading ' + picked.length + ' file(s)...', 'warn');
    try {
      for (const file of picked) {
        await uploadFileWithProgress(file, { kind: 'file' });
      }
      setOutput(els.outputFiles, 'Files uploaded.', 'ok');
      loadFiles().catch(function (err) {
        setOutput(els.outputFiles, 'Files uploaded, but refreshing file list failed: ' + err.message, 'warn');
      });
    } catch (err) {
      setOutput(els.outputFiles, 'Upload error: ' + err.message, 'error');
    }
  }

  function bindEvents() {
    bindSettingsAutosave();
    if (els.sidebarToggleButton) {
      els.sidebarToggleButton.addEventListener('click', function () {
        applySidebarCollapseState(!state.sidebarCollapsed, true);
      });
    }
    if (els.sidebarRevealButton) {
      els.sidebarRevealButton.addEventListener('click', function () {
        applySidebarCollapseState(false, true);
      });
    }
    if (els.adminTheme) {
      els.adminTheme.addEventListener('keydown', function (event) {
        if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }
        const enabledValues = Array.from(els.adminTheme.options || [])
          .filter(function (opt) { return !opt.disabled; })
          .map(function (opt) { return String(opt.value || ''); });
        if (!enabledValues.length) {
          return;
        }
        const current = String(els.adminTheme.value || '');
        let idx = enabledValues.indexOf(current);
        if (idx < 0) {
          idx = 0;
        }
        const nextIdx = event.key === 'ArrowDown'
          ? (idx + 1) % enabledValues.length
          : (idx - 1 + enabledValues.length) % enabledValues.length;
        const nextTheme = enabledValues[nextIdx];
        if (!nextTheme || nextTheme === current) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        els.adminTheme.value = nextTheme;
        applyThemePreview(nextTheme);
        queueConfigSave();
      });
      els.adminTheme.addEventListener('change', function () {
        applyThemePreview(els.adminTheme.value);
      });
    }

    if (els.postTagsInput) {
      els.postTagsInput.addEventListener('keydown', function (event) {
        if (event.key === ',' || event.key === 'Enter') {
          event.preventDefault();
          if (commitTagInput()) {
            queueAutosave('saving');
          }
          return;
        }
        if (event.key === 'Backspace' && !els.postTagsInput.value && state.composeTags.length) {
          removeComposeTag(state.composeTags[state.composeTags.length - 1]);
          queueAutosave('saving');
        }
      });

      els.postTagsInput.addEventListener('blur', function () {
        if (commitTagInput()) {
          queueAutosave('saving');
        }
      });
    }

    if (els.postTagsPills) {
      els.postTagsPills.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const tag = target.getAttribute('data-remove-tag');
        if (!tag) {
          return;
        }
        removeComposeTag(tag);
        queueAutosave('saving');
      });
    }

    if (els.scheduledPickerButton && els.postScheduleAt) {
      els.scheduledPickerButton.addEventListener('click', function () {
        try {
          els.postScheduleAt.focus();
          if (typeof els.postScheduleAt.showPicker === 'function') {
            els.postScheduleAt.showPicker();
          }
        } catch (_err) {
          // Browser may block programmatic picker open.
        }
      });
    }

    document.getElementById('btn-publish-now').addEventListener('click', function () {
      const mode = getPublishMode();
      if (mode === 'scheduled') {
        saveComposer('queue_scheduled');
        return;
      }
      if (mode === 'drip') {
        saveComposer('queue_drip');
        return;
      }
      saveComposer('publish_now');
    });
    document.getElementById('btn-delete-current').addEventListener('click', function () {
      if (!state.currentDraftId) {
        setOutput(els.outputCompose, 'No current draft selected.', 'warn');
        return;
      }
      deleteDraft(state.currentDraftId).catch(function (err) {
        setOutput(els.outputCompose, 'Error: ' + err.message, 'error');
      });
    });
    if (els.togglePreviewButton) {
      els.togglePreviewButton.addEventListener('click', function () {
        setPreviewVisibility(!state.previewVisible);
      });
    }

    if (els.queueList) {
      els.queueList.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const actionNode = target.closest('[data-queue-action][data-draft-id]');
        if (!(actionNode instanceof HTMLElement)) {
          return;
        }
        const action = actionNode.getAttribute('data-queue-action');
        const draftId = actionNode.getAttribute('data-draft-id');
        if (!action || !draftId) {
          return;
        }
        if (action === 'edit') {
          loadDraft(draftId).catch(function (err) {
            setOutput(els.outputQueue, 'Error: ' + err.message, 'error');
          });
          return;
        }
        if (action !== 'unqueue') {
          return;
        }
        unqueueDraft(draftId).catch(function (err) {
          setOutput(els.outputQueue, 'Error: ' + err.message, 'error');
        });
      });
    }
    if (els.newPostButton) {
      els.newPostButton.addEventListener('click', function () {
        resetComposer();
        activateSection('compose', true);
      });
    }
    if (els.nostrPageTypeSelect) {
      els.nostrPageTypeSelect.addEventListener('change', function () {
        syncNostrPageCreateDefaults();
      });
    }
    if (els.nostrPageSlugInput) {
      els.nostrPageSlugInput.addEventListener('input', function () {
        const text = String(els.nostrPageSlugInput.value || '').trim();
        els.nostrPageSlugInput.dataset.autoSuggest = text ? '0' : '1';
      });
    }
    if (els.nostrPageCreateCancel) {
      els.nostrPageCreateCancel.addEventListener('click', function () {
        if (els.nostrPageCreateDialog instanceof HTMLDialogElement) {
          els.nostrPageCreateDialog.close('cancel');
        }
      });
    }
    if (els.postAddToListCancel) {
      els.postAddToListCancel.addEventListener('click', function () {
        if (els.postAddToListDialog instanceof HTMLDialogElement) {
          els.postAddToListDialog.close('cancel');
        }
      });
    }
    if (els.postAddToListSelect) {
      els.postAddToListSelect.addEventListener('change', function () {
        syncAddToListNewRowVisibility();
      });
    }
    (Array.isArray(els.moderationAgeOptions) ? els.moderationAgeOptions : []).forEach(function (button) {
      button.addEventListener('click', function () {
        const picked = button.getAttribute('data-moderation-age');
        setModerationAgeFilter(picked);
      });
    });
    syncModerationAgeFilterUi();
    if (els.nosterRuntime) {
      els.nosterRuntime.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const actionButton = target.closest('button[data-noster-action]');
        if (!actionButton) {
          return;
        }
        const action = String(actionButton.getAttribute('data-noster-action') || '').trim();
        if (!action) {
          return;
        }
        runNosterAction(action).catch(function (err) {
          setOutput(els.outputNostrBridge, 'Error: ' + err.message, 'error');
        });
      });
      els.nosterRuntime.addEventListener('change', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const settingInput = target.closest('input[data-noster-setting]');
        if (!(settingInput instanceof HTMLInputElement)) {
          return;
        }
        queueNosterSettingsAutosave(120);
      });
    }
    if (els.zapsRuntime) {
      els.zapsRuntime.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const actionButton = target.closest('button[data-zaps-action]');
        if (!actionButton) {
          return;
        }
        const action = String(actionButton.getAttribute('data-zaps-action') || '').trim();
        if (!action) {
          return;
        }
        runZapsInstall(action).catch(function (err) {
          setOutput(els.outputZaps, 'Error: ' + err.message, 'error');
        });
      });
    }
    if (els.btcpayRuntime) {
      els.btcpayRuntime.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const actionButton = target.closest('button[data-btcpay-action]');
        if (!actionButton) {
          return;
        }
        const action = String(actionButton.getAttribute('data-btcpay-action') || '').trim();
        if (!action) {
          return;
        }
        runBtcpayAction(action).catch(function (err) {
          setOutput(els.outputBtcpay, 'Error: ' + err.message, 'error');
        });
      });
    }
    if (els.moderationList) {
      els.moderationList.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const actionNode = target.closest('[data-moderation-action][data-node-coord][data-page-slug]');
        if (!(actionNode instanceof HTMLElement)) {
          return;
        }
        const action = String(actionNode.getAttribute('data-moderation-action') || '');
        const nodeCoord = String(actionNode.getAttribute('data-node-coord') || '');
        const pageSlug = String(actionNode.getAttribute('data-page-slug') || '');
        const row = actionNode.closest('[data-moderation-node]');
        runModerationAction(action, nodeCoord, pageSlug, row instanceof HTMLElement ? row : null).catch(function (err) {
          setOutput(els.outputModeration, 'Error: ' + err.message, 'error');
        });
      });
    }
    Array.from(document.querySelectorAll('dialog')).forEach(function (dialogEl) {
      if (!(dialogEl instanceof HTMLDialogElement)) {
        return;
      }
      dialogEl.addEventListener('click', function (event) {
        if (event.target === dialogEl) {
          dialogEl.close('cancel');
        }
      });
      if (dialogEl === els.postAddToListDialog) {
        dialogEl.addEventListener('close', function () {
          state.pendingAddToListPostPath = '';
        });
      }
    });
    if (els.nostrPageCreateForm) {
      els.nostrPageCreateForm.addEventListener('submit', function (event) {
        event.preventDefault();
        const pickedType = String((els.nostrPageTypeSelect && els.nostrPageTypeSelect.value) || '').trim().toLowerCase();
        const rawSlug = String((els.nostrPageSlugInput && els.nostrPageSlugInput.value) || '');
        if (!createNostrPageFromInput(pickedType, rawSlug)) {
          return;
        }
        if (els.nostrPageCreateDialog instanceof HTMLDialogElement) {
          els.nostrPageCreateDialog.close('ok');
        }
      });
    }
    if (els.postAddToListForm) {
      els.postAddToListForm.addEventListener('submit', function (event) {
        event.preventDefault();
        const postPath = String(state.pendingAddToListPostPath || '').trim();
        if (!postPath) {
          setOutput(els.outputPosts, 'Post path missing for Add to list.', 'error');
          return;
        }
        const selected = String((els.postAddToListSelect && els.postAddToListSelect.value) || '').trim();
        const candidateSlug = selected === '__new__'
          ? String((els.postAddToListNewSlug && els.postAddToListNewSlug.value) || '')
          : selected;
        const targetSlug = normalizeNostrPageSlug(candidateSlug);
        if (!targetSlug) {
          setOutput(els.outputPosts, 'List slug is required.', 'warn');
          return;
        }
        const dateText = String((els.postAddToListDate && els.postAddToListDate.value) || '').trim();
        const markdownText = String((els.postAddToListMarkdown && els.postAddToListMarkdown.value) || '').trim();
        submitAddPostToList(postPath, targetSlug, dateText, markdownText)
          .then(function () {
            if (els.postAddToListDialog instanceof HTMLDialogElement) {
              els.postAddToListDialog.close('ok');
            }
            state.pendingAddToListPostPath = '';
          })
          .catch(function (err) {
            setOutput(els.outputPosts, 'Error: ' + err.message, 'error');
          });
      });
    }
    if (els.createNostrPageButton) {
      els.createNostrPageButton.addEventListener('click', function () {
        promptCreateNostrPage();
      });
    }
    if (els.uploadFileButton) {
      els.uploadFileButton.addEventListener('click', function () {
        if (els.filePicker) {
          els.filePicker.click();
        }
      });
    }
    if (els.filePicker) {
      els.filePicker.addEventListener('change', function () {
        if (els.filePicker.files && els.filePicker.files.length) {
          uploadAdminFiles(els.filePicker.files).finally(function () {
            els.filePicker.value = '';
          });
        }
      });
    }
    if (els.nostrPagesList) {
      els.nostrPagesList.addEventListener('change', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const action = String(target.getAttribute('data-nostr-page-action') || '');
        if (action === 'default-tag') {
          if (!(target instanceof HTMLSelectElement)) {
            return;
          }
          const idx = Number(target.getAttribute('data-index'));
          if (!Number.isInteger(idx) || idx < 0 || idx >= state.nostrPages.length) {
            return;
          }
          const before = state.nostrPages.slice();
          const next = state.nostrPages.slice();
          next[idx] = Object.assign({}, next[idx], { default_tag: String(target.value || '').trim() });
          state.nostrPages = next;
          saveNostrPagesConfig().catch(function (err) {
            state.nostrPages = before;
            renderNostrPagesList(state.nostrPages, false);
            setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
          });
          return;
        }
        if (action !== 'toggle-nav' || !(target instanceof HTMLInputElement)) {
          return;
        }
        const idx = Number(target.getAttribute('data-index'));
        if (!Number.isInteger(idx) || idx < 0 || idx >= state.nostrPages.length) {
          return;
        }
        const before = state.nostrPages.slice();
        const next = state.nostrPages.slice();
        next[idx] = Object.assign({}, next[idx], { show_in_nav: !!target.checked });
        state.nostrPages = next;
        dispatchNavbarRefresh(state.nostrPages, true);
        saveNostrPagesConfig().catch(function (err) {
          state.nostrPages = before;
          renderNostrPagesList(state.nostrPages, false);
          dispatchNavbarRefresh(state.nostrPages, true);
          setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
        });
      });

      els.nostrPagesList.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const actionNode = target.closest('[data-nostr-page-action][data-index]');
        if (!(actionNode instanceof HTMLElement)) {
          return;
        }
        const action = String(actionNode.getAttribute('data-nostr-page-action') || '');
        if (action === 'edit-slug' || action === 'edit-nav-title') {
          event.preventDefault();
        }
        if (action === 'toggle-nav') {
          return;
        }
        if (action === 'drag-handle') {
          return;
        }
        if (action === 'toggle_menu') {
          event.preventDefault();
          event.stopPropagation();
          const panels = Array.from(els.nostrPagesList.querySelectorAll('[data-nostr-page-menu-panel]'));
          let opened = '';
          const panelKey = String(actionNode.getAttribute('data-index') || '');
          panels.forEach(function (panel) {
            const thisKey = String(panel.getAttribute('data-nostr-page-menu-panel') || '');
            if (!thisKey) {
              return;
            }
            const openThis = thisKey === panelKey ? panel.hidden : false;
            panel.hidden = !openThis;
            if (openThis) {
              opened = thisKey;
            }
          });
          state.nostrPagesMenuOpenFor = opened;
          return;
        }
        closeNostrPageMenus();
        const idx = Number(actionNode.getAttribute('data-index'));
        if (!Number.isInteger(idx) || idx < 0 || idx >= state.nostrPages.length) {
          return;
        }
        if (action === 'remove') {
          const removed = state.nostrPages[idx];
          if (!window.confirm('Remove this page from local Nostr page config? This does not delete the Nostr event.')) {
            return;
          }
          state.nostrPages = state.nostrPages.filter(function (_page, i) { return i !== idx; });
          saveNostrPagesConfig().then(function () {
            setOutput(
              els.outputNostrPages,
              'Removed local page reference for ' + String((removed && removed.slug) || 'page') + '.',
              'ok'
            );
          }).catch(function (err) {
            setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
          });
          return;
        }
        if (action === 'publish') {
          publishNostrPageFromList(idx).catch(function (err) {
            setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
          });
          return;
        }
        if (action === 'edit-slug') {
          beginNostrPageSlugEdit(idx);
          return;
        }
        if (action === 'save-slug') {
          commitNostrPageSlugEdit(idx).catch(function (err) {
            setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
          });
          return;
        }
        if (action === 'edit-nav-title') {
          beginNostrPageNavTitleEdit(idx);
          return;
        }
        if (action === 'save-nav-title') {
          commitNostrPageNavTitleEdit(idx).catch(function (err) {
            setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
          });
        }
      });

      els.nostrPagesList.addEventListener('input', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }
        const action = String(target.getAttribute('data-nostr-page-action') || '');
        if (action === 'edit-slug-input') {
          const idx = Number(target.getAttribute('data-index'));
          if (idx !== state.nostrPagesEditingSlugIndex) {
            return;
          }
          state.nostrPagesEditingSlugValue = target.value;
          return;
        }
        if (action === 'edit-nav-title-input') {
          const idx = Number(target.getAttribute('data-index'));
          if (idx !== state.nostrPagesEditingNavTitleIndex) {
            return;
          }
          state.nostrPagesEditingNavTitleValue = target.value;
          return;
        }
      });

      els.nostrPagesList.addEventListener('keydown', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }
        const action = String(target.getAttribute('data-nostr-page-action') || '');
        if (action !== 'edit-slug-input' && action !== 'edit-nav-title-input') {
          return;
        }
        const idx = Number(target.getAttribute('data-index'));
        if (!Number.isInteger(idx)) {
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          if (action === 'edit-nav-title-input') {
            cancelNostrPageNavTitleEdit();
          } else {
            cancelNostrPageSlugEdit();
          }
          return;
        }
        if (event.key === 'Enter' || event.key === 'Return' || event.keyCode === 13) {
          event.preventDefault();
          if (action === 'edit-nav-title-input') {
            commitNostrPageNavTitleEdit(idx).catch(function (err) {
              setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
            });
          } else {
            commitNostrPageSlugEdit(idx).catch(function (err) {
              setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
            });
          }
        }
      });

      els.nostrPagesList.addEventListener('focusout', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }
        const action = String(target.getAttribute('data-nostr-page-action') || '');
        if (action !== 'edit-slug-input' && action !== 'edit-nav-title-input') {
          return;
        }
        const idx = Number(target.getAttribute('data-index'));
        if (!Number.isInteger(idx)) {
          return;
        }
        window.setTimeout(function () {
          const active = document.activeElement;
          if (action === 'edit-slug-input' && active instanceof HTMLElement && active.closest && active.closest('.nostr-page-path-col')) {
            return;
          }
          if (action === 'edit-nav-title-input' && active instanceof HTMLElement && active.closest && active.closest('.nostr-page-title-row')) {
            return;
          }
          if (action === 'edit-nav-title-input') {
            commitNostrPageNavTitleEdit(idx).catch(function (err) {
              setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
            });
          } else {
            commitNostrPageSlugEdit(idx).catch(function (err) {
              setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
            });
          }
        }, 0);
      });

      els.nostrPagesList.addEventListener('dragstart', function (event) {
        const target = event.target;
        const row = target && target.closest ? target.closest('.nostr-page-row[data-slug]') : null;
        if (!(row instanceof HTMLElement)) {
          return;
        }
        const handle = target && target.closest ? target.closest('.nostr-page-drag-handle') : null;
        if (!(handle instanceof HTMLElement)) {
          event.preventDefault();
          return;
        }
        const dragSlug = String(row.getAttribute('data-slug') || '');
        if (!dragSlug) {
          event.preventDefault();
          return;
        }
        state.nostrPagesDragActive = true;
        state.nostrPagesDragSlug = dragSlug;
        state.nostrPagesDragLastTarget = '';
        state.nostrPagesDragDropped = false;
        state.nostrPagesDragSnapshot = state.nostrPages.slice();
        row.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          try {
            event.dataTransfer.setData('text/plain', dragSlug);
            // Hide the default ghost preview of the drag handle itself.
            const dragImage = document.createElement('canvas');
            dragImage.width = 1;
            dragImage.height = 1;
            event.dataTransfer.setDragImage(dragImage, 0, 0);
          } catch (_err) {
            // Ignore.
          }
        }
      });

      els.nostrPagesList.addEventListener('dragover', function (event) {
        if (!state.nostrPagesDragActive || !state.nostrPagesDragSlug) {
          return;
        }
        const target = event.target;
        const row = target && target.closest ? target.closest('.nostr-page-row[data-slug]') : null;
        if (!(row instanceof HTMLElement)) {
          return;
        }
        const targetSlug = String(row.getAttribute('data-slug') || '');
        if (!targetSlug || targetSlug === state.nostrPagesDragSlug) {
          return;
        }
        event.preventDefault();
        const rect = row.getBoundingClientRect();
        const placeAfter = event.clientY > (rect.top + rect.height / 2);
        const targetKey = targetSlug + ':' + (placeAfter ? 'after' : 'before');
        if (targetKey === state.nostrPagesDragLastTarget) {
          return;
        }
        const changed = reorderNostrPagesBySlug(state.nostrPagesDragSlug, targetSlug, placeAfter);
        if (!changed) {
          return;
        }
        state.nostrPagesDragLastTarget = targetKey;
        renderNostrPagesList(state.nostrPages, true);
        dispatchNavbarRefresh(state.nostrPages, true);
      });

      els.nostrPagesList.addEventListener('drop', function (event) {
        if (!state.nostrPagesDragActive || !state.nostrPagesDragSlug) {
          return;
        }
        event.preventDefault();
        state.nostrPagesDragDropped = true;
        saveNostrPagesConfig().catch(function (err) {
          setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
        });
      });

      els.nostrPagesList.addEventListener('dragend', function (event) {
        const target = event.target;
        const row = target && target.closest ? target.closest('.nostr-page-row[data-slug]') : null;
        const beforeSig = Array.isArray(state.nostrPagesDragSnapshot)
          ? state.nostrPagesDragSnapshot.map(function (page) { return String(page.slug || ''); }).join('|')
          : '';
        const afterSig = Array.isArray(state.nostrPages)
          ? state.nostrPages.map(function (page) { return String(page.slug || ''); }).join('|')
          : '';
        const orderChanged = !!beforeSig && !!afterSig && beforeSig !== afterSig;
        if (row) {
          row.classList.remove('is-dragging');
        }
        if (state.nostrPagesDragActive && !state.nostrPagesDragDropped && orderChanged) {
          saveNostrPagesConfig().catch(function (err) {
            if (Array.isArray(state.nostrPagesDragSnapshot)) {
              state.nostrPages = state.nostrPagesDragSnapshot.slice();
              renderNostrPagesList(state.nostrPages, true);
              dispatchNavbarRefresh(state.nostrPages, true);
            }
            setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
          });
        } else if (state.nostrPagesDragActive && !state.nostrPagesDragDropped && Array.isArray(state.nostrPagesDragSnapshot)) {
          state.nostrPages = state.nostrPagesDragSnapshot.slice();
          renderNostrPagesList(state.nostrPages, true);
          dispatchNavbarRefresh(state.nostrPages, true);
        }
        state.nostrPagesDragActive = false;
        state.nostrPagesDragSlug = '';
        state.nostrPagesDragLastTarget = '';
        state.nostrPagesDragDropped = false;
        state.nostrPagesDragSnapshot = [];
      });

      document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.closest('.nostr-page-menu')) {
          return;
        }
        closeNostrPageMenus();
      });
    }
    if (els.postsList) {
      els.postsList.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const actionNode = target.closest('[data-post-action][data-post-path]');
        if (!(actionNode instanceof HTMLElement)) {
          return;
        }
        const action = actionNode.getAttribute('data-post-action');
        const postPath = actionNode.getAttribute('data-post-path');
        const postUrl = actionNode.getAttribute('data-post-url') || '';
        if (!action || !postPath) {
          return;
        }
        if (action === 'toggle_menu') {
          const panels = Array.from(els.postsList.querySelectorAll('[data-post-menu-panel]'));
          let opened = '';
          panels.forEach(function (panel) {
            const thisPath = panel.getAttribute('data-post-menu-panel');
            if (!thisPath) {
              return;
            }
            const openThis = thisPath === postPath ? panel.hidden : false;
            panel.hidden = !openThis;
            if (openThis) {
              opened = thisPath;
            }
          });
          state.postsMenuOpenFor = opened;
          return;
        }
        runPostAction(action, postPath, postUrl).catch(function (err) {
          setOutput(els.outputPosts, 'Error: ' + err.message, 'error');
        });
      });

      document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.closest('.post-menu')) {
          return;
        }
        state.postsMenuOpenFor = '';
        Array.from(els.postsList.querySelectorAll('[data-post-menu-panel]')).forEach(function (panel) {
          panel.hidden = true;
        });
      });
    }
    if (els.filesList) {
      els.filesList.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const actionNode = target.closest('[data-file-action]');
        if (!(actionNode instanceof HTMLElement)) {
          return;
        }
        const action = String(actionNode.getAttribute('data-file-action') || '');
        if (action === 'copy-url') {
          const fileUrl = String(actionNode.getAttribute('data-file-url') || '').trim();
          if (!fileUrl) {
            return;
          }
          const absoluteUrl = new URL(fileUrl, window.location.origin).toString();
          copyTextToClipboard(absoluteUrl).then(function (ok) {
            setOutput(els.outputFiles, ok ? 'File URL copied.' : 'Could not copy file URL.', ok ? 'ok' : 'warn');
          });
          return;
        }
        if (action === 'toggle-public') {
          const fileId = String(actionNode.getAttribute('data-file-id') || '').trim();
          const makePublic = String(actionNode.getAttribute('data-make-public') || '') === 'true';
          if (!fileId) {
            return;
          }
          setFilePublicState(fileId, makePublic).catch(function (err) {
            setOutput(els.outputFiles, 'Error: ' + err.message, 'error');
          });
        }
      });
    }
    if (els.usersList) {
      els.usersList.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const sortNode = target.closest('[data-users-sort]');
        if (sortNode instanceof HTMLElement) {
          const picked = normalizeUsersSortColumn(sortNode.getAttribute('data-users-sort') || '');
          if (!picked) {
            return;
          }
          const nextDirection = usersSortNextDirection(picked);
          state.usersSortColumn = picked;
          state.usersSortDirection = nextDirection;
          renderUsersList(false);
          return;
        }
        const actionNode = target.closest('[data-user-action][data-username]');
        if (!(actionNode instanceof HTMLElement)) {
          return;
        }
        const action = actionNode.getAttribute('data-user-action');
        const username = actionNode.getAttribute('data-username');
        if (!action || !username) {
          return;
        }
        if (action === 'toggle_menu') {
          event.preventDefault();
          event.stopPropagation();
          const panels = Array.from(els.usersList.querySelectorAll('[data-user-menu-panel]'));
          let opened = '';
          panels.forEach(function (panel) {
            const thisUser = panel.getAttribute('data-user-menu-panel');
            if (!thisUser) {
              return;
            }
            const openThis = thisUser === username ? panel.hidden : false;
            panel.hidden = !openThis;
            if (openThis) {
              opened = thisUser;
            }
          });
          state.usersMenuOpenFor = opened;
          return;
        }
        runUserAction(action, username).catch(function (err) {
          setOutput(els.outputUsers, 'Error: ' + err.message, 'error');
        });
      });
      els.usersList.addEventListener('dragstart', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        if (target.closest('button, a, input, textarea, select, [role="button"]')) {
          event.preventDefault();
          return;
        }
        const card = target.closest('.user-card[data-username][data-can-drag="true"]');
        if (!(card instanceof HTMLElement)) {
          return;
        }
        const username = card.getAttribute('data-username');
        if (!username) {
          return;
        }
        state.userDragActive = true;
        state.userDragUsername = username;
        state.userDropAfterUsername = '';
        els.usersList.classList.add('is-dragging');
        card.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', username);
        }
      });
      els.usersList.addEventListener('dragend', function () {
        state.userDragActive = false;
        state.userDragUsername = '';
        state.userDropAfterUsername = '';
        els.usersList.classList.remove('is-dragging');
        Array.from(els.usersList.querySelectorAll('.user-card.is-dragging')).forEach(function (node) {
          node.classList.remove('is-dragging');
        });
        Array.from(els.usersList.querySelectorAll('.user-drop-zone.is-target')).forEach(function (node) {
          node.classList.remove('is-target');
        });
      });
      els.usersList.addEventListener('dragover', function (event) {
        if (!state.userDragActive) {
          return;
        }
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const zone = target.closest('.user-drop-zone[data-user-drop-after]');
        if (!(zone instanceof HTMLElement)) {
          return;
        }
        const afterUsername = zone.getAttribute('data-user-drop-after') || '';
        if (!afterUsername || afterUsername === state.userDragUsername) {
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
        }
        state.userDropAfterUsername = afterUsername;
        Array.from(els.usersList.querySelectorAll('.user-drop-zone.is-target')).forEach(function (node) {
          node.classList.remove('is-target');
        });
        zone.classList.add('is-target');
      });
      els.usersList.addEventListener('drop', function (event) {
        if (!state.userDragActive) {
          return;
        }
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const zone = target.closest('.user-drop-zone[data-user-drop-after]');
        if (!(zone instanceof HTMLElement)) {
          return;
        }
        event.preventDefault();
        const dragged = state.userDragUsername;
        const afterUsername = zone.getAttribute('data-user-drop-after') || '';
        if (!dragged || !afterUsername || dragged === afterUsername) {
          return;
        }
        runUserMoveAfter(dragged, afterUsername).catch(function (err) {
          setOutput(els.outputUsers, 'Error: ' + err.message, 'error');
        });
      });
      document.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.closest('.user-menu')) {
          return;
        }
        state.usersMenuOpenFor = '';
        Array.from(els.usersList.querySelectorAll('[data-user-menu-panel]')).forEach(function (panel) {
          panel.hidden = true;
        });
      });
    }
    window.addEventListener('focus', function () {
      if (state.isAdmin && state.activeSection === 'nostr-bridge') {
        loadNosterRuntime().catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'zaps') {
        loadZapsRuntime().catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'btcpay') {
        loadBtcpayRuntime().catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'users' && !state.userDragActive) {
        loadUsers(false).catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'queue') {
        loadQueue().catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'posts' && !state.postsActionInFlight) {
        loadPosts().catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'files') {
        loadFiles().catch(function () {});
      }
      if (state.isAdmin) {
        localDripWorkerTick(true).catch(function () {});
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'nostr-bridge') {
        loadNosterRuntime().catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'zaps') {
        loadZapsRuntime().catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'btcpay') {
        loadBtcpayRuntime().catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'users' && !state.userDragActive) {
        loadUsers(false).catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'queue') {
        loadQueue().catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'posts' && !state.postsActionInFlight) {
        loadPosts().catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'files') {
        loadFiles().catch(function () {});
      }
      if (document.visibilityState === 'visible') {
        localDripWorkerTick(true).catch(function () {});
      } else {
        localDripReleaseLease();
        setLocalDripLeader(false);
      }
    });
    window.addEventListener('storage', function (event) {
      if (!event) {
        return;
      }
      if (event.key === 'session_token' || event.key === 'csrf_token') {
        refreshAuthFromStorage();
        return;
      }
      if (event.key === LOCAL_DRIP_ENABLED_KEY) {
        state.localDripEnabled = localStorage.getItem(LOCAL_DRIP_ENABLED_KEY) !== '0';
        syncLocalDripToggleUi();
        updateQueueLocalDripStatus();
        if (state.localDripEnabled) {
          startLocalDripWorker();
          localDripWorkerTick(true).catch(function () {});
        } else {
          stopLocalDripWorker();
        }
        return;
      }
      if (event.key === LOCAL_DRIP_LEASE_KEY) {
        const lease = localDripLeaseRead();
        setLocalDripLeader(!!(lease && lease.owner === state.localDripTabId));
      }
    });
    window.addEventListener('blog-auth-changed', function () {
      refreshAuthFromStorage();
    });
    window.addEventListener('beforeunload', function (event) {
      if (state.activeUploadCount > 0) {
        event.preventDefault();
        event.returnValue = 'Uploads are still in progress. Leaving now may interrupt them.';
        return 'Uploads are still in progress. Leaving now may interrupt them.';
      }
      localDripReleaseLease();
    });

    if (els.localDripToggleButton) {
      els.localDripToggleButton.addEventListener('click', function () {
        setLocalDripEnabled(!state.localDripEnabled);
      });
      syncLocalDripToggleUi();
    }
    if (els.runSchedulerButton) {
      els.runSchedulerButton.addEventListener('click', runSchedulerNow);
      syncRunSchedulerButtonUi();
    }
    if (els.mirrorNostrButton) {
      els.mirrorNostrButton.addEventListener('click', runNostrMirror);
    }
    const saveAccountBtn = document.getElementById('btn-save-account');
    if (saveAccountBtn) {
      saveAccountBtn.addEventListener('click', saveAccount);
    }
    if (els.bindPasskeyButton) {
      els.bindPasskeyButton.addEventListener('click', function () {
        bindPasskeyForAccount()
          .then(function () {
            setOutput(els.outputAccount, 'Passkey bound to your Nostr account.', 'ok');
          })
          .catch(function (err) {
            setOutput(els.outputAccount, 'Error: ' + err.message, 'error');
          });
      });
    }
    if (els.generateSshButton) {
      els.generateSshButton.addEventListener('click', function () {
        generateBrowserSshKeyPair()
          .then(function (keyPair) {
            if (els.accountSshPublicKey) {
              els.accountSshPublicKey.value = keyPair.publicKey;
            }
            syncSshAccountActionState();
            triggerTextDownload('id_rsa', keyPair.privateKeyPem);
            triggerTextDownload('id_rsa.pub', keyPair.publicKey + '\n');
            setOutput(els.outputAccount, 'Generated SSH key pair. Downloaded private key (id_rsa) and public key (id_rsa.pub) as files. Private key was never sent to the server.', 'ok');
          })
          .catch(function (err) {
            setOutput(els.outputAccount, 'Error: ' + err.message, 'error');
          });
      });
    }
    if (els.linkSshButton) {
      els.linkSshButton.addEventListener('click', function () {
        linkSshForAccount()
          .then(function () {
            setOutput(els.outputAccount, 'SSH key linked to your Nostr account.', 'ok');
          })
          .catch(function (err) {
            setOutput(els.outputAccount, 'Error: ' + err.message, 'error');
          });
      });
    }
    if (els.accountSshPublicKey) {
      els.accountSshPublicKey.addEventListener('input', function () {
        syncSshAccountActionState();
      });
      syncSshAccountActionState();
    }
    if (els.accountNostrPubkeyCopyButton) {
      els.accountNostrPubkeyCopyButton.addEventListener('click', function () {
        copyTextToClipboard(els.accountNostrPubkey ? els.accountNostrPubkey.value : '')
          .then(function (ok) {
            setOutput(els.outputAccount, ok ? 'Nostr pubkey copied.' : 'Could not copy Nostr pubkey.', ok ? 'ok' : 'warn');
          });
      });
    }
    if (els.accountNostrPubkeyToggleButton) {
      els.accountNostrPubkeyToggleButton.addEventListener('click', function () {
        const currentlyVisible = !!(els.accountNostrPubkey && els.accountNostrPubkey.classList.contains('is-visible'));
        setNostrPubkeyVisibility(!currentlyVisible);
      });
    }

    document.querySelectorAll('[data-toolbar]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const action = btn.getAttribute('data-toolbar');
        if (action === 'bold') { toggleWrap('**', '**'); return; }
        if (action === 'italic') { toggleWrap('*', '*'); return; }
        if (action === 'code') { toggleWrap('`', '`'); return; }
        if (action === 'code_block') { toggleCodeBlock(); return; }
        if (action === 'h2') { toggleHeadingOnCurrentLine(2); return; }
        if (action === 'h3') { toggleHeadingOnCurrentLine(3); return; }
        if (action === 'quote') { togglePrefixOnLines('> '); return; }
        if (action === 'ul') { togglePrefixOnLines('- '); return; }
        if (action === 'ol') { toggleOrderedListOnLines(); return; }
        if (action === 'link') { insertLink(); return; }
        if (action === 'image') { els.imagePicker.click(); return; }
      });
    });

    els.imagePicker.addEventListener('change', function () {
      if (els.imagePicker.files && els.imagePicker.files.length) {
        handleDroppedFiles(els.imagePicker.files).finally(function () {
          els.imagePicker.value = '';
        });
      }
    });

    [els.postTitle, els.postContent, els.postScheduleAt].forEach(function (el) {
      el.addEventListener('input', function () {
        renderPreview();
        const typing = (el === els.postTitle || el === els.postContent);
        queueAutosave(typing ? 'typing' : 'saving');
      });
    });

    publishModeInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        updatePrimaryPublishButton();
        queueAutosave('saving');
      });
    });

    els.draftsList.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const actionNode = target.closest('[data-draft-action][data-draft-id]');
      if (!(actionNode instanceof HTMLElement)) {
        return;
      }
      const action = actionNode.getAttribute('data-draft-action');
      const draftId = actionNode.getAttribute('data-draft-id');
      if (!action || !draftId) {
        return;
      }
      if (action === 'open' || action === 'edit' || action === 'delete' || action === 'toggle_menu') {
        event.preventDefault();
      }

      if (action === 'toggle_menu') {
        event.stopPropagation();
        const panels = Array.from(els.draftsList.querySelectorAll('[data-draft-menu-panel]'));
        let opened = '';
        panels.forEach(function (panel) {
          const thisDraftId = panel.getAttribute('data-draft-menu-panel');
          if (!thisDraftId) {
            return;
          }
          const openThis = thisDraftId === draftId ? panel.hidden : false;
          panel.hidden = !openThis;
          if (openThis) {
            opened = thisDraftId;
          }
        });
        state.draftsMenuOpenFor = opened;
        return;
      }

      if (action === 'open' || action === 'edit') {
        state.draftsMenuOpenFor = '';
        Array.from(els.draftsList.querySelectorAll('[data-draft-menu-panel]')).forEach(function (panel) {
          panel.hidden = true;
        });
        loadDraft(draftId).catch(function (err) {
          setOutput(els.outputCompose, 'Error: ' + err.message, 'error');
        });
      }
      if (action === 'delete') {
        state.draftsMenuOpenFor = '';
        Array.from(els.draftsList.querySelectorAll('[data-draft-menu-panel]')).forEach(function (panel) {
          panel.hidden = true;
        });
        deleteDraft(draftId).catch(function (err) {
          setOutput(els.outputCompose, 'Error: ' + err.message, 'error');
        });
      }
    });
    els.draftsList.addEventListener('dblclick', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('button')) {
        return;
      }
      const row = target.closest('.draft-row[data-draft-id]');
      if (!(row instanceof HTMLElement)) {
        return;
      }
      const draftId = row.getAttribute('data-draft-id') || '';
      if (!draftId) {
        return;
      }
      loadDraft(draftId).catch(function (err) {
        setOutput(els.outputCompose, 'Error: ' + err.message, 'error');
      });
    });
    document.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('.draft-menu')) {
        return;
      }
      state.draftsMenuOpenFor = '';
      Array.from(els.draftsList.querySelectorAll('[data-draft-menu-panel]')).forEach(function (panel) {
        panel.hidden = true;
      });
    });

    let dragDepth = 0;
    document.addEventListener('dragenter', function (event) {
      if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) {
        dragDepth += 1;
        els.dropOverlay.hidden = false;
        els.dropOverlay.classList.add('show');
        if (state.activeSection === 'files' && els.filesDropzone) {
          els.filesDropzone.classList.add('is-drop-active');
        }
      }
    });

    document.addEventListener('dragleave', function () {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        els.dropOverlay.classList.remove('show');
        els.dropOverlay.hidden = true;
        if (els.filesDropzone) {
          els.filesDropzone.classList.remove('is-drop-active');
        }
      }
    });

    document.addEventListener('dragover', function (event) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    });

    document.addEventListener('drop', function (event) {
      event.preventDefault();
      dragDepth = 0;
      els.dropOverlay.classList.remove('show');
      els.dropOverlay.hidden = true;
      if (els.filesDropzone) {
        els.filesDropzone.classList.remove('is-drop-active');
      }
      if (state.activeSection === 'files') {
        uploadAdminFiles(event.dataTransfer ? event.dataTransfer.files : []);
        return;
      }
      handleDroppedFiles(event.dataTransfer ? event.dataTransfer.files : []);
    });
  }

  function enforceSiteSettingsControlAlignment() {
    const siteTitleInput = document.getElementById('site-title');
    const themeSelect = document.getElementById('admin-theme');
    const feedItemsInput = document.getElementById('feed-items');
    const compact = window.matchMedia && window.matchMedia('(max-width: 520px)').matches;
    const labelColumn = compact ? '9.5rem' : '13.5rem';

    [siteTitleInput, themeSelect, feedItemsInput].forEach(function (control) {
      if (!(control instanceof HTMLElement)) {
        return;
      }
      const row = control.closest('.field-row');
      if (!(row instanceof HTMLElement)) {
        return;
      }
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.flexWrap = 'nowrap';
      row.style.gap = '0.72rem';
      row.style.gridTemplateColumns = '';
      row.style.columnGap = '';
      row.style.rowGap = '';

      const label = row.querySelector('label');
      if (label instanceof HTMLElement) {
        label.style.flex = '0 0 ' + labelColumn;
        label.style.width = labelColumn;
        label.style.maxWidth = labelColumn;
        label.style.marginBottom = '0';
        label.style.display = 'inline-flex';
        label.style.alignItems = 'center';
        label.style.gridColumn = '';
      }

      control.style.flex = '0 0 auto';
      control.style.gridColumn = '';
      control.style.justifySelf = '';
      control.style.alignSelf = 'center';
      control.style.margin = '0';
    });
  }

  bindEvents();
  enforceSiteSettingsControlAlignment();
  window.addEventListener('resize', enforceSiteSettingsControlAlignment);
  state.sidebarCollapsed = readSidebarCollapsePreference();
  applySidebarCollapseState(state.sidebarCollapsed, false);
  initSectionNavigation();
  checkAuth();
  refreshDraftLabel();
  updatePrimaryPublishButton();
  updateScheduledRowVisibility();
  setAutosaveStatus();
  setPreviewVisibility(state.previewVisible);
  renderPreview();
})();
