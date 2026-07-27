"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "framer-motion";

type UseVideoScrubOptions = {
  /** Scroll-driven scrub position 0–1 (maps to full video duration). */
  scrubProgress: MotionValue<number>;
  enabled?: boolean;
};

/**
 * Map scroll progress → video.currentTime on rAF.
 * Uses raw scroll progress (not springed) for frame-accurate scrub.
 */
export function useVideoScrub(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  { scrubProgress, enabled = true }: UseVideoScrubOptions,
) {
  const targetRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const unsub = scrubProgress.on("change", (p) => {
      targetRef.current = Math.min(1, Math.max(0, p));
    });
    targetRef.current = scrubProgress.get();

    const tick = () => {
      const video = videoRef.current;
      if (video && video.duration && Number.isFinite(video.duration)) {
        const t = targetRef.current * video.duration;
        if (Math.abs(video.currentTime - t) > 0.012) {
          try {
            video.currentTime = t;
          } catch {
            // Seek can throw while metadata is still loading.
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      unsub();
      cancelAnimationFrame(rafRef.current);
    };
  }, [scrubProgress, enabled, videoRef]);
}
