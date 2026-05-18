#include "dfd_types.h"
#include "feature_flags.h"
#include <string.h>
#include <stdio.h>

#ifdef FEATURE_AUTH

// ── Dead helpers (legacy v1 auth) ─────────────────────────────────────────
//
// Called only from the `if (LEGACY_AUTH_V1)` branch below.
// LEGACY_AUTH_V1 == 0 → Clang emits `br i1 false` → dead-feature pass
// records this as a dead runtime code path.

static void log_v1_auth_attempt(const char* token) {
    printf("[WARN] v1 auth attempt token_len=%zu\n", strlen(token));
}

static bool validate_v1_token(const char* token) {
    if (!token || strlen(token) < 4) return false;
    log_v1_auth_attempt(token);
    return true;
}

// ── Live helpers ──────────────────────────────────────────────────────────

static bool validate_v2_token(const char* token) {
    return token && strlen(token) >= 4;
}

// ── Public API ────────────────────────────────────────────────────────────

bool authenticate(const Request* req) {
    const char* token = req->path;

    // LEGACY_AUTH_V1 == 0 → Clang emits `br i1 false`.
    // validate_v1_token and log_v1_auth_attempt are dead.
    if (LEGACY_AUTH_V1) {
        return validate_v1_token(token);   // dead
    }

    return validate_v2_token(token);       // alive
}

#endif  // FEATURE_AUTH
