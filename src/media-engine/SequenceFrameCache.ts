export type DecodedFrame = {
  index: number;
  sourceUrl: string;
  blobBytes: number;
  blobHashPrefix: string | null;
  bitmapId: string;
  bitmap: ImageBitmap | null;
  img: HTMLImageElement | null;
  bytesEstimate: number;
  generation: number;
  width: number;
  height: number;
};

const DEFAULT_MAX = 6;
const HARD_MAX = 8;
let bitmapSeq = 0;

export function nextBitmapId(frameIndex: number) {
  bitmapSeq += 1;
  return `bmp-${frameIndex}-${bitmapSeq}`;
}

/**
 * Decoded ImageBitmap/Image cache — bounded (6 default, 8 hard max).
 * Separate from compressed HTTP / session prefetch.
 */
export class SequenceFrameCache {
  private cache = new Map<number, DecodedFrame>();
  private maxSize = DEFAULT_MAX;
  framesDecoded = 0;
  framesEvicted = 0;

  setMax(n: number) {
    this.maxSize = Math.max(1, Math.min(HARD_MAX, n));
  }

  get max() {
    return this.maxSize;
  }

  get(index: number) {
    return this.cache.get(index) ?? null;
  }

  has(index: number) {
    return this.cache.has(index);
  }

  indexes() {
    return [...this.cache.keys()].sort((a, b) => a - b);
  }

  get size() {
    return this.cache.size;
  }

  estimatedMemoryMb() {
    let bytes = 0;
    for (const e of this.cache.values()) bytes += e.bytesEstimate;
    return bytes / (1024 * 1024);
  }

  nearest(target: number): DecodedFrame | null {
    if (this.cache.has(target)) return this.cache.get(target)!;
    let best: DecodedFrame | null = null;
    let bestDist = Infinity;
    for (const e of this.cache.values()) {
      const d = Math.abs(e.index - target);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  put(entry: DecodedFrame, protect: Set<number>) {
    // Cache key MUST equal the immutable requested frame index
    if (this.cache.has(entry.index)) {
      const existing = this.cache.get(entry.index)!;
      if (entry.generation < existing.generation) {
        this.release(entry);
        return false;
      }
      this.release(existing);
    }
    this.cache.set(entry.index, entry);
    this.framesDecoded += 1;
    this.evict(protect);
    return true;
  }

  evict(protect: Set<number>) {
    while (this.cache.size > this.maxSize) {
      let victim = -1;
      let farthest = -1;
      const center =
        [...protect][0] ??
        (this.cache.size ? [...this.cache.keys()][0]! : 0);
      for (const idx of this.cache.keys()) {
        if (protect.has(idx)) continue;
        const d = Math.abs(idx - center);
        if (d > farthest) {
          farthest = d;
          victim = idx;
        }
      }
      if (victim < 0) {
        for (const idx of this.cache.keys()) {
          if (protect.has(idx) && idx !== center) {
            victim = idx;
            break;
          }
        }
      }
      if (victim < 0) break;
      const e = this.cache.get(victim);
      if (e) {
        this.release(e);
        this.framesEvicted += 1;
      }
      this.cache.delete(victim);
    }
  }

  private release(e: DecodedFrame) {
    try {
      e.bitmap?.close();
    } catch {
      /* normal eviction — not a decode failure */
    }
    e.bitmap = null;
    e.img = null;
  }

  dispose() {
    for (const e of this.cache.values()) this.release(e);
    this.cache.clear();
  }
}
