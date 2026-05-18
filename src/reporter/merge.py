"""Join IR findings with config manifest by source file to enrich findings."""

from pathlib import Path


def merge_findings(ir_findings: list[dict], config: dict) -> list[dict]:
    """Add config-level metadata to each IR finding."""
    # Build a map from source file basename to the targets that contain it.
    file_to_targets: dict[str, list[str]] = {}
    for target in config.get("targets", []):
        for src in target.get("source_files", []):
            key = Path(src).name
            file_to_targets.setdefault(key, []).append(target["name"])

    # Deduplicate: same function + source location may appear across multiple
    # bitcode files (per-TU vs merged) or across build variants.  Keep the
    # entry with the highest confidence; merge dead_in_targets lists.
    seen: dict[tuple, dict] = {}
    for f in ir_findings:
        key = (f.get("function", ""), f.get("source_file", ""), f.get("start_line", 0))
        if key in seen:
            existing = seen[key]
            existing["confidence"] = max(existing["confidence"], f.get("confidence", 0.0))
        else:
            seen[key] = dict(f)

    enriched = []
    for idx, f in enumerate(seen.values()):
        src_key = Path(f.get("source_file", "")).name
        feature_name = _infer_feature_name(f)
        enriched.append({
            "id": idx,
            "feature_name": feature_name,
            "kind": f.get("kind", "unknown"),
            "confidence": f.get("confidence", 0.0),
            "function": f.get("function", ""),
            "basic_block": f.get("basic_block", ""),
            "source_file": f.get("source_file", ""),
            "start_line": f.get("start_line", 0),
            "end_line": f.get("end_line", 0),
            "estimated_lines": max(0, f.get("end_line", 0) - f.get("start_line", 0) + 1),
            "dead_in_targets": file_to_targets.get(src_key, []),
        })
    return enriched


def _infer_feature_name(finding: dict) -> str:
    """Derive a human-readable feature name from function / basic block names."""
    fn = finding.get("function", "")
    bb = finding.get("basic_block", "")
    # Prefer the basic block label if it looks like a flag name.
    for name in [bb, fn]:
        if name and any(kw in name.lower() for kw in ("feature", "flag", "enable", "legacy")):
            return name
    return fn or bb or "unknown"
