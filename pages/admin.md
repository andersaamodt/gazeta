---
title: Blog Admin
---

<div id="admin-access-message" class="admin-access-message" hidden></div>

<div id="admin-panel" class="admin-layout" style="display:none;">
<aside class="admin-sidebar">
<div class="admin-nav-title">Admin</div>
<div class="admin-nav-list" role="tablist" aria-label="Admin sections">
<button type="button" class="admin-nav-item is-compose" data-admin-nav="compose" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 18L7.2 13.8L15.8 5.2a2 2 0 1 1 2.8 2.8L10 16.6L6 18Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 21H19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span><span class="admin-nav-label">Compose</span></button>
<button type="button" class="admin-nav-item" data-admin-nav="drafts" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Drafts <span id="admin-nav-drafts-count" class="admin-nav-count">(0)</span></span></button>
<button type="button" class="admin-nav-item" data-admin-nav="queue" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Queue <span id="admin-nav-queue-count" class="admin-nav-count">(0)</span></span></button>
<button type="button" class="admin-nav-item admin-nav-divider-after" data-admin-nav="posts" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Posts <span id="admin-nav-posts-count" class="admin-nav-count">(0)</span></span></button>
<button type="button" class="admin-nav-item" data-admin-nav="account" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Account</span></button>
<button type="button" class="admin-nav-item" data-admin-nav="users" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Users</span></button>
<button type="button" class="admin-nav-item" data-admin-nav="nostr-pages" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Nostr Pages</span></button>
<button type="button" class="admin-nav-item is-active" data-admin-nav="settings" aria-selected="true"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Site Settings</span></button>
<button type="button" class="admin-nav-item" data-admin-nav="nostr-bridge" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Nostr Bridge</span></button>
</div>
</aside>

<div class="admin-content">
<section class="admin-section is-active" data-admin-section="settings">
<div class="demo-box admin-card">
<div class="section-head">
<h3>Site Settings</h3>
</div>

<div class="settings-stack">
<section class="sub-card">
<div class="field-row">
<label for="site-title" title="Public title shown in your blog header and feeds."><strong title="Public title shown in your blog header and feeds.">Site Title</strong></label>
<input type="text" id="site-title" placeholder="My Blog" title="Public title shown in your blog header and feeds.">
</div>
<div class="field-row">
<label for="admin-theme" title="Visual theme for your public site and admin interface accents."><strong title="Visual theme for your public site and admin interface accents.">Theme</strong></label>
<select id="admin-theme" title="Visual theme for your public site and admin interface accents.">
<option value="adept">Adept</option>
<option value="alchemist">Alchemist</option>
<option value="archmage">Archmage</option>
<option value="chronomancer">Chronomancer</option>
<option value="conjurer">Conjurer</option>
<option value="druid">Druid</option>
<option value="empath">Empath</option>
<option value="enchanter">Enchanter</option>
<option value="geomancer">Geomancer</option>
<option value="hermeticist">Hermeticist</option>
<option value="hierophant">Hierophant</option>
<option value="illusionist">Illusionist</option>
<option value="lapidarist">Lapidarist</option>
<option value="lich">Lich</option>
<option value="necromancer">Necromancer</option>
<option value="pyromancer">Pyromancer</option>
<option value="seer">Seer</option>
<option value="shaman">Shaman</option>
<option value="sorcerer">Sorcerer</option>
<option value="sorceress">Sorceress</option>
<option value="technomancer">Technomancer</option>
<option value="thaumaturge">Thaumaturge</option>
<option value="thelemite">Thelemite</option>
<option value="theurgist">Theurgist</option>
<option value="wadjet">Wadjet</option>
<option value="warlock">Warlock</option>
<option value="wizard">Wizard</option>
</select>
</div>
<div class="field-row checkbox-row">
<div class="setting-label" title="Allow new users to register with a Nostr key. Disable for single-author blogs.">
<strong title="Allow new users to register with a Nostr key. Disable for single-author blogs.">Enable User Registration</strong>
<span class="inline-tip" tabindex="0" aria-label="Allow new users to create accounts by signing in with a Nostr key.">?</span>
</div>
<label class="checkbox-control" for="registration-enabled" title="Allow new users to register with a Nostr key. Disable for single-author blogs.">
<input type="checkbox" id="registration-enabled" title="Allow new users to register with a Nostr key. Disable for single-author blogs.">
<span title="Allow new users to register with a Nostr key. Disable for single-author blogs.">Enabled</span>
</label>
</div>
<div class="field-row checkbox-row">
<div class="setting-label" title="When enabled, newly registered accounts are granted admin rights automatically.">
<strong title="When enabled, newly registered accounts are granted admin rights automatically.">Newly Created Accounts Are Admins</strong>
<span class="inline-tip" tabindex="0" aria-label="When enabled, newly registered Nostr accounts are granted admin automatically. Turn this off after bootstrapping your initial admin team.">?</span>
</div>
<label class="checkbox-control" for="new-users-are-admins" title="When enabled, newly registered accounts are granted admin rights automatically.">
<input type="checkbox" id="new-users-are-admins" title="When enabled, newly registered accounts are granted admin rights automatically.">
<span title="When enabled, newly registered accounts are granted admin rights automatically.">Enabled</span>
</label>
</div>
</section>

<section class="sub-card sub-card-feeds">
<h4>Feeds</h4>
<div class="grid-two">
<div class="field-row checkbox-row">
<div class="setting-label" title="RSS and Atom feeds are always on. This only controls full text versus a shorter/truncated item in each feed entry.">
<strong title="RSS and Atom feeds are always on. This only controls full text versus a shorter/truncated item in each feed entry.">Full Text RSS/Atom</strong>
</div>
<label class="checkbox-control" for="feed-full-text" title="RSS and Atom feeds are always on. This only controls full text versus a shorter/truncated item in each feed entry.">
<input type="checkbox" id="feed-full-text" checked title="RSS and Atom feeds are always on. This only controls full text versus a shorter/truncated item in each feed entry.">
<span title="RSS and Atom feeds are always on. This only controls full text versus a shorter/truncated item in each feed entry.">Enabled</span>
</label>
</div>
<div class="field-row">
<label for="feed-items" title="Maximum number of recent posts included in RSS and Atom feeds."><strong title="Maximum number of recent posts included in RSS and Atom feeds.">Feed Item Count</strong></label>
<input type="number" id="feed-items" min="1" step="1" value="50" title="Maximum number of recent posts included in RSS and Atom feeds.">
</div>
</div>
</section>
</div>

<div id="output-config" class="output"></div>
</div>
</section>

<section class="admin-section" data-admin-section="nostr-bridge" hidden>
<div class="demo-box admin-card">
<div class="section-head">
<h3>Nostr Bridge</h3>
</div>

<div class="settings-stack">
<section class="sub-card">
<h4>Bridge</h4>
<div class="field-row checkbox-row">
<label class="checkbox-control checkbox-control-plain" for="nostr-bridge-enabled" title="Turn Nostr bridge on or off for this site.">
<input type="checkbox" id="nostr-bridge-enabled" title="Turn Nostr bridge on or off for this site.">
<span title="Turn Nostr bridge on or off for this site.">Enable Nostr Bridge</span>
</label>
</div>
<div class="field-row">
<label for="nostr-relays" title="Relays used for mirror fetch and Nostr bridge transport. Use one relay URL per line."><strong title="Relays used for mirror fetch and Nostr bridge transport. Use one relay URL per line.">Relay List</strong></label>
<div class="bridge-textarea-wrap">
<textarea id="nostr-relays" class="bridge-textarea" rows="4" placeholder="wss://relay.damus.io&#10;wss://relay.primal.net" title="Relays used for mirror fetch and Nostr bridge transport. Use one relay URL per line."></textarea>
<div id="nostr-relays-save-status" class="autosave-indicator bridge-save-indicator" hidden></div>
</div>
</div>
<div class="field-row">
<label for="nostr-blocklist" title="Blocked pubkeys excluded from mirrored comments and derived content. Use one pubkey per line."><strong title="Blocked pubkeys excluded from mirrored comments and derived content. Use one pubkey per line.">Blocked Pubkeys</strong></label>
<div class="bridge-textarea-wrap">
<textarea id="nostr-blocklist" class="bridge-textarea" rows="4" placeholder="hexpubkey_to_block" title="Blocked pubkeys excluded from mirrored comments and derived content. Use one pubkey per line."></textarea>
<div id="nostr-blocklist-save-status" class="autosave-indicator bridge-save-indicator" hidden></div>
</div>
</div>
</section>
</div>

<p class="muted">These settings are stored in <code>&lt;site-name&gt;/nostr/state/</code> as <code>authors</code>, <code>relays</code>, and <code>blocklist</code>.</p>

<div id="output-nostr-bridge" class="output"></div>
</div>
</section>

<section class="admin-section" data-admin-section="users" hidden>
<div class="demo-box admin-card">
<div class="section-head">
<h3>Users</h3>
</div>
<div id="users-list" class="users-list"></div>
<div id="output-users" class="output"></div>
</div>
</section>

