import type {
  CapabilityScore,
  DeviceCapabilityBand,
  DeviceClass,
  NetworkSignals,
  BatterySignals,
  PresentationRate,
  QualityTierId,
} from "../types";

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

function readNetworkSignals(): NetworkSignals {
  const conn = (
    navigator as Navigator & {
      connection?: {
        saveData?: boolean;
        effectiveType?: string;
        downlink?: number;
      };
    }
  ).connection;

  const saveData = Boolean(conn?.saveData);
  const effectiveType = conn?.effectiveType ?? null;
  const downlinkMbps =
    typeof conn?.downlink === "number" ? conn.downlink : null;

  let estimateScore = 100;
  if (saveData) estimateScore -= 35;
  if (effectiveType === "slow-2g") estimateScore -= 50;
  else if (effectiveType === "2g") estimateScore -= 40;
  else if (effectiveType === "3g") estimateScore -= 25;
  else if (effectiveType === "4g") estimateScore -= 5;
  if (downlinkMbps !== null) {
    if (downlinkMbps < 1) estimateScore -= 30;
    else if (downlinkMbps < 2.5) estimateScore -= 20;
    else if (downlinkMbps < 5) estimateScore -= 10;
  }

  return {
    effectiveType,
    downlinkMbps,
    saveData,
    estimateScore: Math.max(0, estimateScore),
  };
}

function readBatterySignals(): BatterySignals {
  const lowPowerMedia = window.matchMedia("(prefers-reduced-data: reduce)");
  return {
    level: null,
    charging: null,
    lowPower: lowPowerMedia.matches,
  };
}

/** Fire-and-forget battery enrichment when API exists. */
export function enrichBatterySignals(
  signals: BatterySignals,
): Promise<BatterySignals> {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{
      level: number;
      charging: boolean;
    }>;
  };
  if (!nav.getBattery) return Promise.resolve(signals);

  return nav
    .getBattery()
    .then((b) => ({
      level: b.level,
      charging: b.charging,
      lowPower:
        signals.lowPower || (!b.charging && b.level < 0.2),
    }))
    .catch(() => signals);
}

function classifyBand(
  score: number,
  deviceClass: DeviceClass,
  hasVideoDecoder: boolean,
  prefersReducedMotion: boolean,
  network: NetworkSignals,
  battery: BatterySignals,
): DeviceCapabilityBand {
  if (prefersReducedMotion || !hasVideoDecoder) return "minimal";

  let band: DeviceCapabilityBand;
  if (score >= 85) band = "ultra";
  else if (score >= 68) band = "high";
  else if (score >= 48) band = "medium";
  else if (score >= 28) band = "low";
  else band = "minimal";

  if (deviceClass === "mobile" && band === "ultra") band = "high";
  if (deviceClass === "mobile" && score < 42 && band !== "minimal") {
    band = "low";
  }

  if (network.saveData || network.estimateScore < 45) {
    if (band === "ultra") band = "high";
    else if (band === "high") band = "medium";
    else if (band === "medium") band = "low";
  }

  if (battery.lowPower) {
    if (band === "ultra") band = "high";
    else if (band === "high") band = "medium";
    else if (band === "medium") band = "low";
  }

  return band;
}

function bandTierOrder(
  band: DeviceCapabilityBand,
  deviceClass: DeviceClass,
): QualityTierId[] {
  if (deviceClass === "mobile") return ["m900"];

  switch (band) {
    case "ultra":
    case "high":
      return ["d1440", "d1080"];
    case "medium":
      return ["d1080", "d1440"];
    case "low":
    case "minimal":
      return ["d1080"];
    default:
      return ["d1080"];
  }
}

function bandPresentFps(
  band: DeviceCapabilityBand,
  deviceClass: DeviceClass,
): PresentationRate {
  if (deviceClass === "mobile") {
    return band === "minimal" || band === "low" ? 20 : 30;
  }
  switch (band) {
    case "ultra":
    case "high":
      return 60;
    case "medium":
      return 45;
    case "low":
      return 30;
    case "minimal":
      return 20;
    default:
      return 30;
  }
}

