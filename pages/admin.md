---
title: ""
---

<div id="admin-access-message" class="admin-access-message" hidden></div>

<div id="admin-panel" class="admin-layout" style="display:none;">
<aside class="admin-sidebar">
<div class="admin-nav-title-row">
<div class="admin-nav-title">Admin</div>
<button id="btn-admin-sidebar-toggle" type="button" class="unobtrusive-icon-button admin-sidebar-toggle" aria-label="Hide admin sidebar" title="Hide sidebar" aria-pressed="true">
<svg class="admin-sidebar-toggle-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M15.5 5.5L8.5 12L15.5 18.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>
</div>
<div class="admin-nav-list" role="tablist" aria-label="Admin sections">
<button type="button" class="admin-nav-item is-compose" data-admin-nav="compose" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 18L7.2 13.8L15.8 5.2a2 2 0 1 1 2.8 2.8L10 16.6L6 18Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 21H19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span><span class="admin-nav-label">Compose</span></button>
<button type="button" class="admin-nav-item" data-admin-nav="drafts" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Drafts <span id="admin-nav-drafts-count" class="admin-nav-count">(0)</span></span></button>
<button type="button" class="admin-nav-item" data-admin-nav="queue" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Queue <span id="admin-nav-queue-count" class="admin-nav-count">(0)</span></span></button>
<button type="button" class="admin-nav-item admin-nav-divider-after" data-admin-nav="posts" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Posts <span id="admin-nav-posts-count" class="admin-nav-count">(0)</span></span></button>
<button type="button" class="admin-nav-item" data-admin-nav="account" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Account</span></button>
<button type="button" class="admin-nav-item" data-admin-nav="nostr-pages" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Pages</span></button>
<button type="button" class="admin-nav-item" data-admin-nav="files" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Files</span></button>
<button type="button" class="admin-nav-item" data-admin-nav="moderation" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Moderation</span></button>
<button type="button" class="admin-nav-item" data-admin-nav="users" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Users</span></button>
<button type="button" class="admin-nav-item is-active" data-admin-nav="settings" aria-selected="true"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label">Site Settings</span></button>
<button type="button" class="admin-nav-item" data-admin-nav="nostr-bridge" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label admin-nav-label-with-pill">Nostr <span id="admin-nav-noster-status" class="admin-nav-status-pill is-offline">Not Installed</span></span></button>
<button type="button" class="admin-nav-item" data-admin-nav="zaps" aria-selected="false"><span class="admin-nav-icon-slot" aria-hidden="true"></span><span class="admin-nav-label admin-nav-label-with-pill">Zaps <span id="admin-nav-zaps-status" class="admin-nav-status-pill is-offline">Not Installed</span></span></button>
</div>
</aside>
<button id="btn-admin-sidebar-reveal" type="button" class="unobtrusive-icon-button admin-sidebar-reveal" aria-label="Show admin sidebar" title="Show sidebar" hidden>
<svg class="admin-sidebar-reveal-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 5.5L15.5 12L8.5 18.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>
</button>

<div class="admin-content">
<section class="admin-section is-active" data-admin-section="settings">
<div class="demo-box admin-card">
<div class="section-head">
<h3>Site Settings</h3>
</div>

<div class="settings-stack">
<section class="sub-card">
<div class="field-row settings-inline-control-row">
<label for="site-title" title="Public title shown in your blog header and feeds."><strong title="Public title shown in your blog header and feeds.">Site Title</strong></label>
<input type="text" id="site-title" placeholder="My Blog" title="Public title shown in your blog header and feeds.">
</div>
<div class="field-row settings-inline-control-row">
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
<h4>Registration</h4>
<p class="muted settings-subhead">Control who can register and the default role for new accounts.</p>
<div class="field-row checkbox-row">
<div class="setting-label">
<strong>Enable User Registration</strong>
<span class="inline-tip" tabindex="0" aria-label="Allow new users to create accounts by signing in with a Nostr key.">?</span>
</div>
<label class="checkbox-control" for="registration-enabled">
<input type="checkbox" id="registration-enabled">
<span>Enabled</span>
</label>
</div>
<div class="field-row checkbox-row">
<div class="setting-label">
<strong>New Accounts Are Admins</strong>
<span class="inline-tip" tabindex="0" aria-label="When enabled, newly registered Nostr accounts are granted admin automatically. Turn this off after bootstrapping your initial admin team.">?</span>
</div>
<label class="checkbox-control" for="new-users-are-admins">
<input type="checkbox" id="new-users-are-admins">
<span>Enabled</span>
</label>
</div>
</section>

<section class="sub-card sub-card-feeds">
<h4>Feeds</h4>
<div class="field-row checkbox-row">
<div class="setting-label" title="Controls whether each RSS/Atom entry includes full post text or a shorter excerpt.">
<strong title="Controls whether each RSS/Atom entry includes full post text or a shorter excerpt.">RSS/Atom Includes Full Text</strong>
</div>
<label class="checkbox-control" for="feed-full-text" title="Controls whether each RSS/Atom entry includes full post text or a shorter excerpt.">
<input type="checkbox" id="feed-full-text" checked title="Controls whether each RSS/Atom entry includes full post text or a shorter excerpt.">
<span title="Controls whether each RSS/Atom entry includes full post text or a shorter excerpt.">Enabled</span>
</label>
</div>
<div class="field-row settings-inline-control-row">
<label for="feed-items" title="Maximum number of recent posts included in RSS/Atom feeds. Minimum is 1; typical range is 20-100."><strong title="Maximum number of recent posts included in RSS/Atom feeds. Minimum is 1; typical range is 20-100.">Feed Item Count (min 1; typical 20-100)</strong></label>
<input type="number" id="feed-items" min="1" step="1" value="50" title="Maximum number of recent posts included in RSS/Atom feeds. Minimum is 1; typical range is 20-100.">
</div>
</section>
</div>

<div id="output-config" class="output"></div>
</div>
</section>

<section class="admin-section" data-admin-section="nostr-bridge" hidden>
<div class="demo-box admin-card">
<div class="row-head">
<div>
<h3>Nostr</h3>
<p class="muted">Install and control Stonr on this server.</p>
</div>
</div>

<div class="settings-stack">
<section class="sub-card">
<div class="zaps-runtime-head">
<h4>Stonr</h4>
</div>
<div id="noster-runtime" class="zaps-runtime-grid">
<div class="placeholder">Loading Nostr runtime...</div>
</div>
</section>
</div>

<div id="output-nostr-bridge" class="output"></div>
</div>
</section>

<section class="admin-section" data-admin-section="zaps" hidden>
<div class="demo-box admin-card">
<div class="row-head">
<div>
<h3>Zaps</h3>
<p class="muted">Manage site-level zap settings and install Bitcoin or Lightning on this server through Wizardry.</p>
</div>
<div class="row-actions">
<button id="btn-zaps-refresh" type="button">Refresh status</button>
</div>
</div>

<div class="settings-stack">
<section class="sub-card">
<h4>Zap Settings</h4>
<div class="field-row checkbox-row">
<div class="setting-label">
<strong>Enable Zaps</strong>
</div>
<label class="checkbox-control" for="zaps-enabled">
<input type="checkbox" id="zaps-enabled">
<span>Enabled</span>
</label>
</div>
<div class="grid-two">
<div class="field-row">
<label for="zap-lud16"><strong>Lightning Address</strong></label>
<input type="text" id="zap-lud16" inputmode="email" placeholder="you@example.com">
</div>
<div class="field-row">
<label for="zap-default-amount-sats"><strong>Default Amount</strong></label>
<input type="number" id="zap-default-amount-sats" min="1" step="1" value="210">
<span class="field-unit">sats</span>
</div>
</div>
<p class="muted">Public zap buttons use your site signer pubkey and this Lightning address. If you want outside Nostr clients to discover the same address automatically, publish a matching <code>lud16</code> value on your contact page.</p>
</section>

<section class="sub-card">
<div class="zaps-runtime-head">
<h4>Server Runtime</h4>
</div>
<div id="zaps-runtime" class="zaps-runtime-grid">
<div class="placeholder">Loading zap runtime...</div>
</div>
</section>
</div>

<div id="output-zaps" class="output"></div>
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
<button type="button" class="unobtrusive-icon-button toolbar-button" data-toolbar="bold" aria-label="Bold" title="Bold">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 4.75H12.4C15.05 4.75 17.2 6.9 17.2 9.55C17.2 12.2 15.05 14.35 12.4 14.35H6.5V4.75Z" stroke="currentColor" stroke-width="1.85" stroke-linejoin="round"/><path d="M6.5 14.35H13.55C16.15 14.35 18.25 16.45 18.25 19.05C18.25 21.1 16.6 22.75 14.55 22.75H6.5V14.35Z" stroke="currentColor" stroke-width="1.85" stroke-linejoin="round" transform="translate(0 -2.5)"/></svg>
<span class="sr-only">Bold</span>
</button>
<button type="button" class="unobtrusive-icon-button toolbar-button" data-toolbar="italic" aria-label="Italic" title="Italic">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.5 4.5H9.5" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/><path d="M13.6 4.5L9.8 19.5" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/><path d="M14.2 19.5H9.2" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/></svg>
<span class="sr-only">Italic</span>
</button>
<button type="button" class="unobtrusive-icon-button toolbar-button" data-toolbar="h2" aria-label="Heading 2" title="Heading 2">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 6V18" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/><path d="M9.5 6V18" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/><path d="M3.5 12H9.5" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/><path d="M14.1 10.2C14.35 8.75 15.45 7.95 16.75 7.95C18.25 7.95 19.3 8.85 19.3 10.2C19.3 11.35 18.4 12.25 17.3 13.1L14.3 15.3H19.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
<span class="sr-only">Heading 2</span>
</button>
<button type="button" class="unobtrusive-icon-button toolbar-button" data-toolbar="h3" aria-label="Heading 3" title="Heading 3">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 6V18" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/><path d="M9.5 6V18" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/><path d="M3.5 12H9.5" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/><path d="M14.5 9.3H18.5L16.15 12L18.5 14.7H14.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
<span class="sr-only">Heading 3</span>
</button>
<button type="button" class="unobtrusive-icon-button toolbar-button" data-toolbar="code" aria-label="Inline code" title="Inline code">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.8 7.8L4.6 12L8.8 16.2" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.2 7.8L19.4 12L15.2 16.2" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/></svg>
<span class="sr-only">Inline code</span>
</button>
<button type="button" class="unobtrusive-icon-button toolbar-button" data-toolbar="code_block" aria-label="Code block" title="Code block">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="M9.1 10L6.6 12L9.1 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.9 10L17.4 12L14.9 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
<span class="sr-only">Code block</span>
</button>
<button type="button" class="unobtrusive-icon-button toolbar-button" data-toolbar="link" aria-label="Insert link" title="Insert link">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13.25 8.65L14.75 7.15C16.05 5.85 18.15 5.85 19.45 7.15C20.75 8.45 20.75 10.55 19.45 11.85L17.95 13.35" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/><path d="M10.75 15.35L9.25 16.85C7.95 18.15 5.85 18.15 4.55 16.85C3.25 15.55 3.25 13.45 4.55 12.15L6.05 10.65" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/><path d="M8.75 15.25L15.25 8.75" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/></svg>
<span class="sr-only">Insert link</span>
</button>
<button type="button" class="unobtrusive-icon-button toolbar-button" data-toolbar="quote" aria-label="Quote" title="Quote">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.2 11.2H10.2V15.2H7.8C7.95 16.2 8.55 16.95 9.55 17.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.8 11.2H17.8V15.2H15.4C15.55 16.2 16.15 16.95 17.15 17.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
<span class="sr-only">Quote</span>
</button>
<button type="button" class="unobtrusive-icon-button toolbar-button" data-toolbar="ul" aria-label="Bullet list" title="Bullet list">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="5.2" cy="7.2" r="1.2" fill="currentColor"/><circle cx="5.2" cy="12" r="1.2" fill="currentColor"/><circle cx="5.2" cy="16.8" r="1.2" fill="currentColor"/><path d="M9.5 7.2H19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9.5 12H19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9.5 16.8H19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
<span class="sr-only">Bullet list</span>
</button>
<button type="button" class="unobtrusive-icon-button toolbar-button" data-toolbar="ol" aria-label="Numbered list" title="Numbered list">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.2 8.15V6.1L3.5 6.75" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.2 15.3C3.2 14.25 4.05 13.5 5 13.5C5.95 13.5 6.75 14.1 6.75 15.05C6.75 15.8 6.2 16.35 5.45 16.85L3.3 18.3H6.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 7.2H19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9.5 16.8H19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
<span class="sr-only">Numbered list</span>
</button>
<button type="button" class="unobtrusive-icon-button toolbar-button" data-toolbar="image" aria-label="Insert image" title="Insert image">
<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4.75" width="17" height="14.5" rx="2.25" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="9.9" r="1.4" fill="currentColor"/><path d="M5.75 16.45L10.65 11.55L13.25 14.15L16.15 11.25L19.25 14.35" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
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
<div class="scheduled-picker-row">
<input type="datetime-local" id="post-scheduled-at">
<button type="button" id="btn-scheduled-picker" class="unobtrusive-icon-button" aria-label="Open date and time picker" title="Pick date and time">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M8 3.5V6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16 3.5V6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3.5 9H20.5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="14.2" r="2.8" stroke="currentColor" stroke-width="1.6"/></svg>
</button>
</div>
<p class="muted scheduled-help">Pick a date/time or type it manually.</p>
</div>

