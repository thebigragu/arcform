/** Media Engine v2 — shared types (no Next.js / React imports). */

export type RendererId = "webcodecs" | "html-video" | "playback" | "poster";

export type RendererPreference = "auto" | RendererId;

export type DeviceClass = "desktop" | "mobile";

export type DeviceCapabilityBand =
  | "ultra"
  | "high"
  | "medium"
  | "low"
  | "minimal";

export type PresentationRate = 60 | 45 | 30 | 20;

export type QualityTierId =
  | "d1440"
  | "d1080"
  | "d1280"
  | "d720"
  | "m900"
  | "m720"
  | "m540";

export type ExperienceMode =
  | "full-scrub"
  | "lite-scrub"
  | "playback"
  | "poster";

export type MediaAssetIntent = "scrub" | "playback" | "poster";

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
  | "renderer-fallback"
  | "renderer-pick"
  | "tier-boot"
  | "predictive-downgrade"
  | "experience-mode";

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
  experienceMode: ExperienceMode;
  tierId: string | null;
  deviceBand: DeviceCapabilityBand;
  targetPresentHz: PresentationRate;
  benchmarkScore: number;
  decodeBudgetPct: number;
  memoryBudgetPct: number;
  frameDrift: number;
  frameAge: number;
  cpuEstimate: number;
  networkEstimate: string | null;
  frameIndex: number;
  frameCount: number;
  progress: number;
  presentFps: number;
  droppedPresents: number;
  bufferBudgetFrames: number;
  width: number;
  height: number;
  initMs: number;
  ttfpMs: number | null;
  ttfvfMs: number | null;
  fallbackCount: number;
  worstFrameMs: number;
  frameTimeVariance: number;
  adaptationEvents: AdaptationEvent[];
} & RendererStats;

export type NetworkSignals = {
  effectiveType: string | null;
  downlinkMbps: number | null;
  saveData: boolean;
  estimateScore: number;
};

export type BatterySignals = {
  level: number | null;
  charging: boolean | null;
  lowPower: boolean;
};

export type CapabilityScore = {
  score: number;
  band: DeviceCapabilityBand;
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
  network: NetworkSignals;
  battery: BatterySignals;
  recommendedTier: QualityTierId[];
  initialPresentFps: number;
  /** Soft target for decoded VideoFrame count. */
  initialBufferBudgetFrames: number;
  /** Target decode cache MB for budget %. */
  memoryBudgetTargetMb: number;
  maxDpr: number;
};

export type BenchmarkResult = {
  medianDecodeMs: number;
  medianDrawMs: number;
  medianVideoSeekMs: number;
  sustainable: boolean;
  score: number;
  recommendedRenderer: RendererId;
  recommendedTierHint: QualityTierId | null;
  initialPresentHz: PresentationRate;
  durationMs: number;
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
  crf?: number;
  codec: string;
  tiers: LadderTier[];
};

export type MediaAsset = {
  id: string;
  intent: MediaAssetIntent;
  device?: DeviceClass;
  tierId?: string | null;
  maxWidth?: number;
  src: string;
  poster?: string;
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  frameCount?: number;
  bytes?: number;
  bitrate?: number;
  codec?: string;
  gop?: number;
  crf?: number;
  contentHash?: string;
  recommendedBands?: DeviceCapabilityBand[];
  safeDefaultTier?: string;
  fallbackAssetId?: string;
};

export type MediaManifestDefaults = {
  safeDefaultTier: { desktop: QualityTierId; mobile: QualityTierId };
  poster: { desktop: string; mobile: string };
  playback: { desktop: string; mobile: string };
  ladderUrl: string;
  /** Optional — only when legacy ladder sync is enabled. */
  legacyLadderUrl?: string;
};

export type MediaManifestV4 = {
  version: 4;
  mediaId: string;
  createdAt: string;
  fpsSource: number;
  gop: number;
  codec: string;
  sources?: Record<string, unknown>;
  defaults: MediaManifestDefaults;
  assets: MediaAsset[];
};

/** Normalized manifest consumed by runtime (v3 ladder or v4 assets). */
export type UnifiedMediaManifest = {
  version: number;
  mediaId?: string;
  fpsSource: number;
  gop: number;
  codec: string;
  tiers: LadderTier[];
  defaults?: MediaManifestDefaults;
  assets: MediaAsset[];
  manifestUrl: string;
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
  /** V4 hashed manifest under /videos/media/{id}/manifest.json */
  mediaId?: string;
  ladderUrl?: string;
  /** Force a single source (skips ladder). */
  src?: string;
  poster?: string;
  renderer?: RendererPreference;
  reducedMotion?: boolean;
  /** Dev/cert: skip benchmark selection and force experience mode. */
  forceExperienceMode?: ExperienceMode;
  analytics?: boolean;
  /**
   * Future: Mediabunny UrlSource progressive demux (skip full-file buffer).
   * Default off — promote only if Slow 4G TTI ≥30% vs full-buffer.
   */
  progressive?: boolean;
  initTimeoutMs?: number;
  /** Shell-provided navigation start for TTFP/TTFVF scorecard. */
  navigationStart?: number;
  /** Visible playback surface for playback experience mode (ADR-024). */
  playbackMount?: HTMLElement | null;
  onProgress?: (p: number) => void;
  onReady?: () => void;
  onFatal?: (error: Error) => void;
  onStats?: (stats: EngineStats) => void;
  onRendererChange?: (id: RendererId) => void;
  onExperienceModeChange?: (mode: ExperienceMode) => void;
};
