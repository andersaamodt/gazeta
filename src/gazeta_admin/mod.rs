use crate::action_registry::{action_allowed, RuntimeDomain};
use crate::admin_security::{
    require_admin_session as require_admin_session_shared,
    require_session as require_session_shared, RequestParams, SessionState,
};
use crate::config_kv::{config_string, read_config, update_config_value, write_config};
use crate::markdown_content::{normalize_post_type, normalize_tags, read_markdown_front_matter};
pub use crate::runtime_types::CgiResponse;
use crate::runtime_types::RuntimeError;
use crate::site_runtime::{
    env_path, looks_like_git_checkout, resolve_generated_root, resolve_site_identity,
    resolve_sites_data_dir, resolve_state_dir,
};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use mime_guess::MimeGuess;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::env;
use std::fs;
use std::io::{self, Write};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::process::Stdio;
use std::thread;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
use time::format_description::FormatItem;
use time::macros::format_description;
use time::OffsetDateTime;

static RFC3339_FORMAT: &[FormatItem<'static>] =
    format_description!("[year]-[month]-[day]T[hour]:[minute]:[second]Z");

pub type AdminError = RuntimeError;

type Result<T> = std::result::Result<T, AdminError>;

pub fn run_action(action: &str) -> Result<CgiResponse> {
    if !action_allowed(RuntimeDomain::Admin, action) {
        return Err(AdminError::new(
            "bad_action",
            "Unknown Gazeta admin action.",
        ));
    }
    match action {
        "blog-manage-post" => blog_manage_post().map(CgiResponse::json),
        "blog-create-draft-from-post" => blog_create_draft_from_post().map(CgiResponse::json),
        "blog-payments" => blog_payments().map(CgiResponse::json),
        "blog-publish-nostr-page" => blog_publish_nostr_page().map(CgiResponse::json),
        "blog-save-post" => blog_save_post().map(CgiResponse::json),
        "blog-unqueue-draft" => blog_unqueue_draft().map(CgiResponse::json),
        "blog-delete-draft" => blog_delete_draft().map(CgiResponse::json),
        "blog-crosspost-post" => blog_crosspost_post().map(CgiResponse::json),
        "blog-secure-chat-admin" => blog_secure_chat_admin().map(CgiResponse::json),
        "blog-video-chat-control" => blog_video_chat_control().map(CgiResponse::json),
        "blog-list-files" => blog_list_files().map(CgiResponse::json),
        "blog-upload-media" => blog_upload_media().map(CgiResponse::json),
        "blog-update-file" => blog_update_file().map(CgiResponse::json),
        "blog-set-file-visibility" => blog_set_file_visibility().map(CgiResponse::json),
        "blog-delete-file" => blog_delete_file().map(CgiResponse::json),
        _ => Err(AdminError::new(
            "bad_action",
            "Unknown Gazeta admin action.",
        )),
    }
}

fn blog_manage_post() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let session = require_admin_session(&paths, &request, false)?;
    let _ = session;

    let action = request
        .value("action")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AdminError::new("missing_params", "action and post_path are required"))?;
    let post_path = request
        .value("post_path")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AdminError::new("missing_params", "action and post_path are required"))?;

    let file = resolve_post_markdown_file(&paths, &post_path)
        .ok_or_else(|| AdminError::new("not_found", "Post not found"))?;
    let managed_rel = managed_post_rel_path_for_file(&paths, &file)
        .ok_or_else(|| AdminError::new("invalid_post_path", "Invalid post path"))?;
    let front_matter = read_front_matter(&file);

    match action.as_str() {
        "delete" => {
            if boolish(front_matter.get("nostr_projection").map(String::as_str)) {
                return Err(AdminError::new(
                    "use_hide",
                    "Nostr-projected posts cannot be deleted directly; hide them from this site instead",
                ));
            }
            let rel_post = managed_rel.strip_prefix("posts/").unwrap_or(&managed_rel);
            let html_file = paths
                .generated_build_pages_dir
                .join("posts")
                .join(rel_post.trim_end_matches(".md"))
                .with_extension("html");
            let _ = fs::remove_file(&file);
            let _ = fs::remove_file(&html_file);
            Ok(json!({
                "success": true,
                "message": "Post deleted",
                "post_path": managed_rel,
            }))
        }
        "hide" => {
            let nostr_address =
                post_nostr_address_for_file(&paths, &file, &managed_rel, &front_matter);
            if nostr_address.is_empty() {
                return Err(AdminError::new(
                    "hide_not_supported",
                    "Only Nostr-projected posts can be hidden",
                ));
            }
            append_unique_line(&paths.nostr_hidden_posts_file(), &nostr_address)?;
            let _ = fs::remove_file(&file);
            Ok(json!({
                "success": true,
                "message": "Post hidden from this site",
                "post_path": managed_rel,
            }))
        }
        _ => Err(AdminError::new("invalid_action", "Unknown action")),
    }
}

fn blog_create_draft_from_post() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let session = require_admin_session(&paths, &request, false)?;

    let raw_post_path = request.value("post_path").unwrap_or_default();
    if raw_post_path.is_empty() {
        return Err(AdminError::new(
            "missing_post_path",
            "post_path is required",
        ));
    }
    let post_path = normalize_requested_post_path(&raw_post_path)
        .ok_or_else(|| AdminError::new("invalid_post_path", "Invalid post path"))?;
    let file = resolve_post_markdown_file(&paths, &post_path)
        .ok_or_else(|| AdminError::new("not_found", "Post not found"))?;
    let post_path = managed_post_rel_path_for_file(&paths, &file)
        .ok_or_else(|| AdminError::new("invalid_post_path", "Invalid post path"))?;
    let doc = MarkdownDoc::from_path(&file)
        .ok_or_else(|| AdminError::new("not_found", "Post not found"))?;

    let draft_id = random_hex(12)?;
    let author = if doc.author().is_empty() {
        publish_name_for_user(&paths, &session.username)
    } else {
        doc.author()
    };
    let tags = normalize_tags(doc.front_matter("tags").unwrap_or_default());
    let summary = doc.front_matter("summary").unwrap_or_default();
    let content = doc.content.clone();
    let post_type = doc.post_type();
    let post_filename = normalize_post_filename(&post_path).unwrap_or_default();
    let origin_platforms = origin_post_platforms_for_path(&paths, &post_path);
    save_draft(
        &paths,
        DraftSaveParams {
            draft_id: draft_id.clone(),
            title: doc.title_or("Untitled"),
            tags,
            summary,
            content,
            author,
            publish_mode: "draft".to_string(),
            scheduled_at: String::new(),
            status: "draft".to_string(),
            post_type,
            source_post_path: post_path,
            post_filename,
            origin_platforms,
        },
    )?;

    Ok(json!({
        "success": true,
        "draft_id": draft_id,
        "message": "Draft created from published post.",
    }))
}

fn blog_unqueue_draft() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request, true)?;

    let draft_id = request.value("draft_id").unwrap_or_default();
    if draft_id.is_empty() {
        return Err(AdminError::new("invalid_request", "draft_id is required"));
    }
    let draft = find_draft_by_id(&paths, &draft_id)
        .ok_or_else(|| AdminError::new("not_found", "Draft not found"))?;
    let raw_origin_platforms = draft
        .front_matter_raw("origin_platforms")
        .unwrap_or_default();
    let enabled_origin_platforms = origin_enabled_platforms(&paths);
    let mut origin_platforms =
        normalize_origin_platforms(raw_origin_platforms.clone(), &enabled_origin_platforms);
    if origin_platforms.is_empty() && raw_origin_platforms.is_empty() {
        origin_platforms = origin_default_platforms(&paths, &enabled_origin_platforms);
    }
    let tags = normalize_tags(draft.front_matter("tags").unwrap_or_default());
    let summary = draft.front_matter("summary").unwrap_or_default();
    let content = draft.content.clone();
    let author = draft.front_matter("author").unwrap_or_default();
    let post_type = draft.post_type();
    let source_post_path = draft.front_matter("source_post_path").unwrap_or_default();
    let post_filename = draft.post_filename();

    save_draft(
        &paths,
        DraftSaveParams {
            draft_id: draft_id.clone(),
            title: draft.title_or("Untitled Draft"),
            tags,
            summary,
            content,
            author,
            publish_mode: "draft".to_string(),
            scheduled_at: String::new(),
            status: "draft".to_string(),
            post_type,
            source_post_path,
            post_filename,
            origin_platforms,
        },
    )?;

    Ok(json!({
        "success": true,
        "message": "Draft moved back to drafts",
        "draft_id": draft_id,
    }))
}

fn blog_save_post() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let session = require_admin_session(&paths, &request, true)?;

    let mut action = request.value("action").unwrap_or_default();
    let mut draft_id = request.value("draft_id").unwrap_or_default();
    let mut title = request.value("title").unwrap_or_default();
    let mut tags = request.value("tags").unwrap_or_default();
    let mut content = request.value("content").unwrap_or_default();
    let mut publish_mode = request.value("publish_mode").unwrap_or_default();
    let publish_destination =
        normalize_publish_destination(&request.value("publish_destination").unwrap_or_default());
    let mut scheduled_at = request.value("scheduled_at").unwrap_or_default();
    let mut post_type = request.value("post_type").unwrap_or_default();
    let visibility = request.value("visibility").unwrap_or_default();
    let mut source_post_path = request.value("source_post_path").unwrap_or_default();
    let mut post_filename = request.value("post_filename").unwrap_or_default();
    let mut origin_platforms_raw = request.value("origin_platforms").unwrap_or_default();
    let mut existing_publish_mode = String::new();
    let mut existing_status = String::new();

    if action.is_empty() {
        action = if visibility == "public" {
            "publish_now".to_string()
        } else {
            "save_draft".to_string()
        };
    }
    if publish_mode.is_empty() {
        publish_mode = match action.as_str() {
            "queue_scheduled" => "scheduled",
            "queue_drip" => "drip",
            "publish_now" => "immediate",
            _ => "draft",
        }
        .to_string();
    }

    let draft = if !draft_id.is_empty() {
        find_draft_by_id(&paths, &draft_id)
    } else {
        None
    };
    if draft_id.is_empty() {
        draft_id = random_hex(12)?;
    }
    if let Some(draft) = draft.as_ref() {
        if title.is_empty() {
            title = draft.title_or("Untitled Draft");
        }
        if tags.is_empty() {
            tags = draft.front_matter("tags").unwrap_or_default();
        }
        if content.is_empty() {
            content = draft.content.clone();
        }
        if scheduled_at.is_empty() {
            scheduled_at = draft.front_matter("scheduled_at").unwrap_or_default();
        }
        if post_type.is_empty() {
            post_type = draft.post_type();
        }
        if source_post_path.is_empty() {
            source_post_path = draft.front_matter("source_post_path").unwrap_or_default();
        }
        if post_filename.is_empty() {
            post_filename = draft.post_filename();
        }
        if origin_platforms_raw.is_empty() {
            origin_platforms_raw = draft
                .front_matter_raw("origin_platforms")
                .unwrap_or_default();
        }
        existing_publish_mode = draft.front_matter("publish_mode").unwrap_or_default();
        existing_status = draft.front_matter("status").unwrap_or_default();
    }

    if title.is_empty() {
        title = "Untitled Draft".to_string();
    }
    if !source_post_path.is_empty() {
        source_post_path = normalize_requested_post_path(&source_post_path).ok_or_else(|| {
            AdminError::new("invalid_source_post_path", "Invalid source post path")
        })?;
    }
    if !post_filename.is_empty() {
        post_filename = normalize_post_filename(&post_filename).ok_or_else(|| {
            AdminError::new("invalid_post_filename", "Invalid post filename/slug")
        })?;
        let requested_rel_path = format!("posts/{post_filename}.md");
        if managed_page_path(&paths, &requested_rel_path).is_some_and(|path| path.is_file())
            && (source_post_path.is_empty() || requested_rel_path != source_post_path)
        {
            return Err(AdminError::new(
                "post_filename_exists",
                "Post filename already exists",
            ));
        }
    }

    let summary = auto_summary_from_content(&content);
    let normalized_tags = normalize_tags(&tags);
    let post_type = normalize_post_type(&post_type);
    let author_name = publish_name_for_user(&paths, &session.username);
    let enabled_origin_platforms = origin_enabled_platforms(&paths);
    let mut origin_platforms =
        normalize_origin_platforms(origin_platforms_raw.clone(), &enabled_origin_platforms);
    if origin_platforms.is_empty() && origin_platforms_raw.is_empty() {
        origin_platforms = origin_default_platforms(&paths, &enabled_origin_platforms);
    }

    match action.as_str() {
        "publish_now" => {
            if content.is_empty() {
                return Err(AdminError::new(
                    "content_required",
                    "Content is required to publish",
                ));
            }
            let function = if publish_destination == "nostr_now" {
                "blog_publish_content_nostr"
            } else {
                "blog_publish_content_markdown"
            };
            let filename = run_blog_lib_function(
                function,
                &[
                    title.clone(),
                    normalized_tags.clone(),
                    summary.clone(),
                    content.clone(),
                    author_name.clone(),
                    draft_id.clone(),
                    "immediate".to_string(),
                    String::new(),
                    post_type.clone(),
                    source_post_path.clone(),
                    post_filename.clone(),
                ],
            )
            .map_err(|message| {
                if function == "blog_publish_content_nostr" {
                    let reason = run_blog_lib_function("blog_nostr_publish_diagnostic", &[])
                        .unwrap_or_default();
                    if reason.is_empty() {
                        AdminError::new(
                            "nostr_publish_failed",
                            "Publish to Nostr failed. Check Nostr bridge key/relay configuration.",
                        )
                    } else {
                        AdminError::new(
                            "nostr_publish_failed",
                            format!("Publish to Nostr failed: {reason}"),
                        )
                    }
                } else if message.contains("post_filename_exists") {
                    AdminError::new("post_filename_exists", "Post filename already exists")
                } else {
                    AdminError::new("publish_failed", "Publish failed.")
                }
            })?;
            let published_rel_path = format!("posts/{filename}");
            move_origin_post_platforms(&paths, &source_post_path, &published_rel_path)?;
            save_origin_post_platforms(&paths, &published_rel_path, &origin_platforms)?;
            delete_draft_file(&paths, &draft_id)?;
            let _ = run_blog_lib_function("blog_run_build_async", &[]);

            let mut publish_message = if publish_destination == "nostr_now" {
                "Post published to Nostr".to_string()
            } else {
                "Post published".to_string()
            };
            if !origin_platforms.is_empty() {
                let published_file = managed_page_path(&paths, &published_rel_path)
                    .ok_or_else(|| AdminError::new("publish_failed", "Publish failed."))?;
                if origin_dir().is_none() {
                    publish_message.push_str(
                        " Origin is not available on this server, so cross-posting was skipped.",
                    );
                } else if !published_file.is_file() {
                    publish_message.push_str(
                        " Cross-posting was skipped because the published post file is not available yet.",
                    );
                } else if let Some(origin_results) =
                    origin_emit_file_json(&paths, &published_file, &origin_platforms)
                {
                    let results_rows = origin_results
                        .get("results")
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    let published_count = results_rows
                        .iter()
                        .filter(|row| {
                            row.get("status").and_then(Value::as_str) == Some("published")
                        })
                        .count();
                    let failed_count = results_rows
                        .iter()
                        .filter(|row| row.get("status").and_then(Value::as_str) == Some("failed"))
                        .count();
                    if failed_count > 0 {
                        publish_message.push_str(&format!(
                            " Cross-posted to {published_count} site(s); {failed_count} site(s) failed."
                        ));
                    } else {
                        publish_message
                            .push_str(&format!(" Cross-posted to {published_count} site(s)."));
                    }
                } else {
                    publish_message.push_str(" Cross-posting could not be completed.");
                }
            }

            Ok(json!({
                "success": true,
                "message": publish_message,
                "filename": filename,
                "draft_id": draft_id,
                "publish_mode_used": if publish_destination == "nostr_now" { "nostr" } else { "local" },
            }))
        }
        "queue_scheduled" => {
            if scheduled_at.is_empty() {
                return Err(AdminError::new(
                    "scheduled_at_required",
                    "scheduled_at is required for scheduled posts",
                ));
            }
            if content.is_empty() {
                return Err(AdminError::new("content_required", "Content is required"));
            }
            save_draft(
                &paths,
                DraftSaveParams {
                    draft_id: draft_id.clone(),
                    title,
                    tags: normalized_tags,
                    summary,
                    content,
                    author: author_name,
                    publish_mode: "scheduled".to_string(),
                    scheduled_at,
                    status: "scheduled".to_string(),
                    post_type,
                    source_post_path,
                    post_filename,
                    origin_platforms,
                },
            )?;
            Ok(json!({
                "success": true,
                "message": "Draft scheduled",
                "draft_id": draft_id,
                "status": "scheduled",
            }))
        }
        "queue_drip" => {
            if content.is_empty() {
                return Err(AdminError::new("content_required", "Content is required"));
            }
            save_draft(
                &paths,
                DraftSaveParams {
                    draft_id: draft_id.clone(),
                    title,
                    tags: normalized_tags,
                    summary,
                    content,
                    author: author_name,
                    publish_mode: "drip".to_string(),
                    scheduled_at: String::new(),
                    status: "queued".to_string(),
                    post_type,
                    source_post_path,
                    post_filename,
                    origin_platforms,
                },
            )?;
            Ok(json!({
                "success": true,
                "message": "Draft queued for drip",
                "draft_id": draft_id,
                "status": "queued",
            }))
        }
        "autosave" | "save_draft" | "save" => {
            let mut effective_publish_mode = publish_mode;
            let mut status = "draft".to_string();
            if effective_publish_mode == "immediate" {
                effective_publish_mode = "draft".to_string();
            }
            if action == "autosave" {
                if existing_publish_mode == "drip" && existing_status == "queued" {
                    effective_publish_mode = "drip".to_string();
                    status = "queued".to_string();
                    scheduled_at.clear();
                } else if existing_publish_mode == "scheduled" && existing_status == "scheduled" {
                    effective_publish_mode = "scheduled".to_string();
                    status = "scheduled".to_string();
                }
            }
            if status == "draft" && matches!(effective_publish_mode.as_str(), "scheduled" | "drip")
            {
                effective_publish_mode = "draft".to_string();
            }
            save_draft(
                &paths,
                DraftSaveParams {
                    draft_id: draft_id.clone(),
                    title,
                    tags: normalized_tags,
                    summary,
                    content,
                    author: author_name,
                    publish_mode: effective_publish_mode,
                    scheduled_at,
                    status: status.clone(),
                    post_type,
                    source_post_path,
                    post_filename,
                    origin_platforms,
                },
            )?;
            Ok(json!({
                "success": true,
                "message": "Draft saved",
                "draft_id": draft_id,
                "status": status,
                "autosaved": action == "autosave",
            }))
        }
        _ => Err(AdminError::new("invalid_action", "Unknown action")),
    }
}

