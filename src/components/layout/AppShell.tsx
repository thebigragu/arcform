"use client";

import { HeroPosterPreload } from "@/components/hero/HeroPosterPreload";
import { Loader } from "@/components/ui/Loader";
import {
  HeroPreloadProvider,
  useHeroPreloadOptional,
} from "@/context/HeroPreloadContext";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useState, type ReactNode } from "react";

function AppShellInner({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const complete = useCallback(() => setLoading(false), []);
  const preload = useHeroPreloadOptional();

  const progress = preload
    ? Math.round((preload.ready ? 1 : preload.progress) * 100)
    : 100;
  const ready = preload ? preload.ready : true;
  const failed = Boolean(preload?.error);

  useEffect(() => {
    if (!ready && !failed) return;
    const t = window.setTimeout(complete, 120);
    return () => window.clearTimeout(t);
  }, [ready, failed, complete]);

  // Hard failsafe — never leave the site invisible
  useEffect(() => {
    const t = window.setTimeout(complete, 60000);
    return () => window.clearTimeout(t);
  }, [complete]);

  return (
    <>
      <AnimatePresence>
        {loading && <Loader progress={progress} onComplete={complete} />}
      </AnimatePresence>
      {/*
        Keep children painted under the opaque loader. opacity-0 prevents mobile
        Safari from compositing the hero video, so first-frame gating never fires.
      */}
      <div
        className={loading ? "pointer-events-none" : undefined}
        aria-hidden={loading || undefined}
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
