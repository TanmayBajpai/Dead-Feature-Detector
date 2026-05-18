#!/usr/bin/env bash
# Build the test program and generate .bc files for Dead Feature Detector.
# Requires: clang++, llvm-link (LLVM), cmake
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
BC_DIR="$BUILD_DIR/bitcode"

# ── Step 1: CMake configure (generates compile_commands.json) ──────────────
echo "=== Configuring with CMake ==="
cmake -B "$BUILD_DIR" \
    -DCMAKE_CXX_COMPILER=clang++ \
    -DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
    -DCMAKE_BUILD_TYPE=Release \
    "$SCRIPT_DIR"

# ── Step 2: Build executables ──────────────────────────────────────────────
echo ""
echo "=== Building executables ==="
cmake --build "$BUILD_DIR" --parallel

# ── Step 3: Compile per-TU bitcode (O0 to preserve dead BB structure) ─────
echo ""
echo "=== Compiling per-TU bitcode ==="

SRCS=(
    src/main.cpp
    src/server.cpp
    src/auth.cpp
    src/compression.cpp
    src/legacy_protocol.cpp
    src/dead_features.cpp
)

# Flags: O0 keeps dead basic blocks; gline-tables-only for source mapping.
COMMON="-std=c++17 -O0 -gline-tables-only -fno-discard-value-names -emit-llvm -c -I$SCRIPT_DIR/include"

declare -A VARIANTS
VARIANTS[standard]="-DFEATURE_AUTH -DFEATURE_COMPRESSION -DPRODUCT_NAME='\"server-standard\"'"
VARIANTS[debug]="-DFEATURE_AUTH -DFEATURE_COMPRESSION -DENABLE_DEBUG_LOGGING -DPRODUCT_NAME='\"server-debug\"'"
VARIANTS[minimal]="-DFEATURE_AUTH -DPRODUCT_NAME='\"server-minimal\"'"

for variant in standard debug minimal; do
    variant_dir="$BC_DIR/$variant"
    mkdir -p "$variant_dir"
    defines="${VARIANTS[$variant]}"
    echo "  variant: $variant"
    bc_files=()
    for src in "${SRCS[@]}"; do
        base=$(basename "$src" .cpp)
        out="$variant_dir/${base}.bc"
        eval clang++ $COMMON $defines "$SCRIPT_DIR/$src" -o "$out"
        bc_files+=("$out")
        echo "    $base.bc"
    done

    # ── Step 4: Merge into whole-program bitcode ───────────────────────────
    # llvm-link merges per-TU .bc into one module so the IR pass can do
    # whole-program interprocedural analysis (BFS from main across all TUs).
    merged="$variant_dir/program.bc"
    llvm-link "${bc_files[@]}" -o "$merged"
    echo "    → merged: bitcode/$variant/program.bc"
done

echo ""
echo "Build complete."
echo ""
echo "Files for Dead Feature Detector GUI:"
echo "  Build dir  : $BUILD_DIR"
echo "  Source root: $SCRIPT_DIR"
echo "  Bitcode     : $BC_DIR/{standard,debug,minimal}/program.bc"
echo ""
echo "Run the GUI:"
echo "  cd <dead-feature-detector root>"
echo "  PYTHONPATH=src python3 -m gui.backend"
echo ""
echo "In the browser → Build dir: $BUILD_DIR, Source root: $SCRIPT_DIR"
