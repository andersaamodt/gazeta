use crate::action_registry::{action_allowed, RuntimeDomain};
use crate::admin_security::{
    require_admin_session as require_admin_session_shared, RequestParams, SessionState,
};
use crate::config_kv::{config_string, read_config, write_config};
pub use crate::runtime_types::CgiResponse;
use crate::runtime_types::RuntimeError;
use crate::site_runtime::{
    resolve_generated_root, resolve_site_identity, resolve_sites_data_dir, resolve_state_dir,
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::env;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use std::path::{Path, PathBuf};

pub type ReadError = RuntimeError;
type Result<T> = std::result::Result<T, ReadError>;

struct SitePaths {
    site_name: String,
    site_root: PathBuf,
    site_conf: PathBuf,
    state_dir: PathBuf,
}

impl SitePaths {
    fn from_env() -> Result<Self> {
        let identity = resolve_site_identity(true, "default")
            .map_err(|error| ReadError::new(error.code, error.message))?;
        let default_sites_data_dir = identity.sites_dir.join(".sitedata");
        let sites_data_dir = resolve_sites_data_dir(&identity.sites_dir, &default_sites_data_dir);
        Ok(Self {
            site_name: identity.site_name.clone(),
            site_root: identity.site_root.clone(),
            site_conf: identity.site_root.join("site.conf"),
            state_dir: resolve_state_dir(
                &identity.site_root,
                &identity.site_name,
                &sites_data_dir,
                &default_sites_data_dir,
            ),
        })
    }

    fn lists_dir(&self) -> PathBuf {
        self.state_dir.join("lists")
    }

    fn nostr_events_dir(&self) -> PathBuf {
        self.state_dir.join("nostr/events")
    }

    fn nostr_pages_config(&self) -> PathBuf {
        self.state_dir.join("nostr-pages.json")
    }

    fn sessions_dir(&self) -> PathBuf {
        self.state_dir.join("ssh-auth/sessions")
    }

    fn users_dir(&self) -> PathBuf {
        self.state_dir.join("ssh-auth/users")
    }

    fn drafts_dir(&self) -> PathBuf {
        self.state_dir.join("content/drafts")
    }

    fn scheduler_state(&self) -> PathBuf {
        self.state_dir.join("scheduler.conf")
    }

    fn managed_pages_dir(&self) -> PathBuf {
        resolve_generated_root(&self.site_root, &self.site_name).join("pages")
    }

    fn posts_dir(&self) -> PathBuf {
        self.managed_pages_dir().join("posts")
    }

    fn nostr_authors_file(&self) -> PathBuf {
        self.state_dir.join("nostr/state/authors")
    }

    fn nostr_blocklist_file(&self) -> PathBuf {
        self.state_dir.join("nostr/state/blocklist")
    }

    fn origin_posts_dir(&self) -> PathBuf {
        self.state_dir.join("origin/posts")
    }

    fn origin_state_dir(&self) -> PathBuf {
        self.state_dir.join("origin/state")
    }
}

pub fn run_action(action: &str) -> Result<CgiResponse> {
    if !action_allowed(RuntimeDomain::AdminRead, action) {
        return Err(ReadError::new(
            "bad_action",
            "Unknown Gazeta admin read action.",
        ));
    }
    match action {
        "blog-get-draft" => blog_get_draft().map(CgiResponse::json),
        "blog-list-drafts" => blog_list_drafts().map(CgiResponse::json),
        "blog-list-pages" => blog_list_pages().map(CgiResponse::json),
        "blog-list-posts" => blog_list_posts().map(CgiResponse::json),
        "blog-list-public-ranking-moderation" => {
            blog_list_public_ranking_moderation().map(CgiResponse::json)
        }
        "blog-list-queue" => blog_list_queue().map(CgiResponse::json),
        "blog-list-users" => blog_list_users().map(CgiResponse::json),
        _ => Err(ReadError::new(
            "bad_action",
            "Unknown Gazeta admin read action.",
        )),
    }
}

fn blog_get_draft() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request)?;

    let draft_id = request.value("draft_id").unwrap_or_default();
    if draft_id.is_empty() {
        return Err(ReadError::new("invalid_request", "draft_id is required"));
    }

    let draft = find_draft_by_id(&paths, &draft_id)
        .ok_or_else(|| ReadError::new("not_found", "Draft not found"))?;
    let enabled_platforms = origin_enabled_platforms(&paths);
    let mut origin_platforms = normalize_origin_platforms(
        draft
            .front_matter_raw("origin_platforms")
            .unwrap_or_default(),
        &enabled_platforms,
    );
    if origin_platforms.is_empty() && draft.front_matter_raw("origin_platforms").is_none() {
        origin_platforms = origin_default_platforms(&paths, &enabled_platforms);
    }

    Ok(json!({
        "success": true,
        "draft": {
            "draft_id": draft.draft_id(),
            "title": draft.title(),
            "tags": normalize_tags(draft.front_matter("tags").unwrap_or_default()),
            "summary": draft.front_matter("summary").unwrap_or_default(),
            "post_type": draft.post_type(),
            "publish_mode": draft.publish_mode(),
            "status": draft.status(),
            "scheduled_at": draft.front_matter("scheduled_at").unwrap_or_default(),
            "created_at": draft.front_matter("created_at").unwrap_or_default(),
            "updated_at": draft.front_matter("updated_at").unwrap_or_default(),
            "source_post_path": draft.front_matter("source_post_path").unwrap_or_default(),
            "post_filename": draft.post_filename(),
            "origin_platforms": origin_platforms,
            "content": draft.content,
        }
    }))
}

