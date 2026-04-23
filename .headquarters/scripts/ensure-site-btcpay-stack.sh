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
  printf 'btcpay_host=%s\n' "$btcpay_host"
  printf 'btcpay_rootpath=%s\n' "$btcpay_rootpath"
  printf 'btcpay_url=%s\n' "$(btcpay_public_url)"
  printf 'btcpay_http_port=%s\n' "$(btcpay_http_port)"
  printf 'btcpay_proxy_upstream=%s\n' "$(btcpay_proxy_upstream)"
  printf 'lightning_alias=%s\n' "$(lightning_alias)"
}

require_site_context() {
  [ -n "$site_user" ] || {
    status_bad "HQ_SITE_USER is required for BTCPay provisioning."
    exit 1
  }
  [ -n "$site_domain" ] || {
    status_bad "HQ_SITE_DOMAIN is required for BTCPay provisioning."
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

btcpay_root() {
  printf '%s/.sitedata/site/btcpay\n' "$(site_home)"
}

btcpay_repo_dir() {
  printf '%s/btcpayserver-docker\n' "$(btcpay_root)"
}

btcpay_compose_file() {
  printf '%s/Generated/docker-compose.generated.yml\n' "$(btcpay_repo_dir)"
}

btcpay_custom_fragment_file() {
  printf '%s/docker-compose-generator/docker-fragments/headquarters-local-proxy.custom.yml\n' "$(btcpay_repo_dir)"
}

btcpay_profile_file() {
  printf '/etc/profile.d/btcpay-env.sh\n'
}

btcpay_http_port() {
  checksum=$(printf '%s\n' "$site_user" | cksum | awk '{print $1}')
  offset=$((checksum % 1000))
  printf '%s\n' $((41000 + (offset * 2)))
}

btcpay_proxy_upstream() {
  printf '127.0.0.1:%s\n' "$(btcpay_http_port)"
}

btcpay_vhost_file() {
  printf '/etc/nginx/sites-available/headquarters-btcpay-%s.conf\n' "$site_user"
}

btcpay_vhost_link() {
  printf '/etc/nginx/sites-enabled/headquarters-btcpay-%s.conf\n' "$site_user"
}

btcpay_domain_hook_dir() {
  printf '/etc/nginx/headquarters-domain/%s/server.d\n' "$(resolve_btcpay_host)"
}

btcpay_domain_hook_file() {
  printf '%s/btcpay-rootpath.conf\n' "$(btcpay_domain_hook_dir)"
}

btcpay_domain_vhost_file() {
  printf '/etc/nginx/sites-available/%s\n' "$(resolve_btcpay_host)"
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

read_conf_value() {
  file=$1
  key=$2
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, "", $0); print $0; exit }' "$file" 2>/dev/null || true
}

write_conf_value() {
  file=$1
  key=$2
  value=$3
  tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-site-conf.XXXXXX")
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

mem_total_mib() {
  if [ -r /proc/meminfo ]; then
    awk '/MemTotal:/ { printf "%d\n", int($2 / 1024); exit }' /proc/meminfo
    return 0
  fi
  printf '0\n'
}

swap_total_mib() {
  if [ -r /proc/meminfo ]; then
    awk '/SwapTotal:/ { printf "%d\n", int($2 / 1024); exit }' /proc/meminfo
    return 0
  fi
  printf '0\n'
}

ensure_swap_for_btcpay() {
  mem_mib=$(mem_total_mib)
  swap_mib=$(swap_total_mib)
  [ "$mem_mib" -gt 0 ] || return 0
  [ "$mem_mib" -lt 1024 ] || return 0
  [ "$swap_mib" -lt 1024 ] || return 0
  swap_file=/swapfile-btcpay
  if ! run_root test -f "$swap_file"; then
    if command -v fallocate >/dev/null 2>&1; then
      run_root fallocate -l 2G "$swap_file"
    else
      run_root dd if=/dev/zero of="$swap_file" bs=1M count=2048
    fi
    run_root chmod 600 "$swap_file"
    run_root mkswap "$swap_file" >/dev/null
  fi
  run_root swapon "$swap_file" 2>/dev/null || true
  if ! run_root grep -Fq "$swap_file none swap sw 0 0" /etc/fstab; then
    tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-fstab.XXXXXX")
    run_root sh -eu -c 'cat /etc/fstab > "$1"' sh "$tmp"
    printf '%s\n' "$swap_file none swap sw 0 0" >> "$tmp"
    run_root install -m 0644 -o root -g root "$tmp" /etc/fstab
    rm -f "$tmp"
  fi
}

lightning_alias() {
  printf '%s\n' "$site_domain" | tr -c 'A-Za-z0-9-' '-' | sed 's/--*/-/g' | sed 's/^-//' | cut -c 1-28
}

cert_fullchain() {
  printf '/etc/letsencrypt/live/%s/fullchain.pem\n' "$(resolve_btcpay_host)"
}

cert_privkey() {
  printf '/etc/letsencrypt/live/%s/privkey.pem\n' "$(resolve_btcpay_host)"
}

have_tls_cert() {
  run_root test -f "$(cert_fullchain)" && run_root test -f "$(cert_privkey)"
}

ensure_git_available() {
  if command -v git >/dev/null 2>&1; then
    return 0
  fi
  if command -v apt-get >/dev/null 2>&1; then
    run_root apt-get update -y >/dev/null
    run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y git ca-certificates curl >/dev/null
    return 0
  fi
  if command -v dnf >/dev/null 2>&1; then
    run_root dnf install -y git ca-certificates curl >/dev/null
    return 0
  fi
  if command -v brew >/dev/null 2>&1; then
    run_root brew install git >/dev/null
    return 0
  fi
  status_bad "git is required to provision BTCPay and could not be installed automatically."
  exit 1
}

ensure_repo_checkout() {
  ensure_git_available
  run_root install -d -m 755 "$(btcpay_root)"
  if run_root test -d "$(btcpay_repo_dir)/.git"; then
    run_root sh -eu -c '
repo_dir=$1
cd "$repo_dir"
git fetch --depth 1 origin >/dev/null 2>&1 || true
git reset --hard FETCH_HEAD >/dev/null 2>&1 || true
' sh "$(btcpay_repo_dir)"
    return 0
  fi
  run_root rm -rf "$(btcpay_repo_dir)"
  run_root git clone --depth 1 https://github.com/btcpayserver/btcpayserver-docker.git "$(btcpay_repo_dir)" >/dev/null 2>&1 || {
    status_bad "Could not clone btcpayserver-docker into $(btcpay_repo_dir)."
    exit 1
  }
}

write_custom_fragment() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-local-proxy-fragment.XXXXXX")
  cat > "$tmp" <<'EOF_FRAGMENT'
# Headquarters now drives the local BTCPay port through NOREVERSEPROXY_HTTP_PORT.
# This file remains as an owned placeholder so the managed checkout stays self-describing.
EOF_FRAGMENT
  run_root install -d -m 755 "$(dirname "$(btcpay_custom_fragment_file)")"
  run_root install -m 0644 -o root -g root "$tmp" "$(btcpay_custom_fragment_file)"
  rm -f "$tmp"
}

