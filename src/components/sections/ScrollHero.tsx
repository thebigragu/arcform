"use client";

import { HomeLegalLinks, LegalLinksNav } from "@/components/layout/HomeLegalLinks";
import { Button } from "@/components/ui/Button";
import { ContactModal } from "@/components/ui/ContactModal";
import { Magnetic } from "@/components/ui/Magnetic";
import { HeroSideCopy } from "@/components/hero/HeroSideCopy";
import { MediaView } from "@/components/media/MediaView";
import {
  HERO_MEDIA_ID,
  HERO_POSTER_FALLBACK,
} from "@/media-engine";
import { useHeroPreload } from "@/context/HeroPreloadContext";
import { useHeroMobileVideo } from "@/hooks/useIsMobile";
import {
  SCRUB_HANDOFF_START,
  VIDEO_HANDOFF,
} from "@/lib/hero-scroll";
import {
  motion,
  useMotionTemplate,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function smoothstep(e: number) {
  const t = Math.min(1, Math.max(0, e));
  return t * t * (3 - 2 * t);
}

/** Soft critically-damped follow — smooths discrete scroll samples without mushy lag. */
const CONTACT_SPRING = {
  stiffness: 120,
  damping: 32,
  mass: 0.28,
  restDelta: 0.0005,
  restSpeed: 0.0005,
} as const;

const UI_SPRING = {
  stiffness: 100,
  damping: 30,
  mass: 0.28,
  restDelta: 0.0005,
  restSpeed: 0.0005,
} as const;

function useFrameProgress(scrollYProgress: MotionValue<number>) {
  return useTransform(scrollYProgress, (p) => {
    if (p <= SCRUB_HANDOFF_START) {
      return (p / SCRUB_HANDOFF_START) * VIDEO_HANDOFF;
    }
    const handoff = (p - SCRUB_HANDOFF_START) / (1 - SCRUB_HANDOFF_START);
    return VIDEO_HANDOFF + handoff * (1 - VIDEO_HANDOFF);
  });
}

function useContactMotion(scrollProgress: MotionValue<number>, isMobile: boolean) {
  // Single continuous ease across the handoff — avoids a mid-curve kink that reads as steps.
  const contactParallaxRaw = useTransform(scrollProgress, (p) => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const a = SCRUB_HANDOFF_START;
    const tall = !isMobile && vh >= 900;
    const from = (isMobile ? 0.58 : 0.42) * vh;
    const to = (isMobile ? 0 : tall ? -0.14 : -0.06) * vh;
    if (p <= a) return from;
    if (p >= 1) return to;
    const t = smoothstep((p - a) / (1 - a));
    return from + (to - from) * t;
  });

  const contactOpacityRaw = useTransform(scrollProgress, (p) => {
    const a = SCRUB_HANDOFF_START;
    const b = SCRUB_HANDOFF_START + 0.22;
    if (p <= a) return 0;
    if (p >= b) return 1;
    return smoothstep((p - a) / (b - a));
  });

  // Spring the pixel/opacity outputs so discrete scroll samples interpolate between frames.
  const contactParallax = useSpring(contactParallaxRaw, CONTACT_SPRING);
  const contactOpacity = useSpring(contactOpacityRaw, CONTACT_SPRING);
  const contactVisibility = useTransform(contactOpacity, (v) =>
    v <= 0.01 ? "hidden" : "visible",
  );
  return { contactParallax, contactOpacity, contactVisibility };
}

