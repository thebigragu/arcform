"use client";

import { useVideoScrub } from "@/hooks/useVideoScrub";
import { HERO_MOBILE_SCRUB_POSTER, HERO_MOBILE_SCRUB_VIDEO } from "@/lib/hero-sequence/config";
import { motion, type MotionValue } from "framer-motion";
import { useRef } from "react";

type ScrollScrubVideoProps = {
  scrubProgress: MotionValue<number>;
  opacity: MotionValue<number>;
  enabled?: boolean;
};

export function ScrollScrubVideo({
  scrubProgress,
  opacity,
  enabled = true,
}: ScrollScrubVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useVideoScrub(videoRef, { scrubProgress, enabled });

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity }}
      aria-hidden
    >
      <video
        ref={videoRef}
        src={HERO_MOBILE_SCRUB_VIDEO}
        poster={HERO_MOBILE_SCRUB_POSTER}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        className="absolute inset-0 h-full w-full object-cover"
      />
    </motion.div>
  );
}