sanitize_btcpay_profile() {
  profile_file=$(btcpay_profile_file)
  [ -f "$profile_file" ] || return 0
  tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-profile.XXXXXX")
  run_root awk '
    BEGIN {
      rewrite_env_loader = 0
    }
    /^export BTCPAYGEN_ADDITIONAL_FRAGMENTS=/ {
      print "export BTCPAYGEN_ADDITIONAL_FRAGMENTS=\"opt-save-storage-s;opt-save-memory\""
      next
    }
    /^export BTCPAYGEN_EXCLUDE_FRAGMENTS=/ {
      print "export BTCPAYGEN_EXCLUDE_FRAGMENTS=\"nginx-https;opt-add-tor;headquarters-local-proxy.custom\""
      next
    }
    /^if cat "\$BTCPAY_ENV_FILE" &> \/dev\/null; then$/ {
      print "if [ -r \"$BTCPAY_ENV_FILE\" ]; then"
      print "  while IFS= read -r line; do"
      print "    case \"$line\" in"
      print "      \"\"|\\#*) continue ;;"
      print "      *=*) export \"$line\" ;;"
      print "    esac"
      print "  done < \"$BTCPAY_ENV_FILE\""
      rewrite_env_loader = 1
      next
    }
    rewrite_env_loader {
      if ($0 == "fi") {
        print "fi"
        rewrite_env_loader = 0
      }
      next
    }
    { print }
  ' "$profile_file" > "$tmp"
  run_root install -m 0644 -o root -g root "$tmp" "$profile_file"
  rm -f "$tmp"
}

