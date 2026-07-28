"use client";

import { MediaView } from "@/components/media/MediaView";
import {
  HERO_MEDIA_ID,
  HERO_POSTER_FALLBACK,
} from "@/lib/media-engine/heroDefaults";
import type {
  DeviceClass,
  EngineStats,
  ExperienceMode,
  RendererPreference,
} from "@/lib/media-engine";
import { useMotionValue } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function parseMode(value: string | null): ExperienceMode | undefined {
  if (
    value === "full-scrub" ||
    value === "lite-scrub" ||
    value === "playback" ||
    value === "poster"
  ) {
    return value;
  }
  return undefined;
}

function parseRenderer(value: string | null): RendererPreference | undefined {
  if (
    value === "auto" ||
    value === "webcodecs" ||
    value === "html-video" ||
    value === "poster"
  ) {
    return value;
  }
  return undefined;
}

function MediaCertInner() {
  const params = useSearchParams();
  const mediaId = params.get("media") ?? HERO_MEDIA_ID;
  const mode = parseMode(params.get("mode"));
  const renderer = parseRenderer(params.get("renderer"));
  const deviceClass = (params.get("device") === "mobile"
    ? "mobile"
    : "desktop") as DeviceClass;
  const reducedMotion = params.get("reducedMotion") === "1";

  const posterFallback =
    mediaId === HERO_MEDIA_ID
      ? HERO_POSTER_FALLBACK
      : {
          desktop: `/videos/media/${mediaId}/posters/desktop-poster.webp`,
          mobile: `/videos/media/${mediaId}/posters/mobile-poster.webp`,
        };

  const progress = useMotionValue(0);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const certKey = useMemo(
    () => `${mediaId}-${mode ?? "auto"}-${renderer ?? "auto"}-${deviceClass}`,
    [mediaId, mode, renderer, deviceClass],
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const observer = setInterval(() => {
      const overlay = document.querySelector("[data-media-debug-json]");
      const raw = overlay?.getAttribute("data-media-debug-json");
      if (raw) {
        try {
          setStats(JSON.parse(raw));
        } catch {
          /* */
        }
      }
    }, 400);
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      progress.set(Math.min(1, frame / 600));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      clearInterval(observer);
      cancelAnimationFrame(raf);
    };
  }, [progress, certKey]);

  if (process.env.NODE_ENV === "production") {
    return <p>Media certification harness is dev-only.</p>;
  }

  return (
    <main className="relative h-[100dvh] w-full bg-[#08090b]">
      <MediaView
        key={certKey}
        deviceClass={deviceClass}
        mediaId={mediaId}
        posterFallback={posterFallback}
        scrubProgress={progress}
        renderer={renderer}
        debug
        reducedMotion={reducedMotion}
        forceExperienceMode={mode}
      />
      <pre
        data-media-cert
        className="absolute bottom-2 left-2 z-50 max-h-48 overflow-auto rounded bg-black/80 p-2 text-[10px] text-white"
      >
        {JSON.stringify(stats ?? {})}
      </pre>
    </main>
  );
}

export default function MediaCertPage() {
  return (
    <Suspense fallback={<main className="h-[100dvh] bg-[#08090b]" />}>
      <MediaCertInner />
    </Suspense>
  );
}
