(function () {
  'use strict';

  var root = document.getElementById('archive-page-root');
  if (!root) {
    return;
  }

  var content = document.getElementById('archive-page-content');
  if (!content) {
    return;
  }

  if (content.querySelector('.archive-list') || /No published posts yet\./.test(String(content.textContent || ''))) {
    window.__wizardryNotifyInitialContentPainted('archive', {
      markPageReady: true
    });
    return;
  }

  window.__wizardryLoadPublicPageFragment({
    endpoint: '/cgi/blog-archive',
    contentNode: content,
    slug: 'archive',
    markPageReady: true,
    consoleLabel: 'Archive page',
    fallbackText: 'Archive entries are still loading. The latest archive data was not available yet.',
    emptyMessage: 'Archive returned no content.'
  });
})();
