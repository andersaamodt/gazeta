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

validate_hex_key() {
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

validate_npub() {
  value=$(printf '%s' "${1-}" | tr -d '\r\n[:space:]')
  case "$value" in
    npub1*) printf '%s\n' "$value" ;;
    *) return 1 ;;
  esac
}

require_site_context() {
  [ -n "$site_user" ] || {
    status_bad "HQ_SITE_USER is required for site Nostr identity provisioning."
    exit 1
  }
}

site_home() {
  printf '/home/%s\n' "$site_user"
}

state_dir() {
  printf '%s/.sitedata/site/nostr/state\n' "$(site_home)"
}

secret_file() {
  printf '%s/secret.key\n' "$(state_dir)"
}

site_pubkey_file() {
  printf '%s/site_pubkey\n' "$(state_dir)"
}

site_npub_file() {
  printf '%s/site_npub\n' "$(state_dir)"
}

authors_file() {
  printf '%s/authors\n' "$(state_dir)"
}

relays_file() {
  printf '%s/relays\n' "$(state_dir)"
}

write_site_owned_file() {
  target=$1
  mode=$2
  tmp=$(mktemp "${TMPDIR:-/tmp}/nostr-site-owned.XXXXXX")
  cat > "$tmp"
  run_root install -d -o "$site_user" -g "$site_user" -m 700 "$(dirname "$target")"
  run_root install -o "$site_user" -g "$site_user" -m "$mode" "$tmp" "$target"
  rm -f "$tmp"
}

compute_pubkey() {
  secret=$(validate_hex_key "${1-}" 2>/dev/null || printf '')
  [ -n "$secret" ] || return 1
  command -v nostril >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1
  tmp=$(mktemp "${TMPDIR:-/tmp}/nostr-site-pubkey.XXXXXX")
  set +e
  nostril --sec "$secret" --kind 1 --created-at "$(date +%s)" --content "" > "$tmp" 2>/dev/null
  sign_status=$?
  set -e
  if [ "$sign_status" -ne 0 ]; then
    rm -f "$tmp"
    return 1
  fi
  pubkey=$(jq -r '.pubkey // ""' "$tmp" 2>/dev/null | tr -d '\r\n[:space:]' | tr 'A-F' 'a-f')
  rm -f "$tmp"
  validate_hex_key "$pubkey"
}

compute_npub() {
  pubkey=$(validate_hex_key "${1-}" 2>/dev/null || printf '')
  [ -n "$pubkey" ] || return 1
  if command -v nak >/dev/null 2>&1; then
    encoded=$(nak encode npub "$pubkey" 2>/dev/null | tr -d '\r\n[:space:]')
    encoded=$(validate_npub "$encoded" 2>/dev/null || printf '')
    if [ -n "$encoded" ]; then
      printf '%s\n' "$encoded"
      return 0
    fi
  fi
  command -v python3 >/dev/null 2>&1 || return 1
  python3 - "$pubkey" <<'PY'
import sys

alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

def bech32_polymod(values):
    chk = 1
    for value in values:
        top = chk >> 25
        chk = ((chk & 0x1FFFFFF) << 5) ^ value
        for i, gen in enumerate(generator):
            if (top >> i) & 1:
                chk ^= gen
    return chk

def hrp_expand(hrp):
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]

def create_checksum(hrp, data):
    values = hrp_expand(hrp) + data + [0, 0, 0, 0, 0, 0]
    polymod = bech32_polymod(values) ^ 1
    return [(polymod >> (5 * (5 - i))) & 31 for i in range(6)]

def convertbits(data, from_bits, to_bits, pad=True):
    acc = 0
    bits = 0
    out = []
    maxv = (1 << to_bits) - 1
    for value in data:
        acc = (acc << from_bits) | value
        bits += from_bits
        while bits >= to_bits:
            bits -= to_bits
            out.append((acc >> bits) & maxv)
    if pad and bits:
        out.append((acc << (to_bits - bits)) & maxv)
    return out

pubkey = sys.argv[1].strip().lower()
words = convertbits(bytes.fromhex(pubkey), 8, 5, True)
checksum = create_checksum("npub", words)
print("npub1" + "".join(alphabet[v] for v in words + checksum))
PY
}

