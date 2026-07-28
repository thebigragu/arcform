/** V2.2 poster-first: early fetch for hero posters (no MP4 on critical path). */
export function HeroResourceHints() {
  return (
    <>
      <link
        rel="preload"
        as="image"
        href="/videos/media-ladder/d1440-poster.webp"
        type="image/webp"
      />
      <link
        rel="preload"
        as="image"
        href="/videos/media-ladder/m900-poster.webp"
        type="image/webp"
      />
      <link
        rel="preload"
        href="/videos/media-ladder/media-ladder.json"
        as="fetch"
        crossOrigin="anonymous"
      />
    </>
  );
}
