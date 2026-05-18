"""Top-level entry point for the build configuration extractor."""

import argparse
import json
import sys
from pathlib import Path

from .cmake_api import read_cmake_api
from .compile_commands_parser import parse_compile_commands
from .makefile_parser import parse_makefile_dry_run
from .merge import merge_per_tu_defines


def extract(build_dir: Path) -> dict:
    """Return a config manifest for the given build directory."""
    build_dir = Path(build_dir)

    # Try CMake File API first.
    cmake_reply = build_dir / ".cmake" / "api" / "v1" / "reply"
    if cmake_reply.exists():
        return read_cmake_api(build_dir)

    # Fallback: compile_commands.json.
    cc_json = build_dir / "compile_commands.json"
    if cc_json.exists():
        per_tu = parse_compile_commands(cc_json)
        return merge_per_tu_defines(per_tu)

    # Fallback: Makefile dry-run.
    makefile = build_dir / "Makefile"
    if makefile.exists():
        per_tu = parse_makefile_dry_run(build_dir)
        return merge_per_tu_defines(per_tu)

    return {"targets": [], "global_definitions": []}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract compile-time define sets from a build directory."
    )
    parser.add_argument("--build-dir", required=True, help="Path to build directory")
    parser.add_argument("--out", default="-", help="Output JSON path (- for stdout)")
    args = parser.parse_args()

    result = extract(Path(args.build_dir))

    if args.out == "-":
        json.dump(result, sys.stdout, indent=2)
        print()
    else:
        with open(args.out, "w") as f:
            json.dump(result, f, indent=2)


if __name__ == "__main__":
    main()
