#!/usr/bin/env bash
# Run the full Dead Feature Detector pipeline on the LLVM evaluation build.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LLVM_BUILD="${1:-$ROOT/eval/llvm-build}"
OUT_DIR="$ROOT/eval/results"
PASS_LIB="$ROOT/build/src/ir_analyzer/DeadFeaturePass.so"

if [[ ! -f "$PASS_LIB" ]]; then
    echo "Pass plugin not found: $PASS_LIB  (run scripts/ci.sh first)"
    exit 1
fi

mkdir -p "$OUT_DIR"
source "$ROOT/.venv/bin/activate"

echo "=== Phase 1: Extract build configuration ==="
python3 -m config_extractor \
    --build-dir "$LLVM_BUILD" \
    --out "$OUT_DIR/config.json"

echo "=== Phase 2-3: Run IR analyzer on LLVM bitcode ==="
# Collect all .bc files produced by the LTO build.
BC_FILES=()
while IFS= read -r f; do BC_FILES+=("$f"); done < <(find "$LLVM_BUILD" -name "*.bc" | head -50)

if [[ ${#BC_FILES[@]} -eq 0 ]]; then
    echo "No .bc files found in $LLVM_BUILD"
    echo "Tip: rebuild with -DCMAKE_C_FLAGS='-flto=thin -fembed-bitcode'"
    exit 1
fi

IR_FINDINGS="$OUT_DIR/ir_findings.json"
# Run pass on each bitcode file and merge results.
echo "[]" > "$IR_FINDINGS"
for bc in "${BC_FILES[@]}"; do
    TMP="$(mktemp /tmp/dfd_XXXXXX.json)"
    opt -load-pass-plugin "$PASS_LIB" \
        -passes=dead-feature \
        --dead-feature-output "$TMP" \
        "$bc" -o /dev/null 2>/dev/null || true
    # Merge: concatenate JSON arrays.
    python3 -c "
import json, sys
existing = json.load(open('$IR_FINDINGS'))
new = json.load(open('$TMP'))
json.dump(existing + new, open('$IR_FINDINGS', 'w'), indent=2)
"
done

echo "=== Phase 4: Generate report ==="
python3 -m reporter \
    --ir-findings "$IR_FINDINGS" \
    --config "$OUT_DIR/config.json" \
    --out "$OUT_DIR/report"

echo ""
echo "Results written to $OUT_DIR/report/"
echo "Top findings:"
python3 -c "
import json
r = json.load(open('$OUT_DIR/report/report.json'))
for f in r['findings'][:10]:
    print(f'  [{f[\"confidence\"]:.2f}] {f[\"kind\"]:>16}  {f[\"feature_name\"]}  ({f[\"estimated_lines\"]} lines)')
"

echo ""
echo "Launch GUI with:"
echo "  python3 -m gui.backend --report $OUT_DIR/report/report.json --source-root $LLVM_BUILD/.."