<input type="file" id="image-picker" accept="image/*" multiple style="display:none;">
<input type="file" id="file-picker" multiple style="display:none;">
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
<button id="btn-delete-current" type="button" class="icon-danger unobtrusive-icon-button" aria-label="Delete draft" title="Delete draft">
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
<span id="queue-local-drip-status-text">Local drip running. Keep this tab open.</span>
</div>
<button id="btn-local-drip-toggle" type="button" class="unobtrusive-icon-button local-drip-toggle" aria-label="Pause local drip" title="Pause local drip" aria-pressed="true">
<svg class="local-drip-icon local-drip-icon-pause" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<rect x="6.5" y="5" width="4" height="14" rx="0.8" fill="currentColor"/>
<rect x="13.5" y="5" width="4" height="14" rx="0.8" fill="currentColor"/>
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
<div class="row-actions">
<button id="btn-new-post" type="button" class="primary">New Post</button>
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
<h3>Pages</h3>
<p class="muted">Manage local pages backed by Nostr. Pages are published to Nostr only when you press Publish.</p>
</div>
</div>
<div class="nostr-pages-table-toolbar">
<button id="btn-create-nostr-page" type="button" class="primary">New Page...</button>
</div>
<div id="nostr-pages-list" class="nostr-pages-list"></div>
<div id="output-nostr-pages" class="output"></div>
</div>
</section>

<section class="admin-section" data-admin-section="files" hidden>
<div class="demo-box admin-card files-admin-card">
<div class="row-head">
<div>
<h3>Files</h3>
<p class="muted">Attachments are private by default. Public posts can expose attached files automatically, or you can share a file explicitly.</p>
<p class="muted">Synced drop folder: <code>files/</code>. Anything you drop there appears here the next time this page loads.</p>
</div>
</div>
<div id="files-dropzone" class="files-dropzone">
<div class="files-table-toolbar">
<div id="files-upload-summary" class="files-upload-summary" hidden></div>
<button id="btn-upload-file" type="button">Upload Files...</button>
</div>
<div id="files-upload-jobs" class="files-upload-jobs" hidden></div>
<div id="files-list" class="posts-list"></div>
<div id="output-files" class="output"></div>
</div>
</div>
</section>

<section class="admin-section" data-admin-section="moderation" hidden>
<div class="demo-box admin-card">
<div class="row-head">
<div>
<h3>Moderation</h3>
<p class="muted">Moderate user-submitted content shown on this site. Nostr content remains globally available, but you control what this website and this relay choose to host and display.</p>
</div>
<div class="row-actions moderation-filters">
<div class="moderation-age-group" role="group" aria-label="Moderation age filter">
<button type="button" class="moderation-age-option" data-moderation-age="24h" aria-pressed="false">24h</button>
<button type="button" class="moderation-age-option" data-moderation-age="7d" aria-pressed="false">7d</button>
<button type="button" class="moderation-age-option is-active" data-moderation-age="30d" aria-pressed="true">30d</button>
<button type="button" class="moderation-age-option" data-moderation-age="older" aria-pressed="false">Older</button>
</div>
</div>
</div>
<div id="moderation-list" class="posts-list"></div>
<div id="output-moderation" class="output"></div>
</div>
</section>

<section class="admin-section" data-admin-section="account" hidden>
<div class="demo-box admin-card">
<div class="row-head">
<div>
<h3>Account</h3>
<p class="muted">Your account is Nostr-based.</p>
</div>
</div>

<div class="field-row">
<label for="account-nostr-pubkey"><strong>Nostr Pubkey</strong></label>
<div class="account-row account-nostr-row">
<div class="account-pubkey-field">
<input type="text" id="account-nostr-pubkey" readonly>
<button id="btn-account-pubkey-toggle" type="button" class="unobtrusive-icon-button account-pubkey-visibility" aria-label="Show Nostr pubkey" title="Show Nostr pubkey">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<path class="eye-open" d="M2.2 12C4.5 8.1 8 6 12 6s7.5 2.1 9.8 6c-2.3 3.9-5.8 6-9.8 6s-7.5-2.1-9.8-6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
<circle class="eye-open" cx="12" cy="12" r="2.9" stroke="currentColor" stroke-width="1.8"/>
<path class="eye-closed" d="M3 3l18 18M4.1 12c2.2-3.8 5.7-6 9.9-6 1.6 0 3.1.3 4.5 1M19.9 12c-2.2 3.8-5.7 6-9.9 6-1.6 0-3.1-.3-4.5-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
</button>
<button id="btn-account-pubkey-copy" type="button" class="unobtrusive-icon-button" aria-label="Copy Nostr pubkey" title="Copy Nostr pubkey">
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<path d="M9 9H19V19H9V9Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
<path d="M5 15H4.8C3.8 15 3 14.2 3 13.2V4.8C3 3.8 3.8 3 4.8 3H13.2C14.2 3 15 3.8 15 4.8V5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
</button>
</div>
</div>
<p class="muted account-note">Your account ID is your Nostr pubkey. It cannot be changed.</p>
</div>

<div class="field-row">
<label for="account-player-name"><strong>Player Name</strong></label>
<div class="account-row">
<input type="text" id="account-player-name" placeholder="Your name">
<button id="btn-save-account" type="button" class="primary">Save</button>
</div>
</div>

<div class="field-row account-passkey-row">
<label><strong>Passkey</strong><span class="inline-tip" tabindex="0" aria-label="A passkey lets you sign in with your device authenticator with less typing, while still tied to your account.">?</span></label>
<div class="account-passkey-wrap">
<div class="account-row">
<button id="btn-bind-passkey" type="button">Bind passkey</button>
</div>
<p class="muted account-passkey-description">Bind a passkey for faster device-based sign-in on supported browsers and devices.</p>
</div>
</div>

<div class="field-row account-ssh-row">
<label for="account-ssh-public-key"><strong>SSH Public Key</strong></label>
<details class="account-ssh-optional">
<summary class="account-ssh-toggle"><strong>SSH key for MUD and terminal login</strong></summary>
<div class="account-ssh-body">
<p class="muted account-ssh-description">Link an SSH public key for server terminal access (if allowed).</p>
<textarea id="account-ssh-public-key" rows="6" placeholder="ssh-ed25519 AAAA..."></textarea>
<p class="muted account-ssh-note">When generated in-browser, private key download starts locally. Keep it secret and back it up.</p>
<div class="account-row account-ssh-actions">
<button id="btn-generate-ssh" type="button">Generate SSH Key Pair (Browser)</button>
<button id="btn-link-ssh" type="button">Link SSH Public Key</button>
</div>
</div>
</details>
</div>

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
<label for="nostr-page-type-select"><strong>Page Type</strong></label>
<select id="nostr-page-type-select" aria-label="Page type">
<option value="blog">Blog Index (NIP-23 posts)</option>
<option value="list">List Page (kind 30004)</option>
<option value="public-ranking">Public Ranking (kind 30040)</option>
<option value="contact">User Metadata (kind 0)</option>
<option value="nip23">Long-form Content (kind 30023)</option>
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

<dialog id="post-add-to-list-dialog" class="admin-inline-dialog" aria-labelledby="post-add-to-list-title">
<form id="post-add-to-list-form" method="dialog" class="admin-inline-dialog-form">
<h4 id="post-add-to-list-title">Add Post to List</h4>
<div class="field-row">
<label for="post-add-to-list-select"><strong>List</strong></label>
<select id="post-add-to-list-select" aria-label="List">
<option value="">Loading lists...</option>
</select>
</div>
<div id="post-add-to-list-new-row" class="field-row" hidden>
<label for="post-add-to-list-new-slug"><strong>New list slug</strong></label>
<input type="text" id="post-add-to-list-new-slug" placeholder="new-list">
</div>
<div class="field-row">
<label for="post-add-to-list-date"><strong>Date (optional)</strong></label>
<input type="text" id="post-add-to-list-date" placeholder="YYYY or YYYY-MM or YYYY-MM-DD">
</div>
<div class="field-row">
<label for="post-add-to-list-markdown"><strong>Text (optional)</strong></label>
<input type="text" id="post-add-to-list-markdown" placeholder="Markdown line for this entry">
</div>
<div class="admin-inline-dialog-actions">
<button id="post-add-to-list-cancel" type="button">Cancel</button>
<button id="post-add-to-list-confirm" type="submit" class="primary">Add to list</button>
</div>
</form>
</dialog>

<div id="drop-overlay" class="drop-overlay" hidden>Drop files to upload</div>

<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
<script src="/static/nostr-publish-dialog.js"></script>
<script src="/static/admin.js"></script>

<style>
header#title-block-header {
  display: none !important;
}

header#title-block-header h1.title,
body > h1:first-of-type {
  display: none !important;
}

header h1::after,
body > h1:first-of-type::after {
  content: none !important;
}

body {
  max-width: none;
  margin: 0;
  padding: 0 0 2rem;
}

.admin-access-message {
  margin: 0 0 0.75rem;
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
  --admin-sidebar-width: 248px;
  display: grid;
  grid-template-columns: var(--admin-sidebar-width) minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
  min-height: calc(100vh - 3.25rem);
  position: relative;
  transition: grid-template-columns 240ms ease;
}

