// dead_processors.cpp — more interprocedural dead functions.
//
// A batch of log-processing utilities that were written for an experimental
// analytics pipeline that shipped but was immediately rolled back.  The code
// was never removed from the repo.  BFS from main() cannot reach any of them.
#include <sys/cdefs.h>
#include <stdio.h>
#include <string.h>
#include "types.h"

static __attribute__((used)) double compute_p99(const double* samples, size_t n) {
    if (n == 0) return 0.0;
    size_t idx = (size_t)(n * 0.99);
    if (idx >= n) idx = n - 1;
    return samples[idx];
}

static __attribute__((used)) void aggregate_stats(const LogBatch* batch, Stats* out) {
    for (size_t i = 0; i < batch->count; ++i) {
        out->total_processed++;
        if (batch->entries[i].level >= 3) out->total_errors++;
    }
}

static __attribute__((used)) int filter_by_level(const LogBatch* in, int min_level,
                                                   LogBatch* out) {
    size_t kept = 0;
    for (size_t i = 0; i < in->count; ++i) {
        if (in->entries[i].level >= min_level) {
            out->entries[kept++] = in->entries[i];
        }
    }
    out->count = kept;
    return (int)kept;
}

static __attribute__((used)) void print_batch_summary(const LogBatch* batch) {
    printf("batch count=%zu\n", batch->count);
    for (size_t i = 0; i < batch->count; ++i)
        printf("  [%zu] level=%d msg=%s\n", i, batch->entries[i].level,
               batch->entries[i].message);
}

static __attribute__((used)) int deduplicate_batch(LogBatch* batch) {
    int removed = 0;
    for (size_t i = 0; i < batch->count; ++i) {
        for (size_t j = i + 1; j < batch->count; ++j) {
            if (strcmp(batch->entries[i].message, batch->entries[j].message) == 0) {
                batch->entries[j] = batch->entries[batch->count - 1];
                batch->count--;
                j--;
                removed++;
            }
        }
    }
    return removed;
}
