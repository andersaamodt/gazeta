#!/bin/sh
set -eu

site_user=${HQ_SITE_USER-}
site_domain=${HQ_SITE_DOMAIN-}
janus_ws_path=/janus-ws
janus_ws_port=8188
janus_rtp_range=20000-20100

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
    status_bad "HQ_SITE_USER is required for video chat backend provisioning."
    exit 1
  }
  [ -n "$site_domain" ] || {
    status_bad "HQ_SITE_DOMAIN is required for video chat backend provisioning."
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

janus_wss_url() {
  printf 'wss://%s%s\n' "$site_domain" "$janus_ws_path"
}

nginx_hook_dir() {
  printf '/etc/nginx/headquarters-site/%s/server.d\n' "$site_user"
}

nginx_hook_file() {
  printf '%s/video-chat-janus.conf\n' "$(nginx_hook_dir)"
}

read_conf_value() {
  file=$1
  key=$2
  run_site awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, "", $0); print $0; exit }' "$file" 2>/dev/null || true
}

write_conf_value() {
  file=$1
  key=$2
  value=$3
  tmp=$(mktemp "${TMPDIR:-/tmp}/site-video-chat-conf.XXXXXX")
  run_site awk -F= -v key="$key" -v value="$value" '
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

patch_janus_websocket_config() {
  conf=/etc/janus/janus.transport.websockets.jcfg
  run_root test -f "$conf" || return 0
  tmp=$(mktemp "${TMPDIR:-/tmp}/janus-ws-conf.XXXXXX")
  run_root awk -v port="$janus_ws_port" '
{
  line = $0
  sub(/^[[:space:]]*#?[[:space:]]*ws[[:space:]]*=.*/, "\tws = true", line)
  sub(/^[[:space:]]*#?[[:space:]]*ws_port[[:space:]]*=.*/, "\tws_port = " port, line)
  sub(/^[[:space:]]*#?[[:space:]]*ws_ip[[:space:]]*=.*/, "\tws_ip = \"127.0.0.1\"", line)
  sub(/^[[:space:]]*#?[[:space:]]*ws_acl[[:space:]]*=.*/, "\tws_acl = \"127.\"", line)
  sub(/^[[:space:]]*#?[[:space:]]*wss[[:space:]]*=.*/, "\twss = false", line)
  print line
}
' "$conf" > "$tmp"
  run_root install -o root -g root -m 0644 "$tmp" "$conf"
  rm -f "$tmp"
}

patch_janus_core_config() {
  conf=/etc/janus/janus.jcfg
  run_root test -f "$conf" || return 0
  tmp=$(mktemp "${TMPDIR:-/tmp}/janus-core-conf.XXXXXX")
  run_root awk -v rtp_range="$janus_rtp_range" '
{
  line = $0
  sub(/^[[:space:]]*#?[[:space:]]*rtp_port_range[[:space:]]*=.*/, "\trtp_port_range = \"" rtp_range "\"", line)
  sub(/^[[:space:]]*#?[[:space:]]*stun_server[[:space:]]*=.*/, "\tstun_server = \"stun.l.google.com\"", line)
  sub(/^[[:space:]]*#?[[:space:]]*stun_port[[:space:]]*=.*/, "\tstun_port = 19302", line)
  print line
}
' "$conf" > "$tmp"
  run_root install -o root -g root -m 0644 "$tmp" "$conf"
  rm -f "$tmp"
}

write_nginx_hook() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/video-chat-janus-nginx.XXXXXX")
  cat > "$tmp" <<EOF_NGINX
location = $janus_ws_path {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_set_header Upgrade \$http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 86400s;
  proxy_send_timeout 86400s;
  proxy_buffering off;
  proxy_pass http://127.0.0.1:$janus_ws_port/;
}
EOF_NGINX
  run_root install -d -m 0755 "$(nginx_hook_dir)"
  run_root install -o root -g root -m 0644 "$tmp" "$(nginx_hook_file)"
  rm -f "$tmp"
}

open_firewall_if_needed() {
  if command -v ufw >/dev/null 2>&1 && run_root ufw status 2>/dev/null | grep -Fq 'Status: active'; then
    run_root ufw allow "$janus_rtp_range/udp" >/dev/null 2>&1 || true
  fi
}

install_janus_package() {
  if command -v janus >/dev/null 2>&1; then
    return 0
  fi
  if command -v apt-get >/dev/null 2>&1; then
    run_root env DEBIAN_FRONTEND=noninteractive apt-get update
    run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y janus
    return 0
  fi
  status_bad "Janus is not installed and this host does not have apt-get."
  exit 1
}

restart_janus() {
  if command -v systemctl >/dev/null 2>&1; then
    run_root systemctl enable janus >/dev/null 2>&1 || true
    run_root systemctl restart janus
    return 0
  fi
  run_root service janus restart
}

reload_nginx() {
  run_root nginx -t
  run_root systemctl reload nginx 2>/dev/null || run_root service nginx reload 2>/dev/null || true
}

write_site_config() {
  wss_url=$(janus_wss_url)
  for conf in "$(active_site_conf)" "$(release_site_conf)"; do
    run_root test -f "$conf" || continue
    write_conf_value "$conf" plugin_video_chat true
    write_conf_value "$conf" video_chat_janus_wss "$wss_url"
    write_conf_value "$conf" video_chat_signaling_wss ""
  done
}

check_status() {
  require_site_context
  wss_url=$(janus_wss_url)
  command -v janus >/dev/null 2>&1 || {
    status_bad "Janus is not installed on this server."
    return 0
  }
  if command -v systemctl >/dev/null 2>&1 && ! systemctl is-active --quiet janus 2>/dev/null; then
    status_bad "Janus is installed but the janus service is not active."
    return 0
  fi
  run_root test -f "$(nginx_hook_file)" || {
    status_bad "The nginx Janus WSS hook is missing."
    return 0
  }
  run_root grep -Fq "proxy_pass http://127.0.0.1:$janus_ws_port/;" "$(nginx_hook_file)" || {
    status_bad "The nginx Janus WSS hook does not point at the local Janus WebSocket port."
    return 0
  }
  [ "$(read_conf_value "$(active_site_conf)" video_chat_janus_wss)" = "$wss_url" ] || {
    status_bad "The active site config does not point video chat at $wss_url."
    return 0
  }
  [ "$(read_conf_value "$(release_site_conf)" video_chat_janus_wss)" = "$wss_url" ] || {
    status_bad "The managed release config does not point video chat at $wss_url."
    return 0
  }
  status_ok "Janus is active and video chat is configured at $wss_url."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
install_janus_package
patch_janus_websocket_config
patch_janus_core_config
write_nginx_hook
open_firewall_if_needed
restart_janus
reload_nginx
write_site_config
check_status
