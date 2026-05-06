use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub data_dir: PathBuf,
    pub runtime: tokio::runtime::Runtime,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    style TEXT DEFAULT 'modern_luxury',
    status TEXT DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS uploaded_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,
    file_type TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    storage_path TEXT DEFAULT '',
    preview_path TEXT DEFAULT '',
    parse_status TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_type TEXT DEFAULT 'floorplan_parse',
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    input_data TEXT,
    output_data TEXT,
    error_message TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_id TEXT DEFAULT '',
    name TEXT DEFAULT '',
    schema_version TEXT DEFAULT '0.1.0',
    scene_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"#;

pub fn init_db(db_path: &PathBuf) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open database: {e}"))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| format!("Failed to set PRAGMAs: {e}"))?;
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("Failed to create schema: {e}"))?;

    // Migration: add new columns to existing tables (ignored if already exist)
    let _ = conn.execute_batch(
        "ALTER TABLE uploaded_files ADD COLUMN parse_status TEXT DEFAULT '';
         ALTER TABLE scenes ADD COLUMN file_id TEXT DEFAULT '';
         ALTER TABLE scenes ADD COLUMN name TEXT DEFAULT '';"
    );

    Ok(conn)
}
