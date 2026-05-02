#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$SCRIPT_DIR

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
EOFCONF

cat > "$canonical_root/includes/head.html" <<'EOFHEAD'
<script src="/static/site-bootstrap.js"></script>
<script defer src="/static/post-context.js?v=20260429-menu-touch1"></script>
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
. "$site_root/cgi/blog-nostr-pages-common.sh"

blog_init
blog_nostr_pages_save_json '{"pages":[{"slug":"contact","type":"contact","show_in_nav":true,"placeholder_title":"Contact"}]}'

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
grep -Fq '/static/simplex-web-default-chat.js' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing shared simplex-web renderer after pre-build rewrite" >&2
  exit 1
}
grep -Fq '/static/simplex-web-session-store.js' "$canonical_root/pages/contact.md" || {
  printf '%s\n' "contact page missing shared simplex-web session store after pre-build rewrite" >&2
  exit 1
}
[ ! -e "$canonical_root/.repo-pages-manifest" ] || {
  printf '%s\n' "legacy staging manifest should not be written" >&2
  exit 1
}

printf '%s\n' 'ok'
