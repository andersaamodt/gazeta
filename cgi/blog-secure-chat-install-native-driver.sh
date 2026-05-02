#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)

. "$SCRIPT_DIR/blog-lib.sh"
. "$SCRIPT_DIR/blog-secure-chat-common.sh"

blog_init

driver_root=$(blog_secure_chat_native_module_root)
node_bin=$(blog_secure_chat_node_binary)

if [ -z "$node_bin" ] || [ ! -x "$node_bin" ]; then
  printf '%s\n' "secure chat native driver install failed: Node.js runtime is not installed or configured." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' "secure chat native driver install failed: npm is not installed." >&2
  exit 1
fi

mkdir -p "$driver_root"
cp "$SCRIPT_DIR/secure-chat-native-driver/package.json" "$driver_root/package.json"
cd "$driver_root"
npm install --omit=dev
