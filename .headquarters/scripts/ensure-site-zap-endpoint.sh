#!/bin/sh
set -eu

site_user=${HQ_SITE_USER-}
site_domain=${HQ_SITE_DOMAIN-}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return $?
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
    status_bad "HQ_SITE_USER is required for Lightning Address endpoint provisioning."
    exit 1
  }
  [ -n "$site_domain" ] || {
    status_bad "HQ_SITE_DOMAIN is required for Lightning Address endpoint provisioning."
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

lightning_root() {
  printf '%s/.sitedata/site/lightning\n' "$(site_home)"
}

service_bin_dir() {
  printf '%s/bin\n' "$(service_root)"
}

remote_cli_root() {
  printf '%s/remote-cli\n' "$(service_root)"
}

remote_cli_key_file() {
  printf '%s/pay-node-zap-cli_ed25519\n' "$(remote_cli_root)"
}

remote_cli_pubkey_file() {
  printf '%s.pub\n' "$(remote_cli_key_file)"
}

remote_cli_known_hosts_file() {
  printf '%s/known_hosts\n' "$(remote_cli_root)"
}

remote_lightning_cli_wrapper() {
  printf '%s/lightning-cli\n' "$(service_bin_dir)"
}

nostr_state_dir() {
  printf '%s/.sitedata/site/nostr/state\n' "$(site_home)"
}

service_root() {
  printf '%s/.sitedata/site/zaps\n' "$(site_home)"
}

service_state_dir() {
  printf '%s/state\n' "$(service_root)"
}

service_requests_dir() {
  printf '%s/requests\n' "$(service_state_dir)"
}

service_receipts_dir() {
  printf '%s/receipts\n' "$(service_state_dir)"
}

service_env_file() {
  printf '%s/zap-service.env\n' "$(service_root)"
}

service_script_file() {
  printf '%s/zap-service.py\n' "$(service_root)"
}

service_name() {
  printf 'headquarters-zaps-%s\n' "$site_user"
}

service_file() {
  printf '/etc/systemd/system/%s.service\n' "$(service_name)"
}

server_hook_file() {
  printf '/etc/nginx/headquarters-site/%s/server.d/zap-endpoint.conf\n' "$site_user"
}

alias_server_hook_dir() {
  printf '/etc/nginx/headquarters-domain/%s/server.d\n' "$(zap_alias_domain)"
}

alias_server_hook_file() {
  printf '%s/zap-endpoint.conf\n' "$(alias_server_hook_dir)"
}

alias_domain_vhost_file() {
  printf '/etc/nginx/sites-available/%s\n' "$(zap_alias_domain)"
}

legacy_btcpay_alias_hook_file() {
  printf '%s/btcpay-zap-address.conf\n' "$(alias_server_hook_dir)"
}

legacy_btcpay_rootpath_hook_file() {
  printf '%s/btcpay-rootpath.conf\n' "$(alias_server_hook_dir)"
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
  tmp=$(mktemp "${TMPDIR:-/tmp}/zap-endpoint-conf.XXXXXX")
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

normalize_host() {
  raw=${1-}
  raw=$(printf '%s' "$raw" | tr -d '\r\n' | sed -e 's#^[[:space:]]*##' -e 's#[[:space:]]*$##')
  raw=$(printf '%s' "$raw" | sed -e 's#^https\{0,1\}://##' -e 's#/.*$##' -e 's/:[0-9][0-9]*$//')
  printf '%s\n' "$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
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

calc_service_port() {
  checksum=$(printf '%s\n' "$site_user" | cksum | awk '{print $1}')
  offset=$((checksum % 1000))
  printf '%s\n' $((43000 + (offset * 2)))
}

lightning_public_host() {
  configured=$(normalize_host "$(read_conf_value "$(active_site_conf)" lightning_public_host)")
  if valid_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
  configured=$(normalize_host "$(read_conf_value "$(release_site_conf)" lightning_public_host)")
  if valid_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
  printf '%s\n' "$(zap_alias_domain)"
}

remote_lightning_host() {
  configured=$(normalize_host "$(read_conf_value "$(active_site_conf)" zap_lightning_remote_host)")
  if valid_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
  configured=$(normalize_host "$(read_conf_value "$(release_site_conf)" zap_lightning_remote_host)")
  if valid_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
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
  configured=$(normalize_host "$(read_conf_value "$(active_site_conf)" lightning_public_host)")
  if valid_host "$configured" && [ "$configured" != "$(zap_alias_domain)" ] && [ "$configured" != "$site_domain" ]; then
    printf '%s\n' "$configured"
    return 0
  fi
  configured=$(normalize_host "$(read_conf_value "$(release_site_conf)" lightning_public_host)")
  if valid_host "$configured" && [ "$configured" != "$(zap_alias_domain)" ] && [ "$configured" != "$site_domain" ]; then
    printf '%s\n' "$configured"
    return 0
  fi
  printf '\n'
}

remote_lightning_user() {
  configured=$(read_conf_value "$(active_site_conf)" zap_lightning_remote_user | tr -d '\r\n[:space:]')
  [ -n "$configured" ] || configured=$(read_conf_value "$(release_site_conf)" zap_lightning_remote_user | tr -d '\r\n[:space:]')
  [ -n "$configured" ] || configured=zapcli
  printf '%s\n' "$configured"
}

remote_lightning_port() {
  configured=$(read_conf_value "$(active_site_conf)" zap_lightning_remote_port | tr -d '\r\n[:space:]')
  case "$configured" in
    ''|*[!0-9]*) configured='' ;;
  esac
  [ -n "$configured" ] || configured=$(read_conf_value "$(release_site_conf)" zap_lightning_remote_port | tr -d '\r\n[:space:]')
  case "$configured" in
    ''|*[!0-9]*) configured='' ;;
  esac
  [ -n "$configured" ] || configured=22
  printf '%s\n' "$configured"
}

use_remote_lightning_cli() {
  host=$(remote_lightning_host)
  [ -n "$host" ] || return 1
  [ "$host" != "$site_domain" ] || return 1
  return 0
}

lightning_public_port() {
  configured=$(read_conf_value "$(active_site_conf)" lightning_public_port | tr -d '\r\n[:space:]')
  case "$configured" in
    ''|*[!0-9]*) configured='' ;;
  esac
  if [ -n "$configured" ] && [ "$configured" -gt 0 ]; then
    printf '%s\n' "$configured"
    return 0
  fi
  configured=$(read_conf_value "$(release_site_conf)" lightning_public_port | tr -d '\r\n[:space:]')
  case "$configured" in
    ''|*[!0-9]*) configured='' ;;
  esac
  if [ -n "$configured" ] && [ "$configured" -gt 0 ]; then
    printf '%s\n' "$configured"
    return 0
  fi
  checksum=$(printf '%s\n' "$site_user" | cksum | awk '{print $1}')
  offset=$((checksum % 1000))
  printf '%s\n' $((19000 + (offset * 2)))
}

