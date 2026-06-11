#!/usr/bin/env python3
"""Probe Stat Builder filter-field combinations.

The matrix expands filter fields, not every possible value inside each field.
Each FilterSpec uses one representative value so failures point to field
interactions first. By default, the script runs a deterministic bounded matrix
around 5,000 cases total. Use --full-exhaustive only when you intentionally
want every possible filter-field subset.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import sys
import time
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Any, Iterable


STAT_TYPES = ("bat", "bowl", "team", "team_bat", "team_bowl", "team_compare", "h2h")

STAT_ENDPOINTS = {
    "bat": "/api/v1/stat-builder/batting",
    "bowl": "/api/v1/stat-builder/bowling",
    "team": "/api/v1/stat-builder/team-results",
    "team_bat": "/api/v1/stat-builder/team-batting",
    "team_bowl": "/api/v1/stat-builder/team-bowling",
    "team_compare": "/api/v1/stat-builder/team-compare",
    "h2h": "/api/v1/stat-builder/h2h",
}

DEFAULT_SORT_BY = {
    "bat": "runs",
    "bowl": "wickets",
    "team": "win_percentage",
    "team_bat": "total_runs_scored",
    "team_bowl": "wickets_taken",
    "team_compare": "run_diff",
    "h2h": "total_runs",
}

PLAYER_TYPES = {"bat", "bowl"}
TEAM_TYPES = {"team", "team_bat", "team_bowl", "team_compare"}
ALL_TYPES = set(STAT_TYPES)
DEFAULT_CASE_BUDGET = 5000


@dataclass(frozen=True)
class FilterSpec:
    name: str
    value: Any
    stat_types: set[str]
    group_by_overrides: dict[str, str] | None = None


@dataclass(frozen=True)
class MatrixCase:
    case_id: str
    stat_type: str
    endpoint: str
    filter_names: tuple[str, ...]
    payload: dict[str, Any]


def baseline_payload(stat_type: str) -> dict[str, Any]:
    if stat_type not in STAT_ENDPOINTS:
        raise ValueError(f"Unknown stat type: {stat_type}")

    group_by = "team" if stat_type in TEAM_TYPES else "player"
    payload: dict[str, Any] = {
        "stat_type": stat_type,
        "formats": [],
        "innings": [],
        "phases": [],
        "opposition": [],
        "venues": [],
        "countries": [],
        "tournaments": [],
        "match_result": [],
        "match_stages": [],
        "match_groups": [],
        "cities": [],
        "teams": [],
        "players_involved": [],
        "batting_positions": [],
        "dismissal_types": [],
        "player_of_match_only": False,
        "super_over_only": False,
        "back_to_back_wickets": False,
        "team_score_mode": "scored",
        "min_innings": 1,
        "group_by": group_by,
        "sort_by": DEFAULT_SORT_BY[stat_type],
        "sort_dir": "desc",
        "limit": 25,
    }
    if stat_type == "h2h":
        payload.update(
            {
                "teams": ["India"],
                "opposition": ["Australia"],
                "group_by": "team",
            }
        )
    return payload


def filter_specs() -> list[FilterSpec]:
    player_plus_h2h = PLAYER_TYPES | {"h2h"}
    team_plus_h2h = TEAM_TYPES | {"h2h"}
    batting_context = {"bat", "h2h"}

    return [
        FilterSpec("formats", ["IPL"], ALL_TYPES),
        FilterSpec("innings", ["1st"], player_plus_h2h),
        FilterSpec("phases", ["powerplay"], player_plus_h2h | {"team_bat", "team_bowl", "team_compare"}),
        FilterSpec("over_from", 1, player_plus_h2h),
        FilterSpec("over_to", 6, player_plus_h2h),
        FilterSpec("opposition", ["Australia"], ALL_TYPES - {"h2h"}),
        FilterSpec("venue_search", "Wankhede", ALL_TYPES),
        FilterSpec("venues", ["Wankhede Stadium"], ALL_TYPES),
        FilterSpec("countries", ["India"], ALL_TYPES),
        FilterSpec("ground_type", "Home", ALL_TYPES),
        FilterSpec("year_from", 2019, ALL_TYPES),
        FilterSpec("year_to", 2024, ALL_TYPES),
        FilterSpec("tournaments", ["Indian Premier League"], ALL_TYPES),
        FilterSpec("match_result", ["Won"], ALL_TYPES),
        FilterSpec("toss", "Won", ALL_TYPES),
        FilterSpec("day_night", "night", ALL_TYPES),
        FilterSpec("match_month", 5, ALL_TYPES),
        FilterSpec("match_day", 3, ALL_TYPES),
        FilterSpec("match_stages", ["Final"], ALL_TYPES),
        FilterSpec("match_groups", ["A"], ALL_TYPES),
        FilterSpec("cities", ["Mumbai"], ALL_TYPES),
        FilterSpec("teams", ["India"], ALL_TYPES - {"h2h"}),
        FilterSpec("players_involved", ["4928b5e0"], ALL_TYPES),
        FilterSpec("date_from", "2019-01-01", ALL_TYPES),
        FilterSpec("date_to", "2024-12-31", ALL_TYPES),
        FilterSpec("match_number_from", 1, ALL_TYPES),
        FilterSpec("match_number_to", 70, ALL_TYPES),
        FilterSpec("toss_decision", "bat", ALL_TYPES),
        FilterSpec("batting_positions", ["opener"], batting_context),
        FilterSpec("dismissal_types", ["bowled"], batting_context),
        FilterSpec("player_of_match_only", True, player_plus_h2h),
        FilterSpec("super_over_only", True, ALL_TYPES),
        FilterSpec("min_win_by_runs", 1, ALL_TYPES),
        FilterSpec("max_win_by_runs", 100, ALL_TYPES),
        FilterSpec("min_win_by_wickets", 1, ALL_TYPES),
        FilterSpec("max_win_by_wickets", 10, ALL_TYPES),
        FilterSpec("min_team_runs", 120, team_plus_h2h),
        FilterSpec("max_team_runs", 220, team_plus_h2h),
        FilterSpec("min_opp_runs", 100, team_plus_h2h),
        FilterSpec("max_opp_runs", 210, team_plus_h2h),
        FilterSpec("min_team_wickets", 1, team_plus_h2h),
        FilterSpec("max_team_wickets", 9, team_plus_h2h),
        FilterSpec("min_opp_wickets", 1, team_plus_h2h),
        FilterSpec("max_opp_wickets", 9, team_plus_h2h),
        FilterSpec("min_defending_runs", 150, team_plus_h2h),
        FilterSpec("min_chasing_runs", 120, team_plus_h2h),
        FilterSpec("partnership_number", 1, {"team_bat", "team_bowl", "team_compare"}),
        FilterSpec("min_partnership_runs", 50, {"team_bat", "team_bowl", "team_compare"}),
        FilterSpec("back_to_back_wickets", True, {"team_bowl", "team_compare"}),
        FilterSpec("min_innings", 2, PLAYER_TYPES),
        FilterSpec("min_runs", 100, {"bat", "team_bat", "team_compare"}),
        FilterSpec("max_runs", 1000, {"bat", "team_bat", "team_compare"}),
        FilterSpec("min_wickets", 5, {"bowl", "team_bowl", "team_compare"}),
        FilterSpec("max_wickets", 100, {"bowl", "team_bowl", "team_compare"}),
        FilterSpec("min_fours", 10, {"bat", "bowl", "team_bat", "team_bowl", "team_compare"}),
        FilterSpec("min_sixes", 5, {"bat", "bowl", "team_bat", "team_bowl", "team_compare"}),
        FilterSpec("min_balls", 120, {"bat"}),
        FilterSpec("max_balls", 600, {"bat"}),
        FilterSpec("min_average", 20.0, PLAYER_TYPES),
        FilterSpec("min_strike_rate", 100.0, PLAYER_TYPES),
        FilterSpec("min_no_balls", 1, {"bowl"}),
        FilterSpec("min_wides", 1, {"bowl"}),
        FilterSpec("include_unofficial", True, ALL_TYPES),
        FilterSpec("score_threshold", 180, TEAM_TYPES),
        FilterSpec("team_score_mode", "conceded", TEAM_TYPES),
    ]


def applicable_filters(stat_type: str, specs: Iterable[FilterSpec] | None = None) -> list[FilterSpec]:
    source = list(specs) if specs is not None else filter_specs()
    return [spec for spec in source if stat_type in spec.stat_types]


def build_payload(stat_type: str, specs: Iterable[FilterSpec]) -> dict[str, Any]:
    payload = copy.deepcopy(baseline_payload(stat_type))
    for spec in specs:
        payload[spec.name] = copy.deepcopy(spec.value)
        if spec.group_by_overrides and stat_type in spec.group_by_overrides:
            payload["group_by"] = spec.group_by_overrides[stat_type]
    return payload


def iter_cases(stat_type: str, specs: Iterable[FilterSpec] | None = None) -> Iterable[MatrixCase]:
    selected = applicable_filters(stat_type, specs)
    index = 0
    for size in range(0, len(selected) + 1):
        for combo in combinations(selected, size):
            yield MatrixCase(
                case_id=f"{stat_type}-{index:06d}",
                stat_type=stat_type,
                endpoint=STAT_ENDPOINTS[stat_type],
                filter_names=tuple(spec.name for spec in combo),
                payload=build_payload(stat_type, combo),
            )
            index += 1


def iter_bounded_cases(
    stat_type: str,
    case_budget: int,
    specs: Iterable[FilterSpec] | None = None,
) -> Iterable[MatrixCase]:
    selected = applicable_filters(stat_type, specs)
    index = 0
    emitted = 0
    for size in range(0, len(selected) + 1):
        for combo in combinations(selected, size):
            if emitted >= case_budget:
                return
            yield MatrixCase(
                case_id=f"{stat_type}-{index:06d}",
                stat_type=stat_type,
                endpoint=STAT_ENDPOINTS[stat_type],
                filter_names=tuple(spec.name for spec in combo),
                payload=build_payload(stat_type, combo),
            )
            index += 1
            emitted += 1


def case_count(stat_type: str, specs: Iterable[FilterSpec] | None = None) -> int:
    return 2 ** len(applicable_filters(stat_type, specs))


def bounded_case_count(
    stat_type: str,
    case_budget: int,
    specs: Iterable[FilterSpec] | None = None,
) -> int:
    return min(case_budget, case_count(stat_type, specs))


def budget_for_stat_types(stat_types: tuple[str, ...], total_budget: int) -> dict[str, int]:
    base = total_budget // len(stat_types)
    remainder = total_budget % len(stat_types)
    return {
        stat_type: base + (1 if index < remainder else 0)
        for index, stat_type in enumerate(stat_types)
    }


def selected_stat_types(value: str) -> tuple[str, ...]:
    if value == "all":
        return STAT_TYPES
    if value not in STAT_TYPES:
        raise ValueError(f"Unknown stat type: {value}")
    return (value,)


def append_jsonl(path: Path, record: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True, default=str))
        handle.write("\n")


def ensure_output_files(output_dir: Path) -> tuple[Path, Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = (
        output_dir / "results.jsonl",
        output_dir / "failures.jsonl",
        output_dir / "summary.json",
    )
    for path in paths:
        path.touch(exist_ok=True)
    return paths


def create_client():
    from fastapi.testclient import TestClient

    from api.main import app

    return TestClient(app)


def execute_case(client: Any, case: MatrixCase) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        response = client.post(case.endpoint, json=case.payload)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        ok = 200 <= response.status_code < 300
        record: dict[str, Any] = {
            "case_id": case.case_id,
            "status": "pass" if ok else "fail",
            "stat_type": case.stat_type,
            "endpoint": case.endpoint,
            "filters": list(case.filter_names),
            "elapsed_ms": elapsed_ms,
            "http_status": response.status_code,
            "payload": case.payload,
        }
        if ok:
            try:
                body = response.json()
            except ValueError:
                body = {}
            record["row_count"] = len(body.get("rows", [])) if isinstance(body, dict) else None
            record["total_count"] = body.get("total_count") if isinstance(body, dict) else None
        else:
            record["response_body"] = response.text[:4000]
        return record
    except Exception as exc:  # noqa: BLE001 - the matrix records all crash shapes.
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return {
            "case_id": case.case_id,
            "status": "fail",
            "stat_type": case.stat_type,
            "endpoint": case.endpoint,
            "filters": list(case.filter_names),
            "elapsed_ms": elapsed_ms,
            "exception": f"{type(exc).__name__}: {exc}",
            "payload": case.payload,
        }


def find_minimal_failures(failures: list[dict[str, Any]]) -> list[dict[str, Any]]:
    minimal: list[dict[str, Any]] = []
    seen_by_type: dict[str, list[frozenset[str]]] = {}

    ordered = sorted(
        failures,
        key=lambda item: (item.get("stat_type", ""), len(item.get("filters", [])), item.get("filters", [])),
    )
    for failure in ordered:
        stat_type = str(failure["stat_type"])
        filters = frozenset(failure.get("filters", []))
        previous = seen_by_type.setdefault(stat_type, [])
        if any(prior.issubset(filters) for prior in previous):
            continue
        previous.append(filters)
        minimal.append({"stat_type": stat_type, "filters": list(failure.get("filters", []))})
    return minimal


def build_summary(records: list[dict[str, Any]], failures: list[dict[str, Any]]) -> dict[str, Any]:
    totals: dict[str, dict[str, int]] = {}
    failures_by_filter: dict[str, int] = {}

    for record in records:
        stat_type = str(record["stat_type"])
        bucket = totals.setdefault(stat_type, {"pass": 0, "fail": 0, "total": 0})
        bucket["total"] += 1
        bucket[str(record["status"])] += 1

    for failure in failures:
        for name in failure.get("filters", []):
            failures_by_filter[name] = failures_by_filter.get(name, 0) + 1

    return {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "totals": totals,
        "failure_count": len(failures),
        "failures_by_filter": dict(sorted(failures_by_filter.items())),
        "minimal_failing_combinations": find_minimal_failures(failures),
    }


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def print_dry_run(stat_types: tuple[str, ...], case_budget: int, full_exhaustive: bool) -> None:
    total = 0
    budgets = budget_for_stat_types(stat_types, case_budget)
    for stat_type in stat_types:
        filters = applicable_filters(stat_type)
        exhaustive_count = case_count(stat_type)
        count = exhaustive_count if full_exhaustive else bounded_case_count(stat_type, budgets[stat_type])
        total += count
        if full_exhaustive:
            print(f"{stat_type}: {len(filters)} filters -> {count:,} cases")
        else:
            print(
                f"{stat_type}: {len(filters)} filters -> "
                f"{count:,} planned cases ({exhaustive_count:,} exhaustive)"
            )
    print(f"total: {total:,} cases")


def run_matrix(args: argparse.Namespace) -> int:
    stat_types = selected_stat_types(args.stat_type)
    if not args.full_exhaustive and args.case_budget < len(stat_types):
        raise SystemExit(
            f"--case-budget must be >= selected stat type count ({len(stat_types)}) "
            "so each stat type gets a baseline case"
        )
    if args.dry_run:
        print_dry_run(stat_types, args.case_budget, args.full_exhaustive)
        return 0

    results_path, failures_path, summary_path = ensure_output_files(Path(args.output_dir))
    records = load_jsonl(results_path)
    failures = load_jsonl(failures_path)
    stop_after_failures = args.stop_after_failures
    max_cases = args.max_cases
    executed_cases = 0
    resume_from = args.resume_from
    should_skip = bool(resume_from)
    budgets = budget_for_stat_types(stat_types, args.case_budget)

    with create_client() as client:
        for stat_type in stat_types:
            cases = (
                iter_cases(stat_type)
                if args.full_exhaustive
                else iter_bounded_cases(stat_type, budgets[stat_type])
            )
            for case in cases:
                if should_skip:
                    if case.case_id != resume_from:
                        continue
                    should_skip = False

                record = execute_case(client, case)
                executed_cases += 1
                records.append(record)
                append_jsonl(results_path, record)
                if record["status"] == "fail":
                    failures.append(record)
                    append_jsonl(failures_path, record)
                    if stop_after_failures is not None and len(failures) >= stop_after_failures:
                        summary_path.write_text(
                            json.dumps(build_summary(records, failures), indent=2, sort_keys=True),
                            encoding="utf-8",
                        )
                        return 1
                if max_cases is not None and executed_cases >= max_cases:
                    summary_path.write_text(
                        json.dumps(build_summary(records, failures), indent=2, sort_keys=True),
                        encoding="utf-8",
                    )
                    return 1 if failures else 0

    summary_path.write_text(
        json.dumps(build_summary(records, failures), indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return 1 if failures else 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--stat-type",
        choices=("all",) + STAT_TYPES,
        default="all",
        help="Stat-builder surface to test.",
    )
    parser.add_argument(
        "--output-dir",
        default="stat_builder_matrix_reports",
        help="Directory for results.jsonl, failures.jsonl, and summary.json.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print case counts without executing.")
    parser.add_argument("--resume-from", help="Resume execution at this case id, e.g. bat-000123.")
    parser.add_argument(
        "--case-budget",
        type=int,
        default=DEFAULT_CASE_BUDGET,
        help=(
            "Approximate total planned cases for bounded mode. The budget is distributed "
            "across selected stat types. Default: 5000."
        ),
    )
    parser.add_argument(
        "--full-exhaustive",
        action="store_true",
        help="Run every filter-field subset. This can generate trillions of cases.",
    )
    parser.add_argument(
        "--stop-after-failures",
        type=int,
        help="Stop after N failures. By default, run all cases.",
    )
    parser.add_argument(
        "--max-cases",
        type=int,
        help="Stop after N executed cases. Useful for smoke-testing the matrix runner.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    if args.stop_after_failures is not None and args.stop_after_failures < 1:
        raise SystemExit("--stop-after-failures must be >= 1")
    if args.max_cases is not None and args.max_cases < 1:
        raise SystemExit("--max-cases must be >= 1")
    if not args.full_exhaustive and args.case_budget < 1:
        raise SystemExit("--case-budget must be >= 1")
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    return run_matrix(args)


if __name__ == "__main__":
    raise SystemExit(main())
