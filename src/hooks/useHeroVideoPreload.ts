"use client";

import { HERO_MOBILE_SCRUB_POSTER, HERO_MOBILE_SCRUB_VIDEO } from "@/lib/hero-sequence/config";
import { Mp4ScrubEngine } from "@/lib/hero-sequence/mp4-scrub-engine";
import { useEffect, useRef, useState } from "react";

export type MobileScrubMode = "webcodecs" | "video";

type HeroVideoPreloadState = {
  ready: boolean;
  progress: number;
  error: string | null;
  engine: Mp4ScrubEngine | null;
  videoSrc: string | null;
  mode: MobileScrubMode | null;
};

const IDLE: HeroVideoPreloadState = {
  ready: false,
  progress: 0,
  error: null,
  engine: null,
  videoSrc: null,
  mode: null,
};

const DONE: HeroVideoPreloadState = {
  ready: true,
  progress: 1,
  error: null,
  engine: null,
  videoSrc: null,
  mode: null,
};

function supportsWebCodecs() {
  return typeof window !== "undefined" && "VideoDecoder" in window;
}

async function fetchScrubMp4(
  onProgress: (progress: number) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(HERO_MOBILE_SCRUB_VIDEO, { cache: "force-cache" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);

  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body?.getReader();
  if (!reader) throw new Error("no body");

  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    chunks.push(value);
    loaded += value.length;
    if (total > 0) {
      onProgress(Math.min(0.78, (loaded / total) * 0.78));
    }
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes.buffer;
}

/**
 * Fetch mobile scrub MP4. Prefer WebCodecs canvas scrub; fall back to blob + video seeks.
 */
export function useHeroVideoPreload(enabled: boolean) {
  const [state, setState] = useState<HeroVideoPreloadState>(enabled ? IDLE : DONE);
  const engineRef = useRef<Mp4ScrubEngine | null>(null);
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

    const finishVideoFallback = (buffer: ArrayBuffer) => {
      const blob = new Blob([buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      blobRef.current = url;
      setState({
        ready: true,
        progress: 1,
        error: null,
        engine: null,
        videoSrc: url,
        mode: "video",
      });
    };

    const load = async () => {
      try {
        const buffer = await fetchScrubMp4((progress) => {
          if (!cancelled) {
            setState((current) => ({ ...current, progress }));
          }
        });

        if (cancelled) return;

        if (supportsWebCodecs()) {
          try {
            const engine = await Mp4ScrubEngine.create(buffer, (progress) => {
              if (!cancelled) {
                setState((current) => ({ ...current, progress }));
              }
            });

            if (cancelled) {
              engine.close();
              return;
            }

            engineRef.current = engine;
            setState({
              ready: true,
              progress: 1,
              error: null,
              engine,
              videoSrc: null,
              mode: "webcodecs",
            });
            return;
          } catch (error) {
            console.warn("WebCodecs mobile scrub failed; using video fallback.", error);
          }
        }

        if (cancelled) return;
        finishVideoFallback(buffer);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setState({
          ready: true,
          progress: 0,
          error: `Failed to load ${HERO_MOBILE_SCRUB_VIDEO}`,
          engine: null,
          videoSrc: HERO_MOBILE_SCRUB_VIDEO,
          mode: "video",
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
      link.remove();
      engineRef.current?.close();
      engineRef.current = null;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [enabled]);

  return { ...state, poster: HERO_MOBILE_SCRUB_POSTER };
}
