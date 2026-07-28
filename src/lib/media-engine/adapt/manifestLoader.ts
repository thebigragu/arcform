import type {
  LadderTier,
  MediaAsset,
  MediaLadderManifest,
  MediaManifestV4,
  UnifiedMediaManifest,
} from "../types";

export function manifestUrlForMediaId(mediaId: string) {
  return `/videos/media/${mediaId}/manifest.json`;
}

function scrubAssetsToTiers(assets: MediaAsset[]): LadderTier[] {
  return assets
    .filter((a) => a.intent === "scrub" && a.tierId && a.device)
    .map((a) => ({
      id: a.tierId!,
      device: a.device!,
      maxWidth: a.maxWidth ?? a.width ?? 0,
      src: a.src,
      poster: a.poster ?? "",
      width: a.width ?? 0,
      height: a.height ?? 0,
      duration: a.duration ?? 0,
      fps: a.fps ?? 30,
      frameCount: a.frameCount ?? 0,
      bytes: a.bytes ?? 0,
    }));
}

function normalizeV4(raw: MediaManifestV4, url: string): UnifiedMediaManifest {
  return {
    version: 4,
    mediaId: raw.mediaId,
    fpsSource: raw.fpsSource,
    gop: raw.gop,
    codec: raw.codec,
    tiers: scrubAssetsToTiers(raw.assets),
    defaults: raw.defaults,
    assets: raw.assets,
    manifestUrl: url,
  };
}

function normalizeV3(raw: MediaLadderManifest, url: string): UnifiedMediaManifest {
  return {
    version: raw.version,
    fpsSource: raw.fpsSource,
    gop: raw.gop,
    codec: raw.codec,
    tiers: raw.tiers,
    assets: raw.tiers.map((t) => ({
      id: `scrub-${t.id}`,
      intent: "scrub" as const,
      device: t.device,
      tierId: t.id,
      maxWidth: t.maxWidth,
      src: t.src,
      poster: t.poster,
      width: t.width,
      height: t.height,
      duration: t.duration,
      fps: t.fps,
      frameCount: t.frameCount,
      bytes: t.bytes,
    })),
    manifestUrl: url,
  };
}

export async function loadManifest(options?: {
  mediaId?: string;
  ladderUrl?: string;
  /** Optional legacy v3 ladder URL; only used when explicitly provided. */
  legacyLadderUrl?: string;
}): Promise<UnifiedMediaManifest> {
  const urls: string[] = [];
  if (options?.mediaId) urls.push(manifestUrlForMediaId(options.mediaId));
  if (options?.ladderUrl) urls.push(options.ladderUrl);
  if (options?.legacyLadderUrl) urls.push(options.legacyLadderUrl);

  if (urls.length === 0) {
    throw new Error(
      "loadManifest requires mediaId, ladderUrl, or legacyLadderUrl",
    );
  }

  let lastError: Error | null = null;
  for (const url of [...new Set(urls)]) {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) {
        lastError = new Error(`manifest ${url} ${res.status}`);
        continue;
      }
      const raw = (await res.json()) as MediaLadderManifest | MediaManifestV4;
      if (raw.version === 4 && "assets" in raw) {
        return normalizeV4(raw as MediaManifestV4, url);
      }
      if (Array.isArray((raw as MediaLadderManifest).tiers)) {
        return normalizeV3(raw as MediaLadderManifest, url);
      }
      lastError = new Error(`unsupported manifest at ${url}`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("No media manifest available");
}

/** @deprecated Use loadManifest */
export async function loadLadder(url: string) {
  const m = await loadManifest({ ladderUrl: url });
  return {
    version: m.version,
    fpsSource: m.fpsSource,
    gop: m.gop,
    crf: 21,
    codec: m.codec,
    tiers: m.tiers,
  } satisfies MediaLadderManifest;
}

export function playbackAssetForDevice(
  manifest: UnifiedMediaManifest,
  deviceClass: "desktop" | "mobile",
): MediaAsset | null {
  return (
    manifest.assets.find(
      (a) => a.intent === "playback" && a.device === deviceClass,
    ) ?? null
  );
}

export function posterForDevice(
  manifest: UnifiedMediaManifest | null,
  deviceClass: "desktop" | "mobile",
  fallback: { desktop: string; mobile: string },
) {
  if (manifest?.defaults?.poster) {
    return deviceClass === "mobile"
      ? manifest.defaults.poster.mobile
      : manifest.defaults.poster.desktop;
  }
  const tier = manifest?.tiers.find((t) => t.device === deviceClass);
  if (tier?.poster) return tier.poster;
  return deviceClass === "mobile" ? fallback.mobile : fallback.desktop;
}
