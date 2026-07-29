"use client";

import { useHeroPreloadOptional } from "@/context/HeroPreloadContext";
import { useHeroMobileVideo } from "@/hooks/useIsMobile";
import { coldStartTelemetry, HERO_POSTER_FALLBACK } from "@/media-engine";
import { useEffect } from "react";

/**
 * Gate 1 poster warm — single high-priority request for the form-factor poster.
 * URL must match MediaView poster src byte-for-byte.
 */
export function HeroPosterPreload() {
  const preload = useHeroPreloadOptional();
  const mobile = useHeroMobileVideo();

  useEffect(() => {
    if (!preload?.heroRequired || mobile === null) return;
    const posterSrc = mobile
      ? HERO_POSTER_FALLBACK.mobile
      : HERO_POSTER_FALLBACK.desktop;
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
  }, [preload, mobile]);

  return null;
}
