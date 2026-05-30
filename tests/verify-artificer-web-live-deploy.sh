#!/bin/sh
set -eu

BASE_URL=${ARTIFICER_WEB_DEPLOY_URL:-https://desk.andersaamodt.com/artificer}
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/artificer-web-live-deploy.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

fetch() {
  url=$1
  output=$2
  curl -fsSL --compressed --max-time "${ARTIFICER_WEB_DEPLOY_TIMEOUT:-30}" "$url" -o "$output"
}

asset_url() {
  html_file=$1
  asset_name=$2
  sed -n "s#.*href=\"\\(/static/$asset_name?v=[^\"]*\\)\".*#\\1#p; s#.*src=\"\\(/static/$asset_name?v=[^\"]*\\)\".*#\\1#p" "$html_file" | tail -n 1
}

absolute_url() {
  path=$1
  case "$path" in
    http://*|https://*) printf '%s\n' "$path" ;;
    /*)
      case "$BASE_URL" in
        https://*) scheme=https; rest=${BASE_URL#https://} ;;
        http://*) scheme=http; rest=${BASE_URL#http://} ;;
        *) fail "could not derive origin from $BASE_URL" ;;
      esac
      host=${rest%%/*}
      [ -n "$host" ] || fail "could not derive host from $BASE_URL"
      origin="$scheme://$host"
      printf '%s%s\n' "$origin" "$path"
      ;;
    *) fail "unexpected asset URL: $path" ;;
  esac
}

assert_contains() {
  file=$1
  needle=$2
  label=$3
  grep -Fq -- "$needle" "$file" || fail "$label (missing: $needle)"
}

assert_not_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq -- "$needle" "$file"; then
    fail "$label (unexpected: $needle)"
  fi
}

page_html="$TMP_ROOT/artificer.html"
page_js="$TMP_ROOT/artificer-web-page.js"
page_css="$TMP_ROOT/artificer-web-page.css"

fetch "$BASE_URL" "$page_html"
js_path=$(asset_url "$page_html" 'artificer-web-page.js')
css_path=$(asset_url "$page_html" 'artificer-web-page.css')
[ -n "$js_path" ] || fail "live Artificer page did not reference artificer-web-page.js"
[ -n "$css_path" ] || fail "live Artificer page did not reference artificer-web-page.css"

case "$js_path" in
  *20260529-artificer-web7*) ;;
  *) fail "live Artificer page points at stale JS cache key: $js_path" ;;
esac
case "$css_path" in
  *20260529-artificer-web7*) ;;
  *) fail "live Artificer page points at stale CSS cache key: $css_path" ;;
esac

fetch "$(absolute_url "$js_path")" "$page_js"
fetch "$(absolute_url "$css_path")" "$page_css"

assert_contains "$page_js" 'function isAuthFailure(state)' "live Artificer JS has the auth-failure gate"
assert_contains "$page_js" "code === 'nostr_key_required'" "live Artificer JS treats Nostr allowlist failures as login states"
assert_contains "$page_js" "window.blogAuth.openLoginModal('register')" "live Artificer JS opens the site login modal directly"
assert_contains "$page_js" 'showLoginGate();' "live Artificer JS renders the login gate"
assert_contains "$page_css" '.artificer-web-error {' "live Artificer CSS has the error block"
assert_contains "$page_css" 'text-align: center;' "live Artificer CSS centers the fallback error block"
assert_contains "$page_css" 'body.auth-modal-open .artificer-web-shell' "live Artificer shell drops behind the auth modal"
assert_not_contains "$page_css" 'border-left: 3px solid' "live Artificer CSS removed the left-border callout"

printf 'PASS: Artificer Web live deploy references fresh login-gate assets\n'
