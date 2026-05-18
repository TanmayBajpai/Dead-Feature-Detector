#include "DeadFeaturePass.h"

#include "llvm/Analysis/CallGraph.h"
#include "llvm/Analysis/LazyValueInfo.h"
#include "llvm/IR/BasicBlock.h"
#include "llvm/IR/Constants.h"
#include "llvm/IR/DebugInfoMetadata.h"
#include "llvm/IR/Function.h"
#include "llvm/IR/Instructions.h"
#include "llvm/Support/FileSystem.h"
#include "llvm/Support/JSON.h"
#include "llvm/Support/raw_ostream.h"

#include <fstream>
#include <regex>
#include <set>
#include <string>
#include <vector>

using namespace llvm;
using namespace dfd;

// Heuristic: variable names suggesting a feature toggle
static bool isFeatureFlag(StringRef name) {
    static const std::regex pat(
        "g_feature_|_enabled$|_flag$|kEnable|FEATURE_|_ENABLED|FLAGS_",
        std::regex::icase);
    return std::regex_search(name.str(), pat);
}

static std::pair<std::string, unsigned> getSourceLoc(const Instruction &I) {
    if (const DILocation *loc = I.getDebugLoc())
        return {loc->getFilename().str(), loc->getLine()};
    return {"", 0};
}

static unsigned blockEndLine(const BasicBlock &BB) {
    unsigned last = 0;
    for (const Instruction &I : BB)
        if (const DILocation *loc = I.getDebugLoc())
            last = std::max(last, loc->getLine());
    return last;
}

// Collect basic blocks that are statically unreachable (no predecessors, not entry).
static std::vector<Finding> findUnreachableBlocks(Module &M) {
    std::vector<Finding> findings;
    for (Function &F : M) {
        if (F.isDeclaration()) continue;
        for (BasicBlock &BB : F) {
            // Entry block is always reachable.
            if (&BB == &F.getEntryBlock()) continue;
            // A block with no predecessors and no address-taken use is unreachable.
            if (pred_empty(&BB) && !BB.hasAddressTaken()) {
                auto [file, start] = getSourceLoc(*BB.getFirstNonPHIIt());
                unsigned end = blockEndLine(BB);
                if (start == 0) continue; // no debug info, skip
                findings.push_back({F.getName().str(), BB.getName().str(),
                                    file, start, end ? end : start,
                                    "compile_time", 0.95});
            }
        }
    }
    return findings;
}

// Return true if gv is an internal global initialized to zero with no stores
// anywhere in the module.  This detects disabled feature-flag globals of the
// form `static int g_feature_x = 0;` without requiring globalopt to run first.
static bool isConstantZeroGlobal(const GlobalVariable *gv) {
    if (!gv->hasInternalLinkage() && !gv->hasPrivateLinkage()) return false;
    if (!gv->hasInitializer()) return false;
    auto *init = dyn_cast<ConstantInt>(gv->getInitializer());
    if (!init || !init->isZero()) return false;
    // Confirm no store writes to this global.
    for (const User *u : gv->users())
        if (isa<StoreInst>(u)) return false;
    return true;
}

// Evaluate a compare instruction whose operands include a constant-zero global.
// Returns the branch successor that is dead (never taken), or nullptr.
static BasicBlock *evalConstZeroCmp(const ICmpInst *cmp, const BranchInst *br,
                                     const GlobalVariable *flagGV) {
    // Determine which operand index is the flag and which is the RHS constant.
    int flagIdx = -1;
    for (int i = 0; i < 2; ++i) {
        const Value *op = cmp->getOperand(i);
        if (op == flagGV) { flagIdx = i; break; }
        if (auto *li = dyn_cast<LoadInst>(op))
            if (li->getPointerOperand() == flagGV) { flagIdx = i; break; }
    }
    if (flagIdx < 0) return nullptr;

    const Value *rhs = cmp->getOperand(1 - flagIdx);
    auto *rhsC = dyn_cast<ConstantInt>(rhs);
    // flag == 0.  Only handle comparisons against integer constants.
    if (!rhsC) return nullptr;

    int64_t rhsVal = rhsC->getSExtValue();
    bool condTrue = false;
    switch (cmp->getPredicate()) {
        case ICmpInst::ICMP_EQ:  condTrue = (0 == rhsVal); break;
        case ICmpInst::ICMP_NE:  condTrue = (0 != rhsVal); break;
        case ICmpInst::ICMP_SLT: condTrue = (flagIdx == 0) ? (0 < rhsVal) : (rhsVal < 0); break;
        case ICmpInst::ICMP_SGT: condTrue = (flagIdx == 0) ? (0 > rhsVal) : (rhsVal > 0); break;
        case ICmpInst::ICMP_SLE: condTrue = (flagIdx == 0) ? (0 <= rhsVal) : (rhsVal <= 0); break;
        case ICmpInst::ICMP_SGE: condTrue = (flagIdx == 0) ? (0 >= rhsVal) : (rhsVal >= 0); break;
        case ICmpInst::ICMP_ULT: condTrue = false; break; // 0 is never < anything unsigned
        case ICmpInst::ICMP_UGT: condTrue = (rhsVal == 0) ? false : true; break;
        default: return nullptr;
    }
    // condTrue = value of the branch condition when flag == 0.
    // successor(0) is taken when condition is TRUE.
    return condTrue ? br->getSuccessor(1) : br->getSuccessor(0);
}