fn blog_list_drafts() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request)?;

    let mut drafts = all_drafts(&paths);
    drafts.sort_by(|left, right| {
        right
            .front_matter("updated_at")
            .cmp(&left.front_matter("updated_at"))
            .then_with(|| right.draft_id().cmp(&left.draft_id()))
    });

    let drafts = drafts
        .into_iter()
        .filter(|draft| draft.status() == "draft" && draft.publish_mode() == "draft")
        .map(|draft| {
            json!({
                "draft_id": draft.draft_id(),
                "title": effective_post_title(
                    draft.front_matter("title").unwrap_or_default(),
                    &draft.content,
                    &draft.post_type(),
                ),
                "tags": draft.front_matter("tags").unwrap_or_default(),
                "summary": draft.front_matter("summary").unwrap_or_default(),
                "content_excerpt": auto_summary_from_content(&draft.content),
                "source_post_path": draft.front_matter("source_post_path").unwrap_or_default(),
                "created_at": draft.front_matter("created_at").unwrap_or_default(),
                "updated_at": draft.front_matter("updated_at").unwrap_or_default(),
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "success": true,
        "drafts": drafts,
    }))
}

fn blog_list_queue() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request)?;

    let interval_hours = drip_interval_hours(&paths);
    let interval_minutes = drip_interval_minutes(interval_hours);
    let interval_seconds = interval_minutes * 60;
    let randomness = drip_randomness_minutes(&paths);
    let last_drip = read_config(&paths.scheduler_state())
        .map(|config| config_string(&config, "last_drip_epoch"))
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    let next_drip_epoch = if last_drip > 0 {
        last_drip + interval_seconds
    } else {
        0
    };

    let mut queue = all_drafts(&paths)
        .into_iter()
        .filter_map(|draft| {
            let publish_mode = draft.publish_mode();
            let status = draft.status();
            match (publish_mode.as_str(), status.as_str()) {
                ("scheduled", "scheduled") => Some(QueueDraft {
                    sort_key: draft.front_matter("scheduled_at").unwrap_or_default(),
                    draft_id: draft.draft_id(),
                    title: effective_post_title(
                        draft.front_matter("title").unwrap_or_default(),
                        &draft.content,
                        &draft.post_type(),
                    ),
                    publish_mode,
                    status,
                    scheduled_at: draft.front_matter("scheduled_at").unwrap_or_default(),
                    content_excerpt: auto_summary_from_content(&draft.content),
                }),
                ("drip", "queued") => Some(QueueDraft {
                    sort_key: draft.front_matter("created_at").unwrap_or_default(),
                    draft_id: draft.draft_id(),
                    title: effective_post_title(
                        draft.front_matter("title").unwrap_or_default(),
                        &draft.content,
                        &draft.post_type(),
                    ),
                    publish_mode,
                    status,
                    scheduled_at: String::new(),
                    content_excerpt: auto_summary_from_content(&draft.content),
                }),
                _ => None,
            }
        })
        .collect::<Vec<_>>();
    queue.sort_by(|left, right| {
        left.sort_key
            .cmp(&right.sort_key)
            .then_with(|| left.draft_id.cmp(&right.draft_id))
    });

    let queue = queue
        .into_iter()
        .map(|item| {
            json!({
                "draft_id": item.draft_id,
                "title": item.title,
                "publish_mode": item.publish_mode,
                "status": item.status,
                "scheduled_at": item.scheduled_at,
                "content_excerpt": item.content_excerpt,
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "success": true,
        "drip_interval_hours": interval_hours,
        "drip_interval_minutes": interval_minutes,
        "drip_randomness_minutes": randomness,
        "drip_jitter_minutes": randomness,
        "next_drip_epoch": next_drip_epoch,
        "queue": queue,
    }))
}

fn blog_list_pages() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request)?;

    let mut slugs = BTreeSet::new();
    let mut non_list_slugs = BTreeSet::new();
    let mut event_titles = BTreeMap::new();

    for entry in fs::read_dir(paths.lists_dir())
        .into_iter()
        .flatten()
        .flatten()
    {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
            slugs.insert(normalize_list_slug(stem));
        }
    }

    for event in list_events(&paths.nostr_events_dir(), &[30004, 30267]) {
        let slug = match tag_value(&event, "d").map(|value| normalize_list_slug(&value)) {
            Some(slug) if !slug.is_empty() => slug,
            _ => continue,
        };
        slugs.insert(slug.clone());
        if let Some(title) = tag_value(&event, "title").filter(|title| !title.is_empty()) {
            let created_at = event.get("created_at").and_then(Value::as_i64).unwrap_or(0);
            let id = event.get("id").and_then(Value::as_str).unwrap_or_default();
            event_titles
                .entry(slug)
                .and_modify(|existing: &mut (i64, String, String)| {
                    if (created_at, id) > (existing.0, existing.1.as_str()) {
                        *existing = (created_at, id.to_string(), title.clone());
                    }
                })
                .or_insert_with(|| (created_at, id.to_string(), title));
        }
    }

    if slugs.is_empty() {
        slugs.insert("list".to_string());
    }

    if let Some(config) = read_json(&paths.nostr_pages_config()) {
        for page in normalized_pages(&config) {
            let slug = match page.get("slug").and_then(Value::as_str) {
                Some(slug) => normalize_list_slug(slug),
                None => continue,
            };
            if page_type(page.get("type").and_then(Value::as_str)) == "list" {
                slugs.insert(slug);
            } else {
                non_list_slugs.insert(slug);
            }
        }
    }

    let lists: Vec<Value> = slugs
        .into_iter()
        .filter(|slug| !non_list_slugs.contains(slug))
        .map(|slug| {
            let title = draft_title(&paths, &slug)
                .or_else(|| event_titles.get(&slug).map(|(_, _, title)| title.clone()))
                .unwrap_or_else(|| slug.replace('-', " "));
            json!({"slug": slug, "title": title})
        })
        .collect();

    Ok(json!({"success": true, "lists": lists}))
}

