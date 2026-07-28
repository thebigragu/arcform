import type { PredictHint } from "../types";

/**
 * Estimate future playhead from scroll velocity / acceleration.
 */
export class PredictiveFrameScheduler {
  private lastProgress = 0;
  private lastTime = 0;
  private velocity = 0;
  private acceleration = 0;
  private frameCount = 1;

  reset(frameCount: number) {
    this.frameCount = Math.max(1, frameCount);
    this.lastProgress = 0;
    this.lastTime = performance.now();
    this.velocity = 0;
    this.acceleration = 0;
  }

  /** progress 0..1 → integer frame + prediction hint */
  update(progress: number): { index: number; hint: PredictHint } {
    const now = performance.now();
    const dt = Math.max(1, now - this.lastTime) / 1000;
    const p = Math.min(1, Math.max(0, progress));
    const v = (p - this.lastProgress) / dt;
    this.acceleration = (v - this.velocity) / dt;
    this.velocity = v;
    this.lastProgress = p;
    this.lastTime = now;

    const max = Math.max(0, this.frameCount - 1);
    const index = Math.round(p * max);
    const direction: -1 | 0 | 1 =
      Math.abs(v) < 0.02 ? 0 : v > 0 ? 1 : -1;

    const predictedIndices: number[] = [];
    for (const horizonMs of [16, 48, 100]) {
      const futureP = p + v * (horizonMs / 1000) + 0.5 * this.acceleration * (horizonMs / 1000) ** 2;
      const fi = Math.round(Math.min(1, Math.max(0, futureP)) * max);
      if (!predictedIndices.includes(fi)) predictedIndices.push(fi);
    }

    return {
      index,
      hint: {
        velocity: this.velocity,
        acceleration: this.acceleration,
        direction,
        predictedIndices,
      },
    };
  }
}
