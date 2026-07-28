/**
 * Adaptive present FPS — subsample master 60fps timeline without alternate assets.
 */
export class PresentClock {
  private targetFps: number;
  private maxFps: number;
  private lastPresent = 0;
  private frames = 0;
  private windowStart = performance.now();
  private measuredFps = 60;

  constructor(initialFps: number, maxFps = 60) {
    this.maxFps = Math.max(15, Math.min(60, Math.round(maxFps)));
    this.targetFps = Math.max(15, Math.min(this.maxFps, Math.round(initialFps)));
  }

  getTargetFps() {
    return this.targetFps;
  }

  getMeasuredFps() {
    return this.measuredFps;
  }

  setTargetFps(fps: number) {
    this.targetFps = Math.max(15, Math.min(this.maxFps, Math.round(fps)));
  }

  setMaxFps(maxFps: number) {
    this.maxFps = Math.max(15, Math.min(60, Math.round(maxFps)));
    if (this.targetFps > this.maxFps) this.targetFps = this.maxFps;
  }

  /** Returns true if this rAF should draw. */
  shouldPresent(now = performance.now()) {
    const minDelta = 1000 / this.targetFps;
    if (now - this.lastPresent < minDelta * 0.85) return false;
    this.lastPresent = now;
    this.frames += 1;
    if (now - this.windowStart >= 500) {
      this.measuredFps = (this.frames * 1000) / (now - this.windowStart);
      this.frames = 0;
      this.windowStart = now;
    }
    return true;
  }

  /** Step down/up from health, never above maxFps. */
  adapt(measuredFps: number, decodeLatencyMs: number) {
    if (measuredFps < this.targetFps * 0.7 || decodeLatencyMs > 28) {
      if (this.targetFps > 30) this.targetFps = Math.min(30, this.maxFps);
      else if (this.targetFps > 20) this.targetFps = Math.min(20, this.maxFps);
    } else if (
      measuredFps > this.targetFps * 0.95 &&
      decodeLatencyMs < 10 &&
      this.targetFps < this.maxFps
    ) {
      if (this.targetFps < 30 && this.maxFps >= 30) this.targetFps = 30;
      else if (this.maxFps >= 60) this.targetFps = 60;
      else this.targetFps = this.maxFps;
    }
  }
}
