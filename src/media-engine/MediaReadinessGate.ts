import type { TierId } from "./types";

export type ReadinessGateConfig = {
  maxConcurrency: number;
  maxGateMs: number;
  /** Inclusive last index of opening neighbourhood (0..N). */
  neighbourhood: number;
  anchorStride: number;
};

export const READINESS_GATE_BY_TIER: Record<TierId, ReadinessGateConfig> = {
  "desktop-standard": {
    maxConcurrency: 6,
    maxGateMs: 8000,
    neighbourhood: 8,
    anchorStride: 18,
  },
  "desktop-lite": {
    maxConcurrency: 5,
    maxGateMs: 7000,
    neighbourhood: 8,
    anchorStride: 18,
  },
  mobile: {
    maxConcurrency: 4,
    maxGateMs: 6000,
    neighbourhood: 10,
    anchorStride: 18,
  },
};

/** Minimum loader visible duration for visual stability. */
export const READINESS_MIN_VISIBLE_MS = 500;

export type ReadinessTargetPct = 90 | 95 | 100;

export const VALID_READINESS_TARGETS: ReadinessTargetPct[] = [90, 95, 100];

export type ReadinessReleaseReason =
  | "full-ready"
  | "threshold-ready-90"
  | "threshold-ready-95"
  | "threshold-ready-100"
  | "timeout-partial"
  | "save-data-bypass"
  | "failure-fallback"
  | "disabled";

/** Production default — 90% unique compressed frames for all tiers. */
export const PRODUCTION_READINESS_TARGET: ReadinessTargetPct = 90;

export const PRODUCTION_READINESS_TARGET_BY_TIER: Record<
  TierId,
  ReadinessTargetPct
> = {
  "desktop-standard": 90,
  "desktop-lite": 90,
  mobile: 90,
};

/** Production: readiness gate on for ordinary visits. */
export const READINESS_GATE_DEFAULT_ENABLED = true;

export type ReadinessGateRead = {
  requested: string | null;
  enabled: boolean;
  ignoreReason: string | null;
};

export type ReadinessTargetRead = {
  requested: string | null;
  /** Production default 90; debug may override to 95/100 when mediaDebug=1. */
  target: ReadinessTargetPct;
  ignoreReason: string | null;
};

export function readMediaDebugFlag(
  search: string = typeof window !== "undefined"
    ? window.location.search
    : "",
): boolean {
  try {
    return new URLSearchParams(search).get("mediaDebug") === "1";
  } catch {
    return false;
  }
}

/**
 * Production: enabled by default.
 * `?mediaReadinessGate=0` disables (debug baseline).
 * `?mediaReadinessGate=1` is redundant but accepted.
 */
export function readReadinessGateFlag(
  search: string = typeof window !== "undefined"
    ? window.location.search
    : "",
): ReadinessGateRead {
  let requested: string | null = null;
  try {
    requested = new URLSearchParams(search).get("mediaReadinessGate");
  } catch {
    return {
      requested: null,
      enabled: READINESS_GATE_DEFAULT_ENABLED,
      ignoreReason: null,
    };
  }
  if (requested == null || requested === "") {
    return {
      requested: null,
      enabled: READINESS_GATE_DEFAULT_ENABLED,
      ignoreReason: null,
    };
  }
  if (requested === "1") {
    return { requested, enabled: true, ignoreReason: null };
  }
  if (requested === "0") {
    return { requested, enabled: false, ignoreReason: null };
  }
  return {
    requested,
    enabled: READINESS_GATE_DEFAULT_ENABLED,
    ignoreReason: `invalid mediaReadinessGate=${requested}`,
  };
}

/**
 * Production target is 90% for all tiers.
 * `?mediaReadinessTarget=90|95|100` overrides only when `?mediaDebug=1`.
 */
export function readReadinessTarget(
  search: string = typeof window !== "undefined"
    ? window.location.search
    : "",
): ReadinessTargetRead {
  let requested: string | null = null;
  try {
    requested = new URLSearchParams(search).get("mediaReadinessTarget");
  } catch {
    return {
      requested: null,
      target: PRODUCTION_READINESS_TARGET,
      ignoreReason: null,
    };
  }
  if (requested == null || requested === "") {
    return {
      requested: null,
      target: PRODUCTION_READINESS_TARGET,
      ignoreReason: null,
    };
  }
  const debug = readMediaDebugFlag(search);
  if (!debug) {
    return {
      requested,
      target: PRODUCTION_READINESS_TARGET,
      ignoreReason: "mediaReadinessTarget requires mediaDebug=1",
    };
  }
  const n = Number(requested);
  if (n === 90 || n === 95 || n === 100) {
    return { requested, target: n, ignoreReason: null };
  }
  return {
    requested,
    target: PRODUCTION_READINESS_TARGET,
    ignoreReason: `invalid mediaReadinessTarget=${requested}`,
  };
}

