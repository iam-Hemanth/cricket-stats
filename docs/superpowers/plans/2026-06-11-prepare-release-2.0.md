# Prepare Repository for Version 2.0 Release Implementation Plan (Updated)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the repository (ignoring Screenshots, .agent, and raw Logos folders), update the README.md with v2.0 highlights, compile a detailed version 2.0 release commit message, and stage/commit all code changes for a clean push.

**Architecture:** Update the root `.gitignore` to prevent committing agent files, high-res backup images, and large screenshots. Modify the `README.md` to showcase version 2.0 features (including Interactive Match Card v3, team H2H top performers, matches archive revamp, and design updates). Staging files and creating a commit with a comprehensive message listing all major version improvements.

**Tech Stack:** Git, Shell, Node.js (TypeScript), Python (Pytest).

---

## User Review Required

> [!IMPORTANT]
> Based on your feedback, we will configure `.gitignore` to ignore the following folders:
> - `Screenshots/` (contains 46 large PNGs totaling ~150MB+)
> - `.agent/` (agent tools/workflows)
> - `Logos/` (raw root logos; optimized logos used in the app live in `web/public/logos/` and will be committed)

> [!TIP]
> The commit message will include a comprehensive log of all improvements and features completed for Version 2.0 (shown below under Task 4, Step 3).

---

### Task 1: Verify Code Stability and Compilation

**Files:**
- Test: Verification of build and test suite.

- [ ] **Step 1: Verify TypeScript builds successfully**

Run:
```bash
npx tsc --noEmit
```
Expected: TypeScript compiles cleanly without errors. (Already verified: PASS).

- [ ] **Step 2: Run Next.js production build**

Run:
```bash
npm run build
```
Expected: Next.js successfully compiles and optimizes all pages, including static and dynamic routes. (Already verified: PASS).

- [ ] **Step 3: Run Python backend unit tests**

Since the IDE terminal is sandboxed and cannot connect to the PostgreSQL database, please run the following command in your native macOS Terminal at the repository root:
```bash
./.venv/bin/python -m pytest tests/
```
Expected: All 34+ backend tests (including API endpoints, database URL configuration, entity resolution, and stat builder matrix tests) pass successfully.

---

### Task 2: Configure Gitignore and Clean Up Untracked Files

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add Screenshots, Agent, and raw Logos directories to .gitignore**

Edit the root `.gitignore` file to add the following block at the end:
```text

# Version 2.0 Prep: Large assets and agent tools
Screenshots/
.agent/
Logos/
```

- [ ] **Step 2: Verify git status after updating ignore rules**

Run:
```bash
git status
```
Expected: The directories `Screenshots/`, `.agent/`, and `Logos/` are ignored. Only actual source code, optimized logos in `web/public/logos/`, and modified configuration files should remain in the untracked/modified list.

---

### Task 3: Update README.md for Version 2.0 Features

