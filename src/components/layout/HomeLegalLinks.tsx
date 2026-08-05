"use client";

import { motion, type MotionValue } from "framer-motion";
import Link from "next/link";

export function HomeLegalLinks({ opacity }: { opacity: MotionValue<number> }) {
  return (
    <motion.nav
      aria-label="Legal"
      className="pointer-events-auto fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(0.625rem,env(safe-area-inset-bottom))] z-50 flex flex-row flex-nowrap items-center gap-[clamp(0.5rem,1.5vw,0.875rem)] text-[clamp(9px,2.1vw,12px)] tracking-wide text-white/45 sm:right-6 md:right-8 lg:right-10"
      style={{ opacity }}
    >
      <Link
        href="/privacy-policy"
        className="whitespace-nowrap transition-colors hover:text-white/75"
      >
        Privacy Policy
      </Link>
      <span className="text-white/25" aria-hidden>
        ·
      </span>
      <Link
        href="/client-service-terms"
        className="whitespace-nowrap transition-colors hover:text-white/75"
      >
        Client Service Terms
      </Link>
      <span className="text-white/25" aria-hidden>
        ·
      </span>
      <Link
        href="/public-terms-of-use"
        className="whitespace-nowrap transition-colors hover:text-white/75"
      >
        Public Terms of Use
      </Link>
    </motion.nav>
  );
}
