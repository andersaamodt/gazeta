use crate::gazeta_read::{ReadError, Result};
use serde_json::Value;
use std::fs;
use std::path::Path;

pub(crate) fn read_json_file(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

pub(crate) fn write_json_atomic(path: &Path, value: &Value) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            ReadError::new(
                "cache_write_failed",
                format!("Could not create cache directory: {error}"),
            )
        })?;
    }
    let tmp = path.with_extension(format!("json.{}.tmp", std::process::id()));
    let text = serde_json::to_vec(value).map_err(|error| {
        ReadError::new(
            "cache_write_failed",
            format!("Could not encode cache JSON: {error}"),
        )
    })?;
    fs::write(&tmp, text).map_err(|error| {
        ReadError::new(
            "cache_write_failed",
            format!("Could not write cache file: {error}"),
        )
    })?;
    fs::rename(&tmp, path).map_err(|error| {
        let _ = fs::remove_file(&tmp);
        ReadError::new(
            "cache_write_failed",
            format!("Could not install cache file: {error}"),
        )
    })
}
