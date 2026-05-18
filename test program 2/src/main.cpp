#include <sys/cdefs.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "types.h"

Stats g_stats = {0, 0, 0.0};

// Forward declarations (only functions actually called from main).
void ingest_batch(LogBatch* batch);
void process_metrics(LogBatch* batch);
int validate_batch_size(const LogBatch* batch, size_t max);

int main(int argc, char** argv) {
    (void)argc; (void)argv;

    LogEntry entries[3];
    entries[0] = {"startup", 1, 1000};
    entries[1] = {"request", 2, 2000};
    entries[2] = {"shutdown", 1, 3000};

    LogBatch batch;
    batch.entries = entries;
    batch.count = 3;

    if (validate_batch_size(&batch, 1000) != 0) return 1;
    ingest_batch(&batch);
    process_metrics(&batch);

    printf("processed=%llu errors=%llu\n",
           (unsigned long long)g_stats.total_processed,
           (unsigned long long)g_stats.total_errors);
    return 0;
}
