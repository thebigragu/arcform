import type { PresentClock } from "../schedule/PresentClock";
import type { AdaptiveBufferGovernor } from "../schedule/AdaptiveBufferGovernor";
import type {
  AdaptationEvent,
  CapabilityScore,
  ExperienceMode,
  PresentationRate,
} from "../types";

const SAMPLE_INTERVAL_MS = 2500;
const MIN_DWELL_MS = 3000;
const PREDICTIVE_LATENCY_SLOPE = 4;
const PREDICTIVE_FRAME_AGE_MS = 72;
const PREDICTIVE_QUEUE_DEPTH = 7;

export type RuntimeTickMetrics = {
  measuredFps: number;
  targetFps: number;
  decodeLatencyMs: number;
  velocityAbs: number;
  decodeQueueDepth: number;
  estimatedMemoryMb: number;
  frameDrift: number;
  frameAge: number;
  lastDrawMs: number;
};

type AdaptHooks = {
  presentClock: PresentClock;
  buffer: AdaptiveBufferGovernor;
  capability: CapabilityScore;
  onForceVideo?: () => void;
  onBufferPressure?: () => void;
  onAdaptEvent?: (event: AdaptationEvent) => void;
  onExperienceModeChange?: (mode: ExperienceMode) => void;
  getExperienceMode?: () => ExperienceMode;
};

/**
 * V2.3 orchestration: samples metrics, applies stability rules, delegates adaptation.
 */
export class RuntimeIntelligence {
  private lastSampleAt = 0;
  private lastAdaptAt = 0;
  private unhealthyStreak = 0;
  private healthyStreak = 0;
  private forcedVideo = false;
  private forcedPoster = false;
  private liteScrubApplied = false;
  private pressureApplied = false;
  private decodeLatencyHistory: number[] = [];
  private queueHistory: number[] = [];
  private benchmarkScore = 0;
  private frameDrift = 0;
  private frameAge = 0;

  constructor(private hooks: AdaptHooks) {}

  setBenchmarkScore(score: number) {
    this.benchmarkScore = score;
  }

  getBenchmarkScore() {
    return this.benchmarkScore;
  }

  getFrameDrift() {
    return this.frameDrift;
  }

  getFrameAge() {
    return this.frameAge;
  }

  getDecodeBudgetPct(decodeLatencyMs: number) {
    const targetMs =
      this.hooks.presentClock.getTargetFps() >= 60
        ? 14
        : this.hooks.presentClock.getTargetFps() >= 45
          ? 18
          : 22;
    return Math.min(150, Math.round((decodeLatencyMs / targetMs) * 100));
  }

  getMemoryBudgetPct(estimatedMemoryMb: number) {
    const target = this.hooks.capability.memoryBudgetTargetMb;
    return Math.min(150, Math.round((estimatedMemoryMb / target) * 100));
  }

  getCpuEstimate(lastDrawMs: number, decodeLatencyMs: number) {
    const frameCost = lastDrawMs + decodeLatencyMs * 0.2;
    return Math.min(100, Math.round((frameCost / 16.6) * 100));
  }

  shouldEvaluate(now = performance.now()) {
    return now - this.lastSampleAt >= SAMPLE_INTERVAL_MS;
  }

