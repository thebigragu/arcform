export type {
  DeviceClass,
  EngineStats,
  MediaEngineOptions,
  MediaManifestV1,
  RendererId,
  SequenceTier,
  TierId,
} from "./types";

export { MediaEngine } from "./MediaEngine";
export {
  HERO_MEDIA_ID,
  HERO_MANIFEST_URL,
  HERO_POSTER_FALLBACK,
  loadManifest,
  manifestUrlForMediaId,
  expandFrameUrl,
} from "./MediaManifest";
export {
  readTierOverride,
  type TierOverrideId,
} from "./MediaTierOverride";
export {
  RUNTIME_DECODED_CACHE_MAX,
  runtimeDecodedCacheMax,
} from "./MediaTierLimits";
export {
  readReadinessGateFlag,
  readReadinessTarget,
  readMediaDebugFlag,
  READINESS_GATE_BY_TIER,
  READINESS_GATE_DEFAULT_ENABLED,
  PRODUCTION_READINESS_TARGET,
  PRODUCTION_READINESS_TARGET_BY_TIER,
  VALID_READINESS_TARGETS,
  buildReadinessFetchOrder,
  buildAnchorIndexes,
  evaluateThresholdPredicate,
  minUniqueFramesForTarget,
  uniqueFramesRemaining,
} from "./MediaReadinessGate";
export {
  lockDocumentScroll,
  unlockDocumentScroll,
  getScrollLockTelemetry,
  subscribeScrollLock,
} from "./MediaScrollLock";
export { coldStartTelemetry } from "./ColdStartTelemetry";
export {
  selectTier,
  resolveCommittedTier,
  DESKTOP_LITE_MAX_MEMORY_GB,
  DESKTOP_LITE_MAX_LOGICAL_CORES,
  DESKTOP_LITE_FALLBACK_MAX_CORES_WHEN_MEM_UNKNOWN,
  type PolicyInput,
  type CommittedTier,
} from "./MediaPolicy";
export { MediaDebugOverlay } from "./MediaDebugOverlay";
