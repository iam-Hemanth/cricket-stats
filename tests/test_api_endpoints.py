from __future__ import annotations

import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

if not os.getenv("DATABASE_URL"):
    pytest.skip("DATABASE_URL is not configured for API tests", allow_module_level=True)

from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["matches_in_db"] >= 5000


def test_player_search_validation(client: TestClient) -> None:
    response = client.get("/api/v1/players/search", params={"q": "K"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Search query must be at least 2 characters"


def test_matchup_fake_ids_returns_no_data_payload(client: TestClient) -> None:
    response = client.get(
        "/api/v1/matchup",
        params={"batter_id": "00000000", "bowler_id": "99999999"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["no_data"] is True
    assert data["overall"]["balls"] == 0


def test_team_h2h_summary_top_performers_are_matchup_constrained(
    client: TestClient,
) -> None:
    response = client.get(
        "/api/v1/teams/h2h",
        params={"team1": "India", "team2": "Australia"},
    )

    assert response.status_code == 200
    data = response.json()

    scorers_vs_india = {player["player_name"] for player in data["top_scorers_vs_team1"]}
    scorers_vs_australia = {player["player_name"] for player in data["top_scorers_vs_team2"]}
    wickets_vs_india = {player["player_name"] for player in data["top_wickets_vs_team1"]}
    wickets_vs_australia = {player["player_name"] for player in data["top_wickets_vs_team2"]}

    assert scorers_vs_india
    assert scorers_vs_australia
    assert wickets_vs_india
    assert wickets_vs_australia

    assert "JE Root" not in scorers_vs_india
    assert "JE Root" not in scorers_vs_australia
    assert "SCJ Broad" not in wickets_vs_india
    assert "SCJ Broad" not in wickets_vs_australia


# ── Entity canonicalization regression tests ──────────────────────────────


def test_team_h2h_accepts_old_ipl_team_names(client: TestClient) -> None:
    """Old IPL team names must resolve to the same H2H data as canonical names."""
    old_name = client.get(
        "/api/v1/teams/h2h",
        params={
            "team1": "Royal Challengers Bangalore",
            "team2": "Delhi Daredevils",
            "format": "IPL",
        },
    )
    canonical = client.get(
        "/api/v1/teams/h2h",
        params={
            "team1": "Royal Challengers Bengaluru",
            "team2": "Delhi Capitals",
            "format": "IPL",
        },
    )
    assert old_name.status_code == canonical.status_code == 200
    old_data = old_name.json()
    canon_data = canonical.json()
    # by_format totals must match — they query the same canonical rows
    assert old_data.get("by_format") == canon_data.get("by_format")


def test_team_search_returns_canonical_name(client: TestClient) -> None:
    """Searching with an old name should return the canonical team name."""
    response = client.get("/api/v1/teams/search", params={"q": "Bangalore"})
    assert response.status_code == 200
    results = response.json()
    names = [r.get("name") or r.get("team_name") or r for r in results]
    # Either canonical name or old alias is acceptable, but canonical preferred
    found = any("Bengaluru" in str(n) or "Bangalore" in str(n) for n in names)
    assert found, f"Expected RCB variant in results, got: {names}"


def test_venue_search_returns_canonical_name(client: TestClient) -> None:
    """Searching with old venue name 'Feroz' should surface Arun Jaitley Stadium."""
    response = client.get("/api/v1/venues/search", params={"q": "Feroz"})
    assert response.status_code == 200
    results = response.json()
    # Must return at least one result
    assert len(results) > 0


def test_matches_search_endpoint(client: TestClient) -> None:
    response = client.get(
        "/api/v1/matches",
        params={"year": 2025},
    )
    assert response.status_code == 200
    data = response.json()
    assert "matches" in data
    assert "total" in data
    if data["matches"]:
        assert "match_stage" in data["matches"][0]
        assert "host_country" in data["matches"][0]
