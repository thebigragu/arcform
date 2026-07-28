"use client";

import { useHeroPreloadOptional } from "@/context/HeroPreloadContext";
import { useHeroMobileVideo } from "@/hooks/useIsMobile";
import {
  HERO_MEDIA_ID,
  HERO_POSTER_FALLBACK,
  heroPosterPath,
  loadHeroDefaults,
} from "@/lib/media-engine/heroDefaults";
import { useEffect, useState } from "react";

/**
 * Skill-aligned poster-first preload for the site hero (mediaId=hero).
 */
export function HeroPosterPreload() {
  const preload = useHeroPreloadOptional();
  const mobile = useHeroMobileVideo();
  const [posterSrc, setPosterSrc] = useState<string | null>(null);

  useEffect(() => {
    void loadHeroDefaults().then((defaults) => {
      if (mobile === null) return;
      setPosterSrc(heroPosterPath(mobile ? "mobile" : "desktop", defaults));
    });
  }, [mobile]);

  useEffect(() => {
    if (!preload?.heroRequired || mobile === null || !posterSrc) return;

    const img = new Image();
    img.fetchPriority = "high";
    img.decoding = "sync";
    img.onload = () => preload.signalPosterReady();
    img.onerror = () => preload.signalPosterReady();
    img.src = posterSrc;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [preload, mobile, posterSrc]);

  return null;
}

export {
  HERO_MEDIA_ID,
  HERO_POSTER_FALLBACK,
  heroPosterPath,
  loadHeroDefaults,
};