fn blog_publish_nostr_page() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    if !plugin_enabled(&paths, "nostr_posts") {
        return Err(AdminError::new(
            "plugin_disabled",
            "Nostr-backed pages plugin is disabled for this site",
        ));
    }
    let request = RequestParams::from_env_and_stdin();
    let session = require_session(&paths, &request, true, true)?;
    let raw_slug = request
        .value("page_slug")
        .or_else(|| request.value("list_slug"))
        .unwrap_or_default();
    let preview_only = request.value("preview_only").unwrap_or_default();
    let event_json = request
        .value("event_json")
        .filter(|value| !value.is_empty())
        .map(|value| {
            serde_json::from_str::<Value>(&value)
                .map(|json| json.to_string())
                .map_err(|_| AdminError::new("invalid_event_json", "event_json must be valid JSON"))
        })
        .transpose()?
        .unwrap_or_default();
    let response = run_publish_nostr_page_bridge(
        &[raw_slug, preview_only, event_json],
        &[
            ("BLOG_SESSION_USERNAME", session.username),
            ("BLOG_SESSION_USER_PUBKEY", session.user_pubkey),
        ],
    )
    .map_err(|message| AdminError::new("publish_failed", message))?;
    Ok(response)
}

fn blog_payments() -> Result<Value> {
    let request = RequestParams::from_env_and_stdin();
    let response = run_payments_bridge(&request)
        .map_err(|message| AdminError::new("payments_failed", message))?;
    Ok(response)
}

fn blog_delete_draft() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request, true)?;

    let draft_id = request.value("draft_id").unwrap_or_default();
    if draft_id.is_empty() {
        return Err(AdminError::new("invalid_request", "draft_id is required"));
    }
    let draft_path = resolve_draft_path(&paths, &draft_id)
        .ok_or_else(|| AdminError::new("not_found", "Draft not found"))?;
    clear_draft_refs(&paths, &draft_id)?;
    let _ = fs::remove_file(&draft_path);
    let direct_path = paths.drafts_dir().join(format!("{draft_id}.md"));
    if direct_path != draft_path {
        let _ = fs::remove_file(direct_path);
    }

    Ok(json!({
        "success": true,
        "deleted": true,
        "draft_id": draft_id,
    }))
}

fn blog_crosspost_post() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request, true)?;

    let raw_post_path = request.value("post_path").unwrap_or_default();
    if raw_post_path.is_empty() {
        return Err(AdminError::new(
            "missing_post_path",
            "post_path is required",
        ));
    }
    let requested_post_path = normalize_requested_post_path(&raw_post_path)
        .ok_or_else(|| AdminError::new("invalid_post_path", "Invalid post path"))?;
    let file = resolve_post_markdown_file(&paths, &requested_post_path)
        .ok_or_else(|| AdminError::new("not_found", "Post not found"))?;
    let rel_path = managed_post_rel_path_for_file(&paths, &file)
        .ok_or_else(|| AdminError::new("invalid_post_path", "Invalid post path"))?;
    if origin_dir().is_none() {
        return Err(AdminError::new(
            "origin_unavailable",
            "Origin is not available on this server",
        ));
    }

    let site_enabled_platforms = origin_enabled_platforms(&paths);
    let requested_platforms = normalize_origin_platforms(
        request.value("platforms").unwrap_or_default(),
        &site_enabled_platforms,
    );
    if requested_platforms.is_empty() {
        return Err(AdminError::new(
            "platforms_required",
            "Select at least one cross-post destination",
        ));
    }

    let mut next_platforms = origin_post_platforms_for_path(&paths, &rel_path);
    for platform in &requested_platforms {
        if !next_platforms.contains(platform) {
            next_platforms.push(platform.clone());
        }
    }
    next_platforms.sort();
    save_origin_post_platforms(&paths, &rel_path, &next_platforms)?;

    let results = origin_emit_file_json(&paths, &file, &requested_platforms).ok_or_else(|| {
        AdminError::new("crosspost_failed", "Cross-posting could not be completed")
    })?;
    let results_rows = results
        .get("results")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let published_count = results_rows
        .iter()
        .filter(|row| row.get("status").and_then(Value::as_str) == Some("published"))
        .count();
    let failed_count = results_rows
        .iter()
        .filter(|row| row.get("status").and_then(Value::as_str) == Some("failed"))
        .count();
    let message = if failed_count > 0 {
        format!("Cross-posted to {published_count} site(s); {failed_count} site(s) failed.")
    } else {
        format!("Cross-posted to {published_count} site(s).")
    };

    Ok(json!({
        "success": true,
        "message": message,
        "results": results,
        "crossposting": origin_crossposting_summary_for_file(&paths, &file, &rel_path),
    }))
}

fn blog_secure_chat_admin() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_session(&paths, &request, true, false)?;

    let action = request.value("action").unwrap_or_default();
    let npub = request.value("npub").unwrap_or_default();
    let since_seq = request
        .value("since_seq")
        .unwrap_or_default()
        .parse::<u64>()
        .unwrap_or(0);
    let payload = json!({
        "action": if action.is_empty() { "status".to_string() } else { action },
        "npub": npub,
        "sinceSeq": since_seq,
    });
    let response = secure_chat_service_request_json(&paths, "POST", "/admin", Some(&payload))
        .ok_or_else(|| {
            AdminError::new(
                "service_unavailable",
                "Secure Chat admin service is unavailable",
            )
        })?;
    Ok(response)
}

fn blog_video_chat_control() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    if !plugin_enabled(&paths, "video_chat") {
        return Err(AdminError::new(
            "plugin_disabled",
            "Video calling plugin is disabled for this site",
        ));
    }
    let request = RequestParams::from_env_and_stdin();
    let action = normalize_video_chat_action(request.value("action").unwrap_or_default());
    let require_admin = matches!(
        action.as_str(),
        "admin_status" | "admin_call_user" | "admin_cancel_call"
    );
    let session = require_session(&paths, &request, require_admin, false)?;
    let state = VideoChatState::new(&paths)?;
    state.cleanup_stale()?;

    match action.as_str() {
        "status" => state.video_chat_status(&session),
        "heartbeat" => state.video_chat_heartbeat(&session, &request),
        "set_preference" => state.video_chat_set_preference(&session, &request),
        "admin_status" => state.video_chat_admin_status(&session),
        "admin_call_user" => state.video_chat_admin_call_user(&session, &request),
        "answer_call" => state.video_chat_answer_call(&session, &request),
        "decline_call" => state.video_chat_decline_call(&session, &request),
        "admin_cancel_call" => state.video_chat_admin_cancel_call(&session, &request),
        _ => Err(AdminError::new(
            "unknown_action",
            "Unknown video calling action",
        )),
    }
}

fn blog_upload_media() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let session = require_admin_session(&paths, &request, true)?;

    let filename = request
        .value("filename")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AdminError::new("invalid_request", "filename and data_base64 are required")
        })?;
    let mime_type = request.value("mime_type").unwrap_or_default();
    let draft_id = request.value("draft_id").unwrap_or_default();
    let mut data_b64 = request.value("data_base64").unwrap_or_default();
    if filename.is_empty() || data_b64.is_empty() {
        return Err(AdminError::new(
            "invalid_request",
            "filename and data_base64 are required",
        ));
    }
    if let Some((_, payload)) = data_b64.split_once("base64,") {
        data_b64 = payload.to_string();
    }
    if data_b64.len() > 28_000_000 {
        return Err(AdminError::new("file_too_large", "Upload too large"));
    }

    fs::create_dir_all(paths.files_dir()).map_err(io_error(
        "file_storage_unavailable",
        "Could not create file storage",
    ))?;
    fs::create_dir_all(paths.file_records_dir()).map_err(io_error(
        "file_storage_unavailable",
        "Could not create file storage",
    ))?;

    let safe_name = unique_storage_name(&paths, &filename);
    let file_id = random_hex(18)?;
    let dest = paths.files_dir().join(&safe_name);
    let bytes = BASE64_STANDARD
        .decode(data_b64.as_bytes())
        .map_err(|_| AdminError::new("decode_error", "Failed to decode upload"))?;
    fs::write(&dest, bytes).map_err(io_error("decode_error", "Failed to decode upload"))?;
    let mut perms = fs::metadata(&dest)
        .map_err(io_error("decode_error", "Failed to decode upload"))?
        .permissions();
    perms.set_mode(0o600);
    let _ = fs::set_permissions(&dest, perms);
    let size_bytes = fs::metadata(&dest)
        .map_err(io_error("decode_error", "Failed to decode upload"))?
        .len();
    let mime_type = if mime_type.is_empty() {
        MimeGuess::from_path(&safe_name)
            .first_raw()
            .unwrap_or("application/octet-stream")
            .to_string()
    } else {
        mime_type
    };
    let now = now_iso()?;
    write_record(
        &paths.file_record_path(&file_id),
        &[
            ("file_id", file_id.as_str()),
            ("storage_rel", safe_name.as_str()),
            ("original_name", filename.as_str()),
            ("safe_name", safe_name.as_str()),
            ("mime_type", mime_type.as_str()),
            ("size_bytes", &size_bytes.to_string()),
            ("created_at", now.as_str()),
            ("updated_at", now.as_str()),
            ("draft_id", draft_id.as_str()),
            ("post_path", ""),
            ("explicit_public", "false"),
        ],
    )?;

    Ok(json!({
        "success": true,
        "file_id": file_id,
        "url": file_public_url(&file_id, &safe_name),
        "filename": safe_name,
        "is_public": false,
        "session_username": session.username,
    }))
}

fn blog_list_files() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request, true)?;

    index_untracked_files(&paths)?;
    let mut files = load_file_records(&paths);
    files.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.file_id.cmp(&left.file_id))
    });

    let files = files
        .into_iter()
        .map(|record| {
            let effective_public = file_is_public_effective(&paths, &record);
            json!({
                "file_id": record.file_id,
                "original_name": record.original_name,
                "safe_name": record.safe_name,
                "mime_type": record.mime_type,
                "size_bytes": record.size_bytes,
                "created_at": record.created_at,
                "draft_id": record.draft_id,
                "post_path": record.post_path,
                "explicit_public": record.explicit_public,
                "effective_public": effective_public,
                "public_path": record.public_path,
                "url": file_public_url_for_record(&paths, &record),
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "success": true,
        "files": files,
    }))
}

