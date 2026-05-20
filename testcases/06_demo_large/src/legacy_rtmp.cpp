// legacy_rtmp.cpp — interprocedural dead functions (legacy RTMP egress).
//
// The RTMP push-output module was replaced by SRT/WHIP. The code still compiles
// but nothing in the live decode path calls it, so whole-program BFS from main
// never reaches any of these functions. They form a transitive dead chain.
//
// All functions are `static` (internal linkage) so they are NOT live roots, and
// `__attribute__((used))` so -O0 keeps them in the IR for analysis.
#include <stdio.h>
#include "streamd.h"

static __attribute__((used)) int rtmp_connect(const char* url, int port) {
    printf("rtmp connect %s:%d\n", url, port);
    return port > 0 ? 0 : -1;
}

static __attribute__((used)) int rtmp_handshake(int fd) {
    printf("rtmp handshake fd=%d (c0/c1/c2)\n", fd);
    return fd >= 0 ? 0 : -1;
}

static __attribute__((used)) int rtmp_send_packet(int fd, const Frame* f) {
    printf("rtmp send fd=%d bytes=%zu pts=%lld\n", fd, f->size, (long long)f->pts);
    return (int)f->size;
}

static __attribute__((used)) void rtmp_flush(int fd) {
    printf("rtmp flush fd=%d\n", fd);
}

// Transitive: calls rtmp_flush (also dead).
static __attribute__((used)) void rtmp_disconnect(int fd) {
    rtmp_flush(fd);
    printf("rtmp disconnect fd=%d\n", fd);
}

// Transitive: calls rtmp_send_packet + rtmp_flush (both dead).
static __attribute__((used)) int rtmp_drain_stream(int fd, Stream* s) {
    for (size_t i = 0; i < s->frame_count; ++i)
        rtmp_send_packet(fd, &s->frames[i]);
    rtmp_flush(fd);
    return (int)s->frame_count;
}
