// storage.cpp — alive code only; provides contrast against the dead modules.
#include <sys/cdefs.h>
#include <stdio.h>
#include <string.h>
#include "types.h"

static LogEntry s_ring[64];
static size_t   s_head = 0;
static size_t   s_count = 0;

void storage_write(const LogEntry* entry) {
    s_ring[s_head % 64] = *entry;
    s_head++;
    if (s_count < 64) s_count++;
}

int storage_read(size_t idx, LogEntry* out) {
    if (idx >= s_count) return -1;
    *out = s_ring[idx % 64];
    return 0;
}

size_t storage_count(void) {
    return s_count;
}

void storage_flush(void) {
    s_head  = 0;
    s_count = 0;
    memset(s_ring, 0, sizeof(s_ring));
    printf("storage flushed\n");
}
