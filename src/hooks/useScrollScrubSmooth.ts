"use client";

import { useMotionValue, type MotionValue } from "framer-motion";
import { useEffect } from "react";

/**
 * GSAP ScrollTrigger-style scrub smoothing: exponential chase, no spring overshoot.
 * Use for mobile UI overlays (contact, cue, copy) while media tracks raw scroll.
 */
export function useScrollScrubSmooth(
  source: MotionValue<number>,
  enabled: boolean,
  /** Lerp factor per frame @ 60fps — ~0.35 ≈ scrub: 0.5 feel. */
  smoothness = 0.35,
) {
  const smooth = useMotionValue(source.get());

  useEffect(() => {
    if (!enabled) {
      smooth.set(source.get());
      return;
    }

    let raf = 0;
    const tick = () => {
      const target = source.get();
      const current = smooth.get();
      const delta = target - current;
      if (Math.abs(delta) < 0.00008) {
        if (current !== target) smooth.set(target);
      } else {
        smooth.set(current + delta * smoothness);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [source, enabled, smoothness, smooth]);

  return smooth;
}
