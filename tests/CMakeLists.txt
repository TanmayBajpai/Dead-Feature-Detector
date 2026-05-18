find_program(OPT_BINARY opt)
find_program(CLANG_BINARY clang)

if(NOT OPT_BINARY)
    message(WARNING "opt not found; IR analyzer tests disabled")
    return()
endif()

set(FIXTURE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/fixtures)
set(PASS_LIB $<TARGET_FILE:DeadFeaturePass>)

# Helper macro: run pass on a .ll fixture, assert output contains expected kind.
# SOURCE is a path relative to FIXTURE_DIR; can be .c or .ll.
macro(add_ir_test name source expect_kind)
    add_test(NAME ir_${name}
        COMMAND ${CMAKE_COMMAND}
            -DCLANG=${CLANG_BINARY}
            -DOPT=${OPT_BINARY}
            -DSOURCE=${FIXTURE_DIR}/${source}
            -DPASS_LIB=${PASS_LIB}
            -DEXPECT_KIND=${expect_kind}
            -DWORK_DIR=${CMAKE_CURRENT_BINARY_DIR}/${name}
            -P ${CMAKE_CURRENT_SOURCE_DIR}/run_ir_test.cmake
    )
    set_tests_properties(ir_${name} PROPERTIES
        DEPENDS DeadFeaturePass
    )
endmacro()

# .ll fixtures are used directly; .c fixtures go through clang.
add_ir_test(always_dead      always_dead.ll      compile_time)
add_ir_test(runtime_dead     runtime_dead.ll     runtime)
add_ir_test(alive            alive.c             NONE)
add_ir_test(transitive_dead  transitive_dead.ll  interprocedural)
