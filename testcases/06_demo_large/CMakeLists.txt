cmake_minimum_required(VERSION 3.16)
project(StreamdDemo CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(SOURCES
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

include_directories(include)

# ── POSIX release build ─────────────────────────────────────────────────────
add_executable(streamd_posix ${SOURCES})
target_compile_definitions(streamd_posix PRIVATE
    PRODUCT_NAME="streamd-posix"
    TARGET_POSIX
    FEATURE_HW_DECODE
    FEATURE_SUBTITLES
    ENABLE_HDR
)

# ── POSIX debug build ───────────────────────────────────────────────────────
add_executable(streamd_debug ${SOURCES})
target_compile_definitions(streamd_debug PRIVATE
    PRODUCT_NAME="streamd-debug"
    TARGET_POSIX
    FEATURE_HW_DECODE
    FEATURE_SUBTITLES
    ENABLE_HDR
    ENABLE_VERBOSE_LOGGING
    ENABLE_ASSERTIONS
)

# ── Embedded build ──────────────────────────────────────────────────────────
add_executable(streamd_embedded ${SOURCES})
target_compile_definitions(streamd_embedded PRIVATE
    PRODUCT_NAME="streamd-embedded"
    TARGET_POSIX
    FEATURE_LOW_LATENCY
)
