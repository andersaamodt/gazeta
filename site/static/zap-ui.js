(function () {
  'use strict';

  if (window.blogZapUi && typeof window.blogZapUi.render === 'function') {
    return;
  }

  var DEFAULT_RELAYS = [
    'wss://andersaamodt.com'
  ];
  var BTC_USD_RATE_TTL_MS = 60000;
  var hostStates = new WeakMap();
  var lnurlCache = {};
  var btcUsdRate = {
    loading: false,
    loadedAt: 0,
    value: 0
  };
  var modalState = {
    open: false,
    host: null,
    options: null,
    state: null,
    generation: 0,
    invoiceAttempt: null
  };
  var zapIconId = 0;

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function copyIconHtml() {
    return '' +
      '<svg class="machine-copy-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M8 7.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z"></path>' +
        '<path d="M5 15.5V5.75A2.75 2.75 0 0 1 7.75 3H15"></path>' +
      '</svg>';
  }

  function uniqueStrings(values) {
    var seen = {};
    var out = [];
    (Array.isArray(values) ? values : []).forEach(function (value) {
      var text = String(value || '').trim();
      if (!text || seen[text]) {
        return;
      }
      seen[text] = true;
      out.push(text);
    });
    return out;
  }

  function isHex64(value) {
    return /^[0-9a-f]{64}$/i.test(String(value || '').trim());
  }

  function clampSats(value, fallback) {
    var n = Number(value);
    if (!isFinite(n) || n < 1) {
      return Math.max(1, Number(fallback || 21) || 21);
    }
    return Math.max(1, Math.floor(n));
  }

  function normalizeZapConfig(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var lud16 = String(src.lud16 || '').trim().toLowerCase();
    var relays = uniqueStrings(src.relays);
    return {
      enabled: !!src.enabled && !!lud16,
      lud16: lud16,
      defaultAmountSats: clampSats(src.default_amount_sats || 1000, 1000),
      relays: relays.length ? relays : DEFAULT_RELAYS.slice()
    };
  }

  function normalizeTarget(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var recipientPubkey = String(src.recipientPubkey || '').trim().toLowerCase();
    if (!isHex64(recipientPubkey)) {
      return null;
    }
    var eventId = String(src.eventId || '').trim().toLowerCase();
    var address = String(src.address || '').trim();
    var kind = String(src.kind || '').trim();
    return {
      label: String(src.label || '').trim(),
      title: String(src.title || '').trim(),
      recipientPubkey: recipientPubkey,
      eventId: isHex64(eventId) ? eventId : '',
      address: address,
      kind: kind
    };
  }

  function normalizeOptions(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var zapConfig = normalizeZapConfig(src.zapConfig);
    var target = normalizeTarget(src.target);
    if (!zapConfig.enabled || !target) {
      return null;
    }
    return {
      zapConfig: zapConfig,
      target: target,
      contextLabel: String(src.contextLabel || target.label || '').trim(),
      title: String(src.title || target.title || '').trim(),
      display: String(src.display || '').trim(),
      hideRecipient: src.hideRecipient === true
    };
  }

  function resolvePresetAmounts(defaultAmountSats) {
    var base = clampSats(defaultAmountSats, 1000);
    var values = uniqueStrings([
      '100',
      '1000',
      String(base),
      '5000'
    ]).map(function (value) {
      return clampSats(value, base);
    });
    values.sort(function (a, b) { return a - b; });
    return values.slice(0, 4);
  }

  function zapAmountChipHtml(amount, activeSats, customActive) {
    var cls = 'zap-amount-chip';
    if (amount === activeSats && !customActive) {
      cls += ' is-selected';
    }
    var usd = formatUsdForSats(amount);
    return '' +
      '<button type="button" class="' + cls + '" data-zap-action="select_amount" data-zap-amount="' + String(amount) + '">' +
        '<span class="zap-amount-chip-sats">' + escapeHtml(String(amount)) + ' sats</span>' +
        (usd ? '<span class="zap-amount-chip-usd">(' + escapeHtml(usd) + ')</span>' : '') +
      '</button>';
  }

  function formatUsdForSats(sats) {
    var rate = Number(btcUsdRate.value || 0);
    var amount = clampSats(sats, 1);
    if (!isFinite(rate) || rate <= 0) {
      return '';
    }
    var usd = (amount / 100000000) * rate;
    if (!isFinite(usd) || usd < 0) {
      return '';
    }
    return '$' + usd.toFixed(2) + ' USD';
  }

  function satsWithUsdLabel(sats) {
    var amount = clampSats(sats, 1);
    var usd = formatUsdForSats(amount);
    return String(amount) + ' sats' + (usd ? ' (' + usd + ')' : '');
  }

  function loadBtcUsdRate() {
    var now = Date.now();
    if (btcUsdRate.value > 0 && now - btcUsdRate.loadedAt < BTC_USD_RATE_TTL_MS) {
      return Promise.resolve(btcUsdRate.value);
    }
    if (btcUsdRate.loading) {
      return Promise.resolve(btcUsdRate.value || 0);
    }
    btcUsdRate.loading = true;
    return fetch('/cgi/blog-btc-usd-rate', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var value = Number(data && data.btc_usd);
        if (data && data.success && isFinite(value) && value > 0) {
          btcUsdRate.value = value;
          btcUsdRate.loadedAt = Date.now();
        }
        return btcUsdRate.value || 0;
      })
      .catch(function () {
        return btcUsdRate.value || 0;
      })
      .then(function (value) {
        btcUsdRate.loading = false;
        return value;
      });
  }

  function initialHostState(options) {
    return {
      selectedSats: options.zapConfig.defaultAmountSats,
      customSats: '',
      note: '',
      busy: false,
      invoice: '',
      invoiceAmountMsats: 0,
      status: '',
      statusTone: '',
      paying: false
    };
  }

  function ensureHostState(host, options) {
    var state = hostStates.get(host);
    if (!state) {
      state = initialHostState(options);
      hostStates.set(host, state);
      return state;
    }
    if (!state.selectedSats || state.selectedSats < 1) {
      state.selectedSats = options.zapConfig.defaultAmountSats;
    }
    return state;
  }

  function signerApi() {
    if (window.blogNostrSigner && typeof window.blogNostrSigner.signEvent === 'function') {
      return window.blogNostrSigner;
    }
    try {
      return window.citrine.nostr.getNip07Signer(window);
    } catch (_err) {}
    return null;
  }

  function signerUnavailableError(err) {
    if (err && err.name === 'AbortError') return false;
    if (/reject|denied|refus|cancel/i.test(String(err && err.message || err || ''))) return false;
    return window.citrine.nostr.signerUnavailableError(err);
  }

  function signerIsAvailable(api, attempt) {
    return Promise.resolve().then(function () {
      attempt.requireCurrent();
      return typeof api.getStatus === 'function' ? api.getStatus() : { available: true };
    }).then(function (status) {
      attempt.requireCurrent();
      return !!(status && status.available);
    }, function (err) {
      attempt.requireCurrent();
      if (signerUnavailableError(err)) return false;
      throw err;
    });
  }

  function statusHtml(state) {
    var text = String(state.status || '').trim();
    if (!text) {
      return '';
    }
    var cls = 'zap-dialog-status';
    if (state.statusTone) {
      cls += ' is-' + escapeAttr(state.statusTone);
    }
    return '<p class="' + cls + '">' + escapeHtml(text) + '</p>';
  }

  function invoiceHtml(state) {
    if (!state.invoice) {
      return '';
    }
    return '' +
      '<section class="zap-dialog-invoice" data-zap-invoice-block="true">' +
        '<div class="zap-dialog-qr" data-zap-qr="true" aria-hidden="true"></div>' +
        '<label class="zap-dialog-invoice-field">' +
          '<span>Lightning invoice</span>' +
          '<span class="machine-string-box">' +
            '<textarea readonly rows="5" data-zap-invoice-text="true">' + escapeHtml(state.invoice) + '</textarea>' +
            '<button type="button" class="machine-string-copy" data-zap-action="copy_invoice" aria-label="Copy Lightning invoice">' + copyIconHtml() + '</button>' +
          '</span>' +
        '</label>' +
        '<div class="zap-dialog-invoice-actions">' +
          '<a class="zap-action-btn zap-action-btn-primary" data-zap-pay-link="true" href="lightning:' + escapeAttr(state.invoice) + '">Pay in wallet</a>' +
          '<button type="button" class="zap-action-btn" data-zap-action="copy_invoice">Copy invoice</button>' +
          '<button type="button" class="zap-action-btn" data-zap-action="pay_webln"' + (state.paying ? ' disabled aria-disabled="true"' : '') + '>' + (state.paying ? 'Paying...' : 'Pay with WebLN') + '</button>' +
        '</div>' +
      '</section>';
  }

  function ensureModal() {
    var existing = document.getElementById('blog-zap-dialog');
    if (existing) {
      return existing;
    }
    var host = document.createElement('div');
    host.id = 'blog-zap-dialog';
    host.className = 'zap-dialog-shell';
    host.hidden = true;
    host.innerHTML = '' +
      '<div class="zap-dialog-backdrop" data-zap-action="close"></div>' +
      '<div class="zap-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="zap-dialog-title">' +
        '<button type="button" class="zap-dialog-close" aria-label="Close zap dialog" data-zap-action="close">&times;</button>' +
        '<div class="zap-dialog-scroll">' +
          '<div id="zap-dialog-body"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(host);
    host.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var actionNode = target.closest('[data-zap-action]');
      if (!actionNode) {
        return;
      }
      var action = String(actionNode.getAttribute('data-zap-action') || '');
      if (action === 'close') {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (!modalState.open || !modalState.state || !modalState.options) {
        return;
      }
      if (action === 'select_amount') {
        event.preventDefault();
        modalState.state.selectedSats = clampSats(actionNode.getAttribute('data-zap-amount') || '', modalState.options.zapConfig.defaultAmountSats);
        modalState.state.customSats = '';
        renderDialog();
        return;
      }
      if (action === 'create_invoice') {
        event.preventDefault();
        createInvoice();
        return;
      }
      if (action === 'copy_invoice') {
        event.preventDefault();
        copyInvoice();
        return;
      }
      if (action === 'pay_webln') {
        event.preventDefault();
        payWithWebln();
      }
    });
    host.addEventListener('input', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        return;
      }
      if (!modalState.open || !modalState.state) {
        return;
      }
      if (target.hasAttribute('data-zap-custom-sats')) {
        modalState.state.customSats = String(target.value || '').trim();
        renderCustomUsd();
        renderCreateInvoiceLabel();
        return;
      }
      if (target.hasAttribute('data-zap-note')) {
        modalState.state.note = String(target.value || '');
      }
    });
    document.addEventListener('keydown', function (event) {
      if (!modalState.open) {
        return;
      }
      if (event.key === 'Escape') {
        closeDialog();
      }
    });
    return host;
  }

  function dialogBody() {
    var modal = ensureModal();
    return modal.querySelector('#zap-dialog-body');
  }

  function currentSats() {
    if (!modalState.state || !modalState.options) {
      return 0;
    }
    var custom = String(modalState.state.customSats || '').trim();
    if (/^[0-9]+$/.test(custom) && Number(custom) > 0) {
      return clampSats(custom, modalState.options.zapConfig.defaultAmountSats);
    }
    return clampSats(modalState.state.selectedSats, modalState.options.zapConfig.defaultAmountSats);
  }

  function openDialog(host, options, state) {
    cancelInvoiceAttempt();
    modalState.generation += 1;
    modalState.open = true;
    modalState.host = host;
    modalState.options = options;
    modalState.state = state;
    ensureModal().hidden = false;
    renderDialog();
    loadBtcUsdRate().then(function () {
      if (modalState.open && modalState.host === host) {
        renderDialog();
      }
    });
  }

  function renderCustomUsd() {
    if (!modalState.open || !modalState.state) {
      return;
    }
    var body = dialogBody();
    if (!body) {
      return;
    }
    var node = body.querySelector('[data-zap-custom-usd="true"]');
    if (!node) {
      return;
    }
    var custom = String(modalState.state.customSats || '').trim();
    var text = /^[0-9]+$/.test(custom) && Number(custom) > 0 ? formatUsdForSats(custom) : '';
    node.textContent = text ? '(' + text + ')' : '';
  }

  function renderCreateInvoiceLabel() {
    if (!modalState.open || !modalState.state) {
      return;
    }
    var body = dialogBody();
    if (!body) {
      return;
    }
    var button = body.querySelector('[data-zap-action="create_invoice"]');
    if (!button || modalState.state.busy) {
      return;
    }
    button.textContent = 'Create invoice for ' + satsWithUsdLabel(currentSats());
  }

  function closeDialog() {
    cancelInvoiceAttempt();
    modalState.generation += 1;
    modalState.open = false;
    modalState.host = null;
    modalState.options = null;
    modalState.state = null;
    var modal = ensureModal();
    modal.hidden = true;
  }

  function renderDialog() {
    if (!modalState.open || !modalState.options || !modalState.state) {
      return;
    }
    var body = dialogBody();
    if (!body) {
      return;
    }
    var options = modalState.options;
    var state = modalState.state;
    var presets = resolvePresetAmounts(options.zapConfig.defaultAmountSats);
    var activeSats = currentSats();
    var customValue = String(state.customSats || '').trim();
    var customActive = !!customValue;
    var customUsd = /^[0-9]+$/.test(customValue) && Number(customValue) > 0 ? formatUsdForSats(customValue) : '';
    var buttonsHtml = presets.map(function (amount) {
      return zapAmountChipHtml(amount, activeSats, customActive);
    }).join('');
    var disabledAttr = state.busy ? ' disabled aria-disabled="true"' : '';
    var activeUsd = formatUsdForSats(activeSats);

    body.innerHTML = '' +
      '<div class="zap-dialog-head">' +
        '<h3 id="zap-dialog-title">' + zapIconHtml() + '<span>Send sats</span></h3>' +
        '<p class="zap-dialog-subtitle">Send sats to support this post. Recipient: <code>' + escapeHtml(options.zapConfig.lud16) + '</code></p>' +
      '</div>' +
      '<div class="zap-dialog-grid">' +
        '<div class="zap-dialog-field">' +
          '<div class="zap-dialog-label-row">' +
            '<span class="zap-dialog-label">Choose amount</span>' +
            '<span class="zap-dialog-current-amount">' + escapeHtml(String(activeSats)) + ' sats' + (activeUsd ? ' (' + escapeHtml(activeUsd) + ')' : '') + '</span>' +
          '</div>' +
          '<div class="zap-amount-chips">' + buttonsHtml + '</div>' +
        '</div>' +
        '<div class="zap-dialog-secondary-grid">' +
          '<label class="zap-dialog-field">' +
            '<span class="zap-dialog-label">Custom sats <span class="zap-usd-note" data-zap-custom-usd="true">' + escapeHtml(customUsd ? '(' + customUsd + ')' : '') + '</span></span>' +
            '<input type="number" min="1" step="1" inputmode="numeric" data-zap-custom-sats="true" value="' + escapeAttr(String(state.customSats || '')) + '" placeholder="' + escapeAttr(String(options.zapConfig.defaultAmountSats)) + '">' +
          '</label>' +
          '<label class="zap-dialog-field">' +
            '<span class="zap-dialog-label">Note <small>(optional)</small></span>' +
            '<textarea rows="2" data-zap-note="true" placeholder="Write a note">' + escapeHtml(String(state.note || '')) + '</textarea>' +
          '</label>' +
        '</div>' +
      '</div>' +
      '<div class="zap-dialog-actions">' +
        '<button type="button" class="zap-action-btn zap-action-btn-primary zap-dialog-primary-action" data-zap-action="create_invoice"' + disabledAttr + '>' + zapIconHtml() + (state.busy ? 'Creating invoice...' : ('Create invoice for ' + satsWithUsdLabel(activeSats))) + '</button>' +
      '</div>' +
      statusHtml(state) +
      invoiceHtml(state);

    renderInvoiceQr();
  }

  function loadLnurlInfo(lud16, attempt) {
    var key = String(lud16 || '').trim().toLowerCase();
    if (lnurlCache[key]) {
      return Promise.resolve(lnurlCache[key]);
    }
    return window.citrine.zaps.loadLnurlZapInfo(key, {
      fetch: attempt.fetch,
      signal: attempt.controller.signal
    }).then(function (info) {
      attempt.requireCurrent();
      if (!isHex64(info.nostrPubkey)) {
        throw new Error('Lightning provider does not advertise Nostr zap support.');
      }
      lnurlCache[key] = info;
      return info;
    });
  }

  function createZapEvent(options, lnurlInfo, amountMsats, note, api, attempt) {
    return Promise.resolve().then(function () {
      attempt.requireCurrent();
      return api.__wizardryShared && typeof api.resolve === 'function'
        ? api.resolve({ signal: attempt.controller.signal }) : api;
    }).then(function (provider) {
      attempt.requireCurrent();
      var keyFailed = false;
      var keyError;
      // Older Citrine catches key-lookup errors; retain them at the signing boundary.
      var guardedSigner = {
        getPublicKey: function () {
          return Promise.resolve().then(function () {
            attempt.requireCurrent();
            return typeof provider.getPublicKey === 'function' ? provider.getPublicKey() : '';
          }).then(function (key) {
            attempt.requireCurrent();
            return key;
          }).catch(function (err) {
            keyFailed = true;
            keyError = err;
            throw err;
          });
        },
        signEvent: function (template) {
          attempt.requireCurrent();
          if (keyFailed) throw keyError;
          return provider.signEvent(template);
        }
      };
      return window.citrine.zaps.createSignedZapRequest({
        signer: guardedSigner,
        lnurlInfo: lnurlInfo,
        zapConfig: options.zapConfig,
        target: options.target,
        amountMsats: amountMsats,
        note: note,
        signal: attempt.controller.signal
      });
    });
  }

  function requestInvoice(options, signedEvent, amountMsats, lnurlInfo, note, attempt) {
    attempt.requireCurrent();
    return window.citrine.zaps.requestZapInvoice({
      lnurlInfo: lnurlInfo,
      amountMsats: amountMsats,
      signedEvent: signedEvent,
      note: note,
      fetch: attempt.fetch,
      signal: attempt.controller.signal
    });
  }

  function cancelInvoiceAttempt() {
    var attempt = modalState.invoiceAttempt;
    modalState.invoiceAttempt = null;
    if (attempt) {
      attempt.controller.abort();
      attempt.state.busy = false;
    }
  }

  function isCurrentDialog(state, generation) {
    return modalState.open && modalState.state === state && modalState.generation === generation;
  }

  function setDialogStatus(message, tone) {
    if (!modalState.state) {
      return;
    }
    modalState.state.status = String(message || '');
    modalState.state.statusTone = String(tone || '');
    renderDialog();
  }

  function revealInvoiceControls(state, generation) {
    window.setTimeout(function () {
      if (!isCurrentDialog(state, generation)) return;
      var invoiceBlock = document.querySelector('[data-zap-invoice-block="true"]');
      var invoiceText = document.querySelector('[data-zap-invoice-text="true"]');
      if (invoiceBlock && typeof invoiceBlock.scrollIntoView === 'function') {
        invoiceBlock.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      if (invoiceText && typeof invoiceText.focus === 'function') {
        invoiceText.focus({ preventScroll: true });
        if (typeof invoiceText.select === 'function') {
          invoiceText.select();
        }
      }
    }, 0);
  }

  function createInvoice() {
    if (!modalState.open || !modalState.options || !modalState.state || modalState.state.busy) {
      return;
    }
    var amountMsats = currentSats() * 1000;
    var state = modalState.state;
    var options = modalState.options;
    var note = state.note || '';
    var generation = modalState.generation;
    var attempt = { state: state, controller: new AbortController() };
    attempt.isCurrent = function () {
      return modalState.invoiceAttempt === attempt && isCurrentDialog(state, generation)
        && !attempt.controller.signal.aborted;
    };
    attempt.requireCurrent = function () {
      if (!attempt.isCurrent()) throw new DOMException('Invoice attempt cancelled', 'AbortError');
    };
    // Keep cancellation effective with either the current or an older Citrine bundle.
    attempt.fetch = function (url, init) {
      attempt.requireCurrent();
      return fetch(url, Object.assign({}, init, { signal: attempt.controller.signal }));
    };
    modalState.invoiceAttempt = attempt;
    state.busy = true;
    state.invoice = '';
    state.invoiceAmountMsats = 0;
    var createdSignedZap = false;
    setDialogStatus('Fetching Lightning zap details…', 'info');

    return Promise.resolve().then(function () {
      attempt.requireCurrent();
      return loadLnurlInfo(options.zapConfig.lud16, attempt);
    }).then(function (lnurlInfo) {
      attempt.requireCurrent();
      if ((lnurlInfo.minSendable > 0 && amountMsats < lnurlInfo.minSendable) || (lnurlInfo.maxSendable > 0 && amountMsats > lnurlInfo.maxSendable)) {
        throw new Error('Amount must be between ' + String(Math.ceil(lnurlInfo.minSendable / 1000)) + ' and ' + String(Math.floor(lnurlInfo.maxSendable / 1000)) + ' sats for this wallet.');
      }
      var api = signerApi();
      var requestUnsignedInvoice = function () {
        attempt.requireCurrent();
        createdSignedZap = false;
        setDialogStatus('Creating a copyable Lightning invoice...', 'info');
        return requestInvoice(options, null, amountMsats, lnurlInfo, note, attempt);
      };
      if (!api) return requestUnsignedInvoice();
      return signerIsAvailable(api, attempt).then(function (available) {
        attempt.requireCurrent();
        if (!available) return requestUnsignedInvoice();
        setDialogStatus('Waiting for signer approval…', 'info');
        return Promise.resolve().then(function () {
          attempt.requireCurrent();
          return createZapEvent(options, lnurlInfo, amountMsats, note, api, attempt);
        }).then(function (signedEvent) {
          attempt.requireCurrent();
          createdSignedZap = true;
          setDialogStatus('Requesting invoice…', 'info');
          return requestInvoice(options, signedEvent, amountMsats, lnurlInfo, note, attempt);
        }, function (err) {
          attempt.requireCurrent();
          if (signerUnavailableError(err)) return requestUnsignedInvoice();
          throw err;
        });
      });
    }).then(function (invoice) {
      attempt.requireCurrent();
      state.invoice = invoice;
      state.invoiceAmountMsats = amountMsats;
      setDialogStatus(createdSignedZap
        ? 'Invoice ready. Pay it in your wallet to complete the zap.'
        : 'Invoice ready. Copy it or open it in a Lightning wallet to complete the zap.', 'ok');
      revealInvoiceControls(state, generation);
    }).catch(function (err) {
      if (attempt.isCurrent()) {
        setDialogStatus(err && err.message ? err.message : 'Could not create a zap invoice.', 'error');
      }
    }).finally(function () {
      if (attempt.isCurrent()) {
        modalState.invoiceAttempt = null;
        state.busy = false;
        renderDialog();
      }
    });
  }

  function copyInvoice() {
    if (!modalState.state || !modalState.state.invoice) return;
    var state = modalState.state;
    var generation = modalState.generation;
    return window.citrine.zaps.copyTextToClipboard(state.invoice, window).then(function () {
      if (isCurrentDialog(state, generation)) setDialogStatus('Lightning invoice copied.', 'ok');
    }).catch(function (err) {
      if (isCurrentDialog(state, generation)) setDialogStatus(err && err.message ? err.message : 'Could not copy invoice.', 'error');
    });
  }

  function payWithWebln() {
    if (!modalState.state || !modalState.state.invoice || modalState.state.paying) return;
    var state = modalState.state;
    var generation = modalState.generation;
    var provider = window.webln;
    function requireCurrentPayment() {
      if (!isCurrentDialog(state, generation) || window.webln !== provider) {
        throw new DOMException('Payment attempt cancelled', 'AbortError');
      }
    }
    var target = { webln: provider && {
      enable: function () {
        requireCurrentPayment();
        return typeof provider.enable === 'function' ? provider.enable() : null;
      },
      sendPayment: function (invoice) {
        requireCurrentPayment();
        return provider.sendPayment(invoice);
      }
    } };
    state.paying = true;
    renderDialog();
    return Promise.resolve().then(function () {
      requireCurrentPayment();
      return window.citrine.zaps.payLightningInvoiceWithWebLN(state.invoice, target);
    }).then(function () {
      if (isCurrentDialog(state, generation)) setDialogStatus('Payment submitted through WebLN. The recipient server will publish the zap receipt after settlement.', 'ok');
    }).catch(function (err) {
      if (isCurrentDialog(state, generation)) setDialogStatus(err && err.message ? err.message : 'WebLN payment failed.', 'error');
    }).finally(function () {
      state.paying = false;
      if (isCurrentDialog(state, generation)) renderDialog();
    });
  }

  function renderInvoiceQr() {
    if (!modalState.open || !modalState.state || !modalState.state.invoice) {
      return;
    }
    var body = dialogBody();
    if (!body) {
      return;
    }
    var node = body.querySelector('[data-zap-qr="true"]');
    if (!node) {
      return;
    }
    node.innerHTML = '';
    if (typeof window.QRCode === 'function') {
      new window.QRCode(node, {
        text: modalState.state.invoice,
        width: 168,
        height: 168,
        colorDark: '#111111',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } else {
      node.textContent = 'QR unavailable';
    }
  }

  function zapIconHtml() {
    zapIconId += 1;
    var gradientId = 'zap-bolt-gradient-' + String(zapIconId);
    return '' +
      '<span class="zap-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" focusable="false" role="img">' +
          '<defs><linearGradient id="' + gradientId + '" x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse"><stop stop-color="#7c3aed"></stop><stop offset="1" stop-color="#d946ef"></stop></linearGradient></defs>' +
          '<path fill="url(#' + gradientId + ')" d="M13.8 2.4 4.6 13.1h6.1l-1.1 8.5 9.8-12h-6.3l.7-7.2Z"></path>' +
        '</svg>' +
      '</span>';
  }

  function renderHost(host, rawOptions) {
    if (!(host instanceof HTMLElement)) {
      return;
    }
    var options = normalizeOptions(rawOptions);
    if (!options) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    var state = ensureHostState(host, options);
    host.hidden = false;
    host.className = 'zap-inline-host' + (options.display === 'compact' ? ' is-compact' : '');
    if (options.display === 'compact') {
      host.innerHTML = '<button type="button" class="zap-action-btn zap-action-btn-primary zap-compact-btn" data-zap-open="true" title="Zap this post" aria-label="Zap this post">' + zapIconHtml() + '<span class="sr-only">Zap this post</span></button>';
      var compactButton = host.querySelector('[data-zap-open="true"]');
      if (compactButton) {
        compactButton.addEventListener('click', function () {
          openDialog(host, options, state);
        });
      }
      return;
    }
    host.innerHTML = '' +
      '<section class="zap-inline-card">' +
        '<div class="zap-inline-copy">' +
          '<span class="zap-inline-kicker">Zap</span>' +
          '<strong class="zap-inline-title">' + escapeHtml(options.title || options.contextLabel || 'Support this post') + '</strong>' +
          (options.hideRecipient ? '' : '<span class="zap-inline-meta">' + escapeHtml(options.zapConfig.lud16) + '</span>') +
        '</div>' +
        '<div class="zap-inline-actions">' +
          '<button type="button" class="zap-action-btn zap-action-btn-primary" data-zap-open="true">' + zapIconHtml() + 'Zap ' + escapeHtml(String(state.selectedSats || options.zapConfig.defaultAmountSats)) + ' sats</button>' +
        '</div>' +
      '</section>';
    var button = host.querySelector('[data-zap-open="true"]');
    if (button) {
      button.addEventListener('click', function () {
        openDialog(host, options, state);
      });
    }
  }

  window.blogZapUi = {
    render: function (host, options) {
      renderHost(host, options);
    },
    open: function (rawOptions) {
      var options = normalizeOptions(rawOptions);
      if (!options) {
        return false;
      }
      var host = document.createElement('div');
      host.hidden = true;
      document.body.appendChild(host);
      var state = ensureHostState(host, options);
      openDialog(host, options, state);
      return true;
    }
  };
})();
