#!/usr/bin/env python3
"""File-backed private Desk world for gazeta."""

from __future__ import annotations

import contextlib
import datetime as _dt
import errno
import fcntl
import json
import os
import random
import re
import shutil
import sys
import tempfile
import time
import unicodedata
from pathlib import Path


META_KEYS = (
    "upvotes",
    "last_vote_at",
    "soonness",
    "created_at",
    "updated_at",
    "completed_at",
)


class DeskError(Exception):
    def __init__(self, code: str, message: str, **extra: object) -> None:
      super().__init__(message)
      self.code = code
      self.message = message
      self.extra = extra


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def now_epoch() -> int:
    return int(time.time())


def iso_now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def json_out(payload: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")


def parse_int(value: object, default: int = 0) -> int:
    try:
        if value is None:
            return default
        text = str(value).strip()
        if not text:
            return default
        return int(text)
    except (TypeError, ValueError):
        return default


def parse_soonness_epoch(value: str) -> int:
    text = str(value or "").strip()
    if not text:
        return 0
    if re.fullmatch(r"[0-9]+", text):
        return int(text)
    candidates = [text]
    if re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", text):
        candidates.append(text + "T00:00:00Z")
    for candidate in candidates:
        normalized = candidate.replace("Z", "+00:00")
        try:
            parsed = _dt.datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=_dt.timezone.utc)
            return int(parsed.timestamp())
        except ValueError:
            continue
    return 0


def humanize_slug(slug: str) -> str:
    text = slug.replace("-", " ").replace("_", " ").strip()
    return text.title() if text else "Room"


def slugify(title: str) -> str:
    normalized = unicodedata.normalize("NFKD", title or "").encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^A-Za-z0-9]+", "-", normalized.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return (slug or "room")[:72].strip("-") or "room"


ROOM_COLOR_PALETTE = (
    "#b85c6a",
    "#4f8fbd",
    "#d59a3a",
    "#6f77c8",
    "#3f9b73",
    "#b06ab3",
    "#c66f3d",
    "#5276ad",
    "#8a9b3f",
    "#b24b45",
)


def default_room_color(rel: str | None) -> str:
    text = str(rel or "office")
    total = 0
    for index, char in enumerate(text):
        total += (index + 7) * ord(char)
    return ROOM_COLOR_PALETTE[total % len(ROOM_COLOR_PALETTE)]


def normalize_room_color(value: str | None, fallback: str) -> str:
    text = str(value or "").strip()
    if re.fullmatch(r"#[0-9A-Fa-f]{6}", text):
        return text.lower()
    return fallback


def normalize_room_kind(value: object) -> str:
    text = str(value or "").strip().lower()
    return "outdoor" if text == "outdoor" else "indoor"


def normalize_room_topology(value: object) -> str:
    text = str(value or "").strip().lower()
    return "contained" if text == "contained" else "connected"


def safe_task_slug(text: str) -> str:
    first = (text or "").splitlines()[0].strip()
    return slugify(first)[:48] or "task"


def atomic_write_text(path: Path, text: str, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_path, mode)
        os.replace(tmp_path, path)
    except Exception:
        with contextlib.suppress(FileNotFoundError):
            tmp_path.unlink()
        raise


