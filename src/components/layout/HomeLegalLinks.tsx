"use client";

import { cn } from "@/lib/utils";
import { motion, useTransform, type MotionValue } from "framer-motion";
import Link from "next/link";

const linkClass = "whitespace-nowrap transition-colors hover:text-white/75";

export function LegalLinksNav({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={cn(
        "flex flex-row flex-nowrap items-center gap-[clamp(0.5rem,1.5vw,0.875rem)] text-[clamp(9px,2.1vw,12px)] tracking-wide text-white/45",
        className,
      )}
    >
      <Link href="/privacy-policy" className={linkClass}>
        Privacy Policy
      </Link>
      <span className="text-white/25" aria-hidden>
        ·
      </span>
      <Link href="/client-service-terms" className={linkClass}>
        Client Service Terms
      </Link>
      <span className="text-white/25" aria-hidden>
        ·
      </span>
      <Link href="/public-terms-of-use" className={linkClass}>
        Public Terms of Use
      </Link>
    </nav>
  );
}

/** Fixed bottom-right dock for desktop hero contact reveal. */
export function HomeLegalLinks({ opacity }: { opacity: MotionValue<number> }) {
  const visibility = useTransform(opacity, (v) => (v <= 0.01 ? "hidden" : "visible"));

  return (
    <motion.div
      className="pointer-events-none fixed right-8 bottom-[max(0.625rem,env(safe-area-inset-bottom))] z-50 opacity-0 lg:right-10"
      style={{ opacity, visibility }}
    >
      <LegalLinksNav className="pointer-events-auto" />
    </motion.div>
  );
}