<section class="admin-section" data-admin-section="compose" hidden>
<div class="demo-box admin-card compose-shell">
<div class="composer-head">
<div>
<h3>Compose</h3>
</div>
<div class="composer-head-actions">
<button type="button" id="btn-toggle-preview" class="quiet-toggle" aria-pressed="true" aria-label="Hide preview" title="Hide preview">
<svg class="preview-icon preview-icon-visible" viewBox="0 0 24 24" fill="none" aria-hidden="true">
<path d="M2.5 12C4.7 8 8.1 6 12 6C15.9 6 19.3 8 21.5 12C19.3 16 15.9 18 12 18C8.1 18 4.7 16 2.5 12Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
</svg>
<svg class="preview-icon preview-icon-hidden" viewBox="0 0 24 24" fill="none" aria-hidden="true">
<path d="M3.2 4.2L20.8 19.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<path d="M9.9 6.4C10.6 6.1 11.3 6 12 6C15.9 6 19.3 8 21.5 12C20.8 13.3 19.9 14.5 18.9 15.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14.1 17.6C13.4 17.9 12.7 18 12 18C8.1 18 4.7 16 2.5 12C3.2 10.7 4.1 9.5 5.1 8.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M12 9C13.7 9 15 10.3 15 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
</svg>
<span class="sr-only">Toggle preview</span>
</button>
</div>
</div>

<div class="composer-grid">
<div class="compose-editor">
<div class="field-row">
<label for="post-title"><strong>Post Title</strong></label>
<input type="text" id="post-title" placeholder="My post">
</div>

<div class="field-row">
<label for="post-content"><strong>Content</strong></label>
<div class="editor-shell">
<div class="toolbar" aria-label="Markdown toolbar">
<button type="button" data-toolbar="bold" aria-label="Bold" title="Bold">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none"><path d="M8 5H13.2C15.3 5 17 6.7 17 8.8C17 10.9 15.3 12.6 13.2 12.6H8V5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 12.4H14.1C16.3 12.4 18 14.1 18 16.3C18 18.4 16.3 20 14.1 20H8V12.4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
<span class="sr-only">Bold</span>
</button>
<button type="button" data-toolbar="italic" aria-label="Italic" title="Italic">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none"><path d="M14 4H10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 20H8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 4L10 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
<span class="sr-only">Italic</span>
</button>
<button type="button" data-toolbar="h2" aria-label="Heading 2" title="Heading 2">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none"><path d="M3 6V18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 6V18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><text x="14.2" y="16.4" font-size="9.5" font-family="ui-sans-serif, system-ui, sans-serif" fill="currentColor">2</text></svg>
<span class="sr-only">Heading 2</span>
</button>
<button type="button" data-toolbar="h3" aria-label="Heading 3" title="Heading 3">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none"><path d="M3 6V18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 6V18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><text x="14.2" y="16.4" font-size="9.5" font-family="ui-sans-serif, system-ui, sans-serif" fill="currentColor">3</text></svg>
<span class="sr-only">Heading 3</span>
</button>
<button type="button" data-toolbar="code" aria-label="Inline code" title="Inline code">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none"><path d="M9 7L4 12L9 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 7L20 12L15 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
<span class="sr-only">Inline code</span>
</button>
<button type="button" data-toolbar="code_block" aria-label="Code block" title="Code block">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none"><path d="M8 6L5 12L8 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 6L19 12L16 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4L10 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
<span class="sr-only">Code block</span>
</button>
<button type="button" data-toolbar="link" aria-label="Insert link" title="Insert link">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none"><path d="M10 8L8 10C6.9 11.1 6.9 12.9 8 14C9.1 15.1 10.9 15.1 12 14L14 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 8L16 6C17.1 4.9 18.9 4.9 20 6C21.1 7.1 21.1 8.9 20 10L18 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" transform="translate(-4 4)"/><path d="M9 12H15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
<span class="sr-only">Insert link</span>
</button>
<button type="button" data-toolbar="quote" aria-label="Quote" title="Quote">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none"><path d="M7 10H11V14H8.6C8.7 15 9.2 15.7 10.1 16.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 10H18V14H15.6C15.7 15 16.2 15.7 17.1 16.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
<span class="sr-only">Quote</span>
</button>
<button type="button" data-toolbar="ul" aria-label="Bullet list" title="Bullet list">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="7" r="1.5" fill="currentColor"/><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="5" cy="17" r="1.5" fill="currentColor"/><path d="M10 7H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 12H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
<span class="sr-only">Bullet list</span>
</button>
<button type="button" data-toolbar="ol" aria-label="Numbered list" title="Numbered list">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none"><text x="2.4" y="9.2" font-size="7.3" font-family="ui-sans-serif, system-ui, sans-serif" fill="currentColor">1</text><text x="2.2" y="18.2" font-size="7.3" font-family="ui-sans-serif, system-ui, sans-serif" fill="currentColor">2</text><path d="M10 7H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
<span class="sr-only">Numbered list</span>
</button>
<button type="button" data-toolbar="image" aria-label="Insert image" title="Insert image">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.6" fill="currentColor"/><path d="M5.5 17L11.5 11L14.5 14L17.5 11L20.5 14.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
<span class="sr-only">Insert image</span>
</button>
</div>
<textarea id="post-content" rows="16" placeholder="# Write in Markdown\n\nDrop images anywhere on this page to upload + insert."></textarea>
<div id="autosave-status" class="autosave-indicator" hidden></div>
</div>
</div>

<div class="grid-two">
<div class="field-row">
<label for="post-tags"><strong>Tags</strong></label>
<input type="hidden" id="post-tags" value="">
<div id="post-tags-editor" class="tag-editor" role="group" aria-label="Post tags">
<div id="post-tags-pills" class="tag-editor-pills"></div>
<input type="text" id="post-tags-input" class="tag-editor-input" placeholder="tag, tag, tag">
</div>
</div>
</div>

<div class="field-row compose-release-row">
<strong>Release Mode</strong>
<div class="mode-row">
<label><input type="radio" name="publish-mode" value="immediate" checked> Immediate</label>
<label><input type="radio" name="publish-mode" value="scheduled"> Scheduled Date</label>
<label><input type="radio" name="publish-mode" value="drip"> Drip Queue <span id="drip-queue-pill" class="drip-queue-pill" hidden></span></label>
</div>
</div>

<div class="field-row scheduled-row is-hidden" id="scheduled-row">
<label for="post-scheduled-at"><strong>Scheduled Release Date/Time</strong></label>
<input type="datetime-local" id="post-scheduled-at">
</div>

<input type="file" id="image-picker" accept="image/*" multiple style="display:none;">
</div>

<aside class="preview-panel">
<h4>Live Preview</h4>
<div id="markdown-preview" class="preview-box">
<p class="placeholder">Preview will appear here...</p>
</div>
</aside>
</div>

<div class="compose-footer">
<div class="compose-actions">
<button id="btn-delete-current" type="button" class="icon-danger" aria-label="Delete draft" title="Delete draft">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>
</svg>
</button>
<button id="btn-publish-now" type="button" class="primary">Publish Now</button>
</div>

<div id="output-compose" class="output"></div>
</div>
</div>
</section>

<section class="admin-section" data-admin-section="drafts" hidden>
<div class="demo-box admin-card">
<div class="row-head">
<div>
<h3>Drafts</h3>
</div>
</div>
<div id="drafts-list"></div>
</div>
</section>

<section class="admin-section" data-admin-section="queue" hidden>
<div class="demo-box admin-card">
<div class="row-head">
<div>
<h3>Queue</h3>
<p class="muted">See what will publish next. Drip runs locally while an admin tab stays open.</p>
</div>
<div class="row-actions">
<div id="queue-local-drip-status" class="queue-local-drip-status" hidden>
<span class="queue-local-drip-spinner" aria-hidden="true"></span>
<span id="queue-local-drip-status-text">Local drip running. Keep this tab open.</span>
</div>
<button id="btn-local-drip-toggle" type="button" class="icon-toggle local-drip-toggle" aria-label="Pause local drip" title="Pause local drip" aria-pressed="true">
<svg class="local-drip-icon local-drip-icon-pause" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<path d="M8 5V19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<path d="M16 5V19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
<svg class="local-drip-icon local-drip-icon-play" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<path d="M7 5L19 12L7 19V5Z" fill="currentColor"/>
</svg>
</button>
<button id="btn-mirror-nostr" type="button" title="Fetch events from configured Nostr relays and update local derived content.">Sync from Nostr</button>
<button id="btn-run-scheduler" type="button" class="primary">Drip Now</button>
</div>
</div>
<div class="grid-two settings-inline queue-drip-settings">
<div class="field-row">
<label for="drip-interval" title="How often queued drip posts are published."><strong title="How often queued drip posts are published.">Drip Interval</strong></label>
<input type="number" id="drip-interval" min="0.1" step="0.1" value="4" title="How often queued drip posts are published.">
<span class="field-unit">hours</span>
</div>
<div class="field-row">
<label for="drip-randomness" title="Adds up to this many random minutes to each drip cycle time."><strong title="Adds up to this many random minutes to each drip cycle time.">Drip Randomness</strong></label>
<input type="number" id="drip-randomness" min="0" step="1" value="0" title="Adds up to this many random minutes to each drip cycle time.">
<span class="field-unit">minutes</span>
</div>
</div>
<div id="queue-list"></div>
<div id="output-queue" class="output"></div>
</div>
</section>

