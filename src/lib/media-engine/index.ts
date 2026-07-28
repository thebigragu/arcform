export type {
  AdaptationEvent,
  AdaptationEventType,
  BenchmarkResult,
  CapabilityScore,
  DeviceCapabilityBand,
  DeviceClass,
  EngineStats,
  MediaEngineOptions,
  MediaLadderManifest,
  PresentationRate,
  PredictHint,
  QualityTierId,
  RendererId,
  RendererPreference,
} from "./types";

export { MediaEngine } from "./MediaEngine";
export { scoreCapabilities } from "./adapt/CapabilityScorer";
export { ScrollSynchronizer } from "./scroll/ScrollSynchronizer";
export { createGsapScrollAdapterStub } from "./scroll/GsapScrollAdapter";
export type { MediaRenderer } from "./ports/MediaRenderer";
export type { DemuxerPort } from "./ports/DemuxerPort";
export type { ScrollSource } from "./ports/ScrollSource";
