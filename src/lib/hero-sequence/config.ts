/** Tunable hero scroll-scrub settings */

export const SCROLL_HEIGHT_MOBILE = "340vh";
export const SCROLL_HEIGHT_DESKTOP = "740vh";

/** First 90% of scrub maps to frames; last 10% shares scroll with contact reveal */
export const VIDEO_HANDOFF = 0.9;
export const SCRUB_HANDOFF_START = 0.78;

/**
 * Half-width of the decoded sliding window around the playhead.
 * Peak decoded is capped by PRELOAD_MAX_DECODED (budget eviction).
 */
export const PRELOAD_WINDOW = 40;

/** Extra frames loaded in the current scroll direction (asymmetric prefetch). */
export const PRELOAD_AHEAD_BOOST = 56;

/**
 * Hard cap on decoded frames kept in RAM. Soft-evict farthest from the
 * playhead when over budget (trail survives fast jumps without O(N) decode).
 */
export const PRELOAD_MAX_DECODED = 140;

/**
 * Runtime decode long-edge cap. Extract may keep 4K on disk; decoded
 * bitmaps are resized to this so the sliding window stays RAM-safe.
 */
export const DECODE_MAX_WIDTH = 1600;

/** Parallel in-flight frame fetches (same local + production path). */
export const PRELOAD_MAX_CONCURRENT = 16;

/** Max extra ahead frames added from scroll velocity. */
export const PRELOAD_VELOCITY_AHEAD_MAX = 72;

/** Cap retina backing store */
export const CANVAS_MAX_DPR = 2;

/** Subtle scroll-linked canvas tilt (degrees) */
export const CANVAS_ROTATE_MAX = 1.5;

/** Subtle depth zoom across full scrub */
export const CANVAS_SCALE_DEPTH = 0.02;

export const HERO_SEQUENCE_PATHS = {
  desktop: "/hero-sequences/desktop",
  mobile: "/hero-sequences/mobile",
} as const;
