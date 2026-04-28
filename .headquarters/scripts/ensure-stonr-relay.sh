#!/bin/sh
set -eu

site_user=${HQ_SITE_USER-}
site_domain=${HQ_SITE_DOMAIN-}
support_site_name=nostr-blog
support_relay_domain=''
support_relay_url=''
support_public_write=false
support_mirror_posts=true
support_mirror_comments=true
support_search=false

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

run_site() {
  if [ "$(id -u)" -eq 0 ]; then
    runuser -u "$site_user" -- "$@"
    return $?
  fi
  if [ "$(id -un)" = "$site_user" ]; then
    "$@"
    return $?
  fi
  run_root runuser -u "$site_user" -- "$@"
}

status_ok() {
  printf 'status=ok\n'
  printf 'summary=%s\n' "$1"
}

status_bad() {
  printf 'status=bad\n'
  printf 'summary=%s\n' "$1"
}

require_site_context() {
  [ -n "$site_user" ] || {
    status_bad "HQ_SITE_USER is required for Stonr relay provisioning."
    exit 1
  }
  [ -n "$site_domain" ] || {
    status_bad "HQ_SITE_DOMAIN is required for Stonr relay provisioning."
    exit 1
  }
}

support_file() {
  for candidate in \
    "${HQ_UPLOADED_TREE_PATH-}/.headquarters/site-support/stonr-relay.conf" \
    "${HQ_SITE_LOCAL_PATH-}/.headquarters/site-support/stonr-relay.conf" \
    ".headquarters/site-support/stonr-relay.conf"
  do
    [ -n "$candidate" ] || continue
    [ -f "$candidate" ] || continue
    printf '%s\n' "$candidate"
    return 0
  done
  return 1
}

support_value() {
  key=$1
  file=$(support_file 2>/dev/null || printf '')
  [ -n "$file" ] || return 1
  awk -F= -v key="$key" '
    $1 == key {
      sub(/^[^=]+=/, "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      print
      exit
    }
  ' "$file"
}

bool_value() {
  value=$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]' | tr -d '\r\n[:space:]')
  default=${2:-false}
  case "$value" in
    true|yes|1|on) printf 'true\n' ;;
    false|no|0|off) printf 'false\n' ;;
    *) printf '%s\n' "$default" ;;
  esac
}

load_support_policy() {
  support_site_name=$(support_value site 2>/dev/null || printf "$support_site_name")
  support_relay_domain=$(support_value relay_domain 2>/dev/null || printf '')
  support_relay_url=$(support_value relay_url 2>/dev/null || printf '')
  support_public_write=$(bool_value "$(support_value public_write 2>/dev/null || printf '')" false)
  support_mirror_posts=$(bool_value "$(support_value mirror_posts 2>/dev/null || printf '')" true)
  support_mirror_comments=$(bool_value "$(support_value mirror_comments 2>/dev/null || printf '')" true)
  support_search=$(bool_value "$(support_value search 2>/dev/null || printf '')" false)

  [ -n "$support_relay_domain" ] || support_relay_domain=$site_domain
  if [ -z "$support_relay_url" ]; then
    support_relay_url="wss://$support_relay_domain"
  fi
  support_relay_url=$(printf '%s' "$support_relay_url" | sed -e 's#/$##')
}

relay_domain() {
  printf '%s\n' "${support_relay_domain:-$site_domain}"
}

relay_url() {
  printf '%s\n' "${support_relay_url:-wss://$site_domain}"
}

site_home() {
  printf '/home/%s\n' "$site_user"
}

nostr_state_dir() {
  printf '%s/.sitedata/site/nostr/state\n' "$(site_home)"
}

relay_root() {
  printf '%s/.sitedata/site/nostr/relay\n' "$(site_home)"
}

relay_store_root() {
  printf '%s/store\n' "$(relay_root)"
}

relay_env_file() {
  printf '%s/relay.env\n' "$(relay_root)"
}

service_name() {
  printf 'headquarters-stonr-%s\n' "$site_user"
}

service_file() {
  printf '/etc/systemd/system/%s.service\n' "$(service_name)"
}

root_hook_file() {
  printf '/etc/nginx/headquarters-site/%s/root.d/stonr-relay.conf\n' "$site_user"
}

server_hook_file() {
  printf '/etc/nginx/headquarters-site/%s/server.d/stonr-relay.conf\n' "$site_user"
}

