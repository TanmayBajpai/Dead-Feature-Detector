#include "dfd_types.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

// ---------------------------------------------------------------------------
// Residual feature implementations — compiled in but never called from main().
//
// All functions carry __attribute__((used)) so the compiler emits them into
// the bitcode.  The IR pass BFS from main() cannot reach any of them.
//
// Represents two removed features:
//   legacy_metrics_*  — telemetry removed by product team (replaced by no-op)
//   v1_session_*      — v1 session layer superseded by direct HTTP/2
// ---------------------------------------------------------------------------

// ── Dead telemetry functions ───────────────────────────────────────────────

static __attribute__((used)) void legacy_metrics_record(const char* key, int value) {
    printf("[METRICS] %s=%d\n", key, value);
}

static __attribute__((used)) void legacy_metrics_flush(void) {
    legacy_metrics_record("flush", 1);
    legacy_metrics_record("total_requests", 0);
}

// ── Dead session-layer functions ───────────────────────────────────────────

static __attribute__((used)) int v1_session_negotiate(int fd) {
    (void)fd;
    return 0;
}

static __attribute__((used)) int v1_session_open(uint32_t ip) {
    (void)ip;
    return v1_session_negotiate(42);
}

static __attribute__((used)) void v1_session_close(int fd) {
    (void)fd;
}

// ── Dead diagnostic helper ─────────────────────────────────────────────────

static __attribute__((used)) void dump_request_debug(const Request* req) {
    printf("path=%s body_len=%zu ip=%08x\n",
           req->path, req->body_len, req->client_ip);
}
