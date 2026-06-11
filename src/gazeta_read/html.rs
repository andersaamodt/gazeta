pub(crate) fn html_escape(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

pub(crate) fn markdown_block_html(raw: &str) -> String {
    if raw.is_empty() {
        return String::new();
    }
    format!("<p>{}</p>", markdown_inline_html(raw))
}

fn markdown_inline_html(raw: &str) -> String {
    let mut out = String::new();
    let mut rest = raw;
    while let Some(label_start) = rest.find('[') {
        out.push_str(&html_escape(&rest[..label_start]));
        let after_label_start = &rest[label_start + 1..];
        let Some(label_end) = after_label_start.find("](") else {
            out.push_str(&html_escape(&rest[label_start..]));
            return out;
        };
        let label = &after_label_start[..label_end];
        let after_href_start = &after_label_start[label_end + 2..];
        let Some(href_end) = after_href_start.find(')') else {
            out.push_str(&html_escape(&rest[label_start..]));
            return out;
        };
        let href = &after_href_start[..href_end];
        if is_safe_href(href) {
            out.push_str("<a href=\"");
            out.push_str(&html_escape(href));
            out.push_str("\">");
            out.push_str(&html_escape(label));
            out.push_str("</a>");
        } else {
            out.push_str(&html_escape(label));
        }
        rest = &after_href_start[href_end + 1..];
    }
    out.push_str(&html_escape(rest));
    out
}

fn is_safe_href(raw: &str) -> bool {
    let href = raw.trim().to_ascii_lowercase();
    href.starts_with("http://")
        || href.starts_with("https://")
        || href.starts_with("/")
        || href.starts_with("#")
}
