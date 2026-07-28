"use client";

/**
 * @deprecated Use MediaView — kept as a thin hero-default wrapper for gradual migration.
 */
import { MediaView } from "@/components/media/MediaView";
import {
  HERO_MEDIA_ID,
  HERO_POSTER_FALLBACK,
} from "@/lib/media-engine/heroDefaults";
import type {
  DeviceClass,
  ExperienceMode,
  RendererPreference,
} from "@/lib/media-engine";
import type { MotionValue } from "framer-motion";

type HeroMediaProps = {
  deviceClass: DeviceClass;
  scrubProgress: MotionValue<number>;
  mediaId?: string;
  renderer?: RendererPreference;
  ladderUrl?: string;
  className?: string;
  debug?: boolean;
  onReady?: () => void;
  onPosterLoad?: () => void;
  onProgress?: (p: number) => void;
  onFatal?: (e: Error) => void;
  onExperienceModeChange?: (mode: ExperienceMode) => void;
  reducedMotion?: boolean;
  forceExperienceMode?: ExperienceMode;
};

export function HeroMedia({
  mediaId = HERO_MEDIA_ID,
  ...rest
}: HeroMediaProps) {
  return (
    <MediaView
      mediaId={mediaId}
      posterFallback={HERO_POSTER_FALLBACK}
      {...rest}
    />
  );
}