zap_endpoint_url() {
  printf 'https://%s/.well-known/lnurlp/%s\n' "$(zap_alias_domain)" "$(zap_alias_localpart)"
}

expected_callback_url() {
  printf '%s/callback\n' "$(zap_endpoint_url)"
}

local_health_url() {
  printf 'http://127.0.0.1:%s/healthz\n' "$(calc_service_port)"
}

lightning_cli_site_json() {
  if use_remote_lightning_cli; then
    run_site "$(remote_lightning_cli_wrapper)" "$@" 2>/dev/null
    return $?
  fi
  run_site lightning-cli --lightning-dir="$(lightning_root)" "$@" 2>/dev/null
}

lightning_synced() {
  if ! command -v python3 >/dev/null 2>&1; then
    printf 'false\n'
    return 0
  fi
  getinfo_json=$(lightning_cli_site_json getinfo 2>/dev/null || printf '')
  [ -n "$getinfo_json" ] || {
    printf 'false\n'
    return 0
  }
  printf '%s' "$getinfo_json" | python3 -c 'import json,sys; info=json.load(sys.stdin); print("false" if str(info.get("warning_bitcoind_sync") or "").strip() else "true")' 2>/dev/null || printf 'false\n'
}

lightning_inbound_liquidity_sats() {
  if ! command -v python3 >/dev/null 2>&1; then
    printf '0\n'
    return 0
  fi
  listfunds_json=$(lightning_cli_site_json listfunds 2>/dev/null || printf '')
  [ -n "$listfunds_json" ] || {
    printf '0\n'
    return 0
  }
  printf '%s' "$listfunds_json" | python3 -c 'import json,sys; data=json.load(sys.stdin); total=0; 
for channel in data.get("channels") or []:
    def msat(value):
        raw=str(value or "0msat")
        if raw.endswith("msat"):
            raw=raw[:-4]
        try:
            return int(float(raw))
        except Exception:
            return 0
    total += max(msat(channel.get("amount_msat")) - msat(channel.get("our_amount_msat")), 0)
print(total // 1000)' 2>/dev/null || printf '0\n'
}

write_service_env_file() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/zap-service-env.XXXXXX")
  cat > "$tmp" <<EOF_ENV
SITE_USER=$site_user
SITE_HOME=$(site_home)
SITE_DOMAIN=$site_domain
ZAP_ALIAS_NAME=$(zap_alias_localpart)
ZAP_ALIAS_DOMAIN=$(zap_alias_domain)
ZAP_SERVICE_PORT=$(calc_service_port)
LIGHTNING_DIR=$(lightning_root)
NOSTR_STATE_DIR=$(nostr_state_dir)
ZAP_STATE_DIR=$(service_state_dir)
ZAP_REQUESTS_DIR=$(service_requests_dir)
ZAP_RECEIPTS_DIR=$(service_receipts_dir)
LIGHTNING_PUBLIC_HOST=$(lightning_public_host)
LIGHTNING_PUBLIC_PORT=$(lightning_public_port)
MIN_SENDABLE_MSAT=1000
MAX_SENDABLE_MSAT=1000000000
COMMENT_ALLOWED=280
EOF_ENV
  run_root install -d -o "$site_user" -g "$site_user" -m 700 "$(service_root)" "$(service_state_dir)" "$(service_requests_dir)" "$(service_receipts_dir)"
  run_root install -o "$site_user" -g "$site_user" -m 600 "$tmp" "$(service_env_file)"
  rm -f "$tmp"
}

