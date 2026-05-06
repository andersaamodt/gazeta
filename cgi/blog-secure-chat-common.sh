#!/bin/sh
# Shared helpers for Secure Chat CGI endpoints and local daemon management.

set -eu

blog_secure_chat_root() {
  printf '%s/secure-chat\n' "$blog_state_dir"
}

blog_secure_chat_runtime_dir() {
  printf '%s/runtime\n' "$(blog_secure_chat_root)"
}

blog_secure_chat_uploads_dir() {
  printf '%s/uploads\n' "$(blog_secure_chat_root)"
}

blog_secure_chat_downloads_dir() {
  printf '%s/downloads\n' "$(blog_secure_chat_root)"
}

blog_secure_chat_store_dir() {
  printf '%s/store\n' "$(blog_secure_chat_root)"
}

blog_secure_chat_contacts_dir() {
  printf '%s/contacts\n' "$(blog_secure_chat_store_dir)"
}

blog_secure_chat_messages_dir() {
  printf '%s/messages\n' "$(blog_secure_chat_store_dir)"
}

blog_secure_chat_meta_dir() {
  printf '%s/meta\n' "$(blog_secure_chat_store_dir)"
}

blog_secure_chat_contact_path() {
  npub=$(blog_validate_nostr_npub "${1-}" 2>/dev/null || printf '')
  [ -n "$npub" ] || return 1
  printf '%s/%s.json\n' "$(blog_secure_chat_contacts_dir)" "$npub"
}

blog_secure_chat_write_file_atomic() {
  target=${1-}
  [ -n "$target" ] || return 1
  mkdir -p "$(dirname "$target")"
  tmp=$(mktemp "${TMPDIR:-/tmp}/secure-chat-write.XXXXXX")
  cat > "$tmp"
  chmod 600 "$tmp" 2>/dev/null || true
  mv "$tmp" "$target"
}

blog_secure_chat_contact_file_json() {
  file=${1-}
  [ -n "$file" ] || return 1
  if [ -f "$file" ]; then
    cat "$file"
  else
    printf '{}\n'
  fi
}

blog_secure_chat_socket_path() {
  printf '%s/service.sock\n' "$(blog_secure_chat_runtime_dir)"
}

blog_secure_chat_pid_path() {
  printf '%s/service.pid\n' "$(blog_secure_chat_runtime_dir)"
}

blog_secure_chat_log_path() {
  printf '%s/service.log\n' "$(blog_secure_chat_runtime_dir)"
}

blog_secure_chat_site_title() {
  title=$(config-get "$blog_site_conf" site_title 2>/dev/null || printf '')
  title=$(blog_trim_whitespace "$title")
  if [ -n "$title" ]; then
    printf '%s\n' "$title"
  else
    printf 'Secure Chat\n'
  fi
}

blog_secure_chat_simplex_ws_port() {
  explicit=$(config-get "$blog_site_conf" secure_chat_simplex_ws_port 2>/dev/null || printf '')
  case "$explicit" in
    ''|*[!0-9]*) ;;
    *)
      if [ "$explicit" -ge 1024 ] && [ "$explicit" -le 65535 ]; then
        printf '%s\n' "$explicit"
        return 0
      fi
      ;;
  esac

  cksum_value=$(printf '%s' "$blog_site_name" | cksum | awk '{print $1}')
  case "$cksum_value" in ''|*[!0-9]*) cksum_value=0 ;; esac
  printf '%s\n' $((47000 + (cksum_value % 1000)))
}

