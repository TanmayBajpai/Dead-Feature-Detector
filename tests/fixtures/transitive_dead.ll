; Fixture: interprocedural dead code.
; helper_for_dead() and dead_entry() have internal linkage and are not reachable
; from main or any external symbol — they should be flagged as interprocedural dead.
; Tests DeadFeaturePass's findInterproceduralDead() path.

target datalayout = "e-m:e-p270:32:32-p271:32:32-p272:64:64-i64:64-i128:128-f80:128-n8:16:32:64-S128"
target triple = "x86_64-pc-linux-gnu"

; Internal — never called from a live root.
define internal void @helper_for_dead() !dbg !3 {
  call void @extern_sink(), !dbg !10
  ret void, !dbg !11
}

; Internal — only calls helper_for_dead, itself unreachable from main.
define internal void @dead_entry() !dbg !12 {
  call void @helper_for_dead(), !dbg !15
  ret void, !dbg !16
}

; External — live root.
define dso_local void @live_function() !dbg !17 {
  call void @extern_sink(), !dbg !18
  ret void, !dbg !19
}

; External — live root.
define dso_local i32 @main() !dbg !20 {
  call void @live_function(), !dbg !21
  ; dead_entry() is intentionally never called from here.
  ret i32 0, !dbg !22
}

declare void @extern_sink()

!llvm.dbg.cu = !{!0}
!llvm.module.flags = !{!23, !24}

!0 = distinct !DICompileUnit(language: DW_LANG_C11, file: !1, producer: "clang", isOptimized: false, runtimeVersion: 0, emissionKind: FullDebug)
!1 = !DIFile(filename: "transitive_dead.c", directory: "/fixtures")
!2 = !DIBasicType(name: "int", size: 32, encoding: DW_ATE_signed)
!3 = distinct !DISubprogram(name: "helper_for_dead", scope: !1, file: !1, line: 7, type: !4, scopeLine: 7, spFlags: DISPFlagLocalToUnit | DISPFlagDefinition, unit: !0)
!4 = !DISubroutineType(types: !5)
!5 = !{null}
!10 = !DILocation(line: 8, column: 5, scope: !3)
!11 = !DILocation(line: 9, column: 1, scope: !3)
!12 = distinct !DISubprogram(name: "dead_entry", scope: !1, file: !1, line: 12, type: !4, scopeLine: 12, spFlags: DISPFlagLocalToUnit | DISPFlagDefinition, unit: !0)
!15 = !DILocation(line: 13, column: 5, scope: !12)
!16 = !DILocation(line: 14, column: 1, scope: !12)
!17 = distinct !DISubprogram(name: "live_function", scope: !1, file: !1, line: 17, type: !4, scopeLine: 17, spFlags: DISPFlagDefinition, unit: !0)
!18 = !DILocation(line: 18, column: 5, scope: !17)
!19 = !DILocation(line: 19, column: 1, scope: !17)
!20 = distinct !DISubprogram(name: "main", scope: !1, file: !1, line: 22, type: !6, scopeLine: 22, spFlags: DISPFlagDefinition, unit: !0)
!6 = !DISubroutineType(types: !7)
!7 = !{!2}
!21 = !DILocation(line: 23, column: 5, scope: !20)
!22 = !DILocation(line: 25, column: 3, scope: !20)
!23 = !{i32 2, !"Debug Info Version", i32 3}
!24 = !{i32 1, !"wchar_size", i32 4}
