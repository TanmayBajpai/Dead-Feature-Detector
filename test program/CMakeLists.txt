cmake_minimum_required(VERSION 3.16)
project(DeadFeatureTestProgram CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

include_directories(include)

set(ALL_SOURCES
    src/main.cpp
    src/server.cpp
    src/auth.cpp
    src/compression.cpp
    src/legacy_protocol.cpp
    src/dead_features.cpp
)

# ── Build targets with distinct feature-flag sets ─────────────────────────
#
# Defines that are NEVER present in any target:
#   FEATURE_LEGACY_PROTOCOL   (deprecated v1 networking — whole file dead)
#   ENABLE_TELEMETRY          (removed from product — dead blocks in server.cpp)
#   EXPERIMENTAL_CODEC        (n/a — guarded by runtime flag, always 0)
#
# The config extractor reads compile_commands.json and records that the above
# defines never appear, which the reporter uses to raise confidence to 1.0
# for the compile-time cases.

add_executable(server_standard ${ALL_SOURCES})
target_compile_definitions(server_standard PRIVATE
    FEATURE_AUTH
    FEATURE_COMPRESSION
    "PRODUCT_NAME=\"server-standard\""
)

add_executable(server_debug ${ALL_SOURCES})
target_compile_definitions(server_debug PRIVATE
    FEATURE_AUTH
    FEATURE_COMPRESSION
    ENABLE_DEBUG_LOGGING
    "PRODUCT_NAME=\"server-debug\""
)

add_executable(server_minimal ${ALL_SOURCES})
target_compile_definitions(server_minimal PRIVATE
    FEATURE_AUTH
    "PRODUCT_NAME=\"server-minimal\""
)

# ── Bitcode generation target ─────────────────────────────────────────────
#
# Produces .bc files for each build configuration so that the Dead Feature
# Detector's IR analyzer can process them.
# Requires Clang: cmake -DCMAKE_CXX_COMPILER=clang++ ..

set(BC_FLAGS -std=c++17 -O1 -gline-tables-only -fno-discard-value-names -emit-llvm -c)

function(add_bitcode_variant variant_name)
    set(variant_dir "${CMAKE_BINARY_DIR}/bitcode/${variant_name}")
    file(MAKE_DIRECTORY "${variant_dir}")
    set(bc_outputs "")
    foreach(src ${ALL_SOURCES})
        get_filename_component(base "${src}" NAME_WE)
        set(bc_out "${variant_dir}/${base}.bc")
        set(abs_src "${CMAKE_SOURCE_DIR}/${src}")
        add_custom_command(
            OUTPUT "${bc_out}"
            COMMAND ${CMAKE_CXX_COMPILER}
                    ${BC_FLAGS}
                    -I${CMAKE_SOURCE_DIR}/include
                    ${ARGN}
                    "${abs_src}" -o "${bc_out}"
            DEPENDS "${abs_src}"
            COMMENT "BC [${variant_name}] ${src}"
        )
        list(APPEND bc_outputs "${bc_out}")
    endforeach()
    add_custom_target("bitcode_${variant_name}" ALL DEPENDS ${bc_outputs})
endfunction()

add_bitcode_variant(standard
    -DFEATURE_AUTH -DFEATURE_COMPRESSION "-DPRODUCT_NAME=\"server-standard\"")
add_bitcode_variant(debug
    -DFEATURE_AUTH -DFEATURE_COMPRESSION -DENABLE_DEBUG_LOGGING "-DPRODUCT_NAME=\"server-debug\"")
add_bitcode_variant(minimal
    -DFEATURE_AUTH "-DPRODUCT_NAME=\"server-minimal\"")