<section class="admin-section" data-admin-section="posts" hidden>
<div class="demo-box admin-card">
<div class="row-head">
<div>
<h3>Posts</h3>
</div>
</div>
<div id="posts-list" class="posts-list"></div>
<div id="output-posts" class="output"></div>
</div>
</section>

<section class="admin-section" data-admin-section="nostr-pages" hidden>
<div class="demo-box admin-card">
<div class="row-head">
<div>
<h3>Nostr Pages</h3>
<p class="muted">Create and manage locally-routed pages backed by Nostr events. Titles come from event content.</p>
</div>
<div class="row-actions">
<button id="btn-create-nostr-page" type="button" class="primary">Create New Nostr Page</button>
</div>
</div>
<div id="nostr-pages-list" class="nostr-pages-list"></div>
<div id="output-nostr-pages" class="output"></div>
</div>
</section>

<section class="admin-section" data-admin-section="account" hidden>
<div class="demo-box admin-card">
<div class="row-head">
<div>
<h3>Account</h3>
<p class="muted">Your account is Nostr-based. You can bind a passkey and link an SSH key for MUD compatibility.</p>
</div>
</div>

<div class="field-row">
<label for="account-nostr-pubkey"><strong>Nostr Pubkey</strong></label>
<div class="account-row account-nostr-row">
<div class="account-pubkey-field">
<input type="text" id="account-nostr-pubkey" readonly>
<button id="btn-account-pubkey-copy" type="button" class="unobtrusive-icon-button" aria-label="Copy Nostr pubkey" title="Copy Nostr pubkey">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<path d="M9 9H19V19H9V9Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
<path d="M5 15H4.8C3.8 15 3 14.2 3 13.2V4.8C3 3.8 3.8 3 4.8 3H13.2C14.2 3 15 3.8 15 4.8V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
</button>
</div>
<button id="btn-account-pubkey-toggle" type="button">Show</button>
</div>
<p class="muted account-note">This key is account-bound and cannot be edited directly.</p>
</div>

<div class="field-row">
<label for="account-player-name"><strong>Player Name</strong></label>
<div class="account-row">
<input type="text" id="account-player-name" placeholder="Your name">
<button id="btn-save-account" type="button" class="primary">Save</button>
</div>
</div>

<div class="field-row account-passkey-row">
<label><strong>Passkey</strong></label>
<div class="account-row">
<button id="btn-bind-passkey" type="button">Bind passkey</button>
</div>
</div>

<details class="account-ssh-optional">
<summary>SSH key for MUD and terminal login</summary>
<p class="muted account-ssh-description">Link your SSH public key for terminal access.</p>
<div class="field-row">
<label for="account-ssh-public-key"><strong>SSH Public Key</strong></label>
<textarea id="account-ssh-public-key" rows="3" placeholder="ssh-ed25519 AAAA..."></textarea>
<div class="account-row">
<button id="btn-generate-ssh" type="button">Generate SSH Key Pair (Browser)</button>
<button id="btn-link-ssh" type="button">Link SSH Key</button>
</div>
<p class="muted">When generated in-browser, private key download starts locally. Keep it secret and back it up.</p>
</div>
</details>

<div class="field-row account-output-row">
<div id="output-account" class="output"></div>
</div>
</div>
</section>
</div>
</div>

<dialog id="nostr-page-create-dialog" class="admin-inline-dialog" aria-labelledby="nostr-page-create-title">
<form id="nostr-page-create-form" method="dialog" class="admin-inline-dialog-form">
<h4 id="nostr-page-create-title">Create New Nostr Page</h4>
<div class="field-row">
<label for="nostr-page-type-listbox"><strong>Page Type</strong></label>
<select id="nostr-page-type-listbox" size="2" aria-label="Page type listbox">
<option value="list">List Page (kind 30001)</option>
<option value="contact">Contact Page (kind 0)</option>
</select>
</div>
<div class="field-row">
<label for="nostr-page-slug-input"><strong>Page slug/path</strong></label>
<input type="text" id="nostr-page-slug-input" placeholder="oeuvre">
</div>
<div class="admin-inline-dialog-actions">
<button id="nostr-page-create-cancel" type="button">Cancel</button>
<button id="nostr-page-create-confirm" type="submit" class="primary">Create</button>
</div>
</form>
</dialog>

<div id="drop-overlay" class="drop-overlay">Drop images to upload and insert into your draft</div>

<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
<script src="/static/admin.js"></script>

<style>
body {
  max-width: none;
  margin: 0;
  padding: 0 0 2rem;
}

.admin-access-message {
  margin: 0.15rem 0 1rem;
  padding: 0.72rem 0.9rem;
  border-radius: 12px;
  border: 1px solid #d8deec;
  font-size: 0.93rem;
  line-height: 1.4;
}

.admin-access-message.is-warn {
  background: #fff8e1;
  border-color: #f9a825;
  color: #7c5a00;
}

.admin-access-message.is-error {
  background: #ffebee;
  border-color: #e53935;
  color: #8f1316;
}

.admin-layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
  min-height: calc(100vh - 3.25rem);
}

.admin-sidebar {
  position: static;
  border: 0;
  border-right: 1px solid #c7d6f3;
  border-radius: 0;
  background: #ffffff;
  box-shadow: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 3.25rem);
  align-self: stretch;
  width: 100%;
  box-sizing: border-box;
}

.admin-nav-list {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  overflow: visible;
  background: #ffffff;
  width: 100%;
  box-sizing: border-box;
}

.admin-nav-title {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0.5rem 0.22rem;
  border-bottom: 1px solid #d7e1f4;
  background: #f4f6fa;
  color: #2a3650;
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.01em;
  text-align: center;
}

.admin-nav-item {
  display: flex;
  align-items: center;
  gap: 0.38rem;
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  text-align: left;
  border: 0;
  border-radius: 0;
  border-bottom: 0;
  background: transparent;
  color: #1e2d4e;
  margin: 0;
  padding: 0.56rem 0.22rem;
  font-size: 0.93rem;
  font-weight: 500;
  line-height: 1.25;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.admin-nav-icon-slot {
  width: 1rem;
  min-width: 1rem;
  height: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #2d4f8d;
  flex: 0 0 1rem;
}

.admin-nav-icon-slot svg {
  width: 1rem;
  height: 1rem;
}

.admin-nav-label {
  display: inline-block;
}

.admin-nav-item.admin-nav-divider-after {
  border-bottom: 0;
  margin-bottom: 0;
}

.admin-nav-item.is-compose {
  background: #f2f7ff;
}

.admin-nav-item.is-compose:hover {
  background: #e9f1ff;
}

.admin-nav-item:hover {
  background: #e9f1ff;
  color: #153878;
}

.admin-nav-item.is-active {
  background: #e9f1ff;
  color: #153878;
  box-shadow: none;
  cursor: default;
}

.admin-nav-item[aria-selected="true"],
.admin-nav-item[aria-current="page"] {
  background: #e9f1ff;
  color: #153878;
  box-shadow: none;
  font-weight: 500;
}

#admin-panel .admin-nav-list .admin-nav-item {
  width: 100% !important;
  display: flex !important;
  align-items: center !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  margin: 0 !important;
}

#admin-panel .admin-nav-list .admin-nav-item.admin-nav-divider-after {
  position: relative !important;
  padding-bottom: 0.56rem !important;
  margin-bottom: 0 !important;
}

#admin-panel .admin-nav-list .admin-nav-item.admin-nav-divider-after::after {
  content: "";
  position: absolute;
  left: 0.82rem;
  right: 0.82rem;
  bottom: -1px;
  border-bottom: 1px solid #d0dbf2;
  pointer-events: none;
}

#admin-panel .admin-nav-list .admin-nav-item:hover {
  border: 0 !important;
  background: #e9f1ff !important;
  color: #153878 !important;
  transform: none !important;
}

#admin-panel .admin-nav-list .admin-nav-item.is-active {
  border: 0 !important;
}

#admin-panel .admin-nav-list .admin-nav-item[aria-selected="true"],
#admin-panel .admin-nav-list .admin-nav-item[aria-current="page"] {
  border: 0 !important;
  background: #e9f1ff !important;
  color: #153878 !important;
  box-shadow: none !important;
  transform: none !important;
  cursor: default !important;
}

#admin-panel .admin-nav-list .admin-nav-item[aria-selected="true"]:hover,
#admin-panel .admin-nav-list .admin-nav-item[aria-current="page"]:hover {
  background: #e9f1ff !important;
  color: #153878 !important;
}

#admin-panel .admin-nav-list .admin-nav-item.is-compose {
  background: #f2f7ff !important;
}

#admin-panel .admin-nav-list .admin-nav-item.is-compose:hover {
  background: #e9f1ff !important;
}

