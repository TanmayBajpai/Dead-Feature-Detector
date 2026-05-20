// deprecated_api.cpp — interprocedural dead functions (deprecated v1 demux API).
//
// The original v1 stream API was superseded by the Stream/Frame interface used
// by the live pipeline. These shims were kept "just in case" and never deleted.
// Nothing live calls them, so BFS from main never reaches them.
#include <stdio.h>
#include <string.h>
#include "streamd.h"

static __attribute__((used)) int old_open_stream(const char* path) {
    printf("v1 open_stream %s\n", path);
    return path ? 1 : -1;
}

static __attribute__((used)) int old_read_frame(int handle, Frame* out) {
    out->width = 640; out->height = 480; out->size = 640 * 480;
    printf("v1 read_frame handle=%d\n", handle);
    return 0;
}

static __attribute__((used)) int old_seek(int handle, int64_t pts) {
    printf("v1 seek handle=%d pts=%lld\n", handle, (long long)pts);
    return 0;
}

static __attribute__((used)) void old_close(int handle) {
    printf("v1 close handle=%d\n", handle);
}

static __attribute__((used)) int old_read_metadata(int handle, char* buf, size_t n) {
    const char* m = "title=demo;codec=h264";
    strncpy(buf, m, n);
    printf("v1 metadata handle=%d\n", handle);
    return (int)strlen(m);
}

// Transitive: calls old_open_stream + old_read_frame + old_close (all dead).
static __attribute__((used)) int old_generate_thumbnail(const char* path, Frame* out) {
    int h = old_open_stream(path);
    old_read_frame(h, out);
    old_close(h);
    printf("v1 thumbnail %s -> %dx%d\n", path, out->width, out->height);
    return 0;
}
