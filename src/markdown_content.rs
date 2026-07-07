use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

pub(crate) struct MarkdownFrontMatter {
    pub(crate) parsed: BTreeMap<String, String>,
    pub(crate) raw: BTreeMap<String, String>,
    pub(crate) body: String,
}

pub(crate) fn read_markdown_front_matter(path: &Path) -> Option<MarkdownFrontMatter> {
    let text = fs::read_to_string(path).ok()?;
    Some(parse_markdown_front_matter(&text))
}

pub(crate) fn parse_markdown_front_matter(text: &str) -> MarkdownFrontMatter {
    let mut parsed = BTreeMap::new();
    let mut raw = BTreeMap::new();
    let mut lines = text.lines();
    if lines.next() != Some("---") {
        return MarkdownFrontMatter {
            parsed,
            raw,
            body: text.to_string(),
        };
    }
    let mut body_start = 0usize;
    let mut offset = 4usize;
    for line in text[4..].lines() {
        if line == "---" {
            body_start = offset + line.len();
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            let raw_value = value.trim().to_string();
            raw.insert(key.trim().to_string(), raw_value.clone());
            parsed.insert(
                key.trim().to_string(),
                raw_value
                    .trim_matches('"')
                    .trim_matches('\'')
                    .to_string(),
            );
        }
        offset += line.len() + 1;
    }
    let body = text
        .get(body_start..)
        .unwrap_or_default()
        .trim_start_matches('\n')
        .to_string();
    MarkdownFrontMatter { parsed, raw, body }
}

pub(crate) fn state_markdown_to_json(path: &Path, body_key: &str) -> Option<Value> {
    let front_matter = read_markdown_front_matter(path)?;
    let mut object = serde_json::Map::new();
    for (key, value) in front_matter.parsed {
        let parsed = serde_json::from_str::<Value>(&value)
            .unwrap_or_else(|_| Value::String(value));
        object.insert(key, parsed);
    }
    object.insert(body_key.to_string(), Value::String(front_matter.body));
    Some(Value::Object(object))
}

pub(crate) fn front_matter_value(path: &Path, key: &str) -> String {
    read_markdown_front_matter(path)
        .and_then(|front_matter| front_matter.parsed.get(key).cloned())
        .unwrap_or_default()
}

pub(crate) fn normalize_post_type(raw: impl AsRef<str>) -> String {
    let normalized = raw
        .as_ref()
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

pub(crate) fn normalize_tags(tags: impl AsRef<str>) -> String {
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for tag in tags.as_ref().replace('\n', ",").split(',') {
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

pub(crate) fn trim_whitespace(value: impl AsRef<str>) -> String {
    value
        .as_ref()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
