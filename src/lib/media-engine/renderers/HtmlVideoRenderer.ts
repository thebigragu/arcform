import { drawCover } from "../canvas/coverDraw";
import { resizeBackingStore } from "../canvas/resizeBackingStore";
import type { MediaRenderer, RendererContext } from "../ports/MediaRenderer";
import type { PredictHint, RendererStats } from "../types";

/**
 * Hidden HTML5 <video> → canvas present (mandatory fallback).
 */
export class HtmlVideoRenderer implements MediaRenderer {
  readonly id = "html-video";
  private video: HTMLVideoElement | null = null;
  private ctx: RendererContext | null = null;
  private target = 0;
  private lastDrawnFrame = -1;
  private seeking = false;
  private pending = false;
  private lastSeekAt = 0;
  private minSeekIntervalMs = 48;
  private stats: RendererStats = {
    cacheSize: 0,
    cacheHits: 0,
    cacheMisses: 0,
    decodeLatencyMs: 0,
    lastDrawMs: 0,
    estimatedMemoryMb: 0,
    decodeQueueDepth: 0,
  };

  async init(ctx: RendererContext): Promise<void> {
    this.ctx = ctx;
    this.minSeekIntervalMs = ctx.presentFps >= 50 ? 32 : 70;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.disablePictureInPicture = true;
    video.style.display = "none";
    document.body.appendChild(video);

    const src = ctx.blobUrl || ctx.src;
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("HtmlVideoRenderer load failed"));
      };
      const cleanup = () => {
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.src = src;
      video.load();
    });

    video.addEventListener("seeked", () => {
      this.seeking = false;
      if (this.pending) this.seekToTarget(true);
    });

    this.video = video;
    this.resize(
      ctx.canvas.clientWidth || ctx.canvas.width,
      ctx.canvas.clientHeight || ctx.canvas.height,
      ctx.maxDpr,
    );
  }

  setTargetFrame(index: number, _hint: PredictHint): void {
    this.target = index;
    this.seekToTarget();
  }

  present(canvas: HTMLCanvasElement | OffscreenCanvas): boolean {
    const video = this.video;
    const ctx2d = (canvas as HTMLCanvasElement).getContext?.("2d") ??
      (canvas as OffscreenCanvas).getContext("2d");
    if (!video || !ctx2d || video.readyState < 2) return false;
    if (this.target === this.lastDrawnFrame && !this.seeking && !this.pending) {
      return false;
    }
    const t0 = performance.now();
    drawCover(
      ctx2d,
      video,
      video.videoWidth || this.ctx?.width || 1,
      video.videoHeight || this.ctx?.height || 1,
      canvas.width,
      canvas.height,
    );
    this.stats.lastDrawMs = performance.now() - t0;
    this.lastDrawnFrame = this.target;
    return true;
  }

  getStats(): RendererStats {
    return { ...this.stats };
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    if (!this.ctx) return;
    resizeBackingStore(this.ctx.canvas, cssWidth, cssHeight, dpr);
  }

  dispose(): void {
    if (this.video) {
      this.video.removeAttribute("src");
      this.video.load();
      this.video.remove();
      this.video = null;
    }
  }

  private seekToTarget(force = false) {
    const video = this.video;
    const ctx = this.ctx;
    if (!video?.duration || !ctx) return;

    const now = performance.now();
    if (!force && now - this.lastSeekAt < this.minSeekIntervalMs) {
      this.pending = true;
      return;
    }

    const max = Math.max(1, ctx.frameCount - 1);
    const want = (this.target / max) * video.duration;
    if (Math.abs(video.currentTime - want) < 1 / Math.max(1, ctx.fps)) {
      this.pending = false;
      this.stats.cacheHits += 1;
      return;
    }

    if (this.seeking) {
      this.pending = true;
      return;
    }

    this.seeking = true;
    this.pending = false;
    this.lastSeekAt = now;
    this.stats.cacheMisses += 1;
    const t0 = performance.now();
    try {
      video.currentTime = want;
    } catch {
      this.seeking = false;
    }
    this.stats.decodeLatencyMs = performance.now() - t0;
  }
}
