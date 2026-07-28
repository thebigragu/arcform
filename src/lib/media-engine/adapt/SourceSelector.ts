import type { CapabilityScore, LadderTier, MediaLadderManifest } from "../types";

const DEFAULT_LADDER = "/videos/media-ladder/media-ladder.json";

export async function loadLadder(
  url = DEFAULT_LADDER,
): Promise<MediaLadderManifest> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`ladder ${res.status}`);
  return (await res.json()) as MediaLadderManifest;
}

/** Pick best tier for device class + score (first recommended that exists). */
export function selectTier(
  manifest: MediaLadderManifest,
  capability: CapabilityScore,
  deviceClass: "desktop" | "mobile",
  preferredTiers?: CapabilityScore["recommendedTier"],
): LadderTier {
  const pool = manifest.tiers.filter((t) => t.device === deviceClass);
  const preference = preferredTiers?.length
    ? preferredTiers
    : capability.recommendedTier;
  const ordered = preference
    .map((id) => pool.find((t) => t.id === id))
    .filter(Boolean) as LadderTier[];

  if (ordered[0]) return ordered[0];
  if (pool.length === 0) {
    const any = manifest.tiers[0];
    if (!any) throw new Error("Empty media ladder");
    return any;
  }
  // Prefer smaller on weak, larger on strong
  const sorted = [...pool].sort((a, b) =>
    capability.score >= 60 ? b.maxWidth - a.maxWidth : a.maxWidth - b.maxWidth,
  );
  return sorted[0]!;
}

/**
 * Reserved for Future dual-pipeline quality switcher.
 * Runtime adaptation must not pretend this reloads a smaller MP4.
 */
export function downshiftTier(
  manifest: MediaLadderManifest,
  current: LadderTier,
): LadderTier | null {
  const same = manifest.tiers
    .filter((t) => t.device === current.device)
    .sort((a, b) => b.maxWidth - a.maxWidth);
  const idx = same.findIndex((t) => t.id === current.id);
  if (idx < 0 || idx >= same.length - 1) return null;
  return same[idx + 1] ?? null;
}
