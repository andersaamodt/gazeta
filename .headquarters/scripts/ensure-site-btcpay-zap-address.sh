#!/bin/sh
set -eu

site_user=${HQ_SITE_USER-}
site_domain=${HQ_SITE_DOMAIN-}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return 0
  fi
  if [ -n "${HQ_REMOTE_SUDO_PASSWORD-}" ] && command -v sudo >/dev/null 2>&1; then
    printf '%s\n' "$HQ_REMOTE_SUDO_PASSWORD" | sudo -S -p '' "$@"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return $?
  fi
  "$@"
}

status_ok() {
  printf 'status=ok\n'
  printf 'summary=%s\n' "$1"
}

status_bad() {
  printf 'status=bad\n'
  printf 'summary=%s\n' "$1"
}

print_runtime_fields() {
  btcpay_host=$(resolve_btcpay_host)
  btcpay_rootpath=$(resolve_btcpay_rootpath)
  alias_domain=$(zap_alias_domain)
  alias_localpart=$(zap_alias_localpart)
  printf 'btcpay_host=%s\n' "$btcpay_host"
  printf 'btcpay_rootpath=%s\n' "$btcpay_rootpath"
  printf 'btcpay_url=%s\n' "$(btcpay_public_url)"
  printf 'zap_alias_localpart=%s\n' "$alias_localpart"
  printf 'zap_alias_domain=%s\n' "$alias_domain"
  printf 'zap_lud16=%s@%s\n' "$alias_localpart" "$alias_domain"
  printf 'zap_endpoint_url=%s\n' "$(zap_endpoint_url)"
  if [ "$alias_domain" = "$site_domain" ]; then
    printf 'site_hook_supported=true\n'
  else
    printf 'site_hook_supported=false\n'
  fi
  if [ -f "$(server_hook_file)" ]; then
    printf 'site_hook_installed=true\n'
  else
    printf 'site_hook_installed=false\n'
  fi
  if [ "$alias_domain" = "$site_domain" ]; then
    if [ -f "$(server_hook_file)" ]; then
      printf 'alias_hook_installed=true\n'
    else
      printf 'alias_hook_installed=false\n'
    fi
  else
    if [ -f "$(alias_server_hook_file)" ]; then
      printf 'alias_hook_installed=true\n'
    else
      printf 'alias_hook_installed=false\n'
    fi
  fi
}

require_site_context() {
  [ -n "$site_user" ] || {
    status_bad "HQ_SITE_USER is required for BTCPay zap address wiring."
    exit 1
  }
  [ -n "$site_domain" ] || {
    status_bad "HQ_SITE_DOMAIN is required for BTCPay zap address wiring."
    exit 1
  }
}

site_home() {
  printf '/home/%s\n' "$site_user"
}

active_site_conf() {
  printf '%s/site/site.conf\n' "$(site_home)"
}

release_site_conf() {
  printf '%s/.wizardry.hq/release-config/site.conf\n' "$(site_home)"
}

server_hook_file() {
  printf '/etc/nginx/headquarters-site/%s/server.d/btcpay-zap-address.conf\n' "$site_user"
}

alias_server_hook_dir() {
  printf '/etc/nginx/headquarters-domain/%s/server.d\n' "$(zap_alias_domain)"
}

alias_server_hook_file() {
  printf '%s/btcpay-zap-address.conf\n' "$(alias_server_hook_dir)"
}

alias_domain_vhost_file() {
  printf '/etc/nginx/sites-available/%s\n' "$(zap_alias_domain)"
}

read_conf_value() {
  file=$1
  key=$2
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, "", $0); print $0; exit }' "$file" 2>/dev/null || true
}

write_conf_value() {
  file=$1
  key=$2
  value=$3
  tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-zap-conf.XXXXXX")
  awk -F= -v key="$key" -v value="$value" '
BEGIN { replaced = 0 }
$1 == key {
  if (!replaced) {
    printf "%s=%s\n", key, value
    replaced = 1
  }
  next
}
{ print }
END {
  if (!replaced) {
    printf "%s=%s\n", key, value
  }
}
' "$file" > "$tmp"
  run_root install -o "$site_user" -g "$site_user" -m 640 "$tmp" "$file"
  rm -f "$tmp"
}

