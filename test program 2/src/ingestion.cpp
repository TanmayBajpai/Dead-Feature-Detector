// ingestion.cpp — demonstrates compile_time dead basic blocks.
//
// A compile_time dead block has no CFG predecessors (pred_empty == true).
// Pattern: labeled block after an unconditional return with NO goto to it.
// The block MUST be inside a live function (reachable from main) so that
// globalopt does not delete the entire function before the IR pass runs.
#include <sys/cdefs.h>
#include <stdio.h>
#include "types.h"

// ── Helper called from ingest_batch (and thus reachable from main) ────────
//
// Dead block 1: "legacy_xml_path" — XML ingestion removed in v4.
// This block is inside a live function; it simply has no predecessors.
static int classify_entry(const LogEntry* e) {
    if (e->level >= 3) return 1;
    if (e->level >= 1) return 0;
    return -1;
legacy_xml_path:
    // compile_time dead — no branch targets this label.
    printf("xml fallback level=%d\n", e->level);
    return -2;
}

// ── Primary ingestion function — called from main ─────────────────────────
//
// Dead block 2: "proto2_path" — protobuf v2 ingestion removed in v5.
void ingest_batch(LogBatch* batch) {
    for (size_t i = 0; i < batch->count; ++i) {
        int cls = classify_entry(&batch->entries[i]);
        g_stats.total_processed++;
        if (cls > 0)
            g_stats.total_errors++;
    }
    return;
proto2_path:
    // compile_time dead — no branch targets this label.
    printf("proto2 batch count=%zu\n", batch->count);
    batch->count = 0;
}

// ── Another live helper with a dead block ─────────────────────────────────
//
// Dead block 3: "csv_fallback" — CSV fallback removed when JSON became default.
// validate_entry is called by ingest_batch indirectly via classify_entry's
// control flow, but adding it as a separate function to show the pattern.
int validate_batch_size(const LogBatch* batch, size_t max) {
    if (batch->count <= max) return 0;
    return -1;
csv_fallback:
    // compile_time dead.
    printf("csv fallback count=%zu max=%zu\n", batch->count, max);
    return -2;
}
