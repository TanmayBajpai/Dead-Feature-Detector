"""Read source file lines with a path-traversal guard."""

from pathlib import Path


class SourceReader:
    def __init__(self, source_root: Path):
        self._root = Path(source_root).resolve()

    def read_lines(self, file_path: str, start: int, end: int, context: int = 20) -> dict:
        """Return lines [start-context .. end+context] from file_path.

        Raises ValueError if the resolved path escapes source_root.
        """
        resolved = (self._root / file_path).resolve()
        if not str(resolved).startswith(str(self._root)):
            raise ValueError(f"Path traversal attempt: {file_path!r}")
        if not resolved.exists():
            # Try as an absolute path that lives under source root.
            abs_path = Path(file_path).resolve()
            if not str(abs_path).startswith(str(self._root)):
                raise ValueError(f"Path outside source root: {file_path!r}")
            resolved = abs_path

        all_lines = resolved.read_text(errors="replace").splitlines()
        total = len(all_lines)
        lo = max(0, start - context - 1)
        hi = min(total, end + context)
        return {
            "file": file_path,
            "total_lines": total,
            "returned_start": lo + 1,
            "returned_end": hi,
            "lines": all_lines[lo:hi],
        }
