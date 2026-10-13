#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)
node "$root/tests/test-admin-navigation.mjs"
