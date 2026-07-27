/** Tunable hero scroll-scrub settings */

/** Shorter than desktop — better thumb travel; still long enough for smooth scrub. */
export const SCROLL_HEIGHT_MOBILE = "1200vh";
/** ~2.7× original 740vh — slower frame velocity for fluid 1440p scrub. */
export const SCROLL_HEIGHT_DESKTOP = "2000vh";

/** First 90% of scrub maps to frames; last 10% shares scroll with contact reveal */
export const VIDEO_HANDOFF = 0.9;
export const SCRUB_HANDOFF_START = 0.78;

/** Mobile hero: 1080p H.264 MP4 + WebCodecs canvas scrub. */
export const HERO_MOBILE_SCRUB_VIDEO = "/videos/hero-mobile-scrub.mp4";
export const HERO_MOBILE_SCRUB_POSTER = "/videos/hero-mobile-scrub-poster.jpg";

/** Mobile scrub clip: 6s @ 60fps — quantize seeks to these frame boundaries. */
export const MOBILE_SCRUB_FRAME_COUNT = 360;
export const MOBILE_SCRUB_FPS = 60;
/** Min ms between video seek attempts on mobile. */
export const MOBILE_SEEK_INTERVAL_MS = 70;

/**
 * Prefer decode-all for small sequences (≤ DECODE_ALL_MAX_FRAMES).
 * Desktop (~360 @ 1440p) uses decode-all WebP canvas scrub.
 */
export const DECODE_ALL_FRAMES = true;

/** Above this frame count, force sliding-window even if DECODE_ALL_FRAMES is true. */
export const DECODE_ALL_MAX_FRAMES = 400;

/**
 * Half-width of the decoded sliding window / first-window loader gate (desktop).
 * Ignored for eviction when decode-all is active — still gates loader ready.
 */
export const PRELOAD_WINDOW = 40;

/** Smaller first-window loader gate on mobile (legacy — mobile uses MP4 now). */
export const PRELOAD_WINDOW_MOBILE = 20;

/** Playhead-priority band (±frames) loaded first during decode-all fill. */
export const PRELOAD_PLAYHEAD_BAND = 24;

/** Extra frames loaded in the current scroll direction (windowed mode). */
export const PRELOAD_AHEAD_BOOST = 56;

/** Tighter ahead band on mobile windowed path. */
export const PRELOAD_AHEAD_BOOST_MOBILE = 28;

/**
 * Hard cap on decoded frames kept in RAM when windowed (not decode-all).
 */
export const PRELOAD_MAX_DECODED = 140;

/** Stricter RAM budget for phones (~80 decoded ≈ manageable at 900px wide). */
export const PRELOAD_MAX_DECODED_MOBILE = 80;

/**
 * Runtime decode long-edge cap. `null` = native extract size (true 1440p /
 * max quality — never downscale). Desktop uses null; mobile overrides.
 */
export const DECODE_MAX_WIDTH: number | null = null;

/**
 * Mobile runtime decode width. Unused — mobile hero is MP4 scrub, not WebP.
 */
export const DECODE_MAX_WIDTH_MOBILE: number | null = null;

/** Parallel in-flight frame fetches (desktop / decode-all). */
export const PRELOAD_MAX_CONCURRENT = 16;

/** Parallel in-flight fetches while mobile decode-all fills in the background. */
export const PRELOAD_MAX_CONCURRENT_MOBILE = 12;

/** Max extra ahead frames added from scroll velocity (windowed mode only). */
export const PRELOAD_VELOCITY_AHEAD_MAX = 72;

/** Cap retina backing store (desktop). */
export const CANVAS_MAX_DPR = 2;

/** Cap retina backing store on phones — big fill-rate win. */
export const CANVAS_MAX_DPR_MOBILE = 1.25;

/** Subtle scroll-linked canvas tilt (degrees) */
export const CANVAS_ROTATE_MAX = 1.5;

/** Subtle depth zoom across full scrub */
export const CANVAS_SCALE_DEPTH = 0.02;

export const HERO_SEQUENCE_PATHS = {
  desktop: "/hero-sequences/desktop",
  mobile: "/hero-sequences/mobile",
} as const;