.admin-sidebar {
  position: static;
  border: 0;
  border-right: 1px solid var(--admin-border, var(--border, #d4c19c));
  border-radius: 0;
  background: var(--admin-surface, var(--post-card-bg-single, #f9f2e4));
  box-shadow: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 3.25rem);
  align-self: stretch;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  transition: transform 240ms ease, opacity 200ms ease;
}

.admin-nav-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.34rem;
  border-bottom: 1px solid var(--admin-border, var(--border, #d4c19c));
  background: var(--admin-surface-alt, var(--post-card-bg, #f8efdd));
  padding: 0.36rem 0.2rem 0.32rem;
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
  background: var(--admin-surface, var(--post-card-bg-single, #f9f2e4));
  width: 100%;
  box-sizing: border-box;
}

.admin-nav-title {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--admin-text, var(--text, #2f2517));
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.01em;
  text-align: left;
}

.admin-sidebar-toggle,
.admin-sidebar-reveal {
  width: 1.9rem;
  min-width: 1.9rem;
  height: 1.9rem;
  padding: 0;
  border-radius: 8px;
}

.admin-sidebar-toggle-icon,
.admin-sidebar-reveal-icon {
  width: 0.98rem;
  height: 0.98rem;
}

.admin-sidebar-reveal {
  position: absolute;
  left: 0.3rem;
  top: 0.36rem;
  z-index: 20;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-8px);
  transition: opacity 170ms ease, transform 200ms ease;
}

#admin-panel.sidebar-collapsed {
  --admin-sidebar-width: 0px;
}

#admin-panel.sidebar-collapsed .admin-sidebar {
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
}

#admin-panel.sidebar-collapsed .admin-sidebar-reveal {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
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

.admin-nav-label-with-pill {
  display: inline-flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
  gap: 0.42rem;
}

.admin-nav-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  padding: 0.06rem 0.42rem;
  border-radius: 999px;
  font-size: 0.68rem;
  line-height: 1.1;
  font-weight: 400;
  border: 1px solid #d0d9eb;
  color: #5e6d86;
  background: #f4f7fc;
}

.admin-nav-status-pill.is-connected {
  border-color: #98d6a6;
  color: #1f7d41;
  background: #e8f8ee;
}

.admin-nav-status-pill.is-online {
  border-color: #95b2ea;
  color: #1f3f7d;
  background: #e8f0ff;
}

.admin-nav-status-pill.is-installed {
  border-color: #d0d9eb;
  color: #5e6d86;
  background: #f4f7fc;
}

.admin-nav-status-pill.is-offline {
  border-color: #d0d9eb;
  color: #5e6d86;
  background: #f4f7fc;
}

.admin-nav-item.admin-nav-divider-after {
  border-bottom: 0;
  margin-bottom: 0;
}

.admin-nav-item.is-compose {
  background: var(--admin-surface, var(--post-card-bg-single, #f9f2e4));
}

.admin-nav-item.is-compose:hover {
  background: var(--admin-hover, rgba(47, 95, 184, 0.11));
}

.admin-nav-item:hover {
  background: var(--admin-hover, rgba(47, 95, 184, 0.11));
  color: var(--admin-text, var(--text, #2f2517));
}

.admin-nav-item.is-active {
  background: var(--admin-hover, rgba(47, 95, 184, 0.11));
  color: var(--admin-text, var(--text, #2f2517));
  box-shadow: none;
  cursor: default;
}

.admin-nav-item[aria-selected="true"],
.admin-nav-item[aria-current="page"] {
  background: var(--admin-nav-selected-bg, var(--admin-hover, rgba(47, 95, 184, 0.11)));
  color: var(--admin-nav-selected-text, var(--admin-text, var(--text, #2f2517)));
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
  left: 0;
  right: 0;
  bottom: -1px;
  border-bottom: 1px solid var(--admin-border, var(--border, #d4c19c));
  pointer-events: none;
}

#admin-panel .admin-nav-list .admin-nav-item:hover {
  border: 0 !important;
  background: var(--admin-hover, rgba(47, 95, 184, 0.11)) !important;
  color: var(--admin-text, var(--text, #2f2517)) !important;
  transform: none !important;
}

#admin-panel .admin-nav-list .admin-nav-item.is-active {
  border: 0 !important;
}

#admin-panel .admin-nav-list .admin-nav-item[aria-selected="true"],
#admin-panel .admin-nav-list .admin-nav-item[aria-current="page"] {
  border: 0 !important;
  background: var(--admin-nav-selected-bg, var(--admin-hover, rgba(47, 95, 184, 0.11))) !important;
  color: var(--admin-nav-selected-text, var(--admin-text, var(--text, #2f2517))) !important;
  box-shadow: none !important;
  transform: none !important;
  cursor: default !important;
}

#admin-panel .admin-nav-list .admin-nav-item[aria-selected="true"]:hover,
#admin-panel .admin-nav-list .admin-nav-item[aria-current="page"]:hover {
  background: var(--admin-nav-selected-bg, var(--admin-hover, rgba(47, 95, 184, 0.11))) !important;
  color: var(--admin-nav-selected-text, var(--admin-text, var(--text, #2f2517))) !important;
}

#admin-panel .admin-nav-list .admin-nav-item.is-compose {
  background: var(--admin-surface, var(--post-card-bg-single, #f9f2e4)) !important;
}

#admin-panel .admin-nav-list .admin-nav-item.is-compose:hover {
  background: var(--admin-hover, rgba(47, 95, 184, 0.11)) !important;
}

.admin-content {
  --admin-content-pad-left: 0.7rem;
  --admin-content-pad-right: 0.72rem;
  min-width: 0;
  min-height: calc(100vh - 3.25rem);
  padding: 0 var(--admin-content-pad-right) 0 var(--admin-content-pad-left);
  background: var(--admin-bg, var(--bg, #f3e9d7));
}

#admin-panel.account-only {
  grid-template-columns: minmax(0, 1fr);
}

#admin-panel.account-only .admin-sidebar {
  display: none;
}

#admin-panel.account-only .admin-sidebar-reveal {
  display: none !important;
}

.admin-section {
  display: none;
}

.admin-section.is-active {
  display: block;
}

.admin-section.is-active.is-switch-animating {
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

[data-admin-section="settings"] .field-row,
[data-admin-section="zaps"] .field-row {
  display: grid;
  grid-template-columns: minmax(12rem, max-content) minmax(0, 1fr);
  align-items: center;
  gap: 0.04rem 0.44rem;
  margin-bottom: 0.08rem;
}

[data-admin-section="settings"] .field-row {
  grid-template-columns: 13.5rem minmax(0, 1fr);
  gap: 0.04rem 0.72rem;
}

[data-admin-section="settings"] .settings-inline-control-row {
  display: grid !important;
  grid-template-columns: 13.5rem minmax(0, 1fr) !important;
  align-items: center;
  gap: 0.04rem 0.72rem;
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

[data-admin-section="settings"] .field-row > label,
[data-admin-section="zaps"] .field-row > label {
  margin-bottom: 0;
}

[data-admin-section="settings"] .field-row > label,
[data-admin-section="settings"] .field-row > .setting-label {
  grid-column: 1;
}

[data-admin-section="settings"] .settings-inline-control-row > label {
  grid-column: 1;
  margin-bottom: 0;
}

[data-admin-section="settings"] .field-row > input,
[data-admin-section="settings"] .field-row > select,
[data-admin-section="zaps"] .field-row > input,
[data-admin-section="zaps"] .field-row > select {
  justify-self: start;
}

[data-admin-section="settings"] .field-row > input,
[data-admin-section="settings"] .field-row > select,
[data-admin-section="settings"] .field-row > .checkbox-control {
  grid-column: 2;
}

[data-admin-section="settings"] .settings-inline-control-row > input,
[data-admin-section="settings"] .settings-inline-control-row > select {
  grid-column: 2;
  justify-self: start;
}

[data-admin-section="settings"] .setting-label,
[data-admin-section="zaps"] .setting-label {
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
  justify-self: start;
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
  inline-size: clamp(14rem, 24vw, 19rem);
  max-inline-size: min(19rem, calc(100vw - 1.2rem));
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

[data-admin-section="zaps"] .grid-two {
  grid-template-columns: repeat(auto-fit, minmax(14rem, max-content));
}

[data-admin-section="settings"] #site-title {
  inline-size: min(100%, 16rem);
  width: min(100%, 16rem);
  max-inline-size: 16rem;
  max-width: 16rem;
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
  inline-size: min(100%, 10.5rem);
  width: min(100%, 10.5rem);
  max-inline-size: 10.5rem;
  max-width: 10.5rem;
}

[data-admin-section="queue"] #drip-interval,
[data-admin-section="queue"] #drip-randomness,
[data-admin-section="zaps"] #zap-default-amount-sats,
[data-admin-section="settings"] #feed-items {
  inline-size: 5rem !important;
  width: 5rem !important;
  max-inline-size: 5rem !important;
  max-width: 5rem !important;
}

[data-admin-section="settings"] h4 {
  margin-bottom: 0.26rem;
}

[data-admin-section="settings"] .settings-subhead {
  margin: 0.02rem 0 0.42rem;
}

[data-admin-section="settings"] .grid-two {
  gap: 0.3rem 0.62rem;
}

[data-admin-section="settings"] .sub-card-feeds {
  border-top: 0;
  padding-top: 0.34rem;
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
[data-admin-section="zaps"] input[type="text"],
[data-admin-section="zaps"] input[type="number"],
[data-admin-section="zaps"] select,
[data-admin-section="settings"] select {
  font-size: 0.88rem;
  line-height: 1.2;
  padding: 0.34rem 0.56rem;
  min-height: 2.06rem;
  border-radius: 8px;
}

[data-admin-section="settings"] input[type="text"],
[data-admin-section="settings"] input[type="number"],
[data-admin-section="settings"] select {
  width: auto !important;
  max-width: 100%;
}

.zaps-runtime-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 0.9rem;
}

.zaps-install-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.zaps-runtime-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, max-content));
  gap: 0.75rem;
  align-items: start;
}

.zaps-runtime-card {
  padding: 0.8rem 0.9rem;
  border-radius: 14px;
  border: 1px solid var(--table-border, rgba(120, 92, 45, 0.18));
  background: color-mix(in srgb, var(--card-bg) 92%, rgba(255, 255, 255, 0.5));
  min-width: 10.5rem;
}

.zaps-runtime-card .zaps-runtime-action {
  margin-top: 0.55rem;
}

.zaps-runtime-card strong {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}

.zaps-runtime-value {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}

.zaps-runtime-value.is-ok {
  color: color-mix(in srgb, var(--link) 68%, #264f2f);
}

.zaps-runtime-value.is-warn {
  color: color-mix(in srgb, #875e12 70%, var(--text));
}

.zaps-runtime-log {
  grid-column: 1 / -1;
  margin: 0;
  padding: 0.85rem 0.95rem;
  border-radius: 14px;
  border: 1px solid var(--table-border, rgba(120, 92, 45, 0.18));
  background: rgba(64, 45, 18, 0.08);
  color: var(--text);
  font: 0.86rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

[data-admin-section="account"] {
  --account-label-col: 9.4rem;
}

[data-admin-section="account"] #account-player-name {
  inline-size: clamp(6rem, 16vw, 12rem) !important;
  width: clamp(6rem, 16vw, 12rem) !important;
  max-inline-size: 12rem !important;
}

[data-admin-section="account"] .field-row {
  display: grid;
  grid-template-columns: var(--account-label-col) minmax(0, 1fr);
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
  margin: 0.12rem 0 0.34rem;
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
  display: flex;
  width: min(100%, 42rem);
  max-width: 100%;
  align-items: stretch;
  gap: 0.36rem;
}

[data-admin-section="account"] .account-pubkey-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  width: min(100%, 42rem);
  max-width: 100%;
}

[data-admin-section="account"] .account-nostr-row #account-nostr-pubkey {
  width: 100%;
  min-width: 0;
  padding-right: 4rem;
}

#admin-panel #btn-account-pubkey-toggle.unobtrusive-icon-button {
  position: absolute;
  right: 2.2rem;
  top: 50%;
  transform: translateY(-50%);
  min-width: 1.5rem;
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid transparent;
  background: transparent !important;
  border-radius: 6px;
  padding: 0;
  color: var(--admin-text, var(--text));
  box-shadow: none;
  z-index: 2;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}

#admin-panel #btn-account-pubkey-toggle.unobtrusive-icon-button:hover,
#admin-panel #btn-account-pubkey-toggle.unobtrusive-icon-button:focus-visible {
  background: rgba(247, 245, 238, 0.96) !important;
  border-color: rgba(160, 146, 116, 0.34);
  color: var(--admin-text, var(--text));
}

#admin-panel #btn-account-pubkey-toggle.unobtrusive-icon-button .eye-closed {
  display: none;
}

#admin-panel #btn-account-pubkey-toggle.unobtrusive-icon-button.is-visible .eye-open {
  display: none;
}

#admin-panel #btn-account-pubkey-toggle.unobtrusive-icon-button.is-visible .eye-closed {
  display: block;
}

#admin-panel #btn-account-pubkey-copy.unobtrusive-icon-button {
  position: absolute;
  right: 0.34rem;
  top: 50%;
  transform: translateY(-50%);
  min-width: 1.5rem;
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid transparent;
  background: transparent !important;
  border-radius: 6px;
  padding: 0;
  color: var(--admin-text, var(--text));
  box-shadow: none;
  z-index: 2;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}

#admin-panel #btn-account-pubkey-copy.unobtrusive-icon-button:hover {
  background: rgba(247, 245, 238, 0.96) !important;
  border-color: rgba(160, 146, 116, 0.34);
  color: var(--admin-text, var(--text));
}

#admin-panel #btn-account-pubkey-copy.unobtrusive-icon-button:focus-visible {
  outline: none;
  background: rgba(247, 245, 238, 0.96) !important;
  border-color: rgba(160, 146, 116, 0.4);
  box-shadow: 0 0 0 2px rgba(198, 181, 145, 0.28);
}

#admin-panel #btn-account-pubkey-copy.unobtrusive-icon-button svg {
  width: 0.86rem;
  height: 0.86rem;
}

.account-ssh-optional {
  margin: 0;
  inline-size: min(100%, 42rem);
  max-inline-size: 100%;
}

.account-ssh-description {
  margin: 0;
}

.account-ssh-toggle {
  font-size: 0.84rem;
  font-weight: 700;
  color: #1f335f;
  line-height: 1.25;
}

.account-ssh-body {
  margin-top: 0.28rem;
  display: grid;
  gap: 0.22rem;
}

.account-passkey-wrap {
  display: grid;
  gap: 0.22rem;
}

.account-passkey-description {
  margin: 0.2rem 0 0;
}

.account-row {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

[data-admin-section="account"] .account-passkey-row {
  display: grid;
  grid-template-columns: var(--account-label-col) minmax(0, 1fr);
  align-items: center;
  gap: 0.18rem 0.52rem;
  margin-bottom: 0.76rem;
}

[data-admin-section="account"] .account-passkey-row > label {
  margin-bottom: 0;
}

[data-admin-section="account"] .account-passkey-row > label .inline-tip {
  margin-left: 0.24rem;
}

[data-admin-section="account"] .account-passkey-row .account-row {
  justify-self: start;
}

[data-admin-section="account"] .account-passkey-wrap {
  grid-column: 2;
  justify-self: start;
}

[data-admin-section="account"] #btn-save-account,
[data-admin-section="account"] #btn-bind-passkey,
[data-admin-section="account"] #btn-generate-ssh,
[data-admin-section="account"] #btn-link-ssh {
  width: auto;
  min-width: 0;
  min-height: 2rem;
  height: 2rem;
  padding: 0.28rem 0.72rem;
  font-size: 0.86rem;
  line-height: 1.1;
}

[data-admin-section="account"] .account-ssh-row {
  align-items: start;
}

[data-admin-section="account"] .account-ssh-row > label {
  margin-top: 0;
}

[data-admin-section="account"] .account-ssh-row > .account-ssh-optional {
  grid-column: 2;
  justify-self: start;
  margin-top: 0;
}

[data-admin-section="account"] #account-ssh-public-key {
  min-height: 7.2rem;
  inline-size: 100%;
  width: 100%;
  max-inline-size: 100%;
}

[data-admin-section="account"] .account-ssh-note,
[data-admin-section="account"] .account-ssh-actions {
  grid-column: auto;
  justify-self: start;
}

[data-admin-section="account"] .account-ssh-note {
  margin: 0.3rem 0 0.2rem;
  white-space: nowrap;
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
  margin-top: 0.16rem;
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
  max-height: 8rem;
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
  gap: 0.24rem;
  flex-wrap: wrap;
  margin-bottom: 0;
  padding: 0.34rem 0.42rem;
  border: 0;
  border-bottom: 1px solid var(--admin-border, var(--border));
  border-radius: 0;
  background: color-mix(in srgb, var(--admin-accent, #2f5fb8) 8%, var(--admin-surface, var(--post-card-bg-single)) 92%);
}

.toolbar .toolbar-button {
  width: 2rem;
  min-width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--admin-accent-strong, var(--admin-accent, #2f5fb8));
  font-size: 0.8rem;
  font-weight: 650;
  padding: 0;
  box-shadow: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.toolbar .toolbar-button:hover,
.toolbar .toolbar-button:focus-visible {
  outline: 0;
  background: color-mix(in srgb, var(--admin-accent, #2f5fb8) 18%, var(--admin-surface, var(--post-card-bg-single)) 82%);
  color: var(--admin-text, var(--text));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--admin-accent, #2f5fb8) 40%, var(--admin-border, var(--border)) 60%);
}

.toolbar .tb-icon {
  width: 1.05rem;
  height: 1.05rem;
  stroke: currentColor;
  flex: 0 0 auto;
}

.sr-only {
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
  min-height: 2rem;
  border: 1px solid #b8caeb;
  border-radius: 9px;
  background: #fff;
  padding: 0.06rem 0.4rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.34rem;
  overflow: hidden;
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

.tag-editor-pills:empty {
  display: none;
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
  min-width: 0;
  inline-size: auto !important;
  flex: 1 1 auto;
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

#admin-panel #post-tags-input.tag-editor-input {
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  -webkit-box-shadow: none !important;
  outline: none !important;
  -webkit-appearance: none;
  appearance: none;
  inline-size: 100% !important;
  width: 100% !important;
  min-width: 0 !important;
  flex: 1 1 auto !important;
  padding: 0.04rem 0 !important;
  line-height: 1.35 !important;
  min-height: 1.85rem !important;
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
  margin-top: 0.86rem;
  margin-bottom: 0.02rem;
}

.scheduled-picker-row {
  display: inline-flex;
  align-items: center;
  gap: 0.36rem;
}

.scheduled-picker-row #post-scheduled-at {
  width: auto;
}

#admin-panel #btn-scheduled-picker {
  width: 2rem;
  min-width: 2rem;
  height: 2rem;
  padding: 0;
}

.scheduled-help {
  margin: 0.22rem 0 0;
  font-size: 0.79rem;
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

#admin-panel #btn-delete-current.unobtrusive-icon-button {
  min-width: 2rem;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 0 !important;
  background: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  color: var(--admin-danger, var(--danger)) !important;
  -webkit-text-fill-color: var(--admin-danger, var(--danger)) !important;
}

#admin-panel #btn-delete-current.unobtrusive-icon-button:hover,
#admin-panel #btn-delete-current.unobtrusive-icon-button:focus-visible {
  border: 0 !important;
  background: var(--danger-soft, rgba(180, 35, 24, 0.14)) !important;
  background-image: none !important;
  color: var(--admin-danger, var(--danger)) !important;
  -webkit-text-fill-color: var(--admin-danger, var(--danger)) !important;
  box-shadow: none !important;
}

#admin-panel button.icon-danger:hover {
  border-color: #c27c7b;
  background: #fff2f2;
  color: #8f2f2d;
}

#admin-panel button:not(.unobtrusive-icon-button):not(.admin-nav-item):not(.moderation-age-option) {
  border: 1px solid #b8c9ea;
  border-radius: 10px;
  background: #fff;
  color: #183260;
  font-size: 0.86rem;
  font-weight: 520;
  padding: 0.34rem 0.72rem;
  line-height: 1.15;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

#admin-panel button:not(.unobtrusive-icon-button):not(.admin-nav-item):not(.moderation-age-option):hover:not(:disabled) {
  background: #eaf2ff;
  border-color: #8ca9e2;
  color: #102c5f;
}

#admin-panel .row-actions button.primary {
  font-size: 0.84rem;
  font-weight: 520;
  padding: 0.34rem 0.68rem;
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

#admin-panel .row-head .muted {
  white-space: nowrap;
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
  overflow: hidden;
  line-height: 1;
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

#admin-panel .local-drip-toggle.unobtrusive-icon-button {
  min-width: 2rem;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent !important;
  color: var(--admin-text, var(--text)) !important;
  -webkit-text-fill-color: var(--admin-text, var(--text)) !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

#admin-panel .local-drip-toggle.unobtrusive-icon-button:hover,
#admin-panel .local-drip-toggle.unobtrusive-icon-button:focus-visible {
  background: var(--admin-hover, var(--nav-link-hover)) !important;
  border-color: var(--admin-border, var(--border));
  color: var(--admin-text, var(--text)) !important;
  -webkit-text-fill-color: var(--admin-text, var(--text)) !important;
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

[data-admin-section="nostr-pages"] {
  margin-left: calc(-1 * var(--admin-content-pad-left, 0.7rem));
  margin-right: calc(-1 * var(--admin-content-pad-right, 0.72rem));
}

[data-admin-section="users"] .row-head {
  padding: 0 0.7rem;
}

[data-admin-section="users"] .section-head {
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
  align-items: flex-start;
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
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1f335f;
}

.draft-row-open {
  display: inline-block;
  color: #163161;
  font-weight: 400;
  font-size: 1rem;
  line-height: 1.32;
  padding: 0;
  margin: 0;
  min-width: 0;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
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
  color: #4f4a40;
  font-size: 0.98rem;
  line-height: 1.32;
  margin-top: 0.12rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}

.draft-row-actions {
  display: inline-flex;
  align-items: flex-start;
  gap: 0.4rem;
  flex: 0 0 auto;
  padding-top: 0.05rem;
}

#admin-panel .draft-row-actions button {
  width: auto;
}

.nostr-pages-list {
  display: block;
  border: 0;
  border-radius: 0;
  overflow: visible;
  background: transparent;
  margin: 0;
}

.nostr-pages-rows {
  display: block;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--admin-border, #cdbd95);
  border-bottom: 1px solid var(--admin-border, #cdbd95);
  border-right: 1px solid var(--admin-border, #cdbd95);
}

.nostr-pages-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.6rem;
  padding: 0.24rem 0;
  border-bottom: 1px solid var(--admin-border, #cdbd95);
  min-height: 2rem;
}

.nostr-pages-header-leading {
  display: inline-flex;
  align-items: center;
  width: 2rem;
  flex: 0 0 2rem;
}

.nostr-pages-header-name {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  flex: 1 1 auto;
  text-align: center;
}

.nostr-pages-header-path {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14rem;
  min-width: 14rem;
  flex: 0 0 14rem;
  text-align: center;
}

.nostr-pages-header-type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 11.5rem;
  min-width: 11.5rem;
  flex: 0 0 11.5rem;
  text-align: center;
}

.nostr-pages-header-settings {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 11.5rem;
  min-width: 11.5rem;
  flex: 0 0 11.5rem;
  text-align: center;
}

.nostr-pages-header-type-label {
  color: var(--admin-muted, #6a7488);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1.1;
}

.nostr-pages-header-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  width: 2.35rem;
  min-width: 2.35rem;
  flex: 0 0 2.35rem;
  padding-right: 0.14rem;
}

.nostr-pages-header-nav-col {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 8.8rem;
  min-width: 8.8rem;
  flex: 0 0 8.8rem;
  text-align: center;
}

.nostr-pages-header-publish-col {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 10rem;
  min-width: 10rem;
  flex: 0 0 10rem;
  text-align: center;
}

.nostr-pages-header-nav {
  color: var(--admin-muted, #6a7488);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1.1;
}

.nostr-pages-header-spacer {
  width: 2rem;
  height: 1px;
}

.nostr-page-row {
  border: 0;
  border-radius: 0;
  background: #fff;
  padding: 0.56rem 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.6rem;
  min-height: 2.9rem;
}

.nostr-page-row:nth-child(odd) {
  background: #f5f8ff;
}

.nostr-page-row + .nostr-page-row {
  border-top: 0;
}

.nostr-page-leading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  flex: 0 0 2rem;
  align-self: center;
}

.nostr-page-name-col {
  min-width: 0;
  flex: 1 1 auto;
}

.nostr-page-path-col {
  width: 14rem;
  min-width: 14rem;
  flex: 0 0 14rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.nostr-page-type-col {
  width: 11.5rem;
  min-width: 11.5rem;
  flex: 0 0 11.5rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.32rem;
}

.nostr-page-settings-col {
  width: 11.5rem;
  min-width: 11.5rem;
  flex: 0 0 11.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.32rem;
  text-align: center;
}

.nostr-page-title-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  max-width: 100%;
}

.nostr-page-title a {
  color: #163161;
  text-decoration: none;
  background: transparent !important;
}

.nostr-page-title a:hover,
.nostr-page-title a:focus-visible {
  text-decoration: underline;
  background: transparent !important;
}

.nostr-page-kind-badge {
  display: inline-flex;
  align-items: center;
  align-self: center;
  border-radius: 999px;
  border: 1px solid var(--admin-border, #c7d6f3);
  background: var(--admin-surface-alt, #f5f8ff);
  color: var(--admin-text, #3b4a63);
  font-size: 0.75rem;
  line-height: 1.1;
  padding: 0.15rem 0.48rem;
  white-space: nowrap;
}

.nostr-page-kind-badge.is-type-blog {
  border-color: color-mix(in srgb, #2563eb 35%, var(--admin-border, #c7d6f3) 65%);
  background: color-mix(in srgb, #2563eb 12%, var(--admin-surface-alt, #f5f8ff) 88%);
  color: #1f3f77;
}

.nostr-page-kind-badge.is-type-nip23 {
  border-color: color-mix(in srgb, #7c3aed 35%, var(--admin-border, #c7d6f3) 65%);
  background: color-mix(in srgb, #7c3aed 11%, var(--admin-surface-alt, #f5f8ff) 89%);
  color: #5e3d9a;
}

.nostr-page-kind-badge.is-type-public-ranking {
  border-color: color-mix(in srgb, #0f766e 38%, var(--admin-border, #c7d6f3) 62%);
  background: color-mix(in srgb, #0f766e 11%, var(--admin-surface-alt, #f5f8ff) 89%);
  color: #1c5d57;
}

.nostr-page-kind-badge.is-type-contact {
  border-color: color-mix(in srgb, #92400e 34%, var(--admin-border, #c7d6f3) 66%);
  background: color-mix(in srgb, #f59e0b 13%, var(--admin-surface-alt, #f5f8ff) 87%);
  color: #7a3f18;
}

.nostr-page-kind-badge.is-type-list {
  border-color: color-mix(in srgb, #4b5563 30%, var(--admin-border, #c7d6f3) 70%);
  background: color-mix(in srgb, #94a3b8 10%, var(--admin-surface-alt, #f5f8ff) 90%);
  color: #495464;
}

.nostr-page-path {
  color: #7a808c;
  display: inline-block;
  font-family: "Courier New", Courier, "Liberation Mono", monospace;
  letter-spacing: 0.01em;
}

.nostr-page-nav-title-label {
  color: var(--admin-muted, #6a7488);
  font-size: 0.82rem;
}

#admin-panel .nostr-page-nav-title-edit {
  color: var(--accent, #2d4f8c) !important;
  font-size: 0.82rem;
  font-weight: 500;
  line-height: 1.15;
  text-decoration: none;
}

#admin-panel .nostr-page-nav-title-edit:hover,
#admin-panel .nostr-page-nav-title-edit:focus-visible {
  text-decoration: underline;
  color: var(--accent, #2d4f8c) !important;
}

.nostr-page-title-change {
  margin-left: 0.08rem;
  display: inline-flex;
  align-items: center;
}

.nostr-page-nav-title-edit-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

#admin-panel .nostr-page-nav-title-input {
  width: min(8rem, 100%);
  min-width: 6rem;
  max-width: 100%;
  height: 2rem !important;
  padding: 0.26rem 0.52rem;
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.2;
}

#admin-panel .nostr-page-nav-title-ok {
  min-width: 0;
  width: auto;
  height: 2rem;
  padding: 0.2rem 0.56rem;
  font-size: 0.78rem;
  line-height: 1;
}

#admin-panel .nostr-page-path-edit {
  color: var(--accent, #2d4f8c) !important;
  font-size: 0.84rem;
  font-weight: 500;
  line-height: 1.15;
  text-decoration: none;
}

#admin-panel .nostr-page-path-edit:hover,
#admin-panel .nostr-page-path-edit:focus-visible {
  text-decoration: underline;
  color: var(--accent, #2d4f8c) !important;
}

.nostr-page-posts-count {
  color: var(--admin-muted, #6a7488);
  font-size: 0.82rem;
  text-align: left;
  white-space: nowrap;
}

.nostr-page-settings-blog-tools {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 0.4rem;
  white-space: nowrap;
}

.nostr-page-default-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  color: var(--admin-muted, #6a7488);
  font-size: 0.82rem;
}

.nostr-page-default-tag > span {
  white-space: nowrap;
}

#admin-panel .nostr-page-default-tag select {
  width: auto;
  min-width: 0;
  max-width: 12rem;
  height: 1.8rem;
  padding: 0.14rem 1.7rem 0.14rem 0.48rem;
  font-size: 0.8rem;
  line-height: 1.1;
}

#admin-panel .nostr-page-posts-link {
  color: var(--admin-accent, var(--accent, #2d4f8c)) !important;
  font-size: 0.82rem;
  text-decoration: none;
}

#admin-panel .nostr-page-posts-link:hover,
#admin-panel .nostr-page-posts-link:focus-visible {
  text-decoration: underline;
}

#admin-panel .nostr-page-slug-input {
  width: min(12rem, 100%);
  min-width: 8rem;
  max-width: 100%;
  height: 2rem !important;
  padding: 0.26rem 0.55rem;
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.2;
  font-family: "Courier New", Courier, "Liberation Mono", monospace;
}

#admin-panel .nostr-page-path-ok {
  min-width: 0;
  width: auto;
  height: 2rem;
  padding: 0.2rem 0.56rem;
  font-size: 0.78rem;
  line-height: 1;
}

.nostr-page-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  width: 2.35rem;
  min-width: 2.35rem;
  flex: 0 0 2.35rem;
  align-self: center;
  padding-right: 0.14rem;
}

.nostr-page-row.is-dragging {
  opacity: 0.65;
}

.nostr-page-drag-handle {
  cursor: grab;
}

.nostr-page-drag-handle:active {
  cursor: grabbing;
}

.nostr-page-drag-handle .drag-grip-icon-svg {
  width: 0.95rem;
  height: 0.95rem;
  color: currentColor;
}

.nostr-page-drag-handle .drag-grip-icon-svg circle {
  fill: currentColor;
}

.nostr-page-nav-col {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 8.8rem;
  min-width: 8.8rem;
  flex: 0 0 8.8rem;
}

.nostr-page-publish-col {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 10rem;
  min-width: 10rem;
  flex: 0 0 10rem;
}

.nostr-page-publish-empty {
  display: inline-block;
  width: 1px;
  height: 1px;
}

#admin-panel .nostr-page-publish-btn {
  min-width: 0;
  width: auto;
  height: 1.85rem;
  padding: 0.14rem 0.5rem;
  font-size: 0.78rem;
  line-height: 1.1;
}

#admin-panel .nostr-page-actions > button,
#admin-panel .nostr-page-actions > .post-menu > button {
  width: auto;
  min-width: 2rem;
  height: 2rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: static;
  transform: none;
}

#admin-panel .nostr-page-actions > button:hover,
#admin-panel .nostr-page-actions > .post-menu > button:hover {
  transform: none;
}

#admin-panel .nostr-page-leading button:hover {
  transform: none;
}

#admin-panel .nostr-page-nav-col .nostr-page-nav-check {
  margin-right: 0;
}

#admin-panel .nostr-page-nav-col .nostr-page-nav-check-only {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
}

#admin-panel .nostr-page-nav-col .nostr-page-nav-check-only > span {
  display: none;
}

#admin-panel .nostr-page-nav-col .nostr-page-nav-check-only input[type="checkbox"] {
  margin: 0;
}

#admin-panel .nostr-page-actions .icon-danger {
  margin-right: 0;
}

#admin-panel .nostr-page-leading .nostr-page-drag-handle,
#admin-panel .nostr-page-actions .unobtrusive-icon-button {
  min-width: 2rem !important;
  width: 2rem !important;
  height: 2rem !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  border-radius: 8px !important;
  box-shadow: none !important;
  color: var(--admin-text, var(--text)) !important;
}

#admin-panel .nostr-page-actions .post-menu-panel button {
  justify-content: flex-start;
  min-width: 0;
  height: auto;
}

#admin-panel .nostr-page-leading .nostr-page-drag-handle {
  cursor: grab;
  color: var(--admin-text, var(--text)) !important;
  -webkit-text-fill-color: var(--admin-text, var(--text)) !important;
}

#admin-panel .nostr-page-leading .nostr-page-drag-handle:active {
  cursor: grabbing;
}

#admin-panel .nostr-page-leading .nostr-page-drag-handle:hover,
#admin-panel .nostr-page-leading .nostr-page-drag-handle:focus-visible,
#admin-panel .nostr-page-actions .unobtrusive-icon-button:hover,
#admin-panel .nostr-page-actions .unobtrusive-icon-button:focus-visible {
  background: var(--admin-hover, rgba(90, 116, 170, 0.2)) !important;
}

[data-admin-section="nostr-pages"] .row-head .muted {
  white-space: nowrap;
}

[data-admin-section="nostr-pages"] .admin-card {
  padding-left: 0;
  padding-right: 0;
}

[data-admin-section="nostr-pages"] .demo-box.admin-card {
  padding-left: 0 !important;
  padding-right: 0 !important;
}

[data-admin-section="nostr-pages"] .row-head {
  padding-left: 0.7rem;
  padding-right: 0.7rem;
}

.nostr-pages-table-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin: 0 0.7rem 0.42rem;
}

[data-admin-section="posts"] .admin-card {
  padding-left: 0;
  padding-right: 0;
  margin-left: calc(-1 * var(--admin-content-pad-left, 0.7rem));
  margin-right: calc(-1 * var(--admin-content-pad-right, 0.72rem));
}

[data-admin-section="posts"] .demo-box.admin-card {
  padding-left: 0 !important;
  padding-right: 0 !important;
}

[data-admin-section="posts"] .row-head {
  padding-left: 0.7rem;
  padding-right: 0.7rem;
}

[data-admin-section="moderation"] .admin-card {
  padding-left: 0;
  padding-right: 0;
}

[data-admin-section="moderation"] .demo-box.admin-card {
  padding-left: 0 !important;
  padding-right: 0 !important;
}

[data-admin-section="moderation"] .row-head {
  padding-left: 0.7rem;
  padding-right: 0.7rem;
}

#admin-panel #moderation-list.posts-list {
  border-top: 1px solid var(--admin-border, #cdbd95) !important;
  border-bottom: 1px solid var(--admin-border, #cdbd95) !important;
  border-left: 0 !important;
  border-right: 1px solid var(--admin-border, #cdbd95) !important;
  box-shadow: none !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  width: 100% !important;
}

#admin-panel #moderation-list .post-row {
  margin-left: 0 !important;
  margin-right: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
}

[data-admin-section="files"] .admin-card {
  padding-left: 0;
  padding-right: 0;
  margin-left: calc(-1 * var(--admin-content-pad-left, 0.7rem));
  margin-right: calc(-1 * var(--admin-content-pad-right, 0.72rem));
}

[data-admin-section="files"] .demo-box.admin-card {
  padding-left: 0 !important;
  padding-right: 0 !important;
}

[data-admin-section="files"] .row-head {
  padding-left: 0.7rem;
  padding-right: 0.7rem;
  border-bottom: 0 !important;
  box-shadow: none !important;
}

.files-table-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0 0.7rem 0.42rem;
}

.files-upload-summary {
  min-height: 1.15rem;
  color: var(--muted, #6b7280);
  font-size: 0.92rem;
  line-height: 1.2;
  text-align: right;
}

.files-dropzone {
  min-height: 16rem;
  padding: 0 0 0.9rem;
  border-top: 0;
  transition: background 140ms ease, border-color 140ms ease;
}

.files-dropzone.is-drop-active {
  background: rgba(196, 169, 97, 0.1);
  box-shadow: inset 0 1px 0 rgba(122, 92, 31, 0.18);
}

.files-upload-jobs {
  display: grid;
  gap: 0.55rem;
  padding: 0.4rem 0.9rem 0.75rem;
  border-bottom: 1px solid rgba(122, 92, 31, 0.12);
}

.files-upload-job {
  display: grid;
  gap: 0.32rem;
}

.files-upload-job.is-done .files-upload-job-status {
  color: #2a7a3b;
}

.files-upload-job.is-failed .files-upload-job-status {
  color: #9a2a2a;
}

.files-upload-job-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.92rem;
}

.files-upload-job-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.files-upload-job-status {
  color: var(--muted, #6b7280);
  white-space: nowrap;
}

.files-upload-job-bar {
  block-size: 0.42rem;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(122, 92, 31, 0.12);
}

.files-upload-job-fill {
  block-size: 100%;
  inline-size: 0%;
  border-radius: inherit;
  background: #2f63b7;
  transition: inline-size 120ms linear;
}

.files-upload-job.is-failed .files-upload-job-fill {
  background: #b24734;
}

.files-list-empty {
  padding: 0.95rem;
}

.files-table {
  display: block;
  width: 100%;
}

.file-table-header {
  display: grid;
  grid-template-columns: minmax(16rem, 1.65fr) minmax(6rem, 0.5fr) minmax(8rem, 0.75fr) minmax(8rem, 0.72fr) minmax(14rem, 1.08fr);
  gap: 0.7rem;
  align-items: center;
  padding: 0.35rem 0.95rem 0.4rem;
  border-bottom: 1px solid var(--admin-border, #d2def3);
}

.file-table-header .file-col {
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-col-head {
  color: var(--admin-muted, #6a7488);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1.1;
  text-align: center;
}

#admin-panel .post-row.file-row {
  display: grid;
  grid-template-columns: minmax(16rem, 1.65fr) minmax(6rem, 0.5fr) minmax(8rem, 0.75fr) minmax(8rem, 0.72fr) minmax(14rem, 1.08fr);
  align-items: center;
  gap: 0.7rem;
  padding: 0.72rem 0.95rem;
  background: var(--card-bg, rgba(255, 255, 255, 0.55));
  margin-left: 0 !important;
  margin-right: 0 !important;
  width: 100% !important;
  box-sizing: border-box;
}

.file-col {
  min-width: 0;
}

.file-col-name {
  min-width: 0;
  display: grid;
  gap: 0.2rem;
}

.file-col-size,
.file-col-type,
.file-col-date {
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-row-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.file-row-title-link {
  color: inherit;
  text-decoration: none;
}

.file-row-title-link:hover,
.file-row-title-link:focus-visible {
  text-decoration: underline;
}

.file-row-submeta {
  color: var(--muted, #6b7280);
  font-size: 0.8rem;
  line-height: 1.15;
}

.file-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.14rem 0.48rem;
  border-radius: 999px;
  background: rgba(122, 92, 31, 0.08);
  color: var(--muted, #6b7280);
  font-size: 0.8rem;
  line-height: 1.2;
}

.file-pill.is-public {
  background: rgba(47, 99, 183, 0.12);
  color: #234e96;
}

.file-pill.is-private {
  background: rgba(122, 92, 31, 0.12);
  color: #6e4f15;
}

.file-pill.is-uploading {
  background: rgba(47, 99, 183, 0.12);
  color: #234e96;
}

.file-row-uploading .file-pill.is-uploading {
  font-weight: 600;
}

.file-row-uploading.is-done .file-pill.is-uploading {
  background: rgba(42, 122, 59, 0.14);
  color: #1f6930;
}

.file-row-uploading.is-failed .file-pill.is-uploading {
  background: rgba(122, 92, 31, 0.12);
  color: #6e4f15;
}

.file-upload-inline {
  min-width: min(100%, 13.5rem);
  display: grid;
  gap: 0.22rem;
}

.file-upload-inline-meta {
  color: var(--muted, #6b7280);
  font-size: 0.8rem;
  line-height: 1.1;
}

.file-upload-inline-bar {
  block-size: 0.34rem;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(122, 92, 31, 0.12);
}

.file-upload-inline-fill {
  block-size: 100%;
  inline-size: 0%;
  border-radius: inherit;
  background: #2f63b7;
  transition: inline-size 120ms linear;
}

.file-row-uploading.is-failed .file-upload-inline-fill {
  background: #2f63b7;
}

.file-row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.42rem;
  flex: 0 0 auto;
}

.file-col-visibility {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.46rem;
  flex-wrap: wrap;
}

.file-row-actions .unobtrusive-icon-button[disabled] {
  opacity: 0.45;
}

#admin-panel .file-row-actions .unobtrusive-icon-button {
  min-width: 2rem;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent !important;
  color: var(--admin-text, var(--text)) !important;
  -webkit-text-fill-color: var(--admin-text, var(--text)) !important;
  box-shadow: none;
}

#admin-panel .file-row-actions .unobtrusive-icon-button:hover,
#admin-panel .file-row-actions .unobtrusive-icon-button:focus-visible {
  background: var(--admin-hover, var(--nav-link-hover)) !important;
  border: 0;
  color: var(--admin-text, var(--text)) !important;
  -webkit-text-fill-color: var(--admin-text, var(--text)) !important;
}

#admin-panel #btn-create-nostr-page {
  color: var(--nav-active-text, #fff) !important;
}

#admin-panel #btn-create-nostr-page:not(:disabled) {
  background-color: var(--button-primary-start, var(--admin-accent, var(--accent))) !important;
  background-image: var(--button-primary-overlay), linear-gradient(140deg, var(--button-primary-start, var(--admin-accent, var(--accent))) 0%, var(--button-primary-end, var(--admin-accent-strong, var(--accent-dark))) 100%) !important;
  border-color: var(--button-primary-border, var(--admin-accent-strong, var(--accent-dark))) !important;
  color: var(--button-primary-text, var(--nav-active-text, #fff)) !important;
  -webkit-text-fill-color: var(--button-primary-text, var(--nav-active-text, #fff)) !important;
}

#admin-panel #btn-create-nostr-page:not(:disabled):hover,
#admin-panel #btn-create-nostr-page:not(:disabled):focus-visible {
  background-color: var(--button-primary-hover-start, var(--admin-accent-strong, var(--accent-dark))) !important;
  background-image: var(--button-primary-overlay), linear-gradient(140deg, var(--button-primary-hover-start, var(--admin-accent-strong, var(--accent-dark))) 0%, var(--button-primary-hover-end, var(--admin-accent, var(--accent))) 100%) !important;
  border-color: var(--button-primary-border, var(--admin-accent-strong, var(--accent-dark))) !important;
  color: var(--button-primary-text, var(--nav-active-text, #fff)) !important;
  -webkit-text-fill-color: var(--button-primary-text, var(--nav-active-text, #fff)) !important;
}

#output-nostr-pages {
  display: none !important;
}

.users-list {
  display: block;
  border-top: 1px solid var(--admin-border, #cdbd95);
  border-bottom: 1px solid var(--admin-border, #cdbd95);
  border-left: 0;
  border-right: 1px solid var(--admin-border, #cdbd95);
  border-radius: 0;
  overflow: visible;
  background: transparent;
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 0;
}

#admin-panel #users-list.users-list {
  margin-right: 0 !important;
  width: 100% !important;
}

#admin-panel #drafts-list > .placeholder,
#admin-panel #queue-list > .placeholder,
#admin-panel #posts-list > .placeholder,
#admin-panel #files-list > .placeholder,
#admin-panel #moderation-list > .placeholder,
#admin-panel #users-list > .placeholder,
#admin-panel #nostr-pages-list > .placeholder {
  margin: 0;
  padding: 0.58rem 0.7rem 0.74rem;
}

#admin-panel .placeholder.table-empty {
  margin: 0;
  min-height: 3rem;
  padding: 0.72rem 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-style: italic;
  color: var(--admin-muted, var(--light-text));
}

#admin-panel #files-list.posts-list,
#admin-panel #moderation-list.posts-list {
  margin-left: 0 !important;
  margin-right: 0 !important;
  width: 100% !important;
}

#admin-panel #files-list.posts-list {
  border-top: 0 !important;
  border-top-width: 0 !important;
  border-top-style: none !important;
  border-right: 1px solid var(--admin-border, #cdbd95) !important;
  border-bottom: 1px solid var(--admin-border, #cdbd95) !important;
  border-left: 0 !important;
  box-shadow: none !important;
}

#admin-panel #files-list.posts-list .files-table,
#admin-panel #files-list.posts-list .file-table-header {
  border-top: 0 !important;
}

#admin-panel #files-list.posts-list .post-row.file-row:last-child {
  border-bottom: 0 !important;
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
  margin-left: 0 !important;
  margin-right: 0 !important;
  width: 100% !important;
}

.post-row {
  border: 0;
  border-radius: 0;
  background: #fff;
  padding: 0.48rem 0;
  margin-left: 0 !important;
  margin-right: 0 !important;
  width: 100% !important;
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
  padding-left: 0.42rem;
}

.post-row-title {
  color: #163161;
  font-weight: 700;
  max-width: min(52ch, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-row-open {
  border: 0;
  background: transparent;
  padding: 0;
  margin: 0;
  min-width: 0;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
}

#admin-panel .post-row-open:hover {
  text-decoration: underline;
  background: transparent;
}

#admin-panel .post-row-open:focus-visible {
  outline: 2px solid #7ea2e6;
  outline-offset: 2px;
  border-radius: 3px;
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
  padding-right: 0;
}

#admin-panel button.post-row-delete {
  min-width: 2.6rem;
  width: 2.6rem;
  height: 2.6rem;
  font-size: 16px;
  line-height: 1;
  border: 0;
  border-radius: 8px;
  background: transparent;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

#admin-panel button.post-row-delete .trash-icon-svg {
  width: 1.55rem;
  height: 1.55rem;
}

#admin-panel button.post-row-delete:hover,
#admin-panel button.post-row-delete:focus-visible {
  background: var(--danger-soft, rgba(180, 35, 24, 0.14));
}

#admin-panel button.post-row-delete:disabled {
  opacity: 0.45;
  cursor: default;
}

#admin-panel .post-menu {
  position: relative;
}

#admin-panel button.post-menu-trigger {
  min-width: 1.85rem;
  width: 1.85rem;
  height: 1.85rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  border-radius: 8px;
  padding: 0;
  color: var(--admin-text, var(--text));
}

#admin-panel button.post-menu-trigger .overflow-menu-icon-svg {
  width: 1.02rem;
  height: 1.02rem;
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
  background: var(--admin-surface, var(--post-card-bg-single));
  padding: 0.5rem 0.68rem;
  display: grid;
  grid-template-columns: minmax(12rem, 1.4fr) minmax(7.2rem, 0.72fr) minmax(8.2rem, 0.9fr) minmax(3.2rem, auto);
  align-items: center;
  gap: 0.6rem;
  min-height: 3rem;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.user-card.user-row-alt {
  background: var(--admin-surface-alt, var(--post-card-bg));
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
  flex: 0 1 auto;
  min-width: 0;
  display: grid;
  gap: 0.08rem;
}

.user-card-name {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.42rem;
  font-weight: 700;
  color: #163161;
  min-width: 0;
  overflow-wrap: anywhere;
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

.users-table-header {
  display: grid;
  grid-template-columns: minmax(12rem, 1.4fr) minmax(7.2rem, 0.72fr) minmax(8.2rem, 0.9fr) minmax(3.2rem, auto);
  gap: 0.6rem;
  align-items: center;
  padding: 0.35rem 0.68rem 0.42rem;
  border-bottom: 1px solid var(--admin-border, #d2def3);
}

.users-col {
  min-width: 0;
}

.users-col-head {
  color: var(--admin-muted, #6a7488);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1.1;
}

.users-col-created {
  display: flex;
  align-items: center;
}

.users-col-role {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.users-col-actions {
  display: inline-flex;
  justify-content: flex-end;
}

.user-card-actions {
  display: inline-flex;
  flex-wrap: nowrap;
  justify-content: flex-end;
  align-items: center;
  gap: 0.38rem;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
}

#admin-panel button.user-menu-trigger {
  min-width: 1.85rem;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 8px;
  padding: 0;
  color: var(--admin-text, var(--text));
}

#admin-panel button.user-menu-trigger .overflow-menu-icon-svg {
  width: 1.02rem;
  height: 1.02rem;
}

#admin-panel button.user-menu-trigger:hover,
#admin-panel button.user-menu-trigger:focus-visible {
  background: var(--admin-hover, var(--nav-link-hover));
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
  border-top: 0;
  margin: 0;
  transition: border-color 120ms ease, margin 120ms ease;
}

.users-list.is-dragging .user-drop-zone {
  border-top: 2px solid transparent;
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

.admin-inline-dialog-form input[type="text"],
.admin-inline-dialog-form input[type="number"],
.admin-inline-dialog-form input[type="datetime-local"],
.admin-inline-dialog-form select {
  box-sizing: border-box;
  width: 100%;
  min-height: 2.05rem;
  padding: 0.34rem 0.56rem;
  border: 1px solid var(--admin-border, var(--border));
  border-radius: 9px;
  background: var(--surface-raised, var(--admin-surface, var(--post-card-bg-single)));
  color: var(--admin-text, var(--text));
  font-size: 0.92rem;
  line-height: 1.2;
}

.admin-inline-dialog-form input[type="text"]:focus,
.admin-inline-dialog-form input[type="number"]:focus,
.admin-inline-dialog-form input[type="datetime-local"]:focus,
.admin-inline-dialog-form select:focus {
  outline: none;
  border-color: var(--focus-ring-strong, var(--admin-accent, var(--accent)));
  box-shadow: 0 0 0 3px var(--focus-ring, color-mix(in srgb, var(--admin-accent, var(--accent)) 20%, transparent));
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

.admin-nav-title-row {
  background: var(--admin-surface-alt, var(--post-card-bg)) !important;
  border-color: var(--admin-border, var(--border)) !important;
}

.admin-nav-title {
  color: var(--admin-text, var(--text)) !important;
}

#admin-panel .admin-sidebar-toggle,
#admin-panel .admin-sidebar-reveal {
  color: var(--admin-text, var(--text)) !important;
}

.admin-nav-item {
  color: var(--admin-text, var(--text)) !important;
}

.admin-nav-icon-slot {
  color: var(--admin-accent, var(--accent)) !important;
}

#admin-panel .admin-nav-list .admin-nav-item.is-compose {
  background: var(--admin-surface, var(--post-card-bg-single)) !important;
  background-image: none !important;
}

.admin-nav-item:hover,
.admin-nav-item.is-active,
.admin-nav-item[aria-selected="true"],
.admin-nav-item[aria-current="page"],
#admin-panel .admin-nav-list .admin-nav-item:hover,
#admin-panel .admin-nav-list .admin-nav-item[aria-selected="true"],
#admin-panel .admin-nav-list .admin-nav-item[aria-current="page"] {
  background: var(--admin-hover, var(--nav-link-hover)) !important;
  color: var(--admin-text, var(--text)) !important;
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
#admin-panel .output:not(:empty) {
  border-color: var(--admin-border, var(--border)) !important;
  background: var(--surface-raised, var(--admin-surface, var(--post-card-bg-single))) !important;
  color: var(--admin-text, var(--text)) !important;
}

#admin-panel .output:empty {
  display: none !important;
  min-height: 0 !important;
  margin-top: 0 !important;
}

#admin-panel [id^="output-"].output {
  display: none !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
}

.user-row,
.draft-row,
.post-row,
.nostr-page-row {
  background: var(--admin-surface, var(--post-card-bg-single)) !important;
}

#admin-panel .nostr-page-row {
  padding-left: 0 !important;
  padding-right: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  width: 100% !important;
}

#admin-panel .nostr-pages-list,
#admin-panel .nostr-pages-rows {
  margin-left: 0 !important;
  margin-right: 0 !important;
  width: 100% !important;
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
  color: var(--select-text, var(--admin-text, var(--text))) !important;
  -webkit-text-fill-color: var(--select-text, var(--admin-text, var(--text))) !important;
  color-scheme: var(--select-color-scheme, light);
}

