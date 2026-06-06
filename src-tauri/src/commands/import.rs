use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;
use uuid::Uuid;
use chrono::Utc;
use flate2::read::GzDecoder;
use tar::Archive;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::db;
use crate::error::LambdanError;
use crate::models::{Question, ReferenceImage};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub quizzes_imported: usize,
    pub folder_id: Option<String>,
    pub folder_name: Option<String>,
    pub folder_was_created: bool,
}

fn prettify(stem: &str) -> String {
    stem.replace(['-', '_'], " ")
        .split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_image(name: &str) -> bool {
    matches!(
        Path::new(name).extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(),
        Some("png") | Some("jpg") | Some("jpeg") | Some("webp")
    )
}

fn parse_reference_filename(fname: &str) -> Option<ReferenceImage> {
    let base = Path::new(fname).file_stem()?.to_str()?;
    let re = regex::Regex::new(r"(?i)^R(\d+)_(.+)$").ok()?;
    let caps = re.captures(base)?;
    let number: i64 = caps[1].parse().ok()?;
    let name: String = caps[2].replace('_', " ")
        .split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    Some(ReferenceImage {
        key: base.to_string(),
        number,
        display_label: format!("{number} \u{2014} {name}"),
        name,
        file_path: String::new(),
    })
}

fn infer_type(q: &Question) -> String {
    if q.option_a.trim().eq_ignore_ascii_case("show answer") {
        return "ESSAY".into();
    }
    if q.option_a.trim().eq_ignore_ascii_case("true")
        && q.option_b.trim().eq_ignore_ascii_case("false")
        && q.option_c.trim().is_empty()
    {
        return "TF".into();
    }
    "MC".into()
}

/// Extract nid base from a filename stem. e.g. "n17a" -> "n17", "n17" -> "n17"
fn nid_base(stem: &str) -> Option<String> {
    let re = regex::Regex::new(r"(?i)^(n\d+)[a-z]?$").ok()?;
    let caps = re.captures(stem)?;
    Some(caps[1].to_lowercase())
}

#[tauri::command]
pub async fn import_pack(
    app: AppHandle,
    path: String,
    folder_id: Option<String>,
) -> std::result::Result<ImportResult, LambdanError> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| LambdanError::Custom(e.to_string()))?;
    let ref_dir = data_dir.join("references");
    let nid_dir = data_dir.join("nids");
    std::fs::create_dir_all(&ref_dir)?;
    std::fs::create_dir_all(&nid_dir)?;

    let tmp_dir = data_dir.join(format!("tmp_{}", Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir)?;

    let p = Path::new(&path);
    let is_tar = path.ends_with(".tar.gz") || path.ends_with(".tgz");
    let is_csv = path.ends_with(".csv");

    // Derive stem for folder naming
    let tar_stem = p.file_name().and_then(|n| n.to_str()).unwrap_or("import")
        .trim_end_matches(".tar.gz")
        .trim_end_matches(".tgz")
        .trim_end_matches(".gz")
        .to_string();

    if is_csv {
        // Single standalone CSV — copy to tmp
        let fname = p.file_name().unwrap();
        std::fs::copy(&path, tmp_dir.join(fname))?;
    } else if is_tar {
        let file = std::fs::File::open(&path)?;
        let gz = GzDecoder::new(file);
        let mut archive = Archive::new(gz);
        for entry in archive.entries()? {
            let mut entry = entry?;
            let entry_path = entry.path()?.to_path_buf();
            // Flatten: strip leading dirs, place everything flat in tmp
            if let Some(fname) = entry_path.file_name() {
                let out = tmp_dir.join(fname);
                // support/ subdir contents also go flat
                entry.unpack(&out).ok();
            }
        }
    } else {
        std::fs::remove_dir_all(&tmp_dir)?;
        return Err(LambdanError::Custom("Unsupported file type. Use .tar.gz or .csv".into()));
    }

    // Categorise extracted files
    // nid_map: base (e.g. "n17") -> Vec of (stem, path) sorted
    let mut nid_map: HashMap<String, Vec<(String, PathBuf)>> = HashMap::new();
    let mut reference_images: Vec<ReferenceImage> = Vec::new();
    let mut csv_paths: Vec<PathBuf> = Vec::new();

    for entry in std::fs::read_dir(&tmp_dir)? {
        let entry = entry?;
        let fname = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("csv")).unwrap_or(false)
        {
            csv_paths.push(path);
            continue;
        }

        if !is_image(&fname) { continue; }

        let stem = Path::new(&fname).file_stem()
            .and_then(|s| s.to_str()).unwrap_or("").to_lowercase();

        // Reference images: R1_Name pattern
        let first = fname.chars().next().unwrap_or(' ');
        let second = fname.chars().nth(1).unwrap_or(' ');
        if (first == 'R' || first == 'r') && second.is_ascii_digit() {
            if let Some(mut ri) = parse_reference_filename(&fname) {
                let dest = ref_dir.join(&fname);
                std::fs::copy(&path, &dest)?;
                ri.file_path = dest.to_string_lossy().to_string();
                reference_images.push(ri);
            }
        } else if let Some(base) = nid_base(&stem) {
            // Copy to nid_dir
            let dest = nid_dir.join(&fname);
            std::fs::copy(&path, &dest)?;
            nid_map.entry(base).or_default().push((stem.clone(), dest));
        }
    }

    reference_images.sort_by_key(|r| r.number);
    csv_paths.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

    if csv_paths.is_empty() {
        std::fs::remove_dir_all(&tmp_dir)?;
        return Err(LambdanError::Custom("No CSV files found".into()));
    }

    // Sort nid variants alphabetically
    for variants in nid_map.values_mut() {
        variants.sort_by(|a, b| a.0.cmp(&b.0));
    }

    let multi = csv_paths.len() > 1;
    let conn = db::get().lock().unwrap();
    let imported_at = Utc::now().to_rfc3339();
    let references_json = serde_json::to_string(&reference_images)?;

    // Resolve folder
    let (effective_folder_id, folder_name, folder_was_created) = if multi {
        let pretty = prettify(&tar_stem);
        let existing: Option<String> = conn.query_row(
            "SELECT id FROM folders WHERE lower(name) = lower(?1) LIMIT 1",
            params![pretty], |row| row.get(0),
        ).ok();
        if let Some(fid) = existing {
            (Some(fid), Some(pretty), false)
        } else {
            let fid = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO folders (id, name, created_at) VALUES (?1,?2,?3)",
                params![fid, pretty, imported_at],
            )?;
            (Some(fid), Some(pretty), true)
        }
    } else {
        let name = folder_id.as_ref().and_then(|fid| {
            conn.query_row("SELECT name FROM folders WHERE id=?1", params![fid], |r| r.get(0)).ok()
        });
        (folder_id.clone(), name, false)
    };

    // Parse and insert each CSV
    let mut total_imported = 0usize;
    for csv_path in &csv_paths {
        let quiz_id = Uuid::new_v4().to_string();
        let title = csv_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let file_name = csv_path.file_name().unwrap_or_default().to_string_lossy().to_string();

        let mut rdr = csv::ReaderBuilder::new()
            .has_headers(false).flexible(true).trim(csv::Trim::All)
            .from_path(csv_path)?;

        let mut questions: Vec<Question> = Vec::new();
        for record in rdr.records() {
            let r = record?;
            let get = |i: usize| r.get(i).unwrap_or("").trim().to_string();
            let nid = get(8).to_lowercase();

            // Find matching nid images
            let (image_path, nid_variants_json) = if !nid.is_empty() {
                let base = nid_base(&nid).unwrap_or(nid.clone());
                if let Some(variants) = nid_map.get(&base) {
                    let paths: Vec<String> = variants.iter()
                        .map(|(_, p)| p.to_string_lossy().to_string())
                        .collect();
                    let first = paths.first().cloned();
                    (first, serde_json::to_string(&paths).unwrap_or("[]".into()))
                } else {
                    (None, "[]".into())
                }
            } else {
                (None, "[]".into())
            };

            let mut q = Question {
                id: Uuid::new_v4().to_string(),
                quiz_id: quiz_id.clone(),
                question_number: get(0),
                question_text: get(1),
                option_a: get(2),
                option_b: get(3),
                option_c: get(4),
                option_d: get(5),
                option_e: get(6),
                correct_answer: get(7),
                nid,
                image_path,
                nid_variants: vec![],
                group: get(9),
                question_type: String::new(),
            };
            q.question_type = infer_type(&q);

            conn.execute(
                "INSERT OR REPLACE INTO questions
                 (id, quiz_id, question_number, question_text, option_a, option_b, option_c,
                  option_d, option_e, correct_answer, nid, image_path, nid_variants, grp, question_type)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
                params![q.id, q.quiz_id, q.question_number, q.question_text,
                        q.option_a, q.option_b, q.option_c, q.option_d, q.option_e,
                        q.correct_answer, q.nid, q.image_path, nid_variants_json,
                        q.group, q.question_type],
            )?;
            questions.push(q);
        }

        conn.execute(
            "INSERT OR REPLACE INTO quizzes
             (id, title, csv_file_name, question_count, imported_at, reference_images, folder_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![quiz_id, title, file_name, questions.len() as i64,
                    imported_at, references_json, effective_folder_id],
        )?;
        total_imported += 1;
    }

    std::fs::remove_dir_all(&tmp_dir)?;

    Ok(ImportResult {
        quizzes_imported: total_imported,
        folder_id: effective_folder_id,
        folder_name,
        folder_was_created,
    })
}