fn blog_update_file() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request, true)?;

    let file_id = request.value("file_id").unwrap_or_default();
    let record_path = paths.file_record_path(&file_id);
    let mut record = FileRecord::from_path(&record_path)
        .ok_or_else(|| AdminError::new("not_found", "File not found"))?;

    let mut safe_name = request.value("safe_name").unwrap_or_default();
    if safe_name.is_empty() {
        safe_name = record.safe_name.clone();
    }
    safe_name = basename_safe(&safe_name);
    if is_invalid_basename(&safe_name) {
        return Err(AdminError::new("invalid_filename", "Filename is required"));
    }

    let mut original_name = request.value("original_name").unwrap_or_default();
    if original_name.is_empty() {
        original_name = if record.original_name.is_empty() {
            safe_name.clone()
        } else {
            record.original_name.clone()
        };
    }
    original_name = basename_safe(&original_name);
    if is_invalid_basename(&original_name) {
        original_name = safe_name.clone();
    }

    let mut mime_type = request.value("mime_type").unwrap_or_default();
    if mime_type.is_empty() {
        let disk_path = file_disk_path(&paths, &record).unwrap_or_else(|| paths.files_dir());
        mime_type = MimeGuess::from_path(disk_path)
            .first_raw()
            .unwrap_or("application/octet-stream")
            .to_string();
    }
    if !mime_type.contains('/') {
        return Err(AdminError::new(
            "invalid_mime_type",
            "MIME type must look like type/subtype",
        ));
    }
    if mime_type
        .chars()
        .any(|ch| ch.is_whitespace() || ch == '"' || ch == '\'')
    {
        return Err(AdminError::new(
            "invalid_mime_type",
            "MIME type contains invalid characters",
        ));
    }

    let mut public_path = request.value("public_path").unwrap_or_default();
    if !public_path.is_empty() {
        public_path = basename_safe(&public_path);
        if !valid_public_alias(&public_path) {
            return Err(AdminError::new(
                "invalid_public_path",
                "Public path is reserved or invalid",
            ));
        }
    }
    let candidate_public_path = if public_path.is_empty() {
        safe_name.clone()
    } else {
        public_path.clone()
    };
    if valid_public_alias(&candidate_public_path)
        && !public_path_available(&paths, &candidate_public_path, &record.file_id)
    {
        return Err(AdminError::new(
            "public_path_conflict",
            "Another file already uses that public path",
        ));
    }

    let explicit_public = match request
        .value("explicit_public")
        .unwrap_or_default()
        .as_str()
    {
        "true" | "1" | "yes" | "on" => true,
        "false" | "0" | "no" | "off" | "" => false,
        _ => {
            return Err(AdminError::new(
                "invalid_visibility",
                "Invalid visibility value",
            ))
        }
    };

    record.original_name = original_name;
    record.safe_name = safe_name;
    record.mime_type = mime_type;
    record.public_path = public_path;
    record.explicit_public = explicit_public;
    record.updated_at = now_iso()?;
    record.write_to(&record_path)?;
    let _ = sync_public_file_aliases(&paths);

    let effective_public = file_is_public_effective(&paths, &record);
    Ok(json!({
        "success": true,
        "file_id": record.file_id,
        "original_name": record.original_name,
        "safe_name": record.safe_name,
        "mime_type": record.mime_type,
        "public_path": record.public_path,
        "explicit_public": record.explicit_public,
        "effective_public": effective_public,
        "url": file_public_url_for_record(&paths, &record),
    }))
}

fn blog_set_file_visibility() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request, true)?;

    let file_id = request.value("file_id").unwrap_or_default();
    let record_path = paths.file_record_path(&file_id);
    let mut record = FileRecord::from_path(&record_path)
        .ok_or_else(|| AdminError::new("not_found", "File not found"))?;

    record.explicit_public = match request.value("make_public").unwrap_or_default().as_str() {
        "true" | "1" | "yes" | "on" => true,
        "false" | "0" | "no" | "off" | "" => false,
        _ => {
            return Err(AdminError::new(
                "invalid_visibility",
                "Invalid visibility value",
            ))
        }
    };
    record.updated_at = now_iso()?;
    record.write_to(&record_path)?;
    let _ = sync_public_file_aliases(&paths);

    let effective_public = file_is_public_effective(&paths, &record);
    Ok(json!({
        "success": true,
        "file_id": record.file_id,
        "explicit_public": record.explicit_public,
        "effective_public": effective_public,
        "url": file_public_url_for_record(&paths, &record),
    }))
}

fn blog_delete_file() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request, true)?;

    let file_id = request.value("file_id").unwrap_or_default();
    let record_path = paths.file_record_path(&file_id);
    let record = FileRecord::from_path(&record_path)
        .ok_or_else(|| AdminError::new("not_found", "File not found"))?;

    if let Some(path) = file_disk_path(&paths, &record).filter(|path| path.is_file()) {
        let _ = fs::remove_file(path);
    }
    fs::remove_file(&record_path)
        .map_err(io_error("delete_failed", "Failed to delete file metadata"))?;
    let _ = sync_public_file_aliases(&paths);

    Ok(json!({
        "success": true,
        "file_id": record.file_id,
    }))
}

struct SitePaths {
    site_conf: PathBuf,
    pages_dir: PathBuf,
    state_dir: PathBuf,
    build_dir: PathBuf,
    posts_dir: PathBuf,
    posts_store_dir: PathBuf,
    generated_build_pages_dir: PathBuf,
}

impl SitePaths {
    fn from_env() -> Result<Self> {
        let identity = resolve_site_identity(false, "default")
            .map_err(|error| AdminError::new(error.code, error.message))?;
        let default_sites_data_dir = identity.sites_dir.join(".sitedata");
        let sites_data_dir = resolve_sites_data_dir(&identity.sites_dir, &default_sites_data_dir);
        let state_dir = resolve_state_dir(
            &identity.site_root,
            &identity.site_name,
            &sites_data_dir,
            &default_sites_data_dir,
        );
        let generated_root = resolve_generated_root(&identity.site_root, &identity.site_name);
        let pages_dir = if let Some(path) = env_path("WIZARDRY_PAGES_DIR") {
            path
        } else if looks_like_git_checkout(&identity.site_root) {
            generated_root.join("pages")
        } else {
            identity.site_root.join("site/pages")
        };
        let build_dir = if let Some(path) = env_path("WIZARDRY_BUILD_DIR") {
            path
        } else if looks_like_git_checkout(&identity.site_root) {
            generated_root.join("build")
        } else {
            identity.site_root.join("build")
        };
        let posts_dir = pages_dir.join("posts");
        let posts_store_dir = state_dir.join("content/posts");
        let generated_build_pages_dir = build_dir.join("pages");
        Ok(Self {
            site_conf: identity.site_root.join("site.conf"),
            pages_dir,
            state_dir,
            build_dir,
            posts_dir,
            posts_store_dir,
            generated_build_pages_dir,
        })
    }

    fn users_dir(&self) -> PathBuf {
        self.state_dir.join("ssh-auth/users")
    }

    fn drafts_dir(&self) -> PathBuf {
        self.state_dir.join("content/drafts")
    }

    fn sessions_dir(&self) -> PathBuf {
        self.state_dir.join("ssh-auth/sessions")
    }

    fn files_dir(&self) -> PathBuf {
        self.state_dir.join("files")
    }

    fn file_records_dir(&self) -> PathBuf {
        self.state_dir.join(".files/records")
    }

    fn file_record_path(&self, file_id: &str) -> PathBuf {
        self.file_records_dir().join(format!("{file_id}.conf"))
    }

    fn video_chat_dir(&self) -> PathBuf {
        self.state_dir.join("video-chat")
    }

    fn video_chat_presence_dir(&self) -> PathBuf {
        self.video_chat_dir().join("presence")
    }

    fn video_chat_calls_dir(&self) -> PathBuf {
        self.video_chat_dir().join("calls")
    }

    fn video_chat_rooms_dir(&self) -> PathBuf {
        self.video_chat_dir().join("rooms")
    }

    fn secure_chat_root(&self) -> PathBuf {
        self.state_dir.join("secure-chat")
    }

    fn secure_chat_runtime_dir(&self) -> PathBuf {
        self.secure_chat_root().join("runtime")
    }

    fn secure_chat_store_dir(&self) -> PathBuf {
        self.secure_chat_root().join("store")
    }

    fn secure_chat_contacts_dir(&self) -> PathBuf {
        self.secure_chat_store_dir().join("contacts")
    }

    fn secure_chat_messages_dir(&self) -> PathBuf {
        self.secure_chat_store_dir().join("messages")
    }

    fn secure_chat_meta_dir(&self) -> PathBuf {
        self.secure_chat_store_dir().join("meta")
    }

    fn secure_chat_uploads_dir(&self) -> PathBuf {
        self.secure_chat_root().join("uploads")
    }

    fn secure_chat_downloads_dir(&self) -> PathBuf {
        self.secure_chat_root().join("downloads")
    }

    fn secure_chat_socket_path(&self) -> PathBuf {
        self.secure_chat_runtime_dir().join("service.sock")
    }

    fn secure_chat_pid_path(&self) -> PathBuf {
        self.secure_chat_runtime_dir().join("service.pid")
    }

    fn secure_chat_log_path(&self) -> PathBuf {
        self.secure_chat_runtime_dir().join("service.log")
    }

    fn origin_dir(&self) -> PathBuf {
        self.state_dir.join("origin")
    }

    fn origin_posts_dir(&self) -> PathBuf {
        self.origin_dir().join("posts")
    }

    fn origin_state_dir(&self) -> PathBuf {
        self.origin_dir().join("state")
    }

    fn origin_site_config(&self) -> PathBuf {
        self.origin_dir().join("origin.json")
    }

    fn nostr_hidden_posts_file(&self) -> PathBuf {
        self.state_dir.join("nostr/state/hidden_posts.txt")
    }

    fn nostr_posts_index(&self) -> PathBuf {
        self.state_dir.join("nostr/derived/posts.json")
    }
}

struct Session {
    username: String,
}

fn require_admin_session(
    paths: &SitePaths,
    request: &RequestParams,
    require_interactive: bool,
) -> Result<Session> {
    let session = require_admin_session_shared(
        &paths.sessions_dir(),
        &paths.users_dir(),
        request,
        Some(43_200),
    )
    .map_err(|error| AdminError::new(error.code, error.message))?;
    if require_interactive && session.auth_method == "nostr_delegated" && session.force_interactive
    {
        return Err(AdminError::new(
            "interactive_signature_required",
            "This action requires direct signer approval. Sign in with Login with Nostr or Use phone signer (QR).",
        ));
    }
    Ok(Session {
        username: session.username,
    })
}

fn require_session(
    paths: &SitePaths,
    request: &RequestParams,
    require_admin: bool,
    require_interactive: bool,
) -> Result<SessionState> {
    let session = require_session_shared(
        &paths.sessions_dir(),
        &paths.users_dir(),
        request,
        Some(43_200),
        require_admin,
    )
    .map_err(|error| AdminError::new(error.code, error.message))?;
    if require_interactive && session.auth_method == "nostr_delegated" && session.force_interactive
    {
        return Err(AdminError::new(
            "interactive_signature_required",
            "This action requires direct signer approval. Sign in with Login with Nostr or Use phone signer (QR).",
        ));
    }
    Ok(session)
}

#[derive(Clone)]
struct MarkdownDoc {
    path: PathBuf,
    front_matter: BTreeMap<String, String>,
    front_matter_raw: BTreeMap<String, String>,
    content: String,
}

impl MarkdownDoc {
    fn from_path(path: &Path) -> Option<Self> {
        let parsed = read_markdown_front_matter(path)?;
        Some(Self {
            path: path.to_path_buf(),
            front_matter: parsed.parsed,
            front_matter_raw: parsed.raw,
            content: parsed.body,
        })
    }

    fn draft_id(&self) -> String {
        self.front_matter("draft_id").unwrap_or_else(|| {
            self.path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string()
        })
    }

    fn front_matter(&self, key: &str) -> Option<String> {
        self.front_matter.get(key).cloned()
    }

    fn front_matter_raw(&self, key: &str) -> Option<String> {
        self.front_matter_raw.get(key).cloned()
    }

    fn post_type(&self) -> String {
        normalize_post_type(
            self.front_matter("post_type")
                .filter(|value| !value.is_empty())
                .or_else(|| self.front_matter("type"))
                .unwrap_or_default(),
        )
    }

    fn title_or(&self, default: &str) -> String {
        self.front_matter("title")
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| default.to_string())
    }

    fn author(&self) -> String {
        self.front_matter("author").unwrap_or_default()
    }

    fn post_filename(&self) -> String {
        let stored = self.front_matter("post_filename").unwrap_or_default();
        if !stored.is_empty() {
            return stored;
        }
        normalize_post_filename(&self.front_matter("source_post_path").unwrap_or_default())
            .unwrap_or_default()
    }
}

struct DraftSaveParams {
    draft_id: String,
    title: String,
    tags: String,
    summary: String,
    content: String,
    author: String,
    publish_mode: String,
    scheduled_at: String,
    status: String,
    post_type: String,
    source_post_path: String,
    post_filename: String,
    origin_platforms: Vec<String>,
}

struct OriginPlatformMeta {
    id: String,
    family: String,
}

struct VideoChatState<'a> {
    paths: &'a SitePaths,
    now: u64,
    presence_ttl_seconds: u64,
    call_ttl_seconds: u64,
}

impl<'a> VideoChatState<'a> {
    fn new(paths: &'a SitePaths) -> Result<Self> {
        fs::create_dir_all(paths.video_chat_presence_dir()).map_err(io_error(
            "write_failed",
            "Could not prepare video chat presence directory",
        ))?;
        fs::create_dir_all(paths.video_chat_calls_dir()).map_err(io_error(
            "write_failed",
            "Could not prepare video chat calls directory",
        ))?;
        fs::create_dir_all(paths.video_chat_rooms_dir()).map_err(io_error(
            "write_failed",
            "Could not prepare video chat rooms directory",
        ))?;
        Ok(Self {
            paths,
            now: now_epoch(),
            presence_ttl_seconds: 90,
            call_ttl_seconds: 300,
        })
    }

    fn cleanup_stale(&self) -> Result<()> {
        for entry in fs::read_dir(self.paths.video_chat_presence_dir())
            .into_iter()
            .flatten()
            .flatten()
        {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("conf") {
                continue;
            }
            let updated = read_config(&path)
                .map(|config| config_string(&config, "updated_at"))
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(0);
            if updated < self.now.saturating_sub(self.presence_ttl_seconds) {
                let _ = fs::remove_file(path);
            }
        }
        for entry in fs::read_dir(self.paths.video_chat_calls_dir())
            .into_iter()
            .flatten()
            .flatten()
        {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("conf") {
                continue;
            }
            let config = read_config(&path).unwrap_or_default();
            let expires = config_string(&config, "expires_at")
                .parse::<u64>()
                .unwrap_or(0);
            let status = config_string(&config, "status");
            if expires < self.now || status == "expired" {
                let _ = fs::remove_file(path);
            }
        }
        Ok(())
    }

    fn video_chat_status(&self, session: &SessionState) -> Result<Value> {
        Ok(json!({
            "success": true,
            "username": session.username,
            "player_name": self.user_display_name(&session.username),
            "is_admin": session.is_admin,
            "allow_admin_calls": self.profile_allows_admin_calls(&session.username),
            "incoming_calls": self.calls_for_user(&session.username),
        }))
    }

    fn video_chat_heartbeat(
        &self,
        session: &SessionState,
        request: &RequestParams,
    ) -> Result<Value> {
        self.write_presence(session, request)?;
        self.video_chat_status(session)
    }

