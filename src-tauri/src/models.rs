use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub quiz_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Quiz {
    pub id: String,
    pub title: String,
    pub csv_file_name: String,
    pub question_count: i64,
    pub imported_at: String,
    pub reference_images: Vec<ReferenceImage>,
    pub folder_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceImage {
    pub key: String,
    pub number: i64,
    pub name: String,
    pub display_label: String,
    pub file_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub id: String,
    pub quiz_id: String,
    pub question_number: String,
    pub question_text: String,
    pub option_a: String,
    pub option_b: String,
    pub option_c: String,
    pub option_d: String,
    pub option_e: String,
    pub correct_answer: String,
    pub nid: String,
    pub image_path: Option<String>,
    pub nid_variants: Vec<String>,
    pub group: String,
    pub question_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub quiz_id: String,
    pub quiz_title: String,
    pub date: String,
    pub score: i64,
    pub total: i64,
    pub percentage: f64,
    pub time_seconds: i64,
    pub question_results: Vec<QuestionResult>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuestionResult {
    pub question_id: String,
    pub question_text: String,
    pub correct: bool,
    pub user_answer: String,
    pub correct_answer: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub instant_feedback: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GamepadMapping {
    pub select: u32,
    pub back: u32,
    pub skip_correct: u32,
    pub skip_incorrect: u32,
    pub media: u32,
    pub references: u32,
    pub pause: u32,
    pub score: u32,
}

impl Default for GamepadMapping {
    fn default() -> Self {
        Self {
            select: 0,       // A
            back: 1,         // B
            skip_correct: 2, // X
            skip_incorrect: 3, // Y
            media: 4,        // LB
            references: 5,   // RB
            pause: 9,        // Start/Menu
            score: 8,        // Select/View
        }
    }
}
