"""Parse CMake File API v1 reply to extract per-target compile definitions."""

import json
from pathlib import Path


def read_cmake_api(build_dir: Path) -> dict:
    """Read the CMake File API reply and return a config manifest."""
    reply_dir = build_dir / ".cmake" / "api" / "v1" / "reply"
    if not reply_dir.exists():
        return {"targets": [], "global_definitions": []}

    # Locate the most recent codemodel reply file.
    codemodel_files = sorted(reply_dir.glob("codemodel-v2-*.json"))
    if not codemodel_files:
        return {"targets": [], "global_definitions": []}

    codemodel = json.loads(codemodel_files[-1].read_text())
    targets_out = []
    global_defs: set[str] = set()

    for config in codemodel.get("configurations", []):
        for target_ref in config.get("targets", []):
            target_file = reply_dir / target_ref["jsonFile"]
            if not target_file.exists():
                continue
            target_data = json.loads(target_file.read_text())
            name = target_data.get("name", "unknown")
            defs: list[str] = []
            source_files: list[str] = []

            for group in target_data.get("compileGroups", []):
                for d in group.get("defines", []):
                    val = d.get("define", "")
                    if val:
                        defs.append(val)
                        global_defs.add(val)
                for src_idx in group.get("sourceIndexes", []):
                    sources = target_data.get("sources", [])
                    if src_idx < len(sources):
                        path = sources[src_idx].get("path", "")
                        if path:
                            source_files.append(path)

            targets_out.append({
                "name": name,
                "compile_definitions": sorted(set(defs)),
                "source_files": source_files,
            })

    return {
        "targets": targets_out,
        "global_definitions": sorted(global_defs),
    }
