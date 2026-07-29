import { expandFrameUrl } from "./MediaManifest";

export type FrameNetState =
  | "unknown"
  | "queued"
  | "fetching"
  | "fetched"
  | "failed";

type Inflight = {
  controller: AbortController;
  promise: Promise<FetchResult>;
  priority: boolean;
};

export type FetchResult = {
  blob: Blob | null;
  aborted: boolean;
  fromSessionCache: boolean;
  /** Immutable URL for the requested frame index. */
  url: string;
  responseBytes: number;
};

function emptyResult(url: string, aborted = false): FetchResult {
  return {
    blob: null,
    aborted,
    fromSessionCache: false,
    url,
    responseBytes: 0,
  };
}

/**
 * Compressed-frame network layer with persistent session state.
 * Prefetch warms HTTP + session blob cache; does not decode.
 * Blobs are keyed strictly by frame index; never shared across indexes.
 */
export class SequenceLoader {
  private pattern = "";
  private frameCount = 0;
  private maxActive = 6;
  private inflight = new Map<number, Inflight>();
  private queue: number[] = [];
  private blobs = new Map<number, Blob>();
  private state = new Map<number, FrameNetState>();
  private waiters = new Map<number, Array<(r: FetchResult) => void>>();

  ensureRequested = 0;
  fetchQueued = 0;
  fetchStarted = 0;
  fetchCompleted = 0;
  browserCacheHits = 0;
  fetchAborted = 0;
  fetchFailed = 0;
  dedupePrevented = 0;
  framesRequested = 0;
  duplicatePrevented = 0;

  lastRequestedIndex: number | null = null;
  lastRequestedUrl: string | null = null;
  lastResponseUrl: string | null = null;
  lastResponseBytes = 0;

  configure(pattern: string, frameCount: number, maxActiveFetches: number) {
    this.pattern = pattern;
    this.frameCount = frameCount;
    this.maxActive = Math.max(1, maxActiveFetches);
  }

  get activeCount() {
    return this.inflight.size;
  }

  hasPriorityInflight() {
    for (const job of this.inflight.values()) {
      if (job.priority) return true;
    }
    return false;
  }

  urlFor(index: number) {
    return expandFrameUrl(this.pattern, index);
  }

  getState(index: number): FrameNetState {
    return this.state.get(index) ?? "unknown";
  }

  hasBlob(index: number) {
    return this.blobs.has(index);
  }

  getBlob(index: number) {
    return this.blobs.get(index) ?? null;
  }

  private noteLast(
    index: number,
    requestedUrl: string,
    responseUrl: string,
    bytes: number,
  ) {
    this.lastRequestedIndex = index;
    this.lastRequestedUrl = requestedUrl;
    this.lastResponseUrl = responseUrl;
    this.lastResponseBytes = bytes;
  }

  requestFetch(index: number, priority: boolean) {
    this.ensureRequested += 1;
    this.framesRequested = this.ensureRequested;
    if (index < 0 || index >= this.frameCount) return;
    if (this.blobs.has(index)) {
      this.dedupePrevented += 1;
      this.duplicatePrevented = this.dedupePrevented;
      return;
    }
    if (this.inflight.has(index)) {
      this.dedupePrevented += 1;
      this.duplicatePrevented = this.dedupePrevented;
      return;
    }
    if (this.state.get(index) === "queued") {
      this.dedupePrevented += 1;
      this.duplicatePrevented = this.dedupePrevented;
      return;
    }
    if (this.state.get(index) === "failed" && !priority) return;

    if (!priority && this.inflight.size >= this.maxActive) {
      this.enqueue(index);
      return;
    }
    if (priority && this.inflight.size >= this.maxActive) {
      this.abortOneLowPriority(index);
    }
    void this.startFetch(index, priority);
  }

  ensureFetched(
    index: number,
    priority: boolean,
  ): Promise<FetchResult> {
    this.ensureRequested += 1;
    this.framesRequested = this.ensureRequested;
    const url = this.urlFor(index);

    if (index < 0 || index >= this.frameCount) {
      return Promise.resolve(emptyResult(url));
    }

    const cached = this.blobs.get(index);
    if (cached) {
      this.dedupePrevented += 1;
      this.duplicatePrevented = this.dedupePrevented;
      this.noteLast(index, url, url, cached.size);
      return Promise.resolve({
        blob: cached,
        aborted: false,
        fromSessionCache: true,
        url,
        responseBytes: cached.size,
      });
    }

    const existing = this.inflight.get(index);
    if (existing) {
      this.dedupePrevented += 1;
      this.duplicatePrevented = this.dedupePrevented;
      if (priority && !existing.priority) existing.priority = true;
      return existing.promise;
    }

    if (this.state.get(index) === "failed" && !priority) {
      return Promise.resolve(emptyResult(url));
    }

    if (!priority && this.inflight.size >= this.maxActive) {
      this.enqueue(index);
      return this.waitForResult(index);
    }

    if (priority && this.inflight.size >= this.maxActive) {
      this.abortOneLowPriority(index);
    }

    return this.startFetch(index, priority);
  }

