# Repository Cleanup and Git Prep (v2.0 Re-evaluation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perform a thorough cleanup of all redundant mockup files, old schema snapshots, database dumps, model evaluation reports, and log files by archiving them in a root-level `trash/` directory and updating `.gitignore` to clean the repository for the v2.0 release push to GitHub.

**Architecture:** Create a `trash/` folder at the root of the workspace. Group and move all files identified as junk (outdated static mockups, reports, logs, sqlite files, and backup scripts) into the `trash/` directory. Move the entire `scratch/` directory containing temporary development files into `trash/scratch/`. Update the root `.gitignore` file to ensure `trash/` is ignored by Git, and verify that the core system remains functional.

**Tech Stack:** Git, Shell.

---

### Task 1: Create Trash Folder and Archive Unwanted Root Files

**Files:**
- Create: `trash/`
- Create: `trash/scratch/`
- Move out of root:
  - `cricstats_compare_allround.html`
  - `cricstats_homepage_v2.html`
  - `cricstats_matchup_dashboard (1).html`
  - `cricstats_player_comparison_v2.html`
  - `cricstats_player_profile_v3.html`
  - `cricstats_player_vs_team.html`
  - `cricstats_team_dashboard.html`
  - `cricstats_team_vs_team.html`
  - `matches-module.html`
  - `preview.html`
  - `rcb_vs_kkr_h2h_dashboard.html`
  - `stat-builder.html`
  - `original_mvs.sql`
  - `res.md`
  - `database.sqlite`
  - `cricket_stats.db`
  - `cricketdb.dump`
  - `plan.md`
  - `CODEBASE_REVIEW_REPORT_2026-04-30.md`
  - `report[codex-gpt-5.4-xhigh]-2026-04-01.md`
  - `report[gemini 3.1pro-preview]-2026-04-01.md`
  - `report[opus-4.5]-2026-04-01.md`
- Move out of root directory:
  - `scratch/` (directory)

- [ ] **Step 1: Create the trash and sub-trash directories**

Run the following command at the repository root:
```bash
mkdir -p trash/scratch
```
Expected: Directories `trash` and `trash/scratch` are created.

- [ ] **Step 2: Move outdated mock HTML files to the trash directory**

Run:
```bash
mv cricstats_compare_allround.html cricstats_homepage_v2.html "cricstats_matchup_dashboard (1).html" cricstats_player_comparison_v2.html cricstats_player_profile_v3.html cricstats_player_vs_team.html cricstats_team_dashboard.html cricstats_team_vs_team.html matches-module.html preview.html rcb_vs_kkr_h2h_dashboard.html stat-builder.html trash/
```
Expected: The 12 mockup HTML files are moved to `trash/`.

- [ ] **Step 3: Move reports, database snapshots, logs, and outdated plans**

Run:
```bash
mv original_mvs.sql res.md plan.md CODEBASE_REVIEW_REPORT_2026-04-30.md "report[codex-gpt-5.4-xhigh]-2026-04-01.md" "report[gemini 3.1pro-preview]-2026-04-01.md" "report[opus-4.5]-2026-04-01.md" trash/
```
Expected: The evaluation reports, database snapshot, large logs, and old implementation plans are moved to `trash/`.

- [ ] **Step 4: Move SQLite databases and SQL dump files**

Run:
```bash
mv cricket_stats.db database.sqlite cricketdb.dump trash/ 2>/dev/null || true
```
Expected: Database cache files and backup dumps are safely stored in `trash/`.

- [ ] **Step 5: Archive the temporary scratch/ scripts directory**

Move the contents of the root `scratch/` directory to `trash/scratch/`:
```bash
mv scratch/* trash/scratch/ 2>/dev/null || true
rm -rf scratch
```
Expected: The root-level `scratch/` directory is removed, and all of its 55 scripts are archived inside `trash/scratch/`.

---

### Task 2: Configure Gitignore for Release Preparation

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Update .gitignore rules**

Append rules to ignore the local archive folder `trash/` and ensure no database files are accidentally checked in.
Edit the root `.gitignore` file to add the following block at the end:
```text

# Version 2.0 Local Trash Archive
trash/

# Databases & Cache
*.db
*.sqlite
```

- [ ] **Step 2: Verify git status is clean of untracked file pollution**

Run:
```bash
git status
```
Expected: The root directory is clean. The `trash/` directory and files inside it are ignored and do not show up as untracked. Only `.gitignore` shows as modified under changes not staged for commit.

---

### Task 3: Run Validation Checks

**Files:**
- Test: Verification of build and test suite.

- [ ] **Step 1: Verify TypeScript builds successfully**

Verify frontend code compile:
```bash
cd web && npx tsc --noEmit && cd ..
```
Expected: TypeScript compiles cleanly without errors.

- [ ] **Step 2: Run python backend unit tests**

Verify backend code integrity:
```bash
./.venv/bin/python -m pytest tests/
```
Expected: All 34 tests in the `tests/` directory pass successfully.
