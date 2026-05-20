# Evaluation — Dead Feature Detector

## Methodology

Each test case is compiled to LLVM bitcode at `-O0 -gline-tables-only -fno-discard-value-names`
and analysed with `opt --load-pass-plugin DeadFeaturePass.so -passes=dead-feature`.

**Baseline comparison:** standard LLVM dead-code elimination at `-O2` (`-passes=dce,simplifycfg`)
removes pred-empty blocks and folds trivial branches *silently* — the code disappears without any
report.  Dead Feature Detector instead *reports* these regions with source locations, confidence
scores, and estimated line counts, enabling intentional review before removal.  It also detects
**interprocedural** dead functions that `-O2` DCE does not remove (DCE is intraprocedural only).

---

## Baseline Comparison

| Capability | LLVM `-O2` DCE | Dead Feature Detector |
|---|---|---|
| Removes pred-empty blocks | Yes (silently) | Detects and reports with source location |
| Detects zero-flag branches | Yes (silently via constprop) | Detects and reports |
| Detects interprocedural dead | No | Yes (call-graph BFS) |
| Outputs source locations | No | Yes (from DWARF DILocation) |
| Confidence scoring | No | Yes (0.60–0.95) |
| Cross-configuration analysis | No | Yes (via config extractor) |
| Works on pre-link bitcode | Yes | Yes |
| Works on merged whole-program bc | Yes | Yes (required for interprocedural) |

---

## Test Cases

### TC-01: Compile-Time Dead Block

**Source:** `testcases/01_compile_time_block/src/test.c`  
**Pattern:** Labeled block after `return` with no `goto` — no CFG predecessors.

| Metric | Expected | Actual |
|---|---|---|
| Findings | 1 | **1** |
| Kind | compile_time | **compile_time** |
| Confidence | 0.95 | **0.95** |
| Function | `process` | **`process`** |
| Basic block | `dead_legacy_path` | **`dead_legacy_path`** |
| Dead lines | 2 | **2** (L11–12) |

LLVM `-O2` baseline: would silently delete `dead_legacy_path`; 0 findings reported.

---

### TC-02: Runtime Dead Block (Zero-Initialised Feature Flag)

**Source:** `testcases/02_runtime_flag_zero/src/test.c`  
**Pattern:** `static int g_feature_new_codec = 0` — internal, never stored, name matches regex.

| Metric | Expected | Actual |
|---|---|---|
| Findings | 1 | **1** |
| Kind | runtime | **runtime** |
| Confidence | 0.85 | **0.85** |
| Function | `handle_request` | **`handle_request`** |
| Dead lines | 2 | **2** (L12–13) |

LLVM `-O2` baseline: `constprop` folds the branch silently; the dead block vanishes, 0 reported.

---

### TC-03: Single Dead Function (Interprocedural)

**Source:** `testcases/03_dead_function/src/test.c`  
**Pattern:** `static __attribute__((used)) void legacy_export(...)` — kept in bitcode but never
called from `main()` or any live function.

| Metric | Expected | Actual |
|---|---|---|
| Findings | 1 | **1** |
| Kind | interprocedural | **interprocedural** |
| Confidence | 0.60 | **0.60** |
| Function | `legacy_export` | **`legacy_export`** |
| Dead lines | 2 | **2** (L8–9) |

LLVM `-O2` baseline: `legacy_export` has `__attribute__((used))`, so DCE cannot remove it; it
remains in the binary silently. Dead Feature Detector is the only tool that reports it.

---

### TC-04: Transitive Dead Function Chain

**Source:** `testcases/04_transitive_dead/src/test.c`  
**Pattern:** Three functions (`v2_prepare`, `v2_commit`, `v2_flush`) form a call chain; none are
reachable from `main()` via the call graph.

