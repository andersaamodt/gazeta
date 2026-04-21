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

run_site_user() {
  command_string=$1
  if [ "$(id -u)" -eq 0 ]; then
    su -s /bin/sh "$site_user" -c "$command_string"
    return $?
  fi
  if [ -n "${HQ_REMOTE_SUDO_PASSWORD-}" ] && command -v sudo >/dev/null 2>&1; then
    printf '%s\n' "$HQ_REMOTE_SUDO_PASSWORD" | sudo -S -p '' -u "$site_user" sh -lc "$command_string"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo -u "$site_user" sh -lc "$command_string"
    return $?
  fi
  sh -lc "$command_string"
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
  pubkey=$(sed -n '1p' "$(nostr_state_dir)/site_pubkey" 2>/dev/null | tr -d '\r\n[:space:]')
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
  own_primary="wss://$site_domain"
  own_secondary="ws://$site_domain"
  relays_path="$(nostr_state_dir)/relays"
  if [ -f "$relays_path" ]; then
    csv=$(awk -v own_primary="$own_primary" -v own_secondary="$own_secondary" '
      {
        gsub(/\r/, "", $0)
        sub(/[[:space:]]*#.*$/, "", $0)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
        if ($0 == "" || $0 == own_primary || $0 == own_secondary) next
        if (!seen[$0]++) print $0
      }
    ' "$relays_path" | paste -sd, - 2>/dev/null || true)
    if [ -n "$csv" ]; then
      printf '%s\n' "$csv"
      return 0
    fi
  fi
  default_upstream_relays | paste -sd, -
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
RELAY_NAME="$site_domain"
RELAY_DESCRIPTION="Stonr relay for $site_domain"
ENABLE_NIP11=1
ENABLE_QUERY=1
ENABLE_COUNT=1
ENABLE_TAG_QUERIES=1
ENABLE_SEARCH=0
ENABLE_PUBLISH=0
ENABLE_MIRRORING=1
FILTER_PRIVATE_MESSAGES=1
MIRROR_MODE=site
MIRROR_SITE_AUTHOR=$site_pubkey
MIRROR_SITE_INCLUDE_COMMENTS=1
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
Description=Headquarters Stonr relay for $site_domain
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
  command -v stonr >/dev/null 2>&1 || {
    status_bad "Stonr is not installed on this server."
    return 0
  }
  [ -f "$(relay_env_file)" ] || {
    status_bad "Stonr relay env file is missing."
    return 0
  }
  [ -f "$(service_file)" ] || {
    status_bad "Stonr systemd service file is missing."
    return 0
  }
  [ -f "$(root_hook_file)" ] || {
    status_bad "Nginx root hook for Stonr is missing."
    return 0
  }
  [ -f "$(server_hook_file)" ] || {
    status_bad "Nginx server hook for Stonr is missing."
    return 0
  }
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
  if ! curl -fsS -H 'Accept: application/nostr+json' "https://$site_domain/" | grep -q '"software":"stonr"'; then
    status_bad "Public NIP-11 relay info is not available on https://$site_domain/."
    return 0
  fi
  if ! curl -fsS "https://$site_domain/healthz" >/dev/null 2>&1; then
    status_bad "Public relay health endpoint is not available on https://$site_domain/healthz."
    return 0
  fi
  status_ok "Stonr relay is active for $site_domain and exposed through the Headquarters nginx vhost."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
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
write_env_file
run_site_user "stonr --env '$(relay_env_file)' init"
write_root_hook
write_server_hook
write_service_file
run_root systemctl daemon-reload
run_root systemctl enable --now "$(service_name)"
run_root nginx -t
run_root systemctl reload nginx 2>/dev/null || run_root service nginx reload 2>/dev/null || true

check_status
