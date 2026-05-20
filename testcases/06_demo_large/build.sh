#!/usr/bin/env bash
# Build the streamd demo and emit whole-program bitcode for the detector.
#
# Produces a large number of dead features of all three kinds:
#   compile_time    12  (labeled fallback blocks after return — pipeline/codecs/transforms/platform)
#   runtime         12  (constant-zero feature-flag branches — codecs/transforms/telemetry)
#   interprocedural 18  (orphan static functions — legacy_rtmp/experimental_backends/deprecated_api)
#
# Requires: clang++, llvm-link, cmake
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
BC_DIR="$BUILD_DIR/bitcode"

echo "=== Configuring with CMake ==="
cmake -B "$BUILD_DIR" \
    -DCMAKE_CXX_COMPILER=clang++ \
    -DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
    -DCMAKE_BUILD_TYPE=Release \
    "$SCRIPT_DIR"

echo ""
echo "=== Building executables ==="
cmake --build "$BUILD_DIR" --parallel

echo ""
echo "=== Compiling per-TU bitcode ==="
SRCS=(
    src/main.cpp
    src/pipeline.cpp
    src/codecs.cpp
    src/transforms.cpp
    src/telemetry.cpp
    src/legacy_rtmp.cpp
    src/experimental_backends.cpp
    src/deprecated_api.cpp
    src/platform.cpp
)

# -O0 keeps dead basic blocks; -gline-tables-only gives source mapping;
# -fno-discard-value-names preserves BB names. No prior opt passes needed —
# the detector inspects global initializers directly for runtime flags.
COMMON_FLAGS=(-std=c++17 -O0 -gline-tables-only -fno-discard-value-names -emit-llvm -c "-I${SCRIPT_DIR}/include")

declare -A VARIANTS
VARIANTS[posix]="-DPRODUCT_NAME=\"streamd-posix\" -DTARGET_POSIX -DFEATURE_HW_DECODE -DFEATURE_SUBTITLES -DENABLE_HDR"
VARIANTS[debug]="-DPRODUCT_NAME=\"streamd-debug\" -DTARGET_POSIX -DFEATURE_HW_DECODE -DFEATURE_SUBTITLES -DENABLE_HDR -DENABLE_VERBOSE_LOGGING -DENABLE_ASSERTIONS"
VARIANTS[embedded]="-DPRODUCT_NAME=\"streamd-embedded\" -DTARGET_POSIX -DFEATURE_LOW_LATENCY"

for variant in posix debug embedded; do
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
    done
    merged="$variant_dir/program.bc"
    llvm-link "${bc_files[@]}" -o "$merged"
    echo "    → merged: bitcode/$variant/program.bc"
done

echo ""
echo "Build complete. Bitcode in $BC_DIR/{posix,debug,embedded}/program.bc"
echo "Run end-to-end:  ./run.sh --testcase 06 --gui"
