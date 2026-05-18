#!/usr/bin/env bash
# Build test program 2 and generate .bc files for Dead Feature Detector.
# Produces all three kinds of dead features:
#   compile_time    — labeled blocks after return with no goto (ingestion.cpp)
#   runtime         — feature-flag globals folded to zero (metrics.cpp)
#   interprocedural — __attribute__((used)) orphan functions (legacy_sink.cpp, dead_processors.cpp)
#
# Requires: clang++, llvm-link, cmake
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
BC_DIR="$BUILD_DIR/bitcode"

# ── Step 1: CMake configure ────────────────────────────────────────────────
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

# ── Step 3: Compile per-TU bitcode ────────────────────────────────────────
echo ""
echo "=== Compiling per-TU bitcode ==="

SRCS=(
    src/main.cpp
    src/ingestion.cpp
    src/metrics.cpp
    src/storage.cpp
    src/legacy_sink.cpp
    src/dead_processors.cpp
)

# -O0: keeps dead basic blocks in IR.
# -gline-tables-only: minimal DWARF for source mapping.
# -fno-discard-value-names: preserves BB names for readable output.
# -O0: preserves dead basic block structure (compile_time findings).
# -gline-tables-only: minimal DWARF for source-location mapping.
# -fno-discard-value-names: preserves basic-block names in IR output.
# No -disable-O0-optnone needed: the DeadFeaturePass directly inspects global
# variable initializers to detect constant-zero feature flags (runtime findings)
# without requiring globalopt or instcombine to run first.
COMMON_FLAGS=(-std=c++17 -O0 -gline-tables-only -fno-discard-value-names -emit-llvm -c "-I${SCRIPT_DIR}/include")

declare -A VARIANTS
VARIANTS[standard]="-DPRODUCT_NAME=\"test2-standard\" -DFEATURE_STORAGE -DFEATURE_METRICS"
VARIANTS[debug]="-DPRODUCT_NAME=\"test2-debug\" -DFEATURE_STORAGE -DFEATURE_METRICS -DENABLE_DEBUG_LOGGING"
VARIANTS[minimal]="-DPRODUCT_NAME=\"test2-minimal\" -DFEATURE_STORAGE"

for variant in standard debug minimal; do
    variant_dir="$BC_DIR/$variant"
    mkdir -p "$variant_dir"
    defines="${VARIANTS[$variant]}"
    echo "  variant: $variant"
    bc_files=()
    for src in "${SRCS[@]}"; do
        base=$(basename "$src" .cpp)
        out="$variant_dir/${base}.bc"
        # shellcheck disable=SC2086
        clang++ "${COMMON_FLAGS[@]}" $defines "${SCRIPT_DIR}/${src}" -o "${out}"
        bc_files+=("$out")
        echo "    $base.bc"
    done

    # ── Merge into whole-program bitcode ───────────────────────────────────
    # llvm-link enables cross-TU interprocedural analysis.
    merged="$variant_dir/program.bc"
    llvm-link "${bc_files[@]}" -o "$merged"
    echo "    → merged: bitcode/$variant/program.bc"
done

echo ""
echo "Build complete."
echo ""
echo "Expected findings (dead-feature pass only — no prior opt passes needed):"
echo "  compile_time    3   (labeled dead blocks in ingestion.cpp)"
echo "  runtime         3   (constant-zero feature-flag branches in metrics.cpp)"
echo "  interprocedural 10  (orphan functions in legacy_sink.cpp + dead_processors.cpp)"
echo ""
echo "Files for Dead Feature Detector GUI:"
echo "  Build dir  : $BUILD_DIR"
echo "  Source root: $SCRIPT_DIR"
echo "  Bitcode    : $BC_DIR/{standard,debug,minimal}/program.bc"
echo ""
echo "Run the GUI:"
echo "  cd <dead-feature-detector root>"
echo "  PYTHONPATH=src python3 -m gui.backend"
echo ""
echo "In the browser → Build dir: $BUILD_DIR, Source root: $SCRIPT_DIR"
