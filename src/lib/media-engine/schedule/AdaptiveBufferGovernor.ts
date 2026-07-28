/**
 * Bounds decoded VideoFrame count from runtime metrics — no fixed ±N.
 */
export class AdaptiveBufferGovernor {
  private budgetFrames: number;
  private readonly minBudget: number;
  private readonly maxBudget: number;

  constructor(initialBudget: number) {
    this.minBudget = 6;
    this.maxBudget = 48;
    this.budgetFrames = this.clamp(initialBudget);
  }

  getBudget() {
    return this.budgetFrames;
  }

  setBudget(n: number) {
    this.budgetFrames = this.clamp(n);
  }

  /** Expand/shrink from decode latency + present FPS health. */
  observe(opts: {
    decodeLatencyMs: number;
    presentFps: number;
    targetFps: number;
    velocityAbs: number;
  }) {
    let next = this.budgetFrames;
    if (opts.decodeLatencyMs > 24) next -= 2;
    else if (opts.decodeLatencyMs < 8 && opts.presentFps >= opts.targetFps * 0.9) {
      next += 1;
    }
    if (opts.velocityAbs > 2.5) next += 2;
    if (opts.presentFps < opts.targetFps * 0.6) next -= 3;
    this.budgetFrames = this.clamp(next);
  }

  desiredWindow(playhead: number, direction: -1 | 0 | 1, frameCount: number) {
    const ahead = Math.ceil(this.budgetFrames * (direction === 0 ? 0.5 : 0.7));
    const behind = this.budgetFrames - ahead;
    const lo = Math.max(0, playhead - (direction >= 0 ? behind : ahead));
    const hi = Math.min(
      frameCount - 1,
      playhead + (direction >= 0 ? ahead : behind),
    );
    return { lo, hi };
  }

  private clamp(n: number) {
    return Math.max(this.minBudget, Math.min(this.maxBudget, Math.round(n)));
  }
}
