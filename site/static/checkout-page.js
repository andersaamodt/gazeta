(function () {
  'use strict';

  var root = document.getElementById('checkout-page-root');
  if (!root) {
    return;
  }

  var content = document.getElementById('checkout-page-content');
  if (!content) {
    return;
  }

  var state = {
    runtime: null,
    paymentMethod: 'crypto',
    provider: 'btcpay',
    busy: false,
    order: null,
    orderPollTimer: 0,
    message: '',
    messageTone: 'info'
  };

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtMoney(raw) {
    var n = Number(raw);
    if (!isFinite(n)) {
      n = 0;
    }
    return n.toFixed(2);
  }

  function authPayload() {
    try {
      return {
        session_token: localStorage.getItem('session_token') || '',
        csrf_token: localStorage.getItem('csrf_token') || ''
      };
    } catch (_err) {
      return { session_token: '', csrf_token: '' };
    }
  }

  function apiPost(path, payload, includeAuth) {
    var body = new URLSearchParams();
    var src = payload || {};
    Object.keys(src).forEach(function (key) {
      var val = src[key];
      if (val === undefined || val === null) {
        return;
      }
      body.set(key, String(val));
    });
    if (includeAuth) {
      var auth = authPayload();
      if (auth.session_token) {
        body.set('session_token', auth.session_token);
      }
      if (auth.csrf_token) {
        body.set('csrf_token', auth.csrf_token);
      }
    }
    return fetch(path, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString()
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try {
          data = JSON.parse(text);
        } catch (_err) {
          throw new Error('Invalid server response');
        }
        if (!res.ok || !data || data.success === false) {
          throw new Error((data && data.error) ? data.error : ('Request failed (' + res.status + ')'));
        }
        return data;
      });
    });
  }

  function queryParams() {
    try {
      return new URLSearchParams(window.location.search || '');
    } catch (_err) {
      return new URLSearchParams('');
    }
  }

  function cartApi() {
    return window.blogShopCart || null;
  }

  function cartItems() {
    var api = cartApi();
    if (!api || typeof api.getItems !== 'function') {
      return [];
    }
    return api.getItems();
  }

  function cartItemsPayload() {
    var api = cartApi();
    if (!api || typeof api.quoteItemsPayload !== 'function') {
      return [];
    }
    return api.quoteItemsPayload();
  }

  function setMessage(text, tone) {
    state.message = String(text || '');
    state.messageTone = tone || 'info';
  }

  function stopOrderPolling() {
    if (state.orderPollTimer) {
      clearInterval(state.orderPollTimer);
      state.orderPollTimer = 0;
    }
  }

  function startOrderPolling() {
    stopOrderPolling();
    if (!state.order || !state.order.order_id) {
      return;
    }
    state.orderPollTimer = setInterval(function () {
      if (!state.order || !state.order.order_id) {
        stopOrderPolling();
        return;
      }
      loadOrder(state.order.order_id).catch(function () {
        // keep polling
      });
    }, 5000);
  }

  function currentProvider() {
    if (state.paymentMethod === 'credit') {
      if (state.provider !== 'ramp' && state.provider !== 'paybis') {
        state.provider = 'ramp';
      }
      return state.provider;
    }
    if (state.provider !== 'btcpay') {
      state.provider = 'btcpay';
    }
    return state.provider;
  }

  function providerEmbedUrl(provider) {
    var runtime = state.runtime || {};
    if (state.order && state.order.provider_url) {
      return String(state.order.provider_url || '');
    }
    if (provider === 'btcpay') {
      return String(runtime.btcpay_url || '');
    }
    if (provider === 'paybis') {
      var partner = runtime.paybis_partner_id || '';
      return 'https://widget.paybis.com/?partnerId=' + encodeURIComponent(partner);
    }
    var key = runtime.ramp_host_api_key || '';
    return 'https://buy.ramp.network/?hostApiKey=' + encodeURIComponent(key);
  }

  function renderOrderPanel() {
    if (!state.order) {
      return '';
    }
    var order = state.order;
    var status = String(order.status || 'pending').toLowerCase();
    var statusTone = status === 'paid' ? 'ok' : (status === 'failed' ? 'error' : 'warn');
    var links = Array.isArray(order.download_links) ? order.download_links : [];
    var linksHtml = '';
    if (links.length) {
      linksHtml = '<ul class="checkout-download-links">' + links.map(function (row) {
        var url = String(row && row.url || '');
        var slug = String(row && row.slug || 'download');
        return '<li><a href="' + escapeHtml(url) + '">Download ' + escapeHtml(slug) + '</a></li>';
      }).join('') + '</ul>';
    }
    return ''
      + '<section class="checkout-order-panel">'
      + '<div class="checkout-order-row"><span>Order</span><strong>' + escapeHtml(order.order_id || '') + '</strong></div>'
      + '<div class="checkout-order-row"><span>Status</span><strong class="is-' + escapeHtml(statusTone) + '">' + escapeHtml(status || 'pending') + '</strong></div>'
      + '<div class="checkout-order-row"><span>Provider</span><strong>' + escapeHtml(order.provider || '') + '</strong></div>'
      + '<div class="checkout-order-row"><span>Subtotal</span><strong>$' + escapeHtml(String(order.totals && order.totals.subtotal || '0.00')) + '</strong></div>'
      + (order.provider_url ? '<div class="checkout-order-link"><a href="' + escapeHtml(order.provider_url) + '" target="_blank" rel="noopener noreferrer">Open provider flow</a></div>' : '')
      + linksHtml
      + (status !== 'paid' ? '<button type="button" class="checkout-simulate-btn" data-checkout-action="simulate-paid">Simulate webhook paid</button>' : '')
      + '</section>';
  }

  function renderMessage() {
    if (!state.message) {
      return '';
    }
    return '<p class="checkout-message is-' + escapeHtml(state.messageTone) + '">' + escapeHtml(state.message) + '</p>';
  }

  function render() {
    var items = cartItems();
    var subtotal = 0;
    var cryptoTotal = 0;
    var rows = (Array.isArray(items) ? items : []).map(function (item) {
      var qty = Number(item.qty || 1);
      if (!isFinite(qty) || qty < 1) {
        qty = 1;
      }
      var unit = Number(item.unit_price || 0);
      if (!isFinite(unit)) {
        unit = 0;
      }
      var unitCrypto = Number(item.unit_crypto_price || unit);
      if (!isFinite(unitCrypto)) {
        unitCrypto = unit;
      }
      var line = unit * qty;
      var cryptoLine = unitCrypto * qty;
      subtotal += line;
      cryptoTotal += cryptoLine;
      return ''
        + '<li class="checkout-item-row">'
        + '<span class="checkout-item-title">' + escapeHtml(item.title || item.slug || 'Item') + ' x' + String(qty) + '</span>'
        + '<span class="checkout-item-price">$' + fmtMoney(line) + ' <small>(~$' + fmtMoney(cryptoLine) + ' crypto)</small></span>'
        + '</li>';
    }).join('');

    var hasItems = !!rows;
    var provider = currentProvider();
    var embedUrl = providerEmbedUrl(provider);

    var embedHtml = '';
    if (embedUrl) {
      embedHtml = '<iframe class="checkout-provider-embed" src="' + escapeHtml(embedUrl) + '" title="' + escapeHtml(provider) + ' checkout panel"></iframe>';
    } else if (provider === 'btcpay') {
      embedHtml = '<p class="checkout-provider-placeholder">BTCPay is not configured yet. Set <code>btcpay_host</code> and, if needed, <code>btcpay_rootpath</code> in site config or finish BTCPay provisioning in Headquarters.</p>';
    } else if (provider === 'paybis') {
      embedHtml = '<p class="checkout-provider-placeholder">Paybis embed is available as a stub until partner credentials are configured.</p>';
    } else {
      embedHtml = '<p class="checkout-provider-placeholder">Ramp embed is available as a stub until host API key is configured.</p>';
    }

    content.innerHTML = ''
      + '<section class="checkout-grid">'
      + '<div class="checkout-column checkout-column-summary">'
      + '<h2>Order Summary</h2>'
      + (hasItems ? '<ul class="checkout-item-list">' + rows + '</ul>' : '<p class="checkout-empty">Your cart is empty.</p>')
      + '<div class="checkout-totals">'
      + '<div><span>Card subtotal</span><strong>$' + fmtMoney(subtotal) + '</strong></div>'
      + '<div><span>Crypto total</span><strong>$' + fmtMoney(cryptoTotal) + '</strong></div>'
      + '</div>'
      + '<div class="checkout-links">'
      + '<a href="/cart" class="checkout-link-button">Back to Cart</a>'
      + '</div>'
      + renderOrderPanel()
      + '</div>'
      + '<div class="checkout-column checkout-column-payment">'
      + '<h2>Payment Method</h2>'
      + renderMessage()
      + '<fieldset class="checkout-radio-group">'
      + '<legend>Choose how to pay</legend>'
      + '<div class="checkout-choice-grid">'
      + '<label class="checkout-choice' + (state.paymentMethod === 'crypto' ? ' is-selected' : '') + '"><input type="radio" name="checkout-method" value="crypto"' + (state.paymentMethod === 'crypto' ? ' checked' : '') + '><span>Crypto (direct)</span></label>'
      + '<label class="checkout-choice' + (state.paymentMethod === 'credit' ? ' is-selected' : '') + '"><input type="radio" name="checkout-method" value="credit"' + (state.paymentMethod === 'credit' ? ' checked' : '') + '><span>Credit card onramp</span></label>'
      + '</div>'
      + '</fieldset>'
      + '<fieldset class="checkout-provider-group">'
      + '<legend>' + (state.paymentMethod === 'credit' ? 'Credit onramp provider' : 'Crypto processor') + '</legend>'
      + '<div class="checkout-choice-grid">'
      + (state.paymentMethod === 'credit'
        ? ('<label class="checkout-choice' + (provider === 'ramp' ? ' is-selected' : '') + '"><input type="radio" name="checkout-provider" value="ramp"' + (provider === 'ramp' ? ' checked' : '') + '><span>Ramp</span></label>'
          + '<label class="checkout-choice' + (provider === 'paybis' ? ' is-selected' : '') + '"><input type="radio" name="checkout-provider" value="paybis"' + (provider === 'paybis' ? ' checked' : '') + '><span>Paybis</span></label>')
        : ('<label class="checkout-choice is-selected"><input type="radio" name="checkout-provider" value="btcpay" checked><span>BTCPay Server</span></label>'))
      + '</div>'
      + '</fieldset>'
      + '<div class="checkout-actions">'
      + '<button type="button" data-checkout-action="create-order"' + (hasItems && !state.busy ? '' : ' disabled') + '>' + (state.busy ? 'Creating order...' : 'Start Payment') + '</button>'
      + '</div>'
      + '<div class="checkout-provider-shell">'
      + embedHtml
      + '</div>'
      + '</div>'
      + '</section>';
  }

  function loadRuntimeStatus() {
    return apiPost('/cgi/blog-payments', { action: 'status' }, false).then(function (data) {
      var rampHostApiKey = String(data.ramp_host_api_key || data.ramp_key || '');
      var paybisPartnerId = String(data.paybis_partner_id || data.paybis_partner || '');
      state.runtime = {
        btcpay_url: String(data.btcpay_url || ''),
        btcpay_host: String(data.btcpay_host || ''),
        ramp_host_api_key: rampHostApiKey,
        paybis_partner_id: paybisPartnerId,
        ramp_configured: !!data.ramp_configured,
        paybis_configured: !!data.paybis_configured
      };
      return data;
    }).catch(function () {
      state.runtime = state.runtime || {};
    });
  }

  function loadOrder(orderId) {
    if (!orderId) {
      return Promise.resolve(null);
    }
    return apiPost('/cgi/blog-payments', {
      action: 'order_status',
      order_id: orderId
    }, false).then(function (data) {
      state.order = data.order || null;
      if (state.order && String(state.order.status || '').toLowerCase() === 'paid') {
        stopOrderPolling();
        setMessage('Payment confirmed. Download links are now active below.', 'ok');
        var api = cartApi();
        if (api && typeof api.clear === 'function') {
          api.clear();
        }
      }
      render();
      return data;
    });
  }

  function createOrder() {
    if (state.busy) {
      return;
    }
    var payloadItems = cartItemsPayload();
    if (!payloadItems.length) {
      setMessage('Add at least one product before starting checkout.', 'warn');
      render();
      return;
    }
    state.busy = true;
    setMessage('Creating order...', 'info');
    render();
    apiPost('/cgi/blog-payments', {
      action: 'create_order',
      payment_method: state.paymentMethod,
      provider: currentProvider(),
      items_json: JSON.stringify(payloadItems)
    }, false).then(function (data) {
      var nextOrder = data.order || null;
      if (nextOrder && !nextOrder.provider_url && data.provider_url) {
        nextOrder.provider_url = String(data.provider_url || '');
      }
      state.order = nextOrder;
      setMessage('Order created. Complete payment in the embedded provider panel.', 'ok');
      render();
      startOrderPolling();
    }).catch(function (err) {
      setMessage(err && err.message ? err.message : 'Could not create order', 'error');
      render();
    }).finally(function () {
      state.busy = false;
      render();
    });
  }

  function simulatePaid() {
    if (!state.order || !state.order.order_id || state.busy) {
      return;
    }
    state.busy = true;
    setMessage('Marking order as paid...', 'info');
    render();
    apiPost('/cgi/blog-payments', {
      action: 'simulate_paid',
      order_id: state.order.order_id
    }, true).then(function (data) {
      state.order = data.order || state.order;
      setMessage('Order marked as paid.', 'ok');
      render();
    }).catch(function (err) {
      setMessage(err && err.message ? err.message : 'Could not mark order paid', 'error');
      render();
    }).finally(function () {
      state.busy = false;
      render();
    });
  }

  content.addEventListener('change', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name === 'checkout-method') {
      state.paymentMethod = target.value === 'credit' ? 'credit' : 'crypto';
      if (state.paymentMethod === 'crypto') {
        state.provider = 'btcpay';
      } else if (state.provider !== 'ramp' && state.provider !== 'paybis') {
        state.provider = 'ramp';
      }
      render();
      return;
    }
    if (target.name === 'checkout-provider') {
      state.provider = String(target.value || '').trim().toLowerCase();
      render();
    }
  });

  content.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    var actionNode = target.closest('[data-checkout-action]');
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    var action = String(actionNode.getAttribute('data-checkout-action') || '');
    if (action === 'create-order') {
      createOrder();
      return;
    }
    if (action === 'simulate-paid') {
      simulatePaid();
    }
  });

  window.addEventListener('blog-cart-updated', render);

  Promise.resolve().then(function () {
    return loadRuntimeStatus();
  }).then(function () {
    var params = queryParams();
    var productSlug = String(params.get('product') || '').trim();
    var api = cartApi();
    if (productSlug && api && typeof api.addProductBySlug === 'function' && (!api.getItems || !api.getItems().length)) {
      return api.addProductBySlug(productSlug).catch(function () {
        // Keep checkout usable even if auto-add fails.
      });
    }
  }).then(function () {
    var params = queryParams();
    var orderId = String(params.get('order_id') || '').trim();
    if (!orderId) {
      render();
      return;
    }
    return loadOrder(orderId).then(function () {
      startOrderPolling();
    }).catch(function () {
      setMessage('Could not load order status.', 'warn');
      render();
    });
  }).catch(function () {
    render();
  });
})();
