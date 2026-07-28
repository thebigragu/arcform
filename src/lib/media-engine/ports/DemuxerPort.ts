import type { DemuxResult } from "../types";

/** Swap Mediabunny without touching renderers. */
export interface DemuxerPort {
  index(buffer: ArrayBuffer): Promise<DemuxResult>;
  /** Progressive / range demux (UrlSource). Optional — full-buffer remains default. */
  indexUrl?(url: string): Promise<DemuxResult>;
}
