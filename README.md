# LAMBDAn

Offline quiz application for Linux. Import `.tar.gz` quiz packs or standalone `.csv` files, study with multiple choice, true/false, and essay questions, track history, and optionally use a gamepad.

**Version:** 1.0.0-beta  
**Stack:** Tauri v2 · Rust · React · TypeScript · SQLite  
**License:** AGPL-3.0

---

## Prerequisites

### Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### Node (via nvm recommended)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

### System deps (Debian/Ubuntu)
```bash
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  libsqlite3-dev \
  build-essential \
  curl \
  wget \
  libssl-dev \
  libxdo-dev
```

### Tauri CLI
```bash
cargo install tauri-cli --version "^2.0"
```

---

## Development

```bash
git clone https://github.com/JN070694/LAMBDAn.git
cd LAMBDAn
npm install
cargo tauri dev
```

## Build

```bash
npm run build
cargo tauri build
# Output: src-tauri/target/release/bundle/
```

## Icon generation

Place a 512x512 `icon.png` in `src-tauri/icons/` then run:
```bash
cargo tauri icon src-tauri/icons/icon.png
```

---

## Pack Format

```
pack_name.tar.gz
├── Chapter1.csv
├── Chapter2.csv
└── support/
    ├── n17.png        # NID image
    ├── n17a.png       # NID variant a
    ├── n17b.png       # NID variant b
    ├── R1_Name.png    # Reference image 1
    └── R2_Name.jpg    # Reference image 2
```

Standalone `.csv` files can also be imported directly (no tar required).

### CSV Columns (10)

| Col | Field |
|-----|-------|
| 1 | Question number |
| 2 | Question text |
| 3 | Option A |
| 4 | Option B |
| 5 | Option C |
| 6 | Option D |
| 7 | Option E |
| 8 | Correct answer (A–E, True/False, or essay answer text) |
| 9 | NID (e.g. `n17`) |
| 10 | Group/category |

### Question Types (auto-detected)
- **MC** — options populated, col 8 = A–E
- **TF** — Option A = "True", Option B = "False"
- **Essay** — Option A = "Show Answer", col 8 = answer text

---

## Gamepad Defaults

| Action | Button |
|--------|--------|
| Select | A (0) |
| Back | B (1) |
| Skip, Mark Correct | X (2) |
| Skip, Mark Incorrect | Y (3) |
| Media | LB (4) |
| References | RB (5) |
| Pause | Start (9) |
| See Score | Select (8) |

Navigate with LS or D-Pad.

---

## Data Locations

| Path | Contents |
|------|----------|
| `~/.local/share/lambdan/lambdan.db` | SQLite database |
| `~/.local/share/lambdan/references/` | Reference images |
| `~/.local/share/lambdan/nids/` | NID images |
