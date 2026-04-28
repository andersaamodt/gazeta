(function () {
  'use strict';

  var TARGET_SELECTOR = '.post-single-item, .blog-post-item:not(.blog-compose-card):not(.blog-compose-preview-card)';
  var WIDTH_KEY = 'nostrBlog.postWidthPx';
  var EDGE_PX = 14;
  var MIN_WIDTH = 320;
  var state = null;

  function storageGet() {
    try {
      return window.localStorage ? window.localStorage.getItem(WIDTH_KEY) : '';
    } catch (err) {
      return '';
    }
  }

  function storageSet(value) {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(WIDTH_KEY, String(value));
      }
    } catch (err) {
      // Resizing still works for this page view when localStorage is unavailable.
    }
  }

  function maxWidth() {
    return Math.max(MIN_WIDTH, window.innerWidth - 24);
  }

  function clampWidth(width) {
    var n = Number(width);
    if (!Number.isFinite(n)) {
      return 0;
    }
    return Math.max(MIN_WIDTH, Math.min(maxWidth(), Math.round(n)));
  }

  function allTargets() {
    return Array.prototype.slice.call(document.querySelectorAll(TARGET_SELECTOR));
  }

  function applyWidth(width) {
    var next = clampWidth(width);
    if (!next) {
      return;
    }
    document.documentElement.style.setProperty('--blog-post-resizable-width', next + 'px');
    storageSet(next);
  }

  function applySavedWidth() {
    var saved = clampWidth(storageGet());
    if (saved) {
      document.documentElement.style.setProperty('--blog-post-resizable-width', saved + 'px');
    }
  }

  function edgeAt(target, clientX) {
    var rect = target.getBoundingClientRect();
    if (rect.width < MIN_WIDTH * 0.75) {
      return '';
    }
    if (Math.abs(clientX - rect.left) <= EDGE_PX) {
      return 'left';
    }
    if (Math.abs(clientX - rect.right) <= EDGE_PX) {
      return 'right';
    }
    return '';
  }

  function enhanceTarget(target) {
    if (!target || target.dataset.postResizable === 'true') {
      return;
    }
    target.dataset.postResizable = 'true';
    target.classList.add('blog-post-resizable');
  }

  function refreshTargets() {
    var targets = allTargets();
    if (!targets.length) {
      return;
    }
    document.body.classList.add('blog-post-resize-enabled');
    targets.forEach(enhanceTarget);
    applySavedWidth();
  }

  function clearCursor(target) {
    if (target && !state) {
      target.style.cursor = '';
    }
  }

  function onPointerMove(event) {
    if (state) {
      var delta = state.edge === 'left'
        ? state.startX - event.clientX
        : event.clientX - state.startX;
      applyWidth(state.startWidth + (delta * 2));
      event.preventDefault();
      return;
    }

    var target = event.target && event.target.closest ? event.target.closest(TARGET_SELECTOR) : null;
    allTargets().forEach(function (item) {
      if (item !== target) {
        clearCursor(item);
      }
    });
    if (!target) {
      return;
    }
    target.style.cursor = edgeAt(target, event.clientX) ? 'ew-resize' : '';
  }

  function onPointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    var target = event.target && event.target.closest ? event.target.closest(TARGET_SELECTOR) : null;
    if (!target) {
      return;
    }
    var edge = edgeAt(target, event.clientX);
    if (!edge) {
      return;
    }
    state = {
      edge: edge,
      target: target,
      startX: event.clientX,
      startWidth: target.getBoundingClientRect().width
    };
    document.body.classList.add('blog-post-resizing');
    try {
      target.setPointerCapture(event.pointerId);
    } catch (err) {
      // Some synthetic or browser-retargeted pointer events cannot be captured.
    }
    event.preventDefault();
  }

  function endDrag(event) {
    if (!state) {
      return;
    }
    try {
      state.target.releasePointerCapture(event.pointerId);
    } catch (err) {
      // The pointer may already be released by the browser.
    }
    state.target.style.cursor = '';
    state = null;
    document.body.classList.remove('blog-post-resizing');
  }

  function init() {
    refreshTargets();
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', applySavedWidth);

    var observer = new MutationObserver(refreshTargets);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