    fn video_chat_set_preference(
        &self,
        session: &SessionState,
        request: &RequestParams,
    ) -> Result<Value> {
        let allow = boolish(request.value("allow_admin_calls").as_deref());
        let profile = self.user_profile(&session.username);
        write_record(
            &profile,
            &[
                ("username", session.username.as_str()),
                (
                    "video_chat_allow_admin_calls",
                    if allow { "true" } else { "false" },
                ),
                ("updated_at", &now_iso()?),
            ],
        )?;
        self.write_presence(session, request)?;
        Ok(json!({
            "success": true,
            "allow_admin_calls": allow,
        }))
    }

    fn video_chat_admin_status(&self, session: &SessionState) -> Result<Value> {
        Ok(json!({
            "success": true,
            "now": self.now,
            "presence_ttl_seconds": self.presence_ttl_seconds,
            "call_ttl_seconds": self.call_ttl_seconds,
            "users": self.presence_list(&session.username),
            "rooms": self.room_list(),
            "calls": self.call_list(),
        }))
    }

    fn video_chat_admin_call_user(
        &self,
        session: &SessionState,
        request: &RequestParams,
    ) -> Result<Value> {
        let target = request
            .value("username")
            .unwrap_or_default()
            .replace(['\r', '\n'], "");
        if target.is_empty() || !self.user_profile(&target).is_file() {
            return Err(AdminError::new("unknown_user", "Unknown user"));
        }
        let self_test = target == session.username;
        if !self_test && !self.profile_allows_admin_calls(&target) {
            return Err(AdminError::new(
                "not_allowed",
                "This user has not allowed admin calls",
            ));
        }
        let presence = self.presence_path_for(&target);
        let updated = read_config(&presence)
            .map(|config| config_string(&config, "updated_at"))
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
        if updated < self.now.saturating_sub(self.presence_ttl_seconds) {
            return Err(AdminError::new(
                "not_online",
                "This user is not currently online",
            ));
        }
        let call_id = random_hex(12)?;
        let room_id = room_key(&format!(
            "admin-{}-{}-{}",
            session.username, target, call_id
        ));
        let room_password = random_hex(18)?;
        let room_path = self.room_path_for(&room_id);
        write_record(
            &room_path,
            &[
                ("room_id", room_id.as_str()),
                ("private_room", "true"),
                ("room_password", room_password.as_str()),
                ("created_at", &self.now.to_string()),
                ("updated_at", &self.now.to_string()),
            ],
        )?;
        let call_path = self.call_path_for(&call_id);
        write_record(
            &call_path,
            &[
                ("call_id", call_id.as_str()),
                ("room_id", room_id.as_str()),
                ("room_password", room_password.as_str()),
                ("private_room", "true"),
                ("from_admin", session.username.as_str()),
                (
                    "from_admin_name",
                    self.user_display_name(&session.username).as_str(),
                ),
                ("to_user", target.as_str()),
                ("to_user_name", self.user_display_name(&target).as_str()),
                ("status", "ringing"),
                ("call_mode", "video"),
                ("owner_call", "false"),
                ("self_test", if self_test { "true" } else { "false" }),
                ("created_at", &self.now.to_string()),
                (
                    "expires_at",
                    &(self.now + self.call_ttl_seconds).to_string(),
                ),
                ("answered_at", "0"),
            ],
        )?;
        Ok(json!({
            "success": true,
            "call": self.call_json(&call_path),
        }))
    }

    fn video_chat_answer_call(
        &self,
        session: &SessionState,
        request: &RequestParams,
    ) -> Result<Value> {
        let call_id = safe_key(&request.value("call_id").unwrap_or_default());
        let call_path = self.call_path_for(&call_id);
        let config = read_config(&call_path)
            .ok_or_else(|| AdminError::new("call_not_found", "Call was not found"))?;
        let to_user = config_string(&config, "to_user");
        if to_user != session.username {
            return Err(AdminError::new(
                "call_not_allowed",
                "Call is for a different user",
            ));
        }
        let expires = config_string(&config, "expires_at")
            .parse::<u64>()
            .unwrap_or(0);
        if expires < self.now {
            let _ = update_config_value(
                &call_path,
                "status",
                "expired",
                "Could not update call state",
            );
            return Err(AdminError::new("call_expired", "Call expired"));
        }
        update_config_value(
            &call_path,
            "status",
            "accepted",
            "Could not update call state",
        )
        .map_err(|error| AdminError::new(error.code, error.message))?;
        update_config_value(
            &call_path,
            "answered_at",
            &self.now.to_string(),
            "Could not update call state",
        )
        .map_err(|error| AdminError::new(error.code, error.message))?;
        let refreshed = read_config(&call_path).unwrap_or_default();
        let room_id = config_string(&refreshed, "room_id");
        let room_password = config_string(&refreshed, "room_password");
        Ok(json!({
            "success": true,
            "room_id": room_id,
            "room_password": room_password,
            "call": self.call_json(&call_path),
        }))
    }

    fn video_chat_decline_call(
        &self,
        session: &SessionState,
        request: &RequestParams,
    ) -> Result<Value> {
        let call_id = safe_key(&request.value("call_id").unwrap_or_default());
        let call_path = self.call_path_for(&call_id);
        let config = read_config(&call_path)
            .ok_or_else(|| AdminError::new("call_not_found", "Call was not found"))?;
        let to_user = config_string(&config, "to_user");
        if to_user != session.username {
            return Err(AdminError::new(
                "call_not_allowed",
                "Call is for a different user",
            ));
        }
        update_config_value(
            &call_path,
            "status",
            "declined",
            "Could not update call state",
        )
        .map_err(|error| AdminError::new(error.code, error.message))?;
        Ok(json!({
            "success": true,
            "call": self.call_json(&call_path),
        }))
    }

    fn video_chat_admin_cancel_call(
        &self,
        _session: &SessionState,
        request: &RequestParams,
    ) -> Result<Value> {
        let call_id = safe_key(&request.value("call_id").unwrap_or_default());
        let call_path = self.call_path_for(&call_id);
        read_config(&call_path)
            .ok_or_else(|| AdminError::new("call_not_found", "Call was not found"))?;
        update_config_value(
            &call_path,
            "status",
            "cancelled",
            "Could not update call state",
        )
        .map_err(|error| AdminError::new(error.code, error.message))?;
        Ok(json!({
            "success": true,
            "call": self.call_json(&call_path),
        }))
    }

    fn write_presence(&self, session: &SessionState, request: &RequestParams) -> Result<()> {
        let room = room_key(&request.value("current_room").unwrap_or_default());
        let page_url = request
            .value("page_url")
            .unwrap_or_default()
            .chars()
            .take(240)
            .collect::<String>();
        let mut status = request
            .value("status")
            .unwrap_or_default()
            .to_ascii_lowercase()
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-') {
                    ch
                } else {
                    '-'
                }
            })
            .collect::<String>();
        status.truncate(32);
        if status.is_empty() {
            status = "online".to_string();
        }
        let allow = self.profile_allows_admin_calls(&session.username);
        write_record(
            &self.presence_path_for(&session.username),
            &[
                ("username", session.username.as_str()),
                (
                    "player_name",
                    self.user_display_name(&session.username).as_str(),
                ),
                ("allow_admin_calls", if allow { "true" } else { "false" }),
                ("current_room", room.as_str()),
                ("page_url", page_url.as_str()),
                ("status", status.as_str()),
                ("updated_at", &self.now.to_string()),
            ],
        )
    }

    fn profile_allows_admin_calls(&self, username: &str) -> bool {
        read_config(&self.user_profile(username))
            .map(|config| {
                boolish(Some(&config_string(
                    &config,
                    "video_chat_allow_admin_calls",
                )))
            })
            .unwrap_or(false)
    }

    fn user_display_name(&self, username: &str) -> String {
        let config = read_config(&self.user_profile(username)).unwrap_or_default();
        let player_name = config_string(&config, "player_name");
        if !player_name.is_empty() {
            return player_name;
        }
        let publish_name = config_string(&config, "publish_name");
        if !publish_name.is_empty() {
            return publish_name;
        }
        username.to_string()
    }

    fn user_profile(&self, username: &str) -> PathBuf {
        self.paths.users_dir().join(username).join("profile.conf")
    }

    fn presence_path_for(&self, username: &str) -> PathBuf {
        self.paths
            .video_chat_presence_dir()
            .join(format!("{}.conf", safe_key(username)))
    }

    fn call_path_for(&self, call_id: &str) -> PathBuf {
        self.paths
            .video_chat_calls_dir()
            .join(format!("{}.conf", safe_key(call_id)))
    }

    fn room_path_for(&self, room_id: &str) -> PathBuf {
        self.paths
            .video_chat_rooms_dir()
            .join(format!("{}.conf", safe_key(room_id)))
    }

    fn calls_for_user(&self, username: &str) -> Vec<Value> {
        self.read_conf_dir(self.paths.video_chat_calls_dir())
            .into_iter()
            .filter(|(_, config)| {
                config_string(config, "to_user") == username
                    && config_string(config, "status") == "ringing"
                    && config_string(config, "expires_at")
                        .parse::<u64>()
                        .unwrap_or(0)
                        >= self.now
            })
            .map(|(path, _)| self.call_json(&path))
            .collect()
    }

    fn presence_list(&self, self_username: &str) -> Vec<Value> {
        self.read_conf_dir(self.paths.video_chat_presence_dir())
            .into_iter()
            .filter_map(|(_, config)| {
                let username = config_string(&config, "username");
                if username.is_empty() {
                    return None;
                }
                let updated = config_string(&config, "updated_at")
                    .parse::<u64>()
                    .unwrap_or(0);
                Some(json!({
                    "username": username,
                    "player_name": config_string(&config, "player_name"),
                    "allow_admin_calls": boolish(Some(&config_string(&config, "allow_admin_calls"))),
                    "is_self": config_string(&config, "username") == self_username,
                    "current_room": config_string(&config, "current_room"),
                    "page_url": config_string(&config, "page_url"),
                    "status": config_string(&config, "status"),
                    "updated_at": updated,
                    "age_seconds": self.now.saturating_sub(updated),
                }))
            })
            .collect()
    }

    fn room_list(&self) -> Vec<Value> {
        let mut rooms: BTreeMap<String, Vec<Value>> = BTreeMap::new();
        for (_, config) in self.read_conf_dir(self.paths.video_chat_presence_dir()) {
            let room_id = config_string(&config, "current_room");
            let username = config_string(&config, "username");
            if room_id.is_empty() || username.is_empty() {
                continue;
            }
            rooms.entry(room_id).or_default().push(json!({
                "username": username,
                "player_name": config_string(&config, "player_name"),
            }));
        }
        rooms
            .into_iter()
            .map(|(room_id, members)| {
                json!({
                    "room_id": room_id,
                    "members": members,
                })
            })
            .collect()
    }

    fn call_list(&self) -> Vec<Value> {
        self.read_conf_dir(self.paths.video_chat_calls_dir())
            .into_iter()
            .map(|(path, _)| self.call_json(&path))
            .collect()
    }

    fn call_json(&self, path: &Path) -> Value {
        let config = read_config(path).unwrap_or_default();
        let call_mode = match config_string(&config, "call_mode").as_str() {
            "voice" => "voice",
            _ => "video",
        };
        let from_admin = config_string(&config, "from_admin");
        let from_admin_name = {
            let value = config_string(&config, "from_admin_name");
            if value.is_empty() {
                from_admin.clone()
            } else {
                value
            }
        };
        let to_user = config_string(&config, "to_user");
        let to_user_name = {
            let value = config_string(&config, "to_user_name");
            if value.is_empty() {
                to_user.clone()
            } else {
                value
            }
        };
        let status = {
            let value = config_string(&config, "status");
            if value.is_empty() {
                "ringing".to_string()
            } else {
                value
            }
        };
        json!({
            "call_id": config_string(&config, "call_id"),
            "room_id": config_string(&config, "room_id"),
            "room_password": config_string(&config, "room_password"),
            "private_room": boolish(Some(&config_string(&config, "private_room"))),
            "call_mode": call_mode,
            "from_admin": from_admin,
            "from_admin_name": from_admin_name,
            "to_user": to_user,
            "to_user_name": to_user_name,
            "status": status,
            "self_test": boolish(Some(&config_string(&config, "self_test"))),
            "owner_call": boolish(Some(&config_string(&config, "owner_call"))),
            "created_at": config_string(&config, "created_at").parse::<u64>().unwrap_or(0),
            "expires_at": config_string(&config, "expires_at").parse::<u64>().unwrap_or(0),
            "answered_at": config_string(&config, "answered_at").parse::<u64>().unwrap_or(0),
        })
    }

    fn read_conf_dir(&self, dir: PathBuf) -> Vec<(PathBuf, BTreeMap<String, String>)> {
        let mut rows = Vec::new();
        for entry in fs::read_dir(dir).into_iter().flatten().flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("conf") {
                continue;
            }
            if let Some(config) = read_config(&path) {
                rows.push((path, config));
            }
        }
        rows
    }
}

fn normalize_requested_post_path(raw: &str) -> Option<String> {
    let mut requested = raw.trim().trim_start_matches('/').to_string();
    if let Some(stripped) = requested
        .strip_prefix("http://")
        .or_else(|| requested.strip_prefix("https://"))
    {
        requested = stripped
            .split_once('/')
            .map(|(_, rest)| rest.to_string())
            .unwrap_or_default();
    }
    requested = requested
        .trim_start_matches("cgi/blog-open-post/")
        .trim_start_matches("pages/posts/")
        .trim_start_matches("posts/")
        .to_string();
    (!requested.is_empty()
        && !requested.contains("..")
        && !requested.contains('\\')
        && !requested.contains("//"))
    .then_some(requested)
}

fn normalize_video_chat_action(raw: String) -> String {
    let normalized = raw.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        "status".to_string()
    } else {
        normalized
    }
}

fn resolve_post_markdown_file(paths: &SitePaths, raw: &str) -> Option<PathBuf> {
    let requested = normalize_requested_post_path(raw)?;
    let rel_md = if requested.ends_with(".html") {
        format!("{}.md", requested.trim_end_matches(".html"))
    } else if requested.ends_with(".md") {
        requested.clone()
    } else {
        format!("{requested}.md")
    };

    for base in [&paths.posts_dir, &paths.posts_store_dir] {
        let direct = base.join(&rel_md);
        if direct.is_file() {
            return Some(direct);
        }
    }

    let rel_no_ext = rel_md.trim_end_matches(".md");
    let (rel_dir, rel_base) = rel_no_ext
        .rsplit_once('/')
        .map(|(dir, base)| (Some(dir), base))
        .unwrap_or((None, rel_no_ext));
    let canonical_base = strip_post_date_prefix(rel_base);
    for base_root in [&paths.posts_dir, &paths.posts_store_dir] {
        let search_dir = rel_dir
            .map(|dir| base_root.join(dir))
            .unwrap_or_else(|| base_root.to_path_buf());
        let canonical_file = search_dir.join(format!("{canonical_base}.md"));
        if canonical_file.is_file() {
            return Some(canonical_file);
        }
        let Ok(entries) = fs::read_dir(&search_dir) else {
            continue;
        };
        let suffix = format!("-{canonical_base}.md");
        let mut matches: Vec<PathBuf> = entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| {
                path.is_file()
                    && path
                        .file_name()
                        .and_then(|value| value.to_str())
                        .is_some_and(|name| {
                            name.len() >= suffix.len() + 10 && name.ends_with(&suffix)
                        })
            })
            .collect();
        matches.sort();
        if let Some(path) = matches.pop() {
            return Some(path);
        }
    }
    None
}

