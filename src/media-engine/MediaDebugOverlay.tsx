"use client";

import type { EngineStats } from "./types";

function ms(a: number | null, b: number | null) {
  if (a == null || b == null) return "—";
  return `${Math.round(b - a)}`;
}

export function MediaDebugOverlay({
  stats,
  visible,
}: {
  stats: EngineStats | null;
  visible: boolean;
}) {
  if (!visible || !stats) return null;

  return (
    <div
      className="pointer-events-none absolute left-2 top-2 z-[60] max-w-[min(100%,36rem)] rounded bg-black/75 p-2 font-mono text-[10px] leading-relaxed text-[#c4a574]"
      aria-hidden
      data-media-debug-json={JSON.stringify(stats)}
    >
      <div>
        form: {stats.formFactor} · policy {stats.policyTier ?? "—"} · override{" "}
        {stats.overrideTier ?? "—"} · committed {stats.committedTier ?? "—"}
      </div>
      <div>
        override {stats.overrideAccepted ? "accepted" : "ignored"}
        {stats.overrideIgnoreReason
          ? ` (${stats.overrideIgnoreReason})`
          : ""}
      </div>
      <div>policyReason: {stats.policyReason ?? "—"}</div>
      <div>committedReason: {stats.committedReason ?? "—"}</div>
      <div>
        viewport {Math.round(stats.viewportCssWidth)}×
        {Math.round(stats.viewportCssHeight)} area{" "}
        {Math.round(stats.viewportCssPixelArea)} · backing{" "}
        {stats.canvasBackingWidth}×{stats.canvasBackingHeight} area{" "}
        {Math.round(stats.canvasBackingPixelArea)}
      </div>
      <div>
        dpr req {stats.dprRequested.toFixed(2)} applied {stats.dprApplied.toFixed(2)}{" "}
        · mem {stats.deviceMemoryGb ?? "—"}GB · cores{" "}
        {stats.hardwareConcurrency ?? "—"}
      </div>
      <div>
        saveData {stats.saveData ? "yes" : "no"} · reducedMotion{" "}
        {stats.reducedMotion ? "yes" : "no"}
      </div>
      <div>
        pipe raw {stats.rawScrollProgress?.toFixed(3) ?? "—"} · frame{" "}
        {stats.frameProgress?.toFixed(3) ?? "—"} · eng{" "}
        {stats.lastEngineProgress?.toFixed(3) ?? "—"}
      </div>
      <div>
        tgt {stats.targetFrame} · selected {stats.selectedCacheFrame ?? "—"} ·
        actualBmp {stats.actualBitmapFrame ?? "—"} · drawn{" "}
        {stats.drawnFrame ?? "—"}
      </div>
      <div>
        readinessGate {stats.readinessGateEnabled ? "yes" : "no"}
        {stats.readinessGateIgnoreReason
          ? ` (ignored: ${stats.readinessGateIgnoreReason})`
          : ""}
      </div>
      {stats.readinessGateEnabled ? (
        <div>
          ready tier {stats.readinessTier ?? "—"} · target{" "}
          {stats.readinessTarget ?? "timeout"}% · frames{" "}
          {stats.readinessFramesCompleted}/{stats.readinessTotalFrames} (
          {Math.round(stats.readinessPercentage * 100)}%) · remain{" "}
          {stats.readinessFramesRemaining} · reason{" "}
          {stats.readinessReleaseReason}
        </div>
      ) : null}
      {stats.readinessGateEnabled ? (
        <div>
          neigh {stats.readinessOpeningNeighbourhoodComplete ? "yes" : "no"} ·
          anchors {(stats.readinessTimelineCoverage * 100).toFixed(0)}% · bytes{" "}
          {Math.round(stats.readinessCompletedBytePercentage * 100)}% ·
          inFlight {stats.readinessFramesInFlight} · req{" "}
          {stats.readinessFramesRequested} · atRelease remain{" "}
          {stats.readinessFramesRemainingAtRelease ?? "—"}f/
          {stats.readinessBytesRemainingAtRelease ?? "—"}B
        </div>
      ) : null}
      {stats.readinessGateEnabled ? (
        <div>
          thresh@{stats.readinessThresholdReachedAt?.toFixed(0) ?? "—"} · fade@
          {stats.readinessLoaderFadeStartAt?.toFixed(0) ?? "—"} · bgAfter{" "}
          {stats.readinessBackgroundCompletionsAfterRelease} · postPri{" "}
          {stats.readinessPostReleasePriorityFetches} · postHit{" "}
          {stats.readinessPostReleaseMissingFrameCacheHits} · visible{" "}
          {stats.readinessLoaderVisibleMs?.toFixed(0) ?? "—"}ms
        </div>
      ) : null}
      {stats.readinessGateEnabled && stats.readinessTargetIgnoreReason ? (
        <div>target ignored: {stats.readinessTargetIgnoreReason}</div>
      ) : null}
      {stats.readinessGateEnabled ? (
        <div>
          pred block {stats.readinessPredBlockingReason ?? "none"} · f0{" "}
          {stats.readinessPredFrame0Fetched ? "fetch" : "—"}/
          {stats.readinessPredFrame0Decoded ? "dec" : "—"} · draw{" "}
          {stats.readinessPredFirstCanvasDraw ? "yes" : "no"} · minVis{" "}
          {stats.readinessPredMinVisibleMet ? "yes" : "no"} · claimed{" "}
          {stats.readinessPredThresholdRequested ? "yes" : "no"} · timeout{" "}
          {stats.readinessPredTimeoutFired ? "yes" : "no"}
        </div>
      ) : null}
      {stats.readinessGateEnabled ? (
        <div>
          ready bytes {stats.readinessCompressedBytes}/
          {stats.readinessEstimatedTierBytes} · fail{" "}
          {stats.readinessFramesFailed} · dedupe {stats.readinessDedupePrevented}
        </div>
      ) : null}
      {stats.readinessGateEnabled ? (
        <div>
          postRelease tgtLat [
          {stats.postReleaseLatencySamples.join(",") || "—"}]
        </div>
      ) : null}
      {stats.readinessGateEnabled ? (
        <div>
          scrollLock {stats.scrollLockActive ? "yes" : "no"} · startY{" "}
          {stats.scrollLockAtGateStart ?? "—"} · intended{" "}
          {stats.scrollLockIntended ?? "—"} · maxDev{" "}
          {stats.scrollLockMaxDeviation} · releaseY{" "}
          {stats.scrollLockAtRelease ?? "—"}
        </div>
      ) : null}
      {stats.readinessGateEnabled ? (
        <div>
          blocked wheel {stats.scrollLockWheelBlocked} touch{" "}
          {stats.scrollLockTouchBlocked} key {stats.scrollLockKeyboardBlocked} ·
          unlock {stats.scrollLockUnlockReason ?? "—"} · cleanup{" "}
          {stats.scrollLockCleanupCompleted ? "yes" : "no"} · freshTop{" "}
          {stats.scrollLockFreshTopEntry ? "yes" : "no"} · histPreserve{" "}
          {stats.scrollLockHistoryPreserve ? "yes" : "no"}
        </div>
      ) : null}
      <div>
        phase {stats.bootstrapPhase} · prefetch {stats.prefetchPhase} · idleWarm{" "}
        {stats.idleAnchorWarmingActive ? "yes" : "no"} · interacted{" "}
        {stats.hasInteracted ? "yes" : "no"}
      </div>
      <div>
        poster vis {stats.posterVisible ? "yes" : "no"} z{stats.posterZIndex}{" "}
        · canvas z{stats.canvasZIndex} · firstDraw{" "}
        {stats.firstSuccessfulDrawFrame ?? "—"}
      </div>
      <div>
        poster hint {(stats.posterHintUrl || "—").replace(/.*\//, "")} · runtime{" "}
        {(stats.posterRuntimeUrl || "—").replace(/.*\//, "")} · match{" "}
        {stats.posterUrlMatch == null
          ? "—"
          : stats.posterUrlMatch
            ? "yes"
            : "no"}
      </div>
      <div>
        f0 hint {stats.frame0HintUrl ?? "none"} · runtime{" "}
        {(stats.frame0RuntimeUrl || "—").replace(/.*\//, "")} · match{" "}
        {stats.frame0UrlMatch == null
          ? "—"
          : stats.frame0UrlMatch
            ? "yes"
            : "no"}
      </div>
      <div>
        cold manifest {ms(stats.manifestRequestStart, stats.manifestRequestEnd)}
        ms · poster {ms(stats.posterRequestStart, stats.posterRequestEnd)}ms ·
        f0 net {ms(stats.frame0RequestStart, stats.frame0RequestEnd)}ms · f0 dec{" "}
        {ms(stats.frame0DecodeStart, stats.frame0DecodeEnd)}ms
      </div>
      <div>
        firstDraw +{stats.firstCanvasDrawAt != null && stats.tierCommittedAt != null
          ? Math.round(stats.firstCanvasDrawAt - stats.tierCommittedAt)
          : "—"}
        ms · posterHidden +{stats.posterHiddenAt != null && stats.tierCommittedAt != null
          ? Math.round(stats.posterHiddenAt - stats.tierCommittedAt)
          : "—"}
        ms · lat {stats.targetToDisplayMs?.toFixed(0) ?? "—"}ms
      </div>
      <div>
        startup net {stats.startupNetworkRequests} · dec {stats.startupDecodes}{" "}
        · dedupe {stats.startupDedupePrevented}
      </div>
      <div>
        decode cache {stats.decodedCacheCount}/{stats.decodedCacheMax} [
        {stats.cachedFrameIndexes.join(",") || "—"}] · mem{" "}
        {stats.estimatedDecodedMemoryMb.toFixed(1)}MB
      </div>
      <div>
        ensure {stats.ensureRequested} · start {stats.fetchStarted} · dec done{" "}
        {stats.decodeCompleted} · stale {stats.decodeDiscardedStale} · failDec{" "}
        {stats.decodeFailures}
      </div>
      <div>
        draw {stats.drawCalls} · distinct {stats.distinctFramesDrawn} · gen{" "}
        {stats.schedulerGenerations}
      </div>
      {stats.invariantWarnings.length > 0 ? (
        <div className="text-red-300">
          ⚠ {stats.invariantWarnings.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}
