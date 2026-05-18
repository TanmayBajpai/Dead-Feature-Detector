/* compile_time dead block: labeled block after return with no goto.
   Expected: 1 compile_time finding, confidence 0.95, in function process(). */
#include <stdio.h>

void process(int x) {
    if (x > 0) { printf("positive\n"); return; }
    printf("zero or negative\n");
    return;
dead_legacy_path:
    /* No predecessor in CFG — compile_time dead. */
    printf("legacy path x=%d\n", x);
}

int main(void) {
    process(1);
    process(-1);
    return 0;
}
