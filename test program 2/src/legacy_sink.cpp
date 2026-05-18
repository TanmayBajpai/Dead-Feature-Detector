// legacy_sink.cpp — interprocedural dead functions.
//
// These functions were part of a v1 log-sink interface that was replaced by
// the ring-buffer storage module.  They are compiled in but never called from
// main() or from any live function, so the interprocedural BFS never reaches
// them.  __attribute__((used)) prevents the compiler from silently discarding
// them before the IR pass gets a chance to analyse them.
#include <sys/cdefs.h>
#include <stdio.h>
#include <string.h>
#include "types.h"

static __attribute__((used)) int v1_sink_connect(const char* host, int port) {
    (void)host;
    printf("v1 sink connect %s:%d\n", host, port);
    return port > 0 ? 0 : -1;
}

static __attribute__((used)) void v1_sink_send(int fd, const LogEntry* entry) {
    (void)fd;
    printf("v1 sink send fd=%d msg=%s\n", fd, entry->message);
}

static __attribute__((used)) void v1_sink_flush(int fd) {
    (void)fd;
    printf("v1 sink flush fd=%d\n", fd);
}

static __attribute__((used)) void v1_sink_disconnect(int fd) {
    v1_sink_flush(fd);
    printf("v1 sink disconnect fd=%d\n", fd);
}

static __attribute__((used)) int v1_sink_drain_batch(int fd, LogBatch* batch) {
    for (size_t i = 0; i < batch->count; ++i)
        v1_sink_send(fd, &batch->entries[i]);
    v1_sink_flush(fd);
    return (int)batch->count;
}