sanitize_generated_btcpay_compose() {
  compose_file=$(btcpay_compose_file)
  [ -f "$compose_file" ] || return 0
  tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-compose.XXXXXX")
  run_root awk '
    index($0, "127.0.0.1:${REVERSEPROXY_HTTP_PORT") { next }
    { print }
  ' "$compose_file" > "$tmp"
  run_root install -m 0644 -o root -g root "$tmp" "$compose_file"
  rm -f "$tmp"
}

restart_btcpay_stack() {
  run_root sh -eu -c '
repo_dir=$1
profile_file=$2
cd "$repo_dir"
. "$profile_file"
. ./helpers.sh
btcpay_down >/dev/null 2>&1 || true
docker rm -f generated_btcpayserver_1 nginx nginx-gen >/dev/null 2>&1 || true
btcpay_up >/dev/null 2>&1
' sh "$(btcpay_repo_dir)" "$(btcpay_profile_file)" || {
    status_bad "BTCPay restart failed after compose normalization."
    exit 1
  }
}

proxy_header_lines() {
  cat <<'EOF_HEADERS'
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
EOF_HEADERS
}

write_btcpay_vhost() {
  btcpay_host=$(resolve_btcpay_host)
  upstream=$(btcpay_proxy_upstream)
  tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-nginx-vhost.XXXXXX")
  if have_tls_cert; then
    tls_options_include=''
    if run_root test -f /etc/letsencrypt/options-ssl-nginx.conf; then
      tls_options_include='  include /etc/letsencrypt/options-ssl-nginx.conf;'
    fi
    tls_dhparam_line=''
    if run_root test -f /etc/letsencrypt/ssl-dhparams.pem; then
      tls_dhparam_line='  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;'
    fi
    cat > "$tmp" <<EOF_VHOST
server {
  listen 80;
  server_name $btcpay_host;
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl http2;
  server_name $btcpay_host;
  ssl_certificate $(cert_fullchain);
  ssl_certificate_key $(cert_privkey);
$tls_options_include
$tls_dhparam_line
  client_max_body_size 64m;
  proxy_buffer_size 128k;
  proxy_buffers 4 256k;
  proxy_busy_buffers_size 256k;

  location / {
$(proxy_header_lines)
    proxy_pass http://$upstream;
  }
}
EOF_VHOST
  else
    cat > "$tmp" <<EOF_VHOST
server {
  listen 80;
  server_name $btcpay_host;
  client_max_body_size 64m;
  proxy_buffer_size 128k;
  proxy_buffers 4 256k;
  proxy_busy_buffers_size 256k;

  location / {
$(proxy_header_lines)
    proxy_pass http://$upstream;
  }
}
EOF_VHOST
  fi
  run_root install -m 0644 -o root -g root "$tmp" "$(btcpay_vhost_file)"
  rm -f "$tmp"
  run_root ln -snf "$(btcpay_vhost_file)" "$(btcpay_vhost_link)"
}

write_btcpay_domain_hook() {
  upstream=$(btcpay_proxy_upstream)
  btcpay_rootpath=$(resolve_btcpay_rootpath)
  tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-rootpath-hook.XXXXXX")
  cat > "$tmp" <<EOF_HOOK
location = $btcpay_rootpath {
  return 301 $btcpay_rootpath/;
}

location ^~ $btcpay_rootpath/ {
$(proxy_header_lines)
  proxy_pass http://$upstream;
}
EOF_HOOK
  run_root install -d -m 755 "$(btcpay_domain_hook_dir)"
  run_root install -m 0644 -o root -g root "$tmp" "$(btcpay_domain_hook_file)"
  rm -f "$tmp"
}

