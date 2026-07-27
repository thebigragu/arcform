"use client";

import { useHeroMobileVideo } from "@/hooks/useIsMobile";
import {
  motion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useMemo } from "react";

const GOLD = "#c4a574";

/** Soft layered drop — readable over video without a blotchy plate. */
const LETTER_SHADOW =
  "0 0 2px rgba(0,0,0,1), 0 1px 3px rgba(0,0,0,0.95), 0 2px 8px rgba(0,0,0,0.85), 0 5px 18px rgba(0,0,0,0.65), 0 10px 32px rgba(0,0,0,0.45), 0 16px 48px rgba(0,0,0,0.28)";

function smoothstep(e: number) {
  const t = Math.min(1, Math.max(0, e));
  return t * t * (3 - 2 * t);
}

type Word = { t: string; emph?: boolean };

type SideBlurb = {
  id: string;
  title: Word[];
  body: string;
  bodyEmph: string[];
  appear: [number, number];
  vanish: [number, number];
  /** Desktop: mid = left-rail center; low = lower left. Mobile: both share one centered low slot. */
  align: "mid" | "low";
  /** Keep the full title on a single line. */
  titleNowrap?: boolean;
  /** Force last N body words onto one line (overrides orphan heuristic). */
  bodyGlueLast?: number;
};

const BLURBS: SideBlurb[] = [
  {
    id: "design",
    title: [{ t: "Bespoke", emph: true }, { t: "web design" }],
    body: "Interfaces that feel inevitable. Present and intentional.",
    bodyEmph: ["inevitable", "intentional"],
    appear: [0.01, 0.1],
    // Exit earlier by the same ~0.05 we pulled the entrance forward
    vanish: [0.37, 0.45],
    align: "mid",
    titleNowrap: true,
  },
  {
    id: "apps",
    title: [{ t: "Apps," }, { t: "engineered", emph: true }],
    body: "Products built to ship. From prototype to production.",
    bodyEmph: ["ship", "production"],
    appear: [0.46, 0.54],
    vanish: [0.78, 0.86],
    align: "low",
    titleNowrap: true,
  },
];

type WordToken = { key: string; text: string; color: string };

function buildTitleTokens(blurb: SideBlurb): WordToken[] {
  const tokens: WordToken[] = [];
  let i = 0;
  blurb.title.forEach((w) => {
    w.t.split(/\s+/).filter(Boolean).forEach((part) => {
      tokens.push({
        key: `${blurb.id}-t-${i++}`,
        text: part,
        color: w.emph ? GOLD : "#ffffff",
      });
    });
  });
  return tokens;
}

function buildBodyTokens(blurb: SideBlurb): WordToken[] {
  return blurb.body
    .split(/\s+/)
    .filter(Boolean)
    .map((part, i) => {
      const clean = part.replace(/[.—,;:!?]/g, "");
      const emph = blurb.bodyEmph.some(
        (e) => clean.toLowerCase() === e.toLowerCase(),
      );
      return {
        key: `${blurb.id}-b-${i}`,
        text: part,
        color: emph ? GOLD : "#ffffff",
      };
    });
}

/**
 * Desktop: fade + short rise on enter, fade + soft lift on exit.
 * Mobile (`inPlace`): opacity only — no translate, no staggered lag.
 */