ensure_remote_cli_key() {
  use_remote_lightning_cli || return 0
  command -v ssh-keygen >/dev/null 2>&1 || {
    status_bad "ssh-keygen is required for the remote Lightning gateway key."
    exit 1
  }
  run_root install -d -o "$site_user" -g "$site_user" -m 700 "$(remote_cli_root)" "$(service_bin_dir)"
  if ! run_root test -f "$(remote_cli_key_file)"; then
    run_site ssh-keygen -q -t ed25519 -N '' -C "$site_user zap endpoint to $(remote_lightning_host)" -f "$(remote_cli_key_file)"
  fi
  run_root chmod 600 "$(remote_cli_key_file)"
  run_root chmod 644 "$(remote_cli_pubkey_file)"
}

write_remote_lightning_cli_wrapper() {
  use_remote_lightning_cli || return 0
  ensure_remote_cli_key
  host=$(remote_lightning_host)
  port=$(remote_lightning_port)
  user=$(remote_lightning_user)
  known_hosts=$(remote_cli_known_hosts_file)
  tmp_known=$(mktemp "${TMPDIR:-/tmp}/zap-known-hosts.XXXXXX")
  if command -v ssh-keyscan >/dev/null 2>&1; then
    ssh-keyscan -p "$port" "$host" > "$tmp_known" 2>/dev/null || true
  fi
  if [ -s "$tmp_known" ]; then
    run_root install -o "$site_user" -g "$site_user" -m 600 "$tmp_known" "$known_hosts"
  elif ! run_root test -f "$known_hosts"; then
    run_root install -o "$site_user" -g "$site_user" -m 600 /dev/null "$known_hosts"
  fi
  rm -f "$tmp_known"

  tmp=$(mktemp "${TMPDIR:-/tmp}/zap-lightning-cli-wrapper.XXXXXX")
  cat > "$tmp" <<EOF_WRAPPER
#!/usr/bin/env python3
import json
import subprocess
import sys

host = "$host"
port = "$port"
user = "$user"
key_file = "$(remote_cli_key_file)"
known_hosts = "$(remote_cli_known_hosts_file)"

argv = []
skip_next = False
for arg in sys.argv[1:]:
    if skip_next:
        skip_next = False
        continue
    if arg in ("--lightning-dir", "--network"):
        skip_next = True
        continue
    if arg.startswith("--lightning-dir=") or arg.startswith("--network="):
        continue
    argv.append(arg)

completed = subprocess.run(
    [
        "ssh",
        "-T",
        "-i", key_file,
        "-p", port,
        "-o", "BatchMode=yes",
        "-o", "IdentitiesOnly=yes",
        "-o", "StrictHostKeyChecking=yes",
        "-o", f"UserKnownHostsFile={known_hosts}",
        f"{user}@{host}",
    ],
    input=json.dumps(argv, separators=(",", ":")) + "\\n",
    text=True,
)
sys.exit(completed.returncode)
EOF_WRAPPER
  run_root install -o "$site_user" -g "$site_user" -m 700 "$tmp" "$(remote_lightning_cli_wrapper)"
  rm -f "$tmp"
}

write_service_script() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/zap-service.XXXXXX")
  cat > "$tmp" <<'EOF_PY'
#!/usr/bin/env python3
import hashlib
import json
import os
import pathlib
import signal
import subprocess
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


SITE_USER = os.environ["SITE_USER"]
SITE_HOME = os.environ["SITE_HOME"]
SITE_DOMAIN = os.environ["SITE_DOMAIN"]
ALIAS_NAME = os.environ["ZAP_ALIAS_NAME"]
ALIAS_DOMAIN = os.environ["ZAP_ALIAS_DOMAIN"]
SERVICE_PORT = int(os.environ["ZAP_SERVICE_PORT"])
LIGHTNING_DIR = os.environ["LIGHTNING_DIR"]
NOSTR_STATE_DIR = pathlib.Path(os.environ["NOSTR_STATE_DIR"])
STATE_DIR = pathlib.Path(os.environ["ZAP_STATE_DIR"])
REQUESTS_DIR = pathlib.Path(os.environ["ZAP_REQUESTS_DIR"])
RECEIPTS_DIR = pathlib.Path(os.environ["ZAP_RECEIPTS_DIR"])
LIGHTNING_PUBLIC_HOST = os.environ["LIGHTNING_PUBLIC_HOST"]
LIGHTNING_PUBLIC_PORT = int(os.environ["LIGHTNING_PUBLIC_PORT"])
MIN_SENDABLE_MSAT = int(os.environ.get("MIN_SENDABLE_MSAT", "1000"))
MAX_SENDABLE_MSAT = int(os.environ.get("MAX_SENDABLE_MSAT", "1000000000"))
COMMENT_ALLOWED = int(os.environ.get("COMMENT_ALLOWED", "280"))

SECRET_FILE = NOSTR_STATE_DIR / "secret.key"
SITE_PUBKEY_FILE = NOSTR_STATE_DIR / "site_pubkey"
RELAYS_FILE = NOSTR_STATE_DIR / "relays"
LAST_PAY_INDEX_FILE = STATE_DIR / "lastpay_index"
STOP_EVENT = threading.Event()


class ServiceError(Exception):
    pass


def log(message):
    print(f"[zaps:{SITE_USER}] {message}", flush=True)


def read_text(path):
    return pathlib.Path(path).read_text(encoding="utf-8").strip()


