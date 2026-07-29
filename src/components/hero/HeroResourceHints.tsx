import { HERO_MANIFEST_URL } from "@/media-engine";

/**
 * Gate 1 resource hints — manifest only.
 * Poster + frame 0 are warmed client-side after form-factor / tier commit
 * to avoid wrong-tier or duplicate startup transfer.
 */
export function HeroResourceHints() {
  return (
    <link
      rel="preload"
      as="fetch"
      href={HERO_MANIFEST_URL}
      crossOrigin="anonymous"
    />
  );
}
