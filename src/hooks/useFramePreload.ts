"use client";

import {
  DECODE_MAX_WIDTH,
  PRELOAD_AHEAD_BOOST,
  PRELOAD_MAX_CONCURRENT,
  PRELOAD_MAX_DECODED,
  PRELOAD_VELOCITY_AHEAD_MAX,
  PRELOAD_WINDOW,
} from "@/lib/hero-sequence/config";
import {
  frameUrl,
  isScrubFrameReady,
  releaseScrubFrame,
  type HeroSequenceManifest,
  type ScrubFrame,
} from "@/lib/hero-sequence/types";
import { useEffect, useRef, useState, type RefObject } from "react";

type PreloadState = {
  images: (ScrubFrame | undefined)[];
  progress: number;
  /** First window around frame 0 is warm — safe to dismiss loader. */
  ready: boolean;
  error: string | null;
};

const EMPTY: PreloadState = {
  images: [],
  progress: 0,
  ready: false,
  error: null,
};

function decodeSize(manifest: HeroSequenceManifest) {
  const srcW = Math.max(1, manifest.width);
  const srcH = Math.max(1, manifest.height);
  if (srcW <= DECODE_MAX_WIDTH) {
    return { w: srcW, h: srcH, resize: false as const };
  }
  const scale = DECODE_MAX_WIDTH / srcW;
  return {
    w: DECODE_MAX_WIDTH,
    h: Math.max(1, Math.round(srcH * scale)),
    resize: true as const,
  };
}

type Inflight = {
  promise: Promise<void>;
  abort: AbortController;
};

/**
 * Sliding-window frame cache: velocity-aware lookahead, jump bridging,
 * abortable decodes, and budget eviction. Same path locally and on Vercel.
 */
