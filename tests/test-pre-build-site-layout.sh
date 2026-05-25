#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

tmp_root=$(mktemp -d "${TMPDIR:-/tmp}/pre-build-site-layout.XXXXXX")
cleanup() {
  rm -rf "$tmp_root"
}
trap 'cleanup' EXIT INT TERM

export WIZARDRY_SITES_DIR="$tmp_root/sites"
export WIZARDRY_SITE_NAME="testsite"
site_root="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
canonical_root="$site_root/site"
state_root="$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME"

mkdir -p "$site_root"
cp -R "$ROOT_DIR/cgi" "$site_root/"
mkdir -p "$canonical_root/includes" "$canonical_root/pages/embed" "$canonical_root/static" "$state_root"

cat > "$site_root/site.conf" <<'EOFCONF'
template=blog
theme=lapidarist
site_title=Example Site
append_site_title_to_page_title=false
plugin_video_chat=true
video_chat_rooms=Lobby
EOFCONF

cat > "$canonical_root/includes/head.html" <<'EOFHEAD'
<script src="/static/site-bootstrap.js"></script>
<script defer src="/static/post-context.js?v=20260521-login-sync1"></script>
EOFHEAD

cat > "$canonical_root/includes/nav.md" <<'EOFNAV'
<nav class="site-nav">Example Nav</nav>
EOFNAV

cat > "$canonical_root/includes/footer.md" <<'EOFFOOT'
<footer class="site-footer">Example Footer</footer>
EOFFOOT

cat > "$canonical_root/pages/admin.md" <<'EOFPAGE'
---
title: Admin
---

Admin page
EOFPAGE

cat > "$canonical_root/pages/embed/video-chat.md" <<'EOPEMBED'
---
title: Video Chat
---

Video chat page
EOPEMBED

cat > "$canonical_root/static/style.css" <<'EOFSTYLE'
body { background: #fff; }
EOFSTYLE

cat > "$canonical_root/static/nav-auth.js" <<'EOFNAVAUTH'
console.log('nav');
EOFNAVAUTH

cat > "$canonical_root/pages/contact.md" <<'EOFCONTACT'
---
title: "Contact"
published_at: "2026-04-15T00:00:00Z"
content_hash: ""
tags: ["nostr", "contact"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

<section id="contact-page-root" class="list-page-shell" data-page-slug="contact" data-page-type="contact" data-page-title="Contact">
<div class="list-page-head">
<h1 id="contact-page-title">Contact</h1>
<p id="contact-page-description" class="muted"></p>
</div>
<div id="contact-page-admin" class="list-admin" hidden></div>
<div id="contact-page-validation" class="list-validation" hidden></div>
<div id="contact-page-content" class="list-page-content"></div>
</section>

<script src="/static/nostr-page-bootstrap/contact.js"></script>
<script src="/static/nostr-publish-dialog.js"></script>
<script src="/static/contact-page.js"></script>
EOFCONTACT

mkdir -p "$tmp_root/bin"
cat > "$tmp_root/bin/config-get" <<'EOFCONFIG'
#!/bin/sh
set -eu
file=$1
key=$2
awk -F= -v wanted="$key" '
  $1 == wanted {
    value=$0
    sub(/^[^=]*=/, "", value)
    print value
    found=1
    exit
  }
  END {
    if (!found) {
      exit 1
    }
  }
' "$file"
EOFCONFIG
chmod +x "$tmp_root/bin/config-get"
PATH="$tmp_root/bin:$PATH"
export PATH

. "$site_root/cgi/blog-lib.sh"
. "$site_root/cgi/blog-list-common.sh"
. "$site_root/cgi/blog-public-ranking-common.sh"
. "$site_root/cgi/blog-nostr-pages-common.sh"

blog_init
blog_nostr_pages_save_json '{"pages":[{"slug":"contact","type":"contact","show_in_nav":true,"placeholder_title":"Contact"},{"slug":"reading-list","type":"list","show_in_nav":true,"placeholder_title":"Reading list"}]}'
blog_nostr_page_save_draft_state_json contact contact '{"title":"Contact","description":"Ways to reach me","rows":[{"transport":"email","qualifier":"preferred","value":"hello@example.com"},{"transport":"email","qualifier":"archive","value":"old@example.com"}]}'
blog_nostr_page_save_draft_state_json reading-list list '{"title":"Reading list","description":"Static list fixture","group_by":"year","elements":[{"type":"entry","markdown":"Seeded reading entry","date":"2026","marker":"book"}]}'
mkdir -p "$site_root/build/contact"
cat > "$site_root/build/contact/index.html" <<'EOFSTALE'
<section id="contact-page-root" class="list-page-shell" data-page-slug="contact" data-page-type="contact" data-page-title="Contact">
<div id="contact-page-content" class="list-page-content">Loading page content...</div>
</section>
EOFSTALE

"$site_root/cgi/pre-build"

[ -f "$canonical_root/includes/head.html" ] || {
  printf '%s\n' "missing canonical head include" >&2
  exit 1
}
[ -f "$canonical_root/includes/nav.md" ] || {
  printf '%s\n' "missing canonical nav include" >&2
  exit 1
}
[ -f "$canonical_root/pages/admin.md" ] || {
  printf '%s\n' "missing canonical admin page" >&2
  exit 1
}
[ -f "$canonical_root/pages/embed/video-chat.md" ] || {
  printf '%s\n' "missing canonical nested page" >&2
  exit 1
}
[ -f "$canonical_root/pages/contact.md" ] || {
  printf '%s\n' "missing generated contact page" >&2
  exit 1
}
[ ! -e "$site_root/build/contact/index.html" ] || {
  printf '%s\n' "stale clean-url contact build copy was not pruned" >&2
  exit 1
}
[ -f "$canonical_root/static/style.css" ] || {
  printf '%s\n' "missing canonical stylesheet" >&2
  exit 1
}
[ -f "$canonical_root/static/nav-auth.js" ] || {
  printf '%s\n' "missing canonical static script" >&2
  exit 1
}
[ -f "$canonical_root/static/navbar-pages.json" ] || {
  printf '%s\n' "missing generated navbar pages bootstrap" >&2
  exit 1
}
[ -f "$canonical_root/static/site-bootstrap.js" ] || {
  printf '%s\n' "missing generated site bootstrap" >&2
  exit 1
}

grep -Fq '/static/site-bootstrap.js' "$canonical_root/includes/head.html" || {
  printf '%s\n' "canonical head include lost site bootstrap script" >&2
  exit 1
}
grep -Fq 'body { background: #fff; }' "$canonical_root/static/style.css" || {
  printf '%s\n' "canonical stylesheet changed unexpectedly" >&2
  exit 1
}
[ -f "$canonical_root/pages/contact.md" ] || {
  printf '%s\n' "missing generated contact page" >&2
  exit 1
}
grep -Fq 'https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing marked dependency after pre-build rewrite" >&2
  exit 1
}
grep -Fq '/static/simplex-web-transport.js' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing simplex-web transport after pre-build rewrite" >&2
  exit 1
}
grep -Fq '/static/simplex-web-browser-adapter-init.mjs?v=20260516-browserprofilev2' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing cache-busted simplex-web browser adapter after pre-build rewrite" >&2
  exit 1
}
grep -Fq '/static/simplex-web-default-chat.js' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing shared simplex-web renderer after pre-build rewrite" >&2
  exit 1
}
grep -Fq '/static/simplex-web-session-store.js' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing shared simplex-web session store after pre-build rewrite" >&2
  exit 1
}
grep -Fq '/static/contact-page.js?v=20260524-contact-zap-data1' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing cache-busted contact page script after pre-build rewrite" >&2
  exit 1
}
grep -Fq 'hello@example.com' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing prerendered contact row after pre-build rewrite" >&2
  exit 1
}
grep -Fq 'secure-chat-panel' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing prerendered secure chat panel after pre-build rewrite" >&2
  exit 1
}
grep -Fq 'contact-widget-video-chat' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing prerendered video chat shell after pre-build rewrite" >&2
  exit 1
}
grep -Fq 'contact-archived-group' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing prerendered archived contact group after pre-build rewrite" >&2
  exit 1
}
grep -Fq 'data-prerender-painted="true"' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing prerender marker after pre-build rewrite" >&2
  exit 1
}
if grep -Fq 'Loading page content' "$canonical_root/pages/contact.md" || grep -Fq 'data-page-initial-placeholder' "$canonical_root/pages/contact.md"; then
  printf '%s\n' "contact page still ships a generic loading placeholder" >&2
  exit 1
