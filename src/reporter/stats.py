"""Compute summary statistics over a list of findings."""

import subprocess
from pathlib import Path


def compute_stats(findings: list[dict]) -> dict:
    total_lines = sum(f.get("estimated_lines", 0) for f in findings)
    confidences = [f.get("confidence", 0.0) for f in findings]
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

    by_kind: dict[str, int] = {}
    for f in findings:
        k = f.get("kind", "unknown")
        by_kind[k] = by_kind.get(k, 0) + 1

    return {
        "total_findings": len(findings),
        "total_dead_lines": total_lines,
        "avg_confidence": round(avg_conf, 4),
        "by_kind": by_kind,
    }
