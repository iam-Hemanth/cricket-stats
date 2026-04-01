# CricStats — Post-Deployment Feature Implementation Plan

## Problem Statement
Implement the top 5 high-impact features from POST_DEPLOYMENT_ROADMAP.md to enhance the cricket statistics platform with better discoverability, engagement, and analytics depth.

## Selected Features (Priority Order)

### Feature 1: Top Run Scorers / Wicket Takers in Team Matchups
**Source:** F7 extensions (Priority: High)
**Description:** Show top 10 batters by runs and top 10 bowlers by wickets in matches between two specific teams.

**Implementation:**
1. **API Endpoints:**
   - `GET /api/v1/teams/h2h/top-batters?team1=India&team2=Australia&format=Test`
   - `GET /api/v1/teams/h2h/top-bowlers?team1=India&team2=Australia&format=Test`
2. **Database:** Query deliveries joined to matches filtered by both teams
3. **Frontend:** Add collapsible sections below main h2h table on /teams page

### Feature 2: Standalone Matchup Search Page (/matchup)
**Source:** F6 extensions (Priority: Medium)
**Description:** Dedicated page to search for any batter vs bowler matchup directly, without navigating through player profiles.

**Implementation:**
1. **Frontend Route:** `/matchup` page with dual search bars
2. **URL Support:** `/matchup?batter=ba607b88&bowler=244048f6`
3. **Components:** Two SearchBar instances + MatchupCard display

### Feature 3: Format Filter for Form Guide
**Source:** F4 extensions (Priority: Medium)
**Description:** Filter the last 10 innings form guide by specific format (IPL only, ODI only, Test only, etc.)

**Implementation:**
1. **API Change:** Add `?format=T20` param to `/api/v1/players/{id}/form`
2. **Frontend:** Add format pills above form strip in PlayerProfile

### Feature 4: Phase Specialist Badge
**Source:** F3 extensions (Priority: Medium)
**Description:** Auto-detect and display badges like "Death overs specialist" on player profile headers.

**Implementation:**
1. **Logic:** Compare phase SR/economy — if death SR is 20+ higher than powerplay, mark as death specialist
2. **API:** Return specialist badges in batting/bowling endpoint or new dedicated endpoint
3. **Frontend:** Display badge in player profile header

### Feature 5: "On This Day in Cricket" Card
**Source:** Homepage extensions (Priority: Medium)
**Description:** Show a notable match from the same calendar date in previous years on homepage.

**Implementation:**
1. **API Endpoint:** `GET /api/v1/on-this-day`
2. **Query:** `SELECT FROM matches WHERE EXTRACT(MONTH FROM date) = X AND EXTRACT(DAY FROM date) = Y ORDER BY RANDOM() LIMIT 1`
3. **Frontend:** Add card to homepage highlights section

---

## Todos

### Feature 1: Top Scorers in Team Matchups
- [ ] F1-API: Add GET /api/v1/teams/h2h/top-batters endpoint
- [ ] F1-API: Add GET /api/v1/teams/h2h/top-bowlers endpoint
- [ ] F1-API: Add queries to api/queries.py
- [ ] F1-API: Add Pydantic models to api/models.py
- [ ] F1-FE: Add TopPerformers component to /teams page
- [ ] F1-TEST: Test endpoints with India vs Australia

### Feature 2: Standalone Matchup Page
- [ ] F2-FE: Create web/app/matchup/page.tsx
- [ ] F2-FE: Add dual search functionality
- [ ] F2-FE: Support URL params for shareable links
- [ ] F2-TEST: Test with Kohli vs Bumrah matchup

### Feature 3: Form Guide Format Filter
- [ ] F3-API: Add format param to /players/{id}/form endpoint
- [ ] F3-API: Update SQL query to filter by format
- [ ] F3-FE: Add format pills UI above form strip
- [ ] F3-TEST: Test IPL-only form for Kohli

### Feature 4: Phase Specialist Badge
- [ ] F4-API: Add specialist detection logic
- [ ] F4-API: Return badges in player stats response
- [ ] F4-FE: Display badge in PlayerProfile header
- [ ] F4-TEST: Verify Bumrah shows as death specialist

### Feature 5: On This Day Card
- [ ] F5-API: Add GET /api/v1/on-this-day endpoint
- [ ] F5-FE: Add OnThisDay component to homepage
- [ ] F5-TEST: Verify random match selection works

---

## Execution Order

1. **Feature 1** (Top Scorers) — builds on existing /teams page infrastructure
2. **Feature 3** (Form Filter) — small API change, high user value
3. **Feature 4** (Phase Badge) — uses existing phase data
4. **Feature 5** (On This Day) — standalone, no dependencies
5. **Feature 2** (Matchup Page) — new page, can be done last

---

## Notes
- Update COPILOT_CONTEXT.md after completing each feature
- Run `npm run build` to verify frontend changes
- Test API endpoints at http://localhost:8000/docs
- Use fleet agents for parallel implementation when possible
