/**
 * Resource hints — manifest only.
 * Poster + frame 0 are warmed client-side after form-factor / tier commit
 * to avoid wrong-tier or duplicate startup transfer.
 *
 * Adapted from the Website's src/components/hero/HeroResourceHints.tsx
 * (packaging-changes.md item 1): manifestUrl is now a prop defaulting to
 * HERO_MANIFEST_URL instead of being hardcoded.
 */
import { HERO_MANIFEST_URL } from "@/media-engine";

export function MediaResourceHints({
  manifestUrl = HERO_MANIFEST_URL,
}: {
  manifestUrl?: string;
}) {
  return (
    <link
      rel="preload"
      as="fetch"
      href={manifestUrl}
      crossOrigin="anonymous"
    />
  );
}