#admin-panel select option,
#admin-panel select optgroup {
  background: var(--select-option-bg, var(--select-bg, var(--light-bg))) !important;
  color: var(--select-option-text, var(--admin-text, var(--text))) !important;
  -webkit-text-fill-color: var(--select-option-text, var(--admin-text, var(--text))) !important;
}

#admin-panel select option:disabled {
  color: var(--select-option-disabled-text, var(--admin-muted, var(--light-text))) !important;
  -webkit-text-fill-color: var(--select-option-disabled-text, var(--admin-muted, var(--light-text))) !important;
}

#admin-panel select option:checked {
  background: var(--select-option-selected-bg, var(--admin-accent, var(--accent))) !important;
  color: var(--select-option-selected-text, var(--nav-active-text, #fff)) !important;
  -webkit-text-fill-color: var(--select-option-selected-text, var(--nav-active-text, #fff)) !important;
}

#admin-panel select[multiple] option:checked,
#admin-panel select[size] option:checked {
  background: var(--select-option-selected-bg, var(--admin-accent, var(--accent))) !important;
  color: var(--select-option-selected-text, var(--nav-active-text, #fff)) !important;
  -webkit-text-fill-color: var(--select-option-selected-text, var(--nav-active-text, #fff)) !important;
  box-shadow: inset 0 0 0 999px var(--select-option-selected-bg, var(--admin-accent, var(--accent)));
}

#admin-panel select[multiple],
#admin-panel select[size] {
  background: var(--select-option-bg, var(--select-bg, var(--light-bg))) !important;
  color: var(--select-text, var(--admin-text, var(--text))) !important;
  -webkit-text-fill-color: var(--select-text, var(--admin-text, var(--text))) !important;
}

#admin-panel select[multiple] option,
#admin-panel select[size] option {
  color: var(--select-text, var(--admin-text, var(--text))) !important;
  -webkit-text-fill-color: var(--select-text, var(--admin-text, var(--text))) !important;
}

#admin-panel input:focus,
#admin-panel textarea:focus,
#admin-panel select:focus {
  border-color: var(--focus-ring-strong, var(--admin-accent, var(--accent))) !important;
  box-shadow: 0 0 0 3px var(--focus-ring) !important;
}

#admin-panel button:not(.admin-nav-item):not(.unobtrusive-icon-button):not(.moderation-age-option) {
  border-color: var(--admin-border, var(--border)) !important;
  background-color: var(--surface-raised, var(--admin-surface, var(--post-card-bg-single))) !important;
  background-image: none !important;
  color: var(--admin-text, var(--text)) !important;
  -webkit-text-fill-color: var(--admin-text, var(--text)) !important;
}

#admin-panel button:not(.admin-nav-item):not(.unobtrusive-icon-button):not(.moderation-age-option):hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--admin-border, var(--border)) 65%, var(--admin-accent, var(--accent)) 35%) !important;
  background-color: var(--admin-hover, var(--nav-link-hover)) !important;
  background-image: none !important;
  color: var(--admin-text, var(--text)) !important;
  -webkit-text-fill-color: var(--admin-text, var(--text)) !important;
}

#admin-panel button.primary {
  background-color: var(--button-primary-start, var(--admin-accent, var(--accent))) !important;
  background-image: var(--button-primary-overlay), linear-gradient(140deg, var(--button-primary-start, var(--admin-accent, var(--accent))) 0%, var(--button-primary-end, var(--admin-accent-strong, var(--accent-dark))) 100%) !important;
  border-color: var(--button-primary-border, var(--admin-accent-strong, var(--accent-dark))) !important;
  color: var(--nav-active-text, #fff) !important;
}

#admin-panel button.primary:hover {
  background-color: var(--button-primary-hover-start, var(--admin-accent-strong, var(--accent-dark))) !important;
  background-image: var(--button-primary-overlay), linear-gradient(140deg, var(--button-primary-hover-start, var(--admin-accent-strong, var(--accent-dark))) 0%, var(--button-primary-hover-end, var(--admin-accent, var(--accent))) 100%) !important;
  color: var(--nav-active-text, #fff) !important;
}

#admin-panel button.primary:disabled,
#admin-panel button.primary[disabled],
#admin-panel #btn-create-nostr-page:disabled,
#admin-panel #btn-create-nostr-page[disabled] {
  background: var(--admin-surface-alt, var(--post-card-bg)) !important;
  border-color: var(--admin-border, var(--border)) !important;
  color: var(--admin-muted, var(--light-text)) !important;
  opacity: 1 !important;
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
#admin-panel .user-menu-panel,
#admin-panel .draft-menu-panel {
  background: var(--menu-bg, var(--surface-raised, var(--admin-surface, var(--post-card-bg-single)))) !important;
  border-color: var(--menu-border, var(--admin-border, var(--border))) !important;
  box-shadow: var(--menu-shadow, 0 12px 28px rgba(15, 23, 42, 0.16)) !important;
}

