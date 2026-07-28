import { drawCover } from "../canvas/coverDraw";
import { resizeBackingStore } from "../canvas/resizeBackingStore";
import type { MediaRenderer, RendererContext } from "../ports/MediaRenderer";
import type { PredictHint, RendererStats } from "../types";

/** Static poster / reduced-motion / fatal last resort. */
export class PosterRenderer implements MediaRenderer {
  readonly id = "poster";
  private img: HTMLImageElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private maxDpr = 2;
  private drawn = false;
  private stats: RendererStats = {
    cacheSize: 0,
    cacheHits: 0,
    cacheMisses: 0,
    decodeLatencyMs: 0,
    lastDrawMs: 0,
    estimatedMemoryMb: 0,
    decodeQueueDepth: 0,
  };

  constructor(private posterUrl: string) {}

  async init(ctx: RendererContext): Promise<void> {
    this.canvas = ctx.canvas;
    this.maxDpr = ctx.maxDpr;
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = this.posterUrl || ctx.src;
    });
    this.img = img;
    this.resize(
      ctx.canvas.clientWidth || ctx.canvas.width,
      ctx.canvas.clientHeight || ctx.canvas.height,
      ctx.maxDpr,
    );
    this.present(ctx.canvas);
  }

  setTargetFrame(_index: number, _hint: PredictHint): void {
    /* static */
  }

  present(canvas: HTMLCanvasElement | OffscreenCanvas): boolean {
    if (this.drawn) return false;
    const img = this.img;
    const ctx2d = (canvas as HTMLCanvasElement).getContext?.("2d") ??
      (canvas as OffscreenCanvas).getContext("2d");
    if (!img || !ctx2d || !img.naturalWidth) return false;
    const t0 = performance.now();
    drawCover(
      ctx2d,
      img,
      img.naturalWidth,
      img.naturalHeight,
      canvas.width,
      canvas.height,
    );
    this.stats.lastDrawMs = performance.now() - t0;
    this.stats.cacheHits += 1;
    this.drawn = true;
    return true;
  }

  getStats(): RendererStats {
    return { ...this.stats };
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    if (!this.canvas) return;
    resizeBackingStore(this.canvas, cssWidth, cssHeight, dpr);
  }

  dispose(): void {
    this.img = null;
  }
}
