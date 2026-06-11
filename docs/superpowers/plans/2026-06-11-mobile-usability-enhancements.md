# Mobile Usability & Collapsible Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a collapsible filters sidebar for the Stat Builder module to prevent obstruction of stats on mobile, and improve mobile layout usability for both the Stat Builder and Matches module.

**Architecture:** Use React state (`showFilters`) in Stat Builder with responsive CSS media queries to slide the Filter Panel as an overlay drawer on mobile. Correct the CSS specificity bug in Matches module that hides the filter panel on mobile, and redesign matches list rows and toolbar on mobile into touch-friendly cards.

**Tech Stack:** Next.js, React, Tailwind CSS, Vanilla CSS

---

## User Review Required

> [!IMPORTANT]
> - **Stat Builder Drawer:** On screen widths below 768px, the Stat Builder's Filter Panel will default to closed. Opening it will slide in a 290px drawer overlaying the results, with a blurred backdrop overlay to close it when tapped.
> - **Matches Module Redesign:** The tabular layout of individual matches in expanded tours (currently 5 columns: stage, teams, venue, result, date) will be condensed into a 3-row card on screens below 768px. The stadium/venue name will be hidden on mobile to maximize readability.

## Open Questions

*None at this time. The plan implements standard and clean mobile layout behaviors matching the existing CricStats glassmorphic aesthetics.*

---

## Proposed Changes

### Stat Builder Collapsible Filters

#### [MODIFY] [page.tsx](file:///Users/hemanth/cricket-stats/web/app/stat-builder/page.tsx)
Add the responsive collapsible filter toggle state, backdrop overlay, and top-bar toggle button to the page.

#### [MODIFY] [globals.css](file:///Users/hemanth/cricket-stats/web/app/globals.css)
Add stylesheet classes for the collapsible sidebar drawer and backdrop animations.

---

### Matches Page Mobile Layout Fixes

#### [MODIFY] [page.tsx](file:///Users/hemanth/cricket-stats/web/app/matches/page.tsx)
Fix toolbar class mismatch, add backdrop overlay, and introduce class identifier to the mobile filter button.

#### [MODIFY] [matches.css](file:///Users/hemanth/cricket-stats/web/app/matches/matches.css)
Fix the mobile display bug, style the toolbar grid for mobile, and implement match card layout on mobile.

---

## Tasks

### Task 1: Stat Builder Collapsible State & UI Toggle

**Files:**
- Modify: `web/app/stat-builder/page.tsx`

- [ ] **Step 1: Implement responsive showFilters state and toggle button**

Replace the rendering in `web/app/stat-builder/page.tsx` around lines 76-110 and lines 365-440.

```typescript
  const [filters, setFilters] = useState<StatFilters>({ ...defaultFilters });
  const [showFilters, setShowFilters] = useState(true);

  // Initialize showFilters to false on mobile on mount to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== "undefined") {
      setShowFilters(window.innerWidth >= 768);
    }
  }, []);
```

And update the top bar:
```tsx
      {/* ── Top bar with back button ──────────────── */}
      <div style={{
        height: 42, display: "flex", alignItems: "center", gap: 10,
        padding: "0 14px", borderBottom: `1px solid ${C.border}`,
        background: C.low, flexShrink: 0,
      }}>
        <Link
          href="/"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 11, color: C.muted, textDecoration: "none",
            padding: "4px 10px", borderRadius: 6,
            border: `1px solid ${C.border}`, background: "transparent",
            transition: "all .15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}
        >
          ← Back
        </Link>
        <button
          onClick={() => setShowFilters(prev => !prev)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 11, color: showFilters ? C.green : C.muted,
            padding: "4px 10px", borderRadius: 6,
            border: `1px solid ${showFilters ? "rgba(75,226,119,0.3)" : C.border}`,
            background: showFilters ? "rgba(75,226,119,0.05)" : "transparent",
            transition: "all .15s", cursor: "pointer",
            outline: "none", fontFamily: "inherit"
          }}
        >
          {showFilters ? "✕ Hide Filters" : "⚙️ Show Filters"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <svg style={{ width: 18, height: 18, color: C.green }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M14.5 4.5c-1 2-1 4.5 0 7s1 5 0 7" strokeLinecap="round" />
            <path d="M9.5 4.5c1 2 1 4.5 0 7s-1 5 0 7" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            Cric<span style={{ color: C.green }}>Stats</span>
            <span style={{ color: C.muted, fontWeight: 400, marginLeft: 6, fontSize: 11 }}>· Stat Builder</span>
          </span>
        </div>
      </div>
```

