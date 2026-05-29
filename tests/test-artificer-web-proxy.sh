#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

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
  if grep -Fq -- "$needle" "$file"; then
    pass
  else
    fail "$label (missing: $needle in $file)"
  fi
}

assert_file_not_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq -- "$needle" "$file"; then
    fail "$label (unexpected: $needle in $file)"
  else
    pass
  fi
}

CGI="$ROOT_DIR/cgi/blog-artificer-web"
PAGE="$ROOT_DIR/site/pages/artificer.md"
JS="$ROOT_DIR/site/static/artificer-web-page.js"

assert_file_contains "$PAGE" 'title: Artificer Web' "artificer page has title"
assert_file_contains "$PAGE" '/static/artificer-web-page.js' "artificer page loads shell script"
assert_file_contains "$JS" "bridgeUrl('', { action: 'status' })" "shell checks bridge status first"
assert_file_contains "$JS" "frame.src = bridgeUrl('/');" "shell mounts proxied Artificer Web in iframe"
assert_file_contains "$JS" "localStorage.getItem(key)" "shell forwards existing site auth to bridge"

assert_file_contains "$CGI" '. "$SCRIPT_DIR/blog-desk-common.sh"' "proxy reuses Desk owner helpers"
assert_file_contains "$CGI" 'blog_desk_session_is_owner' "proxy requires Desk owner identity"
assert_file_contains "$CGI" 'blog_load_session "$req_token"' "proxy validates the site session"
assert_file_contains "$CGI" 'artificer_web_session=$BLOG_ARTIFICER_WEB_COOKIE_VALUE' "proxy sets same-origin auth cookie for iframe assets"
assert_file_contains "$CGI" 'artificer_web_cookie_value' "proxy accepts same-origin auth cookie for iframe assets"
assert_file_contains "$CGI" 'X-Artificer-Remote-Token' "proxy injects remote token server-side"
assert_file_contains "$CGI" '--socks5-hostname "$socks"' "proxy uses Tor SOCKS for onion remotes"
assert_file_contains "$CGI" 'BLOG_ARTIFICER_REMOTE_BASE' "proxy supports env-configured remote base"
assert_file_contains "$CGI" 'artificer_remote_token_file' "proxy supports token file configuration"
assert_file_contains "$CGI" '*/../*|*/..|/..|*%0a*|*%0A*|*%0d*|*%0D*) return 1' "proxy rejects path traversal and encoded newlines"
assert_file_contains "$CGI" 's#"/cgi/artificer-api#"/cgi/blog-artificer-web?path=/cgi/artificer-api#g' "proxy rewrites API calls"
assert_file_not_contains "$PAGE" 'desk-page' "artificer page is not a Desk link/embed"

strip_cgi_headers() {
  awk '
    BEGIN { body = 0 }
    {
      sub(/\r$/, "")
      if (body) {
        print
        next
      }
      if ($0 == "") {
        body = 1
      }
    }
  '
}

urlencode() {
  jq -nr --arg value "$1" '$value|@uri'
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/artificer-web-proxy.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=artificer.test
SITES_DIR="$TMP_ROOT/sites"
SITE_ROOT="$SITES_DIR/$SITE_NAME"
SITE_DATA="$SITES_DIR/.sitedata/$SITE_NAME"
BIN_DIR="$TMP_ROOT/bin"
CURL_LOG="$TMP_ROOT/curl.log"
export CURL_LOG

mkdir -p "$SITE_ROOT/site/pages" "$SITE_ROOT/site/static" "$SITE_DATA" "$BIN_DIR"

cat > "$SITE_ROOT/site.conf" <<'EOFCONF'
site_title=Artificer Test
plugin_nostr_support=true
plugin_nostr_login=true
artificer_remote_base=http://exampleonionabcdef.onion
artificer_remote_token_file=/tmp/artificer-web-test-token
EOFCONF

printf 'bridge-token\n' > /tmp/artificer-web-test-token
trap 'rm -rf "$TMP_ROOT"; rm -f /tmp/artificer-web-test-token' EXIT INT TERM

cat > "$BIN_DIR/http-status" <<'EOS'
#!/bin/sh
printf 'STATUS:%s\n' "$*"
EOS
chmod +x "$BIN_DIR/http-status"

cat > "$BIN_DIR/http-header" <<'EOS'
#!/bin/sh
printf 'HEADER:%s=%s\n' "$1" "$2"
EOS
chmod +x "$BIN_DIR/http-header"

cat > "$BIN_DIR/http-end-headers" <<'EOS'
#!/bin/sh
printf '\n'
EOS
chmod +x "$BIN_DIR/http-end-headers"

cat > "$BIN_DIR/config-get" <<'EOS'
#!/bin/sh
set -eu
file=${1-}
key=${2-}
[ -f "$file" ] || exit 1
line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)
[ -n "$line" ] || exit 1
printf '%s\n' "${line#*=}"
EOS
chmod +x "$BIN_DIR/config-get"

