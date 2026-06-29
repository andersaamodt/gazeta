use crate::action_registry::{action_allowed, RuntimeDomain};
use crate::admin_security::{require_admin_session as require_admin_session_shared, RequestParams};
pub use crate::runtime_types::CgiResponse;
use crate::runtime_types::RuntimeError;
use crate::site_runtime::{resolve_site_identity, resolve_sites_data_dir, resolve_state_dir};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

pub type ReadError = RuntimeError;
type Result<T> = std::result::Result<T, ReadError>;

struct SitePaths {
    state_dir: PathBuf,
}

impl SitePaths {
    fn from_env() -> Result<Self> {
        let identity = resolve_site_identity(true, "default")
            .map_err(|error| ReadError::new(error.code, error.message))?;
        let default_sites_data_dir = identity.sites_dir.join(".sitedata");
        let sites_data_dir = resolve_sites_data_dir(&identity.sites_dir, &default_sites_data_dir);
        Ok(Self {
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
}

pub fn run_action(action: &str) -> Result<CgiResponse> {
    if !action_allowed(RuntimeDomain::AdminRead, action) {
        return Err(ReadError::new(
            "bad_action",
            "Unknown Gazeta admin read action.",
        ));
    }
    match action {
        "blog-list-pages" => blog_list_pages().map(CgiResponse::json),
        _ => Err(ReadError::new(
            "bad_action",
            "Unknown Gazeta admin read action.",
        )),
    }
}

fn blog_list_pages() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    require_admin_session(&paths)?;

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

fn require_admin_session(paths: &SitePaths) -> Result<()> {
    let request = RequestParams::from_env_and_stdin();
    require_admin_session_shared(&paths.sessions_dir(), &paths.users_dir(), &request, None)
        .map_err(|error| ReadError::new(error.code, error.message))?;
    Ok(())
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
