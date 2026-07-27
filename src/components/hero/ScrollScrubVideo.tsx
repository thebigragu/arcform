"use client";

import { useVideoScrub } from "@/hooks/useVideoScrub";
import {
  HERO_MOBILE_SCRUB_POSTER,
  MOBILE_SCRUB_FRAME_COUNT,
  MOBILE_SEEK_INTERVAL_MS,
} from "@/lib/hero-sequence/config";
import { motion, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type ScrollScrubVideoProps = {
  src: string;
  scrubProgress: MotionValue<number>;
  opacity: MotionValue<number>;
  enabled?: boolean;
};

/**
 * Mobile scroll-scrub video. Keeps a real poster painted until the mounted
 * <video> has decoded frame 0 — native poster= is unreliable on mobile Safari.
 */
export function ScrollScrubVideo({
  src,
  scrubProgress,
  opacity,
  enabled = true,
}: ScrollScrubVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [frameReady, setFrameReady] = useState(false);

  useVideoScrub(videoRef, {
    scrubProgress,
    enabled,
    frameCount: MOBILE_SCRUB_FRAME_COUNT,
    minSeekIntervalMs: MOBILE_SEEK_INTERVAL_MS,
  });

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    let settled = false;
    const markReady = () => {
      if (settled) return;
      settled = true;
      setFrameReady(true);
    };

    // HAVE_CURRENT_DATA or better — a real frame can paint.
    if (el.readyState >= 2) {
      markReady();
      return;
    }

    el.addEventListener("loadeddata", markReady);
    el.addEventListener("canplay", markReady);
    el.addEventListener("seeked", markReady);

    return () => {
      el.removeEventListener("loadeddata", markReady);
      el.removeEventListener("canplay", markReady);
      el.removeEventListener("seeked", markReady);
    };
  }, [src]);

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden [contain:strict]"
      style={{ opacity }}
      aria-hidden
    >
      {!frameReady ? (
        // Plain img so it hits the same URL we preloaded during the loader.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={HERO_MOBILE_SCRUB_POSTER}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
          decoding="sync"
        />
      ) : null}
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        className="absolute inset-0 h-full w-full object-cover [transform:translateZ(0)]"
        style={{ opacity: frameReady ? 1 : 0 }}
      />
    </motion.div>
  );
}
