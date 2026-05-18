; Fixture: compile_time dead block — a basic block with no predecessors.
; Tests DeadFeaturePass's findUnreachableBlocks() path.

target datalayout = "e-m:e-p270:32:32-p271:32:32-p272:64:64-i64:64-i128:128-f80:128-n8:16:32:64-S128"
target triple = "x86_64-pc-linux-gnu"

define i32 @compute(i32 %x) !dbg !3 {
entry:
  ; Jump directly to live — dead_block is unreachable.
  br label %live, !dbg !10

dead_block:
  ; No predecessors → compile_time dead.
  %unused = add i32 %x, 99, !dbg !11
  br label %live

live:
  %r = add i32 %x, 1, !dbg !12
  ret i32 %r, !dbg !13
}

define i32 @main() !dbg !14 {
  %r = call i32 @compute(i32 3), !dbg !15
  ret i32 %r, !dbg !16
}

!llvm.dbg.cu = !{!0}
!llvm.module.flags = !{!17, !18}

!0 = distinct !DICompileUnit(language: DW_LANG_C11, file: !1, producer: "clang", isOptimized: false, runtimeVersion: 0, emissionKind: FullDebug)
!1 = !DIFile(filename: "always_dead.c", directory: "/fixtures")
!2 = !{}
!3 = distinct !DISubprogram(name: "compute", scope: !1, file: !1, line: 5, type: !4, scopeLine: 5, spFlags: DISPFlagDefinition, unit: !0)
!4 = !DISubroutineType(types: !5)
!5 = !{!6, !6}
!6 = !DIBasicType(name: "int", size: 32, encoding: DW_ATE_signed)
!7 = !DILocalVariable(name: "x", arg: 1, scope: !3, file: !1, line: 5, type: !6)
!10 = !DILocation(line: 6, column: 3, scope: !3)
!11 = !DILocation(line: 8, column: 5, scope: !3)
!12 = !DILocation(line: 12, column: 10, scope: !3)
!13 = !DILocation(line: 12, column: 3, scope: !3)
!14 = distinct !DISubprogram(name: "main", scope: !1, file: !1, line: 15, type: !4, scopeLine: 15, spFlags: DISPFlagDefinition, unit: !0)
!15 = !DILocation(line: 16, column: 10, scope: !14)
!16 = !DILocation(line: 16, column: 3, scope: !14)
!17 = !{i32 2, !"Debug Info Version", i32 3}
!18 = !{i32 1, !"wchar_size", i32 4}