blog_secure_chat_simplex_binary() {
  explicit=$(config-get "$blog_site_conf" secure_chat_simplex_binary 2>/dev/null || printf '')
  if [ -n "$explicit" ]; then
    printf '%s\n' "$explicit"
    return 0
  fi
  if command -v simplex-chat >/dev/null 2>&1; then
    command -v simplex-chat
    return 0
  fi
  candidate="${XDG_BIN_HOME:-$HOME/.local/bin}/simplex-chat"
  if [ -x "$candidate" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi
  for candidate in \
    /usr/local/bin/simplex-chat \
    /opt/homebrew/bin/simplex-chat \
    /usr/bin/simplex-chat
  do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf 'simplex-chat\n'
}

blog_secure_chat_node_binary() {
  explicit=$(config-get "$blog_site_conf" secure_chat_node_binary 2>/dev/null || printf '')
  if [ -n "$explicit" ]; then
    printf '%s\n' "$explicit"
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  if command -v nodejs >/dev/null 2>&1; then
    command -v nodejs
    return 0
  fi
  for candidate in \
    "${XDG_BIN_HOME:-$HOME/.local/bin}/node" \
    "${XDG_BIN_HOME:-$HOME/.local/bin}/nodejs"
  do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  for candidate in \
    /usr/local/bin/node \
    /opt/homebrew/bin/node \
    /usr/bin/node \
    /usr/local/bin/nodejs \
    /opt/homebrew/bin/nodejs \
    /usr/bin/nodejs
  do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  find "$HOME/.nvm/versions/node" -maxdepth 3 -type f -name node 2>/dev/null | sort | tail -n 1
}

blog_secure_chat_native_module_root() {
  explicit=$(config-get "$blog_site_conf" secure_chat_native_module_root 2>/dev/null || printf '')
  if [ -n "$explicit" ]; then
    printf '%s\n' "$explicit"
    return 0
  fi
  printf '%s/native-driver\n' "$(blog_secure_chat_runtime_dir)"
}

blog_secure_chat_launch_path() {
  launch_path=${PATH-}
  launch_path="$launch_path:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  node_bin=${1-}
  simplex_bin=${2-}
  for bin_path in "$node_bin" "$simplex_bin"; do
    case "$bin_path" in
      /*)
        bin_dir=$(dirname "$bin_path")
        case ":$launch_path:" in
          *":$bin_dir:"*) ;;
          *) launch_path="$bin_dir:$launch_path" ;;
        esac
        ;;
    esac
  done
  printf '%s\n' "$launch_path"
}

blog_secure_chat_init_storage() {
  root=$(blog_secure_chat_root)
  runtime=$(blog_secure_chat_runtime_dir)
  uploads=$(blog_secure_chat_uploads_dir)
  downloads=$(blog_secure_chat_downloads_dir)
  mkdir -p \
    "$root" \
    "$runtime" \
    "$uploads" \
    "$downloads" \
    "$(blog_secure_chat_store_dir)" \
    "$(blog_secure_chat_contacts_dir)" \
    "$(blog_secure_chat_messages_dir)" \
    "$(blog_secure_chat_meta_dir)"
}

blog_secure_chat_mapping_upsert() {
  npub=$(blog_validate_nostr_npub "${1-}" 2>/dev/null || printf '')
  simplex_contact_id=${2-}
  status=${3-active}
  [ -n "$npub" ] || return 1
  blog_secure_chat_init_storage
  now_iso=$(blog_now_iso)
  file=$(blog_secure_chat_contact_path "$npub")
  existing=$(blog_secure_chat_contact_file_json "$file")
  jq -cn \
    --argjson existing "$existing" \
    --arg npub "$npub" \
    --arg simplex_contact_id "$simplex_contact_id" \
    --arg status "$status" \
    --arg now_iso "$now_iso" '
    {
      npub: $npub,
      simplex_contact_id: $simplex_contact_id,
      bridge_user_id: ($existing.bridge_user_id // ""),
      bridge_contact_id: ($existing.bridge_contact_id // ""),
      status: $status,
      created_at: (($existing.created_at // "") | if . == "" then $now_iso else . end),
      updated_at: $now_iso,
      deactivated_at: "",
      last_provisioned_at: $now_iso,
      last_error: ""
    }' | blog_secure_chat_write_file_atomic "$file"
}

blog_secure_chat_mapping_mark_inactive() {
  npub=$(blog_validate_nostr_npub "${1-}" 2>/dev/null || printf '')
  [ -n "$npub" ] || return 1
  blog_secure_chat_init_storage
  file=$(blog_secure_chat_contact_path "$npub")
  [ -f "$file" ] || return 0
  now_iso=$(blog_now_iso)
  existing=$(blog_secure_chat_contact_file_json "$file")
  jq -cn \
    --argjson existing "$existing" \
    --arg npub "$npub" \
    --arg now_iso "$now_iso" '
    ($existing // {}) + {
      npub: $npub,
      status: "inactive",
      updated_at: $now_iso,
      deactivated_at: $now_iso
    }' | blog_secure_chat_write_file_atomic "$file"
}

blog_secure_chat_mapping_delete() {
  npub=$(blog_validate_nostr_npub "${1-}" 2>/dev/null || printf '')
  [ -n "$npub" ] || return 1
  blog_secure_chat_init_storage
  rm -f "$(blog_secure_chat_contact_path "$npub")"
}

blog_secure_chat_mapping_json() {
  npub=$(blog_validate_nostr_npub "${1-}" 2>/dev/null || printf '')
  [ -n "$npub" ] || return 1
  blog_secure_chat_init_storage
  file=$(blog_secure_chat_contact_path "$npub")
  [ -f "$file" ] || return 0
  jq -c '.' "$file" 2>/dev/null
}

blog_secure_chat_account_info_json() {
  session_pubkey=$(blog_validate_nostr_pubkey "${1-}" 2>/dev/null || printf '')
  [ -n "$session_pubkey" ] || {
    printf '{}\n'
    return 0
  }
  if ! command -v jq >/dev/null 2>&1; then
    printf '{}\n'
    return 0
  fi

  store_dir=$(blog_secure_chat_store_dir)
  socket_path=$(blog_secure_chat_socket_path)
  if [ ! -d "$store_dir" ] && [ ! -S "$socket_path" ]; then
    printf '{"simplex_contact_info":"","simplex_status":"not_provisioned"}\n'
    return 0
  fi

  payload_file=$(mktemp "${TMPDIR:-/tmp}/secure-chat-account.XXXXXX")
  jq -cn \
    --arg sessionPubkey "$session_pubkey" \
    '{sessionPubkey:$sessionPubkey,sinceSeq:0,admin:false}' > "$payload_file" 2>/dev/null || {
      rm -f "$payload_file"
      printf '{}\n'
      return 0
    }

  response=$(blog_secure_chat_service_request POST /state "$payload_file" application/json 2>/dev/null || printf '')
  rm -f "$payload_file"
  [ -n "$response" ] || {
    printf '{"simplex_contact_info":"","simplex_status":"unavailable"}\n'
    return 0
  }

  printf '%s\n' "$response" | jq -c '{
    simplex_contact_info: (.mapping.simplex_contact_id // ""),
    simplex_status: (
      if (.mapping.simplex_contact_id // "") != "" then (.mapping.status // "active")
      elif (.mapping.status // "") != "" then .mapping.status
      elif (.service.transport_status // "") == "connected" then "not_provisioned"
      elif (.service.transport_status // "") != "" then ("transport_" + (.service.transport_status | tostring))
      else "not_provisioned"
      end
    )
  }' 2>/dev/null || printf '{}\n'
}

blog_request_is_localhost() {
  host=${HTTP_HOST:-${SERVER_NAME:-}}
  host=$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')
  host=${host%%,*}
  case "${host%%:*}" in
    localhost|127.0.0.1|::1) return 0 ;;
  esac
  return 1
}

blog_secure_chat_origin_base() {
  origin=${HTTP_ORIGIN-}
  if [ -n "$origin" ]; then
    printf '%s\n' "$origin"
    return 0
  fi
  referer=${HTTP_REFERER-}
  if [ -n "$referer" ]; then
    printf '%s\n' "$referer" |
      sed 's/[?#].*$//; s#^\([a-zA-Z][a-zA-Z0-9+.-]*://[^/]*\)/.*$#\1#'
    return 0
  fi
  printf '%s\n' ''
}

blog_secure_chat_request_is_secure() {
  case "${HTTPS-}" in
    on|ON|1|true|TRUE|yes|YES) return 0 ;;
  esac
  case "${REQUEST_SCHEME-}" in
    https|HTTPS) return 0 ;;
  esac
  case "${SERVER_PORT-}" in
    443) return 0 ;;
  esac
  if blog_request_is_localhost; then
    return 0
  fi
  return 1
}

blog_secure_chat_request_scheme() {
  origin_base=$(blog_secure_chat_origin_base)
  if [ -n "$origin_base" ]; then
    case "$origin_base" in
      https://*) printf 'https\n'; return 0 ;;
      http://*) printf 'http\n'; return 0 ;;
    esac
  fi
  if blog_secure_chat_request_is_secure && ! blog_request_is_localhost; then
    printf 'https\n'
    return 0
  fi
  case "${HTTPS-}" in
    on|ON|1|true|TRUE|yes|YES) printf 'https\n'; return 0 ;;
  esac
  case "${REQUEST_SCHEME-}" in
    https|HTTPS) printf 'https\n'; return 0 ;;
  esac
  printf 'http\n'
}

blog_secure_chat_request_host() {
  host=${HTTP_HOST-}
  if [ -z "$host" ]; then
    origin_base=$(blog_secure_chat_origin_base)
    case "$origin_base" in
      *://*)
        host=${origin_base#*://}
        ;;
      *)
        host=${SERVER_NAME:-}
        ;;
    esac
  fi
  host=${host%%,*}
  host=$(printf '%s' "$host" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  printf '%s\n' "$host"
}

blog_secure_chat_request_uri() {
  uri=${REQUEST_URI-}
  if [ -n "$uri" ]; then
    printf '%s\n' "$uri"
    return 0
  fi
  uri=${SCRIPT_NAME-}
  if [ -n "$uri" ]; then
    if [ -n "${QUERY_STRING-}" ]; then
      uri="$uri?${QUERY_STRING}"
    fi
    printf '%s\n' "$uri"
    return 0
  fi
  script_file=${SCRIPT_FILENAME-}
  if [ -n "$script_file" ]; then
    script_name=${script_file##*/}
    case "$script_name" in
      '')
        ;;
      *)
        uri="/cgi/$script_name"
        if [ -n "${QUERY_STRING-}" ]; then
          uri="$uri?${QUERY_STRING}"
        fi
        printf '%s\n' "$uri"
        return 0
        ;;
    esac
  fi
  printf '%s\n' ''
}

