"use client";

import { MediaView } from "@/components/media/MediaView";
import { HERO_MEDIA_ID, HERO_POSTER_FALLBACK } from "@/media-engine";
import { useMotionValue } from "framer-motion";
import { Suspense, useMemo } from "react";

/**
 * Gate 1 static cert harness — Sequence Scrub only (no WebCodecs/Playback modes).
 */
function CertInner() {
  const progress = useMotionValue(0);
  const deviceClass = useMemo(() => {
    if (typeof window === "undefined") return "desktop" as const;
    return window.matchMedia("(max-width: 768px)").matches
      ? ("mobile" as const)
      : ("desktop" as const);
  }, []);

  return (
    <div className="min-h-screen bg-black p-4 text-white">
      <h1 className="mb-2 font-mono text-sm">Gate 1 media cert</h1>
      <div className="relative mx-auto aspect-video w-full max-w-4xl overflow-hidden">
        <MediaView
          mediaId={HERO_MEDIA_ID}
          deviceClass={deviceClass}
          scrubProgress={progress}
          posterFallback={HERO_POSTER_FALLBACK}
          debug
          onReady={() => {
            /* engine ready */
          }}
        />
      </div>
      <input
        className="mt-4 w-full"
        type="range"
        min={0}
        max={1}
        step={0.001}
        defaultValue={0}
        onChange={(e) => progress.set(Number(e.target.value))}
      />
      <p className="mt-2 font-mono text-xs text-white/60">
        Open with ?mediaDebug=1 for overlay stats
      </p>
    </div>
  );
}

export default function MediaCertPage() {
  return (
    <Suspense fallback={<div className="p-4 text-white">Loading…</div>}>
      <CertInner />
    </Suspense>
  );
}