#admin-panel .post-menu-panel button,
#admin-panel .user-menu-panel button,
#admin-panel .draft-menu-panel button {
  border: 0 !important;
  background: transparent !important;
  background-image: none !important;
  color: var(--admin-text, var(--text)) !important;
  -webkit-text-fill-color: var(--admin-text, var(--text)) !important;
  box-shadow: none !important;
}

#admin-panel .post-menu-panel button:hover,
#admin-panel .user-menu-panel button:hover,
#admin-panel .draft-menu-panel button:hover {
  background: var(--menu-hover-bg, var(--admin-hover, var(--nav-link-hover))) !important;
  background-image: none !important;
  color: var(--admin-text, var(--text)) !important;
  -webkit-text-fill-color: var(--admin-text, var(--text)) !important;
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

  .nostr-pages-header-type,
  .nostr-page-type-col {
    width: 9.8rem;
    min-width: 9.8rem;
    flex-basis: 9.8rem;
  }

  .nostr-pages-header-settings,
  .nostr-page-settings-col {
    width: 9.8rem;
    min-width: 9.8rem;
    flex-basis: 9.8rem;
  }

  .nostr-pages-header-path,
  .nostr-page-path-col {
    width: 11rem;
    min-width: 11rem;
    flex-basis: 11rem;
  }

  .nostr-pages-header-nav-col,
  .nostr-page-nav-col {
    width: 7.8rem;
    min-width: 7.8rem;
    flex-basis: 7.8rem;
  }

  .nostr-pages-header-publish-col,
  .nostr-page-publish-col {
    width: 9.8rem;
    min-width: 9.8rem;
    flex-basis: 9.8rem;
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

  .user-card {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 0.38rem;
  }

  .user-card-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .users-table-header {
    display: none;
  }

  .users-col-created::before {
    content: "Created";
    color: var(--admin-muted, #6a7488);
    font-size: 0.7rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    margin-right: 0.45rem;
  }

  .users-col-role::before {
    content: "Role";
    color: var(--admin-muted, #6a7488);
    font-size: 0.7rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    margin-right: 0.45rem;
  }

  #admin-panel .user-menu-panel {
    right: auto;
    left: 0;
  }

  [data-admin-section="account"] .account-ssh-note {
    white-space: normal;
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
    grid-template-columns: 9.5rem minmax(0, 1fr);
    align-items: center;
  }

  [data-admin-section="account"] .account-passkey-row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  [data-admin-section="account"] .field-row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  [data-admin-section="account"] .account-ssh-row > .account-ssh-optional {
    grid-column: 1;
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

/* Final nav contrast override: keep highlighted admin rows legible across themes. */
#admin-panel .admin-nav-list .admin-nav-item:hover,
#admin-panel .admin-nav-list .admin-nav-item.is-active,
#admin-panel .admin-nav-list .admin-nav-item[aria-selected="true"],
#admin-panel .admin-nav-list .admin-nav-item[aria-current="page"],
#admin-panel .admin-nav-list .admin-nav-item[aria-selected="true"]:hover,
#admin-panel .admin-nav-list .admin-nav-item[aria-current="page"]:hover {
  background: var(--admin-nav-selected-bg, var(--admin-hover, var(--nav-link-hover))) !important;
  background-image: none !important;
  color: var(--admin-nav-selected-text, var(--admin-text, var(--text))) !important;
}

#admin-panel .admin-nav-list .admin-nav-item:hover:not([aria-selected="true"]):not([aria-current="page"]) {
  background: var(--admin-hover, var(--nav-link-hover)) !important;
  background-image: none !important;
  color: var(--admin-text, var(--text)) !important;
}

#admin-panel .admin-nav-list .admin-nav-item {
  font-weight: 400 !important;
  background: var(--admin-surface, var(--post-card-bg-single)) !important;
  background-image: none !important;
  color: var(--admin-text, var(--text)) !important;
  border-color: transparent !important;
  padding-left: 0.52rem !important;
  padding-right: 0.3rem !important;
}

