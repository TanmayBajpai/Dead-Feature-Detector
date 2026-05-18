/* negative test: all code is reachable, no dead blocks, no disabled flags.
   Expected: 0 findings. */
#include <stdio.h>

static void helper(int x) {
    printf("helper x=%d\n", x);
}

int main(void) {
    helper(1);
    helper(2);
    return 0;
}
