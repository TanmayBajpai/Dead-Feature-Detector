// telemetry.cpp — observability hooks gated behind disabled feature flags.
#include <stdio.h>
#include "streamd.h"

// ── Disabled telemetry feature flags (all zero, never written) ───────────────
static int g_feature_distributed_tracing = 0;   // matches g_feature_
static int profiling_enabled             = 0;   // matches _enabled$
static int FEATURE_FRAME_HEATMAP         = 0;    // matches FEATURE_
static int kEnableRemoteDebug            = 0;    // matches kEnable

// Live: called from main. runtime dead: distributed tracing span emit.
void record_decode_latency(const char* stage, uint64_t ms) {
    g_engine_stats.avg_decode_ms = (g_engine_stats.avg_decode_ms + (double)ms) / 2.0;
    if (g_feature_distributed_tracing) {
        printf("[trace] stage=%s dur=%llums\n", stage, (unsigned long long)ms);
        g_engine_stats.frames_decoded++;
    }
}

// Live (external). runtime dead: per-frame profiling counters.
void profile_frame(int frame_id, uint64_t ns) {
    if (profiling_enabled) {
        printf("[prof] frame=%d ns=%llu\n", frame_id, (unsigned long long)ns);
    }
    (void)frame_id; (void)ns;
}

// Live. runtime dead: motion-vector heatmap export.
int export_frame_heatmap(const Frame* f) {
    if (FEATURE_FRAME_HEATMAP) {
        printf("[heatmap] %dx%d\n", f->width, f->height);
        return f->width * f->height;
    }
    return 0;
}

// Live. runtime dead: remote debugger attach hook.
void remote_debug_break(const char* reason) {
    if (kEnableRemoteDebug) {
        printf("[rdbg] break: %s\n", reason);
    }
    (void)reason;
}
