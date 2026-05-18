// Fixture: control case — all code is reachable.
// The pass must report zero findings for this file.

#include <stdio.h>

int g_feature_y = 1;

void path_a(void) { printf("path A\n"); }
void path_b(void) { printf("path B\n"); }

int main(void) {
    if (g_feature_y)
        path_a();
    else
        path_b();
    return 0;
}
