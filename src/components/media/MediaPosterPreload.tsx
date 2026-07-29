"use client";

/**
 * Poster warm — single high-priority request for the form-factor poster.
 * URL must match MediaView poster src byte-for-byte.
 *
 * Adapted from the Website's src/components/hero/HeroPosterPreload.tsx
 * (packaging-changes.md item 1): generic MediaPreloadContext + mediaId prop
 * instead of a hardcoded hero poster fallback.
 */
import { useMediaPreloadOptional } from "@/context/MediaPreloadContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { coldStartTelemetry, HERO_POSTER_FALLBACK } from "@/media-engine";
import { useEffect } from "react";

export function MediaPosterPreload({
  posterFallback = HERO_POSTER_FALLBACK,
}: {
  posterFallback?: { desktop: string; mobile: string };
}) {
  const preload = useMediaPreloadOptional();
  const mobile = useIsMobile();

  useEffect(() => {
    if (!preload?.mediaRequired || mobile === null) return;
    const posterSrc = mobile ? posterFallback.mobile : posterFallback.desktop;
    coldStartTelemetry.posterHintUrl = posterSrc;
    coldStartTelemetry.frame0HintUrl = "none";
    coldStartTelemetry.notePosterRuntimeStart(posterSrc);

    const img = new Image();
    img.fetchPriority = "high";
    img.decoding = "async";
    img.onload = () => {
      coldStartTelemetry.notePosterRuntimeEnd();
      preload.signalPosterReady();
    };
    img.onerror = () => {
      coldStartTelemetry.notePosterRuntimeEnd();
      preload.signalPosterReady();
    };
    img.src = posterSrc;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [preload, mobile, posterFallback]);

  return null;
}
