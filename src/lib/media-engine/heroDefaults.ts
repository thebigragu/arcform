/**
 * Project-adaptable hero media id + poster fallbacks for this site.
 * Core loading APIs live in mediaDefaults.ts (skill-aligned).
 */
import type { MediaManifestDefaults } from "./types";
import {
  loadMediaDefaults,
  mediaManifestUrl,
  mediaPosterPath,
} from "./mediaDefaults";

export const HERO_MEDIA_ID = "hero";

export const HERO_POSTER_FALLBACK: MediaManifestDefaults["poster"] = {
  desktop: "/videos/media/hero/posters/desktop-poster.webp",
  mobile: "/videos/media/hero/posters/mobile-poster.webp",
};

export const HERO_MANIFEST_URL = mediaManifestUrl(HERO_MEDIA_ID);

export async function loadHeroDefaults(): Promise<MediaManifestDefaults> {
  return loadMediaDefaults(HERO_MEDIA_ID, HERO_POSTER_FALLBACK);
}

export function heroPosterPath(
  deviceClass: "desktop" | "mobile",
  defaults?: MediaManifestDefaults,
) {
  if (defaults) return mediaPosterPath(deviceClass, defaults);
  return deviceClass === "mobile"
    ? HERO_POSTER_FALLBACK.mobile
    : HERO_POSTER_FALLBACK.desktop;
}
