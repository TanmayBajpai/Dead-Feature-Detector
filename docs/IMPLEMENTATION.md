# Implementation Notes — Dead Feature Detector

## LLVM Pass Architecture

The core analysis is an out-of-tree LLVM **module pass** (`DeadFeaturePass`) built as a shared
library (`DeadFeaturePass.so`) and loaded at `opt` runtime via `--load-pass-plugin`.

It runs three detection phases in a single `Module::run()` invocation, then writes a JSON array
of findings to the path given by `--dead-feature-output`.

---

## Phase 1 — Compile-Time Dead Blocks (`compile_time`, confidence 0.95)

**API used:** `pred_empty(&BB)`, `BB.hasAddressTaken()`, `DILocation`

A basic block is compile-time dead when:
1. It is not the entry block of its function.
2. `pred_empty(&BB)` — no predecessor edges exist in the CFG.
3. `!BB.hasAddressTaken()` — not referenced via a `blockaddress` constant (which would make it
   reachable via an indirect branch / computed goto).
4. Its first non-PHI instruction carries a `DILocation` (so a source line can be attributed).

**Why pred_empty works at -O0:**  
Clang at `-O0` emits labeled blocks literally as they appear in source.  A block after an
unconditional `return` — or after a `goto` that skips it — has no incoming CFG edges, so
`pred_empty` is true.  At higher optimisation levels (`-O1`+), `simplifycfg` would delete these
blocks before the pass can see them, which is why the tool requires `-O0` bitcode.

**Source location extraction:**  
`getFirstNonPHIIt()` returns an iterator to the first non-PHI instruction.  DWARF line info
(`DILocation`) is attached to each instruction.  The start line of the dead block is taken from
the first instruction; the end line is the maximum `DILocation::getLine()` across all
instructions in the block.

```cpp
static std::pair<std::string, unsigned> getSourceLoc(const Instruction &I) {
    if (const DILocation *loc = I.getDebugLoc())
        return {loc->getFilename().str(), loc->getLine()};
    return {"", 0};
}
```

---

## Phase 2 — Runtime Dead Blocks (`runtime`, confidence 0.85)

**API used:** `BranchInst`, `ICmpInst`, `GlobalVariable`, `LazyValueInfo`

For each conditional branch in the module, the pass checks whether one successor is provably
never taken by evaluating the branch condition when it involves a feature-flag global.

### Feature-flag global identification

A global variable name matches the heuristic regex:
```
g_feature_|_enabled$|_flag$|kEnable|FEATURE_|_ENABLED|FLAGS_
```
This regex (case-insensitive) covers common naming conventions for feature toggles.

### Fast path — pre-folded ConstantInt

If `opt` is run with `globalopt,function(instcombine)` before the pass, constant-zero globals are
already folded into a `ConstantInt` branch condition.  The fast path checks
`dyn_cast<ConstantInt>(br->getCondition())` directly:

```cpp
if (auto *CI = dyn_cast<ConstantInt>(br->getCondition())) {
    deadBB = CI->isZero() ? br->getSuccessor(0) : br->getSuccessor(1);
}
```

### Static path — zero-initialised internal global (no prior passes needed)

The pass can prove a global is always zero without any prior optimisation passes if:
1. The global has **internal or private linkage** (compiler-visible scope).
2. Its **initialiser is a zero `ConstantInt`**.
3. **No `StoreInst` appears in its user list** (it is never written after initialisation).

```cpp
static bool isConstantZeroGlobal(const GlobalVariable *gv) {
    if (!gv->hasInternalLinkage() && !gv->hasPrivateLinkage()) return false;
    if (!gv->hasInitializer()) return false;
    auto *init = dyn_cast<ConstantInt>(gv->getInitializer());
    if (!init || !init->isZero()) return false;
    for (const User *u : gv->users())
        if (isa<StoreInst>(u)) return false;
    return true;
}
```

When this check passes, `evalConstZeroCmp()` evaluates the `ICmpInst` predicate with `flag == 0`
using integer arithmetic to determine which branch successor is dead.

### Slow path — LazyValueInfo

