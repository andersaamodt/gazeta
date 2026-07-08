(function () {
  'use strict';

  var root = document.getElementById('tags-page-root');
  if (!root) {
    return;
  }

  var content = document.getElementById('tag-cloud');
  if (!content) {
    return;
  }

  function decodeHashValue(value) {
    var text = String(value || '').replace(/^#/, '').trim();
    if (!text) {
      return '';
    }
    try {
      return decodeURIComponent(text);
    } catch (_err) {
      return text;
    }
  }

  function currentSelectedTags() {
    var raw = decodeHashValue(window.location.hash || '');
    if (!raw) {
      return [];
    }
    var seen = {};
    return raw.split(',').map(function (part) {
      return String(part || '').trim();
    }).filter(function (tag) {
      if (!tag || seen[tag]) {
        return false;
      }
      seen[tag] = true;
      return true;
    });
  }

  function setSelectedTags(tags) {
    var next = Array.isArray(tags) ? tags.filter(Boolean) : [];
    var encoded = next.map(function (tag) {
      return encodeURIComponent(String(tag));
    }).join(',');
    if (!encoded) {
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return;
    }
    var nextUrl = window.location.pathname + window.location.search + '#' + encoded;
    if (nextUrl !== (window.location.pathname + window.location.search + window.location.hash)) {
      history.replaceState(null, '', nextUrl);
    }
  }

  function rowMatchesSelection(row, selectedTags) {
    if (!selectedTags.length) {
      return true;
    }
    var rowTags = String(row.getAttribute('data-post-tags') || '')
      .split(',')
      .map(function (tag) { return String(tag || '').trim(); })
      .filter(Boolean);
    return selectedTags.every(function (tag) {
      return rowTags.indexOf(tag) !== -1;
    });
  }

  function applyTagSelection() {
    var selectedTags = currentSelectedTags();
    var buttons = content.querySelectorAll('.tag-cloud [data-tag]');
    buttons.forEach(function (button) {
      var tag = String(button.getAttribute('data-tag') || '').trim();
      var active = selectedTags.indexOf(tag) !== -1;
      button.classList.toggle('tag-selected', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    var rows = content.querySelectorAll('.tag-result-item');
    var visibleCount = 0;
    rows.forEach(function (row) {
      var visible = rowMatchesSelection(row, selectedTags);
      row.hidden = !visible;
      if (visible) {
        visibleCount += 1;
      }
    });

    var empty = content.querySelector('.tag-results-empty');
    if (empty) {
      empty.hidden = visibleCount > 0;
    }
  }

  function updateSelectionFromButton(button, additive) {
    var tag = String(button && button.getAttribute('data-tag') || '').trim();
    if (!tag) {
      return;
    }
    var selectedTags = currentSelectedTags();
    var index = selectedTags.indexOf(tag);
    if (!additive) {
      if (selectedTags.length === 1 && index !== -1) {
        setSelectedTags([]);
      } else {
        setSelectedTags([tag]);
      }
      applyTagSelection();
      return;
    }
    if (index === -1) {
      selectedTags.push(tag);
    } else {
      selectedTags.splice(index, 1);
    }
    setSelectedTags(selectedTags);
    applyTagSelection();
  }

  content.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('.tag-cloud [data-tag]') : null;
    if (!button) {
      return;
    }
    event.preventDefault();
    updateSelectionFromButton(button, !!event.shiftKey);
  });

  window.addEventListener('hashchange', applyTagSelection);

  if (
    content.querySelector('.tag-cloud') ||
    content.querySelector('.tag-results-list') ||
    /No tags found yet\./.test(String(content.textContent || ''))
  ) {
    applyTagSelection();
    window.__wizardryNotifyInitialContentPainted('tags', {
      markPageReady: true
    });
    return;
  }

  window.__wizardryLoadPublicPageFragment({
    endpoint: '/cgi/blog-tags',
    contentNode: content,
    slug: 'tags',
    markPageReady: true,
    consoleLabel: 'Tags page',
    fallbackText: 'Tags are still loading. The latest tag data was not available yet.',
    emptyMessage: 'Tags returned no content.',
    afterRender: function () {
      applyTagSelection();
    }
  });
})();
