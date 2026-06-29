use crate::gazeta_read::{read_json_file, rebuild, ReadError, Result, SitePaths};
use serde_json::Value;
use std::path::Path;

pub(crate) fn list_navbar_pages() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let static_navbar = paths.generated_static_dir().join("navbar-pages.json");
    let cache_navbar = paths.state_dir.join("navbar-pages-cache.json");

    if let Some(value) = read_pages_payload(&static_navbar) {
        return Ok(value);
    }
    if let Some(value) = read_pages_payload(&cache_navbar) {
        return Ok(value);
    }

    rebuild(&paths, "rebuild-navbar-pages")?;

    read_pages_payload(&static_navbar)
        .or_else(|| read_pages_payload(&cache_navbar))
        .ok_or_else(|| {
            ReadError::new(
                "navbar_missing",
                "Gazeta navbar pages were not available after rebuild.",
            )
        })
}

fn read_pages_payload(path: &Path) -> Option<Value> {
    let value = read_json_file(path)?;
    if value.get("success").and_then(Value::as_bool) == Some(true)
        && value.get("pages").and_then(Value::as_array).is_some()
    {
        Some(value)
    } else {
        None
    }
}