.admin-content {
  --admin-content-pad-left: 0.7rem;
  --admin-content-pad-right: 0.72rem;
  min-width: 0;
  min-height: calc(100vh - 3.25rem);
  padding: 0.45rem var(--admin-content-pad-right) 0 var(--admin-content-pad-left);
  background: #f4f7fd;
}

#admin-panel.account-only {
  grid-template-columns: minmax(0, 1fr);
}

#admin-panel.account-only .admin-sidebar {
  display: none;
}

.admin-section {
  display: none;
}

.admin-section.is-active {
  display: block;
  animation: admin-fade-in 0.2s ease;
}

@keyframes admin-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.demo-box {
  margin: 0;
  padding: 0.62rem 0.7rem 0.8rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.admin-card {
  min-height: 0;
}

.section-head {
  margin-bottom: 0.6rem;
}

.demo-box h3 {
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.22;
  color: #1a2f5a;
}

.demo-box h4 {
  margin: 0 0 0.4rem;
  font-size: 0.96rem;
  line-height: 1.25;
  color: #273f74;
  letter-spacing: 0.01em;
}

.settings-stack {
  display: grid;
  gap: 0.08rem;
}

.sub-card {
  border: 0;
  border-top: 1px solid #d7e1f4;
  border-radius: 0;
  background: transparent;
  padding: 0.14rem 0 0.02rem;
  box-shadow: none;
}

.settings-stack .sub-card:first-child {
  border-top: 0;
  padding-top: 0;
}

.section-actions {
  margin-top: 0.22rem;
}

.field-row {
  margin-bottom: 0.18rem;
}

.field-row:last-child {
  margin-bottom: 0;
}

.field-row label {
  display: block;
  margin-bottom: 0.18rem;
  color: #1f335f;
  font-size: 0.84rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

[data-admin-section="settings"] .field-row {
  display: grid;
  grid-template-columns: minmax(12rem, max-content) minmax(0, 1fr);
  align-items: center;
  gap: 0.04rem 0.44rem;
  margin-bottom: 0.08rem;
}

[data-admin-section="nostr-bridge"] .field-row {
  display: grid;
  gap: 0.24rem;
  margin-bottom: 0.08rem;
}

[data-admin-section="nostr-bridge"] .checkbox-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  flex-wrap: wrap;
}

[data-admin-section="settings"] .field-row > label {
  margin-bottom: 0;
}

[data-admin-section="settings"] .field-row > input,
[data-admin-section="settings"] .field-row > select {
  justify-self: start;
}

[data-admin-section="settings"] .setting-label {
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
  color: #1f335f;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

[data-admin-section="nostr-bridge"] .setting-label {
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
  color: #1f335f;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

[data-admin-section="settings"] .checkbox-row .checkbox-control {
  display: inline-flex;
  align-items: center;
  gap: 0.36rem;
  color: #1d3566;
  font-size: 0.82rem;
  font-weight: 600;
}

[data-admin-section="nostr-bridge"] .checkbox-row .checkbox-control {
  display: inline-flex;
  align-items: center;
  gap: 0.36rem;
  color: #1d3566;
  font-size: 0.82rem;
  font-weight: 600;
  margin-left: 0;
}

[data-admin-section="nostr-bridge"] .checkbox-row .checkbox-control.checkbox-control-plain {
  font-weight: 500;
}

[data-admin-section="nostr-bridge"] .checkbox-row .checkbox-control.checkbox-control-plain span {
  font-weight: 500;
  color: #1f335f;
}

.inline-tip {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  border: 1px solid #a9bde5;
  color: #2a4d90;
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1;
  cursor: help;
  user-select: none;
}

.inline-tip::after {
  content: attr(aria-label);
  position: absolute;
  right: 0;
  top: calc(100% + 0.35rem);
  transform: none;
  background: #102246;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.3;
  padding: 0.35rem 0.45rem;
  border-radius: 7px;
  white-space: normal;
  max-inline-size: min(20rem, calc(100vw - 1.2rem));
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.14s ease;
  z-index: 40;
}

.inline-tip:hover::after,
.inline-tip:focus-visible::after {
  opacity: 1;
}

#admin-panel input[type="text"],
#admin-panel input[type="number"],
#admin-panel input[type="datetime-local"],
#admin-panel select,
#admin-panel textarea {
  inline-size: clamp(12rem, 32vw, 24rem);
  max-inline-size: 100%;
  border: 1px solid #b8caeb;
  border-radius: 9px;
  background: #fff;
  color: #102246;
  font-size: 0.92rem;
  line-height: 1.3;
  padding: 0.46rem 0.62rem;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.05);
}

#admin-panel input[type="checkbox"],
#admin-panel input[type="radio"] {
  accent-color: #2559b7;
}

#admin-panel input:focus,
#admin-panel select:focus,
#admin-panel textarea:focus {
  outline: none;
  border-color: #5b7ed8;
  box-shadow: 0 0 0 3px rgba(91, 126, 216, 0.2);
}

#admin-panel textarea#post-content {
  inline-size: min(100%, 56rem);
  min-height: 390px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.91rem;
  line-height: 1.5;
}

.editor-shell {
  inline-size: min(100%, 56rem);
  border: 1px solid #c9d7f2;
  border-radius: 12px;
  background: #f9fbff;
  overflow: hidden;
  position: relative;
}

.grid-two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem 0.75rem;
}

.settings-inline {
  align-items: end;
}

[data-admin-section="settings"] .grid-two {
  grid-template-columns: 1fr;
  justify-content: start;
}

[data-admin-section="settings"] #site-title {
  inline-size: clamp(11rem, 23vw, 18rem);
}

[data-admin-section="nostr-bridge"] .bridge-textarea {
  inline-size: min(100%, 42rem) !important;
  width: min(100%, 42rem) !important;
  max-inline-size: 100% !important;
  min-height: 5.6rem;
  padding-bottom: 1.95rem !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.86rem;
  line-height: 1.35;
}

[data-admin-section="nostr-bridge"] .bridge-textarea-wrap {
  position: relative;
  inline-size: min(100%, 42rem);
  max-inline-size: 100%;
}

[data-admin-section="nostr-bridge"] .bridge-save-indicator {
  right: 0.72rem;
  bottom: 0.46rem;
  font-size: 0.73rem;
}

[data-admin-section="settings"] #admin-theme {
  inline-size: clamp(8.5rem, 13vw, 10.5rem);
}

[data-admin-section="queue"] #drip-interval,
[data-admin-section="queue"] #drip-randomness,
[data-admin-section="settings"] #feed-items {
  inline-size: 5rem !important;
  width: 5rem !important;
  max-inline-size: 5rem !important;
}

[data-admin-section="settings"] h4 {
  margin-bottom: 0.26rem;
}

[data-admin-section="settings"] .grid-two {
  gap: 0.3rem 0.62rem;
}

[data-admin-section="settings"] .sub-card-feeds .grid-two {
  gap: 0.06rem 0.62rem;
}

[data-admin-section="settings"] .sub-card-feeds .field-row {
  margin-bottom: 0;
}

[data-admin-section="queue"] .queue-drip-settings {
  margin: 0.02rem 0 0.44rem;
  gap: 0.34rem 0.62rem;
}

[data-admin-section="queue"] .queue-drip-settings .field-row {
  margin-bottom: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

[data-admin-section="queue"] .queue-drip-settings .field-row > label {
  margin-bottom: 0;
}

[data-admin-section="queue"] .queue-drip-settings .field-row > input {
  min-height: 1.9rem;
  padding: 0.24rem 0.45rem;
}

[data-admin-section="queue"] .queue-drip-settings .field-unit {
  font-size: 0.83rem;
  font-weight: 500;
  color: #4f5f78;
}

[data-admin-section="queue"] .row-head {
  margin-bottom: 0.34rem;
}

[data-admin-section="queue"] .row-head .muted {
  margin: 0.1rem 0 0;
}

[data-admin-section="settings"] input[type="text"],
[data-admin-section="settings"] input[type="number"],
[data-admin-section="settings"] select {
  font-size: 0.88rem;
  line-height: 1.2;
  padding: 0.34rem 0.56rem;
  min-height: 2.06rem;
  border-radius: 8px;
}

[data-admin-section="account"] #account-player-name {
  inline-size: clamp(12rem, 22vw, 18rem);
}

[data-admin-section="account"] .field-row {
  display: grid;
  grid-template-columns: minmax(9.2rem, max-content) minmax(0, 1fr);
  align-items: center;
  gap: 0.18rem 0.56rem;
}

[data-admin-section="account"] .field-row > label {
  margin-bottom: 0;
}

[data-admin-section="account"] #account-nostr-pubkey,
[data-admin-section="account"] #account-ssh-public-key {
  inline-size: min(100%, 42rem);
}

.account-note {
  margin: 0.28rem 0 0.34rem;
  grid-column: 2;
}

[data-admin-section="account"] #account-nostr-pubkey {
  background: #eef2fb;
  color: #334155;
  border-style: dashed;
  cursor: not-allowed;
  filter: blur(2.2px);
  transition: filter 0.15s ease;
}

[data-admin-section="account"] #account-nostr-pubkey.is-visible {
  filter: none;
}

