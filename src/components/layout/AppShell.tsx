"use client";

import { HeroPosterPreload } from "@/components/hero/HeroPosterPreload";
import { Loader } from "@/components/ui/Loader";
import {
  HeroPreloadProvider,
  useHeroPreloadOptional,
} from "@/context/HeroPreloadContext";
import {
  lockDocumentScroll,
  unlockDocumentScroll,
} from "@/media-engine/MediaScrollLock";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

function AppShellInner({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const complete = useCallback(() => setLoading(false), []);
  const preload = useHeroPreloadOptional();
  const scrollLockedRef = useRef(false);

  const gate = Boolean(preload?.readinessGateEnabled);
  const progress = preload
    ? Math.round((preload.ready ? 1 : preload.progress) * 100)
    : 100;
  const ready = preload ? preload.ready : true;
  const failed = Boolean(preload?.error);

  // Lock document scroll while readiness gate holds the loader
  useEffect(() => {
    if (!gate) return;
    if (loading && !scrollLockedRef.current) {
      lockDocumentScroll({ reason: "readiness-gate-active" });
      scrollLockedRef.current = true;
    }
  }, [gate, loading]);

  const unlockAfterOverlay = useCallback((reason: string) => {
    if (!scrollLockedRef.current) return;
    unlockDocumentScroll(reason);
    scrollLockedRef.current = false;
  }, []);

  useEffect(() => {
    if (!ready && !failed) return;
    const t = window.setTimeout(complete, 120);
    return () => window.clearTimeout(t);
  }, [ready, failed, complete]);

  // Baseline: hard failsafe 800ms. Readiness gate: allow full gate duration + buffer.
  useEffect(() => {
    const ms = gate ? 12_000 : 800;
    const t = window.setTimeout(complete, ms);
    return () => window.clearTimeout(t);
  }, [complete, gate]);

  // Always clean up lock on unmount / route leave
  useEffect(() => {
    return () => {
      if (scrollLockedRef.current) {
        unlockDocumentScroll("unmount");
        scrollLockedRef.current = false;
      }
    };
  }, []);

  // Fallback unlock if exit animation callback is skipped
  useEffect(() => {
    if (!gate || loading || !scrollLockedRef.current) return;
    const t = window.setTimeout(() => {
      unlockAfterOverlay("loader-hidden-fallback");
    }, 750);
    return () => window.clearTimeout(t);
  }, [gate, loading, unlockAfterOverlay]);

  return (
    <>
      <AnimatePresence
        onExitComplete={() => {
          if (gate) unlockAfterOverlay("loader-exit-complete");
        }}
      >
        {loading && (
          <Loader
            progress={progress}
            onComplete={complete}
            preparing={gate}
          />
        )}
      </AnimatePresence>
      {/*
        Keep children painted under the opaque loader. opacity-0 prevents mobile
        Safari from compositing the hero video, so first-frame gating never fires.
      */}
      <div
        className={loading ? "pointer-events-none" : undefined}
        aria-hidden={loading || undefined}
        aria-busy={gate && loading ? true : undefined}
      >
        <HeroPosterPreload />
        {children}
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <HeroPreloadProvider>
      <AppShellInner>{children}</AppShellInner>
    </HeroPreloadProvider>
  );
}
