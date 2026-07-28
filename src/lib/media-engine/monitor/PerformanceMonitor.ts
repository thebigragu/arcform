import type { AdaptationEvent, EngineStats } from "../types";

function variance(samples: number[]): number {
  if (samples.length < 2) return 0;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  let sum = 0;
  for (const v of samples) {
    const d = v - mean;
    sum += d * d;
  }
  return sum / (samples.length - 1);
}

/** Opt-in analytics — disabled unless explicitly enabled. */
export class PerformanceMonitor {
  private enabled: boolean;
  private fallbackCount = 0;
  private initMs = 0;
  private frameTimes: number[] = [];
  private worstFrameMs = 0;
  private adaptEvents: AdaptationEvent[] = [];
  private readonly maxFrameSamples = 90;
  private readonly maxEvents = 24;

  constructor(enabled = false) {
    this.enabled = enabled;
  }

  setEnabled(v: boolean) {
    this.enabled = v;
  }

  markInit(ms: number) {
    this.initMs = ms;
  }

  markFallback() {
    this.fallbackCount += 1;
  }

  recordPresentFrame(drawMs: number) {
    if (!this.enabled) return;
    const ms = Math.max(0, drawMs);
    this.frameTimes.push(ms);
    if (this.frameTimes.length > this.maxFrameSamples) {
      this.frameTimes.shift();
    }
    if (ms > this.worstFrameMs) this.worstFrameMs = ms;
  }

  recordAdaptEvent(event: AdaptationEvent) {
    if (!this.enabled) return;
    this.adaptEvents.push(event);
    if (this.adaptEvents.length > this.maxEvents) {
      this.adaptEvents.shift();
    }
  }

  getFallbackCount() {
    return this.fallbackCount;
  }

  getInitMs() {
    return this.initMs;
  }

  getWorstFrameMs() {
    return this.worstFrameMs;
  }

  getFrameTimeVariance() {
    return variance(this.frameTimes);
  }

  getAdaptationEvents(): AdaptationEvent[] {
    return this.adaptEvents.slice();
  }

  emit(stats: EngineStats, onStats?: (s: EngineStats) => void) {
    if (!this.enabled || !onStats) return;
    onStats({
      ...stats,
      initMs: this.initMs,
      fallbackCount: this.fallbackCount,
      worstFrameMs: this.worstFrameMs,
      frameTimeVariance: variance(this.frameTimes),
      adaptationEvents: this.adaptEvents.slice(),
    });
  }
}