fn blog_list_posts() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request)?;

    let posts = collect_published_posts(&paths)
        .into_iter()
        .filter_map(|doc| {
            let path = post_rel_path(&paths, &doc.path)?;
            let nostr_address = post_nostr_address(&doc);
            Some(json!({
                "path": path,
                "title": effective_post_title(doc.title(), &doc.content, &doc.post_type()),
                "published_at": doc.front_matter("published_at").unwrap_or_default(),
                "author": post_author_display_name(&paths, &doc),
                "content_excerpt": auto_summary_from_content(&doc.content),
                "publish_mode": doc.front_matter("publish_mode").unwrap_or_default(),
                "source": "local",
                "nostr_address": nostr_address,
                "open_url": post_open_url(&path),
                "crossposting": origin_crossposting_for_post(&paths, &doc.path, &path, &doc),
                "can_delete": true,
                "can_hide": false,
            }))
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "success": true,
        "posts": posts,
    }))
}

fn blog_list_public_ranking_moderation() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request)?;

    let filter_page_slug = normalize_page_slug(request.value("page_slug").unwrap_or_default());
    let filter_item_type = match request
        .value("item_type")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "" | "all" | "group" | "entry" => request
            .value("item_type")
            .unwrap_or_default()
            .to_ascii_lowercase(),
        _ => "all".to_string(),
    };
    let filter_age = match request
        .value("age")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "" | "all" | "24h" | "7d" | "30d" | "older" => {
            request.value("age").unwrap_or_default().to_ascii_lowercase()
        }
        _ => "all".to_string(),
    };
    let now_epoch = now_epoch();

    let mut latest = HashMap::<(i64, String, String), Value>::new();
    for event in list_events(&paths.nostr_events_dir(), &[30040, 30041]) {
        let kind = event.get("kind").and_then(Value::as_i64).unwrap_or(0);
        let pubkey = event
            .get("pubkey")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let d = tag_value(&event, "d").unwrap_or_default();
        if d.is_empty() || tag_values(&event, "t").iter().any(|tag| tag == "public-ranking") {
            continue;
        }
        let key = (kind, pubkey.clone(), d.clone());
        let replace = latest.get(&key).is_none_or(|existing| {
            let left = (
                event.get("created_at").and_then(Value::as_i64).unwrap_or(0),
                event.get("id").and_then(Value::as_str).unwrap_or_default(),
            );
            let right = (
                existing
                    .get("created_at")
                    .and_then(Value::as_i64)
                    .unwrap_or(0),
                existing.get("id").and_then(Value::as_str).unwrap_or_default(),
            );
            left > right
        });
        if replace {
            latest.insert(key, event);
        }
    }

    let mut items = latest
        .into_values()
        .filter_map(|event| moderation_item(event, now_epoch))
        .filter(|item| {
            filter_page_slug.is_empty()
                || item.get("page_slug").and_then(Value::as_str) == Some(filter_page_slug.as_str())
        })
        .filter(|item| {
            filter_item_type.is_empty()
                || filter_item_type == "all"
                || item.get("item_type").and_then(Value::as_str) == Some(filter_item_type.as_str())
        })
        .filter(|item| moderation_age_matches(item.get("age_seconds").and_then(Value::as_i64).unwrap_or(0), &filter_age))
        .collect::<Vec<_>>();
    items.sort_by(|left, right| {
        let left_key = (
            left.get("created_at").and_then(Value::as_i64).unwrap_or(0),
            left.get("id").and_then(Value::as_str).unwrap_or_default().to_string(),
        );
        let right_key = (
            right.get("created_at").and_then(Value::as_i64).unwrap_or(0),
            right.get("id").and_then(Value::as_str).unwrap_or_default().to_string(),
        );
        right_key.cmp(&left_key)
    });

    Ok(json!({
        "success": true,
        "pending_count": items.len(),
        "items": items,
    }))
}

fn blog_list_users() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let session = require_admin_session(&paths, &request)?;

    let users = reindex_users(&paths)?;
    let author_pubkeys = read_lines_set(&paths.nostr_authors_file());
    let blocked_pubkeys = read_lines_set(&paths.nostr_blocklist_file());
    let actor_rank = user_rank(&paths.users_dir(), &session.username);

    let users = users
        .into_iter()
        .map(|user| {
            let pubkey = user.nostr_pubkey();
            let is_author = !pubkey.is_empty() && author_pubkeys.contains(&pubkey);
            let is_blocked = !pubkey.is_empty() && blocked_pubkeys.contains(&pubkey);
            json!({
                "username": user.username(),
                "player_name": user.player_name(),
                "nostr_pubkey": pubkey,
                "created_at": user.created_at(),
                "is_admin": user.is_admin(),
                "is_author": is_author,
                "is_blocked": is_blocked,
                "rank": user.rank(),
                "is_self": user.username() == session.username,
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "success": true,
        "actor_username": session.username,
        "actor_rank": actor_rank,
        "users": users,
    }))
}

fn require_admin_session(paths: &SitePaths, request: &RequestParams) -> Result<SessionState> {
    require_admin_session_shared(&paths.sessions_dir(), &paths.users_dir(), &request, None)
        .map_err(|error| ReadError::new(error.code, error.message))
}

