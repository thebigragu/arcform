"use client";

import { useMotionValueEvent, type MotionValue } from "framer-motion";
import { useEffect, type MutableRefObject } from "react";

/**
 * Map scroll-driven progress (0–1) to an integer frame index.
 * No spring — frame index tracks scroll directly for frame-perfect scrub.
 * Writes into a shared playhead ref (sliding-window preload + canvas RAF).
 */
export function useScrollFrameIndex(
  progress: MotionValue<number>,
  frameCount: number,
  targetFrameIndex: MutableRefObject<number>,
) {
  const maxIndex = Math.max(0, frameCount - 1);

  const writeIndex = (p: number) => {
    const clamped = Math.min(1, Math.max(0, p));
    targetFrameIndex.current = Math.min(
      maxIndex,
      Math.max(0, Math.round(clamped * maxIndex)),
    );
  };

  useEffect(() => {
    writeIndex(progress.get());
  }, [progress, maxIndex]);

  useMotionValueEvent(progress, "change", writeIndex);

  return targetFrameIndex;
}
