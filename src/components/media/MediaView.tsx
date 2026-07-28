"use client";

import { MediaDebugOverlay } from "@/components/media/MediaDebugOverlay";
import {
  MediaEngine,
  loadMediaDefaults,
  mediaPosterPath,
  type DeviceClass,
  type EngineStats,
  type ExperienceMode,
  type RendererPreference,
} from "@/lib/media-engine";
import { useMotionValueEvent, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type MediaViewProps = {
  mediaId: string;
  deviceClass: DeviceClass;
  scrubProgress: MotionValue<number>;
  /** Required until manifest defaults are available. */
  posterFallback: { desktop: string; mobile: string };
  renderer?: RendererPreference;
  ladderUrl?: string;
  className?: string;
  debug?: boolean;
  onReady?: () => void;
  onPosterLoad?: () => void;
  onProgress?: (p: number) => void;
  onFatal?: (e: Error) => void;
  onExperienceModeChange?: (mode: ExperienceMode) => void;
  reducedMotion?: boolean;
  forceExperienceMode?: ExperienceMode;
};

/**
 * React shell for Media Engine — canvas presentation only.
 */
export function MediaView({
  mediaId,
  deviceClass,
  scrubProgress,
  posterFallback,
  renderer = "auto",
  ladderUrl,
  className,
  debug = process.env.NEXT_PUBLIC_MEDIA_ENGINE_DEBUG === "1",
  onReady,
  onPosterLoad,
  onProgress,
  onFatal,
  onExperienceModeChange,
  reducedMotion,
  forceExperienceMode,
}: MediaViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MediaEngine | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [posterVisible, setPosterVisible] = useState(true);
  const [posterSrc, setPosterSrc] = useState(
    () =>
      deviceClass === "mobile" ? posterFallback.mobile : posterFallback.desktop,
  );

  useEffect(() => {
    void loadMediaDefaults(mediaId, posterFallback).then((defaults) => {
      setPosterSrc(mediaPosterPath(deviceClass, defaults));
    });
  }, [deviceClass, mediaId, posterFallback]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const engine = new MediaEngine({
      canvas,
      deviceClass,
      mediaId,
      ladderUrl,
      poster: posterSrc,
      renderer,
      reducedMotion,
      forceExperienceMode,
      analytics: debug || process.env.NEXT_PUBLIC_MEDIA_ENGINE_ANALYTICS === "1",
      progressive: process.env.NEXT_PUBLIC_MEDIA_ENGINE_PROGRESSIVE === "1",
      onProgress,
      onExperienceModeChange,
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
  }, [deviceClass, renderer, ladderUrl, mediaId, reducedMotion, forceExperienceMode]);

  useMotionValueEvent(scrubProgress, "change", (p) => {
    engineRef.current?.setProgress(p);
  });

  return (
    <div
      ref={mountRef}
      className={
        className ??
        "pointer-events-none absolute inset-0 overflow-hidden [contain:strict]"
      }
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-[1] h-full w-full object-cover [transform:translateZ(0)]"
      />
      {posterVisible ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterSrc}
          alt=""
          className="absolute inset-0 z-[2] h-full w-full object-cover"
          fetchPriority="high"
          decoding="sync"
          onLoad={() => onPosterLoad?.()}
        />
      ) : null}
      <MediaDebugOverlay stats={stats} visible={Boolean(debug)} />
    </div>
  );
}