[data-admin-section="account"] .account-nostr-row {
  align-items: stretch;
  gap: 0.36rem;
}

[data-admin-section="account"] .account-pubkey-field {
  position: relative;
  flex: 1 1 24rem;
  min-width: min(100%, 32rem);
}

[data-admin-section="account"] .account-nostr-row #account-nostr-pubkey {
  min-width: min(100%, 32rem);
  padding-right: 2.2rem;
}

#admin-panel button.unobtrusive-icon-button {
  position: absolute;
  right: 0.34rem;
  top: 50%;
  transform: translateY(-50%);
  min-width: 1.5rem;
  width: 1.5rem;
  height: 1.5rem;
  border: 0;
  background: transparent;
  border-radius: 6px;
  padding: 0;
  color: #5b6f93;
  box-shadow: none;
}

#admin-panel button.unobtrusive-icon-button:hover {
  background: rgba(90, 116, 170, 0.2);
  color: #2f497a;
}

#admin-panel button.unobtrusive-icon-button:focus-visible {
  outline: none;
  background: rgba(90, 116, 170, 0.2);
  box-shadow: 0 0 0 2px rgba(90, 116, 170, 0.22);
}

#admin-panel button.unobtrusive-icon-button svg {
  width: 0.86rem;
  height: 0.86rem;
}

#admin-panel #btn-account-pubkey-toggle {
  min-width: 4.1rem;
}

.account-ssh-optional {
  margin-top: 1.06rem;
}

.account-ssh-description {
  margin: 0.32rem 0 0.42rem;
}

.account-row {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

[data-admin-section="account"] .account-passkey-row {
  display: grid;
  grid-template-columns: minmax(8.5rem, max-content) minmax(0, 1fr);
  align-items: center;
  gap: 0.18rem 0.52rem;
  margin-bottom: 0.76rem;
}

[data-admin-section="account"] .account-passkey-row > label {
  margin-bottom: 0;
}

[data-admin-section="account"] .account-passkey-row .account-row {
  justify-self: start;
}

[data-admin-section="account"] .account-output-row {
  grid-template-columns: 1fr;
}

.composer-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(280px, 1fr);
  gap: 1.05rem;
  align-items: start;
}

.mode-row {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
  margin-top: 0.42rem;
  padding: 0.1rem 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.mode-row label {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.scheduled-row {
  overflow: hidden;
  max-height: 5.5rem;
  opacity: 1;
  transform: translateY(0);
  transition: max-height 0.24s ease, opacity 0.2s ease, transform 0.2s ease, margin 0.2s ease;
}

.scheduled-row.is-hidden {
  max-height: 0;
  opacity: 0;
  transform: translateY(-8px);
  margin: 0;
  pointer-events: none;
}

.toolbar {
  display: flex;
  gap: 0.18rem;
  flex-wrap: wrap;
  margin-bottom: 0;
  padding: 0.28rem 0.34rem;
  border: 0;
  border-bottom: 1px solid #d4e0f5;
  border-radius: 0;
  background: linear-gradient(180deg, #f9fbff 0%, #f2f6ff 100%);
}

.toolbar button {
  width: 2rem;
  min-width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #1e396e;
  font-size: 0.8rem;
  font-weight: 650;
  padding: 0;
  box-shadow: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.toolbar button:hover {
  background: #e8f0ff;
  color: #14356f;
}

.toolbar button:focus-visible {
  outline: 0;
  background: #e8f0ff;
  box-shadow: inset 0 0 0 1px #a9c1f0;
}

.toolbar .tb-icon {
  width: 1rem;
  height: 1rem;
  stroke: currentColor;
  flex: 0 0 auto;
}

.toolbar .sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.editor-shell #post-content {
  border: 0;
  border-radius: 0;
  background: #ffffff;
  box-shadow: none;
  display: block;
  inline-size: 100%;
  padding-bottom: 2.15rem;
}

.editor-shell #post-content:focus {
  box-shadow: none;
}

.editor-shell:focus-within {
  border-color: #5b7ed8;
  box-shadow: 0 0 0 3px rgba(91, 126, 216, 0.18);
}

.autosave-indicator {
  position: absolute;
  right: 0.72rem;
  bottom: 0.45rem;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: #6b778a;
  font-size: 0.75rem;
  font-weight: 560;
  line-height: 1.2;
  z-index: 3;
  cursor: default;
}

.autosave-indicator.is-saving {
  color: #737f90;
}

.autosave-indicator.is-error {
  color: #8a2e2e;
}

.tag-editor {
  inline-size: min(100%, 24rem);
  min-height: 2.2rem;
  border: 1px solid #b8caeb;
  border-radius: 11px;
  background: #fff;
  padding: 0.18rem 0.34rem;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.34rem;
  overflow-x: auto;
  overflow-y: hidden;
}

.tag-editor:focus-within {
  border-color: #5b7ed8;
  box-shadow: 0 0 0 3px rgba(91, 126, 216, 0.2);
}

.tag-editor-pills {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
  overflow: visible;
  gap: 0.3rem;
  flex: 0 1 auto;
  min-width: max-content;
  white-space: nowrap;
}

.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  padding: 0.12rem 0.44rem;
  border-radius: 999px;
  border: 1px solid #c4d3f0;
  background: #edf3ff;
  color: #244a8f;
  font-size: 0.8rem;
  line-height: 1.2;
}

.tag-pill-remove {
  border: 0;
  background: transparent;
  color: #3a5da1;
  border-radius: 999px;
  width: 1rem;
  height: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 0.76rem;
  font-weight: 700;
}

.tag-pill-remove:hover {
  background: rgba(36, 74, 143, 0.12);
  color: #1a3d7c;
}

.tag-editor-input {
  border: 0 !important;
  box-shadow: none !important;
  padding: 0.12rem 0.16rem !important;
  min-width: 7.4rem;
  inline-size: auto !important;
  flex: 1 0 7.4rem;
  width: auto !important;
  background: transparent !important;
  text-align: left !important;
}

#admin-panel .tag-pill-remove {
  border: 0 !important;
  border-radius: 999px !important;
  background: transparent !important;
  padding: 0 !important;
  min-width: 1rem !important;
  width: 1rem !important;
  height: 1rem !important;
  line-height: 1 !important;
}

#admin-panel .tag-editor-input {
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 0.12rem 0.16rem !important;
  inline-size: auto !important;
  min-width: 7.4rem !important;
  width: auto !important;
  flex: 1 0 7.4rem !important;
  text-align: left !important;
}

.tag-editor.has-tags .tag-editor-input::placeholder {
  color: transparent;
}

.compose-editor .grid-two {
  align-items: start;
}

.compose-editor .grid-two .field-row {
  margin-bottom: 0;
}

.button-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 0.52rem;
  margin-top: 0.72rem;
}

.compose-actions {
  margin-top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  inline-size: min(100%, 56rem);
}

.compose-actions #btn-publish-now {
  min-width: 11rem;
}

.compose-footer {
  margin-top: auto;
  padding-top: 0.3rem;
}

.compose-release-row {
  margin-top: 0.54rem;
  margin-bottom: 0.08rem;
}

.drip-queue-pill {
  display: inline-flex;
  align-items: center;
  margin-left: 0.2rem;
  padding: 0.07rem 0.36rem;
  border-radius: 999px;
  border: 1px solid #9eb7eb;
  background: #edf3ff;
  color: #234a93;
  font-size: 0.73rem;
  line-height: 1.2;
  animation: drip-pill-pop 170ms ease;
}

.drip-queue-pill[hidden] {
  display: none !important;
}

@keyframes drip-pill-pop {
  from {
    transform: scale(0.92);
    opacity: 0.65;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

#admin-panel button.icon-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.25rem;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border-radius: 8px;
  border: 1px solid #d7b6b6;
  background: #fff;
  color: #111;
}

#admin-panel button.icon-danger:hover {
  border-color: #c27c7b;
  background: #fff2f2;
  color: #8f2f2d;
}

#admin-panel button {
  border: 1px solid #b8c9ea;
  border-radius: 10px;
  background: #fff;
  color: #183260;
  font-size: 0.88rem;
  font-weight: 650;
  padding: 0.58rem 0.8rem;
  line-height: 1.25;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.15s ease;
}

#admin-panel button:hover {
  background: #eaf2ff;
  border-color: #8ca9e2;
  color: #102c5f;
  transform: translateY(-1px);
}

#admin-panel button.primary {
  background: linear-gradient(180deg, #2f58b1 0%, #29499b 100%);
  border-color: #2b4ea3;
  color: #fff;
}

#admin-panel button.primary:hover {
  background: linear-gradient(180deg, #2a4ea0 0%, #243f85 100%);
  border-color: #24458f;
  color: #fff;
}

#admin-panel button.danger {
  background: linear-gradient(180deg, #c44745 0%, #a93734 100%);
  border-color: #a93a37;
  color: #fff;
}

#admin-panel button.danger:hover {
  background: linear-gradient(180deg, #b23c3a 0%, #96312f 100%);
  border-color: #983330;
}

