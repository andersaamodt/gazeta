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

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/lightning-runtime-test.XXXXXX")
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
  https://blog.example.com/.well-known/lnurlp/zap)
    if [ "${MOCK_ZAP_ENDPOINT_READY-0}" = "1" ]; then
      printf '{"callback":"https://blog.example.com/.well-known/lnurlp/zap/callback","allowsNostr":true,"nostrPubkey":"1111111111111111111111111111111111111111111111111111111111111111"}\n'
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

cat > "$BIN_DIR/lightning-cli" <<'EOS'
#!/bin/sh
set -eu
if [ "${1-}" != "" ] && printf '%s' "$1" | grep -Eq '^--lightning-dir='; then
  shift
fi
cmd=${1-}
shift || true
case "$cmd" in
  getinfo)
    if [ "${MOCK_LIGHTNING_ONLINE-0}" = "1" ]; then
      printf '{"id":"1111111111111111111111111111111111111111111111111111111111111111","alias":"testsite","num_peers":2,"num_active_channels":1,"num_pending_channels":0}\n'
      exit 0
    fi
    exit 1
    ;;
  listfunds)
    if [ "${MOCK_LIGHTNING_ONLINE-0}" = "1" ]; then
      printf '{"channels":[{"amount_msat":"900000msat","our_amount_msat":"300000msat"}]}\n'
      exit 0
    fi
    exit 1
    ;;
  *)
    exit 1
    ;;
esac
EOS
chmod +x "$BIN_DIR/lightning-cli"

export PATH="$BIN_DIR:$PATH"
export WIZARDRY_SITES_DIR="$SITES_DIR"
export WIZARDRY_SITE_NAME="$SITE_NAME"

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"

blog_init
config-set "$blog_site_conf" domain blog.example.com
config-set "$blog_site_conf" lightning_public_host node.blog.example.com
config-set "$blog_site_conf" lightning_public_port 19777
config-set "$blog_site_conf" zap_lud16 zap@blog.example.com
printf '%s\n' 'npub1siteexamplewalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' > "$NOSTR_STATE_DIR/site_npub"
printf '%s\n' '1111111111111111111111111111111111111111111111111111111111111111' > "$NOSTR_STATE_DIR/site_pubkey"

admin_profile=$(blog_user_profile admin)
config-set "$admin_profile" username admin
config-set "$admin_profile" fingerprint test-fingerprint
config-set "$admin_profile" is_admin true

session_parts=$(blog_create_session admin test-fingerprint)
session_token=${session_parts%%;*}
rest=${session_parts#*;}
csrf_token=${rest%%;*}

run_lightning_cgi() {
  query=$1
  host=$2
  QUERY_STRING="$query" HTTP_HOST="$host" "$ROOT_DIR/cgi/blog-manage-lightning" 2>&1
}

run_zaps_cgi() {
  query=$1
  host=$2
  QUERY_STRING="$query" HTTP_HOST="$host" "$ROOT_DIR/cgi/blog-manage-zaps" 2>&1
}

# 1) auth required when session is missing.
auth_out=$(run_lightning_cgi 'action=status' 'blog.example.com')
assert_contains "$auth_out" '"code":"auth_required"' 'status requires auth'

# 2) csrf required when token is invalid.
csrf_out=$(run_lightning_cgi "action=status&session_token=$session_token&csrf_token=bad" 'blog.example.com')
assert_contains "$csrf_out" '"code":"csrf_invalid"' 'status requires matching csrf'

# 3) status returns Headquarters-managed runtime keys.
unset MOCK_LIGHTNING_ONLINE || true
unset MOCK_ZAP_ENDPOINT_READY || true
status_out=$(run_lightning_cgi "action=status&session_token=$session_token&csrf_token=$csrf_token" 'blog.example.com')
assert_contains "$status_out" '"success":true' 'status returns success'
assert_contains "$status_out" '"headquarters_managed":true' 'status reports Headquarters-managed provisioning'
assert_contains "$status_out" '"lightning_host":"node.blog.example.com"' 'status derives configured node host'
assert_contains "$status_out" '"lightning_port":19777' 'status emits configured lightning port'
assert_contains "$status_out" '"lightning_online":false' 'status reports lightning offline when RPC does not answer'
assert_contains "$status_out" '"effective_lud16":"zap@blog.example.com"' 'status reports effective Lightning Address'
assert_contains "$status_out" '"zap_endpoint_ready":false' 'status reports Lightning Address endpoint pending'
assert_contains "$status_out" '"public_address":"node.blog.example.com:19777"' 'status emits public peer address'
assert_contains "$status_out" '"site_signer_ready":true' 'status reports site signer readiness from cached site pubkey'

# 4) status prefers the Headquarters-managed zap wrapper when it is present.
mkdir -p "$SITE_DATA/zaps/bin"
cat > "$SITE_DATA/zaps/bin/lightning-cli" <<'EOS'
#!/bin/sh
set -eu
if [ "${1-}" != "" ] && printf '%s' "$1" | grep -Eq '^--lightning-dir='; then
  shift
fi
cmd=${1-}
case "$cmd" in
  getinfo)
    printf '{"id":"2222222222222222222222222222222222222222222222222222222222222222","alias":"managed-zap-node","num_peers":3,"num_active_channels":2,"num_pending_channels":0}\n'
    ;;
  listfunds)
    printf '{"channels":[{"amount_msat":1200000,"our_amount_msat":200000}]}\n'
    ;;
  *)
    exit 1
    ;;
