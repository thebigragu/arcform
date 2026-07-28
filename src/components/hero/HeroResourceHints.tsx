import {
  HERO_MANIFEST_URL,
  HERO_POSTER_FALLBACK,
} from "@/lib/media-engine/heroDefaults";

/**
 * Skill-aligned resource hints for hero media (v4 manifest + posters).
 * Legacy ladder preload omitted — delivery is manifest-driven.
 */
export function HeroResourceHints() {
  const { desktop, mobile } = HERO_POSTER_FALLBACK;
  return (
    <>
      <link
        rel="preload"
        as="fetch"
        href={HERO_MANIFEST_URL}
        crossOrigin="anonymous"
      />
      <link rel="preload" as="image" href={desktop} type="image/webp" />
      <link rel="preload" as="image" href={mobile} type="image/webp" />
    </>
  );
}