domain_hook_file() {
  printf '/etc/nginx/headquarters-domain/%s/server.d/stonr-relay.conf\n' "$(relay_domain)"
}

calc_http_port() {
  checksum=$(printf '%s\n' "$site_user" | cksum | awk '{print $1}')
  offset=$((checksum % 10000))
  printf '%s\n' $((38000 + (offset * 2)))
}

calc_ws_port() {
  http_port=$(calc_http_port)
  printf '%s\n' $((http_port + 1))
}

proxy_http_upstream() {
  printf '127.0.0.1:%s\n' "$(calc_http_port)"
}

proxy_ws_upstream() {
  printf '127.0.0.1:%s\n' "$(calc_ws_port)"
}

validate_pubkey() {
  value=$(printf '%s' "${1-}" | tr -d '\r\n[:space:]' | tr 'A-F' 'a-f')
  case "$value" in
    ''|*[!0-9a-f]*) return 1 ;;
  esac
  if [ "${#value}" -eq 64 ]; then
    printf '%s\n' "$value"
    return 0
  fi
  return 1
}

read_site_pubkey() {
  pubkey=$(run_site sed -n '1p' "$(nostr_state_dir)/site_pubkey" 2>/dev/null | tr -d '\r\n[:space:]')
  validate_pubkey "$pubkey"
}

default_upstream_relays() {
  printf '%s\n' \
    'wss://relay.damus.io' \
    'wss://nos.lol' \
    'wss://relay.primal.net' \
    'wss://nostr.wine'
}