// Identify branches comparing a feature-flag global to a constant where one
// arm is never taken.
static std::vector<Finding> findRuntimeDeadBlocks(Function &F,
                                                   LazyValueInfo &LVI) {
    std::vector<Finding> findings;
    for (BasicBlock &BB : F) {
        auto *br = dyn_cast<BranchInst>(BB.getTerminator());
        if (!br || !br->isConditional()) continue;

        // Fast path: branch condition is already a ConstantInt (folded by
        // globalopt+instcombine in an earlier opt run).
        BasicBlock *deadBB = nullptr;
        if (auto *CI = dyn_cast<ConstantInt>(br->getCondition())) {
            deadBB = CI->isZero() ? br->getSuccessor(0) : br->getSuccessor(1);
        } else {
            auto *cmp = dyn_cast<ICmpInst>(br->getCondition());
            if (!cmp) continue;

            // Find a feature-flag operand (direct global or loaded from global).
            const GlobalVariable *flagGV = nullptr;
            for (const Value *op : cmp->operands()) {
                if (auto *gv = dyn_cast<GlobalVariable>(op))
                    if (isFeatureFlag(gv->getName())) { flagGV = gv; break; }
                if (auto *li = dyn_cast<LoadInst>(op))
                    if (auto *gv = dyn_cast<GlobalVariable>(li->getPointerOperand()))
                        if (isFeatureFlag(gv->getName())) { flagGV = gv; break; }
            }
            if (!flagGV) continue;

            // Static path: global is provably zero without any prior opt passes.
            if (isConstantZeroGlobal(flagGV)) {
                deadBB = evalConstZeroCmp(cmp, br, flagGV);
            } else {
                // Slow path: ask LazyValueInfo (works after globalopt/constprop).
                Constant *val = LVI.getConstant(cmp, br);
                if (!val) continue;
                deadBB = val->isZeroValue() ? br->getSuccessor(0) : br->getSuccessor(1);
            }
        }
        if (!deadBB) continue;

        auto [file, start] = getSourceLoc(*deadBB->getFirstNonPHIIt());
        unsigned end = blockEndLine(*deadBB);
        if (start == 0) continue;
        findings.push_back({F.getName().str(), deadBB->getName().str(),
                            file, start, end ? end : start,
                            "runtime", 0.85});
    }
    return findings;
}

// Mark functions reachable from live roots via call graph BFS; the rest are dead.
static std::vector<Finding> findInterproceduralDead(Module &M,
                                                    CallGraph &CG) {
    // Live roots: main + functions with external linkage (exported symbols).
    std::set<Function *> live;
    std::vector<Function *> worklist;

    auto enqueue = [&](Function *f) {
        if (f && !f->isDeclaration() && live.insert(f).second)
            worklist.push_back(f);
    };

    if (Function *main = M.getFunction("main")) enqueue(main);
    for (Function &F : M)
        if (F.hasExternalLinkage() && !F.isDeclaration()) enqueue(&F);

    while (!worklist.empty()) {
        Function *cur = worklist.back(); worklist.pop_back();
        CallGraphNode *node = CG[cur];
        for (auto &edge : *node) {
            Function *callee = edge.second->getFunction();
            enqueue(callee);
        }
    }

    std::vector<Finding> findings;
    for (Function &F : M) {
        if (F.isDeclaration()) continue;
        if (live.count(&F)) continue;

        // Scan all instructions for the first one that carries a source location.
        // (alloca / store prologue instructions often lack DILocations.)
        std::string file;
        unsigned start = 0;
        for (BasicBlock &BB : F) {
            for (Instruction &I : BB) {
                if (const DILocation *loc = I.getDebugLoc()) {
                    file = loc->getFilename().str();
                    start = loc->getLine();
                    goto found_loc;
                }
            }
        }
        found_loc:
        if (start == 0) continue;

        unsigned end = 0;
        for (BasicBlock &BB : F) end = std::max(end, blockEndLine(BB));
        findings.push_back({F.getName().str(), "", file, start,
                            end ? end : start, "interprocedural", 0.60});
    }
    return findings;
}

void DeadFeaturePass::writeFindings(const std::vector<Finding> &findings) const {
    json::Array arr;
    for (const auto &f : findings) {
        json::Object obj;
        obj["function"]    = f.function_name;
        obj["basic_block"] = f.basic_block_name;
        obj["source_file"] = f.source_file;
        obj["start_line"]  = (int64_t)f.start_line;
        obj["end_line"]    = (int64_t)f.end_line;
        obj["kind"]        = f.kind;
        obj["confidence"]  = f.confidence;
        arr.push_back(std::move(obj));
    }

    std::error_code ec;
    raw_fd_ostream out(output_path_, ec, sys::fs::OF_Text);
    if (ec) {
        errs() << "DeadFeaturePass: cannot write " << output_path_ << ": "
               << ec.message() << "\n";
        return;
    }
    out << formatv("{0:2}", json::Value(std::move(arr)));
    out << "\n";
}

PreservedAnalyses DeadFeaturePass::run(Module &M, ModuleAnalysisManager &MAM) {
    std::vector<Finding> all;

    // Phase 2a: compile-time dead blocks (unreachable in IR).
    auto ct = findUnreachableBlocks(M);
    all.insert(all.end(), ct.begin(), ct.end());

    // Phase 2b: runtime dead blocks (feature-flag predicate analysis).
    auto &FAM = MAM.getResult<FunctionAnalysisManagerModuleProxy>(M).getManager();
    for (Function &F : M) {
        if (F.isDeclaration()) continue;
        auto &LVI = FAM.getResult<LazyValueAnalysis>(F);
        auto rt = findRuntimeDeadBlocks(F, LVI);
        all.insert(all.end(), rt.begin(), rt.end());
    }

    // Phase 3: interprocedural dead functions.
    CallGraph CG(M);
    auto ip = findInterproceduralDead(M, CG);
    all.insert(all.end(), ip.begin(), ip.end());

    writeFindings(all);
    return PreservedAnalyses::all();
}
