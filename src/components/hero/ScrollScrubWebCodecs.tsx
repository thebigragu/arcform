"use client";

import { useWebCodecsScrub } from "@/hooks/useWebCodecsScrub";
import type { Mp4ScrubEngine } from "@/lib/hero-sequence/mp4-scrub-engine";
import { motion, type MotionValue } from "framer-motion";
import { useRef } from "react";

type ScrollScrubWebCodecsProps = {
  engine: Mp4ScrubEngine;
  targetFrameIndex: React.RefObject<number>;
  opacity: MotionValue<number>;
  enabled?: boolean;
};

export function ScrollScrubWebCodecs({
  engine,
  targetFrameIndex,
  opacity,
  enabled = true,
}: ScrollScrubWebCodecsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useWebCodecsScrub(canvasRef, {
    engine,
    targetFrameIndex,
    enabled,
  });

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden [contain:strict]"
      style={{ opacity }}
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        role="presentation"
        className="absolute inset-0 h-full w-full object-cover [transform:translateZ(0)]"
      />
    </motion.div>
  );
}
