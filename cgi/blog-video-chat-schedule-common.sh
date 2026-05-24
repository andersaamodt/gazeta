#!/bin/sh
# Shared schedule helpers for admin-managed video chat rooms.

blog_video_chat_schedule_now_epoch() {
  case "${VIDEO_CHAT_SCHEDULE_NOW-}" in
    ''|*[!0-9]*) blog_now_epoch ;;
    *) printf '%s\n' "$VIDEO_CHAT_SCHEDULE_NOW" ;;
  esac
}

blog_video_chat_schedule_python() {
  mode=$1
  manual_rooms=${2-}
  scheduled_rooms=${3-}
  now_epoch=${4-}
  wanted_room=${5-}
  [ -n "$now_epoch" ] || now_epoch=$(blog_video_chat_schedule_now_epoch)
  if ! command -v python3 >/dev/null 2>&1; then
    case "$mode" in
      rooms_json|manual_rooms_json) printf '[]\n' ;;
      room_theme_images_json) printf '{}\n' ;;
      lookup_json) printf '{"active":false}\n' ;;
      sanitize|sanitize_manual) printf '\n' ;;
    esac
    return 0
  fi
  BLOG_VIDEO_CHAT_SCHEDULE_MODE=$mode \
  BLOG_VIDEO_CHAT_MANUAL_ROOMS=$manual_rooms \
  BLOG_VIDEO_CHAT_SCHEDULED_ROOMS=$scheduled_rooms \
  BLOG_VIDEO_CHAT_NOW_EPOCH=$now_epoch \
  BLOG_VIDEO_CHAT_WANTED_ROOM=$wanted_room \
  python3 <<'PY'
import calendar
import datetime as dt
import json
import os
import re

MODE = os.environ.get("BLOG_VIDEO_CHAT_SCHEDULE_MODE", "")
MANUAL_RAW = os.environ.get("BLOG_VIDEO_CHAT_MANUAL_ROOMS", "")
SCHEDULE_RAW = os.environ.get("BLOG_VIDEO_CHAT_SCHEDULED_ROOMS", "")
WANTED = os.environ.get("BLOG_VIDEO_CHAT_WANTED_ROOM", "")

try:
    NOW = dt.datetime.fromtimestamp(int(os.environ.get("BLOG_VIDEO_CHAT_NOW_EPOCH", "0") or "0"))
except Exception:
    NOW = dt.datetime.now()

WEEKDAY_ALIASES = {
    "mon": 0, "monday": 0,
    "tue": 1, "tues": 1, "tuesday": 1,
    "wed": 2, "wednesday": 2,
    "thu": 3, "thur": 3, "thurs": 3, "thursday": 3,
    "fri": 4, "friday": 4,
    "sat": 5, "saturday": 5,
    "sun": 6, "sunday": 6,
}

