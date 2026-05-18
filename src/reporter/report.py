"""Top-level entry point for the report generator."""

import argparse
import json
import sys
from pathlib import Path

from .merge import merge_findings
from .score import apply_confidence
from .render import render_json, render_text
from .stats import compute_stats


def generate_report(ir_findings_path: Path, config_path: Path, out_dir: Path) -> dict:
    """Merge IR findings with config manifest and write report files."""
    ir_findings = json.loads(Path(ir_findings_path).read_text())
    config = json.loads(Path(config_path).read_text())

    findings = merge_findings(ir_findings, config)
    findings = apply_confidence(findings)
    stats = compute_stats(findings)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    report = {"findings": findings, "stats": stats}
    render_json(report, out_dir / "report.json")
    render_text(report, out_dir / "report.txt")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Merge IR findings and config manifest into a report."
    )
    parser.add_argument("--ir-findings", required=True, help="Path to ir_findings.json")
    parser.add_argument("--config", required=True, help="Path to config.json")
    parser.add_argument("--out", default="report", help="Output directory")
    args = parser.parse_args()

    report = generate_report(
        Path(args.ir_findings), Path(args.config), Path(args.out)
    )
    print(f"Report written to {args.out}/ ({len(report['findings'])} findings)")


if __name__ == "__main__":
    main()
