use tauri::{AppHandle, State};
use crate::db::AppState;
use crate::models::{Project, ProjectResponse};
use crate::storage;
use crate::util::make_id;

fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn row_to_project(row: &rusqlite::Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        style: row.get("style")?,
        status: row.get("status")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn to_response(p: &Project) -> ProjectResponse {
    ProjectResponse {
        id: p.id.clone(),
        name: p.name.clone(),
        description: p.description.clone(),
        style: p.style.clone(),
        status: p.status.clone(),
        created_at: p.created_at.clone(),
        updated_at: p.updated_at.clone(),
    }
}

#[tauri::command]
pub fn create_project(
    state: State<'_, AppState>,
    name: String,
    description: String,
    style: String,
) -> Result<ProjectResponse, String> {
    let id = make_id();
    let now = now_utc();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO projects (id, name, description, style, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'draft', ?5, ?6)",
        rusqlite::params![id, name, description, style, now, now],
    )
    .map_err(|e| format!("Failed to create project: {e}"))?;

    let project = Project {
        id,
        name,
        description,
        style,
        status: "draft".to_string(),
        created_at: now.clone(),
        updated_at: now,
    };
    Ok(to_response(&project))
}

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> Result<Vec<ProjectResponse>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT * FROM projects ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let projects = stmt
        .query_map([], row_to_project)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();
    Ok(projects.iter().map(to_response).collect())
}

#[tauri::command]
pub fn get_project(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<ProjectResponse, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let project = db
        .query_row("SELECT * FROM projects WHERE id = ?1", [&project_id], row_to_project)
        .map_err(|_| "Project not found".to_string())?;
    Ok(to_response(&project))
}

#[tauri::command]
pub fn update_project(
    state: State<'_, AppState>,
    project_id: String,
    name: Option<String>,
    description: Option<String>,
    style: Option<String>,
    status: Option<String>,
) -> Result<ProjectResponse, String> {
    let now = now_utc();
    let db = state.db.lock().map_err(|e| e.to_string())?;

    if let Some(n) = name {
        db.execute("UPDATE projects SET name = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![n, now, project_id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(d) = description {
        db.execute("UPDATE projects SET description = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![d, now, project_id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(s) = style {
        db.execute("UPDATE projects SET style = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![s, now, project_id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(s) = status {
        db.execute("UPDATE projects SET status = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![s, now, project_id])
            .map_err(|e| e.to_string())?;
    }

    let project = db
        .query_row("SELECT * FROM projects WHERE id = ?1", [&project_id], row_to_project)
        .map_err(|_| "Project not found".to_string())?;
    Ok(to_response(&project))
}

#[tauri::command]
pub fn delete_project(
    state: State<'_, AppState>,
    _app: AppHandle,
    project_id: String,
) -> Result<(), String> {
    let data_dir = state.data_dir.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Delete files from disk
    let mut stmt = db
        .prepare("SELECT storage_path, preview_path FROM uploaded_files WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let paths: Vec<(String, String)> = stmt
        .query_map([&project_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    for (storage, preview) in paths {
        storage::delete_storage_file(&storage);
        storage::delete_storage_file(&preview);
    }

    // Delete pipeline artifacts
    let pipeline_dir = data_dir.join("pipeline").join(&project_id);
    let _ = std::fs::remove_dir_all(&pipeline_dir);

    // Explicit child row deletion (don't rely on ON DELETE CASCADE — old DB schemas may lack it)
    db.execute("DELETE FROM uploaded_files WHERE project_id = ?1", [&project_id])
        .map_err(|e| format!("Failed to delete files: {e}"))?;
    db.execute("DELETE FROM generation_tasks WHERE project_id = ?1", [&project_id])
        .map_err(|e| format!("Failed to delete tasks: {e}"))?;
    db.execute("DELETE FROM scenes WHERE project_id = ?1", [&project_id])
        .map_err(|e| format!("Failed to delete scenes: {e}"))?;
    db.execute("DELETE FROM projects WHERE id = ?1", [&project_id])
        .map_err(|e| format!("Failed to delete project: {e}"))?;
    Ok(())
}
