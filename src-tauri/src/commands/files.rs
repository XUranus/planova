use std::path::Path;
use tauri::{AppHandle, State};
use crate::db::AppState;
use crate::models::{FileResponse, UploadedFile};
use crate::storage;
use crate::util::make_id;
use super::tasks::spawn_pipeline;

fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn maybe_auto_parse(state: &State<'_, AppState>, project_id: &str, file_id: &str, storage_path: &str) {
    let data_dir = state.data_dir.clone();
    let llm_config = crate::settings::get_llm_config(&data_dir);
    if llm_config.api_key.is_empty() || llm_config.base_url.is_empty() {
        return;
    }
    // Validate it's an image before parsing
    if image::image_dimensions(storage_path).is_err() {
        return;
    }
    let db_path = data_dir.join("planova.db");
    let style = {
        let Ok(db) = state.db.lock() else { return };
        db.query_row(
            "SELECT style FROM projects WHERE id = ?1",
            [project_id],
            |row| row.get::<_, String>(0),
        ).unwrap_or_else(|_| "modern_luxury".to_string())
    };
    let _ = spawn_pipeline(&db_path, &data_dir, &state.runtime, project_id, file_id, storage_path, &style, 2.8, 0.2);
}

fn row_to_file(row: &rusqlite::Row) -> rusqlite::Result<UploadedFile> {
    Ok(UploadedFile {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        original_filename: row.get("original_filename")?,
        file_type: row.get("file_type")?,
        file_size: row.get("file_size")?,
        storage_path: row.get("storage_path")?,
        preview_path: row.get("preview_path")?,
        parse_status: row.get("parse_status").unwrap_or_default(),
        created_at: row.get("created_at")?,
    })
}

fn to_file_response(f: &UploadedFile, _data_dir: &Path) -> FileResponse {
    let preview_url = if !f.preview_path.is_empty() && Path::new(&f.preview_path).exists() {
        storage::read_file_as_base64(&f.preview_path).unwrap_or_default()
    } else if !f.storage_path.is_empty() && Path::new(&f.storage_path).exists() {
        storage::read_file_as_base64(&f.storage_path).unwrap_or_default()
    } else {
        String::new()
    };

    FileResponse {
        id: f.id.clone(),
        project_id: f.project_id.clone(),
        original_filename: f.original_filename.clone(),
        file_type: f.file_type.clone(),
        file_size: f.file_size,
        preview_url,
        parse_status: f.parse_status.clone(),
        created_at: f.created_at.clone(),
    }
}

#[tauri::command]
pub fn upload_file(
    state: State<'_, AppState>,
    _app: AppHandle,
    project_id: String,
    file_path: String,
) -> Result<FileResponse, String> {
    let data_dir = state.data_dir.clone();

    // Read the file from the provided path
    let src = Path::new(&file_path);
    let file_bytes = std::fs::read(src).map_err(|e| format!("Failed to read file: {e}"))?;
    let original_filename = src
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("upload.png")
        .to_string();

    // Detect content type
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let content_type = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    };

    // Save to storage
    let storage_path = storage::save_upload(&data_dir, &file_bytes, &original_filename)?;

    // Generate preview for images
    let preview_path = if content_type.starts_with("image/") {
        storage::generate_preview(&storage_path, &data_dir).unwrap_or_default()
    } else {
        String::new()
    };

    let id = make_id();
    let now = now_utc();
    let file_size = file_bytes.len() as i64;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO uploaded_files (id, project_id, original_filename, file_type, file_size, storage_path, preview_path, parse_status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '', ?8)",
        rusqlite::params![id, project_id, original_filename, content_type, file_size, storage_path, preview_path, now],
    )
    .map_err(|e| format!("Failed to save file record: {e}"))?;

    let file = UploadedFile {
        id: id.clone(),
        project_id: project_id.clone(),
        original_filename,
        file_type: content_type.to_string(),
        file_size,
        storage_path: storage_path.clone(),
        preview_path,
        parse_status: String::new(),
        created_at: now,
    };

    drop(db);
    maybe_auto_parse(&state, &project_id, &id, &storage_path);

    Ok(to_file_response(&file, &data_dir))
}

#[tauri::command]
pub fn list_files(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<FileResponse>, String> {
    let data_dir = state.data_dir.clone();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT * FROM uploaded_files WHERE project_id = ?1 ORDER BY created_at")
        .map_err(|e| e.to_string())?;
    let files = stmt
        .query_map([&project_id], row_to_file)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();
    Ok(files.iter().map(|f| to_file_response(f, &data_dir)).collect())
}

#[tauri::command]
pub fn get_file_preview(
    state: State<'_, AppState>,
    file_id: String,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let file = db
        .query_row("SELECT * FROM uploaded_files WHERE id = ?1", [&file_id], row_to_file)
        .map_err(|_| "File not found".to_string())?;

    if !file.preview_path.is_empty() && Path::new(&file.preview_path).exists() {
        storage::read_file_as_base64(&file.preview_path)
    } else if !file.storage_path.is_empty() && Path::new(&file.storage_path).exists() {
        storage::read_file_as_base64(&file.storage_path)
    } else {
        Err("Preview file not found on disk".to_string())
    }
}

#[tauri::command]
pub fn upload_file_from_base64(
    state: State<'_, AppState>,
    project_id: String,
    base64_data: String,
    filename: String,
) -> Result<FileResponse, String> {
    let data_dir = state.data_dir.clone();

    // Decode base64
    use base64::Engine;
    let file_bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {e}"))?;

    // Detect content type from extension
    let ext = Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let content_type = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    };

    // Save to storage
    let storage_path = storage::save_upload(&data_dir, &file_bytes, &filename)?;

    // Generate preview for images
    let preview_path = if content_type.starts_with("image/") {
        storage::generate_preview(&storage_path, &data_dir).unwrap_or_default()
    } else {
        String::new()
    };

    let id = make_id();
    let now = now_utc();
    let file_size = file_bytes.len() as i64;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO uploaded_files (id, project_id, original_filename, file_type, file_size, storage_path, preview_path, parse_status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '', ?8)",
        rusqlite::params![id, project_id, filename, content_type, file_size, storage_path, preview_path, now],
    )
    .map_err(|e| format!("Failed to save file record: {e}"))?;

    let file = UploadedFile {
        id: id.clone(),
        project_id: project_id.clone(),
        original_filename: filename,
        file_type: content_type.to_string(),
        file_size,
        storage_path: storage_path.clone(),
        preview_path,
        parse_status: String::new(),
        created_at: now,
    };

    drop(db);
    maybe_auto_parse(&state, &project_id, &id, &storage_path);

    Ok(to_file_response(&file, &data_dir))
}

#[tauri::command]
pub fn delete_file(
    state: State<'_, AppState>,
    file_id: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let file = db
        .query_row("SELECT * FROM uploaded_files WHERE id = ?1", [&file_id], row_to_file)
        .map_err(|_| "File not found".to_string())?;

    storage::delete_storage_file(&file.storage_path);
    storage::delete_storage_file(&file.preview_path);

    // Delete associated scenes
    let _ = db.execute("DELETE FROM scenes WHERE file_id = ?1", [&file_id]);

    db.execute("DELETE FROM uploaded_files WHERE id = ?1", [&file_id])
        .map_err(|e| format!("Failed to delete file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn save_file(path: String, base64_data: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {e}"))?;
    std::fs::write(&path, &bytes).map_err(|e| format!("Failed to write file to {path}: {e}"))?;
    log::info!("File saved to {path} ({} bytes)", bytes.len());
    Ok(())
}
