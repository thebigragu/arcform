import type { TierId } from "./types";

/** Gate 1 runtime decoded-cache limits (manifest + runtime + certify must agree). */
export const RUNTIME_DECODED_CACHE_MAX: Record<TierId, number> = {
  "desktop-standard": 8,
  "desktop-lite": 6,
  mobile: 6,
};

export function runtimeDecodedCacheMax(tierId: TierId): number {
  return RUNTIME_DECODED_CACHE_MAX[tierId];
}
