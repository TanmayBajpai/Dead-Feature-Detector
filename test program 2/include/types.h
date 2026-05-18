#pragma once
#include <sys/cdefs.h>
#include <stddef.h>
#include <stdint.h>

struct LogEntry {
    const char* message;
    int level;
    uint64_t timestamp_ms;
};

struct LogBatch {
    LogEntry* entries;
    size_t count;
};

struct Stats {
    uint64_t total_processed;
    uint64_t total_errors;
    double avg_latency_ms;
};

extern Stats g_stats;
