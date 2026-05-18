#include "dfd_types.h"
#include "feature_flags.h"
#include <stdio.h>
#include <string.h>

RuntimeFlags g_runtime_flags = {
    .use_compression = 1,
};

static void log_request(const Request* req) {
#ifdef ENABLE_DEBUG_LOGGING
    printf("[DEBUG] path=%s body_len=%zu ip=%08x\n",
           req->path, req->body_len, req->client_ip);
#endif
}

void handle_request(const Request* req, Response* resp) {
    log_request(req);

    // TELEMETRY_PUSH == 0 → br i1 false → dead block detected by pass.
    if (TELEMETRY_PUSH) {
        printf("[TELEMETRY] request %s\n", req->path);   // dead
    }

    if (strcmp(req->path, "/health") == 0) {
        resp->status_code = 200;
        resp->body        = "OK";
        resp->body_len    = 2;
    } else if (strcmp(req->path, "/version") == 0) {
        resp->status_code = 200;
        resp->body        = PRODUCT_NAME " v2.0";
        resp->body_len    = strlen(resp->body);
    } else {
        resp->status_code = 404;
        resp->body        = "Not Found";
        resp->body_len    = 9;
    }

    // TELEMETRY_PUSH == 0 → second dead block.
    if (TELEMETRY_PUSH) {
        printf("[TELEMETRY] status %d\n", resp->status_code);  // dead
    }
}
