"use client";

import { useWebCodecsScrub } from "@/hooks/useWebCodecsScrub";
import { HERO_MOBILE_SCRUB_POSTER } from "@/lib/hero-sequence/config";
import type { Mp4ScrubEngine } from "@/lib/hero-sequence/mp4-scrub-engine";
import { motion, type MotionValue } from "framer-motion";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";

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
  const [posterVisible, setPosterVisible] = useState(true);
  const onFirstDraw = useCallback(() => setPosterVisible(false), []);

  useWebCodecsScrub(canvasRef, {
    engine,
    targetFrameIndex,
    enabled,
    onFirstDraw,
  });

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden [contain:strict]"
      style={{ opacity }}
      aria-hidden
    >
      {posterVisible ? (
        <Image
          src={HERO_MOBILE_SCRUB_POSTER}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      ) : null}
      <canvas
        ref={canvasRef}
        role="presentation"
        className="absolute inset-0 h-full w-full object-cover [transform:translateZ(0)]"
      />
    </motion.div>
  );
}
