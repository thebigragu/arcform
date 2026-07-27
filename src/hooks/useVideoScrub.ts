"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "framer-motion";

type UseVideoScrubOptions = {
  /** Scroll-driven scrub position 0–1 (maps to full video duration). */
  scrubProgress: MotionValue<number>;
  enabled?: boolean;
};

/**
 * Map scroll progress → video.currentTime on change only.
 * Skips overlapping seeks until the prior seek completes (seeked).
 */
export function useVideoScrub(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  { scrubProgress, enabled = true }: UseVideoScrubOptions,
) {
  const targetRef = useRef(0);
  const seekingRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let video: HTMLVideoElement | null = null;
    let unsubScroll: (() => void) | undefined;

    const seekToTarget = () => {
      const el = videoRef.current;
      if (!el?.duration || !Number.isFinite(el.duration)) return;

      const want = targetRef.current * el.duration;
      if (Math.abs(el.currentTime - want) < 0.02) {
        pendingRef.current = false;
        return;
      }

      if (seekingRef.current) {
        pendingRef.current = true;
        return;
      }

      seekingRef.current = true;
      pendingRef.current = false;
      try {
        el.currentTime = want;
      } catch {
        seekingRef.current = false;
      }
    };

    const onSeeked = () => {
      seekingRef.current = false;
      if (pendingRef.current) seekToTarget();
    };

    const onMeta = () => seekToTarget();

    const bind = (el: HTMLVideoElement) => {
      if (disposed || video === el) return;
      if (video) {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("loadedmetadata", onMeta);
      }
      video = el;
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("loadedmetadata", onMeta);

      if (!unsubScroll) {
        unsubScroll = scrubProgress.on("change", (p) => {
          targetRef.current = Math.min(1, Math.max(0, p));
          seekToTarget();
        });
        targetRef.current = scrubProgress.get();
      }

      if (video.readyState >= 1) seekToTarget();
    };

    if (videoRef.current) bind(videoRef.current);

    let waitRaf = 0;
    const waitForVideo = () => {
      if (disposed) return;
      if (videoRef.current) {
        bind(videoRef.current);
        return;
      }
      waitRaf = requestAnimationFrame(waitForVideo);
    };
    if (!videoRef.current) waitRaf = requestAnimationFrame(waitForVideo);

    return () => {
      disposed = true;
      cancelAnimationFrame(waitRaf);
      unsubScroll?.();
      if (video) {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("loadedmetadata", onMeta);
      }
      seekingRef.current = false;
      pendingRef.current = false;
    };
  }, [scrubProgress, enabled, videoRef]);
}
