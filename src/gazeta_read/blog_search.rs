use crate::gazeta_read::{
    html_escape, read_json_file, rebuild, CgiResponse, ReadError, Result, SitePaths,
};
use serde_json::Value;
use std::env;
use std::path::Path;

pub(crate) fn blog_search() -> Result<CgiResponse> {
    let query = query_param("q");
    let mut html = render_form(&query);
    if query.is_empty() {
        return Ok(CgiResponse::html(html));
    }

    let entries = search_index_entries()?;
    let query_lc = query.to_ascii_lowercase();
    let matches: Vec<&Value> = entries
        .iter()
        .filter(|entry| {
            string_field(entry, "search_text")
                .to_ascii_lowercase()
                .contains(&query_lc)
        })
        .collect();
    html.push_str(&render_results(&query, &matches));
    Ok(CgiResponse::html(html))
}

fn search_index_entries() -> Result<Vec<Value>> {
    let paths = SitePaths::from_env()?;
    let static_index = paths.site_root.join("site/static/search-index.json");
    let cache_index = paths.state_dir.join("search-index-cache.json");
    if let Some(entries) = read_entries(&static_index).or_else(|| read_entries(&cache_index)) {
        return Ok(entries);
    }

    rebuild(&paths, "rebuild-search-index")?;
    read_entries(&static_index)
        .or_else(|| read_entries(&cache_index))
        .ok_or_else(|| {
            ReadError::new(
                "search_index_missing",
                "Gazeta search index was not available after rebuild.",
            )
        })
}

fn read_entries(path: &Path) -> Option<Vec<Value>> {
    let value = read_json_file(path)?;
    if value.get("success").and_then(Value::as_bool) == Some(true) {
        value.get("entries")?.as_array().cloned()
    } else {
        None
    }
}

fn render_form(query: &str) -> String {
    let mut html = String::new();
    html.push_str("<div class=\"search-form\">\n");
    html.push_str("  <form method=\"get\" action=\"/search\">\n");
    html.push_str("    <input type=\"text\" name=\"q\" value=\"");
    html.push_str(&html_escape(query));
    html.push_str("\" placeholder=\"Search posts...\" autofocus />\n");
    html.push_str("    <button type=\"submit\">Search</button>\n");
    html.push_str("  </form>\n");
    html.push_str("</div>\n");
    html
}

fn render_results(query: &str, matches: &[&Value]) -> String {
    let mut html = String::new();
    html.push_str("<div class=\"search-results\">\n");
    if matches.is_empty() {
        html.push_str("  <p>No results found for <strong>");
        html.push_str(&html_escape(query));
        html.push_str("</strong>.</p>\n");
    } else {
        html.push_str("  <h2>Found ");
        html.push_str(&html_escape(&matches.len().to_string()));
        html.push_str(" result(s) for <strong>");
        html.push_str(&html_escape(query));
        html.push_str("</strong></h2>\n");
        html.push_str("  <div class=\"post-list\">\n");
        for entry in matches {
            render_result(&mut html, entry);
        }
        html.push_str("  </div>\n");
    }
    html.push_str("</div>\n");
    html
}

fn render_result(html: &mut String, entry: &Value) {
    let url = string_field(entry, "url");
    let title = string_field(entry, "title");
    let pub_date = string_field(entry, "pub_date");
    let summary = string_field(entry, "summary");
    let comment_count = integer_field(entry, "comment_count");

    html.push_str("    <article class=\"post-item\">\n");
    html.push_str("      <h3 class=\"post-title\"><a href=\"");
    html.push_str(&html_escape(&url));
    html.push_str("\">");
    html.push_str(&html_escape(&title));
    html.push_str("</a></h3>\n");
    html.push_str("      <div class=\"post-meta\">");
    if !pub_date.is_empty() {
        html.push_str("<span class=\"post-date\">");
        html.push_str(&html_escape(&pub_date));
        html.push_str("</span>");
    }
    html.push_str(" <span class=\"post-comments-count\">");
    html.push_str(&html_escape(&comment_count.to_string()));
    html.push_str(" comments</span></div>\n");

    if !summary.is_empty() {
        html.push_str("      <p class=\"post-summary\">");
        html.push_str(&html_escape(&summary));
        html.push_str("</p>\n");
    }

    if let Some(tags) = entry.get("tags").and_then(Value::as_array) {
        if !tags.is_empty() {
            html.push_str("      <div class=\"tags\">\n");
            for tag in tags
                .iter()
                .filter_map(Value::as_str)
                .filter(|tag| !tag.trim().is_empty())
            {
                let clean = tag.trim();
                html.push_str("        <a href=\"/tags#");
                html.push_str(&html_escape(clean));
                html.push_str("\" class=\"tag\">");
                html.push_str(&html_escape(clean));
                html.push_str("</a>\n");
            }
            html.push_str("      </div>\n");
        }
    }
    html.push_str("    </article>\n\n");
}

fn query_param(name: &str) -> String {
    let query = env::var("QUERY_STRING").unwrap_or_default();
    query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find_map(|(key, value)| (key == name).then(|| percent_decode(value)))
        .unwrap_or_default()
}

fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                if let Some(value) = hex_pair(bytes[i + 1], bytes[i + 2]) {
                    out.push(value);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_pair(high: u8, low: u8) -> Option<u8> {
    Some(hex_value(high)? * 16 + hex_value(low)?)
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn string_field(value: &Value, field: &str) -> String {
    value
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn integer_field(value: &Value, field: &str) -> i64 {
    value.get(field).and_then(Value::as_i64).unwrap_or(0)
}