esac
EOS
chmod +x "$SITE_DATA/zaps/bin/lightning-cli"
managed_out=$(run_lightning_cgi "action=status&session_token=$session_token&csrf_token=$csrf_token" 'blog.example.com')
assert_contains "$managed_out" '"lightning_online":true' 'status uses managed zap lightning-cli wrapper when available'
assert_contains "$managed_out" '"node_alias":"managed-zap-node"' 'status reports node info from managed zap wrapper'
assert_contains "$managed_out" '"inbound_liquidity_sats":1000' 'status reports managed wrapper inbound liquidity'

# 5) status reports live Lightning + Lightning Address endpoint when the public services answer.
MOCK_LIGHTNING_ONLINE=1
MOCK_ZAP_ENDPOINT_READY=1
export MOCK_LIGHTNING_ONLINE MOCK_ZAP_ENDPOINT_READY
live_out=$(run_lightning_cgi "action=status&session_token=$session_token&csrf_token=$csrf_token" 'blog.example.com')
assert_contains "$live_out" '"lightning_online":true' 'status reports Lightning online when RPC answers'
assert_contains "$live_out" '"zap_endpoint_ready":true' 'status reports Lightning Address endpoint live'
assert_contains "$live_out" '"zap_endpoint_url":"https://blog.example.com/.well-known/lnurlp/zap"' 'status emits Lightning Address endpoint URL'
assert_contains "$live_out" '"can_receive_zaps":true' 'status reports zap receive readiness when endpoint and inbound liquidity exist'

# 6) install actions are blocked because provisioning moved to Headquarters.
managed_out=$(run_lightning_cgi "action=install_lightning&session_token=$session_token&csrf_token=$csrf_token" 'blog.example.com')
assert_contains "$managed_out" '"success":false' 'install action returns failure in site admin'
assert_contains "$managed_out" '"code":"managed_externally"' 'install action reports external management boundary'
assert_contains "$managed_out" 'Bitcoin, Core Lightning, and the Lightning Address endpoint are provisioned in Headquarters.' 'install action explains Headquarters ownership'

# 7) Zap status treats a live Headquarters-managed public endpoint as receive-ready
# even when the blog server cannot inspect the remote Lightning node directly.
config-set "$blog_site_conf" zaps_enabled true
rm -f "$NOSTR_STATE_DIR/site_npub" "$NOSTR_STATE_DIR/site_pubkey"
rm -f "$SITE_DATA/zaps/bin/lightning-cli"
MOCK_ZAP_ENDPOINT_READY=1
unset MOCK_LIGHTNING_ONLINE || true
export MOCK_ZAP_ENDPOINT_READY
zaps_live_out=$(run_zaps_cgi "action=status&session_token=$session_token&csrf_token=$csrf_token" 'blog.example.com')
assert_contains "$zaps_live_out" '"zap_endpoint_ready":true' 'zaps status reports the public Lightning Address endpoint as live'
assert_contains "$zaps_live_out" '"zap_endpoint_nostr_pubkey":"1111111111111111111111111111111111111111111111111111111111111111"' 'zaps status reads the zap recipient pubkey from endpoint metadata'
assert_contains "$zaps_live_out" '"site_signer_ready":true' 'zaps status treats endpoint metadata as signer readiness when local site npub cache is absent'
assert_contains "$zaps_live_out" '"lightning_online":false' 'zaps status still reports local Lightning visibility separately'
assert_contains "$zaps_live_out" '"can_receive_zaps":true' 'zaps status reports receive readiness through the managed endpoint'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
