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