fn draft_title(paths: &SitePaths, slug: &str) -> Option<String> {
    let path = paths.lists_dir().join(format!("{slug}.json"));
    read_json(&path)
        .and_then(|value| {
            value
                .get("title")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .filter(|title| !title.is_empty())
}

fn normalized_pages(config: &Value) -> Vec<&Value> {
    match config {
        Value::Object(object) => object
            .get("pages")
            .and_then(Value::as_array)
            .map(|pages| pages.iter().collect())
            .unwrap_or_default(),
        Value::Array(pages) => pages.iter().collect(),
        _ => Vec::new(),
    }
}

fn page_type(raw: Option<&str>) -> &'static str {
    match raw.unwrap_or("list").to_ascii_lowercase().as_str() {
        "contact" => "contact",
        "public-ranking" | "public_ranking" | "ranking" => "public-ranking",
        "overworld" | "overworld-game" | "overworld_game" => "overworld",
        "software-gallery" | "software_gallery" | "software" => "software-gallery",
        "icon-gallery" | "icon_gallery" | "gallery" => "icon-gallery",
        "blog" | "blog-index" | "blog_index" => "blog",
        "nip23" | "article" | "document" => "nip23",
        _ => "list",
    }
}

fn list_events(events_dir: &Path, kinds: &[i64]) -> Vec<Value> {
    let mut events = Vec::new();
    collect_list_events(events_dir, kinds, &mut events);
    events
}

fn collect_list_events(path: &Path, kinds: &[i64], events: &mut Vec<Value>) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    if metadata.is_dir() {
        for entry in fs::read_dir(path).into_iter().flatten().flatten() {
            collect_list_events(&entry.path(), kinds, events);
        }
        return;
    }
    if path.extension().and_then(|value| value.to_str()) != Some("json") {
        return;
    }
    let Some(parent_kind) = path
        .parent()
        .and_then(Path::file_name)
        .and_then(|value| value.to_str())
        .and_then(|value| value.parse::<i64>().ok())
    else {
        return;
    };
    if !kinds.contains(&parent_kind) {
        return;
    }
    if let Some(event) = read_json(path).filter(|event| {
        event
            .get("kind")
            .and_then(Value::as_i64)
            .is_some_and(|kind| kinds.contains(&kind))
    }) {
        events.push(event);
    }
}

fn tag_value(event: &Value, name: &str) -> Option<String> {
    event
        .get("tags")
        .and_then(Value::as_array)?
        .iter()
        .find_map(|tag| {
            let tag = tag.as_array()?;
            (tag.first().and_then(Value::as_str) == Some(name))
                .then(|| tag.get(1).and_then(Value::as_str).map(ToString::to_string))
                .flatten()
        })
}

fn normalize_list_slug(raw: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;
    for byte in raw.bytes() {
        let normalized = match byte {
            b'a'..=b'z' | b'0'..=b'9' => byte as char,
            b'A'..=b'Z' => byte.to_ascii_lowercase() as char,
            b'-' => '-',
            _ => '-',
        };
        if normalized == '-' {
            if !previous_dash && !slug.is_empty() {
                slug.push('-');
            }
            previous_dash = true;
        } else {
            slug.push(normalized);
            previous_dash = false;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        "list".to_string()
    } else {
        slug
    }
}

fn read_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

#[derive(Clone)]
struct MarkdownDoc {
    path: PathBuf,
    front_matter: BTreeMap<String, String>,
    front_matter_raw: BTreeMap<String, String>,
    content: String,
}

impl MarkdownDoc {
    fn from_path(path: &Path) -> Option<Self> {
        let text = fs::read_to_string(path).ok()?;
        let (front_matter, front_matter_raw, content) = parse_markdown_front_matter(&text);
        Some(Self {
            path: path.to_path_buf(),
            front_matter,
            front_matter_raw,
            content,
        })
    }

    fn draft_id(&self) -> String {
        self.front_matter("draft_id").unwrap_or_else(|| {
            self.path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string()
        })
    }

    fn front_matter(&self, key: &str) -> Option<String> {
        self.front_matter.get(key).cloned()
    }

    fn front_matter_raw(&self, key: &str) -> Option<String> {
        self.front_matter_raw.get(key).cloned()
    }

    fn post_type(&self) -> String {
        normalize_post_type(
            self.front_matter("post_type")
                .filter(|value| !value.is_empty())
                .or_else(|| self.front_matter("type"))
                .unwrap_or_default(),
        )
    }

    fn publish_mode(&self) -> String {
        self.front_matter("publish_mode")
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "draft".to_string())
    }

    fn status(&self) -> String {
        self.front_matter("status")
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "draft".to_string())
    }

    fn title(&self) -> String {
        self.front_matter("title").unwrap_or_default()
    }

    fn post_filename(&self) -> String {
        let stored = self.front_matter("post_filename").unwrap_or_default();
        if !stored.is_empty() {
            return stored;
        }
        normalize_post_filename(self.front_matter("source_post_path").unwrap_or_default())
            .unwrap_or_default()
    }
}

struct QueueDraft {
    sort_key: String,
    draft_id: String,
    title: String,
    publish_mode: String,
    status: String,
    scheduled_at: String,
    content_excerpt: String,
}

#[derive(Clone)]
struct OriginPlatformMeta {
    id: String,
    family: String,
}

struct UserProfile {
    path: PathBuf,
    config: BTreeMap<String, String>,
}

impl UserProfile {
    fn username(&self) -> String {
        config_string(&self.config, "username")
    }

    fn player_name(&self) -> String {
        let player_name = config_string(&self.config, "player_name");
        if player_name.is_empty() {
            self.username()
        } else {
            player_name
        }
    }

    fn nostr_pubkey(&self) -> String {
        let value = config_string(&self.config, "nostr_pubkey").to_ascii_lowercase();
        if is_lower_hex_len(&value, 64) {
            value
        } else {
            String::new()
        }
    }

    fn is_admin(&self) -> bool {
        boolish(Some(config_string(&self.config, "is_admin").as_str()))
    }

    fn created_at(&self) -> String {
        let created_at = config_string(&self.config, "created_at");
        if !created_at.is_empty() {
            return created_at;
        }
        config_string(&self.config, "updated_at")
    }

    fn rank(&self) -> i64 {
        config_string(&self.config, "user_rank")
            .parse::<i64>()
            .unwrap_or(0)
            .max(0)
    }
}

fn all_drafts(paths: &SitePaths) -> Vec<MarkdownDoc> {
    let mut drafts = Vec::new();
    for entry in fs::read_dir(paths.drafts_dir())
        .into_iter()
        .flatten()
        .flatten()
    {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }
        if let Some(draft) = MarkdownDoc::from_path(&path) {
            drafts.push(draft);
        }
    }
    drafts
}

