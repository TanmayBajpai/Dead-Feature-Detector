// main.cpp — live entry point for the streamd demo.
//
// main() reaches only the "live" decode path. Every feature in the legacy,
// experimental, platform and disabled-flag modules is therefore dead under the
// real build configuration — which is exactly what the detector reports.
#include <stdio.h>
#include "streamd.h"

EngineStats g_engine_stats = {0, 0, 0, 0.0};

// Live entry points defined in other translation units.
int  probe_stream(const Stream* s, int max_frames);
void decode_stream(Stream* s);
void apply_color_transform(Frame* f);
void record_decode_latency(const char* stage, uint64_t ms);
void flush_pipeline(void);

int main(int argc, char** argv) {
    (void)argc; (void)argv;

    Frame frames[2] = {};
    frames[0].width = 1920; frames[0].height = 1080; frames[0].size = 4096;
    frames[1].width = 1920; frames[1].height = 1080; frames[1].size = 4096;

    Stream s;
    s.frames = frames;
    s.frame_count = 2;
    s.codec_id = 1;
    s.bitrate_kbps = 4500;

    if (probe_stream(&s, 1000) != 0) return 1;
    decode_stream(&s);
    for (size_t i = 0; i < s.frame_count; ++i)
        apply_color_transform(&s.frames[i]);
    record_decode_latency("decode", 12);
    flush_pipeline();

    printf("decoded=%llu dropped=%llu bytes=%llu\n",
           (unsigned long long)g_engine_stats.frames_decoded,
           (unsigned long long)g_engine_stats.frames_dropped,
           (unsigned long long)g_engine_stats.bytes_processed);
    return 0;
}
