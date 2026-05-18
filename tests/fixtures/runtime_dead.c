// Fixture: a runtime feature flag that is always 0.
// The pass should detect that the branch guarded by g_feature_x is never taken.

#include <stdio.h>

// Feature flag — always disabled in this configuration.
int g_feature_x = 0;

void run(void) {
    if (g_feature_x) {
        // This block is runtime-dead: g_feature_x == 0 always.
        printf("feature X active\n");
    } else {
        printf("feature X disabled\n");
    }
}

int main(void) {
    run();
    return 0;
}
