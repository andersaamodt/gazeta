(function () {
  'use strict';

  var STORAGE_KEY = 'nostr_blog_cart_v1';
  var state = {
    items: []
  };

  var els = {
    toggle: document.getElementById('nav-cart-toggle'),
    count: document.getElementById('nav-cart-count'),
    drawer: document.getElementById('nav-cart-drawer'),
    drawerItems: document.getElementById('nav-cart-items'),
    drawerEmpty: document.getElementById('nav-cart-empty'),
    drawerSubtotal: document.getElementById('nav-cart-subtotal'),
    drawerClose: document.getElementById('nav-cart-close')
  };

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseNumber(raw, fallback) {
    var n = Number(raw);
    if (!isFinite(n)) {
      return Number(fallback || 0);
    }
    return n;
  }

  function fmtMoney(raw) {
    var n = parseNumber(raw, 0);
    return n.toFixed(2);
  }

  function normalizeSlug(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function clampQty(raw) {
    var qty = Math.floor(parseNumber(raw, 1));
    if (qty < 1) {
      qty = 1;
    }
    if (qty > 99) {
      qty = 99;
    }
    return qty;
  }

  function normalizeItem(src) {
    var slug = normalizeSlug(src && src.slug);
    if (!slug) {
      return null;
    }
    var unitPrice = parseNumber(src && src.unit_price, 0);
    var unitCryptoPrice = parseNumber(src && src.unit_crypto_price, unitPrice);
    return {
      slug: slug,
      title: String(src && src.title || slug),
      qty: clampQty(src && src.qty),
      unit_price: unitPrice,
      unit_crypto_price: unitCryptoPrice,
      currency: String(src && src.currency || 'USD').toUpperCase(),
      path: String(src && src.path || ('/' + slug)),
      image_url: String(src && src.image_url || '')
    };
  }

  function normalizedItems(arr) {
    var out = [];
    var seen = {};
    (Array.isArray(arr) ? arr : []).forEach(function (item) {
      var normalized = normalizeItem(item);
      if (!normalized) {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(seen, normalized.slug)) {
        seen[normalized.slug] = normalized;
        out.push(normalized);
        return;
      }
      seen[normalized.slug].qty = clampQty(seen[normalized.slug].qty + normalized.qty);
      if (!seen[normalized.slug].title && normalized.title) {
        seen[normalized.slug].title = normalized.title;
      }
    });
    return out;
  }

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        state.items = [];
        return;
      }
      var parsed = JSON.parse(raw);
      state.items = normalizedItems(parsed && parsed.items);
    } catch (_err) {
      state.items = [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items }));
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function countItems() {
    return state.items.reduce(function (acc, item) {
      return acc + clampQty(item.qty);
    }, 0);
  }

  function subtotalFiat() {
    return state.items.reduce(function (acc, item) {
      return acc + (parseNumber(item.unit_price, 0) * clampQty(item.qty));
    }, 0);
  }

  function subtotalCrypto() {
    return state.items.reduce(function (acc, item) {
      return acc + (parseNumber(item.unit_crypto_price, 0) * clampQty(item.qty));
    }, 0);
  }

  function dispatchUpdate() {
    try {
      window.dispatchEvent(new CustomEvent('blog-cart-updated', {
        detail: {
          items: state.items.slice(),
          count: countItems(),
          subtotal: subtotalFiat(),
          cryptoSubtotal: subtotalCrypto()
        }
      }));
    } catch (_err) {
      // Ignore event dispatch failures.
    }
  }

  function renderCartButton() {
    if (!els.toggle) {
      return;
    }
    var count = countItems();
    var hasItems = count > 0;
    if (!hasItems) {
      closeDrawer();
    }
    els.toggle.hidden = !hasItems;
    els.toggle.style.display = hasItems ? '' : 'none';
    els.toggle.setAttribute('aria-hidden', hasItems ? 'false' : 'true');
    if (els.count) {
      els.count.textContent = String(count);
      els.count.hidden = !hasItems;
    }
  }

  function rowHtml(item) {
    var qty = clampQty(item.qty);
    var lineTotal = parseNumber(item.unit_price, 0) * qty;
    var lineCrypto = parseNumber(item.unit_crypto_price, 0) * qty;
    var img = item.image_url
      ? ('<img class="nav-cart-item-image" src="' + escapeHtml(item.image_url) + '" alt="" loading="lazy" decoding="async">')
      : '';
    var path = String(item.path || ('/' + item.slug));
    return ''
      + '<li class="nav-cart-item" data-cart-slug="' + escapeHtml(item.slug) + '">'
      + '<div class="nav-cart-item-media">' + img + '</div>'
      + '<div class="nav-cart-item-main">'
      + '<a class="nav-cart-item-title" href="' + escapeHtml(path) + '">' + escapeHtml(item.title || item.slug) + '</a>'
      + '<div class="nav-cart-item-price">$' + fmtMoney(lineTotal) + ' <span class="nav-cart-item-crypto">(~$' + fmtMoney(lineCrypto) + ' crypto)</span></div>'
      + '<div class="nav-cart-item-actions">'
      + '<button type="button" data-cart-action="decrement" data-cart-slug="' + escapeHtml(item.slug) + '" aria-label="Decrease quantity">-</button>'
      + '<span class="nav-cart-item-qty">Qty ' + String(qty) + '</span>'
      + '<button type="button" data-cart-action="increment" data-cart-slug="' + escapeHtml(item.slug) + '" aria-label="Increase quantity">+</button>'
      + '<button type="button" data-cart-action="remove" data-cart-slug="' + escapeHtml(item.slug) + '">Remove</button>'
      + '</div>'
      + '</div>'
      + '</li>';
  }

  function renderDrawer() {
    if (!els.drawer) {
      return;
    }
    if (!els.drawerItems || !els.drawerSubtotal || !els.drawerEmpty) {
      return;
    }
    if (!state.items.length) {
      els.drawerItems.innerHTML = '';
      els.drawerEmpty.hidden = false;
      els.drawerSubtotal.innerHTML = '$0.00';
      return;
    }
    els.drawerEmpty.hidden = true;
    els.drawerItems.innerHTML = state.items.map(rowHtml).join('');
    els.drawerSubtotal.innerHTML = '$' + fmtMoney(subtotalFiat()) + ' <span class="nav-cart-subtotal-crypto">(~$' + fmtMoney(subtotalCrypto()) + ' crypto)</span>';
  }

  function render() {
    renderCartButton();
    renderDrawer();
    dispatchUpdate();
  }

  function upsertItem(item) {
    var normalized = normalizeItem(item);
    if (!normalized) {
      return false;
    }
    var i;
    for (i = 0; i < state.items.length; i += 1) {
      if (state.items[i].slug !== normalized.slug) {
        continue;
      }
      state.items[i].qty = clampQty(state.items[i].qty + normalized.qty);
      if (normalized.title) {
        state.items[i].title = normalized.title;
      }
      if (normalized.path) {
        state.items[i].path = normalized.path;
      }
      if (normalized.image_url) {
        state.items[i].image_url = normalized.image_url;
      }
      if (normalized.unit_price > 0) {
        state.items[i].unit_price = normalized.unit_price;
      }
      if (normalized.unit_crypto_price > 0) {
        state.items[i].unit_crypto_price = normalized.unit_crypto_price;
      }
      saveCart();
      render();
      return true;
    }
    state.items.push(normalized);
    saveCart();
    render();
    return true;
  }

  function setItemQty(slug, qty) {
    var target = normalizeSlug(slug);
    if (!target) {
      return;
    }
    var i;
    for (i = 0; i < state.items.length; i += 1) {
      if (state.items[i].slug !== target) {
        continue;
      }
      if (qty <= 0) {
        state.items.splice(i, 1);
      } else {
        state.items[i].qty = clampQty(qty);
      }
      saveCart();
      render();
      return;
    }
  }

  function clear() {
    state.items = [];
    saveCart();
    render();
  }

  function openDrawer() {
    if (!els.drawer) {
      return;
    }
    if (countItems() <= 0) {
      closeDrawer();
      return;
    }
    if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) {
      window.location.href = '/pages/cart.html';
      return;
    }
    els.drawer.hidden = false;
    document.body.classList.add('nav-cart-open');
    if (els.toggle) {
      els.toggle.setAttribute('aria-expanded', 'true');
    }
  }

  function closeDrawer() {
    if (!els.drawer) {
      return;
    }
    els.drawer.hidden = true;
    document.body.classList.remove('nav-cart-open');
    if (els.toggle) {
      els.toggle.setAttribute('aria-expanded', 'false');
    }
  }

  function toApiProduct(raw) {
    var product = raw && raw.product ? raw.product : raw;
    if (!product || typeof product !== 'object') {
      return null;
    }
    var slug = normalizeSlug(product.slug || '');
    if (!slug) {
      return null;
    }
    var price = parseNumber(product.price, 0);
    var cryptoPrice = parseNumber(product.crypto_price, price);
    return {
      slug: slug,
      title: String(product.title || slug),
      qty: 1,
      unit_price: price,
      unit_crypto_price: cryptoPrice,
      currency: String(product.currency || 'USD').toUpperCase(),
      path: '/' + slug,
      image_url: String(product.image_url || '')
    };
  }

  function addProductBySlug(slug, options) {
    var productSlug = normalizeSlug(slug);
    if (!productSlug) {
      return Promise.reject(new Error('Missing product slug'));
    }
    return fetch('/cgi/blog-get-product?slug=' + encodeURIComponent(productSlug), {
      method: 'GET',
      cache: 'no-store'
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try {
          data = JSON.parse(text);
        } catch (_err) {
          throw new Error('Invalid product response');
        }
        if (!res.ok || !data || data.success === false) {
          throw new Error((data && data.error) ? data.error : ('Request failed (' + res.status + ')'));
        }
        return data;
      });
    }).then(function (data) {
      var item = toApiProduct(data);
      if (!item) {
        throw new Error('Product could not be loaded');
      }
      if (options && options.image_url) {
        item.image_url = String(options.image_url || '');
      }
      if (options && options.qty) {
        item.qty = clampQty(options.qty);
      }
      upsertItem(item);
      return item;
    });
  }

  function bindEvents() {
    if (els.toggle) {
      els.toggle.addEventListener('click', function () {
        if (els.drawer && !els.drawer.hidden) {
          closeDrawer();
        } else {
          openDrawer();
        }
      });
    }

    if (els.drawerClose) {
      els.drawerClose.addEventListener('click', closeDrawer);
    }

    if (els.drawerItems) {
      els.drawerItems.addEventListener('click', function (event) {
        var target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        var button = target.closest('button[data-cart-action]');
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        var action = String(button.getAttribute('data-cart-action') || '');
        var slug = normalizeSlug(button.getAttribute('data-cart-slug') || '');
        if (!slug) {
          return;
        }
        var i;
        for (i = 0; i < state.items.length; i += 1) {
          if (state.items[i].slug !== slug) {
            continue;
          }
          if (action === 'increment') {
            setItemQty(slug, state.items[i].qty + 1);
          } else if (action === 'decrement') {
            setItemQty(slug, state.items[i].qty - 1);
          } else if (action === 'remove') {
            setItemQty(slug, 0);
          }
          return;
        }
      });
    }

    document.addEventListener('click', function (event) {
      if (!els.drawer || els.drawer.hidden) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest('#nav-cart-drawer') || target.closest('#nav-cart-toggle')) {
        return;
      }
      closeDrawer();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeDrawer();
      }
    });

    window.addEventListener('storage', function (event) {
      if (!event || event.key !== STORAGE_KEY) {
        return;
      }
      loadCart();
      render();
    });
  }

  loadCart();
  bindEvents();
  // Ensure drawer starts hidden even if markup hydration dropped the hidden attr.
  closeDrawer();
  render();

  window.blogShopCart = {
    addProductBySlug: addProductBySlug,
    addItem: upsertItem,
    setItemQty: setItemQty,
    clear: clear,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    getItems: function () {
      return state.items.slice();
    },
    quoteItemsPayload: function () {
      return state.items.map(function (item) {
        return {
          slug: item.slug,
          qty: clampQty(item.qty)
        };
      });
    }
  };
})();