fn find_draft_by_id(paths: &SitePaths, draft_id: &str) -> Option<MarkdownDoc> {
    let direct = paths.drafts_dir().join(format!("{draft_id}.md"));
    if direct.is_file() {
        return MarkdownDoc::from_path(&direct);
    }
    all_drafts(paths)
        .into_iter()
        .find(|draft| draft.draft_id() == draft_id)
}

fn parse_markdown_front_matter(
    text: &str,
) -> (BTreeMap<String, String>, BTreeMap<String, String>, String) {
    let mut parsed = BTreeMap::new();
    let mut raw = BTreeMap::new();
    let mut lines = text.lines();
    if lines.next() != Some("---") {
        return (parsed, raw, text.to_string());
    }
    let mut content_start = 0usize;
    let mut offset = 4usize;
    for line in text[4..].lines() {
        if line == "---" {
            content_start = offset + line.len();
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            let trimmed = value.trim().to_string();
            raw.insert(key.trim().to_string(), trimmed.clone());
            parsed.insert(
                key.trim().to_string(),
                trimmed.trim_matches('"').trim_matches('\'').to_string(),
            );
        }
        offset += line.len() + 1;
    }
    let content = text
        .get(content_start..)
        .unwrap_or_default()
        .trim_start_matches('\n')
        .to_string();
    (parsed, raw, content)
}

fn auto_summary_from_content(content: &str) -> String {
    if content.trim().is_empty() {
        return String::new();
    }
    let mut plain = content.replace('\n', " ");
    for marker in ["```", "`", "*", "_", "~"] {
        plain = plain.replace(marker, "");
    }
    while let Some(start) = plain.find("![") {
        if let Some(end) = plain[start..].find(')') {
            plain.replace_range(start..start + end + 1, " ");
        } else {
            break;
        }
    }
    while let Some(start) = plain.find('[') {
        let slice = plain[start..].to_string();
        let Some(mid) = slice.find("](") else {
            break;
        };
        let Some(end) = slice[mid + 2..].find(')') else {
            break;
        };
        let label = slice[1..mid].to_string();
        plain.replace_range(start..start + mid + 2 + end + 1, &label);
    }
    let normalized = plain
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();
    if normalized.is_empty() {
        return String::new();
    }
    let words = normalized.split_whitespace().collect::<Vec<_>>();
    let summary = words.iter().take(48).copied().collect::<Vec<_>>().join(" ");
    if words.len() > 48 {
        format!("{summary}...")
    } else {
        summary
    }
}

fn effective_post_title(title: String, content: &str, post_type: &str) -> String {
    let title = trim_whitespace(&title);
    if !title.is_empty() {
        return title;
    }
    let fallback = trim_whitespace(&auto_summary_from_content(content));
    if !fallback.is_empty() {
        return fallback;
    }
    if post_type == "shortform" {
        "Short post".to_string()
    } else {
        "Untitled".to_string()
    }
}

fn normalize_post_type(raw: String) -> String {
    let normalized = raw
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    match normalized.as_str() {
        "" | "long" | "longform" => "longform".to_string(),
        "short" | "shortform" => "shortform".to_string(),
        "capture" | "capture-media" | "capture_media" | "take-photo" | "take-photo-video" => {
            "capture-media".to_string()
        }
        "media" | "media-upload" | "media_upload" | "upload-media" | "upload_media" | "photo"
        | "video" | "image" => "upload-media".to_string(),
        "attachment" | "attachments" | "file" | "file-upload" | "file_upload" => {
            "attachment".to_string()
        }
        "audio" | "audio-note" | "audio_note" | "voice" | "voice-note" | "voice_note" => {
            "audio-note".to_string()
        }
        "link" | "link-share" | "link_share" | "url" | "share-link" => "link-share".to_string(),
        "go-live" | "go_live" | "live" => "go-live".to_string(),
        _ => normalized,
    }
}

fn normalize_tags(tags: String) -> String {
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for tag in tags.replace('\n', ",").split(',') {
        let trimmed = trim_whitespace(tag);
        let stripped = trimmed
            .trim_matches('[')
            .trim_matches(']')
            .trim_matches('"')
            .trim_matches('\'')
            .replace('\\', "")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join("-");
        let cleaned = stripped
            .chars()
            .filter(|ch| {
                ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | ':' | '+' | '/' | '-')
            })
            .collect::<String>()
            .trim_matches('-')
            .to_string();
        if cleaned.is_empty()
            || cleaned.len() > 64
            || !cleaned.chars().any(|ch| ch.is_ascii_alphanumeric())
        {
            continue;
        }
        let canonical = match cleaned.to_ascii_lowercase().as_str() {
            "ai-shitpost" | "ai-quickpost" => "AI quickpost".to_string(),
            _ => cleaned,
        };
        if seen.insert(canonical.clone()) {
            out.push(canonical);
        }
    }
    out.join(", ")
}

fn normalize_post_filename(raw: String) -> Option<String> {
    let raw = raw
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    let raw = raw
        .split_once('/')
        .map(|(_, rest)| rest)
        .unwrap_or(raw)
        .trim_start_matches('/')
        .trim_start_matches("pages/")
        .trim_start_matches("posts/");
    let raw = raw
        .rsplit('/')
        .next()
        .unwrap_or_default()
        .trim_end_matches(".md")
        .trim_end_matches(".MD")
        .trim_end_matches(".html")
        .trim_end_matches(".HTML")
        .trim();
    if raw.is_empty() {
        return None;
    }
    let slug = raw
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    (!slug.is_empty()).then_some(slug)
}

fn trim_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn drip_interval_hours(paths: &SitePaths) -> f64 {
    if let Some(hours) = read_config(&paths.site_conf)
        .map(|config| config_string(&config, "drip_interval_hours"))
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| *value > 0.0)
    {
        return hours.max(1.0 / 60.0);
    }
    let legacy_minutes = read_config(&paths.site_conf)
        .map(|config| config_string(&config, "drip_interval_minutes"))
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(240)
        .max(1);
    (legacy_minutes as f64 / 60.0).max(1.0 / 60.0)
}