#admin-panel .admin-nav-list .admin-nav-item .admin-nav-label,
#admin-panel .admin-nav-list .admin-nav-item .admin-nav-count {
  font-weight: inherit !important;
}

#admin-panel .admin-nav-list .admin-nav-item.is-active,
#admin-panel .admin-nav-list .admin-nav-item[aria-selected="true"],
#admin-panel .admin-nav-list .admin-nav-item[aria-current="page"] {
  font-weight: 700 !important;
  border-left: 0 !important;
  border-inline-start: 0 !important;
  box-shadow: none !important;
  background-image: none !important;
}

#admin-panel .admin-nav-list .admin-nav-item:focus,
#admin-panel .admin-nav-list .admin-nav-item:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}

#admin-panel .admin-nav-list .admin-nav-item .admin-nav-label,
#admin-panel .admin-nav-list .admin-nav-item .admin-nav-count {
  color: inherit !important;
}

#admin-panel button.post-menu-trigger,
#admin-panel button.user-menu-trigger,
#admin-panel button.draft-menu-trigger {
  border: 0 !important;
  background: transparent !important;
  background-image: none !important;
  color: var(--admin-text, var(--text)) !important;
  box-shadow: none !important;
}

#admin-panel button.post-menu-trigger:hover,
#admin-panel button.user-menu-trigger:hover,
#admin-panel button.draft-menu-trigger:hover,
#admin-panel button.post-menu-trigger:focus-visible,
#admin-panel button.user-menu-trigger:focus-visible,
#admin-panel button.draft-menu-trigger:focus-visible {
  border: 0 !important;
  background: var(--admin-hover, var(--nav-link-hover)) !important;
  background-image: none !important;
  color: var(--admin-text, var(--text)) !important;
  box-shadow: none !important;
}

