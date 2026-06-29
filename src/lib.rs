mod action_registry;
mod runtime_types;
mod site_runtime;
mod urlcodec;

pub mod gazeta_admin;
pub mod gazeta_admin_read;
pub mod gazeta_commerce_read;
pub mod gazeta_nostr_read;
pub mod gazeta_read;

use std::fs;
use std::path::{Component, Path, PathBuf};

pub(crate) fn dir_is_empty(path: &Path) -> bool {
    fs::read_dir(path)
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(true)
}

pub(crate) fn managed_release_shared_site_dir(site_root: &Path) -> Option<PathBuf> {
    let mut prefix = PathBuf::new();
    let mut saw_releases = false;
    let mut saw_release_name = false;
    for component in site_root.components() {
        if saw_releases {
            if matches!(component, Component::Normal(_)) {
                saw_release_name = true;
            }
            break;
        }
        if matches!(component, Component::Normal(name) if name == "releases") {
            saw_releases = true;
            continue;
        }
        prefix.push(component.as_os_str());
    }
    if saw_releases && saw_release_name {
        Some(prefix.join(".sitedata").join("site"))
    } else {
        None
    }
}

pub(crate) fn resolved_site_data_dir(
    site_root: &Path,
    sites_data_dir: &Path,
    default_sites_data_dir: &Path,
    site_name: &str,
) -> PathBuf {
    if let Some(shared_dir) = managed_release_shared_site_dir(site_root) {
        if shared_dir.is_dir() {
            return shared_dir;
        }
    }
    let candidate = sites_data_dir.join(site_name);
    let legacy = default_sites_data_dir.join(site_name);
    if candidate != legacy && legacy.is_dir() && (!candidate.exists() || dir_is_empty(&candidate)) {
        legacy
    } else {
        candidate
    }
}
