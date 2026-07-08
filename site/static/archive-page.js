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