Update the main container layout to support mobile overlays, overlay backdrop, and close-on-run logic:
```tsx
      {/* ── Main layout (sidebar + results) ────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Mobile Backdrop Overlay */}
        {showFilters && (
          <div 
            className="md:hidden"
            onClick={() => setShowFilters(false)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0, 0, 0, 0.4)",
              backdropFilter: "blur(4px)",
              zIndex: 90,
              transition: "opacity 0.2s ease"
            }}
          />
        )}

        <div 
          className={`stat-builder-sidebar ${showFilters ? 'is-open' : ''}`}
          style={{ display: showFilters ? "flex" : "none", flexDirection: "column" }}
        >
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            onRun={() => {
              runQuery();
              if (window.innerWidth < 768) {
                setShowFilters(false);
              }
            }}
            onReset={resetFilters}
            loading={loading}
          />
        </div>
        <ResultsViewer
          statType={filters.stat_type as any}
          batRows={batRows}
          bowlRows={bowlRows}
          teamRows={teamRows}
          compareRows={compareRows}
          h2hData={h2hData}
          summary={summary}
          queryTimeMs={queryTimeMs}
          hasRun={hasRun}
          loading={loading}
          filterCount={filterCount}
          groupBy={filters.group_by}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          activeFilters={activeFilters}
          onRemoveFilter={removeFilter}
          resolvedOpponents={resolvedOpponents}
        />
      </div>
```

---

### Task 2: Stat Builder Sidebar CSS Styles

**Files:**
- Modify: `web/app/globals.css`

- [ ] **Step 1: Add media queries and animations for stat builder sidebar**

Append the following styles to `web/app/globals.css`:

```css
/* Stat Builder Collapsible Sidebar styles */
.stat-builder-sidebar {
  flex-shrink: 0;
  height: 100%;
}

@media (max-width: 767px) {
  .stat-builder-sidebar {
    position: absolute !important;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 100;
    height: 100% !important;
    width: 290px !important;
    box-shadow: 10px 0 30px rgba(0, 0, 0, 0.6);
    background: var(--bg-surface);
    animation: sbSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }
}

@keyframes sbSlideIn {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

/* Custom Scrollbar for results table */
.overflow-x-auto {
  scrollbar-width: thin;
  scrollbar-color: var(--glass-border) transparent;
}
.overflow-x-auto::-webkit-scrollbar {
  height: 4px;
}
.overflow-x-auto::-webkit-scrollbar-thumb {
  background: var(--glass-border);
  border-radius: 2px;
}
```

---

### Task 3: Matches Page Mobile Sidebar Filter Specfix

**Files:**
- Modify: `web/app/matches/page.tsx`
- Modify: `web/app/matches/matches.css`

- [ ] **Step 1: Resolve display overrides in matches.css**

In `web/app/matches/matches.css:15-22`, change the `display: none !important;` rule to allow `.fixed` to display:

```css
@media (max-width: 1024px) {
  .matches-layout {
    grid-template-columns: 1fr;
  }
  .matches-left-panel:not(.fixed), .matches-right-panel {
    display: none !important;
  }
}
```

- [ ] **Step 2: Add backdrop overlay and toolbar class fix in matches/page.tsx**

Update `web/app/matches/page.tsx` inside the return statement (around lines 1049-1065):

