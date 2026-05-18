"""Render the merged report to JSON and plain-text formats."""

import json
from pathlib import Path


def render_json(report: dict, path: Path) -> None:
    Path(path).write_text(json.dumps(report, indent=2) + "\n")


def render_text(report: dict, path: Path) -> None:
    lines = []
    stats = report.get("stats", {})
    lines.append("=== Dead Feature Detector Report ===")
    lines.append(f"Total findings    : {stats.get('total_findings', 0)}")
    lines.append(f"Total dead lines  : {stats.get('total_dead_lines', 0)}")
    lines.append(f"Avg confidence    : {stats.get('avg_confidence', 0.0):.2f}")
    lines.append("")

    for f in report.get("findings", []):
        conf = f.get("confidence", 0.0)
        lines.append(
            f"[{conf:.2f}] {f.get('kind','?'):>16}  {f.get('feature_name','?')}"
        )
        src = f.get("source_file", "")
        s, e = f.get("start_line", 0), f.get("end_line", 0)
        if src:
            lines.append(f"               {src}:{s}-{e}  (~{f.get('estimated_lines',0)} lines)")
        lines.append("")

    Path(path).write_text("\n".join(lines))
