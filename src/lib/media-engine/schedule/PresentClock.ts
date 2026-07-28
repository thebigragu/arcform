/**
 * Adaptive present FPS — subsample master timeline without alternate assets.
 * V2.3: 60 → 45 → 30 → 20 Hz states.
 */
export class PresentClock {
  private targetFps: number;
  private lastPresent = 0;
  private frames = 0;
  private windowStart = performance.now();
  private measuredFps = 60;

  constructor(initialFps: number) {
    this.targetFps = initialFps;
  }

  getTargetFps() {
    return this.targetFps;
  }

  getMeasuredFps() {
    return this.measuredFps;
  }

  setTargetFps(fps: number) {
    const allowed = [60, 45, 30, 20];
    const rounded = Math.round(fps);
    const nearest = allowed.reduce((best, v) =>
      Math.abs(v - rounded) < Math.abs(best - rounded) ? v : best,
    );
    this.targetFps = nearest;
  }

  stepDown() {
    if (this.targetFps > 45) this.targetFps = 45;
    else if (this.targetFps > 30) this.targetFps = 30;
    else if (this.targetFps > 20) this.targetFps = 20;
  }

  stepUp() {
    if (this.targetFps < 20) this.targetFps = 20;
    else if (this.targetFps < 30) this.targetFps = 30;
    else if (this.targetFps < 45) this.targetFps = 45;
    else if (this.targetFps < 60) this.targetFps = 60;
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

  /** Step down/up from health (legacy direct adapt — prefer RuntimeIntelligence). */
  adapt(measuredFps: number, decodeLatencyMs: number) {
    if (measuredFps < this.targetFps * 0.7 || decodeLatencyMs > 28) {
      this.stepDown();
    } else if (
      measuredFps > this.targetFps * 0.95 &&
      decodeLatencyMs < 10 &&
      this.targetFps < 60
    ) {
      this.stepUp();
    }
  }
}