fn drip_interval_minutes(interval_hours: f64) -> i64 {
    ((interval_hours * 60.0).round() as i64).max(1)
}

fn drip_randomness_minutes(paths: &SitePaths) -> i64 {
    read_config(&paths.site_conf)
        .map(|config| {
            config_string(&config, "drip_randomness_minutes")
                .parse::<i64>()
                .ok()
                .or_else(|| {
                    config_string(&config, "drip_jitter_minutes")
                        .parse::<i64>()
                        .ok()
                })
                .unwrap_or(0)
        })
        .unwrap_or(0)
        .max(0)
}

fn origin_dir() -> Option<PathBuf> {
    let configured = env::var_os("ORIGIN_DIR").map(PathBuf::from);
    if configured
        .as_deref()
        .is_some_and(|path| path.join("bin/origin").is_file() && path.join("origin.json").is_file())
    {
        return configured;
    }
    let origin_bin = env::var_os("PATH").and_then(|paths| {
        env::split_paths(&paths)
            .map(|path| path.join("origin"))
            .find(|path| path.is_file())
    });
    if let Some(bin) = origin_bin {
        let candidate = bin.parent().and_then(Path::parent).map(Path::to_path_buf);
        if candidate.as_deref().is_some_and(|path| {
            path.join("bin/origin").is_file() && path.join("origin.json").is_file()
        }) {
            return candidate;
        }
    }
    let home = env::var_os("HOME").map(PathBuf::from)?;
    let candidate = home.join("git/origin");
    (candidate.join("bin/origin").is_file() && candidate.join("origin.json").is_file())
        .then_some(candidate)
}

fn origin_platform_meta() -> Vec<OriginPlatformMeta> {
    let Some(dir) = origin_dir() else {
        return Vec::new();
    };
    let Some(json) = read_json(&dir.join("origin.json")) else {
        return Vec::new();
    };
    let Some(platforms) = json.get("platforms").and_then(Value::as_object) else {
        return Vec::new();
    };
    let mut meta = platforms
        .iter()
        .filter(|(_, value)| value.get("enabled").and_then(Value::as_bool) != Some(false))
        .map(|(id, value)| OriginPlatformMeta {
            id: id.to_string(),
            family: value
                .get("family")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        })
        .collect::<Vec<_>>();
    meta.sort_by(|left, right| left.id.cmp(&right.id));
    meta
}

fn available_origin_platforms() -> Vec<String> {
    origin_platform_meta().into_iter().map(|platform| platform.id).collect()
}

fn normalize_origin_platforms(raw: String, allowed: &[String]) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let parsed = if trimmed.starts_with('[') {
        serde_json::from_str::<Value>(trimmed)
            .ok()
            .and_then(|value| value.as_array().cloned())
            .unwrap_or_default()
            .into_iter()
            .filter_map(|value| value.as_str().map(ToString::to_string))
            .collect::<Vec<_>>()
    } else {
        trimmed
            .split(',')
            .map(ToString::to_string)
            .collect::<Vec<_>>()
    };
    let allowed = allowed.iter().cloned().collect::<BTreeSet<_>>();
    let mut out = BTreeSet::new();
    for value in parsed {
        let cleaned = value
            .to_ascii_lowercase()
            .chars()
            .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
            .collect::<String>();
        if !cleaned.is_empty() && allowed.contains(&cleaned) {
            out.insert(cleaned);
        }
    }
    out.into_iter().collect()
}

fn origin_enabled_platforms(paths: &SitePaths) -> Vec<String> {
    let available = available_origin_platforms();
    if available.is_empty() {
        return Vec::new();
    }
    let configured = read_config(&paths.site_conf)
        .map(|config| config_string(&config, "origin_enabled_platforms"))
        .unwrap_or_else(|| "__missing__".to_string());
    if configured == "__missing__" {
        return available;
    }
    normalize_origin_platforms(configured, &available)
}

fn origin_default_platforms(paths: &SitePaths, enabled: &[String]) -> Vec<String> {
    if enabled.is_empty() {
        return Vec::new();
    }
    let configured = read_config(&paths.site_conf)
        .map(|config| config_string(&config, "origin_default_platforms"))
        .unwrap_or_else(|| "__missing__".to_string());
    if configured == "__missing__" {
        return enabled.to_vec();
    }
    normalize_origin_platforms(configured, enabled)
}

fn collect_published_posts(paths: &SitePaths) -> Vec<MarkdownDoc> {
    let mut posts = Vec::new();
    collect_published_posts_dir(&paths.posts_dir(), &mut posts);
    posts.sort_by(|left, right| {
        right
            .front_matter("published_at")
            .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string())
            .cmp(
                &left
                    .front_matter("published_at")
                    .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string()),
            )
            .then_with(|| right.path.cmp(&left.path))
    });
    posts
}

fn collect_published_posts_dir(path: &Path, posts: &mut Vec<MarkdownDoc>) {
    for entry in fs::read_dir(path).into_iter().flatten().flatten() {
        let entry_path = entry.path();
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.is_dir() {
            collect_published_posts_dir(&entry_path, posts);
            continue;
        }
        if entry_path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }
        let Some(doc) = MarkdownDoc::from_path(&entry_path) else {
            continue;
        };
        if boolish(doc.front_matter("nostr_projection").as_deref()) {
            continue;
        }
        let visibility = doc
            .front_matter("visibility")
            .unwrap_or_else(|| "public".to_string());
        if visibility != "public" {
            continue;
        }
        posts.push(doc);
    }
}

fn post_rel_path(paths: &SitePaths, file: &Path) -> Option<String> {
    let rel = file.strip_prefix(paths.managed_pages_dir()).ok()?;
    let rel = rel.to_str()?.replace('\\', "/");
    rel.starts_with("posts/").then_some(rel)
}

fn post_open_url(post_path: &str) -> String {
    let rel = post_path.strip_prefix("posts/").unwrap_or(post_path);
    format!("/posts/{}.html", rel.trim_end_matches(".md"))
}

