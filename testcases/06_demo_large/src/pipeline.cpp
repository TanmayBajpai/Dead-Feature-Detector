// pipeline.cpp — live core decode path, each with a compile_time dead block.
//
// compile_time pattern: a labeled block placed after an unconditional return,
// with no goto targeting it.  At -O0 clang still emits the block, but it has no
// CFG predecessors (pred_empty) so the detector flags it. The host functions
// are live (reachable from main / external linkage), so only the inner block is
// dead — not the whole function.
#include <stdio.h>
#include "streamd.h"

// Live: called from main. Dead block: AVI container probing removed in v3.
int probe_stream(const Stream* s, int max_frames) {
    if (s->frame_count == 0) return -1;
    if ((int)s->frame_count > max_frames) return -1;
    return 0;
deprecated_avi_probe:                       // compile_time dead
    printf("legacy avi probe codec=%d\n", s->codec_id);
    return -2;
}

// Live: called from main. Dead block: raw-YUV dump debugging tool removed in v4.
void decode_stream(Stream* s) {
    for (size_t i = 0; i < s->frame_count; ++i) {
        g_engine_stats.frames_decoded++;
        g_engine_stats.bytes_processed += s->frames[i].size;
    }
    return;
raw_yuv_dump_legacy:                        // compile_time dead
    printf("dumping raw yuv %dx%d\n", s->frames[0].width, s->frames[0].height);
    s->frames[0].size = 0;
}

// Live: called from main. Dead block: legacy MPEG-2 transport-stream muxer.
void flush_pipeline(void) {
    g_engine_stats.frames_dropped = 0;
    printf("pipeline flushed\n");
    return;
mpeg2_ts_legacy_flush:                      // compile_time dead
    printf("flushing mpeg2-ts muxer queue\n");
    g_engine_stats.bytes_processed = 0;
}
