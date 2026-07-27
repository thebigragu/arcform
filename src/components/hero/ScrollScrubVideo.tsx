"use client";

import { useVideoScrub } from "@/hooks/useVideoScrub";
import {
  HERO_MOBILE_SCRUB_POSTER,
  MOBILE_SCRUB_FRAME_COUNT,
  MOBILE_SEEK_INTERVAL_MS,
} from "@/lib/hero-sequence/config";
import { motion, type MotionValue } from "framer-motion";
import { useRef } from "react";

type ScrollScrubVideoProps = {
  src: string;
  scrubProgress: MotionValue<number>;
  opacity: MotionValue<number>;
  enabled?: boolean;
};

export function ScrollScrubVideo({
  src,
  scrubProgress,
  opacity,
  enabled = true,
}: ScrollScrubVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useVideoScrub(videoRef, {
    scrubProgress,
    enabled,
    frameCount: MOBILE_SCRUB_FRAME_COUNT,
    minSeekIntervalMs: MOBILE_SEEK_INTERVAL_MS,
  });

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden [contain:strict]"
      style={{ opacity }}
      aria-hidden
    >
      <video
        ref={videoRef}
        src={src}
        poster={HERO_MOBILE_SCRUB_POSTER}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        className="absolute inset-0 h-full w-full object-cover [transform:translateZ(0)]"
      />
    </motion.div>
  );
}
