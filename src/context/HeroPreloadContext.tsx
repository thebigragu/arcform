"use client";

import { useFramePreload } from "@/hooks/useFramePreload";
import { useHeroMobileVideo } from "@/hooks/useIsMobile";
import {
  DECODE_MAX_WIDTH_MOBILE,
  HERO_SEQUENCE_PATHS,
  PRELOAD_MAX_CONCURRENT,
  PRELOAD_MAX_CONCURRENT_MOBILE,
  PRELOAD_PLAYHEAD_BAND,
  PRELOAD_WINDOW,
  PRELOAD_WINDOW_MOBILE,
} from "@/lib/hero-sequence/config";
import type {
  HeroSequenceManifest,
  ScrubFrame,
} from "@/lib/hero-sequence/types";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from "react";

type HeroPreloadContextValue = {
  progress: number;
  ready: boolean;
  error: string | null;
  images: (ScrubFrame | undefined)[];
  manifest: HeroSequenceManifest | null;
  variant: "desktop" | "mobile" | null;
  heroRequired: boolean;
  /** Shared playhead — ScrollHero writes, sliding-window preload reads. */
  playheadRef: MutableRefObject<number>;
};

const HeroPreloadContext = createContext<HeroPreloadContextValue | null>(null);

export function HeroPreloadProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const heroRequired = pathname === "/";
  const useMobile = useHeroMobileVideo();
  const [manifest, setManifest] = useState<HeroSequenceManifest | null>(null);
  const [variant, setVariant] = useState<"desktop" | "mobile" | null>(null);
  const playheadRef = useRef(0);

  // null until viewport is measured — avoids mobile→desktop double decode.
  const variantReady = useMobile !== null;
  const basePath = useMobile
    ? HERO_SEQUENCE_PATHS.mobile
    : HERO_SEQUENCE_PATHS.desktop;
  const nextVariant: "desktop" | "mobile" = useMobile ? "mobile" : "desktop";

  useEffect(() => {
    if (!heroRequired || !variantReady) {
      setManifest(null);
      setVariant(null);
      return;
    }

    playheadRef.current = 0;

    const hints: HTMLLinkElement[] = [];
    const manifestLink = document.createElement("link");
    manifestLink.rel = "preload";
    manifestLink.as = "fetch";
    manifestLink.href = `${basePath}/manifest.json`;
    manifestLink.crossOrigin = "anonymous";
    document.head.appendChild(manifestLink);
    hints.push(manifestLink);

    const frameLink = document.createElement("link");
    frameLink.rel = "preload";
    frameLink.as = "image";
    frameLink.href = `${basePath}/frame-00001.webp`;
    document.head.appendChild(frameLink);
    hints.push(frameLink);

    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${basePath}/manifest.json`);
        if (!res.ok) throw new Error(`manifest ${res.status}`);
        const data = (await res.json()) as HeroSequenceManifest;
        if (!cancelled) {
          setManifest(data);
          setVariant(nextVariant);
        }
      } catch (e) {
        if (!cancelled) {
          setManifest(null);
          setVariant(null);
          console.error(e);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      for (const link of hints) link.remove();
    };
  }, [heroRequired, variantReady, basePath, nextVariant]);

  const isMobile = nextVariant === "mobile";
  const preload = useFramePreload(manifest, playheadRef, {
    enabled: heroRequired && !!manifest,
    // Both variants: decode-all when N ≤ 400 (mobile sequence is ~720×1294×360).
    decodeAll: true,
    maxConcurrent: isMobile
      ? PRELOAD_MAX_CONCURRENT_MOBILE
      : PRELOAD_MAX_CONCURRENT,
    maxDecodeWidth: isMobile ? DECODE_MAX_WIDTH_MOBILE : null,
    // Desktop: first-window gate. Mobile: wait for all frames before ready.
    loaderWindow: isMobile ? PRELOAD_WINDOW_MOBILE : PRELOAD_WINDOW,
    readyWhenFullyDecoded: isMobile,
    // B: playhead-first. C: only pauses fill after decode-all is complete.
    pauseFillWhileScrolling: isMobile,
    playheadBand: PRELOAD_PLAYHEAD_BAND,
  });

  const value = useMemo<HeroPreloadContextValue>(
    () => ({
      progress: heroRequired ? preload.progress : 1,
      ready: heroRequired ? preload.ready : true,
      error: preload.error,
      images: preload.images,
      manifest,
      variant,
      heroRequired,
      playheadRef,
    }),
    [heroRequired, preload, manifest, variant],
  );

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
