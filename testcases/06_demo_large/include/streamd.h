// streamd.h — shared types for the streamd media-server demo.
#pragma once
#include <stddef.h>
#include <stdint.h>

struct Frame {
    uint8_t* data;
    size_t   size;
    int      width;
    int      height;
    int64_t  pts;
};

struct Stream {
    Frame* frames;
    size_t frame_count;
    int    codec_id;
    int    bitrate_kbps;
};

struct EngineStats {
    uint64_t frames_decoded;
    uint64_t frames_dropped;
    uint64_t bytes_processed;
    double   avg_decode_ms;
};

extern EngineStats g_engine_stats;
