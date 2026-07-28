"use client";

import { useHeroMobileVideo } from "@/hooks/useIsMobile";
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
  /** Site shell may dismiss loader — poster painted + variant known */
  ready: boolean;
  /** Media engine first canvas present — poster swap in HeroMedia */
  engineReady: boolean;
  error: string | null;
  variant: "desktop" | "mobile" | null;
  heroRequired: boolean;
  signalPosterReady: () => void;
  /** Engine first-paint — call from HeroMedia onReady */
  signalEngineReady: () => void;
  reportProgress: (p: number) => void;
  reportError: (message: string | null) => void;
};

const HeroPreloadContext = createContext<HeroPreloadContextValue | null>(null);

/**
 * V2.2 poster-first gate: loader dismisses on poster + variant, not full MP4 fetch.
 * Engine initializes in background; HeroMedia swaps poster on first present.
 */
export function HeroPreloadProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const heroRequired = pathname === "/";
  const useMobile = useHeroMobileVideo();
  const variantReady = useMobile !== null;
  const isMobile = useMobile === true;

  const [progress, setProgress] = useState(0);
  const [posterReady, setPosterReady] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signalPosterReady = useCallback(() => setPosterReady(true), []);
  const signalEngineReady = useCallback(() => setEngineReady(true), []);
  const reportProgress = useCallback((p: number) => setProgress(p), []);
  const reportError = useCallback((message: string | null) => setError(message), []);

  const value = useMemo<HeroPreloadContextValue>(() => {
    if (!heroRequired) {
      return {
        progress: 1,
        ready: true,
        engineReady: true,
        error: null,
        variant: null,
        heroRequired: false,
        signalPosterReady,
        signalEngineReady,
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
        signalPosterReady,
        signalEngineReady,
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
      signalPosterReady,
      signalEngineReady,
      reportProgress,
      reportError,
    };
  }, [
    heroRequired,
    variantReady,
    isMobile,
    posterReady,
    engineReady,
    progress,
    error,
    signalPosterReady,
    signalEngineReady,
    reportProgress,
    reportError,
  ]);

  return (
    <HeroPreloadContext.Provider value={value}>{children}</HeroPreloadContext.Provider>
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
