import type { MediaAsset, CapabilityScore } from "../types";

export type PreflightResult = {
  decodingSupported: boolean | null;
  smoothSupported: boolean | null;
  powerEfficient: boolean | null;
  score: number;
};

/**
 * Soft MediaCapabilities probe before full asset fetch.
 * Benchmark remains authority; this only nudges conservative boot.
 */
export async function preflightAsset(
  asset: MediaAsset,
  capability: CapabilityScore,
): Promise<PreflightResult> {
  const nav = navigator as Navigator & {
    mediaCapabilities?: {
      decodingInfo: (config: MediaDecodingConfiguration) => Promise<{
        supported: boolean;
        smooth?: boolean;
        powerEfficient?: boolean;
      }>;
    };
  };

  if (!nav.mediaCapabilities?.decodingInfo || !asset.width || !asset.height) {
    return {
      decodingSupported: null,
      smoothSupported: null,
      powerEfficient: null,
      score: 50,
    };
  }

  try {
    const config: MediaDecodingConfiguration = {
      type: "file",
      video: {
        contentType: 'video/mp4; codecs="avc1.640028"',
        width: asset.width,
        height: asset.height,
        bitrate: asset.bitrate ?? 8_000_000,
        framerate: asset.fps ?? 30,
      },
    };
    const info = await nav.mediaCapabilities.decodingInfo(config);
    let score = 50;
    if (info.supported) score += 25;
    if (info.smooth) score += 15;
    if (info.powerEfficient) score += 10;
    if (capability.network.saveData) score -= 20;
    if (capability.battery.lowPower) score -= 15;
    return {
      decodingSupported: info.supported,
      smoothSupported: info.smooth ?? null,
      powerEfficient: info.powerEfficient ?? null,
      score: Math.max(0, Math.min(100, score)),
    };
  } catch {
    return {
      decodingSupported: null,
      smoothSupported: null,
      powerEfficient: null,
      score: 50,
    };
  }
}
