#!/usr/bin/env python3
"""Per-config bitcode diff driver (Phase 2a).

For each source file that appears in more than one build target with different
define sets, compile it with each define set and compare the IR function/BB
inventory.  Functions or basic blocks present in *some* configs but absent from
*others* are emitted as compile_time findings.

Usage:
    python3 scripts/analyze.py \
        --config config.json \
        --source-root /path/to/src \
        --out extra_ct_findings.json \
        [--clang clang]
"""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def _compile_to_bc(clang: str, source: Path, defines: list[str], out: Path) -> bool:
    """Compile source to bitcode with given defines. Returns True on success."""
    cmd = [clang, "-O0", "-g", "-emit-llvm", "-c", str(source), "-o", str(out)]
    for d in defines:
        cmd.append(f"-D{d}")
    r = subprocess.run(cmd, capture_output=True)
    return r.returncode == 0


def _list_functions(opt: str, bc: Path) -> set[str]:
    """Return the set of function names defined in the bitcode."""
    r = subprocess.run(
        ["llvm-nm", "--defined-only", "--format=just-symbols", str(bc)],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        # Fallback: use opt to print function names via IR dump.
        r2 = subprocess.run(
            [opt, "-S", str(bc), "-o", "-"],
            capture_output=True, text=True,
        )
        return {
            line.split("@")[1].split("(")[0].strip()
            for line in r2.stdout.splitlines()
            if line.startswith("define ")
        }
    return {line.strip() for line in r.stdout.splitlines() if line.strip()}


def analyze(config: dict, source_root: Path, clang: str, opt: str) -> list[dict]:
    """Return compile_time findings based on per-config bitcode diffs."""
    targets = config.get("targets", [])
    if len(targets) < 2:
        return []

    # Group source files across targets with different define sets.
    # key: source path → list of (defines, target_name)
    source_configs: dict[str, list[tuple[list[str], str]]] = {}
    for target in targets:
        defs = target.get("compile_definitions", [])
        for src in target.get("source_files", []):
            source_configs.setdefault(src, []).append((defs, target["name"]))

    findings = []
    with tempfile.TemporaryDirectory(prefix="dfd_analyze_") as tmpdir:
        tmp = Path(tmpdir)
        for src_path, configs in source_configs.items():
            # Skip files that appear with identical defines in all targets.
            define_sets = [frozenset(d) for d, _ in configs]
            if len(set(define_sets)) < 2:
                continue

            # Try to resolve the source file path.
            candidates = [
                source_root / src_path,
                Path(src_path),
            ]
            resolved = next((p for p in candidates if p.exists()), None)
            if resolved is None:
                continue

            # Compile with each unique define set.
            per_config_fns: list[tuple[str, set[str]]] = []
            for idx, (defs, tname) in enumerate(configs):
                bc_out = tmp / f"{resolved.stem}_{idx}.bc"
                if not _compile_to_bc(clang, resolved, defs, bc_out):
                    continue
                fns = _list_functions(opt, bc_out)
                per_config_fns.append((tname, fns))

            if len(per_config_fns) < 2:
                continue

            # Functions in union but not intersection are conditionally present.
            all_fns = set.union(*(fns for _, fns in per_config_fns))
            common_fns = set.intersection(*(fns for _, fns in per_config_fns))
            dead_fns = all_fns - common_fns

            for fn in sorted(dead_fns):
                dead_in = [t for t, fns in per_config_fns if fn not in fns]
                findings.append({
                    "function": fn,
                    "basic_block": "",
                    "source_file": src_path,
                    "start_line": 0,
                    "end_line": 0,
                    "kind": "compile_time",
                    "confidence": 0.95,
                    "dead_in_configs": dead_in,
                    "note": "absent from some build configurations",
                })

    return findings


def main() -> None:
    parser = argparse.ArgumentParser(description="Per-config bitcode diff analyzer")
    parser.add_argument("--config", required=True, help="Path to config.json")
    parser.add_argument("--source-root", required=True, help="Root of source tree")
    parser.add_argument("--out", default="extra_ct_findings.json")
    parser.add_argument("--clang", default="clang")
    parser.add_argument("--opt", default="opt")
    args = parser.parse_args()

    config = json.loads(Path(args.config).read_text())
    findings = analyze(
        config,
        source_root=Path(args.source_root),
        clang=args.clang,
        opt=args.opt,
    )

    Path(args.out).write_text(json.dumps(findings, indent=2) + "\n")
    print(f"Per-config diff: {len(findings)} additional compile_time findings → {args.out}")


if __name__ == "__main__":
    main()
