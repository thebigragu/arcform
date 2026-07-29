"use client";

/**
 * Generic media preload/readiness context — adapted from the Website's
 * src/context/HeroPreloadContext.tsx (packaging-changes.md item 1).
 * State machine and readiness-gating behavior are unchanged; only naming
 * is generalized (Hero -> Media) so the same component can gate any
 * route's media, not only a homepage hero.
 *
 * Provide `requiredOnRoute` to control when this context should hold the
 * site loader (defaults to "always required" if omitted, matching a
 * single-hero integration).
 */
import { useIsMobile } from "@/hooks/useIsMobile";
import { readReadinessGateFlag } from "@/media-engine";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type MediaPreloadContextValue = {
  progress: number;
  /** Site shell may dismiss loader */
  ready: boolean;
  /** Media engine first canvas present — poster swap in MediaView */
  engineReady: boolean;
  error: string | null;
  variant: "desktop" | "mobile" | null;
  mediaRequired: boolean;
  /** Production readiness gate (default on; disable with ?mediaReadinessGate=0). */
  readinessGateEnabled: boolean;
  signalPosterReady: () => void;
  /** Engine first-paint — call from MediaView onReady */
  signalEngineReady: () => void;
  /** Compressed readiness release — dismiss loader under readiness gate. */
  signalCompressedReady: () => void;
  reportProgress: (p: number) => void;
  reportError: (message: string | null) => void;
};

const MediaPreloadContext = createContext<MediaPreloadContextValue | null>(null);

/**
 * Production: loader holds until compressed-sequence readiness (90% default).
 * Poster-only dismiss remains when ?mediaReadinessGate=0.
 */
export function MediaPreloadProvider({
  children,
  requiredOnRoute = true,
}: {
  children: ReactNode;
  /** Whether this route requires media before the loader dismisses. */
  requiredOnRoute?: boolean;
}) {
  const mediaRequired = requiredOnRoute;
  const useMobile = useIsMobile();
  const variantReady = useMobile !== null;
  const isMobile = useMobile === true;

  const [readinessGateEnabled] = useState(
    () => readReadinessGateFlag().enabled,
  );
  const [progress, setProgress] = useState(0);
  const [posterReady, setPosterReady] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [compressedReady, setCompressedReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signalPosterReady = useCallback(() => setPosterReady(true), []);
  const signalEngineReady = useCallback(() => setEngineReady(true), []);
  const signalCompressedReady = useCallback(() => setCompressedReady(true), []);
  const reportProgress = useCallback((p: number) => setProgress(p), []);
  const reportError = useCallback(
    (message: string | null) => setError(message),
    [],
  );

  const value = useMemo<MediaPreloadContextValue>(() => {
    if (!mediaRequired) {
      return {
        progress: 1,
        ready: true,
        engineReady: true,
        error: null,
        variant: null,
        mediaRequired: false,
        readinessGateEnabled: false,
        signalPosterReady,
        signalEngineReady,
        signalCompressedReady,
        reportProgress,
        reportError,
      };
    }

    if (!variantReady) {
      return {
        progress: 0,
        ready: false,
        engineReady: false,
        error: null,
        variant: null,
        mediaRequired: true,
        readinessGateEnabled,
        signalPosterReady,
        signalEngineReady,
        signalCompressedReady,
        reportProgress,
        reportError,
      };
    }

    if (readinessGateEnabled) {
      // Hold until compressed readiness (or timeout release) after poster known
      const shellReady = posterReady && compressedReady;
      return {
        progress: compressedReady ? 1 : Math.max(progress, posterReady ? 0.05 : 0),
        ready: shellReady,
        engineReady,
        error,
        variant: isMobile ? "mobile" : "desktop",
        mediaRequired: true,
        readinessGateEnabled: true,
        signalPosterReady,
        signalEngineReady,
        signalCompressedReady,
        reportProgress,
        reportError,
      };
    }

    const shellReady = posterReady;

    return {
      progress: engineReady ? 1 : progress,
      ready: shellReady,
      engineReady,
      error,
      variant: isMobile ? "mobile" : "desktop",
      mediaRequired: true,
      readinessGateEnabled: false,
      signalPosterReady,
      signalEngineReady,
      signalCompressedReady,
      reportProgress,
      reportError,
    };
  }, [
    mediaRequired,
    variantReady,
    isMobile,
    posterReady,
    engineReady,
    compressedReady,
    progress,
    error,
    readinessGateEnabled,
    signalPosterReady,
    signalEngineReady,
    signalCompressedReady,
    reportProgress,
    reportError,
  ]);

  return (
    <MediaPreloadContext.Provider value={value}>
      {children}
    </MediaPreloadContext.Provider>
  );
}

export function useMediaPreload() {
  const ctx = useContext(MediaPreloadContext);
  if (!ctx) {
    throw new Error("useMediaPreload must be used within MediaPreloadProvider");
  }
  return ctx;
}

export function useMediaPreloadOptional() {
  return useContext(MediaPreloadContext);
}
