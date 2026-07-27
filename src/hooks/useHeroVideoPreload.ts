"use client";

import { HERO_MOBILE_SCRUB_POSTER, HERO_MOBILE_SCRUB_VIDEO } from "@/lib/hero-sequence/config";
import { useEffect, useState } from "react";

type VideoPreloadState = {
  ready: boolean;
  progress: number;
  error: string | null;
  duration: number;
};

const IDLE: VideoPreloadState = {
  ready: false,
  progress: 0,
  error: null,
  duration: 0,
};

const DONE: VideoPreloadState = {
  ready: true,
  progress: 1,
  error: null,
  duration: 0,
};

/**
 * Warm the mobile scrub MP4 (metadata + enough buffer to scrub frame 0).
 * Uses a detached video element; the visible hero reuses the same URL from cache.
 */
export function useHeroVideoPreload(enabled: boolean) {
  const [state, setState] = useState<VideoPreloadState>(enabled ? IDLE : DONE);

  useEffect(() => {
    if (!enabled) {
      setState(DONE);
      return;
    }

    let cancelled = false;
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = HERO_MOBILE_SCRUB_VIDEO;

    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "video";
    link.href = HERO_MOBILE_SCRUB_VIDEO;
    document.head.appendChild(link);

    const publishProgress = () => {
      if (cancelled || !video.duration || !Number.isFinite(video.duration)) return;
      let buffered = 0;
      if (video.buffered.length > 0) {
        buffered = video.buffered.end(video.buffered.length - 1) / video.duration;
      }
      setState((s) => ({
        ...s,
        progress: Math.min(1, buffered),
        duration: video.duration,
      }));
    };

    const onReady = () => {
      if (cancelled) return;
      setState({
        ready: true,
        progress: 1,
        error: null,
        duration: video.duration || 0,
      });
    };

    const onError = () => {
      if (cancelled) return;
      setState({
        ready: true,
        progress: 0,
        error: `Failed to load ${HERO_MOBILE_SCRUB_VIDEO}`,
        duration: 0,
      });
    };

    video.addEventListener("loadedmetadata", publishProgress);
    video.addEventListener("progress", publishProgress);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);

    video.load();

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", publishProgress);
      video.removeEventListener("progress", publishProgress);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load();
      link.remove();
    };
  }, [enabled]);

  return { ...state, poster: HERO_MOBILE_SCRUB_POSTER, src: HERO_MOBILE_SCRUB_VIDEO };
}
