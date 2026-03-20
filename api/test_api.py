#!/usr/bin/env python3
"""
Test suite for the Cricket Stats API.

Expects the API to be running on localhost:8000.

Usage:
    python api/test_api.py
"""

import time
import requests

BASE = "http://localhost:8000/api/v1"


def test(method, path, *, expect_status, check=None, label=None):
    """
    Run a single API test.

    Returns True if passed, False if failed.
    """
    url = f"{BASE}{path}"
    display = label or f"{method} {'/api/v1' + path}"
    t0 = time.time()

    try:
        resp = requests.request(method, url, timeout=10)
        ms = int((time.time() - t0) * 1000)
        status = resp.status_code

        passed = status == expect_status
        if passed and check:
            passed = check(resp.json())

        icon = "✅" if passed else "❌"
        note = f"({ms}ms)" if passed else f"(got {status}, expected {expect_status}, {ms}ms)"
        print(f"  {icon} {display} → {status}  {note}")
        return passed

    except requests.ConnectionError:
        print(f"  ❌ {display} → CONNECTION REFUSED  (is the API running?)")
        return False
    except Exception as e:
        print(f"  ❌ {display} → ERROR: {e}")
        return False


def main():
    print(f"\n{'═' * 60}")
    print(f"  Cricket Stats API — Test Suite")
    print(f"  {BASE}")
    print(f"{'═' * 60}\n")

    t0_all = time.time()
    results = []

    # 1. Health check
    results.append(test("GET", "/health", expect_status=200))

    # 2. Player search — "Kohli"
    results.append(test(
        "GET", "/players/search?q=Kohli",
        expect_status=200,
        check=lambda data: len(data) >= 1,
        label="GET /api/v1/players/search?q=Kohli  (≥1 result)",
    ))

    # 3. Player search — single char (should fail)
    results.append(test(
        "GET", "/players/search?q=K",
        expect_status=400,
        label="GET /api/v1/players/search?q=K  (400 expected)",
    ))

    # 4. Kohli batting stats
    results.append(test(
        "GET", "/players/ba607b88/batting",
        expect_status=200,
        check=lambda data: len(data) >= 1,
        label="GET /api/v1/players/ba607b88/batting  (Kohli)",
    ))

    # 5. Kohli batting stats — format=Test
    results.append(test(
        "GET", "/players/ba607b88/batting?format=Test",
        expect_status=200,
        check=lambda data: all(r["format"] == "Test" for r in data),
        label="GET /api/v1/players/ba607b88/batting?format=Test",
    ))

    # 6. Kohli bowling stats
    results.append(test(
        "GET", "/players/ba607b88/bowling",
        expect_status=200,
        label="GET /api/v1/players/ba607b88/bowling  (may be empty)",
    ))

    # 7. Kohli vs teams (batting)
    results.append(test(
        "GET", "/players/ba607b88/vs-teams?role=batting",
        expect_status=200,
        check=lambda data: len(data) >= 1,
        label="GET /api/v1/players/ba607b88/vs-teams?role=batting",
    ))

    # 8. Matchup: Kohli vs Arshdeep Singh
    results.append(test(
        "GET", "/matchup?batter_id=ba607b88&bowler_id=244048f6",
        expect_status=200,
        check=lambda data: data.get("matchup", {}).get("balls", 0) > 0,
        label="GET /api/v1/matchup  Kohli vs Arshdeep Singh",
    ))

    # 9. Matchup: fake IDs — should 404
    results.append(test(
        "GET", "/matchup?batter_id=00000000&bowler_id=99999999",
        expect_status=404,
        label="GET /api/v1/matchup  fake IDs (404 expected)",
    ))

    # 10. Venues list
    results.append(test(
        "GET", "/venues",
        expect_status=200,
        check=lambda data: len(data) >= 1,
        label="GET /api/v1/venues  (≥1 venue)",
    ))

    # 11. Wankhede Stadium
    results.append(test(
        "GET", "/venues/Wankhede",
        expect_status=200,
        check=lambda data: len(data) >= 1,
        label="GET /api/v1/venues/Wankhede  (venue detail)",
    ))

    # ── Summary ──────────────────────────────────────────────
    total = len(results)
    passed = sum(results)
    elapsed = time.time() - t0_all

    print(f"\n{'─' * 60}")
    if passed == total:
        print(f"  ✅ {passed}/{total} tests passed  ({elapsed:.1f}s)")
    else:
        print(f"  ⚠️  {passed}/{total} tests passed — {total - passed} failures  ({elapsed:.1f}s)")
    print(f"{'─' * 60}\n")


if __name__ == "__main__":
    main()
