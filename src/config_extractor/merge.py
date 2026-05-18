"""Merge per-TU define lists into a single per-target manifest."""

from pathlib import Path


def merge_per_tu_defines(per_tu: list[dict]) -> dict:
    """Group per-TU records by inferred target (directory) and union their defines."""
    from collections import defaultdict

    groups: dict[str, dict] = defaultdict(lambda: {"defines": set(), "sources": []})
    for entry in per_tu:
        src = entry.get("file", "")
        # Use parent directory as a rough target proxy when no explicit target name.
        target = str(Path(src).parent) if src else "unknown"
        groups[target]["defines"].update(entry.get("defines", []))
        if src:
            groups[target]["sources"].append(src)

    targets = []
    global_defs: set[str] = set()
    for name, data in groups.items():
        targets.append({
            "name": name,
            "compile_definitions": sorted(data["defines"]),
            "source_files": data["sources"],
        })
        global_defs.update(data["defines"])

    return {
        "targets": targets,
        "global_definitions": sorted(global_defs),
    }
