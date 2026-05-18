; Fixture: runtime dead block — branch condition is a ConstantInt false.
; This represents what the IR looks like after globalopt has constant-propagated
; a feature flag that is always 0 in all configurations.
; Tests DeadFeaturePass's findRuntimeDeadBlocks() constant-branch path.

target datalayout = "e-m:e-p270:32:32-p271:32:32-p272:64:64-i64:64-i128:128-f80:128-n8:16:32:64-S128"
target triple = "x86_64-pc-linux-gnu"

@g_feature_x = global i32 0, align 4, !dbg !20

; After globalopt the load is replaced with the constant 0, and instcombine
; folds `icmp ne i32 0, 0` → i1 false.  The pass sees a conditional branch on
; a literal `false` and reports the true-successor as runtime-dead.
define void @run() !dbg !3 {
entry:
  ; Simulate what the IR looks like post-globalopt+instcombine: condition is
  ; already the constant `false` — g_feature_x is never non-zero.
  br i1 false, label %feature_active, label %feature_disabled, !dbg !10

feature_active:
  ; runtime dead — feature flag is always 0 in this configuration
  call void @feature_print_active(), !dbg !11
  br label %exit, !dbg !12

feature_disabled:
  call void @feature_print_disabled(), !dbg !13
  br label %exit

exit:
  ret void, !dbg !14
}

declare void @feature_print_active()
declare void @feature_print_disabled()

define i32 @main() !dbg !15 {
  call void @run(), !dbg !16
  ret i32 0, !dbg !17
}

!llvm.dbg.cu = !{!0}
!llvm.module.flags = !{!18, !19}

!0 = distinct !DICompileUnit(language: DW_LANG_C11, file: !1, producer: "clang", isOptimized: false, runtimeVersion: 0, emissionKind: FullDebug, globals: !21)
!1 = !DIFile(filename: "runtime_dead.c", directory: "/fixtures")
!2 = !{}
!3 = distinct !DISubprogram(name: "run", scope: !1, file: !1, line: 10, type: !4, scopeLine: 10, spFlags: DISPFlagDefinition, unit: !0)
!4 = !DISubroutineType(types: !5)
!5 = !{null}
!6 = !DIBasicType(name: "int", size: 32, encoding: DW_ATE_signed)
!10 = !DILocation(line: 11, column: 3, scope: !3)
!11 = !DILocation(line: 12, column: 5, scope: !3)
!12 = !DILocation(line: 13, column: 3, scope: !3)
!13 = !DILocation(line: 15, column: 5, scope: !3)
!14 = !DILocation(line: 17, column: 1, scope: !3)
!15 = distinct !DISubprogram(name: "main", scope: !1, file: !1, line: 20, type: !4, scopeLine: 20, spFlags: DISPFlagDefinition, unit: !0)
!16 = !DILocation(line: 21, column: 3, scope: !15)
!17 = !DILocation(line: 22, column: 3, scope: !15)
!18 = !{i32 2, !"Debug Info Version", i32 3}
!19 = !{i32 1, !"wchar_size", i32 4}
!20 = !DIGlobalVariableExpression(var: !22, expr: !DIExpression())
!21 = !{!20}
!22 = distinct !DIGlobalVariable(name: "g_feature_x", scope: !0, file: !1, line: 7, type: !6, isLocal: false, isDefinition: true)