cat > "$BIN_DIR/config-set" <<'EOS'
#!/bin/sh
set -eu
file=${1-}
key=${2-}
val=${3-}
mkdir -p "$(dirname "$file")"
if [ -f "$file" ]; then
  grep -v -E "^${key}=" "$file" > "$file.tmp" || true
else
  : > "$file.tmp"
fi
printf '%s=%s\n' "$key" "$val" >> "$file.tmp"
mv "$file.tmp" "$file"
EOS
chmod +x "$BIN_DIR/config-set"

cat > "$BIN_DIR/curl" <<'EOS'
#!/bin/sh
for arg do
  last=$arg
done
printf '%s\n' "$*" >> "$CURL_LOG"
case "$last" in
  */static/app.js*)
    printf 'fetch("/cgi/artificer-api?action=ping")\n'
    ;;
  *)
    printf '<script src="/static/app.js"></script>\n'
    ;;
esac
EOS
chmod +x "$BIN_DIR/curl"

PATH="$BIN_DIR:$PATH"
export PATH WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME"

. "$ROOT_DIR/cgi/blog-lib.sh"
blog_init

owner_pubkey=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
owner_profile=$(blog_user_profile owner)
config-set "$owner_profile" username owner
config-set "$owner_profile" fingerprint owner-fingerprint
config-set "$owner_profile" is_admin false
config-set "$owner_profile" nostr_pubkey "$owner_pubkey"
printf '%s\n' "$owner_pubkey" > "$blog_nostr_authors_file"

owner_session=$(blog_create_session owner owner-fingerprint "$owner_pubkey" "$owner_pubkey" '' nostr false)
owner_token=${owner_session%%;*}
owner_rest=${owner_session#*;}
owner_csrf=${owner_rest%%;*}
auth_query="session_token=$(urlencode "$owner_token")&csrf_token=$(urlencode "$owner_csrf")"

status_output=$(REQUEST_METHOD=GET QUERY_STRING="action=status&$auth_query" "$CGI")
status_body=$(printf '%s\n' "$status_output" | strip_cgi_headers)
if printf '%s\n' "$status_body" | jq -e '.success == true and .configured == true and .transport == "tor"' >/dev/null 2>&1; then
  pass
else
  fail "status action reports configured Tor bridge"
  printf '%s\n' "$status_output" >&2
fi
if printf '%s\n' "$status_output" | grep -Fq 'HEADER:Set-Cookie=artificer_web_session='; then
  pass
else
  fail "status action sets iframe auth cookie"
fi

cookie_pair="$owner_token:$owner_csrf"
proxy_body=$(REQUEST_METHOD=GET QUERY_STRING='path=/static/app.js&action=state' HTTP_COOKIE="artificer_web_session=$cookie_pair" "$CGI" | strip_cgi_headers)
if printf '%s\n' "$proxy_body" | grep -Fq 'fetch("/cgi/blog-artificer-web?path=/cgi/artificer-api?action=ping")'; then
  pass
else
  fail "proxy rewrites Artificer API calls"
  printf '%s\n' "$proxy_body" >&2
fi
if grep -Fq -- '--socks5-hostname 127.0.0.1:9050' "$CURL_LOG"; then
  pass
else
  fail "runtime proxy uses Tor SOCKS for onion base"
  cat "$CURL_LOG" >&2
fi
if grep -Fq -- 'X-Artificer-Remote-Token: bridge-token' "$CURL_LOG"; then
  pass
else
  fail "runtime proxy sends bridge token header"
  cat "$CURL_LOG" >&2
fi
if grep -Fq -- 'session_token=' "$CURL_LOG"; then
  fail "runtime proxy leaked site session into remote query"
  cat "$CURL_LOG" >&2
else
  pass
fi

: > "$CURL_LOG"
REQUEST_METHOD=GET QUERY_STRING='path=/cgi/artificer-api&action=status' HTTP_COOKIE="artificer_web_session=$cookie_pair" "$CGI" >/dev/null
if grep -Fq -- 'http://exampleonionabcdef.onion/cgi/artificer-api?action=status' "$CURL_LOG"; then
  pass
else
  fail "runtime proxy forwards remote action=status calls"
  cat "$CURL_LOG" >&2
fi

if [ "$FAIL_COUNT" -ne 0 ]; then
  printf '%s passed, %s failed\n' "$PASS_COUNT" "$FAIL_COUNT" >&2
  exit 1
fi

printf '%s artificer web proxy checks passed\n' "$PASS_COUNT"
