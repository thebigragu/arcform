"use client";

import {
  HERO_MANIFEST_URL,
  HERO_MEDIA_ID,
  HERO_POSTER_FALLBACK,
  MediaDebugOverlay,
  MediaEngine,
  coldStartTelemetry,
  readReadinessGateFlag,
  type DeviceClass,
  type EngineStats,
} from "@/media-engine";
import { type MotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";

function readMediaDebugFlag() {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("mediaDebug") === "1";
  } catch {
    return false;
  }
}

type MediaViewProps = {
  mediaId?: string;
  deviceClass: DeviceClass;
  scrubProgress: MotionValue<number>;
  rawScrollProgress?: MotionValue<number>;
  posterFallback?: { desktop: string; mobile: string };
  className?: string;
  debug?: boolean;
  onReady?: () => void;
  onPosterLoad?: () => void;
  onProgress?: (p: number) => void;
  onFatal?: (e: Error) => void;
  reducedMotion?: boolean;
  /** Readiness-gate progress 0–1 (compressed frames). */
  onReadinessProgress?: (pct: number) => void;
  /** Readiness-gate release — dismiss loader. */
  onReadinessRelease?: (reason: string) => void;
};

/**
 * media-engine skill component (adapted verbatim from Website MediaView.tsx; see packaging-changes.md item 1) - Sequence Scrub only. DOM poster until first canvas draw.
 *
 * Critical: canvas stays opacity 1; poster sits above and fades out after
 * onFirstFrame. Hiding the canvas with opacity 0 made stats report later
 * frames while the user only saw the poster.
 */
export function MediaView({
  mediaId = HERO_MEDIA_ID,
  deviceClass,
  scrubProgress,
  rawScrollProgress,
  posterFallback = HERO_POSTER_FALLBACK,
  className,
  debug: debugProp,
  onReady,
  onPosterLoad,
  onProgress,
  onFatal,
  reducedMotion,
  onReadinessProgress,
  onReadinessRelease,
}: MediaViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MediaEngine | null>(null);
  const onReadyRef = useRef(onReady);
  const onFatalRef = useRef(onFatal);
  const onProgressRef = useRef(onProgress);
  const onReadinessProgressRef = useRef(onReadinessProgress);
  const onReadinessReleaseRef = useRef(onReadinessRelease);
  onReadyRef.current = onReady;
  onFatalRef.current = onFatal;
  onProgressRef.current = onProgress;
  onReadinessProgressRef.current = onReadinessProgress;
  onReadinessReleaseRef.current = onReadinessRelease;

  const [stats, setStats] = useState<EngineStats | null>(null);
  const [posterVisible, setPosterVisible] = useState(true);
  const posterVisibleRef = useRef(true);
  const [debug, setDebug] = useState(
    () => Boolean(debugProp) || readMediaDebugFlag(),
  );
  const [readinessGate] = useState(() => readReadinessGateFlag().enabled);
  const posterSrc =
    deviceClass === "mobile" ? posterFallback.mobile : posterFallback.desktop;

  const rawScrollRef = useRef(0);
  const frameProgressRef = useRef(0);
  const mediaViewReceivedRef = useRef(0);

  useEffect(() => {
    posterVisibleRef.current = posterVisible;
    engineRef.current?.setPosterShellState({
      posterVisible,
      posterOpacity: posterVisible ? 1 : 0,
      posterZIndex: posterVisible ? 2 : 0,
      canvasOpacity: 1,
      canvasZIndex: 1,
    });
  }, [posterVisible]);

  useEffect(() => {
    if (debugProp) setDebug(true);
    else if (readMediaDebugFlag()) setDebug(true);
  }, [debugProp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    const engine = new MediaEngine({
      canvas,
      deviceClass,
      mediaId,
      manifestUrl: HERO_MANIFEST_URL,
      poster: posterSrc,
      reducedMotion,
      debug,
      readinessGate,
      onReady: () => {
        if (!cancelled) onReadyRef.current?.();
      },
      onFirstFrame: () => {
        if (cancelled) return;
        coldStartTelemetry.notePosterHidden();
        setPosterVisible(false);
      },
      onFatal: (e) => {
        if (!cancelled) onFatalRef.current?.(e);
      },
      onReadinessProgress: (pct) => {
        if (!cancelled) onReadinessProgressRef.current?.(pct);
      },
      onReadinessRelease: (reason) => {
        if (!cancelled) onReadinessReleaseRef.current?.(reason);
      },
      onStats: debug
        ? (s) => {
            if (cancelled) return;
            const pv = posterVisibleRef.current;
            setStats({
              ...s,
              rawScrollProgress: rawScrollRef.current,
              frameProgress: frameProgressRef.current,
              mediaViewReceivedProgress: mediaViewReceivedRef.current,
              lastEngineProgress: s.lastEngineProgress,
              posterVisible: pv,
              posterDisplay: pv ? "block" : "none",
              posterOpacity: pv ? 1 : 0,
              posterZIndex: pv ? 2 : 0,
              canvasOpacity: 1,
              canvasZIndex: 1,
            });
          }
        : undefined,
    });
    engineRef.current = engine;
    engine.setPosterShellState({
      posterVisible: posterVisibleRef.current,
      posterOpacity: posterVisibleRef.current ? 1 : 0,
      posterZIndex: posterVisibleRef.current ? 2 : 0,
      canvasOpacity: 1,
      canvasZIndex: 1,
    });
    engine.resize();

    const applyProgress = (value: number) => {
      mediaViewReceivedRef.current = value;
      frameProgressRef.current = value;
      engine.setProgress(value);
      onProgressRef.current?.(value);
    };

    applyProgress(scrubProgress.get());
    const unsubScrub = scrubProgress.on("change", applyProgress);

    let unsubRaw: (() => void) | undefined;
    if (rawScrollProgress) {
      rawScrollRef.current = rawScrollProgress.get();
      unsubRaw = rawScrollProgress.on("change", (v) => {
        rawScrollRef.current = v;
      });
    }

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    void engine.start().then(() => {
      if (cancelled) return;
      applyProgress(scrubProgress.get());
    });

    return () => {
      cancelled = true;
      unsubScrub();
      unsubRaw?.();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      engine.dispose();
      engineRef.current = null;
    };
  }, [
    deviceClass,
    mediaId,
    posterSrc,
    reducedMotion,
    debug,
    readinessGate,
    scrubProgress,
    rawScrollProgress,
  ]);

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 1,
          zIndex: 1,
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={posterSrc}
        alt=""
        onLoad={() => {
          coldStartTelemetry.notePosterRuntimeStart(posterSrc);
          coldStartTelemetry.notePosterRuntimeEnd();
          onPosterLoad?.();
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: posterVisible ? 1 : 0,
          zIndex: posterVisible ? 2 : 0,
          transition: "opacity 120ms linear",
          pointerEvents: "none",
          visibility: posterVisible ? "visible" : "hidden",
        }}
      />
      <MediaDebugOverlay stats={stats} visible={debug} />
    </div>
  );
}

