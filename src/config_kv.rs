use crate::runtime_types::RuntimeError;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

pub(crate) fn read_config(path: &Path) -> Option<BTreeMap<String, String>> {
    let text = fs::read_to_string(path).ok()?;
    let mut config = BTreeMap::new();
    for line in text.lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        config.insert(key.to_string(), value.to_string());
    }
    Some(config)
}

pub(crate) fn config_string(config: &BTreeMap<String, String>, key: &str) -> String {
    config.get(key).cloned().unwrap_or_default()
}

pub(crate) fn update_config_value(
    path: &Path,
    key: &str,
    value: &str,
    context: &'static str,
) -> Result<(), RuntimeError> {
    let mut config = read_config(path).unwrap_or_default();
    config.insert(key.to_string(), value.to_string());
    write_config(path, &config, context)
}

pub(crate) fn write_config(
    path: &Path,
    config: &BTreeMap<String, String>,
    context: &'static str,
) -> Result<(), RuntimeError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| RuntimeError::new("write_failed", format!("{context}: {error}")))?;
    }
    let mut text = String::new();
    for (key, value) in config {
        text.push_str(key);
        text.push('=');
        text.push_str(value);
        text.push('\n');
    }
    fs::write(path, text)
        .map_err(|error| RuntimeError::new("write_failed", format!("{context}: {error}")))
}