blog_secure_chat_request_url() {
  scheme=$(blog_secure_chat_request_scheme)
  host=$(blog_secure_chat_request_host)
  uri=$(blog_secure_chat_request_uri)
  printf '%s://%s%s\n' "$scheme" "$host" "$uri"
}

blog_secure_chat_request_method() {
  printf '%s\n' "${REQUEST_METHOD-GET}" | tr '[:lower:]' '[:upper:]'
}

blog_secure_chat_request_session_token() {
  header=${HTTP_X_SESSION_TOKEN-}
  if [ -n "$header" ]; then
    printf '%s\n' "$header"
    return 0
  fi
  blog_param session_token
}

blog_secure_chat_request_csrf_token() {
  header=${HTTP_X_CSRF_TOKEN-}
  if [ -n "$header" ]; then
    printf '%s\n' "$header"
    return 0
  fi
  blog_param csrf_token
}

blog_secure_chat_load_session() {
  require_admin=${1-false}
  req_token=$(blog_secure_chat_request_session_token)
  req_csrf=$(blog_secure_chat_request_csrf_token)

  if ! blog_load_session "$req_token"; then
    blog_json_error "Not authenticated" "auth_required"
    return 1
  fi

  if [ -z "$req_csrf" ] || [ "$req_csrf" != "$BLOG_SESSION_CSRF" ]; then
    blog_json_error "Invalid CSRF token" "csrf_invalid"
    return 1
  fi

  if blog_user_is_admin "$BLOG_SESSION_USERNAME"; then
    BLOG_SESSION_IS_ADMIN=true
  fi

  if [ "$require_admin" = "true" ] && [ "$BLOG_SESSION_IS_ADMIN" != "true" ]; then
    blog_json_error "Admin permission required" "admin_required"
    return 1
  fi

  blog_extend_session
  return 0
}

