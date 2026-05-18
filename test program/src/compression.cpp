#include "dfd_types.h"
#include "feature_flags.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

#ifdef FEATURE_COMPRESSION

// ── Dead helpers (experimental codec) ────────────────────────────────────
//
// These three functions are only called from the `if (EXPERIMENTAL_CODEC)`
// branch below.  Because EXPERIMENTAL_CODEC == 0, Clang emits:
//
//   br i1 false, label %codec.block, label %alive.block
//
// The dead-feature LLVM pass detects the `br i1 false` and records the
// codec helpers as compile-time dead (confidence 1.0).

static void* experimental_codec_alloc_ctx(size_t buf_size) {
    return malloc(buf_size * 2);
}

static void experimental_codec_free_ctx(void* ctx) {
    free(ctx);
}

static size_t experimental_codec_compress(const char* src, size_t src_len,
                                          char* dst, void* ctx) {
    (void)ctx;
    memcpy(dst, src, src_len);
    return src_len;
}

// ── Live helpers ──────────────────────────────────────────────────────────

static size_t lz4_compress_stub(const char* src, size_t src_len, char* dst) {
    memcpy(dst, src, src_len);
    return src_len;
}

// ── Public API ────────────────────────────────────────────────────────────

size_t compress_data(const char* src, size_t src_len, char* dst, size_t dst_cap) {
    if (!src || src_len == 0 || src_len > dst_cap) return 0;

    // EXPERIMENTAL_CODEC == 0 → Clang emits `br i1 false`.
    // The dead-feature pass flags this entire block as dead.
    if (EXPERIMENTAL_CODEC) {
        void* ctx = experimental_codec_alloc_ctx(src_len);   // dead
        size_t n  = experimental_codec_compress(src, src_len, dst, ctx);  // dead
        experimental_codec_free_ctx(ctx);                    // dead
        return n;
    }

    if (g_runtime_flags.use_compression) {
        return lz4_compress_stub(src, src_len, dst);
    }
    memcpy(dst, src, src_len);
    return src_len;
}

#endif  // FEATURE_COMPRESSION
