import { drawCover } from "../canvas/coverDraw";
import { resizeBackingStore } from "../canvas/resizeBackingStore";
import { MediabunnyDemuxer } from "../demux/MediabunnyDemuxer";
import type { MediaRenderer, RendererContext } from "../ports/MediaRenderer";
import { AdaptiveBufferGovernor } from "../schedule/AdaptiveBufferGovernor";
import type { DemuxResult, PredictHint, RendererStats } from "../types";

async function resolveDecoderConfig(
  base: VideoDecoderConfig,
): Promise<VideoDecoderConfig> {
  const preferHw: VideoDecoderConfig = {
    ...base,
    hardwareAcceleration: "prefer-hardware",
  };
  try {
    const hw = await VideoDecoder.isConfigSupported(preferHw);
    if (hw.supported) {
      return (hw.config as VideoDecoderConfig | undefined) ?? preferHw;
    }
  } catch {
    /* soft-fallback below */
  }

  const soft = await VideoDecoder.isConfigSupported(base);
  if (!soft.supported) {
    throw new Error("WebCodecs config unsupported");
  }
  return (soft.config as VideoDecoderConfig | undefined) ?? base;
}

/**
 * WebCodecs VideoDecoder + bounded adaptive cache → canvas.
 */
export class WebCodecsRenderer implements MediaRenderer {
  readonly id = "webcodecs";
  private demux: DemuxResult | null = null;
  private cache = new Map<number, VideoFrame>();
  private governor: AdaptiveBufferGovernor | null = null;
  private ctx: RendererContext | null = null;
  private playhead = 0;
  private serial: Promise<unknown> = Promise.resolve();
  private decodeGeneration = 0;
  private queuedDecodes = 0;
  private closed = false;
  private lastHint: PredictHint = {
    velocity: 0,
    acceleration: 0,
    direction: 0,
    predictedIndices: [],
  };
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
    this.governor = new AdaptiveBufferGovernor(ctx.bufferBudgetFrames);
    const demuxer = new MediabunnyDemuxer();

    if (ctx.arrayBuffer) {
      this.demux = await demuxer.index(ctx.arrayBuffer);
    } else if (ctx.progressive && ctx.src) {
      this.demux = await demuxer.indexUrl(ctx.src);
    } else {
      const buffer =
        (await (await fetch(ctx.blobUrl || ctx.src)).arrayBuffer()) ??
        new ArrayBuffer(0);
      this.demux = await demuxer.index(buffer);
    }

    this.demux.config = await resolveDecoderConfig(this.demux.config);

    this.resize(
      ctx.canvas.clientWidth || ctx.canvas.width,
      ctx.canvas.clientHeight || ctx.canvas.height,
      ctx.maxDpr,
    );

