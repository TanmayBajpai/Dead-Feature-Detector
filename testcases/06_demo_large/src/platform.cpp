// platform.cpp — platform abstraction with compile_time dead fallback blocks.
//
// The live build targets POSIX; the Windows-specific fallback paths below are
// labeled blocks after a return, so they have no CFG predecessors and are
// flagged compile_time dead. The host functions are external (live roots), so
// only the inner blocks are dead.
#include <stdio.h>
#include "streamd.h"

// Live (external). Dead block: WASAPI audio output (Windows-only).
int audio_output_open(int sample_rate) {
    if (sample_rate <= 0) return -1;
    printf("alsa output @ %dHz\n", sample_rate);
    return 0;
win_wasapi_open:                            // compile_time dead
    printf("wasapi exclusive-mode output @ %dHz\n", sample_rate);
    return 1;
}

// Live. Dead block: Direct3D 11 video presentation (Windows-only).
int video_present(Frame* f) {
    printf("vaapi/egl present %dx%d\n", f->width, f->height);
    return 0;
win_d3d11_present:                          // compile_time dead
    printf("d3d11 swapchain present %dx%d\n", f->width, f->height);
    return 1;
}

// Live. Dead block: MMCSS thread-priority boost (Windows-only).
void set_realtime_priority(int tid) {
    printf("posix sched_setscheduler tid=%d\n", tid);
    return;
win_mmcss_boost:                            // compile_time dead
    printf("mmcss 'Pro Audio' boost tid=%d\n", tid);
}