fn managed_post_rel_path_for_file(paths: &SitePaths, file: &Path) -> Option<String> {
    let canonical = fs::canonicalize(file).ok()?;
    if let Ok(posts_dir) = fs::canonicalize(&paths.posts_dir) {
        if let Ok(rel) = canonical.strip_prefix(&posts_dir) {
            return Some(format!("posts/{}", rel.to_string_lossy()));
        }
    }
    if let Ok(store_dir) = fs::canonicalize(&paths.posts_store_dir) {
        if let Ok(rel) = canonical.strip_prefix(&store_dir) {
            return Some(format!("posts/{}", rel.to_string_lossy()));
        }
    }
    None
}

fn resolve_draft_path(paths: &SitePaths, draft_id: &str) -> Option<PathBuf> {
    let direct = paths.drafts_dir().join(format!("{draft_id}.md"));
    if direct.is_file() {
        return Some(direct);
    }
    for entry in fs::read_dir(paths.drafts_dir())
        .into_iter()
        .flatten()
        .flatten()
    {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }
        let Some(doc) = MarkdownDoc::from_path(&path) else {
            continue;
        };
        if doc.draft_id() == draft_id {
            return Some(path);
        }
    }
    None
}

fn find_draft_by_id(paths: &SitePaths, draft_id: &str) -> Option<MarkdownDoc> {
    let path = resolve_draft_path(paths, draft_id)?;
    MarkdownDoc::from_path(&path)
}

fn publish_name_for_user(paths: &SitePaths, username: &str) -> String {
    if !valid_username(username) {
        return username.to_string();
    }
    let profile = paths.users_dir().join(username).join("profile.conf");
    if let Some(config) = read_config(&profile) {
        let publish_name = config_string(&config, "publish_name");
        if !publish_name.is_empty() {
            return publish_name;
        }
        let player_name = config_string(&config, "player_name");
        if !player_name.is_empty() {
            return player_name;
        }
    }
    username.to_string()
}

fn strip_post_date_prefix(slug: &str) -> &str {
    if slug.len() > 11 {
        let prefix = &slug.as_bytes()[..11];
        let valid = prefix[0..4].iter().all(u8::is_ascii_digit)
            && prefix[4] == b'-'
            && prefix[5..7].iter().all(u8::is_ascii_digit)
            && prefix[7] == b'-'
            && prefix[8..10].iter().all(u8::is_ascii_digit)
            && prefix[10] == b'-';
        if valid {
            return &slug[11..];
        }
    }
    slug
}

fn read_front_matter(path: &Path) -> BTreeMap<String, String> {
    read_markdown_front_matter(path)
        .map(|front_matter| front_matter.parsed)
        .unwrap_or_default()
}

fn post_nostr_address_for_file(
    paths: &SitePaths,
    file: &Path,
    managed_rel: &str,
    front_matter: &BTreeMap<String, String>,
) -> String {
    if let Some(value) = front_matter
        .get("nostr_address")
        .filter(|value| !value.is_empty())
    {
        return value.clone();
    }
    let pubkey = front_matter
        .get("nostr_pubkey")
        .cloned()
        .unwrap_or_default();
    let kind = front_matter.get("nostr_kind").cloned().unwrap_or_default();
    let dtag = front_matter.get("nostr_d").cloned().unwrap_or_default();
    if !pubkey.is_empty() && !kind.is_empty() && !dtag.is_empty() {
        return format!("{kind}:{pubkey}:{dtag}");
    }
    let _ = file;
    if let Ok(text) = fs::read_to_string(paths.nostr_posts_index()) {
        if let Ok(value) = serde_json::from_str::<Value>(&text) {
            if let Some(address) = value
                .as_array()
                .into_iter()
                .flatten()
                .find(|row| row.get("md_path").and_then(Value::as_str) == Some(managed_rel))
                .and_then(|row| row.get("address").and_then(Value::as_str))
            {
                return address.to_string();
            }
        }
    }
    String::new()
}

fn read_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn secure_chat_service_request_json(
    paths: &SitePaths,
    method: &str,
    path: &str,
    body: Option<&Value>,
) -> Option<Value> {
    secure_chat_service_start(paths).ok()?;
    let mut command = Command::new("curl");
    command
        .arg("--silent")
        .arg("--show-error")
        .arg("--max-time")
        .arg(env::var("BLOG_SECURE_CHAT_REQUEST_TIMEOUT").unwrap_or_else(|_| "12".to_string()))
        .arg("--unix-socket")
        .arg(paths.secure_chat_socket_path())
        .arg("--request")
        .arg(method)
        .arg(format!("http://localhost{path}"));
    let body_string = body
        .map(|value| serde_json::to_string(value).ok())
        .flatten();
    if body_string.is_some() {
        command
            .arg("--header")
            .arg("Content-Type: application/json")
            .arg("--data-binary")
            .arg("@-")
            .stdin(Stdio::piped());
    }
    let mut child = command.spawn().ok()?;
    if let Some(body_string) = body_string {
        if let Some(stdin) = child.stdin.as_mut() {
            let _ = stdin.write_all(body_string.as_bytes());
        }
    }
    let output = child.wait_with_output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if stdout.trim().is_empty() {
        return None;
    }
    serde_json::from_str(&stdout).ok()
}

fn secure_chat_service_start(paths: &SitePaths) -> Result<()> {
    secure_chat_init_storage(paths)?;
    let lock_dir = paths.secure_chat_runtime_dir().join("service-start.lock");
    let mut attempts = 0u32;
    while fs::create_dir(&lock_dir).is_err() {
        if secure_chat_service_ping(paths) {
            return Ok(());
        }
        attempts += 1;
        if attempts >= 20 && secure_chat_service_pid(paths).is_none() {
            let _ = fs::remove_dir(&lock_dir);
            attempts = 0;
            continue;
        }
        if attempts >= 100 {
            return Err(AdminError::new(
                "service_unavailable",
                "Secure Chat admin service is unavailable",
            ));
        }
        thread::sleep(Duration::from_millis(100));
    }
    let result = secure_chat_service_start_inner(paths);
    let _ = fs::remove_dir(&lock_dir);
    result
}

fn secure_chat_service_start_inner(paths: &SitePaths) -> Result<()> {
    secure_chat_init_storage(paths)?;
    if secure_chat_service_ping(paths) {
        if secure_chat_service_command_matches_release(paths) {
            return Ok(());
        }
        secure_chat_service_stop(paths);
    }
    let node_bin = secure_chat_node_binary(paths).ok_or_else(|| {
        AdminError::new(
            "service_unavailable",
            "Secure Chat admin service is unavailable",
        )
    })?;
    let simplex_bin = secure_chat_simplex_binary(paths);
    let launch_path = secure_chat_launch_path(&node_bin, simplex_bin.as_deref());
    let _ = fs::remove_file(paths.secure_chat_socket_path());
    let service_script = env::var("GAZETA_REPO_ROOT")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("cgi/blog-secure-chat-service.js");
    let log_file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(paths.secure_chat_log_path())
        .map_err(io_error(
            "service_unavailable",
            "Secure Chat admin service is unavailable",
        ))?;
    let log_file_err = log_file.try_clone().map_err(io_error(
        "service_unavailable",
        "Secure Chat admin service is unavailable",
    ))?;
    let native_module_root = secure_chat_native_module_root(paths).unwrap_or_default();
    let mut command = Command::new(&node_bin);
    command
        .arg(service_script)
        .env("NODE_NO_WARNINGS", "1")
        .env("PATH", launch_path)
        .env(
            "WIZARDRY_SITES_DIR",
            env::var("WIZARDRY_SITES_DIR").unwrap_or_default(),
        )
        .env(
            "WIZARDRY_SITE_NAME",
            env::var("WIZARDRY_SITE_NAME").unwrap_or_default(),
        )
        .env(
            "WIZARDRY_SITE_ROOT",
            paths
                .site_conf
                .parent()
                .unwrap_or(Path::new("."))
                .display()
                .to_string(),
        )
        .env("WIZARDRY_SITE_DATA", paths.state_dir.display().to_string())
        .env(
            "SECURE_CHAT_STORE_DIR",
            paths.secure_chat_store_dir().display().to_string(),
        )
        .env(
            "SECURE_CHAT_SOCKET_PATH",
            paths.secure_chat_socket_path().display().to_string(),
        )
        .env(
            "SECURE_CHAT_UPLOADS_DIR",
            paths.secure_chat_uploads_dir().display().to_string(),
        )
        .env(
            "SECURE_CHAT_DOWNLOADS_DIR",
            paths.secure_chat_downloads_dir().display().to_string(),
        )
        .env(
            "SECURE_CHAT_SIMPLEX_BINARY",
            simplex_bin.unwrap_or_else(|| "simplex-chat".to_string()),
        )
        .env("SECURE_CHAT_SIMPLEX_NATIVE_MODULE_ROOT", native_module_root)
        .env(
            "SECURE_CHAT_SIMPLEX_WS_PORT",
            secure_chat_simplex_ws_port(paths).to_string(),
        )
        .env(
            "SECURE_CHAT_BROWSER_OWNER_CONTACT_LINK",
            read_config(&paths.site_conf)
                .map(|config| config_string(&config, "secure_chat_browser_owner_contact_link"))
                .unwrap_or_default(),
        )
        .env("SECURE_CHAT_SITE_TITLE", secure_chat_site_title(paths))
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_file_err));
    let child = command.spawn().map_err(io_error(
        "service_unavailable",
        "Secure Chat admin service is unavailable",
    ))?;
    fs::write(paths.secure_chat_pid_path(), child.id().to_string()).map_err(io_error(
        "service_unavailable",
        "Secure Chat admin service is unavailable",
    ))?;
    for _ in 0..80 {
        if secure_chat_service_ping(paths) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err(AdminError::new(
        "service_unavailable",
        "Secure Chat admin service is unavailable",
    ))
}

fn secure_chat_service_ping(paths: &SitePaths) -> bool {
    if !paths.secure_chat_socket_path().exists() {
        return false;
    }
    Command::new("curl")
        .arg("--silent")
        .arg("--show-error")
        .arg("--fail")
        .arg("--unix-socket")
        .arg(paths.secure_chat_socket_path())
        .arg("http://localhost/health")
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn secure_chat_service_pid(paths: &SitePaths) -> Option<u32> {
    let pid = fs::read_to_string(paths.secure_chat_pid_path()).ok()?;
    let pid = pid.trim().parse::<u32>().ok()?;
    let ok = Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .status()
        .ok()?;
    ok.success().then_some(pid)
}

fn secure_chat_service_command_matches_release(paths: &SitePaths) -> bool {
    let pid = match secure_chat_service_pid(paths) {
        Some(pid) => pid,
        None => return false,
    };
    let expected = env::var("GAZETA_REPO_ROOT")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("cgi/blog-secure-chat-service.js")
        .display()
        .to_string();
    let output = Command::new("ps")
        .arg("-p")
        .arg(pid.to_string())
        .arg("-o")
        .arg("command=")
        .output()
        .or_else(|_| {
            Command::new("ps")
                .arg("-p")
                .arg(pid.to_string())
                .arg("-o")
                .arg("args=")
                .output()
        });
    output
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).contains(&expected))
        .unwrap_or(false)
}

fn secure_chat_service_stop(paths: &SitePaths) {
    let Some(pid) = secure_chat_service_pid(paths) else {
        return;
    };
    let _ = Command::new("kill").arg(pid.to_string()).status();
    for _ in 0..50 {
        let still_alive = Command::new("kill")
            .arg("-0")
            .arg(pid.to_string())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
        if !still_alive {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    let _ = fs::remove_file(paths.secure_chat_pid_path());
    let _ = fs::remove_file(paths.secure_chat_socket_path());
}

fn secure_chat_init_storage(paths: &SitePaths) -> Result<()> {
    for dir in [
        paths.secure_chat_root(),
        paths.secure_chat_runtime_dir(),
        paths.secure_chat_uploads_dir(),
        paths.secure_chat_downloads_dir(),
        paths.secure_chat_store_dir(),
        paths.secure_chat_contacts_dir(),
        paths.secure_chat_messages_dir(),
        paths.secure_chat_meta_dir(),
    ] {
        fs::create_dir_all(dir).map_err(io_error(
            "service_unavailable",
            "Secure Chat admin service is unavailable",
        ))?;
    }
    Ok(())
}

fn secure_chat_site_title(paths: &SitePaths) -> String {
    let title = read_config(&paths.site_conf)
        .map(|config| config_string(&config, "site_title"))
        .unwrap_or_default();
    if title.trim().is_empty() {
        "Secure Chat".to_string()
    } else {
        title.split_whitespace().collect::<Vec<_>>().join(" ")
    }
}

fn secure_chat_simplex_ws_port(paths: &SitePaths) -> u16 {
    let explicit = read_config(&paths.site_conf)
        .map(|config| config_string(&config, "secure_chat_simplex_ws_port"))
        .and_then(|value| value.parse::<u16>().ok());
    if let Some(port) = explicit.filter(|port| *port >= 1024) {
        return port;
    }
    let site_name = env::var("WIZARDRY_SITE_NAME").unwrap_or_default();
    let checksum = site_name.bytes().fold(0u32, |sum, byte| sum + byte as u32);
    47000 + (checksum % 1000) as u16
}

fn secure_chat_node_binary(paths: &SitePaths) -> Option<String> {
    let explicit = read_config(&paths.site_conf)
        .map(|config| config_string(&config, "secure_chat_node_binary"))
        .unwrap_or_default();
    if !explicit.is_empty() {
        return Some(explicit);
    }
    find_executable(&["node", "nodejs"])
}

fn secure_chat_simplex_binary(paths: &SitePaths) -> Option<String> {
    let explicit = read_config(&paths.site_conf)
        .map(|config| config_string(&config, "secure_chat_simplex_binary"))
        .unwrap_or_default();
    if !explicit.is_empty() {
        return Some(explicit);
    }
    find_executable(&["simplex-chat"])
}

fn secure_chat_native_module_root(paths: &SitePaths) -> Option<String> {
    let explicit = read_config(&paths.site_conf)
        .map(|config| config_string(&config, "secure_chat_native_module_root"))
        .unwrap_or_default();
    if !explicit.is_empty() {
        return Some(explicit);
    }
    if boolish(
        read_config(&paths.site_conf)
            .map(|config| config_string(&config, "secure_chat_native_driver_enabled"))
            .as_deref(),
    ) {
        Some(
            paths
                .secure_chat_runtime_dir()
                .join("native-driver")
                .display()
                .to_string(),
        )
    } else {
        None
    }
}

fn secure_chat_launch_path(node_bin: &str, simplex_bin: Option<&str>) -> String {
    let mut launch_path = env::var("PATH").unwrap_or_default();
    if !launch_path.is_empty() {
        launch_path.push(':');
    }
    launch_path.push_str("/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin");
    for bin_path in [Some(node_bin), simplex_bin].into_iter().flatten() {
        if let Some(parent) = Path::new(bin_path).parent() {
            let parent = parent.display().to_string();
            if !launch_path.split(':').any(|part| part == parent) {
                launch_path = format!("{parent}:{launch_path}");
            }
        }
    }
    launch_path
}

fn find_executable(candidates: &[&str]) -> Option<String> {
    for candidate in candidates {
        if let Ok(output) = Command::new("sh")
            .arg("-lc")
            .arg(format!("command -v {candidate}"))
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }
    }
    None
}

fn save_draft(paths: &SitePaths, mut params: DraftSaveParams) -> Result<()> {
    fs::create_dir_all(paths.drafts_dir()).map_err(io_error(
        "write_failed",
        "Could not prepare drafts directory",
    ))?;
    let now = now_iso()?;
    let existing = find_draft_by_id(paths, &params.draft_id);
    let created_at = existing
        .and_then(|draft| draft.front_matter("created_at"))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| now.clone());
    params.tags = normalize_tags(&params.tags);
    params.post_type = normalize_post_type(&params.post_type);
    if params.post_type == "shortform" {
        params.title.clear();
    }
    let slug = if let Some(filename) =
        normalize_post_filename(&params.post_filename).filter(|value| !value.is_empty())
    {
        params.post_filename = filename.clone();
        filename
    } else if let Some(filename) =
        normalize_post_filename(&params.source_post_path).filter(|value| !value.is_empty())
    {
        params.post_filename = filename.clone();
        filename
    } else {
        slugify(&slug_seed_text(&params.title, &params.content))
    };
    let draft_file = paths.drafts_dir().join(format!("{}.md", params.draft_id));
    write_draft_markdown(&draft_file, &params, &slug, &created_at, &now)?;
    sync_draft_refs(paths, &params.draft_id, &params.content)?;
    Ok(())
}

