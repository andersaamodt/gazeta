use crate::gazeta_read::{ReadError, Result};
use crate::resolved_site_data_dir;
use std::env;
use std::path::PathBuf;

pub(crate) struct SitePaths {
    pub(crate) repo_root: PathBuf,
    pub(crate) site_root: PathBuf,
    pub(crate) state_dir: PathBuf,
}

impl SitePaths {
    pub(crate) fn from_env() -> Result<Self> {
        let repo_root = env_path("GAZETA_REPO_ROOT")
            .or_else(|| env::current_dir().ok())
            .ok_or_else(|| {
                ReadError::new("config_missing", "Gazeta repo root is not configured.")
            })?;
        let sites_dir = env_path("WIZARDRY_SITES_DIR").ok_or_else(|| {
            ReadError::new("config_missing", "WIZARDRY_SITES_DIR is not configured.")
        })?;
        let default_sites_data_dir = sites_dir.join(".sitedata");
        let sites_data_dir = env_path("WIZARDRY_SITES_DATA_DIR").unwrap_or_else(|| {
            if looks_like_git_checkout(&sites_dir) {
                env_path("XDG_STATE_HOME")
                    .unwrap_or_else(|| home_dir().join(".local/state"))
                    .join("gazeta/sites-data")
            } else {
                default_sites_data_dir.clone()
            }
        });
        let site_name = env::var("WIZARDRY_SITE_NAME").map_err(|_| {
            ReadError::new("config_missing", "WIZARDRY_SITE_NAME is not configured.")
        })?;
        let site_root = sites_dir.join(&site_name);
        let state_dir = resolved_site_data_dir(
            &site_root,
            &sites_data_dir,
            &default_sites_data_dir,
            &site_name,
        );
        Ok(Self {
            repo_root,
            site_root,
            state_dir,
        })
    }

    pub(crate) fn generated_root(&self) -> PathBuf {
        if looks_like_git_checkout(&self.site_root) {
            env_path("BLOG_GENERATED_ROOT").unwrap_or_else(|| {
                env_path("XDG_STATE_HOME")
                    .unwrap_or_else(|| home_dir().join(".local/state"))
                    .join("gazeta/generated")
                    .join(
                        self.site_root
                            .file_name()
                            .and_then(|value| value.to_str())
                            .unwrap_or("default"),
                    )
            })
        } else {
            self.site_root.join("site")
        }
    }

    pub(crate) fn generated_static_dir(&self) -> PathBuf {
        self.generated_root().join("static")
    }
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn home_dir() -> PathBuf {
    env_path("HOME").unwrap_or_else(|| PathBuf::from("/"))
}

fn looks_like_git_checkout(path: &std::path::Path) -> bool {
    let home = home_dir();
    let home_git = home.join("git");
    path.starts_with(&home_git) || path.starts_with("/Users/andersaamodt/git")
}
