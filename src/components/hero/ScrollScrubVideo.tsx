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
  /** Fires once the mounted video has actually composited a frame. */
  onFirstPaint?: () => void;
};

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

/**
 * Mobile scroll-scrub video. Keeps a poster up and video hidden until a real
 * frame has painted — loadeddata alone still leaves Safari black for seconds.
 */
export function ScrollScrubVideo({
  src,
  scrubProgress,
  opacity,
  enabled = true,
  onFirstPaint,
}: ScrollScrubVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [frameReady, setFrameReady] = useState(false);
  const onFirstPaintRef = useRef(onFirstPaint);
  onFirstPaintRef.current = onFirstPaint;

  useVideoScrub(videoRef, {
    scrubProgress,
    enabled: enabled && frameReady,
    frameCount: MOBILE_SCRUB_FRAME_COUNT,
    minSeekIntervalMs: MOBILE_SEEK_INTERVAL_MS,
  });

  useEffect(() => {
    const el = videoRef.current as VideoWithFrameCallback | null;
    if (!el) return;

    let cancelled = false;
    let settled = false;

    const reveal = () => {
      if (cancelled || settled) return;
      settled = true;
      setFrameReady(true);
      onFirstPaintRef.current?.();
    };

    const waitForPaint = () => {
      if (cancelled || settled) return;
      if (typeof el.requestVideoFrameCallback === "function") {
        el.requestVideoFrameCallback(() => reveal());
        return;
      }
      // Fallback: two rAFs after seek ≈ compositor paint.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => reveal());
      });
    };

    const kickFirstFrame = async () => {
      if (cancelled) return;

      // Scrub-only clips often won't decode a visible frame until play/seek.
      try {
        await el.play();
        el.pause();
      } catch {
        /* autoplay may reject — seek below still helps */
      }

      if (cancelled) return;

      const onSeeked = () => {
        el.removeEventListener("seeked", onSeeked);
        waitForPaint();
      };
      el.addEventListener("seeked", onSeeked);

      try {
        // Nudge off 0 so the browser must decode and fire seeked.
        el.currentTime = 0.001;
      } catch {
        el.removeEventListener("seeked", onSeeked);
        waitForPaint();
      }
    };

    if (el.readyState >= 1) {
      void kickFirstFrame();
    } else {
      el.addEventListener("loadedmetadata", () => void kickFirstFrame(), {
        once: true,
      });
    }

    // Safety: never leave the poster forever if RVFC never fires.
    const failsafe = window.setTimeout(() => reveal(), 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
    };
  }, [src]);

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity }}
      aria-hidden
    >
      {!frameReady ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={HERO_MOBILE_SCRUB_POSTER}
          alt=""
          className="absolute inset-0 z-[1] h-full w-full object-cover"
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
        className="absolute inset-0 z-[2] h-full w-full object-cover [transform:translateZ(0)]"
        style={{ opacity: frameReady ? 1 : 0 }}
      />
    </motion.div>
  );
}