ensure_btcpay_domain_include() {
  vhost_file=$(btcpay_domain_vhost_file)
  [ -f "$vhost_file" ] || {
    status_bad "The nginx vhost $vhost_file does not exist yet."
    exit 1
  }
  include_line="  include $(btcpay_domain_hook_dir)/*.conf;"
  if run_root grep -Fq "$include_line" "$vhost_file"; then
    return 0
  fi
  tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-domain-vhost.XXXXXX")
  run_root awk -v include_line="$include_line" '
    END {
      if (!insert_idx) {
        exit 1
      }
      for (i = 1; i <= NR; i++) {
        if (i == insert_idx) {
          print include_line
        }
        print lines[i]
      }
    }
    {
      lines[NR] = $0
      if (!in_server && $0 ~ /^[[:space:]]*server[[:space:]]*{[[:space:]]*$/) {
        in_server = 1
        depth = 1
        next
      }
      if (!in_server) {
        next
      }
      line = $0
      opens = gsub(/{/, "{", line)
      closes = gsub(/}/, "}", line)
      depth += opens - closes
      if (depth == 0 && !insert_idx) {
        insert_idx = NR
      }
    }
  ' "$vhost_file" > "$tmp" || {
    rm -f "$tmp"
    status_bad "Could not patch $vhost_file with the BTCPay root-path include."
    exit 1
  }
  run_root install -m 0644 -o root -g root "$tmp" "$vhost_file"
  rm -f "$tmp"
}

write_btcpay_public_proxy() {
  if [ "$(resolve_btcpay_rootpath)" = "/" ]; then
    write_btcpay_vhost
    return 0
  fi
  write_btcpay_domain_hook
  ensure_btcpay_domain_include
}

reload_nginx() {
  run_root nginx -t
  run_root systemctl reload nginx 2>/dev/null || run_root service nginx reload 2>/dev/null || true
}

ensure_btcpay_https_cert() {
  if [ "$(resolve_btcpay_rootpath)" != "/" ]; then
    return 0
  fi
  btcpay_host=$(resolve_btcpay_host)
  have_tls_cert && return 0
  command -v certbot >/dev/null 2>&1 || {
    status_bad "certbot is required to publish BTCPay on https://$btcpay_host."
    exit 1
  }
  run_root certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d "$btcpay_host" >/dev/null 2>&1 || {
    status_bad "Could not provision a TLS certificate for https://$btcpay_host via certbot."
    exit 1
  }
}

run_btcpay_install() {
  btcpay_host=$(resolve_btcpay_host)
  additional_fragments='opt-save-storage-s;opt-save-memory'
  exclude_fragments='nginx-https;opt-add-tor;headquarters-local-proxy.custom'
  input_file=$(mktemp "${TMPDIR:-/tmp}/btcpay-setup-input.XXXXXX")
  i=0
  while [ "$i" -lt 16 ]; do
    printf '\n' >> "$input_file"
    i=$((i + 1))
  done
  set +e
  if command -v timeout >/dev/null 2>&1; then
    run_root sh -eu -c '
repo_dir=$1
input_file=$2
cd "$repo_dir"
command -v bash >/dev/null 2>&1 || exit 127
BTCPAY_HOST=$3 \
REVERSEPROXY_DEFAULT_HOST=$3 \
BTCPAY_ROOTPATH=$4 \
REVERSEPROXY_HTTP_PORT=$5 \
NOREVERSEPROXY_HTTP_PORT=$5 \
BTCPAY_BASE_DIR=$6 \
BTCPAY_ADDITIONAL_HOSTS= \
NBITCOIN_NETWORK=mainnet \
BTCPAYGEN_CRYPTO1=btc \
BTCPAYGEN_REVERSEPROXY=none \
BTCPAYGEN_LIGHTNING=clightning \
BTCPAYGEN_ADDITIONAL_FRAGMENTS=$7 \
BTCPAYGEN_EXCLUDE_FRAGMENTS=$8 \
LIGHTNING_ALIAS=$9 \
timeout 3600 bash -e -c "source ./btcpay-setup.sh -i" < "$input_file"
' sh "$(btcpay_repo_dir)" "$input_file" "$btcpay_host" "$(resolve_btcpay_rootpath)" "$(btcpay_http_port)" "$(btcpay_root)" "$additional_fragments" "$exclude_fragments" "$(lightning_alias)" >/dev/null 2>&1
    status=$?
  else
    run_root sh -eu -c '
repo_dir=$1
input_file=$2
cd "$repo_dir"
command -v bash >/dev/null 2>&1 || exit 127
BTCPAY_HOST=$3 \
REVERSEPROXY_DEFAULT_HOST=$3 \
BTCPAY_ROOTPATH=$4 \
REVERSEPROXY_HTTP_PORT=$5 \
NOREVERSEPROXY_HTTP_PORT=$5 \
BTCPAY_BASE_DIR=$6 \
BTCPAY_ADDITIONAL_HOSTS= \
NBITCOIN_NETWORK=mainnet \
BTCPAYGEN_CRYPTO1=btc \
BTCPAYGEN_REVERSEPROXY=none \
BTCPAYGEN_LIGHTNING=clightning \
BTCPAYGEN_ADDITIONAL_FRAGMENTS=$7 \
BTCPAYGEN_EXCLUDE_FRAGMENTS=$8 \
LIGHTNING_ALIAS=$9 \
bash -e -c "source ./btcpay-setup.sh -i" < "$input_file"
' sh "$(btcpay_repo_dir)" "$input_file" "$btcpay_host" "$(resolve_btcpay_rootpath)" "$(btcpay_http_port)" "$(btcpay_root)" "$additional_fragments" "$exclude_fragments" "$(lightning_alias)" >/dev/null 2>&1
    status=$?
  fi
  set -e
  rm -f "$input_file"
  [ "$status" -eq 0 ] || {
    status_bad "BTCPay setup failed for $btcpay_host."
    exit 1
  }
  sanitize_btcpay_profile
  sanitize_generated_btcpay_compose
  restart_btcpay_stack
}

