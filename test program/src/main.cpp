#include "dfd_types.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

// Forward declarations.
void handle_request(const Request* req, Response* resp);

#ifdef FEATURE_AUTH
bool authenticate(const Request* req);
#endif

#ifdef FEATURE_COMPRESSION
size_t compress_data(const char* src, size_t src_len, char* dst, size_t dst_cap);
#endif

static void process(const char* path, const char* body) {
    Request req = {
        .path      = path,
        .body      = body,
        .body_len  = body ? strlen(body) : 0,
        .client_ip = 0x7f000001,
    };
    Response resp = {};

#ifdef FEATURE_AUTH
    if (!authenticate(&req)) {
        printf("401 Unauthorized\n");
        return;
    }
#endif

    handle_request(&req, &resp);

#ifdef FEATURE_COMPRESSION
    char out[4096];
    size_t clen = compress_data(resp.body, resp.body_len, out, sizeof(out));
    printf("%d (%zu bytes)\n", resp.status_code, clen);
#else
    printf("%d %s\n", resp.status_code, resp.body);
#endif
}

int main(void) {
    printf("Dead Feature Test Server — " PRODUCT_NAME "\n");

    process("/health",  nullptr);
    process("/version", nullptr);
    process("/data",    "hello world");

    return 0;
}
