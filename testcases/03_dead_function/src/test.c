/* interprocedural dead: function compiled in but never called from main().
   __attribute__((used)) keeps it in bitcode so the pass can analyse it.
   Expected: 1 interprocedural finding, confidence 0.60. */
#include <stdio.h>

static __attribute__((used)) void legacy_export(const char* key, int val) {
    /* Never called from main or any live function. */
    printf("export %s=%d\n", key, val);
}

int main(void) {
    printf("running\n");
    return 0;
}