def read_site_pubkey():
    value = read_text(SITE_PUBKEY_FILE).lower()
    if len(value) != 64 or any(ch not in "0123456789abcdef" for ch in value):
        raise ServiceError("site pubkey cache is invalid")
    return value


def read_secret():
    value = read_text(SECRET_FILE).lower()
    if len(value) != 64 or any(ch not in "0123456789abcdef" for ch in value):
        raise ServiceError("site secret key is invalid")
    return value


def run_command(args, input_text=None, timeout=30):
    try:
        completed = subprocess.run(
            args,
            input=input_text,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError as exc:
        raise ServiceError(f"missing command: {args[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise ServiceError(f"command timed out: {' '.join(args)}") from exc
    if completed.returncode != 0:
        stderr = (completed.stderr or "").strip()
        stdout = (completed.stdout or "").strip()
        detail = stderr or stdout or f"exit {completed.returncode}"
        raise ServiceError(detail)
    return completed.stdout


def lightning_cli(*args, timeout=30):
    output = run_command(["lightning-cli", f"--lightning-dir={LIGHTNING_DIR}", *args], timeout=timeout)
    try:
        return json.loads(output)
    except json.JSONDecodeError as exc:
        raise ServiceError("lightning-cli returned invalid JSON") from exc


def lightning_cli_keywords(method, timeout=30, **kwargs):
    args = ["lightning-cli", f"--lightning-dir={LIGHTNING_DIR}", "-k", method]
    for key, value in kwargs.items():
        if isinstance(value, bool):
            rendered = "true" if value else "false"
        elif isinstance(value, (int, float)):
            rendered = str(value)
        else:
            rendered = json.dumps(value, ensure_ascii=False)
        args.append(f"{key}={rendered}")
    output = run_command(args, timeout=timeout)
    try:
        return json.loads(output)
    except json.JSONDecodeError as exc:
        raise ServiceError("lightning-cli returned invalid JSON") from exc


def verify_event(event_json):
    run_command(["nak", "verify"], input_text=event_json + "\n", timeout=15)


def sign_event(kind, created_at, content, tags):
    args = [
        "nostril",
        "--sec",
        read_secret(),
        "--kind",
        str(kind),
        "--created-at",
        str(created_at),
        "--content",
        content,
    ]
    for key, value in tags:
        args.extend(["--tag", key, value])
    output = run_command(args, timeout=20)
    try:
        return json.loads(output)
    except json.JSONDecodeError as exc:
        raise ServiceError("nostril returned invalid JSON") from exc


def parse_msat(value):
    raw = str(value or "").strip().lower()
    if raw.endswith("msat"):
        raw = raw[:-4]
    if not raw.isdigit():
        raise ServiceError("invalid millisatoshi amount")
    return int(raw)


def json_compact(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def expected_pay_url():
    return f"https://{ALIAS_DOMAIN}/.well-known/lnurlp/{ALIAS_NAME}"


def expected_callback_url():
    return expected_pay_url() + "/callback"


def bech32_encode(hrp, payload):
    alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
    generator = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]

    def polymod(values):
        chk = 1
        for value in values:
            top = chk >> 25
            chk = ((chk & 0x1FFFFFF) << 5) ^ value
            for idx, gen in enumerate(generator):
                if (top >> idx) & 1:
                    chk ^= gen
        return chk

    def hrp_expand(value):
        return [ord(ch) >> 5 for ch in value] + [0] + [ord(ch) & 31 for ch in value]

    def convertbits(data, from_bits, to_bits, pad=True):
        acc = 0
        bits = 0
        out = []
        maxv = (1 << to_bits) - 1
        for byte in data:
            acc = (acc << from_bits) | byte
            bits += from_bits
            while bits >= to_bits:
                bits -= to_bits
                out.append((acc >> bits) & maxv)
        if pad and bits:
            out.append((acc << (to_bits - bits)) & maxv)
        return out

    words = convertbits(payload.encode("utf-8"), 8, 5, True)
    values = hrp_expand(hrp) + words + [0, 0, 0, 0, 0, 0]
    checksum = polymod(values) ^ 1
    suffix = [(checksum >> (5 * (5 - idx))) & 31 for idx in range(6)]
    return hrp + "1" + "".join(alphabet[item] for item in words + suffix)


def expected_lnurl():
    return bech32_encode("lnurl", expected_pay_url())


def load_relay_hints():
    relays = []
    if RELAYS_FILE.exists():
        for line in RELAYS_FILE.read_text(encoding="utf-8").splitlines():
            candidate = line.strip()
            if not candidate:
                continue
            if candidate.startswith("ws://") or candidate.startswith("wss://"):
                relays.append(candidate)
    seen = []
    for relay in relays:
        if relay not in seen:
            seen.append(relay)
    return seen


def zap_metadata():
    label = f"{ALIAS_NAME}@{ALIAS_DOMAIN}"
    return json_compact([
        ["text/plain", f"Zap {SITE_DOMAIN}"],
        ["text/identifier", label],
    ])


def load_lightning_summary():
    info = lightning_cli("getinfo", timeout=15)
    funds = lightning_cli("listfunds", timeout=15)
    channels = funds.get("channels") or []
    outbound_msat = 0
    inbound_msat = 0
    for channel in channels:
        total = parse_msat(channel.get("amount_msat", 0))
        ours = parse_msat(channel.get("our_amount_msat", 0))
        outbound_msat += ours
        inbound_msat += max(total - ours, 0)
    return {
        "node_id": str(info.get("id") or "").strip(),
        "alias": str(info.get("alias") or "").strip(),
        "num_active_channels": int(info.get("num_active_channels") or 0),
        "num_pending_channels": int(info.get("num_pending_channels") or 0),
        "num_peers": int(info.get("num_peers") or 0),
        "outbound_liquidity_sats": outbound_msat // 1000,
        "inbound_liquidity_sats": inbound_msat // 1000,
        "public_address": f"{LIGHTNING_PUBLIC_HOST}:{LIGHTNING_PUBLIC_PORT}",
    }


def load_pay_info():
    return {
        "tag": "payRequest",
        "callback": expected_callback_url(),
        "minSendable": MIN_SENDABLE_MSAT,
        "maxSendable": MAX_SENDABLE_MSAT,
        "commentAllowed": COMMENT_ALLOWED,
        "metadata": zap_metadata(),
        "allowsNostr": True,
        "nostrPubkey": read_site_pubkey(),
    }


def error_payload(reason):
    return {"status": "ERROR", "reason": reason}


def validate_relay(relay):
    return relay.startswith("ws://") or relay.startswith("wss://")


def validate_zap_request(event, amount_msat, lnurl_value):
    if not isinstance(event, dict):
        raise ServiceError("nostr must be a JSON object")
    event_json = json_compact(event)
    verify_event(event_json)
    if int(event.get("kind") or 0) != 9734:
        raise ServiceError("zap request kind must be 9734")
    tags = event.get("tags")
    if not isinstance(tags, list):
        raise ServiceError("zap request must include tags")

    recipient_pubkeys = []
    event_ids = []
    addresses = []
    sender_pubkeys = []
    relays = []

    for tag in tags:
        if not isinstance(tag, list) or not tag:
            raise ServiceError("zap request tags must be arrays")
        name = str(tag[0])
        if name == "p":
            if len(tag) < 2:
                raise ServiceError("p tag is missing a value")
            recipient_pubkeys.append(str(tag[1]).strip().lower())
        elif name == "e":
            if len(tag) < 2:
                raise ServiceError("e tag is missing a value")
            event_ids.append(str(tag[1]).strip().lower())
        elif name == "a":
            if len(tag) < 2:
                raise ServiceError("a tag is missing a value")
            addresses.append(str(tag[1]).strip())
        elif name == "P":
            if len(tag) < 2:
                raise ServiceError("P tag is missing a value")
            sender_pubkeys.append(str(tag[1]).strip().lower())
        elif name == "relays":
            relays.extend(str(item).strip() for item in tag[1:] if str(item).strip())
        elif name == "amount" and len(tag) >= 2:
            if str(tag[1]).strip() != str(amount_msat):
                raise ServiceError("amount tag does not match the requested amount")
        elif name == "lnurl" and len(tag) >= 2:
            if str(tag[1]).strip() != lnurl_value:
                raise ServiceError("lnurl tag does not match this zap endpoint")

    if len(recipient_pubkeys) != 1:
      raise ServiceError("zap request must include exactly one p tag")
    if len(event_ids) > 1:
      raise ServiceError("zap request may include at most one e tag")
    if len(addresses) > 1:
      raise ServiceError("zap request may include at most one a tag")
    if len(sender_pubkeys) > 1:
      raise ServiceError("zap request may include at most one P tag")
    if recipient_pubkeys[0] != read_site_pubkey():
      raise ServiceError("zap request recipient does not match this site")
    if not relays:
      raise ServiceError("zap request must include relays")
    relays = [relay for relay in relays if validate_relay(relay)]
    if not relays:
      raise ServiceError("zap request relays are invalid")
    return event_json, relays


def save_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def create_invoice(amount_msat, zap_request_json=None, comment=""):
    label = f"zap-{int(time.time())}-{os.urandom(4).hex()}"
    description = zap_request_json if zap_request_json else zap_metadata()
    result = lightning_cli_keywords(
        "invoice",
        timeout=20,
        amount_msat=f"{amount_msat}msat",
        label=label,
        description=description,
        deschashonly=True,
    )
    bolt11 = str(result.get("bolt11") or "").strip()
    if not bolt11:
        raise ServiceError("lightning-cli did not return a bolt11 invoice")
    request_payload = {
        "label": label,
        "amount_msat": amount_msat,
        "bolt11": bolt11,
        "created_at": int(time.time()),
        "mode": "nostr_zap" if zap_request_json else "lightning_invoice",
    }
    if zap_request_json:
        request_payload["zap_request"] = json.loads(zap_request_json)
    if comment:
        request_payload["comment"] = str(comment)
    save_json(
        REQUESTS_DIR / f"{label}.json",
        request_payload,
    )
    return {"label": label, "bolt11": bolt11}


def list_invoice(label):
    result = lightning_cli("listinvoices", label, timeout=15)
    invoices = result.get("invoices") or []
    if not invoices:
        raise ServiceError(f"invoice {label} was not found")
    return invoices[0]


def published_receipt_path(label):
    return RECEIPTS_DIR / f"{label}.json"


def zap_request_from_description(description):
    if not isinstance(description, str) or not description.strip():
        return None
    try:
        payload = json.loads(description)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    if int(payload.get("kind") or 0) != 9734:
        return None
    return payload


def publish_receipt(invoice):
    label = str(invoice.get("label") or "").strip()
    if not label:
        raise ServiceError("paid invoice label is missing")
    marker = published_receipt_path(label)
    if marker.exists():
        return

    zap_request = zap_request_from_description(invoice.get("description"))
    if not zap_request:
        return

    site_pubkey = read_site_pubkey()
    created_at = int(invoice.get("paid_at") or time.time())
    tags = [["p", site_pubkey]]

    sender_pubkey = str(zap_request.get("pubkey") or "").strip().lower()
    if len(sender_pubkey) == 64 and all(ch in "0123456789abcdef" for ch in sender_pubkey):
        tags.append(["P", sender_pubkey])

    for tag in zap_request.get("tags") or []:
        if not isinstance(tag, list) or len(tag) < 2:
            continue
        name = str(tag[0])
        value = str(tag[1])
        if name in ("e", "a", "k"):
            tags.append([name, value])

    bolt11 = str(invoice.get("bolt11") or "").strip()
    if bolt11:
        tags.append(["bolt11", bolt11])
    amount_msat = parse_msat(invoice.get("amount_received_msat") or invoice.get("amount_msat") or "0msat")
    if amount_msat > 0:
        tags.append(["amount", str(amount_msat)])
    description_json = json_compact(zap_request)
    tags.append(["description", description_json])
    preimage = str(invoice.get("payment_preimage") or "").strip().lower()
    if len(preimage) == 64 and all(ch in "0123456789abcdef" for ch in preimage):
        tags.append(["preimage", preimage])

    receipt_event = sign_event(9735, created_at, "", tags)
    receipt_json = json_compact(receipt_event)

    relays = []
    for tag in zap_request.get("tags") or []:
        if isinstance(tag, list) and tag and tag[0] == "relays":
            relays.extend(str(item).strip() for item in tag[1:] if str(item).strip())
    relays = [relay for relay in relays if validate_relay(relay)]
    success_count = 0
    for relay in relays:
        try:
            run_command(["nak", "event", relay], input_text=receipt_json + "\n", timeout=20)
            success_count += 1
        except ServiceError as exc:
            log(f"relay publish failed for {relay}: {exc}")
    if success_count < 1:
        raise ServiceError("could not publish zap receipt to any relay")

    save_json(
        marker,
        {
            "published_at": int(time.time()),
            "relay_count": success_count,
            "event": receipt_event,
        },
    )
    log(f"published zap receipt for {label} to {success_count} relay(s)")


def load_last_pay_index():
    if not LAST_PAY_INDEX_FILE.exists():
        return 0
    raw = LAST_PAY_INDEX_FILE.read_text(encoding="utf-8").strip()
    return int(raw or "0")


def save_last_pay_index(value):
    LAST_PAY_INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)
    LAST_PAY_INDEX_FILE.write_text(str(int(value)), encoding="utf-8")


def invoice_worker():
    last_pay_index = load_last_pay_index()
    log(f"invoice worker starting from pay_index={last_pay_index}")
    while not STOP_EVENT.is_set():
        try:
            invoice = lightning_cli("waitanyinvoice", str(last_pay_index), "60", timeout=75)
        except ServiceError as exc:
            message = str(exc).lower()
            if "timed out" in message or "timeout" in message:
                continue
            log(f"waitanyinvoice failed: {exc}")
            time.sleep(5)
            continue

        pay_index = int(invoice.get("pay_index") or 0)

        label = str(invoice.get("label") or "").strip()
        if label:
            try:
                full_invoice = list_invoice(label)
                publish_receipt(full_invoice)
            except ServiceError as exc:
                log(f"paid invoice {label} could not publish a receipt: {exc}")
                continue
            except Exception as exc:
                log(f"paid invoice {label} could not be processed: {exc}")
                continue

        if pay_index > last_pay_index:
            last_pay_index = pay_index
            save_last_pay_index(last_pay_index)


class Handler(BaseHTTPRequestHandler):
    server_version = "HeadquartersZapService/1.0"

    def log_message(self, format_string, *args):
        log(format_string % args)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/healthz":
            try:
                summary = load_lightning_summary()
                self.send_json({"ok": True, "summary": summary})
            except ServiceError as exc:
                self.send_json({"ok": False, "reason": str(exc)}, status=503)
            return

        pay_path = f"/.well-known/lnurlp/{ALIAS_NAME}"
        callback_path = pay_path + "/callback"
        if parsed.path == pay_path:
            try:
                self.send_json(load_pay_info())
            except ServiceError as exc:
                self.send_json(error_payload(str(exc)), status=503)
            return

        if parsed.path == callback_path:
            query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
            amount_value = (query.get("amount") or [""])[0].strip()
            nostr_value = (query.get("nostr") or [""])[0].strip()
            lnurl_value = (query.get("lnurl") or [""])[0].strip()
            if not amount_value.isdigit():
                self.send_json(error_payload("amount must be a positive integer in millisats"), status=400)
                return
            amount_msat = int(amount_value)
            if amount_msat < MIN_SENDABLE_MSAT or amount_msat > MAX_SENDABLE_MSAT:
                self.send_json(error_payload("amount is outside the supported range"), status=400)
                return
            if not nostr_value:
                comment_value = (query.get("comment") or [""])[0].strip()
                if len(comment_value) > COMMENT_ALLOWED:
                    self.send_json(error_payload("comment is too long"), status=400)
                    return
                try:
                    invoice = create_invoice(amount_msat, None, comment_value)
                    self.send_json({"pr": invoice["bolt11"], "routes": []})
                except ServiceError as exc:
                    self.send_json(error_payload(str(exc)), status=400)
                return
            if lnurl_value != expected_lnurl():
                self.send_json(error_payload("lnurl does not match this Lightning Address"), status=400)
                return
            try:
                zap_request = json.loads(nostr_value)
            except json.JSONDecodeError:
                self.send_json(error_payload("nostr must be valid JSON"), status=400)
                return
            try:
                zap_request_json, _relays = validate_zap_request(zap_request, amount_msat, lnurl_value)
                invoice = create_invoice(amount_msat, zap_request_json)
                self.send_json({"pr": invoice["bolt11"], "routes": []})
            except ServiceError as exc:
                self.send_json(error_payload(str(exc)), status=400)
            return

        if parsed.path == "/.well-known/nostr.json":
            name = (urllib.parse.parse_qs(parsed.query).get("name") or [""])[0].strip().lower()
            if name != ALIAS_NAME:
                self.send_json({"names": {}, "relays": {}}, status=404)
                return
            pubkey = read_site_pubkey()
            relays = load_relay_hints()
            self.send_json({"names": {ALIAS_NAME: pubkey}, "relays": {ALIAS_NAME: relays}})
            return

        self.send_json({"status": "ERROR", "reason": "not found"}, status=404)


def main():
    for path in (STATE_DIR, REQUESTS_DIR, RECEIPTS_DIR):
        path.mkdir(parents=True, exist_ok=True)

    worker = threading.Thread(target=invoice_worker, daemon=True)
    worker.start()

    def handle_signal(signum, _frame):
        log(f"received signal {signum}, shutting down")
        STOP_EVENT.set()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    server = ThreadingHTTPServer(("127.0.0.1", SERVICE_PORT), Handler)
    log(f"listening on 127.0.0.1:{SERVICE_PORT} for {ALIAS_NAME}@{ALIAS_DOMAIN}")
    try:
        server.serve_forever()
    finally:
        STOP_EVENT.set()
        server.server_close()
        worker.join(timeout=5)


if __name__ == "__main__":
    main()
EOF_PY
  run_root install -o "$site_user" -g "$site_user" -m 700 "$tmp" "$(service_script_file)"
  rm -f "$tmp"
}

