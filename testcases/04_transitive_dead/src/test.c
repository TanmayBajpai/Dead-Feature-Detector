/* transitive interprocedural dead: a chain of functions none of which are
   reachable from main().  BFS from main stops at live_work(); it never
   reaches any of the v2_* functions, even though they call each other.
   Expected: 3 interprocedural findings, confidence 0.60 each. */
#include <stdio.h>

/* ── Dead chain ────────────────────────────────────────────────────── */
static __attribute__((used)) void v2_flush(void) {
    printf("v2 flush\n");
}

static __attribute__((used)) void v2_commit(int id) {
    v2_flush();
    printf("v2 commit id=%d\n", id);
}

static __attribute__((used)) int v2_prepare(const char* op) {
    v2_commit(0);
    printf("v2 prepare op=%s\n", op);
    return 0;
}

/* ── Live code ────────────────────────────────────────────────────── */
static void live_work(void) {
    printf("live\n");
}

int main(void) {
    live_work();
    return 0;
}
