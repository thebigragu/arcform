"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "framer-motion";

type UseVideoScrubOptions = {
  scrubProgress: MotionValue<number>;
  enabled?: boolean;
  /** Min ms between seek attempts (mobile decode budget). */
  minSeekIntervalMs?: number;
};

/**
 * Map scroll progress → video.currentTime on change only.
 * Throttles seeks and skips overlapping work until seeked.
 */
export function useVideoScrub(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  {
    scrubProgress,
    enabled = true,
    minSeekIntervalMs = 48,
  }: UseVideoScrubOptions,
) {
  const targetRef = useRef(0);
  const seekingRef = useRef(false);
  const pendingRef = useRef(false);
  const lastSeekAtRef = useRef(0);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let video: HTMLVideoElement | null = null;
    let unsubScroll: (() => void) | undefined;

    const clearThrottle = () => {
      if (throttleTimerRef.current !== null) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
    };

    const scheduleThrottledSeek = () => {
      if (throttleTimerRef.current !== null) return;
      const wait = Math.max(
        0,
        minSeekIntervalMs - (performance.now() - lastSeekAtRef.current),
      );
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = null;
        if (pendingRef.current) seekToTarget(true);
      }, wait);
    };

    const seekToTarget = (force = false) => {
      const el = videoRef.current;
      if (!el?.duration || !Number.isFinite(el.duration)) return;

      const now = performance.now();
      if (!force && now - lastSeekAtRef.current < minSeekIntervalMs) {
        pendingRef.current = true;
        scheduleThrottledSeek();
        return;
      }

      const want = targetRef.current * el.duration;
      if (Math.abs(el.currentTime - want) < 0.025) {
        pendingRef.current = false;
        return;
      }

      if (seekingRef.current) {
        pendingRef.current = true;
        return;
      }

      seekingRef.current = true;
      pendingRef.current = false;
      lastSeekAtRef.current = now;
      try {
        el.currentTime = want;
      } catch {
        seekingRef.current = false;
      }
    };

    const onSeeked = () => {
      seekingRef.current = false;
      if (pendingRef.current) seekToTarget(true);
    };

    const onMeta = () => seekToTarget(true);

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

      if (video.readyState >= 1) seekToTarget(true);
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
      clearThrottle();
      cancelAnimationFrame(waitRaf);
      unsubScroll?.();
      if (video) {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("loadedmetadata", onMeta);
      }
      seekingRef.current = false;
      pendingRef.current = false;
    };
  }, [scrubProgress, enabled, videoRef, minSeekIntervalMs]);
}
