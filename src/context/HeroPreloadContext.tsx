"use client";

import { useHeroMobileVideo } from "@/hooks/useIsMobile";
import { readReadinessGateFlag } from "@/media-engine";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type HeroPreloadContextValue = {
  progress: number;
  /** Site shell may dismiss loader */
  ready: boolean;
  /** Media engine first canvas present — poster swap in MediaView */
  engineReady: boolean;
  error: string | null;
  variant: "desktop" | "mobile" | null;
  heroRequired: boolean;
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

const HeroPreloadContext = createContext<HeroPreloadContextValue | null>(null);

/**
 * Production: loader holds until compressed-sequence readiness (90% default).
 * Poster-only dismiss remains when ?mediaReadinessGate=0.
 */
export function HeroPreloadProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const heroRequired = pathname === "/";
  const useMobile = useHeroMobileVideo();
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

  const value = useMemo<HeroPreloadContextValue>(() => {
    if (!heroRequired) {
      return {
        progress: 1,
        ready: true,
        engineReady: true,
        error: null,
        variant: null,
        heroRequired: false,
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
        heroRequired: true,
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
        heroRequired: true,
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
      heroRequired: true,
      readinessGateEnabled: false,
      signalPosterReady,
      signalEngineReady,
      signalCompressedReady,
      reportProgress,
      reportError,
    };
  }, [
    heroRequired,
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
    <HeroPreloadContext.Provider value={value}>
      {children}
    </HeroPreloadContext.Provider>
  );
}

export function useHeroPreload() {
  const ctx = useContext(HeroPreloadContext);
  if (!ctx) {
    throw new Error("useHeroPreload must be used within HeroPreloadProvider");
  }
  return ctx;
}

export function useHeroPreloadOptional() {
  return useContext(HeroPreloadContext);
}
