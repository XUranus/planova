use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub style: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadedFile {
    pub id: String,
    pub project_id: String,
    pub original_filename: String,
    pub file_type: String,
    pub file_size: i64,
    pub storage_path: String,
    pub preview_path: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationTask {
    pub id: String,
    pub project_id: String,
    pub task_type: String,
    pub status: String,
    pub progress: i64,
    pub input_data: Option<serde_json::Value>,
    pub output_data: Option<serde_json::Value>,
    pub error_message: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scene {
    pub id: String,
    pub project_id: String,
    pub schema_version: String,
    pub scene_json: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub style: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileResponse {
    pub id: String,
    pub project_id: String,
    pub original_filename: String,
    pub file_type: String,
    pub file_size: i64,
    pub preview_url: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResponse {
    pub id: String,
    pub project_id: String,
    pub task_type: String,
    pub status: String,
    pub progress: i64,
    pub input_data: Option<serde_json::Value>,
    pub output_data: Option<serde_json::Value>,
    pub error_message: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneResponse {
    pub id: String,
    pub project_id: String,
    pub schema_version: String,
    pub scene_json: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}
