"""Extract -D flags from a Makefile build via make --dry-run."""

import re
import subprocess
from pathlib import Path

_DEFINE_RE = re.compile(r"-D([^\s]+)")
_SOURCE_RE = re.compile(r"-c\s+(\S+\.(?:c|cpp|cxx|cc))")


def parse_makefile_dry_run(build_dir: Path) -> list[dict]:
    """Run `make -np` in build_dir and parse -D flags from compiler invocations."""
    try:
        proc = subprocess.run(
            ["make", "-np", "--dry-run"],
            cwd=build_dir,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []

    result = []
    for line in proc.stdout.splitlines():
        if not ("-D" in line and ("-c " in line or ".c" in line)):
            continue
        src_match = _SOURCE_RE.search(line)
        source = src_match.group(1) if src_match else ""
        defines = _DEFINE_RE.findall(line)
        if defines:
            result.append({"file": source, "defines": defines})
    return result
