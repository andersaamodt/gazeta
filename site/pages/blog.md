---
title: Blog
---

<section id="blog-page-root" class="blog-page" data-blog-slug="blog" data-page-type="blog" aria-live="polite">
<div class="blog-layout">
<div class="blog-filter-column">
<button id="blog-filter-toggle" type="button" class="blog-filter-toggle unobtrusive-icon-button" aria-expanded="false" aria-controls="blog-filter-panel" aria-label="Filter posts" title="Filter posts">
<svg class="blog-filter-icon" viewBox="0 0 16 16" aria-hidden="true">
<line x1="2" y1="3" x2="14" y2="3"></line>
<circle cx="6" cy="3" r="1.25"></circle>
<line x1="2" y1="8" x2="14" y2="8"></line>
<circle cx="10.5" cy="8" r="1.25"></circle>
<line x1="2" y1="13" x2="14" y2="13"></line>
<circle cx="4.5" cy="13" r="1.25"></circle>
</svg>
</button>
</div>
<div class="blog-main-column">
<div class="list-page-head">
<h1 id="blog-page-title" hidden></h1>
<p id="blog-page-description" class="muted" hidden></p>
</div>
<div id="blog-page-admin" class="list-admin" hidden></div>
<div id="blog-page-validation" class="list-validation" hidden></div>
<div id="blog-page-content" class="list-page-content" hidden></div>
<div id="blog-filter-panel" class="blog-filter-panel" hidden>
<div class="blog-filter-grid">
<div class="blog-filter-group">
<h3>Tags</h3>
<div id="blog-filter-tags" class="blog-filter-options"></div>
</div>
<div class="blog-filter-group">
<h3>Year</h3>
<div id="blog-filter-years" class="blog-filter-options"></div>
</div>
<div class="blog-filter-group">
<h3>Type</h3>
<div id="blog-filter-types" class="blog-filter-options"></div>
</div>
</div>
<div class="blog-filter-footer">
<button id="blog-clear-filters" type="button" class="blog-clear-filters">Clear filters</button>
</div>
</div>

<div id="blog-post-list" class="post-list"></div>
<p id="blog-empty" class="placeholder" hidden>No posts match these filters.</p>
</div>
</div>
</section>

<script src="/static/nostr-page-bootstrap/blog.js"></script>
<script src="/static/compose-shared.js?v=20260403-compose1"></script>
<script src="/static/blog-page.js?v=20260523-byline-bottom1"></script>
