#pragma once
#include <sys/cdefs.h>
#include <stddef.h>
#include <stdint.h>

// ---------------------------------------------------------------------------
// Runtime flags — only the flags that are actually live in the shipped product.
// Dead flags were moved to feature_flags.h as constexpr constants so that the
// LLVM IR pass can detect the `br i1 false` dead branches they produce.
// ---------------------------------------------------------------------------
struct RuntimeFlags {
    int use_compression;   // 1 in standard/debug builds, 0 in minimal
};

extern RuntimeFlags g_runtime_flags;

struct Request {
    const char* path;
    const char* body;
    size_t      body_len;
    uint32_t    client_ip;
};

struct Response {
    int         status_code;
    const char* body;
    size_t      body_len;
};