For non-constant-zero globals, `LazyValueInfo::getConstant(cmp, br)` is queried.  LVI performs
backwards dataflow analysis and can prove a comparison result constant when the range of the
operands is sufficiently constrained (e.g., by prior `range` metadata or other branch conditions).

---

## Phase 3 — Interprocedural Dead Functions (`interprocedural`, confidence 0.60)

**API used:** `CallGraph`, `Function::hasExternalLinkage()`, BFS

**Live roots:**
- `main()` — the standard C/C++ entry point.
- All functions with **external linkage** — exported symbols visible to the linker / dynamic
  loader.  These cannot be removed without breaking the ABI.

**BFS expansion:**  
For each `CallGraphNode`, every callee reachable via direct call edges is added to the live set.
Indirect calls (via function pointers) are conservatively ignored — a callee reachable only via an
indirect call is *not* automatically marked live (future work: use `IndirectCallPromotion`
results).

**`__attribute__((used))` handling:**  
The C/C++ `__attribute__((used))` annotation causes clang to add the function to the
`llvm.compiler.used` or `llvm.used` metadata lists, preventing the compiler from silently
discarding the function.  However, the pass does **not** treat `used` as a live-root marker:
a function can be `used` (kept in bitcode) but still unreachable from `main`.  This lets the pass
flag dead-but-preserved functions that were previously kept to avoid linker warnings.

**Source location:**  
The entry block of a function at `-O0` typically begins with a series of `alloca` instructions
for parameter spills; these often lack `DILocation`.  The pass scans **all instructions in all
basic blocks** to find the first one that carries a `DILocation`, avoiding the false-negative of
skipping functions whose first instructions have no debug info.

---

## Build System Integration

The pass is built as a CMake `MODULE` target:

```cmake
add_llvm_pass_plugin(DeadFeaturePass
    DeadFeaturePass.cpp
    plugin.cpp
)
```

`find_package(LLVM REQUIRED CONFIG)` locates the installed LLVM headers and import targets.
`llvm_map_components_to_libnames` is used to link only the required LLVM libraries rather than
the monolithic `-lLLVM`.

The plugin is registered via:

```cpp
llvmGetPassPluginInfo() {
    return {LLVM_PLUGIN_API_VERSION, "DeadFeaturePass", LLVM_VERSION_STRING,
            [](PassBuilder &PB) {
                PB.registerPipelineParsingCallback(
                    [](StringRef name, ModulePassManager &MPM, ...) {
                        if (name == "dead-feature") {
                            MPM.addPass(DeadFeaturePass(outputPath));
                            return true;
                        }
                        return false;
                    });
            }};
}
```

---

## JSON Output Schema

Each finding object in the output array:

```json
{
  "function":    "string — mangled function name",
  "basic_block": "string — BB label (empty for interprocedural findings)",
  "source_file": "string — absolute path from DILocation",
  "start_line":  42,
  "end_line":    47,
  "kind":        "compile_time | runtime | interprocedural",
  "confidence":  0.95
}
```

---

## Why -O0 Bitcode

| Optimisation level | Effect on dead-code analysis |
|---|---|
| `-O0` | Dead blocks preserved; `optnone` attribute prevents opt passes from changing functions |
| `-O1` | `simplifycfg` deletes pred-empty blocks before the pass sees them |
| `-O2`+ | Aggressive inlining + DCE eliminates most dead code before IR analysis; few findings |

The tool deliberately analyses **pre-optimisation bitcode** so that code that the compiler would
remove shows up as a finding (confirming it is always dead) rather than silently disappearing.

---

## Confidence Score Rationale

| Kind | Score | Rationale |
|---|---|---|
| `compile_time` | 0.95 | Structural property of the IR; cannot be a false positive unless debug info is wrong |
| `runtime` | 0.85 | Requires the global to be provably zero; store-check may miss indirect writes via pointer aliasing |
| `interprocedural` | 0.60 | Indirect calls are ignored; a function reachable only via a function pointer is a false positive |

The 5% gap at `compile_time` (0.95 rather than 1.0) accounts for edge cases where debug info
attributes a block to a different file than expected, or where `blockaddress` usage is present but
not detected.
