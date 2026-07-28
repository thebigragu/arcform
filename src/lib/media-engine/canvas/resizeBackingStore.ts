/** Resize canvas backing store for CSS size × capped DPR. */

export function resizeBackingStore(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  maxDpr: number,
) {
  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cssWidth * dpr));
  const h = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { width: w, height: h, dpr };
}