#admin-panel button.post-row-delete {
  border: 0 !important;
  background: transparent !important;
  background-image: none !important;
  color: var(--admin-danger, var(--danger)) !important;
  box-shadow: none !important;
}

#admin-panel button.post-row-delete:hover,
#admin-panel button.post-row-delete:focus-visible {
  border: 0 !important;
  background: var(--danger-soft, rgba(180, 35, 24, 0.14)) !important;
  background-image: none !important;
  color: var(--admin-danger, var(--danger)) !important;
  box-shadow: none !important;
}

#admin-panel button.post-menu-trigger,
#admin-panel button.post-row-delete {
  transition: none !important;
}

#admin-panel .post-menu-panel button,
#admin-panel .user-menu-panel button,
#admin-panel .draft-menu-panel button,
#admin-panel .nostr-page-menu-panel button {
  min-width: 0 !important;
  width: 100% !important;
  border: 0 !important;
  border-radius: 8px !important;
  border-color: transparent !important;
  background: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  color: var(--admin-text, var(--text)) !important;
  -webkit-text-fill-color: var(--admin-text, var(--text)) !important;
  text-shadow: none !important;
  transform: none !important;
  justify-content: flex-start !important;
}

#admin-panel .post-menu-panel button:hover,
#admin-panel .post-menu-panel button:focus-visible,
#admin-panel .user-menu-panel button:hover,
#admin-panel .user-menu-panel button:focus-visible,
#admin-panel .draft-menu-panel button:hover,
#admin-panel .draft-menu-panel button:focus-visible,
#admin-panel .nostr-page-menu-panel button:hover,
#admin-panel .nostr-page-menu-panel button:focus-visible {
  background: var(--menu-hover-bg, var(--admin-hover, var(--nav-link-hover))) !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