function useBlurbMotion(
  progress: MotionValue<number>,
  blurb: SideBlurb,
  lag = 0,
  inPlace = false,
) {
  const opacity = useTransform(progress, (p) => {
    const [a0, a1] = blurb.appear;
    const [v0, v1] = blurb.vanish;
    if (inPlace) {
      // Short in-place fade; title + body share the same window (lag ignored).
      if (p < a0) return 0;
      if (p < a1) return (p - a0) / Math.max(0.001, a1 - a0);
      if (p < v0) return 1;
      if (p < v1) return 1 - (p - v0) / Math.max(0.001, v1 - v0);
      return 0;
    }
    const appearStart = a0 + (a1 - a0) * lag;
    const appearEnd = a1 + (a1 - a0) * lag * 0.15;
    const vanishStart = v0 + (v1 - v0) * lag * 0.2;
    const vanishEnd = v1;

    if (p < appearStart) return 0;
    if (p < appearEnd) {
      return smoothstep((p - appearStart) / Math.max(0.001, appearEnd - appearStart));
    }
    if (p < vanishStart) return 1;
    if (p < vanishEnd) {
      return 1 - smoothstep((p - vanishStart) / Math.max(0.001, vanishEnd - vanishStart));
    }
    return 0;
  });

  const y = useTransform(progress, (p) => {
    if (inPlace) return 0;
    const [a0, a1] = blurb.appear;
    const [v0, v1] = blurb.vanish;
    const appearStart = a0 + (a1 - a0) * lag;
    const appearEnd = a1 + (a1 - a0) * lag * 0.15;
    const vanishStart = v0 + (v1 - v0) * lag * 0.2;
    const vanishEnd = v1;
    const rise = typeof window !== "undefined" ? Math.min(28, window.innerHeight * 0.028) : 22;

    if (p < appearStart) return rise;
    if (p < appearEnd) {
      const t = smoothstep((p - appearStart) / Math.max(0.001, appearEnd - appearStart));
      return rise * (1 - t);
    }
    if (p < vanishStart) return 0;
    if (p < vanishEnd) {
      const t = smoothstep((p - vanishStart) / Math.max(0.001, vanishEnd - vanishStart));
      return -rise * 0.55 * t;
    }
    return -rise * 0.55;
  });

  return { opacity, y };
}

