---
title: "Video Chat"
published_at: "2026-03-27T00:00:00Z"
content_hash: ""
tags: ["video-chat", "embed"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

<section id="video-chat-embed-root" class="video-chat-embed-shell" data-page-type="video-chat-embed" aria-live="polite">
<h1>Video Chat</h1>
<div data-video-chat
  data-video-chat-token-endpoint="/cgi/blog-video-chat-token"
  data-video-chat-room-policy="open"
  data-video-chat-max-participants="6"
  data-video-chat-allow-join-link="true"></div>
</section>

<style>
body:has(#video-chat-embed-root) nav.site-nav,
body:has(#video-chat-embed-root) footer.site-footer,
body:has(#video-chat-embed-root) .site-footer-links {
  display: none !important;
}

body:has(#video-chat-embed-root) main {
  max-width: 100%;
  margin: 0;
  padding: 0.5rem;
}

#video-chat-embed-root {
  max-width: 58rem;
  margin: 0 auto;
  padding: 0.25rem;
}

#video-chat-embed-root h1 {
  margin: 0 0 0.6rem;
  font-size: 1.2rem;
}
</style>

<script src="/static/video-chat-widget.js?v=20260523-contact-headings1"></script>