#admin-panel .post-menu-panel button.post-delete:hover,
#admin-panel .post-menu-panel button.post-delete:focus-visible,
#admin-panel .user-menu-panel button.user-delete:hover,
#admin-panel .user-menu-panel button.user-delete:focus-visible,
#admin-panel .draft-menu-panel button.draft-delete:hover,
#admin-panel .draft-menu-panel button.draft-delete:focus-visible {
  background: var(--menu-danger-hover-bg, var(--danger-soft, rgba(180, 35, 24, 0.14))) !important;
}

.moderation-filters {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: nowrap;
  overflow-x: auto;
}

.moderation-age-group {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--admin-border, var(--border));
  border-radius: 999px;
  overflow: hidden;
  background: var(--admin-surface, var(--post-card-bg-single));
  box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.03);
}

.moderation-age-option {
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: var(--admin-muted, #4f617f) !important;
  -webkit-text-fill-color: var(--admin-muted, #4f617f) !important;
  box-shadow: none !important;
  min-width: 0 !important;
  height: 1.92rem !important;
  padding: 0.22rem 0.62rem !important;
  font-size: 0.78rem !important;
  font-weight: 620 !important;
  line-height: 1.1 !important;
}

.moderation-age-option + .moderation-age-option {
  border-left: 1px solid var(--admin-border, var(--border)) !important;
}

.moderation-age-option:hover:not(:disabled),
.moderation-age-option:focus-visible {
  background: var(--admin-hover, var(--nav-link-hover)) !important;
  color: var(--admin-text, var(--text)) !important;
  -webkit-text-fill-color: var(--admin-text, var(--text)) !important;
}

.moderation-age-option.is-active,
.moderation-age-option[aria-pressed="true"] {
  background: color-mix(in srgb, var(--admin-accent, var(--accent)) 18%, var(--admin-surface, var(--post-card-bg-single))) !important;
  color: var(--admin-text, var(--text)) !important;
  -webkit-text-fill-color: var(--admin-text, var(--text)) !important;
}

#moderation-list .post-row {
  align-items: start;
}

#moderation-list .post-row.moderation-empty-row {
  display: flex;
  align-items: center;
  justify-content: center;
}

#moderation-list .post-row.moderation-empty-row .placeholder.table-empty {
  width: 100%;
}

.moderation-item-meta {
  margin: 0.18rem 0 0;
  font-size: 0.78rem;
  color: var(--muted-text, #4f617f);
}

.moderation-item-path {
  font-size: 0.8rem;
}

/* Unified admin table framing: side margin + matching left/right borders. */
#admin-panel .queue-rows,
#admin-panel .draft-rows,
#admin-panel .posts-list,
#admin-panel .users-list,
#admin-panel .nostr-pages-rows,
#admin-panel #files-list.posts-list,
#admin-panel #moderation-list.posts-list {
  margin-left: 0.7rem !important;
  margin-right: 0.7rem !important;
  width: auto !important;
  max-width: calc(100% - 1.4rem) !important;
  box-sizing: border-box !important;
  border-top-color: var(--admin-border, var(--border)) !important;
  border-bottom-color: var(--admin-border, var(--border)) !important;
  border-left: 1px solid var(--admin-border, var(--border)) !important;
  border-right: 1px solid var(--admin-border, var(--border)) !important;
}

@media (max-width: 620px) {
  #admin-panel .queue-rows,
  #admin-panel .draft-rows,
  #admin-panel .posts-list,
  #admin-panel .users-list,
  #admin-panel .nostr-pages-rows,
  #admin-panel #files-list.posts-list,
  #admin-panel #moderation-list.posts-list {
    margin-left: 0.5rem !important;
    margin-right: 0.5rem !important;
    max-width: calc(100% - 1rem) !important;
  }

  .nostr-pages-table-toolbar {
    margin-left: 0.5rem;
    margin-right: 0.5rem;
  }

  .files-table-toolbar {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }

  #admin-panel.sidebar-collapsed .admin-sidebar {
    display: none;
  }

  #admin-panel.sidebar-collapsed .admin-sidebar-reveal {
    top: 0.22rem;
    left: 0.22rem;
  }

  #admin-panel:not(.sidebar-collapsed) .admin-sidebar-reveal {
    opacity: 0;
    pointer-events: none;
  }
}
</style>
