/** Cap canvas backing store by CSS size, DPR, and source aspect. */

export function resizeBackingStore(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  dpr: number,
  srcW: number,
  srcH: number,
  maxPixels = 2_500_000,
) {
  const safeDpr = Math.max(1, Math.min(dpr, 2));
  let bw = Math.max(1, Math.round(cssW * safeDpr));
  let bh = Math.max(1, Math.round(cssH * safeDpr));
  const pixels = bw * bh;
  if (pixels > maxPixels) {
    const s = Math.sqrt(maxPixels / pixels);
    bw = Math.max(1, Math.round(bw * s));
    bh = Math.max(1, Math.round(bh * s));
  }
  // Prefer matching source aspect in backing if wildly different
  if (srcW > 0 && srcH > 0) {
    const srcAspect = srcW / srcH;
    const canvasAspect = bw / bh;
    if (Math.abs(srcAspect - canvasAspect) > 2) {
      /* keep viewport cover; no change */
    }
  }
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  return { width: bw, height: bh, dpr: safeDpr };
}