```tsx
  return (
    <div className="matches-layout">
      {/* Mobile Sidebar Backdrop Overlay */}
      {mobileFiltersOpen && (
        <div 
          className="lg:hidden"
          onClick={() => setMobileFiltersOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 45,
          }}
        />
      )}

      {/* ── LEFT PANEL (FILTER ARCHIVE) ──────────────────────── */}
      <div className={`matches-left-panel ${mobileFiltersOpen ? "fixed inset-y-0 left-0 z-50 w-[260px] flex shadow-2xl" : "hidden lg:flex"}`}>
```

And correct the toolbar class from `toolbar` to `matches-toolbar` around line 1218:
```tsx
      {/* ── CENTRAL MAIN COLUMN ───────────────────────────────── */}
      <div className="main flex-1">
        {/* Toolbar */}
        <div className="matches-toolbar">
          <div className="search-row">
            <button 
              className="vt-btn lg:hidden mr-1 border border-glass-border px-3 py-1.5 rounded-lg text-xs mobile-filter-btn"
              onClick={() => setMobileFiltersOpen(true)}
            >
              📁 Filters
            </button>
```

---

### Task 4: Matches Page Toolbar Mobile Responsive Grid

**Files:**
- Modify: `web/app/matches/matches.css`

- [ ] **Step 1: Write media query for search row wrapping on mobile**

Add the following to `web/app/matches/matches.css` under toolbar styles:

```css
@media (max-width: 768px) {
  .search-row {
    display: grid !important;
    grid-template-columns: auto 1fr;
    gap: 8px !important;
  }
  
  .mobile-filter-btn {
    grid-column: 1;
    grid-row: 1;
    margin: 0 !important;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .main-search {
    grid-column: 2;
    grid-row: 1;
    height: 38px;
  }
  
  .view-toggle {
    grid-column: 1;
    grid-row: 2;
    display: flex;
    height: 32px;
  }
  
  .sort-sel {
    grid-column: 2;
    grid-row: 2;
    width: 100%;
    height: 32px;
    padding: 0 8px;
  }
}
```

---

### Task 5: Matches List Row Card Layout for Mobile

**Files:**
- Modify: `web/app/matches/matches.css`

- [ ] **Step 1: Write media query for match card layout on mobile**

Append the mobile `.match-row` and `.sm-hdr` overrides to the end of `web/app/matches/matches.css`:

```css
@media (max-width: 768px) {
  .sm-hdr {
    display: none !important;
  }
  
  .match-row {
    display: grid !important;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto auto;
    gap: 6px 8px;
    padding: 12px !important;
  }
  
  .mr-fmt {
    grid-column: 1;
    grid-row: 1;
    align-self: center;
  }
  
  .mr-date {
    grid-column: 2;
    grid-row: 1;
    text-align: right !important;
    align-self: center;
  }
  
  .mr-teams {
    grid-column: 1 / span 2;
    grid-row: 2;
    font-size: 12px !important;
    font-weight: 700 !important;
  }
  
  .mr-result {
    grid-column: 1 / span 2;
    grid-row: 3;
    font-size: 10.5px !important;
  }
  
  .mr-venue {
    display: none !important;
  }
}
```

---

### Task 6: Build Verification

- [ ] **Step 1: Run local compilation and linter**

Run the build script in the `web` directory:
Command: `npm run build` inside `web`
Expected: Compilation completes with zero errors, compiling all static/dynamic routes.

---

## Verification Plan

### Automated Verification
- Verify build completeness and TypeScript safety:
  ```bash
  cd web && npm run build
  ```

### Manual Verification
- Deploy Next.js dev server and check responsive behavior in Chrome DevTools:
  - Simulate a mobile device viewport (e.g. iPhone 12/Pro).
  - Open `/stat-builder` and click the "Show Filters" button to slide open the overlay drawer, and click the backdrop to close it.
  - Verify that running a query closes the drawer automatically.
  - Open `/matches` and click the "Filters" button to open the sidebar. Verify it displays correctly.
  - Verify matches list view collapses columns cleanly into a 3-row layout per match.
