/* runtime dead block: internal global initialized to 0, never written.
   The DeadFeaturePass detects isConstantZeroGlobal() directly without
   requiring globalopt to run first.
   Expected: 1 runtime finding, confidence 0.85, in function handle_request(). */
#include <stdio.h>

static int g_feature_new_codec = 0;   /* matches g_feature_ pattern */

void handle_request(const char* path) {
    if (g_feature_new_codec) {
        /* runtime dead — g_feature_new_codec is always 0 */
        printf("new codec path: %s\n", path);
    }
    printf("default path: %s\n", path);
}

int main(void) {
    handle_request("/api/data");
    return 0;
}
