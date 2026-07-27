"use client";

import { useCanvasScrub } from "@/hooks/useCanvasScrub";
import {
  CANVAS_MAX_DPR,
  CANVAS_MAX_DPR_MOBILE,
  CANVAS_ROTATE_MAX,
  CANVAS_SCALE_DEPTH,
} from "@/lib/hero-sequence/config";
import type { ScrubFrame } from "@/lib/hero-sequence/types";
import { motion, useTransform, type MotionValue } from "framer-motion";
import { useRef } from "react";

type ScrollScrubCanvasProps = {
  images: (ScrubFrame | undefined)[];
  targetFrameIndex: React.RefObject<number>;
  opacity: MotionValue<number>;
  scrollProgress: MotionValue<number>;
  enabled?: boolean;
  isMobile?: boolean;
};

export function ScrollScrubCanvas({
  images,
  targetFrameIndex,
  opacity,
  scrollProgress,
  enabled = true,
  isMobile = false,
}: ScrollScrubCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useCanvasScrub(canvasRef, {
    images,
    targetFrameIndex,
    enabled,
    maxDpr: isMobile ? CANVAS_MAX_DPR_MOBILE : CANVAS_MAX_DPR,
  });

  const rotateX = useTransform(
    scrollProgress,
    [0, 0.5, 1],
    isMobile
      ? [0, 0, 0]
      : [0, CANVAS_ROTATE_MAX * 0.4, CANVAS_ROTATE_MAX],
  );
  const scale = useTransform(
    scrollProgress,
    [0, 1],
    isMobile ? [1, 1] : [1, 1 + CANVAS_SCALE_DEPTH],
  );
  const canvasTransform = useTransform(
    [rotateX, scale],
    ([rx, s]) =>
      isMobile
        ? undefined
        : `perspective(1200px) rotateX(${rx}deg) scale(${s})`,
  );

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity }}
      aria-hidden
    >
      <motion.div
        className="absolute inset-0 origin-center"
        style={isMobile ? undefined : { transform: canvasTransform }}
      >
        <canvas
          ref={canvasRef}
          role="presentation"
          className="absolute inset-0 h-full w-full"
        />
      </motion.div>
    </motion.div>
  );
}
