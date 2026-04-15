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

blog_secure_chat_db_path() {
  printf '%s/secure-chat.sqlite\n' "$(blog_secure_chat_root)"
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
  printf 'simplex-chat\n'
}

blog_secure_chat_init_storage() {
  root=$(blog_secure_chat_root)
  runtime=$(blog_secure_chat_runtime_dir)
  uploads=$(blog_secure_chat_uploads_dir)
  downloads=$(blog_secure_chat_downloads_dir)
  db=$(blog_secure_chat_db_path)

  mkdir -p "$root" "$runtime" "$uploads" "$downloads"

  sqlite3 "$db" <<'EOSQL'
CREATE TABLE IF NOT EXISTS secure_chat_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS secure_chat_contacts (
  npub TEXT PRIMARY KEY,
  simplex_contact_id TEXT UNIQUE,
  bridge_user_id TEXT UNIQUE,
  bridge_contact_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'provisioning',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deactivated_at TEXT,
  last_provisioned_at TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS secure_chat_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  npub TEXT NOT NULL,
  simplex_contact_id TEXT,
  bridge_user_id TEXT,
  bridge_contact_id TEXT,
  direction TEXT NOT NULL,
  message_ref TEXT,
  message_kind TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  attachment_name TEXT,
  attachment_mime TEXT,
  attachment_size INTEGER,
  upload_id TEXT,
  error_code TEXT,
  error_detail TEXT
);

CREATE INDEX IF NOT EXISTS secure_chat_messages_npub_seq_idx
  ON secure_chat_messages(npub, seq);
EOSQL
}

blog_secure_chat_sql_escape() {
  printf '%s' "${1-}" | sed "s/'/''/g"
}

blog_secure_chat_mapping_upsert() {
  npub=${1-}
  simplex_contact_id=${2-}
  status=${3-active}
  [ -n "$npub" ] || return 1
  blog_secure_chat_init_storage
  now_iso=$(blog_now_iso)
  sqlite3 "$(blog_secure_chat_db_path)" \
    "INSERT INTO secure_chat_contacts (npub, simplex_contact_id, status, created_at, updated_at, last_provisioned_at)
     VALUES ('$(blog_secure_chat_sql_escape "$npub")', '$(blog_secure_chat_sql_escape "$simplex_contact_id")', '$(blog_secure_chat_sql_escape "$status")', '$now_iso', '$now_iso', '$now_iso')
     ON CONFLICT(npub) DO UPDATE SET
       simplex_contact_id = excluded.simplex_contact_id,
       status = excluded.status,
       updated_at = excluded.updated_at,
       last_provisioned_at = excluded.last_provisioned_at,
       deactivated_at = NULL;"
}

blog_secure_chat_mapping_mark_inactive() {
  npub=${1-}
  [ -n "$npub" ] || return 1
  blog_secure_chat_init_storage
  now_iso=$(blog_now_iso)
  sqlite3 "$(blog_secure_chat_db_path)" \
    "UPDATE secure_chat_contacts
        SET status = 'inactive',
            deactivated_at = '$now_iso',
            updated_at = '$now_iso'
      WHERE npub = '$(blog_secure_chat_sql_escape "$npub")';"
}

blog_secure_chat_mapping_delete() {
  npub=${1-}
  [ -n "$npub" ] || return 1
  blog_secure_chat_init_storage
  sqlite3 "$(blog_secure_chat_db_path)" \
    "DELETE FROM secure_chat_contacts WHERE npub = '$(blog_secure_chat_sql_escape "$npub")';"
}

blog_secure_chat_mapping_json() {
  npub=${1-}
  [ -n "$npub" ] || return 1
  blog_secure_chat_init_storage
  sqlite3 -json "$(blog_secure_chat_db_path)" \
    "SELECT npub, simplex_contact_id, bridge_user_id, bridge_contact_id, status, created_at, updated_at, deactivated_at, last_provisioned_at, last_error
       FROM secure_chat_contacts
      WHERE npub = '$(blog_secure_chat_sql_escape "$npub")'
      LIMIT 1;" \
    | jq -c '.[0] // empty' 2>/dev/null
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
  host=${HTTP_HOST:-${SERVER_NAME:-}}
  host=${host%%,*}
  host=$(printf '%s' "$host" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  printf '%s\n' "$host"
}

blog_secure_chat_request_url() {
  scheme=$(blog_secure_chat_request_scheme)
  host=$(blog_secure_chat_request_host)
  uri=${REQUEST_URI-}
  if [ -z "$uri" ]; then
    uri=${SCRIPT_NAME-}
    if [ -n "${QUERY_STRING-}" ]; then
      uri="$uri?${QUERY_STRING}"
    fi
  fi
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

blog_secure_chat_service_start() {
  blog_secure_chat_init_storage
  if blog_secure_chat_service_ping; then
    return 0
  fi

  socket=$(blog_secure_chat_socket_path)
  pid_path=$(blog_secure_chat_pid_path)
  log_path=$(blog_secure_chat_log_path)
  rm -f "$socket"

  env \
    NODE_NO_WARNINGS=1 \
    WIZARDRY_SITES_DIR="$blog_sites_dir" \
    WIZARDRY_SITE_NAME="$blog_site_name" \
    WIZARDRY_SITE_ROOT="$blog_site_root" \
    WIZARDRY_SITE_DATA="$blog_site_data" \
    SECURE_CHAT_DB_PATH="$(blog_secure_chat_db_path)" \
    SECURE_CHAT_SOCKET_PATH="$socket" \
    SECURE_CHAT_UPLOADS_DIR="$(blog_secure_chat_uploads_dir)" \
    SECURE_CHAT_DOWNLOADS_DIR="$(blog_secure_chat_downloads_dir)" \
    SECURE_CHAT_SIMPLEX_BINARY="$(blog_secure_chat_simplex_binary)" \
    SECURE_CHAT_SIMPLEX_WS_PORT="$(blog_secure_chat_simplex_ws_port)" \
    SECURE_CHAT_SITE_TITLE="$(blog_secure_chat_site_title)" \
    nohup node "$SCRIPT_DIR/blog-secure-chat-service.js" >>"$log_path" 2>&1 &
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

blog_secure_chat_service_request() {
  method=${1-GET}
  path=${2-/health}
  body_file=${3-}
  content_type=${4-application/json}

  blog_secure_chat_service_start || return 1

  socket=$(blog_secure_chat_socket_path)
  if [ -n "$body_file" ]; then
    curl --silent --show-error --fail \
      --unix-socket "$socket" \
      --request "$method" \
      --header "Content-Type: $content_type" \
      --data-binary @"$body_file" \
      "http://localhost$path"
    return 0
  fi

  curl --silent --show-error --fail \
    --unix-socket "$socket" \
    --request "$method" \
    "http://localhost$path"
}
