import {
  nextBitmapId,
  type SequenceFrameCache,
} from "./SequenceFrameCache";
import { sha256PrefixBlob } from "./hashPrefix";
import type { SequenceLoader } from "./SequenceLoader";
import { coldStartTelemetry } from "./ColdStartTelemetry";

export type SchedulerHooks = {
  onNeedPresent: () => void;
};

type DecodeJob = {
  index: number;
  priority: boolean;
};

type DecodeRequest = {
  requestId: number;
  lifecycleId: number;
  requestedIndex: number;
  requestedUrl: string;
  priority: boolean;
};

/**
 * Latest-target coalescing with window-diff prefetch and capped decode.
 * Generation advances only on material target/direction/jump/settle changes.
 */
export class SequenceScheduler {
  target = 0;
  generation = 0;
  direction: -1 | 0 | 1 = 0;
  velocity = 0;
  jumpActive = false;
  settled = true;
  prefetchExpanded = false;
  hasInteracted = false;
  bootstrapPhase: "boot" | "first-frame" | "ready" = "boot";
  idleAnchorWarmingActive = false;

  get isScrolling() {
    return this.scrolling;
  }

  progressEvents = 0;
  targetChanges = 0;
  schedulerGenerations = 0;
  obsoleteSkipped = 0;
  activeDecodes = 0;
  decodeStarted = 0;
  decodeCompleted = 0;
  decodeDiscardedStale = 0;
  decodeFailures = 0;

  private lastProgressAt = 0;
  private lastTarget = 0;
  private settleTimer: number | null = null;
  private decodeInflight = new Set<number>();
  private decodeQueue: DecodeJob[] = [];
  private desiredPrefetch = new Set<number>();
  private anchorsArmed = false;
  private anchorCursor = 0;
  private anchorBusy = 0;
  private idleHandle: number | null = null;
  private scrolling = false;
  private requestSeq = 0;
  private lifecycleId = 0;
  private debugHashes = false;

  private prefetchAhead = 12;
  private prefetchBehind = 6;
  private frameCount = 0;
  private maxActiveDecodes = 2;
  private maxIdleAnchors = 2;
  private anchorStride = 10;
  private disposed = false;

  constructor(
    private loader: SequenceLoader,
    private cache: SequenceFrameCache,
    private hooks: SchedulerHooks,
  ) {}

  configureLimits(opts: {
    decodedCacheMax: number;
    prefetchAhead: number;
    prefetchBehind: number;
    maxActiveFetches: number;
    maxActiveDecodes: number;
    maxIdleAnchors: number;
    frameCount: number;
    urlPattern: string;
    debugHashes?: boolean;
  }) {
    this.cache.setMax(opts.decodedCacheMax);
    this.loader.configure(
      opts.urlPattern,
      opts.frameCount,
      opts.maxActiveFetches,
    );
    this.prefetchAhead = opts.prefetchAhead;
    this.prefetchBehind = opts.prefetchBehind;
    this.frameCount = opts.frameCount;
    this.maxActiveDecodes = Math.max(1, opts.maxActiveDecodes);
    this.maxIdleAnchors = Math.max(0, opts.maxIdleAnchors);
    this.debugHashes = Boolean(opts.debugHashes);
  }

