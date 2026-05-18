# Dead Feature Detector

A whole-program LLVM analysis tool that identifies code regions guarded by preprocessor flags or
runtime feature toggles that are **unreachable under any actual build configuration or runtime
input**.

Goes beyond standard dead-code elimination by combining build-system-level configuration analysis
with IR-level reachability, then presenting findings in an interactive web GUI.

---

## Quick Start

### Requirements

| Tool | Version |
|---|---|
| Clang / LLVM | 17+ (tested on 18, 22) |
| CMake | 3.20+ |
| Python | 3.10+ |
| Node.js | 18+ (GUI frontend only) |

### 1. Build the LLVM pass

```bash
cmake -S . -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=clang \
  -DCMAKE_CXX_COMPILER=clang++ \
  -DLLVM_DIR="$(llvm-config --cmakedir)"
cmake --build build --parallel $(nproc)
```

### 2. Set up Python environment

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

### 3. Build the GUI frontend (optional)

```bash
cd src/gui/frontend && npm ci && npm run build
```

### 4. Run the full CI check

```bash
./scripts/ci.sh
```

---

## Usage

### Step 1 — Extract build configuration

```bash
# CMake project (after running cmake to generate build files)
python3 -m config_extractor --build-dir /path/to/build --out config.json
```

This reads CMake File API output (or `compile_commands.json` as a fallback) and emits a manifest
of all `#define` sets per build target.

### Step 2 — Analyse bitcode

Build your project with LTO to produce whole-program bitcode:

```bash
CC="clang -flto=thin -g" CXX="clang++ -flto=thin -g" cmake ...
cmake --build build
```

Then run the pass on the resulting bitcode:

```bash
opt --load-pass-plugin build/src/ir_analyzer/DeadFeaturePass.so \
    -passes=dead-feature \
    --dead-feature-output=ir_findings.json \
    program.bc -o /dev/null
```

Optionally, run the per-config bitcode diff driver for compile-time dead code:

```bash
python3 scripts/analyze.py \
    --config config.json \
    --source-root /path/to/src \
    --out extra_ct_findings.json
```

### Step 3 — Generate report

```bash
python3 -m reporter \
    --ir-findings ir_findings.json \
    --config config.json \
    --out report/
```

Produces `report/report.json` and `report/report.txt`.

### Step 4 — Browse results in the GUI

```bash
python3 -m gui.backend \
    --report report/report.json \
    --source-root /path/to/src
```

Opens `http://localhost:8421` in your browser automatically.

---

## Detection Strategies

| Strategy | Confidence | How |
|---|---|---|
| **compile_time** | 0.95 | Basic block has no predecessors in IR (preprocessor-excluded code) |
| **runtime** | 0.85 | Branch condition proven constant by `LazyValueInfo` or post-`globalopt` fold |
| **interprocedural** | 0.60 | Function unreachable from `main` / exported symbols via call graph BFS |
| **heuristic** | 0.35 | Name-pattern match only, no dataflow proof |

Findings with confidence ≥ 0.8 are considered **provably dead** and safe to remove.

---

## GUI Overview

| Tab | Description |
|---|---|
| Dashboard | Summary cards, confidence histogram |
| Findings | Sortable/filterable table; click a row to open the source viewer |
| Graph | D3 force-directed call graph of dead functions; click a node to inspect |

Filter state is synced to URL query params so links can be shared.

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

---

## Running Tests

```bash
# Python unit + integration tests
PYTHONPATH=src pytest tests/unit -v

# IR pass tests (requires built pass)
ctest --test-dir build --output-on-failure

# Golden-file pipeline test
PYTHONPATH=src pytest tests/unit/test_pipeline_golden.py -v
```

---

## Evaluation on LLVM

See `eval/build_llvm.sh` and `eval/run_eval.sh` for scripts that build LLVM itself with LTO and
run the full pipeline on it.

Expected findings: deprecated backend `#ifdef` guards, platform-specific paths unused on Linux,
experimental feature flags disabled in release configs.

---

## Project Structure

```
src/
  config_extractor/   Python: CMake/Makefile parser → config.json
  ir_analyzer/        C++: LLVM pass plugin → ir_findings.json
  reporter/           Python: merge + score + render → report/
  gui/
    backend/          Python: FastAPI server
    frontend/         TypeScript/React: web UI
scripts/
  ci.sh               Local CI runner
  analyze.py          Per-config bitcode diff driver
eval/
  build_llvm.sh       Build LLVM with LTO
  run_eval.sh         Full pipeline on LLVM
tests/
  fixtures/           .c and .ll test programs
  unit/               pytest + golden-file tests
docs/
  design.md           Full design document
```

---

## License

MIT
