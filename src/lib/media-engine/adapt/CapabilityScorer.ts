import type { CapabilityScore, DeviceClass, QualityTierId } from "../types";

const WC_FAIL_KEY = "media-engine-wc-failed";

export function markWebCodecsFailure() {
  try {
    localStorage.setItem(WC_FAIL_KEY, "1");
  } catch {
    /* private */
  }
}

export function clearWebCodecsFailure() {
  try {
    localStorage.removeItem(WC_FAIL_KEY);
  } catch {
    /* private */
  }
}

function hadFailure() {
  try {
    return localStorage.getItem(WC_FAIL_KEY) === "1";
  } catch {
    return false;
  }
}

function readDeviceMemory(): number | null {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
}

function readSaveData(): boolean {
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean };
  }).connection;
  return Boolean(conn?.saveData);
}

/**
 * Runtime capability scoring — not UA sniffing.
 * Soft signals only; hard WC support is verified later with isConfigSupported.
 */
export function scoreCapabilities(
  deviceClass: DeviceClass = "desktop",
): CapabilityScore {
  const hasVideoDecoder = typeof VideoDecoder !== "undefined";
  const hasOffscreenCanvas = typeof OffscreenCanvas !== "undefined";
  const deviceMemoryGb = readDeviceMemory();
  const hardwareConcurrency = navigator.hardwareConcurrency || 2;
  const devicePixelRatio = window.devicePixelRatio || 1;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const saveData = readSaveData();
  const priorWebCodecsFailure = hadFailure();

  let score = 100;
  if (!hasVideoDecoder) score -= 100;
  if (priorWebCodecsFailure) score -= 80;
  if (deviceClass === "mobile") score -= 20;
  if (coarsePointer) score -= 12;
  if (saveData) score -= 25;
  if (deviceMemoryGb !== null && deviceMemoryGb < 4) score -= 30;
  if (deviceMemoryGb !== null && deviceMemoryGb < 6 && deviceClass === "mobile") {
    score -= 12;
  }
  if (hardwareConcurrency < 4) score -= 18;
  if (hardwareConcurrency < 6 && deviceClass === "mobile") score -= 8;

  const preferWebCodecs =
    hasVideoDecoder &&
    !prefersReducedMotion &&
    score >= (deviceClass === "mobile" ? 55 : 40);

  const recommendedTier: QualityTierId[] =
    deviceClass === "mobile"
      ? ["m900"]
      : score >= 60
        ? ["d1440", "d1080"]
        : ["d1080"];

  const initialPresentFps =
    deviceClass === "mobile" ? 30 : score >= 50 ? 60 : 30;

  const initialBufferBudgetFrames = Math.round(
    Math.min(
      48,
      Math.max(
        8,
        (deviceMemoryGb ?? 4) * (deviceClass === "mobile" ? 3 : 6) *
          (score / 100),
      ),
    ),
  );

  const maxDpr =
    deviceClass === "mobile"
      ? Math.min(1.5, devicePixelRatio)
      : Math.min(2, devicePixelRatio);

  return {
    score,
    preferWebCodecs,
    hasVideoDecoder,
    hasOffscreenCanvas,
    deviceMemoryGb,
    hardwareConcurrency,
    devicePixelRatio,
    coarsePointer,
    prefersReducedMotion,
    saveData,
    priorWebCodecsFailure,
    recommendedTier,
    initialPresentFps,
    initialBufferBudgetFrames,
    maxDpr,
  };
}
