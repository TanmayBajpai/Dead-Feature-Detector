"""Top-level entry point for the report generator."""

import argparse
import json
import sys
from pathlib import Path

from .merge import merge_findings
from .score import apply_confidence
from .render import render_json, render_text
from .stats import compute_stats
from .binary_size import measure as measure_binary_size


def generate_report(
    ir_findings_path: Path,
    config_path: Path,
    out_dir: Path,
    bitcode_files: list[str] | None = None,
) -> dict:
    """Merge IR findings with config manifest and write report files.

    When ``bitcode_files`` are supplied, removable binary size is measured with
    the LLVM toolchain and folded into the findings and summary stats.
    """
    ir_findings = json.loads(Path(ir_findings_path).read_text())
    config = json.loads(Path(config_path).read_text())

    findings = merge_findings(ir_findings, config)
    findings = apply_confidence(findings)

    size_summary = measure_binary_size(bitcode_files or [], findings)

    stats = compute_stats(findings)
    stats["removable_bytes"] = size_summary["removable_bytes"]
    stats["binary_size_measured"] = size_summary["measured"]
    stats["binary_size_method"] = size_summary["method"]

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
    parser.add_argument("--bitcode", nargs="*", default=None,
                        help="Bitcode files for measuring removable binary size (optional)")
    args = parser.parse_args()

    report = generate_report(
        Path(args.ir_findings), Path(args.config), Path(args.out), args.bitcode
    )
    print(f"Report written to {args.out}/ ({len(report['findings'])} findings)")


if __name__ == "__main__":
    main()
