use crate::gazeta_read::{ReadError, Result, SitePaths};
use std::process::Command;

pub(crate) fn rebuild(paths: &SitePaths, action: &str) -> Result<()> {
    let maintenance = paths.repo_root.join("cgi/blog-maintenance");
    let output = Command::new(&maintenance)
        .arg(action)
        .current_dir(&paths.repo_root)
        .output()
        .map_err(|error| ReadError::new("rebuild_failed", error.to_string()))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(ReadError::new(
        "rebuild_failed",
        if stderr.is_empty() { stdout } else { stderr },
    ))
}
