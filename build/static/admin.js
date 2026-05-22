(function () {
  const SITE_TITLE_CACHE_KEY = 'wizardry_blog_site_title_v1';
  const APPEND_SITE_TITLE_CACHE_KEY = 'wizardry_blog_append_site_title_to_page_title_v1';

  const state = {
    sessionToken: localStorage.getItem('session_token') || '',
    csrfToken: localStorage.getItem('csrf_token') || '',
    username: '',
    playerName: '',
    publishName: '',
    nostrPubkey: '',
    simplexContactInfo: '',
    simplexStatus: '',
    sshFingerprint: '',
    isAdmin: false,
    composeTags: [],
    composeTagsDraftText: '',
    composePostType: 'longform',
    composePostTypeLocked: false,
    composePostTypeToolbarCollapsed: true,
    composePostTypeToolbarCollapseTimer: null,
    composeShortformLimit: 280,
    composeShortformLimitEditing: false,
    composeUploadBusy: false,
    currentDraftId: '',
    composeSourcePostPath: '',
    composePostFilename: '',
    composePostFilenameEditing: false,
    composeOriginPlatforms: [],
    autosaveTimer: null,
    suspendAutosave: false,
    previewVisible: localStorage.getItem('blog_admin_preview_hidden') !== '1',
    nostrBridgeEnabled: false,
    originConfig: {
      available: false,
      platforms: [],
      enabled_platforms: [],
      default_platforms: []
    },
    plugins: {
      nostr_support: true,
      nostr_login: true,
      nostr_bridge: true,
      nostr_posts: true,
      zaps: true,
      btcpay: true,
      video_chat: false
    },
    pluginsSaveTimer: null,
    videoChatConfig: {
      participant_limit: 6,
      token_ttl_seconds: 3600,
      janus_wss: '',
      signaling_wss: ''
    },
    videoChatSaveTimer: null,
    videoChatOperatorInfo: null,
    videoChatOperatorPollTimer: null,
    videoChatAllowAdminCalls: false,
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
    filesMenuOpenFor: '',
    draftsMenuOpenFor: '',
    postsActionInFlight: false,
    postsCrosspostDialogOpen: false,
    postsCrosspostPath: '',
    postsCrosspostSelection: [],
    moderationActionInFlight: false,
    files: [],
    filesDeleting: {},
    unsavedPostDraftsByPath: {},
    postsCache: [],
    filePickerContext: 'files-admin',
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
    nostrPagesSaveTimer: null,
    nostrPagesSavePromise: null,
    nostrPagesSaveRevision: 0,
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
    nosterActionPending: '',
    zapsRuntimeInfo: null,
    zapsRuntimeReady: false,
    zapsRuntimeLoading: false,
    zapsRuntimeMessage: '',
    zapsRuntimeLog: '',
    zapsActionInFlight: false,
    zapsActionPending: '',
    zapWalletInfo: null,
    btcpayRuntimeInfo: null,
    btcpayCheckoutRuntimeInfo: null,
    btcpayActionInFlight: false,
    btcpayActionPending: '',
    composeSubmitInFlight: false,
    composeSubmitAction: '',
    initialContentPainted: false,
    loadedAdminSections: {},
    loadingAdminSections: {},
    preloadAdminStarted: false,
    preloadAdminDone: false,
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
    outputCrossposting: document.getElementById('output-crossposting'),
    outputNostrPages: document.getElementById('output-nostr-pages'),
    outputFiles: document.getElementById('output-files'),
    outputModeration: document.getElementById('output-moderation'),
    outputAccount: document.getElementById('output-account'),
    outputPlugins: document.getElementById('output-plugins'),
    outputVideoCalling: document.getElementById('output-video-calling'),
    outputZaps: document.getElementById('output-zaps'),
    outputBtcpay: document.getElementById('output-btcpay'),
    outputBtcpayCheckout: document.getElementById('output-btcpay-checkout'),
    outputUsers: document.getElementById('output-users'),
    nosterRuntime: document.getElementById('noster-runtime'),
    navNosterStatus: document.getElementById('admin-nav-noster-status'),
    navZapsStatus: document.getElementById('admin-nav-zaps-status'),
    navBtcpayStatus: document.getElementById('admin-nav-btcpay-status'),
    navBtcpayCheckoutStatus: document.getElementById('admin-nav-btcpay-checkout-status'),
    navVideoCallingStatus: document.getElementById('admin-nav-video-calling-status'),
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
    pluginNostrSupport: document.getElementById('plugin-nostr-support'),
    pluginNostrLogin: document.getElementById('plugin-nostr-login'),
    pluginNostrBridge: document.getElementById('plugin-nostr-bridge'),
    pluginNostrPosts: document.getElementById('plugin-nostr-posts'),
    pluginZaps: document.getElementById('plugin-zaps'),
    pluginBtcpay: document.getElementById('plugin-btcpay'),
    pluginVideoChat: document.getElementById('plugin-video-chat'),
    videoChatParticipantLimit: document.getElementById('video-chat-participant-limit'),
    videoChatTokenTtlSeconds: document.getElementById('video-chat-token-ttl-seconds'),
    videoChatJanusWss: document.getElementById('video-chat-janus-wss'),
    videoChatSignalingWss: document.getElementById('video-chat-signaling-wss'),
    videoChatPublicRooms: document.getElementById('video-chat-public-rooms'),
    videoChatRooms: document.getElementById('video-chat-rooms'),
    videoChatOperatorStatus: document.getElementById('video-chat-operator-status'),
    videoChatOperatorRefresh: document.getElementById('btn-video-chat-operator-refresh'),
    videoChatOperatorCallPanel: document.getElementById('video-chat-operator-call-panel'),
    videoChatOperatorCallStatus: document.getElementById('video-chat-operator-call-status'),
    videoChatOperatorWidget: document.getElementById('video-chat-operator-widget'),
    videoChatOperatorLeave: document.getElementById('btn-video-chat-operator-leave'),
    zapLud16: document.getElementById('zap-lud16'),
    zapWalletSummary: document.getElementById('zap-wallet-summary'),
    zapDefaultAmountSats: document.getElementById('zap-default-amount-sats'),
    zapsRuntime: document.getElementById('zaps-runtime'),
    zapsReceivedList: document.getElementById('zaps-received-list'),
    btcpayRuntime: document.getElementById('btcpay-runtime'),
    btcpayCheckoutRuntime: document.getElementById('btcpay-checkout-runtime'),
    nostrAuthorsSaveStatus: document.getElementById('nostr-authors-save-status'),
    nostrRelaysSaveStatus: document.getElementById('nostr-relays-save-status'),
    nostrBlocklistSaveStatus: document.getElementById('nostr-blocklist-save-status'),
    appendSiteTitleToPageTitle: document.getElementById('append-site-title-to-page-title'),
    newUsersAreAdmins: document.getElementById('new-users-are-admins'),
    crosspostingRuntime: document.getElementById('crossposting-runtime'),
    crosspostingEnabledAll: document.getElementById('crossposting-enabled-all'),
    crosspostingEnabledList: document.getElementById('crossposting-enabled-list'),
    crosspostingDefaultAll: document.getElementById('crossposting-default-all'),
    crosspostingDefaultList: document.getElementById('crossposting-default-list'),
    postTitle: document.getElementById('post-title'),
    composePostTypeToolbar: document.getElementById('compose-post-type-toolbar'),
    composePostTypeCurrentButton: document.getElementById('compose-post-type-current-btn'),
    composeNostrTargetPill: document.getElementById('compose-nostr-target-pill'),
    composeMediaTools: document.getElementById('compose-media-tools'),
    composeMediaActions: document.getElementById('compose-media-actions'),
    composeLinkFields: document.getElementById('compose-link-fields'),
    composeContentRow: document.getElementById('compose-content-row'),
    composePostFilenameRow: document.getElementById('compose-post-filename-row'),
    composePostFilenameDisplay: document.getElementById('compose-post-filename-display'),
    composePostFilenameLabel: document.getElementById('compose-post-filename-label'),
    composePostFilenameEditButton: document.getElementById('btn-compose-post-filename-edit'),
    composePostFilenameEditWrap: document.getElementById('compose-post-filename-edit-wrap'),
    composePostFilenameInput: document.getElementById('compose-post-filename-input'),
    composeCrosspostDetails: document.getElementById('compose-crosspost-details'),
    composeCrosspostSummary: document.getElementById('compose-crosspost-summary'),
    composeCrosspostNote: document.getElementById('compose-crosspost-note'),
    composeOriginSelectAll: document.getElementById('compose-origin-select-all'),
    composeOriginPlatformList: document.getElementById('compose-origin-platform-list'),
    composeLinkUrl: document.getElementById('compose-link-url'),
    composeLinkBody: document.getElementById('compose-link-body'),
    composeCaptureButton: document.getElementById('btn-compose-capture'),
    composeUploadMediaButton: document.getElementById('btn-compose-upload-media'),
    composeUploadFileButton: document.getElementById('btn-compose-upload-file'),
    composeUploadAudioButton: document.getElementById('btn-compose-upload-audio'),
    postTags: document.getElementById('post-tags'),
    postTagsInput: document.getElementById('post-tags-input'),
    postTagsEditor: document.getElementById('post-tags-editor'),
    postTagsPills: document.getElementById('post-tags-pills'),
    postTagsTokenEditor: document.getElementById('post-tags-token-editor'),
    postContent: document.getElementById('post-content'),
    composeShortformMeter: document.getElementById('compose-shortform-meter'),
    composeShortformLimitButton: document.getElementById('btn-compose-shortform-limit'),
    composeShortformLimitInput: document.getElementById('compose-shortform-limit-input'),
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
    postCrosspostDialog: document.getElementById('post-crosspost-dialog'),
    postCrosspostForm: document.getElementById('post-crosspost-form'),
    postCrosspostSubtitle: document.getElementById('post-crosspost-subtitle'),
    postCrosspostList: document.getElementById('post-crosspost-list'),
    postCrosspostCancel: document.getElementById('post-crosspost-cancel'),
    postCrosspostSubmit: document.getElementById('post-crosspost-submit'),
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
    accountPublishName: document.getElementById('account-publish-name'),
    accountNostrPubkey: document.getElementById('account-nostr-pubkey'),
    accountNostrPubkeyCopyButton: document.getElementById('btn-account-pubkey-copy'),
    accountNostrPubkeyToggleButton: document.getElementById('btn-account-pubkey-toggle'),
    accountSimplexContact: document.getElementById('account-simplex-contact'),
    accountSimplexContactCopyButton: document.getElementById('btn-account-simplex-copy'),
    accountSimplexContactToggleButton: document.getElementById('btn-account-simplex-toggle'),
    accountSshPublicKey: document.getElementById('account-ssh-public-key'),
    accountVideoChatAllowAdminCalls: document.getElementById('account-video-chat-allow-admin-calls'),
    autosaveStatus: document.getElementById('autosave-status'),
    publishNowButton: document.getElementById('btn-publish-now'),
    mirrorNostrButton: document.getElementById('btn-mirror-nostr'),
    bindPasskeyButton: document.getElementById('btn-bind-passkey'),
    generateSshButton: document.getElementById('btn-generate-ssh'),
    linkSshButton: document.getElementById('btn-link-ssh'),
    imagePicker: document.getElementById('image-picker'),
    capturePicker: document.getElementById('capture-picker'),
    audioPicker: document.getElementById('audio-picker'),
    filePicker: document.getElementById('file-picker'),
    dropOverlay: document.getElementById('drop-overlay'),
    sidebarToggleButton: document.getElementById('btn-admin-sidebar-toggle'),
    sidebarRevealButton: document.getElementById('btn-admin-sidebar-reveal'),
    adminContent: document.querySelector('.admin-content'),
    sectionButtons: Array.from(document.querySelectorAll('[data-admin-nav]')),
    sections: Array.from(document.querySelectorAll('[data-admin-section]'))
  };
  let themeSwitchVisualTimer = null;

  let publishModeInputs = [];
  let publishDestinationInputs = [];
  const COMPOSE_POST_TYPES = ['shortform', 'longform', 'capture-media', 'upload-media', 'attachment', 'audio-note', 'link-share', 'go-live'];
  const COMPOSE_POST_TYPES_ENABLED = ['shortform', 'longform', 'capture-media', 'upload-media', 'attachment', 'audio-note', 'link-share'];
  const ADMIN_SIDEBAR_COLLAPSED_KEY = 'blog_admin_sidebar_collapsed_v1';
  const LOCAL_DRIP_LEASE_KEY = 'blog_local_drip_lease_v1';
  const LOCAL_DRIP_ENABLED_KEY = 'blog_local_drip_enabled_v1';
  const LOCAL_DRIP_LEASE_MS = 45000;
  const LOCAL_DRIP_TICK_MS = 15000;
  const ADMIN_COMPOSE_SESSION_KEY_PREFIX = 'blog_admin_compose_session_v1:';
  let themeSwapToken = 0;

  function refreshComposeRadioInputs() {
    publishModeInputs = Array.from(document.querySelectorAll('input[name="publish-mode"]'));
    publishDestinationInputs = Array.from(document.querySelectorAll('input[name="publish-destination"]'));
  }

  refreshComposeRadioInputs();

  function arrayFromMaybe(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function originConfigPlatformIds(platforms) {
    return arrayFromMaybe(platforms).map(function (platform) {
      return String(platform && platform.id || '').trim().toLowerCase();
    }).filter(Boolean);
  }

  function normalizeOriginPlatformList(raw, allowed) {
    const allowedIds = Array.isArray(allowed) && allowed.length
      ? allowed.map(function (item) { return String(item || '').trim().toLowerCase(); }).filter(Boolean)
      : originConfigPlatformIds((state.originConfig && state.originConfig.platforms) || []);
    let list = [];
    if (Array.isArray(raw)) {
      list = raw.slice();
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) {
        if (trimmed.charAt(0) === '[') {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              list = parsed.slice();
            }
          } catch (_err) {
            list = trimmed.split(',');
          }
        } else {
          list = trimmed.split(',');
        }
      }
    }
    const wanted = new Set(list.map(function (item) {
      return String(item || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    }).filter(Boolean));
    return allowedIds.filter(function (id) {
      return wanted.has(id);
    });
  }

  function normalizeOriginConfig(origin) {
    const source = origin && typeof origin === 'object' ? origin : {};
    const platforms = arrayFromMaybe(source.platforms).map(function (platform) {
      const id = String(platform && platform.id || '').trim().toLowerCase();
      if (!id) {
        return null;
      }
      return {
        id: id,
        family: String(platform && platform.family || '').trim().toLowerCase(),
        site_enabled: !!(platform && platform.site_enabled),
        default_selected: !!(platform && platform.default_selected)
      };
    }).filter(Boolean);
    const allIds = originConfigPlatformIds(platforms);
    const enabled = normalizeOriginPlatformList(arrayFromMaybe(source.enabled_platforms), allIds);
    const defaults = normalizeOriginPlatformList(arrayFromMaybe(source.default_platforms), enabled);
    return {
      available: !!source.available,
      public_base_url: String(source.public_base_url || '').trim(),
      platforms: platforms,
      enabled_platforms: enabled,
      default_platforms: defaults
    };
  }

  function originPlatformInfo(platformId) {
    const id = String(platformId || '').trim().toLowerCase();
    return arrayFromMaybe(state.originConfig && state.originConfig.platforms).find(function (platform) {
      return String(platform && platform.id || '') === id;
    }) || { id: id, family: '' };
  }

  function originTitleize(text) {
    return String(text || '').trim().replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, function (ch) {
      return ch.toUpperCase();
    });
  }

  function originPlatformLabel(platformId) {
    const id = String(platformId || '').trim().toLowerCase();
    const labels = {
      mastodon: 'Mastodon',
      misskey: 'Misskey',
      lemmy: 'Lemmy',
      kbin: 'kbin',
      bluesky: 'Bluesky',
      reddit: 'Reddit',
      x: 'X',
      tumblr: 'Tumblr',
      facebook: 'Facebook',
      minds: 'Minds',
      mirror: 'Mirror',
      telegram: 'Telegram'
    };
    if (labels[id]) {
      return labels[id];
    }
    return originTitleize(id) || 'Origin';
  }

  function originPlatformShortLabel(platformId) {
    const id = String(platformId || '').trim().toLowerCase();
    const labels = {
      mastodon: 'Ma',
      misskey: 'Mi',
      lemmy: 'Le',
      kbin: 'Kb',
      bluesky: 'B',
      reddit: 'R',
      x: 'X',
      tumblr: 'Tu',
      facebook: 'Fb',
      minds: 'Mn',
      mirror: 'Mr',
      telegram: 'Tg'
    };
    if (labels[id]) {
      return labels[id];
    }
    return (originPlatformLabel(id).charAt(0) || 'O').toUpperCase();
  }

  function originPlatformFamilyLabel(platformId) {
    const family = String(originPlatformInfo(platformId).family || '').trim().toLowerCase();
    const labels = {
      activitypub: 'ActivityPub',
      fediverse: 'Fediverse',
      api: 'Native API',
      atproto: 'AT Protocol',
      bridge: 'Bridge target',
      paragraph: 'Paragraph-style teaser',
      message: 'Messaging'
    };
    return labels[family] || originTitleize(family) || 'Origin destination';
  }

  function originPlatformIconHtml(platformId) {
    const id = String(platformId || '').trim().toLowerCase();
    const family = String(originPlatformInfo(id).family || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'generic';
    return '<span class="crosspost-platform-icon crosspost-platform-icon-' + escapeAttr(id || 'generic') + ' crosspost-platform-icon-family-' + escapeAttr(family) + '" aria-hidden="true">' + escapeHtml(originPlatformShortLabel(id)) + '</span>';
  }

  function originSummaryText(count) {
    const total = Number(count || 0);
    if (total <= 0) {
      return 'Will not be cross-posted';
    }
    if (total === 1) {
      return 'Will be cross-posted to 1 site';
    }
    return 'Will be cross-posted to ' + String(total) + ' sites';
  }

  function originDefaultSummaryText(count) {
    const total = Number(count || 0);
    if (total <= 0) {
      return 'New posts default to no cross-post destinations.';
    }
    if (total === 1) {
      return 'New posts default to 1 cross-post destination.';
    }
    return 'New posts default to ' + String(total) + ' cross-post destinations.';
  }

  function originStatusLabel(status) {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'published' || value === 'ok') {
      return 'Published';
    }
    if (value === 'failed') {
      return 'Failed';
    }
    if (value === 'fetch-failed') {
      return 'Fetch failed';
    }
    if (value === 'mismatch') {
      return 'Remote differs';
    }
    if (value === 'not_selected') {
      return 'Not selected';
    }
    if (value === 'skipped') {
      return 'Skipped';
    }
    if (value === 'outdated') {
      return 'Outdated';
    }
    return 'Not published';
  }

  function originStatusClass(status) {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'published' || value === 'ok') {
      return 'is-published';
    }
    if (value === 'failed') {
      return 'is-failed';
    }
    if (value === 'outdated' || value === 'fetch-failed' || value === 'mismatch') {
      return 'is-outdated';
    }
    if (value === 'skipped') {
      return 'is-skipped';
    }
    if (value === 'not_selected') {
      return 'is-unselected';
    }
    return 'is-pending';
  }

  function normalizePostCrossposting(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const rawPlatforms = arrayFromMaybe(source.platforms);
    const discoveredIds = originConfigPlatformIds(rawPlatforms);
    const allowedIds = discoveredIds.length
      ? discoveredIds
      : originConfigPlatformIds((state.originConfig && state.originConfig.platforms) || []);
    const rawEnabled = arrayFromMaybe(source.enabled_platforms);
    const enabled = normalizeOriginPlatformList(rawEnabled.length ? rawEnabled : allowedIds, allowedIds);
    const platformMap = {};
    rawPlatforms.forEach(function (platform) {
      const id = String(platform && platform.id || '').trim().toLowerCase();
      if (!id) {
        return;
      }
      platformMap[id] = {
        id: id,
        family: String(platform && platform.family || '').trim().toLowerCase(),
        selected: !!(platform && platform.selected),
        status: String(platform && platform.status || '').trim().toLowerCase() || 'unpublished',
        remote_url: String(platform && platform.remote_url || '').trim()
      };
    });
    const orderedPlatforms = enabled.map(function (platformId) {
      const existing = platformMap[platformId];
      if (existing) {
        return existing;
      }
      return {
        id: platformId,
        family: String(originPlatformInfo(platformId).family || '').trim().toLowerCase(),
        selected: false,
        status: 'unpublished',
        remote_url: ''
      };
    });
    const publishedCount = orderedPlatforms.filter(function (platform) {
      return platform.status === 'published' || platform.status === 'ok';
    }).length;
    const selectedCount = orderedPlatforms.filter(function (platform) {
      return !!platform.selected;
    }).length;
    const remainingCount = orderedPlatforms.filter(function (platform) {
      return platform.status !== 'published' && platform.status !== 'ok';
    }).length;
    return {
      available: !!source.available,
      platforms: orderedPlatforms,
      enabled_platforms: enabled,
      enabled_count: enabled.length,
      selected_count: selectedCount,
      published_count: publishedCount,
      remaining_count: remainingCount,
      needs_action: typeof source.needs_action === 'boolean' ? source.needs_action : remainingCount > 0
    };
  }

  function setComposeOriginPlatforms(raw) {
    state.composeOriginPlatforms = normalizeOriginPlatformList(raw, state.originConfig.enabled_platforms);
    renderComposeCrosspostingUi();
  }

  function renderComposeCrosspostingUi() {
    const config = normalizeOriginConfig(state.originConfig);
    state.originConfig = config;
    const enabled = arrayFromMaybe(config.enabled_platforms);
    const selected = normalizeOriginPlatformList(state.composeOriginPlatforms, enabled);
    state.composeOriginPlatforms = selected;

    if (els.composeOriginPlatformList) {
      if (!config.available) {
        els.composeOriginPlatformList.innerHTML = '';
      } else if (!enabled.length) {
        els.composeOriginPlatformList.innerHTML = '';
      } else {
        let html = '';
        enabled.forEach(function (platformId) {
          html += '<label class="crossposting-platform-option" for="compose-origin-platform-' + escapeAttr(platformId) + '">';
          html += '<input type="checkbox" id="compose-origin-platform-' + escapeAttr(platformId) + '" data-compose-origin-platform="' + escapeAttr(platformId) + '"' + (selected.indexOf(platformId) >= 0 ? ' checked' : '') + '>';
          html += originPlatformIconHtml(platformId);
          html += '<span class="crossposting-platform-copy"><strong>' + escapeHtml(originPlatformLabel(platformId)) + '</strong><span>' + escapeHtml(originPlatformFamilyLabel(platformId)) + '</span></span>';
          html += '</label>';
        });
        els.composeOriginPlatformList.innerHTML = html;
      }
    }

    if (els.composeOriginSelectAll) {
      const allSelected = !!enabled.length && selected.length === enabled.length;
      els.composeOriginSelectAll.checked = allSelected;
      els.composeOriginSelectAll.indeterminate = !!enabled.length && selected.length > 0 && selected.length < enabled.length;
      els.composeOriginSelectAll.disabled = !config.available || !enabled.length;
    }
    if (els.composeCrosspostSummary) {
      if (!config.available) {
        els.composeCrosspostSummary.textContent = 'Cross-posting unavailable';
      } else {
        els.composeCrosspostSummary.textContent = originSummaryText(selected.length);
      }
    }
    if (els.composeCrosspostNote) {
      if (!config.available) {
        els.composeCrosspostNote.textContent = 'Origin is not available on this server yet.';
      } else if (!enabled.length) {
        els.composeCrosspostNote.textContent = 'Enable destinations on the Cross-posting page to use Origin from Compose.';
      } else {
        els.composeCrosspostNote.textContent = 'Origin emits this post to the selected destinations right after publish.';
      }
    }
    if (els.composeCrosspostDetails) {
      els.composeCrosspostDetails.classList.toggle('is-unavailable', !config.available || !enabled.length);
    }
  }

  function renderCrosspostingSettingsUi() {
    const config = normalizeOriginConfig(state.originConfig);
    state.originConfig = config;
    const platformIds = originConfigPlatformIds(config.platforms);
    const enabled = normalizeOriginPlatformList(config.enabled_platforms, platformIds);
    const defaults = normalizeOriginPlatformList(config.default_platforms, enabled);
    state.originConfig.enabled_platforms = enabled;
    state.originConfig.default_platforms = defaults;

    if (els.crosspostingRuntime) {
      if (!config.available) {
        els.crosspostingRuntime.innerHTML = '<p class="muted">Origin is not available on this server.</p>';
      } else if (!config.platforms.length) {
        els.crosspostingRuntime.innerHTML = '<p class="muted">Origin is available, but it is not reporting any enabled platform adapters.</p>';
      } else {
        els.crosspostingRuntime.innerHTML = '<p class="muted">' + escapeHtml(originDefaultSummaryText(defaults.length)) + '</p>'
          + (config.public_base_url ? '<p class="muted">Cross-post links point to ' + escapeHtml(config.public_base_url) + '.</p>' : '');
      }
    }

    if (els.crosspostingEnabledList) {
      let enabledHtml = '';
      arrayFromMaybe(config.platforms).forEach(function (platform) {
        const checked = enabled.indexOf(platform.id) >= 0;
        enabledHtml += '<label class="crossposting-platform-option" for="crossposting-enabled-' + escapeAttr(platform.id) + '">';
        enabledHtml += '<input type="checkbox" id="crossposting-enabled-' + escapeAttr(platform.id) + '" data-crossposting-enabled-platform="' + escapeAttr(platform.id) + '"' + (checked ? ' checked' : '') + '>';
        enabledHtml += originPlatformIconHtml(platform.id);
        enabledHtml += '<span class="crossposting-platform-copy"><strong>' + escapeHtml(originPlatformLabel(platform.id)) + '</strong><span>' + escapeHtml(originPlatformFamilyLabel(platform.id)) + '</span></span>';
        enabledHtml += '</label>';
      });
      els.crosspostingEnabledList.innerHTML = enabledHtml;
    }

    if (els.crosspostingDefaultList) {
      let defaultHtml = '';
      arrayFromMaybe(config.platforms).forEach(function (platform) {
        const enabledHere = enabled.indexOf(platform.id) >= 0;
        const checked = defaults.indexOf(platform.id) >= 0;
        defaultHtml += '<label class="crossposting-platform-option' + (enabledHere ? '' : ' is-disabled') + '" for="crossposting-default-' + escapeAttr(platform.id) + '">';
        defaultHtml += '<input type="checkbox" id="crossposting-default-' + escapeAttr(platform.id) + '" data-crossposting-default-platform="' + escapeAttr(platform.id) + '"' + (checked ? ' checked' : '') + (enabledHere ? '' : ' disabled') + '>';
        defaultHtml += originPlatformIconHtml(platform.id);
        defaultHtml += '<span class="crossposting-platform-copy"><strong>' + escapeHtml(originPlatformLabel(platform.id)) + '</strong><span>' + escapeHtml(enabledHere ? 'Checked by default for new posts' : 'Enable this destination first') + '</span></span>';
        defaultHtml += '</label>';
      });
      els.crosspostingDefaultList.innerHTML = defaultHtml;
    }

    if (els.crosspostingEnabledAll) {
      els.crosspostingEnabledAll.checked = !!platformIds.length && enabled.length === platformIds.length;
      els.crosspostingEnabledAll.indeterminate = enabled.length > 0 && enabled.length < platformIds.length;
      els.crosspostingEnabledAll.disabled = !platformIds.length;
    }
    if (els.crosspostingDefaultAll) {
      els.crosspostingDefaultAll.checked = !!enabled.length && defaults.length === enabled.length;
      els.crosspostingDefaultAll.indeterminate = defaults.length > 0 && defaults.length < enabled.length;
      els.crosspostingDefaultAll.disabled = !enabled.length;
    }

    if (!state.currentDraftId && !state.composeSourcePostPath && !state.composeOriginPlatforms.length) {
      state.composeOriginPlatforms = defaults.slice();
    } else {
      state.composeOriginPlatforms = normalizeOriginPlatformList(state.composeOriginPlatforms, enabled);
    }
    renderComposeCrosspostingUi();
  }

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

  function adminComposeSessionStorageKey() {
    const username = String(state.username || '').trim().toLowerCase();
    if (!username) {
      return '';
    }
    return ADMIN_COMPOSE_SESSION_KEY_PREFIX + username;
  }

  function readAdminComposeSession() {
    const key = adminComposeSessionStorageKey();
    if (!key) {
      return null;
    }
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const section = String(parsed.active_section || '').trim().toLowerCase();
      const draftId = String(parsed.draft_id || '').trim();
      return {
        activeSection: section,
        draftId: draftId
      };
    } catch (_err) {
      return null;
    }
  }

  function persistAdminComposeSession() {
    if (!state.isAdmin) {
      return;
    }
    const key = adminComposeSessionStorageKey();
    if (!key) {
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify({
        active_section: String(state.activeSection || '').trim().toLowerCase(),
        draft_id: String(state.currentDraftId || '').trim()
      }));
    } catch (_err) {
      // Ignore storage failures.
    }
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
    if (state.isAdmin) {
      const button = sectionButtonForName(name);
      if (button && button.hidden) {
        return 'plugins';
      }
    }
    return name;
  }

  function readComposeLaunchParams() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const draftId = String(params.get('draft_id') || '').trim();
      const lockRaw = String(params.get('lock_post_type') || '').trim().toLowerCase();
      const lockPostType = lockRaw === '1' || lockRaw === 'true' || lockRaw === 'yes';
      return {
        draftId: draftId,
        lockPostType: lockPostType
      };
    } catch (_err) {
      return { draftId: '', lockPostType: false };
    }
  }

  function clearComposeLaunchParamsFromUrl() {
    try {
      const url = new URL(window.location.href);
      let changed = false;
      ['draft_id', 'lock_post_type'].forEach(function (key) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      });
      if (!changed) {
        return;
      }
      const nextSearch = url.searchParams.toString();
      window.history.replaceState({}, '', url.pathname + (nextSearch ? ('?' + nextSearch) : '') + (url.hash || ''));
    } catch (_err) {
      // Ignore URL rewrite failures.
    }
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
      return 'Lightning';
    }
    if (key === 'plugins') {
      return 'Plugins';
    }
    return 'Admin';
  }

  function syncAdminDocumentTitle(sectionName) {
    const sectionTitle = adminSectionDisplayTitle(sectionName);
    const pageTitle = sectionTitle === 'Admin' ? 'Admin' : (sectionTitle + ' · Admin');
    if (typeof window.__wizardryApplyPageTitle === 'function') {
      window.__wizardryApplyPageTitle(pageTitle);
    } else {
      document.title = pageTitle;
    }
  }

  function adminSectionHasLazyLoader(sectionName) {
    const section = String(sectionName || '').trim();
    return [
      'settings',
      'plugins',
      'video-calling',
      'nostr-bridge',
      'zaps',
      'btcpay',
      'btcpay-checkout',
      'users',
      'drafts',
      'queue',
      'posts',
      'nostr-pages',
      'pages',
      'files',
      'moderation'
    ].indexOf(section) >= 0;
  }

  function adminSectionNeedsLazyLoad(sectionName) {
    const section = String(sectionName || '').trim();
    return !!(state.isAdmin && adminSectionHasLazyLoader(section) && !state.loadedAdminSections[section]);
  }

  function setAdminSectionLoading(sectionName, loading) {
    const section = String(sectionName || '').trim();
    const node = sectionNodeForName(section);
    if (!section || !node) {
      return;
    }
    const busy = !!loading;
    state.loadingAdminSections[section] = busy;
    node.classList.toggle('is-loading', busy);
    if (busy) {
      node.setAttribute('aria-busy', 'true');
    } else {
      node.removeAttribute('aria-busy');
    }
  }

  function activateSection(name, updateHash) {
    let sectionName = (!state.isAdmin ? 'account' : (name || 'settings'));
    if (state.isAdmin) {
      const targetButton = sectionButtonForName(sectionName);
      if (targetButton && targetButton.hidden) {
        sectionName = 'plugins';
      }
    }
    if (sectionName !== 'posts') {
      if (els.postCrosspostDialog instanceof HTMLDialogElement && els.postCrosspostDialog.open) {
        els.postCrosspostDialog.close('navigate');
      } else {
        resetPostCrosspostDialogState();
      }
    }
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
    if (adminSectionNeedsLazyLoad(sectionName)) {
      setAdminSectionLoading(sectionName, true);
    }
    if (updateHash) {
      if (window.location.hash !== '#' + sectionName) {
        history.replaceState(null, '', '#' + sectionName);
      }
    }
    persistAdminComposeSession();
    syncUsersAutoRefresh();
    syncDraftsAutoRefresh();
    syncQueueAutoRefresh();
    syncPostsAutoRefresh();
    syncNosterAutoRefresh();
    syncZapsAutoRefresh();
    syncBtcpayAutoRefresh();
    syncModerationAutoRefresh();
    syncVideoChatOperatorAutoRefresh();
    renderUploadJobs();
    maybeLoadAdminSection(sectionName, true);
  }

  async function maybeLoadAdminSection(sectionName, silent) {
    const section = String(sectionName || '').trim();
    if (!state.isAdmin || !section || section === 'account') {
      return;
    }
    if (!adminSectionHasLazyLoader(section)) {
      return;
    }
    if (state.loadedAdminSections[section]) {
      return;
    }
    setAdminSectionLoading(section, true);
    try {
      if (section === 'settings') {
        await loadConfig();
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'plugins') {
        await loadConfig();
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'video-calling') {
        await loadConfig();
        await loadVideoChatOperatorStatus({ background: !!silent });
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'nostr-bridge') {
        await loadNosterRuntime();
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'zaps') {
        await loadConfig();
        await loadZapsRuntime();
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'btcpay') {
        await loadBtcpayRuntime();
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'btcpay-checkout') {
        await loadBtcpayCheckoutRuntime();
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'users') {
        await loadUsers(false);
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'drafts') {
        await loadDrafts();
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'queue') {
        await loadQueue();
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'posts') {
        await loadPosts();
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'nostr-pages' || section === 'pages') {
        await loadNostrPages();
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'files') {
        await loadFiles();
        state.loadedAdminSections[section] = true;
        return;
      }
      if (section === 'moderation') {
        await loadModeration();
        state.loadedAdminSections[section] = true;
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
      if (section === 'plugins') {
        setOutput(els.outputPlugins, 'Error: ' + err.message, 'error');
        return;
      }
      if (section === 'video-calling') {
        setOutput(els.outputVideoCalling, 'Error: ' + err.message, 'error');
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
      if (section === 'btcpay-checkout') {
        setOutput(els.outputBtcpayCheckout, 'Error: ' + err.message, 'error');
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
    } finally {
      setAdminSectionLoading(section, false);
    }
  }

  async function preloadAdminFirstPaint() {
    if (!state.isAdmin) {
      return;
    }
    if (state.preloadAdminDone) {
      return;
    }
    if (state.preloadAdminStarted) {
      return;
    }
    state.preloadAdminStarted = true;

    const configTask = loadConfig();
    const jobs = [
      {
        sections: ['settings'],
        task: configTask
      },
      {
        sections: ['plugins'],
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
        sections: ['btcpay-checkout'],
        task: loadBtcpayCheckoutRuntime()
      }
    ].filter(function (job) {
      return !job.sections.every(function (section) {
        return !!state.loadedAdminSections[section];
      });
    });

    try {
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
      state.preloadAdminDone = true;
    } finally {
      state.preloadAdminStarted = false;
    }
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
    if (!enabled) {
      syncPluginControlledSections();
    }
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

  function lockSimplexContactField() {
    if (!els.accountSimplexContact) {
      return;
    }
    const lockedValue = String(els.accountSimplexContact.value || '');
    els.accountSimplexContact.readOnly = true;
    els.accountSimplexContact.setAttribute('readonly', 'readonly');
    els.accountSimplexContact.setAttribute('aria-readonly', 'true');
    els.accountSimplexContact.addEventListener('beforeinput', function (event) {
      event.preventDefault();
    });
    els.accountSimplexContact.addEventListener('input', function () {
      if (els.accountSimplexContact.value !== lockedValue) {
        els.accountSimplexContact.value = lockedValue;
      }
    });
    setSimplexContactVisibility(false);
    syncSimplexContactActionState();
  }

  function setSimplexContactVisibility(visible) {
    if (!els.accountSimplexContact) {
      return;
    }
    const shown = !!visible;
    els.accountSimplexContact.classList.toggle('is-visible', shown);
    if (els.accountSimplexContactToggleButton) {
      els.accountSimplexContactToggleButton.classList.toggle('is-visible', shown);
      els.accountSimplexContactToggleButton.setAttribute('aria-label', shown ? 'Hide SimpleX contact' : 'Show SimpleX contact');
      els.accountSimplexContactToggleButton.setAttribute('title', shown ? 'Hide SimpleX contact' : 'Show SimpleX contact');
    }
  }

  function syncSimplexContactActionState() {
    const hasValue = !!(els.accountSimplexContact && String(els.accountSimplexContact.value || '').trim());
    if (els.accountSimplexContactCopyButton) {
      els.accountSimplexContactCopyButton.disabled = !hasValue;
    }
    if (els.accountSimplexContactToggleButton) {
      els.accountSimplexContactToggleButton.disabled = !hasValue;
    }
  }

  function applyThemePreview(theme) {
    const pickedTheme = (theme || '').trim() || 'adept';
    const themeLink = document.getElementById('theme-stylesheet');
    if (themeLink) {
      const href = '/static/themes/' + encodeURIComponent(pickedTheme) + '.css?v=20260521-vote-arrow-chrome3';
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
    return text || 'Site';
  }

  function normalizeAppendSiteTitleEnabled(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
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

  function applyPageTitleConfig(siteTitle, appendSiteTitle) {
    const normalizedSiteTitle = normalizeSiteTitle(siteTitle);
    const enabled = normalizeAppendSiteTitleEnabled(appendSiteTitle);
    if (typeof window.__wizardrySetPageTitleConfig === 'function') {
      window.__wizardrySetPageTitleConfig(normalizedSiteTitle, enabled);
      return;
    }
    try {
      localStorage.setItem(SITE_TITLE_CACHE_KEY, normalizedSiteTitle);
      localStorage.setItem(APPEND_SITE_TITLE_CACHE_KEY, enabled ? '1' : '0');
    } catch (_err) {
      // Ignore storage failures.
    }
    if (typeof window.__wizardryApplyPageTitle === 'function') {
      window.__wizardryApplyPageTitle();
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
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

  function ensureVideoChatWidgetScript() {
    if (window.initVideoChatWidget && typeof window.initVideoChatWidget === 'function') {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      const existing = document.querySelector('script[data-video-chat-widget="1"]');
      if (existing) {
        existing.addEventListener('load', function () {
          resolve(!!(window.initVideoChatWidget && typeof window.initVideoChatWidget === 'function'));
        }, { once: true });
        existing.addEventListener('error', function () { resolve(false); }, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = '/static/video-chat-widget.js?v=20260521-video-operator2';
      script.async = true;
      script.setAttribute('data-video-chat-widget', '1');
      script.onload = function () {
        resolve(!!(window.initVideoChatWidget && typeof window.initVideoChatWidget === 'function'));
      };
      script.onerror = function () { resolve(false); };
      document.head.appendChild(script);
    });
  }

  function fileAccessUrl(url) {
    syncAuthStateFromStorage();
    const raw = String(url || '').trim();
    if (!raw) {
      return raw;
    }
    let parsed;
    try {
      parsed = new URL(raw, window.location.origin);
    } catch (_err) {
      return raw;
    }
    if (parsed.origin !== window.location.origin) {
      return raw;
    }
    const isFileUrl = parsed.pathname === '/cgi/blog-file' ||
      parsed.pathname.indexOf('/cgi/blog-file/') === 0 ||
      parsed.pathname === '/files' ||
      parsed.pathname.indexOf('/files/') === 0 ||
      parsed.pathname === '/cgi/files' ||
      parsed.pathname.indexOf('/cgi/files/') === 0;
    if (!isFileUrl) {
      return raw;
    }
    const params = parsed.searchParams;
    if (!params.get('session_token') && state.sessionToken) {
      params.set('session_token', state.sessionToken);
    }
    if (!params.get('csrf_token') && state.csrfToken) {
      params.set('csrf_token', state.csrfToken);
    }
    const query = params.toString();
    return parsed.pathname + (query ? ('?' + query) : '');
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
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
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
            updateUploadJob(job.id, {
              url: String(data.url || '').trim()
            });
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

  function normalizeComposePublishDestination(destination) {
    const shared = (typeof window !== 'undefined' && window.BlogComposeShared) ? window.BlogComposeShared : null;
    if (shared && typeof shared.normalizePublishDestination === 'function') {
      return shared.normalizePublishDestination(destination);
    }
    const raw = String(destination || '').trim().toLowerCase();
    if (raw === 'nostr_now') {
      return 'nostr_now';
    }
    return 'local_only';
  }

  function getPublishDestination() {
    const picked = publishDestinationInputs.find(function (input) { return input.checked; });
    return normalizeComposePublishDestination(picked ? picked.value : 'local_only');
  }

  function setPublishMode(mode) {
    const normalized = normalizeComposePublishMode(mode);
    publishModeInputs.forEach(function (input) {
      input.checked = input.value === normalized;
    });
    updatePrimaryPublishButton(normalized, getPublishDestination());
    updateScheduledRowVisibility(normalized);
    updateDripQueuePill(normalized);
  }

  function setPublishDestination(destination) {
    const normalized = normalizeComposePublishDestination(destination);
    publishDestinationInputs.forEach(function (input) {
      input.checked = input.value === normalized;
    });
    updatePrimaryPublishButton(getPublishMode(), normalized);
  }

  function updatePrimaryPublishButton(mode, destination) {
    if (!els.publishNowButton) {
      return;
    }
    if (state.composeSubmitInFlight) {
      const action = String(state.composeSubmitAction || '');
      if (action === 'queue_scheduled') {
        els.publishNowButton.textContent = 'Scheduling...';
      } else if (action === 'queue_drip') {
        els.publishNowButton.textContent = 'Enqueuing...';
      } else {
        els.publishNowButton.textContent = 'Publishing...';
      }
      els.publishNowButton.disabled = true;
      els.publishNowButton.setAttribute('aria-busy', 'true');
      els.publishNowButton.classList.add('is-loading');
      return;
    }
    els.publishNowButton.disabled = false;
    els.publishNowButton.removeAttribute('aria-busy');
    els.publishNowButton.classList.remove('is-loading');
    const picked = mode || getPublishMode();
    const target = normalizeComposePublishDestination(destination || getPublishDestination());
    const shared = (typeof window !== 'undefined' && window.BlogComposeShared) ? window.BlogComposeShared : null;
    if (shared && typeof shared.primaryPublishLabel === 'function') {
      els.publishNowButton.textContent = shared.primaryPublishLabel(picked, target, { postTypeLocked: !!state.composePostTypeLocked });
      return;
    }
    if (picked === 'scheduled') {
      els.publishNowButton.textContent = 'Schedule Post';
      return;
    }
    if (picked === 'drip') {
      els.publishNowButton.textContent = 'Enqueue Post';
      return;
    }
    els.publishNowButton.textContent = target === 'local_only' ? 'Publish to Server' : 'Publish to Nostr';
  }

  function renderComposeDestinationTemplate() {
    const row = document.querySelector('.compose-destination-row');
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const shared = (typeof window !== 'undefined' && window.BlogComposeShared) ? window.BlogComposeShared : null;
    if (!shared || typeof shared.renderPublishDestinationField !== 'function') {
      return;
    }
    const checked = row.querySelector('input[name="publish-destination"]:checked');
    const destination = normalizeComposePublishDestination(checked ? checked.value : 'local_only');
    row.innerHTML = shared.renderPublishDestinationField({
      inputName: 'publish-destination',
      destination: destination
    });
    refreshComposeRadioInputs();
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

  function normalizeComposePostType(raw) {
    const picked = String(raw || '').trim().toLowerCase();
    if (COMPOSE_POST_TYPES.indexOf(picked) >= 0) {
      return picked;
    }
    return 'longform';
  }

  function composeBackingPostType(postType) {
    const type = normalizeComposePostType(postType);
    if (type === 'attachment') {
      return 'longform';
    }
    return type;
  }

  function composePostTypeLabel(postType) {
    const type = normalizeComposePostType(postType);
    if (type === 'shortform') { return 'shortform'; }
    if (type === 'capture-media') { return 'capture media'; }
    if (type === 'upload-media') { return 'media upload'; }
    if (type === 'attachment') { return 'attachment'; }
    if (type === 'audio-note') { return 'audio note'; }
    if (type === 'link-share') { return 'link share'; }
    if (type === 'go-live') { return 'go live'; }
    return 'longform';
  }

  function composePostTypeIsTextual(postType) {
    const type = normalizeComposePostType(postType);
    return type === 'shortform' || type === 'longform';
  }

  function clearComposePostTypeCollapseTimer() {
    if (state.composePostTypeToolbarCollapseTimer) {
      window.clearTimeout(state.composePostTypeToolbarCollapseTimer);
      state.composePostTypeToolbarCollapseTimer = null;
    }
  }

  function applyComposePostTypeControlState() {
    const control = document.querySelector('[data-compose-type-control]');
    if (!control) {
      return;
    }
    const collapsed = !!state.composePostTypeToolbarCollapsed;
    control.classList.toggle('is-collapsed', collapsed);
    const wrap = control.querySelector('.compose-post-type-toolbar-wrap');
    if (wrap instanceof HTMLElement) {
      wrap.hidden = collapsed;
      wrap.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
    }
  }

  function setComposePostTypeToolbarCollapsed(collapsed, options) {
    const opts = options || {};
    state.composePostTypeToolbarCollapsed = !!collapsed;
    if (opts.clearTimer !== false && collapsed) {
      clearComposePostTypeCollapseTimer();
    }
    if (!opts.skipDom) {
      applyComposePostTypeControlState();
    }
  }

  function composeNostrTarget(postType) {
    const type = composeBackingPostType(postType);
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
    if (type === 'audio-note') {
      return { kind: '21', tags: 'url, m=audio/*, duration, alt' };
    }
    if (type === 'link-share') {
      return { kind: '1', tags: 'r, title, summary, image' };
    }
    return { kind: '30311', tags: 'streaming, starts, status=live' };
  }

  function composePostKindPillText(postType) {
    const type = composeBackingPostType(postType);
    const target = composeNostrTarget(type);
    if (type === 'longform') { return 'Long-form Content (kind ' + target.kind + ')'; }
    if (type === 'shortform') { return 'Shortform Post (kind ' + target.kind + ')'; }
    if (type === 'capture-media') { return 'Media Capture (kind ' + target.kind + ')'; }
    if (type === 'upload-media') { return 'Media Upload (kind ' + target.kind + ')'; }
    if (type === 'audio-note') { return 'Audio Note (kind ' + target.kind + ')'; }
    if (type === 'link-share') { return 'Link Share (kind ' + target.kind + ')'; }
    return 'Go Live (kind ' + target.kind + ')';
  }

  function composePostKindPillClass(postType) {
    const type = composeBackingPostType(postType);
    if (type === 'longform') { return 'is-type-nip23'; }
    if (type === 'capture-media' || type === 'upload-media') { return 'is-type-icon-gallery'; }
    if (type === 'audio-note') { return 'is-type-public-ranking'; }
    if (type === 'link-share') { return 'is-type-blog'; }
    if (type === 'shortform') { return 'is-type-list'; }
    return 'is-type-public-ranking';
  }

  function composeNostrTargetLabel(postType) {
    const type = composeBackingPostType(postType);
    const target = composeNostrTarget(type);
    return composePostKindPillText(type) + ' · ' + target.tags;
  }

  function normalizeComposeShortformLimit(raw) {
    const n = parseInt(String(raw || '').trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      return 280;
    }
    return Math.max(1, Math.min(5000, n));
  }

  function currentComposeShortformLimit() {
    state.composeShortformLimit = normalizeComposeShortformLimit(state.composeShortformLimit);
    return state.composeShortformLimit;
  }

  function enforceComposeShortformLimit() {
    if (!els.postContent) {
      return;
    }
    if (normalizeComposePostType(state.composePostType) !== 'shortform') {
      return;
    }
    const limit = currentComposeShortformLimit();
    if (String(els.postContent.value || '').length > limit) {
      els.postContent.value = String(els.postContent.value || '').slice(0, limit);
    }
  }

  function syncComposeShortformCounter() {
    if (!els.composeShortformMeter || !els.composeShortformLimitButton || !els.composeShortformLimitInput || !els.postContent) {
      return;
    }
    const shortform = normalizeComposePostType(state.composePostType) === 'shortform';
    if (!shortform) {
      els.composeShortformMeter.hidden = true;
      els.composeShortformLimitButton.hidden = true;
      els.composeShortformLimitInput.hidden = true;
      return;
    }
    const limit = currentComposeShortformLimit();
    enforceComposeShortformLimit();
    const count = String(els.postContent.value || '').length;
    els.composeShortformLimitButton.textContent = String(count) + '/' + String(limit);
    els.composeShortformLimitInput.value = String(limit);
    els.composeShortformMeter.hidden = false;
    els.composeShortformLimitButton.hidden = !!state.composeShortformLimitEditing;
    els.composeShortformLimitInput.hidden = !state.composeShortformLimitEditing;
  }

  function setComposeShortformLimit(raw, opts) {
    const options = opts || {};
    state.composeShortformLimit = normalizeComposeShortformLimit(raw);
    if (options.editing === true || options.editing === false) {
      state.composeShortformLimitEditing = !!options.editing;
    }
    enforceComposeShortformLimit();
    syncComposeShortformCounter();
    if (options.queueAutosave !== false) {
      queueAutosave('saving');
    }
  }

  function openComposePickerForType(postType) {
    const type = normalizeComposePostType(postType);
    if (type === 'capture-media' && els.capturePicker) {
      els.capturePicker.click();
      return;
    }
    if (type === 'upload-media' && els.imagePicker) {
      els.imagePicker.click();
      return;
    }
    if (type === 'attachment' && els.filePicker) {
      state.filePickerContext = 'compose-attachment';
      els.filePicker.click();
      return;
    }
    if (type === 'audio-note' && els.audioPicker) {
      els.audioPicker.click();
      return;
    }
    if (type === 'link-share' && els.composeLinkUrl) {
      window.setTimeout(function () {
        if (els.composeLinkUrl && typeof els.composeLinkUrl.focus === 'function') {
          els.composeLinkUrl.focus();
          if (typeof els.composeLinkUrl.select === 'function') {
            els.composeLinkUrl.select();
          }
        }
      }, 0);
    }
  }

  function syncComposePostTypeUi() {
    const type = normalizeComposePostType(state.composePostType);
    const linkShare = type === 'link-share';
    const showTitleField = type !== 'shortform';
    const locked = !!state.composePostTypeLocked;
    let activeTypeButton = null;
    if (els.composePostTypeToolbar) {
      let activeCount = 0;
      Array.from(els.composePostTypeToolbar.querySelectorAll('[data-post-type]')).forEach(function (node) {
        const picked = normalizeComposePostType(node.getAttribute('data-post-type') || '');
        const active = picked === type;
        const intrinsicDisabled = picked === 'go-live';
        const disabled = intrinsicDisabled || locked;
        node.disabled = disabled;
        node.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        node.classList.toggle('is-active', active);
        node.setAttribute('aria-pressed', active ? 'true' : 'false');
        if (active) {
          activeCount += 1;
          activeTypeButton = node;
        }
      });
      if (!activeCount) {
        const fallback = els.composePostTypeToolbar.querySelector('[data-post-type="longform"]');
        if (fallback instanceof HTMLElement) {
          fallback.classList.add('is-active');
          fallback.setAttribute('aria-pressed', 'true');
          activeTypeButton = fallback;
        }
      }
      els.composePostTypeToolbar.classList.toggle('is-locked', locked);
    }
    if (els.composePostTypeCurrentButton) {
      const icon = activeTypeButton ? activeTypeButton.querySelector('.compose-post-type-icon') : null;
      if (icon && typeof icon.outerHTML === 'string') {
        els.composePostTypeCurrentButton.innerHTML = icon.outerHTML + '<span class="sr-only">Choose post type</span>';
      }
      els.composePostTypeCurrentButton.disabled = locked;
      els.composePostTypeCurrentButton.setAttribute('aria-disabled', locked ? 'true' : 'false');
      if (locked) {
        els.composePostTypeCurrentButton.setAttribute('aria-label', 'Post type is locked for existing posts');
        els.composePostTypeCurrentButton.setAttribute('title', 'Post type is locked for existing posts');
      } else {
        els.composePostTypeCurrentButton.setAttribute('aria-label', 'Choose post type');
        els.composePostTypeCurrentButton.setAttribute('title', 'Choose post type');
      }
    }
    applyComposePostTypeControlState();
    if (els.composeMediaTools) {
      const showMedia = !composePostTypeIsTextual(type);
      els.composeMediaTools.hidden = !showMedia;
    }
    if (els.composeMediaActions) {
      els.composeMediaActions.hidden = true;
    }
    if (els.composeLinkFields) {
      els.composeLinkFields.hidden = !linkShare;
      els.composeLinkFields.style.display = linkShare ? 'grid' : 'none';
    }
    if (els.composeContentRow) {
      els.composeContentRow.hidden = linkShare;
      els.composeContentRow.classList.toggle('is-hidden', linkShare);
      els.composeContentRow.style.display = linkShare ? 'none' : 'grid';
    }
    if (els.composeNostrTargetPill) {
      const label = composePostKindPillText(type);
      const title = composeNostrTargetLabel(type);
      els.composeNostrTargetPill.textContent = label;
      els.composeNostrTargetPill.setAttribute('title', title);
      els.composeNostrTargetPill.className = 'nostr-page-kind-badge ' + composePostKindPillClass(type);
    }
    if (els.postTitle) {
      const titleRow = typeof els.postTitle.closest === 'function' ? els.postTitle.closest('.field-row') : null;
      if (titleRow instanceof HTMLElement) {
        titleRow.hidden = !showTitleField;
        titleRow.classList.toggle('is-hidden', !showTitleField);
      }
      if (type === 'shortform') {
        els.postTitle.placeholder = 'Short post';
      } else if (type === 'link-share') {
        els.postTitle.placeholder = 'Link title (optional)';
      } else if (type === 'capture-media' || type === 'upload-media') {
        els.postTitle.placeholder = 'Media post title (optional)';
      } else {
        els.postTitle.placeholder = 'Post title';
      }
    }
    if (els.postContent) {
      if (type === 'shortform') {
        els.postContent.placeholder = 'Write a short post...';
      } else if (type === 'link-share') {
        els.postContent.placeholder = 'Optional commentary...';
      } else if (type === 'capture-media') {
        els.postContent.placeholder = 'Optional caption for captured media...';
      } else if (type === 'upload-media') {
        els.postContent.placeholder = 'Optional caption for uploaded media...';
      } else if (type === 'attachment') {
        els.postContent.placeholder = 'Optional note about attached files...';
      } else if (type === 'audio-note') {
        els.postContent.placeholder = 'Optional note for uploaded audio...';
      } else {
        els.postContent.placeholder = 'Post body';
      }
      if (type === 'shortform') {
        els.postContent.rows = 11;
      } else if (composePostTypeIsTextual(type)) {
        els.postContent.rows = 16;
      } else {
        els.postContent.rows = 8;
      }
    }
    syncComposeShortformCounter();
  }

  function setComposePostType(nextType, options) {
    const opts = options || {};
    const normalized = normalizeComposePostType(nextType);
    if (state.composePostTypeLocked && !opts.forceWhileLocked) {
      syncComposePostTypeUi();
      return;
    }
    if (normalized === 'go-live') {
      setOutput(els.outputCompose, 'Go Live is a future feature.', 'warn');
      return;
    }
    if (state.composePostType === normalized && !opts.force) {
      if (opts.syncUi) {
        syncComposePostTypeUi();
      }
      if (opts.interactive) {
        setComposePostTypeToolbarCollapsed(true);
      }
      return;
    }
    state.composePostType = normalized;
    syncComposePostTypeUi();
    if (opts.interactive) {
      setComposePostTypeToolbarCollapsed(true);
      openComposePickerForType(normalized);
    }
    if (opts.queueAutosave !== false) {
      queueAutosave('saving');
    }
  }

  function composeBuildLinkMarkdown(urlValue, bodyValue, titleValue) {
    const url = String(urlValue || '').trim();
    if (!url) {
      return '';
    }
    const label = String(titleValue || '').trim() || url;
    let out = '[' + label + '](' + url + ')';
    const body = String(bodyValue || '').trim();
    if (body) {
      out += '\n\n' + body;
    }
    return out;
  }

  function normalizeComposeSourcePostPath(raw) {
    let value = String(raw || '').trim();
    if (!value) {
      return '';
    }
    value = value
      .replace(/^https?:\/\/[^/]+\//i, '')
      .replace(/^\/+/, '')
      .replace(/^pages\//i, '')
      .replace(/^posts\//i, '');
    value = value.replace(/\.html?$/i, '').replace(/\.md$/i, '');
    value = value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!value) {
      return '';
    }
    return 'posts/' + value + '.md';
  }

  function normalizeComposePostFilename(raw) {
    let value = String(raw || '').trim();
    if (!value) {
      return '';
    }
    value = value
      .replace(/^https?:\/\/[^/]+\//i, '')
      .replace(/^\/+/, '')
      .replace(/^pages\//i, '')
      .replace(/^posts\//i, '');
    value = value.split('/').pop() || '';
    value = value.replace(/\.html?$/i, '').replace(/\.md$/i, '');
    value = value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return value;
  }

  function composeFilenameFromPath(path) {
    const normalized = normalizeComposeSourcePostPath(path);
    if (!normalized) {
      return '';
    }
    return normalizeComposePostFilename(normalized);
  }

  function beginComposePostFilenameEdit() {
    if (!state.composeSourcePostPath) {
      return;
    }
    state.composePostFilenameEditing = true;
    syncComposePostFilenameUi();
    if (els.composePostFilenameInput) {
      els.composePostFilenameInput.focus();
      els.composePostFilenameInput.select();
    }
  }

  function cancelComposePostFilenameEdit() {
    state.composePostFilenameEditing = false;
    if (els.composePostFilenameInput) {
      const fallback = state.composePostFilename || composeFilenameFromPath(state.composeSourcePostPath);
      els.composePostFilenameInput.value = fallback || '';
    }
    syncComposePostFilenameUi();
  }

  function commitComposePostFilenameEdit() {
    const currentSource = normalizeComposeSourcePostPath(state.composeSourcePostPath);
    const fallbackFilename = composeFilenameFromPath(currentSource);
    const entered = els.composePostFilenameInput ? els.composePostFilenameInput.value : state.composePostFilename;
    const nextFilename = normalizeComposePostFilename(entered || fallbackFilename);
    if (!nextFilename) {
      setOutput(els.outputCompose, 'Slug/filename is required.', 'warn');
      if (els.composePostFilenameInput) {
        els.composePostFilenameInput.focus();
        els.composePostFilenameInput.select();
      }
      return;
    }
    const previousFilename = normalizeComposePostFilename(state.composePostFilename || fallbackFilename);
    state.composePostFilename = nextFilename;
    state.composePostFilenameEditing = false;
    if (els.composePostFilenameInput) {
      els.composePostFilenameInput.value = nextFilename;
    }
    syncComposePostFilenameUi();
    if (nextFilename !== previousFilename) {
      queueAutosave('saving');
    }
  }

  function syncComposePostFilenameUi() {
    if (!els.composePostFilenameRow) {
      return;
    }
    const sourcePath = normalizeComposeSourcePostPath(state.composeSourcePostPath);
    state.composeSourcePostPath = sourcePath;
    const show = !!sourcePath;
    els.composePostFilenameRow.hidden = !show;
    if (!show) {
      state.composePostFilenameEditing = false;
      state.composePostFilename = '';
      if (els.composePostFilenameInput) {
        els.composePostFilenameInput.value = '';
      }
      return;
    }
    const fallbackFilename = composeFilenameFromPath(sourcePath);
    const filename = normalizeComposePostFilename(state.composePostFilename || fallbackFilename);
    state.composePostFilename = filename || fallbackFilename;
    const renderedFilename = state.composePostFilename || fallbackFilename || 'post';
    if (els.composePostFilenameLabel) {
      els.composePostFilenameLabel.textContent = 'posts/' + renderedFilename + '.md';
    }
    if (els.composePostFilenameInput) {
      if (!state.composePostFilenameEditing) {
        els.composePostFilenameInput.value = renderedFilename;
      } else if (!els.composePostFilenameInput.value.trim()) {
        els.composePostFilenameInput.value = renderedFilename;
      }
    }
    if (els.composePostFilenameDisplay) {
      els.composePostFilenameDisplay.hidden = !!state.composePostFilenameEditing;
    }
    if (els.composePostFilenameEditWrap) {
      els.composePostFilenameEditWrap.hidden = !state.composePostFilenameEditing;
    }
  }

  function readComposer() {
    const tagEditor = composeTagsEditorNode();
    if (tagEditor) {
      composeTagsEditorSyncDraft(tagEditor);
      syncComposeTagsField();
    }
    const postType = normalizeComposePostType(state.composePostType);
    const titleValue = els.postTitle ? String(els.postTitle.value || '').trim() : '';
    if (postType === 'shortform') {
      enforceComposeShortformLimit();
    }
    let content = els.postContent ? String(els.postContent.value || '') : '';
    if (postType === 'link-share') {
      const linkContent = composeBuildLinkMarkdown(
        els.composeLinkUrl ? els.composeLinkUrl.value : '',
        els.composeLinkBody ? els.composeLinkBody.value : '',
        els.postTitle ? els.postTitle.value : ''
      );
      if (linkContent) {
        content = linkContent;
      }
    }
    return {
      draft_id: state.currentDraftId,
      source_post_path: state.composeSourcePostPath,
      post_filename: state.composePostFilename,
      title: postType === 'shortform' ? '' : titleValue,
      tags: els.postTags.value.trim(),
      summary: '',
      content: content,
      post_type: postType,
      origin_platforms: JSON.stringify(arrayFromMaybe(state.composeOriginPlatforms)),
      scheduled_at: localToIso(els.postScheduleAt.value),
      publish_mode: getPublishMode(),
      publish_destination: getPublishDestination()
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
    state.composeSourcePostPath = normalizeComposeSourcePostPath((draft && draft.source_post_path) || '');
    state.composePostFilename = normalizeComposePostFilename((draft && draft.post_filename) || composeFilenameFromPath(state.composeSourcePostPath));
    state.composePostFilenameEditing = false;
    state.composePostType = normalizeComposePostType((draft && draft.post_type) || 'longform');
    state.composePostTypeToolbarCollapsed = true;
    state.composeTagsDraftText = '';
    state.composeShortformLimitEditing = false;
    els.postTitle.value = draft.title || '';
    setComposeTagsFromString(draft.tags || '');
    els.postContent.value = draft.content || '';
    if (els.composeLinkUrl) {
      let linkUrl = '';
      const linkMatch = String(draft.content || '').match(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
      if (linkMatch && linkMatch[1]) {
        linkUrl = String(linkMatch[1]);
      }
      els.composeLinkUrl.value = linkUrl;
    }
    if (els.composeLinkBody) {
      const body = String(draft.content || '')
        .replace(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i, '')
        .trim();
      els.composeLinkBody.value = body;
    }
    els.postScheduleAt.value = isoToLocal(draft.scheduled_at || '');
    setComposeOriginPlatforms((draft && draft.origin_platforms) || []);
    syncComposePostFilenameUi();
    syncComposePostTypeUi();
    setPublishMode(mode || 'immediate');
    setPublishDestination((draft && draft.publish_destination) || 'local_only');
    renderPreview();
    refreshDraftLabel();
    setTimeout(function () {
      state.suspendAutosave = false;
    }, 0);
  }

  function resetComposer() {
    state.currentDraftId = '';
    state.composeSourcePostPath = '';
    state.composePostFilename = '';
    state.composePostFilenameEditing = false;
    state.composePostType = 'longform';
    state.composePostTypeLocked = false;
    state.composePostTypeToolbarCollapsed = true;
    state.composeTagsDraftText = '';
    state.composeShortformLimitEditing = false;
    els.postTitle.value = '';
    setComposeTags([]);
    els.postContent.value = '';
    if (els.composeLinkUrl) {
      els.composeLinkUrl.value = '';
    }
    if (els.composeLinkBody) {
      els.composeLinkBody.value = '';
    }
    els.postScheduleAt.value = '';
    setComposeOriginPlatforms(state.originConfig && state.originConfig.default_platforms);
    syncComposePostFilenameUi();
    syncComposePostTypeUi();
    setPublishMode('immediate');
    setPublishDestination('local_only');
    renderPreview();
    refreshDraftLabel();
  }

  function refreshDraftLabel() {
    if (!els.currentDraftLabel) {
      updateDripQueuePill();
      persistAdminComposeSession();
      return;
    }
    if (state.currentDraftId) {
      els.currentDraftLabel.textContent = 'Editing draft: ' + state.currentDraftId;
    } else {
      els.currentDraftLabel.textContent = 'New draft';
    }
    updateDripQueuePill();
    persistAdminComposeSession();
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

  function composeTagTokenHtml(tag) {
    return '<span class="tag-token" contenteditable="false" data-post-tags-token="' + escapeHtml(tag) + '" tabindex="-1"><span class="tag-token-label">' + escapeHtml(tag) + '</span></span>';
  }

  function composeTagsEditorNode() {
    if (els.postTagsTokenEditor instanceof HTMLElement) {
      return els.postTagsTokenEditor;
    }
    if (!(els.postTagsEditor instanceof HTMLElement)) {
      return null;
    }
    const node = els.postTagsEditor.querySelector('[data-post-tags-editor]');
    return node instanceof HTMLElement ? node : null;
  }

  function composeTagsEditorDraftNode(editor) {
    if (!(editor instanceof HTMLElement)) {
      return null;
    }
    const node = editor.querySelector('[data-post-tags-draft]');
    return node instanceof HTMLElement ? node : null;
  }

  function composeTagsEditorSelectedToken(editor) {
    if (!(editor instanceof HTMLElement)) {
      return null;
    }
    const node = editor.querySelector('.tag-token.is-selected[data-post-tags-token]');
    return node instanceof HTMLElement ? node : null;
  }

  function composeTagsEditorSetEmptyClass(editor) {
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    const draft = String(state.composeTagsDraftText || '').trim();
    const empty = !state.composeTags.length && !draft;
    editor.classList.toggle('is-empty', empty);
    if (els.postTagsEditor) {
      els.postTagsEditor.classList.toggle('has-tags', state.composeTags.length > 0);
    }
  }

  function composeTagsEditorRender(editor) {
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    let html = state.composeTags.map(composeTagTokenHtml).join('');
    html += '<span class="tag-token-editor-draft" data-post-tags-draft>' + escapeHtml(state.composeTagsDraftText || '') + '</span>';
    editor.innerHTML = html;
    composeTagsEditorSetEmptyClass(editor);
  }

  function composeTagsEditorFocusDraft(editor) {
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    const draftNode = composeTagsEditorDraftNode(editor);
    if (!(draftNode instanceof HTMLElement)) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(draftNode);
    range.collapse(false);
    const selection = window.getSelection ? window.getSelection() : null;
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (document.activeElement !== editor) {
      try {
        editor.focus({ preventScroll: true });
      } catch (_focusErr) {
        editor.focus();
      }
    }
  }

  function composeTagsEditorPlaceCaretFromPoint(editor, clientX, clientY) {
    if (!(editor instanceof HTMLElement)) {
      return false;
    }
    const selection = window.getSelection ? window.getSelection() : null;
    if (!selection) {
      return false;
    }
    let range = null;
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(clientX, clientY);
      if (pos && pos.offsetNode && editor.contains(pos.offsetNode)) {
        range = document.createRange();
        range.setStart(pos.offsetNode, Number(pos.offset) || 0);
        range.collapse(true);
      }
    } else if (document.caretRangeFromPoint) {
      const pointRange = document.caretRangeFromPoint(clientX, clientY);
      if (pointRange && pointRange.startContainer && editor.contains(pointRange.startContainer)) {
        range = pointRange;
        range.collapse(true);
      }
    }
    if (!range) {
      return false;
    }
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function composeTagsEditorClearSelection(editor) {
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    const selected = composeTagsEditorSelectedToken(editor);
    if (selected) {
      selected.classList.remove('is-selected');
    }
  }

  function composeTagsEditorSelectToken(editor, tokenNode) {
    if (!(editor instanceof HTMLElement) || !(tokenNode instanceof HTMLElement)) {
      return;
    }
    composeTagsEditorClearSelection(editor);
    tokenNode.classList.add('is-selected');
    try {
      editor.focus({ preventScroll: true });
    } catch (_focusErr) {
      editor.focus();
    }
  }

  function composeTagsEditorReadDraftText(editor) {
    const draftNode = composeTagsEditorDraftNode(editor);
    if (!(draftNode instanceof HTMLElement)) {
      return '';
    }
    return String(draftNode.textContent || '');
  }

  function composeTagsEditorSyncDraft(editor) {
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    state.composeTagsDraftText = composeTagsEditorReadDraftText(editor);
    composeTagsEditorSetEmptyClass(editor);
  }

  function composeTagsEditorCommit(editor, forceFinalize) {
    if (!(editor instanceof HTMLElement)) {
      return false;
    }
    const draft = composeTagsEditorReadDraftText(editor);
    const rawParts = String(draft || '').split(',');
    if (!rawParts.length) {
      return false;
    }
    let changed = false;
    const limit = forceFinalize ? rawParts.length : Math.max(0, rawParts.length - 1);
    for (let i = 0; i < limit; i += 1) {
      if (addComposeTag(rawParts[i])) {
        changed = true;
      }
    }
    const nextDraft = forceFinalize ? '' : String(rawParts[rawParts.length - 1] || '');
    const draftChanged = nextDraft !== draft;
    state.composeTagsDraftText = nextDraft;
    if (changed || draftChanged) {
      composeTagsEditorRender(editor);
      composeTagsEditorFocusDraft(editor);
    } else {
      composeTagsEditorSetEmptyClass(editor);
    }
    return changed;
  }

  function composeTagsEditorRemoveTagByNode(editor, tokenNode) {
    if (!(editor instanceof HTMLElement) || !(tokenNode instanceof HTMLElement)) {
      return false;
    }
    const tag = String(tokenNode.getAttribute('data-post-tags-token') || '').trim();
    if (!tag) {
      return false;
    }
    if (state.composeTags.indexOf(tag) < 0) {
      return false;
    }
    removeComposeTag(tag);
    composeTagsEditorRender(editor);
    composeTagsEditorFocusDraft(editor);
    return true;
  }

  function hydrateComposeTagsEditor() {
    const editor = composeTagsEditorNode();
    if (!editor) {
      return;
    }
    if (!(composeTagsEditorDraftNode(editor) instanceof HTMLElement)) {
      composeTagsEditorRender(editor);
    } else {
      composeTagsEditorSetEmptyClass(editor);
    }
  }

  function renderComposeTags() {
    const editor = composeTagsEditorNode();
    if (editor) {
      composeTagsEditorRender(editor);
      return;
    }
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
    let value = String(tag || '').trim();
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
    state.composeTagsDraftText = '';
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

  function commitTagInput(forceFinalize) {
    const editor = composeTagsEditorNode();
    if (editor) {
      return composeTagsEditorCommit(editor, forceFinalize !== false);
    }
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
    let md = els.postContent.value;
    if (normalizeComposePostType(state.composePostType) === 'link-share') {
      const built = composeBuildLinkMarkdown(
        els.composeLinkUrl ? els.composeLinkUrl.value : '',
        els.composeLinkBody ? els.composeLinkBody.value : '',
        els.postTitle ? els.postTitle.value : ''
      );
      if (built) {
        md = built;
      }
    }
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
      state.publishName = data.publish_name || state.playerName || data.username || '';
      state.nostrPubkey = data.nostr_pubkey || '';
      state.simplexContactInfo = data.simplex_contact_info || '';
      state.simplexStatus = data.simplex_status || '';
      state.sshFingerprint = data.ssh_fingerprint || '';
      state.isAdmin = !!data.is_admin;
      state.csrfToken = data.csrf_token || state.csrfToken;
      localStorage.setItem('csrf_token', state.csrfToken || '');
      setAuthMessage('', '');
      if (els.accountPlayerName) {
        els.accountPlayerName.value = state.playerName;
      }
      if (els.accountPublishName) {
        els.accountPublishName.value = state.publishName;
      }
      if (els.accountNostrPubkey) {
        els.accountNostrPubkey.value = state.nostrPubkey;
        lockNostrPubkeyField();
      }
      if (els.accountSimplexContact) {
        els.accountSimplexContact.value = state.simplexContactInfo;
        els.accountSimplexContact.placeholder = state.simplexStatus === 'not_provisioned'
          ? 'Not provisioned yet'
          : (state.simplexStatus === 'unavailable' ? 'Unavailable' : 'Not provisioned yet');
        lockSimplexContactField();
      }
      if (els.accountSshPublicKey) {
        els.accountSshPublicKey.placeholder = state.sshFingerprint
          ? ('SSH linked (' + state.sshFingerprint.slice(0, 16) + '...)')
          : 'ssh-ed25519 AAAA...';
      }
      syncSshAccountActionState();
      loadVideoChatAccountPreference().catch(function () {});

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
      const rememberedComposeSession = readAdminComposeSession();
      const currentHashSection = String((window.location.hash || '').replace(/^#/, '') || '').trim();
      const sectionFromHash = getSectionFromHash();
      const rememberedSection = rememberedComposeSession && rememberedComposeSession.activeSection
        ? rememberedComposeSession.activeSection
        : '';
      const hasRememberedSection = rememberedSection && els.sections.some(function (sectionNode) {
        return sectionNode.getAttribute('data-admin-section') === rememberedSection;
      });
      const sectionToActivate = currentHashSection
        ? sectionFromHash
        : (hasRememberedSection ? rememberedSection : sectionFromHash);
      activateSection(sectionToActivate, !currentHashSection && sectionToActivate !== sectionFromHash);
      const launchParams = readComposeLaunchParams();
      if (sectionToActivate === 'compose' && launchParams.draftId) {
        try {
          await loadDraft(launchParams.draftId, { silent: true, lockPostType: launchParams.lockPostType });
          clearComposeLaunchParamsFromUrl();
        } catch (_launchErr) {
          resetComposer();
          persistAdminComposeSession();
        }
      } else if (sectionToActivate === 'compose' && rememberedComposeSession && rememberedComposeSession.draftId) {
        try {
          await loadDraft(rememberedComposeSession.draftId, { silent: true });
        } catch (_restoreErr) {
          resetComposer();
          persistAdminComposeSession();
        }
      }
      renderPreview();
      els.adminPanel.style.display = 'grid';
      markInitialContentPainted();
      markHydrationPageReady();
      maybeLoadAdminSection(state.activeSection, false).catch(function (_sectionErr) {
        // Section loader already writes actionable status output.
      });
      preloadAdminFirstPaint().catch(function (_preloadErr) {
        // Keep first paint resilient; section-specific loaders surface errors.
      });
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

  function normalizePlugins(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const normalized = {
      nostr_support: true,
      nostr_login: true,
      nostr_bridge: src.nostr_bridge !== false,
      nostr_posts: src.nostr_posts !== false,
      zaps: src.zaps !== false,
      btcpay: src.btcpay !== false,
      video_chat: src.video_chat === true
    };
    return normalized;
  }

  function clampInt(value, fallback, minValue, maxValue) {
    let parsed = parseInt(String(value || ''), 10);
    if (!Number.isFinite(parsed)) {
      parsed = Number(fallback || 0);
    }
    if (!Number.isFinite(parsed)) {
      parsed = 0;
    }
    return Math.max(minValue, Math.min(maxValue, parsed));
  }

  function normalizeVideoChatConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const rooms = Array.isArray(src.rooms) ? src.rooms : String(src.rooms || 'Lobby').split(/[,\n]/);
    return {
      participant_limit: clampInt(src.participant_limit, 6, 2, 24),
      token_ttl_seconds: clampInt(src.token_ttl_seconds, 3600, 60, 86400),
      janus_wss: String(src.janus_wss || '').trim(),
      signaling_wss: String(src.signaling_wss || '').trim(),
      public_rooms: src.public_rooms === true,
      rooms: rooms.map(function (room) { return String(room || '').replace(/\s+/g, ' ').trim(); }).filter(Boolean).slice(0, 12)
    };
  }

  function setVideoChatConfigFields() {
    const cfg = normalizeVideoChatConfig(state.videoChatConfig || {});
    state.videoChatConfig = cfg;
    if (els.videoChatParticipantLimit) {
      els.videoChatParticipantLimit.value = String(cfg.participant_limit);
      els.videoChatParticipantLimit.disabled = !(state.plugins && state.plugins.video_chat);
    }
    if (els.videoChatTokenTtlSeconds) {
      els.videoChatTokenTtlSeconds.value = String(cfg.token_ttl_seconds);
      els.videoChatTokenTtlSeconds.disabled = !(state.plugins && state.plugins.video_chat);
    }
    if (els.videoChatJanusWss) {
      els.videoChatJanusWss.value = cfg.janus_wss;
      els.videoChatJanusWss.disabled = !(state.plugins && state.plugins.video_chat);
    }
    if (els.videoChatSignalingWss) {
      els.videoChatSignalingWss.value = cfg.signaling_wss;
      els.videoChatSignalingWss.disabled = !(state.plugins && state.plugins.video_chat);
    }
    if (els.videoChatPublicRooms) {
      els.videoChatPublicRooms.checked = !!cfg.public_rooms;
      els.videoChatPublicRooms.disabled = !(state.plugins && state.plugins.video_chat);
    }
    if (els.videoChatRooms) {
      els.videoChatRooms.value = (cfg.rooms && cfg.rooms.length ? cfg.rooms : ['Lobby']).join('\n');
      els.videoChatRooms.disabled = !(state.plugins && state.plugins.video_chat) || !cfg.public_rooms;
    }
  }

  function setPluginCheckboxStates() {
    const p = normalizePlugins(state.plugins || {});
    state.plugins = p;
    if (els.pluginNostrSupport) els.pluginNostrSupport.checked = !!p.nostr_support;
    if (els.pluginNostrLogin) els.pluginNostrLogin.checked = !!p.nostr_login;
    if (els.pluginNostrBridge) els.pluginNostrBridge.checked = !!p.nostr_bridge;
    if (els.pluginNostrPosts) els.pluginNostrPosts.checked = !!p.nostr_posts;
    if (els.pluginZaps) els.pluginZaps.checked = !!p.zaps;
    if (els.pluginBtcpay) els.pluginBtcpay.checked = !!p.btcpay;
    if (els.pluginVideoChat) els.pluginVideoChat.checked = !!p.video_chat;
    if (els.pluginNostrSupport) els.pluginNostrSupport.disabled = true;
    if (els.pluginNostrLogin) els.pluginNostrLogin.disabled = true;
    const nostrSupportOn = !!p.nostr_support;
    [els.pluginNostrBridge, els.pluginNostrPosts, els.pluginZaps].forEach(function (input) {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      input.disabled = !nostrSupportOn;
    });
  }

  function sectionButtonForName(name) {
    return els.sectionButtons.find(function (btn) {
      return String(btn && btn.getAttribute ? btn.getAttribute('data-admin-nav') : '') === String(name || '');
    }) || null;
  }

  function sectionNodeForName(name) {
    return els.sections.find(function (section) {
      return String(section && section.getAttribute ? section.getAttribute('data-admin-section') : '') === String(name || '');
    }) || null;
  }

  function syncPluginControlledSections() {
    const plugins = normalizePlugins(state.plugins || {});
    state.plugins = plugins;
    const sectionByPlugin = {
      'nostr-bridge': !!plugins.nostr_bridge,
      'zaps': !!plugins.zaps,
      'btcpay-checkout': !!plugins.btcpay,
      'video-calling': !!plugins.video_chat,
      'nostr-pages': !!plugins.nostr_posts
    };
    Object.keys(sectionByPlugin).forEach(function (sectionName) {
      const visible = !!sectionByPlugin[sectionName];
      const button = sectionButtonForName(sectionName);
      const section = sectionNodeForName(sectionName);
      if (button) {
        button.hidden = !visible;
        button.setAttribute('aria-hidden', visible ? 'false' : 'true');
      }
      if (section) {
        section.hidden = !visible || section.getAttribute('data-admin-section') !== state.activeSection;
      }
    });
    if (state.isAdmin && state.activeSection && Object.prototype.hasOwnProperty.call(sectionByPlugin, state.activeSection) && !sectionByPlugin[state.activeSection]) {
      activateSection('plugins', true);
    }
  }

  function readPluginsFromUi() {
    return normalizePlugins({
      nostr_support: !!(els.pluginNostrSupport && els.pluginNostrSupport.checked),
      nostr_login: !!(els.pluginNostrLogin && els.pluginNostrLogin.checked),
      nostr_bridge: !!(els.pluginNostrBridge && els.pluginNostrBridge.checked),
      nostr_posts: !!(els.pluginNostrPosts && els.pluginNostrPosts.checked),
      zaps: !!(els.pluginZaps && els.pluginZaps.checked),
      btcpay: !!(els.pluginBtcpay && els.pluginBtcpay.checked),
      video_chat: !!(els.pluginVideoChat && els.pluginVideoChat.checked)
    });
  }

  async function savePluginsConfig() {
    const plugins = readPluginsFromUi();
    state.plugins = plugins;
    setPluginCheckboxStates();
    syncPluginControlledSections();
    try {
      const data = await apiPost('/cgi/blog-update-config', {
        plugin_nostr_support: plugins.nostr_support ? 'true' : 'false',
        plugin_nostr_login: plugins.nostr_login ? 'true' : 'false',
        plugin_nostr_bridge: plugins.nostr_bridge ? 'true' : 'false',
        plugin_nostr_posts: plugins.nostr_posts ? 'true' : 'false',
        plugin_zaps: plugins.zaps ? 'true' : 'false',
        plugin_btcpay: plugins.btcpay ? 'true' : 'false',
        plugin_video_chat: plugins.video_chat ? 'true' : 'false'
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to save plugins');
      }
      setOutput(els.outputPlugins, 'Plugins updated.', 'ok');
      await loadConfig();
    } catch (err) {
      setOutput(els.outputPlugins, 'Error: ' + err.message, 'error');
    }
  }

  function queuePluginsSave(delayMs) {
    if (state.pluginsSaveTimer) {
      clearTimeout(state.pluginsSaveTimer);
    }
    state.pluginsSaveTimer = setTimeout(function () {
      savePluginsConfig().catch(function () {});
    }, Math.max(120, Number(delayMs || 220)));
  }

  function readVideoChatConfigFromUi() {
    return normalizeVideoChatConfig({
      participant_limit: els.videoChatParticipantLimit ? els.videoChatParticipantLimit.value : 6,
      token_ttl_seconds: els.videoChatTokenTtlSeconds ? els.videoChatTokenTtlSeconds.value : 3600,
      janus_wss: els.videoChatJanusWss ? els.videoChatJanusWss.value : '',
      signaling_wss: els.videoChatSignalingWss ? els.videoChatSignalingWss.value : '',
      public_rooms: !!(els.videoChatPublicRooms && els.videoChatPublicRooms.checked),
      rooms: els.videoChatRooms ? els.videoChatRooms.value : 'Lobby'
    });
  }

  async function saveVideoChatConfig() {
    const cfg = readVideoChatConfigFromUi();
    state.videoChatConfig = cfg;
    setVideoChatConfigFields();
    try {
      const data = await apiPost('/cgi/blog-update-config', {
        video_chat_participant_limit: String(cfg.participant_limit),
        video_chat_token_ttl_seconds: String(cfg.token_ttl_seconds),
        video_chat_janus_wss: cfg.janus_wss,
        video_chat_signaling_wss: cfg.signaling_wss,
        video_chat_public_rooms: cfg.public_rooms ? 'true' : 'false',
        video_chat_rooms: cfg.rooms.join('\n')
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to save video calling settings');
      }
      setOutput(els.outputVideoCalling, 'Video calling settings updated.', 'ok');
      await loadConfig();
    } catch (err) {
      setOutput(els.outputVideoCalling, 'Error: ' + err.message, 'error');
    }
  }

  function queueVideoChatConfigSave(delayMs) {
    if (state.isLoadingConfig) {
      return;
    }
    if (state.videoChatSaveTimer) {
      clearTimeout(state.videoChatSaveTimer);
    }
    state.videoChatSaveTimer = setTimeout(function () {
      saveVideoChatConfig().catch(function () {});
    }, Math.max(180, Number(delayMs || 500)));
  }

  async function startVideoChatOperatorRoom(roomId, mode, label) {
    const normalizedRoom = String(roomId || '').trim();
    if (!normalizedRoom || !els.videoChatOperatorWidget) {
      return false;
    }
    const ok = await ensureVideoChatWidgetScript();
    if (!ok || typeof window.initVideoChatWidget !== 'function') {
      throw new Error('Video call widget is not available.');
    }
    if (els.videoChatOperatorCallPanel) {
      els.videoChatOperatorCallPanel.hidden = false;
    }
    if (els.videoChatOperatorCallStatus) {
      els.videoChatOperatorCallStatus.textContent = label || ('Joining room ' + normalizedRoom + '.');
    }
    els.videoChatOperatorWidget.innerHTML = '';
    const host = document.createElement('div');
    host.setAttribute('data-video-chat', '');
    host.setAttribute('data-video-chat-token-endpoint', '/cgi/blog-video-chat-token');
    host.setAttribute('data-video-chat-room-id', normalizedRoom);
    host.setAttribute('data-video-chat-call-room-id', normalizedRoom);
    host.setAttribute('data-video-chat-call-mode', mode === 'voice' ? 'voice' : 'video');
    host.setAttribute('data-video-chat-auto-start', 'true');
    host.setAttribute('data-video-chat-public-rooms', 'false');
    host.setAttribute('data-video-chat-room-policy', 'open');
    host.setAttribute('data-video-chat-allow-join-link', 'false');
    host.setAttribute('data-video-chat-max-participants', '8');
    host.setAttribute('data-video-chat-display-name', state.playerName || state.username || 'Admin');
    els.videoChatOperatorWidget.appendChild(host);
    window.initVideoChatWidget(host, {
      roomId: normalizedRoom,
      callRoomId: normalizedRoom,
      autoStart: true,
      callMode: mode === 'voice' ? 'voice' : 'video',
      allowJoinViaLink: false,
      publicRooms: false,
      maxParticipants: 8,
      displayName: state.playerName || state.username || 'Admin'
    });
    return true;
  }

  function leaveVideoChatOperatorRoom() {
    if (els.videoChatOperatorWidget && window.VideoChatWidgetAutoMount && typeof window.VideoChatWidgetAutoMount.unmount === 'function') {
      const host = els.videoChatOperatorWidget.querySelector('[data-video-chat]');
      if (host) {
        window.VideoChatWidgetAutoMount.unmount(host);
      }
    }
    if (els.videoChatOperatorWidget) {
      els.videoChatOperatorWidget.innerHTML = '';
    }
    if (els.videoChatOperatorCallPanel) {
      els.videoChatOperatorCallPanel.hidden = true;
    }
    if (els.videoChatOperatorCallStatus) {
      els.videoChatOperatorCallStatus.textContent = 'No active operator call.';
    }
  }

  function renderVideoChatOperatorStatus() {
    if (!els.videoChatOperatorStatus) {
      return;
    }
    const info = state.videoChatOperatorInfo || {};
    const users = Array.isArray(info.users) ? info.users : [];
    const rooms = Array.isArray(info.rooms) ? info.rooms : [];
    const calls = Array.isArray(info.calls) ? info.calls : [];
    let html = '';
    html += '<div class="runtime-setting-item">';
    html += '<div><strong>Online users</strong><span class="runtime-setting-help">' + String(users.length) + ' browser session' + (users.length === 1 ? '' : 's') + ' reporting presence</span></div>';
    html += '</div>';
    if (!users.length) {
      html += '<div class="placeholder">No logged-in users are reporting video call presence right now.</div>';
    } else {
      users.forEach(function (user) {
        const username = String(user && user.username || '');
        const canCall = !!(user && user.allow_admin_calls);
        const age = Number(user && user.age_seconds || 0);
        html += '<div class="runtime-setting-item video-chat-operator-user">';
        html += '<div>';
        html += '<strong>' + escapeHtml(user && user.player_name || username || 'User') + '</strong>';
        html += '<span class="runtime-setting-help">@' + escapeHtml(username) + (user && user.current_room ? ' · room ' + escapeHtml(user.current_room) : '') + ' · seen ' + String(Math.max(0, age)) + 's ago</span>';
        html += '</div>';
        html += '<div class="runtime-setting-actions">';
        if (user && user.current_room) {
          html += '<button type="button" data-video-chat-join-room="' + escapeAttr(user.current_room) + '">Join</button>';
        }
        html += '<button type="button" data-video-chat-call-user="' + escapeAttr(username) + '"' + (canCall ? '' : ' disabled') + '>Call</button>';
        html += '</div>';
        html += '</div>';
      });
    }
    html += '<div class="runtime-setting-item"><div><strong>Rooms</strong><span class="runtime-setting-help">Browser-reported room membership from active widgets.</span></div></div>';
    if (!rooms.length) {
      html += '<div class="placeholder">No rooms are reporting members.</div>';
    } else {
      rooms.forEach(function (room) {
        const members = Array.isArray(room && room.members) ? room.members : [];
        const roomId = String(room && room.room_id || '');
        html += '<div class="runtime-setting-item"><div><strong>' + escapeHtml(roomId || 'Room') + '</strong><span class="runtime-setting-help">' + members.map(function (member) {
          return escapeHtml(member && member.player_name || member && member.username || 'User');
        }).join(', ') + '</span></div><div class="runtime-setting-actions"><button type="button" data-video-chat-join-room="' + escapeAttr(roomId) + '"' + (roomId ? '' : ' disabled') + '>Join</button></div></div>';
      });
    }
    html += '<div class="runtime-setting-item"><div><strong>Call requests</strong><span class="runtime-setting-help">' + String(calls.length) + ' active or recent request' + (calls.length === 1 ? '' : 's') + '</span></div></div>';
    if (!calls.length) {
      html += '<div class="placeholder">No active call requests.</div>';
    } else {
      calls.forEach(function (call) {
        const callId = String(call && call.call_id || '');
        const roomId = String(call && call.room_id || '');
        const status = String(call && call.status || 'call');
        html += '<div class="runtime-setting-item"><div><strong>' + escapeHtml(status) + '</strong><span class="runtime-setting-help">' + escapeHtml(call && call.from_admin_name || call && call.from_admin || 'Admin') + ' to @' + escapeHtml(call && call.to_user || '') + ' · room ' + escapeHtml(roomId) + '</span></div><div class="runtime-setting-actions">';
        html += '<button type="button" data-video-chat-join-room="' + escapeAttr(roomId) + '"' + (roomId ? '' : ' disabled') + '>Join</button>';
        if (status === 'ringing') {
          html += '<button type="button" data-video-chat-cancel-call="' + escapeAttr(callId) + '"' + (callId ? '' : ' disabled') + '>Cancel</button>';
        }
        html += '</div></div>';
      });
    }
    els.videoChatOperatorStatus.innerHTML = html;
  }

  async function loadVideoChatOperatorStatus(options) {
    if (!state.isAdmin || !els.videoChatOperatorStatus || !(state.plugins && state.plugins.video_chat)) {
      return;
    }
    try {
      const data = await apiPost('/cgi/blog-video-chat-control', { action: 'admin_status' }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to load video call presence');
      }
      state.videoChatOperatorInfo = data;
      renderVideoChatOperatorStatus();
      if (!(options && options.background)) {
        setOutput(els.outputVideoCalling, 'Video call operator view refreshed.', 'ok');
      }
    } catch (err) {
      if (els.videoChatOperatorStatus) {
        els.videoChatOperatorStatus.innerHTML = '<div class="placeholder">Could not load video call presence.</div>';
      }
      if (!(options && options.background)) {
        setOutput(els.outputVideoCalling, 'Error: ' + err.message, 'error');
      }
    }
  }

  function syncVideoChatOperatorAutoRefresh() {
    if (state.videoChatOperatorPollTimer) {
      clearInterval(state.videoChatOperatorPollTimer);
      state.videoChatOperatorPollTimer = null;
    }
    if (!(state.isAdmin && state.activeSection === 'video-calling' && state.plugins && state.plugins.video_chat)) {
      return;
    }
    state.videoChatOperatorPollTimer = setInterval(function () {
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'video-calling') {
        loadVideoChatOperatorStatus({ background: true }).catch(function () {});
      }
    }, 8000);
  }

  async function callVideoChatUser(username) {
    const target = String(username || '').trim();
    if (!target) {
      return;
    }
    try {
      const data = await apiPost('/cgi/blog-video-chat-control', {
        action: 'admin_call_user',
        username: target
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Could not start call');
      }
      const call = data.call || {};
      const roomId = String(call.room_id || '').trim();
      setOutput(els.outputVideoCalling, 'Calling @' + target + '.', 'ok');
      await loadVideoChatOperatorStatus({ background: true });
      if (roomId) {
        await startVideoChatOperatorRoom(roomId, 'video', 'Calling @' + target + ' in room ' + roomId + '.');
      }
    } catch (err) {
      setOutput(els.outputVideoCalling, 'Error: ' + err.message, 'error');
    }
  }

  async function joinVideoChatOperatorRoom(roomId) {
    const room = String(roomId || '').trim();
    if (!room) {
      return;
    }
    try {
      await startVideoChatOperatorRoom(room, 'video', 'Joined room ' + room + '.');
      setOutput(els.outputVideoCalling, 'Joined room ' + room + '.', 'ok');
    } catch (err) {
      setOutput(els.outputVideoCalling, 'Error: ' + err.message, 'error');
    }
  }

  async function cancelVideoChatCall(callId) {
    const id = String(callId || '').trim();
    if (!id) {
      return;
    }
    try {
      const data = await apiPost('/cgi/blog-video-chat-control', {
        action: 'admin_cancel_call',
        call_id: id
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Could not cancel call');
      }
      setOutput(els.outputVideoCalling, 'Call cancelled.', 'ok');
      await loadVideoChatOperatorStatus({ background: true });
    } catch (err) {
      setOutput(els.outputVideoCalling, 'Error: ' + err.message, 'error');
    }
  }

  async function loadVideoChatAccountPreference() {
    if (!els.accountVideoChatAllowAdminCalls || !state.sessionToken || !state.csrfToken) {
      return;
    }
    try {
      const data = await apiPost('/cgi/blog-video-chat-control', { action: 'status' }, true);
      if (!data.success) {
        return;
      }
      state.videoChatAllowAdminCalls = !!data.allow_admin_calls;
      els.accountVideoChatAllowAdminCalls.checked = state.videoChatAllowAdminCalls;
    } catch (_err) {
      // Account preferences are non-blocking for the rest of the admin page.
    }
  }

  async function saveVideoChatAccountPreference() {
    if (!els.accountVideoChatAllowAdminCalls) {
      return;
    }
    const allow = !!els.accountVideoChatAllowAdminCalls.checked;
    state.videoChatAllowAdminCalls = allow;
    try {
      const data = await apiPost('/cgi/blog-video-chat-control', {
        action: 'set_preference',
        allow_admin_calls: allow ? 'true' : 'false'
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to save video call preference');
      }
      state.videoChatAllowAdminCalls = !!data.allow_admin_calls;
      els.accountVideoChatAllowAdminCalls.checked = state.videoChatAllowAdminCalls;
      setOutput(els.outputAccount, 'Video call preference saved.', 'ok');
    } catch (err) {
      els.accountVideoChatAllowAdminCalls.checked = !allow;
      state.videoChatAllowAdminCalls = !allow;
      setOutput(els.outputAccount, 'Error: ' + err.message, 'error');
    }
  }

  async function loadConfig() {
    state.isLoadingConfig = true;
    try {
      const data = await fetchJson('/cgi/blog-get-config');
      if (!data.success) {
        throw new Error(data.error || 'Failed to load configuration');
      }
      state.plugins = normalizePlugins(data.plugins || {});
      state.videoChatConfig = normalizeVideoChatConfig(data.video_chat || {});
      state.originConfig = normalizeOriginConfig(data.origin || {});
      setPluginCheckboxStates();
      setVideoChatConfigFields();
      setVideoCallingNavStatus();
      syncPluginControlledSections();
      syncVideoChatOperatorAutoRefresh();
      renderCrosspostingSettingsUi();
      window.__wizardryPlugins = state.plugins;
      window.__wizardryVideoChatEnabled = !!state.plugins.video_chat;
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
      if (els.appendSiteTitleToPageTitle) {
        els.appendSiteTitleToPageTitle.checked = normalizeAppendSiteTitleEnabled(data.append_site_title_to_page_title);
      }
      applyPageTitleConfig(
        data.site_title,
        els.appendSiteTitleToPageTitle ? els.appendSiteTitleToPageTitle.checked : normalizeAppendSiteTitleEnabled(data.append_site_title_to_page_title)
      );
      if (els.zapsEnabled) {
        els.zapsEnabled.checked = !!data.zaps_enabled && !!state.plugins.zaps;
        els.zapsEnabled.disabled = !state.plugins.zaps;
      }
      if (els.zapLud16) {
        els.zapLud16.value = String(data.zap_lud16 || '');
      }
      renderZapWalletSummary(data);
      if (els.zapDefaultAmountSats) {
        els.zapDefaultAmountSats.value = String(data.zap_default_amount_sats || 1000);
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
      const appendSiteTitleToPageTitle = !!(els.appendSiteTitleToPageTitle && els.appendSiteTitleToPageTitle.checked);
      const data = await apiPost('/cgi/blog-update-config', {
        site_title: normalizedSiteTitle,
        append_site_title_to_page_title: appendSiteTitleToPageTitle ? 'true' : 'false',
        theme: els.adminTheme ? els.adminTheme.value : '',
        registration_enabled: els.registrationEnabled.checked ? 'true' : 'false',
        drip_interval_hours: els.dripInterval.value.trim(),
        drip_randomness_minutes: els.dripRandomness.value.trim(),
        feed_full_text: els.feedFullText.checked ? 'true' : 'false',
        feed_items: els.feedItems.value.trim(),
        new_users_are_admins: (els.newUsersAreAdmins && els.newUsersAreAdmins.checked) ? 'true' : 'false',
        zaps_enabled: (els.zapsEnabled && els.zapsEnabled.checked) ? 'true' : 'false',
        zap_lud16: els.zapLud16 ? els.zapLud16.value.trim() : '',
        zap_default_amount_sats: els.zapDefaultAmountSats ? els.zapDefaultAmountSats.value.trim() : '',
        origin_enabled_platforms: JSON.stringify(arrayFromMaybe(state.originConfig && state.originConfig.enabled_platforms)),
        origin_default_platforms: JSON.stringify(arrayFromMaybe(state.originConfig && state.originConfig.default_platforms))
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to save config');
      }
      if (els.outputConfig) {
        els.outputConfig.innerHTML = '';
      }
      if (els.outputCrossposting) {
        els.outputCrossposting.innerHTML = '';
      }
      if (shouldRefreshQueue) {
        await loadQueue();
      }
      renderZapWalletSummary({
        zap_lud16: els.zapLud16 ? els.zapLud16.value.trim() : '',
        zap_effective_lud16: (els.zapLud16 && els.zapLud16.value.trim())
          ? els.zapLud16.value.trim()
          : String((state.zapWalletInfo && state.zapWalletInfo.zap_effective_lud16) || ''),
        zap_lud16_source: (els.zapLud16 && els.zapLud16.value.trim())
          ? 'configured'
          : String((state.zapWalletInfo && state.zapWalletInfo.zap_lud16_source) || ''),
        zap_demo_wallet_available: !!(state.zapWalletInfo && state.zapWalletInfo.zap_demo_wallet_available),
        zap_demo_wallet_active: !(els.zapLud16 && els.zapLud16.value.trim()) && !!(state.zapWalletInfo && state.zapWalletInfo.zap_demo_wallet_available),
        zap_demo_wallet_npub: String((state.zapWalletInfo && state.zapWalletInfo.zap_demo_wallet_npub) || '')
      });
      applyPageTitleConfig(normalizedSiteTitle, appendSiteTitleToPageTitle);
    } catch (err) {
      setOutput(els.outputConfig, 'Error: ' + err.message, 'error');
      setOutput(els.outputCrossposting, 'Error: ' + err.message, 'error');
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
      els.appendSiteTitleToPageTitle,
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

    if (els.newUsersAreAdmins) {
      els.newUsersAreAdmins.addEventListener('change', function () {
        if (state.isLoadingConfig) {
          return;
        }
        if (els.newUsersAreAdmins.checked) {
          const confirmed = window.confirm('Enable admin-by-default for new registrations? This grants full admin access to every new account.');
          if (!confirmed) {
            els.newUsersAreAdmins.checked = false;
            return;
          }
        }
        queueConfigAutosave(200);
      });
    }

    if (els.nostrBridgeEnabled) {
      els.nostrBridgeEnabled.addEventListener('change', function () { queueNostrBridgeAutosave(180); });
    }

    [els.nostrAuthors, els.nostrRelays, els.nostrBlocklist].filter(Boolean).forEach(function (field) {
      field.addEventListener('input', function () { queueNostrBridgeAutosave(850); });
      field.addEventListener('change', function () { queueNostrBridgeAutosave(250); });
      field.addEventListener('blur', function () { queueNostrBridgeAutosave(220); });
    });
  }

  function setAdminNavStatusLoading(target) {
    if (!target) {
      return;
    }
    target.className = 'admin-nav-status-pill is-loading';
    target.innerHTML = '<span class="admin-nav-status-spinner" aria-hidden="true"></span><span class="sr-only">Loading</span>';
    target.setAttribute('aria-label', 'Loading status');
  }

  function setNosterNavStatus(runtime, loading) {
    if (!els.navNosterStatus) {
      return;
    }
    if (loading) {
      setAdminNavStatusLoading(els.navNosterStatus);
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
    els.navNosterStatus.setAttribute('aria-label', label);
  }

  function setZapsNavStatus(runtime, loading) {
    if (!els.navZapsStatus) {
      return;
    }
    if (loading) {
      setAdminNavStatusLoading(els.navZapsStatus);
      return;
    }
    const info = runtime && typeof runtime === 'object' ? runtime : {};
    const zapsEnabled = !!info.zaps_enabled;
    const signerReady = !!info.site_signer_ready;
    const endpointReady = !!info.zap_endpoint_ready;
    const activeAddress = String(info.effective_lud16 || '').trim();
    const canReceive = !!info.can_receive_zaps;
    let label = 'Offline';
    let statusClass = 'is-offline';
    if (zapsEnabled && canReceive) {
      label = 'Ready';
      statusClass = 'is-connected';
    } else if (zapsEnabled && (signerReady || activeAddress || endpointReady || !!info.lightning_online)) {
      label = 'Partial';
      statusClass = 'is-installed';
    } else if (canReceive) {
      label = 'Available';
      statusClass = 'is-online';
    }
    els.navZapsStatus.textContent = label;
    els.navZapsStatus.className = 'admin-nav-status-pill ' + statusClass;
    els.navZapsStatus.setAttribute('aria-label', label);
  }

  function renderZapWalletSummary(info) {
    const data = info && typeof info === 'object' ? info : {};
    state.zapWalletInfo = data;
    if (!els.zapWalletSummary) {
      return;
    }
    const configured = String(data.zap_lud16 || '').trim();
    const effective = String(data.zap_effective_lud16 || configured || '').trim();
    const source = String(data.zap_lud16_source || '').trim().toLowerCase();
    const npub = String(data.zap_demo_wallet_npub || '').trim();
    const demoAvailable = !!data.zap_demo_wallet_available;
    const demoActive = !!data.zap_demo_wallet_active;
    if (configured && effective) {
      els.zapWalletSummary.innerHTML = 'Active Lightning Address: <code>' + escapeHtml(effective) + '</code>. This is the address used in your site metadata and zap buttons.';
      return;
    }
    if (effective && (demoActive || source === 'demo')) {
      els.zapWalletSummary.innerHTML = 'Using the automatic demo wallet <code>' + escapeHtml(effective) + '</code>' + (npub ? (' from site signer <code>' + escapeHtml(npub) + '</code>.') : '.');
      return;
    }
    if (demoAvailable && npub) {
      els.zapWalletSummary.innerHTML = 'Leave this blank to use the automatic demo wallet <code>' + escapeHtml(npub + '@npub.cash') + '</code> while you test.';
      return;
    }
    els.zapWalletSummary.textContent = 'Complete site Nostr identity provisioning first so the automatic demo wallet can be derived from the site signer.';
  }

  function setBtcpayNavStatus(runtime, loading) {
    if (!els.navBtcpayStatus) {
      return;
    }
    if (loading) {
      setAdminNavStatusLoading(els.navBtcpayStatus);
      return;
    }
    const info = runtime && typeof runtime === 'object' ? runtime : {};
    const lightningOnline = !!info.lightning_online;
    const endpointReady = !!info.zap_endpoint_ready;
    const lightningConfigured = !!info.lightning_configured;
    const canReceive = !!info.can_receive_zaps;
    let label = 'Offline';
    let statusClass = 'is-offline';
    if (canReceive) {
      label = 'Ready';
      statusClass = 'is-connected';
    } else if (lightningOnline && endpointReady) {
      label = 'Live';
      statusClass = 'is-online';
    } else if (lightningOnline) {
      label = 'Online';
      statusClass = 'is-online';
    } else if (lightningConfigured) {
      label = 'Configured';
      statusClass = 'is-installed';
    }
    els.navBtcpayStatus.textContent = label;
    els.navBtcpayStatus.className = 'admin-nav-status-pill ' + statusClass;
    els.navBtcpayStatus.setAttribute('aria-label', label);
  }

  function setBtcpayCheckoutNavStatus(runtime, loading) {
    if (!els.navBtcpayCheckoutStatus) {
      return;
    }
    if (loading) {
      setAdminNavStatusLoading(els.navBtcpayCheckoutStatus);
      return;
    }
    const info = runtime && typeof runtime === 'object' ? runtime : {};
    const checkoutReady = !!info.checkout_ready;
    const apiReady = !!info.btcpay_api_ready;
    const publicReady = !!info.btcpay_public_ready;
    const apiConfigured = !!info.btcpay_api_configured;
    const serverConfigured = !!String(info.btcpay_url || info.btcpay_host || '').trim();
    let label = 'Offline';
    let statusClass = 'is-offline';
    if (checkoutReady) {
      label = 'Ready';
      statusClass = 'is-connected';
    } else if (apiReady || (publicReady && apiConfigured)) {
      label = 'Partial';
      statusClass = 'is-installed';
    } else if (publicReady) {
      label = 'Reachable';
      statusClass = 'is-online';
    } else if (apiConfigured || serverConfigured) {
      label = 'Configured';
      statusClass = 'is-installed';
    }
    els.navBtcpayCheckoutStatus.textContent = label;
    els.navBtcpayCheckoutStatus.className = 'admin-nav-status-pill ' + statusClass;
    els.navBtcpayCheckoutStatus.setAttribute('aria-label', label);
  }

  function setVideoCallingNavStatus(loading) {
    if (!els.navVideoCallingStatus) {
      return;
    }
    if (loading) {
      setAdminNavStatusLoading(els.navVideoCallingStatus);
      return;
    }
    const plugins = normalizePlugins(state.plugins || {});
    const cfg = normalizeVideoChatConfig(state.videoChatConfig || {});
    const hasBackend = !!(cfg.janus_wss || cfg.signaling_wss);
    let label = 'Off';
    let statusClass = 'is-offline';
    if (plugins.video_chat && hasBackend) {
      label = 'Ready';
      statusClass = 'is-connected';
    } else if (plugins.video_chat) {
      label = 'Enabled';
      statusClass = 'is-installed';
    }
    els.navVideoCallingStatus.textContent = label;
    els.navVideoCallingStatus.className = 'admin-nav-status-pill ' + statusClass;
    els.navVideoCallingStatus.setAttribute('aria-label', label);
  }

  function statusValueHtml(ok, okLabel, badLabel) {
    return '<div class="zaps-runtime-value ' + (ok ? 'is-ok' : 'is-warn') + '">' + escapeHtml(ok ? okLabel : badLabel) + '</div>';
  }

  function runtimeLinkHtml(url, fallback) {
    const href = String(url || '').trim();
    if (!href) {
      return '<span class="zaps-runtime-value is-warn">' + escapeHtml(fallback || 'Unavailable') + '</span>';
    }
    return '<a href="' + escapeAttr(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(href) + '</a>';
  }

  function formatZapReceivedAt(value) {
    const numeric = Number(value || 0);
    const dt = numeric > 0 ? new Date(numeric * 1000) : null;
    if (!dt || Number.isNaN(dt.getTime())) {
      return 'Unknown';
    }
    return dt.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function shortZapId(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '-';
    }
    if (raw.length <= 18) {
      return raw;
    }
    return raw.slice(0, 10) + '...' + raw.slice(-6);
  }

  function zapPostTargetLabel(zap) {
    const address = String((zap && zap.post_address) || '').trim();
    if (address) {
      return shortZapId(address);
    }
    const eventId = String((zap && zap.post_event_id) || '').trim();
    if (eventId) {
      return shortZapId(eventId);
    }
    return '-';
  }

  function renderReceivedZaps(zaps) {
    if (!els.zapsReceivedList) {
      return;
    }
    const rows = Array.isArray(zaps) ? zaps : [];
    if (!rows.length) {
      els.zapsReceivedList.innerHTML = '<p class="placeholder table-empty">No signed zaps received yet.</p>';
      return;
    }
    let html = '<div class="zaps-received-table">';
    html += '<div class="zaps-received-header" aria-hidden="true">';
    html += '<div class="zaps-received-col zaps-received-col-head">Received</div>';
    html += '<div class="zaps-received-col zaps-received-col-head">Amount</div>';
    html += '<div class="zaps-received-col zaps-received-col-head">Sender</div>';
    html += '<div class="zaps-received-col zaps-received-col-head">Post</div>';
    html += '<div class="zaps-received-col zaps-received-col-head">Relays</div>';
    html += '</div>';
    rows.forEach(function (zap) {
      const amountSats = Math.max(0, Math.floor(Number(zap && zap.amount_sats) || 0));
      const note = String((zap && zap.note) || '').trim();
      const sender = shortZapId((zap && (zap.sender_pubkey || zap.request_pubkey)) || '');
      const eventId = shortZapId((zap && zap.event_id) || '');
      const relays = Math.max(0, Math.floor(Number(zap && zap.relay_count) || 0));
      html += '<div class="post-row zaps-received-row" title="Receipt event ' + escapeAttr(eventId) + '">';
      html += '<div class="zaps-received-col" data-label="Received">' + escapeHtml(formatZapReceivedAt(zap && zap.received_at)) + '</div>';
      html += '<div class="zaps-received-col zaps-received-amount" data-label="Amount">' + escapeHtml(String(amountSats)) + ' sats</div>';
      html += '<div class="zaps-received-col" data-label="Sender"><code>' + escapeHtml(sender) + '</code></div>';
      html += '<div class="zaps-received-col" data-label="Post"><code>' + escapeHtml(zapPostTargetLabel(zap)) + '</code>' + (note ? '<span class="zaps-received-note">' + escapeHtml(note) + '</span>' : '') + '</div>';
      html += '<div class="zaps-received-col" data-label="Relays">' + escapeHtml(String(relays)) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    els.zapsReceivedList.innerHTML = html;
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

  function runtimeActionButtonHtml(config) {
    const opts = config && typeof config === 'object' ? config : {};
    const action = String(opts.action || '').trim();
    const label = String(opts.label || '').trim();
    const dataAttr = String(opts.dataAttr || '').trim();
    const disabled = !!opts.disabled;
    const loading = !!opts.loading;
    const busyLabel = String(opts.busyLabel || 'Installing...').trim() || 'Installing...';
    const spinnerAfter = !!opts.spinnerAfter;
    const title = String(opts.title || '').trim();
    if (!action || !label || !dataAttr) {
      return '';
    }
    const disabledAttr = disabled ? ' disabled aria-disabled="true"' : '';
    const titleAttr = title ? ' title="' + escapeAttr(title) + '"' : '';
    if (loading) {
      const spinnerHtml = '<span class="loading-spinner" aria-hidden="true"></span>';
      const busyTextHtml = '<span>' + escapeHtml(busyLabel) + '</span>';
      return '<button type="button" class="zaps-runtime-action is-loading" data-' + dataAttr + '="' + escapeAttr(action) + '"' + disabledAttr + ' aria-busy="true"' + titleAttr + '>' + (spinnerAfter ? (busyTextHtml + spinnerHtml) : (spinnerHtml + busyTextHtml)) + '</button>';
    }
    return '<button type="button" class="zaps-runtime-action" data-' + dataAttr + '="' + escapeAttr(action) + '"' + disabledAttr + titleAttr + '>' + escapeHtml(label) + '</button>';
  }

  function setZapsRuntimeFeedback(message, logText) {
    state.zapsRuntimeMessage = String(message || '');
    state.zapsRuntimeLog = String(logText || '');
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
        : runtimeActionButtonHtml({
          action: 'install',
          label: 'Install Stonr',
          dataAttr: 'noster-action',
          disabled: state.nosterActionInFlight,
          loading: state.nosterActionInFlight && state.nosterActionPending === 'install'
        }))
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

  async function loadNosterRuntime(options) {
    if (!els.nosterRuntime) {
      return;
    }
    const opts = options && typeof options === 'object' ? options : {};
    const background = !!opts.background;
    if (!background) {
      setNosterNavStatus(null, true);
    }
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
      if (!background) {
        renderNosterRuntime({}, '', '');
        setOutput(els.outputNostrBridge, 'Error: ' + err.message, 'error');
      }
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
    state.nosterActionPending = picked;
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
      state.nosterActionPending = '';
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
      loadNosterRuntime({ background: true }).catch(function () {});
    }, 10000);
  }

  function syncZapsEnabledAvailability() {
    if (!els.zapsEnabled) {
      return;
    }
    const zapsPluginEnabled = !!(state.plugins && state.plugins.zaps);
    if (!zapsPluginEnabled) {
      els.zapsEnabled.disabled = true;
      const disabledRow = els.zapsEnabled.closest('.field-row');
      if (disabledRow) {
        disabledRow.classList.add('is-control-disabled');
      }
      els.zapsEnabled.setAttribute('title', 'Enable the Zaps plugin first.');
      return;
    }
    const info = state.zapsRuntimeInfo && typeof state.zapsRuntimeInfo === 'object'
      ? state.zapsRuntimeInfo
      : {};
    const canEnable = !!String(info.effective_lud16 || '').trim() || !!info.demo_wallet_available;
    els.zapsEnabled.disabled = !canEnable;
    const row = els.zapsEnabled.closest('.field-row');
    if (row) {
      row.classList.toggle('is-control-disabled', !canEnable);
    }
    if (canEnable) {
      els.zapsEnabled.removeAttribute('title');
      return;
    }
    els.zapsEnabled.setAttribute('title', 'Provision a site signer or Lightning Address first.');
  }

  function stopZapsPolling() {
    if (state.zapsPollTimer) {
      clearInterval(state.zapsPollTimer);
      state.zapsPollTimer = null;
    }
  }

  function setZapsRuntimeFeedback(message, logText) {
    state.zapsRuntimeMessage = String(message || '').trim();
    state.zapsRuntimeLog = String(logText || '');
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
    const runtimeMessage = typeof message === 'string' ? message : state.zapsRuntimeMessage;
    const runtimeLog = typeof logText === 'string' ? logText : state.zapsRuntimeLog;
    const showChecking = !!state.zapsRuntimeLoading && !state.zapsRuntimeReady;
    const checkingValueHtml = '<div class="zaps-runtime-value">Checking... <span class="loading-spinner" aria-hidden="true"></span></div>';
    const signerReady = !!info.site_signer_ready;
    const zapsEnabled = !!info.zaps_enabled;
    const endpointReady = !!info.zap_endpoint_ready;
    const effectiveLud16 = String(info.effective_lud16 || '').trim();
    const lightningOnline = !!info.lightning_online;
    const lightningSynced = !!info.lightning_synced;
    const canReceive = !!info.can_receive_zaps;
    const numPeers = Number(info.num_peers || 0);
    const inboundLiquidity = Number(info.inbound_liquidity_sats || 0);
    const publicAddress = String(info.lightning_public_address || '').trim();
    const endpointUrl = String(info.zap_endpoint_url || '').trim();
    const lud16Source = String(info.lud16_source || '').trim().toLowerCase();
    renderReceivedZaps(info.recent_zaps);
    let receiveReadyBadLabel = 'Needs inbound liquidity';
    if (!lightningOnline) {
      receiveReadyBadLabel = 'Lightning offline';
    } else if (!lightningSynced) {
      receiveReadyBadLabel = 'Bitcoin syncing';
    } else if (!endpointReady) {
      receiveReadyBadLabel = 'Endpoint pending';
    }
    let html = '';
    html += '<div class="field-row"><div class="setting-label"><strong>Provisioning</strong></div><div class="zaps-runtime-value">Managed in Headquarters</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Zap feature</strong></div>'
      + (showChecking ? checkingValueHtml : statusValueHtml(zapsEnabled, 'Enabled', 'Disabled'))
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Site signer</strong></div>'
      + (showChecking ? checkingValueHtml : statusValueHtml(signerReady, 'Ready', 'Missing'))
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Active Lightning Address</strong></div>'
      + '<div class="zaps-runtime-value">' + (effectiveLud16 ? ('<code>' + escapeHtml(effectiveLud16) + '</code>') : '<span class="zaps-runtime-value is-warn">Not set</span>') + '</div>'
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Bellheim zap target</strong></div><div class="zaps-runtime-value">'
      + (effectiveLud16 ? ('<code>' + escapeHtml(effectiveLud16) + '</code>') : '<span class="zaps-runtime-value is-warn">Use the active Lightning Address once set</span>')
      + '<div class="muted">Nostr Wallet Connect is a separate wallet-control secret. Use Headquarters Zap / Pay Node to provision or reveal it; do not publish it as public zap metadata.</div>'
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Address source</strong></div><div class="zaps-runtime-value">'
      + escapeHtml(lud16Source ? lud16Source : 'unavailable')
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Lightning Address endpoint</strong></div>'
      + (showChecking ? checkingValueHtml : statusValueHtml(endpointReady, 'Live', 'Pending'))
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Endpoint URL</strong></div><div class="zaps-runtime-value">'
      + runtimeLinkHtml(endpointUrl, 'Unavailable')
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Lightning node</strong></div>'
      + (showChecking ? checkingValueHtml : statusValueHtml(lightningOnline, 'Online', 'Offline'))
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Bitcoin sync</strong></div>'
      + (showChecking ? checkingValueHtml : statusValueHtml(lightningSynced, 'Synced', 'Syncing'))
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Public peer address</strong></div><div class="zaps-runtime-value">'
      + (publicAddress ? ('<code>' + escapeHtml(publicAddress) + '</code>') : '<span class="zaps-runtime-value is-warn">Unavailable</span>')
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Peers</strong></div><div class="zaps-runtime-value">'
      + escapeHtml(String(numPeers))
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Receive readiness</strong></div>'
      + (showChecking ? checkingValueHtml : statusValueHtml(canReceive, 'Ready', receiveReadyBadLabel))
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Inbound liquidity</strong></div><div class="zaps-runtime-value">'
      + escapeHtml(String(inboundLiquidity)) + ' sats'
      + '</div></div>';
    if (runtimeMessage) {
      html += '<pre class="zaps-runtime-log">' + escapeHtml(String(runtimeMessage)) + (runtimeLog ? '\n\n' + escapeHtml(String(runtimeLog)) : '') + '</pre>';
    } else if (runtimeLog) {
      html += '<pre class="zaps-runtime-log">' + escapeHtml(String(runtimeLog)) + '</pre>';
    }
    els.zapsRuntime.innerHTML = html;
  }

  async function loadZapsRuntime() {
    if (!els.zapsRuntime) {
      return;
    }
    setZapsNavStatus(null, true);
    if (!state.zapsRuntimeReady && !state.zapsActionInFlight) {
      state.zapsRuntimeLoading = true;
      renderZapsRuntime(state.zapsRuntimeInfo || {}, undefined, undefined);
    }
    try {
      const data = await apiPost('/cgi/blog-manage-zaps', { action: 'status' }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to load zap runtime');
      }
      state.zapsRuntimeLoading = false;
      state.zapsRuntimeReady = true;
      renderZapsRuntime(data.runtime || {}, undefined, undefined);
      if (els.outputZaps) {
        els.outputZaps.innerHTML = '';
      }
    } catch (err) {
      state.zapsRuntimeLoading = false;
      renderZapsRuntime(state.zapsRuntimeInfo || {}, undefined, undefined);
      setOutput(els.outputZaps, 'Error: ' + err.message, 'error');
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
      if (document.visibilityState !== 'visible') {
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
    const lightningConfigured = !!info.lightning_configured;
    const lightningOnline = !!info.lightning_online;
    const publicAddress = String(info.public_address || '').trim();
    const nodeAlias = String(info.node_alias || '').trim();
    const nodeId = String(info.node_id || '').trim();
    const numPeers = Number(info.num_peers || 0);
    const numActiveChannels = Number(info.num_active_channels || 0);
    const numPendingChannels = Number(info.num_pending_channels || 0);
    const inboundLiquidity = Number(info.inbound_liquidity_sats || 0);
    const outboundLiquidity = Number(info.outbound_liquidity_sats || 0);
    const canReceive = !!info.can_receive_zaps;
    const effectiveLud16 = String(info.effective_lud16 || '').trim();
    const endpointUrl = String(info.zap_endpoint_url || '').trim();
    const endpointReady = !!info.zap_endpoint_ready;

    let html = '';
    html += '<div class="field-row"><div class="setting-label"><strong>Provisioning</strong></div><div class="zaps-runtime-value">Managed in Headquarters</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Node stack</strong></div>'
      + statusValueHtml(lightningConfigured, 'Configured', 'Not configured')
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Node status</strong></div>'
      + statusValueHtml(lightningOnline, 'Online', 'Offline')
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Public peer address</strong></div>'
      + '<div class="zaps-runtime-value">' + (publicAddress ? ('<code>' + escapeHtml(publicAddress) + '</code>') : '<span class="zaps-runtime-value is-warn">Not set</span>') + '</div>'
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Node alias</strong></div><div class="zaps-runtime-value">'
      + (nodeAlias ? escapeHtml(nodeAlias) : '<span class="zaps-runtime-value is-warn">Unavailable</span>')
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Node id</strong></div><div class="zaps-runtime-value">'
      + (nodeId ? ('<code>' + escapeHtml(nodeId) + '</code>') : '<span class="zaps-runtime-value is-warn">Unavailable</span>')
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Peers</strong></div><div class="zaps-runtime-value">'
      + escapeHtml(String(numPeers))
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Active channels</strong></div><div class="zaps-runtime-value">'
      + escapeHtml(String(numActiveChannels))
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Pending channels</strong></div><div class="zaps-runtime-value">'
      + escapeHtml(String(numPendingChannels))
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Inbound liquidity</strong></div><div class="zaps-runtime-value">'
      + escapeHtml(String(inboundLiquidity)) + ' sats'
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Outbound liquidity</strong></div><div class="zaps-runtime-value">'
      + escapeHtml(String(outboundLiquidity)) + ' sats'
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Receive readiness</strong></div>'
      + statusValueHtml(canReceive, 'Ready', 'Needs inbound liquidity')
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Published zap address</strong></div>'
      + '<div class="zaps-runtime-value">' + (effectiveLud16 ? ('<code>' + escapeHtml(effectiveLud16) + '</code>') : '<span class="zaps-runtime-value is-warn">Not set</span>') + '</div>'
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Lightning Address endpoint</strong></div>'
      + statusValueHtml(endpointReady, 'Live', 'Pending')
      + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Endpoint URL</strong></div>'
      + '<div class="zaps-runtime-value">' + runtimeLinkHtml(endpointUrl, 'Unavailable') + '</div>'
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
    setBtcpayNavStatus(null, true);
    try {
      const data = await apiPost('/cgi/blog-manage-lightning', { action: 'status' }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to load Lightning runtime');
      }
      renderBtcpayRuntime(data.runtime || {}, '', '');
      if (els.outputBtcpay) {
        els.outputBtcpay.innerHTML = '';
      }
    } catch (err) {
      renderBtcpayRuntime({}, '', '');
      setOutput(els.outputBtcpay, 'Error: ' + err.message, 'error');
    }
  }

  function renderBtcpayCheckoutRuntime(runtime, message) {
    if (!els.btcpayCheckoutRuntime) {
      return;
    }
    const info = runtime && typeof runtime === 'object' ? runtime : {};
    state.btcpayCheckoutRuntimeInfo = info;
    setBtcpayCheckoutNavStatus(info);
    const btcpayUrl = String(info.btcpay_url || '').trim();
    const storeId = String(info.btcpay_store_id || '').trim();
    const authorizeUrl = String(info.btcpay_authorize_url || '').trim();
    const webhookUrl = String(info.btcpay_webhook_url || '').trim();
    const apiConfigured = !!info.btcpay_api_configured;
    const apiReady = !!info.btcpay_api_ready;
    const publicReady = !!info.btcpay_public_ready;
    const webhookConfigured = !!info.btcpay_webhook_configured;
    const checkoutReady = !!info.checkout_ready;

    let html = '';
    html += '<div class="field-row"><div class="setting-label"><strong>Provisioning</strong></div><div class="zaps-runtime-value">Managed in Headquarters</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>BTCPay server</strong></div><div class="zaps-runtime-value">' + runtimeLinkHtml(btcpayUrl, 'Not configured') + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Public reachability</strong></div>' + statusValueHtml(publicReady, 'Reachable', 'Pending') + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Checkout API</strong></div>' + statusValueHtml(apiReady, 'Connected', apiConfigured ? 'Configured, not verified' : 'Needs API key') + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Webhook secret</strong></div>' + statusValueHtml(webhookConfigured, 'Configured', 'Missing') + '</div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Checkout readiness</strong></div>' + statusValueHtml(checkoutReady, 'Ready', 'Not ready') + '</div>';
    html += '<div class="field-row"><label class="setting-label" for="btcpay-checkout-host"><strong>BTCPay Host</strong></label><input id="btcpay-checkout-host" type="text" value="' + escapeHtml(String(info.btcpay_host || 'pay.andersaamodt.com')) + '" autocomplete="off"></div>';
    html += '<div class="field-row"><label class="setting-label" for="btcpay-checkout-rootpath"><strong>Root Path</strong></label><input id="btcpay-checkout-rootpath" type="text" value="' + escapeHtml(String(info.btcpay_rootpath || '/')) + '" autocomplete="off"></div>';
    html += '<div class="field-row"><label class="setting-label" for="btcpay-checkout-store-id"><strong>Store ID</strong></label><input id="btcpay-checkout-store-id" type="text" value="' + escapeHtml(storeId) + '" autocomplete="off"></div>';
    html += '<div class="field-row"><label class="setting-label" for="btcpay-checkout-api-key"><strong>API Key</strong></label><input id="btcpay-checkout-api-key" type="password" value="" placeholder="' + (apiConfigured ? 'Configured; paste a replacement only when rotating' : 'Paste BTCPay API key') + '" autocomplete="off"></div>';
    html += '<div class="field-row"><label class="setting-label" for="btcpay-checkout-webhook-secret"><strong>Webhook Secret</strong></label><input id="btcpay-checkout-webhook-secret" type="password" value="" placeholder="' + (webhookConfigured ? 'Configured; paste a replacement only when rotating' : 'Generated by Headquarters') + '" autocomplete="off"></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Authorization Flow</strong></div><div class="runtime-action-row">'
      + (authorizeUrl ? '<a class="btn ghost compact-btn" href="' + escapeHtml(authorizeUrl) + '" target="_blank" rel="noopener">BTCPay Authorization</a>' : '<span class="zaps-runtime-value is-warn">Authorization URL unavailable</span>')
      + '<button type="button" class="btn ghost compact-btn" data-btcpay-checkout-save>Save Settings</button>'
      + '</div></div>';
    html += '<div class="field-row"><div class="setting-label"><strong>Webhook URL</strong></div><div class="zaps-runtime-value">' + (webhookUrl ? '<code>' + escapeHtml(webhookUrl) + '</code>' : '<span class="zaps-runtime-value is-warn">Unavailable</span>') + '</div></div>';
    if (message) {
      html += '<pre class="zaps-runtime-log">' + escapeHtml(String(message)) + '</pre>';
    }
    els.btcpayCheckoutRuntime.innerHTML = html;
  }

  async function loadBtcpayCheckoutRuntime() {
    if (!els.btcpayCheckoutRuntime) {
      return;
    }
    setBtcpayCheckoutNavStatus(null, true);
    try {
      const data = await apiPost('/cgi/blog-manage-btcpay', { action: 'status' }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to load BTCPay checkout runtime');
      }
      renderBtcpayCheckoutRuntime(data.runtime || {}, '');
      if (els.outputBtcpayCheckout) {
        els.outputBtcpayCheckout.innerHTML = '';
      }
    } catch (err) {
      renderBtcpayCheckoutRuntime({}, '');
      setOutput(els.outputBtcpayCheckout, 'Error: ' + err.message, 'error');
    }
  }

  async function saveBtcpayCheckoutConfig() {
    const runtimeRoot = els.btcpayCheckoutRuntime;
    if (!runtimeRoot) return;
    const hostInput = runtimeRoot.querySelector('#btcpay-checkout-host');
    const rootpathInput = runtimeRoot.querySelector('#btcpay-checkout-rootpath');
    const storeInput = runtimeRoot.querySelector('#btcpay-checkout-store-id');
    const keyInput = runtimeRoot.querySelector('#btcpay-checkout-api-key');
    const secretInput = runtimeRoot.querySelector('#btcpay-checkout-webhook-secret');
    try {
      const data = await apiPost('/cgi/blog-manage-btcpay', {
        action: 'save_config',
        btcpay_host: hostInput ? hostInput.value.trim() : '',
        btcpay_rootpath: rootpathInput ? rootpathInput.value.trim() : '/',
        btcpay_store_id: storeInput ? storeInput.value.trim() : '',
        btcpay_api_key: keyInput ? keyInput.value.trim() : '',
        payments_webhook_secret: secretInput ? secretInput.value.trim() : ''
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to save BTCPay checkout settings');
      }
      renderBtcpayCheckoutRuntime(data.runtime || {}, data.message || 'BTCPay checkout settings saved.');
      setOutput(els.outputBtcpayCheckout, 'BTCPay checkout settings saved.', 'ok');
    } catch (err) {
      setOutput(els.outputBtcpayCheckout, 'Error: ' + err.message, 'error');
    }
  }

  async function saveAccount() {
    if (!els.accountPlayerName || !els.accountPublishName) {
      return;
    }
    const nextPlayerName = els.accountPlayerName.value.trim();
    const nextPublishName = els.accountPublishName.value.trim();
    const currentPublishName = String(state.publishName || state.playerName || state.username || '').trim();
    let renameAuthoredPosts = false;
    try {
      if (nextPublishName && currentPublishName && nextPublishName !== currentPublishName) {
        const preview = await apiPost('/cgi/blog-update-account', {
          player_name: nextPlayerName,
          publish_name: nextPublishName,
          preview_rename: 'true'
        }, true);
        if (!preview.success) {
          throw new Error(preview.error || 'Could not check authored posts');
        }
        const candidateCount = Number(preview.rename_candidate_count || 0);
        const oldNameForPrompt = String(preview.old_publish_name || currentPublishName || '').trim();
        if (candidateCount > 0) {
          renameAuthoredPosts = window.confirm(
            'Posts were found authored under your old publish name.\n\n' +
            'Would you like to update the author field of all these posts to your new name?\n\n' +
            'Old name: "' + oldNameForPrompt + '"\n' +
            'New name: "' + nextPublishName + '"\n' +
            'Matching posts: ' + candidateCount
          );
        }
      }
      const data = await apiPost('/cgi/blog-update-account', {
        player_name: nextPlayerName,
        publish_name: nextPublishName,
        rename_authored_posts: renameAuthoredPosts ? 'true' : 'false'
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to save account');
      }
      state.playerName = data.player_name || state.username;
      state.publishName = data.publish_name || state.playerName || state.username;
      if (els.accountPlayerName) {
        els.accountPlayerName.value = state.playerName;
      }
      if (els.accountPublishName) {
        els.accountPublishName.value = state.publishName;
      }
      const navName = document.getElementById('nav-user-name');
      if (navName) {
        navName.textContent = state.playerName;
      }
      const renamedPosts = Number(data.renamed_posts || 0);
      if (renameAuthoredPosts) {
        setOutput(
          els.outputAccount,
          renamedPosts > 0
            ? ('Account updated. Publish name updated on ' + renamedPosts + ' post' + (renamedPosts === 1 ? '' : 's') + '.')
            : 'Account updated. No authored posts matched your old publish name.',
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
          name: 'Nostr Blog',
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

  function postListDisplayTitle(primary, fallback) {
    const title = String(primary || '').trim();
    if (title) {
      return title;
    }
    const excerpt = String(fallback || '').trim();
    if (excerpt) {
      return excerpt;
    }
    return 'Untitled';
  }

  function renderDraftList(drafts) {
    if (!drafts.length) {
      els.draftsList.innerHTML = '<div class="draft-rows"><p class="placeholder table-empty">No drafts yet.</p></div>';
      return;
    }

    let html = '<div class="draft-rows">';
    drafts.forEach(function (draft) {
      const title = postListDisplayTitle(draft.title, draft.content_excerpt);
      const excerpt = String(draft.content_excerpt || '').trim();
      const draftId = escapeAttr(draft.draft_id || '');
      html += '<div class="post-row draft-row" data-draft-id="' + draftId + '">';
      html += '<div class="post-row-main draft-row-main">';
      html += '<div class="draft-row-line post-row-title" title="' + escapeAttr(title) + '">' +
        '<a href="#" class="draft-row-open post-row-open post-row-title" data-draft-action="open" data-draft-id="' + draftId + '">' + escapeHtml(title) + '</a>' +
        '</div>';
      if (excerpt) {
        html += '<div class="draft-row-excerpt muted" title="' + escapeAttr(excerpt) + '">' + escapeHtml(excerpt) + '</div>';
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
      const title = postListDisplayTitle(item && item.title, item && item.content_excerpt);
      html += '<div class="' + rowClass + '">';
      html += '<div class="queue-row-main">';
      html += '<div class="queue-row-title"><button type="button" class="queue-row-open" data-queue-action="edit" data-draft-id="' + escapeAttr(item.draft_id || '') + '">' + escapeHtml(title) + '</button></div>';
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
    const visibleDrafts = [];
    const unsavedPostDraftsByPath = {};
    drafts.forEach(function (draft) {
      const sourcePath = normalizeComposeSourcePostPath((draft && draft.source_post_path) || '');
      if (sourcePath) {
        unsavedPostDraftsByPath[sourcePath] = true;
        return;
      }
      visibleDrafts.push(draft);
    });
    state.unsavedPostDraftsByPath = unsavedPostDraftsByPath;
    if (els.navDraftsCount) {
      els.navDraftsCount.textContent = '(' + visibleDrafts.length + ')';
    }
    renderDraftList(visibleDrafts);
    if (state.postsCache.length && els.postsList) {
      renderPostsList(state.postsCache);
    }
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
    state.nextDripTitle = dripQueue.length ? postListDisplayTitle(dripQueue[0].title, dripQueue[0].content_excerpt) : '';
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

  function fileActionButton(label, action, fileId, className, extraAttrs) {
    const classes = className ? ' class="' + className + '"' : '';
    const attrs = extraAttrs ? (' ' + extraAttrs) : '';
    return '<button type="button"' + classes + ' data-file-action="' + escapeAttr(action) + '" data-file-id="' + escapeAttr(fileId) + '"' + attrs + '>' + label + '</button>';
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

  function findPostByPath(postPath) {
    const wanted = String(postPath || '').trim();
    if (!wanted) {
      return null;
    }
    return state.postsCache.find(function (post) {
      return String(post && post.path || '').trim() === wanted;
    }) || null;
  }

  function renderPostCrosspostingHtml(post) {
    const crossposting = normalizePostCrossposting(post && post.crossposting);
    if (!crossposting.available || !crossposting.enabled_count) {
      return '';
    }
    let iconsHtml = '';
    crossposting.platforms.forEach(function (platform) {
      const statusClass = originStatusClass(platform.status);
      const title = originPlatformLabel(platform.id) + ': ' + originStatusLabel(platform.status);
      const chipClass = 'post-crosspost-chip ' + statusClass;
      const iconHtml = originPlatformIconHtml(platform.id);
      if (platform.remote_url && (platform.status === 'published' || platform.status === 'ok')) {
        iconsHtml += '<a class="' + chipClass + '" href="' + escapeAttr(platform.remote_url) + '" target="_blank" rel="noopener noreferrer" title="' + escapeAttr(title) + '" aria-label="' + escapeAttr(title) + '">' + iconHtml + '</a>';
      } else {
        iconsHtml += '<span class="' + chipClass + '" title="' + escapeAttr(title) + '" aria-label="' + escapeAttr(title) + '">' + iconHtml + '</span>';
      }
    });
    return '<div class="post-row-crossposting"><div class="post-crossposting" aria-label="Cross-post status"><div class="post-crossposting-icons">' + iconsHtml + '</div><span class="post-crossposting-summary">' + String(crossposting.published_count) + '/' + String(crossposting.enabled_count) + ' live</span></div></div>';
  }

  function renderPostCrosspostDialogUi(post) {
    const crossposting = normalizePostCrossposting(post && post.crossposting);
    const remaining = crossposting.platforms.filter(function (platform) {
      return platform.status !== 'published' && platform.status !== 'ok';
    });
    const postTitle = postListDisplayTitle(post && post.title, post && post.content_excerpt);
    if (els.postCrosspostSubtitle) {
      if (!crossposting.enabled_count) {
        els.postCrosspostSubtitle.textContent = 'Enable Origin destinations on the Cross-posting page before using per-post cross-posting.';
      } else if (!remaining.length) {
        els.postCrosspostSubtitle.textContent = '"' + postTitle + '" is already live on every enabled destination.';
      } else {
        els.postCrosspostSubtitle.textContent = '"' + postTitle + '" can still be sent to ' + String(remaining.length) + ' of ' + String(crossposting.enabled_count) + ' enabled destinations.';
      }
    }
    if (els.postCrosspostList) {
      if (!crossposting.enabled_count) {
        els.postCrosspostList.innerHTML = '<p class="muted">No enabled destinations yet.</p>';
      } else {
        let html = '';
        crossposting.platforms.forEach(function (platform) {
          const isPublished = platform.status === 'published' || platform.status === 'ok';
          const checked = !isPublished && state.postsCrosspostSelection.indexOf(platform.id) >= 0;
          const statusClass = originStatusClass(platform.status);
          const statusLabel = isPublished ? 'Published already' : originStatusLabel(platform.status);
          html += '<label class="crossposting-platform-option post-crosspost-option' + (isPublished ? ' is-disabled' : '') + '" for="post-crosspost-platform-' + escapeAttr(platform.id) + '">';
          html += '<input type="checkbox" id="post-crosspost-platform-' + escapeAttr(platform.id) + '" data-post-crosspost-platform="' + escapeAttr(platform.id) + '"' + (checked ? ' checked' : '') + (isPublished ? ' disabled' : '') + '>';
          html += originPlatformIconHtml(platform.id);
          html += '<span class="crossposting-platform-copy"><strong>' + escapeHtml(originPlatformLabel(platform.id)) + '</strong></span>';
          html += '<span class="post-crosspost-status ' + statusClass + '">' + escapeHtml(statusLabel) + '</span>';
          html += '</label>';
        });
        els.postCrosspostList.innerHTML = html;
      }
    }
    if (els.postCrosspostSubmit) {
      els.postCrosspostSubmit.disabled = !state.postsCrosspostSelection.length || !remaining.length;
    }
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
      const title = postListDisplayTitle(post.title, post.content_excerpt);
      const path = String(post.path || '');
      const source = String(post.source || 'local');
      const author = String(post.author || '').trim();
      const sourceLabel = source === 'nostr' ? 'Nostr' : 'Local';
      const sourceClass = source === 'nostr' ? ' is-nostr' : ' is-local';
      const openUrl = String(post.open_url || '');
      const dateLabel = formatPostPublishedAt(post.published_at);
      const hasUnsavedChanges = !!state.unsavedPostDraftsByPath[String(path || '').trim()];
      const crossposting = normalizePostCrossposting(post && post.crossposting);

      html += '<div class="post-row">';
      html += '<div class="post-row-main">';
      if (openUrl) {
        html += '<a class="post-row-open post-row-title" title="' + escapeAttr(title) + '" href="' + escapeAttr(openUrl) + '">' + escapeHtml(title) + '</a>';
      } else {
        html += '<span class="post-row-title" title="' + escapeAttr(title) + '">' + escapeHtml(title) + '</span>';
      }
      if (hasUnsavedChanges) {
        html += '<span class="post-unsaved-changes">Unpublished changes</span>';
      }
      html += '<span class="post-pill' + sourceClass + '">' + escapeHtml(sourceLabel) + '</span>';
      html += '<span class="post-pill">' + escapeHtml(dateLabel) + '</span>';
      if (author) {
        html += '<span class="post-pill is-author">' + escapeHtml(author) + '</span>';
      }
      html += '</div>';
      html += renderPostCrosspostingHtml(post);
      html += '<div class="post-row-actions">';
      if (crossposting.available && crossposting.enabled_count && crossposting.needs_action) {
        html += '<button type="button" class="post-crosspost-trigger" data-post-action="crosspost" data-post-path="' + escapeAttr(path) + '">Cross-post...</button>';
      }
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
    state.postsCache = posts;
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
      const pendingOpenUrl = fileAccessUrl(String(job.url || '').trim());
      const rowClass = 'post-row file-row file-row-uploading' + (job.done ? (job.error ? ' is-failed' : ' is-done') : '');
      html += '<div class="' + rowClass + '">';
      html += '<div class="file-col file-col-name">';
      if (job.done && !job.error && pendingOpenUrl) {
        html += '<a class="file-row-title file-row-title-link" title="' + escapeAttr(job.name || 'Uploaded file') + '" href="' + escapeAttr(pendingOpenUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(job.name || 'Uploaded file') + '</a>';
      } else {
        html += '<span class="file-row-title" title="' + escapeAttr(job.name || 'Uploading file') + '">' + escapeHtml(job.name || 'Uploading file') + '</span>';
      }
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
      const deleting = !!state.filesDeleting[fileId];
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
      html += '<div class="post-row file-row' + (deleting ? ' is-deleting' : '') + '" data-file-row-id="' + escapeAttr(fileId) + '">';
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
      html += '<button type="button" data-file-action="toggle-public" data-file-id="' + escapeAttr(fileId) + '" data-make-public="' + escapeAttr(explicitPublic ? 'false' : 'true') + '"' + (deleting ? ' disabled' : '') + '>' + (explicitPublic ? 'Make Private' : 'Make Public') + '</button>';
      html += '<button type="button" class="unobtrusive-icon-button" data-file-action="copy-url" data-file-url="' + escapeAttr(url) + '"' +
        (effectivePublic && !deleting ? '' : ' disabled') +
        ' aria-label="Copy file URL" title="' + (effectivePublic ? 'Copy file URL' : 'File is private') + '">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M9 9H19V19H9V9Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M5 15H4.8C3.8 15 3 14.2 3 13.2V4.8C3 3.8 3.8 3 4.8 3H13.2C14.2 3 15 3.8 15 4.8V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '</svg></button>';
      html += '<button type="button" class="post-row-delete post-delete file-delete" data-file-action="delete" data-file-id="' + escapeAttr(fileId) + '" aria-label="Delete file" title="Delete file"' + (deleting ? ' disabled aria-disabled="true"' : '') + '>' + prioritiesTrashIconSvg() + '</button>';
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
    Object.keys(state.filesDeleting || {}).forEach(function (fileId) {
      const stillPresent = state.files.some(function (file) {
        return String(file && file.file_id || '') === fileId;
      });
      if (!stillPresent) {
        delete state.filesDeleting[fileId];
      }
    });
    state.fileUploads = state.fileUploads.filter(function (job) {
      return !(job && job.kind === 'file' && job.done && !job.error);
    });
    renderFilesList(state.files);
    renderUploadJobs();
  }

  function captureFilesFlipLayout() {
    if (!els.filesList) {
      return {};
    }
    const map = {};
    Array.from(els.filesList.querySelectorAll('.file-row[data-file-row-id]')).forEach(function (row) {
      if (!(row instanceof HTMLElement)) {
        return;
      }
      const id = String(row.getAttribute('data-file-row-id') || '').trim();
      if (!id) {
        return;
      }
      map[id] = row.getBoundingClientRect();
    });
    return map;
  }

  function runFilesFlipAnimation(firstRects) {
    if (!els.filesList || !firstRects || typeof firstRects !== 'object') {
      return;
    }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    Array.from(els.filesList.querySelectorAll('.file-row[data-file-row-id]')).forEach(function (row) {
      if (!(row instanceof HTMLElement)) {
        return;
      }
      const id = String(row.getAttribute('data-file-row-id') || '').trim();
      if (!id || !firstRects[id]) {
        return;
      }
      const first = firstRects[id];
      const last = row.getBoundingClientRect();
      const dy = first.top - last.top;
      if (!isFinite(dy) || Math.abs(dy) < 0.5) {
        return;
      }
      try {
        row.animate(
          [
            { transform: 'translateY(' + String(Math.round(dy)) + 'px)' },
            { transform: 'translateY(0px)' }
          ],
          {
            duration: 240,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            fill: 'none'
          }
        );
      } catch (_err) {
        // Ignore animation failures.
      }
    });
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

  async function deleteFile(fileId) {
    const id = String(fileId || '').trim();
    if (!id) {
      throw new Error('Missing file id');
    }
    if (state.filesDeleting[id]) {
      return;
    }
    const prevFiles = Array.isArray(state.files) ? state.files.slice() : [];
    const hadFile = prevFiles.some(function (file) {
      return String(file && file.file_id || '') === id;
    });
    state.filesDeleting[id] = true;
    if (hadFile) {
      const firstRects = captureFilesFlipLayout();
      state.files = prevFiles.filter(function (file) {
        return String(file && file.file_id || '') !== id;
      });
      renderFilesList(state.files);
      runFilesFlipAnimation(firstRects);
    } else {
      renderFilesList(state.files);
    }

    try {
      const data = await apiPost('/cgi/blog-delete-file', { file_id: id }, true);
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete file');
      }
      delete state.filesDeleting[id];
      setOutput(els.outputFiles, 'File deleted.', 'ok');
      loadFiles().catch(function (_err) {
        // Keep optimistic state if refresh fails.
      });
    } catch (err) {
      delete state.filesDeleting[id];
      if (hadFile) {
        const firstRects = captureFilesFlipLayout();
        state.files = prevFiles;
        renderFilesList(state.files);
        runFilesFlipAnimation(firstRects);
      } else {
        renderFilesList(state.files);
      }
      throw err;
    }
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
      return 'Product Gallery (kind 30004)';
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

  function footerRowsFromNostrPages(pages) {
    const rows = [];
    (Array.isArray(pages) ? pages : []).forEach(function (page) {
      if (!page || page.show_in_footer !== true) {
        return;
      }
      const slug = normalizeNostrPageSlug(String(page.slug || ''));
      if (!slug) {
        return;
      }
      const title = String(page.placeholder_title || page.title || defaultNostrPageTitleFromSlug(slug) || 'Untitled');
      rows.push({
        slug: slug,
        title: title,
        path: pathFromNostrPageSlug(slug, page.type)
      });
    });
    return rows;
  }

  function dispatchFooterRefresh(pages) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent('wizardry-footer-refresh-request', {
        detail: {
          pages: footerRowsFromNostrPages(pages)
        }
      }));
    } catch (_err) {
      // Ignore footer refresh event failures.
    }
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
    html += '<div class="nostr-pages-header-footer-col"><span class="nostr-pages-header-nav">Show in Footer</span></div>';
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
      const showInFooter = !!page.show_in_footer;
      const draftDiffers = !!page.draft_differs;
      const typeLabel = nostrPageTypeLabel(pageType);
      const typePillClass = nostrPageTypePillClass(pageType);
      html += '<div class="nostr-page-row" data-index="' + String(idx) + '" data-slug="' + escapeAttr(slug) + '" draggable="true">';
      html += '<div class="nostr-page-leading">';
      html += '<button type="button" class="unobtrusive-icon-button nostr-page-drag-handle" data-nostr-page-action="drag-handle" data-index="' + String(idx) + '" draggable="true" aria-label="Drag to reorder" title="Drag to reorder">' + dragGripIconSvg() + '</button>';
      html += '</div>';
      html += '<div class="nostr-page-name-col">';
      html += '<div class="nostr-page-title-row"><div class="nostr-page-title"><a href="' + escapeAttr(path) + '">' + escapeHtml(title) + '</a></div>';
      if (isEditingNavTitle) {
        html += '<span class="nostr-page-nav-title-edit-wrap"><input type="text" class="nostr-page-nav-title-input" data-nostr-page-action="edit-nav-title-input" data-index="' + String(idx) + '" value="' + escapeAttr(state.nostrPagesEditingNavTitleValue || navTitle) + '" aria-label="Edit navbar link title"><button type="button" class="nostr-page-nav-title-ok" data-nostr-page-action="save-nav-title" data-index="' + String(idx) + '" aria-label="Apply navbar link title">OK</button></span>';
      } else {
        html += '<a href="#" class="nostr-page-nav-title-edit nostr-page-title-change" data-nostr-page-action="edit-nav-title" data-index="' + String(idx) + '" aria-label="Edit navbar link title">Edit...</a>';
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
      html += '<div class="nostr-page-footer-col">';
      html += '<label class="checkbox-control nostr-page-nav-check nostr-page-nav-check-only" title="Show in footer"><input type="checkbox" data-nostr-page-action="toggle-footer" data-index="' + String(idx) + '"' + (showInFooter ? ' checked' : '') + ' aria-label="Show in footer"></label>';
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
    dispatchFooterRefresh(state.nostrPages);
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
      dispatchFooterRefresh(state.nostrPages);
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
    let conflictingIndex = -1;
    if (nextSlug !== prevSlug) {
      conflictingIndex = state.nostrPages.findIndex(function (row, i) {
        return i !== index && String(row.slug || '') === nextSlug;
      });
      if (conflictingIndex >= 0) {
        const conflicting = state.nostrPages[conflictingIndex] || {};
        const currentType = String(page.type || '').trim().toLowerCase();
        const conflictingType = String(conflicting.type || '').trim().toLowerCase();
        const replacingLegacyHome = nextSlug === 'index' && currentType === 'blog' && conflictingType !== 'blog';
        if (!replacingLegacyHome) {
          setOutput(els.outputNostrPages, 'A page with this slug already exists.', 'warn');
          focusNostrPageSlugInput(index);
          return;
        }
      }
    }
    state.nostrPagesEditingSlugIndex = -1;
    state.nostrPagesEditingSlugValue = '';
    if (nextSlug === prevSlug && nextPath === prevPath) {
      renderNostrPagesList(state.nostrPages, false);
      return;
    }
    const before = state.nostrPages.slice();
    const next = state.nostrPages.slice();
    let targetIndex = index;
    if (conflictingIndex >= 0) {
      next.splice(conflictingIndex, 1);
      if (conflictingIndex < targetIndex) {
        targetIndex -= 1;
      }
    }
    next[targetIndex] = Object.assign({}, next[targetIndex], {
      slug: nextSlug,
      path: nextPath
    });
    state.nostrPages = next;
    renderNostrPagesList(state.nostrPages, false);
    renderModerationPageFilterOptions();
    dispatchNavbarRefresh(state.nostrPages, true);
    dispatchFooterRefresh(state.nostrPages);
    try {
      await saveNostrPagesConfig();
      setOutput(els.outputNostrPages, 'Updated page path to ' + pathFromNostrPageSlug(nextSlug, page.type) + '.', 'ok');
    } catch (err) {
      state.nostrPages = before;
      renderNostrPagesList(state.nostrPages, false);
      renderModerationPageFilterOptions();
      dispatchNavbarRefresh(state.nostrPages, true);
      dispatchFooterRefresh(state.nostrPages);
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
    dispatchFooterRefresh(state.nostrPages);
  }

  async function saveNostrPagesConfig() {
    const revision = (Number(state.nostrPagesSaveRevision) || 0) + 1;
    state.nostrPagesSaveRevision = revision;
    if (state.nostrPagesSaveBusy) {
      state.nostrPagesSaveQueued = true;
      return state.nostrPagesSavePromise || Promise.resolve();
    }
    state.nostrPagesSaveBusy = true;
    const task = (async function () {
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
      if (revision !== state.nostrPagesSaveRevision) {
        return;
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
      dispatchFooterRefresh(state.nostrPages);
      setOutput(els.outputNostrPages, data.message || 'Nostr page settings saved.', 'ok');
    })();
    state.nostrPagesSavePromise = task;
    try {
      await task;
    } finally {
      state.nostrPagesSaveBusy = false;
      if (state.nostrPagesSavePromise === task) {
        state.nostrPagesSavePromise = null;
      }
      if (state.nostrPagesSaveQueued) {
        state.nostrPagesSaveQueued = false;
        await saveNostrPagesConfig();
      }
    }
  }

  function queueNostrPagesConfigSave(delayMs) {
    const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 180;
    if (state.nostrPagesSaveTimer) {
      window.clearTimeout(state.nostrPagesSaveTimer);
      state.nostrPagesSaveTimer = null;
    }
    state.nostrPagesSaveTimer = window.setTimeout(function () {
      state.nostrPagesSaveTimer = null;
      saveNostrPagesConfig().catch(function (err) {
        setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
      });
    }, delay);
  }

  function flushNostrPagesConfigSave() {
    if (state.nostrPagesSaveTimer) {
      window.clearTimeout(state.nostrPagesSaveTimer);
      state.nostrPagesSaveTimer = null;
    }
    return saveNostrPagesConfig();
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
      show_in_footer: false,
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
      if (state.postsActionInFlight || state.postsMenuOpenFor || state.postsCrosspostDialogOpen) {
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
    if (pickedAction === 'crosspost') {
      await openPostCrosspostDialog(path);
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

  function resetPostCrosspostDialogState() {
    state.postsCrosspostDialogOpen = false;
    state.postsCrosspostPath = '';
    state.postsCrosspostSelection = [];
    if (els.postCrosspostSubmit) {
      els.postCrosspostSubmit.disabled = false;
    }
  }

  function syncPostCrosspostSelectionFromDom() {
    if (!els.postCrosspostList) {
      return;
    }
    const selected = Array.from(els.postCrosspostList.querySelectorAll('input[data-post-crosspost-platform]:checked')).map(function (input) {
      return String(input.getAttribute('data-post-crosspost-platform') || '').trim().toLowerCase();
    }).filter(Boolean);
    state.postsCrosspostSelection = normalizeOriginPlatformList(selected, state.originConfig.enabled_platforms);
    const currentPost = findPostByPath(state.postsCrosspostPath);
    renderPostCrosspostDialogUi(currentPost);
  }

  async function openPostCrosspostDialog(postPath) {
    const path = String(postPath || '').trim();
    const post = findPostByPath(path);
    const crossposting = normalizePostCrossposting(post && post.crossposting);
    const remaining = crossposting.platforms.filter(function (platform) {
      return platform.status !== 'published' && platform.status !== 'ok';
    });
    if (!path || !post) {
      setOutput(els.outputPosts, 'Could not find that post.', 'warn');
      return;
    }
    if (!crossposting.available || !crossposting.enabled_count) {
      setOutput(els.outputPosts, 'Enable Origin destinations on the Cross-posting page first.', 'warn');
      return;
    }
    if (!remaining.length) {
      setOutput(els.outputPosts, 'This post is already live on every enabled destination.', 'ok');
      return;
    }
    state.postsMenuOpenFor = '';
    if (els.postsList) {
      Array.from(els.postsList.querySelectorAll('[data-post-menu-panel]')).forEach(function (panel) {
        panel.hidden = true;
      });
    }
    state.postsCrosspostPath = path;
    state.postsCrosspostSelection = remaining.map(function (platform) {
      return platform.id;
    });
    renderPostCrosspostDialogUi(post);
    if (els.postCrosspostDialog instanceof HTMLDialogElement) {
      if (els.postCrosspostDialog.open) {
        els.postCrosspostDialog.close('replace');
      }
      state.postsCrosspostDialogOpen = true;
      els.postCrosspostDialog.showModal();
      const firstInput = els.postCrosspostList
        ? els.postCrosspostList.querySelector('input[data-post-crosspost-platform]:not([disabled])')
        : null;
      if (firstInput instanceof HTMLElement) {
        firstInput.focus();
      } else if (els.postCrosspostSubmit) {
        els.postCrosspostSubmit.focus();
      }
    }
  }

  async function submitPostCrosspostDialog() {
    const path = String(state.postsCrosspostPath || '').trim();
    const post = findPostByPath(path);
    if (!path || !post) {
      throw new Error('Post path missing for cross-posting');
    }
    const selection = normalizeOriginPlatformList(state.postsCrosspostSelection, state.originConfig.enabled_platforms);
    if (!selection.length) {
      setOutput(els.outputPosts, 'Pick at least one destination to cross-post.', 'warn');
      renderPostCrosspostDialogUi(post);
      return;
    }
    state.postsActionInFlight = true;
    if (els.postCrosspostSubmit) {
      els.postCrosspostSubmit.disabled = true;
    }
    try {
      const data = await apiPost('/cgi/blog-crosspost-post', {
        post_path: path,
        platforms: JSON.stringify(selection)
      }, true);
      if (!data.success) {
        throw new Error(data.error || 'Cross-post failed');
      }
      if (els.postCrosspostDialog instanceof HTMLDialogElement) {
        els.postCrosspostDialog.close('ok');
      } else {
        resetPostCrosspostDialogState();
      }
      state.postsMenuOpenFor = '';
      await loadPosts();
      setOutput(els.outputPosts, data.message || 'Post cross-posted.', 'ok');
    } finally {
      state.postsActionInFlight = false;
      if (els.postCrosspostSubmit) {
        els.postCrosspostSubmit.disabled = false;
      }
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
      const fallback = window.prompt('List slug:', 'list');
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
    const sortButton = function (col, label) {
      const nextDirection = usersSortNextDirection(col) || usersSortDefaultDirection(col);
      const activeDirection = sortColumn === col ? sortDirection : '';
      const ariaSort = sortColumn === col ? sortDirection : 'none';
      return '<span class="users-col-sort" data-users-sort="' + col + '" data-next-sort="' + nextDirection + '"' +
        (activeDirection ? (' data-sort-active="' + activeDirection + '"') : '') +
        ' aria-label="Sort by ' + label + '" aria-sort="' + ariaSort + '"><span class="users-col-sort-label">' + label + '</span><span class="users-col-sort-indicator" aria-hidden="true"></span></span>';
    };
    html += '<div class="users-table-header">';
    html += '<div class="users-col users-col-name">' + sortButton('name', 'Name') + '</div>';
    html += '<div class="users-col users-col-created">' + sortButton('created', 'Created') + '</div>';
    html += '<div class="users-col users-col-role">' + sortButton('role', 'Role') + '</div>';
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

  async function loadDraft(draftId, opts) {
    const options = opts || {};
    const data = await apiPost('/cgi/blog-get-draft', { draft_id: draftId }, true);
    if (!data.success || !data.draft) {
      throw new Error(data.error || 'Failed to load draft');
    }
    populateComposer(data.draft);
    state.composePostTypeLocked = !!options.lockPostType;
    syncComposePostTypeUi();
    activateSection('compose', true);
    if (!options.silent) {
      setOutput(els.outputCompose, 'Draft loaded.', 'ok');
    }
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
    if (state.composeSubmitInFlight) {
      return;
    }
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

    state.composeSubmitInFlight = true;
    state.composeSubmitAction = action;
    updatePrimaryPublishButton();
    if (action === 'queue_scheduled') {
      setOutput(els.outputCompose, 'Scheduling post...', 'warn');
    } else if (action === 'queue_drip') {
      setOutput(els.outputCompose, 'Adding post to drip queue...', 'warn');
    } else {
      setOutput(els.outputCompose, 'Publishing post...', 'warn');
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
    } finally {
      state.composeSubmitInFlight = false;
      state.composeSubmitAction = '';
      updatePrimaryPublishButton();
    }
  }

  async function autosave() {
    if (state.suspendAutosave || state.composeSubmitInFlight) {
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

  async function flushAutosaveNow() {
    if (state.suspendAutosave) {
      return;
    }
    if (state.autosaveTimer) {
      clearTimeout(state.autosaveTimer);
      state.autosaveTimer = null;
    }
    setAutosaveStatus('saving');
    await autosave();
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

  function uploadedReferenceMarkdown(url, file) {
    const safeUrl = String(url || '').trim();
    const name = String((file && file.name) || 'file').trim();
    const mime = String((file && file.type) || '').toLowerCase();
    const alt = name.replace(/\.[^.]+$/, '') || 'media';
    if (!safeUrl) {
      return '';
    }
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

  function appendToComposerContent(text) {
    const addition = String(text || '').trim();
    if (!addition || !els.postContent) {
      return;
    }
    const source = String(els.postContent.value || '');
    const next = source.trim() ? (source.replace(/\s*$/, '') + '\n\n' + addition) : addition;
    els.postContent.value = next;
    renderPreview();
    queueAutosave('saving');
  }

  async function uploadComposeFile(file, kind) {
    const data = await uploadFileWithProgress(file, {
      kind: kind || 'file',
      data: {
        draft_id: state.currentDraftId || ''
      }
    });
    if (!data.success) {
      throw new Error(data.error || 'Upload failed');
    }
    const url = String(data.url || '').trim();
    if (!url) {
      throw new Error('Upload succeeded but URL is missing');
    }
    const line = uploadedReferenceMarkdown(url, file);
    appendToComposerContent(line);
    return url;
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

  async function handleDroppedFiles(files, preferredPostType) {
    const picked = Array.from(files || []).filter(function (file) {
      return file && file.size >= 0;
    });
    if (!picked.length) {
      return;
    }
    let targetType = preferredPostType;
    if (!targetType) {
      const first = picked[0];
      const mime = String((first && first.type) || '').toLowerCase();
      if (mime.indexOf('image/') === 0 || mime.indexOf('video/') === 0) {
        targetType = 'upload-media';
      } else if (mime.indexOf('audio/') === 0) {
        targetType = 'audio-note';
      } else {
        targetType = 'attachment';
      }
    }
    if (targetType) {
      setComposePostType(targetType, { queueAutosave: false, syncUi: true });
    }
    state.composeUploadBusy = true;
    setOutput(els.outputCompose, 'Uploading ' + picked.length + ' file(s)...', 'warn');
    let uploadedCount = 0;
    try {
      for (const file of picked) {
        let uploadKind = 'file';
        if (file.type && file.type.indexOf('image/') === 0) {
          uploadKind = 'image';
        } else if (file.type && file.type.indexOf('video/') === 0) {
          uploadKind = 'video';
        } else if (file.type && file.type.indexOf('audio/') === 0) {
          uploadKind = 'audio';
        }
        await uploadComposeFile(file, uploadKind);
        uploadedCount += 1;
      }
      if (uploadedCount > 0) {
        await flushAutosaveNow();
      }
      setOutput(els.outputCompose, 'Upload complete. Added to compose body.', 'ok');
    } catch (err) {
      setOutput(els.outputCompose, 'Upload error: ' + err.message, 'error');
    } finally {
      state.composeUploadBusy = false;
    }
  }

  function composeSectionVisible() {
    return !!(state.isAdmin && state.activeSection === 'compose');
  }

  function isEditableTarget(target) {
    if (!target || !(target instanceof Element)) {
      return false;
    }
    if (target instanceof HTMLTextAreaElement) {
      return true;
    }
    if (target instanceof HTMLInputElement) {
      return true;
    }
    if (target.isContentEditable) {
      return true;
    }
    const editableAncestor = target.closest('textarea, input, [contenteditable="true"], [contenteditable=""]');
    return !!editableAncestor;
  }

  function clipboardImageFiles(event) {
    const list = [];
    const clip = event && event.clipboardData;
    if (!clip) {
      return list;
    }
    const items = clip.items ? Array.from(clip.items) : [];
    items.forEach(function (item) {
      if (!item || item.kind !== 'file' || String(item.type || '').indexOf('image/') !== 0) {
        return;
      }
      const file = item.getAsFile ? item.getAsFile() : null;
      if (file) {
        list.push(file);
      }
    });
    if (list.length) {
      return list;
    }
    const files = clip.files ? Array.from(clip.files) : [];
    return files.filter(function (file) {
      return file && String(file.type || '').indexOf('image/') === 0;
    });
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
    renderComposeDestinationTemplate();
    refreshComposeRadioInputs();
    const pluginInputs = [
      els.pluginNostrSupport,
      els.pluginNostrLogin,
      els.pluginNostrBridge,
      els.pluginNostrPosts,
      els.pluginZaps,
      els.pluginBtcpay,
      els.pluginVideoChat
    ].filter(Boolean);
    pluginInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        state.plugins = readPluginsFromUi();
        setPluginCheckboxStates();
        setVideoChatConfigFields();
        syncPluginControlledSections();
        queuePluginsSave(140);
      });
    });
    [
      els.videoChatParticipantLimit,
      els.videoChatTokenTtlSeconds,
      els.videoChatJanusWss,
      els.videoChatSignalingWss,
      els.videoChatPublicRooms,
      els.videoChatRooms
    ].filter(Boolean).forEach(function (input) {
      input.addEventListener('input', function () {
        if (input === els.videoChatPublicRooms) {
          state.videoChatConfig = readVideoChatConfigFromUi();
          setVideoChatConfigFields();
        }
        queueVideoChatConfigSave(600);
      });
      input.addEventListener('change', function () {
        if (input === els.videoChatPublicRooms) {
          state.videoChatConfig = readVideoChatConfigFromUi();
          setVideoChatConfigFields();
        }
        queueVideoChatConfigSave(180);
      });
    });
    if (els.videoChatOperatorRefresh) {
      els.videoChatOperatorRefresh.addEventListener('click', function () {
        loadVideoChatOperatorStatus().catch(function () {});
      });
    }
    if (els.videoChatOperatorStatus) {
      els.videoChatOperatorStatus.addEventListener('click', function (event) {
        const button = event.target instanceof Element
          ? event.target.closest('[data-video-chat-call-user], [data-video-chat-join-room], [data-video-chat-cancel-call]')
          : null;
        if (!button) {
          return;
        }
        if (button.hasAttribute('data-video-chat-call-user')) {
          callVideoChatUser(button.getAttribute('data-video-chat-call-user') || '').catch(function () {});
        } else if (button.hasAttribute('data-video-chat-join-room')) {
          joinVideoChatOperatorRoom(button.getAttribute('data-video-chat-join-room') || '').catch(function () {});
        } else if (button.hasAttribute('data-video-chat-cancel-call')) {
          cancelVideoChatCall(button.getAttribute('data-video-chat-cancel-call') || '').catch(function () {});
        }
      });
    }
    if (els.videoChatOperatorLeave) {
      els.videoChatOperatorLeave.addEventListener('click', function () {
        leaveVideoChatOperatorRoom();
      });
    }
    if (els.accountVideoChatAllowAdminCalls) {
      els.accountVideoChatAllowAdminCalls.addEventListener('change', function () {
        saveVideoChatAccountPreference().catch(function () {});
      });
    }
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

    hydrateComposeTagsEditor();
    const composeTagsEditor = composeTagsEditorNode();
    if (composeTagsEditor) {
      composeTagsEditor.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const token = target.closest('[data-post-tags-token]');
        if (token instanceof HTMLElement) {
          event.preventDefault();
          event.stopPropagation();
          composeTagsEditorSelectToken(composeTagsEditor, token);
          return;
        }
        composeTagsEditorClearSelection(composeTagsEditor);
        try {
          composeTagsEditor.focus({ preventScroll: true });
        } catch (_focusErr) {
          composeTagsEditor.focus();
        }
        if (!composeTagsEditorPlaceCaretFromPoint(composeTagsEditor, Number(event.clientX) || 0, Number(event.clientY) || 0)) {
          const draftNode = composeTagsEditorDraftNode(composeTagsEditor);
          if (target === composeTagsEditor || !(draftNode && draftNode.contains(target))) {
            composeTagsEditorFocusDraft(composeTagsEditor);
          }
        }
        setTimeout(function () {
          if (document.activeElement === composeTagsEditor) {
            composeTagsEditorSyncDraft(composeTagsEditor);
            syncComposeTagsField();
          }
        }, 0);
      });

      composeTagsEditor.addEventListener('input', function () {
        composeTagsEditorClearSelection(composeTagsEditor);
        const changed = composeTagsEditorCommit(composeTagsEditor, false);
        composeTagsEditorSyncDraft(composeTagsEditor);
        syncComposeTagsField();
        if (changed || String(state.composeTagsDraftText || '').trim()) {
          queueAutosave('saving');
        }
      });

      composeTagsEditor.addEventListener('keydown', function (event) {
        const selectedToken = composeTagsEditorSelectedToken(composeTagsEditor);
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          const tokens = Array.from(composeTagsEditor.querySelectorAll('[data-post-tags-token]')).filter(function (node) {
            return node instanceof HTMLElement;
          });
          if (!tokens.length) {
            return;
          }
          if (selectedToken) {
            event.preventDefault();
            const currentIndex = tokens.indexOf(selectedToken);
            if (currentIndex < 0) {
              composeTagsEditorFocusDraft(composeTagsEditor);
              return;
            }
            const nextIndex = event.key === 'ArrowLeft' ? currentIndex - 1 : currentIndex + 1;
            if (nextIndex >= 0 && nextIndex < tokens.length) {
              composeTagsEditorSelectToken(composeTagsEditor, tokens[nextIndex]);
            } else {
              composeTagsEditorClearSelection(composeTagsEditor);
              composeTagsEditorFocusDraft(composeTagsEditor);
            }
            return;
          }
          const draftText = String(state.composeTagsDraftText || '');
          if (!draftText.trim()) {
            event.preventDefault();
            if (event.key === 'ArrowLeft') {
              composeTagsEditorSelectToken(composeTagsEditor, tokens[tokens.length - 1]);
            } else {
              composeTagsEditorSelectToken(composeTagsEditor, tokens[0]);
            }
            return;
          }
        }
        if (event.key === 'Tab' || event.key === ',') {
          event.preventDefault();
          if (composeTagsEditorCommit(composeTagsEditor, true)) {
            queueAutosave('saving');
          }
          return;
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          if (selectedToken) {
            event.preventDefault();
            if (composeTagsEditorRemoveTagByNode(composeTagsEditor, selectedToken)) {
              queueAutosave('saving');
            }
            return;
          }
          const draftText = String(state.composeTagsDraftText || '');
          if (!draftText.trim() && state.composeTags.length) {
            event.preventDefault();
            const edgeTag = event.key === 'Delete'
              ? state.composeTags[0]
              : state.composeTags[state.composeTags.length - 1];
            if (edgeTag) {
              removeComposeTag(edgeTag);
              composeTagsEditorRender(composeTagsEditor);
              composeTagsEditorFocusDraft(composeTagsEditor);
              queueAutosave('saving');
            }
            return;
          }
        }
        if (event.key === 'Escape') {
          composeTagsEditorClearSelection(composeTagsEditor);
        }
      });

      composeTagsEditor.addEventListener('focusout', function () {
        composeTagsEditorSyncDraft(composeTagsEditor);
        syncComposeTagsField();
      });
    } else if (els.postTagsInput) {
      els.postTagsInput.addEventListener('keydown', function (event) {
        if (event.key === ',' || event.key === 'Tab') {
          event.preventDefault();
          if (commitTagInput(true)) {
            queueAutosave('saving');
          }
          return;
        }
        if (event.key === 'Backspace' && !els.postTagsInput.value && state.composeTags.length) {
          removeComposeTag(state.composeTags[state.composeTags.length - 1]);
          queueAutosave('saving');
        }
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

    if (els.composePostFilenameEditButton) {
      els.composePostFilenameEditButton.addEventListener('click', function () {
        beginComposePostFilenameEdit();
      });
    }
    if (els.composePostFilenameInput) {
      els.composePostFilenameInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitComposePostFilenameEdit();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelComposePostFilenameEdit();
        }
      });
      els.composePostFilenameInput.addEventListener('blur', function () {
        if (state.composePostFilenameEditing) {
          commitComposePostFilenameEdit();
        }
      });
    }

    document.getElementById('btn-publish-now').addEventListener('click', function () {
      if (state.composeSubmitInFlight) {
        return;
      }
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
    if (els.postCrosspostCancel) {
      els.postCrosspostCancel.addEventListener('click', function () {
        if (els.postCrosspostDialog instanceof HTMLDialogElement) {
          els.postCrosspostDialog.close('cancel');
        } else {
          resetPostCrosspostDialogState();
        }
      });
    }
    if (els.postCrosspostList) {
      els.postCrosspostList.addEventListener('change', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
          return;
        }
        if (!target.hasAttribute('data-post-crosspost-platform')) {
          return;
        }
        syncPostCrosspostSelectionFromDom();
      });
    }
    if (els.postCrosspostForm) {
      els.postCrosspostForm.addEventListener('submit', function (event) {
        event.preventDefault();
        submitPostCrosspostDialog().catch(function (err) {
          setOutput(els.outputPosts, 'Error: ' + err.message, 'error');
          const currentPost = findPostByPath(state.postsCrosspostPath);
          renderPostCrosspostDialogUi(currentPost);
        });
      });
    }
    if (els.crosspostingEnabledAll) {
      els.crosspostingEnabledAll.addEventListener('change', function () {
        const allIds = originConfigPlatformIds((state.originConfig && state.originConfig.platforms) || []);
        state.originConfig.enabled_platforms = els.crosspostingEnabledAll.checked ? allIds.slice() : [];
        state.originConfig.default_platforms = normalizeOriginPlatformList(state.originConfig.default_platforms, state.originConfig.enabled_platforms);
        renderCrosspostingSettingsUi();
        queueConfigAutosave(180);
      });
    }
    if (els.crosspostingEnabledList) {
      els.crosspostingEnabledList.addEventListener('change', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
          return;
        }
        if (!target.hasAttribute('data-crossposting-enabled-platform')) {
          return;
        }
        const nextEnabled = Array.from(els.crosspostingEnabledList.querySelectorAll('input[data-crossposting-enabled-platform]:checked')).map(function (input) {
          return String(input.getAttribute('data-crossposting-enabled-platform') || '').trim().toLowerCase();
        }).filter(Boolean);
        state.originConfig.enabled_platforms = normalizeOriginPlatformList(nextEnabled, originConfigPlatformIds((state.originConfig && state.originConfig.platforms) || []));
        state.originConfig.default_platforms = normalizeOriginPlatformList(state.originConfig.default_platforms, state.originConfig.enabled_platforms);
        renderCrosspostingSettingsUi();
        queueConfigAutosave(180);
      });
    }
    if (els.crosspostingDefaultAll) {
      els.crosspostingDefaultAll.addEventListener('change', function () {
        const enabled = arrayFromMaybe(state.originConfig && state.originConfig.enabled_platforms);
        state.originConfig.default_platforms = els.crosspostingDefaultAll.checked ? enabled.slice() : [];
        renderCrosspostingSettingsUi();
        queueConfigAutosave(180);
      });
    }
    if (els.crosspostingDefaultList) {
      els.crosspostingDefaultList.addEventListener('change', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
          return;
        }
        if (!target.hasAttribute('data-crossposting-default-platform')) {
          return;
        }
        const nextDefaults = Array.from(els.crosspostingDefaultList.querySelectorAll('input[data-crossposting-default-platform]:checked')).map(function (input) {
          return String(input.getAttribute('data-crossposting-default-platform') || '').trim().toLowerCase();
        }).filter(Boolean);
        state.originConfig.default_platforms = normalizeOriginPlatformList(nextDefaults, state.originConfig.enabled_platforms);
        renderCrosspostingSettingsUi();
        queueConfigAutosave(180);
      });
    }
    if (els.composeOriginSelectAll) {
      els.composeOriginSelectAll.addEventListener('change', function () {
        const enabled = arrayFromMaybe(state.originConfig && state.originConfig.enabled_platforms);
        setComposeOriginPlatforms(els.composeOriginSelectAll.checked ? enabled.slice() : []);
        queueAutosave('saving');
      });
    }
    if (els.composeOriginPlatformList) {
      els.composeOriginPlatformList.addEventListener('change', function (event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
          return;
        }
        if (!target.hasAttribute('data-compose-origin-platform')) {
          return;
        }
        const nextSelection = Array.from(els.composeOriginPlatformList.querySelectorAll('input[data-compose-origin-platform]:checked')).map(function (input) {
          return String(input.getAttribute('data-compose-origin-platform') || '').trim().toLowerCase();
        }).filter(Boolean);
        setComposeOriginPlatforms(nextSelection);
        queueAutosave('saving');
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
    if (els.btcpayCheckoutRuntime) {
      els.btcpayCheckoutRuntime.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const saveButton = target.closest('button[data-btcpay-checkout-save]');
        if (!saveButton) {
          return;
        }
        saveBtcpayCheckoutConfig().catch(function (err) {
          setOutput(els.outputBtcpayCheckout, 'Error: ' + err.message, 'error');
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
      if (dialogEl === els.postCrosspostDialog) {
        dialogEl.addEventListener('close', function () {
          resetPostCrosspostDialogState();
          syncPostsAutoRefresh();
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
          state.filePickerContext = 'files-admin';
          els.filePicker.click();
        }
      });
    }
    if (els.filePicker) {
      els.filePicker.addEventListener('change', function () {
        if (els.filePicker.files && els.filePicker.files.length) {
          const context = state.filePickerContext || 'files-admin';
          const work = context === 'compose-attachment'
            ? handleDroppedFiles(els.filePicker.files, 'attachment')
            : uploadAdminFiles(els.filePicker.files);
          work.finally(function () {
            state.filePickerContext = 'files-admin';
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
        if ((action !== 'toggle-nav' && action !== 'toggle-footer') || !(target instanceof HTMLInputElement)) {
          return;
        }
        const idx = Number(target.getAttribute('data-index'));
        if (!Number.isInteger(idx) || idx < 0 || idx >= state.nostrPages.length) {
          return;
        }
        const before = state.nostrPages.slice();
        const next = state.nostrPages.slice();
        if (action === 'toggle-footer') {
          next[idx] = Object.assign({}, next[idx], { show_in_footer: !!target.checked });
        } else {
          next[idx] = Object.assign({}, next[idx], { show_in_nav: !!target.checked });
        }
        state.nostrPages = next;
        dispatchNavbarRefresh(state.nostrPages, true);
        dispatchFooterRefresh(state.nostrPages);
        saveNostrPagesConfig().catch(function (err) {
          state.nostrPages = before;
          renderNostrPagesList(state.nostrPages, false);
          dispatchNavbarRefresh(state.nostrPages, true);
          dispatchFooterRefresh(state.nostrPages);
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
        if (state.nostrPagesSaveTimer) {
          window.clearTimeout(state.nostrPagesSaveTimer);
          state.nostrPagesSaveTimer = null;
        }
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
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
        }
        const target = event.target;
        const row = target && target.closest ? target.closest('.nostr-page-row[data-slug]') : null;
        if (!(row instanceof HTMLElement)) {
          event.preventDefault();
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
        dispatchFooterRefresh(state.nostrPages);
      });

      els.nostrPagesList.addEventListener('dragenter', function (event) {
        if (!state.nostrPagesDragActive || !state.nostrPagesDragSlug) {
          return;
        }
        event.preventDefault();
      });

      els.nostrPagesList.addEventListener('drop', function (event) {
        if (!state.nostrPagesDragActive || !state.nostrPagesDragSlug) {
          return;
        }
        event.preventDefault();
        const target = event.target;
        const row = target && target.closest ? target.closest('.nostr-page-row[data-slug]') : null;
        if (row instanceof HTMLElement) {
          const targetSlug = String(row.getAttribute('data-slug') || '');
          if (targetSlug && targetSlug !== state.nostrPagesDragSlug) {
            const rect = row.getBoundingClientRect();
            const placeAfter = event.clientY > (rect.top + rect.height / 2);
            if (reorderNostrPagesBySlug(state.nostrPagesDragSlug, targetSlug, placeAfter)) {
              renderNostrPagesList(state.nostrPages, true);
              dispatchNavbarRefresh(state.nostrPages, true);
            }
          }
        }
        state.nostrPagesDragDropped = true;
        const beforeSig = Array.isArray(state.nostrPagesDragSnapshot)
          ? state.nostrPagesDragSnapshot.map(function (page) { return String(page.slug || ''); }).join('|')
          : '';
        const afterSig = Array.isArray(state.nostrPages)
          ? state.nostrPages.map(function (page) { return String(page.slug || ''); }).join('|')
          : '';
        const orderChanged = !!beforeSig && !!afterSig && beforeSig !== afterSig;
        if (orderChanged) {
          flushNostrPagesConfigSave().catch(function (err) {
            setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
          });
        }
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
          flushNostrPagesConfigSave().catch(function (err) {
            if (Array.isArray(state.nostrPagesDragSnapshot)) {
              state.nostrPages = state.nostrPagesDragSnapshot.slice();
              renderNostrPagesList(state.nostrPages, true);
              dispatchNavbarRefresh(state.nostrPages, true);
              dispatchFooterRefresh(state.nostrPages);
            }
            setOutput(els.outputNostrPages, 'Error: ' + err.message, 'error');
          });
        } else if (state.nostrPagesDragActive && !state.nostrPagesDragDropped && Array.isArray(state.nostrPagesDragSnapshot)) {
          state.nostrPages = state.nostrPagesDragSnapshot.slice();
          renderNostrPagesList(state.nostrPages, true);
          dispatchNavbarRefresh(state.nostrPages, true);
          dispatchFooterRefresh(state.nostrPages);
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
          return;
        }
        if (action === 'delete') {
          const fileId = String(actionNode.getAttribute('data-file-id') || '').trim();
          if (!fileId) {
            return;
          }
          if (!window.confirm('Delete this file from the server? Existing posts that reference it will show a broken link/image.')) {
            return;
          }
          deleteFile(fileId).catch(function (err) {
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
        loadNosterRuntime({ background: true }).catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'zaps') {
        loadZapsRuntime().catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'btcpay') {
        loadBtcpayRuntime().catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'btcpay-checkout') {
        loadBtcpayCheckoutRuntime().catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'users' && !state.userDragActive) {
        loadUsers(false).catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'queue') {
        loadQueue().catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'posts' && !state.postsActionInFlight && !state.postsCrosspostDialogOpen) {
        loadPosts().catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'files') {
        loadFiles().catch(function () {});
      }
      if (state.isAdmin && state.activeSection === 'video-calling') {
        loadVideoChatOperatorStatus({ background: true }).catch(function () {});
      }
      if (state.isAdmin) {
        localDripWorkerTick(true).catch(function () {});
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'nostr-bridge') {
        loadNosterRuntime({ background: true }).catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'zaps') {
        loadZapsRuntime().catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'btcpay') {
        loadBtcpayRuntime().catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'btcpay-checkout') {
        loadBtcpayCheckoutRuntime().catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'users' && !state.userDragActive) {
        loadUsers(false).catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'queue') {
        loadQueue().catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'posts' && !state.postsActionInFlight && !state.postsCrosspostDialogOpen) {
        loadPosts().catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'files') {
        loadFiles().catch(function () {});
      }
      if (document.visibilityState === 'visible' && state.isAdmin && state.activeSection === 'video-calling') {
        loadVideoChatOperatorStatus({ background: true }).catch(function () {});
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
    if (els.accountSimplexContactCopyButton) {
      els.accountSimplexContactCopyButton.addEventListener('click', function () {
        copyTextToClipboard(els.accountSimplexContact ? els.accountSimplexContact.value : '')
          .then(function (ok) {
            setOutput(els.outputAccount, ok ? 'SimpleX contact copied.' : 'Could not copy SimpleX contact.', ok ? 'ok' : 'warn');
          });
      });
    }
    if (els.accountSimplexContactToggleButton) {
      els.accountSimplexContactToggleButton.addEventListener('click', function () {
        const currentlyVisible = !!(els.accountSimplexContact && els.accountSimplexContact.classList.contains('is-visible'));
        setSimplexContactVisibility(!currentlyVisible);
      });
    }

    if (els.composePostTypeCurrentButton) {
      els.composePostTypeCurrentButton.addEventListener('click', function () {
        if (state.composePostTypeLocked) {
          return;
        }
        setComposePostTypeToolbarCollapsed(!state.composePostTypeToolbarCollapsed);
      });
    }
    if (els.composePostTypeToolbar) {
      els.composePostTypeToolbar.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const button = target.closest('[data-post-type]');
        if (!(button instanceof HTMLButtonElement) || button.disabled) {
          return;
        }
        const nextType = String(button.getAttribute('data-post-type') || '');
        setComposePostType(nextType, { queueAutosave: true, syncUi: true, interactive: true });
      });
    }
    if (els.composeCaptureButton && els.capturePicker) {
      els.composeCaptureButton.addEventListener('click', function () {
        setComposePostType('capture-media', { queueAutosave: false, syncUi: true });
        setComposePostTypeToolbarCollapsed(true);
        els.capturePicker.click();
      });
    }
    if (els.composeUploadMediaButton && els.imagePicker) {
      els.composeUploadMediaButton.addEventListener('click', function () {
        setComposePostType('upload-media', { queueAutosave: false, syncUi: true });
        setComposePostTypeToolbarCollapsed(true);
        els.imagePicker.click();
      });
    }
    if (els.composeUploadFileButton && els.filePicker) {
      els.composeUploadFileButton.addEventListener('click', function () {
        setComposePostType('attachment', { queueAutosave: false, syncUi: true });
        setComposePostTypeToolbarCollapsed(true);
        state.filePickerContext = 'compose-attachment';
        els.filePicker.click();
      });
    }
    if (els.composeUploadAudioButton && els.audioPicker) {
      els.composeUploadAudioButton.addEventListener('click', function () {
        setComposePostType('audio-note', { queueAutosave: false, syncUi: true });
        setComposePostTypeToolbarCollapsed(true);
        els.audioPicker.click();
      });
    }
    if (els.composeShortformLimitButton) {
      els.composeShortformLimitButton.addEventListener('click', function (event) {
        if (event.detail > 1) {
          return;
        }
        if (normalizeComposePostType(state.composePostType) !== 'shortform' || state.composeShortformLimitEditing) {
          return;
        }
        const current = currentComposeShortformLimit();
        setComposeShortformLimit(current === 280 ? 140 : 280, { editing: false });
      });
      els.composeShortformLimitButton.addEventListener('dblclick', function (event) {
        event.preventDefault();
        if (normalizeComposePostType(state.composePostType) !== 'shortform') {
          return;
        }
        state.composeShortformLimitEditing = true;
        syncComposeShortformCounter();
        if (els.composeShortformLimitInput) {
          els.composeShortformLimitInput.focus();
          els.composeShortformLimitInput.select();
        }
      });
    }
    if (els.composeShortformLimitInput) {
      els.composeShortformLimitInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          setComposeShortformLimit(els.composeShortformLimitInput.value, { editing: false });
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          state.composeShortformLimitEditing = false;
          syncComposeShortformCounter();
        }
      });
      els.composeShortformLimitInput.addEventListener('blur', function () {
        setComposeShortformLimit(els.composeShortformLimitInput.value, { editing: false });
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
        if (action === 'image') {
          setComposePostType('upload-media', { queueAutosave: false, syncUi: true });
          els.imagePicker.click();
          return;
        }
      });
    });

    els.imagePicker.addEventListener('change', function () {
      if (els.imagePicker.files && els.imagePicker.files.length) {
        handleDroppedFiles(els.imagePicker.files, 'upload-media').finally(function () {
          els.imagePicker.value = '';
        });
      }
    });
    if (els.capturePicker) {
      els.capturePicker.addEventListener('change', function () {
        if (els.capturePicker.files && els.capturePicker.files.length) {
          handleDroppedFiles(els.capturePicker.files, 'capture-media').finally(function () {
            els.capturePicker.value = '';
          });
        }
      });
    }
    if (els.audioPicker) {
      els.audioPicker.addEventListener('change', function () {
        if (els.audioPicker.files && els.audioPicker.files.length) {
          handleDroppedFiles(els.audioPicker.files, 'audio-note').finally(function () {
            els.audioPicker.value = '';
          });
        }
      });
    }

    [els.postTitle, els.postContent, els.postScheduleAt, els.composeLinkUrl, els.composeLinkBody].filter(Boolean).forEach(function (el) {
      el.addEventListener('input', function () {
        if (el === els.composeLinkUrl || el === els.composeLinkBody) {
          if (state.composePostType !== 'link-share') {
            setComposePostType('link-share', { queueAutosave: false, syncUi: true });
          }
        }
        if (el === els.postContent) {
          enforceComposeShortformLimit();
          syncComposeShortformCounter();
        }
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

    publishDestinationInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        updatePrimaryPublishButton();
      });
    });

    document.addEventListener('paste', function (event) {
      if (!composeSectionVisible()) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      const images = clipboardImageFiles(event);
      if (!images.length) {
        return;
      }
      event.preventDefault();
      setComposePostType('upload-media', { queueAutosave: false, syncUi: true });
      handleDroppedFiles(images, 'upload-media').catch(function (err) {
        setOutput(els.outputCompose, 'Paste upload error: ' + err.message, 'error');
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
  syncComposePostTypeUi();
  updatePrimaryPublishButton();
  updateScheduledRowVisibility();
  setAutosaveStatus();
  setPreviewVisibility(state.previewVisible);
  renderPreview();
})();
