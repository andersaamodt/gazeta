#!/bin/sh
set -eu

site_user=${HQ_SITE_USER-}

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

require_site_context() {
  [ -n "$site_user" ] || {
    status_bad "HQ_SITE_USER is required for Overworld static compression provisioning."
    exit 1
  }
  case "$site_user" in
    *[!abcdefghijklmnopqrstuvwxyz0123456789_-]*|[!abcdefghijklmnopqrstuvwxyz_]*)
      status_bad "HQ_SITE_USER is not a safe system username."
      exit 1
      ;;
  esac
}

nginx_hook_dir() {
  printf '/etc/nginx/headquarters-site/%s/server.d\n' "$site_user"
}

nginx_hook_file() {
  printf '%s/overworld-static-compression.conf\n' "$(nginx_hook_dir)"
}

nginx_supports_gzip_static() {
  nginx -V 2>&1 | grep -Fq -- '--with-http_gzip_static_module'
}

nginx_supports_brotli_static() {
  [ -e /etc/nginx/modules-enabled/50-mod-http-brotli-static.conf ] || \
    [ -e /usr/lib/nginx/modules/ngx_http_brotli_static_module.so ]
}

install_brotli_static_support() {
  if nginx_supports_brotli_static; then
    return 0
  fi
  if command -v apt-get >/dev/null 2>&1; then
    run_root apt-get update
    run_root apt-get install -y libnginx-mod-http-brotli-static libnginx-mod-http-brotli-filter
  fi
}

write_nginx_hook() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/overworld-gzip-nginx.XXXXXX")
  cat > "$tmp" <<EOF_NGINX
location /static/overworld-godot/ {
  alias /home/$site_user/site/build/static/overworld-godot/;
  brotli_static on;
  gzip_static on;
  gzip_vary on;
  types {
    text/html html;
    application/javascript js;
    application/wasm wasm;
    application/octet-stream pck;
    image/png png;
  }
  add_header Cache-Control "public, max-age=31536000, immutable" always;
}
EOF_NGINX
  run_root install -d -m 0755 "$(nginx_hook_dir)"
  run_root install -o root -g root -m 0644 "$tmp" "$(nginx_hook_file)"
  rm -f "$tmp"
}

reload_nginx() {
  run_root nginx -t
  run_root systemctl reload nginx 2>/dev/null || run_root service nginx reload 2>/dev/null || true
}

check_status() {
  require_site_context
  nginx_supports_gzip_static || {
    status_bad "nginx is not built with http_gzip_static_module."
    return 0
  }
  run_root test -f "$(nginx_hook_file)" || {
    status_bad "The nginx Overworld compression hook is missing."
    return 0
  }
  run_root grep -Fq 'gzip_static on;' "$(nginx_hook_file)" || {
    status_bad "The nginx Overworld compression hook does not enable gzip_static."
    return 0
  }
  nginx_supports_brotli_static || {
    status_bad "nginx Brotli static support is not installed."
    return 0
  }
  run_root grep -Fq 'brotli_static on;' "$(nginx_hook_file)" || {
    status_bad "The nginx Overworld compression hook does not enable brotli_static."
    return 0
  }
  run_root nginx -t >/dev/null 2>&1 || {
    status_bad "nginx configuration does not validate with the Overworld compression hook."
    return 0
  }
  status_ok "Overworld Godot runtime files are configured for brotli_static/gzip_static delivery."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
nginx_supports_gzip_static || {
  status_bad "nginx is not built with http_gzip_static_module."
  exit 1
}
install_brotli_static_support
write_nginx_hook
reload_nginx
check_status
