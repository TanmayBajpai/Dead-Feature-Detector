cmake_minimum_required(VERSION 3.16)
project(DeadFeatureTest2 CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(SOURCES
    src/main.cpp
    src/ingestion.cpp
    src/metrics.cpp
    src/storage.cpp
    src/legacy_sink.cpp
    src/dead_processors.cpp
)

include_directories(include)

# ── Standard build ────────────────────────────────────────────────────────
add_executable(test2_standard ${SOURCES})
target_compile_definitions(test2_standard PRIVATE
    PRODUCT_NAME="test2-standard"
    FEATURE_STORAGE
    FEATURE_METRICS
)

# ── Debug build ───────────────────────────────────────────────────────────
add_executable(test2_debug ${SOURCES})
target_compile_definitions(test2_debug PRIVATE
    PRODUCT_NAME="test2-debug"
    FEATURE_STORAGE
    FEATURE_METRICS
    ENABLE_DEBUG_LOGGING
)

# ── Minimal build ─────────────────────────────────────────────────────────
add_executable(test2_minimal ${SOURCES})
target_compile_definitions(test2_minimal PRIVATE
    PRODUCT_NAME="test2-minimal"
    FEATURE_STORAGE
)