write_service_file() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/zap-service-unit.XXXXXX")
  if use_remote_lightning_cli; then
    unit_deps='After=network-online.target
Wants=network-online.target'
    path_line="Environment=PATH=$(service_bin_dir):/usr/local/bin:/usr/bin:/bin"
  else
    unit_deps="Requires=headquarters-lightningd-$site_user.service
After=headquarters-lightningd-$site_user.service"
    path_line=''
  fi
  cat > "$tmp" <<EOF_SERVICE
[Unit]
Description=Headquarters Lightning Address endpoint for $site_user
$unit_deps

[Service]
Type=simple
User=$site_user
Group=$site_user
WorkingDirectory=$(site_home)
EnvironmentFile=$(service_env_file)
$path_line
ExecStart=$(command -v python3) -u $(service_script_file)
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF_SERVICE
  run_root install -m 0644 -o root -g root "$tmp" "$(service_file)"
  rm -f "$tmp"
}

write_server_hook() {
  upstream=127.0.0.1:$(calc_service_port)
  tmp=$(mktemp "${TMPDIR:-/tmp}/zap-endpoint-hook.XXXXXX")
  cat > "$tmp" <<EOF_HOOK
location ^~ /.well-known/lnurlp/ {
  proxy_http_version 1.1;
  proxy_set_header Host \$http_host;
  proxy_set_header X-Forwarded-Proto \$scheme;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_pass http://$upstream;
}

location = /.well-known/nostr.json {
  proxy_http_version 1.1;
  proxy_set_header Host \$http_host;
  proxy_set_header X-Forwarded-Proto \$scheme;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_pass http://$upstream;
}
EOF_HOOK
  run_root install -d -m 755 "/etc/nginx/headquarters-site/$site_user/server.d"
  run_root install -m 0644 -o root -g root "$tmp" "$(server_hook_file)"
  rm -f "$tmp"
}

