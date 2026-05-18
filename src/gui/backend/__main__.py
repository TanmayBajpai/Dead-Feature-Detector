"""Launch the Dead Feature Detector GUI.

Usage:
    python -m gui.backend                                           # Setup mode
    python -m gui.backend --report r.json --source-root /path/src  # Results mode
"""

import argparse
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn

from .api import app, configure


def _open_browser(url: str, delay: float = 1.5) -> None:
    time.sleep(delay)
    webbrowser.open(url)


def main() -> None:
    parser = argparse.ArgumentParser(description="Dead Feature Detector GUI server")
    parser.add_argument("--report", default=None, help="Path to report.json (omit to start in Setup mode)")
    parser.add_argument("--source-root", default=None, help="Root of the analysed source tree")
    parser.add_argument("--port", type=int, default=8421, help="HTTP port (default 8421)")
    parser.add_argument("--no-browser", action="store_true", help="Don't open browser automatically")
    args = parser.parse_args()

    if args.report is not None:
        report_path = Path(args.report)
        source_root = Path(args.source_root or ".")
        if not report_path.exists():
            sys.exit(f"report not found: {report_path}")
        if not source_root.exists():
            sys.exit(f"source-root not found: {source_root}")
        configure(report_path, source_root)

    # Mount pre-built frontend static files; auto-build if missing.
    static_dir = Path(__file__).parent.parent / "static"
    frontend_dir = Path(__file__).parent.parent / "frontend"
    if not (static_dir / "index.html").exists() and frontend_dir.exists():
        import shutil
        import subprocess
        npm = shutil.which("npm")
        if npm is None:
            sys.exit("Frontend not built and npm not found. Run: cd src/gui/frontend && npm ci && npm run build")
        print("Building frontend (first run)…")
        subprocess.run([npm, "ci"], cwd=str(frontend_dir), check=True)
        subprocess.run([npm, "run", "build"], cwd=str(frontend_dir), check=True)
    if (static_dir / "index.html").exists():
        from fastapi.staticfiles import StaticFiles
        app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
    else:
        print("WARNING: frontend not found. API-only mode active.", file=sys.stderr)

    url = f"http://localhost:{args.port}"
    if not args.no_browser:
        threading.Thread(target=_open_browser, args=(url,), daemon=True).start()

    mode = "results" if args.report else "setup"
    print(f"Dead Feature Detector GUI [{mode} mode] → {url}")
    uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
