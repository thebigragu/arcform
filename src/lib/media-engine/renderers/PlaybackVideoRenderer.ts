import type { MediaRenderer, RendererContext } from "../ports/MediaRenderer";
import type { PredictHint, RendererStats } from "../types";

/**
 * ADR-024: visible <video> for playback experience mode — no per-frame canvas copy.
 */
export class PlaybackVideoRenderer implements MediaRenderer {
  readonly id = "playback";
  private video: HTMLVideoElement | null = null;
  private mount: HTMLElement | null = null;
  private ctx: RendererContext | null = null;
  private target = 0;
  private lastDrawnFrame = -1;
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
    this.mount = ctx.playbackMount ?? ctx.canvas.parentElement;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.disablePictureInPicture = true;
    video.setAttribute("aria-hidden", "true");
    video.className =
      "pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover [transform:translateZ(0)]";

    const src = ctx.blobUrl || ctx.src;
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("PlaybackVideoRenderer load failed"));
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

    this.mount?.appendChild(video);
    this.video = video;
    ctx.canvas.style.opacity = "0";
  }

  setTargetFrame(index: number, _hint: PredictHint): void {
    this.target = index;
    const video = this.video;
    const ctx = this.ctx;
    if (!video?.duration || !ctx) return;

    const max = Math.max(1, ctx.frameCount - 1);
    const want = (this.target / max) * video.duration;
    if (Math.abs(video.currentTime - want) < 1 / Math.max(1, ctx.fps)) {
      this.stats.cacheHits += 1;
      return;
    }
    this.stats.cacheMisses += 1;
    const t0 = performance.now();
    try {
      video.currentTime = want;
    } catch {
      /* seek blocked */
    }
    this.stats.decodeLatencyMs = performance.now() - t0;
  }

  present(_canvas: HTMLCanvasElement | OffscreenCanvas): boolean {
    if (this.target === this.lastDrawnFrame) return false;
    this.lastDrawnFrame = this.target;
    this.stats.lastDrawMs = 0;
    return true;
  }

  getStats(): RendererStats {
    return { ...this.stats };
  }

  getLastDrawnFrame() {
    return this.lastDrawnFrame;
  }

  dispose(): void {
    if (this.video) {
      this.video.removeAttribute("src");
      this.video.load();
      this.video.remove();
      this.video = null;
    }
    if (this.ctx) this.ctx.canvas.style.opacity = "";
  }
}
