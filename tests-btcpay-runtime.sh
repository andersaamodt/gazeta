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

assert_contains() {
  haystack=$1
  needle=$2
  label=$3
  if printf '%s' "$haystack" | grep -Fq "$needle"; then
    pass
  else
    fail "$label (missing: $needle)"
  fi
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/btcpay-runtime-test.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=testsite
SITES_DIR="$TMP_ROOT/sites"
SITE_ROOT="$SITES_DIR/$SITE_NAME"
SITE_DATA="$SITES_DIR/.sitedata/$SITE_NAME"
NOSTR_STATE_DIR="$SITE_DATA/nostr/state"
BIN_DIR="$TMP_ROOT/bin"

mkdir -p "$SITE_ROOT/site/pages" "$NOSTR_STATE_DIR" "$BIN_DIR"

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
printf 'END-HEADERS\n'
EOS
chmod +x "$BIN_DIR/http-end-headers"

cat > "$BIN_DIR/http-ok-html" <<'EOS'
#!/bin/sh
printf 'OK-HTML\n'
EOS
chmod +x "$BIN_DIR/http-ok-html"

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
set -eu
url=''
for arg in "$@"; do
  case "$arg" in
    -*) ;;
    *) url=$arg ;;
  esac
done
case "$url" in
  https://pay.blog.example.com|https://pay.blog.example.com/)
    if [ "${MOCK_BTCPAY_ONLINE-0}" = "1" ]; then
      printf 'HTTP/1.1 200 OK\n'
      exit 0
    fi
    exit 22
    ;;
  https://pay.blog.example.com/btcpay|https://pay.blog.example.com/btcpay/)
    if [ "${MOCK_BTCPAY_ONLINE-0}" = "1" ]; then
      printf 'HTTP/1.1 200 OK\n'
      exit 0
    fi
    exit 22
    ;;
  https://blog.example.com/.well-known/lnurlp/zap)
    if [ "${MOCK_ZAP_ENDPOINT_READY-0}" = "1" ]; then
      printf '{"callback":"https://pay.blog.example.com/callback","allowsNostr":true}\n'
      exit 0
    fi
    exit 22
    ;;
  *)
    exit 22
    ;;
esac
EOS
chmod +x "$BIN_DIR/curl"

export PATH="$BIN_DIR:$PATH"
export WIZARDRY_SITES_DIR="$SITES_DIR"
export WIZARDRY_SITE_NAME="$SITE_NAME"

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"

blog_init
config-set "$blog_site_conf" plugin_btcpay true
config-set "$blog_site_conf" domain blog.example.com
config-set "$blog_site_conf" btcpay_host pay.blog.example.com
config-set "$blog_site_conf" zap_lud16 zap@blog.example.com
printf '%s\n' 'npub1siteexamplewalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' > "$NOSTR_STATE_DIR/site_npub"

admin_profile=$(blog_user_profile admin)
config-set "$admin_profile" username admin
config-set "$admin_profile" fingerprint test-fingerprint
config-set "$admin_profile" is_admin true

session_parts=$(blog_create_session admin test-fingerprint)
session_token=${session_parts%%;*}
rest=${session_parts#*;}
csrf_token=${rest%%;*}

run_btcpay_cgi() {
  query=$1
  host=$2
  QUERY_STRING="$query" HTTP_HOST="$host" "$ROOT_DIR/cgi/blog-manage-btcpay" 2>&1
}

# 1) auth required when session is missing.
auth_out=$(run_btcpay_cgi 'action=status' 'blog.example.com')
assert_contains "$auth_out" '"code":"auth_required"' 'status requires auth'

# 2) csrf required when token is invalid.
csrf_out=$(run_btcpay_cgi "action=status&session_token=$session_token&csrf_token=bad" 'blog.example.com')
assert_contains "$csrf_out" '"code":"csrf_invalid"' 'status requires matching csrf'

# 3) status returns Headquarters-managed runtime keys.
unset MOCK_BTCPAY_ONLINE || true
unset MOCK_ZAP_ENDPOINT_READY || true
status_out=$(run_btcpay_cgi "action=status&session_token=$session_token&csrf_token=$csrf_token" 'blog.example.com')
assert_contains "$status_out" '"success":true' 'status returns success'
assert_contains "$status_out" '"headquarters_managed":true' 'status reports Headquarters-managed provisioning'
assert_contains "$status_out" '"btcpay_host":"pay.blog.example.com"' 'status derives configured pay host'
assert_contains "$status_out" '"btcpay_url":"https://pay.blog.example.com"' 'status emits BTCPay URL'
assert_contains "$status_out" '"btcpay_online":false' 'status reports BTCPay offline when public host does not answer'
assert_contains "$status_out" '"effective_lud16":"zap@blog.example.com"' 'status reports effective Lightning Address'
assert_contains "$status_out" '"zap_endpoint_ready":false' 'status reports Lightning Address endpoint pending'
assert_contains "$status_out" '"site_signer_ready":true' 'status reports site signer readiness from cached npub'

# 4) status appends a configured BTCPay root path to the public URL.
config-set "$blog_site_conf" btcpay_rootpath /btcpay
path_out=$(run_btcpay_cgi "action=status&session_token=$session_token&csrf_token=$csrf_token" 'blog.example.com')
assert_contains "$path_out" '"btcpay_url":"https://pay.blog.example.com/btcpay"' 'status includes BTCPay root path when configured'

# 5) status reports live BTCPay + Lightning Address endpoint when the public URLs answer.
MOCK_BTCPAY_ONLINE=1
MOCK_ZAP_ENDPOINT_READY=1
export MOCK_BTCPAY_ONLINE MOCK_ZAP_ENDPOINT_READY
live_out=$(run_btcpay_cgi "action=status&session_token=$session_token&csrf_token=$csrf_token" 'blog.example.com')
assert_contains "$live_out" '"btcpay_online":true' 'status reports BTCPay online when public host answers'
assert_contains "$live_out" '"zap_endpoint_ready":true' 'status reports Lightning Address endpoint live'
assert_contains "$live_out" '"zap_endpoint_url":"https://blog.example.com/.well-known/lnurlp/zap"' 'status emits Lightning Address endpoint URL'

# 6) install actions are blocked because provisioning moved to Headquarters.
managed_out=$(run_btcpay_cgi "action=install_btcpay&session_token=$session_token&csrf_token=$csrf_token" 'blog.example.com')
assert_contains "$managed_out" '"success":false' 'install action returns failure in site admin'
assert_contains "$managed_out" '"code":"managed_externally"' 'install action reports external management boundary'
assert_contains "$managed_out" 'BTCPay + CLN provisioning is managed in Headquarters.' 'install action explains Headquarters ownership'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