/**
 * Fetch order: frame 0 → opening neighbourhood → evenly spaced anchors → fill gaps.
 */
export function buildReadinessFetchOrder(
  frameCount: number,
  neighbourhood: number,
  anchorStride: number,
): number[] {
  if (frameCount <= 0) return [];
  const seen = new Set<number>();
  const order: number[] = [];
  const add = (i: number) => {
    if (i < 0 || i >= frameCount || seen.has(i)) return;
    seen.add(i);
    order.push(i);
  };

  add(0);
  for (let i = 1; i <= neighbourhood && i < frameCount; i++) add(i);

  for (const a of buildAnchorIndexes(frameCount, anchorStride)) add(a);

  for (let i = 0; i < frameCount; i++) add(i);
  return order;
}

/** Evenly spaced anchors + last frame — used for 100% timeline coverage. */
export function buildAnchorIndexes(
  frameCount: number,
  anchorStride: number,
): number[] {
  if (frameCount <= 0) return [];
  const stride = Math.max(1, anchorStride);
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (i: number) => {
    if (i < 0 || i >= frameCount || seen.has(i)) return;
    seen.add(i);
    out.push(i);
  };
  for (let i = 0; i < frameCount; i += stride) add(i);
  add(frameCount - 1);
  return out;
}

export function thresholdReleaseReason(
  target: ReadinessTargetPct,
): ReadinessReleaseReason {
  if (target === 90) return "threshold-ready-90";
  if (target === 95) return "threshold-ready-95";
  return "threshold-ready-100";
}

/** Minimum unique cached frames required for a percentage target (frame-based, not bytes). */
export function minUniqueFramesForTarget(
  totalFrames: number,
  targetPct: ReadinessTargetPct,
): number {
  if (totalFrames <= 0) return 0;
  return Math.ceil((totalFrames * targetPct) / 100);
}

/** remaining unique indexes = total − completed unique cached indexes */
export function uniqueFramesRemaining(
  totalFrames: number,
  completedUnique: number,
): number {
  return Math.max(0, totalFrames - Math.max(0, completedUnique));
}

export type ThresholdPredicateInput = {
  tierKnown: boolean;
  frame0Fetched: boolean;
  /** Proven by first successful canvas draw (warmer does not decode). */
  frame0Decoded: boolean;
  firstCanvasDraw: boolean;
  openingNeighbourhoodComplete: boolean;
  anchorsComplete: boolean;
  completedUniqueFrames: number;
  totalFrames: number;
  completedBytePct: number;
  criticalFailureCount: number;
  minVisibleMet: boolean;
  gateActive: boolean;
  fadeRequested: boolean;
  thresholdReleaseRequested: boolean;
  timeoutFired: boolean;
  targetPct: ReadinessTargetPct | null;
};

export type ThresholdPredicateResult = ThresholdPredicateInput & {
  completedFramePct: number;
  framesRemaining: number;
  minFramesRequired: number | null;
  eligible: boolean;
  blockingReason: string | null;
};

/**
 * Pure threshold eligibility — uses unique cached frame indexes only.
 * Byte percentage is informational and never gates release.
 */
export function evaluateThresholdPredicate(
  input: ThresholdPredicateInput,
): ThresholdPredicateResult {
  const completedFramePct =
    input.totalFrames > 0
      ? Math.min(1, input.completedUniqueFrames / input.totalFrames) * 100
      : 0;
  const framesRemaining = uniqueFramesRemaining(
    input.totalFrames,
    input.completedUniqueFrames,
  );
  const minFramesRequired =
    input.targetPct != null
      ? minUniqueFramesForTarget(input.totalFrames, input.targetPct)
      : null;

  const block = (reason: string): ThresholdPredicateResult => ({
    ...input,
    completedFramePct,
    framesRemaining,
    minFramesRequired,
    eligible: false,
    blockingReason: reason,
  });

  if (input.fadeRequested || input.thresholdReleaseRequested) {
    return block("already-released");
  }
  if (!input.gateActive) return block("gate-inactive");
  if (input.timeoutFired) return block("timeout-fired");
  if (input.targetPct == null) return block("no-target");
  if (!input.tierKnown) return block("tier-unknown");
  if (input.criticalFailureCount > 0) return block("critical-failure");
  if (!input.frame0Fetched) return block("frame0-not-fetched");
  if (!input.frame0Decoded || !input.firstCanvasDraw) {
    return block("first-draw-pending");
  }
  if (!input.openingNeighbourhoodComplete) {
    return block("neighbourhood-incomplete");
  }
  if (!input.anchorsComplete) return block("anchors-incomplete");
  if (
    minFramesRequired != null &&
    input.completedUniqueFrames < minFramesRequired
  ) {
    return block("below-frame-target");
  }
  if (!input.minVisibleMet) return block("min-visible");

  return {
    ...input,
    completedFramePct,
    framesRemaining,
    minFramesRequired,
    eligible: true,
    blockingReason: null,
  };
}
