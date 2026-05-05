use tauri::State;
use crate::db::AppState;
use crate::models::SceneResponse;

fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn make_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

#[tauri::command]
pub fn get_scene(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Option<SceneResponse>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let result = db.query_row(
        "SELECT id, project_id, schema_version, scene_json, created_at, updated_at FROM scenes WHERE project_id = ?1",
        [&project_id],
        |row| {
            let json_str: String = row.get("scene_json")?;
            let scene_json = serde_json::from_str(&json_str).ok();
            Ok(SceneResponse {
                id: row.get("id")?,
                project_id: row.get("project_id")?,
                schema_version: row.get("schema_version")?,
                scene_json,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
            })
        },
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
    project_id: String,
    scene_json: serde_json::Value,
) -> Result<SceneResponse, String> {
    let now = now_utc();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let json_str = serde_json::to_string(&scene_json).map_err(|e| e.to_string())?;

    // Check if scene exists
    let exists: bool = db
        .query_row(
            "SELECT COUNT(*) FROM scenes WHERE project_id = ?1",
            [&project_id],
            |row| row.get::<_, i64>(0).map(|c| c > 0),
        )
        .map_err(|e| e.to_string())?;

    if exists {
        db.execute(
            "UPDATE scenes SET scene_json = ?1, updated_at = ?2 WHERE project_id = ?3",
            rusqlite::params![json_str, now, project_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let id = make_id();
        db.execute(
            "INSERT INTO scenes (id, project_id, schema_version, scene_json, created_at, updated_at) VALUES (?1, ?2, '0.1.0', ?3, ?4, ?5)",
            rusqlite::params![id, project_id, json_str, now, now],
        )
        .map_err(|e| e.to_string())?;
    }

    // Drop the mutex guard before calling get_scene
    drop(db);

    // Return the updated scene
    get_scene(state, project_id).and_then(|s| s.ok_or_else(|| "Scene not found after update".to_string()))
}
