(function () {
  'use strict';

  var root = document.getElementById('cart-page-root');
  if (!root) {
    return;
  }

  var content = document.getElementById('cart-page-content');
  if (!content) {
    return;
  }

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

  function cartApi() {
    return window.blogShopCart || null;
  }

  function render() {
    var api = cartApi();
    if (!api || typeof api.getItems !== 'function') {
      content.innerHTML = '<p class="placeholder">Cart is loading...</p>';
      return;
    }

    var items = api.getItems();
    if (!Array.isArray(items) || !items.length) {
      content.innerHTML = ''
        + '<section class="cart-page-empty">'
        + '<p>Your shopping cart is empty.</p>'
        + '<a href="/list" class="cart-page-link-button">Browse Product Gallery</a>'
        + '</section>';
      return;
    }

    var subtotal = 0;
    var cryptoSubtotal = 0;
    var rows = items.map(function (item) {
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
      var lineCrypto = unitCrypto * qty;
      subtotal += line;
      cryptoSubtotal += lineCrypto;
      return ''
        + '<li class="cart-page-row" data-cart-slug="' + escapeHtml(item.slug || '') + '">'
        + '<div class="cart-page-row-main">'
        + '<a class="cart-page-item-title" href="' + escapeHtml(item.path || ('/' + (item.slug || ''))) + '">' + escapeHtml(item.title || item.slug || 'Item') + '</a>'
        + '<div class="cart-page-item-price">$' + fmtMoney(line) + ' <span>(~$' + fmtMoney(lineCrypto) + ' crypto)</span></div>'
        + '</div>'
        + '<div class="cart-page-row-actions">'
        + '<button type="button" data-cart-page-action="decrement" data-cart-slug="' + escapeHtml(item.slug || '') + '">-</button>'
        + '<span>Qty ' + String(qty) + '</span>'
        + '<button type="button" data-cart-page-action="increment" data-cart-slug="' + escapeHtml(item.slug || '') + '">+</button>'
        + '<button type="button" data-cart-page-action="remove" data-cart-slug="' + escapeHtml(item.slug || '') + '">Remove</button>'
        + '</div>'
        + '</li>';
    }).join('');

    content.innerHTML = ''
      + '<section class="cart-page-list-wrap">'
      + '<ul class="cart-page-list">' + rows + '</ul>'
      + '<div class="cart-page-summary">'
      + '<div class="cart-page-summary-row"><span>Subtotal</span><strong>$' + fmtMoney(subtotal) + '</strong></div>'
      + '<div class="cart-page-summary-row"><span>Estimated crypto total</span><strong>$' + fmtMoney(cryptoSubtotal) + '</strong></div>'
      + '<div class="cart-page-summary-actions">'
      + '<button type="button" id="cart-page-clear">Clear Cart</button>'
      + '<a href="/checkout" class="cart-page-link-button cart-page-link-button-primary">Continue to Checkout</a>'
      + '</div>'
      + '</div>'
      + '</section>';
  }

  content.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    var api = cartApi();
    if (!api) {
      return;
    }

    if (target.id === 'cart-page-clear') {
      if (typeof api.clear === 'function') {
        api.clear();
      }
      render();
      return;
    }

    var button = target.closest('button[data-cart-page-action]');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    var action = String(button.getAttribute('data-cart-page-action') || '');
    var slug = String(button.getAttribute('data-cart-slug') || '');
    var items = (typeof api.getItems === 'function') ? api.getItems() : [];
    var row = null;
    items.forEach(function (item) {
      if (row || String(item.slug || '') !== slug) {
        return;
      }
      row = item;
    });
    if (!row || typeof api.setItemQty !== 'function') {
      return;
    }
    if (action === 'increment') {
      api.setItemQty(slug, Number(row.qty || 1) + 1);
    } else if (action === 'decrement') {
      api.setItemQty(slug, Number(row.qty || 1) - 1);
    } else if (action === 'remove') {
      api.setItemQty(slug, 0);
    }
    render();
  });

  window.addEventListener('blog-cart-updated', render);
  render();
})();