blog_secure_chat_authorization_event_json() {
  auth_header=${HTTP_AUTHORIZATION-}
  case "$auth_header" in
    Nostr\ *)
      payload=${auth_header#Nostr }
      blog_b64_decode_text "$payload" 2>/dev/null || printf ''
      return 0
      ;;
  esac

  auth_event_b64=$(blog_param auth_event_b64)
  if [ -n "$auth_event_b64" ]; then
    blog_b64_decode_text "$auth_event_b64" 2>/dev/null || printf ''
    return 0
  fi
  printf '\n'
}

blog_secure_chat_verify_nip98_event_json() {
  event_json=${1-}
  req_method=$(printf '%s' "${2-GET}" | tr '[:lower:]' '[:upper:]')
  req_url=${3-}
  expected_pubkey=$(blog_validate_nostr_pubkey "${4-}" 2>/dev/null || printf '')
  max_age=${5-300}

  [ -n "$event_json" ] || return 1
  [ -n "$req_url" ] || return 1
  [ -n "$expected_pubkey" ] || return 1
  case "$max_age" in ''|*[!0-9]*) max_age=300 ;; esac

  event_json=$(printf '%s\n' "$event_json" | jq -c '.' 2>/dev/null || printf '')
  [ -n "$event_json" ] || return 1
  blog_nostr_verify_event_json "$event_json" || return 1

  ev_kind=$(printf '%s\n' "$event_json" | jq -r '.kind // 0' 2>/dev/null || printf '0')
  ev_pubkey=$(printf '%s\n' "$event_json" | jq -r '.pubkey // ""' 2>/dev/null || printf '')
  ev_pubkey=$(blog_validate_nostr_pubkey "$ev_pubkey" 2>/dev/null || printf '')
  ev_created_at=$(printf '%s\n' "$event_json" | jq -r '.created_at // 0' 2>/dev/null || printf '0')
  tag_method=$(printf '%s\n' "$event_json" | jq -r '[.tags[]? | select(type=="array" and length>=2 and .[0]=="method") | .[1]] | first // ""' 2>/dev/null || printf '')
  tag_url=$(printf '%s\n' "$event_json" | jq -r '[.tags[]? | select(type=="array" and length>=2 and .[0]=="u") | .[1]] | first // ""' 2>/dev/null || printf '')

  case "$ev_kind" in 27235) ;; *) return 1 ;; esac
  [ "$ev_pubkey" = "$expected_pubkey" ] || return 1
  [ "$tag_method" = "$req_method" ] || return 1
  [ "$tag_url" = "$req_url" ] || return 1
  case "$ev_created_at" in ''|*[!0-9]*) return 1 ;; esac

  now_epoch=$(blog_now_epoch)
  if [ "$ev_created_at" -gt "$((now_epoch + 90))" ]; then
    return 1
  fi
  if [ "$((now_epoch - ev_created_at))" -gt "$max_age" ]; then
    return 1
  fi
  return 0
}

