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
    methodTouched: false,
    busy: false,
    order: null,
    crossmintMountKey: '',
    crossmintMounting: false,
    orderPollTimer: 0,
    message: '',
    messageTone: 'info',
    shipping: {
      name: '',
      email: '',
      phone: '',
      address1: '',
      address2: '',
      city: '',
      state_code: '',
      country_code: 'US',
      zip: ''
    }
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

  function cartHasShippingItems(items) {
    return (Array.isArray(items) ? items : cartItems()).some(function (item) {
      return !!(item && (item.physical || item.product_type === 'merch' || item.fulfillment_provider));
    });
  }

  function cleanShippingValue(value) {
    return String(value || '').replace(/[\r\n]/g, ' ').trim();
  }

  function shippingPayload() {
    return {
      name: cleanShippingValue(state.shipping.name),
      email: cleanShippingValue(state.shipping.email),
      phone: cleanShippingValue(state.shipping.phone),
      address1: cleanShippingValue(state.shipping.address1),
      address2: cleanShippingValue(state.shipping.address2),
      city: cleanShippingValue(state.shipping.city),
      state_code: cleanShippingValue(state.shipping.state_code).toUpperCase(),
      country_code: cleanShippingValue(state.shipping.country_code || 'US').toUpperCase(),
      zip: cleanShippingValue(state.shipping.zip)
    };
  }

  function shippingIsValid() {
    var s = shippingPayload();
    var requiresState = s.country_code === 'US' || s.country_code === 'CA' || s.country_code === 'AU';
    return !!(s.name && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email) && s.address1 && s.city && s.country_code.length === 2 && s.zip && (!requiresState || s.state_code));
  }

  function shippingFormHtml() {
    var s = state.shipping;
    return ''
      + '<fieldset class="checkout-shipping-form">'
      + '<legend>Shipping</legend>'
      + '<div class="checkout-shipping-grid">'
      + '<label><span>Name</span><input type="text" autocomplete="name" data-shipping-field="name" value="' + escapeHtml(s.name) + '"></label>'
      + '<label><span>Email</span><input type="email" autocomplete="email" data-shipping-field="email" value="' + escapeHtml(s.email) + '"></label>'
      + '<label><span>Phone</span><input type="tel" autocomplete="tel" data-shipping-field="phone" value="' + escapeHtml(s.phone) + '"></label>'
      + '<label class="checkout-shipping-wide"><span>Address</span><input type="text" autocomplete="address-line1" data-shipping-field="address1" value="' + escapeHtml(s.address1) + '"></label>'
      + '<label class="checkout-shipping-wide"><span>Address 2</span><input type="text" autocomplete="address-line2" data-shipping-field="address2" value="' + escapeHtml(s.address2) + '"></label>'
      + '<label><span>City</span><input type="text" autocomplete="address-level2" data-shipping-field="city" value="' + escapeHtml(s.city) + '"></label>'
      + '<label><span>State</span><input type="text" autocomplete="address-level1" data-shipping-field="state_code" value="' + escapeHtml(s.state_code) + '"></label>'
      + '<label><span>Country</span><input type="text" autocomplete="country" maxlength="2" data-shipping-field="country_code" value="' + escapeHtml(s.country_code || 'US') + '"></label>'
      + '<label><span>Postal code</span><input type="text" autocomplete="postal-code" data-shipping-field="zip" value="' + escapeHtml(s.zip) + '"></label>'
      + '</div>'
      + '</fieldset>';
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
      if (state.provider !== 'crossmint') {
        state.provider = 'crossmint';
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
    return '';
  }

  function mountCrossmintCheckout() {
    var order = state.order || {};
    var runtime = state.runtime || {};
    var mount = document.getElementById('crossmint-checkout-mount');
    var clientKey = String(runtime.crossmint_client_api_key || '');
    var orderId = String(order.crossmint_order_id || '');
    var clientSecret = String(order.crossmint_client_secret || '');
    if (!mount || !clientKey || !orderId || !clientSecret || state.crossmintMounting) {
      return;
    }
    var mountKey = clientKey + ':' + orderId + ':' + clientSecret;
    if (state.crossmintMountKey === mountKey && mount.childNodes.length) {
      return;
    }
    state.crossmintMounting = true;
    Promise.all([
      import('https://esm.sh/react@18.3.1'),
      import('https://esm.sh/react-dom@18.3.1/client'),
      import('https://esm.sh/@crossmint/client-sdk-react-ui')
    ]).then(function (mods) {
      var React = mods[0];
      var ReactDOM = mods[1];
      var Crossmint = mods[2];
      var receiptEmail = String(order.recipient && order.recipient.email || state.shipping.email || '');
      var element = React.createElement(
        Crossmint.CrossmintProvider,
        { apiKey: clientKey },
        React.createElement(
          Crossmint.CrossmintCheckoutProvider,
          null,
          React.createElement(Crossmint.CrossmintEmbeddedCheckout, {
            orderId: orderId,
            clientSecret: clientSecret,
            payment: {
              receiptEmail: receiptEmail,
              crypto: { enabled: false },
              fiat: { enabled: true },
              defaultMethod: 'fiat'
            }
          })
        )
      );
      ReactDOM.createRoot(mount).render(element);
      state.crossmintMountKey = mountKey;
    }).catch(function () {
      if (mount) {
        mount.innerHTML = '<p class="checkout-provider-placeholder">Could not load Crossmint checkout. Refresh this page or use the order link after payment support is configured.</p>';
      }
    }).finally(function () {
      state.crossmintMounting = false;
    });
  }

  function renderOrderPanel() {
    if (!state.order) {
      return '';
    }
    var order = state.order;
    var status = String(order.status || 'pending').toLowerCase();
    var statusTone = status === 'paid' ? 'ok' : (status === 'failed' ? 'error' : 'warn');
    var links = Array.isArray(order.download_links) ? order.download_links : [];
    var deliveryUrl = String(order.delivery_url || '');
    var linksHtml = '';
    if (deliveryUrl) {
      linksHtml = '<div class="checkout-delivery-pass">'
        + '<a class="checkout-link-button cart-page-link-button-primary" href="' + escapeHtml(deliveryUrl) + '">Open Download Page</a>'
        + '<small>Durable buyer page with short-lived download buttons.</small>'
        + '</div>';
    } else if (links.length) {
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
      + (order.totals && order.totals.shipping ? '<div class="checkout-order-row"><span>Shipping</span><strong>$' + escapeHtml(String(order.totals.shipping || '0.00')) + '</strong></div>' : '')
      + (order.totals && order.totals.total ? '<div class="checkout-order-row"><span>Total</span><strong>$' + escapeHtml(String(order.totals.total || '0.00')) + '</strong></div>' : '')
      + (order.fulfillment_status ? '<div class="checkout-order-row"><span>Fulfillment</span><strong>' + escapeHtml(order.fulfillment_status) + '</strong></div>' : '')
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
      var variant = item.variant_name
        ? '<small class="checkout-item-variant">' + escapeHtml(item.variant_name) + '</small>'
        : '';
      return ''
        + '<li class="checkout-item-row">'
        + '<span class="checkout-item-title">' + escapeHtml(item.title || item.slug || 'Item') + ' x' + String(qty) + variant + '</span>'
        + '<span class="checkout-item-price">$' + fmtMoney(line) + ' <small>(~$' + fmtMoney(cryptoLine) + ' crypto)</small></span>'
        + '</li>';
    }).join('');

    var hasItems = !!rows;
    var hasShippingItems = cartHasShippingItems(items);
    if (hasShippingItems && !state.methodTouched && !state.order) {
      state.paymentMethod = 'credit';
      state.provider = 'crossmint';
    }
    var provider = currentProvider();
    var embedUrl = providerEmbedUrl(provider);

    var embedHtml = '';
    if (provider === 'btcpay' && state.order && state.order.provider_url) {
      embedHtml = '<div class="checkout-provider-placeholder checkout-btcpay-handoff">'
        + '<p>BTCPay checkout opens in its own secure page.</p>'
        + '<a class="checkout-link-button cart-page-link-button-primary" href="' + escapeHtml(state.order.provider_url) + '" target="_blank" rel="noopener noreferrer">Open BTCPay Checkout</a>'
        + '</div>';
    } else if (provider === 'btcpay') {
      embedHtml = '<p class="checkout-provider-placeholder">Start payment to create a BTCPay invoice. The secure BTCPay checkout will open from this page after the order is created.</p>';
    } else if (provider === 'crossmint' && state.order && state.order.crossmint_order_id && state.order.crossmint_client_secret) {
      embedHtml = '<div id="crossmint-checkout-mount" class="checkout-crossmint-mount" aria-label="Crossmint checkout"></div>';
    } else if (provider === 'crossmint') {
      embedHtml = '<p class="checkout-provider-placeholder">Start payment to create a Crossmint card checkout for the final total.</p>';
    } else if (embedUrl) {
      embedHtml = '<iframe class="checkout-provider-embed" src="' + escapeHtml(embedUrl) + '" title="' + escapeHtml(provider) + ' checkout panel"></iframe>';
    } else if (provider === 'paybis') {
      embedHtml = '<p class="checkout-provider-placeholder">Paybis embed is available as a stub until partner credentials are configured.</p>';
    } else {
      embedHtml = '<p class="checkout-provider-placeholder">Checkout provider is not configured.</p>';
    }

    content.innerHTML = ''
      + '<section class="checkout-grid">'
      + '<div class="checkout-column checkout-column-summary">'
      + '<h2>Order Summary</h2>'
      + (hasItems ? '<ul class="checkout-item-list">' + rows + '</ul>' : '<p class="checkout-empty">Your cart is empty.</p>')
      + (hasShippingItems ? shippingFormHtml() : '')
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
        ? '<label class="checkout-choice is-selected"><input type="radio" name="checkout-provider" value="crossmint" checked><span>Crossmint</span></label>'
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
    mountCrossmintCheckout();
  }

  function loadRuntimeStatus() {
    return apiPost('/cgi/blog-payments', { action: 'status' }, false).then(function (data) {
      var paybisPartnerId = String(data.paybis_partner_id || data.paybis_partner || '');
      state.runtime = {
        btcpay_url: String(data.btcpay_url || ''),
        btcpay_host: String(data.btcpay_host || ''),
        crossmint_client_api_key: String(data.crossmint_client_api_key || ''),
        crossmint_configured: !!data.crossmint_configured,
        paybis_partner_id: paybisPartnerId,
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
        setMessage('Payment confirmed. Order status is updated below.', 'ok');
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
    var items = cartItems();
    if (!payloadItems.length) {
      setMessage('Add at least one product before starting checkout.', 'warn');
      render();
      return;
    }
    var needsShipping = cartHasShippingItems(items);
    if (needsShipping && !shippingIsValid()) {
      setMessage('Complete the shipping fields before starting payment.', 'warn');
      render();
      return;
    }
    state.busy = true;
    setMessage('Creating order...', 'info');
    render();
    var payload = {
      action: 'create_order',
      payment_method: state.paymentMethod,
      provider: currentProvider(),
      items_json: JSON.stringify(payloadItems)
    };
    if (needsShipping) {
      payload.recipient_json = JSON.stringify(shippingPayload());
    }
    apiPost('/cgi/blog-payments', payload, false).then(function (data) {
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

  function updateShippingFromTarget(target) {
    if (!(target instanceof HTMLInputElement)) {
      return false;
    }
    var shippingField = target.getAttribute('data-shipping-field');
    if (!shippingField || !Object.prototype.hasOwnProperty.call(state.shipping, shippingField)) {
      return false;
    }
    state.shipping[shippingField] = String(target.value || '');
    return true;
  }

  content.addEventListener('change', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.name === 'checkout-method') {
      state.paymentMethod = target.value === 'credit' ? 'credit' : 'crypto';
      state.methodTouched = true;
      if (state.paymentMethod === 'crypto') {
        state.provider = 'btcpay';
      } else {
        state.provider = 'crossmint';
      }
      render();
      return;
    }
    if (target.name === 'checkout-provider') {
      state.provider = String(target.value || '').trim().toLowerCase();
      state.methodTouched = true;
      render();
      return;
    }
    if (updateShippingFromTarget(target)) {
      render();
    }
  });

  content.addEventListener('input', function (event) {
    var target = event.target;
    if (updateShippingFromTarget(target)) {
      return;
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
