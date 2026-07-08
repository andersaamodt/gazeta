use crate::gazeta_read::{
    html_escape,
    public_posts::{load_public_posts, public_posts_by_source_path, public_posts_by_url},
    read_json_file, CgiResponse, ReadError, Result, SitePaths,
};
use crate::public_post::PublicPost;
use crate::urlcodec::query_param as query_param_value;
use serde_json::Value;
use std::path::Path;

pub(crate) fn blog_search() -> Result<CgiResponse> {
    let query = query_param_value("q").unwrap_or_default();
    if query.is_empty() {
        return Ok(CgiResponse::html(render_empty_state()));
    }

    let entries = search_index_entries()?;
    let posts = load_public_posts()?;
    let posts_by_source_path = public_posts_by_source_path(&posts);
    let posts_by_url = public_posts_by_url(&posts);
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
    Ok(CgiResponse::html(render_results(&query, &matches)))
}

fn search_index_entries() -> Result<Vec<SearchIndexEntry>> {
    let paths = SitePaths::from_env()?;
    let static_index = paths.generated_static_dir().join("search-index.json");
    let cache_index = paths.state_dir.join("search-index-cache.json");
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

fn render_empty_state() -> String {
    "<p class=\"placeholder\">Enter a search term to find posts.</p>\n".to_string()
}

fn render_results(query: &str, matches: &[&PublicPost]) -> String {
    let mut html = String::new();
    let rendered_matches: Vec<&str> = matches
        .iter()
        .filter_map(|entry| {
            let rendered = entry.rendered_html.trim();
            (!rendered.is_empty()).then_some(rendered)
        })
        .collect();
    html.push_str("<div class=\"search-results\">\n");
    if rendered_matches.is_empty() {
        html.push_str("  <p>No results found for <strong>");
        html.push_str(&html_escape(query));
        html.push_str("</strong>.</p>\n");
    } else {
        html.push_str("  <h2>Found ");
        html.push_str(&html_escape(&rendered_matches.len().to_string()));
        html.push_str(" result(s) for <strong>");
        html.push_str(&html_escape(query));
        html.push_str("</strong></h2>\n");
        html.push_str("  <div class=\"post-list\">\n");
        for rendered in rendered_matches {
            html.push_str(rendered);
            html.push('\n');
        }
        html.push_str("  </div>\n");
    }
    html.push_str("</div>\n");
    html
}
