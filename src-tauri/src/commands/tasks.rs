use std::path::PathBuf;

use tauri::{AppHandle, State};
use crate::db::AppState;
use crate::models::{GenerationTask, TaskResponse};

fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn make_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

fn row_to_task(row: &rusqlite::Row) -> rusqlite::Result<GenerationTask> {
    let input_str: Option<String> = row.get("input_data")?;
    let output_str: Option<String> = row.get("output_data")?;
    Ok(GenerationTask {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        task_type: row.get("task_type")?,
        status: row.get("status")?,
        progress: row.get("progress")?,
        input_data: input_str.and_then(|s| serde_json::from_str(&s).ok()),
        output_data: output_str.and_then(|s| serde_json::from_str(&s).ok()),
        error_message: row.get("error_message")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn to_task_response(t: &GenerationTask) -> TaskResponse {
    TaskResponse {
        id: t.id.clone(),
        project_id: t.project_id.clone(),
        task_type: t.task_type.clone(),
        status: t.status.clone(),
        progress: t.progress,
        input_data: t.input_data.clone(),
        output_data: t.output_data.clone(),
        error_message: t.error_message.clone(),
        created_at: t.created_at.clone(),
        updated_at: t.updated_at.clone(),
    }
}

fn update_task_status(db_path: &PathBuf, task_id: &str, progress: i64, status: &str) {
    if let Ok(conn) = rusqlite::Connection::open(db_path) {
        let now = now_utc();
        let _ = conn.execute(
            "UPDATE generation_tasks SET progress = ?1, status = ?2, updated_at = ?3 WHERE id = ?4",
            rusqlite::params![progress, status, now, task_id],
        );
    }
}

fn complete_task(db_path: &PathBuf, task_id: &str, output_data: &serde_json::Value) {
    if let Ok(conn) = rusqlite::Connection::open(db_path) {
        let now = now_utc();
        let json_str = serde_json::to_string(output_data).unwrap_or_default();
        let _ = conn.execute(
            "UPDATE generation_tasks SET progress = 100, status = 'completed', output_data = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![json_str, now, task_id],
        );
    }
}

fn fail_task(db_path: &PathBuf, task_id: &str, error: &str) {
    if let Ok(conn) = rusqlite::Connection::open(db_path) {
        let now = now_utc();
        let _ = conn.execute(
            "UPDATE generation_tasks SET status = 'failed', error_message = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![error, now, task_id],
        );
    }
}

fn update_project_status(db_path: &PathBuf, project_id: &str, status: &str) {
    if let Ok(conn) = rusqlite::Connection::open(db_path) {
        let now = now_utc();
        let _ = conn.execute(
            "UPDATE projects SET status = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![status, now, project_id],
        );
    }
}

#[tauri::command]
pub fn start_generation(
    state: State<'_, AppState>,
    _app: AppHandle,
    project_id: String,
    file_id: String,
    style: String,
    ceiling_height: Option<f64>,
    wall_thickness: Option<f64>,
) -> Result<TaskResponse, String> {
    let db_path = state.data_dir.join("planova.db");
    let data_dir = state.data_dir.clone();
    let task_id = make_id();
    let now = now_utc();
    let input_data = serde_json::json!({
        "file_id": file_id,
        "style": style,
        "ceiling_height": ceiling_height.unwrap_or(2.8),
        "wall_thickness": wall_thickness.unwrap_or(0.2),
    });
    let input_str = serde_json::to_string(&input_data).map_err(|e| e.to_string())?;

    // Validate LLM config upfront
    let llm_config = crate::settings::get_llm_config(&data_dir);
    if llm_config.api_key.is_empty() {
        return Err("LLM API key not configured, please check Settings".to_string());
    }
    if llm_config.base_url.is_empty() {
        return Err("LLM Base URL not configured, please check Settings".to_string());
    }

    // Look up file storage path
    let file_storage_path = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "INSERT INTO generation_tasks (id, project_id, task_type, status, progress, input_data, error_message, created_at, updated_at) VALUES (?1, ?2, 'floorplan_parse', 'pending', 0, ?3, '', ?4, ?5)",
            rusqlite::params![task_id, project_id, input_str, now, now],
        )
        .map_err(|e| format!("Failed to create task: {e}"))?;

        let path: String = db
            .query_row(
                "SELECT storage_path FROM uploaded_files WHERE id = ?1",
                [&file_id],
                |row| row.get(0),
            )
            .map_err(|_| "File not found".to_string())?;
        path
    };

    // Validate image file can be opened
    if let Err(e) = image::image_dimensions(&file_storage_path) {
        return Err(format!("Uploaded file is not a valid image: {e}"));
    }

    // Spawn background pipeline
    let task_id_clone = task_id.clone();
    let project_id_clone = project_id.clone();
    let ceiling = ceiling_height.unwrap_or(2.8);
    let thickness = wall_thickness.unwrap_or(0.2);

    state.runtime.spawn(async move {
        log::info!("Generation task {task_id_clone} started: project={project_id_clone} file={file_id}");

        update_project_status(&db_path, &project_id_clone, "generating");
        update_task_status(&db_path, &task_id_clone, 10, "running");

        match crate::pipeline::run_pipeline(
            &file_storage_path,
            &style,
            ceiling,
            thickness,
            &project_id_clone,
            &data_dir,
        ).await {
            Ok(scene_json) => {
                log::info!("Pipeline complete: {} rooms", scene_json.get("rooms").and_then(|r| r.as_array()).map(|a| a.len()).unwrap_or(0));
                update_task_status(&db_path, &task_id_clone, 80, "running");

                // Save scene to DB
                if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                    let now = now_utc();
                    let json_str = serde_json::to_string(&scene_json).unwrap_or_default();

                    // Check if scene exists
                    let exists: bool = conn
                        .query_row(
                            "SELECT COUNT(*) FROM scenes WHERE project_id = ?1",
                            [&project_id_clone],
                            |row| row.get::<_, i64>(0).map(|c| c > 0),
                        )
                        .unwrap_or(false);

                    if exists {
                        let _ = conn.execute(
                            "UPDATE scenes SET scene_json = ?1, updated_at = ?2 WHERE project_id = ?3",
                            rusqlite::params![json_str, now, project_id_clone],
                        );
                    } else {
                        let scene_id = make_id();
                        let _ = conn.execute(
                            "INSERT INTO scenes (id, project_id, schema_version, scene_json, created_at, updated_at) VALUES (?1, ?2, '0.1.0', ?3, ?4, ?5)",
                            rusqlite::params![scene_id, project_id_clone, json_str, now, now],
                        );
                    }
                }

                update_task_status(&db_path, &task_id_clone, 95, "running");

                let output = serde_json::json!({
                    "scene_id": task_id_clone,
                    "pipeline_urls": {
                        "preprocessed_image": format!("pipeline/{}/preprocessed.png", project_id_clone),
                        "vlm_response": format!("pipeline/{}/vlm_response.json", project_id_clone),
                        "scene_normalized": format!("pipeline/{}/scene_normalized.json", project_id_clone),
                    }
                });
                complete_task(&db_path, &task_id_clone, &output);
                update_project_status(&db_path, &project_id_clone, "completed");
                log::info!("Generation task {task_id_clone} finished successfully");
            }
            Err(e) => {
                log::error!("Generation task {task_id_clone} failed: {e}");
                fail_task(&db_path, &task_id_clone, &e);
                update_project_status(&db_path, &project_id_clone, "error");
            }
        }
    });

    Ok(TaskResponse {
        id: task_id,
        project_id,
        task_type: "floorplan_parse".to_string(),
        status: "pending".to_string(),
        progress: 0,
        input_data: Some(input_data),
        output_data: None,
        error_message: String::new(),
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn get_task(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<TaskResponse, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let task = db
        .query_row("SELECT * FROM generation_tasks WHERE id = ?1", [&task_id], row_to_task)
        .map_err(|_| "Task not found".to_string())?;
    Ok(to_task_response(&task))
}

#[tauri::command]
pub fn cancel_task(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let rows = db.execute(
        "UPDATE generation_tasks SET status = 'cancelled', updated_at = ?1 WHERE id = ?2 AND status IN ('pending', 'running')",
        rusqlite::params![now_utc(), task_id],
    )
    .map_err(|e| e.to_string())?;
    if rows == 0 {
        return Err("Task cannot be cancelled".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn get_task_pipeline(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let project_id: String = db
        .query_row(
            "SELECT project_id FROM generation_tasks WHERE id = ?1",
            [&task_id],
            |row| row.get(0),
        )
        .map_err(|_| "Task not found".to_string())?;

    let meta_path = state.data_dir.join("pipeline").join(&project_id).join("meta.json");
    if !meta_path.exists() {
        return Err("Pipeline artifacts not found".to_string());
    }

    let content = std::fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    let mut meta: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    meta["urls"] = serde_json::json!({
        "preprocessed_image": format!("/pipeline/{project_id}/preprocessed.png"),
        "vlm_response": format!("/pipeline/{project_id}/vlm_response.json"),
        "scene_normalized": format!("/pipeline/{project_id}/scene_normalized.json"),
    });

    Ok(meta)
}
