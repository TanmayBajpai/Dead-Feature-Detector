"""FastAPI application exposing report data and pipeline runner for the GUI."""

import asyncio
import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .source import SourceReader

app = FastAPI(title="Dead Feature Detector GUI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_EVAL_SUMMARY = _PROJECT_ROOT / "eval" / "eval_summary.json"

# Populated by __main__.py or by the pipeline after a run completes.
_report: dict = {"findings": [], "stats": {}}
_config: dict = {"targets": [], "global_definitions": []}
_source_reader: Optional[SourceReader] = None
_has_report: bool = False
_has_config: bool = False


def configure(report_path: Path, source_root: Path, config_path: Optional[Path] = None) -> None:
    global _report, _config, _source_reader, _has_report, _has_config
    _report = json.loads(report_path.read_text())
    _source_reader = SourceReader(source_root)
    _has_report = True

    # The config manifest is written one level above report/ by the pipeline.
    if config_path is None:
        config_path = report_path.parent.parent / "config.json"
    if config_path and Path(config_path).exists():
        _config = json.loads(Path(config_path).read_text())
        _has_config = True
    else:
        _config = {"targets": [], "global_definitions": []}
        _has_config = False


# ── Results endpoints ─────────────────────────────────────────────────────────

@app.get("/findings")
def get_findings(
    kind: Optional[str] = None,
    min_confidence: float = Query(0.0, ge=0.0, le=1.0),
    file: Optional[str] = None,
):
    results = _report.get("findings", [])
    if kind:
        results = [f for f in results if f.get("kind") == kind]
    if min_confidence > 0:
        results = [f for f in results if f.get("confidence", 0) >= min_confidence]
    if file:
        results = [f for f in results if file in f.get("source_file", "")]
    return results


@app.get("/findings/{finding_id}")
def get_finding(finding_id: int):
    for f in _report.get("findings", []):
        if f.get("id") == finding_id:
            return f
    raise HTTPException(status_code=404, detail="Finding not found")


@app.get("/source")
def get_source(
    file: str = Query(...),
    start: int = Query(1, ge=1),
    end: int = Query(1, ge=1),
    context: int = Query(20, ge=0, le=200),
):
    if _source_reader is None:
        raise HTTPException(status_code=503, detail="Source reader not configured")
    try:
        return _source_reader.read_lines(file, start, end, context)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {file}")


@app.get("/stats")
def get_stats():
    stats = _report.get("stats", {})
    findings = _report.get("findings", [])
    buckets = [0] * 10
    for f in findings:
        idx = min(9, int(f.get("confidence", 0.0) * 10))
        buckets[idx] += 1
    return {
        **stats,
        "has_report": _has_report,
        "confidence_histogram": [
            {"range": f"{i/10:.1f}-{(i+1)/10:.1f}", "count": buckets[i]}
            for i in range(10)
        ],
    }


@app.get("/config")
def get_config():
    """Objective 1: build configurations extracted from CMake/Makefile.

    Returns the per-target ``#define`` sets plus convenience counts so the GUI
    can show what build configurations the analysis was correlated against.
    """
    targets = _config.get("targets", [])
    return {
        "has_config": _has_config,
        "global_definitions": _config.get("global_definitions", []),
        "target_count": len(targets),
        "targets": [
            {
                "name": t.get("name", ""),
                "compile_definitions": t.get("compile_definitions", []),
                "source_files": t.get("source_files", []),
                "define_count": len(t.get("compile_definitions", [])),
                "source_count": len(set(t.get("source_files", []))),
            }
            for t in targets
        ],
    }


@app.get("/eval")
def get_eval():
    """Objective 4: evaluation results (test-case suite + large-scale target)."""
    if _EVAL_SUMMARY.exists():
        return {"has_eval": True, **json.loads(_EVAL_SUMMARY.read_text())}
    return {"has_eval": False, "test_cases": [], "integration": [], "large_scale": {}}


# ── Pipeline runner endpoints ─────────────────────────────────────────────────

@app.post("/run")
async def start_run(body: dict):
    """Start the analysis pipeline. Body: {build_dir, source_root, bitcode_files?, pass_plugin?, out_dir?}"""
    from . import pipeline

    if pipeline.current_run().state == "running":
        raise HTTPException(status_code=409, detail="A run is already in progress")

    build_dir = body.get("build_dir", "")
    source_root = body.get("source_root", "")
    if not build_dir or not source_root:
        raise HTTPException(status_code=400, detail="build_dir and source_root are required")

    if not Path(build_dir).exists():
        raise HTTPException(status_code=400, detail=f"build_dir not found: {build_dir}")
    if not Path(source_root).exists():
        raise HTTPException(status_code=400, detail=f"source_root not found: {source_root}")

    pass_plugin = body.get("pass_plugin") or pipeline._default_pass_plugin()
    if not pass_plugin or not Path(pass_plugin).exists():
        raise HTTPException(
            status_code=400,
            detail=f"Pass plugin not found: {pass_plugin or '(not specified)'}. "
                   "Build the LLVM pass first: cmake --build build",
        )

    bitcode_files = body.get("bitcode_files") or []
    out_dir = body.get("out_dir") or str(Path(build_dir) / ".dfd_run")

    await pipeline.start_run(
        build_dir=build_dir,
        source_root=source_root,
        bitcode_files=bitcode_files,
        pass_plugin=pass_plugin,
        out_dir=out_dir,
    )
    return {"status": "started"}


@app.get("/run/status")
def run_status():
    from . import pipeline
    run = pipeline.current_run()
    return {
        "state": run.state,
        "step": run.step,
        "step_label": run.step_label,
        "total_steps": 4,
        "log_lines": len(run.log),
        "error": run.error or None,
    }


@app.get("/run/log")
async def run_log():
    """SSE stream: each log line as `data: <line>\\n\\n`, then `data: DONE\\n\\n`."""
    from . import pipeline

    async def event_stream():
        run = pipeline.current_run()
        async for line in run.log_stream():
            yield f"data: {line}\n\n"
        yield "data: DONE\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/run/detect-bc")
def detect_bc(build_dir: str = Query(...)):
    """Return a list of .bc files found under build_dir (up to 500)."""
    d = Path(build_dir)
    if not d.exists():
        raise HTTPException(status_code=400, detail=f"Directory not found: {build_dir}")
    files = [str(f) for f in d.rglob("*.bc")][:500]
    return {"files": files, "count": len(files)}


@app.get("/run/detect-plugin")
def detect_plugin():
    """Return the auto-detected pass plugin path."""
    from . import pipeline
    path = pipeline._default_pass_plugin()
    return {"path": path, "exists": bool(path and Path(path).exists())}