fn write_draft_markdown(
    draft_file: &Path,
    params: &DraftSaveParams,
    slug: &str,
    created_at: &str,
    updated_at: &str,
) -> Result<()> {
    let mut text = String::new();
    text.push_str("---\n");
    text.push_str(&format!(
        "draft_id: \"{}\"\n",
        yaml_escape(&params.draft_id)
    ));
    text.push_str(&format!("title: \"{}\"\n", yaml_escape(&params.title)));
    text.push_str(&format!("slug: \"{}\"\n", yaml_escape(slug)));
    text.push_str(&format!("tags: {}\n", tags_to_yaml_array(&params.tags)));
    text.push_str(&format!(
        "post_type: \"{}\"\n",
        yaml_escape(&params.post_type)
    ));
    if !params.source_post_path.is_empty() {
        text.push_str(&format!(
            "source_post_path: \"{}\"\n",
            yaml_escape(&params.source_post_path)
        ));
    }
    if !params.post_filename.is_empty() {
        text.push_str(&format!(
            "post_filename: \"{}\"\n",
            yaml_escape(&params.post_filename)
        ));
    }
    text.push_str(&format!(
        "origin_platforms: {}\n",
        serde_json::to_string(&params.origin_platforms).unwrap_or_else(|_| "[]".to_string())
    ));
    text.push_str(&format!("summary: \"{}\"\n", yaml_escape(&params.summary)));
    text.push_str(&format!("author: \"{}\"\n", yaml_escape(&params.author)));
    text.push_str(&format!(
        "publish_mode: \"{}\"\n",
        yaml_escape(&params.publish_mode)
    ));
    text.push_str(&format!(
        "scheduled_at: \"{}\"\n",
        yaml_escape(&params.scheduled_at)
    ));
    text.push_str(&format!("status: \"{}\"\n", yaml_escape(&params.status)));
    text.push_str(&format!("created_at: \"{}\"\n", yaml_escape(created_at)));
    text.push_str(&format!("updated_at: \"{}\"\n", yaml_escape(updated_at)));
    text.push_str("---\n\n");
    text.push_str(&params.content);
    fs::write(draft_file, text)
        .map_err(io_error("write_failed", "Could not write draft markdown"))?;
    if let Ok(metadata) = fs::metadata(draft_file) {
        let mut perms = metadata.permissions();
        perms.set_mode(0o644);
        let _ = fs::set_permissions(draft_file, perms);
    }
    Ok(())
}

fn clear_draft_refs(paths: &SitePaths, draft_id: &str) -> Result<()> {
    if draft_id.is_empty() {
        return Ok(());
    }
    for mut record in load_file_records(paths) {
        if record.draft_id != draft_id {
            continue;
        }
        record.draft_id.clear();
        record.updated_at = now_iso()?;
        record.write_to(&paths.file_record_path(&record.file_id))?;
    }
    Ok(())
}

fn sync_draft_refs(paths: &SitePaths, draft_id: &str, content: &str) -> Result<()> {
    if draft_id.is_empty() {
        return Ok(());
    }
    clear_draft_refs(paths, draft_id)?;
    let referenced = referenced_file_ids(paths, content);
    if referenced.is_empty() {
        return Ok(());
    }
    for mut record in load_file_records(paths) {
        if !referenced.contains(&record.file_id) {
            continue;
        }
        record.draft_id = draft_id.to_string();
        record.updated_at = now_iso()?;
        record.write_to(&paths.file_record_path(&record.file_id))?;
    }
    Ok(())
}

fn delete_draft_file(paths: &SitePaths, draft_id: &str) -> Result<()> {
    if draft_id.is_empty() {
        return Ok(());
    }
    clear_draft_refs(paths, draft_id)?;
    if let Some(draft_path) = resolve_draft_path(paths, draft_id) {
        let _ = fs::remove_file(&draft_path);
        let direct_path = paths.drafts_dir().join(format!("{draft_id}.md"));
        if direct_path != draft_path {
            let _ = fs::remove_file(direct_path);
        }
    }
    Ok(())
}

fn normalize_publish_destination(raw: &str) -> &'static str {
    if raw == "nostr_now" {
        "nostr_now"
    } else {
        "local_only"
    }
}

fn auto_summary_from_content(content: &str) -> String {
    let mut plain = String::new();
    for line in content.lines() {
        let mut trimmed = line.trim();
        if trimmed.starts_with("```") {
            continue;
        }
        while let Some(rest) = trimmed
            .strip_prefix('#')
            .or_else(|| trimmed.strip_prefix('>'))
            .or_else(|| trimmed.strip_prefix('*'))
            .or_else(|| trimmed.strip_prefix('-'))
        {
            trimmed = rest.trim_start();
        }
        if !plain.is_empty() && !trimmed.is_empty() {
            plain.push(' ');
        }
        plain.push_str(trimmed);
    }
    let words = plain.split_whitespace().collect::<Vec<_>>();
    if words.is_empty() {
        return String::new();
    }
    let max_words = 48;
    let summary = words
        .iter()
        .take(max_words)
        .copied()
        .collect::<Vec<_>>()
        .join(" ");
    if words.len() > max_words {
        format!("{summary}...")
    } else {
        summary
    }
}

fn run_blog_lib_function(function: &str, args: &[String]) -> std::result::Result<String, String> {
    run_shell_function(&["cgi/blog-lib.sh"], function, args, &[])
}

fn run_publish_nostr_page_bridge(
    args: &[String],
    envs: &[(&str, String)],
) -> std::result::Result<Value, String> {
    let output = run_shell_function(
        &["cgi/blog-lib.sh", "cgi/blog-publish-nostr-page-bridge.sh"],
        "blog_publish_nostr_page_json",
        args,
        envs,
    )?;
    serde_json::from_str(&output).map_err(|error| error.to_string())
}

fn run_shell_function(
    sources: &[&str],
    function: &str,
    args: &[String],
    envs: &[(&str, String)],
) -> std::result::Result<String, String> {
    let repo_root = gazeta_repo_root();
    let mut command = Command::new("/bin/sh");
    command.current_dir(&repo_root);
    command
        .arg("-c")
        .arg(
            ". \"$1\"; shift; while [ \"$1\" != \"--\" ]; do . \"$1\"; shift; done; shift; blog_init; fn=\"$1\"; shift; \"$fn\" \"$@\"",
        )
        .arg("shell-function")
        .arg(repo_root.join("cgi/blog-lib.sh"));
    for source in sources {
        if *source != "cgi/blog-lib.sh" {
            command.arg(repo_root.join(source));
        }
    }
    command.arg("--").arg(function).args(args);
    for (key, value) in envs {
        command.env(key, value);
    }
    let output = command.output().map_err(|error| error.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if !stderr.is_empty() { stderr } else { stdout })
    }
}

fn run_payments_bridge(request: &RequestParams) -> std::result::Result<Value, String> {
    let repo_root = gazeta_repo_root();
    let method = env::var("REQUEST_METHOD").unwrap_or_else(|_| "GET".to_string());
    let content_type = env::var("CONTENT_TYPE").unwrap_or_default();
    let host = env::var("HTTP_HOST").unwrap_or_default();
    let body = request.body().to_string();
    let mut command = Command::new("/bin/sh");
    command.current_dir(&repo_root);
    command
        .arg("-c")
        .arg(
            ". \"$1\"; shift; while [ \"$1\" != \"--\" ]; do . \"$1\"; shift; done; shift; blog_init; blog_read_request_body; fn=\"$1\"; shift; \"$fn\" \"$@\"",
        )
        .arg("shell-request-function")
        .arg(repo_root.join("cgi/blog-lib.sh"));
    for source in ["cgi/blog-payments-bridge.sh"] {
        command.arg(repo_root.join(source));
    }
    command.arg("--").arg("blog_payments_json");
    command.env("REQUEST_METHOD", &method);
    command.env("QUERY_STRING", request.query());
    if !host.is_empty() {
        command.env("HTTP_HOST", host);
    }
    if !content_type.is_empty() {
        command.env("CONTENT_TYPE", content_type);
    }
    if method == "POST" {
        command.env("CONTENT_LENGTH", body.len().to_string());
        command.stdin(Stdio::piped());
    }
    let mut child = command.spawn().map_err(|error| error.to_string())?;
    if method == "POST" && !body.is_empty() {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Could not open CGI stdin".to_string())?;
        stdin
            .write_all(body.as_bytes())
            .map_err(|error| error.to_string())?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        serde_json::from_str(&stdout).map_err(|error| error.to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if !stderr.is_empty() { stderr } else { stdout })
    }
}

fn gazeta_repo_root() -> PathBuf {
    env::var_os("GAZETA_REPO_ROOT")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn referenced_file_ids(paths: &SitePaths, content: &str) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    if content.is_empty() {
        return out;
    }
    let marker = "file_id=";
    let mut rest = content;
    while let Some(index) = rest.find(marker) {
        rest = &rest[index + marker.len()..];
        let file_id = rest
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '~' | '-'))
            .collect::<String>();
        if !file_id.is_empty() {
            out.insert(file_id);
        }
    }
    for record in load_file_records(paths) {
        let url = file_public_url_for_record(paths, &record);
        if !url.is_empty() && content.contains(&url) {
            out.insert(record.file_id);
        }
    }
    out
}

fn yaml_escape(value: &str) -> String {
    value.replace('"', "\\\"")
}

fn tags_to_yaml_array(tags: &str) -> String {
    let normalized = normalize_tags(tags);
    if normalized.is_empty() {
        return "[]".to_string();
    }
    let entries = normalized
        .split(',')
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(|tag| format!("\"{}\"", yaml_escape(tag)))
        .collect::<Vec<_>>();
    format!("[{}]", entries.join(", "))
}

fn slug_seed_text(title: &str, content: &str) -> String {
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    if !title.is_empty() {
        return title;
    }
    let excerpt = content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or_default()
        .to_string();
    if !excerpt.is_empty() {
        return excerpt;
    }
    "draft".to_string()
}

fn slugify(value: &str) -> String {
    let slug = value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        "draft".to_string()
    } else {
        slug
    }
}

fn normalize_post_filename(raw: &str) -> Option<String> {
    let raw = raw
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(raw)
        .trim_start_matches('/')
        .trim_start_matches("pages/")
        .trim_start_matches("posts/");
    let raw = raw
        .rsplit('/')
        .next()
        .unwrap_or_default()
        .trim_end_matches(".md")
        .trim_end_matches(".MD")
        .trim_end_matches(".html")
        .trim_end_matches(".HTML")
        .trim();
    if raw.is_empty() {
        return None;
    }
    let slug = raw
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    (!slug.is_empty()).then_some(slug)
}

fn move_origin_post_platforms(paths: &SitePaths, from_rel: &str, to_rel: &str) -> Result<()> {
    let Some(from_slug) = normalize_post_filename(from_rel) else {
        return Ok(());
    };
    let Some(to_slug) = normalize_post_filename(to_rel) else {
        return Ok(());
    };
    if from_slug == to_slug {
        return Ok(());
    }
    let from_path = paths.origin_posts_dir().join(format!("{from_slug}.json"));
    let to_path = paths.origin_posts_dir().join(format!("{to_slug}.json"));
    if !from_path.is_file() {
        return Ok(());
    }
    if let Some(parent) = to_path.parent() {
        fs::create_dir_all(parent).map_err(io_error(
            "write_failed",
            "Could not prepare Origin post settings directory",
        ))?;
    }
    fs::rename(&from_path, &to_path).map_err(io_error(
        "write_failed",
        "Could not move Origin post settings",
    ))?;
    Ok(())
}

fn origin_post_platforms_for_path(paths: &SitePaths, post_path: &str) -> Vec<String> {
    let enabled = origin_enabled_platforms(paths);
    let Some(slug) = normalize_post_filename(post_path) else {
        return enabled;
    };
    let settings_path = paths.origin_posts_dir().join(format!("{slug}.json"));
    let Some(value) = read_json(&settings_path) else {
        return enabled;
    };
    let raw = value
        .get("platforms")
        .cloned()
        .map(|platforms| platforms.to_string())
        .unwrap_or_else(|| "[]".to_string());
    normalize_origin_platforms(raw, &enabled)
}

fn available_origin_platforms() -> Vec<String> {
    origin_platform_meta()
        .into_iter()
        .map(|platform| platform.id)
        .collect()
}

fn origin_platform_meta() -> Vec<OriginPlatformMeta> {
    let Some(dir) = origin_dir() else {
        return Vec::new();
    };
    let Some(json) = read_json(&dir.join("origin.json")) else {
        return Vec::new();
    };
    let Some(platforms) = json.get("platforms").and_then(Value::as_object) else {
        return Vec::new();
    };
    let mut available = platforms
        .iter()
        .filter(|(_, value)| value.get("enabled").and_then(Value::as_bool) != Some(false))
        .map(|(id, value)| OriginPlatformMeta {
            id: id.to_string(),
            family: value
                .get("family")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        })
        .collect::<Vec<_>>();
    available.sort_by(|left, right| left.id.cmp(&right.id));
    available
}