update_site_config() {
  btcpay_host=$(resolve_btcpay_host)
  btcpay_rootpath=$(resolve_btcpay_rootpath)
  [ -f "$(active_site_conf)" ] || {
    status_bad "The active site.conf file is missing."
    exit 1
  }
  [ -f "$(release_site_conf)" ] || {
    status_bad "The managed release site.conf file is missing."
    exit 1
  }
  write_conf_value "$(active_site_conf)" btcpay_host "$btcpay_host"
  write_conf_value "$(release_site_conf)" btcpay_host "$btcpay_host"
  write_conf_value "$(active_site_conf)" btcpay_rootpath "$btcpay_rootpath"
  write_conf_value "$(release_site_conf)" btcpay_rootpath "$btcpay_rootpath"
}

local_btcpay_proxy_ready() {
  btcpay_rootpath=$(resolve_btcpay_rootpath)
  curl -fsS -H "Host: $(resolve_btcpay_host)" -H 'X-Forwarded-Proto: https' "http://$(btcpay_proxy_upstream)$btcpay_rootpath/" >/dev/null 2>&1
}

btcpay_public_ready() {
  curl -fsSI "$(btcpay_public_url)/" >/dev/null 2>&1
}

btcpay_bitcoin_pruned() {
  run_root sh -eu -c '
repo_dir=$1
cd "$repo_dir"
./bitcoin-cli.sh getblockchaininfo 2>/dev/null | grep -Eq "\"pruned\"[[:space:]]*:[[:space:]]*true"
' sh "$(btcpay_repo_dir)"
}

btcpay_lightning_ready() {
  run_root sh -eu -c '
repo_dir=$1
cd "$repo_dir"
./bitcoin-lightning-cli.sh getinfo 2>/dev/null | grep -q "\"id\""
' sh "$(btcpay_repo_dir)"
}

lightning_port_listening() {
  run_root sh -eu -c '
if command -v ss >/dev/null 2>&1; then
  ss -ltn 2>/dev/null | awk "{print \$4}" | grep -Eq "(^|:)9735$"
  exit $?
fi
if command -v netstat >/dev/null 2>&1; then
  netstat -ltn 2>/dev/null | awk "{print \$4}" | grep -Eq "(^|:)9735$"
  exit $?
fi
exit 1
'
}

