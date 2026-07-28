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
  ready: boolean;
  error: string | null;
  variant: "desktop" | "mobile" | null;
  heroRequired: boolean;
  /** Engine first-paint gate — call from HeroMedia onReady. */
  signalEngineReady: () => void;
  reportProgress: (p: number) => void;
  reportError: (message: string | null) => void;
};

const HeroPreloadContext = createContext<HeroPreloadContextValue | null>(null);

/**
 * Thin adapter: Media Engine owns loading; this context only gates the site loader.
 */
export function HeroPreloadProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const heroRequired = pathname === "/";
  const useMobile = useHeroMobileVideo();
  const variantReady = useMobile !== null;
  const isMobile = useMobile === true;

  const [progress, setProgress] = useState(0);
  const [engineReady, setEngineReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signalEngineReady = useCallback(() => setEngineReady(true), []);
  const reportProgress = useCallback((p: number) => setProgress(p), []);
  const reportError = useCallback((message: string | null) => setError(message), []);

  const value = useMemo<HeroPreloadContextValue>(() => {
    if (!heroRequired) {
      return {
        progress: 1,
        ready: true,
        error: null,
        variant: null,
        heroRequired: false,
        signalEngineReady,
        reportProgress,
        reportError,
      };
    }

    if (!variantReady) {
      return {
        progress: 0,
        ready: false,
        error: null,
        variant: null,
        heroRequired: true,
        signalEngineReady,
        reportProgress,
        reportError,
      };
    }

    return {
      progress: engineReady ? 1 : progress,
      ready: engineReady,
      error,
      variant: isMobile ? "mobile" : "desktop",
      heroRequired: true,
      signalEngineReady,
      reportProgress,
      reportError,
    };
  }, [
    heroRequired,
    variantReady,
    isMobile,
    engineReady,
    progress,
    error,
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