  syncDesiredWindow(desired: Set<number>, protectedIndexes: Set<number>) {
    for (const idx of desired) {
      this.requestFetch(idx, false);
    }

    this.queue = this.queue.filter((idx) => {
      if (desired.has(idx) || protectedIndexes.has(idx)) return true;
      if (this.state.get(idx) === "queued") this.state.set(idx, "unknown");
      this.resolveWaiters(idx, emptyResult(this.urlFor(idx), true));
      return false;
    });

    for (const [idx, job] of this.inflight) {
      if (desired.has(idx) || protectedIndexes.has(idx)) continue;
      try {
        job.controller.abort();
      } catch {
        /* */
      }
      this.inflight.delete(idx);
      this.fetchAborted += 1;
      if (this.state.get(idx) === "fetching") this.state.set(idx, "unknown");
      this.resolveWaiters(idx, emptyResult(this.urlFor(idx), true));
    }

    this.pumpQueue();
  }

  abortOutside(keep: Set<number>) {
    this.syncDesiredWindow(keep, keep);
  }

  private enqueue(index: number) {
    if (this.queue.includes(index)) {
      this.dedupePrevented += 1;
      this.duplicatePrevented = this.dedupePrevented;
      return;
    }
    this.queue.push(index);
    this.state.set(index, "queued");
    this.fetchQueued += 1;
  }

  private waitForResult(index: number): Promise<FetchResult> {
    return new Promise((resolve) => {
      const list = this.waiters.get(index) ?? [];
      list.push(resolve);
      this.waiters.set(index, list);
    });
  }

  private resolveWaiters(index: number, result: FetchResult) {
    const list = this.waiters.get(index);
    if (!list) return;
    this.waiters.delete(index);
    for (const resolve of list) resolve(result);
  }

  private startFetch(index: number, priority: boolean): Promise<FetchResult> {
    const controller = new AbortController();
    const url = this.urlFor(index);
    this.state.set(index, "fetching");
    this.fetchStarted += 1;

    const promise = (async (): Promise<FetchResult> => {
      try {
        const res = await fetch(url, {
          cache: "force-cache",
          signal: controller.signal,
        });
        const responseUrl = res.url || url;
        if (!res.ok) {
          this.state.set(index, "failed");
          this.fetchFailed += 1;
          const fail = emptyResult(url);
          this.resolveWaiters(index, fail);
          return fail;
        }
        const blob = await res.blob();
        // Key strictly by the requested index — never by current target
        this.blobs.set(index, blob);
        this.state.set(index, "fetched");
        this.fetchCompleted += 1;
        this.noteBrowserCacheHit(url);
        this.noteLast(index, url, responseUrl, blob.size);
        const ok: FetchResult = {
          blob,
          aborted: false,
          fromSessionCache: false,
          url,
          responseBytes: blob.size,
        };
        this.resolveWaiters(index, ok);
        return ok;
      } catch (e) {
        const aborted =
          (e instanceof DOMException && e.name === "AbortError") ||
          (e instanceof Error && e.name === "AbortError") ||
          controller.signal.aborted;
        if (aborted) {
          this.fetchAborted += 1;
          if (!this.blobs.has(index)) this.state.set(index, "unknown");
          const r = emptyResult(url, true);
          this.resolveWaiters(index, r);
          return r;
        }
        this.state.set(index, "failed");
        this.fetchFailed += 1;
        const r = emptyResult(url);
        this.resolveWaiters(index, r);
        return r;
      } finally {
        this.inflight.delete(index);
        this.pumpQueue();
      }
    })();

    this.inflight.set(index, { controller, promise, priority });
    return promise;
  }

  private pumpQueue() {
    while (this.inflight.size < this.maxActive && this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (this.blobs.has(next) || this.inflight.has(next)) {
        const blob = this.blobs.get(next);
        if (blob) {
          const url = this.urlFor(next);
          this.resolveWaiters(next, {
            blob,
            aborted: false,
            fromSessionCache: true,
            url,
            responseBytes: blob.size,
          });
        }
        continue;
      }
      void this.startFetch(next, false);
    }
  }

  private abortOneLowPriority(keepIndex: number) {
    for (const [idx, job] of this.inflight) {
      if (idx === keepIndex) continue;
      if (job.priority) continue;
      try {
        job.controller.abort();
      } catch {
        /* */
      }
      this.inflight.delete(idx);
      this.fetchAborted += 1;
      if (this.state.get(idx) === "fetching") this.state.set(idx, "unknown");
      this.resolveWaiters(idx, emptyResult(this.urlFor(idx), true));
      return;
    }
    for (const [idx] of this.inflight) {
      if (idx === keepIndex) continue;
      const job = this.inflight.get(idx)!;
      try {
        job.controller.abort();
      } catch {
        /* */
      }
      this.inflight.delete(idx);
      this.fetchAborted += 1;
      this.resolveWaiters(idx, emptyResult(this.urlFor(idx), true));
      return;
    }
  }

  private noteBrowserCacheHit(url: string) {
    try {
      const entries = performance.getEntriesByName(url, "resource");
      const last = entries[entries.length - 1] as
        | PerformanceResourceTiming
        | undefined;
      if (last && last.transferSize === 0 && last.decodedBodySize > 0) {
        this.browserCacheHits += 1;
      }
    } catch {
      /* */
    }
  }

  dispose() {
    for (const job of this.inflight.values()) {
      try {
        job.controller.abort();
      } catch {
        /* */
      }
    }
    this.inflight.clear();
    this.queue = [];
    this.blobs.clear();
    this.state.clear();
    for (const [idx] of this.waiters) {
      this.resolveWaiters(idx, emptyResult(this.urlFor(idx), true));
    }
  }
}
