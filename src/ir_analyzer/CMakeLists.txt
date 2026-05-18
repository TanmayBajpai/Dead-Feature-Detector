add_llvm_pass_plugin(DeadFeaturePass
  DeadFeaturePass.cpp
  plugin.cpp
  DEPENDS
  intrinsics_gen
)
