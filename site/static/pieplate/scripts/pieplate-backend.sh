#!/bin/sh

set -eu

case "${1-}" in
  --help|--usage|-h)
    cat <<'USAGE'
Usage: pieplate-backend.sh COMMAND [ARGS...]

Commands:
  state-root
  project-root
  load-card
  save-card JSON
  list-projects
  load-project NAME
  save-project NAME JSON
  get-ui-prefs
  set-ui-pref KEY VALUE
USAGE
    exit 0
    ;;
esac

config_root=${PIEPLATE_CONFIG_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}/wizardry-apps/pieplate}
projects_root=${PIEPLATE_PROJECTS_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/wizardry-apps/pieplate/projects}
card_file="$config_root/card.json"
prefs_file="$config_root/ui.conf"

ensure_config_root() {
  mkdir -p "$config_root"
}

key_is_valid() {
  key_is_valid_key=${1-}
  case "$key_is_valid_key" in
    [a-z0-9]*)
      ;;
    *)
      return 1
      ;;
  esac

  case "$key_is_valid_key" in
    *[!a-z0-9._-]*)
      return 1
      ;;
  esac
  return 0
}

sanitize_value() {
  printf '%s' "${1-}" | tr '\r\n' ' '
}

print_prefs() {
  [ -f "$prefs_file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      *=*)
        key=${line%%=*}
        value=${line#*=}
        key_is_valid "$key" || continue
        printf '%s=%s\n' "$key" "$(sanitize_value "$value")"
        ;;
    esac
  done <"$prefs_file"
}

set_pref() {
  set_pref_key=${1-}
  set_pref_value=${2-}
  [ -n "$set_pref_key" ] || { printf '%s\n' "pieplate-backend: KEY required" >&2; exit 2; }
  key_is_valid "$set_pref_key" || { printf '%s\n' "pieplate-backend: invalid key: $set_pref_key" >&2; exit 2; }
  set_pref_value=$(sanitize_value "$set_pref_value")
  ensure_config_root
  tmp_file=$(mktemp "${TMPDIR:-/tmp}/pieplate-prefs.XXXXXX")
  if [ -f "$prefs_file" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in
        *=*)
          existing_key=${line%%=*}
          [ "$existing_key" != "$set_pref_key" ] || continue
          key_is_valid "$existing_key" || continue
          printf '%s\n' "$line" >>"$tmp_file"
          ;;
      esac
    done <"$prefs_file"
  fi
  printf '%s=%s\n' "$set_pref_key" "$set_pref_value" >>"$tmp_file"
  mv "$tmp_file" "$prefs_file"
}

save_card() {
  json=${1-}
  [ -n "$json" ] || { printf '%s\n' "pieplate-backend: JSON required" >&2; exit 2; }
  ensure_config_root
  tmp_file=$(mktemp "${TMPDIR:-/tmp}/pieplate-card.XXXXXX")
  printf '%s\n' "$json" >"$tmp_file"
  mv "$tmp_file" "$card_file"
}

ensure_projects_root() {
  mkdir -p "$projects_root"
}

project_name_is_valid() {
  project_name=${1-}
  [ -n "$project_name" ] || return 1
  case "$project_name" in
    .*|*/*|*\\*|*[!A-Za-z0-9._-]*)
      return 1
      ;;
  esac
  return 0
}

require_python() {
  command -v python3 >/dev/null 2>&1 || {
    printf '%s\n' "pieplate-backend: python3 required for project folders" >&2
    exit 2
  }
}

list_projects() {
  ensure_projects_root
  find "$projects_root" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort
}

save_project() {
  project_name=${1-}
  json=${2-}
  project_name_is_valid "$project_name" || { printf '%s\n' "pieplate-backend: invalid project name" >&2; exit 2; }
  [ -n "$json" ] || { printf '%s\n' "pieplate-backend: JSON required" >&2; exit 2; }
  require_python
  ensure_projects_root
  project_dir=$projects_root/$project_name
  tmp_json=$(mktemp "${TMPDIR:-/tmp}/pieplate-project.XXXXXX")
  printf '%s\n' "$json" >"$tmp_json"
  PIEPLATE_PROJECT_DIR=$project_dir python3 - "$tmp_json" <<'PY'
import base64
import json
import mimetypes
import os
import pathlib
import re
import shutil
import sys

source = pathlib.Path(sys.argv[1])
target = pathlib.Path(os.environ["PIEPLATE_PROJECT_DIR"])
stage = target.with_name("." + target.name + ".stage")

card = json.loads(source.read_text(encoding="utf-8"))
images = stage / "images"
if stage.exists():
    shutil.rmtree(stage)
stage.mkdir(parents=True)
images.mkdir()

for index, cell in enumerate(card.get("cells", []), start=1):
    image = cell.get("image") if isinstance(cell, dict) else None
    src = image.get("src") if isinstance(image, dict) else ""
    if not isinstance(src, str) or not src.startswith("data:"):
        continue
    match = re.match(r"^data:([^;,]+)?(;base64)?,(.*)$", src, re.S)
    if not match:
        continue
    mime = match.group(1) or "application/octet-stream"
    payload = match.group(3)
    if match.group(2):
        raw = base64.b64decode(payload)
    else:
        from urllib.parse import unquote_to_bytes
        raw = unquote_to_bytes(payload)
    ext = mimetypes.guess_extension(mime) or ".bin"
    if ext == ".jpe":
        ext = ".jpg"
    image_name = f"cell-{index:02d}{ext}"
    (images / image_name).write_bytes(raw)
    image["src"] = "images/" + image_name
    image["mime"] = mime

(stage / "card.json").write_text(json.dumps(card, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
if target.exists():
    shutil.rmtree(target)
stage.rename(target)
PY
  rm -f "$tmp_json"
  printf '%s\n' "$project_dir"
}

load_project() {
  project_name=${1-}
  project_name_is_valid "$project_name" || { printf '%s\n' "pieplate-backend: invalid project name" >&2; exit 2; }
  require_python
  project_dir=$projects_root/$project_name
  [ -d "$project_dir" ] || { printf '%s\n' "pieplate-backend: project not found" >&2; exit 2; }
  PIEPLATE_PROJECT_DIR=$project_dir python3 - <<'PY'
import base64
import json
import mimetypes
import os
import pathlib

root = pathlib.Path(os.environ["PIEPLATE_PROJECT_DIR"]).resolve()
card_path = root / "card.json"
card = json.loads(card_path.read_text(encoding="utf-8"))
for cell in card.get("cells", []):
    image = cell.get("image") if isinstance(cell, dict) else None
    src = image.get("src") if isinstance(image, dict) else ""
    if not isinstance(src, str) or src.startswith("data:"):
        continue
    image_path = (root / src).resolve()
    if root not in image_path.parents and image_path != root:
        image["src"] = ""
        continue
    if not image_path.is_file():
        image["src"] = ""
        continue
    mime = image.get("mime") or mimetypes.guess_type(str(image_path))[0] or "application/octet-stream"
    image["src"] = "data:" + mime + ";base64," + base64.b64encode(image_path.read_bytes()).decode("ascii")
print(json.dumps(card, ensure_ascii=False))
PY
}

case "${1-}" in
  state-root)
    ensure_config_root
    printf '%s\n' "$config_root"
    ;;
  project-root)
    ensure_projects_root
    printf '%s\n' "$projects_root"
    ;;
  load-card)
    [ -f "$card_file" ] && cat "$card_file"
    ;;
  save-card)
    save_card "${2-}"
    ;;
  list-projects)
    list_projects
    ;;
  load-project)
    load_project "${2-}"
    ;;
  save-project)
    save_project "${2-}" "${3-}"
    ;;
  get-ui-prefs)
    print_prefs
    ;;
  set-ui-pref)
    set_pref "${2-}" "${3-}"
    ;;
  *)
    printf '%s\n' "pieplate-backend: unknown command: ${1-}" >&2
    exit 2
    ;;
esac
