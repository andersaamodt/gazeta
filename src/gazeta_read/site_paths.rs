use crate::gazeta_read::{ReadError, Result};
use crate::site_runtime::{
    env_path, generated_static_dir, resolve_site_identity, resolve_sites_data_dir, resolve_state_dir,
};
use std::path::PathBuf;

pub(crate) struct SitePaths {
    pub(crate) site_root: PathBuf,
    pub(crate) state_dir: PathBuf,
}

impl SitePaths {
    pub(crate) fn from_env() -> Result<Self> {
        let _ = env_path("GAZETA_REPO_ROOT").or_else(|| std::env::current_dir().ok());
        let identity = resolve_site_identity(true, "default")
            .map_err(|error| ReadError::new(error.code, error.message))?;
        let default_sites_data_dir = identity.sites_dir.join(".sitedata");
        let sites_data_dir = resolve_sites_data_dir(&identity.sites_dir, &default_sites_data_dir);
        let state_dir = resolve_state_dir(
            &identity.site_root,
            &identity.site_name,
            &sites_data_dir,
            &default_sites_data_dir,
        );
        Ok(Self {
            site_root: identity.site_root,
            state_dir,
        })
    }

    pub(crate) fn generated_static_dir(&self) -> PathBuf {
        let site_name = self
            .site_root
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("default");
        generated_static_dir(&self.site_root, site_name)
    }
}