fi
grep -Fq 'window.__wizardryNostrPageBootstrap' "$canonical_root/static/nostr-page-bootstrap/contact.js" || {
  printf '%s\n' "contact bootstrap missing hydration payload" >&2
  exit 1
}
if grep -Fq 'paintContactFirstFrame' "$canonical_root/static/nostr-page-bootstrap/contact.js" || grep -Fq 'hasOnlyInitialPlaceholder' "$canonical_root/static/nostr-page-bootstrap/contact.js"; then
  printf '%s\n' "contact bootstrap still contains first-frame DOM replacement code" >&2
  exit 1
fi
[ -f "$canonical_root/pages/reading-list.md" ] || {
  printf '%s\n' "missing generated reading list page" >&2
  exit 1
}
grep -Fq 'Seeded reading entry' "$canonical_root/pages/reading-list.md" || {
  printf '%s\n' "list page missing prerendered list entry after pre-build rewrite" >&2
  exit 1
}
if grep -Fq 'Loading page content' "$canonical_root/pages/reading-list.md" || grep -Fq 'data-page-initial-placeholder' "$canonical_root/pages/reading-list.md"; then
  printf '%s\n' "list page still ships a generic loading placeholder" >&2
  exit 1
fi
if grep -Fq 'hasOnlyInitialPlaceholder' "$canonical_root/static/nostr-page-bootstrap/reading-list.js" || grep -Fq 'paintListFirstFrame' "$canonical_root/static/nostr-page-bootstrap/reading-list.js"; then
  printf '%s\n' "list bootstrap still contains first-frame DOM replacement code" >&2
  exit 1
fi
[ ! -e "$canonical_root/.repo-pages-manifest" ] || {
  printf '%s\n' "legacy staging manifest should not be written" >&2
  exit 1
}

printf '%s\n' 'ok'