**Files:**
- Modify: [README.md](file:///Users/hemanth/cricket-stats/README.md)

- [ ] **Step 1: Update README.md feature list**

Modify [README.md](file:///Users/hemanth/cricket-stats/README.md) to update:
1. **Match Archive & Match Cards**: Add mention of **Match Card v3 (interactive 2D run progression chart with scroll-to-zoom and drag-to-pan, Fall of Wicket annotations, and cumulative data)**.
2. **Matches timeline widgets**: Highlight **Timeline Density widget using side-by-side vertical pillars and smart team abbreviations parsing (RCB, CSK)**.
3. **UI/UX Design**: Add mention of the **premium glassmorphic theme overhaul with animated SVG loaders and seamless Light Mode integration**.

---

### Task 4: Documentation and Context Verification

**Files:**
- Modify: [COPILOT_CONTEXT.md](file:///Users/hemanth/cricket-stats/COPILOT_CONTEXT.md)

- [ ] **Step 1: Update the COPILOT_CONTEXT.md file**

Append the log of the current prompt and preparation action to the end of [COPILOT_CONTEXT.md](file:///Users/hemanth/cricket-stats/COPILOT_CONTEXT.md).
```markdown
## Thu Jun 11 11:43:00 IST 2026
- Prepared the codebase for version 2.0 release.
- Verified TypeScript compilation and production Next.js build.
- Updated `.gitignore` to ignore local agent tools (`.agent/`), raw logo sources (`Logos/`), and large mock/media assets (`Screenshots/`).
- Updated `README.md` to document interactive Run Chart v3, vertical timeline pillars, and light mode support.
- Staged all source code files, components, and tests for the 2.0 push.
```

- [ ] **Step 2: Verify PROJECT_MEMORY.md is clean of sensitive info**

Check the staged files and project memory to verify no credentials or passwords are committed.

- [ ] **Step 3: Stage all relevant source code and assets**

Run:
```bash
git add .
```
Expected: All source code (including new frontend routes, components, backend modules, tests, docs, and public logos) are staged.

---

### Task 5: Final Verification and Commit

**Files:**
- Commit: git repository

- [ ] **Step 1: Commit all staged changes with a detailed release message**

Run the commit command with the following detailed commit message describing all version 2.0 improvements and fixes:
```bash
git commit -m "release: version 2.0 release candidate prep

Prepare the codebase for the v2.0 production release by verifying build integrity, cleaning up local development tools/assets, and updating documentation.

Key Features & Enhancements in Version 2.0:
1. Interactive Match Card & Run Progression Chart (v3):
   - Added high-fidelity SVG run progression chart.
   - Implemented interactive 2D pan/zoom engine (scroll-to-zoom, drag-to-pan, double-click reset).
   - Displayed cumulative runs, overs, and Fall of Wicket (FOW) annotations.
2. Team Head-to-Head Top Performers:
   - Added API endpoints for top batters and bowlers in H2H matches.
   - Integrated Top Performers leaderboard cards into the Teams dashboard.
3. Stat Builder Extensions:
   - Added 'Team Results & Standings' stat type querying match outcomes directly.
   - Added batting/bowling dismissal filters, is_not_out filter, and best bowling figures.
4. Matches Archive Page Revamp:
   - Implemented three-panel layout matching matches-module.html.
   - Redesigned Month Timeline match density widget to use side-by-side vertical pillars.
   - Supported 'All Time Archive' view and defaulted to year 2026.
   - Added smart abbreviation search query parsing (e.g. RCB vs CSK).
   - Displayed series/tournament winner scorelines and resolved canonical host countries.
5. Phase Specialist badging & Form Guide filters:
   - Automated death/powerplay specialist detection, showing gold badges on Player Profile.
   - Added format pills to form guide to filter innings by competition type.
6. On This Day in Cricket:
   - Added homepage component displaying historical matches on the current month/day.
7. Premium UI/UX Design System:
   - Re-designed pages with custom glassmorphic styling, ambient glow, and micro-animations.
   - Added complete support for light mode across all revamped pages.
8. Database Optimization:
   - Trimmed PostgreSQL database to ~500MB target range by filtering on Full Member nations and major T20 leagues.
   - Unified filters between ingest and sync paths.
9. Entity Canonicalization:
   - Added alias mapping for teams (RCB name normalization) and venues during bulk ingestion and API queries.

Repository Prep:
- Ignored .agent/ configuration, raw Logos/ sources, and Screenshots/ in .gitignore.
- Verified typescript workspace builds cleanly.
- Updated README.md and COPILOT_CONTEXT.md."
```
Expected: The changes are committed cleanly with the comprehensive release commit message.

---

## Verification Plan

### Automated Tests
- Run `npx tsc --noEmit` inside `web` directory.
- Run `npm run build` inside `web` directory.
- Run `git status` to verify staged changes.

### Manual Verification
- Ask the user to run `./.venv/bin/python -m pytest tests/` in their native terminal.