function WordLine({
  tokens,
  preventOrphans = false,
  glueLast,
  letterShadow = LETTER_SHADOW,
}: {
  tokens: WordToken[];
  /** Keep the last 2–3 words on one line so a lone word never sits alone. */
  preventOrphans?: boolean;
  /** Explicit last-N glue (e.g. keep "production, end to end." together). */
  glueLast?: number;
  letterShadow?: string;
}) {
  const glueCount = useMemo(() => {
    if (glueLast != null && glueLast > 0) {
      return Math.min(glueLast, tokens.length);
    }
    if (!preventOrphans || tokens.length < 2) return 0;
    const last = tokens[tokens.length - 1]!;
    const prev = tokens[tokens.length - 2]!;
    if (
      tokens.length >= 3 &&
      last.text.replace(/[.—,;:!?]/g, "").length <= 8 &&
      prev.text.replace(/[.—,;:!?]/g, "").length <= 10
    ) {
      return 3;
    }
    return 2;
  }, [preventOrphans, glueLast, tokens]);

  const head = glueCount > 0 ? tokens.slice(0, -glueCount) : tokens;
  const tail = glueCount > 0 ? tokens.slice(-glueCount) : [];

  return (
    <>
      {head.map((token, i) => (
        <span key={token.key}>
          {i > 0 ? " " : null}
          <span
            className="inline-block whitespace-nowrap"
            style={{ color: token.color, textShadow: letterShadow }}
          >
            {token.text}
          </span>
        </span>
      ))}
      {tail.length > 0 ? (
        <span>
          {head.length > 0 ? " " : null}
          <span className="inline-block whitespace-nowrap">
            {tail.map((token, i) => (
              <span key={token.key}>
                {i > 0 ? " " : null}
                <span style={{ color: token.color, textShadow: letterShadow }}>
                  {token.text}
                </span>
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </>
  );
}

function SideBlurbBlock({
  blurb,
  progress,
  isMobile,
}: {
  blurb: SideBlurb;
  progress: MotionValue<number>;
  isMobile: boolean;
}) {
  const titleTokens = useMemo(() => buildTitleTokens(blurb), [blurb]);
  const bodyTokens = useMemo(() => buildBodyTokens(blurb), [blurb]);

  const titleMotion = useBlurbMotion(progress, blurb, 0, isMobile);
  const bodyMotion = useBlurbMotion(
    progress,
    blurb,
    isMobile ? 0 : 0.18,
    isMobile,
  );
  const letterShadow = LETTER_SHADOW;

  const isLow = blurb.align === "low";

  // Mobile: both blurbs share one raised, horizontally centered slot.
  const mobileSlotStyle = {
    top: "auto",
    bottom: "clamp(5.75rem, 15vmin + 1.75rem, 9rem)",
    left: 0,
    right: 0,
    marginLeft: "auto",
    marginRight: "auto",
    width: "min(100%, clamp(15.5rem, 78vmin, 22rem))",
    justifyContent: "flex-end" as const,
    alignItems: "center" as const,
  };

  const slotStyle = isMobile
    ? mobileSlotStyle
    : isLow
      ? {
          top: "clamp(58%, 63vh, 70%)",
          bottom: "clamp(1.75rem, 5.5vh, 4rem)",
          justifyContent: "flex-end" as const,
        }
      : {
          top: 0,
          bottom: 0,
          justifyContent: "center" as const,
        };

  return (
    <div
      className={`absolute flex flex-col ${isMobile ? "" : "inset-x-0"}`}
      style={slotStyle}
    >
      <div
        className="max-w-full"
        style={
          isMobile
            ? {
                textAlign: "center",
                width: "100%",
              }
            : undefined
        }
      >
        <motion.h2
          className="font-serif font-bold tracking-normal text-white [overflow-wrap:normal] [word-break:normal] [hyphens:none]"
          style={{
            opacity: titleMotion.opacity,
            ...(isMobile ? null : { y: titleMotion.y }),
            fontSize: isMobile
              ? "clamp(1.45rem, 0.55rem + 5.4vmin, 2.45rem)"
              : "clamp(1.85rem, 0.55rem + 4.8vmin, 5rem)",
            lineHeight: 1.15,
            ...(blurb.titleNowrap ? { whiteSpace: "nowrap" as const } : null),
          }}
        >
          <WordLine tokens={titleTokens} letterShadow={letterShadow} />
        </motion.h2>
        <motion.p
          className="font-marcellus mt-[0.9em] font-normal text-white [overflow-wrap:normal] [word-break:normal] [hyphens:none]"
          style={{
            opacity: bodyMotion.opacity,
            ...(isMobile ? null : { y: bodyMotion.y }),
            fontSize: isMobile
              ? "clamp(0.95rem, 0.4rem + 3.1vmin, 1.35rem)"
              : "clamp(1.2rem, 0.45rem + 2.85vmin, 2.15rem)",
            lineHeight: 1.45,
            letterSpacing: "0.03em",
          }}
        >
          <WordLine
            tokens={bodyTokens}
            preventOrphans
            glueLast={blurb.bodyGlueLast}
            letterShadow={letterShadow}
          />
        </motion.p>
      </div>
    </div>
  );
}

type HeroSideCopyProps = {
  progress: MotionValue<number>;
};

/**
 * Desktop: left-rail copy with fluid vmin scaling.
 * Mobile: both blurbs share one raised, centered slot with centered text.
 */
export function HeroSideCopy({ progress }: HeroSideCopyProps) {
  const mobileHero = useHeroMobileVideo();
  const isMobile = mobileHero ?? true;

  return (
    <div
      className="pointer-events-none absolute z-30"
      style={
        isMobile
          ? {
              inset: 0,
            }
          : {
              top: "clamp(5rem, 12vmin, 9rem)",
              bottom: "clamp(2.25rem, 7vmin, 5.5rem)",
              left: "clamp(2.25rem, 5.5vmin + 1.6vw, 8.5rem)",
              width: "clamp(17rem, 40vmin, 42rem)",
            }
      }
      aria-live="polite"
    >
      {BLURBS.map((blurb) => (
        <SideBlurbBlock
          key={blurb.id}
          blurb={blurb}
          progress={progress}
          isMobile={isMobile}
        />
      ))}
    </div>
  );
}
