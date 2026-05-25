#!/usr/bin/env bash
# eval/run_sqlite.sh — Run Dead Feature Detector on the SQLite amalgamation.
#
# Downloads sqlite3.c (single-file amalgamation), compiles it to LLVM bitcode at
# -O0 (preserving all dead blocks), then runs the full DFD pipeline.
#
# Usage:
#   bash eval/run_sqlite.sh          # from repo root
#   bash eval/run_sqlite.sh --gui    # open GUI after analysis
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN="$ROOT/build/src/ir_analyzer/DeadFeaturePass.so"
WORK_DIR="$ROOT/eval/sqlite"
OUT_DIR="$ROOT/eval/sqlite-results"
OPEN_GUI=0

if [[ "${1:-}" == "--gui" ]]; then OPEN_GUI=1; fi

if [[ ! -f "$PLUGIN" ]]; then
    echo "Pass plugin not found: $PLUGIN"
    echo "Run ./build.sh first."
    exit 1
fi

mkdir -p "$WORK_DIR" "$OUT_DIR"

# ── Download amalgamation if not cached ──────────────────────────────────────
AMALG="$WORK_DIR/sqlite3.c"
if [[ ! -f "$AMALG" ]]; then
    echo "Downloading SQLite amalgamation..."
    URLS=(
        "https://www.sqlite.org/2025/sqlite-amalgamation-3490100.zip"
        "https://www.sqlite.org/2024/sqlite-amalgamation-3470200.zip"
        "https://www.sqlite.org/2024/sqlite-amalgamation-3460100.zip"
        "https://www.sqlite.org/2024/sqlite-amalgamation-3450300.zip"
    )
    DOWNLOADED=0
    for URL in "${URLS[@]}"; do
        ZIP="$WORK_DIR/sqlite-amalgamation.zip"
        if /usr/bin/curl -fsSL --max-time 60 "$URL" -o "$ZIP" 2>/dev/null; then
            python3 -c "
import zipfile, shutil, os
with zipfile.ZipFile('$ZIP') as z:
    for name in z.namelist():
        if name.endswith('sqlite3.c'):
            with z.open(name) as src, open('$AMALG', 'wb') as dst:
                shutil.copyfileobj(src, dst)
            print('Extracted', name)
            break
"
            if [[ -f "$AMALG" ]]; then
                DOWNLOADED=1
                VER="$(basename "$URL" .zip | sed 's/sqlite-amalgamation-//')"
                echo "  Downloaded SQLite $VER"
                break
            fi
        fi
    done
    if [[ "$DOWNLOADED" -eq 0 ]]; then
        echo "Failed to download SQLite amalgamation."
        exit 1
    fi
fi

LINES="$(wc -l < "$AMALG")"
echo "SQLite amalgamation: $LINES lines"

# ── Compile to bitcode ────────────────────────────────────────────────────────
BC="$WORK_DIR/sqlite3.bc"
if [[ ! -f "$BC" ]]; then
    echo "Compiling to bitcode (takes ~10s)..."
    clang -std=c11 -O0 -gline-tables-only -fno-discard-value-names \
          -DSQLITE_DEFAULT_WAL_SYNCHRONOUS=1 \
          -emit-llvm -c "$AMALG" -o "$BC" 2>/dev/null
    echo "  Bitcode: $(du -h "$BC" | cut -f1)"
fi

# ── Run IR pass ───────────────────────────────────────────────────────────────
echo "Running IR pass..."
IR_FINDINGS="$OUT_DIR/ir_findings.json"
opt --load-pass-plugin "$PLUGIN" -passes=dead-feature \
    --dead-feature-output="$IR_FINDINGS" \
    "$BC" -o /dev/null 2>/dev/null

NFINDINGS="$(python3 -c "import json; print(len(json.load(open('$IR_FINDINGS'))))")"
echo "  Raw findings: $NFINDINGS"

# ── Config extraction ─────────────────────────────────────────────────────────
echo "Extracting build configuration..."
PYTHONPATH="$ROOT/src" python3 -m config_extractor \
    --build-dir "$WORK_DIR" \
    --out "$OUT_DIR/config.json"

# ── Generate report ───────────────────────────────────────────────────────────
echo "Generating report..."
PYTHONPATH="$ROOT/src" python3 -m reporter \
    --ir-findings "$IR_FINDINGS" \
    --config "$OUT_DIR/config.json" \
    --out "$OUT_DIR/report" \
    --bitcode "$BC"

# ── Print summary ─────────────────────────────────────────────────────────────
export PROJ_ROOT="$ROOT"
python3 - <<'PYEOF'
import json, os
root = os.environ["PROJ_ROOT"]
r = json.load(open(f"{root}/eval/sqlite-results/report/report.json"))
s = r["stats"]
print()
print("=== SQLite large-scale results ===")
print(f"  Findings       : {s['total_findings']}")
print(f"  Dead lines     : {s['total_dead_lines']}")
print(f"  Avg confidence : {s['avg_confidence']:.2f}")
print(f"  By kind        : {s['by_kind']}")
rb = s.get("removable_bytes", 0)
if rb:
    print(f"  Removable bytes: {rb:,}")
print(f"  Report         : {root}/eval/sqlite-results/report/report.json")
PYEOF

if [[ "$OPEN_GUI" -eq 1 ]]; then
    source "$ROOT/.venv/bin/activate" 2>/dev/null || true
    python3 -m gui.backend \
        --report "$OUT_DIR/report/report.json" \
        --source-root "$WORK_DIR"
fi