function bandBufferBudget(
  band: DeviceCapabilityBand,
  deviceMemoryGb: number | null,
  deviceClass: DeviceClass,
): number {
  const mem = deviceMemoryGb ?? 4;
  const base =
    band === "ultra"
      ? mem * 8
      : band === "high"
        ? mem * 6
        : band === "medium"
          ? mem * 4
          : band === "low"
            ? mem * 3
            : mem * 2;
  const scale = deviceClass === "mobile" ? 0.65 : 1;
  return Math.round(Math.min(48, Math.max(6, base * scale)));
}

function bandMemoryTargetMb(band: DeviceCapabilityBand): number {
  switch (band) {
    case "ultra":
      return 48;
    case "high":
      return 36;
    case "medium":
      return 24;
    case "low":
      return 16;
    case "minimal":
      return 10;
    default:
      return 24;
  }
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
  const network = readNetworkSignals();
  const battery = readBatterySignals();
  const saveData = network.saveData;
  const priorWebCodecsFailure = hadFailure();

  let score = 100;
  if (!hasVideoDecoder) score -= 100;
  if (priorWebCodecsFailure) score -= 80;
  if (deviceClass === "mobile") score -= 12;
  if (coarsePointer) score -= 8;
  if (saveData) score -= 25;
  if (network.estimateScore < 50) score -= 15;
  if (battery.lowPower) score -= 18;
  if (deviceMemoryGb !== null && deviceMemoryGb < 4) score -= 30;
  if (deviceMemoryGb !== null && deviceMemoryGb < 6 && deviceClass === "mobile") {
    score -= 12;
  }
  if (hardwareConcurrency < 4) score -= 18;
  if (hardwareConcurrency < 6 && deviceClass === "mobile") score -= 8;

  score = Math.max(0, Math.min(100, score));

  const band = classifyBand(
    score,
    deviceClass,
    hasVideoDecoder,
    prefersReducedMotion,
    network,
    battery,
  );

  const preferWebCodecs =
    hasVideoDecoder &&
    !prefersReducedMotion &&
    band !== "minimal" &&
    band !== "low" &&
    score >= (deviceClass === "mobile" ? 55 : 40);

  const recommendedTier = bandTierOrder(band, deviceClass);
  const initialPresentFps = bandPresentFps(band, deviceClass);
  const initialBufferBudgetFrames = bandBufferBudget(
    band,
    deviceMemoryGb,
    deviceClass,
  );

  const maxDpr =
    deviceClass === "mobile"
      ? Math.min(1.5, devicePixelRatio)
      : band === "minimal" || band === "low"
        ? Math.min(1.5, devicePixelRatio)
        : Math.min(2, devicePixelRatio);

  return {
    score,
    band,
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
    network,
    battery,
    recommendedTier,
    initialPresentFps,
    initialBufferBudgetFrames,
    memoryBudgetTargetMb: bandMemoryTargetMb(band),
    maxDpr,
  };
}

export function applyBatteryEnrichment(
  capability: CapabilityScore,
  battery: BatterySignals,
  deviceClass: DeviceClass,
): CapabilityScore {
  const band = classifyBand(
    capability.score,
    deviceClass,
    capability.hasVideoDecoder,
    capability.prefersReducedMotion,
    capability.network,
    battery,
  );
  return {
    ...capability,
    battery,
    band,
    recommendedTier: bandTierOrder(band, deviceClass),
    initialPresentFps: bandPresentFps(band, deviceClass),
    initialBufferBudgetFrames: bandBufferBudget(
      band,
      capability.deviceMemoryGb,
      deviceClass,
    ),
    memoryBudgetTargetMb: bandMemoryTargetMb(band),
  };
}
