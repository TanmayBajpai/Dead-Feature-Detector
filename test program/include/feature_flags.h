#pragma once

// ---------------------------------------------------------------------------
// Dead feature flags — compile-time constants that are always 0 in the
// shipped product.  Using constexpr (not a mutable struct field) ensures
// Clang emits `br i1 false` in the IR, which the dead-feature LLVM pass
// can detect directly.
//
// Features removed but code not yet deleted:
//   EXPERIMENTAL_CODEC  — prototype compression algorithm, never shipped
//   LEGACY_AUTH_V1      — v1 bearer token compat, removed after migration
//   TELEMETRY_PUSH      — active telemetry, product team axed it in Q3
// ---------------------------------------------------------------------------
constexpr int EXPERIMENTAL_CODEC = 0;
constexpr int LEGACY_AUTH_V1     = 0;
constexpr int TELEMETRY_PUSH     = 0;
