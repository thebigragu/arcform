/** Media Engine v2 — shared types (no Next.js / React imports). */

export type RendererId = "webcodecs" | "html-video" | "poster";

export type RendererPreference = "auto" | RendererId;

export type DeviceClass = "desktop" | "mobile";

export type QualityTierId = "d2560" | "d1920" | "m1440" | "m1080" | "m900";

export type PredictHint = {
  velocity: number;
  acceleration: number;
  direction: -1 | 0 | 1;
  predictedIndices: number[];
};

export type AdaptationEventType =
  | "fps-step"
  | "buffer-step"
  | "buffer-pressure"
  | "renderer-fallback";

export type AdaptationEvent = {
  type: AdaptationEventType;
  detail?: string;
  at: number;
};

export type RendererStats = {
  cacheSize: number;
  cacheHits: number;
  cacheMisses: number;
  decodeLatencyMs: number;
  lastDrawMs: number;
  estimatedMemoryMb: number;
  /** Pending serial decode tasks (WebCodecs). */
  decodeQueueDepth: number;
};

export type EngineStats = {
  renderer: RendererId;
  tierId: string | null;
  frameIndex: number;
  frameCount: number;
  progress: number;
  presentFps: number;
  droppedPresents: number;
  bufferBudgetFrames: number;
  width: number;
  height: number;
  initMs: number;
  fallbackCount: number;
  worstFrameMs: number;
  frameTimeVariance: number;
  adaptationEvents: AdaptationEvent[];
} & RendererStats;

export type CapabilityScore = {
  score: number;
  preferWebCodecs: boolean;
  hasVideoDecoder: boolean;
  hasOffscreenCanvas: boolean;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number;
  devicePixelRatio: number;
  coarsePointer: boolean;
  prefersReducedMotion: boolean;
  saveData: boolean;
  priorWebCodecsFailure: boolean;
  recommendedTier: QualityTierId[];
  initialPresentFps: number;
  /** Soft target for decoded VideoFrame count. */
  initialBufferBudgetFrames: number;
  maxDpr: number;
};

export type LadderTier = {
  id: string;
  device: DeviceClass;
  maxWidth: number;
  src: string;
  poster: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  frameCount: number;
  bytes: number;
};

export type MediaLadderManifest = {
  version: number;
  fpsSource: number;
  gop: number;
  crf: number;
  codec: string;
  tiers: LadderTier[];
};

export type EncodedSample = {
  data: Uint8Array;
  timestamp: number;
  duration: number;
  isKey: boolean;
};

export type DemuxResult = {
  samples: EncodedSample[];
  config: VideoDecoderConfig;
  meta: {
    frameCount: number;
    width: number;
    height: number;
    durationSec: number;
    fps: number;
  };
};

export type MediaEngineOptions = {
  canvas: HTMLCanvasElement;
  deviceClass: DeviceClass;
  ladderUrl?: string;
  /** Force a single source (skips ladder). */
  src?: string;
  poster?: string;
  /**
   * Prefer these ladder tier ids (in order) over capability recommendations.
   * Example: mobile site lock `["m900"]`.
   */
  preferredTiers?: QualityTierId[];
  /** Override initial present FPS (timeline assets stay 60fps). */
  presentFps?: number;
  /** Cap adaptive present FPS (e.g. 30 so adapt never ramps to 60). */
  maxPresentFps?: number;
  renderer?: RendererPreference;
  reducedMotion?: boolean;
  analytics?: boolean;
  /**
   * Future: Mediabunny UrlSource progressive demux (skip full-file buffer).
   * Default off — promote only if Slow 4G TTI ≥30% vs full-buffer.
   */
  progressive?: boolean;
  initTimeoutMs?: number;
  onProgress?: (p: number) => void;
  onReady?: () => void;
  onFatal?: (error: Error) => void;
  onStats?: (stats: EngineStats) => void;
  onRendererChange?: (id: RendererId) => void;
};
