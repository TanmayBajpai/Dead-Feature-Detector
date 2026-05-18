"""Extract -D flags from compile_commands.json."""

import json
import re
import shlex
from pathlib import Path

_DEFINE_RE = re.compile(r"-D([^\s]+)")


def parse_compile_commands(path: Path) -> list[dict]:
    """Return a list of {file, defines} dicts from compile_commands.json."""
    entries = json.loads(Path(path).read_text())
    result = []
    for entry in entries:
        command = entry.get("command", "") or " ".join(entry.get("arguments", []))
        defines = _DEFINE_RE.findall(command)
        result.append({
            "file": entry.get("file", ""),
            "defines": defines,
        })
    return result