check_status() {
  require_site_context
  print_runtime_fields
  command -v docker >/dev/null 2>&1 || {
    status_bad "Docker is not installed on this server."
    return 0
  }
  [ -x "$(btcpay_repo_dir)/btcpay-setup.sh" ] || {
    status_bad "BTCPay checkout is missing at $(btcpay_repo_dir)."
    return 0
  }
  [ -f "$(btcpay_custom_fragment_file)" ] || {
    status_bad "BTCPay local proxy fragment is missing."
    return 0
  }
  if [ "$(resolve_btcpay_rootpath)" = "/" ]; then
    [ -f "$(btcpay_vhost_file)" ] || {
      status_bad "The nginx vhost for $(resolve_btcpay_host) is missing."
      return 0
    }
    [ -L "$(btcpay_vhost_link)" ] || {
      status_bad "The nginx vhost for $(resolve_btcpay_host) is not enabled."
      return 0
    }
  else
    [ -f "$(btcpay_domain_hook_file)" ] || {
      status_bad "The nginx root-path hook for $(resolve_btcpay_host) is missing."
      return 0
    }
    include_line="  include $(btcpay_domain_hook_dir)/*.conf;"
    if ! run_root grep -Fq "$include_line" "$(btcpay_domain_vhost_file)"; then
      status_bad "The nginx vhost for $(resolve_btcpay_host) does not include the BTCPay root-path hook."
      return 0
    fi
  fi
  [ -f "$(active_site_conf)" ] || {
    status_bad "The active site.conf file is missing."
    return 0
  }
  [ -f "$(release_site_conf)" ] || {
    status_bad "The managed release site.conf file is missing."
    return 0
  }
  if [ "$(normalize_host "$(read_conf_value "$(active_site_conf)" btcpay_host)")" != "$(resolve_btcpay_host)" ]; then
    status_bad "The active site config is not pointed at $(resolve_btcpay_host)."
    return 0
  fi
  if [ "$(normalize_host "$(read_conf_value "$(release_site_conf)" btcpay_host)")" != "$(resolve_btcpay_host)" ]; then
    status_bad "The managed release config is not pointed at $(resolve_btcpay_host)."
    return 0
  fi
  if [ "$(normalize_rootpath "$(read_conf_value "$(active_site_conf)" btcpay_rootpath)")" != "$(resolve_btcpay_rootpath)" ]; then
    status_bad "The active site config is not pointed at BTCPay root path $(resolve_btcpay_rootpath)."
    return 0
  fi
  if [ "$(normalize_rootpath "$(read_conf_value "$(release_site_conf)" btcpay_rootpath)")" != "$(resolve_btcpay_rootpath)" ]; then
    status_bad "The managed release config is not pointed at BTCPay root path $(resolve_btcpay_rootpath)."
    return 0
  fi
  if ! local_btcpay_proxy_ready; then
    printf 'btcpay_local_proxy_ready=false\n'
    status_bad "The local BTCPay proxy is not responding on $(btcpay_proxy_upstream)."
    return 0
  fi
  printf 'btcpay_local_proxy_ready=true\n'
  if ! btcpay_public_ready; then
    printf 'btcpay_public_ready=false\n'
    status_bad "BTCPay is not reachable at $(btcpay_public_url)/."
    return 0
  fi
  printf 'btcpay_public_ready=true\n'
  if ! btcpay_bitcoin_pruned; then
    printf 'bitcoin_pruned=false\n'
    status_bad "BTCPay's Bitcoin backend is not reporting a pruned node."
    return 0
  fi
  printf 'bitcoin_pruned=true\n'
  if ! btcpay_lightning_ready; then
    printf 'lightning_ready=false\n'
    status_bad "BTCPay's Core Lightning node is not responding yet."
    return 0
  fi
  printf 'lightning_ready=true\n'
  if ! lightning_port_listening; then
    printf 'lightning_port_listening=false\n'
    status_bad "Core Lightning peer port 9735 is not listening on the host."
    return 0
  fi
  printf 'lightning_port_listening=true\n'
  status_ok "BTCPay, pruned Bitcoin Core, and Core Lightning are active for $site_domain via $(btcpay_public_url)/, and the Lightning peer port is listening on 9735."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
ensure_repo_checkout
ensure_swap_for_btcpay
write_custom_fragment
write_btcpay_public_proxy
reload_nginx
run_btcpay_install
ensure_btcpay_https_cert
write_btcpay_public_proxy
reload_nginx
update_site_config
check_status
