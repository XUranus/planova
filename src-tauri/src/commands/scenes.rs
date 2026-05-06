use tauri::State;
use crate::db::AppState;
use crate::models::SceneResponse;

fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn make_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

fn row_to_scene_response(row: &rusqlite::Row) -> rusqlite::Result<SceneResponse> {
    let json_str: String = row.get("scene_json")?;
    let scene_json = serde_json::from_str(&json_str).ok();
    Ok(SceneResponse {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        file_id: row.get("file_id")?,
        name: row.get("name")?,
        schema_version: row.get("schema_version")?,
        scene_json,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

#[tauri::command]
pub fn list_scenes(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<SceneResponse>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, project_id, file_id, name, schema_version, scene_json, created_at, updated_at FROM scenes WHERE project_id = ?1 ORDER BY created_at")
        .map_err(|e| e.to_string())?;
    let scenes = stmt
        .query_map([&project_id], row_to_scene_response)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();
    Ok(scenes)
}

#[tauri::command]
pub fn get_scene(
    state: State<'_, AppState>,
    scene_id: String,
) -> Result<Option<SceneResponse>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let result = db.query_row(
        "SELECT id, project_id, file_id, name, schema_version, scene_json, created_at, updated_at FROM scenes WHERE id = ?1",
        [&scene_id],
        row_to_scene_response,
    );
    match result {
        Ok(scene) => Ok(Some(scene)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn update_scene(
    state: State<'_, AppState>,
    scene_id: String,
    scene_json: serde_json::Value,
) -> Result<SceneResponse, String> {
    let now = now_utc();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let json_str = serde_json::to_string(&scene_json).map_err(|e| e.to_string())?;

    let rows = db.execute(
        "UPDATE scenes SET scene_json = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![json_str, now, scene_id],
    ).map_err(|e| e.to_string())?;

    if rows == 0 {
        return Err("Scene not found".to_string());
    }

    drop(db);
    get_scene(state, scene_id).and_then(|s| s.ok_or_else(|| "Scene not found after update".to_string()))
}

#[tauri::command]
pub fn delete_scene(
    state: State<'_, AppState>,
    scene_id: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM scenes WHERE id = ?1", [&scene_id])
        .map_err(|e| format!("Failed to delete scene: {e}"))?;
    Ok(())
}
