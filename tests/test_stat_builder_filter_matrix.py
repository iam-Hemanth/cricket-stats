from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "stat_builder_filter_matrix.py"


def load_matrix_module():
    spec = importlib.util.spec_from_file_location("stat_builder_filter_matrix", SCRIPT_PATH)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_endpoint_mapping_covers_all_stat_types():
    matrix = load_matrix_module()

    assert matrix.STAT_ENDPOINTS == {
        "bat": "/api/v1/stat-builder/batting",
        "bowl": "/api/v1/stat-builder/bowling",
        "team": "/api/v1/stat-builder/team-results",
        "team_bat": "/api/v1/stat-builder/team-batting",
        "team_bowl": "/api/v1/stat-builder/team-bowling",
        "team_compare": "/api/v1/stat-builder/team-compare",
        "h2h": "/api/v1/stat-builder/h2h",
    }


def test_payload_generation_does_not_mutate_baseline():
    matrix = load_matrix_module()
    baseline = matrix.baseline_payload("bat")
    original = {
        key: value.copy() if isinstance(value, list) else value
        for key, value in baseline.items()
    }
    filter_spec = matrix.FilterSpec(
        name="formats",
        value=["IPL"],
        stat_types={"bat"},
        group_by_overrides=None,
    )

    payload = matrix.build_payload("bat", [filter_spec])

    assert payload["formats"] == ["IPL"]
    assert baseline == original
    assert baseline["formats"] == []


def test_case_generation_includes_baseline_singles_and_pairs():
    matrix = load_matrix_module()
    filters = [
        matrix.FilterSpec("formats", ["IPL"], {"bat"}, None),
        matrix.FilterSpec("innings", ["1st"], {"bat"}, None),
        matrix.FilterSpec("teams", ["India"], {"team"}, None),
    ]

    bat_cases = list(matrix.iter_cases("bat", filters))

    assert [case.filter_names for case in bat_cases] == [
        (),
        ("formats",),
        ("innings",),
        ("formats", "innings"),
    ]
    assert [case.case_id for case in bat_cases] == [
        "bat-000000",
        "bat-000001",
        "bat-000002",
        "bat-000003",
    ]


def test_bounded_case_generation_respects_budget_and_order():
    matrix = load_matrix_module()
    filters = [
        matrix.FilterSpec("formats", ["IPL"], {"bat"}, None),
        matrix.FilterSpec("innings", ["1st"], {"bat"}, None),
        matrix.FilterSpec("phases", ["powerplay"], {"bat"}, None),
        matrix.FilterSpec("venues", ["Wankhede Stadium"], {"bat"}, None),
    ]

    bat_cases = list(matrix.iter_bounded_cases("bat", 6, filters))

    assert [case.filter_names for case in bat_cases] == [
        (),
        ("formats",),
        ("innings",),
        ("phases",),
        ("venues",),
        ("formats", "innings"),
    ]
    assert [case.case_id for case in bat_cases] == [
        "bat-000000",
        "bat-000001",
        "bat-000002",
        "bat-000003",
        "bat-000004",
        "bat-000005",
    ]


def test_budget_distribution_is_deterministic_and_sums_to_budget():
    matrix = load_matrix_module()

    budgets = matrix.budget_for_stat_types(("bat", "bowl", "team"), 10)

    assert budgets == {"bat": 4, "bowl": 3, "team": 3}
    assert sum(budgets.values()) == 10


def test_dry_run_defaults_to_bounded_case_budget(capsys):
    matrix = load_matrix_module()

    matrix.print_dry_run(("bat",), case_budget=5, full_exhaustive=False)

    output = capsys.readouterr().out
    assert "5 planned cases" in output
    assert "exhaustive" in output
    assert "total: 5 cases" in output


def test_representative_player_filter_uses_player_id():
    matrix = load_matrix_module()
    players_filter = next(spec for spec in matrix.filter_specs() if spec.name == "players_involved")

    assert players_filter.value == ["4928b5e0"]


def test_minimal_failure_summary_ignores_known_failing_subsets():
    matrix = load_matrix_module()
    failures = [
        {"stat_type": "bat", "filters": ["formats"]},
        {"stat_type": "bat", "filters": ["formats", "innings"]},
        {"stat_type": "bat", "filters": ["phases", "over_from"]},
        {"stat_type": "bowl", "filters": ["formats", "innings"]},
    ]

    minimal = matrix.find_minimal_failures(failures)

    assert minimal == [
        {"stat_type": "bat", "filters": ["formats"]},
        {"stat_type": "bat", "filters": ["phases", "over_from"]},
        {"stat_type": "bowl", "filters": ["formats", "innings"]},
    ]


def test_output_setup_creates_all_report_files(tmp_path):
    matrix = load_matrix_module()

    paths = matrix.ensure_output_files(tmp_path / "reports")

    assert [path.name for path in paths] == ["results.jsonl", "failures.jsonl", "summary.json"]
    assert all(path.exists() for path in paths)
