# AppShell scroll-lock / loader-failsafe wiring (documentation fragment)

This documents the wiring the Website's `src/components/layout/AppShell.tsx`
uses to hold document scroll while the production readiness gate holds the
site loader, and to extend the loader's hard failsafe timeout while that
gate is active. `install-runtime.cjs` does **not** patch your app shell
automatically (every agency app shell differs) — apply this by hand, then
`scripts/certify.cjs` will detect and validate the wiring once present.

## Imports

```tsx
import { useMediaPreloadOptional } from "@/context/MediaPreloadContext";
import { lockDocumentScroll, unlockDocumentScroll } from "@/media-engine/MediaScrollLock";
```

## State + effects

```tsx
const scrollLockedRef = useRef(false);
const preload = useMediaPreloadOptional();
const gate = Boolean(preload?.readinessGateEnabled);

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

// Baseline: hard failsafe 800ms. Readiness gate: allow full gate duration + buffer.
useEffect(() => {
  const ms = gate ? 12_000 : 800;
  const t = window.setTimeout(complete, ms);
  return () => window.clearTimeout(t);
}, [gate, complete]);

// Unlock on unmount as a safety net
useEffect(() => {
  return () => {
    if (scrollLockedRef.current) {
      unlockDocumentScroll("unmount");
      scrollLockedRef.current = false;
    }
  };
}, []);

// Fallback unlock if the exit-animation callback is skipped
useEffect(() => {
  if (!gate || loading || !scrollLockedRef.current) return;
  const t = window.setTimeout(() => unlockAfterOverlay("loader-hidden-fallback"), 400);
  return () => window.clearTimeout(t);
}, [gate, loading, unlockAfterOverlay]);
```

Call `unlockAfterOverlay(reason)` from wherever your loader's exit/overlay
animation completes (e.g. an `onExitComplete` from `AnimatePresence`).

## SmoothScroll (Lenis) integration

If your shell uses Lenis (or similar) for smooth scrolling, subscribe to
the scroll-lock event stream so Lenis stops while locked:

```tsx
import { subscribeScrollLock } from "@/media-engine";

useEffect(() => {
  return subscribeScrollLock((locked) => {
    if (locked) lenis.stop();
    else lenis.start();
  });
}, [lenis]);
```

`12_000` (12s) and `800` (ms) above are integration-layer UX constants for
*this* fragment, not engine policy — they may be tuned per agency shell.
The engine's own readiness gate timeouts (8000/7000/6000ms per tier) are
frozen and live in `MediaReadinessGate.ts` (see
`agency-defaults/performance-budgets.md`); they are independent of this
loader failsafe value, which only bounds worst-case UX if something upstream
never resolves.
