#!/usr/bin/env bash
# run.sh — Run the Dead Feature Detector pipeline on a target project.
#
# Usage:
#   ./run.sh --build-dir <path> --source-root <path> [--out <dir>] [--gui]
#   ./run.sh --testcase <name>   # run a built-in testcase (01..05)
#   ./run.sh --help
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="$ROOT/build/src/ir_analyzer/DeadFeaturePass.so"
PYTHONPATH="$ROOT/src"
export PYTHONPATH

# ── Argument parsing ────────────────────────────────────────────────────────
BUILD_DIR=""
SOURCE_ROOT=""
OUT_DIR="$ROOT/out"
OPEN_GUI=0
TESTCASE=""

usage() {
    cat <<EOF
Usage: ./run.sh [OPTIONS]

Options:
  --build-dir <path>     Directory containing compile_commands.json and .bc files
  --source-root <path>   Root of the source tree (for source viewer)
  --out <dir>            Output directory (default: ./out)
  --gui                  Open the web GUI after analysis
  --testcase <name>      Run a built-in testcase: 01..06
                         06 / "demo" = large multi-file demo (42 findings, all 3 kinds)
  --help                 Show this help

Examples:
  ./run.sh --testcase 01
  ./run.sh --testcase 06 --gui
  ./run.sh --build-dir /my/project/build --source-root /my/project --gui
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --build-dir)    BUILD_DIR="$2";   shift 2 ;;
        --source-root)  SOURCE_ROOT="$2"; shift 2 ;;
        --out)          OUT_DIR="$2";     shift 2 ;;
        --gui)          OPEN_GUI=1;       shift ;;
        --testcase)     TESTCASE="$2";    shift 2 ;;
        --help|-h)      usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

# ── Testcase shortcut ────────────────────────────────────────────────────────
if [[ -n "$TESTCASE" ]]; then
    case "$TESTCASE" in
        01*) TC_DIR="$ROOT/testcases/01_compile_time_block" ;;
        02*) TC_DIR="$ROOT/testcases/02_runtime_flag_zero" ;;
        03*) TC_DIR="$ROOT/testcases/03_dead_function" ;;
        04*) TC_DIR="$ROOT/testcases/04_transitive_dead" ;;
        05*) TC_DIR="$ROOT/testcases/05_alive_code" ;;
        06*|demo) TC_DIR="$ROOT/testcases/06_demo_large" ;;
        *) echo "Unknown testcase '$TESTCASE'. Valid: 01-06 (06 = demo)"; exit 1 ;;
    esac

    # If the testcase has its own build.sh and no bitcode yet, build it first.
    if [[ ! -d "$TC_DIR/build/bitcode" ]] && [[ -f "$TC_DIR/build.sh" ]]; then
        echo "Building testcase $TESTCASE…"
        bash "$TC_DIR/build.sh"
    fi

    # Minimal testcases (01-05): compile on the fly if no build.sh.
    if [[ ! -f "$TC_DIR/build.sh" ]]; then
        echo "Compiling testcase $TESTCASE…"
        mkdir -p "$TC_DIR/build"
        BC="$TC_DIR/build/program.bc"
        OUT_JSON="$TC_DIR/build/findings.json"
        clang -std=c11 -O0 -gline-tables-only -fno-discard-value-names \
              -emit-llvm -c "$TC_DIR/src/test.c" -o "$BC"
        opt --load-pass-plugin "$PLUGIN" -passes=dead-feature \
            --dead-feature-output="$OUT_JSON" "$BC" -o /dev/null
        echo ""
        echo "=== Findings (testcase $TESTCASE) ==="
        python3 -c "
import json, sys
findings = json.load(open('$OUT_JSON'))
if not findings:
    print('  (none — all code is live)')
    sys.exit(0)
from collections import Counter
k = Counter(f['kind'] for f in findings)
print(f'  Total: {len(findings)}  by kind: {dict(k)}')
print()
for f in findings:
    print(f'  [{f[\"kind\"]}] conf={f[\"confidence\"]} fn={f[\"function\"]} '
          f'bb={f[\"basic_block\"]} L{f[\"start_line\"]}-{f[\"end_line\"]}')
