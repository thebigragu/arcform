"use client";

import { useHeroPreloadOptional } from "@/context/HeroPreloadContext";
import { useHeroMobileVideo } from "@/hooks/useIsMobile";
import { useEffect } from "react";

const POSTER_DESKTOP = "/videos/media-ladder/d1440-poster.webp";
const POSTER_MOBILE = "/videos/media-ladder/m900-poster.webp";

/**
 * V2.2 poster-first: preload hero poster before ScrollHero mounts so TTFP is fast.
 */
export function HeroPosterPreload() {
  const preload = useHeroPreloadOptional();
  const mobile = useHeroMobileVideo();

  useEffect(() => {
    if (!preload?.heroRequired || mobile === null) return;

    const src = mobile ? POSTER_MOBILE : POSTER_DESKTOP;
    const img = new Image();
    img.fetchPriority = "high";
    img.decoding = "sync";
    img.onload = () => preload.signalPosterReady();
    img.onerror = () => preload.signalPosterReady();
    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [preload, mobile]);

  return null;
}

export function heroPosterPath(deviceClass: "desktop" | "mobile") {
  return deviceClass === "mobile" ? POSTER_MOBILE : POSTER_DESKTOP;
}