write_alias_server_hook() {
  upstream=127.0.0.1:$(calc_service_port)
  tmp=$(mktemp "${TMPDIR:-/tmp}/zap-endpoint-alias-hook.XXXXXX")
  cat > "$tmp" <<EOF_HOOK
location ^~ /.well-known/lnurlp/ {
  proxy_http_version 1.1;
  proxy_set_header Host \$http_host;
  proxy_set_header X-Forwarded-Proto \$scheme;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_pass http://$upstream;
}

location = /.well-known/nostr.json {
  proxy_http_version 1.1;
  proxy_set_header Host \$http_host;
  proxy_set_header X-Forwarded-Proto \$scheme;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_pass http://$upstream;
}
EOF_HOOK
  run_root install -d -m 755 "$(alias_server_hook_dir)"
  run_root install -m 0644 -o root -g root "$tmp" "$(alias_server_hook_file)"
  rm -f "$tmp"
}

remove_legacy_alias_hooks() {
  if [ "$(zap_alias_domain)" = "$site_domain" ]; then
    return 0
  fi
  run_root rm -f "$(legacy_btcpay_alias_hook_file)" "$(legacy_btcpay_rootpath_hook_file)"
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
  tmp=$(mktemp "${TMPDIR:-/tmp}/zap-endpoint-vhost.XXXXXX")
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
    status_bad "Could not patch $vhost_file with the zap endpoint include."
    exit 1
  }
  run_root install -m 0644 -o root -g root "$tmp" "$vhost_file"
  rm -f "$tmp"
}

