#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

assert_file_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq "$needle" "$file"; then
    pass
  else
    fail "$label (missing: $needle in $file)"
  fi
}

assert_file_not_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq "$needle" "$file"; then
    fail "$label (unexpected: $needle in $file)"
  else
    pass
  fi
}

# Backend: draft/publish post_type plumbing.
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_normalize_post_type() {' 'post_type normalizer exists'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'case "$raw" in' 'normalizer uses explicit case mapping'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" "short|shortform)" 'normalizer supports shortform aliases'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" "''|long|longform)" 'normalizer defaults empty/long aliases to longform'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'capture|capture-media|capture_media|take-photo|take-photo-video)' 'normalizer supports capture-media aliases'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'media|media-upload|media_upload|upload-media|upload_media|photo|video|image)' 'normalizer supports upload-media aliases'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'attachment|attachments|file|file-upload|file_upload)' 'normalizer supports attachment aliases'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'audio|audio-note|audio_note|voice|voice-note|voice_note)' 'normalizer supports audio-note aliases'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'link|link-share|link_share|url|share-link)' 'normalizer supports link-share aliases'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'post_type=${14-longform}' 'draft writer defaults post_type to longform'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'post_type=$(blog_normalize_post_type "$post_type")' 'draft writer normalizes post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'printf '\''post_type: "%s"\n'\'' "$(blog_yaml_escape "$post_type")"' 'draft front matter stores post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'normalized_post_type=$(blog_normalize_post_type "$post_type")' 'save draft normalizes post_type before write'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_write_draft_markdown "$draft_file"' 'save draft writes markdown with post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'post_type=${9-longform}' 'publish markdown defaults post_type to longform'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'printf '\''post_type: "%s"\n'\'' "$(blog_yaml_escape "$normalized_post_type")"' 'publish front matter stores normalized post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'post_type=$(blog_read_front_matter_value "$draft_file" post_type' 'queue reads draft post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_publish_content "$title" "$tags" "$summary" "$content" "$author" "$draft_id" scheduled "$now_iso" "$post_type"' 'scheduled publish forwards post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_publish_content "$title" "$tags" "$summary" "$content" "$author" "$draft_id" drip "" "$post_type"' 'drip publish forwards post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_nostr_kind_for_post_type() {' 'nostr kind resolver exists'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'shortform|link-share)' 'nostr kind resolver maps shortform/link-share to kind 1'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'attachment)' 'nostr kind resolver maps attachment post type'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" "printf '15\\n'" 'nostr kind resolver emits kind 15 for attachment'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" "printf '30311\\n'" 'nostr kind resolver emits kind 30311 for go-live'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'post_type=$post_type' 'nostr signer tags event with normalized post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" '.kind==1 or .kind==15 or .kind==20 or .kind==21 or .kind==30023 or .kind==30311' 'derived rebuild includes non-longform nostr kinds'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'post_type_tag:' 'derived rebuild reads post_type tag from nostr events'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'post_type: (' 'derived rebuild writes post_type in posts index'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'set -- nak req -k 1 -k 15 -k 20 -k 21 -k 30311 -t "t=blog"' 'mirror fetch includes non-longform kinds constrained by blog tag'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'printf '\''%s:%s:%s\n'\'' "$ref_kind" "$ref_pubkey" "$ref_d"' 'list event a-ref preserves referenced post kind'

# Backend endpoints: save/get/move preserve post_type.
assert_file_contains "$ROOT_DIR/cgi/blog-save-post" 'post_type=$(blog_param post_type)' 'save endpoint reads post_type param'
assert_file_contains "$ROOT_DIR/cgi/blog-save-post" 'post_type=$(blog_read_front_matter_value "$draft_file" post_type' 'save endpoint falls back to draft post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-save-post" 'post_type=$(blog_read_front_matter_value "$draft_file" type' 'save endpoint supports legacy type fallback'
assert_file_contains "$ROOT_DIR/cgi/blog-save-post" 'post_type=$(blog_normalize_post_type "$post_type")' 'save endpoint normalizes post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-save-post" 'blog_publish_content "$title" "$normalized_tags" "$summary" "$content" "$author_name" "$draft_id" immediate "" "$post_type"' 'immediate publish forwards post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-save-post" 'blog_save_draft "$draft_id" "$title" "$normalized_tags" "$summary" "$content" "$author_name" scheduled "$scheduled_at" scheduled "$post_type"' 'scheduled draft saves post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-save-post" 'blog_save_draft "$draft_id" "$title" "$normalized_tags" "$summary" "$content" "$author_name" drip "" queued "$post_type"' 'drip draft saves post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-save-post" 'blog_save_draft "$draft_id" "$title" "$normalized_tags" "$summary" "$content" "$author_name" "$publish_mode" "$scheduled_at" "$status" "$post_type"' 'autosave draft saves post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-get-draft" 'post_type=$(blog_read_front_matter_value "$draft_file" post_type' 'get draft reads post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-get-draft" 'post_type=$(blog_read_front_matter_value "$draft_file" type' 'get draft supports legacy type fallback'
assert_file_contains "$ROOT_DIR/cgi/blog-get-draft" 'printf '\''"post_type":"%s",'\'' "$(blog_json_escape "$post_type")"' 'get draft emits post_type field'
assert_file_contains "$ROOT_DIR/cgi/blog-create-draft-from-post" 'post_type=$(blog_read_front_matter_value "$file" post_type' 'create draft from post carries post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-create-draft-from-post" 'post_type=$(blog_read_front_matter_value "$file" type' 'create draft supports legacy type fallback'
assert_file_contains "$ROOT_DIR/cgi/blog-create-draft-from-post" 'blog_save_draft "$draft_id" "$title" "$tags" "$summary" "$content" "$author" draft "" draft "$post_type"' 'create draft persists post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-unqueue-draft" 'post_type=$(blog_read_front_matter_value "$draft_file" post_type' 'unqueue reads draft post_type'
assert_file_contains "$ROOT_DIR/cgi/blog-unqueue-draft" 'post_type=$(blog_read_front_matter_value "$draft_file" type' 'unqueue supports legacy type fallback'
assert_file_contains "$ROOT_DIR/cgi/blog-unqueue-draft" 'blog_save_draft "$draft_id" "$title" "$tags" "$summary" "$content" "$author" draft "" draft "$post_type"' 'unqueue keeps post_type when restoring draft'

# Admin compose markup.
assert_file_contains "$ROOT_DIR/pages/admin.md" 'id="compose-post-type-toolbar"' 'admin compose has post type toolbar'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'data-post-type="shortform"' 'admin compose shortform pill'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'data-post-type="longform"' 'admin compose longform pill'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'data-post-type="capture-media"' 'admin compose capture-media pill'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'data-post-type="upload-media"' 'admin compose upload-media pill'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'data-post-type="attachment"' 'admin compose attachment pill'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'data-post-type="audio-note"' 'admin compose audio-note pill'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'data-post-type="link-share"' 'admin compose link-share pill'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'data-post-type="go-live"' 'admin compose go-live pill'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'class="compose-post-type-icon"' 'admin compose pills render icon-only controls'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'aria-label="Shortform Post"' 'admin icon-only control keeps accessible label'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'title="Coming soon: Go Live"' 'admin disabled go-live icon has tooltip'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'id="compose-media-tools"' 'admin compose media tools block'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'id="compose-nostr-target-pill"' 'admin compose renders nostr target pill'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'id="btn-compose-capture"' 'admin compose capture button'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'id="btn-compose-upload-media"' 'admin compose upload-media button'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'id="btn-compose-upload-file"' 'admin compose attachment button'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'id="btn-compose-upload-audio"' 'admin compose audio button'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'id="compose-link-fields"' 'admin compose link-share fields container'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'id="compose-link-url"' 'admin compose link URL field'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'id="compose-link-body"' 'admin compose link body field'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'id="capture-picker"' 'admin compose capture picker exists'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'id="audio-picker"' 'admin compose audio picker exists'

# Admin compose runtime behavior.
assert_file_contains "$ROOT_DIR/static/admin.js" "const COMPOSE_POST_TYPES = ['shortform', 'longform', 'capture-media', 'upload-media', 'attachment', 'audio-note', 'link-share', 'go-live'];" 'admin js defines full post type set'
assert_file_contains "$ROOT_DIR/static/admin.js" "const COMPOSE_POST_TYPES_ENABLED = ['shortform', 'longform', 'capture-media', 'upload-media', 'attachment', 'audio-note', 'link-share'];" 'admin js keeps go-live disabled'
assert_file_contains "$ROOT_DIR/static/admin.js" 'if (type === '\''go-live'\'') { return '\''go live'\''; }' 'admin js labels go-live'
assert_file_contains "$ROOT_DIR/static/admin.js" "setOutput(els.outputCompose, 'Go Live is a future feature.', 'warn');" 'admin js surfaces go-live disabled message'
assert_file_contains "$ROOT_DIR/static/admin.js" 'els.composeMediaTools.hidden = !showMedia;' 'admin js toggles media tool visibility by type'
assert_file_contains "$ROOT_DIR/static/admin.js" 'els.composeLinkFields.hidden = type !== '\''link-share'\'';' 'admin js toggles link fields visibility'
assert_file_contains "$ROOT_DIR/static/admin.js" 'function composeNostrTarget(postType) {' 'admin js defines nostr target mapper for compose'
assert_file_contains "$ROOT_DIR/static/admin.js" 'els.composeNostrTargetPill.textContent = label;' 'admin js updates nostr target pill when post type changes'
assert_file_contains "$ROOT_DIR/static/admin.js" 'post_type: postType,' 'admin compose payload includes post_type'
assert_file_contains "$ROOT_DIR/static/admin.js" 'state.composePostType = normalizeComposePostType((draft && draft.post_type) || '\''longform'\'');' 'admin draft load hydrates post_type'
assert_file_contains "$ROOT_DIR/static/admin.js" 'state.composePostType = '\''longform'\'';' 'admin compose reset restores longform default'
assert_file_contains "$ROOT_DIR/static/admin.js" 'setComposePostType('\''capture-media'\'', { queueAutosave: false, syncUi: true });' 'admin capture button selects capture-media'
assert_file_contains "$ROOT_DIR/static/admin.js" 'setComposePostType('\''upload-media'\'', { queueAutosave: false, syncUi: true });' 'admin upload-media button selects upload-media'
assert_file_contains "$ROOT_DIR/static/admin.js" 'setComposePostType('\''attachment'\'', { queueAutosave: false, syncUi: true });' 'admin attachment button selects attachment'
assert_file_contains "$ROOT_DIR/static/admin.js" 'setComposePostType('\''audio-note'\'', { queueAutosave: false, syncUi: true });' 'admin audio button selects audio-note'
assert_file_contains "$ROOT_DIR/static/admin.js" 'state.filePickerContext = '\''compose-attachment'\'';' 'admin file picker supports compose attachment context'
assert_file_contains "$ROOT_DIR/static/admin.js" 'const context = state.filePickerContext || '\''files-admin'\'';' 'shared file picker branches by context'
assert_file_contains "$ROOT_DIR/static/admin.js" 'const work = context === '\''compose-attachment'\''' 'compose/file-admin picker routing exists'
assert_file_contains "$ROOT_DIR/static/admin.js" 'if (!composeSectionVisible()) {' 'admin paste guard requires compose section visible'
assert_file_contains "$ROOT_DIR/static/admin.js" 'if (isEditableTarget(event.target)) {' 'admin paste guard skips editable controls'
assert_file_contains "$ROOT_DIR/static/admin.js" 'const images = clipboardImageFiles(event);' 'admin paste handler reads clipboard images'
assert_file_contains "$ROOT_DIR/static/admin.js" 'handleDroppedFiles(images, '\''upload-media'\'')' 'admin paste upload routes to compose uploader'
assert_file_contains "$ROOT_DIR/static/admin.js" 'if (mime.indexOf('\''image/'\'') === 0 || mime.indexOf('\''video/'\'') === 0) {' 'admin dropped files infer upload-media from image/video'
assert_file_contains "$ROOT_DIR/static/admin.js" 'targetType = '\''audio-note'\'';' 'admin dropped files infer audio-note from audio mime'
assert_file_contains "$ROOT_DIR/static/admin.js" 'targetType = '\''attachment'\'';' 'admin dropped files infer attachment from other mime'
assert_file_contains "$ROOT_DIR/static/admin.js" "const data = await uploadFileWithProgress(file, {" 'admin uploader uses upload progress path'
assert_file_contains "$ROOT_DIR/static/admin.js" "kind: kind || 'file'," 'admin uploader passes upload kind'
assert_file_contains "$ROOT_DIR/static/admin.js" "els.postContent.placeholder = '# Write in Markdown\\n\\nDrop images anywhere on this page to upload + insert.';" 'admin longform placeholder preserves drag/paste hint'

# Blog inline compose runtime behavior.
assert_file_contains "$ROOT_DIR/static/blog-page.js" "var COMPOSE_POST_TYPES = ['shortform', 'longform', 'capture-media', 'upload-media', 'attachment', 'audio-note', 'link-share', 'go-live'];" 'blog page defines full compose post type set'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "btn('shortform', 'Shortform Post', false)" 'blog compose has shortform pill'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "btn('longform', 'Longform Post', false)" 'blog compose has longform pill'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "btn('capture-media', 'Take Photo/Video', false)" 'blog compose has capture-media pill'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "btn('upload-media', 'Upload Photo/Video', false)" 'blog compose has upload-media pill'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "btn('attachment', 'Upload Attachment/File', false)" 'blog compose has attachment pill'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "btn('audio-note', 'Audio Note', false)" 'blog compose has audio-note pill'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "btn('link-share', 'Link Share', false)" 'blog compose has link-share pill'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "btn('go-live', 'Go Live', true)" 'blog compose has disabled go-live pill'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'function composePostTypeIconSvg(type) {' 'blog compose defines icon renderer for post type pills'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'function composeNostrTarget(postType) {' 'blog compose defines nostr target mapper'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'compose-nostr-target-row' 'blog compose renders nostr target row under post-type selector'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'class="compose-post-type-icon"' 'blog compose icons render in segmented controls'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'aria-label="' 'blog compose icon controls keep accessible labels'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "setComposeOutput('Go Live is a future feature.', 'warn');" 'blog compose reports go-live as future feature'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'post_type: fields.postType,' 'blog compose payload includes post_type'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "state.compose.postType = 'longform';" 'blog compose reset restores longform default'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'data-compose-action="pick-capture-media"' 'blog compose has capture media tool action'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'data-compose-action="pick-upload-media"' 'blog compose has upload media tool action'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'data-compose-action="pick-upload-file"' 'blog compose has upload attachment tool action'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'data-compose-action="pick-upload-audio"' 'blog compose has upload audio tool action'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'data-compose-field="capture-upload"' 'blog compose includes capture input'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'data-compose-field="media-upload"' 'blog compose includes upload-media input'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'data-compose-field="file-upload"' 'blog compose includes file input'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'data-compose-field="audio-upload"' 'blog compose includes audio input'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'if (!isAdmin()) {' 'blog paste guard requires admin auth'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'if (isEditableTarget(event.target)) {' 'blog paste guard skips editable controls'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'if (!state.compose.open) {' 'blog paste handler opens compose when closed'
assert_file_contains "$ROOT_DIR/static/blog-page.js" 'setComposeOpen(true);' 'blog paste handler opens compose card'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "setComposePostType('upload-media', { skipAutosave: true, skipRender: true });" 'blog paste handler switches to upload-media type'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "handleComposeUploads(images, 'upload-media');" 'blog paste handler uploads pasted images'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "return apiPost('/cgi/blog-upload-media', {" 'blog upload flow posts to upload endpoint'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "filename: String((file && file.name) || 'upload.bin')," 'blog upload flow sends filename'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "mime_type: String((file && file.type) || '')," 'blog upload flow sends mime type'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "data_base64: String(dataUrl || '')" 'blog upload flow sends base64 payload'

# Blog compose and mobile style contracts.
assert_file_contains "$ROOT_DIR/static/style.css" '.blog-compose-card .compose-post-type-toolbar {' 'blog style defines post type toolbar'
assert_file_contains "$ROOT_DIR/static/style.css" '.blog-compose-card .compose-post-type-pill {' 'blog style defines post type pills'
assert_file_contains "$ROOT_DIR/static/style.css" 'border-radius: 999px;' 'blog post type segmented control uses one continuous pill shell'
assert_file_contains "$ROOT_DIR/static/style.css" 'gap: 0;' 'blog post type segmented control removes inter-button gaps'
assert_file_contains "$ROOT_DIR/static/style.css" 'border-right: 1px solid var(--border);' 'blog segmented control uses internal separators'
assert_file_contains "$ROOT_DIR/static/style.css" '.blog-compose-card .compose-post-type-pill.is-active {' 'blog segmented control has explicit active/depressed state'
assert_file_contains "$ROOT_DIR/static/style.css" '.blog-compose-card .compose-nostr-target-row {' 'blog style defines nostr target row'
assert_file_contains "$ROOT_DIR/static/style.css" '.blog-compose-card .nostr-target-pill {' 'blog style defines nostr target pill'
assert_file_contains "$ROOT_DIR/static/style.css" '.blog-compose-card .compose-media-tools {' 'blog style defines media tools container'
assert_file_contains "$ROOT_DIR/static/style.css" '.blog-compose-card .compose-link-fields {' 'blog style defines link-share fields'
assert_file_contains "$ROOT_DIR/static/style.css" '.blog-compose-title-row {' 'blog style defines title + preview row layout'
assert_file_contains "$ROOT_DIR/static/style.css" '@media (max-width: 900px) {' 'blog style has tablet/mobile breakpoint'
assert_file_contains "$ROOT_DIR/static/style.css" '.blog-compose-card .compose-post-type-toolbar {' 'mobile breakpoint keeps toolbar style available'
assert_file_contains "$ROOT_DIR/static/style.css" 'overflow-x: auto;' 'mobile toolbar can scroll horizontally'
assert_file_contains "$ROOT_DIR/static/style.css" '@media (max-width: 640px) {' 'blog style has small-phone breakpoint'
assert_file_contains "$ROOT_DIR/static/style.css" '.blog-compose-card .compose-media-actions {' 'small-phone layout adjusts media action layout'
assert_file_contains "$ROOT_DIR/static/style.css" 'grid-template-columns: repeat(2, minmax(0, 1fr));' 'small-phone media action grid is bounded and legible'
assert_file_not_contains "$ROOT_DIR/static/style.css" '.blog-compose-card .compose-post-type-pill { width: 100%;' 'compose pills are not forced to full width'
assert_file_contains "$ROOT_DIR/static/style.css" 'Final mobile nav safety: prevent search/actions from covering center links.' 'mobile nav overlap safety block exists'
assert_file_contains "$ROOT_DIR/static/style.css" '@media (max-width: 700px) {' 'mobile nav safety breakpoint exists'
assert_file_contains "$ROOT_DIR/static/style.css" 'nav.site-nav {' 'mobile nav safety targets nav container'
assert_file_contains "$ROOT_DIR/static/style.css" 'display: grid !important;' 'mobile nav safety uses grid to separate rows'
assert_file_contains "$ROOT_DIR/static/style.css" 'grid-template-rows: auto auto;' 'mobile nav safety splits nav into two rows'
assert_file_contains "$ROOT_DIR/static/style.css" 'nav.site-nav .nav-center {' 'mobile nav safety styles center links row'
assert_file_contains "$ROOT_DIR/static/style.css" 'overflow-x: auto !important;' 'mobile nav center remains scrollable without overlap'
assert_file_contains "$ROOT_DIR/static/style.css" 'nav.site-nav .nav-right {' 'mobile nav safety styles right controls row'
assert_file_contains "$ROOT_DIR/static/style.css" 'grid-row: 2;' 'mobile nav right controls pinned to second row'
assert_file_contains "$ROOT_DIR/static/style.css" 'nav.site-nav .nav-search {' 'mobile nav safety styles search shell'
assert_file_contains "$ROOT_DIR/static/style.css" 'flex: 1 1 12rem !important;' 'mobile nav search remains bounded in second row'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
