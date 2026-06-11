from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def iter_python_files():
    ignored_parts = {".git", ".venv", "venv", "__pycache__", "scratch"}
    for path in ROOT.rglob("*.py"):
        if ignored_parts.intersection(path.parts):
            continue
        if path == Path(__file__).resolve():
            continue
        yield path


def test_python_database_connections_use_database_url_only():
    forbidden_patterns = [
        re.compile(r"psycopg2\.connect\(\s*[\"']dbname="),
        re.compile(r"psycopg2\.connect\([^)]*\b(?:dbname|database|user|password|host|port)\s*="),
        re.compile(r"os\.environ\.get\(\s*[\"']DATABASE_URL[\"']\s*,"),
        re.compile(r"os\.getenv\(\s*[\"']DATABASE_URL[\"']\s*,"),
        re.compile(r"os\.getenv\(\s*[\"']DATABASE_URL[\"']\s*\)\.replace\("),
        re.compile(r"postgresql://"),
    ]

    violations = []
    for path in iter_python_files():
        text = path.read_text()
        for pattern in forbidden_patterns:
            if pattern.search(text):
                violations.append(str(path.relative_to(ROOT)))

    assert violations == []


def test_root_env_uses_expected_local_database_url():
    env_file = ROOT / ".env"

    assert env_file.read_text().splitlines()[0] == (
        "DATABASE_URL=postgresql://postgres:2355@localhost:5432/cricketdb"
    )
