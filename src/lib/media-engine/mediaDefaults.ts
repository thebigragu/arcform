import type { DeviceClass, MediaManifestDefaults } from "./types";
import { manifestUrlForMediaId } from "./adapt/manifestLoader";

/**
 * Load media defaults for a mediaId from its v4 manifest.
 * Callers must supply posterFallback when the manifest is unavailable.
 */
export async function loadMediaDefaults(
  mediaId: string,
  posterFallback?: MediaManifestDefaults["poster"],
): Promise<MediaManifestDefaults> {
  const url = manifestUrlForMediaId(mediaId);
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (res.ok) {
      const raw = await res.json();
      if (raw.version === 4 && raw.defaults?.poster) {
        return raw.defaults as MediaManifestDefaults;
      }
    }
  } catch {
    /* fall through */
  }
  if (!posterFallback) {
    throw new Error(
      `No media defaults for "${mediaId}" and no posterFallback provided`,
    );
  }
  return {
    safeDefaultTier: { desktop: "d1080", mobile: "m720" },
    poster: posterFallback,
    playback: { desktop: "", mobile: "" },
    ladderUrl: url,
  };
}

export function mediaPosterPath(
  deviceClass: DeviceClass,
  defaults: MediaManifestDefaults,
) {
  return deviceClass === "mobile"
    ? defaults.poster.mobile
    : defaults.poster.desktop;
}

export function mediaManifestUrl(mediaId: string) {
  return manifestUrlForMediaId(mediaId);
}
