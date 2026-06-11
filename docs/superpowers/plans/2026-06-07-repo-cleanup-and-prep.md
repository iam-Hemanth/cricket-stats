# Repository Cleanup and Git Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up redundant files from the repository root by moving them to an ignored `trash/` folder and preparing the repository for the v2.0 release push to GitHub.

**Architecture:** Create a `trash/` directory at the repository root and move all outdated static mockup HTML files, database logs, and model evaluation reports into it. Update `.gitignore` to ensure `trash/`, `*.sqlite`, and `*.db` files are ignored so they do not pollute the git repository.

**Tech Stack:** Git, Shell.

---

### Task 1: Create Trash Folder and Archive Root Files

**Files:**
- Create: `trash/` (new directory)
- Move out of root:
  - `cricstats_compare_allround.html`
  - `cricstats_homepage_v2.html`
  - `cricstats_matchup_dashboard (1).html`
  - `cricstats_player_comparison_v2.html`
  - `cricstats_player_profile_v3.html`
  - `cricstats_player_vs_team.html`
  - `cricstats_team_dashboard.html`
  - `cricstats_team_vs_team.html`
  - `preview.html`
  - `rcb_vs_kkr_h2h_dashboard.html`
  - `stat-builder.html`
  - `original_mvs.sql`
  - `res.md`
  - `database.sqlite`
  - `cricket_stats.db`
  - `CODEBASE_REVIEW_REPORT_2026-04-30.md`
  - `report[codex-gpt-5.4-xhigh]-2026-04-01.md`
  - `report[gemini 3.1pro-preview]-2026-04-01.md`
  - `report[opus-4.5]-2026-04-01.md`

- [ ] **Step 1: Create the trash directory**

Run the following command at the repository root:
```bash
mkdir -p trash
```
Expected: Directory `trash` is successfully created.

- [ ] **Step 2: Move outdated mock HTML files to the trash directory**

Run the following command at the repository root:
```bash
mv cricstats_compare_allround.html cricstats_homepage_v2.html "cricstats_matchup_dashboard (1).html" cricstats_player_comparison_v2.html cricstats_player_profile_v3.html cricstats_player_vs_team.html cricstats_team_dashboard.html cricstats_team_vs_team.html preview.html rcb_vs_kkr_h2h_dashboard.html stat-builder.html trash/
```
Expected: The 11 mockup HTML files are moved into `trash/`.

- [ ] **Step 3: Move database schemas, logs, evaluation reports, and SQLite database files to the trash directory**

Run the following command at the repository root:
```bash
mv original_mvs.sql res.md database.sqlite cricket_stats.db CODEBASE_REVIEW_REPORT_2026-04-30.md "report[codex-gpt-5.4-xhigh]-2026-04-01.md" "report[gemini 3.1pro-preview]-2026-04-01.md" "report[opus-4.5]-2026-04-01.md" trash/ 2>/dev/null || true
```
Expected: The database snapshot, evaluation reports, logs, and sqlite database files are moved to `trash/`.

---

### Task 2: Configure Gitignore for Repository Preparation

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Update the .gitignore file**

Add rules to ensure that the newly created `trash/` folder, plus any generic sqlite/db database files, are ignored.
Append the following lines to `.gitignore`:
```text
# Local trash/archive directory
trash/

# SQLite databases
*.db
*.sqlite
```

- [ ] **Step 2: Verify git status to ensure ignored files do not appear as untracked**

Run:
```bash
git status
```
Expected: The files moved to `trash/` and the `trash/` folder itself should not appear under "Untracked files". Only `.gitignore` should show as modified under "Changes not staged for commit".

---

### Task 3: Verify Project Builds and Tests Run

**Files:**
- Test: Verification of project build and test suite.

- [ ] **Step 1: Verify TypeScript compiler check**

Navigate to the `web` directory and run the compiler check:
```bash
cd web && npx tsc --noEmit && cd ..
```
Expected: TypeScript compiles with zero errors.

- [ ] **Step 2: Run python unit tests on the tests/ directory**

Run the backend test suite:
```bash
./.venv/bin/python -m pytest tests/
```
Expected: All 34 tests in the `tests/` directory pass successfully.