fn post_nostr_address(doc: &MarkdownDoc) -> String {
    let stored = doc.front_matter("nostr_address").unwrap_or_default();
    if !stored.is_empty() {
        return stored;
    }
    let pubkey = doc.front_matter("nostr_pubkey").unwrap_or_default();
    let kind = doc.front_matter("nostr_kind").unwrap_or_default();
    let d = doc.front_matter("nostr_d").unwrap_or_default();
    if !pubkey.is_empty() && !kind.is_empty() && !d.is_empty() {
        return format!("{kind}:{pubkey}:{d}");
    }
    String::new()
}

fn post_author_display_name(paths: &SitePaths, doc: &MarkdownDoc) -> String {
    let raw_author = doc.front_matter("author").unwrap_or_default();
    if raw_author.is_empty() {
        return String::new();
    }
    if valid_username(&raw_author) {
        let profile = paths.users_dir().join(&raw_author).join("profile.conf");
        if let Some(config) = read_config(&profile) {
            let publish_name = config_string(&config, "publish_name");
            if !publish_name.is_empty() {
                return publish_name;
            }
            let player_name = config_string(&config, "player_name");
            if !player_name.is_empty() {
                return player_name;
            }
        }
    }
    raw_author
}

fn origin_crossposting_for_post(
    paths: &SitePaths,
    file: &Path,
    post_path: &str,
    doc: &MarkdownDoc,
) -> Value {
    let meta = origin_platform_meta();
    if meta.is_empty() {
        return json!({
            "available": false,
            "platforms": [],
            "enabled_platforms": [],
            "selected_platforms": [],
            "enabled_count": 0,
            "selected_count": 0,
            "published_count": 0,
            "remaining_count": 0,
            "needs_action": false,
        });
    }
    let enabled = origin_enabled_platforms(paths);
    let selected = origin_post_platforms(paths, post_path, &enabled);
    let selected_set = selected.iter().cloned().collect::<HashSet<_>>();
    let platforms = meta
        .into_iter()
        .filter(|platform| enabled.contains(&platform.id))
        .map(|platform| {
            let selected_here = selected_set.contains(&platform.id);
            let (status, remote_url) =
                origin_platform_status(paths, file, doc, &platform.id, selected_here);
            json!({
                "id": platform.id,
                "family": platform.family,
                "selected": selected_here,
                "status": status,
                "remote_url": remote_url,
            })
        })
        .collect::<Vec<_>>();
    let published_count = platforms
        .iter()
        .filter(|platform| platform.get("status").and_then(Value::as_str) == Some("published"))
        .count();
    let remaining_count = platforms.len().saturating_sub(published_count);
    let enabled_count = platforms.len();
    json!({
        "available": true,
        "platforms": platforms,
        "enabled_platforms": enabled,
        "selected_platforms": selected,
        "enabled_count": enabled_count,
        "selected_count": selected_set.len(),
        "published_count": published_count,
        "remaining_count": remaining_count,
        "needs_action": remaining_count > 0,
    })
}

fn origin_post_platforms(paths: &SitePaths, post_path: &str, fallback: &[String]) -> Vec<String> {
    let Some(slug) = normalize_post_filename(post_path.to_string()) else {
        return fallback.to_vec();
    };
    let settings = paths.origin_posts_dir().join(format!("{slug}.json"));
    let Some(value) = read_json(&settings) else {
        return fallback.to_vec();
    };
    let raw = value
        .get("platforms")
        .cloned()
        .map(|value| value.to_string())
        .unwrap_or_else(|| "[]".to_string());
    normalize_origin_platforms(raw, fallback)
}

fn origin_platform_status(
    paths: &SitePaths,
    file: &Path,
    doc: &MarkdownDoc,
    platform: &str,
    selected: bool,
) -> (String, String) {
    let Some(state_path) = origin_state_file_for_post(paths, file, doc, platform) else {
        return (
            if selected {
                "unpublished".to_string()
            } else {
                "not_selected".to_string()
            },
            String::new(),
        );
    };
    let Some(state) = read_json(&state_path) else {
        return (
            if selected {
                "unpublished".to_string()
            } else {
                "not_selected".to_string()
            },
            String::new(),
        );
    };
    let saved = state
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let remote_url = state
        .get("remote_url")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let status = match saved.as_str() {
        "published" | "failed" | "outdated" | "fetch-failed" | "mismatch" | "ok" => saved,
        "skipped" if selected => "skipped".to_string(),
        "skipped" => "not_selected".to_string(),
        _ if selected => "unpublished".to_string(),
        _ => "not_selected".to_string(),
    };
    (status, remote_url)
}

fn origin_state_file_for_post(
    paths: &SitePaths,
    file: &Path,
    doc: &MarkdownDoc,
    platform: &str,
) -> Option<PathBuf> {
    let post_id = origin_post_id_for_file(file, doc)?;
    Some(paths.origin_state_dir().join(post_id).join(format!("{platform}.json")))
}

fn origin_post_id_for_file(file: &Path, doc: &MarkdownDoc) -> Option<String> {
    for candidate in [
        doc.front_matter("nostr_event_id"),
        doc.front_matter("slug"),
        doc.front_matter("title").map(|value| slugify(&value)),
        first_heading(&doc.content).map(|value| slugify(&value)),
        file.file_stem()
            .and_then(|value| value.to_str())
            .map(|value| slugify(value)),
    ] {
        let candidate = candidate.unwrap_or_default();
        if !candidate.is_empty() {
            return Some(candidate);
        }
    }
    None
}

fn first_heading(content: &str) -> Option<String> {
    content
        .lines()
        .find_map(|line| line.strip_prefix("# ").map(trim_whitespace))
        .filter(|line| !line.is_empty())
}

