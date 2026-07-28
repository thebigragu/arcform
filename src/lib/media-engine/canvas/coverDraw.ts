/** object-fit: cover draw into a 2D canvas. */

export function coverRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
) {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return {
    dx: (dstW - w) / 2,
    dy: (dstH - h) / 2,
    dw: w,
    dh: h,
  };
}

export function drawCover(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
) {
  const { dx, dy, dw, dh } = coverRect(srcW, srcH, dstW, dstH);
  ctx.clearRect(0, 0, dstW, dstH);
  ctx.drawImage(source, dx, dy, dw, dh);
}
