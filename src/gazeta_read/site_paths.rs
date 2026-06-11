use crate::gazeta_read::{ReadError, Result};
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
        let site_name = env::var("WIZARDRY_SITE_NAME").map_err(|_| {
            ReadError::new("config_missing", "WIZARDRY_SITE_NAME is not configured.")
        })?;
        let site_root = sites_dir.join(&site_name);
        let state_dir = sites_dir.join(".sitedata").join(&site_name);
        Ok(Self {
            repo_root,
            site_root,
            state_dir,
        })
    }
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}
