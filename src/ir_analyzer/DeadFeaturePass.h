#pragma once

#include "llvm/IR/Module.h"
#include "llvm/IR/PassManager.h"

namespace dfd {

struct Finding {
    std::string function_name;
    std::string basic_block_name;
    std::string source_file;
    unsigned start_line;
    unsigned end_line;
    // "compile_time" | "runtime" | "interprocedural"
    std::string kind;
    double confidence;
};

class DeadFeaturePass : public llvm::PassInfoMixin<DeadFeaturePass> {
public:
    explicit DeadFeaturePass(std::string output_path = "ir_findings.json")
        : output_path_(std::move(output_path)) {}

    llvm::PreservedAnalyses run(llvm::Module &M, llvm::ModuleAnalysisManager &MAM);

    static bool isRequired() { return true; }

private:
    std::string output_path_;

    void writeFindings(const std::vector<Finding> &findings) const;
};

} // namespace dfd