"
        echo ""
        echo "Expected:"
        python3 -c "
import json
e = json.load(open('$TC_DIR/expected.json'))
if not e:
    print('  (none)')
for x in e:
    print(f'  [{x[\"kind\"]}] conf={x[\"confidence\"]} fn={x[\"function\"]}')
"
        exit 0
    fi

    BUILD_DIR="$TC_DIR/build"
    SOURCE_ROOT="$TC_DIR"
fi

# ── Validate ─────────────────────────────────────────────────────────────────
if [[ -z "$BUILD_DIR" ]]; then
    echo "Error: --build-dir is required (or use --testcase)."
    usage
fi
if [[ -z "$SOURCE_ROOT" ]]; then
    SOURCE_ROOT="$(dirname "$BUILD_DIR")"
fi

# ── Check pass plugin ─────────────────────────────────────────────────────────
if [[ ! -f "$PLUGIN" ]]; then
    echo "Error: pass plugin not found at $PLUGIN"
    echo "Run ./build.sh first."
    exit 1
fi

# ── Run pipeline ──────────────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"
echo "=== Dead Feature Detector ==="
echo "  Build dir  : $BUILD_DIR"
echo "  Source root: $SOURCE_ROOT"
echo "  Output     : $OUT_DIR"
echo ""

# Step 1: Config extraction
echo "[1/3] Extracting build configuration…"
python3 -m config_extractor --build-dir "$BUILD_DIR" --out "$OUT_DIR/config.json"

# Step 2: IR analysis
echo "[2/3] Running IR pass…"
BC_FILES=()
while IFS= read -r -d '' f; do
    BC_FILES+=("$f")
done < <(find "$BUILD_DIR" -name "program.bc" -print0 2>/dev/null)
if [[ ${#BC_FILES[@]} -eq 0 ]]; then
    while IFS= read -r -d '' f; do
        BC_FILES+=("$f")
    done < <(find "$BUILD_DIR" -name "*.bc" -print0 2>/dev/null | head -c 100000)
fi
echo "  Found ${#BC_FILES[@]} bitcode file(s)"

ALL_FINDINGS="$OUT_DIR/ir_findings.json"
echo "[]" > "$ALL_FINDINGS"
idx=0
for bc in "${BC_FILES[@]}"; do
    idx=$((idx+1))
    part="$OUT_DIR/ir_${idx}.json"
    opt --load-pass-plugin "$PLUGIN" -passes=dead-feature \
        --dead-feature-output="$part" "$bc" -o /dev/null 2>/dev/null || true
    [[ -f "$part" ]] && python3 -c "
import json, sys
existing = json.load(open('$ALL_FINDINGS'))
new = json.load(open('$part'))
json.dump(existing + new, open('$ALL_FINDINGS','w'), indent=2)
"
done

# Step 3: Report (pass bitcode so removable binary size is measured)
echo "[3/3] Generating report…"
python3 -m reporter \
    --ir-findings "$ALL_FINDINGS" \
    --config "$OUT_DIR/config.json" \
    --out "$OUT_DIR/report" \
    --bitcode "${BC_FILES[@]}"

echo ""
echo "=== Results ==="
python3 -c "
import json
r = json.load(open('$OUT_DIR/report/report.json'))
s = r['stats']
print(f'  Findings       : {s[\"total_findings\"]}')
print(f'  Dead lines     : {s[\"total_dead_lines\"]}')
print(f'  Avg confidence : {s[\"avg_confidence\"]:.2f}')
print(f'  By kind        : {s[\"by_kind\"]}')
print()
print(f'  Report: $OUT_DIR/report/report.json')
print(f'  Text  : $OUT_DIR/report/report.txt')
"

# ── GUI ───────────────────────────────────────────────────────────────────────
if [[ "$OPEN_GUI" -eq 1 ]]; then
    echo ""
    echo "Starting GUI…"
    source "$ROOT/.venv/bin/activate" 2>/dev/null || true
    python3 -m gui.backend \
        --report "$OUT_DIR/report/report.json" \
        --source-root "$SOURCE_ROOT"
fi