def compact(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()

def slugify(value):
    text = compact(value).lower()
    text = re.sub(r"[^a-z0-9_-]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text

def split_records(raw):
    text = str(raw or "").replace("\r", "\n")
    out = []
    for chunk in re.split(r"[\n;]+", text):
        item = chunk.strip()
        if item:
            out.append(item)
    return out

def clean_image_url(value):
    text = str(value or "").strip()
    if not text or re.search(r"[\x00-\x20]", text):
        return ""
    lowered = text.lower()
    if lowered.startswith("http://") or lowered.startswith("https://"):
        return text[:500]
    if text.startswith("/") and not text.startswith("//"):
        return text[:500]
    return ""

def parse_manual_rooms(raw):
    out = []
    seen = set()
    for record in split_records(raw):
        records = [record] if "|" in record else [part for part in record.split(",")]
        for item in records:
            parts = [compact(part) for part in item.split("|")]
            name = parts[0] if parts else ""
            room_id = slugify(name)
            if not name or not room_id or room_id in seen:
                continue
            seen.add(room_id)
            out.append({
                "name": name,
                "room_id": room_id,
                "password": "",
                "private_room": False,
                "participant_limit": 0,
                "image_url": clean_image_url(parts[1] if len(parts) > 1 else ""),
                "source": "manual",
            })
            if len(out) >= 12:
                break
        if len(out) >= 12:
            break
    return out

def parse_time_minutes(value):
    text = compact(value)
    match = re.match(r"^([0-2]?\d):([0-5]\d)$", text)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour > 23:
        return None
    return hour * 60 + minute

def clamp_int(value, fallback, lo, hi):
    try:
        parsed = int(str(value).strip())
    except Exception:
        parsed = fallback
    return max(lo, min(hi, parsed))

def parse_weekdays(raw):
    days = set()
    for part in re.split(r"[, ]+", compact(raw).lower()):
        if not part:
            continue
        if part in WEEKDAY_ALIASES:
            days.add(WEEKDAY_ALIASES[part])
    return days

def recurrence_matches(date_value, recurrence):
    rec = compact(recurrence).lower()
    if not rec or rec in ("daily", "day", "everyday", "always"):
        return True
    if rec in ("weekday", "weekdays"):
        return date_value.weekday() < 5
    if rec in ("weekend", "weekends"):
        return date_value.weekday() >= 5
    if rec.startswith("weekly"):
        raw = rec.split(":", 1)[1] if ":" in rec else rec.split("=", 1)[1] if "=" in rec else ""
        days = parse_weekdays(raw)
        return date_value.weekday() in days if days else True
    if rec.startswith("monthly"):
        raw = rec.split(":", 1)[1] if ":" in rec else rec.split("=", 1)[1] if "=" in rec else ""
        wanted = {item.strip().lower() for item in raw.split(",") if item.strip()}
        if not wanted:
            return True
        last_day = calendar.monthrange(date_value.year, date_value.month)[1]
        values = {str(date_value.day)}
        if date_value.day == last_day:
            values.add("last")
        return bool(values & wanted)
    if rec.startswith("yearly") or rec.startswith("annual"):
        raw = rec.split(":", 1)[1] if ":" in rec else rec.split("=", 1)[1] if "=" in rec else ""
        wanted = {item.strip() for item in raw.split(",") if item.strip()}
        current = f"{date_value.month:02d}-{date_value.day:02d}"
        return current in wanted if wanted else True
    if rec.startswith("once"):
        raw = rec.split(":", 1)[1] if ":" in rec else rec.split("=", 1)[1] if "=" in rec else ""
        return raw == date_value.isoformat()
    return False

def is_active_schedule(entry, now):
    start = entry["start_minute"]
    duration = entry["duration_minutes"]
    current_minutes = now.hour * 60 + now.minute
    today = now.date()
    yesterday = today - dt.timedelta(days=1)
    if recurrence_matches(today, entry["recurrence"]) and start <= current_minutes < start + duration:
        return True
    if duration > (1440 - start) and recurrence_matches(yesterday, entry["recurrence"]):
        return start <= current_minutes + 1440 < start + duration
    return False

def parse_schedules(raw, active_only=False):
    out = []
    seen = set()
    for record in split_records(raw):
        parts = [compact(part) for part in record.split("|")]
        while len(parts) < 7:
            parts.append("")
        name, recurrence, start_text, duration_text, password, limit_text, image_text = parts[:7]
        room_id = slugify(name)
        start_minute = parse_time_minutes(start_text)
        if not name or not room_id or start_minute is None:
            continue
        duration = clamp_int(duration_text, 60, 1, 10080)
        limit = clamp_int(limit_text, 0, 0, 24)
        if limit == 1:
            limit = 2
        entry = {
            "name": name,
            "room_id": room_id,
            "recurrence": compact(recurrence).lower() or "daily",
            "start_time": f"{start_minute // 60:02d}:{start_minute % 60:02d}",
            "start_minute": start_minute,
            "duration_minutes": duration,
            "password": str(password or "").strip(),
            "private_room": bool(str(password or "").strip()),
            "participant_limit": limit,
            "image_url": clean_image_url(image_text),
            "source": "scheduled",
        }
        if active_only and not is_active_schedule(entry, NOW):
            continue
        if room_id in seen:
            continue
        seen.add(room_id)
        out.append(entry)
        if len(out) >= 24:
            break
    return out

def public_entries():
    entries = parse_manual_rooms(MANUAL_RAW)
    by_id = {entry["room_id"]: entry for entry in entries}
    for entry in parse_schedules(SCHEDULE_RAW, active_only=True):
        if entry["room_id"] in by_id:
            by_id[entry["room_id"]].update({
                "password": entry["password"],
                "private_room": entry["private_room"],
                "participant_limit": entry["participant_limit"],
                "image_url": entry["image_url"] or by_id[entry["room_id"]].get("image_url", ""),
                "source": "scheduled",
            })
        else:
            entries.append(entry)
            by_id[entry["room_id"]] = entry
    return entries[:24]

if MODE == "manual_rooms_json":
    print(json.dumps([entry["name"] for entry in parse_manual_rooms(MANUAL_RAW)], separators=(",", ":")))
elif MODE == "rooms_json":
    print(json.dumps([entry["name"] for entry in public_entries()], separators=(",", ":")))
elif MODE == "room_theme_images_json":
    themes = {entry["room_id"]: entry["image_url"] for entry in public_entries() if entry.get("image_url")}
    print(json.dumps(themes, separators=(",", ":")))
elif MODE == "lookup_json":
    wanted = slugify(WANTED)
    found = next((entry for entry in public_entries() if entry["room_id"] == wanted), None)
    if found:
        print(json.dumps({
            "active": True,
            "name": found["name"],
            "room_id": found["room_id"],
            "password": found["password"],
            "private_room": found["private_room"],
            "participant_limit": found["participant_limit"],
            "image_url": found["image_url"],
            "source": found["source"],
        }, separators=(",", ":")))
    else:
        print('{"active":false}')
elif MODE == "sanitize":
    cleaned = []
    seen = set()
    for entry in parse_schedules(SCHEDULE_RAW, active_only=False):
        if entry["room_id"] in seen:
            continue
        seen.add(entry["room_id"])
        cleaned.append("|".join([
            entry["name"],
            entry["recurrence"],
            entry["start_time"],
            str(entry["duration_minutes"]),
            entry["password"],
            str(entry["participant_limit"] or ""),
            entry["image_url"],
        ]))
    print(";".join(cleaned[:24]))
elif MODE == "sanitize_manual":
    cleaned = []
    seen = set()
    for entry in parse_manual_rooms(MANUAL_RAW):
        if entry["room_id"] in seen:
            continue
        seen.add(entry["room_id"])
        record = entry["name"]
        if entry["image_url"]:
            record = record + "|" + entry["image_url"]
        cleaned.append(record)
    print(";".join(cleaned[:12]))
else:
    print("[]")
PY
}

blog_video_chat_manual_rooms_json() {
  blog_video_chat_schedule_python manual_rooms_json "${1-}" '' "${2-}" ''
}

blog_video_chat_public_rooms_json() {
  blog_video_chat_schedule_python rooms_json "${1-}" "${2-}" "${3-}" ''
}

blog_video_chat_room_theme_images_json() {
  blog_video_chat_schedule_python room_theme_images_json "${1-}" "${2-}" "${3-}" ''
}

blog_video_chat_public_room_lookup_json() {
  blog_video_chat_schedule_python lookup_json "${1-}" "${2-}" "${3-}" "${4-}"
}

blog_video_chat_sanitize_manual_rooms() {
  blog_video_chat_schedule_python sanitize_manual "${1-}" '' "$(blog_video_chat_schedule_now_epoch)" ''
}

blog_video_chat_sanitize_scheduled_rooms() {
  blog_video_chat_schedule_python sanitize '' "${1-}" "$(blog_video_chat_schedule_now_epoch)" ''
}
