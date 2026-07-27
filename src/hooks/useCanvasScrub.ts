"use client";

import { CANVAS_MAX_DPR } from "@/lib/hero-sequence/config";
import {
  isScrubFrameReady,
  scrubFrameSize,
  type ScrubFrame,
} from "@/lib/hero-sequence/types";
import { useEffect, useRef } from "react";

type CoverRect = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

/** object-cover math: crop source, center in dest */
function coverRect(
  imgW: number,
  imgH: number,
  destW: number,
  destH: number,
): CoverRect {
  const imgAspect = imgW / imgH;
  const destAspect = destW / destH;
  let sw = imgW;
  let sh = imgH;
  let sx = 0;
  let sy = 0;

  if (imgAspect > destAspect) {
    sw = imgH * destAspect;
    sx = (imgW - sw) / 2;
  } else {
    sh = imgW / destAspect;
    sy = (imgH - sh) / 2;
  }

  return { sx, sy, sw, sh, dx: 0, dy: 0, dw: destW, dh: destH };
}

/** Prefer exact target; else nearest warm frame toward target (early-exit). */
function resolveDrawIndex(
  images: (ScrubFrame | undefined)[],
  target: number,
  lastDrawn: number,
): number | null {
  const n = images.length;
  if (n === 0) return null;

  const t = Math.min(n - 1, Math.max(0, target | 0));
  if (isScrubFrameReady(images[t])) return t;

  // Hold / walk toward target only — search from target back to lastDrawn.
  if (lastDrawn >= 0 && lastDrawn < n && isScrubFrameReady(images[lastDrawn])) {
    if (t === lastDrawn) return lastDrawn;

    if (t > lastDrawn) {
      for (let i = t; i >= lastDrawn; i--) {
        if (isScrubFrameReady(images[i])) return i;
      }
      return lastDrawn;
    }

    for (let i = t; i <= lastDrawn; i++) {
      if (isScrubFrameReady(images[i])) return i;
    }
    return lastDrawn;
  }

  // Cold start: nearest warm frame to target.
  for (let d = 1; d < n; d++) {
    const hi = t + d;
    const lo = t - d;
    if (hi < n && isScrubFrameReady(images[hi])) return hi;
    if (lo >= 0 && isScrubFrameReady(images[lo])) return lo;
  }
  return null;
}

type UseCanvasScrubOptions = {
  images: (ScrubFrame | undefined)[];
  targetFrameIndex: React.RefObject<number>;
  enabled?: boolean;
};

/**
 * RAF render loop: draw current frame to canvas only when index changes.
 * Scroll handlers must never call draw — they only update targetFrameIndex.
 */
export function useCanvasScrub(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  { images, targetFrameIndex, enabled = true }: UseCanvasScrubOptions,
) {
  const lastDrawn = useRef(-1);
  const layoutRef = useRef({ cssW: 0, cssH: 0, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;

    const ctx = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });
    if (!ctx) return;

    // Cover draws opaque full-bleed; skip clear between frames.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const cssW = parent.clientWidth;
      const cssH = parent.clientHeight;
      const dpr = Math.min(CANVAS_MAX_DPR, window.devicePixelRatio || 1);
      layoutRef.current = { cssW, cssH, dpr };
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "medium";
      lastDrawn.current = -1;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement ?? canvas);

    let raf = 0;
    const tick = () => {
      const target = targetFrameIndex.current;
      const idx = resolveDrawIndex(images, target, lastDrawn.current);
      if (idx !== null && idx !== lastDrawn.current) {
        const frame = images[idx];
        if (isScrubFrameReady(frame)) {
          const { w, h } = scrubFrameSize(frame);
          const { cssW, cssH } = layoutRef.current;
          const rect = coverRect(w, h, cssW, cssH);
          ctx.drawImage(
            frame,
            rect.sx,
            rect.sy,
            rect.sw,
            rect.sh,
            rect.dx,
            rect.dy,
            rect.dw,
            rect.dh,
          );
          lastDrawn.current = idx;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [canvasRef, images, targetFrameIndex, enabled]);
}
