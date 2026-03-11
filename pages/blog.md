---
title: Blog
---

<section id="blog-page-root" class="blog-page" aria-live="polite">
<div class="blog-toolbar">
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
<div id="blog-result-summary" class="blog-result-summary" aria-live="polite"></div>
</div>

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
</section>

<script src="/static/blog-page.js"></script>
