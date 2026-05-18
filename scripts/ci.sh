#!/usr/bin/env bash
# Local CI script — mirrors what GitHub Actions would run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Dead Feature Detector CI ==="

# ── Python venv ──────────────────────────────────────────────────────────────
VENV="$ROOT/.venv"
if [[ ! -d "$VENV" ]]; then
    echo "[setup] Creating Python venv..."
    python3 -m venv "$VENV"
fi
source "$VENV/bin/activate"
pip install -q -e ".[dev]"

# ── Python unit tests ─────────────────────────────────────────────────────────
echo "[test] Running Python unit tests..."
PYTHONPATH="$ROOT/src" pytest tests/unit \
    --ignore=tests/unit/test_pipeline_golden.py \
    -v --tb=short

# ── C++ build ─────────────────────────────────────────────────────────────────
echo "[build] Configuring LLVM pass..."
BUILD="$ROOT/build"
cmake -S "$ROOT" -B "$BUILD" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_COMPILER="${CC:-clang}" \
    -DCMAKE_CXX_COMPILER="${CXX:-clang++}" \
    -DLLVM_DIR="$(llvm-config --cmakedir)" \
    2>&1 | grep -E '(Found LLVM|Error|Warning)' || true

echo "[build] Building LLVM pass..."
cmake --build "$BUILD" --parallel "$(nproc)"

# ── ctest (IR fixture tests) ─────────────────────────────────────────────────
echo "[test] Running IR analyzer tests..."
ctest --test-dir "$BUILD" --output-on-failure

# ── Golden-file pipeline test ─────────────────────────────────────────────────
echo "[test] Running golden-file pipeline test..."
PYTHONPATH="$ROOT/src" pytest tests/unit/test_pipeline_golden.py -v --tb=short

# ── CLI smoke tests ───────────────────────────────────────────────────────────
echo "[test] CLI smoke tests..."
PYTHONPATH="$ROOT/src" python3 -m config_extractor --help > /dev/null
PYTHONPATH="$ROOT/src" python3 -m reporter --help > /dev/null
PYTHONPATH="$ROOT/src" python3 -m gui.backend --help > /dev/null
echo "       all CLIs respond to --help"

# ── Frontend build ────────────────────────────────────────────────────────────
if command -v node &>/dev/null; then
    echo "[build] Building frontend..."
    pushd "$ROOT/src/gui/frontend" > /dev/null
    npm ci --silent
    npm run build --silent
    popd > /dev/null
else
    echo "[skip] Node not found; skipping frontend build"
fi

echo ""
echo "=== All checks passed ==="
