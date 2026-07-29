"use client";

import Lenis from "lenis";
import { subscribeScrollLock } from "@/media-engine/MediaScrollLock";
import { useEffect, type ReactNode } from "react";

export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    // Native touch scroll on phones — Lenis syncTouch felt laboured / laggy.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse) return;

    const lenis = new Lenis({
      // 2× wheel gain → each notch advances ~2× video frames to walk through
      duration: 1.25,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.8,
      touchMultiplier: 1,
      autoResize: true,
    });

    document.documentElement.classList.add("lenis");

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    const unsub = subscribeScrollLock((locked) => {
      if (locked) lenis.stop();
      else lenis.start();
    });

    return () => {
      unsub();
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove("lenis");
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
