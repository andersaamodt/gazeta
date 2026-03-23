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

assert_not_contains() {
  haystack=$1
  needle=$2
  label=$3
  if printf '%s' "$haystack" | grep -Fq "$needle"; then
    fail "$label (unexpected: $needle)"
  else
    pass
  fi
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/btcpay-runtime-test.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=testsite
SITES_DIR="$TMP_ROOT/sites"
SITE_ROOT="$SITES_DIR/$SITE_NAME"
SITE_DATA="$SITES_DIR/.sitedata/$SITE_NAME"
BIN_DIR="$TMP_ROOT/bin"
WIZARDRY_DIR="$TMP_ROOT/wizardry"
BTCPAY_MARKER="$TMP_ROOT/btcpay-installed"

mkdir -p "$SITE_ROOT/site/pages" "$SITE_DATA" "$BIN_DIR" "$WIZARDRY_DIR/spells/web"

cat > "$WIZARDRY_DIR/spells/web/build" <<'EOS'
#!/bin/sh
exit 0
EOS
chmod +x "$WIZARDRY_DIR/spells/web/build"

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

cat > "$BIN_DIR/web-wizardry" <<'EOS'
#!/bin/sh
set -eu
cmd=${1-}
marker=${MOCK_BTCPAY_MARKER:-}
case "$cmd" in
  --help|-h|--usage)
    cat <<'HELP'
Commands:
  check-btcpay
  install-btcpay
  uninstall-btcpay
HELP
    exit 0
    ;;
  check-btcpay)
    if [ "${MOCK_BTCPAY_STATUS-}" = "ok" ] || [ -n "$marker" ] && [ -f "$marker" ]; then
      printf 'status=ok\n'
      printf 'summary=mock installed\n'
    else
      printf 'status=bad\n'
      printf 'summary=mock not installed\n'
    fi
    exit 0
    ;;
  install-btcpay)
    if [ -z "${BTCPAY_HOST-}" ]; then
      printf 'missing BTCPAY_HOST\n' >&2
      exit 1
    fi
    lines=${MOCK_BTCPAY_INSTALL_LINES:-1}
    i=1
    while [ "$i" -le "$lines" ]; do
      printf 'install-line-%03d\n' "$i"
      i=$((i + 1))
    done
    if [ "${MOCK_BTCPAY_INSTALL_FAIL-0}" = "1" ]; then
      exit 1
    fi
    if [ -n "$marker" ]; then
      : > "$marker"
    fi
    printf 'installed\n'
    exit 0
    ;;
  uninstall-btcpay)
    if [ "${MOCK_BTCPAY_UNINSTALL_FAIL-0}" = "1" ]; then
      exit 1
    fi
    if [ -n "$marker" ]; then
      rm -f "$marker"
    fi
    printf 'uninstalled\n'
    exit 0
    ;;
  *)
    printf 'unknown command: %s\n' "$cmd" >&2
    exit 1
    ;;
esac
EOS
chmod +x "$BIN_DIR/web-wizardry"

export PATH="$BIN_DIR:$PATH"
export WIZARDRY_SITES_DIR="$SITES_DIR"
export WIZARDRY_SITE_NAME="$SITE_NAME"
export WIZARDRY_DIR
export MOCK_BTCPAY_MARKER="$BTCPAY_MARKER"

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"

blog_init

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

# 3) status returns runtime keys.
status_out=$(run_btcpay_cgi "action=status&session_token=$session_token&csrf_token=$csrf_token" 'blog.example.com')
assert_contains "$status_out" '"success":true' 'status returns success'
assert_contains "$status_out" '"wizardry_installed":true' 'status shows wizardry installed'
assert_contains "$status_out" '"btcpay_installed":false' 'status starts as not installed'
assert_contains "$status_out" '"btcpay_host":"pay.blog.example.com"' 'status derives pay subdomain host'
assert_contains "$status_out" '"btcpay_url":"https://pay.blog.example.com"' 'status emits derived btcpay URL'

# 4) install success path.
unset MOCK_BTCPAY_STATUS || true
MOCK_BTCPAY_INSTALL_FAIL=0
MOCK_BTCPAY_INSTALL_LINES=5
export MOCK_BTCPAY_INSTALL_FAIL MOCK_BTCPAY_INSTALL_LINES
install_out=$(run_btcpay_cgi "action=install_btcpay&session_token=$session_token&csrf_token=$csrf_token" 'blog.example.com')
assert_contains "$install_out" '"success":true' 'install action returns success'
assert_contains "$install_out" 'BTCPay install completed.' 'install action reports completion'
assert_contains "$install_out" '"btcpay_installed":true' 'runtime flips to installed after install'

# 5) invalid host failure when no configured override is present.
invalid_host_out=$(run_btcpay_cgi "action=install_btcpay&session_token=$session_token&csrf_token=$csrf_token" 'localhost')
assert_contains "$invalid_host_out" '"success":false' 'invalid host install returns failure'
assert_contains "$invalid_host_out" '"code":"btcpay_host_invalid"' 'invalid host returns btcpay_host_invalid code'

# 6) installer non-zero failure with log truncation.
MOCK_BTCPAY_INSTALL_FAIL=1
MOCK_BTCPAY_INSTALL_LINES=200
export MOCK_BTCPAY_INSTALL_FAIL MOCK_BTCPAY_INSTALL_LINES
failed_install_out=$(run_btcpay_cgi "action=install_btcpay&session_token=$session_token&csrf_token=$csrf_token" 'blog.example.com')
assert_contains "$failed_install_out" '"success":false' 'failed installer returns failure'
assert_contains "$failed_install_out" '"code":"btcpay_install_failed"' 'failed installer returns btcpay_install_failed code'
assert_contains "$failed_install_out" 'install-line-200' 'tail log includes latest installer lines'
assert_not_contains "$failed_install_out" 'install-line-001' 'tail log excludes earliest installer lines'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
