use crate::resolved_site_data_dir;
use crate::runtime_types::RuntimeError;
use std::env;
use std::path::{Path, PathBuf};

pub(crate) struct SiteIdentity {
    pub(crate) sites_dir: PathBuf,
    pub(crate) site_name: String,
    pub(crate) site_root: PathBuf,
}

pub(crate) fn resolve_site_identity(
    require_env: bool,
    default_site_name: &str,
) -> Result<SiteIdentity, RuntimeError> {
    let sites_dir = if require_env {
        env_path("WIZARDRY_SITES_DIR")
            .ok_or_else(|| RuntimeError::new("config_missing", "WIZARDRY_SITES_DIR is not configured."))?
    } else {
        env_path("WIZARDRY_SITES_DIR").unwrap_or_else(default_sites_dir)
    };
    let site_name = if require_env {
        env::var("WIZARDRY_SITE_NAME")
            .map_err(|_| RuntimeError::new("config_missing", "WIZARDRY_SITE_NAME is not configured."))?
    } else {
        env::var("WIZARDRY_SITE_NAME").unwrap_or_else(|_| default_site_name.to_string())
    };
    let site_root = sites_dir.join(&site_name);
    Ok(SiteIdentity {
        sites_dir,
        site_name,
        site_root,
    })
}

pub(crate) fn resolve_sites_data_dir(sites_dir: &Path, default_sites_data_dir: &Path) -> PathBuf {
    env_path("WIZARDRY_SITES_DATA_DIR").unwrap_or_else(|| {
        if looks_like_git_checkout(sites_dir) {
            xdg_state_home().join("gazeta/sites-data")
        } else {
            default_sites_data_dir.to_path_buf()
        }
    })
}

pub(crate) fn resolve_state_dir(
    site_root: &Path,
    site_name: &str,
    sites_data_dir: &Path,
    default_sites_data_dir: &Path,
) -> PathBuf {
    resolved_site_data_dir(site_root, sites_data_dir, default_sites_data_dir, site_name)
}

pub(crate) fn resolve_generated_root(site_root: &Path, site_name: &str) -> PathBuf {
    if looks_like_git_checkout(site_root) {
        env_path("BLOG_GENERATED_ROOT")
            .unwrap_or_else(|| xdg_state_home().join("gazeta/generated").join(site_name))
    } else {
        site_root.join("site")
    }
}

pub(crate) fn generated_static_dir(site_root: &Path, site_name: &str) -> PathBuf {
    resolve_generated_root(site_root, site_name).join("static")
}

pub(crate) fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

pub(crate) fn default_sites_dir() -> PathBuf {
    home_dir().join("sites")
}

pub(crate) fn home_dir() -> PathBuf {
    env_path("HOME").unwrap_or_else(|| PathBuf::from("/"))
}

pub(crate) fn xdg_state_home() -> PathBuf {
    env_path("XDG_STATE_HOME").unwrap_or_else(|| home_dir().join(".local/state"))
}

pub(crate) fn looks_like_git_checkout(path: &Path) -> bool {
    let home_git = home_dir().join("git");
    path.starts_with(&home_git) || path.starts_with("/Users/andersaamodt/git")
}
