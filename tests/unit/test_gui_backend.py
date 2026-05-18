"""Unit tests for the GUI FastAPI backend."""

import json
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from gui.backend.api import app, configure
from gui.backend.source import SourceReader


SAMPLE_REPORT = {
    "findings": [
        {"id": 0, "feature_name": "dead_func", "kind": "compile_time", "confidence": 0.95,
         "function": "dead_func", "basic_block": "bb1", "source_file": "lib/foo.c",
         "start_line": 10, "end_line": 20, "estimated_lines": 11, "dead_in_targets": []},
        {"id": 1, "feature_name": "runtime_func", "kind": "runtime", "confidence": 0.85,
         "function": "runtime_func", "basic_block": "", "source_file": "lib/bar.c",
         "start_line": 5, "end_line": 8, "estimated_lines": 4, "dead_in_targets": []},
    ],
    "stats": {"total_findings": 2, "total_dead_lines": 15, "avg_confidence": 0.9, "by_kind": {}},
}


@pytest.fixture()
def client(tmp_path):
    report_file = tmp_path / "report.json"
    report_file.write_text(json.dumps(SAMPLE_REPORT))
    configure(report_file, tmp_path)
    return TestClient(app)


def test_get_findings(client):
    r = client.get("/findings")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_filter_by_kind(client):
    r = client.get("/findings?kind=compile_time")
    data = r.json()
    assert len(data) == 1
    assert data[0]["kind"] == "compile_time"


def test_filter_by_min_confidence(client):
    r = client.get("/findings?min_confidence=0.9")
    data = r.json()
    assert len(data) == 1
    assert data[0]["confidence"] >= 0.9


def test_get_finding_by_id(client):
    r = client.get("/findings/0")
    assert r.status_code == 200
    assert r.json()["function"] == "dead_func"


def test_get_finding_not_found(client):
    r = client.get("/findings/999")
    assert r.status_code == 404


def test_get_stats(client):
    r = client.get("/stats")
    assert r.status_code == 200
    data = r.json()
    assert "confidence_histogram" in data
    assert len(data["confidence_histogram"]) == 10


def test_get_graph(client):
    r = client.get("/graph")
    assert r.status_code == 200
    data = r.json()
    assert "nodes" in data and "edges" in data


def test_source_path_traversal_blocked(client, tmp_path):
    r = client.get("/source?file=../../../etc/passwd&start=1&end=1")
    assert r.status_code in (400, 404)


def test_source_reader_traversal():
    with tempfile.TemporaryDirectory() as d:
        root = Path(d) / "src"
        root.mkdir()
        (root / "foo.c").write_text("line1\nline2\nline3\n")
        reader = SourceReader(root)
        result = reader.read_lines("foo.c", 1, 2)
        assert result["lines"][0] == "line1"

        with pytest.raises(ValueError):
            reader.read_lines("../../etc/passwd", 1, 1)


# ── Pipeline runner endpoint tests ────────────────────────────────────────────

@pytest.fixture()
def fresh_client(tmp_path):
    """Client with no pre-loaded report (setup mode)."""
    from gui.backend import api as _api
    _api._report = {"findings": [], "stats": {}}
    _api._source_reader = None
    _api._has_report = False
    return TestClient(app)


def test_stats_has_report_false(fresh_client):
    r = fresh_client.get("/stats")
    assert r.status_code == 200
    assert r.json()["has_report"] is False


def test_stats_has_report_true(client):
    r = client.get("/stats")
    assert r.status_code == 200
    assert r.json()["has_report"] is True


def test_run_missing_build_dir(fresh_client):
    r = fresh_client.post("/run", json={"source_root": "/tmp"})
    assert r.status_code == 400


def test_run_missing_source_root(fresh_client):
    r = fresh_client.post("/run", json={"build_dir": "/tmp"})
    assert r.status_code == 400


def test_run_nonexistent_build_dir(fresh_client):
    r = fresh_client.post("/run", json={
        "build_dir": "/nonexistent/path/xyz",
        "source_root": "/tmp",
    })
    assert r.status_code == 400


def test_run_missing_plugin(fresh_client, tmp_path):
    r = fresh_client.post("/run", json={
        "build_dir": str(tmp_path),
        "source_root": str(tmp_path),
        "pass_plugin": "/nonexistent/plugin.so",
    })
    assert r.status_code == 400


def test_run_status_initial(fresh_client):
    r = fresh_client.get("/run/status")
    assert r.status_code == 200
    data = r.json()
    assert data["state"] in ("idle", "running", "done", "error")
    assert data["total_steps"] == 4


def test_detect_bc_invalid_dir(fresh_client):
    r = fresh_client.get("/run/detect-bc?build_dir=/nonexistent/xyz")
    assert r.status_code == 400


def test_detect_bc_valid_dir(fresh_client, tmp_path):
    (tmp_path / "foo.bc").write_bytes(b"")
    (tmp_path / "bar.bc").write_bytes(b"")
    r = fresh_client.get(f"/run/detect-bc?build_dir={tmp_path}")
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 2
    assert len(data["files"]) == 2


def test_detect_plugin(fresh_client):
    r = fresh_client.get("/run/detect-plugin")
    assert r.status_code == 200
    data = r.json()
    assert "path" in data
    assert "exists" in data
