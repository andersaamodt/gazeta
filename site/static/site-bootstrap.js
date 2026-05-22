(function () {
  var bootstrap = {
    config: {
      site_title: "Anders' Blog",
      append_site_title_to_page_title: false,
      theme: "lapidarist",
      plugins: {"nostr_support":true,"nostr_login":true,"nostr_bridge":true,"nostr_posts":true,"zaps":true,"btcpay":true,"video_chat":true,"overworld":false},
      video_chat: {"participant_limit":6,"token_ttl_seconds":3600,"janus_wss":"","signaling_wss":"","public_rooms":false,"rooms":["Lobby"],"include_syntax":"{{video-chat}}"}
    },
    navbar_pages: [{"slug":"blog","title":"Blog","path":"/blog","type":"blog","kind":30023}],
    footer_pages: []
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