fn slugify(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn moderation_item(event: Value, now_epoch: i64) -> Option<Value> {
    let kind = event.get("kind").and_then(Value::as_i64).unwrap_or(0);
    let pubkey = event
        .get("pubkey")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let d = tag_value(&event, "d").unwrap_or_default();
    let ranking_coord = tag_value(&event, "ranking").unwrap_or_default();
    let status = tag_value(&event, "status")
        .unwrap_or_default()
        .to_ascii_lowercase();
    if d.is_empty() || status != "pending" || !valid_ranking_coord(&ranking_coord) {
        return None;
    }
    let page_slug = ranking_coord
        .splitn(3, ':')
        .nth(2)
        .map(|value| normalize_page_slug(value.to_string()))
        .unwrap_or_default();
    let created_at = event.get("created_at").and_then(Value::as_i64).unwrap_or(0);
    let age_seconds = (now_epoch - created_at).max(0);
    let coordinate = format!("{kind}:{pubkey}:{d}");
    let mut object = event.as_object().cloned().unwrap_or_default();
    object.insert("coordinate".to_string(), Value::String(coordinate));
    object.insert("d".to_string(), Value::String(d));
    object.insert(
        "ranking_coord".to_string(),
        Value::String(ranking_coord),
    );
    object.insert("status".to_string(), Value::String(status));
    object.insert(
        "title".to_string(),
        Value::String(tag_value(&event, "title").unwrap_or_default()),
    );
    object.insert(
        "summary".to_string(),
        Value::String(tag_value(&event, "summary").unwrap_or_default()),
    );
    object.insert(
        "content".to_string(),
        Value::String(
            event.get("content")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        ),
    );
    object.insert(
        "author".to_string(),
        Value::String(tag_value(&event, "author").unwrap_or_default()),
    );
    object.insert(
        "topics".to_string(),
        Value::Array(tag_values(&event, "t").into_iter().map(Value::String).collect()),
    );
    object.insert("page_slug".to_string(), Value::String(page_slug.clone()));
    object.insert(
        "item_type".to_string(),
        Value::String(if kind == 30040 {
            "group".to_string()
        } else {
            "entry".to_string()
        }),
    );
    object.insert("age_seconds".to_string(), json!(age_seconds));
    object.insert(
        "page_path".to_string(),
        Value::String(if page_slug == "index" {
            "/".to_string()
        } else {
            format!("/{page_slug}")
        }),
    );
    Some(Value::Object(object))
}

fn moderation_age_matches(age_seconds: i64, filter: &str) -> bool {
    match filter {
        "24h" => age_seconds <= 86_400,
        "7d" => age_seconds <= 604_800,
        "30d" => age_seconds <= 2_592_000,
        "older" => age_seconds > 2_592_000,
        _ => true,
    }
}

fn valid_ranking_coord(value: &str) -> bool {
    let mut parts = value.splitn(3, ':');
    let Some(kind) = parts.next() else {
        return false;
    };
    let Some(pubkey) = parts.next() else {
        return false;
    };
    let Some(d) = parts.next() else {
        return false;
    };
    !kind.is_empty()
        && kind.bytes().all(|byte| byte.is_ascii_digit())
        && is_lower_hex_len(pubkey, 64)
        && !d.is_empty()
        && !d.chars().any(char::is_whitespace)
}

fn normalize_page_slug(raw: String) -> String {
    raw.to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn tag_values(event: &Value, name: &str) -> Vec<String> {
    event.get("tags")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tag| {
            let tag = tag.as_array()?;
            (tag.first().and_then(Value::as_str) == Some(name))
                .then(|| tag.get(1).and_then(Value::as_str))
                .flatten()
        })
        .map(|value| value.to_ascii_lowercase())
        .collect()
}

fn reindex_users(paths: &SitePaths) -> Result<Vec<UserProfile>> {
    let mut users = load_users(paths);
    users.sort_by(|left, right| {
        let left_rank = if left.rank() > 0 { left.rank() } else { 999_999_999 };
        let right_rank = if right.rank() > 0 { right.rank() } else { 999_999_999 };
        left_rank
            .cmp(&right_rank)
            .then_with(|| left.username().cmp(&right.username()))
    });
    for (index, user) in users.iter_mut().enumerate() {
        let username = user.username();
        if username.is_empty() {
            continue;
        }
        let expected_rank = (index + 1) as i64;
        let mut changed = false;
        if user.rank() != expected_rank {
            user.config
                .insert("user_rank".to_string(), expected_rank.to_string());
            changed = true;
        }
        if config_string(&user.config, "username").is_empty() {
            user.config.insert("username".to_string(), username);
            changed = true;
        }
        if changed {
            write_config(&user.path, &user.config, "Could not update user profile rank")?;
        }
    }
    Ok(users)
}

fn load_users(paths: &SitePaths) -> Vec<UserProfile> {
    let mut users = Vec::new();
    for entry in fs::read_dir(paths.users_dir()).into_iter().flatten().flatten() {
        let path = entry.path().join("profile.conf");
        let Some(mut config) = read_config(&path) else {
            continue;
        };
        if config_string(&config, "username").is_empty() {
            if let Some(username) = path
                .parent()
                .and_then(Path::file_name)
                .and_then(|value| value.to_str())
            {
                config.insert("username".to_string(), username.to_string());
            }
        }
        users.push(UserProfile { path, config });
    }
    users
}

fn user_rank(users_dir: &Path, username: &str) -> i64 {
    read_config(&users_dir.join(username).join("profile.conf"))
        .map(|config| config_string(&config, "user_rank"))
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
        .max(0)
}

fn read_lines_set(path: &Path) -> HashSet<String> {
    fs::read_to_string(path)
        .ok()
        .map(|text| {
            text.lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn is_lower_hex_len(value: &str, len: usize) -> bool {
    value.len() == len
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn valid_username(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && !value.starts_with('-')
        && !value.starts_with('.')
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn boolish(value: Option<&str>) -> bool {
    matches!(value.unwrap_or_default(), "true" | "1" | "yes" | "on")
}

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}
