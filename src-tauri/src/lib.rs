mod ai;
mod commands;
mod db;
mod models;
mod pipeline;
mod settings;
mod storage;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Get app data directory
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            // Create all runtime directories
            storage::ensure_dirs(&data_dir).expect("Failed to create runtime directories");

            // Initialize database
            let db_path = data_dir.join("planova.db");
            let conn = db::init_db(&db_path).expect("Failed to initialize database");

            // Mark any running/pending tasks as failed (app crashed or was force-closed)
            let now = chrono::Utc::now().to_rfc3339();
            let stale_count = conn
                .execute(
                    "UPDATE generation_tasks SET status = 'failed', progress = 0, error_message = 'Process exited', updated_at = ?1 WHERE status IN ('pending', 'running', 'executing')",
                    [&now],
                )
                .unwrap_or(0);
            if stale_count > 0 {
                log::warn!("Reset {} stale task(s) to failed on startup", stale_count);
            }

            // Reset parse_status on files that were still parsing
            let stale_files = conn
                .execute(
                    "UPDATE uploaded_files SET parse_status = 'failed' WHERE parse_status = 'parsing'",
                    [],
                )
                .unwrap_or(0);
            if stale_files > 0 {
                log::warn!("Reset {} stale file(s) from parsing to failed on startup", stale_files);
            }

            // Register shared state
            app.manage(db::AppState {
                db: Mutex::new(conn),
                data_dir,
                runtime: tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime"),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::projects::create_project,
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::update_project,
            commands::projects::delete_project,
            commands::files::upload_file,
            commands::files::upload_file_from_base64,
            commands::files::list_files,
            commands::files::get_file_preview,
            commands::files::delete_file,
            commands::files::save_file,
            commands::scenes::list_scenes,
            commands::scenes::get_scene,
            commands::scenes::update_scene,
            commands::scenes::delete_scene,
            commands::tasks::start_generation,
            commands::tasks::retry_parse,
            commands::tasks::get_task,
            commands::tasks::get_task_by_file,
            commands::tasks::cancel_task,
            commands::tasks::get_task_pipeline,
            commands::tasks::get_pipeline_artifacts,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::test_llm_connection,
            commands::renders::export_render,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
