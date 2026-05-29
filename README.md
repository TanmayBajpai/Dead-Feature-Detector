# Dead Feature Detector

**Identifies code guarded by preprocessor flags or runtime feature toggles that is dead across
every real build configuration and runtime input** — surfacing what standard dead-code elimination
silently discards, with source locations, confidence scores, and a web GUI.

---

## Why This Exists

Large C/C++ codebases accumulate `#ifdef` guards and runtime feature flags where some combinations
are never built or triggered in production. Standard DCE (`-O2`) silently removes some of these at
compile time but:

- gives no report of *what* it removed or *where*
- cannot detect interprocedural dead code (orphan functions)
- does not cross-reference which `#define` sets are actually used across all real build targets

Dead Feature Detector fills this gap by combining **build-system-level configuration analysis**
with **whole-program IR reachability** into a single pipeline, then presenting every finding in an
interactive web GUI with syntax-highlighted source.

---

## The Five Objectives

| # | Deliverable | GUI tab |
|---|---|---|
| 1 | Build configuration extractor (CMake/Makefile → actual `#define` sets) | **Configurations** |
| 2 | Whole-program analysis correlating configuration predicates with IR reachability | **Reachability** |
| 3 | Report of dead features with confidence scores and affected source regions | **Findings** + **Source Viewer** |
| 4 | Evaluation on LLVM or another large OSS project | **Evaluation** |
| 5 | Estimate of removable code volume (lines + binary-size savings) | **Impact** |

Every objective maps to a dedicated GUI tab so its outcome is directly visible.

---

## Quick Start

### Requirements

| Tool | Version | Notes |
|---|---|---|
| Clang / LLVM | 17+ (tested 18, 22) | `clang`, `clang++`, `opt`, `llvm-link`, `llvm-nm` |
| CMake | 3.20+ | |
| Python | 3.10+ | |
| Node.js | 18+ | GUI frontend only; auto-built on first launch if available |

### 1 — Build everything

```bash
./build.sh
```

This runs three steps in order:
1. Configures and builds the LLVM pass plugin (`build/src/ir_analyzer/DeadFeaturePass.so`)
2. Creates a Python venv (`.venv/`) and installs dependencies
3. Builds the React frontend into `src/gui/static/` (skipped with `--skip-frontend` or if npm is absent)

### 2 — Run the large demo (recommended first run)

```bash
./run.sh --testcase 06 --gui
```

Testcase 06 is a synthetic media-server (`streamd`) with 9 source files and 3 build variants.
It produces **42 findings** across all three detection kinds, opens the full GUI automatically,
and is the best demonstration of all five objectives at once.

### 3 — Run minimal targeted test cases

```bash
./run.sh --testcase 01   # compile_time_block  — 1 finding, conf 0.95
./run.sh --testcase 02   # runtime_flag_zero   — 1 finding, conf 0.85
./run.sh --testcase 03   # dead_function       — 1 finding, conf 0.60
./run.sh --testcase 04   # transitive_dead     — 3 findings, conf 0.60
./run.sh --testcase 05   # alive_code          — 0 findings (negative control)
```

---

## Detection Strategies

| Strategy | Confidence | Mechanism |
|---|---|---|
| **compile_time** | 0.95 | Basic block has no CFG predecessors (`pred_empty`); preprocessor-excluded code preserved at `-O0` |
| **runtime** | 0.85 | Branch condition is a zero-initialised internal global with no stores (`isConstantZeroGlobal`) |
| **interprocedural** | 0.60 | Function unreachable from `main` and all external-linkage roots via call-graph BFS |

All three mechanisms run in a **single pass** on `-O0` bitcode without requiring any prior
optimization passes. Confidence ≥ 0.8 means provably dead under all enumerated configurations.

---

## Evaluation Results

### Minimal test suite (TC-01 – TC-05)