build_upstream_relays_csv() {
  own_primary="wss://$(relay_domain)"
  own_secondary="ws://$(relay_domain)"
  staging_primary="wss://$site_domain"
  staging_secondary="ws://$site_domain"
  relays_path="$(nostr_state_dir)/relays"
  if run_root test -f "$relays_path"; then
    csv=$(run_site cat "$relays_path" 2>/dev/null | awk -v own_primary="$own_primary" -v own_secondary="$own_secondary" -v staging_primary="$staging_primary" -v staging_secondary="$staging_secondary" '
      {
        gsub(/\r/, "", $0)
        sub(/[[:space:]]*#.*$/, "", $0)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
        if ($0 == "" || $0 == own_primary || $0 == own_secondary || $0 == staging_primary || $0 == staging_secondary) next
        if (!seen[$0]++) print $0
      }
    ' | paste -sd, - 2>/dev/null || true)
    if [ -n "$csv" ]; then
      printf '%s\n' "$csv"
      return 0
    fi
  fi
  default_upstream_relays | paste -sd, -
}

write_site_home_relays() {
  home_relay=$(relay_url)
  staging_primary="wss://$site_domain"
  staging_secondary="ws://$site_domain"
  relays_path="$(nostr_state_dir)/relays"
  tmp=$(mktemp "${TMPDIR:-/tmp}/stonr-site-relays.XXXXXX")
  {
    printf '%s\n' "$home_relay"
    if run_root test -f "$relays_path"; then
      run_site cat "$relays_path" 2>/dev/null || true
    fi
    default_upstream_relays
  } | awk -v home="$home_relay" -v staging_primary="$staging_primary" -v staging_secondary="$staging_secondary" '
    {
      gsub(/\r/, "", $0)
      sub(/[[:space:]]*#.*$/, "", $0)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
      if ($0 == "" || $0 == staging_primary || $0 == staging_secondary) next
      if (!seen[$0]++) print $0
    }
  ' > "$tmp"
  run_root install -d -o "$site_user" -g "$site_user" -m 0755 "$(dirname "$relays_path")"
  run_root install -o "$site_user" -g "$site_user" -m 0644 "$tmp" "$relays_path"
  rm -f "$tmp"
}

write_root_hook() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/stonr-root-hook.XXXXXX")
  cat > "$tmp" <<'EOF_ROOT'
if ($http_upgrade != "") {
  return 418;
}
if ($http_accept ~* "application/nostr\\+json") {
  return 419;
}
EOF_ROOT
  run_root install -m 0644 -o root -g root "$tmp" "$(root_hook_file)"
  rm -f "$tmp"
}

write_server_hook() {
  http_upstream=$(proxy_http_upstream)
  ws_upstream=$(proxy_ws_upstream)
  tmp=$(mktemp "${TMPDIR:-/tmp}/stonr-server-hook.XXXXXX")
  cat > "$tmp" <<EOF_SERVER
error_page 418 = @headquarters_stonr_ws;
error_page 419 = @headquarters_stonr_http_root;

location @headquarters_stonr_ws {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Upgrade \$http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_pass http://$ws_upstream;
}

location @headquarters_stonr_http_root {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_pass http://$http_upstream;
}

location = /healthz {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_pass http://$http_upstream/healthz;
}

location = /readyz {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_pass http://$http_upstream/readyz;
}

location = /query {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_pass http://$http_upstream/query;
}

location = /count {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_pass http://$http_upstream/count;
}

location = /retention-health {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_pass http://$http_upstream/retention-health;
}

location = /mirror-health {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_pass http://$http_upstream/mirror-health;
}
EOF_SERVER
  run_root install -m 0644 -o root -g root "$tmp" "$(server_hook_file)"
  rm -f "$tmp"
}

write_domain_hook() {
  http_upstream=$(proxy_http_upstream)
  ws_upstream=$(proxy_ws_upstream)
  hook_dir=$(dirname "$(domain_hook_file)")
  tmp=$(mktemp "${TMPDIR:-/tmp}/stonr-domain-hook.XXXXXX")
  cat > "$tmp" <<EOF_DOMAIN
# Headquarters-managed Stonr relay hook for $support_site_name.
# This exposes only the Nostr relay interface on $(relay_domain); the normal
# website on this domain remains otherwise owned by its existing nginx vhost.
error_page 418 = @headquarters_stonr_ws_${site_user};
error_page 419 = @headquarters_stonr_http_root_${site_user};

location = / {
  if (\$http_upgrade != "") {
    return 418;
  }
  if (\$http_accept ~* "application/nostr\\\\+json") {
    return 419;
  }
  try_files \$uri \$uri/ =404;
}

location @headquarters_stonr_ws_${site_user} {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Upgrade \$http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_pass http://$ws_upstream;
}

location @headquarters_stonr_http_root_${site_user} {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_pass http://$http_upstream;
}

location = /healthz {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_pass http://$http_upstream/healthz;
}

location = /readyz {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_pass http://$http_upstream/readyz;
}

location = /query {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_pass http://$http_upstream/query;
}

location = /count {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_pass http://$http_upstream/count;
}

location = /retention-health {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_pass http://$http_upstream/retention-health;
}

location = /mirror-health {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_pass http://$http_upstream/mirror-health;
}
EOF_DOMAIN
  run_root install -d -m 0755 "$hook_dir"
  run_root install -m 0644 -o root -g root "$tmp" "$(domain_hook_file)"
  rm -f "$tmp"
}

disable_staging_relay_hooks_when_needed() {
  [ "$(relay_domain)" != "$site_domain" ] || return 0
  run_root rm -f "$(root_hook_file)" "$(server_hook_file)"
}

write_env_file() {
  site_pubkey=$(read_site_pubkey 2>/dev/null || printf '')
  [ -n "$site_pubkey" ] || {
    status_bad "Site pubkey cache is missing. Run the Site Nostr Identity requirement first."
    exit 1
  }
  relays_upstream=$(build_upstream_relays_csv)
  http_port=$(calc_http_port)
  ws_port=$(calc_ws_port)
  tmp=$(mktemp "${TMPDIR:-/tmp}/stonr-env.XXXXXX")
  cat > "$tmp" <<EOF_ENV
STORE_ROOT=$(relay_store_root)
BIND_HTTP=127.0.0.1:$http_port
BIND_WS=127.0.0.1:$ws_port
VERIFY_SIG=1
RELAY_NAME="$(relay_domain)"
RELAY_DESCRIPTION="Stonr site mirror for $support_site_name"
ENABLE_NIP11=1
ENABLE_QUERY=1
ENABLE_COUNT=1
ENABLE_TAG_QUERIES=1
ENABLE_SEARCH=$([ "$support_search" = true ] && printf 1 || printf 0)
ENABLE_PUBLISH=$([ "$support_public_write" = true ] && printf 1 || printf 0)
ENABLE_MIRRORING=1
FILTER_PRIVATE_MESSAGES=1
MIRROR_MODE=site
MIRROR_SITE_AUTHOR=$site_pubkey
MIRROR_SITE_INCLUDE_COMMENTS=$([ "$support_mirror_comments" = true ] && printf 1 || printf 0)
SUPPORT_SITE=$support_site_name
PUBLIC_RELAY_URL=$(relay_url)
RELAYS_UPSTREAM=$relays_upstream
EOF_ENV
  run_root install -d -o "$site_user" -g "$site_user" -m 755 "$(relay_root)"
  run_root install -d -o "$site_user" -g "$site_user" -m 755 "$(relay_store_root)"
  run_root install -o "$site_user" -g "$site_user" -m 0640 "$tmp" "$(relay_env_file)"
  rm -f "$tmp"
}

write_service_file() {
  env_path=$(relay_env_file)
  tmp=$(mktemp "${TMPDIR:-/tmp}/stonr-service.XXXXXX")
  cat > "$tmp" <<EOF_SERVICE
[Unit]
Description=Headquarters Stonr relay for $(relay_domain)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$site_user
Group=$site_user
WorkingDirectory=$(site_home)
ExecStartPre=/usr/local/bin/stonr --env $env_path init
ExecStart=/usr/local/bin/stonr --env $env_path serve
Restart=on-failure
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF_SERVICE
  run_root install -m 0644 -o root -g root "$tmp" "$(service_file)"
  rm -f "$tmp"
}

check_status() {
  require_site_context
  load_support_policy
  command -v stonr >/dev/null 2>&1 || {
    status_bad "Stonr is not installed on this server."
    return 0
  }
  if ! run_root test -f "$(relay_env_file)"; then
    status_bad "Stonr relay env file is missing."
    return 0
  fi
  [ -f "$(service_file)" ] || {
    status_bad "Stonr systemd service file is missing."
    return 0
  }
  if [ "$(relay_domain)" = "$site_domain" ]; then
    [ -f "$(root_hook_file)" ] || {
      status_bad "Nginx root hook for Stonr is missing."
      return 0
    }
    [ -f "$(server_hook_file)" ] || {
      status_bad "Nginx server hook for Stonr is missing."
      return 0
    }
  else
    [ -f "$(domain_hook_file)" ] || {
      status_bad "Nginx domain hook for Stonr is missing."
      return 0
    }
    if [ -f "$(root_hook_file)" ] || [ -f "$(server_hook_file)" ]; then
      status_bad "Staging-domain Stonr hooks are still installed; the relay should only be exposed on $(relay_domain)."
      return 0
    fi
  fi
  command -v systemctl >/dev/null 2>&1 || {
    status_bad "systemctl is required for Stonr relay provisioning."
    return 0
  }
  if ! systemctl is-active --quiet "$(service_name)" 2>/dev/null; then
    status_bad "Stonr service $(service_name) is not active."
    return 0
  fi
  if ! curl -fsS "http://$(proxy_http_upstream)/healthz" >/dev/null 2>&1; then
    status_bad "Stonr health check is not responding on the local HTTP port."
    return 0
  fi
  if ! curl -fsS -H 'Accept: application/nostr+json' "https://$(relay_domain)/" | grep -q '"software":"stonr"'; then
    status_bad "Public NIP-11 relay info is not available on https://$(relay_domain)/."
    return 0
  fi
  if ! curl -fsS "https://$(relay_domain)/healthz" >/dev/null 2>&1; then
    status_bad "Public relay health endpoint is not available on https://$(relay_domain)/healthz."
    return 0
  fi
  first_relay=$(run_site sed -n '1p' "$(nostr_state_dir)/relays" 2>/dev/null | tr -d '\r\n')
  if [ "$first_relay" != "$(relay_url)" ]; then
    status_bad "Site relay list is not locked to $(relay_url) as the primary relay."
    return 0
  fi
  status_ok "Stonr relay is active for $(relay_domain), locked to $support_site_name, and exposed as the site's primary mirror relay."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
load_support_policy
command -v stonr >/dev/null 2>&1 || {
  status_bad "Stonr is not installed on this server."
  exit 1
}
command -v curl >/dev/null 2>&1 || {
  status_bad "curl is required for relay smoke checks."
  exit 1
}
command -v systemctl >/dev/null 2>&1 || {
  status_bad "systemctl is required for relay provisioning."
  exit 1
}

run_root install -d -m 755 "/etc/nginx/headquarters-site/$site_user/server.d" "/etc/nginx/headquarters-site/$site_user/root.d"
write_site_home_relays
write_env_file
run_site stonr --env "$(relay_env_file)" init
write_root_hook
write_server_hook
write_domain_hook
disable_staging_relay_hooks_when_needed
write_service_file
run_root systemctl daemon-reload
run_root systemctl enable --now "$(service_name)"
run_root nginx -t
run_root systemctl reload nginx 2>/dev/null || run_root service nginx reload 2>/dev/null || true

check_status
