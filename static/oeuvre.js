(function () {
  'use strict';

  if (window.__wizardryLegacyOeuvreLoaderMounted) {
    return;
  }
  window.__wizardryLegacyOeuvreLoaderMounted = true;

  if (window.__wizardryLegacyOeuvreListPageInjected) {
    return;
  }
  window.__wizardryLegacyOeuvreListPageInjected = true;

  var script = document.createElement('script');
  script.src = '/static/list-page.js?v=20260326-pagefix5';
  script.async = false;
  (document.head || document.documentElement).appendChild(script);
})();
