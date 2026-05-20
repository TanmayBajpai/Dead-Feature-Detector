// experimental_backends.cpp — interprocedural dead functions.
//
// Hardware-encode backends that were prototyped but never wired into the live
// pipeline (the demo build is software-only). BFS from main reaches none of
// them. Several form transitive chains (an "encode" calls "init" + "upload").
#include <stdio.h>
#include "streamd.h"

// ── CUDA / NVENC prototype ───────────────────────────────────────────────────
static __attribute__((used)) int cuda_init(int device) {
    printf("cuda init device=%d\n", device);
    return device;
}

static __attribute__((used)) int cuda_upload_frame(const Frame* f) {
    printf("cuda upload %dx%d\n", f->width, f->height);
    return (int)f->size;
}

// Transitive: calls cuda_init + cuda_upload_frame (both dead).
static __attribute__((used)) int cuda_encode_frame(const Frame* f, int crf) {
    cuda_init(0);
    cuda_upload_frame(f);
    printf("nvenc encode %dx%d crf=%d\n", f->width, f->height, crf);
    return 0;
}

// ── VAAPI prototype ──────────────────────────────────────────────────────────
static __attribute__((used)) int vaapi_init(const char* dri_node) {
    printf("vaapi init %s\n", dri_node);
    return dri_node ? 0 : -1;
}

// Transitive: calls vaapi_init (dead).
static __attribute__((used)) int vaapi_encode_frame(const Frame* f) {
    vaapi_init("/dev/dri/renderD128");
    printf("vaapi encode %dx%d\n", f->width, f->height);
    return (int)f->size;
}

// ── Intel QuickSync prototype ────────────────────────────────────────────────
static __attribute__((used)) int qsv_encode_frame(const Frame* f, int target_kbps) {
    printf("qsv encode %dx%d @ %dkbps\n", f->width, f->height, target_kbps);
    return target_kbps;
}