blog_secure_chat_require_authenticated_request() {
  if ! blog_secure_chat_request_is_secure; then
    blog_json_error "Secure Chat requires HTTPS" "https_required"
    return 1
  fi

  if ! blog_secure_chat_load_session false; then
    return 1
  fi

  auth_event_json=$(blog_secure_chat_authorization_event_json)
  if [ -z "$auth_event_json" ]; then
    blog_json_error "Secure Chat requests require a Nostr signature" "nostr_signature_required"
    return 1
  fi

  req_url=$(blog_secure_chat_request_url)
  req_method=$(blog_secure_chat_request_method)
  if ! blog_secure_chat_verify_nip98_event_json "$auth_event_json" "$req_method" "$req_url" "$BLOG_SESSION_USER_PUBKEY" 300; then
    blog_json_error "Nostr request signature is invalid" "nostr_signature_invalid"
    return 1
  fi
  return 0
}

blog_secure_chat_service_ping() {
  socket=$(blog_secure_chat_socket_path)
  [ -S "$socket" ] || return 1
  curl --silent --show-error --fail --unix-socket "$socket" http://localhost/health >/dev/null 2>&1
}

blog_secure_chat_service_pid() {
  pid_path=$(blog_secure_chat_pid_path)
  [ -f "$pid_path" ] || return 1
  pid=$(cat "$pid_path" 2>/dev/null || printf '')
  case "$pid" in ''|*[!0-9]*) return 1 ;; esac
  kill -0 "$pid" >/dev/null 2>&1 || return 1
  printf '%s\n' "$pid"
}

blog_secure_chat_service_command_matches_release() {
  pid=$(blog_secure_chat_service_pid) || return 1
  expected="$SCRIPT_DIR/blog-secure-chat-service.js"
  command_line=$(ps -p "$pid" -o command= 2>/dev/null || ps -p "$pid" -o args= 2>/dev/null || printf '')
  case "$command_line" in
    *"$expected"*) return 0 ;;
    *) return 1 ;;
  esac
}

blog_secure_chat_service_stop() {
  pid=$(blog_secure_chat_service_pid 2>/dev/null || printf '')
  [ -n "$pid" ] || return 0
  kill "$pid" >/dev/null 2>&1 || true
  attempts=0
  while kill -0 "$pid" >/dev/null 2>&1 && [ "$attempts" -lt 50 ]; do
    sleep 0.1
    attempts=$((attempts + 1))
  done
  rm -f "$(blog_secure_chat_pid_path)" "$(blog_secure_chat_socket_path)"
}

