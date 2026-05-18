"""Unit tests for the report generator."""

import json
import tempfile
from pathlib import Path

import pytest

from reporter.merge import merge_findings
from reporter.score import apply_confidence
from reporter.stats import compute_stats
from reporter.render import render_json, render_text


SAMPLE_IR = [
    {"function": "dead_func", "basic_block": "bb1", "source_file": "lib/foo.c",
     "start_line": 10, "end_line": 20, "kind": "compile_time", "confidence": 0.95},
    {"function": "runtime_func", "basic_block": "", "source_file": "lib/bar.c",
     "start_line": 5, "end_line": 8, "kind": "runtime", "confidence": 0.85},
    {"function": "ip_func", "basic_block": "", "source_file": "lib/baz.c",
     "start_line": 1, "end_line": 50, "kind": "interprocedural", "confidence": 0.60},
]

SAMPLE_CONFIG = {
    "targets": [
        {"name": "libfoo", "compile_definitions": ["NDEBUG"], "source_files": ["lib/foo.c"]},
    ],
    "global_definitions": ["NDEBUG"],
}


def test_merge_findings_enriches():
    findings = merge_findings(SAMPLE_IR, SAMPLE_CONFIG)
    assert len(findings) == 3
    foo = next(f for f in findings if "foo" in f["source_file"])
    assert foo["dead_in_targets"] == ["libfoo"]
    assert foo["estimated_lines"] == 11  # 20 - 10 + 1


def test_merge_findings_assigns_ids():
    findings = merge_findings(SAMPLE_IR, SAMPLE_CONFIG)
    ids = [f["id"] for f in findings]
    assert ids == list(range(3))


def test_apply_confidence_sorts_descending():
    findings = merge_findings(SAMPLE_IR, SAMPLE_CONFIG)
    scored = apply_confidence(findings)
    confs = [f["confidence"] for f in scored]
    assert confs == sorted(confs, reverse=True)


def test_apply_confidence_fills_zero():
    ir = [{"function": "f", "basic_block": "", "source_file": "x.c",
            "start_line": 1, "end_line": 2, "kind": "heuristic", "confidence": 0.0}]
    findings = merge_findings(ir, {"targets": [], "global_definitions": []})
    scored = apply_confidence(findings)
    assert scored[0]["confidence"] == 0.35


def test_compute_stats():
    findings = apply_confidence(merge_findings(SAMPLE_IR, SAMPLE_CONFIG))
    stats = compute_stats(findings)
    assert stats["total_findings"] == 3
    assert stats["total_dead_lines"] == 11 + 4 + 50
    assert "compile_time" in stats["by_kind"]


def test_render_json(tmp_path):
    findings = apply_confidence(merge_findings(SAMPLE_IR, SAMPLE_CONFIG))
    stats = compute_stats(findings)
    report = {"findings": findings, "stats": stats}
    out = tmp_path / "report.json"
    render_json(report, out)
    loaded = json.loads(out.read_text())
    assert len(loaded["findings"]) == 3


def test_render_text(tmp_path):
    findings = apply_confidence(merge_findings(SAMPLE_IR, SAMPLE_CONFIG))
    stats = compute_stats(findings)
    report = {"findings": findings, "stats": stats}
    out = tmp_path / "report.txt"
    render_text(report, out)
    text = out.read_text()
    assert "Dead Feature Detector" in text
    assert "compile_time" in text
