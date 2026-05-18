// metrics.cpp — demonstrates runtime dead basic blocks.
//
// A runtime dead block is one guarded by a feature-flag global that is
// constant-zero.  After globalopt folds the load and constprop folds the
// comparison, the branch becomes `br i1 false`, making one successor dead.
//
// Requirements for this to work:
//   1. Global must have INTERNAL linkage (static) so globalopt can see all uses.
//   2. Global must be initialised to 0 and never stored after init.
//   3. The global name must match isFeatureFlag() regex in DeadFeaturePass.cpp:
//      g_feature_|_enabled$|_flag$|kEnable|FEATURE_|_ENABLED|FLAGS_
//   4. Pipeline must run: globalopt,constprop,dead-feature
#include <sys/cdefs.h>
#include <stdio.h>
#include "types.h"

// ── Feature-flag globals ──────────────────────────────────────────────────
// All zero — these features are disabled and never written.

static int g_feature_distributed_tracing = 0;   // matches g_feature_
static int g_feature_histogram_export    = 0;   // matches g_feature_
static int sampling_enabled              = 0;   // matches _enabled$

// ── Alive: called from main ───────────────────────────────────────────────

void process_metrics(LogBatch* batch) {
    for (size_t i = 0; i < batch->count; ++i) {
        // This branch is alive — we intentionally use a live path here.
        if (batch->entries[i].level > 0) {
            g_stats.avg_latency_ms += 1.0;
        }
    }
}

// ── Functions containing runtime dead blocks ──────────────────────────────

// Dead block: inside if (g_feature_distributed_tracing) — always false.
void emit_trace_span(const char* op, uint64_t duration_ms) {
    if (g_feature_distributed_tracing) {
        // runtime dead — globalopt folds g_feature_distributed_tracing to 0.
        printf("[TRACE] op=%s dur=%llums\n", op, (unsigned long long)duration_ms);
        g_stats.total_processed++;
    }
    // alive path
    (void)op; (void)duration_ms;
}

// Dead block: inside if (g_feature_histogram_export).
void export_histogram(const char* metric, double value) {
    if (g_feature_histogram_export) {
        // runtime dead.
        printf("[HIST] %s=%.3f\n", metric, value);
    }
    // alive path
    (void)metric; (void)value;
}

// Dead block: inside if (sampling_enabled).
int should_sample_request(uint64_t request_id) {
    if (sampling_enabled) {
        // runtime dead.
        return (int)(request_id % 100) < 10;
    }
    return 1;
}