export function useFramePreload(
  manifest: HeroSequenceManifest | null,
  playheadRef: RefObject<number>,
  options?: { maxConcurrent?: number; enabled?: boolean },
) {
  const maxConcurrent = options?.maxConcurrent ?? PRELOAD_MAX_CONCURRENT;
  const enabled = options?.enabled ?? true;
  const [state, setState] = useState<PreloadState>(EMPTY);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (!manifest || !enabled) {
      setState(EMPTY);
      return;
    }

    const count = manifest.frameCount;
    const images: (ScrubFrame | undefined)[] = new Array(count);
    const inFlight = new Map<number, Inflight>();
    const queued = new Set<number>();
    const targetSize = decodeSize(manifest);
    let aborted = false;
    let readyPublished = false;
    let lastCenter = -1;
    let lastScrollDir = 1;
    let velocityEma = 0;
    let activeLoads = 0;
    let decodedCount = 0;
    /** Priority indices (playhead / bridge), then normal dense band. */
    const hiQueue: number[] = [];
    const loQueue: number[] = [];

    const initialHi = Math.min(count - 1, PRELOAD_WINDOW);
    const initialWindowSize = initialHi + 1;
    let initialLoaded = 0;

    const publish = (ready: boolean, error: string | null = null) => {
      if (aborted) return;
      setState({
        images,
        progress: ready
          ? 1
          : initialWindowSize > 0
            ? initialLoaded / initialWindowSize
            : 0,
        ready,
        error,
      });
    };

    const release = (index: number) => {
      if (!images[index]) return;
      releaseScrubFrame(images[index]);
      images[index] = undefined;
      decodedCount = Math.max(0, decodedCount - 1);
    };

    const bumpInitial = (index: number) => {
      if (index <= initialHi) {
        initialLoaded += 1;
        if (!readyPublished && initialLoaded >= initialWindowSize) {
          readyPublished = true;
          publish(true);
        } else if (!readyPublished) {
          publish(false);
        }
      }
    };

    const aheadExtra = () =>
      Math.min(
        PRELOAD_VELOCITY_AHEAD_MAX,
        Math.round(Math.abs(velocityEma) * 3),
      );

    const loadBounds = (center: number, dir: number) => {
      const back = PRELOAD_WINDOW;
      const ahead = PRELOAD_WINDOW + PRELOAD_AHEAD_BOOST + aheadExtra();
      if (dir >= 0) {
        return {
          lo: Math.max(0, center - back),
          hi: Math.min(count - 1, center + ahead),
        };
      }
      return {
        lo: Math.max(0, center - ahead),
        hi: Math.min(count - 1, center + back),
      };
    };

    const usefulDist = (center: number) =>
      PRELOAD_WINDOW + PRELOAD_AHEAD_BOOST + aheadExtra() + 48;

    const enforceBudget = (center: number, dir: number) => {
      if (decodedCount <= PRELOAD_MAX_DECODED) return;
      const { lo, hi } = loadBounds(center, dir);
      const victims: { i: number; dist: number }[] = [];
      for (let i = 0; i < count; i++) {
        if (!images[i]) continue;
        if (i >= lo && i <= hi) continue;
        const behind = dir >= 0 ? i < center : i > center;
        // Keep trail longer than speculative ahead-outside-band.
        const dist = Math.abs(i - center) + (behind ? 0 : 500);
        victims.push({ i, dist });
      }
      victims.sort((a, b) => b.dist - a.dist);
      for (const v of victims) {
        if (decodedCount <= PRELOAD_MAX_DECODED) break;
        release(v.i);
      }
    };

    const storeFrame = (index: number, frame: ScrubFrame) => {
      const c = playheadRef.current ?? 0;
      const { lo, hi } = loadBounds(c, lastScrollDir);
      if (Math.abs(index - c) > usefulDist(c) && (index < lo || index > hi)) {
        releaseScrubFrame(frame);
        return;
      }
      if (!images[index]) decodedCount += 1;
      else releaseScrubFrame(images[index]);
      images[index] = frame;
      bumpInitial(index);
      enforceBudget(c, lastScrollDir);
    };

    const loadViaImage = (url: string, signal: AbortSignal) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        const img = new Image();
        img.decoding = "async";
        const onAbort = () => {
          img.src = "";
          reject(new DOMException("Aborted", "AbortError"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        img.onload = () => {
          signal.removeEventListener("abort", onAbort);
          resolve(img);
        };
        img.onerror = () => {
          signal.removeEventListener("abort", onAbort);
          reject(new Error(`img ${url}`));
        };
        img.src = url;
      });

    const loadViaBitmap = async (url: string, signal: AbortSignal) => {
      const res = await fetch(url, {
        signal,
        // Chromium: prefer playhead-adjacent frames when contended.
        priority: "high",
      } as RequestInit);
      if (!res.ok) throw new Error(`frame ${res.status}`);
      const blob = await res.blob();
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      // "medium" is meaningfully faster than "high" at 1600px with little visual cost.
      return createImageBitmap(blob, {
        resizeWidth: targetSize.w,
        resizeHeight: targetSize.h,
        resizeQuality: "medium",
      });
    };

    const abortLoad = (index: number) => {
      const entry = inFlight.get(index);
      if (!entry) return;
      entry.abort.abort();
      inFlight.delete(index);
    };

    const loadOne = (index: number) => {
      if (aborted || index < 0 || index >= count) return;
      if (isScrubFrameReady(images[index])) return;
      if (inFlight.has(index)) return;

      const url = frameUrl(manifest, index);
      const controller = new AbortController();

      const promise = (async () => {
        activeLoads += 1;
        try {
          const frame: ScrubFrame = targetSize.resize
            ? await loadViaBitmap(url, controller.signal)
            : await loadViaImage(url, controller.signal);
          if (aborted || controller.signal.aborted) {
            releaseScrubFrame(frame);
            return;
          }
          storeFrame(index, frame);
        } catch (e) {
          const isAbort =
            typeof e === "object" &&
            e !== null &&
            "name" in e &&
            (e as { name: string }).name === "AbortError";
          if (!isAbort && !aborted && !readyPublished) {
            readyPublished = true;
            publish(true, `Failed to load ${url}`);
          }
        } finally {
          inFlight.delete(index);
          activeLoads = Math.max(0, activeLoads - 1);
          pump();
        }
      })();

      inFlight.set(index, { promise, abort: controller });
    };

    const takeNext = (): number | undefined => {
      while (hiQueue.length > 0) {
        const next = hiQueue.shift()!;
        queued.delete(next);
        if (isScrubFrameReady(images[next])) continue;
        if (inFlight.has(next)) continue;
        return next;
      }
      while (loQueue.length > 0) {
        const next = loQueue.shift()!;
        queued.delete(next);
        if (isScrubFrameReady(images[next])) continue;
        if (inFlight.has(next)) continue;
        return next;
      }
      return undefined;
    };

    const pump = () => {
      while (activeLoads < maxConcurrent) {
        const next = takeNext();
        if (next === undefined) break;
        loadOne(next);
      }
    };

    const enqueue = (indices: number[], priority = false) => {
      const q = priority ? hiQueue : loQueue;
      for (const i of indices) {
        if (i < 0 || i >= count) continue;
        if (isScrubFrameReady(images[i])) continue;
        if (inFlight.has(i)) continue;
        if (queued.has(i)) {
          if (priority && !hiQueue.includes(i)) {
            // Promote from lo → hi.
            const loIdx = loQueue.indexOf(i);
            if (loIdx >= 0) loQueue.splice(loIdx, 1);
            hiQueue.push(i);
          }
          continue;
        }
        queued.add(i);
        q.push(i);
      }
      pump();
    };

    const bridgeIndices = (from: number, to: number, speed: number) => {
      const span = Math.abs(to - from);
      if (span <= 1) return [] as number[];
      // Faster scrub → denser bridge so monotonic draw has more stepping stones.
      const maxSteps = Math.min(span, speed > 12 ? 64 : speed > 4 ? 48 : 32);
      const stride = Math.max(1, Math.ceil(span / maxSteps));
      const dir = to >= from ? 1 : -1;
      const out: number[] = [];
      for (let i = from + dir; dir > 0 ? i < to : i > to; i += dir * stride) {
        out.push(i);
      }
      return out;
    };

    const pruneStaleWork = (center: number, lo: number, hi: number) => {
      const keepLo = Math.max(0, lo - 32);
      const keepHi = Math.min(count - 1, hi + 32);
      const maxD = usefulDist(center);

      for (let q = hiQueue.length - 1; q >= 0; q--) {
        const idx = hiQueue[q]!;
        if (idx < keepLo || idx > keepHi) {
          hiQueue.splice(q, 1);
          queued.delete(idx);
        }
      }
      for (let q = loQueue.length - 1; q >= 0; q--) {
        const idx = loQueue[q]!;
        if (idx < keepLo || idx > keepHi) {
          loQueue.splice(q, 1);
          queued.delete(idx);
        }
      }

      // Abort decodes that are no longer near the playhead — frees concurrent slots.
      for (const [idx] of inFlight) {
        if (Math.abs(idx - center) > maxD && (idx < keepLo || idx > keepHi)) {
          abortLoad(idx);
        }
      }
    };

    const ensureWindow = (center: number) => {
      const c = Math.min(count - 1, Math.max(0, center | 0));
      if (c === lastCenter) {
        pump();
        return;
      }

      const prev = lastCenter;
      const delta = prev >= 0 ? c - prev : 0;
      if (prev >= 0) {
        lastScrollDir = delta >= 0 ? 1 : -1;
        velocityEma = velocityEma * 0.65 + delta * 0.35;
      }
      lastCenter = c;

      const { lo, hi } = loadBounds(c, lastScrollDir);
      enforceBudget(c, lastScrollDir);
      pruneStaleWork(c, lo, hi);

      const forward: number[] = [];
      const backward: number[] = [];
      for (let i = lo; i <= hi; i++) {
        if (lastScrollDir >= 0) {
          if (i >= c) forward.push(i);
          else backward.push(i);
        } else if (i <= c) {
          forward.push(i);
        } else {
          backward.push(i);
        }
      }
      if (lastScrollDir >= 0) backward.reverse();
      else forward.reverse();

      const speed = Math.abs(velocityEma);
      const bridge =
        prev >= 0 && Math.abs(c - prev) > PRELOAD_WINDOW * 0.5
          ? bridgeIndices(prev, c, speed)
          : [];

      enqueue([c], true);
      if (bridge.length) enqueue(bridge, true);
      enqueue([...forward, ...backward]);
    };

    publish(false);

    if (reducedRef.current) {
      const url = frameUrl(manifest, 0);
      const controller = new AbortController();
      void (async () => {
        try {
          const frame: ScrubFrame = targetSize.resize
            ? await loadViaBitmap(url, controller.signal)
            : await loadViaImage(url, controller.signal);
          if (aborted) {
            releaseScrubFrame(frame);
            return;
          }
          images[0] = frame;
          decodedCount = 1;
          readyPublished = true;
          publish(true);
        } catch {
          if (!aborted) {
            readyPublished = true;
            publish(true, `Failed to load ${url}`);
          }
        }
      })();
      return () => {
        aborted = true;
        controller.abort();
        for (let i = 0; i < count; i++) release(i);
        setState(EMPTY);
      };
    }

    ensureWindow(playheadRef.current ?? 0);

    let raf = 0;
    const tick = () => {
      ensureWindow(playheadRef.current ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      aborted = true;
      cancelAnimationFrame(raf);
      hiQueue.length = 0;
      loQueue.length = 0;
      queued.clear();
      for (const [idx] of inFlight) abortLoad(idx);
      inFlight.clear();
      for (let i = 0; i < count; i++) release(i);
      setState(EMPTY);
    };
  }, [manifest, maxConcurrent, enabled, playheadRef]);

  return state;
}
