// Fixture: interprocedural dead code.
// helper_for_dead() is only called from dead_entry(), which is never called
// from any live root. Both should be flagged as interprocedural dead.

#include <stdio.h>

static void helper_for_dead(void) {
    printf("this is never called\n");
}

static void dead_entry(void) {
    helper_for_dead();
}

void live_function(void) {
    printf("alive\n");
}

int main(void) {
    live_function();
    // dead_entry() is never called
    return 0;
}
