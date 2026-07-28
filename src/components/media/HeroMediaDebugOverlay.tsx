"use client";

import type { EngineStats, RendererId } from "@/lib/media-engine";

export function HeroMediaDebugOverlay({
  stats,
  visible,
}: {
  stats: EngineStats | null;
  visible: boolean;
}) {
  if (!visible || !stats) return null;

  const lastEvents = stats.adaptationEvents.slice(-3);
  const eventSummary =
    lastEvents.length === 0
      ? "—"
      : lastEvents.map((e) => e.type.replace(/-/g, "")).join(",");

  return (
    <div
      className="pointer-events-none absolute left-2 top-2 z-[60] max-w-[min(100%,20rem)] rounded bg-black/70 p-2 font-mono text-[10px] leading-relaxed text-[#c4a574]"
      aria-hidden
    >
      <div>renderer: {stats.renderer as RendererId}</div>
      <div>tier: {stats.tierId ?? "—"}</div>
      <div>
        frame: {stats.frameIndex}/{Math.max(0, stats.frameCount - 1)}
      </div>
      <div>progress: {(stats.progress * 100).toFixed(1)}%</div>
      <div>
        fps: {stats.presentFps.toFixed(1)} (drops {stats.droppedPresents})
      </div>
      <div>
        cache: {stats.cacheSize}/{stats.bufferBudgetFrames} hit{" "}
        {stats.cacheHits} miss {stats.cacheMisses}
      </div>
      <div>
        decode: {stats.decodeLatencyMs.toFixed(1)}ms draw{" "}
        {stats.lastDrawMs.toFixed(1)}ms q {stats.decodeQueueDepth}
      </div>
      <div>
        worst {stats.worstFrameMs.toFixed(1)}ms · var{" "}
        {stats.frameTimeVariance.toFixed(1)}
      </div>
      <div>
        mem ~{stats.estimatedMemoryMb.toFixed(1)}MB · init {stats.initMs.toFixed(0)}
        ms · fb {stats.fallbackCount}
      </div>
      <div>adapt: {eventSummary}</div>
      <div>
        {stats.width}×{stats.height}
      </div>
    </div>
  );
}
