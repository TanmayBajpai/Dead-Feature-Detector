#include "dfd_types.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

// ---------------------------------------------------------------------------
// V1 legacy protocol implementation — compiled into every build but never
// called from main().  The v2 migration removed all call sites; the
// implementations were not deleted.
//
// With __attribute__((used)) the compiler emits these into the bitcode even
// though no callers exist.  The IR pass's BFS from main() cannot reach any
// of them → interprocedural dead, confidence ~0.6.
// ---------------------------------------------------------------------------

struct V1Header {
    uint32_t magic;
    uint16_t version;
    uint16_t payload_len;
};

static const uint32_t LEGACY_MAGIC = 0xDEADBEEF;

static __attribute__((used)) void legacy_v1_encrypt(char* buf, size_t len) {
    for (size_t i = 0; i < len; ++i)
        buf[i] ^= 0xAB;
}

static __attribute__((used)) bool legacy_v1_verify_magic(const V1Header* hdr) {
    return hdr->magic == LEGACY_MAGIC && hdr->version == 1;
}

static __attribute__((used)) int legacy_v1_decode_payload(const char* payload,
                                                           uint16_t len,
                                                           Request* out) {
    if (len < 8) return -1;
    out->path     = payload;
    out->body     = payload + 8;
    out->body_len = (size_t)(len - 8);
    legacy_v1_encrypt(const_cast<char*>(out->body), out->body_len);
    return 0;
}

static __attribute__((used)) int legacy_v1_read_packet(const char* buf,
                                                        size_t buf_len,
                                                        Request* out) {
    if (buf_len < sizeof(V1Header)) return -1;
    const V1Header* hdr = reinterpret_cast<const V1Header*>(buf);
    if (!legacy_v1_verify_magic(hdr)) return -2;
    if (buf_len < sizeof(V1Header) + hdr->payload_len) return -3;
    return legacy_v1_decode_payload(buf + sizeof(V1Header), hdr->payload_len, out);
}

static __attribute__((used)) void legacy_v1_write_response(int status,
                                                            const char* body,
                                                            char* out_buf,
                                                            size_t* out_len) {
    size_t blen = strlen(body);
    V1Header hdr = { LEGACY_MAGIC, 1, (uint16_t)blen };
    memcpy(out_buf, &hdr, sizeof(hdr));
    memcpy(out_buf + sizeof(hdr), body, blen);
    legacy_v1_encrypt(out_buf + sizeof(hdr), blen);
    *out_len = sizeof(hdr) + blen;
    (void)status;
}