fn normalize_origin_platforms(raw: String, allowed: &[String]) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let parsed = if trimmed.starts_with('[') {
        serde_json::from_str::<Value>(trimmed)
            .ok()
            .and_then(|value| value.as_array().cloned())
            .unwrap_or_default()
            .into_iter()
            .filter_map(|value| value.as_str().map(ToString::to_string))
            .collect::<Vec<_>>()
    } else {
        trimmed
            .split(',')
            .map(ToString::to_string)
            .collect::<Vec<_>>()
    };
    let allowed = allowed.iter().cloned().collect::<BTreeSet<_>>();
    let mut out = BTreeSet::new();
    for value in parsed {
        let cleaned = value
            .to_ascii_lowercase()
            .chars()
            .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
            .collect::<String>();
        if !cleaned.is_empty() && allowed.contains(&cleaned) {
            out.insert(cleaned);
        }
    }
    out.into_iter().collect()
}

fn origin_enabled_platforms(paths: &SitePaths) -> Vec<String> {
    let available = available_origin_platforms();
    if available.is_empty() {
        return Vec::new();
    }
    let configured = read_config(&paths.site_conf)
        .map(|config| config_string(&config, "origin_enabled_platforms"))
        .unwrap_or_else(|| "__missing__".to_string());
    if configured == "__missing__" {
        return available;
    }
    normalize_origin_platforms(configured, &available)
}

fn origin_default_platforms(paths: &SitePaths, enabled: &[String]) -> Vec<String> {
    if enabled.is_empty() {
        return Vec::new();
    }
    let configured = read_config(&paths.site_conf)
        .map(|config| config_string(&config, "origin_default_platforms"))
        .unwrap_or_else(|| "__missing__".to_string());
    if configured == "__missing__" {
        return enabled.to_vec();
    }
    normalize_origin_platforms(configured, enabled)
}

fn origin_dir() -> Option<PathBuf> {
    let configured = env::var_os("ORIGIN_DIR").map(PathBuf::from);
    if configured
        .as_deref()
        .is_some_and(|path| path.join("bin/origin").is_file() && path.join("origin.json").is_file())
    {
        return configured;
    }
    let origin_bin = env::var_os("PATH").and_then(|paths| {
        env::split_paths(&paths)
            .map(|path| path.join("origin"))
            .find(|path| path.is_file())
    });
    if let Some(bin) = origin_bin {
        let candidate = bin.parent().and_then(Path::parent).map(Path::to_path_buf);
        if candidate.as_deref().is_some_and(|path| {
            path.join("bin/origin").is_file() && path.join("origin.json").is_file()
        }) {
            return candidate;
        }
    }
    let home = env::var_os("HOME").map(PathBuf::from)?;
    let candidate = home.join("git/origin");
    (candidate.join("bin/origin").is_file() && candidate.join("origin.json").is_file())
        .then_some(candidate)
}

fn origin_public_base_url(paths: &SitePaths) -> String {
    let configured = read_config(&paths.site_conf)
        .map(|config| config_string(&config, "origin_public_base_url"))
        .unwrap_or_default()
        .trim()
        .trim_end_matches('/')
        .to_string();
    if configured.starts_with("http://") || configured.starts_with("https://") {
        configured
    } else {
        String::new()
    }
}

fn save_origin_post_platforms(
    paths: &SitePaths,
    rel_path: &str,
    platforms: &[String],
) -> Result<()> {
    let Some(slug) = normalize_post_filename(rel_path) else {
        return Err(AdminError::new("invalid_post_path", "Invalid post path"));
    };
    fs::create_dir_all(paths.origin_posts_dir()).map_err(io_error(
        "write_failed",
        "Could not prepare Origin post settings directory",
    ))?;
    let settings_path = paths.origin_posts_dir().join(format!("{slug}.json"));
    let payload = json!({
        "source_path": rel_path,
        "platforms": platforms,
        "updated_at": now_iso()?,
    });
    fs::write(
        &settings_path,
        serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string()),
    )
    .map_err(io_error(
        "write_failed",
        "Could not write Origin post settings",
    ))?;
    if let Ok(metadata) = fs::metadata(&settings_path) {
        let mut perms = metadata.permissions();
        perms.set_mode(0o644);
        let _ = fs::set_permissions(&settings_path, perms);
    }
    Ok(())
}

fn write_origin_site_config(paths: &SitePaths, origin_root: &Path) -> Result<()> {
    let source_path = origin_root.join("origin.json");
    let mut config = read_json(&source_path).ok_or_else(|| {
        AdminError::new(
            "origin_unavailable",
            "Origin is not available on this server",
        )
    })?;
    let enabled = origin_enabled_platforms(paths);
    let enabled_set = enabled.iter().cloned().collect::<HashSet<_>>();
    if let Some(object) = config.as_object_mut() {
        object.insert(
            "state_dir".to_string(),
            Value::String(paths.origin_state_dir().display().to_string()),
        );
        if let Some(renderer) = object.get_mut("renderer").and_then(Value::as_object_mut) {
            absolutize_origin_command(renderer, "markdown_to_html", origin_root);
            absolutize_origin_command(renderer, "markdown_to_text", origin_root);
        }
        if let Some(platforms) = object.get_mut("platforms").and_then(Value::as_object_mut) {
            for (platform_id, value) in platforms {
                if let Some(platform) = value.as_object_mut() {
                    platform.insert(
                        "enabled".to_string(),
                        Value::Bool(enabled_set.contains(platform_id)),
                    );
                    absolutize_origin_section_command(platform, "project", "command", origin_root);
                    absolutize_origin_section_command(platform, "emit", "command", origin_root);
                    absolutize_origin_section_command(
                        platform,
                        "emit",
                        "edit_command",
                        origin_root,
                    );
                    absolutize_origin_section_command(platform, "fetch", "command", origin_root);
                    absolutize_origin_section_command(
                        platform,
                        "normalize",
                        "command",
                        origin_root,
                    );
                }
            }
        }
    }
    fs::create_dir_all(paths.origin_dir()).map_err(io_error(
        "write_failed",
        "Could not prepare Origin state directory",
    ))?;
    fs::write(
        paths.origin_site_config(),
        serde_json::to_string_pretty(&config).unwrap_or_else(|_| "{}".to_string()),
    )
    .map_err(io_error(
        "write_failed",
        "Could not prepare Origin site config",
    ))?;
    Ok(())
}

fn absolutize_origin_command(
    object: &mut serde_json::Map<String, Value>,
    key: &str,
    origin_root: &Path,
) {
    if let Some(value) = object.get_mut(key).and_then(Value::as_array_mut) {
        absolutize_origin_command_array(value, origin_root);
    }
}

fn absolutize_origin_section_command(
    object: &mut serde_json::Map<String, Value>,
    section_key: &str,
    command_key: &str,
    origin_root: &Path,
) {
    if let Some(section) = object.get_mut(section_key).and_then(Value::as_object_mut) {
        absolutize_origin_command(section, command_key, origin_root);
    }
}

fn absolutize_origin_command_array(command: &mut [Value], origin_root: &Path) {
    let Some(first) = command.first_mut() else {
        return;
    };
    let Some(text) = first.as_str() else {
        return;
    };
    if let Some(stripped) = text.strip_prefix("./") {
        *first = Value::String(origin_root.join(stripped).display().to_string());
    }
}

fn origin_emit_file_json(
    paths: &SitePaths,
    source_file: &Path,
    platforms: &[String],
) -> Option<Value> {
    if !source_file.is_file() {
        return None;
    }
    if platforms.is_empty() {
        return Some(json!({
            "post_id": origin_post_id_for_file(source_file).unwrap_or_default(),
            "results": [],
        }));
    }
    let origin_root = origin_dir()?;
    write_origin_site_config(paths, &origin_root).ok()?;
    let prepared_file = prepare_origin_post_file(paths, source_file, platforms).ok()?;
    let mut command = Command::new(origin_root.join("bin/origin"));
    command
        .arg("--config")
        .arg(paths.origin_site_config())
        .arg("emit");
    for platform in platforms {
        command.arg("--platform").arg(platform);
    }
    command.arg(&prepared_file);
    let output = command.output().ok()?;
    let _ = fs::remove_file(&prepared_file);
    if !output.status.success() {
        return None;
    }
    serde_json::from_slice(&output.stdout).ok()
}

fn prepare_origin_post_file(
    paths: &SitePaths,
    source_file: &Path,
    platforms: &[String],
) -> Result<PathBuf> {
    let source_text = fs::read_to_string(source_file)
        .map_err(io_error("write_failed", "Could not read post for Origin"))?;
    let rel_path = managed_post_rel_path_for_file(paths, source_file)
        .ok_or_else(|| AdminError::new("invalid_post_path", "Invalid post path"))?;
    let slug = normalize_post_filename(&rel_path)
        .or_else(|| origin_post_id_for_file(source_file))
        .ok_or_else(|| AdminError::new("invalid_post_path", "Invalid post path"))?;
    let public_base_url = origin_public_base_url(paths);
    let public_post_url = if public_base_url.is_empty() {
        String::new()
    } else {
        format!("{public_base_url}/posts/{slug}")
    };
    let mut doc = MarkdownDoc::from_path(source_file).unwrap_or(MarkdownDoc {
        path: source_file.to_path_buf(),
        front_matter: BTreeMap::new(),
        front_matter_raw: BTreeMap::new(),
        content: source_text.clone(),
    });
    doc.front_matter.insert("slug".to_string(), slug.clone());
    if !public_post_url.is_empty() {
        doc.front_matter
            .insert("canonical_url".to_string(), public_post_url.clone());
        doc.front_matter
            .insert("url".to_string(), public_post_url.clone());
    }
    doc.front_matter.insert(
        "origin_platforms".to_string(),
        serde_json::to_string(platforms).unwrap_or_else(|_| "[]".to_string()),
    );

    let temp_path = env::temp_dir().join(format!("gazeta-origin-{}.md", random_hex(12)?));
    let mut text = String::new();
    text.push_str("---\n");
    for (key, value) in &doc.front_matter {
        if key == "tags" && value.trim_start().starts_with('[') {
            text.push_str(&format!("{key}: {value}\n"));
        } else if key == "origin_platforms" && value.trim_start().starts_with('[') {
            text.push_str(&format!("{key}: {value}\n"));
        } else {
            text.push_str(&format!("{key}: \"{}\"\n", yaml_escape(value)));
        }
    }
    text.push_str("---\n\n");
    text.push_str(&doc.content);
    fs::write(&temp_path, text).map_err(io_error(
        "write_failed",
        "Could not prepare post for Origin",
    ))?;
    Ok(temp_path)
}

fn origin_crossposting_summary_for_file(paths: &SitePaths, file: &Path, rel_path: &str) -> Value {
    if !file.is_file() {
        return json!({
            "available": false,
            "platforms": [],
            "enabled_count": 0,
            "selected_count": 0,
            "published_count": 0,
            "remaining_count": 0,
            "needs_action": false,
        });
    }
    let available = origin_dir().is_some();
    let meta = origin_platform_meta();
    let enabled = origin_enabled_platforms(paths);
    let selected = origin_post_platforms_for_path(paths, rel_path);
    let selected_set = selected.iter().cloned().collect::<HashSet<_>>();
    let platforms = meta
        .into_iter()
        .filter(|platform| enabled.contains(&platform.id))
        .map(|platform| {
            let selected_here = selected_set.contains(&platform.id);
            let state_path = origin_state_file_for_post(paths, file, &platform.id);
            let (status, remote_url) =
                if let Some(state) = state_path.as_deref().and_then(read_json) {
                    let saved_status = state
                        .get("status")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let remote_url = state
                        .get("remote_url")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    let status = match saved_status.as_str() {
                        "published" | "failed" | "outdated" | "fetch-failed" | "mismatch"
                        | "ok" => saved_status,
                        "skipped" if selected_here => "skipped".to_string(),
                        "skipped" => "not_selected".to_string(),
                        _ if selected_here => "unpublished".to_string(),
                        _ => "not_selected".to_string(),
                    };
                    (status, remote_url)
                } else if selected_here {
                    ("unpublished".to_string(), String::new())
                } else {
                    ("not_selected".to_string(), String::new())
                };
            json!({
                "id": platform.id,
                "family": platform.family,
                "selected": selected_here,
                "status": status,
                "remote_url": remote_url,
            })
        })
        .collect::<Vec<_>>();
    let published_count = platforms
        .iter()
        .filter(|platform| platform.get("status").and_then(Value::as_str) == Some("published"))
        .count();
    let remaining_count = platforms.len().saturating_sub(published_count);
    json!({
        "available": available,
        "platforms": platforms,
        "enabled_platforms": enabled,
        "selected_platforms": selected,
        "enabled_count": enabled.len(),
        "selected_count": selected_set.len(),
        "published_count": published_count,
        "remaining_count": remaining_count,
        "needs_action": remaining_count > 0,
    })
}

fn origin_post_id_for_file(file: &Path) -> Option<String> {
    let doc = MarkdownDoc::from_path(file)?;
    for candidate in [
        doc.front_matter("nostr_event_id"),
        doc.front_matter("slug"),
        doc.front_matter("title").map(|value| slugify(&value)),
        first_heading(&doc.content).map(|value| slugify(&value)),
        file.file_stem()
            .and_then(|value| value.to_str())
            .map(slugify),
    ] {
        let value = candidate.unwrap_or_default();
        if !value.is_empty() {
            return Some(value);
        }
    }
    None
}

fn origin_state_file_for_post(paths: &SitePaths, file: &Path, platform: &str) -> Option<PathBuf> {
    let post_id = origin_post_id_for_file(file)?;
    Some(
        paths
            .origin_state_dir()
            .join(post_id)
            .join(format!("{platform}.json")),
    )
}

fn first_heading(content: &str) -> Option<String> {
    content
        .lines()
        .find_map(|line| line.strip_prefix("# ").map(|line| line.trim().to_string()))
        .filter(|line| !line.is_empty())
}

fn plugin_enabled(paths: &SitePaths, key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    let supported = matches!(
        key.as_str(),
        "nostr_support"
            | "nostr_login"
            | "nostr_bridge"
            | "nostr_posts"
            | "zaps"
            | "commerce"
            | "btcpay"
            | "crossmint"
            | "merch_store"
            | "video_chat"
            | "overworld"
    );
    if !supported {
        return false;
    }
    let enabled = plugin_raw_enabled(paths, &key);
    if !enabled {
        return false;
    }
    if matches!(
        key.as_str(),
        "nostr_login" | "nostr_bridge" | "nostr_posts" | "zaps"
    ) {
        plugin_raw_enabled(paths, "nostr_support")
    } else {
        true
    }
}

fn plugin_raw_enabled(paths: &SitePaths, key: &str) -> bool {
    let default_enabled = !matches!(
        key,
        "crossmint" | "merch_store" | "video_chat" | "overworld"
    );
    let config_key = format!("plugin_{key}");
    let value = read_config(&paths.site_conf)
        .map(|config| config_string(&config, &config_key))
        .unwrap_or_default();
    match value.as_str() {
        "" => default_enabled,
        "true" | "1" | "yes" | "on" => true,
        "false" | "0" | "no" | "off" => false,
        _ => default_enabled,
    }
}

