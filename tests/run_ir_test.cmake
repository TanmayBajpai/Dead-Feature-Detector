# Called by ctest for each IR fixture test.
# Variables: CLANG, OPT, SOURCE, PASS_LIB, EXPECT_KIND, WORK_DIR

file(MAKE_DIRECTORY "${WORK_DIR}")

get_filename_component(EXT "${SOURCE}" LAST_EXT)
set(BC "${WORK_DIR}/test.bc")
set(OUT "${WORK_DIR}/ir_findings.json")

if("${EXT}" STREQUAL ".ll")
    # Assemble .ll → .bc
    execute_process(
        COMMAND "${OPT}" -o "${BC}" "${SOURCE}"
        RESULT_VARIABLE rc
        ERROR_VARIABLE err
    )
    if(rc)
        message(FATAL_ERROR "opt (assemble) failed on ${SOURCE}:\n${err}")
    endif()
elseif(CLANG)
    # Compile .c → .bc
    execute_process(
        COMMAND "${CLANG}" -O0 -g -emit-llvm -c "${SOURCE}" -o "${BC}"
        RESULT_VARIABLE rc
        ERROR_VARIABLE err
    )
    if(rc)
        message(FATAL_ERROR "clang failed on ${SOURCE}:\n${err}")
    endif()
else()
    message(FATAL_ERROR "Cannot handle source type '${EXT}' (clang not found)")
endif()

execute_process(
    COMMAND "${OPT}" -load-pass-plugin "${PASS_LIB}"
            -passes=dead-feature
            --dead-feature-output "${OUT}"
            "${BC}" -o /dev/null
    RESULT_VARIABLE rc
    ERROR_VARIABLE err
)
if(rc)
    message(FATAL_ERROR "opt (pass) failed on ${SOURCE}:\n${err}")
endif()

file(READ "${OUT}" content)

if("${EXPECT_KIND}" STREQUAL "NONE")
    string(FIND "${content}" "\"kind\"" pos)
    if(NOT pos EQUAL -1)
        message(FATAL_ERROR "alive fixture produced findings:\n${content}")
    endif()
else()
    string(FIND "${content}" "\"${EXPECT_KIND}\"" pos)
    if(pos EQUAL -1)
        message(FATAL_ERROR
            "Expected kind '${EXPECT_KIND}' not found in:\n${content}")
    endif()
endif()
