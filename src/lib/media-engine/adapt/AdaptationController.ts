import type { PresentClock } from "../schedule/PresentClock";
import type { AdaptiveBufferGovernor } from "../schedule/AdaptiveBufferGovernor";
import type { AdaptationEvent } from "../types";

type AdaptHooks = {
  presentClock: PresentClock;
  buffer: AdaptiveBufferGovernor;
  onForceVideo?: () => void;
  onBufferPressure?: () => void;
  onAdaptEvent?: (event: AdaptationEvent) => void;
};

/**
 * Low-level adaptation actuator. V2.3: prefer RuntimeIntelligence for decisions.
 */
export class AdaptationController {
  constructor(private hooks: AdaptHooks) {}

  /** Direct tick — used when RuntimeIntelligence is not wired. */
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
  }

  private emit(event: AdaptationEvent) {
    this.hooks.onAdaptEvent?.(event);
  }
}