    const warm = Math.min(8, this.demux.meta.frameCount);
    for (let i = 0; i < warm; i++) {
      await this.decodeIndex(i);
    }
  }

  /** Expose demux for engine benchmark (after init). */
  getDemux() {
    return this.demux;
  }

  setBufferBudget(n: number) {
    this.governor?.setBudget(n);
    this.evict();
  }

  setTargetFrame(index: number, hint: PredictHint): void {
    if (!this.demux || !this.governor) return;
    const next = Math.max(0, Math.min(this.demux.meta.frameCount - 1, index));
    const jump = Math.abs(next - this.playhead) >= 3;
    this.playhead = next;
    this.lastHint = hint;

    // Drop stale serial targets when playhead jumps (fast scrub).
    if (jump && this.queuedDecodes > 0) {
      this.decodeGeneration += 1;
    }

    if (this.cache.has(this.playhead)) {
      this.stats.cacheHits += 1;
    } else {
      this.stats.cacheMisses += 1;
      void this.enqueueDecode(this.playhead);
    }

    for (const pred of hint.predictedIndices) {
      if (!this.cache.has(pred)) void this.enqueueDecode(pred);
    }

    const { lo, hi } = this.governor.desiredWindow(
      this.playhead,
      hint.direction,
      this.demux.meta.frameCount,
    );
    for (let i = lo; i <= hi; i++) {
      if (!this.cache.has(i)) void this.enqueueDecode(i);
    }
    this.evict();
  }

  present(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    const ctx2d =
      (canvas as HTMLCanvasElement).getContext?.("2d") ??
      (canvas as OffscreenCanvas).getContext("2d");
    if (!ctx2d || !this.demux) return;

    let frame = this.cache.get(this.playhead) ?? null;
    if (!frame) {
      let best: number | null = null;
      let bestDist = Infinity;
      for (const key of this.cache.keys()) {
        const d = Math.abs(key - this.playhead);
        if (d < bestDist) {
          bestDist = d;
          best = key;
        }
      }
      if (best !== null) frame = this.cache.get(best) ?? null;
    }
    if (!frame) return;

    const t0 = performance.now();
    drawCover(
      ctx2d,
      frame,
      frame.displayWidth || this.demux.meta.width,
      frame.displayHeight || this.demux.meta.height,
      canvas.width,
      canvas.height,
    );
    this.stats.lastDrawMs = performance.now() - t0;
    this.stats.cacheSize = this.cache.size;
    this.stats.decodeQueueDepth = this.queuedDecodes;
    this.stats.estimatedMemoryMb =
      (this.cache.size * this.demux.meta.width * this.demux.meta.height * 4) /
      (1024 * 1024);
  }

  getStats(): RendererStats {
    return { ...this.stats, decodeQueueDepth: this.queuedDecodes };
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    if (!this.ctx) return;
    resizeBackingStore(this.ctx.canvas, cssWidth, cssHeight, dpr);
  }

  dispose(): void {
    this.closed = true;
    this.decodeGeneration += 1;
    for (const frame of this.cache.values()) frame.close();
    this.cache.clear();
    this.demux = null;
  }

  private enqueueDecode(index: number) {
    const gen = this.decodeGeneration;
    this.queuedDecodes += 1;
    const task = this.serial.then(async () => {
      this.queuedDecodes = Math.max(0, this.queuedDecodes - 1);
      if (this.closed || gen !== this.decodeGeneration) return;
      const budget = this.governor?.getBudget() ?? 12;
      if (
        index !== this.playhead &&
        Math.abs(index - this.playhead) > budget
      ) {
        return;
      }
      await this.decodeIndex(index);
    });
    this.serial = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private async decodeIndex(index: number): Promise<void> {
    if (this.closed || !this.demux || this.cache.has(index)) return;
    const sample = this.demux.samples[index];
    if (!sample) return;

    const t0 = performance.now();
    try {
      const frame = await this.decodeSample(sample);
      if (this.closed) {
        frame.close();
        return;
      }
      this.cache.set(index, frame);
      this.stats.decodeLatencyMs = performance.now() - t0;
      this.evict();
    } catch (error) {
      this.ctx?.onDecodeError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private decodeSample(sample: DemuxResult["samples"][number]): Promise<VideoFrame> {
    const demux = this.demux!;
    return new Promise((resolve, reject) => {
      let output: VideoFrame | null = null;
      const decoder = new VideoDecoder({
        output: (frame) => {
          output = frame;
        },
        error: (e) => {
          try {
            decoder.close();
          } catch {
            /* */
          }
          reject(e);
        },
      });
      decoder.configure(demux.config);
      decoder.decode(
        new EncodedVideoChunk({
          type: sample.isKey ? "key" : "delta",
          timestamp: sample.timestamp,
          duration: sample.duration,
          data: sample.data,
        }),
      );
      void decoder
        .flush()
        .then(() => {
          decoder.close();
          if (!output) reject(new Error("No frame"));
          else resolve(output);
        })
        .catch((e) => {
          try {
            decoder.close();
          } catch {
            /* */
          }
          reject(e);
        });
    });
  }

  private evict() {
    if (!this.governor || !this.demux) return;
    const budget = this.governor.getBudget();
    while (this.cache.size > budget) {
      let furthest = -1;
      let maxDist = -1;
      for (const key of this.cache.keys()) {
        const d = Math.abs(key - this.playhead);
        if (d > maxDist) {
          maxDist = d;
          furthest = key;
        }
      }
      if (furthest < 0) break;
      this.cache.get(furthest)?.close();
      this.cache.delete(furthest);
    }
    this.stats.cacheSize = this.cache.size;
    void this.lastHint;
  }
}