def atomic_write_json(path: Path, payload: dict[str, object], mode: int = 0o600) -> None:
    atomic_write_text(path, json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", mode)


class DeskStore:
    def __init__(self) -> None:
        root_raw = env("BLOG_DESK_ROOT")
        if not root_raw:
            raise DeskError("config_missing", "Desk root is not configured.")
        self.root = Path(root_raw).expanduser().resolve()
        self.state_dir = Path(env("BLOG_DESK_STATE_DIR", str(self.root.parent / ".state"))).expanduser().resolve()
        self.owner = env("BLOG_DESK_OWNER")
        self.owner_pubkey = env("BLOG_DESK_OWNER_PUBKEY")
        self.overworld_base = env("BLOG_DESK_OVERWORLD_BASE", "/overworld")
        self.revote_seconds = parse_int(env("BLOG_DESK_REVOTE_SECONDS"), 18 * 60 * 60)
        if self.revote_seconds < 60:
            self.revote_seconds = 18 * 60 * 60

    @contextlib.contextmanager
    def locked(self):
        self.state_dir.mkdir(parents=True, exist_ok=True)
        lock_path = self.state_dir / "desk.lock"
        with lock_path.open("a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    def setup(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        with contextlib.suppress(OSError):
            os.chmod(self.root, 0o700)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.ensure_room("", "Office")

    def append_log(self, action: str, payload: dict[str, object]) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        record = {
            "at": iso_now(),
            "actor": self.owner,
            "actor_pubkey": self.owner_pubkey,
            "action": action,
            "payload": payload,
        }
        log_path = self.state_dir / "mutation.log"
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())

    def normalize_room_rel(self, rel: str | None) -> str:
        raw = str(rel or "").strip().strip("/")
        if raw in ("", "office", "."):
            return ""
        raw = raw.replace("\\", "/")
        parts: list[str] = []
        for part in raw.split("/"):
            clean = part.strip()
            if not clean:
                continue
            if clean in (".", "..") or clean.startswith("."):
                raise DeskError("bad_room", "Room path is not valid.")
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,95}", clean):
                raise DeskError("bad_room", "Room path is not filesystem-safe.")
            parts.append(clean)
        if not parts:
            return ""
        return "/".join(parts)

    def room_dir(self, rel: str | None) -> Path:
        normalized = self.normalize_room_rel(rel)
        path = (self.root / normalized).resolve() if normalized else self.root
        try:
            if os.path.commonpath([str(self.root), str(path)]) != str(self.root):
                raise DeskError("bad_room", "Room path escapes the Desk root.")
        except ValueError as exc:
            raise DeskError("bad_room", "Room path escapes the Desk root.") from exc
        return path

    def room_rel_for_path(self, path: Path) -> str:
        path = path.resolve()
        if path == self.root:
            return ""
        return path.relative_to(self.root).as_posix()

    def task_name(self, task_id: str) -> str:
        name = str(task_id or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,140}\.txt", name):
            raise DeskError("bad_task", "Task id is not valid.")
        if "/" in name or "\\" in name or name.startswith("."):
            raise DeskError("bad_task", "Task id is not valid.")
        return name

    def legacy_open_tasks_dir(self, room_rel: str | None) -> Path:
        return self.room_dir(room_rel) / ".tasks"

    def tasks_dir(self, room_rel: str | None, status: str = "open") -> Path:
        if status == "open":
            return self.room_dir(room_rel)
        base = self.legacy_open_tasks_dir(room_rel)
        if status == "done":
            return base / "done"
        if status == "trash":
            return base / "trash"
        if status == "forgotten":
            return base / "forgotten"
        return base

    def task_path(self, room_rel: str | None, task_id: str, status: str = "open") -> Path:
        name = self.task_name(task_id)
        path = self.tasks_dir(room_rel, status) / name
        if status == "open" and not path.is_file():
            legacy_path = self.legacy_open_tasks_dir(room_rel) / name
            if legacy_path.is_file():
                return legacy_path
        return path

    def migrate_legacy_open_tasks(self, room_rel: str | None) -> None:
        room = self.room_dir(room_rel)
        legacy = self.legacy_open_tasks_dir(room_rel)
        if not legacy.is_dir():
            return
        for old_path in sorted(legacy.iterdir(), key=lambda path: path.name.lower()):
            if not old_path.is_file() or old_path.name.startswith(".") or old_path.suffix != ".txt":
                continue
            target_path = room / old_path.name
            if target_path.exists():
                stem = old_path.stem
                suffix = old_path.suffix
                for index in range(2, 1000):
                    candidate = room / f"{stem}-{index}{suffix}"
                    if not candidate.exists():
                        target_path = candidate
                        break
            metadata = self.metadata(old_path)
            os.rename(old_path, target_path)
            self.move_sidecar(old_path, target_path)
            if metadata:
                self.set_metadata(target_path, metadata)

    def meta_path(self, task_path: Path) -> Path:
        return task_path.parent / ".meta" / f"{task_path.name}.json"

    def read_sidecar_meta(self, task_path: Path) -> dict[str, object]:
        sidecar = self.meta_path(task_path)
        if not sidecar.is_file():
            return {}
        try:
            data = json.loads(sidecar.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def read_xattr(self, task_path: Path, key: str) -> str | None:
        try:
            value = os.getxattr(task_path, f"user.{key}")
            return value.decode("utf-8", "replace")
        except (AttributeError, OSError):
            return None

    def write_xattr(self, task_path: Path, key: str, value: object) -> bool:
        try:
            os.setxattr(task_path, f"user.{key}", str(value).encode("utf-8"))
            return True
        except (AttributeError, OSError):
            return False

    def metadata(self, task_path: Path) -> dict[str, object]:
        meta = self.read_sidecar_meta(task_path)
        for key in META_KEYS:
            value = self.read_xattr(task_path, key)
            if value is not None:
                meta[key] = value
        meta["upvotes"] = parse_int(meta.get("upvotes"), 0)
        meta["last_vote_at"] = parse_int(meta.get("last_vote_at"), 0)
        return meta

    def set_metadata(self, task_path: Path, updates: dict[str, object]) -> dict[str, object]:
        meta = self.metadata(task_path)
        meta.update({key: value for key, value in updates.items() if key in META_KEYS})
        xattrs_ok = True
        for key, value in meta.items():
            if key in META_KEYS and not self.write_xattr(task_path, key, value):
                xattrs_ok = False
        if not xattrs_ok:
            atomic_write_json(self.meta_path(task_path), meta)
        return meta

    def ensure_room(self, rel: str | None, title: str | None = None) -> str:
        room_rel = self.normalize_room_rel(rel)
        room = self.room_dir(room_rel)
        room.mkdir(parents=True, exist_ok=True)
        with contextlib.suppress(OSError):
            os.chmod(room, 0o700)
        meta_path = room / ".room.json"
        if not meta_path.exists():
            room_title = title or ("Office" if room_rel == "" else humanize_slug(Path(room_rel).name))
            atomic_write_json(meta_path, {
                "title": room_title,
                "visibility": "private",
                "color": default_room_color(room_rel),
                "kind": "indoor",
                "created_at": iso_now(),
            })
        (room / ".tasks").mkdir(exist_ok=True)
        with contextlib.suppress(OSError):
            os.chmod(room / ".tasks", 0o700)
        return room_rel

    def room_metadata(self, rel: str | None) -> dict[str, object]:
        room_rel = self.normalize_room_rel(rel)
        meta_path = self.room_dir(room_rel) / ".room.json"
        if meta_path.is_file():
            try:
                data = json.loads(meta_path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    data["title"] = str(data.get("title") or "").strip()
                    data["color"] = normalize_room_color(str(data.get("color") or ""), default_room_color(room_rel))
                    data["kind"] = normalize_room_kind(data.get("kind"))
                    data["topology"] = normalize_room_topology(data.get("topology"))
                    return data
            except (OSError, json.JSONDecodeError):
                pass
        return {
            "title": "Office" if room_rel == "" else humanize_slug(Path(room_rel).name),
            "visibility": "private",
            "color": default_room_color(room_rel),
            "kind": "indoor",
            "topology": "connected",
        }

    def update_room_metadata(self, rel: str | None, updates: dict[str, object]) -> dict[str, object]:
        room_rel = self.ensure_room(rel)
        room = self.room_dir(room_rel)
        meta_path = room / ".room.json"
        data = self.room_metadata(room_rel)
        data.update(updates)
        data["title"] = str(data.get("title") or self.room_title(room_rel)).strip()
        data["visibility"] = str(data.get("visibility") or "private")
        data["color"] = normalize_room_color(str(data.get("color") or ""), default_room_color(room_rel))
        data["kind"] = normalize_room_kind(data.get("kind"))
        data["topology"] = normalize_room_topology(data.get("topology"))
        if not str(data.get("created_at") or "").strip():
            data["created_at"] = iso_now()
        data["updated_at"] = iso_now()
        atomic_write_json(meta_path, data)
        return data

    def room_title(self, rel: str | None) -> str:
        room_rel = self.normalize_room_rel(rel)
        data = self.room_metadata(room_rel)
        title = str(data.get("title") or "").strip()
        if title:
            return title
        return "Office" if room_rel == "" else humanize_slug(Path(room_rel).name)

    def room_color(self, rel: str | None) -> str:
        room_rel = self.normalize_room_rel(rel)
        data = self.room_metadata(room_rel)
        return normalize_room_color(str(data.get("color") or ""), default_room_color(room_rel))

    def room_kind(self, rel: str | None) -> str:
        room_rel = self.normalize_room_rel(rel)
        data = self.room_metadata(room_rel)
        return normalize_room_kind(data.get("kind"))

    def room_topology(self, rel: str | None) -> str:
        room_rel = self.normalize_room_rel(rel)
        data = self.room_metadata(room_rel)
        return normalize_room_topology(data.get("topology"))

    def room_delete_status(self, rel: str | None) -> dict[str, object]:
        room_rel = self.normalize_room_rel(rel)
        if not room_rel:
            return {"can_delete": False, "reason": "Office cannot be deleted."}
        room = self.room_dir(room_rel)
        if not room.is_dir():
            return {"can_delete": False, "reason": "Room does not exist."}
        allowed_system_dirs = {".tasks", ".docs", ".passages", ".meta"}
        for child in room.iterdir():
            if child.name == ".room.json":
                continue
            if child.name in allowed_system_dirs and child.is_dir():
                if self.system_room_dir_has_user_files(child):
                    return {"can_delete": False, "reason": "Room is not empty."}
                continue
            return {"can_delete": False, "reason": "Room is not empty."}
        return {"can_delete": True, "reason": ""}

    def system_room_dir_has_user_files(self, directory: Path) -> bool:
        for path in directory.rglob("*"):
            if not path.is_file():
                continue
            if directory.name == ".tasks" and path.suffix == ".txt" and ".meta" not in path.parts:
                return True
            if directory.name == ".docs" and path.suffix == ".md" and not path.name.startswith("."):
                return True
            if directory.name == ".passages" and path.suffix == ".json" and not path.name.startswith("."):
                return True
            if directory.name not in (".tasks", ".docs", ".passages", ".meta") and not path.name.startswith("."):
                return True
        return False

    def all_room_rels(self) -> list[str]:
        self.setup()
        rooms = [""]
        for dirpath, dirnames, _filenames in os.walk(self.root):
            dirnames[:] = [
                name for name in dirnames
                if name not in (".tasks", ".passages") and not name.startswith(".")
            ]
            path = Path(dirpath)
            if path == self.root:
                continue
            rooms.append(self.room_rel_for_path(path))
        return sorted(set(rooms), key=lambda rel: (rel.count("/"), self.room_title(rel).lower(), rel))

    def passage_dir(self, room_rel: str | None) -> Path:
        return self.room_dir(room_rel) / ".passages"

    def passage_file_name(self, left: str, right: str) -> str:
        left_name = slugify(left or "office")
        right_name = slugify(right or "office")
        return f"{left_name}--{right_name}.json"

    def passage_payload(self, left: str, right: str) -> dict[str, object]:
        rooms = sorted([self.normalize_room_rel(left), self.normalize_room_rel(right)])
        return {
            "type": "secret-passage",
            "rooms": rooms,
            "created_at": iso_now(),
        }

    def write_secret_passage_files(self, left: str, right: str, payload: dict[str, object], extra_remove: list[Path] | None = None) -> tuple[Path, Path]:
        ordered = sorted([self.normalize_room_rel(left), self.normalize_room_rel(right)])
        file_name = self.passage_file_name(ordered[0], ordered[1])
        left_dir = self.passage_dir(ordered[0])
        right_dir = self.passage_dir(ordered[1])
        left_dir.mkdir(exist_ok=True)
        right_dir.mkdir(exist_ok=True)
        with contextlib.suppress(OSError):
            os.chmod(left_dir, 0o700)
        with contextlib.suppress(OSError):
            os.chmod(right_dir, 0o700)
        left_path = left_dir / file_name
        right_path = right_dir / file_name
        for path in list(extra_remove or []) + [left_path, right_path]:
            with contextlib.suppress(FileNotFoundError):
                path.unlink()
        atomic_write_json(left_path, payload)
        os.link(left_path, right_path)
        return left_path, right_path

    def passage_files(self) -> list[Path]:
        files: list[Path] = []
        for rel in self.all_room_rels():
            directory = self.passage_dir(rel)
            if directory.is_dir():
                files.extend(sorted(path for path in directory.iterdir() if path.is_file() and path.name.endswith(".json")))
        return files

    def read_passage_file(self, path: Path) -> dict[str, object] | None:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(data, dict) or data.get("type") != "secret-passage":
            return None
        rooms = data.get("rooms")
        if not isinstance(rooms, list) or len(rooms) != 2:
            return None
        try:
            left = self.normalize_room_rel(str(rooms[0]))
            right = self.normalize_room_rel(str(rooms[1]))
        except DeskError:
            return None
        if left == right:
            return None
        data["rooms"] = sorted([left, right])
        return data

    def all_secret_passages(self) -> list[dict[str, object]]:
        passages: dict[tuple[str, str], dict[str, object]] = {}
        for path in self.passage_files():
            data = self.read_passage_file(path)
            if not data:
                continue
            left, right = [str(value) for value in data["rooms"]]
            if not self.room_dir(left).is_dir() or not self.room_dir(right).is_dir():
                continue
            key = tuple(sorted([left, right]))
            passages[key] = {
                "from": key[0],
                "to": key[1],
                "from_title": self.room_title(key[0]),
                "to_title": self.room_title(key[1]),
            }
        return [passages[key] for key in sorted(passages)]

    def room_secret_passages(self, rel: str | None) -> list[dict[str, object]]:
        room = self.normalize_room_rel(rel)
        results: list[dict[str, object]] = []
        for passage in self.all_secret_passages():
            left = str(passage["from"])
            right = str(passage["to"])
            if room not in (left, right):
                continue
            target = right if room == left else left
            results.append({
                "room": target,
                "title": self.room_title(target),
                "url": self.room_url(target),
            })
        return results

    def task_files(self, room_rel: str | None, status: str = "open") -> list[Path]:
        if status == "open":
            self.migrate_legacy_open_tasks(room_rel)
        directory = self.tasks_dir(room_rel, status)
        paths = []
        if directory.is_dir():
            paths.extend([
                path for path in directory.iterdir()
                if path.is_file() and path.name.endswith(".txt") and not path.name.startswith(".")
            ])
        if status == "open":
            legacy = self.legacy_open_tasks_dir(room_rel)
            if legacy.is_dir():
                existing = {path.name for path in paths}
                paths.extend([
                    path for path in legacy.iterdir()
                    if path.is_file() and path.name.endswith(".txt") and not path.name.startswith(".") and path.name not in existing
                ])
        return sorted(
            paths,
            key=lambda path: (0 if path.parent == directory else 1, path.name.lower()),
        )

    def read_task(self, room_rel: str | None, task_path: Path, status: str = "open") -> dict[str, object]:
        try:
            content = task_path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            raise DeskError("unreadable_task", f"Task file is unreadable: {task_path.name}") from exc
        lines = content.splitlines()
        title = lines[0].strip() if lines else task_path.stem
        body = "\n".join(lines[1:]).strip()
        meta = self.metadata(task_path)
        last_vote_at = parse_int(meta.get("last_vote_at"), 0)
        next_vote_at = last_vote_at + self.revote_seconds if last_vote_at else 0
        now = now_epoch()
        soonness = str(meta.get("soonness") or "").strip()
        return {
            "id": task_path.name,
            "room": self.normalize_room_rel(room_rel),
            "status": status,
            "title": title,
            "body": body,
            "text": content,
            "upvotes": parse_int(meta.get("upvotes"), 0),
            "last_vote_at": last_vote_at,
            "next_vote_at": next_vote_at,
            "can_vote_now": not next_vote_at or now >= next_vote_at,
            "soonness": soonness,
            "soonness_epoch": parse_soonness_epoch(soonness),
            "created_at": str(meta.get("created_at") or ""),
            "updated_at": str(meta.get("updated_at") or ""),
            "completed_at": str(meta.get("completed_at") or ""),
        }

    def sorted_tasks(self, room_rel: str | None, status: str = "open") -> list[dict[str, object]]:
        tasks = [self.read_task(room_rel, path, status) for path in self.task_files(room_rel, status)]
        def key(task: dict[str, object]) -> tuple[int, int, str]:
            soon = parse_int(task.get("soonness_epoch"), 0)
            soon_sort = soon if soon else 9_999_999_999
            return (-parse_int(task.get("upvotes"), 0), soon_sort, str(task.get("title") or "").lower())
        return sorted(tasks, key=key)

    def task_is_visible(self, task: dict[str, object], threshold: int) -> bool:
        if parse_int(task.get("upvotes"), 0) >= threshold:
            return True
        soon = parse_int(task.get("soonness_epoch"), 0)
        return bool(soon and soon <= now_epoch() + 7 * 24 * 60 * 60)

    def room_heat(self, tasks: list[dict[str, object]], threshold: int) -> int:
        heat = 0
        current = now_epoch()
        for task in tasks:
            upvotes = parse_int(task.get("upvotes"), 0)
            heat += max(0, upvotes)
            if self.task_is_visible(task, threshold):
                heat += 2
            soon = parse_int(task.get("soonness_epoch"), 0)
            if soon:
                if soon <= current + 24 * 60 * 60:
                    heat += 3
                elif soon <= current + 7 * 24 * 60 * 60:
                    heat += 1
        return heat

    def room_summary(self, rel: str | None, threshold: int) -> dict[str, object]:
        room_rel = self.normalize_room_rel(rel)
        tasks = self.sorted_tasks(room_rel)
        visible = [task for task in tasks if self.task_is_visible(task, threshold)]
        public_file = self.room_dir(room_rel) / "public.md"
        depth = 0 if not room_rel else room_rel.count("/") + 1
        parent_path = "" if not room_rel or "/" not in room_rel else room_rel.rsplit("/", 1)[0]
        return {
            "path": room_rel,
            "title": self.room_title(room_rel),
            "parent_path": parent_path,
            "depth": depth,
            "color": self.room_color(room_rel),
            "kind": self.room_kind(room_rel),
            "topology": self.room_topology(room_rel),
            "url": self.room_url(room_rel),
            "overworld_url": self.overworld_url(room_rel),
            "task_count": len(tasks),
            "visible_task_count": len(visible),
            "sleeping_task_count": max(0, len(tasks) - len(visible)),
            "heat": self.room_heat(tasks, threshold),
            "surfaced_tasks": visible[:3],
            "has_public_file": public_file.is_file(),
            "public_file_name": "public.md" if public_file.is_file() else "",
            "secret_passages": self.room_secret_passages(room_rel),
            "can_delete_room": bool(self.room_delete_status(room_rel).get("can_delete")),
            "delete_room_disabled_reason": str(self.room_delete_status(room_rel).get("reason") or ""),
        }

    def room_url(self, rel: str | None) -> str:
        room_rel = self.normalize_room_rel(rel)
        if not room_rel:
            return self.room_url_base()
        from urllib.parse import quote
        base = self.room_url_base().rstrip("/")
        return (base + "/" if base else "/") + quote(room_rel, safe="")

    def room_url_base(self) -> str:
        host = os.environ.get("HTTP_HOST", "").split(":", 1)[0].lower()
        if host.startswith("desk."):
            return "/"
        return "/desk"

    def overworld_url(self, rel: str | None) -> str:
        from urllib.parse import quote
        room_rel = self.normalize_room_rel(rel)
        value = "office" if not room_rel else room_rel
        sep = "&" if "?" in self.overworld_base else "?"
        return f"{self.overworld_base}{sep}desk_room={quote(value, safe='')}"

    def status(self) -> dict[str, object]:
        path = self.state_dir / "status.json"
        if path.is_file():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    current = str(data.get("online_status") or "quiet")
                    if current in ("available", "quiet", "offline"):
                        return data
            except (OSError, json.JSONDecodeError):
                pass
        return {"online_status": "quiet", "updated_at": ""}

    def state(self, room_rel: str | None = "", threshold: int = 1) -> dict[str, object]:
        self.setup()
        current_rel = self.normalize_room_rel(room_rel or "")
        if current_rel:
            room_path = self.room_dir(current_rel)
            if not room_path.is_dir():
                raise DeskError("missing_room", "That Desk room does not exist.")
            self.ensure_room(current_rel, self.room_title(current_rel))
        else:
            self.ensure_room("", "Office")
        rooms = [self.room_summary(rel, threshold) for rel in self.all_room_rels() if rel]
        rooms.sort(key=lambda room: (-parse_int(room.get("heat"), 0), str(room.get("title") or "").lower()))
        current_summary = self.room_summary(current_rel, threshold)
        payload: dict[str, object] = {
            "success": True,
            "owner": self.owner,
            "owner_pubkey": self.owner_pubkey,
            "revote_window_seconds": self.revote_seconds,
            "visibility_threshold": threshold,
            "status": self.status(),
            "office": self.room_summary("", threshold),
            "rooms": rooms,
            "secret_passages": self.all_secret_passages(),
            "current_room": current_summary,
        }
        if current_rel:
            payload["tasks"] = self.sorted_tasks(current_rel)
            payload["done_tasks"] = self.sorted_tasks(current_rel, "done")
        else:
            payload["tasks"] = []
            payload["done_tasks"] = []
        return payload

    def unique_room_rel(self, parent_rel: str, title: str) -> str:
        parent = self.normalize_room_rel(parent_rel)
        base = slugify(title)
        candidate = f"{parent}/{base}" if parent else base
        if not self.room_dir(candidate).exists():
            return candidate
        for index in range(2, 1000):
            next_candidate = f"{candidate}-{index}"
            if not self.room_dir(next_candidate).exists():
                return next_candidate
        raise DeskError("room_exists", "Could not choose a unique room slug.")

    def create_room(self, parent_rel: str, title: str, threshold: int, topology: str = "connected") -> dict[str, object]:
        clean_title = str(title or "").strip()
        if not clean_title:
            raise DeskError("missing_title", "Room title is required.")
        room_rel = self.unique_room_rel(parent_rel, clean_title)
        self.ensure_room(room_rel, clean_title)
        clean_topology = normalize_room_topology(topology)
        self.update_room_metadata(room_rel, {"topology": clean_topology})
        self.append_log("create-room", {"room": room_rel, "title": clean_title, "topology": clean_topology})
        payload = self.state(room_rel, threshold)
        payload["created_room"] = self.room_summary(room_rel, threshold)
        return payload

    def set_room_color(self, room_rel: str, color: str, threshold: int) -> dict[str, object]:
        room = self.normalize_room_rel(room_rel)
        if room and not self.room_dir(room).is_dir():
            raise DeskError("missing_room", "That Desk room does not exist.")
        clean = normalize_room_color(color, "")
        if not clean:
            raise DeskError("bad_room_color", "Room color must be a six-digit hex color.")
        self.update_room_metadata(room, {"color": clean})
        self.append_log("set-room-color", {"room": room, "color": clean})
        payload = self.state(room, threshold)
        payload["updated_room"] = self.room_summary(room, threshold)
        return payload

    def set_room_kind(self, room_rel: str, kind: str, threshold: int) -> dict[str, object]:
        room = self.normalize_room_rel(room_rel)
        if room and not self.room_dir(room).is_dir():
            raise DeskError("missing_room", "That Desk room does not exist.")
        clean = normalize_room_kind(kind)
        self.update_room_metadata(room, {"kind": clean})
        self.append_log("set-room-kind", {"room": room, "kind": clean})
        payload = self.state(room, threshold)
        payload["updated_room"] = self.room_summary(room, threshold)
        return payload

    def set_room_topology(self, room_rel: str, topology: str, threshold: int) -> dict[str, object]:
        room = self.normalize_room_rel(room_rel)
        if room and not self.room_dir(room).is_dir():
            raise DeskError("missing_room", "That Desk room does not exist.")
        clean = normalize_room_topology(topology)
        self.update_room_metadata(room, {"topology": clean})
        self.append_log("set-room-topology", {"room": room, "topology": clean})
        payload = self.state(room, threshold)
        payload["updated_room"] = self.room_summary(room, threshold)
        return payload

    def set_room_title(self, room_rel: str, title: str, threshold: int) -> dict[str, object]:
        room = self.normalize_room_rel(room_rel)
        if room and not self.room_dir(room).is_dir():
            raise DeskError("missing_room", "That Desk room does not exist.")
        clean = str(title or "").strip()
        if not clean:
            raise DeskError("missing_title", "Room title is required.")
        if len(clean) > 96:
            raise DeskError("title_too_long", "Room title must be 96 characters or fewer.")
        self.update_room_metadata(room, {"title": clean})
        self.append_log("set-room-title", {"room": room, "title": clean})
        payload = self.state(room, threshold)
        payload["updated_room"] = self.room_summary(room, threshold)
        return payload

    def unique_room_move_rel(self, source_rel: str, target_parent_rel: str) -> str:
        source = self.normalize_room_rel(source_rel)
        source_name = Path(source_rel).name
        target_parent = self.normalize_room_rel(target_parent_rel)
        base = f"{target_parent}/{source_name}" if target_parent else source_name
        if base == source:
            return source
        if not self.room_dir(base).exists():
            return base
        for index in range(2, 1000):
            candidate = f"{base}-{index}"
            if not self.room_dir(candidate).exists():
                return candidate
        raise DeskError("room_exists", "Could not choose a unique moved room path.")

    def remap_room_ref(self, value: str, old_rel: str, new_rel: str) -> str:
        if value == old_rel:
            return new_rel
        if value.startswith(old_rel + "/"):
            return new_rel + value[len(old_rel):]
        return value

    def rewrite_passages_after_room_move(self, old_rel: str, new_rel: str) -> None:
        rewritten: set[tuple[str, str]] = set()
        for path in self.passage_files():
            data = self.read_passage_file(path)
            if not data:
                continue
            rooms = [
                self.remap_room_ref(str(data["rooms"][0]), old_rel, new_rel),
                self.remap_room_ref(str(data["rooms"][1]), old_rel, new_rel),
            ]
            if rooms != data["rooms"]:
                ordered = sorted(rooms)
                key = (ordered[0], ordered[1])
                if key in rewritten:
                    continue
                data["rooms"] = ordered
                data["updated_at"] = iso_now()
                self.write_secret_passage_files(ordered[0], ordered[1], data, [path])
                rewritten.add(key)

    def move_room(self, source_room: str, target_parent_room: str, threshold: int) -> dict[str, object]:
        source_rel = self.normalize_room_rel(source_room)
        target_parent_rel = self.normalize_room_rel(target_parent_room)
        if not source_rel:
            raise DeskError("bad_room_move", "The office cannot be moved.")
        source_path = self.room_dir(source_rel)
        if not source_path.is_dir():
            raise DeskError("missing_room", "That Desk room does not exist.")
        if target_parent_rel == source_rel or target_parent_rel.startswith(source_rel + "/"):
            raise DeskError("bad_room_move", "A room cannot be moved inside itself.")
        target_parent_path = self.room_dir(target_parent_rel)
        if not target_parent_path.is_dir():
            raise DeskError("missing_room", "The destination room does not exist.")
        target_rel = self.unique_room_move_rel(source_rel, target_parent_rel)
        target_path = self.room_dir(target_rel)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        os.rename(source_path, target_path)
        self.rewrite_passages_after_room_move(source_rel, target_rel)
        self.append_log("move-room", {"from_room": source_rel, "to_room": target_rel, "target_parent": target_parent_rel})
        payload = self.state(target_rel, threshold)
        payload["moved_room"] = {
            "from": source_rel,
            "to": target_rel,
            "parent_path": target_parent_rel,
        }
        return payload

    def delete_room(self, room_rel: str, threshold: int) -> dict[str, object]:
        room = self.normalize_room_rel(room_rel)
        if not room:
            raise DeskError("bad_room_delete", "The office cannot be deleted.")
        room_path = self.room_dir(room)
        if not room_path.is_dir():
            raise DeskError("missing_room", "That Desk room does not exist.")
        status = self.room_delete_status(room)
        if not status.get("can_delete"):
            raise DeskError("room_not_empty", str(status.get("reason") or "Room is not empty."))
        parent = "" if "/" not in room else room.rsplit("/", 1)[0]
        shutil.rmtree(room_path)
        self.append_log("delete-room", {"room": room, "parent": parent})
        payload = self.state(parent, threshold)
        payload["deleted_room"] = {"path": room, "parent_path": parent}
        return payload

    def create_secret_passage(self, left_room: str, right_room: str, threshold: int) -> dict[str, object]:
        left = self.normalize_room_rel(left_room)
        right = self.normalize_room_rel(right_room)
        if left == right:
            raise DeskError("bad_passage", "Choose two different rooms for a secret passage.")
        if not self.room_dir(left).is_dir() or not self.room_dir(right).is_dir():
            raise DeskError("missing_room", "Both rooms must exist before a secret passage can be made.")
        ordered = sorted([left, right])
        payload = self.passage_payload(ordered[0], ordered[1])
        file_name = self.passage_file_name(ordered[0], ordered[1])
        left_dir = self.passage_dir(left)
        right_dir = self.passage_dir(right)
        left_dir.mkdir(exist_ok=True)
        right_dir.mkdir(exist_ok=True)
        left_path = left_dir / file_name
        right_path = right_dir / file_name
        if left_path.exists() and right_path.exists():
            state = self.state(left, threshold)
            state["secret_passage"] = {"from": ordered[0], "to": ordered[1], "already_exists": True}
            return state
        self.write_secret_passage_files(ordered[0], ordered[1], payload, [left_path, right_path])
        self.append_log("create-secret-passage", {"from_room": ordered[0], "to_room": ordered[1]})
        state = self.state(left, threshold)
        state["secret_passage"] = {"from": ordered[0], "to": ordered[1], "already_exists": False}
        return state

    def collapse_secret_passages(self, room_rel: str, threshold: int) -> dict[str, object]:
        room = self.normalize_room_rel(room_rel)
        if not self.room_dir(room).is_dir():
            raise DeskError("missing_room", "That Desk room does not exist.")
        removed: set[tuple[str, str]] = set()
        for path in self.passage_files():
            data = self.read_passage_file(path)
            if not data:
                continue
            left, right = [str(value) for value in data["rooms"]]
            if room not in (left, right):
                continue
            ordered = tuple(sorted([left, right]))
            file_name = self.passage_file_name(ordered[0], ordered[1])
            for target in (self.passage_dir(ordered[0]) / file_name, self.passage_dir(ordered[1]) / file_name, path):
                with contextlib.suppress(FileNotFoundError):
                    target.unlink()
            removed.add(ordered)
        if removed:
            self.append_log("collapse-secret-passages", {"room": room, "count": len(removed)})
        state = self.state(room, threshold)
        state["collapsed_secret_passages"] = [
            {"from": left, "to": right}
            for left, right in sorted(removed)
        ]
        return state

    def unique_task_path(self, room_rel: str, text: str) -> Path:
        tasks = self.tasks_dir(room_rel)
        tasks.mkdir(parents=True, exist_ok=True)
        stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        base = f"{stamp}-{safe_task_slug(text)}"
        candidate = tasks / f"{base}.txt"
        if not candidate.exists():
            return candidate
        for _ in range(100):
            suffix = random.randint(1000, 9999)
            candidate = tasks / f"{base}-{suffix}.txt"
            if not candidate.exists():
                return candidate
        raise DeskError("task_exists", "Could not choose a unique task file.")

    def add_task(self, room_rel: str, text: str, threshold: int) -> dict[str, object]:
        clean_text = str(text or "").strip()
        if not clean_text:
            raise DeskError("missing_task", "Task text is required.")
        target_rel = self.ensure_room(room_rel or "")
        path = self.unique_task_path(target_rel, clean_text)
        atomic_write_text(path, clean_text + "\n")
        self.set_metadata(path, {
            "upvotes": 0,
            "last_vote_at": 0,
            "created_at": iso_now(),
            "updated_at": iso_now(),
        })
        self.append_log("add-task", {"room": target_rel, "task": path.name})
        payload = self.state(target_rel, threshold)
        payload["created_task"] = self.read_task(target_rel, path)
        return payload

    def vote_task(self, room_rel: str, task_id: str, threshold: int) -> dict[str, object]:
        task_path = self.task_path(room_rel, task_id)
        if not task_path.is_file():
            raise DeskError("missing_task", "Task file was not found.")
        meta = self.metadata(task_path)
        last_vote_at = parse_int(meta.get("last_vote_at"), 0)
        current = now_epoch()
        next_vote_at = last_vote_at + self.revote_seconds if last_vote_at else 0
        if next_vote_at and current < next_vote_at:
            raise DeskError("vote_wait", "This task is still inside the private revote window.", next_vote_at=next_vote_at)
        upvotes = parse_int(meta.get("upvotes"), 0) + 1
        self.set_metadata(task_path, {
            "upvotes": upvotes,
            "last_vote_at": current,
            "updated_at": iso_now(),
        })
        room = self.normalize_room_rel(room_rel)
        self.append_log("vote-task", {"room": room, "task": task_path.name, "upvotes": upvotes})
        payload = self.state(room, threshold)
        payload["voted_task"] = self.read_task(room, task_path)
        return payload

    def move_sidecar(self, old_path: Path, new_path: Path) -> None:
        old_meta = self.meta_path(old_path)
        if old_meta.exists():
            new_meta = self.meta_path(new_path)
            new_meta.parent.mkdir(parents=True, exist_ok=True)
            os.replace(old_meta, new_meta)

    def move_task_file(self, from_room: str, task_id: str, to_room: str, status: str = "open") -> Path:
        old_path = self.task_path(from_room, task_id, status)
        if not old_path.is_file():
            raise DeskError("missing_task", "Task file was not found.")
        metadata = self.metadata(old_path)
        target_rel = self.ensure_room(to_room)
        target_dir = self.tasks_dir(target_rel, status)
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / old_path.name
        if target_path.exists():
            stem = old_path.stem
            suffix = old_path.suffix
            for index in range(2, 1000):
                candidate = target_dir / f"{stem}-{index}{suffix}"
                if not candidate.exists():
                    target_path = candidate
                    break
        os.rename(old_path, target_path)
        self.move_sidecar(old_path, target_path)
        if metadata:
            self.set_metadata(target_path, metadata)
        return target_path

    def move_task(self, from_room: str, task_id: str, to_room: str, threshold: int) -> dict[str, object]:
        source_rel = self.normalize_room_rel(from_room)
        target_rel = self.normalize_room_rel(to_room)
        if source_rel == target_rel:
            payload = self.state(source_rel, threshold)
            task_path = self.task_path(source_rel, task_id)
            if not task_path.is_file():
                raise DeskError("missing_task", "Task file was not found.")
            payload["moved_task"] = self.read_task(source_rel, task_path)
            payload["move_skipped"] = True
            return payload
        target_path = self.move_task_file(from_room, task_id, to_room)
        self.set_metadata(target_path, {"updated_at": iso_now()})
        self.append_log("move-task", {"from_room": source_rel, "to_room": target_rel, "task": target_path.name})
        payload = self.state(target_rel, threshold)
        payload["moved_task"] = self.read_task(target_rel, target_path)
        return payload

    def complete_task(self, room_rel: str, task_id: str, threshold: int) -> dict[str, object]:
        old_path = self.task_path(room_rel, task_id)
        if not old_path.is_file():
            raise DeskError("missing_task", "Task file was not found.")
        room = self.normalize_room_rel(room_rel)
        done_dir = self.tasks_dir(room, "done")
        done_dir.mkdir(parents=True, exist_ok=True)
        target = done_dir / old_path.name
        if target.exists():
            target = done_dir / f"{old_path.stem}-{now_epoch()}{old_path.suffix}"
        metadata = self.metadata(old_path)
        os.rename(old_path, target)
        self.move_sidecar(old_path, target)
        metadata["completed_at"] = iso_now()
        metadata["updated_at"] = iso_now()
        self.set_metadata(target, metadata)
        self.append_log("complete-task", {"room": room, "task": target.name})
        payload = self.state(room, threshold)
        payload["completed_task"] = self.read_task(room, target, "done")
        return payload

    def restore_task(self, room_rel: str, task_id: str, threshold: int) -> dict[str, object]:
        old_path = self.task_path(room_rel, task_id, "done")
        if not old_path.is_file():
            raise DeskError("missing_task", "Archived task file was not found.")
        room = self.normalize_room_rel(room_rel)
        open_dir = self.tasks_dir(room)
        open_dir.mkdir(parents=True, exist_ok=True)
        target = open_dir / old_path.name
        if target.exists():
            target = open_dir / f"{old_path.stem}-{now_epoch()}{old_path.suffix}"
        metadata = self.metadata(old_path)
        os.rename(old_path, target)
        self.move_sidecar(old_path, target)
        metadata["completed_at"] = ""
        metadata["updated_at"] = iso_now()
        self.set_metadata(target, metadata)
        self.append_log("restore-task", {"room": room, "task": target.name})
        payload = self.state(room, threshold)
        payload["restored_task"] = self.read_task(room, target)
        return payload

    def set_soonness(self, room_rel: str, task_id: str, soonness: str, threshold: int) -> dict[str, object]:
        task_path = self.task_path(room_rel, task_id)
        if not task_path.is_file():
            raise DeskError("missing_task", "Task file was not found.")
        clean = str(soonness or "").strip()
        if clean and not parse_soonness_epoch(clean):
            raise DeskError("bad_soonness", "Soonness must be a date, ISO timestamp, or epoch.")
        self.set_metadata(task_path, {"soonness": clean, "updated_at": iso_now()})
        room = self.normalize_room_rel(room_rel)
        self.append_log("set-soonness", {"room": room, "task": task_path.name, "soonness": clean})
        payload = self.state(room, threshold)
        payload["updated_task"] = self.read_task(room, task_path)
        return payload

    def set_status(self, status: str, threshold: int) -> dict[str, object]:
        clean = str(status or "").strip().lower()
        if clean not in ("available", "quiet", "offline"):
            raise DeskError("bad_status", "Desk status is not valid.")
        payload = {"online_status": clean, "updated_at": iso_now()}
        atomic_write_json(self.state_dir / "status.json", payload)
        self.append_log("set-status", payload)
        state = self.state(env("BLOG_DESK_ROOM", ""), threshold)
        state["status"] = payload
        return state

    def search(self, query: str, threshold: int) -> dict[str, object]:
        needle = str(query or "").strip().lower()
        if len(needle) < 2:
            raise DeskError("short_query", "Search needs at least two characters.")
        results: list[dict[str, object]] = []
        for rel in self.all_room_rels():
            room_title = self.room_title(rel)
            if needle in room_title.lower():
                results.append({
                    "kind": "room",
                    "room": rel,
                    "title": room_title,
                    "url": self.room_url(rel),
                })
            for task in self.sorted_tasks(rel):
                haystack = f"{task.get('title', '')}\n{task.get('body', '')}".lower()
                if needle in haystack:
                    results.append({
                        "kind": "task",
                        "room": rel,
                        "room_title": room_title,
                        "title": task.get("title", ""),
                        "task": task,
                        "url": self.room_url(rel),
                    })
        return {
            "success": True,
            "search": True,
            "query": query,
            "result_count": len(results),
            "results": results,
            "visibility_threshold": threshold,
        }

    def audit(self) -> dict[str, object]:
        issues: list[dict[str, object]] = []
        for rel in self.all_room_rels():
            room = self.room_dir(rel)
            if not (room / ".room.json").is_file():
                issues.append({"kind": "missing_room_metadata", "room": rel})
            task_dir = room / ".tasks"
            if task_dir.exists() and not task_dir.is_dir():
                issues.append({"kind": "tasks_not_directory", "room": rel})
            for task_path in self.task_files(rel):
                try:
                    task = self.read_task(rel, task_path)
                    if not str(task.get("title") or "").strip():
                        issues.append({"kind": "missing_title", "room": rel, "task": task_path.name})
                except DeskError:
                    issues.append({"kind": "unreadable_task", "room": rel, "task": task_path.name})
                sidecar = self.meta_path(task_path)
                if sidecar.exists():
                    try:
                        json.loads(sidecar.read_text(encoding="utf-8"))
                    except (OSError, json.JSONDecodeError):
                        issues.append({"kind": "malformed_metadata", "room": rel, "task": task_path.name})
        return {"success": True, "issues": issues, "issue_count": len(issues)}

    def list_orphans(self) -> dict[str, object]:
        orphans: list[dict[str, object]] = []
        for rel in self.all_room_rels():
            for path in self.task_files(rel):
                try:
                    path.read_text(encoding="utf-8")
                except OSError:
                    orphans.append({"room": rel, "path": path.name, "reason": "unreadable"})
            legacy_dir = self.legacy_open_tasks_dir(rel)
            if not legacy_dir.is_dir():
                continue
            for path in legacy_dir.iterdir():
                if path.name.startswith(".") or path.name in ("done", "trash", "forgotten"):
                    continue
                if path.is_symlink():
                    orphans.append({"room": rel, "path": path.name, "reason": "symlink"})
                elif path.is_file() and not path.name.endswith(".txt"):
                    orphans.append({"room": rel, "path": path.name, "reason": "non_task_file"})
        return {"success": True, "orphans": orphans, "orphan_count": len(orphans)}

    def rebuild_indexes(self, threshold: int) -> dict[str, object]:
        cache_dir = self.state_dir / "cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "rebuilt_at": iso_now(),
            "rooms": [self.room_summary(rel, threshold) for rel in self.all_room_rels()],
        }
        atomic_write_json(cache_dir / "rooms.json", payload, 0o600)
        return {"success": True, "cache": "rooms.json", "room_count": len(payload["rooms"])}

    def migrate_metadata(self, target: str) -> dict[str, object]:
        clean = str(target or "sidecar").strip().lower()
        if clean not in ("sidecar", "xattr"):
            raise DeskError("bad_metadata_backend", "Metadata backend must be sidecar or xattr.")
        migrated = 0
        failed = 0
        for rel in self.all_room_rels():
            for status in ("open", "done"):
                for task_path in self.task_files(rel, status):
                    meta = self.metadata(task_path)
                    if clean == "sidecar":
                        atomic_write_json(self.meta_path(task_path), meta)
                        migrated += 1
                    else:
                        ok = True
                        for key, value in meta.items():
                            if key in META_KEYS and not self.write_xattr(task_path, key, value):
                                ok = False
                        if ok:
                            migrated += 1
                        else:
                            failed += 1
        return {"success": True, "target": clean, "migrated": migrated, "failed": failed}


def threshold_from_env() -> int:
    value = parse_int(env("BLOG_DESK_VISIBILITY_THRESHOLD"), 1)
    if value < 1:
        return 1
    if value > 100:
        return 100
    return value


def dispatch(store: DeskStore) -> dict[str, object]:
    action = env("BLOG_DESK_ACTION", "state").strip() or "state"
    threshold = threshold_from_env()
    room = env("BLOG_DESK_ROOM", "")
    mutating = action in {
        "create-room",
        "add-task",
        "vote-task",
        "complete-task",
        "restore-task",
        "move-task",
        "move-room",
        "create-secret-passage",
        "collapse-secret-passages",
        "set-soonness",
        "set-status",
        "set-room-color",
        "set-room-kind",
        "set-room-topology",
        "set-room-title",
        "delete-room",
        "rebuild-indexes",
        "migrate-metadata",
    }
    context = store.locked() if mutating or action in {"state", "search", "audit", "list-orphans"} else contextlib.nullcontext()
    with context:
        store.setup()
        if action in ("state", "office"):
            return store.state(room, threshold)
        if action == "create-room":
            return store.create_room(room, env("BLOG_DESK_ROOM_TITLE"), threshold, env("BLOG_DESK_ROOM_TOPOLOGY", "connected"))
        if action == "add-task":
            target = env("BLOG_DESK_DESTINATION_ROOM", room)
            return store.add_task(target, env("BLOG_DESK_TASK_TEXT"), threshold)
        if action == "vote-task":
            return store.vote_task(room, env("BLOG_DESK_TASK_ID"), threshold)
        if action == "complete-task":
            return store.complete_task(room, env("BLOG_DESK_TASK_ID"), threshold)
        if action == "restore-task":
            return store.restore_task(room, env("BLOG_DESK_TASK_ID"), threshold)
        if action == "move-task":
            return store.move_task(room, env("BLOG_DESK_TASK_ID"), env("BLOG_DESK_TARGET_ROOM"), threshold)
        if action == "move-room":
            return store.move_room(room, env("BLOG_DESK_TARGET_ROOM"), threshold)
        if action == "create-secret-passage":
            return store.create_secret_passage(room, env("BLOG_DESK_TARGET_ROOM"), threshold)
        if action == "collapse-secret-passages":
            return store.collapse_secret_passages(room, threshold)
        if action == "set-soonness":
            return store.set_soonness(room, env("BLOG_DESK_TASK_ID"), env("BLOG_DESK_SOONNESS"), threshold)
        if action == "set-status":
            return store.set_status(env("BLOG_DESK_ONLINE_STATUS"), threshold)
        if action == "set-room-color":
            return store.set_room_color(room, env("BLOG_DESK_ROOM_COLOR"), threshold)
        if action == "set-room-kind":
            return store.set_room_kind(room, env("BLOG_DESK_ROOM_KIND"), threshold)
        if action == "set-room-topology":
            return store.set_room_topology(room, env("BLOG_DESK_ROOM_TOPOLOGY"), threshold)
        if action == "set-room-title":
            return store.rename_room(room, env("BLOG_DESK_ROOM_TITLE"), threshold)
        if action == "delete-room":
            return store.delete_room(room, threshold)
        if action == "search":
            return store.search(env("BLOG_DESK_QUERY"), threshold)
        if action == "audit":
            return store.audit()
        if action in ("rebuild", "rebuild-indexes"):
            return store.rebuild_indexes(threshold)
        if action in ("orphaned", "list-orphans"):
            return store.list_orphans()
        if action == "migrate-metadata":
            return store.migrate_metadata(env("BLOG_DESK_METADATA_BACKEND", "sidecar"))
    raise DeskError("bad_action", "Unknown Desk action.")


def main() -> int:
    try:
        payload = dispatch(DeskStore())
        json_out(payload)
        return 0
    except DeskError as exc:
        payload: dict[str, object] = {"success": False, "code": exc.code, "error": exc.message}
        payload.update(exc.extra)
        json_out(payload)
        return 0
    except Exception as exc:
        json_out({"success": False, "code": "desk_error", "error": str(exc)})
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
