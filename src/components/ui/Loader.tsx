"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect } from "react";

export function Loader({
  progress,
  onComplete,
  preparing = false,
}: {
  progress: number;
  onComplete: () => void;
  /** Readiness-gate copy: "Preparing experience — N%" */
  preparing?: boolean;
}) {
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced && progress >= 100) {
      onComplete();
    }
  }, [progress, onComplete]);

  return (
    <motion.div
      className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-[#08090b]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } }}
      role="status"
      aria-busy={preparing ? true : undefined}
      aria-live="polite"
      aria-label={preparing ? "Preparing experience" : "Loading"}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(26,91,104,0.12),transparent_55%)]" />

      <div className="relative flex w-full max-w-xs flex-col items-center gap-10 px-6">
        <motion.div
          className="relative flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.92, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Teal halo — match home hero logo pulse (#1a5b68) */}
          <motion.span
            aria-hidden
            className="absolute left-1/2 top-[42%] -z-10 h-[170%] w-[190%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
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
            className="absolute left-1/2 top-[40%] -z-10 h-[130%] w-[145%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl"
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
            className="absolute left-1/2 top-[38%] -z-10 h-[90%] w-[105%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-lg"
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
            className="relative h-20 w-auto md:h-24"
          />
        </motion.div>

        {/* Cinematic dual-rail progress */}
        <div className="w-full space-y-3">
          <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-white/[0.08]">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, rgba(138,115,80,0.5) 0%, #c4a574 45%, #f0e2c4 78%, #c4a574 100%)",
                boxShadow: "0 0 16px rgba(196,165,116,0.55)",
              }}
              transition={{ duration: 0.15 }}
            />
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-16"
              style={{
                left: `calc(${progress}% - 2rem)`,
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
                opacity: progress > 4 && progress < 98 ? 0.85 : 0,
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] tracking-[0.35em] text-white/35 uppercase">
              {preparing ? "Preparing experience" : "Loading"}
            </span>
            <span className="font-mono text-[10px] tracking-[0.2em] text-[#c4a574]/90">
              {preparing
                ? `${Math.round(progress)}%`
                : (
                    <>
                      {String(Math.round(progress)).padStart(3, "0")}
                      <span className="text-white/30">%</span>
                    </>
                  )}
            </span>
          </div>

          {/* Subtle tick marks */}
          <div className="flex justify-between px-0.5" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="h-1 w-px bg-white/20"
                style={{
                  opacity: progress >= i * 25 ? 0.7 : 0.2,
                  backgroundColor: progress >= i * 25 ? "#c4a574" : undefined,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
