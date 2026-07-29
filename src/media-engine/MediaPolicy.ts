import type { DeviceClass, TierId } from "./types";
import type { TierOverrideRead } from "./MediaTierOverride";

/**
 * Physically verified mainstream / lower-performance desktop class.
 * 16 GB / 12-core laptop → desktop-lite; 32 GB / 24-core → desktop-standard.
 */
export const DESKTOP_LITE_MAX_MEMORY_GB = 16;
export const DESKTOP_LITE_MAX_LOGICAL_CORES = 12;

/**
 * When deviceMemory is unavailable, only treat cores at or below this as
 * clearly low. Avoids broad untested downgrades on incomplete-API devices.
 */
export const DESKTOP_LITE_FALLBACK_MAX_CORES_WHEN_MEM_UNKNOWN = 8;

export type PolicyInput = {
  deviceClass: DeviceClass;
  reducedMotion: boolean;
  saveData: boolean;
  cssWidth: number;
  cssHeight: number;
  dprRequested: number;
  dprApplied: number;
  canvasBackingWidth: number;
  canvasBackingHeight: number;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
};

export type PolicyResult =
  | { mode: "poster"; reason: string }
  | { mode: "sequence"; tierId: TierId; reason: string };

export type CommittedTier = {
  mode: "poster" | "sequence";
  tierId: TierId | "poster";
  policyTier: TierId | "poster";
  policyReason: string;
  override: TierOverrideRead;
  committedReason: string;
  overrideAccepted: boolean;
};

/**
 * One-shot tier selection for Gate 1. No benchmarks. Session-committed elsewhere.
 */
export function selectTier(
  input: Pick<
    PolicyInput,
    | "deviceClass"
    | "reducedMotion"
    | "saveData"
    | "cssWidth"
    | "deviceMemoryGb"
    | "hardwareConcurrency"
  >,
): PolicyResult {
  if (input.reducedMotion) {
    return { mode: "poster", reason: "reduced-motion" };
  }
  if (input.saveData) {
    return { mode: "poster", reason: "save-data" };
  }
  if (input.deviceClass === "mobile") {
    return { mode: "sequence", tierId: "mobile", reason: "mobile→mobile" };
  }

  const mem = input.deviceMemoryGb;
  const cores = input.hardwareConcurrency;

  if (input.cssWidth < 1100 || (mem != null && mem <= 4)) {
    return {
      mode: "sequence",
      tierId: "desktop-lite",
      reason:
        mem != null && mem <= 4
          ? `desktop-constrained→lite (cssWidth=${input.cssWidth}, deviceMemory=${mem}GB)`
          : `desktop-constrained→lite (cssWidth=${input.cssWidth}<1100)`,
    };
  }

  // Physically verified lower-performance desktop class (both signals required)
  if (
    mem != null &&
    cores != null &&
    mem <= DESKTOP_LITE_MAX_MEMORY_GB &&
    cores <= DESKTOP_LITE_MAX_LOGICAL_CORES
  ) {
    return {
      mode: "sequence",
      tierId: "desktop-lite",
      reason: `desktop-capability→lite (deviceMemory=${mem}GB≤${DESKTOP_LITE_MAX_MEMORY_GB}, hardwareConcurrency=${cores}≤${DESKTOP_LITE_MAX_LOGICAL_CORES})`,
    };
  }

  // deviceMemory unavailable — do not assume high-end; Lite only when cores clearly low
  if (
    mem == null &&
    cores != null &&
    cores <= DESKTOP_LITE_FALLBACK_MAX_CORES_WHEN_MEM_UNKNOWN
  ) {
    return {
      mode: "sequence",
      tierId: "desktop-lite",
      reason: `desktop-capability→lite (deviceMemory=unavailable, hardwareConcurrency=${cores}≤${DESKTOP_LITE_FALLBACK_MAX_CORES_WHEN_MEM_UNKNOWN} clearly-low)`,
    };
  }

  const memNote =
    mem != null ? `deviceMemory=${mem}GB` : "deviceMemory=unavailable";
  const coresNote =
    cores != null
      ? `hardwareConcurrency=${cores}`
      : "hardwareConcurrency=unavailable";
  return {
    mode: "sequence",
    tierId: "desktop-standard",
    reason: `desktop→standard (cssWidth=${input.cssWidth}≥1100, ${memNote}, ${coresNote})`,
  };
}

export function policyTierLabel(result: PolicyResult): TierId | "poster" {
  return result.mode === "poster" ? "poster" : result.tierId;
}

/**
 * Apply debug override before engine bootstrap. Invalid overrides ignored.
 */
export function resolveCommittedTier(
  policy: PolicyResult,
  override: TierOverrideRead,
  deviceClass: DeviceClass,
): CommittedTier {
  const policyTier = policyTierLabel(policy);

  if (!override.accepted || !override.parsed) {
    if (policy.mode === "poster") {
      return {
        mode: "poster",
        tierId: "poster",
        policyTier,
        policyReason: policy.reason,
        override,
        committedReason: policy.reason,
        overrideAccepted: false,
      };
    }
    return {
      mode: "sequence",
      tierId: policy.tierId,
      policyTier,
      policyReason: policy.reason,
      override,
      committedReason: policy.reason,
      overrideAccepted: false,
    };
  }

  const o = override.parsed;
  if (o === "poster") {
    return {
      mode: "poster",
      tierId: "poster",
      policyTier,
      policyReason: policy.reason,
      override,
      committedReason: `debug-override→poster (policy was ${policyTier})`,
      overrideAccepted: true,
    };
  }

  if (deviceClass === "mobile" && o !== "mobile") {
    return {
      mode: policy.mode,
      tierId: policy.mode === "poster" ? "poster" : policy.tierId,
      policyTier,
      policyReason: policy.reason,
      override,
      committedReason: policy.reason,
      overrideAccepted: false,
    };
  }

  if (deviceClass === "desktop" && o === "mobile") {
    // Debug-only: allow forcing mobile tier on desktop for testing
  }

  if (policy.mode === "poster") {
    return {
      mode: "sequence",
      tierId: o,
      policyTier,
      policyReason: policy.reason,
      override,
      committedReason: `debug-override→${o} (policy was poster)`,
      overrideAccepted: true,
    };
  }

  return {
    mode: "sequence",
    tierId: o,
    policyTier,
    policyReason: policy.reason,
    override,
    committedReason: `debug-override→${o} (policy was ${policyTier})`,
    overrideAccepted: true,
  };
}

export function nextFallbackTier(current: TierId): TierId | "poster" {
  if (current === "desktop-standard") return "desktop-lite";
  return "poster";
}
