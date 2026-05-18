// Fixture: a block guarded by a flag that is never defined.
// Compiled without -DLEGACY_BACKEND, so the #ifdef block is stripped by the
// preprocessor and does not appear in IR. The LLVM pass sees no dead blocks
// here — but when diffing bitcode across configs (Phase 2a driver) this TU
// will appear only in the legacy config.
//
// For the single-TU IR test we use an always-false constant branch instead,
// which the pass can detect as compile_time dead (unreachable successor block).

#include <stdio.h>

int compute(int x) {
    if (0) {                        // optimizer may not fold this at -O0
        // dead block — no predecessor after branch folding at O1+
        // At -O0 the block still exists but has no preds after CFG simplify.
        printf("legacy path\n");
        return x * 2;
    }
    return x + 1;
}

int main(void) {
    printf("%d\n", compute(3));
    return 0;
}
