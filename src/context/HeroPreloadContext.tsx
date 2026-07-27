"use client";

import { useFramePreload } from "@/hooks/useFramePreload";
import { useHeroVideoPreload } from "@/hooks/useHeroVideoPreload";
import { useHeroMobileVideo } from "@/hooks/useIsMobile";
import {
  HERO_SEQUENCE_PATHS,
  PRELOAD_MAX_CONCURRENT,
  PRELOAD_WINDOW,
} from "@/lib/hero-sequence/config";
import type {
  HeroSequenceManifest,
  ScrubFrame,
} from "@/lib/hero-sequence/types";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
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
  playheadRef: MutableRefObject<number>;
  /** Blob URL for the mobile scrub MP4 — set once the asset is fetched. */
  mobileVideoSrc: string | null;
  /** Call when the mounted mobile video has painted its first frame. */
  signalMobilePainted: () => void;
};

const HeroPreloadContext = createContext<HeroPreloadContextValue | null>(null);

export function HeroPreloadProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const heroRequired = pathname === "/";
  const useMobile = useHeroMobileVideo();
  const [manifest, setManifest] = useState<HeroSequenceManifest | null>(null);
  const [variant, setVariant] = useState<"desktop" | "mobile" | null>(null);
  const playheadRef = useRef(0);
  /** Src for which the mounted <video> has painted — gates the mobile loader. */
  const [paintedSrc, setPaintedSrc] = useState<string | null>(null);
  const videoPreloadSrcRef = useRef<string | null>(null);

  const variantReady = useMobile !== null;
  const isMobile = useMobile === true;
  const nextVariant: "desktop" | "mobile" = isMobile ? "mobile" : "desktop";
  const desktopPath = HERO_SEQUENCE_PATHS.desktop;

  useEffect(() => {
    if (!heroRequired || !variantReady) {
      setManifest(null);
      setVariant(null);
      return;
    }

    playheadRef.current = 0;
    setVariant(nextVariant);

    // Mobile: MP4 scrub — no WebP manifest / frame preload.
    if (isMobile) {
      setManifest(null);
      return;
    }

    const hints: HTMLLinkElement[] = [];
    const manifestLink = document.createElement("link");
    manifestLink.rel = "preload";
    manifestLink.as = "fetch";
    manifestLink.href = `${desktopPath}/manifest.json`;
    manifestLink.crossOrigin = "anonymous";
    document.head.appendChild(manifestLink);
    hints.push(manifestLink);

    const frameLink = document.createElement("link");
    frameLink.rel = "preload";
    frameLink.as = "image";
    frameLink.href = `${desktopPath}/frame-00001.webp`;
    document.head.appendChild(frameLink);
    hints.push(frameLink);

    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${desktopPath}/manifest.json`);
        if (!res.ok) throw new Error(`manifest ${res.status}`);
        const data = (await res.json()) as HeroSequenceManifest;
        if (!cancelled) setManifest(data);
      } catch (e) {
        if (!cancelled) {
          setManifest(null);
          console.error(e);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      for (const link of hints) link.remove();
    };
  }, [heroRequired, variantReady, isMobile, desktopPath, nextVariant]);

  const framePreload = useFramePreload(manifest, playheadRef, {
    enabled: heroRequired && !!manifest && !isMobile,
    decodeAll: true,
    maxConcurrent: PRELOAD_MAX_CONCURRENT,
    maxDecodeWidth: null,
    loaderWindow: PRELOAD_WINDOW,
  });

  const videoPreload = useHeroVideoPreload(
    heroRequired && variantReady && isMobile,
  );

  videoPreloadSrcRef.current = videoPreload.src;

  const signalMobilePainted = useCallback(() => {
    const src = videoPreloadSrcRef.current;
    if (src) setPaintedSrc(src);
  }, []);

  const mobileAssetsReady = videoPreload.ready && Boolean(videoPreload.src);
  const mobilePainted =
    mobileAssetsReady &&
    paintedSrc !== null &&
    paintedSrc === videoPreload.src;

  const value = useMemo<HeroPreloadContextValue>(() => {
    if (!heroRequired) {
      return {
        progress: 1,
        ready: true,
        error: null,
        images: [],
        manifest: null,
        variant: null,
        heroRequired: false,
        playheadRef,
        mobileVideoSrc: null,
        signalMobilePainted,
      };
    }

    if (!variantReady) {
      return {
        progress: 0,
        ready: false,
        error: null,
        images: [],
        manifest: null,
        variant: null,
        heroRequired: true,
        playheadRef,
        mobileVideoSrc: null,
        signalMobilePainted,
      };
    }

    if (isMobile) {
      return {
        // Stay at 100% while waiting for the mounted video to paint.
        progress: mobileAssetsReady ? 1 : videoPreload.progress,
        ready: mobilePainted,
        error: videoPreload.error,
        images: [],
        manifest: null,
        variant: "mobile",
        heroRequired: true,
        playheadRef,
        // Mount the video as soon as the blob is ready (under the loader).
        mobileVideoSrc: mobileAssetsReady ? videoPreload.src : null,
        signalMobilePainted,
      };
    }

    return {
      progress: framePreload.ready ? 1 : framePreload.progress,
      ready: framePreload.ready,
      error: framePreload.error,
      images: framePreload.images,
      manifest,
      variant: "desktop",
      heroRequired: true,
      playheadRef,
      mobileVideoSrc: null,
      signalMobilePainted,
    };
  }, [
    heroRequired,
    variantReady,
    isMobile,
    videoPreload,
    framePreload,
    manifest,
    mobileAssetsReady,
    mobilePainted,
    signalMobilePainted,
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
