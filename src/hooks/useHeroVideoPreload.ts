"use client";

import {
  HERO_MOBILE_SCRUB_POSTER,
  HERO_MOBILE_SCRUB_VIDEO,
} from "@/lib/hero-sequence/config";
import { useEffect, useRef, useState } from "react";

type HeroVideoPreloadState = {
  ready: boolean;
  progress: number;
  error: string | null;
  /** Blob URL for the scrub clip — every seek stays local once set. */
  src: string | null;
};

const IDLE: HeroVideoPreloadState = {
  ready: false,
  progress: 0,
  error: null,
  src: null,
};

const DONE: HeroVideoPreloadState = {
  ready: true,
  progress: 1,
  error: null,
  src: null,
};

/** Resolve once the source has real frame data, so the hero never reveals black. */
function warmupVideoSrc(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const cleanup = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load();
    };

    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Video warmup failed"));
    };

    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.src = src;
    video.load();
  });
}

/**
 * Fetch the mobile scrub MP4 into a blob so scroll seeks never hit the network.
 */
export function useHeroVideoPreload(enabled: boolean) {
  const [state, setState] = useState<HeroVideoPreloadState>(enabled ? IDLE : DONE);
  const blobRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState(DONE);
      return;
    }

    let cancelled = false;

    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "fetch";
    link.href = HERO_MOBILE_SCRUB_VIDEO;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);

    const load = async () => {
      try {
        const res = await fetch(HERO_MOBILE_SCRUB_VIDEO, { cache: "force-cache" });
        if (!res.ok) throw new Error(`fetch ${res.status}`);

        const total = Number(res.headers.get("content-length")) || 0;
        const reader = res.body?.getReader();
        if (!reader) throw new Error("no body");

        const chunks: BlobPart[] = [];
        let loaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          chunks.push(value);
          loaded += value.length;
          if (!cancelled && total > 0) {
            setState((current) => ({
              ...current,
              progress: Math.min(0.9, (loaded / total) * 0.9),
            }));
          }
        }

        if (cancelled) return;

        const url = URL.createObjectURL(new Blob(chunks, { type: "video/mp4" }));
        blobRef.current = url;

        await warmupVideoSrc(url);
        if (cancelled) return;

        setState({ ready: true, progress: 1, error: null, src: url });
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        // Fall back to the network URL so the hero still renders.
        setState({
          ready: true,
          progress: 1,
          error: null,
          src: HERO_MOBILE_SCRUB_VIDEO,
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
      link.remove();
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [enabled]);

  return { ...state, poster: HERO_MOBILE_SCRUB_POSTER };
}
