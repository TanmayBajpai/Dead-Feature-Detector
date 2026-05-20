// codecs.cpp — runtime-flag dead blocks + compile_time dead blocks.
//
// runtime pattern: `if (g_feature_x)` where g_feature_x is an internal,
// zero-initialised global that is never stored.  The detector proves the global
// is constant-zero (isConstantZeroGlobal) without needing any prior opt pass, so
// the guarded block is unreachable at runtime.
//
// Flag names match isFeatureFlag(): g_feature_ | _enabled$ | FLAGS_ | FEATURE_.
#include <stdio.h>
#include "streamd.h"

// ── Disabled-by-default codec feature flags (all zero, never written) ────────
static int g_feature_av1_encode   = 0;   // matches g_feature_
static int g_feature_hevc_10bit   = 0;   // matches g_feature_
static int hdr_tonemap_enabled    = 0;   // matches _enabled$
static int FLAGS_dolby_vision     = 0;   // matches FLAGS_

// Live (external). runtime dead: AV1 encode path is flag-gated off.
int encode_av1(Frame* f, int crf) {
    if (g_feature_av1_encode) {
        printf("av1 encode %dx%d crf=%d\n", f->width, f->height, crf);
        return f->width * f->height;
    }
    return -1;
}

// Live. runtime dead: 10-bit HEVC encode path is flag-gated off.
int encode_hevc_10bit(Frame* f) {
    if (g_feature_hevc_10bit) {
        printf("hevc 10-bit encode %dx%d\n", f->width, f->height);
        g_engine_stats.bytes_processed += f->size;
        return 0;
    }
    return -1;
}

// Live. runtime dead: HDR tone-mapping path is flag-gated off.
void tonemap_hdr(Frame* f, double nits) {
    if (hdr_tonemap_enabled) {
        printf("tonemap hdr %dx%d peak=%.0fnits\n", f->width, f->height, nits);
        f->pts += 1;
    }
    (void)f; (void)nits;
}

// Live. runtime dead: Dolby Vision muxing path is flag-gated off.
int mux_dolby_vision(Stream* s) {
    if (FLAGS_dolby_vision) {
        printf("mux dolby vision rpu codec=%d\n", s->codec_id);
        return 0;
    }
    return -1;
}

// ── compile_time dead blocks in live codec helpers ───────────────────────────

// Live. Dead block: VP8 selection removed when VP9 became the floor.
int select_decoder(int codec_id) {
    if (codec_id == 1) return 0;
    if (codec_id == 2) return 1;
    return -1;
vp8_legacy_select:                          // compile_time dead
    printf("selecting vp8 software decoder\n");
    return 99;
}

// Live. Dead block: Theora fallback removed.
int open_codec(int codec_id) {
    if (codec_id < 0) return -1;
    return codec_id;
theora_fallback_open:                       // compile_time dead
    printf("opening theora fallback decoder\n");
    return 100;
}

// Live. Dead block: WMV compatibility shim removed.
void close_codec(int handle) {
    printf("closing codec handle=%d\n", handle);
    return;
wmv_compat_close:                           // compile_time dead
    printf("closing wmv compatibility shim handle=%d\n", handle);
}
