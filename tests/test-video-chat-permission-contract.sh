#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
WIDGET_JS="$ROOT_DIR/site/static/video-chat-widget.js"

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

assert_file_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq -- "$needle" "$file"; then
    pass
  else
    fail "$label (missing: $needle in $file)"
  fi
}

assert_file_not_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq -- "$needle" "$file"; then
    fail "$label (unexpected: $needle in $file)"
  else
    pass
  fi
}

node --check "$WIDGET_JS" >/dev/null 2>&1 || fail 'video chat widget parses in Node'

assert_file_contains "$WIDGET_JS" "Ready. Microphone access starts from the voice button." 'auto-started voice call context waits for the voice button before media capture'
assert_file_contains "$WIDGET_JS" "Ready. Camera access starts from the video button." 'auto-started video call context waits for the video button before media capture'
assert_file_not_contains "$WIDGET_JS" "self.startCall(self.options.callMode || 'video')" 'widget construction does not auto-start media capture from autoStart'
assert_file_contains "$WIDGET_JS" "navigator.mediaDevices.getUserMedia(constraints)" 'media capture remains behind the explicit join/call flow'

if [ "$FAIL_COUNT" -ne 0 ]; then
  printf '%s passed, %s failed\n' "$PASS_COUNT" "$FAIL_COUNT" >&2
  exit 1
fi

printf '%s passed, %s failed\n' "$PASS_COUNT" "$FAIL_COUNT"
