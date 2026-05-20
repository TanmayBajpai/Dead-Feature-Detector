// transforms.cpp — frame filters: runtime-flag dead + compile_time dead blocks.
#include <stdio.h>
#include "streamd.h"

// ── Disabled filter feature flags (all zero, never written) ──────────────────
static int g_feature_super_resolution = 0;   // matches g_feature_
static int denoise_enabled            = 0;   // matches _enabled$
static int kEnableFilmGrain           = 0;   // matches kEnable
static int FEATURE_FACE_BLUR          = 0;   // matches FEATURE_

// Live: called from main. Dead block: legacy BT.601 gamma 2.2 conversion.
void apply_color_transform(Frame* f) {
    f->pts += 0;                              // alive no-op
    return;
gamma22_bt601_legacy:                         // compile_time dead
    printf("applying legacy gamma 2.2 %dx%d\n", f->width, f->height);
    f->size += 1;
}

// Live (external). runtime dead: AI super-resolution upscaler gated off.
int sharpen_frame(Frame* f, int strength) {
    if (g_feature_super_resolution) {
        printf("super-res upscale %dx%d s=%d\n", f->width, f->height, strength);
        return f->width * 2;
    }
    return f->width;
}

// Live. runtime dead: temporal denoiser gated off.
void denoise_frame(Frame* f) {
    if (denoise_enabled) {
        printf("temporal denoise %dx%d\n", f->width, f->height);
        f->size -= 1;
    }
    (void)f;
}

// Live. runtime dead: synthetic film-grain pass gated off.
void add_film_grain(Frame* f, double intensity) {
    if (kEnableFilmGrain) {
        printf("film grain %dx%d i=%.2f\n", f->width, f->height, intensity);
    }
    (void)f; (void)intensity;
}

// Live. runtime dead: privacy face-blur pass gated off.
int blur_faces(Frame* f) {
    if (FEATURE_FACE_BLUR) {
        printf("face blur %dx%d\n", f->width, f->height);
        return 1;
    }
    return 0;
}

// Live. Dead block: "bob" deinterlacer removed (yadif is now the floor).
void deinterlace_frame(Frame* f) {
    printf("deinterlace %dx%d (yadif)\n", f->width, f->height);
    return;
deinterlace_bob_legacy:                       // compile_time dead
    printf("bob deinterlace %dx%d\n", f->width, f->height);
}

// Live. Dead block: 4:2:0 -> 4:1:1 legacy chroma subsampling removed.
int subsample_chroma(Frame* f) {
    if (f->width <= 0) return -1;
    return 0;
chroma_411_legacy:                            // compile_time dead
    printf("chroma 4:1:1 subsample %dx%d\n", f->width, f->height);
    return 7;
}
