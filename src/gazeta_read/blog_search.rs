use crate::gazeta_read::{
    html_escape, public_posts::public_posts_catalog_value, read_json_file, CgiResponse, ReadError,
    Result, SitePaths,
};
use crate::public_post::PublicPost;
use crate::urlcodec::query_param as query_param_value;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

pub(crate) fn blog_search() -> Result<CgiResponse> {
    let query = query_param_value("q").unwrap_or_default();
    let mut html = render_form(&query);
    if query.is_empty() {
        return Ok(CgiResponse::html(html));
    }

    let entries = search_index_entries()?;
    let posts = public_posts_catalog_value()?
        .get("posts")
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter_map(PublicPost::from_value)
                .collect::<Vec<_>>()
        })
        .ok_or_else(|| {
            ReadError::new("catalog_invalid", "Gazeta public posts catalog is invalid.")
        })?;
    let posts_by_source_path: HashMap<String, &PublicPost> = posts
        .iter()
        .filter_map(|post| {
            let source_path = post.source_path.trim().to_string();
            (!source_path.is_empty()).then_some((source_path, post))
        })
        .collect();
    let posts_by_url: HashMap<String, &PublicPost> = posts
        .iter()
        .filter_map(|post| {
            let url = post.url.trim().to_string();
            (!url.is_empty()).then_some((url, post))
        })
        .collect();
    let query_lc = query.to_ascii_lowercase();
    let matches: Vec<&PublicPost> = entries
        .iter()
        .filter(|entry| entry.search_text.to_ascii_lowercase().contains(&query_lc))
        .filter_map(|entry| {
            let source_path = entry.source_path.trim();
            if !source_path.is_empty() {
                if let Some(post) = posts_by_source_path.get(source_path).copied() {
                    return Some(post);
                }
            }
            let url = entry.url.trim();
            if !url.is_empty() {
                return posts_by_url.get(url).copied();
            }
            None
        })
        .collect();
    html.push_str(&render_results(&query, &matches));
    Ok(CgiResponse::html(html))
}

fn search_index_entries() -> Result<Vec<SearchIndexEntry>> {
    let paths = SitePaths::from_env()?;
    let static_index = paths.generated_static_dir().join("search-index.json");
    let cache_index = paths.state_dir.join("search-index-cache.json");
    if let Some(entries) = read_entries(&static_index).or_else(|| read_entries(&cache_index)) {
        return Ok(entries);
    }

    read_entries(&static_index)
        .or_else(|| read_entries(&cache_index))
        .ok_or_else(|| {
            ReadError::new(
                "search_index_missing",
                "Gazeta search index is not available. Run blog-maintenance rebuild-search-index.",
            )
        })
}

fn read_entries(path: &Path) -> Option<Vec<SearchIndexEntry>> {
    let value = read_json_file(path)?;
    if value.get("success").and_then(Value::as_bool) == Some(true) {
        let entries = value.get("entries")?.as_array()?.clone();
        Some(
            entries
                .iter()
                .filter_map(SearchIndexEntry::from_value)
                .collect(),
        )
    } else {
        None
    }
}

struct SearchIndexEntry {
    source_path: String,
    url: String,
    search_text: String,
}

impl SearchIndexEntry {
    fn from_value(value: &Value) -> Option<Self> {
        let _ = value.as_object()?;
        Some(Self {
            source_path: value
                .get("source_path")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            url: value
                .get("url")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            search_text: value
                .get("search_text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        })
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

fn render_results(query: &str, matches: &[&PublicPost]) -> String {
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

fn render_result(html: &mut String, entry: &PublicPost) {
    let url = &entry.url;
    let title = &entry.title;
    let pub_date = &entry.pub_date;
    let summary = &entry.summary;
    let comment_count = entry.comment_count;

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

    if !entry.tags.is_empty() {
        html.push_str("      <div class=\"tags\">\n");
        for tag in entry.tags.iter().map(String::as_str) {
            html.push_str("        <a href=\"/tags#");
            html.push_str(&html_escape(tag));
            html.push_str("\" class=\"tag\">");
            html.push_str(&html_escape(tag));
            html.push_str("</a>\n");
        }
        html.push_str("      </div>\n");
    }
    html.push_str("    </article>\n\n");
}
