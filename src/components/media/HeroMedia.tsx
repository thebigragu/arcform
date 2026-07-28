"use client";

import { HeroMediaDebugOverlay } from "@/components/media/HeroMediaDebugOverlay";
import {
  MediaEngine,
  type DeviceClass,
  type EngineStats,
  type RendererPreference,
} from "@/lib/media-engine";
import { useMotionValueEvent, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type HeroMediaProps = {
  deviceClass: DeviceClass;
  scrubProgress: MotionValue<number>;
  renderer?: RendererPreference;
  ladderUrl?: string;
  className?: string;
  debug?: boolean;
  onReady?: () => void;
  onProgress?: (p: number) => void;
  onFatal?: (e: Error) => void;
};

/**
 * React shell for Media Engine v2 — canvas presentation only.
 */
export function HeroMedia({
  deviceClass,
  scrubProgress,
  renderer = "auto",
  ladderUrl,
  className,
  debug = process.env.NEXT_PUBLIC_HERO_MEDIA_DEBUG === "1",
  onReady,
  onProgress,
  onFatal,
}: HeroMediaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MediaEngine | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [posterVisible, setPosterVisible] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const engine = new MediaEngine({
      canvas,
      deviceClass,
      ladderUrl,
      renderer,
      analytics: debug || process.env.NEXT_PUBLIC_MEDIA_ENGINE_ANALYTICS === "1",
      progressive: process.env.NEXT_PUBLIC_MEDIA_ENGINE_PROGRESSIVE === "1",
      onProgress,
      onReady: () => {
        if (cancelled) return;
        setPosterVisible(false);
        onReady?.();
      },
      onFatal: (e) => {
        if (!cancelled) onFatal?.(e);
      },
      onStats: debug
        ? (s) => {
            if (!cancelled) setStats(s);
          }
        : undefined,
    });
    engineRef.current = engine;

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    engine.resize();

    void engine.start().then(() => {
      if (!cancelled) engine.setProgress(scrubProgress.get());
    });

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      engine.dispose();
      engineRef.current = null;
    };
    // Intentionally once per deviceClass/renderer mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceClass, renderer, ladderUrl]);

  useMotionValueEvent(scrubProgress, "change", (p) => {
    engineRef.current?.setProgress(p);
  });

  return (
    <div
      className={
        className ??
        "pointer-events-none absolute inset-0 overflow-hidden [contain:strict]"
      }
      aria-hidden
    >
      {/*
        Keep canvas opacity 1 always (Safari may skip compositing opacity-0 media).
        Cover with poster until engine signals first paint via onReady.
      */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-[1] h-full w-full object-cover [transform:translateZ(0)]"
      />
      {posterVisible ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={
            deviceClass === "mobile"
              ? "/videos/media-ladder/m900-poster.webp"
              : "/videos/media-ladder/d1920-poster.webp"
          }
          alt=""
          className="absolute inset-0 z-[2] h-full w-full object-cover"
          fetchPriority="high"
          decoding="sync"
        />
      ) : null}
      <HeroMediaDebugOverlay stats={stats} visible={Boolean(debug)} />
    </div>
  );
}
