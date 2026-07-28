import type { PredictHint, RendererStats } from "../types";

export type RendererContext = {
  canvas: HTMLCanvasElement;
  src: string;
  blobUrl?: string;
  arrayBuffer?: ArrayBuffer;
  /** Use Mediabunny UrlSource when no arrayBuffer (Future progressive path). */
  progressive?: boolean;
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  bufferBudgetFrames: number;
  presentFps: number;
  maxDpr: number;
  onDecodeError?: (error: Error) => void;
  /** ADR-024: mount point for visible playback video. */
  playbackMount?: HTMLElement | null;
};

/**
 * Identical contract for every renderer plugin.
 * The application never branches on renderer id except for debug UI.
 */
export interface MediaRenderer {
  readonly id: string;
  init(ctx: RendererContext): Promise<void>;
  setTargetFrame(index: number, hint: PredictHint): void;
  present(canvas: HTMLCanvasElement | OffscreenCanvas): boolean;
  getStats(): RendererStats;
  resize?(cssWidth: number, cssHeight: number, dpr: number): void;
  dispose(): void;
}
