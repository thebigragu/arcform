"use client";

import type { Mp4ScrubEngine } from "@/lib/hero-sequence/mp4-scrub-engine";
import { CANVAS_MAX_DPR_MOBILE } from "@/lib/hero-sequence/config";
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

type UseWebCodecsScrubOptions = {
  engine: Mp4ScrubEngine | null;
  targetFrameIndex: React.RefObject<number>;
  enabled?: boolean;
  maxDpr?: number;
};

export function useWebCodecsScrub(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  {
    engine,
    targetFrameIndex,
    enabled = true,
    maxDpr = CANVAS_MAX_DPR_MOBILE,
  }: UseWebCodecsScrubOptions,
) {
  const lastDrawn = useRef(-1);
  const layoutRef = useRef({ cssW: 0, cssH: 0, dpr: 1 });
  const inFlight = useRef(false);
  const pendingIndex = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled || !engine) return;

    const ctx = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = maxDpr <= 1.5 ? "low" : "medium";

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const cssW = parent.clientWidth;
      const cssH = parent.clientHeight;
      const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
      layoutRef.current = { cssW, cssH, dpr };
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = maxDpr <= 1.5 ? "low" : "medium";
      lastDrawn.current = -1;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement ?? canvas);

    const drawFrame = (frame: VideoFrame, index: number) => {
      const { cssW, cssH } = layoutRef.current;
      const rect = coverRect(frame.displayWidth, frame.displayHeight, cssW, cssH);
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
      lastDrawn.current = index;
    };

    const requestFrame = (index: number) => {
      if (index === lastDrawn.current) return;
      if (inFlight.current) {
        pendingIndex.current = index;
        return;
      }

      inFlight.current = true;
      void engine
        .getFrame(index)
        .then((frame) => {
          drawFrame(frame, index);
          frame.close();
        })
        .catch((error) => {
          console.error(error);
        })
        .finally(() => {
          inFlight.current = false;
          const next = pendingIndex.current;
          pendingIndex.current = null;
          if (next !== null && next !== lastDrawn.current) {
            requestFrame(next);
          }
        });
    };

    let raf = 0;
    const tick = () => {
      requestFrame(targetFrameIndex.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      inFlight.current = false;
      pendingIndex.current = null;
      lastDrawn.current = -1;
    };
  }, [canvasRef, engine, targetFrameIndex, enabled, maxDpr]);
}
