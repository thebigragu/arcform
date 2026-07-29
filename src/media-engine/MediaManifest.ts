import type { MediaManifestV1, SequenceTier, TierId } from "./types";

export function manifestUrlForMediaId(mediaId: string) {
  return `/media/${mediaId}/manifest.json`;
}

export async function loadManifest(opts: {
  mediaId?: string;
  manifestUrl?: string;
}): Promise<MediaManifestV1> {
  const url =
    opts.manifestUrl ||
    (opts.mediaId ? manifestUrlForMediaId(opts.mediaId) : null);
  if (!url) throw new Error("manifestUrl or mediaId required");
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`manifest ${url} ${res.status}`);
  const raw = (await res.json()) as MediaManifestV1;
  if (!raw.schemaVersion || !Array.isArray(raw.tiers)) {
    throw new Error("invalid Gate 1 manifest");
  }
  if (raw.policy?.allowDesktopHigh) {
    throw new Error("Gate 1 manifest must not allow desktop-high");
  }
  const forbidden = raw.tiers.find((t) => (t.id as string) === "desktop-high");
  if (forbidden) throw new Error("desktop-high tier present in Gate 1 manifest");
  return raw;
}

export function expandFrameUrl(pattern: string, index: number) {
  return pattern.replace("%04d", String(index).padStart(4, "0"));
}

export function tierById(
  manifest: MediaManifestV1,
  id: TierId,
): SequenceTier | null {
  return manifest.tiers.find((t) => t.id === id) ?? null;
}

export const HERO_MEDIA_ID = "hero";
export const HERO_MANIFEST_URL = "/media/hero/manifest.json";
export const HERO_POSTER_FALLBACK = {
  desktop: "/media/hero/posters/desktop-c0c923dbfafe.webp",
  mobile: "/media/hero/posters/mobile-68df5884daf9.webp",
};