| Test case | Focus | Expected findings | Status |
|---|---|---|---|
| TC-01 compile_time_block | compile_time | 1 (conf 0.95) | **PASS** |
| TC-02 runtime_flag_zero | runtime | 1 (conf 0.85) | **PASS** |
| TC-03 dead_function | interprocedural | 1 (conf 0.60) | **PASS** |
| TC-04 transitive_dead | interprocedural | 3 (conf 0.60) | **PASS** |
| TC-05 alive_code | negative control | 0 | **PASS** |

### Integration demo — TC-06 (`testcases/06_demo_large/`)

Synthetic media-server with intentional dead features of all three kinds:

| Metric | Value |
|---|---|
| Source files | 9 |
| Build variants | 3 (posix / debug / embedded) |
| Total findings | **42** (12 compile_time + 12 runtime + 18 interprocedural) |
| Dead lines | 103 |
| Removable text | ~2.3 KB (measured via `llvm-nm`) |

### Large-scale target — SQLite 3.49.1 (261 K lines)

Run via `bash eval/run_sqlite.sh` (downloads and compiles the single-file amalgamation automatically):

| Metric | Value |
|---|---|
| Total findings | **580** (15 runtime + 565 interprocedural) |
| Dead lines | 16,603 |
| Removable text | ~166 KB (measured via `llvm-nm`) |
| Avg confidence | 0.61 |

---

## Running the Full Test Suite

```bash
# 1. Python unit tests (no LLVM required)
PYTHONPATH=src pytest tests/unit --ignore=tests/unit/test_pipeline_golden.py -v

# 2. C++ IR pass tests (requires built pass)
ctest --test-dir build --output-on-failure

# 3. End-to-end golden-file pipeline tests (requires built pass)
PYTHONPATH=src pytest tests/unit/test_pipeline_golden.py -v

# 4. Run everything at once (builds pass + all tests)
./scripts/ci.sh
```

---

## Running on Your Own Project

### Step 1 — Generate bitcode

```bash
# Single-file project
clang -std=c11 -O0 -gline-tables-only -fno-discard-value-names \
      -emit-llvm -c myproject.c -o myproject.bc

# Multi-TU project (link into whole-program bitcode)
clang -O0 -gline-tables-only -fno-discard-value-names -emit-llvm -c file1.c -o file1.bc
clang -O0 -gline-tables-only -fno-discard-value-names -emit-llvm -c file2.c -o file2.bc
llvm-link file1.bc file2.bc -o program.bc
```

### Step 2 — Run the pipeline

```bash
./run.sh --build-dir /path/to/build --source-root /path/to/src --gui
```

Or manually, step by step:

```bash
# Extract build config (CMake projects: run cmake first)
python3 -m config_extractor --build-dir /path/to/build --out out/config.json

# Run IR pass
opt --load-pass-plugin build/src/ir_analyzer/DeadFeaturePass.so \
    -passes=dead-feature \
    --dead-feature-output=out/ir_findings.json \
    program.bc -o /dev/null

# Generate report
python3 -m reporter \
    --ir-findings out/ir_findings.json \
    --config out/config.json \
    --out out/report/

# Launch GUI
python3 -m gui.backend \
    --report out/report/report.json \
    --source-root /path/to/src
```

---

## GUI Overview

The GUI launches at `http://localhost:8421` and has six tabs:

| Tab | Objective | What it shows |
|---|---|---|
| **Objectives** | — | Landing page: all 5 deliverables, outcome metrics, met/pending badges, deep-links |
| **Configurations** | 1 | Per-target `#define` sets extracted from CMake/Makefile; source-file counts |
| **Reachability** | 2 | Per-mechanism finding counts (compile_time / runtime / interprocedural) |
| **Findings** | 3 | Filterable/sortable table; click a row to open the source viewer |
| **Evaluation** | 4 | TC-01 through TC-06 results + SQLite large-scale status |
| **Impact** | 5 | Dead-line count, measured binary savings, confidence histogram |

