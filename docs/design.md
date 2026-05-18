# Dead Feature Detector — Design Document

## Problem

Large C/C++ codebases accumulate feature flags (`#ifdef`, runtime config globals) where some
combinations are never built or triggered in practice.  No existing tool cross-references:
1. **Which `#define` sets are actually used** across all real build targets
2. **Which IR regions are dead** under those define sets

Standard dead-code elimination only removes code that is provably dead within a single translation
unit and optimization pipeline; it cannot reason about features that are absent from *all*
configurations.

---

## Solution Overview

```
Build system  ──►  Config Extractor  ──►  config.json
Source tree   ──►  Clang (LTO)       ──►  bitcode
                                          │
                                          ▼
                                     IR Analyzer  ──►  ir_findings.json
                                          │
                                          ▼
                                   Report Generator  ──►  report.json + report.txt
                                          │
                                          ▼
                                       Web GUI
```

---

## Component Design

### Config Extractor (`src/config_extractor/`)

**Goal:** produce a JSON manifest `{targets: [{name, compile_definitions, source_files}]}`.

**Primary path — CMake File API:**
```
cmake -S . -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
```
The reply directory `build/.cmake/api/v1/reply/` contains `codemodel-v2-*.json` with per-target
compile groups, each carrying a `defines` array.  `cmake_api.py` reads these files directly.

**Fallback 1 — `compile_commands.json`:** `compile_commands_parser.py` greps for `-D` flags in
each TU's compiler invocation.  Merged by parent directory into pseudo-targets.

**Fallback 2 — Makefile dry-run:** `makefile_parser.py` runs `make -np --dry-run` and parses
compiler lines for `-D` flags.

---

### Per-Config Bitcode Diff (`scripts/analyze.py`)

Implements Phase 2a: functions present in *some* configs but absent from *others*.

For each source file that appears in ≥2 targets with different define sets:
1. `clang -O0 -g -emit-llvm -c <src> -DDEFINE_SET_A -o a.bc`
2. `clang -O0 -g -emit-llvm -c <src> -DDEFINE_SET_B -o b.bc`
3. `llvm-nm --defined-only a.bc` vs `llvm-nm --defined-only b.bc`
4. Functions in union but not intersection → `compile_time` finding (confidence 0.95)

---

### IR Analyzer (`src/ir_analyzer/`)

An out-of-tree LLVM pass plugin (`DeadFeaturePass.so`) implementing three detection strategies:

#### 2a — Unreachable blocks (compile_time)

Iterates all basic blocks in each function.  A block is compile_time dead if:
- It is not the entry block, **and**
- `pred_empty(&BB)` — no predecessor edges, **and**
- `!BB.hasAddressTaken()` — not referenced via `blockaddress`

Source location extracted from `DILocation` on the first non-PHI instruction.

#### 2b — Feature-flag branches (runtime)

For each conditional branch:
1. **Fast path:** branch condition is already a `ConstantInt` (e.g., after `globalopt` folded a
   known-zero feature flag) → dead successor is directly identified.
2. **Slow path:** branch condition is an `icmp` where one operand loads from a global whose name
   matches the heuristic pattern `g_feature_*|_enabled$|_flag$|kEnable|FEATURE_|FLAGS_`.
   `LazyValueInfo::getConstant()` is queried; if it returns a constant, the dead successor is
   identified.

Confidence: **0.85** (dataflow proof via LVI or constant fold).

#### 3 — Interprocedural reachability (interprocedural)

Builds an LLVM `CallGraph` and performs BFS from live roots:
- `main()`
- All functions with external linkage (exported symbols / shared library ABI)
- Functions marked `llvm.used` or `__attribute__((used))` (excluded from dead set)

Any function not reachable from a live root is flagged with confidence **0.60**.

Indirect calls are conservatively treated as edges to all functions matching the callee type
(future work: use `IndirectCallPromotion` results).

---

### Report Generator (`src/reporter/`)

**`merge.py`:** joins IR findings with config manifest by source-file basename.  Assigns `id`,
`feature_name` (inferred from function/BB name), `estimated_lines`, `dead_in_targets`.

**`score.py`:** applies the confidence table:

| Scenario | Confidence |
|---|---|
| Compile-time dead (absent from all config bitcode) | 0.95 |
| Runtime: LVI / constant-fold proof | 0.85 |
| Interprocedural: call-graph only | 0.60 |
| Heuristic name-match, no dataflow | 0.35 |

Findings are sorted by confidence descending.

**`render.py`:** writes `report.json` and `report.txt`.

**`stats.py`:** computes total dead lines and `by_kind` breakdown.

---

### Web GUI (`src/gui/`)

**Backend (FastAPI, `src/gui/backend/`):**
- `GET /findings[?kind=&min_confidence=&file=]` — filtered findings list
- `GET /findings/{id}` — single finding
- `GET /source?file=&start=&end=&context=` — source lines (path-traversal guarded)
- `GET /graph[?limit=]` — top-N dead nodes for D3 force graph
- `GET /stats` — stats + confidence histogram

Path-traversal guard in `source.py`: `Path(file).resolve()` must have `source_root` as a prefix.

**Frontend (React 18 + TypeScript + Vite, `src/gui/frontend/`):**
- `Dashboard` — summary cards, D3 confidence histogram
- `FindingTable` — sortable/filterable table; filter state synced to URL query params
- `SourceViewer` — Prism.js syntax-highlighted viewer; dead lines highlighted in red
- `CallGraphPanel` — D3 force-directed graph of dead-function subgraph

Dark/light mode toggled via a button; preference stored in `localStorage`.

---

## Confidence Score Design

Scores are floats in `[0.0, 1.0]`:
- `≥ 0.8` — provably dead under all enumerated configurations; safe to remove
- `0.5–0.79` — likely dead; requires manual verification before removal
- `< 0.5` — possibly dead; flagged for awareness only

The threshold `≥ 0.8` is the recommended default filter for automated reporting.

---

## Key Constraints

- **No source re-parsing:** source locations come exclusively from DWARF `DILocation` metadata.
- **No external services:** GUI backend is local-only; no external network calls from frontend.
- **Post-link pass:** the pass runs after `llvm-link` so the full call graph is visible.
- **Conservative indirect calls:** functions reachable only via indirect calls are not marked dead.
- **`llvm.used` / `__attribute__((used))`:** always treated as live roots.