#admin-panel button:disabled {
  opacity: 0.64;
  transform: none;
  cursor: default;
}

#admin-panel button:disabled:hover {
  background: inherit;
  border-color: inherit;
  color: inherit;
  transform: none;
}

.notice {
  border: 1px solid;
  border-radius: 10px;
  padding: 0.64rem 0.76rem;
  margin-top: 0.64rem;
  font-size: 0.87rem;
}

.output {
  min-height: 18px;
  margin-top: 0.45rem;
}

.preview-panel {
  position: sticky;
  top: 0.9rem;
  border: 0;
  border-radius: 14px;
  background: transparent;
  padding: 0.82rem;
  box-shadow: none;
}

.compose-shell.preview-hidden .composer-grid {
  grid-template-columns: minmax(0, 1fr);
}

.compose-shell.preview-hidden .preview-panel {
  display: none;
}

.compose-shell {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 5.2rem);
}

.preview-box {
  min-height: 390px;
  max-height: 640px;
  overflow: auto;
  border: 1px solid #c9d8f2;
  border-radius: 12px;
  padding: 0.9rem;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.placeholder,
.muted {
  color: #5f6f86;
  font-size: 0.86rem;
}

.muted code {
  color: #3f4f68;
}

.row-head,
.composer-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.95rem;
  margin-bottom: 0.92rem;
}

.composer-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

#admin-panel button.quiet-toggle {
  border: 1px solid #b8c9ea;
  border-radius: 8px;
  background: #f8fbff;
  color: #24457f;
  font-size: 0.8rem;
  font-weight: 620;
  width: 2rem;
  min-width: 2rem;
  height: 2rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

#admin-panel button.quiet-toggle:hover {
  background: #e9f1ff;
  border-color: #9fb9ea;
  color: #1e3f7b;
}

#admin-panel button.quiet-toggle[aria-pressed="true"] {
  background: #dbe8ff;
  border-color: #7ea2e6;
  color: #153b76;
  box-shadow: inset 0 0 0 1px rgba(126, 162, 230, 0.25);
}

#admin-panel button.quiet-toggle[aria-pressed="true"]:hover {
  background: #d3e3ff;
  border-color: #739bdd;
  color: #12376f;
}

#admin-panel button.quiet-toggle .preview-icon {
  width: 1rem;
  height: 1rem;
}

#admin-panel button.quiet-toggle .preview-icon-hidden {
  display: none;
}

#admin-panel button.quiet-toggle[aria-pressed="false"] .preview-icon-visible {
  display: none;
}

#admin-panel button.quiet-toggle[aria-pressed="false"] .preview-icon-hidden {
  display: block;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 0.48rem;
}

.queue-local-drip-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: #4f5f78;
  font-size: 0.8rem;
  font-weight: 520;
  margin-right: 0.22rem;
}

.queue-local-drip-status.is-paused .queue-local-drip-spinner {
  animation: none;
  opacity: 0.45;
  border-right-color: #5b77ae;
}

.queue-local-drip-spinner {
  width: 0.78rem;
  height: 0.78rem;
  border: 2px solid #5b77ae;
  border-right-color: transparent;
  border-radius: 999px;
  animation: admin-spin 0.75s linear infinite;
  flex: 0 0 auto;
}

#admin-panel .local-drip-toggle {
  min-width: 2rem;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid #b6c8ec;
  border-radius: 8px;
  background: #f6f9ff;
  color: #1f4489;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

#admin-panel .local-drip-toggle:hover {
  background: #eaf1ff;
  border-color: #99b5e6;
}

#admin-panel .local-drip-toggle .local-drip-icon-play {
  display: none;
}

#admin-panel .local-drip-toggle[aria-pressed="false"] .local-drip-icon-pause {
  display: none;
}

#admin-panel .local-drip-toggle[aria-pressed="false"] .local-drip-icon-play {
  display: block;
}

#admin-panel .row-actions button.is-loading {
  position: relative;
  padding-right: 1.8rem;
}

#admin-panel .row-actions button.is-loading::after {
  content: "";
  position: absolute;
  right: 0.62rem;
  top: 50%;
  width: 0.78rem;
  height: 0.78rem;
  margin-top: -0.39rem;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: admin-spin 0.75s linear infinite;
}

@keyframes admin-spin {
  to {
    transform: rotate(360deg);
  }
}

.queue-rows {
  display: block;
  border-top: 1px solid #d2def3;
  border-bottom: 1px solid #d2def3;
  background: transparent;
}

.queue-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.52rem 0.24rem;
}

.queue-row:nth-child(odd) {
  background: #f5f8ff;
}

.queue-row-main {
  min-width: 0;
  display: grid;
  gap: 0.08rem;
}

.queue-row-title {
  color: #1f335f;
}

#admin-panel .queue-row-open {
  border: 0;
  background: transparent;
  color: #1f335f;
  font-weight: 700;
  padding: 0;
  margin: 0;
  text-align: left;
  min-width: 0;
}

#admin-panel .queue-row-open:hover {
  text-decoration: underline;
  background: transparent;
}

.queue-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
}

[data-admin-section="drafts"] .demo-box {
  padding-left: 0;
  padding-right: 0;
}

[data-admin-section="drafts"] {
  margin-left: calc(-1 * var(--admin-content-pad-left, 0.7rem));
  margin-right: calc(-1 * var(--admin-content-pad-right, 0.72rem));
}

[data-admin-section="drafts"] .row-head {
  padding: 0 0.7rem;
}

[data-admin-section="users"] .demo-box {
  padding-left: 0;
  padding-right: 0;
}

[data-admin-section="users"] {
  margin-left: calc(-1 * var(--admin-content-pad-left, 0.7rem));
  margin-right: calc(-1 * var(--admin-content-pad-right, 0.72rem));
}

[data-admin-section="users"] .row-head {
  padding: 0 0.7rem;
}

.draft-rows {
  display: block;
  border-top: 1px solid #d2def3;
  border-bottom: 1px solid #d2def3;
  border-left: 0;
  border-right: 0;
  border-radius: 0;
  background: transparent;
}

.draft-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.62rem;
  padding: 0.48rem 0.68rem;
  min-height: 2.9rem;
}

.draft-row:nth-child(odd) {
  background: #f5f8ff;
}

.draft-row-main {
  min-width: 0;
  flex: 1 1 auto;
}

.draft-row-line {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1f335f;
  cursor: default;
}

.draft-row-open {
  border: 0;
  background: transparent;
  color: #163161;
  font-weight: 700;
  padding: 0;
  margin: 0;
  min-width: 0;
  text-align: left;
  cursor: pointer;
}

#admin-panel .draft-row-open:hover {
  text-decoration: underline;
  background: transparent;
}

#admin-panel .draft-row-open:focus-visible {
  outline: 2px solid #7ea2e6;
  outline-offset: 2px;
  border-radius: 3px;
}

.draft-row-line strong {
  color: #163161;
}

.draft-row-excerpt {
  color: #4a5c78;
  cursor: default;
}

.draft-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex: 0 0 auto;
}

#admin-panel .draft-row-actions button {
  width: auto;
}

#admin-panel .draft-row-actions button.draft-delete {
  min-width: 2rem;
  width: 2rem;
  height: 2rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #132f5f;
}

#admin-panel .draft-row-actions button.draft-delete .trash-icon-svg {
  width: 0.98rem;
  height: 0.98rem;
  color: currentColor;
}

#admin-panel .draft-row-actions button.draft-delete:hover {
  background: #eef4ff;
}

.nostr-pages-list {
  display: block;
  border-top: 1px solid #d2def3;
  border-bottom: 1px solid #d2def3;
  border-left: 0;
  border-right: 0;
  border-radius: 0;
  overflow: visible;
  background: transparent;
}

.nostr-pages-rows {
  display: block;
}

.nostr-page-row {
  border: 0;
  border-radius: 0;
  background: #fff;
  padding: 0.48rem 0.68rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  min-height: 2.9rem;
}

.nostr-page-row:nth-child(odd) {
  background: #f5f8ff;
}

.nostr-page-main {
  min-width: 0;
}

.nostr-page-title a {
  color: #163161;
  text-decoration: none;
}

.nostr-page-title a:hover,
.nostr-page-title a:focus-visible {
  text-decoration: underline;
}

.nostr-page-meta {
  margin-top: 0.14rem;
  color: #5c6f91;
  font-size: 0.84rem;
  display: inline-flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.nostr-page-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex: 0 0 auto;
}

#admin-panel .nostr-page-actions button {
  width: auto;
  min-width: 2rem;
  height: 2rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

#admin-panel .nostr-page-actions .nostr-page-nav-check {
  margin-right: 0.3rem;
}

.users-list {
  display: block;
  border-top: 1px solid #d2def3;
  border-bottom: 1px solid #d2def3;
  border-left: 0;
  border-right: 0;
  border-radius: 0;
  overflow: visible;
  background: transparent;
}

.posts-list {
  display: block;
  border-top: 1px solid #d2def3;
  border-bottom: 1px solid #d2def3;
  border-left: 0;
  border-right: 0;
  border-radius: 0;
  overflow: visible;
  background: transparent;
}

