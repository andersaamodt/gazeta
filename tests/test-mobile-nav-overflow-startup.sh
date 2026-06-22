#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)
NAV_FILE="$ROOT_DIR/site/includes/nav.md"
AUTH_FILE="$ROOT_DIR/site/static/nav-auth.js"
STYLE_FILE="$ROOT_DIR/site/static/style.css"

fail() {
  printf '%s\n' "not ok - $1" >&2
  exit 1
}

assert_file_contains() {
  file=$1
  pattern=$2
  description=$3
  if ! grep -Fq -- "$pattern" "$file"; then
    fail "$description"
  fi
}

assert_file_contains "$NAV_FILE" "function seedInitialOverflowMenu()" 'nav include seeds overflow menu before nav hydration finishes'
assert_file_contains "$NAV_FILE" "nav-overflow-booting" 'nav include hides the pre-measurement row only while JS is booting overflow'
assert_file_contains "$NAV_FILE" "docEl.classList.remove('nav-overflow-booting');" 'nav include reveals navbar after synchronous overflow seeding'
assert_file_contains "$NAV_FILE" "function renderInitialNavbarPages()" 'nav include renders bootstrap or cached navbar rows before measuring overflow'
assert_file_contains "$NAV_FILE" "window.__wizardrySiteBootstrap" 'nav include can use generated bootstrap navbar rows for first layout'
assert_file_contains "$NAV_FILE" "while (hasNavPressure() && guard < links.length)" 'nav include computes the initial overflow set in one layout pass'
assert_file_contains "$NAV_FILE" "link.classList.remove('is-nav-overflow-hidden');" 'nav include starts overflow measurement from a clean link set'
assert_file_contains "$NAV_FILE" "panel.appendChild(item);" 'nav include clones hidden navbar links into the overflow panel'
assert_file_contains "$NAV_FILE" "menu.hidden = false;" 'mobile overflow seeding reveals the overflow trigger immediately'

assert_file_contains "$STYLE_FILE" "html.app-hydrating nav.site-nav .nav-center > a[data-page].is-nav-overflow-hidden" 'hydrating mobile nav hides only measured overflow links'
assert_file_contains "$STYLE_FILE" "html.nav-overflow-booting nav.site-nav .nav-center" 'booting nav hides the unmeasured row before first visible layout'
assert_file_contains "$STYLE_FILE" "html.app-hydrating nav.site-nav .nav-overflow-menu[hidden]" 'hydrating mobile nav forces the overflow trigger visible'

assert_file_contains "$AUTH_FILE" "navOverflowReady: false" 'nav auth tracks whether the first overflow layout pass has completed'
assert_file_contains "$AUTH_FILE" "function markNavOverflowReady()" 'nav auth exposes a one-time nav overflow readiness gate'
assert_file_contains "$AUTH_FILE" "markHydrationNavReady();" 'nav hydration readiness is driven by the overflow readiness gate'
assert_file_contains "$AUTH_FILE" "state.navOverflowReady = true;" 'nav overflow gate flips after the first sync'
assert_file_contains "$AUTH_FILE" "while (hasNavPressure() && guard < links.length)" 'nav auth resolves all overflow pressure in one sync'
assert_file_contains "$AUTH_FILE" "syncNavOverflowMenuNow();" 'nav auth syncs overflow immediately after rendering bootstrap navbar rows'

printf '%s\n' 'ok'