| Metric | Expected | Actual |
|---|---|---|
| Findings | 3 | **3** |
| Kind | all interprocedural | **all interprocedural** |
| Confidence | 0.60 each | **0.60 each** |
| Functions | v2_flush, v2_commit, v2_prepare | **v2_flush, v2_commit, v2_prepare** |
| Dead lines | 8 | **8** (L9–10, L13–15, L18–20) |

LLVM `-O2` baseline: again, `__attribute__((used))` prevents removal; 0 findings.

---

### TC-05: Alive Code (Negative Test)

**Source:** `testcases/05_alive_code/src/test.c`  
**Pattern:** All functions reachable from `main()`; no dead blocks; no disabled flags.

| Metric | Expected | Actual |
|---|---|---|
| Findings | 0 | **0** |
| False positives | 0 | **0** |

---

### TC-06: 06_demo_large (Integration Demo — All Three Kinds, Large Scale)

**Source:** `testcases/06_demo_large/` — 9-file C++ "streamd" media server  
**Bitcode:** `testcases/06_demo_large/build/bitcode/posix/program.bc` (whole-program via `llvm-link`)

The showcase demo: a media-server codebase carrying a large number of dead features of all three
kinds — legacy/deprecated paths, flag-gated experimental codecs, orphaned hardware backends.
Built in 3 variants (posix / debug / embedded) with distinct `#define` sets.

| Metric | Value |
|---|---|
| Total findings | 42 |
| compile_time | 12 (confidence 0.95) |
| runtime | 12 (confidence 0.85) |
| interprocedural | 18 (confidence 0.60) |
| Dead lines | 103 |
| Removable text (measured via `llvm-nm`) | ~2.3 KB |
| Avg confidence | 0.77 |

**Breakdown by source file:**

| File | Kind | Count | Notes |
|---|---|---|---|
| `pipeline.cpp`, `codecs.cpp`, `transforms.cpp`, `platform.cpp` | compile_time | 12 | Labeled fallback blocks after `return` (no CFG predecessors) |
| `codecs.cpp`, `transforms.cpp`, `telemetry.cpp` | runtime | 12 | Zero-initialized internal feature-flag globals (`g_feature_*`, `*_enabled`, `FEATURE_*`, `FLAGS_*`, `kEnable*`) |
| `legacy_rtmp.cpp`, `experimental_backends.cpp`, `deprecated_api.cpp` | interprocedural | 18 | Orphaned `static` functions (incl. transitive dead chains), never reached from `main` |

---

## False Positive Analysis

| Test case | False positives | Reason |
|---|---|---|
| TC-01 through TC-05 | 0 | Ground truth known; all findings correct |
| TC-06 (06_demo_large) | 0 | All 42 findings match `expected.json`; verified by inspection |

**Known false-positive scenario (interprocedural):** Functions reachable only via function
pointers (indirect calls) will be flagged as dead because the call-graph BFS only follows direct
edges.  This is a conservative approximation: confidence 0.60 signals "likely dead, verify before
removing."

---

## Metrics Summary

| Test case | Findings | Dead lines | Avg conf | Baseline catches |
|---|---|---|---|---|
| TC-01 compile_time block | 1 | 2 | 0.95 | Silently (no report) |
| TC-02 runtime zero flag | 1 | 2 | 0.85 | Silently (no report) |
| TC-03 single dead fn | 1 | 2 | 0.60 | No (used attribute) |
| TC-04 transitive dead chain | 3 | 8 | 0.60 | No (used attribute) |
| TC-05 alive code (negative) | 0 | 0 | — | N/A |
| TC-06 06_demo_large | 42 | 103 | 0.77 | Partially silent |
| **Total across all TCs** | **48** | **117** | **0.75** | |

---

## Running the Evaluation

```bash
# Build everything first
./build.sh

# Run individual test cases
./run.sh --testcase 01
./run.sh --testcase 02
./run.sh --testcase 03
./run.sh --testcase 04
./run.sh --testcase 05

# Run the large demo (builds bitcode on first run) and open the GUI
./run.sh --testcase 06 --gui
```
