---
title: Blog
---

<section id="blog-page-root" class="blog-page" aria-live="polite">
<div class="blog-toolbar">
<button id="blog-filter-toggle" type="button" class="blog-filter-toggle" aria-expanded="false" aria-controls="blog-filter-panel">Filter</button>
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
