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
    state: null
  };

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
      display: String(src.display || '').trim()
    };
  }

  function resolvePresetAmounts(defaultAmountSats) {
    var base = clampSats(defaultAmountSats, 1000);
    var values = uniqueStrings([
      '100',
      '1000',
      String(base),
      '5000',
      '10000',
      '21000'
    ]).map(function (value) {
      return clampSats(value, base);
    });
    values.sort(function (a, b) { return a - b; });
    return values.slice(0, 6);
  }

  function zapAmountName(sats) {
    var amount = clampSats(sats, 1);
    if (amount <= 100) return 'Spark';
    if (amount <= 1000) return 'Boost';
    if (amount <= 5000) return 'Signal';
    if (amount <= 10000) return 'Flare';
    return 'Patron';
  }

  function zapAmountChipHtml(amount, activeSats, customActive) {
    var cls = 'zap-amount-chip';
    if (amount === activeSats && !customActive) {
      cls += ' is-selected';
    }
    var usd = formatUsdForSats(amount);
    return '' +
      '<button type="button" class="' + cls + '" data-zap-action="select_amount" data-zap-amount="' + String(amount) + '">' +
        '<span class="zap-amount-chip-name">' + escapeHtml(zapAmountName(amount)) + '</span>' +
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
    if (window.nostr && typeof window.nostr.signEvent === 'function') {
      return {
        signEvent: function (template) {
          return Promise.resolve(window.nostr.signEvent(template));
        },
        getPublicKey: function () {
          if (typeof window.nostr.getPublicKey === 'function') {
            return Promise.resolve(window.nostr.getPublicKey());
          }
          return Promise.resolve('');
        }
      };
    }
    return null;
  }

  function signerUnavailableError(err) {
    var message = String((err && err.message) || err || '').toLowerCase();
    return message.indexOf('no nostr signer') !== -1 ||
      message.indexOf('no browser nostr signer') !== -1 ||
      message.indexOf('fresh signer approval') !== -1 ||
      message.indexOf('phone signer is not paired') !== -1;
  }

  function signerIsAvailable(api) {
    if (!api) {
      return Promise.resolve(false);
    }
    if (typeof api.getStatus !== 'function') {
      return Promise.resolve(true);
    }
    return Promise.resolve(api.getStatus()).then(function (status) {
      return !!(status && status.available);
    }).catch(function (err) {
      if (signerUnavailableError(err)) {
        return false;
      }
      throw err;
    });
  }

  function promptPhoneSignerForZap() {
    if (window.blogAuth && typeof window.blogAuth.openLoginModal === 'function') {
      window.blogAuth.openLoginModal('phone');
    }
    throw new Error('Connect Amber with the phone signer link, then return here and create the zap invoice again.');
  }

  function parseJson(raw, fallback) {
    try {
      return JSON.parse(String(raw || ''));
    } catch (_err) {
      return fallback;
    }
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
          '<textarea readonly rows="5" data-zap-invoice-text="true">' + escapeHtml(state.invoice) + '</textarea>' +
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
    var targetTitle = options.title || options.target.title || options.target.label || 'this page';
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
        '<p class="zap-dialog-kicker">' + zapIconHtml() + '<span>Lightning Zap</span></p>' +
        '<h3 id="zap-dialog-title">Zap ' + escapeHtml(targetTitle) + '</h3>' +
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
            '<span class="zap-dialog-label">Comment <small>(optional)</small></span>' +
            '<textarea rows="2" data-zap-note="true" placeholder="Say something with the zap...">' + escapeHtml(String(state.note || '')) + '</textarea>' +
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

  function lud16ToUrl(lud16) {
    var value = String(lud16 || '').trim().toLowerCase();
    var parts = value.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error('Lightning address must look like name@example.com.');
    }
    return 'https://' + parts[1] + '/.well-known/lnurlp/' + encodeURIComponent(parts[0]);
  }

  function bytesFromText(text) {
    return Array.prototype.slice.call(new TextEncoder().encode(String(text || '')));
  }

  function convertBits(data, fromBits, toBits, pad) {
    var acc = 0;
    var bits = 0;
    var ret = [];
    var maxv = (1 << toBits) - 1;
    var maxAcc = (1 << (fromBits + toBits - 1)) - 1;
    for (var i = 0; i < data.length; i += 1) {
      var value = data[i];
      if (value < 0 || (value >> fromBits) !== 0) {
        return [];
      }
      acc = ((acc << fromBits) | value) & maxAcc;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        ret.push((acc >> bits) & maxv);
      }
    }
    if (pad) {
      if (bits > 0) {
        ret.push((acc << (toBits - bits)) & maxv);
      }
    } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
      return [];
    }
    return ret;
  }

  function bech32Polymod(values) {
    var generators = [
      0x3b6a57b2,
      0x26508e6d,
      0x1ea119fa,
      0x3d4233dd,
      0x2a1462b3
    ];
    var chk = 1;
    for (var i = 0; i < values.length; i += 1) {
      var top = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ values[i];
      for (var j = 0; j < generators.length; j += 1) {
        if ((top >> j) & 1) {
          chk ^= generators[j];
        }
      }
    }
    return chk;
  }

  function bech32HrpExpand(hrp) {
    var out = [];
    for (var i = 0; i < hrp.length; i += 1) {
      out.push(hrp.charCodeAt(i) >> 5);
    }
    out.push(0);
    for (var j = 0; j < hrp.length; j += 1) {
      out.push(hrp.charCodeAt(j) & 31);
    }
    return out;
  }

  function bech32CreateChecksum(hrp, data) {
    var values = bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
    var polymod = bech32Polymod(values) ^ 1;
    var checksum = [];
    for (var i = 0; i < 6; i += 1) {
      checksum.push((polymod >> (5 * (5 - i))) & 31);
    }
    return checksum;
  }

  function bech32Encode(hrp, text) {
    var charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    var words = convertBits(bytesFromText(text), 8, 5, true);
    if (!words.length) {
      throw new Error('Could not encode LNURL.');
    }
    var checksum = bech32CreateChecksum(hrp, words);
    var combined = words.concat(checksum);
    var out = hrp + '1';
    combined.forEach(function (value) {
      out += charset.charAt(value);
    });
    return out;
  }

  function fetchJson(url) {
    return fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store'
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = parseJson(text, null);
        if (!res.ok) {
          var errorText = json && json.reason ? json.reason : ('HTTP ' + String(res.status));
          throw new Error(errorText);
        }
        if (!json || typeof json !== 'object') {
          throw new Error('Expected a JSON response.');
        }
        return json;
      });
    });
  }

  function resolveCallbackUrl(callback, payUrl) {
    var raw = String(callback || '').trim();
    if (!raw) {
      throw new Error('Lightning provider did not return a callback URL.');
    }
    try {
      return new URL(raw, payUrl).toString();
    } catch (_err) {
      throw new Error('Lightning provider returned an invalid callback URL.');
    }
  }

  function loadLnurlInfo(lud16) {
    var key = String(lud16 || '').trim().toLowerCase();
    if (lnurlCache[key]) {
      return lnurlCache[key];
    }
    var payUrl = lud16ToUrl(key);
    var request = fetchJson(payUrl).then(function (data) {
      var callback = resolveCallbackUrl(data.callback, payUrl);
      var nostrPubkey = String(data.nostrPubkey || '').trim().toLowerCase();
      if (data.allowsNostr !== true || !isHex64(nostrPubkey)) {
        throw new Error('Lightning provider does not advertise Nostr zap support.');
      }
      return {
        payUrl: payUrl,
        callback: callback,
        encodedLnurl: bech32Encode('lnurl', payUrl),
        nostrPubkey: nostrPubkey,
        minSendable: Number(data.minSendable || 0),
        maxSendable: Number(data.maxSendable || 0),
        commentAllowed: Number(data.commentAllowed || 0)
      };
    });
    lnurlCache[key] = request;
    return request;
  }

  function normalizeSignedEvent(result) {
    if (typeof result === 'string') {
      return parseJson(result, null);
    }
    if (result && typeof result === 'object') {
      return result;
    }
    return null;
  }

  function createZapEvent(options, lnurlInfo, amountMsats, note) {
    var api = signerApi();
    if (!api) {
      return Promise.reject(new Error('A Nostr signer is required. Use a browser signer or pair a phone signer from Sign In.'));
    }
    var target = options.target;
    var tags = [
      ['relays'].concat(options.zapConfig.relays),
      ['amount', String(amountMsats)],
      ['lnurl', lnurlInfo.encodedLnurl],
      ['p', target.recipientPubkey]
    ];
    if (target.eventId) {
      tags.push(['e', target.eventId]);
    }
    if (target.address) {
      tags.push(['a', target.address]);
    }
    if (target.kind) {
      tags.push(['k', String(target.kind)]);
    }
    return Promise.resolve(typeof api.getPublicKey === 'function' ? api.getPublicKey() : '').catch(function () {
      return '';
    }).then(function (pubkey) {
      var template = {
        kind: 9734,
        created_at: Math.floor(Date.now() / 1000),
        content: String(note || ''),
        tags: tags
      };
      if (isHex64(pubkey)) {
        template.pubkey = String(pubkey).trim().toLowerCase();
      }
      return api.signEvent(template);
    }).then(function (signed) {
      var normalized = normalizeSignedEvent(signed);
      if (!normalized || typeof normalized !== 'object') {
        throw new Error('Signer returned an invalid zap request.');
      }
      return normalized;
    });
  }

  function requestInvoice(options, signedEvent, amountMsats, lnurlInfo, note) {
    var url = new URL(lnurlInfo.callback);
    url.searchParams.set('amount', String(amountMsats));
    if (signedEvent) {
      url.searchParams.set('nostr', JSON.stringify(signedEvent));
      url.searchParams.set('lnurl', lnurlInfo.encodedLnurl);
    } else if (note && lnurlInfo.commentAllowed > 0) {
      url.searchParams.set('comment', String(note).slice(0, lnurlInfo.commentAllowed));
    }
    return fetchJson(url.toString()).then(function (data) {
      var invoice = String(data.pr || '').trim();
      if (!invoice) {
        throw new Error((data && data.reason) || 'Lightning provider did not return an invoice.');
      }
      return invoice;
    });
  }

  function setDialogStatus(message, tone) {
    if (!modalState.state) {
      return;
    }
    modalState.state.status = String(message || '');
    modalState.state.statusTone = String(tone || '');
    renderDialog();
  }

  function revealInvoiceControls() {
    window.setTimeout(function () {
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
    var sats = currentSats();
    var amountMsats = sats * 1000;
    modalState.state.busy = true;
    modalState.state.invoice = '';
    modalState.state.invoiceAmountMsats = 0;
    var createdSignedZap = false;
    setDialogStatus('Fetching Lightning zap details…', 'info');

    loadLnurlInfo(modalState.options.zapConfig.lud16).then(function (lnurlInfo) {
      if ((lnurlInfo.minSendable > 0 && amountMsats < lnurlInfo.minSendable) || (lnurlInfo.maxSendable > 0 && amountMsats > lnurlInfo.maxSendable)) {
        throw new Error('Amount must be between ' + String(Math.ceil(lnurlInfo.minSendable / 1000)) + ' and ' + String(Math.floor(lnurlInfo.maxSendable / 1000)) + ' sats for this wallet.');
      }
      var api = signerApi();
      var requestUnsignedInvoice = function () {
        setDialogStatus('Creating a copyable Lightning invoice...', 'info');
        return requestInvoice(modalState.options, null, amountMsats, lnurlInfo, modalState.state.note || '');
      };
      if (!api) {
        return requestUnsignedInvoice();
      }
      return signerIsAvailable(api).then(function (available) {
        if (!available) {
          if (api.__wizardryShared === true) {
            return promptPhoneSignerForZap();
          }
          return requestUnsignedInvoice();
        }
        setDialogStatus('Waiting for signer approval…', 'info');
        return createZapEvent(modalState.options, lnurlInfo, amountMsats, modalState.state.note || '').then(function (signedEvent) {
          createdSignedZap = true;
          setDialogStatus('Requesting invoice…', 'info');
          return requestInvoice(modalState.options, signedEvent, amountMsats, lnurlInfo, modalState.state.note || '');
        }).catch(function (err) {
          if (signerUnavailableError(err)) {
            if (api.__wizardryShared === true) {
              return promptPhoneSignerForZap();
            }
            return requestUnsignedInvoice();
          }
          throw err;
        });
      });
    }).then(function (invoice) {
      modalState.state.invoice = invoice;
      modalState.state.invoiceAmountMsats = amountMsats;
      setDialogStatus(createdSignedZap
        ? 'Invoice ready. Pay it in your wallet to complete the zap.'
        : 'Invoice ready. Copy it or open it in a Lightning wallet to complete the zap.',
        'ok');
      revealInvoiceControls();
    }).catch(function (err) {
      setDialogStatus(err && err.message ? err.message : 'Could not create a zap invoice.', 'error');
    }).finally(function () {
      if (modalState.state) {
        modalState.state.busy = false;
        renderDialog();
      }
    });
  }

  function copyInvoice() {
    if (!modalState.state || !modalState.state.invoice) {
      return;
    }
    var invoice = modalState.state.invoice;
    var copyPromise;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      copyPromise = navigator.clipboard.writeText(invoice);
    } else {
      copyPromise = Promise.reject(new Error('Clipboard access is unavailable in this browser.'));
    }
    copyPromise.then(function () {
      setDialogStatus('Lightning invoice copied.', 'ok');
    }).catch(function (err) {
      setDialogStatus(err && err.message ? err.message : 'Could not copy invoice.', 'error');
    });
  }

  function payWithWebln() {
    if (!modalState.state || !modalState.state.invoice || modalState.state.paying) {
      return;
    }
    if (!window.webln) {
      setDialogStatus('WebLN is not available in this browser. Use Pay in wallet or copy the invoice instead.', 'error');
      return;
    }
    modalState.state.paying = true;
    renderDialog();
    var provider = window.webln;
    Promise.resolve(typeof provider.enable === 'function' ? provider.enable() : undefined).then(function () {
      if (typeof provider.sendPayment !== 'function') {
        throw new Error('This WebLN provider cannot pay invoices.');
      }
      return provider.sendPayment(modalState.state.invoice);
    }).then(function () {
      setDialogStatus('Payment submitted through WebLN. The recipient server will publish the zap receipt after settlement.', 'ok');
    }).catch(function (err) {
      setDialogStatus(err && err.message ? err.message : 'WebLN payment failed.', 'error');
    }).finally(function () {
      if (modalState.state) {
        modalState.state.paying = false;
        renderDialog();
      }
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
    return '' +
      '<span class="zap-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" focusable="false" role="img">' +
          '<path d="M13.8 2.4 4.6 13.1h6.1l-1.1 8.5 9.8-12h-6.3l.7-7.2Z"></path>' +
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
          '<span class="zap-inline-meta">' + escapeHtml(options.zapConfig.lud16) + '</span>' +
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
    }
  };
})();