fn safe_key(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

fn room_key(value: &str) -> String {
    value
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
        .join("-")
}

fn append_unique_line(path: &Path, value: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(io_error(
            "write_failed",
            "Could not prepare Nostr hidden-posts store",
        ))?;
    }
    let existing = fs::read_to_string(path).unwrap_or_default();
    if existing.lines().any(|line| line == value) {
        return Ok(());
    }
    let mut text = existing;
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    text.push_str(value);
    text.push('\n');
    fs::write(path, text).map_err(io_error(
        "write_failed",
        "Could not update Nostr hidden-posts store",
    ))
}

fn unique_storage_name(paths: &SitePaths, raw_name: &str) -> String {
    let desired = basename_safe(raw_name);
    let candidate = paths.files_dir().join(&desired);
    if !candidate.exists() {
        return desired;
    }
    let (base, ext) = desired
        .rsplit_once('.')
        .map(|(base, ext)| (base.to_string(), format!(".{ext}")))
        .unwrap_or_else(|| (desired.clone(), String::new()));
    let mut n = 2;
    loop {
        let candidate = format!("{base}-{n}{ext}");
        if !paths.files_dir().join(&candidate).exists() {
            return candidate;
        }
        n += 1;
    }
}

fn basename_safe(raw_name: &str) -> String {
    let mut safe = raw_name
        .rsplit('/')
        .next()
        .unwrap_or("file")
        .replace(['\r', '\n', '\t'], " ");
    safe = safe
        .chars()
        .map(|ch| match ch {
            '/' | ':' => '-',
            ch if ch.is_control() => '-',
            ch => ch,
        })
        .collect::<String>()
        .trim()
        .to_string();
    if safe.is_empty() || safe == "." || safe == ".." {
        "file".to_string()
    } else {
        safe
    }
}

fn file_public_url(file_id: &str, safe_name: &str) -> String {
    let safe_id = sanitize_public_segment(file_id);
    let safe_part = sanitize_public_segment(safe_name);
    if safe_part.is_empty() {
        format!("/cgi/blog-file/{safe_id}")
    } else {
        format!("/cgi/blog-file/{safe_id}/{safe_part}")
    }
}

fn sanitize_public_segment(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '~' | '-') {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

#[derive(Clone, Default)]
struct FileRecord {
    file_id: String,
    storage_rel: String,
    original_name: String,
    safe_name: String,
    mime_type: String,
    size_bytes: String,
    created_at: String,
    updated_at: String,
    draft_id: String,
    post_path: String,
    explicit_public: bool,
    public_path: String,
}

impl FileRecord {
    fn from_path(path: &Path) -> Option<Self> {
        let config = read_config(path)?;
        Some(Self {
            file_id: config_string(&config, "file_id"),
            storage_rel: config_string(&config, "storage_rel"),
            original_name: config_string(&config, "original_name"),
            safe_name: config_string(&config, "safe_name"),
            mime_type: config_string(&config, "mime_type"),
            size_bytes: config_string(&config, "size_bytes"),
            created_at: config_string(&config, "created_at"),
            updated_at: config_string(&config, "updated_at"),
            draft_id: config_string(&config, "draft_id"),
            post_path: config_string(&config, "post_path"),
            explicit_public: boolish(Some(&config_string(&config, "explicit_public"))),
            public_path: config_string(&config, "public_path"),
        })
    }

    fn as_config(&self) -> BTreeMap<String, String> {
        let mut config = BTreeMap::new();
        config.insert("file_id".to_string(), self.file_id.clone());
        config.insert("storage_rel".to_string(), self.storage_rel.clone());
        config.insert("original_name".to_string(), self.original_name.clone());
        config.insert("safe_name".to_string(), self.safe_name.clone());
        config.insert("mime_type".to_string(), self.mime_type.clone());
        config.insert("size_bytes".to_string(), self.size_bytes.clone());
        config.insert("created_at".to_string(), self.created_at.clone());
        config.insert("updated_at".to_string(), self.updated_at.clone());
        config.insert("draft_id".to_string(), self.draft_id.clone());
        config.insert("post_path".to_string(), self.post_path.clone());
        config.insert(
            "explicit_public".to_string(),
            if self.explicit_public {
                "true".to_string()
            } else {
                "false".to_string()
            },
        );
        config.insert("public_path".to_string(), self.public_path.clone());
        config
    }

    fn write_to(&self, path: &Path) -> Result<()> {
        write_config(path, &self.as_config(), "Could not write file metadata")
            .map_err(|error| AdminError::new(error.code, error.message))
    }
}

fn load_file_records(paths: &SitePaths) -> Vec<FileRecord> {
    let mut records = Vec::new();
    for entry in fs::read_dir(paths.file_records_dir())
        .into_iter()
        .flatten()
        .flatten()
    {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("conf") {
            continue;
        }
        if let Some(record) =
            FileRecord::from_path(&path).filter(|record| !record.file_id.is_empty())
        {
            records.push(record);
        }
    }
    records
}

fn index_untracked_files(paths: &SitePaths) -> Result<()> {
    if !paths.files_dir().is_dir() {
        return Ok(());
    }
    let known = load_file_records(paths)
        .into_iter()
        .map(|record| record.storage_rel)
        .collect::<HashSet<_>>();
    for entry in fs::read_dir(paths.files_dir())
        .into_iter()
        .flatten()
        .flatten()
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(storage_rel) = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(ToString::to_string)
        else {
            continue;
        };
        if matches!(
            storage_rel.as_str(),
            ".DS_Store" | ".stfolder" | ".stignore"
        ) {
            continue;
        }
        if known.contains(&storage_rel) {
            continue;
        }
        let size_bytes = fs::metadata(&path)
            .map(|metadata| metadata.len().to_string())
            .unwrap_or_else(|_| "0".to_string());
        let now = now_iso()?;
        let record = FileRecord {
            file_id: unique_file_id(paths)?,
            storage_rel: storage_rel.clone(),
            original_name: storage_rel.clone(),
            safe_name: storage_rel.clone(),
            mime_type: MimeGuess::from_path(&path)
                .first_raw()
                .unwrap_or("application/octet-stream")
                .to_string(),
            size_bytes,
            created_at: now.clone(),
            updated_at: now,
            draft_id: String::new(),
            post_path: String::new(),
            explicit_public: false,
            public_path: String::new(),
        };
        record.write_to(&paths.file_record_path(&record.file_id))?;
        if let Ok(metadata) = fs::metadata(&path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o600);
            let _ = fs::set_permissions(&path, perms);
        }
    }
    Ok(())
}

fn unique_file_id(paths: &SitePaths) -> Result<String> {
    loop {
        let candidate = random_hex(18)?;
        if !paths.file_record_path(&candidate).exists() {
            return Ok(candidate);
        }
    }
}

fn file_disk_path(paths: &SitePaths, record: &FileRecord) -> Option<PathBuf> {
    if record.storage_rel.is_empty() {
        None
    } else {
        Some(paths.files_dir().join(&record.storage_rel))
    }
}

fn managed_page_path(paths: &SitePaths, rel: &str) -> Option<PathBuf> {
    let rel = rel.trim().trim_start_matches('/');
    if rel.is_empty() || rel.contains('\\') || rel.contains("//") {
        return None;
    }
    let candidate = Path::new(rel);
    if candidate.is_absolute()
        || candidate
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return None;
    }
    Some(paths.pages_dir.join(candidate))
}

fn file_is_public_effective(paths: &SitePaths, record: &FileRecord) -> bool {
    record.explicit_public
        || managed_page_path(paths, &record.post_path).is_some_and(|path| path.is_file())
}

fn valid_public_alias(path: &str) -> bool {
    if is_invalid_basename(path) {
        return false;
    }
    !matches!(
        path,
        "cgi"
            | "files"
            | "static"
            | "pages"
            | "admin.html"
            | "index.html"
            | "robots.txt"
            | "sitemap.xml"
            | "rss.xml"
            | "atom.xml"
    ) && !path.starts_with('.')
        && !path.contains('/')
        && !path.starts_with("cgi.")
        && !path.starts_with("files.")
        && !path.starts_with("static.")
        && !path.starts_with("pages.")
        && path != "build"
        && !path.starts_with("build.")
}

fn file_public_path(record: &FileRecord) -> Option<String> {
    let candidate = if record.public_path.is_empty() {
        record.safe_name.clone()
    } else {
        record.public_path.clone()
    };
    let candidate = basename_safe(&candidate);
    valid_public_alias(&candidate).then_some(candidate)
}

fn public_path_available(paths: &SitePaths, candidate: &str, current_file_id: &str) -> bool {
    for record in load_file_records(paths) {
        if record.file_id == current_file_id {
            continue;
        }
        if file_public_path(&record).as_deref() == Some(candidate) {
            return false;
        }
    }
    true
}

fn file_public_url_for_record(paths: &SitePaths, record: &FileRecord) -> String {
    if file_is_public_effective(paths, record) {
        if let Some(public_path) = file_public_path(record) {
            if public_path_available(paths, &public_path, &record.file_id) {
                return format!("/{}", percent_encode_path_segment(&public_path));
            }
        }
    }
    file_public_url(&record.file_id, &record.safe_name)
}

fn percent_encode_path_segment(value: &str) -> String {
    let mut out = String::new();
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'~' | b'-') {
            out.push(*byte as char);
        } else {
            out.push('%');
            out.push_str(&format!("{byte:02X}"));
        }
    }
    out
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PublicAliasMode {
    Copy,
    Manifest,
    Skip,
}

fn public_alias_mode(paths: &SitePaths) -> PublicAliasMode {
    let raw = env::var("BLOG_PUBLIC_FILE_ALIAS_MODE")
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| {
            read_config(&paths.site_conf)
                .map(|config| config_string(&config, "blog_public_file_alias_mode"))
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| "copy".to_string());
    match raw.as_str() {
        "manifest" => PublicAliasMode::Manifest,
        "skip" => PublicAliasMode::Skip,
        _ => PublicAliasMode::Copy,
    }
}

fn sync_public_file_aliases(paths: &SitePaths) -> Result<()> {
    fs::create_dir_all(&paths.build_dir).map_err(io_error(
        "write_failed",
        "Could not prepare build directory",
    ))?;
    let manifest_path = paths.build_dir.join(".file-aliases.manifest");
    let previous_aliases = read_alias_manifest(&manifest_path);
    let mode = public_alias_mode(paths);
    let records = load_file_records(paths);

    let mut alias_counts = HashMap::new();
    for record in &records {
        if !file_is_public_effective(paths, record) {
            continue;
        }
        let Some(alias) = file_public_path(record) else {
            continue;
        };
        *alias_counts.entry(alias).or_insert(0usize) += 1;
    }

    let mut desired = Vec::new();
    for record in &records {
        if !file_is_public_effective(paths, record) {
            continue;
        }
        let Some(alias) = file_public_path(record) else {
            continue;
        };
        if alias_counts.get(&alias).copied().unwrap_or(0) != 1 {
            continue;
        }
        let Some(source_path) = file_disk_path(paths, record).filter(|path| path.is_file()) else {
            continue;
        };
        desired.push((alias, source_path));
    }
    desired.sort_by(|left, right| left.0.cmp(&right.0));

    let current_aliases = desired
        .iter()
        .map(|(alias, _)| alias.clone())
        .collect::<HashSet<_>>();

    for alias in previous_aliases {
        if !current_aliases.contains(&alias) {
            let _ = fs::remove_file(paths.build_dir.join(alias));
        }
    }

    let mut manifest_lines = Vec::new();
    for (alias, source_path) in desired {
        let dest_path = paths.build_dir.join(&alias);
        match mode {
            PublicAliasMode::Copy => copy_file_alias(&source_path, &dest_path)?,
            PublicAliasMode::Manifest | PublicAliasMode::Skip => {
                let _ = fs::remove_file(&dest_path);
            }
        }
        let metadata = fs::metadata(&source_path).ok();
        let size = metadata.as_ref().map(|value| value.len()).unwrap_or(0);
        let mtime = metadata
            .and_then(|value| value.modified().ok())
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_secs())
            .unwrap_or(0);
        manifest_lines.push(format!(
            "{}\t{}\t{}\t{}",
            alias,
            source_path.display(),
            size,
            mtime
        ));
    }

    let manifest_text = if manifest_lines.is_empty() {
        String::new()
    } else {
        format!("{}\n", manifest_lines.join("\n"))
    };
    fs::write(&manifest_path, manifest_text).map_err(io_error(
        "write_failed",
        "Could not update file alias manifest",
    ))?;

    Ok(())
}

fn copy_file_alias(source_path: &Path, dest_path: &Path) -> Result<()> {
    let tmp_path = dest_path.with_extension("tmp");
    fs::copy(source_path, &tmp_path)
        .map_err(io_error("write_failed", "Could not copy public file alias"))?;
    if let Ok(metadata) = fs::metadata(&tmp_path) {
        let mut perms = metadata.permissions();
        perms.set_mode(0o644);
        let _ = fs::set_permissions(&tmp_path, perms);
    }
    fs::rename(&tmp_path, dest_path).map_err(io_error(
        "write_failed",
        "Could not install public file alias",
    ))
}

fn read_alias_manifest(path: &Path) -> HashSet<String> {
    let Ok(text) = fs::read_to_string(path) else {
        return HashSet::new();
    };
    text.lines()
        .filter_map(|line| line.split('\t').next())
        .filter(|alias| !alias.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn is_invalid_basename(value: &str) -> bool {
    matches!(value, "" | "." | "..")
}

fn valid_username(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && !value.starts_with('-')
        && !value.starts_with('.')
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn write_record(path: &Path, values: &[(&str, &str)]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(io_error(
            "write_failed",
            "Could not prepare file metadata store",
        ))?;
    }
    let mut text = String::new();
    for (key, value) in values {
        text.push_str(key);
        text.push('=');
        text.push_str(value);
        text.push('\n');
    }
    fs::write(path, text).map_err(io_error("write_failed", "Could not write file metadata"))
}

fn boolish(value: Option<&str>) -> bool {
    matches!(value.unwrap_or_default(), "true" | "1" | "yes" | "on")
}

fn random_hex(bytes: usize) -> Result<String> {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).map_err(|error| {
        AdminError::new(
            "random_failed",
            format!("Could not create random token: {error}"),
        )
    })?;
    let mut out = String::with_capacity(bytes * 2);
    for byte in buf {
        out.push_str(&format!("{byte:02x}"));
    }
    Ok(out)
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn now_iso() -> Result<String> {
    OffsetDateTime::from_unix_timestamp(now_epoch() as i64)
        .map_err(|error| AdminError::new("time_failed", format!("Could not format time: {error}")))?
        .format(RFC3339_FORMAT)
        .map_err(|error| AdminError::new("time_failed", format!("Could not format time: {error}")))
}

fn io_error(code: &'static str, context: &'static str) -> impl FnOnce(io::Error) -> AdminError {
    move |error| AdminError::new(code, format!("{context}: {error}"))
}
