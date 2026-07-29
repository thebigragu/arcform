/**
 * Document scroll lock for readiness-gate A/B.
 * Reversible; does not use body position:fixed (avoids canvas resize churn).
 */

export type ScrollLockTelemetry = {
  scrollLockActive: boolean;
  scrollLockAtGateStart: number | null;
  scrollLockIntended: number | null;
  scrollLockMaxDeviation: number;
  scrollLockWheelBlocked: number;
  scrollLockTouchBlocked: number;
  scrollLockKeyboardBlocked: number;
  scrollLockAtRelease: number | null;
  scrollLockUnlockReason: string | null;
  scrollLockCleanupCompleted: boolean;
  scrollLockFreshTopEntry: boolean;
  scrollLockHistoryPreserve: boolean;
};

type LockListener = (locked: boolean) => void;

const listeners = new Set<LockListener>();

let active = false;
let intendedY = 0;
let startY: number | null = null;
let maxDeviation = 0;
let wheelBlocked = 0;
let touchBlocked = 0;
let keyboardBlocked = 0;
let atRelease: number | null = null;
let unlockReason: string | null = null;
let cleanupCompleted = true;
let freshTopEntry = true;
let historyPreserve = false;

let savedHtmlOverflow = "";
let savedBodyOverflow = "";
let savedHtmlGutter = "";
let savedBodyPaddingRight = "";
let savedHtmlOverscroll = "";
let savedBodyOverscroll = "";
let scrollbarCompPx = 0;

const SCROLL_KEYS = new Set([
  " ",
  "Spacebar",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
]);

function notify(locked: boolean) {
  for (const fn of listeners) {
    try {
      fn(locked);
    } catch {
      /* */
    }
  }
}

export function subscribeScrollLock(fn: LockListener) {
  listeners.add(fn);
  fn(active);
  return () => {
    listeners.delete(fn);
  };
}

export function isDocumentScrollLocked() {
  return active;
}

function scrollbarWidth() {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

function onWheel(e: WheelEvent) {
  if (!active) return;
  e.preventDefault();
  wheelBlocked += 1;
  window.scrollTo(0, intendedY);
}

function onTouchMove(e: TouchEvent) {
  if (!active) return;
  e.preventDefault();
  touchBlocked += 1;
  window.scrollTo(0, intendedY);
}

function onKeyDown(e: KeyboardEvent) {
  if (!active) return;
  if (!SCROLL_KEYS.has(e.key)) return;
  // Allow typing in inputs
  const t = e.target as HTMLElement | null;
  if (
    t &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.isContentEditable)
  ) {
    return;
  }
  e.preventDefault();
  keyboardBlocked += 1;
  window.scrollTo(0, intendedY);
}

function onScroll() {
  if (!active) return;
  const y = window.scrollY || window.pageYOffset || 0;
  const d = Math.abs(y - intendedY);
  if (d > maxDeviation) maxDeviation = d;
  if (d > 0.5) window.scrollTo(0, intendedY);
}

/**
 * Lock document scroll for readiness gate.
 * Fresh top entry → force Y=0. History/hash/deep restore → preserve Y.
 */
export function lockDocumentScroll(opts?: {
  reason?: string;
}): ScrollLockTelemetry {
  if (typeof window === "undefined") return getScrollLockTelemetry();
  if (active) return getScrollLockTelemetry();

  cleanupCompleted = false;
  unlockReason = null;
  atRelease = null;
  maxDeviation = 0;
  wheelBlocked = 0;
  touchBlocked = 0;
  keyboardBlocked = 0;

  const hash = window.location.hash;
  const y = window.scrollY || window.pageYOffset || 0;
  startY = y;

  // Fresh top: near-zero scroll and no hash → normalize to 0
  historyPreserve = Boolean(hash) || y > 8;
  freshTopEntry = !historyPreserve;
  intendedY = freshTopEntry ? 0 : y;

  if (freshTopEntry && y !== 0) {
    window.scrollTo(0, 0);
  } else if (!freshTopEntry) {
    window.scrollTo(0, intendedY);
  }

  const html = document.documentElement;
  const body = document.body;
  savedHtmlOverflow = html.style.overflow;
  savedBodyOverflow = body.style.overflow;
  savedHtmlGutter = html.style.scrollbarGutter;
  savedBodyPaddingRight = body.style.paddingRight;
  savedHtmlOverscroll = html.style.overscrollBehavior;
  savedBodyOverscroll = body.style.overscrollBehavior;

  scrollbarCompPx = scrollbarWidth();
  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  html.style.scrollbarGutter = "stable";
  html.style.overscrollBehavior = "none";
  body.style.overscrollBehavior = "none";
  if (scrollbarCompPx > 0) {
    body.style.paddingRight = `${scrollbarCompPx}px`;
  }

  window.addEventListener("wheel", onWheel, { passive: false, capture: true });
  window.addEventListener("touchmove", onTouchMove, {
    passive: false,
    capture: true,
  });
  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });

  active = true;
  notify(true);
  return getScrollLockTelemetry();
}

export function unlockDocumentScroll(reason: string): ScrollLockTelemetry {
  if (typeof window === "undefined") return getScrollLockTelemetry();
  if (!active) {
    unlockReason = reason;
    cleanupCompleted = true;
    return getScrollLockTelemetry();
  }

  atRelease = window.scrollY || window.pageYOffset || 0;
  unlockReason = reason;

  window.removeEventListener("wheel", onWheel, { capture: true } as EventListenerOptions);
  window.removeEventListener("touchmove", onTouchMove, {
    capture: true,
  } as EventListenerOptions);
  window.removeEventListener("keydown", onKeyDown, {
    capture: true,
  } as EventListenerOptions);
  window.removeEventListener("scroll", onScroll, {
    capture: true,
  } as EventListenerOptions);

  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = savedHtmlOverflow;
  body.style.overflow = savedBodyOverflow;
  html.style.scrollbarGutter = savedHtmlGutter;
  body.style.paddingRight = savedBodyPaddingRight;
  html.style.overscrollBehavior = savedHtmlOverscroll;
  body.style.overscrollBehavior = savedBodyOverscroll;

  active = false;
  notify(false);

  // Restore intended position (0 for fresh top entry)
  window.scrollTo(0, intendedY);
  atRelease = window.scrollY || window.pageYOffset || 0;
  cleanupCompleted = true;
  return getScrollLockTelemetry();
}

export function getScrollLockTelemetry(): ScrollLockTelemetry {
  return {
    scrollLockActive: active,
    scrollLockAtGateStart: startY,
    scrollLockIntended: active || startY != null ? intendedY : null,
    scrollLockMaxDeviation: maxDeviation,
    scrollLockWheelBlocked: wheelBlocked,
    scrollLockTouchBlocked: touchBlocked,
    scrollLockKeyboardBlocked: keyboardBlocked,
    scrollLockAtRelease: atRelease,
    scrollLockUnlockReason: unlockReason,
    scrollLockCleanupCompleted: cleanupCompleted,
    scrollLockFreshTopEntry: freshTopEntry,
    scrollLockHistoryPreserve: historyPreserve,
  };
}
