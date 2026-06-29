use serde_json::Value;

#[derive(Clone, Debug)]
pub(crate) struct PublicPost {
    pub(crate) url: String,
    pub(crate) title: String,
    pub(crate) author: String,
    pub(crate) pub_date: String,
    pub(crate) published_timestamp: String,
    pub(crate) published_at: String,
    pub(crate) published_date: String,
    pub(crate) summary: String,
    pub(crate) link_url: String,
    pub(crate) post_type: String,
    pub(crate) path: String,
    pub(crate) source_path: String,
    pub(crate) year: String,
    pub(crate) nostr_event_id: String,
    pub(crate) nostr_pubkey: String,
    pub(crate) nostr_kind: String,
    pub(crate) nostr_d: String,
    pub(crate) nostr_address: String,
    pub(crate) nostr_uri: String,
    pub(crate) search_text: String,
    pub(crate) tags: Vec<String>,
    pub(crate) summary_truncated: bool,
    pub(crate) comment_count: i64,
    pub(crate) reading_minutes_text: String,
    pub(crate) reading_minutes: i64,
    pub(crate) word_count: i64,
}

impl PublicPost {
    pub(crate) fn from_value(value: &Value) -> Option<Self> {
        let _ = value.as_object()?;
        let reading_minutes_text = number_or_string_field(value, "reading_minutes");
        Some(Self {
            url: string_field(value, "url"),
            title: string_field(value, "title"),
            author: string_field(value, "author"),
            pub_date: string_field(value, "pub_date"),
            published_timestamp: string_field(value, "published_timestamp"),
            published_at: string_field(value, "published_at"),
            published_date: string_field(value, "published_date"),
            summary: string_field(value, "summary"),
            link_url: string_field(value, "link_url"),
            post_type: string_field(value, "type"),
            path: string_field(value, "path"),
            source_path: string_field(value, "source_path"),
            year: string_field(value, "year"),
            nostr_event_id: string_field(value, "nostr_event_id"),
            nostr_pubkey: string_field(value, "nostr_pubkey"),
            nostr_kind: string_field(value, "nostr_kind"),
            nostr_d: string_field(value, "nostr_d"),
            nostr_address: string_field(value, "nostr_address"),
            nostr_uri: string_field(value, "nostr_uri"),
            search_text: string_field(value, "search_text"),
            tags: tags_field(value),
            summary_truncated: bool_field(value, "summary_truncated"),
            comment_count: integer_field(value, "comment_count"),
            reading_minutes: integer_or_string_field(value, "reading_minutes"),
            reading_minutes_text,
            word_count: integer_or_string_field(value, "word_count"),
        })
    }
}

fn string_field(value: &Value, field: &str) -> String {
    value
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn tags_field(value: &Value) -> Vec<String> {
    value
        .get("tags")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn bool_field(value: &Value, field: &str) -> bool {
    value.get(field).and_then(Value::as_bool).unwrap_or(false)
}

fn integer_field(value: &Value, field: &str) -> i64 {
    value.get(field).and_then(Value::as_i64).unwrap_or(0)
}

fn number_or_string_field(value: &Value, field: &str) -> String {
    match value.get(field) {
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::String(text)) => text.to_string(),
        _ => String::new(),
    }
}

fn integer_or_string_field(value: &Value, field: &str) -> i64 {
    match value.get(field) {
        Some(Value::Number(number)) => number.as_i64().unwrap_or(0),
        Some(Value::String(text)) => text.parse::<i64>().unwrap_or(0),
        _ => 0,
    }
}