.post-row {
  border: 0;
  border-radius: 0;
  background: #fff;
  padding: 0.48rem 0.68rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 2.9rem;
}

.post-row:nth-child(odd) {
  background: #f5f8ff;
}

.post-row-main {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.post-row-title {
  color: #163161;
  font-weight: 700;
  max-width: min(52ch, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.07rem 0.42rem;
  border-radius: 999px;
  font-size: 0.71rem;
  font-weight: 700;
  border: 1px solid #c1d1f0;
  color: #32508f;
  background: #f2f6ff;
  line-height: 1.15;
}

.post-pill.is-local {
  border-color: #a9bddf;
  color: #2d4d87;
  background: #ecf3ff;
}

.post-pill.is-nostr {
  border-color: #9cd5b6;
  color: #1c7b47;
  background: #e8f8f0;
}

.post-pill.is-author {
  border-color: #d0d9ea;
  color: #48607f;
  background: #f7f9fd;
}

.post-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.36rem;
}

#admin-panel .post-menu {
  position: relative;
}

#admin-panel button.post-menu-trigger {
  min-width: 2rem;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  padding: 0;
}

#admin-panel .post-menu-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 13.5rem;
  background: #fff;
  border: 1px solid #c8d7f1;
  border-radius: 10px;
  box-shadow: 0 14px 30px rgba(16, 28, 56, 0.16);
  padding: 0.3rem;
}

#admin-panel .post-menu-panel button {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 8px;
  background: transparent;
  padding: 0.5rem 0.55rem;
  font-weight: 620;
}

#admin-panel .post-menu-panel button:hover {
  background: #eef4ff;
}

#admin-panel .post-menu-panel button.post-hide {
  color: #8a4d00;
}

#admin-panel .post-menu-panel button.post-hide:hover {
  background: #fff6ea;
}

#admin-panel .post-menu-panel button.post-delete {
  color: #a52c2a;
}

#admin-panel .post-menu-panel button.post-delete .trash-icon-svg {
  width: 0.98rem;
  height: 0.98rem;
  color: #a52c2a;
  flex: 0 0 auto;
}

#admin-panel .post-menu-panel button.post-delete:hover {
  background: #fff1f1;
}

.user-card {
  border: 0;
  border-radius: 0;
  background: #fff;
  padding: 0.5rem 0.68rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 3rem;
}

.user-card.user-row-alt {
  background: #f5f8ff;
}

.users-list.is-dragging .user-card.is-draggable {
  cursor: grabbing;
}

.user-card.is-draggable {
  cursor: grab;
}

.user-card.is-dragging {
  opacity: 0.58;
}

.user-card-main {
  min-width: 0;
  display: grid;
  gap: 0.08rem;
}

.user-card-name {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  font-weight: 700;
  color: #163161;
}

.user-self-label {
  color: #294672;
  font-size: 0.8rem;
  font-weight: 700;
}

.user-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.08rem 0.45rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  border: 1px solid #c1d1f0;
  color: #32508f;
  background: #f2f6ff;
}

.user-pill.is-admin {
  border-color: #95b2ea;
  color: #1f3f7d;
  background: #e8f0ff;
}

.user-pill.is-author {
  border-color: #98d6a6;
  color: #1f7d41;
  background: #e8f8ee;
}

.user-card-meta {
  font-size: 0.81rem;
  color: #5e6d86;
}

.user-card-actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 0.38rem;
}

#admin-panel button.user-menu-trigger {
  min-width: 2rem;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  padding: 0;
}

#admin-panel .user-menu {
  position: relative;
}

#admin-panel .user-menu-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 13.5rem;
  background: #fff;
  border: 1px solid #c8d7f1;
  border-radius: 10px;
  box-shadow: 0 14px 30px rgba(16, 28, 56, 0.16);
  padding: 0.3rem;
}

#admin-panel .user-menu-panel button {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 8px;
  background: transparent;
  padding: 0.5rem 0.55rem;
  font-weight: 620;
}

#admin-panel .user-menu-panel button:hover {
  background: #eef4ff;
}

#admin-panel .user-menu-panel button.user-delete {
  color: #a52c2a;
}

#admin-panel .user-menu-panel button.user-delete .trash-icon-svg {
  width: 0.98rem;
  height: 0.98rem;
  color: #a52c2a;
  flex: 0 0 auto;
}

#admin-panel .user-menu-panel button.user-delete:hover {
  background: #fff1f1;
}

#admin-panel .user-menu-panel button.user-author-action {
  color: #1f7d41;
}

#admin-panel .user-menu-panel button.user-author-action:hover {
  background: #ebf9f0;
}

#admin-panel .user-menu-panel button.user-block-action {
  color: #8a4d00;
}

#admin-panel .user-menu-panel button.user-block-action:hover {
  background: #fff6ea;
}

.user-drop-zone {
  height: 0;
  border-top: 2px solid transparent;
  margin: 0;
  transition: border-color 120ms ease, margin 120ms ease;
}

.users-list.is-dragging .user-drop-zone {
  margin: -1px 0 4px;
}

.users-list.is-dragging .user-drop-zone.is-target {
  border-top-color: #5a83d8;
  margin: 4px 0 7px;
}

.drop-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.75);
  color: #fff;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 1.08rem;
  z-index: 9999;
  text-align: center;
  padding: 2rem;
}

.drop-overlay.show {
  display: flex;
}

.admin-inline-dialog {
  border: 1px solid var(--admin-border, var(--border));
  border-radius: 12px;
  background: var(--menu-bg, var(--admin-surface, var(--post-card-bg-single)));
  color: var(--admin-text, var(--text));
  box-shadow: var(--menu-shadow, 0 12px 28px rgba(15, 23, 42, 0.16));
  width: min(30rem, calc(100vw - 2rem));
  padding: 0;
}

.admin-inline-dialog::backdrop {
  background: var(--surface-overlay, rgba(15, 23, 42, 0.56));
}

.admin-inline-dialog-form {
  margin: 0;
  padding: 0.9rem;
  display: grid;
  gap: 0.72rem;
}

.admin-inline-dialog-form h4 {
  margin: 0;
}

.admin-inline-dialog-form .field-row {
  margin: 0;
}

#nostr-page-type-listbox {
  min-height: 5.2rem;
}

.admin-inline-dialog-actions {
  display: inline-flex;
  justify-content: flex-end;
  gap: 0.45rem;
}

/* Theme bridge: push admin UI onto the active site theme tokens. */
#admin-panel {
  color: var(--admin-text, var(--text));
  background: var(--admin-bg, var(--bg));
}

#admin-panel a {
  color: var(--admin-accent-strong, var(--accent-dark));
}

.admin-access-message {
  border-color: var(--admin-border, var(--border)) !important;
  background: var(--admin-surface, var(--post-card-bg-single)) !important;
  color: var(--admin-text, var(--text)) !important;
}

.admin-access-message.is-warn {
  background: var(--status-warn-bg, #5a4516) !important;
  border-color: var(--status-warn-border, #8a6a24) !important;
  color: var(--status-warn-text, #f6f8ff) !important;
}

.admin-access-message.is-error {
  background: var(--status-error-bg, #641925) !important;
  border-color: var(--status-error-border, #96394d) !important;
  color: var(--status-error-text, #f6f8ff) !important;
}

.admin-sidebar,
.admin-nav-list {
  background: var(--admin-surface, var(--post-card-bg-single)) !important;
  border-color: var(--admin-border, var(--border)) !important;
}

.admin-content {
  background: var(--admin-bg, var(--bg)) !important;
}

.admin-nav-title {
  background: var(--admin-surface-alt, var(--post-card-bg)) !important;
  border-color: var(--admin-border, var(--border)) !important;
  color: var(--admin-text, var(--text)) !important;
}

.admin-nav-item {
  color: var(--admin-text, var(--text)) !important;
}

.admin-nav-icon-slot {
  color: var(--admin-accent, var(--accent)) !important;
}

#admin-panel .admin-nav-list .admin-nav-item.is-compose {
  background: color-mix(in srgb, var(--admin-hover, var(--nav-link-hover)) 55%, transparent) !important;
}

.admin-nav-item:hover,
.admin-nav-item.is-active,
.admin-nav-item[aria-selected="true"],
.admin-nav-item[aria-current="page"],
#admin-panel .admin-nav-list .admin-nav-item:hover,
#admin-panel .admin-nav-list .admin-nav-item[aria-selected="true"],
#admin-panel .admin-nav-list .admin-nav-item[aria-current="page"] {
  background: var(--admin-hover, var(--nav-link-hover)) !important;
  color: var(--admin-accent-strong, var(--accent-dark)) !important;
}

#admin-panel .admin-nav-list .admin-nav-item.admin-nav-divider-after::after {
  border-bottom-color: var(--admin-border, var(--border)) !important;
}

.demo-box h3,
.demo-box h4,
.queue-item-title,
.draft-title,
.post-title,
.nostr-page-title a,
.user-name {
  color: var(--admin-text, var(--text)) !important;
}

#admin-panel .field-row label,
#admin-panel .setting-label,
#admin-panel .queue-head,
#admin-panel .post-row-title,
#admin-panel .draft-row-line,
#admin-panel .draft-row-line strong,
#admin-panel .draft-row-open {
  color: var(--admin-text, var(--text)) !important;
}

.demo-box,
.sub-card,
.user-menu-panel,
.post-menu-panel,
.users-list,
.drafts-list,
.posts-list,
.nostr-pages-list {
  border-color: var(--admin-border, var(--border)) !important;
}

#admin-panel .preview-box,
#admin-panel .output {
  border-color: var(--admin-border, var(--border)) !important;
  background: var(--surface-raised, var(--admin-surface, var(--post-card-bg-single))) !important;
  color: var(--admin-text, var(--text)) !important;
}

.user-row,
.draft-row,
.post-row,
.nostr-page-row {
  background: var(--admin-surface, var(--post-card-bg-single)) !important;
}

.user-row:nth-child(odd),
.draft-row:nth-child(odd),
.post-row:nth-child(odd),
.nostr-page-row:nth-child(odd) {
  background: var(--admin-surface-alt, var(--post-card-bg)) !important;
}

#admin-panel input[type="text"],
#admin-panel input[type="number"],
#admin-panel input[type="datetime-local"],
#admin-panel textarea,
#admin-panel select {
  border-color: var(--admin-border, var(--border)) !important;
  background: var(--select-bg, var(--light-bg)) !important;
  color: var(--admin-text, var(--text)) !important;
}

