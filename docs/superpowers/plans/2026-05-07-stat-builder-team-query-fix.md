# Stat Builder Team Query & UI Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the "no data" issue in Stat Builder for Team stats when filters (IPL, 2026, Powerplay) are applied, and fix UI grouping inconsistencies.

**Architecture:** 
- **Backend:** Update `build_team_query` to include a `team_match_totals_full` CTE. This ensures that score thresholds (e.g., 180+) apply to the entire match score, while phase filters (e.g., powerplay) only affect the stat aggregation.
- **Backend:** Wrap all team-related joins in `TEAM_NORM_SQL` to handle historical team name variations consistently.
- **Frontend:** Update `FilterPanel` to reset `group_by` to `"team"` when a `team_*` stat type is selected.

**Tech Stack:** Python, PostgreSQL, React, Next.js, TypeScript.

---

### Task 1: Backend - Normalize Team Joins and Add Full Match Totals

**Files:**
- Modify: `api/stat_builder.py`

- [ ] **Step 1: Refactor `stat_builder_team_batting` to include full match totals**

```python
# In api/stat_builder.py

# Add this CTE before team_match_aggregates
team_match_totals_full_cte = """
    team_match_totals_full AS (
        SELECT 
            i.match_id, 
            i.batting_team, 
            SUM(d.runs_total) as full_match_runs
        FROM innings i
        JOIN deliveries d ON d.innings_id = i.innings_id
        GROUP BY i.match_id, i.batting_team
    )
"""

# Update unpivoted_matches to join this CTE and use full_match_runs for thresholds
# Also update all joins to use TEAM_NORM_SQL on both sides
```

- [ ] **Step 2: Update `stat_builder_team_bowling` similarly**

- [ ] **Step 3: Update `unpivoted_matches` join conditions**

```python
# Replace:
# LEFT JOIN team_match_aggregates t1 ON t1.match_id = m.match_id AND t1.batting_team = m.team1
# With:
# LEFT JOIN team_match_aggregates t1 ON t1.match_id = m.match_id AND {TEAM_NORM_SQL.format(col="t1.batting_team")} = {TEAM_NORM_SQL.format(col="m.team1")}
```

---

### Task 2: Frontend - Fix Grouping State Reset

**Files:**
- Modify: `web/components/stat-builder/FilterPanel.tsx`

- [ ] **Step 1: Update `stat_type` change handler to reset `group_by`**

```typescript
// In FilterPanel.tsx
const handleStatTypeChange = (newStatType: string) => {
  const updates: Partial<StatBuilderRequest> = { stat_type: newStatType };
  if (newStatType.startsWith("team")) {
    updates.group_by = "team";
  }
  u(updates);
};
```

---

### Task 3: Verification

- [ ] **Step 1: Run debug script to verify SQL generation**
Run: `PYTHONPATH=. ./.venv/bin/python scratch/debug_team_bat.py`

- [ ] **Step 2: Execute resulting SQL via MCP tool**
Verify it returns 10 teams for IPL 2026 Powerplay.

- [ ] **Step 3: Verify UI change in browser**
Confirm "Grouped by player" no longer appears in Team modes.