reload_nginx() {
  run_root nginx -t
  run_root systemctl reload nginx 2>/dev/null || run_root service nginx reload 2>/dev/null || true
}

check_status() {
  require_site_context
  if ! run_root test -f "$(active_site_conf)"; then
    status_bad "The active site.conf file is missing."
    return 0
  fi
  if ! run_root test -f "$(release_site_conf)"; then
    status_bad "The managed release site.conf file is missing."
    return 0
  fi
  command -v python3 >/dev/null 2>&1 || {
    status_bad "python3 is required for the Lightning Address endpoint."
    return 0
  }
  command -v curl >/dev/null 2>&1 || {
    status_bad "curl is required for Lightning Address endpoint checks."
    return 0
  }
  if use_remote_lightning_cli; then
    if ! run_root test -x "$(remote_lightning_cli_wrapper)"; then
      status_bad "The remote Lightning gateway wrapper is missing."
      return 0
    fi
  elif ! command -v lightning-cli >/dev/null 2>&1; then
    status_bad "lightning-cli is not installed on this server."
    return 0
  fi
  command -v nak >/dev/null 2>&1 || {
    status_bad "nak is not installed on this server."
    return 0
  }
  command -v nostril >/dev/null 2>&1 || {
    status_bad "nostril is not installed on this server."
    return 0
  }
  if ! run_root test -f "$(service_script_file)"; then
    status_bad "The zap service script is missing."
    return 0
  fi
  if ! run_root test -f "$(service_env_file)"; then
    status_bad "The zap service env file is missing."
    return 0
  fi
  [ -f "$(service_file)" ] || {
    status_bad "The zap service unit is missing."
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
    status_bad "The site's nginx well-known hook for Lightning Address zaps is missing."
    return 0
  fi
  if [ "$(zap_alias_domain)" != "$site_domain" ] && [ ! -f "$(alias_server_hook_file)" ]; then
    status_bad "The apex nginx well-known hook for $(zap_alias_domain) is missing."
    return 0
  fi
  if ! run_root systemctl is-active --quiet "$(service_name)"; then
    status_bad "Lightning Address endpoint service $(service_name) is not active."
    return 0
  fi
  if ! curl -fsS "http://127.0.0.1:$(calc_service_port)/.well-known/lnurlp/$(zap_alias_localpart)" 2>/dev/null | grep -Eq '"callback"|"allowsNostr"|"nostrPubkey"'; then
    status_bad "The local zap endpoint metadata check is failing."
    return 0
  fi
  if ! curl -fsS "$(zap_endpoint_url)" 2>/dev/null | grep -Eq '"callback"|"allowsNostr"|"nostrPubkey"'; then
    status_bad "The public Lightning Address endpoint at $(zap_endpoint_url) is not live yet."
    return 0
  fi
  if ! curl -fsS "https://$(zap_alias_domain)/.well-known/nostr.json?name=$(zap_alias_localpart)" 2>/dev/null | grep -Fq "$(zap_alias_localpart)"; then
    status_bad "The public nostr.json alias for $(desired_zap_lud16) is not live yet."
    return 0
  fi
  if [ "$(lightning_synced)" != "true" ]; then
    status_bad "Lightning Address zaps are published at $(desired_zap_lud16), but Bitcoin Core is still syncing."
    return 0
  fi
  if [ "$(lightning_inbound_liquidity_sats)" -le 0 ]; then
    status_bad "Lightning Address zaps are published at $(desired_zap_lud16), but the node has no inbound liquidity yet."
    return 0
  fi
  status_ok "Lightning Address zaps are live at $(desired_zap_lud16) through the direct Core Lightning endpoint."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
if ! run_root test -f "$(active_site_conf)"; then
  status_bad "The active site.conf file is missing."
  exit 1
fi
if ! run_root test -f "$(release_site_conf)"; then
  status_bad "The managed release site.conf file is missing."
  exit 1
fi

write_conf_value "$(active_site_conf)" zap_lud16 "$(desired_zap_lud16)"
write_conf_value "$(release_site_conf)" zap_lud16 "$(desired_zap_lud16)"
write_service_env_file
write_remote_lightning_cli_wrapper
write_service_script
write_service_file

if [ "$(zap_alias_domain)" = "$site_domain" ]; then
  write_server_hook
else
  remove_legacy_alias_hooks
  write_alias_server_hook
  ensure_alias_domain_include
fi

run_root systemctl daemon-reload
run_root systemctl enable "$(service_name)" >/dev/null 2>&1 || true
run_root systemctl restart "$(service_name)"
reload_nginx
check_status
