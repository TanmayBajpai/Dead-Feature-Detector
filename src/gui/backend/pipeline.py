"""Orchestrates the full analysis pipeline for the GUI pipeline runner."""

import asyncio
import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

# Locate the pass plugin relative to the package root (project_root/build/...).
_PKG_ROOT = Path(__file__).parent.parent.parent.parent  # project root


def _default_pass_plugin() -> str:
    candidate = _PKG_ROOT / "build" / "src" / "ir_analyzer" / "DeadFeaturePass.so"
    return str(candidate) if candidate.exists() else ""


def _find_bitcode_files(build_dir: Path, limit: int = 500) -> list[str]:
    # Prefer merged whole-program bitcode files (program.bc) when present,
    # as they enable cross-TU interprocedural analysis.  Fall back to all .bc
    # files if no program.bc exists.
    merged = list(build_dir.rglob("program.bc"))[:limit]
    if merged:
        return [str(f) for f in merged]
    return [str(f) for f in build_dir.rglob("*.bc")][:limit]


@dataclass
class PipelineRun:
    state: Literal["idle", "running", "done", "error"] = "idle"
    step: int = 0
    step_label: str = ""
    log: list[str] = field(default_factory=list)
    error: str = ""
    # Queue consumed by the SSE endpoint.
    _queue: asyncio.Queue = field(default_factory=asyncio.Queue)

    def _emit(self, line: str) -> None:
        self.log.append(line)
        try:
            self._queue.put_nowait(line)
        except asyncio.QueueFull:
            pass

    async def log_stream(self):
        """Async generator yielding log lines as they arrive."""
        idx = 0
        while True:
            # First drain any lines already in the log (catch-up for late subscribers).
            while idx < len(self.log):
                yield self.log[idx]
                idx += 1
            if self.state in ("done", "error"):
                break
            try:
                line = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                yield line
                idx = len(self.log)
            except asyncio.TimeoutError:
                continue


# Module-level singleton — only one run at a time.
_current_run: PipelineRun = PipelineRun()


def current_run() -> PipelineRun:
    return _current_run


async def start_run(
    build_dir: str,
    source_root: str,
    bitcode_files: list[str],
    pass_plugin: str,
    out_dir: str,
) -> None:
    """Launch the pipeline in a background asyncio task."""
    global _current_run
    if _current_run.state == "running":
        raise RuntimeError("A run is already in progress")

    _current_run = PipelineRun(state="running")
    asyncio.create_task(_execute(
        build_dir=Path(build_dir),
        source_root=Path(source_root),
        bitcode_files=bitcode_files,
        pass_plugin=pass_plugin,
        out_dir=Path(out_dir),
        run=_current_run,
    ))


async def _execute(
    build_dir: Path,
    source_root: Path,
    bitcode_files: list[str],
    pass_plugin: str,
    out_dir: Path,
    run: PipelineRun,
) -> None:
    try:
        out_dir.mkdir(parents=True, exist_ok=True)

        # ── Step 1: Config extraction ─────────────────────────────────────────
        run.step = 1
        run.step_label = "Extracting build configuration…"
        run._emit(f"[1/4] Config extraction from {build_dir}")

        sys.path.insert(0, str(_PKG_ROOT / "src"))
        from config_extractor.extract import extract

        config = await asyncio.get_event_loop().run_in_executor(
            None, extract, build_dir
        )
        config_path = out_dir / "config.json"
        config_path.write_text(json.dumps(config, indent=2))
        n_targets = len(config.get("targets", []))
        run._emit(f"    → {n_targets} targets, {len(config.get('global_definitions', []))} global defines")

        # ── Step 2: IR pass ───────────────────────────────────────────────────
        run.step = 2
        run.step_label = "Running IR analyzer…"

        if not bitcode_files:
            run._emit(f"    Auto-detecting .bc files in {build_dir}…")
            bitcode_files = _find_bitcode_files(build_dir)

        run._emit(f"[2/4] IR analysis on {len(bitcode_files)} bitcode file(s)")
        if not bitcode_files:
            run._emit("    WARNING: no .bc files found — skipping IR pass")
            all_findings: list[dict] = []
        else:
            all_findings = await _run_ir_pass(bitcode_files, pass_plugin, out_dir, run)

        ir_path = out_dir / "ir_findings.json"
        ir_path.write_text(json.dumps(all_findings, indent=2))
        run._emit(f"    → {len(all_findings)} raw finding(s)")

        # ── Step 3: Report ────────────────────────────────────────────────────
        run.step = 3
        run.step_label = "Generating report…"
        run._emit("[3/4] Generating report")

        from reporter.report import generate_report

        report = await asyncio.get_event_loop().run_in_executor(
            None, generate_report, ir_path, config_path, out_dir / "report"
        )
        report_path = out_dir / "report" / "report.json"
        n_findings = report["stats"]["total_findings"]
        run._emit(f"    → {n_findings} finding(s), report at {report_path}")

        # ── Step 4: Hot-reload ────────────────────────────────────────────────
        run.step = 4
        run.step_label = "Loading results…"
        run._emit("[4/4] Loading results into browser")

        from . import api as _api
        _api.configure(report_path, source_root)
        run._emit("    → Done")

        run.state = "done"
        run.step_label = "Complete"
        run._emit("PIPELINE_DONE")

    except Exception as exc:
        run.state = "error"
        run.error = str(exc)
        run._emit(f"ERROR: {exc}")
        run._emit("PIPELINE_DONE")


async def _run_ir_pass(
    bitcode_files: list[str],
    pass_plugin: str,
    out_dir: Path,
    run: PipelineRun,
) -> list[dict]:
    all_findings: list[dict] = []
    for idx, bc in enumerate(bitcode_files, 1):
        out_json = out_dir / f"ir_{idx}.json"
        cmd = [
            "opt",
            "--load-pass-plugin", pass_plugin,
            "-passes=dead-feature",
            f"--dead-feature-output={out_json}",
            bc, "-o", "/dev/null",
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            run._emit(f"    WARNING: opt failed on {Path(bc).name}: {stderr.decode()[:120]}")
            continue
        if out_json.exists():
            findings = json.loads(out_json.read_text())
            all_findings.extend(findings)
        if idx % 10 == 0 or idx == len(bitcode_files):
            run._emit(f"    Processed {idx}/{len(bitcode_files)} files…")
    return all_findings
