"""Measure removable binary size from dead findings using the LLVM toolchain.

Objective 5 (removable code volume) asks for a real binary-size estimate, not
just a dead-line count.  We compile each whole-program bitcode module to a
native object with ``llc`` and read per-symbol section sizes with
``llvm-nm --print-size``.  A finding's removable bytes are then:

  * whole-function-dead findings (interprocedural — the entire function is
    unreachable): the measured size of that function's text symbol;
  * block-level findings (compile_time / runtime — only part of a function is
    dead): ``estimated_lines * bytes_per_line``, where ``bytes_per_line`` is
    derived from the measured whole-function symbols in the same run (so it is
    anchored to real measurements rather than a hard-coded constant).

If the toolchain is unavailable or every ``llc`` invocation fails, measurement
is skipped and the report simply omits the byte figures (``measured: False``).
"""

import re
import shutil
import subprocess
import tempfile
from pathlib import Path

# `llvm-nm --print-size` lines look like: "0000000000000010 0000000000000024 t _ZL3foo"
_NM_LINE = re.compile(r"^[0-9a-fA-F]+\s+([0-9a-fA-F]+)\s+([A-Za-z])\s+(.+)$")
_TEXT_TYPES = set("tT")  # local/global text symbols

_FALLBACK_BYTES_PER_LINE = 16.0


def _tools_available() -> bool:
    return shutil.which("llc") is not None and shutil.which("llvm-nm") is not None


def _symbol_sizes(bitcode_files: list[str]) -> dict[str, int]:
    """Map mangled symbol name -> measured text size in bytes (max across modules)."""
    sizes: dict[str, int] = {}
    for bc in bitcode_files:
        if not Path(bc).exists():
            continue
        with tempfile.NamedTemporaryFile(suffix=".o", delete=True) as obj:
            llc = subprocess.run(
                ["llc", "-filetype=obj", bc, "-o", obj.name],
                capture_output=True, text=True,
            )
            if llc.returncode != 0:
                continue
            nm = subprocess.run(
                ["llvm-nm", "--print-size", "--no-sort", obj.name],
                capture_output=True, text=True,
            )
            if nm.returncode != 0:
                continue
            for line in nm.stdout.splitlines():
                m = _NM_LINE.match(line.strip())
                if not m:
                    continue
                size_hex, sym_type, name = m.groups()
                if sym_type not in _TEXT_TYPES:
                    continue
                size = int(size_hex, 16)
                sizes[name] = max(sizes.get(name, 0), size)
    return sizes


def _is_whole_function(finding: dict) -> bool:
    # Interprocedural findings flag an entire unreachable function (no basic
    # block sub-range); compile_time / runtime findings flag one block.
    return finding.get("kind") == "interprocedural" or not finding.get("basic_block")


def _bytes_per_line(findings: list[dict], sizes: dict[str, int]) -> float:
    """Derive bytes-per-line from measured whole-function findings, if any."""
    total_bytes = 0
    total_lines = 0
    for f in findings:
        if not _is_whole_function(f):
            continue
        b = sizes.get(f.get("function", ""), 0)
        lines = f.get("estimated_lines", 0)
        if b > 0 and lines > 0:
            total_bytes += b
            total_lines += lines
    if total_lines > 0:
        return total_bytes / total_lines
    return _FALLBACK_BYTES_PER_LINE


def measure(bitcode_files: list[str], findings: list[dict]) -> dict:
    """Annotate findings in place with ``estimated_bytes`` and return a summary.

    Returns ``{measured, method, removable_bytes, bytes_per_line}``.
    """
    if not bitcode_files or not _tools_available():
        for f in findings:
            f.setdefault("estimated_bytes", 0)
        return {
            "measured": False,
            "method": "llvm-nm --print-size on llc-compiled objects (toolchain unavailable)",
            "removable_bytes": 0,
            "bytes_per_line": 0.0,
        }

    sizes = _symbol_sizes(bitcode_files)
    if not sizes:
        for f in findings:
            f.setdefault("estimated_bytes", 0)
        return {
            "measured": False,
            "method": "llvm-nm --print-size on llc-compiled objects (llc/llvm-nm produced no symbols)",
            "removable_bytes": 0,
            "bytes_per_line": 0.0,
        }

    bpl = _bytes_per_line(findings, sizes)
    total = 0
    for f in findings:
        if _is_whole_function(f) and sizes.get(f.get("function", ""), 0) > 0:
            b = sizes[f["function"]]
        else:
            b = round(f.get("estimated_lines", 0) * bpl)
        f["estimated_bytes"] = b
        total += b

    return {
        "measured": True,
        "method": "llvm-nm --print-size on llc-compiled objects",
        "removable_bytes": total,
        "bytes_per_line": round(bpl, 2),
    }