  setProgress(progress: number) {
    this.progressEvents += 1;
    if (progress > 0.001) this.hasInteracted = true;

    const next = Math.max(
      0,
      Math.min(
        this.frameCount - 1,
        Math.round(progress * Math.max(0, this.frameCount - 1)),
      ),
    );

    const prevTarget = this.target;
    const prevDirection = this.direction;
    const prevJump = this.jumpActive;
    const prevSettled = this.settled;

    const delta = next - this.lastTarget;
    let nextDirection = this.direction;
    if (delta > 0) nextDirection = 1;
    else if (delta < 0) nextDirection = -1;

    const now = performance.now();
    const dt = Math.max(1, now - (this.lastProgressAt || now));
    this.velocity = Math.abs(delta) / (dt / 1000);
    this.lastProgressAt = now;

    if (Math.abs(delta) > 1) {
      this.obsoleteSkipped += Math.abs(delta) - 1;
    }

    const nextJump = Math.abs(delta) > 8;
    this.jumpActive = nextJump;
    this.settled = false;
    this.scrolling = true;
    this.pauseIdleWarming();

    const targetChanged = next !== prevTarget;
    if (targetChanged) {
      this.target = next;
      this.targetChanges += 1;
    }
    this.direction = nextDirection;
    this.lastTarget = next;

    const directionChanged = nextDirection !== prevDirection;
    const jumpChanged = nextJump !== prevJump;
    const settleChanged = prevSettled === true;

    if (targetChanged || directionChanged || jumpChanged || settleChanged) {
      this.generation += 1;
      this.schedulerGenerations = this.generation;
    }

    if (this.settleTimer != null) window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      const wasJump = this.jumpActive;
      this.settled = true;
      this.jumpActive = false;
      this.velocity = 0;
      this.scrolling = false;
      if (wasJump) {
        this.generation += 1;
        this.schedulerGenerations = this.generation;
      }
      void this.requestDecode(this.target, true);
      if (this.prefetchExpanded) this.syncCompressedPrefetch();
      this.hooks.onNeedPresent();
      this.scheduleIdleWarming();
    }, 100);

    if (!targetChanged && !directionChanged && !jumpChanged) {
      return;
    }

    void this.requestDecode(next, true);

    if (this.prefetchExpanded) {
      this.syncCompressedPrefetch();
    }

    if (!nextJump && nextDirection !== 0) {
      const ahead = next + nextDirection;
      const behind = next - nextDirection;
      if (ahead >= 0 && ahead < this.frameCount) {
        void this.requestDecode(ahead, false);
      }
      if (behind >= 0 && behind < this.frameCount) {
        void this.requestDecode(behind, false);
      }
    }

    this.hooks.onNeedPresent();
  }

  async bootstrapInitial() {
    this.bootstrapPhase = "boot";
    coldStartTelemetry.noteFrame0DecodeStart();
    await this.requestDecode(0, true);
    coldStartTelemetry.noteFrame0DecodeEnd();
    if (this.frameCount > 1) void this.requestDecode(1, false);
    if (this.frameCount > 2) void this.requestDecode(2, false);
  }

  markFirstFramePresented() {
    if (this.bootstrapPhase === "boot") this.bootstrapPhase = "first-frame";
    if (this.hasInteracted || this.prefetchExpanded) {
      this.bootstrapPhase = "ready";
    }
  }

  enablePrefetchExpansion() {
    if (this.prefetchExpanded) return;
    this.prefetchExpanded = true;
    if (this.bootstrapPhase !== "boot") this.bootstrapPhase = "ready";
    this.syncCompressedPrefetch();
    this.scheduleIdleWarming();
  }

  bumpLifecycleGeneration() {
    this.lifecycleId += 1;
    this.generation += 1;
    this.schedulerGenerations = this.generation;
  }

  private computeDesiredPrefetch(): Set<number> {
    const dir = this.direction === 0 ? 1 : this.direction;
    const ahead = dir >= 0 ? this.prefetchAhead : this.prefetchBehind;
    const behind = dir >= 0 ? this.prefetchBehind : this.prefetchAhead;
    const keep = new Set<number>([this.target]);
    for (let i = 1; i <= ahead; i++) {
      const idx = this.target + dir * i;
      if (idx < 0 || idx >= this.frameCount) break;
      keep.add(idx);
    }
    for (let i = 1; i <= behind; i++) {
      const idx = this.target - dir * i;
      if (idx < 0 || idx >= this.frameCount) break;
      keep.add(idx);
    }
    return keep;
  }

  private protectedDecodeSet(): Set<number> {
    const s = new Set<number>([this.target]);
    if (this.direction !== 0) {
      s.add(
        Math.min(this.frameCount - 1, Math.max(0, this.target + this.direction)),
      );
      s.add(
        Math.min(this.frameCount - 1, Math.max(0, this.target - this.direction)),
      );
    }
    const nearest = this.cache.nearest(this.target);
    if (nearest) s.add(nearest.index);
    return s;
  }

  private frameStillUseful(index: number): boolean {
    if (index === this.target) return true;
    if (this.desiredPrefetch.has(index)) return true;
    if (this.protectedDecodeSet().has(index)) return true;
    if (Math.abs(index - this.target) <= 2) return true;
    return false;
  }

  private syncCompressedPrefetch() {
    const next = this.computeDesiredPrefetch();
    this.desiredPrefetch = next;
    this.loader.syncDesiredWindow(next, this.protectedDecodeSet());
  }

  private async requestDecode(index: number, priority: boolean) {
    if (index < 0 || index >= this.frameCount) return;
    if (this.cache.has(index)) return;
    if (this.decodeInflight.has(index)) return;
    if (this.decodeQueue.some((j) => j.index === index)) {
      if (priority) {
        this.decodeQueue = this.decodeQueue.filter((j) => j.index !== index);
        this.decodeQueue.unshift({ index, priority: true });
      }
      return;
    }

    if (this.decodeInflight.size >= this.maxActiveDecodes) {
      if (priority) this.decodeQueue.unshift({ index, priority: true });
      else this.decodeQueue.push({ index, priority: false });
      return;
    }

    await this.runDecode(index, priority);
  }

  private pumpDecodeQueue() {
    while (
      this.decodeInflight.size < this.maxActiveDecodes &&
      this.decodeQueue.length > 0
    ) {
      let pick = 0;
      for (let i = 0; i < this.decodeQueue.length; i++) {
        if (this.decodeQueue[i]!.priority) {
          pick = i;
          break;
        }
      }
      const job = this.decodeQueue.splice(pick, 1)[0]!;
      if (this.cache.has(job.index) || this.decodeInflight.has(job.index)) {
        continue;
      }
      void this.runDecode(job.index, job.priority);
    }
  }

  private async runDecode(index: number, priority: boolean) {
    if (this.cache.has(index) || this.decodeInflight.has(index)) return;

    this.requestSeq += 1;
    const req: DecodeRequest = {
      requestId: this.requestSeq,
      lifecycleId: this.lifecycleId,
      requestedIndex: index,
      requestedUrl: this.loader.urlFor(index),
      priority,
    };

    this.decodeInflight.add(req.requestedIndex);
    this.activeDecodes = this.decodeInflight.size;
    this.decodeStarted += 1;

    try {
      const result = await this.loader.ensureFetched(
        req.requestedIndex,
        req.priority,
      );
      if (result.aborted) return;
      const blob = result.blob;
      if (!blob) {
        if (this.loader.getState(req.requestedIndex) === "failed") {
          this.decodeFailures += 1;
        }
        return;
      }

      if (req.lifecycleId !== this.lifecycleId) {
        this.decodeDiscardedStale += 1;
        return;
      }

      let bitmap: ImageBitmap | null = null;
      let img: HTMLImageElement | null = null;
      let bytesEstimate = 0;
      let width = 0;
      let height = 0;
      try {
        if (typeof createImageBitmap === "function") {
          bitmap = await createImageBitmap(blob);
          width = bitmap.width;
          height = bitmap.height;
          bytesEstimate = width * height * 4;
        }
      } catch {
        bitmap = null;
      }
      if (!bitmap) {
        try {
          img = await this.loadImage(URL.createObjectURL(blob));
          width = img.naturalWidth || 1;
          height = img.naturalHeight || 1;
          bytesEstimate = width * height * 4;
        } catch {
          this.decodeFailures += 1;
          return;
        }
      }

      if (req.lifecycleId !== this.lifecycleId) {
        try {
          bitmap?.close();
        } catch {
          /* */
        }
        this.decodeDiscardedStale += 1;
        return;
      }

      // Always insert under immutable requested index — never current target.
      if (
        !this.frameStillUseful(req.requestedIndex) &&
        req.requestedIndex !== this.target &&
        Math.abs(req.requestedIndex - this.target) > this.prefetchAhead
      ) {
        try {
          bitmap?.close();
        } catch {
          /* */
        }
        this.decodeDiscardedStale += 1;
        return;
      }

      let blobHashPrefix: string | null = null;
      if (this.debugHashes) {
        try {
          blobHashPrefix = await sha256PrefixBlob(blob);
        } catch {
          blobHashPrefix = null;
        }
      }

      const protect = this.protectedDecodeSet();
      const ok = this.cache.put(
        {
          index: req.requestedIndex,
          sourceUrl: req.requestedUrl,
          blobBytes: result.responseBytes || blob.size,
          blobHashPrefix,
          bitmapId: nextBitmapId(req.requestedIndex),
          bitmap,
          img,
          bytesEstimate,
          generation: this.generation,
          width,
          height,
        },
        protect,
      );
      if (ok) {
        this.decodeCompleted += 1;
        this.hooks.onNeedPresent();
      } else {
        try {
          bitmap?.close();
        } catch {
          /* */
        }
        this.decodeDiscardedStale += 1;
      }
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name !== "AbortError") this.decodeFailures += 1;
    } finally {
      this.decodeInflight.delete(req.requestedIndex);
      this.activeDecodes = this.decodeInflight.size;
      this.pumpDecodeQueue();
    }
  }

  private scheduleIdleWarming() {
    if (!this.prefetchExpanded || this.scrolling || !this.settled) return;
    if (this.maxIdleAnchors <= 0) return;
    this.pauseIdleWarming();

    const run = () => {
      this.idleHandle = null;
      if (this.scrolling || !this.settled || this.disposed) return;
      this.warmAnchors();
      if (this.anchorCursor < this.frameCount) {
        this.scheduleIdleWarming();
      }
    };

    const ric = (
      window as Window & {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout: number },
        ) => number;
      }
    ).requestIdleCallback;
    if (typeof ric === "function") {
      this.idleHandle = ric(run, { timeout: 1500 });
    } else {
      this.idleHandle = window.setTimeout(run, 400);
    }
  }

  private pauseIdleWarming() {
    if (this.idleHandle == null) return;
    const cic = (
      window as Window & { cancelIdleCallback?: (id: number) => void }
    ).cancelIdleCallback;
    if (typeof cic === "function") cic(this.idleHandle);
    else window.clearTimeout(this.idleHandle);
    this.idleHandle = null;
  }

  private warmAnchors() {
    if (!this.anchorsArmed) {
      this.anchorsArmed = true;
      this.anchorCursor = this.anchorStride;
    }
    while (
      this.anchorBusy < this.maxIdleAnchors &&
      this.anchorCursor < this.frameCount
    ) {
      this.idleAnchorWarmingActive = true;
      const idx = this.anchorCursor;
      this.anchorCursor += this.anchorStride;
      if (this.loader.hasBlob(idx)) continue;
      if (this.desiredPrefetch.has(idx)) continue;
      this.anchorBusy += 1;
      void this.loader.ensureFetched(idx, false).finally(() => {
        this.anchorBusy = Math.max(0, this.anchorBusy - 1);
        if (this.anchorBusy === 0) this.idleAnchorWarmingActive = false;
      });
    }
    if (this.anchorBusy === 0) this.idleAnchorWarmingActive = false;
  }

  private loadImage(url: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("img-decode-failed"));
      img.src = url;
    });
  }

  dispose() {
    this.disposed = true;
    this.lifecycleId += 1;
    if (this.settleTimer != null) window.clearTimeout(this.settleTimer);
    this.pauseIdleWarming();
    this.decodeQueue = [];
  }
}
