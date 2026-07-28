import type { PresentClock } from "../schedule/PresentClock";
import type { AdaptiveBufferGovernor } from "../schedule/AdaptiveBufferGovernor";
import type { AdaptationEvent } from "../types";

type AdaptHooks = {
  presentClock: PresentClock;
  buffer: AdaptiveBufferGovernor;
  onForceVideo?: () => void;
  /** Shrink decoded-frame budget under sustained load — does not reload ladder. */
  onBufferPressure?: () => void;
  onAdaptEvent?: (event: AdaptationEvent) => void;
};

/**
 * Continuous runtime optimization after startup.
 * Adapts present FPS, buffer budget, and may force html-video.
 * Does not hot-swap quality ladder tiers.
 */
export class AdaptationController {
  private unhealthyStreak = 0;
  private healthyStreak = 0;
  private forcedVideo = false;
  private pressureApplied = false;

  constructor(private hooks: AdaptHooks) {}

  tick(metrics: {
    measuredFps: number;
    targetFps: number;
    decodeLatencyMs: number;
    velocityAbs: number;
  }) {
    const budgetBefore = this.hooks.buffer.getBudget();
    this.hooks.buffer.observe({
      decodeLatencyMs: metrics.decodeLatencyMs,
      presentFps: metrics.measuredFps,
      targetFps: metrics.targetFps,
      velocityAbs: metrics.velocityAbs,
    });
    const budgetAfter = this.hooks.buffer.getBudget();
    if (budgetAfter !== budgetBefore) {
      this.emit({
        type: "buffer-step",
        detail: `${budgetBefore}→${budgetAfter}`,
        at: performance.now(),
      });
    }

    const fpsBefore = this.hooks.presentClock.getTargetFps();
    this.hooks.presentClock.adapt(metrics.measuredFps, metrics.decodeLatencyMs);
    const fpsAfter = this.hooks.presentClock.getTargetFps();
    if (fpsAfter !== fpsBefore) {
      this.emit({
        type: "fps-step",
        detail: `${fpsBefore}→${fpsAfter}`,
        at: performance.now(),
      });
    }

    const bad =
      metrics.measuredFps < metrics.targetFps * 0.55 ||
      metrics.decodeLatencyMs > 40;
    if (bad) {
      this.unhealthyStreak += 1;
      this.healthyStreak = 0;
    } else {
      this.healthyStreak += 1;
      this.unhealthyStreak = 0;
    }

    if (this.unhealthyStreak >= 45 && !this.pressureApplied && !this.forcedVideo) {
      this.pressureApplied = true;
      this.emit({
        type: "buffer-pressure",
        detail: "relieve-budget",
        at: performance.now(),
      });
      this.hooks.onBufferPressure?.();
    }
    if (this.unhealthyStreak >= 90 && !this.forcedVideo) {
      this.forcedVideo = true;
      this.emit({
        type: "renderer-fallback",
        detail: "html-video",
        at: performance.now(),
      });
      this.hooks.onForceVideo?.();
    }
  }

  private emit(event: AdaptationEvent) {
    this.hooks.onAdaptEvent?.(event);
  }
}