blog_secure_chat_service_start_inner() {
  blog_secure_chat_init_storage
  if blog_secure_chat_service_ping; then
    if blog_secure_chat_service_command_matches_release; then
      return 0
    fi
    blog_secure_chat_service_stop
  fi

  socket=$(blog_secure_chat_socket_path)
  pid_path=$(blog_secure_chat_pid_path)
  log_path=$(blog_secure_chat_log_path)
  node_bin=$(blog_secure_chat_node_binary)
  simplex_bin=$(blog_secure_chat_simplex_binary)
  native_module_root=$(blog_secure_chat_native_module_root)
  launch_path=$(blog_secure_chat_launch_path "$node_bin" "$simplex_bin")
  rm -f "$socket"

  if [ -z "$node_bin" ] || [ ! -x "$node_bin" ]; then
    printf '%s\n' "secure chat start failed: Node.js runtime is not installed or configured." >> "$log_path"
    return 1
  fi

  env \
    NODE_NO_WARNINGS=1 \
    PATH="$launch_path" \
    WIZARDRY_SITES_DIR="$blog_sites_dir" \
    WIZARDRY_SITE_NAME="$blog_site_name" \
    WIZARDRY_SITE_ROOT="$blog_site_root" \
    WIZARDRY_SITE_DATA="$blog_site_data" \
    SECURE_CHAT_STORE_DIR="$(blog_secure_chat_store_dir)" \
    SECURE_CHAT_SOCKET_PATH="$socket" \
    SECURE_CHAT_UPLOADS_DIR="$(blog_secure_chat_uploads_dir)" \
    SECURE_CHAT_DOWNLOADS_DIR="$(blog_secure_chat_downloads_dir)" \
    SECURE_CHAT_SIMPLEX_BINARY="$simplex_bin" \
    SECURE_CHAT_SIMPLEX_NATIVE_MODULE_ROOT="$native_module_root" \
    SECURE_CHAT_SIMPLEX_WS_PORT="$(blog_secure_chat_simplex_ws_port)" \
    SECURE_CHAT_SITE_TITLE="$(blog_secure_chat_site_title)" \
    nohup "$node_bin" "$SCRIPT_DIR/blog-secure-chat-service.js" >>"$log_path" 2>&1 &
  daemon_pid=$!
  printf '%s\n' "$daemon_pid" > "$pid_path"

  i=0
  while [ "$i" -lt 80 ]; do
    if blog_secure_chat_service_ping; then
      return 0
    fi
    sleep 0.1
    i=$((i + 1))
  done
  return 1
}

blog_secure_chat_service_start() {
  blog_secure_chat_init_storage
  lock_dir="$(blog_secure_chat_runtime_dir)/service-start.lock"
  attempts=0
  while ! mkdir "$lock_dir" 2>/dev/null; do
    if blog_secure_chat_service_ping; then
      return 0
    fi
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 20 ] && ! blog_secure_chat_service_pid >/dev/null 2>&1; then
      rmdir "$lock_dir" 2>/dev/null || true
      attempts=0
      continue
    fi
    if [ "$attempts" -ge 100 ]; then
      printf '%s\n' "secure chat start failed: another start attempt did not finish." >> "$(blog_secure_chat_log_path)"
      return 1
    fi
    sleep 0.1
  done
  blog_secure_chat_service_start_inner
  status=$?
  rmdir "$lock_dir" 2>/dev/null || true
  return "$status"
}

blog_secure_chat_service_request() {
  method=${1-GET}
  path=${2-/health}
  body_file=${3-}
  content_type=${4-application/json}

  blog_secure_chat_service_start || return 1

  socket=$(blog_secure_chat_socket_path)
  if [ -n "$body_file" ]; then
    curl --silent --show-error --max-time 120 \
      --unix-socket "$socket" \
      --request "$method" \
      --header "Content-Type: $content_type" \
      --data-binary @"$body_file" \
      "http://localhost$path"
    return 0
  fi

  curl --silent --show-error --max-time 120 \
    --unix-socket "$socket" \
    --request "$method" \
    "http://localhost$path"
}

blog_secure_chat_service_request_json() {
  response=$(blog_secure_chat_service_request "$@" 2>/dev/null || printf '')
  [ -n "$response" ] || return 1
  printf '%s\n' "$response"
}
