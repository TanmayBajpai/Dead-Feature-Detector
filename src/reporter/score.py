"""Apply confidence scoring rules to merged findings."""

# Scoring table from design doc:
#   compile_time dead (block absent from all config bitcode) → 0.95
#   runtime predicate proven false by LazyValueInfo           → 0.85
#   interprocedural (call-graph pruning only)                 → 0.60
#   heuristic name-match only, no dataflow proof              → 0.35

_KIND_SCORES = {
    "compile_time": 0.95,
    "runtime": 0.85,
    "interprocedural": 0.60,
    "heuristic": 0.35,
}


def apply_confidence(findings: list[dict]) -> list[dict]:
    """Override or validate confidence scores based on kind."""
    result = []
    for f in findings:
        kind = f.get("kind", "unknown")
        # IR pass already sets a score; only override if it's the default 0.
        if f.get("confidence", 0.0) == 0.0:
            f = {**f, "confidence": _KIND_SCORES.get(kind, 0.35)}
        result.append(f)
    # Sort by confidence descending for report readability.
    result.sort(key=lambda x: x["confidence"], reverse=True)
    return result