  tick(metrics: RuntimeTickMetrics, now = performance.now()) {
    this.lastSampleAt = now;
    this.frameDrift = metrics.frameDrift;
    this.frameAge = metrics.frameAge;

    this.decodeLatencyHistory.push(metrics.decodeLatencyMs);
    if (this.decodeLatencyHistory.length > 12) this.decodeLatencyHistory.shift();
    this.queueHistory.push(metrics.decodeQueueDepth);
    if (this.queueHistory.length > 12) this.queueHistory.shift();

    if (now - this.lastAdaptAt < MIN_DWELL_MS) {
      this.observeBuffer(metrics);
      return;
    }

    const predictive = this.predictivePressure(metrics);
    const bad =
      metrics.measuredFps < metrics.targetFps * 0.55 ||
      metrics.decodeLatencyMs > 40 ||
      predictive;

    if (bad) {
      this.unhealthyStreak += 1;
      this.healthyStreak = 0;
    } else {
      this.healthyStreak += 1;
      this.unhealthyStreak = 0;
    }

    this.observeBuffer(metrics);

    if (predictive && this.unhealthyStreak >= 1) {
      this.applyPredictiveDowngrade(now);
    }

    if (this.unhealthyStreak >= 2) {
      this.stepPresentationDown(now);
    } else if (this.healthyStreak >= 3 && !predictive) {
      this.stepPresentationUp(now);
    }

    if (this.unhealthyStreak >= 4 && !this.liteScrubApplied) {
      this.liteScrubApplied = true;
      this.emit({
        type: "experience-mode",
        detail: "lite-scrub",
        at: now,
      });
      this.hooks.onExperienceModeChange?.("lite-scrub");
      this.hooks.presentClock.setTargetFps(
        Math.min(30, this.hooks.presentClock.getTargetFps()),
      );
      this.lastAdaptAt = now;
    }

    if (this.unhealthyStreak >= 5 && !this.forcedVideo) {
      this.forcedVideo = true;
      this.emit({
        type: "experience-mode",
        detail: "playback",
        at: now,
      });
      this.hooks.onExperienceModeChange?.("playback");
      this.hooks.onForceVideo?.();
      this.lastAdaptAt = now;
    }

    if (this.unhealthyStreak >= 7 && !this.forcedPoster) {
      this.forcedPoster = true;
      this.emit({
        type: "experience-mode",
        detail: "poster",
        at: now,
      });
      this.hooks.onExperienceModeChange?.("poster");
      this.lastAdaptAt = now;
    }

    if (this.unhealthyStreak >= 3 && !this.pressureApplied && !this.forcedVideo) {
      this.pressureApplied = true;
      this.emit({
        type: "buffer-pressure",
        detail: "relieve-budget",
        at: now,
      });
      this.hooks.onBufferPressure?.();
      this.lastAdaptAt = now;
    }

    const memPct = this.getMemoryBudgetPct(metrics.estimatedMemoryMb);
    if (memPct > 100 && !this.pressureApplied) {
      this.pressureApplied = true;
      this.emit({
        type: "buffer-pressure",
        detail: "memory-over-budget",
        at: now,
      });
      this.hooks.onBufferPressure?.();
      this.lastAdaptAt = now;
    }
  }

  private observeBuffer(metrics: RuntimeTickMetrics) {
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
  }

  private predictivePressure(metrics: RuntimeTickMetrics): boolean {
    const slope = this.latencySlope();
    const queueGrowth =
      this.queueHistory.length >= 4 &&
      this.queueHistory[this.queueHistory.length - 1]! >
        (this.queueHistory[0] ?? 0) + 2;
    return (
      slope > PREDICTIVE_LATENCY_SLOPE ||
      metrics.frameAge > PREDICTIVE_FRAME_AGE_MS ||
      Math.abs(metrics.frameDrift) > 3 ||
      metrics.decodeQueueDepth > PREDICTIVE_QUEUE_DEPTH ||
      queueGrowth
    );
  }

  private latencySlope() {
    if (this.decodeLatencyHistory.length < 4) return 0;
    const first = this.decodeLatencyHistory[0] ?? 0;
    const last =
      this.decodeLatencyHistory[this.decodeLatencyHistory.length - 1] ?? 0;
    return last - first;
  }

  private applyPredictiveDowngrade(now: number) {
    const fpsBefore = this.hooks.presentClock.getTargetFps();
    this.hooks.presentClock.stepDown();
    const fpsAfter = this.hooks.presentClock.getTargetFps();
    if (fpsAfter !== fpsBefore) {
      this.emit({
        type: "predictive-downgrade",
        detail: `present ${fpsBefore}→${fpsAfter}`,
        at: now,
      });
      this.lastAdaptAt = now;
    }
  }

  private stepPresentationDown(now: number) {
    const fpsBefore = this.hooks.presentClock.getTargetFps();
    this.hooks.presentClock.stepDown();
    const fpsAfter = this.hooks.presentClock.getTargetFps();
    if (fpsAfter !== fpsBefore) {
      this.emit({
        type: "fps-step",
        detail: `${fpsBefore}→${fpsAfter}`,
        at: now,
      });
      this.lastAdaptAt = now;
    }
  }

  private stepPresentationUp(now: number) {
    const fpsBefore = this.hooks.presentClock.getTargetFps();
    this.hooks.presentClock.stepUp();
    const fpsAfter = this.hooks.presentClock.getTargetFps();
    if (fpsAfter !== fpsBefore) {
      this.emit({
        type: "fps-step",
        detail: `${fpsBefore}→${fpsAfter}`,
        at: now,
      });
      this.lastAdaptAt = now;
    }
  }

  private emit(event: AdaptationEvent) {
    this.hooks.onAdaptEvent?.(event);
  }
}

export function presentationRateFromFps(fps: number): PresentationRate {
  const allowed: PresentationRate[] = [60, 45, 30, 20];
  return allowed.reduce((best, v) =>
    Math.abs(v - fps) < Math.abs(best - fps) ? v : best,
  );
}
