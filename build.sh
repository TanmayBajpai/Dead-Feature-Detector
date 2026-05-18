#!/usr/bin/env bash
# build.sh — Build the Dead Feature Detector LLVM pass and Python environment.
# Usage: ./build.sh [--skip-frontend]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$ROOT/build"
SKIP_FRONTEND=0
for arg in "$@"; do [[ "$arg" == "--skip-frontend" ]] && SKIP_FRONTEND=1; done

echo "=== Dead Feature Detector — Build ==="
echo ""

# ── 1. LLVM pass (CMake) ────────────────────────────────────────────────────
echo "[1/3] Building LLVM pass plugin…"
cmake -S "$ROOT" -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_COMPILER=clang \
    -DCMAKE_CXX_COMPILER=clang++ \
    -DLLVM_DIR="$(llvm-config --cmakedir)" \
    -DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
    -Wno-dev \
    2>&1 | grep -v "^--"
cmake --build "$BUILD_DIR" --parallel "$(nproc)"
echo "    → $BUILD_DIR/src/ir_analyzer/DeadFeaturePass.so"

# ── 2. Python environment ────────────────────────────────────────────────────
echo ""
echo "[2/3] Setting up Python environment…"
if [[ ! -d "$ROOT/.venv" ]]; then
    python3 -m venv "$ROOT/.venv"
fi
source "$ROOT/.venv/bin/activate"
pip install --quiet -e "$ROOT[dev]"
echo "    → .venv ready"

# ── 3. GUI frontend ─────────────────────────────────────────────────────────
if [[ "$SKIP_FRONTEND" -eq 0 ]]; then
    echo ""
    echo "[3/3] Building GUI frontend…"
    if command -v npm &>/dev/null; then
        (cd "$ROOT/src/gui/frontend" && npm ci --silent && npm run build --silent)
        echo "    → src/gui/static/ ready"
    else
        echo "    SKIP: npm not found (install Node.js 18+ to enable the GUI)"
    fi
else
    echo ""
    echo "[3/3] Skipping frontend (--skip-frontend)"
fi

echo ""
echo "Build complete. Run ./run.sh --help for usage."