function HeroLogo() {
  const [mediaDebug, setMediaDebug] = useState(false);

  useEffect(() => {
    try {
      setMediaDebug(
        new URLSearchParams(window.location.search).get("mediaDebug") === "1",
      );
    } catch {
      setMediaDebug(false);
    }
  }, []);

  // Debug overlay sits top-left — hide brand mark so stats stay readable
  if (mediaDebug) return null;

  return (
    <div className="pointer-events-auto fixed top-8 left-7 z-50 sm:top-8 sm:left-8 md:top-14 md:left-14">
      <div className="relative inline-flex items-center justify-center">
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[42%] -z-10 hidden h-[200%] w-[220%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl md:block"
          style={{
            background:
              "radial-gradient(ellipse 58% 52% at 50% 45%, rgba(26,91,104,0.75) 0%, rgba(26,91,104,0.38) 32%, rgba(42,122,140,0.14) 52%, transparent 72%)",
          }}
          animate={{
            opacity: [0.55, 1, 0.55],
            scale: [0.92, 1.12, 0.92],
          }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[40%] -z-10 hidden h-[150%] w-[165%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl md:block"
          style={{
            background:
              "radial-gradient(circle at 50% 42%, rgba(42,122,140,0.7) 0%, rgba(26,91,104,0.4) 38%, rgba(26,91,104,0.12) 62%, transparent 76%)",
          }}
          animate={{
            opacity: [0.5, 0.95, 0.5],
            scale: [0.96, 1.08, 0.96],
          }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
        />
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[38%] -z-10 hidden h-[95%] w-[110%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl md:block"
          style={{
            background:
              "radial-gradient(circle at 50% 40%, rgba(58,140,155,0.55) 0%, rgba(26,91,104,0.32) 45%, transparent 70%)",
          }}
          animate={{
            opacity: [0.45, 0.9, 0.45],
            scale: [1, 1.06, 1],
          }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
        />
        <Image
          src="/brand/ragusto-logo.png"
          alt="Ragusto"
          width={220}
          height={260}
          priority
          className="relative h-14 w-auto opacity-95 transition duration-500 hover:brightness-125 sm:h-16 md:h-[5.25rem] lg:h-24"
        />
      </div>
    </div>
  );
}

function MobileHeroBottomFade({
  scrollProgress,
}: {
  scrollProgress: MotionValue<number>;
}) {
  const opacity = useTransform(
    scrollProgress,
    [
      SCRUB_HANDOFF_START,
      SCRUB_HANDOFF_START + 0.06,
      SCRUB_HANDOFF_START + 0.12,
      SCRUB_HANDOFF_START + 0.18,
      1,
    ],
    [0, 0.55, 0.82, 0.94, 1],
  );

  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[25] h-[88%] bg-gradient-to-t from-[#08090b] from-[42%] via-[#08090b]/85 via-[68%] to-transparent"
      style={{ opacity }}
      aria-hidden
    />
  );
}

function MobileScrollCue({
  scrollProgress,
}: {
  scrollProgress: MotionValue<number>;
}) {
  const [cueIdle, setCueIdle] = useState(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useMotionValueEvent(scrollProgress, "change", () => {
    setCueIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setCueIdle(true), 150);
  });

  useEffect(
    () => () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    },
    [],
  );

  const opacity = useTransform(
    scrollProgress,
    [0, 0.7, 0.82, 0.92, 1],
    [1, 1, 0.55, 0, 0],
  );

  return (
    <motion.div
      className="pointer-events-none absolute bottom-5 right-5 z-40 flex flex-col items-center gap-3"
      style={{ opacity }}
      aria-hidden
    >
      <span
        className="font-marcellus text-[13px] font-semibold tracking-[0.38em] text-white uppercase"
        style={{
          textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.55)",
        }}
      >
        Scroll
      </span>
      <motion.svg
        width="20"
        height="11"
        viewBox="0 0 20 11"
        fill="none"
        aria-hidden
        className="text-white/90"
        style={{
          textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.55)",
        }}
        animate={cueIdle ? { y: [0, 4, 0] } : { y: 0 }}
        transition={
          cueIdle
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.12 }
        }
      >
        <path
          d="M1.5 1.75L10 9.25L18.5 1.75"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </motion.div>
  );
}

function DesktopScrollCue({
  scrollProgress,
}: {
  scrollProgress: MotionValue<number>;
}) {
  const opacity = useTransform(
    scrollProgress,
    [0, 0.7, 0.82, 0.92, 1],
    [1, 1, 0.55, 0, 0],
  );

  const left = useTransform(scrollProgress, [0, 0.16], [91, 94]);
  const top = useTransform(scrollProgress, [0, 0.16], [48, 90]);
  const cueRef = useRef<HTMLDivElement>(null);
  const anchorX = useTransform(scrollProgress, [0, 0.16], [-50, -100]);
  const anchorY = useTransform(scrollProgress, [0, 0.16], [-50, -100]);
  const scale = useTransform(scrollProgress, [0, 0.16], [1.2, 1]);
  const cueTransform = useMotionTemplate`translate(${anchorX}%, ${anchorY}%) scale(${scale})`;

  useMotionValueEvent(left, "change", (v) => {
    if (cueRef.current) cueRef.current.style.left = `${v}%`;
  });
  useMotionValueEvent(top, "change", (v) => {
    if (cueRef.current) cueRef.current.style.top = `${v}%`;
  });
  useEffect(() => {
    if (!cueRef.current) return;
    cueRef.current.style.left = `${left.get()}%`;
    cueRef.current.style.top = `${top.get()}%`;
  }, [left, top]);

  return (
    <motion.div
      ref={cueRef}
      className="pointer-events-none absolute z-40"
      style={{
        opacity,
        transform: cueTransform,
      }}
      aria-hidden
    >
      <div className="flex flex-col items-center gap-3.5 md:gap-4">
        <span
          className="font-marcellus text-[13px] tracking-[0.38em] text-white uppercase md:text-[15px] md:tracking-[0.42em]"
          style={{
            fontWeight: 600,
            WebkitTextStroke: "0.35px rgba(255,255,255,0.55)",
            textShadow:
              "0 0 4px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,1), 0 0 14px rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,1), 0 2px 10px rgba(0,0,0,1), 0 4px 18px rgba(0,0,0,0.95), 0 8px 32px rgba(0,0,0,0.85), 0 14px 48px rgba(0,0,0,0.65), 0 20px 64px rgba(0,0,0,0.4)",
          }}
        >
          Scroll
        </span>

        <div className="relative flex justify-center" style={{ height: 68, width: 2 }}>
          <div
            className="absolute inset-0 rounded-full bg-white"
            style={{
              boxShadow:
                "0 0 0 1px rgba(0,0,0,0.55), 0 1px 6px rgba(0,0,0,0.55)",
            }}
          />
          <motion.span
            className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#c4a574]"
            style={{
              boxShadow:
                "0 0 0 1.5px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.65)",
            }}
            animate={{ y: [0, 48, 0] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: [0.45, 0.05, 0.25, 1],
            }}
          />
        </div>

        <motion.svg
          width="20"
          height="11"
          viewBox="0 0 20 11"
          fill="none"
          aria-hidden
          className="text-white md:h-[13px] md:w-[24px]"
          style={{
            filter:
              "drop-shadow(0 0 1px rgba(0,0,0,0.95)) drop-shadow(0 2px 4px rgba(0,0,0,0.75))",
          }}
          animate={{ opacity: [0.7, 1, 0.7], y: [0, 4, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <path
            d="M1.5 1.75L10 9.25L18.5 1.75"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </div>
    </motion.div>
  );
}

function HeroContactSection({
  isMobile,
  contactParallax,
  contactOpacity,
  contactVisibility,
  onContactOpen,
}: {
  isMobile: boolean;
  contactParallax: MotionValue<number>;
  contactOpacity: MotionValue<number>;
  contactVisibility: MotionValue<"hidden" | "visible">;
  onContactOpen: () => void;
}) {
  return (
    <motion.div
      id="contact"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col px-5 opacity-0 will-change-transform transform-gpu",
        isMobile
          ? "inset-y-0 h-[100dvh] max-h-[100dvh] justify-start pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-0"
          : "max-h-[68dvh] justify-center px-6 pb-[min(10vh,5rem)] pt-0 lg:max-h-[72dvh] lg:pb-[min(14vh,7rem)] xl:pb-[min(16vh,8rem)]",
      )}
      style={{
        y: contactParallax,
        opacity: contactOpacity,
        visibility: contactVisibility,
      }}
    >
      <div
        className={cn(
          "pointer-events-auto relative mx-auto w-full max-w-3xl origin-center text-center xl:max-w-5xl xl:scale-[1.1]",
          isMobile ? "shrink-0 pt-[50dvh]" : "pb-1 md:pb-2",
        )}
      >
        <p className="text-[10.5pt] tracking-[0.28em] text-[#c4a574]/90 uppercase md:text-[13pt]">
          Begin
        </p>
        <h2 className="mt-3 font-serif text-[1.85rem] leading-tight tracking-tight text-white sm:text-4xl md:mt-4 md:text-6xl lg:text-7xl">
          Let&apos;s build something{" "}
          <span className="inline-block bg-gradient-to-br from-[#f0e2c4] via-[#c4a574] to-[#8a7350] bg-clip-text pe-[0.28em] pb-[0.08em] italic text-transparent">
            exceptional
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[1rem] leading-relaxed text-white/60 md:mt-5 md:max-w-none md:text-xl">
          {(
            [
              "Ragusto is a bespoke web design and app creation studio building cinematic sites,",
              "custom applications, and product experiences with meticulous craft.",
            ] as const
          ).map((line, lineIndex) => (
            <span
              key={line}
              className={
                lineIndex === 0
                  ? "md:block md:whitespace-nowrap"
                  : "md:mt-0 md:block md:whitespace-nowrap"
              }
            >
              {lineIndex > 0 ? <span className="md:hidden"> </span> : null}
              {line.split(" ").map((word, i, arr) => {
                const clean = word.replace(/[.,]/g, "");
                const emph = ["bespoke", "cinematic", "meticulous", "craft"].includes(
                  clean,
                );
                return (
                  <span key={`${lineIndex}-${word}-${i}`}>
                    {emph ? <span className="text-[#c4a574]">{word}</span> : word}
                    {i < arr.length - 1 ? " " : ""}
                  </span>
                );
              })}
            </span>
          ))}
        </p>

        <div className="mt-6 flex justify-center md:mt-8">
          {isMobile ? (
            <Button
              type="button"
              onClick={onContactOpen}
              className="bg-white text-base text-[#0c0c0e] hover:bg-[#1a5b68] hover:text-white"
            >
              Get in touch
            </Button>
          ) : (
            <Magnetic>
              <Button
                type="button"
                onClick={onContactOpen}
                className="bg-white text-base text-[#0c0c0e] hover:bg-[#1a5b68] hover:text-white md:text-lg"
              >
                Get in touch
              </Button>
            </Magnetic>
          )}
        </div>
      </div>

      {isMobile ? (
        <LegalLinksNav className="pointer-events-auto mt-auto shrink-0 justify-center pb-0.5" />
      ) : null}
    </motion.div>
  );
}

function ScrollHeroMobile() {
  const scrubRef = useRef<HTMLDivElement>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const closeContact = useCallback(() => setContactOpen(false), []);
  const openContact = useCallback(() => setContactOpen(true), []);
  const {
    signalEngineReady,
    signalPosterReady,
    signalCompressedReady,
    reportProgress,
    reportError,
    readinessGateEnabled,
  } = useHeroPreload();

  const { scrollYProgress } = useScroll({
    target: scrubRef,
    offset: ["start start", "end end"],
  });

  const uiProgress = scrollYProgress;
  const frameProgress = useFrameProgress(scrollYProgress);
  const { contactParallax, contactOpacity, contactVisibility } = useContactMotion(
    scrollYProgress,
    true,
  );

  return (
    <>
      <HeroLogo />
      <section
        ref={scrubRef}
        className="relative h-[1000vh] bg-transparent md:h-[2000vh]"
      >
        <div className="relative sticky top-0 z-20 h-[100dvh] w-full overflow-hidden bg-transparent">
          <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#08090b]">
            <MediaView
              mediaId={HERO_MEDIA_ID}
              posterFallback={HERO_POSTER_FALLBACK}
              deviceClass="mobile"
              scrubProgress={frameProgress}
              rawScrollProgress={scrollYProgress}
              onPosterLoad={signalPosterReady}
              onReady={signalEngineReady}
              onProgress={readinessGateEnabled ? undefined : reportProgress}
              onReadinessProgress={reportProgress}
              onReadinessRelease={() => signalCompressedReady()}
              onFatal={(e) => reportError(e.message)}
            />

            <MobileHeroBottomFade scrollProgress={uiProgress} />
            <HeroSideCopy progress={uiProgress} />
            <MobileScrollCue scrollProgress={uiProgress} />
          </div>

          <HeroContactSection
            isMobile
            contactParallax={contactParallax}
            contactOpacity={contactOpacity}
            contactVisibility={contactVisibility}
            onContactOpen={openContact}
          />
        </div>
      </section>
      <ContactModal open={contactOpen} onClose={closeContact} />
    </>
  );
}

function ScrollHeroDesktop() {
  const scrubRef = useRef<HTMLDivElement>(null);
  const heroFrameRef = useRef<HTMLDivElement>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const closeContact = useCallback(() => setContactOpen(false), []);
  const openContact = useCallback(() => setContactOpen(true), []);
  const {
    signalEngineReady,
    signalPosterReady,
    signalCompressedReady,
    reportProgress,
    reportError,
    readinessGateEnabled,
  } = useHeroPreload();

  const { scrollYProgress } = useScroll({
    target: scrubRef,
    offset: ["start start", "end end"],
  });

  const sprungProgress = useSpring(scrollYProgress, UI_SPRING);
  const uiProgress = sprungProgress;
  const frameProgress = useFrameProgress(scrollYProgress);

  // Same raw progress + spring as contact — keeps hero lift and contact slide locked.
  const stickyLiftRaw = useTransform(scrollYProgress, (p) => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const a = SCRUB_HANDOFF_START;
    const endLift = -0.5 * vh;
    if (p <= a) return 0;
    if (p >= 1) return endLift;
    return endLift * smoothstep((p - a) / (1 - a));
  });
  const stickyLift = useSpring(stickyLiftRaw, CONTACT_SPRING);

  const heroMask = useTransform(
    uiProgress,
    [
      0,
      SCRUB_HANDOFF_START + 0.04,
      SCRUB_HANDOFF_START + 0.1,
      SCRUB_HANDOFF_START + 0.16,
      SCRUB_HANDOFF_START + 0.2,
      1,
    ],
    [
      "linear-gradient(to bottom, #000 0%, #000 100%, #000 100%, #000 100%, #000 100%, #000 100%)",
      "linear-gradient(to bottom, #000 0%, #000 100%, #000 100%, #000 100%, #000 100%, #000 100%)",
      "linear-gradient(to bottom, #000 0%, #000 78%, rgba(0,0,0,0.82) 88%, rgba(0,0,0,0.4) 94%, rgba(0,0,0,0.08) 100%, transparent 100%)",
      "linear-gradient(to bottom, #000 0%, #000 58%, rgba(0,0,0,0.72) 74%, rgba(0,0,0,0.28) 88%, rgba(0,0,0,0.05) 97%, transparent 100%)",
      "linear-gradient(to bottom, #000 0%, #000 40%, rgba(0,0,0,0.62) 58%, rgba(0,0,0,0.22) 74%, rgba(0,0,0,0.04) 90%, transparent 100%)",
      "linear-gradient(to bottom, #000 0%, #000 28%, rgba(0,0,0,0.52) 48%, rgba(0,0,0,0.16) 66%, rgba(0,0,0,0.03) 84%, transparent 100%)",
    ],
  );
  const { contactParallax, contactOpacity, contactVisibility } = useContactMotion(
    scrollYProgress,
    false,
  );

  useMotionValueEvent(heroMask, "change", (mask) => {
    const el = heroFrameRef.current;
    if (!el) return;
    el.style.maskImage = mask;
    el.style.webkitMaskImage = mask;
  });
  useEffect(() => {
    const el = heroFrameRef.current;
    if (!el) return;
    const mask = heroMask.get();
    el.style.maskImage = mask;
    el.style.webkitMaskImage = mask;
  }, [heroMask]);

  return (
    <>
      <HeroLogo />
      <section
        ref={scrubRef}
        className="relative h-[1200vh] bg-transparent md:h-[2000vh]"
      >
        <div className="relative sticky top-0 z-20 h-[100dvh] w-full overflow-hidden bg-transparent">
          <motion.div
            ref={heroFrameRef}
            className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#08090b] will-change-transform"
            style={{ y: stickyLift }}
          >
            <MediaView
              mediaId={HERO_MEDIA_ID}
              posterFallback={HERO_POSTER_FALLBACK}
              deviceClass="desktop"
              scrubProgress={frameProgress}
              rawScrollProgress={scrollYProgress}
              onPosterLoad={signalPosterReady}
              onReady={signalEngineReady}
              onProgress={readinessGateEnabled ? undefined : reportProgress}
              onReadinessProgress={reportProgress}
              onReadinessRelease={() => signalCompressedReady()}
              onFatal={(e) => reportError(e.message)}
            />
            <HeroSideCopy progress={uiProgress} />
            <DesktopScrollCue scrollProgress={uiProgress} />
          </motion.div>

          <HeroContactSection
            isMobile={false}
            contactParallax={contactParallax}
            contactOpacity={contactOpacity}
            contactVisibility={contactVisibility}
            onContactOpen={openContact}
          />
          <HomeLegalLinks opacity={contactOpacity} />
        </div>
      </section>
      <ContactModal open={contactOpen} onClose={closeContact} />
    </>
  );
}

export function ScrollHero() {
  const mobileHero = useHeroMobileVideo();

  if (mobileHero === false) {
    return <ScrollHeroDesktop />;
  }

  return <ScrollHeroMobile />;
}

