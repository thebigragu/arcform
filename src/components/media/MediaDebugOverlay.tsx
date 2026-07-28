"use client";

import type { EngineStats, RendererId } from "@/lib/media-engine";

export function MediaDebugOverlay({
  stats,
  visible,
}: {
  stats: EngineStats | null;
  visible: boolean;
}) {
  if (!visible || !stats) return null;

  const lastEvents = stats.adaptationEvents.slice(-4);
  const eventSummary =
    lastEvents.length === 0
      ? "—"
      : lastEvents.map((e) => e.type.replace(/-/g, "")).join(",");

  return (
    <div
      className="pointer-events-none absolute left-2 top-2 z-[60] max-w-[min(100%,22rem)] rounded bg-black/70 p-2 font-mono text-[10px] leading-relaxed text-[#c4a574]"
      aria-hidden
      data-media-debug-json={JSON.stringify(stats)}
    >
      <div>
        band: {stats.deviceBand} · bench {stats.benchmarkScore}
      </div>
      <div>
        mode: {stats.experienceMode} · renderer: {stats.renderer as RendererId}
      </div>
      <div>
        tier: {stats.tierId ?? "—"} · target {stats.targetPresentHz}Hz
      </div>
      <div>
        frame: {stats.frameIndex}/{Math.max(0, stats.frameCount - 1)} · drift{" "}
        {stats.frameDrift.toFixed(0)} · age {stats.frameAge.toFixed(0)}ms
      </div>
      <div>progress: {(stats.progress * 100).toFixed(1)}%</div>
      <div>
        fps: {stats.presentFps.toFixed(1)} (drops {stats.droppedPresents})
      </div>
      <div>
        budget: decode {stats.decodeBudgetPct}% · mem {stats.memoryBudgetPct}%
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
        {stats.frameTimeVariance.toFixed(1)} · cpu ~{stats.cpuEstimate}%
      </div>
      <div>
        net: {stats.networkEstimate ?? "—"} · init {stats.initMs.toFixed(0)}ms
        {stats.ttfvfMs != null ? ` · ttfvf ${stats.ttfvfMs.toFixed(0)}ms` : ""}
        {" · fb "}
        {stats.fallbackCount}
      </div>
      <div>adapt: {eventSummary}</div>
      <div>
        {stats.width}×{stats.height}
      </div>
    </div>
  );
}
