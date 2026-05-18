#!/usr/bin/env bash
# Clone and build LLVM with Clang in LTO mode to produce whole-program bitcode.
# Output: llvm-build/ in the current directory.
set -euo pipefail

LLVM_SRC="${1:-llvm-project}"
BUILD_DIR="llvm-build"
JOBS="$(nproc)"

if [[ ! -d "$LLVM_SRC" ]]; then
    echo "Cloning llvm-project (shallow)..."
    git clone --depth=1 https://github.com/llvm/llvm-project.git "$LLVM_SRC"
fi

cmake -S "$LLVM_SRC/llvm" -B "$BUILD_DIR" \
    -G Ninja \
    -DCMAKE_C_COMPILER=clang \
    -DCMAKE_CXX_COMPILER=clang++ \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_FLAGS="-flto=full -g" \
    -DCMAKE_CXX_FLAGS="-flto=full -g" \
    -DCMAKE_EXE_LINKER_FLAGS="-flto=full" \
    -DCMAKE_SHARED_LINKER_FLAGS="-flto=full" \
    -DLLVM_TARGETS_TO_BUILD="X86" \
    -DLLVM_ENABLE_PROJECTS="clang" \
    -DLLVM_BUILD_LLVM_DYLIB=OFF \
    -DLLVM_ENABLE_ASSERTIONS=OFF \
    -DLLVM_INCLUDE_TESTS=OFF \
    -DLLVM_INCLUDE_EXAMPLES=OFF \
    -DCMAKE_EXPORT_COMPILE_COMMANDS=ON

cmake --build "$BUILD_DIR" --parallel "$JOBS"
echo "LLVM build complete: $BUILD_DIR"