normalize_host() {
  raw=${1-}
  raw=$(printf '%s' "$raw" | tr -d '\r\n' | sed -e 's#^[[:space:]]*##' -e 's#[[:space:]]*$##')
  raw=$(printf '%s' "$raw" | sed -e 's#^https\{0,1\}://##' -e 's#/.*$##' -e 's/:[0-9][0-9]*$//')
  printf '%s\n' "$raw"
}

valid_host() {
  candidate=${1-}
  [ -n "$candidate" ] || return 1
  printf '%s' "$candidate" | grep -Eq '^[A-Za-z0-9.-]+$' || return 1
  printf '%s' "$candidate" | grep -q '\.' || return 1
  case "$candidate" in
    localhost|*.local|*..*|.*|*.) return 1 ;;
    [0-9]*.[0-9]*.[0-9]*.[0-9]*) return 1 ;;
  esac
  return 0
}

normalize_rootpath() {
  raw=${1-}
  raw=$(printf '%s' "$raw" | tr -d '\r\n' | sed -e 's#^[[:space:]]*##' -e 's#[[:space:]]*$##')
  case "$raw" in
    ''|'/')
      printf '/\n'
      return 0
      ;;
    *://*)
      raw=$(printf '%s' "$raw" | sed -e 's#^[A-Za-z][A-Za-z0-9+.-]*://[^/]*##')
      ;;
  esac
  raw=$(printf '%s' "$raw" | sed -e 's/[?#].*$//')
  case "$raw" in
    '') raw='/' ;;
    /*) ;;
    *) raw="/$raw" ;;
  esac
  raw=$(printf '%s' "$raw" | sed -e 's#//*#/#g' -e 's#/$##')
  [ -n "$raw" ] || raw='/'
  printf '%s\n' "$raw"
}

resolve_btcpay_host() {
  configured=$(normalize_host "$(read_conf_value "$(active_site_conf)" btcpay_host)")
  if valid_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
  configured=$(normalize_host "$(read_conf_value "$(release_site_conf)" btcpay_host)")
  if valid_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
  printf 'pay.%s\n' "$site_domain"
}

resolve_btcpay_rootpath() {
  configured=$(normalize_rootpath "$(read_conf_value "$(active_site_conf)" btcpay_rootpath)")
  if [ "$configured" != "/" ]; then
    printf '%s\n' "$configured"
    return 0
  fi
  configured=$(normalize_rootpath "$(read_conf_value "$(release_site_conf)" btcpay_rootpath)")
  if [ "$configured" != "/" ]; then
    printf '%s\n' "$configured"
    return 0
  fi
  printf '/\n'
}

btcpay_public_url() {
  btcpay_host=$(resolve_btcpay_host)
  btcpay_rootpath=$(resolve_btcpay_rootpath)
  if [ "$btcpay_rootpath" = "/" ]; then
    printf 'https://%s\n' "$btcpay_host"
    return 0
  fi
  printf 'https://%s%s\n' "$btcpay_host" "$btcpay_rootpath"
}

btcpay_lnurl_proxy_pass() {
  upstream=$(btcpay_proxy_upstream)
  btcpay_rootpath=$(resolve_btcpay_rootpath)
  if [ "$btcpay_rootpath" = "/" ]; then
    printf 'http://%s\n' "$upstream"
    return 0
  fi
  printf 'http://%s%s$request_uri\n' "$upstream" "$btcpay_rootpath"
}

btcpay_http_port() {
  checksum=$(printf '%s\n' "$site_user" | cksum | awk '{print $1}')
  offset=$((checksum % 1000))
  printf '%s\n' $((41000 + (offset * 2)))
}

btcpay_proxy_upstream() {
  printf '127.0.0.1:%s\n' "$(btcpay_http_port)"
}

zap_alias_localpart() {
  configured=$(read_conf_value "$(active_site_conf)" zap_alias_name)
  configured=$(printf '%s' "$configured" | tr -d '\r\n[:space:]')
  [ -n "$configured" ] || configured=$(read_conf_value "$(release_site_conf)" zap_alias_name)
  configured=$(printf '%s' "$configured" | tr -d '\r\n[:space:]')
  [ -n "$configured" ] || configured=zap
  printf '%s\n' "$(printf '%s' "$configured" | tr '[:upper:]' '[:lower:]')"
}

zap_alias_domain() {
  configured=$(normalize_host "$(read_conf_value "$(active_site_conf)" zap_alias_domain)")
  if valid_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
  configured=$(normalize_host "$(read_conf_value "$(release_site_conf)" zap_alias_domain)")
  if valid_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
  printf '%s\n' "$site_domain"
}

desired_zap_lud16() {
  printf '%s@%s\n' "$(zap_alias_localpart)" "$(zap_alias_domain)" | tr '[:upper:]' '[:lower:]'
}

zap_endpoint_url() {
  printf 'https://%s/.well-known/lnurlp/%s\n' "$(zap_alias_domain)" "$(zap_alias_localpart)"
}

write_server_hook() {
  proxy_target=$(btcpay_lnurl_proxy_pass)
  tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-zap-hook.XXXXXX")
  cat > "$tmp" <<EOF_HOOK
location ^~ /.well-known/lnurlp/ {
  proxy_http_version 1.1;
  proxy_set_header Host \$http_host;
  proxy_set_header X-Forwarded-Proto \$scheme;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_pass $proxy_target;
}

location = /.well-known/nostr.json {
  proxy_http_version 1.1;
  proxy_set_header Host \$http_host;
  proxy_set_header X-Forwarded-Proto \$scheme;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_pass $proxy_target;
}
EOF_HOOK
  run_root install -d -m 755 "/etc/nginx/headquarters-site/$site_user/server.d"
  run_root install -m 0644 -o root -g root "$tmp" "$(server_hook_file)"
  rm -f "$tmp"
}

write_alias_server_hook() {
  proxy_target=$(btcpay_lnurl_proxy_pass)
  tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-zap-alias-hook.XXXXXX")
  cat > "$tmp" <<EOF_HOOK
location ^~ /.well-known/lnurlp/ {
  proxy_http_version 1.1;
  proxy_set_header Host \$http_host;
  proxy_set_header X-Forwarded-Proto \$scheme;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_pass $proxy_target;
}

location = /.well-known/nostr.json {
  proxy_http_version 1.1;
  proxy_set_header Host \$http_host;
  proxy_set_header X-Forwarded-Proto \$scheme;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_pass $proxy_target;
}
EOF_HOOK
  run_root install -d -m 755 "$(alias_server_hook_dir)"
  run_root install -m 0644 -o root -g root "$tmp" "$(alias_server_hook_file)"
  rm -f "$tmp"
}

ensure_alias_domain_include() {
  vhost_file=$(alias_domain_vhost_file)
  [ -f "$vhost_file" ] || {
    status_bad "The apex nginx vhost $vhost_file does not exist yet."
    exit 1
  }
  include_line="  include $(alias_server_hook_dir)/*.conf;"
  if run_root grep -Fq "$include_line" "$vhost_file"; then
    return 0
  fi
  tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-zap-vhost.XXXXXX")
  run_root awk -v include_line="$include_line" '
    { lines[NR] = $0 }
    END {
      close_idx = 0
      for (i = NR; i >= 1; i--) {
        if (lines[i] ~ /^[[:space:]]*}[[:space:]]*$/) {
          close_idx = i
          break
        }
      }
      if (close_idx == 0) {
        exit 1
      }
      for (i = 1; i <= NR; i++) {
        if (i == close_idx) {
          print include_line
        }
        print lines[i]
      }
    }
  ' "$vhost_file" > "$tmp" || {
    rm -f "$tmp"
    status_bad "Could not patch $vhost_file with the BTCPay well-known include."
    exit 1
  }
  run_root install -m 0644 -o root -g root "$tmp" "$vhost_file"
  rm -f "$tmp"
}

reload_nginx() {
  run_root nginx -t
  run_root systemctl reload nginx 2>/dev/null || run_root service nginx reload 2>/dev/null || true
}

btcpay_public_ready() {
  curl -fsSI "$(btcpay_public_url)/" >/dev/null 2>&1
}

zap_endpoint_ready() {
  curl -fsS "$(zap_endpoint_url)" 2>/dev/null | grep -Eq '"callback"|"allowsNostr"'
}

check_status() {
  require_site_context
  print_runtime_fields
  [ -f "$(active_site_conf)" ] || {
    status_bad "The active site.conf file is missing."
    return 0
  }
  [ -f "$(release_site_conf)" ] || {
    status_bad "The managed release site.conf file is missing."
    return 0
  }
  if [ "$(printf '%s' "$(read_conf_value "$(active_site_conf)" zap_lud16)" | tr -d '\r\n[:space:]' | tr '[:upper:]' '[:lower:]')" != "$(desired_zap_lud16)" ]; then
    status_bad "The active site config is not publishing $(desired_zap_lud16) yet."
    return 0
  fi
  if [ "$(printf '%s' "$(read_conf_value "$(release_site_conf)" zap_lud16)" | tr -d '\r\n[:space:]' | tr '[:upper:]' '[:lower:]')" != "$(desired_zap_lud16)" ]; then
    status_bad "The managed release config is not publishing $(desired_zap_lud16) yet."
    return 0
  fi
  if [ "$(zap_alias_domain)" = "$site_domain" ] && [ ! -f "$(server_hook_file)" ]; then
    status_bad "The site's nginx well-known hook for BTCPay zaps is missing."
    return 0
  fi
  if [ "$(zap_alias_domain)" != "$site_domain" ] && [ ! -f "$(alias_server_hook_file)" ]; then
    status_bad "The apex nginx well-known hook for $(zap_alias_domain) is missing."
    return 0
  fi
  if ! btcpay_public_ready; then
    printf 'btcpay_public_ready=false\n'
    status_bad "BTCPay is not reachable at $(btcpay_public_url)/."
    return 0
  fi
  printf 'btcpay_public_ready=true\n'
  if ! zap_endpoint_ready; then
    printf 'zap_endpoint_ready=false\n'
    if [ "$(zap_alias_domain)" != "$site_domain" ]; then
      status_bad "BTCPay is online, but $(zap_endpoint_url) is not live yet. Because $(zap_alias_domain) is not the site domain, route /.well-known/lnurlp/* and /.well-known/nostr.json for that domain to $(btcpay_public_url)/, then in BTCPay create the first admin, create a store, connect the internal Lightning node, and enable the Lightning Address name $(zap_alias_localpart)."
      return 0
    fi
    status_bad "BTCPay is online, but $(zap_endpoint_url) is not returning a Lightning Address response yet. In BTCPay create the first admin, create a store, connect the internal Lightning node, and enable the Lightning Address name $(zap_alias_localpart)."
    return 0
  fi
  printf 'zap_endpoint_ready=true\n'
  status_ok "Lightning Address zaps are live at $(desired_zap_lud16) through BTCPay."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
[ -f "$(active_site_conf)" ] || {
  status_bad "The active site.conf file is missing."
  exit 1
}
[ -f "$(release_site_conf)" ] || {
  status_bad "The managed release site.conf file is missing."
  exit 1
}

write_conf_value "$(active_site_conf)" btcpay_host "$(resolve_btcpay_host)"
write_conf_value "$(release_site_conf)" btcpay_host "$(resolve_btcpay_host)"
write_conf_value "$(active_site_conf)" zap_lud16 "$(desired_zap_lud16)"
write_conf_value "$(release_site_conf)" zap_lud16 "$(desired_zap_lud16)"

if [ "$(zap_alias_domain)" = "$site_domain" ]; then
  write_server_hook
  reload_nginx
else
  write_alias_server_hook
  ensure_alias_domain_include
  reload_nginx
fi

check_status
