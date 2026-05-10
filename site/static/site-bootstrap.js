(function () {
  var bootstrap = {
    config: {
      site_title: "Anders' Blog",
      append_site_title_to_page_title: false,
      theme: "lapidarist",
      plugins: {"nostr_support":true,"nostr_login":true,"nostr_bridge":true,"nostr_posts":true,"zaps":true,"btcpay":true,"video_chat":false}
    },
    navbar_pages: [{"slug":"index","title":"Writing","path":"/","type":"blog","kind":30023},{"slug":"blog","title":"Blog","path":"/blog","type":"blog","kind":30023},{"slug":"oeuvre","title":"Oeuvre","path":"/oeuvre","type":"list","kind":30004},{"slug":"projects","title":"Projects","path":"/projects","type":"public-ranking","kind":30040},{"slug":"reading-list","title":"Reading list","path":"/reading-list","type":"public-ranking","kind":30040},{"slug":"software","title":"Software","path":"/software","type":"icon-gallery","kind":30004},{"slug":"contact","title":"Contact","path":"/contact","type":"contact","kind":0}],
    footer_pages: [{"slug":"values","title":"Values","path":"/values"},{"slug":"get-info","title":"Site Info","path":"/get-info"}]
  };
  window.__wizardrySiteBootstrap = bootstrap;
  try {
    localStorage.setItem('wizardry_blog_site_title_v1', bootstrap.config.site_title || 'Site');
    localStorage.setItem('wizardry_blog_append_site_title_to_page_title_v1', bootstrap.config.append_site_title_to_page_title ? '1' : '0');
    localStorage.setItem('wizardry_blog_theme_v1', bootstrap.config.theme || 'archmage');
    localStorage.setItem('wizardry_plugins_v1', JSON.stringify(bootstrap.config.plugins || {}));
    localStorage.setItem('cached_navbar_pages_v1', JSON.stringify(bootstrap.navbar_pages || []));
    localStorage.setItem('cached_footer_pages_v1', JSON.stringify(bootstrap.footer_pages || []));
  } catch (_err) {
    // Ignore storage failures.
  }
})();
