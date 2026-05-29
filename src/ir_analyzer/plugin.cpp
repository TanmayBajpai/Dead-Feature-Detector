#include "DeadFeaturePass.h"

#include "llvm/Passes/PassBuilder.h"
#if __has_include("llvm/Plugins/PassPlugin.h")
#include "llvm/Plugins/PassPlugin.h"
#else
#include "llvm/Passes/PassPlugin.h"
#endif
#include "llvm/Support/CommandLine.h"

using namespace llvm;

static cl::opt<std::string> OutputPath(
    "dead-feature-output",
    cl::desc("Path for IR findings JSON output"),
    cl::init("ir_findings.json"));

llvm::PassPluginLibraryInfo getDeadFeaturePluginInfo() {
    return {LLVM_PLUGIN_API_VERSION, "DeadFeature", LLVM_VERSION_STRING,
            [](PassBuilder &PB) {
                PB.registerPipelineParsingCallback(
                    [](StringRef Name, ModulePassManager &MPM,
                       ArrayRef<PassBuilder::PipelineElement>) {
                        if (Name == "dead-feature") {
                            MPM.addPass(dfd::DeadFeaturePass(OutputPath));
                            return true;
                        }
                        return false;
                    });
                // Also register as an optimizer-last EP so users can load via
                // clang -fpass-plugin=libDeadFeaturePass.so without spelling out
                // the pipeline explicitly.
                PB.registerOptimizerLastEPCallback(
                    [](ModulePassManager &MPM, OptimizationLevel,
                       ThinOrFullLTOPhase) {
                        MPM.addPass(dfd::DeadFeaturePass(OutputPath));
                    });
            }};
}

extern "C" LLVM_ATTRIBUTE_WEAK ::llvm::PassPluginLibraryInfo
llvmGetPassPluginInfo() {
    return getDeadFeaturePluginInfo();
}