#admin-panel input:focus,
#admin-panel textarea:focus,
#admin-panel select:focus {
  border-color: var(--focus-ring-strong, var(--admin-accent, var(--accent))) !important;
  box-shadow: 0 0 0 3px var(--focus-ring) !important;
}

#admin-panel button {
  border-color: var(--admin-border, var(--border)) !important;
  background: var(--admin-surface-alt, var(--post-card-bg)) !important;
  color: var(--admin-text, var(--text)) !important;
}

#admin-panel button:hover {
  background: var(--admin-hover, var(--nav-link-hover)) !important;
  color: var(--admin-accent-strong, var(--accent-dark)) !important;
}

#admin-panel button.primary {
  background: linear-gradient(180deg, var(--admin-accent, var(--accent)) 0%, var(--admin-accent-strong, var(--accent-dark)) 100%);
  border-color: var(--admin-accent-strong, var(--accent-dark));
  color: var(--nav-active-text, #fff) !important;
}

#admin-panel button.primary:hover {
  background: linear-gradient(180deg, var(--admin-accent-strong, var(--accent-dark)) 0%, var(--admin-accent-strong, var(--accent-dark)) 100%);
  color: var(--nav-active-text, #fff) !important;
}

#admin-panel button.danger {
  background: linear-gradient(180deg, var(--admin-danger, var(--danger)) 0%, color-mix(in srgb, var(--admin-danger, var(--danger)) 78%, #000 22%) 100%) !important;
  border-color: color-mix(in srgb, var(--admin-danger, var(--danger)) 78%, #000 22%) !important;
  color: var(--nav-active-text, #fff) !important;
}

#admin-panel button.danger:hover {
  background: linear-gradient(180deg, color-mix(in srgb, var(--admin-danger, var(--danger)) 88%, #000 12%) 0%, color-mix(in srgb, var(--admin-danger, var(--danger)) 68%, #000 32%) 100%) !important;
  color: var(--nav-active-text, #fff) !important;
}

#admin-panel button.icon-danger {
  border-color: color-mix(in srgb, var(--admin-danger, var(--danger)) 30%, var(--admin-border, var(--border)) 70%) !important;
  background: var(--surface-raised, var(--admin-surface, var(--post-card-bg-single))) !important;
}

#admin-panel .icon-danger,
#admin-panel .post-delete,
#admin-panel .draft-delete,
#admin-panel .user-delete,
#admin-panel [data-user-action="delete"] {
  color: var(--admin-danger, var(--danger)) !important;
}

#admin-panel .icon-danger:hover,
#admin-panel .post-delete:hover,
#admin-panel .draft-delete:hover,
#admin-panel .user-delete:hover,
#admin-panel [data-user-action="delete"]:hover {
  background: var(--danger-soft, rgba(180, 35, 24, 0.14)) !important;
  color: var(--admin-danger, var(--danger)) !important;
}

#admin-panel .post-menu-panel,
#admin-panel .user-menu-panel {
  background: var(--menu-bg, var(--surface-raised, var(--admin-surface, var(--post-card-bg-single)))) !important;
  border-color: var(--menu-border, var(--admin-border, var(--border))) !important;
  box-shadow: var(--menu-shadow, 0 12px 28px rgba(15, 23, 42, 0.16)) !important;
}

#admin-panel .post-menu-panel button:hover,
#admin-panel .user-menu-panel button:hover {
  background: var(--menu-hover-bg, var(--admin-hover, var(--nav-link-hover))) !important;
}

#admin-panel .post-menu-panel button.post-delete:hover,
#admin-panel .user-menu-panel button.user-delete:hover {
  background: var(--menu-danger-hover-bg, var(--danger-soft, rgba(180, 35, 24, 0.14))) !important;
}

#admin-panel .post-pill {
  border-color: color-mix(in srgb, var(--admin-accent, var(--accent)) 35%, var(--admin-border, var(--border)) 65%) !important;
  color: var(--admin-accent-strong, var(--accent-dark)) !important;
  background: color-mix(in srgb, var(--admin-hover, var(--nav-link-hover)) 70%, transparent) !important;
}

#admin-panel .post-pill.is-nostr {
  border-color: color-mix(in srgb, var(--theme_green, var(--teal)) 42%, var(--admin-border, var(--border)) 58%) !important;
  color: var(--theme_green_fg, var(--theme_green, var(--teal))) !important;
  background: var(--theme_green_bg, color-mix(in srgb, var(--theme_green, var(--teal)) 16%, transparent)) !important;
}

#admin-panel .post-pill.is-author {
  border-color: color-mix(in srgb, var(--admin-muted, var(--light-text)) 40%, var(--admin-border, var(--border)) 60%) !important;
  color: var(--admin-muted, var(--light-text)) !important;
  background: color-mix(in srgb, var(--admin-surface-alt, var(--post-card-bg)) 85%, transparent) !important;
}

#admin-panel .drip-queue-pill {
  border-color: color-mix(in srgb, var(--admin-accent, var(--accent)) 36%, var(--admin-border, var(--border)) 64%) !important;
  color: var(--admin-accent-strong, var(--accent-dark)) !important;
  background: color-mix(in srgb, var(--admin-hover, var(--nav-link-hover)) 74%, transparent) !important;
}

#admin-panel .queue-local-drip-status,
#admin-panel .draft-row-excerpt,
#admin-panel .queue-drip-settings .field-unit,
#admin-panel .user-email,
#admin-panel .user-last-seen {
  color: var(--admin-muted, var(--light-text)) !important;
}

#admin-panel .queue-local-drip-spinner {
  border-color: var(--admin-accent, var(--accent)) !important;
  border-right-color: transparent !important;
}

#admin-panel .muted,
#admin-panel .field-unit,
#admin-panel .nostr-page-meta,
#admin-panel .archive-date,
#admin-panel .account-note {
  color: var(--admin-muted, var(--light-text)) !important;
}

.drop-overlay {
  background: var(--surface-overlay, rgba(15, 23, 42, 0.72));
  color: var(--nav-active-text, #fff);
}

@media (max-width: 1180px) {
  body {
    max-width: none;
    margin: 0;
    padding: 0 0 2rem;
  }

  .composer-grid {
    grid-template-columns: 1fr;
  }

  .preview-panel {
    position: static;
  }

  .preview-box {
    max-height: 460px;
  }
}

@media (max-width: 620px) {
  .admin-layout {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .admin-sidebar {
    position: static;
    min-height: 0;
    border-right: 0;
  }

  .admin-content {
    --admin-content-pad-left: 0.5rem;
    --admin-content-pad-right: 0.5rem;
    min-height: 0;
    padding: 0.4rem 0.5rem 0.75rem;
  }
}

@media (max-width: 520px) {
  body {
    margin: 0;
    padding: 0 0 1.6rem;
  }

  .grid-two {
    grid-template-columns: 1fr;
  }

  [data-admin-section="settings"] .field-row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  [data-admin-section="account"] .account-passkey-row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  [data-admin-section="account"] .field-row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .account-note {
    grid-column: 1;
  }

  .row-head,
  .composer-head {
    flex-direction: column;
    align-items: stretch;
  }

  .row-actions {
    inline-size: auto;
  }

  .row-actions button {
    flex: 1 1 0;
  }

  .compose-actions {
    inline-size: 100%;
  }
}

@media (max-width: 480px) {
  .demo-box {
    padding: 0.45rem 0.42rem 0.6rem;
  }

  .toolbar button {
    width: 1.95rem;
    min-width: 1.95rem;
    height: 1.95rem;
    padding: 0;
  }

  .compose-actions #btn-publish-now {
    min-width: 0;
    width: 100%;
  }
}
</style>