Filter state is synced to URL query params so links can be shared.

---

## Large-Scale Evaluation — SQLite

```bash
bash eval/run_sqlite.sh           # downloads, compiles, analyses (takes ~2 min)
bash eval/run_sqlite.sh --gui     # same + opens GUI on results
```

The script downloads SQLite 3.49.1, compiles it to bitcode at `-O0`, runs the pass, generates
the report, and prints a summary.  Results are written to `eval/sqlite-results/`.

---

## Docker

```bash
docker build -t dead-feature-detector .
docker run -p 8421:8421 \
  -v /path/to/report.json:/data/report.json \
  -v /path/to/src:/data/src:ro \
  dead-feature-detector \
  --report /data/report.json --source-root /data/src --no-browser
```

The image is based on Ubuntu 24.04 with LLVM 18, Python 3, and Node 22. It builds the pass and
frontend at image-build time, so the container is self-contained.

---

## Architecture

```
Build system        Source tree
     │                   │
     ▼                   ▼ (clang -O0 -emit-llvm)
Config Extractor    per-TU bitcode
     │                   │
     │              llvm-link
     │                   │
     │                   ▼
     │            Whole-program .bc
     │                   │
     │                   ▼
     └──────────► IR Analyzer (LLVM pass)
                         │
                         ▼
                   ir_findings.json
                         │
                         ▼
                  Report Generator ──► report.json + report.txt
                         │
                         ▼
                      Web GUI (FastAPI + React)
```

The **IR Analyzer** is an out-of-tree LLVM `ModulePass` that runs as a post-link pass so the
full call graph is visible.  Source locations are recovered from DWARF `DILocation` metadata;
no source re-parsing is needed.

---

## Project Structure

```
Dead Feature Detector/
├── build.sh                   Entry point: build pass + venv + frontend
├── run.sh                     Entry point: run pipeline (--testcase 01-06 shortcut)
├── CMakeLists.txt             Top-level CMake; pulls in src/ir_analyzer/
├── Dockerfile                 Self-contained Ubuntu 24.04 image
├── src/
│   ├── config_extractor/      Python: CMake/Makefile → config.json  (Objective 1)
│   ├── ir_analyzer/           C++17: LLVM pass plugin → ir_findings.json  (Objectives 2+3)
│   ├── reporter/              Python: merge + score + render → report.json  (Objectives 3+5)
│   └── gui/
│       ├── backend/           Python: FastAPI REST API + SSE pipeline runner
│       └── frontend/          TypeScript + React + Vite (Objectives 1-5 tabs)
├── testcases/
│   ├── 01_compile_time_block/ Minimal: pred_empty block
│   ├── 02_runtime_flag_zero/  Minimal: zero-init flag
│   ├── 03_dead_function/      Minimal: orphan function
│   ├── 04_transitive_dead/    Minimal: 3-fn dead chain
│   ├── 05_alive_code/         Negative control
│   └── 06_demo_large/         Integration demo: 9-file streamd, 42 findings
├── eval/
│   ├── run_sqlite.sh          Large-scale evaluation on SQLite 3.49.1
│   ├── build_llvm.sh          (Reference) Build LLVM with LTO
│   ├── run_eval.sh            (Reference) Run pipeline on LLVM build dir
│   └── eval_summary.json      Machine-readable results served by GUI /eval
├── tests/
│   ├── fixtures/              .c and .ll programs for IR-level tests
│   └── unit/                  pytest suite (unit + golden-file)
├── scripts/
│   ├── ci.sh                  Local CI runner (mirrors GitHub Actions)
│   └── analyze.py             Per-config bitcode diff driver
└── docs/
    ├── design.md              Full architecture and design decisions
    ├── IMPLEMENTATION.md      LLVM pass internals and API details
    └── EVALUATION.md          Detailed per-test-case metrics
```

---

## License

MIT
