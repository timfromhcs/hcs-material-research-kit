#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! HCS Material Research Kit — desktop shell.
//!
//! The studio is the same static build that runs on the web; this shell adds a
//! native window, an offline origin and a version command. It deliberately
//! exposes no shell execution, no arbitrary filesystem command and no network
//! client: a desktop wrapper must not become a privilege escalation over the
//! browser edition.

use serde::Serialize;

#[derive(Serialize)]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    platform: &'static str,
    arch: &'static str,
    edition: &'static str,
}

/// Reports what this binary actually is. The studio displays it so a user can
/// tell the desktop build from the browser build.
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: env!("CARGO_PKG_NAME"),
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        edition: "desktop",
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running the HCS desktop application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_this_build() {
        let info = app_info();
        assert_eq!(info.name, "hcs-desktop");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(info.edition, "desktop");
        assert!(!info.platform.is_empty());
        assert!(!info.arch.is_empty());
    }
}
