import type { TierId } from "./types";
import { readMediaDebugFlag } from "./MediaReadinessGate";

export type TierOverrideId = TierId | "poster";

const VALID: TierOverrideId[] = [
  "desktop-standard",
  "desktop-lite",
  "mobile",
  "poster",
];

export type TierOverrideRead = {
  /** Raw query value, if any. */
  requested: string | null;
  /** Parsed override when valid. */
  parsed: TierOverrideId | null;
  /** Whether a valid override was present. */
  accepted: boolean;
  /** Why an invalid value was ignored. */
  ignoreReason: string | null;
};

/**
 * Debug-only tier override from `?mediaTier=…`.
 * Requires `?mediaDebug=1`. No effect on ordinary visits.
 */
export function readTierOverride(
  search: string = typeof window !== "undefined"
    ? window.location.search
    : "",
): TierOverrideRead {
  let requested: string | null = null;
  try {
    requested = new URLSearchParams(search).get("mediaTier");
  } catch {
    return {
      requested: null,
      parsed: null,
      accepted: false,
      ignoreReason: null,
    };
  }
  if (!requested) {
    return {
      requested: null,
      parsed: null,
      accepted: false,
      ignoreReason: null,
    };
  }
  if (!readMediaDebugFlag(search)) {
    return {
      requested,
      parsed: null,
      accepted: false,
      ignoreReason: "mediaTier requires mediaDebug=1",
    };
  }
  const norm = requested.trim().toLowerCase() as TierOverrideId;
  if (!VALID.includes(norm)) {
    return {
      requested,
      parsed: null,
      accepted: false,
      ignoreReason: `invalid mediaTier=${requested}`,
    };
  }
  return {
    requested,
    parsed: norm,
    accepted: true,
    ignoreReason: null,
  };
}
