/** object-fit: cover draw */

export function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
) {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  const dx = (dstW - w) / 2;
  const dy = (dstH - h) / 2;
  ctx.clearRect(0, 0, dstW, dstH);
  ctx.drawImage(source, dx, dy, w, h);
}
