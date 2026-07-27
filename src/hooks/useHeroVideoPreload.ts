"use client";

import { HERO_MOBILE_SCRUB_POSTER, HERO_MOBILE_SCRUB_VIDEO } from "@/lib/hero-sequence/config";
import { useEffect, useRef, useState } from "react";

type VideoPreloadState = {
  ready: boolean;
  progress: number;
  error: string | null;
  /** Blob URL for the scrub clip — fully local seeks after fetch. */
  src: string;
};

const IDLE: VideoPreloadState = {
  ready: false,
  progress: 0,
  error: null,
  src: HERO_MOBILE_SCRUB_VIDEO,
};

const DONE: VideoPreloadState = {
  ready: true,
  progress: 1,
  error: null,
  src: HERO_MOBILE_SCRUB_VIDEO,
};

/**
 * Fetch mobile scrub MP4 into a blob URL once — one decode path, fast local seeks.
 */
export function useHeroVideoPreload(enabled: boolean) {
  const [state, setState] = useState<VideoPreloadState>(enabled ? IDLE : DONE);
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
          if (value) {
            chunks.push(value);
            loaded += value.length;
            if (!cancelled && total > 0) {
              setState((s) => ({
                ...s,
                progress: Math.min(0.99, loaded / total),
              }));
            }
          }
        }

        if (cancelled) return;
        const blob = new Blob(chunks, { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setState({
          ready: true,
          progress: 1,
          error: null,
          src: url,
        });
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setState({
          ready: true,
          progress: 0,
          error: `Failed to load ${HERO_MOBILE_SCRUB_VIDEO}`,
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