default_relays() {
  if [ -n "$site_domain" ]; then
    printf 'wss://%s\n' "$site_domain"
  fi
  printf '%s\n' \
    'wss://relay.damus.io' \
    'wss://nos.lol' \
    'wss://relay.primal.net' \
    'wss://nostr.wine'
}

check_status() {
  require_site_context
  command -v nostril >/dev/null 2>&1 || {
    status_bad "nostril is not installed on this server."
    return 0
  }
  command -v jq >/dev/null 2>&1 || {
    status_bad "jq is not installed on this server."
    return 0
  }
  secret=$(run_site sed -n '1p' "$(secret_file)" 2>/dev/null | tr -d '\r\n[:space:]' | tr 'A-F' 'a-f')
  secret=$(validate_hex_key "$secret" 2>/dev/null || printf '')
  [ -n "$secret" ] || {
    status_bad "Site Nostr secret key is missing."
    return 0
  }
  pubkey=$(run_site sed -n '1p' "$(site_pubkey_file)" 2>/dev/null | tr -d '\r\n[:space:]' | tr 'A-F' 'a-f')
  pubkey=$(validate_hex_key "$pubkey" 2>/dev/null || printf '')
  [ -n "$pubkey" ] || {
    status_bad "Site pubkey cache is missing."
    return 0
  }
  npub=$(run_site sed -n '1p' "$(site_npub_file)" 2>/dev/null | tr -d '\r\n[:space:]')
  npub=$(validate_npub "$npub" 2>/dev/null || printf '')
  [ -n "$npub" ] || {
    status_bad "Site npub cache is missing."
    return 0
  }
  if ! run_site grep -Fxq "$pubkey" "$(authors_file)" 2>/dev/null; then
    status_bad "Site pubkey is not present in the mirrored author list."
    return 0
  fi
  relay_count=$(run_site awk 'NF { count += 1 } END { print count + 0 }' "$(relays_file)" 2>/dev/null || printf '0')
  if [ "$relay_count" -lt 1 ]; then
    status_bad "Site relay list is empty."
    return 0
  fi
  short_pubkey=$(printf '%s' "$pubkey" | cut -c1-12)
  status_ok "Site Nostr identity is ready for ${site_domain:-$site_user} (${short_pubkey}..., ${relay_count} relays)."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
run_root install -d -o "$site_user" -g "$site_user" -m 700 "$(state_dir)"

secret=$(run_site sed -n '1p' "$(secret_file)" 2>/dev/null | tr -d '\r\n[:space:]' | tr 'A-F' 'a-f')
secret=$(validate_hex_key "$secret" 2>/dev/null || printf '')
if [ -z "$secret" ]; then
  command -v openssl >/dev/null 2>&1 || {
    status_bad "openssl is required to generate the site Nostr secret key."
    exit 1
  }
  secret=$(openssl rand -hex 32 | tr -d '\r\n[:space:]')
  secret=$(validate_hex_key "$secret" 2>/dev/null || printf '')
  [ -n "$secret" ] || {
    status_bad "Could not generate a valid site Nostr secret key."
    exit 1
  }
  printf '%s\n' "$secret" | write_site_owned_file "$(secret_file)" 600
fi

pubkey=$(compute_pubkey "$secret" 2>/dev/null || printf '')
[ -n "$pubkey" ] || {
  status_bad "Could not derive the site pubkey from the site secret key."
  exit 1
}
printf '%s\n' "$pubkey" | write_site_owned_file "$(site_pubkey_file)" 600

npub=$(compute_npub "$pubkey" 2>/dev/null || printf '')
[ -n "$npub" ] || {
  status_bad "Could not derive the site npub from the site pubkey."
  exit 1
}
printf '%s\n' "$npub" | write_site_owned_file "$(site_npub_file)" 600

if ! run_site grep -Fxq "$pubkey" "$(authors_file)" 2>/dev/null; then
  {
    if run_root test -f "$(authors_file)"; then
      run_site cat "$(authors_file)"
    fi
    printf '%s\n' "$pubkey"
  } | awk 'NF && !seen[$0]++ { print }' | write_site_owned_file "$(authors_file)" 644
fi

relay_count=$(run_site awk 'NF { count += 1 } END { print count + 0 }' "$(relays_file)" 2>/dev/null || printf '0')
if [ "$relay_count" -lt 1 ]; then
  default_relays | awk 'NF && !seen[$0]++ { print }' | write_site_owned_file "$(relays_file)" 644
fi

check_status
