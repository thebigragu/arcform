import type {
  BenchmarkResult,
  CapabilityScore,
  DemuxResult,
  PresentationRate,
  QualityTierId,
  RendererId,
} from "../types";

const BENCH_BUDGET_MS = 300;
const TARGET_DECODE_MS = 16;

function median(values: number[]) {
  if (values.length === 0) return 999;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 999;
}

function decodeOne(
  config: VideoDecoderConfig,
  sample: DemuxResult["samples"][number],
): Promise<VideoFrame | null> {
  return new Promise((resolve, reject) => {
    let out: VideoFrame | null = null;
    const decoder = new VideoDecoder({
      output: (frame) => {
        out = frame;
      },
      error: (e) => reject(e),
    });
    decoder.configure(config);
    decoder.decode(
      new EncodedVideoChunk({
        type: sample.isKey ? "key" : "delta",
        timestamp: sample.timestamp,
        duration: sample.duration,
        data: sample.data,
      }),
    );
    void decoder
      .flush()
      .then(() => {
        decoder.close();
        resolve(out);
      })
      .catch((e) => {
        try {
          decoder.close();
        } catch {
          /* */
        }
        reject(e);
      });
  });
}

async function probeWebCodecs(
  demux: DemuxResult,
  canvas: HTMLCanvasElement,
  sampleCount: number,
  deadline: number,
): Promise<{ medianDecodeMs: number; medianDrawMs: number }> {
  if (typeof VideoDecoder === "undefined") {
    return { medianDecodeMs: 999, medianDrawMs: 999 };
  }

  const support = await VideoDecoder.isConfigSupported(demux.config);
  if (!support.supported) {
    return { medianDecodeMs: 999, medianDrawMs: 999 };
  }

  const decodeTimes: number[] = [];
  const drawTimes: number[] = [];
  const ctx = canvas.getContext("2d");
  const n = Math.min(sampleCount, demux.samples.length);
  const step = Math.max(1, Math.floor(demux.samples.length / n));

  for (let i = 0; i < n; i++) {
    if (performance.now() > deadline) break;
    const sample = demux.samples[Math.min(i * step, demux.samples.length - 1)];
    if (!sample) continue;

    const t0 = performance.now();
    const frame = await decodeOne(demux.config, sample);
    decodeTimes.push(performance.now() - t0);

    if (ctx && frame) {
      const t1 = performance.now();
      ctx.drawImage(
        frame,
        0,
        0,
        Math.min(128, canvas.width),
        Math.min(128, canvas.height),
      );
      drawTimes.push(performance.now() - t1);
      frame.close();
    } else {
      frame?.close();
    }
  }

  return {
    medianDecodeMs: median(decodeTimes),
    medianDrawMs: median(drawTimes),
  };
}

async function probeHtmlVideo(
  blobUrl: string,
  canvas: HTMLCanvasElement,
  deadline: number,
): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = blobUrl;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    const fail = () => {
      cleanup();
      resolve(999);
    };

    video.addEventListener("error", fail, { once: true });

    video.addEventListener(
      "loadeddata",
      () => {
        if (performance.now() > deadline) {
          fail();
          return;
        }
        const t0 = performance.now();
        video.currentTime = Math.min(0.1, (video.duration || 1) * 0.05);
        video.addEventListener(
          "seeked",
          () => {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(
                video,
                0,
                0,
                Math.min(128, canvas.width),
                Math.min(128, canvas.height),
              );
            }
            const ms = performance.now() - t0;
            cleanup();
            resolve(ms);
          },
          { once: true },
        );
      },
      { once: true },
    );
  });
}

function scoreFromMetrics(
  medianDecodeMs: number,
  medianDrawMs: number,
  medianVideoSeekMs: number,
): number {
  const decodeScore = Math.max(0, 100 - (medianDecodeMs / TARGET_DECODE_MS) * 40);
  const drawScore = Math.max(0, 100 - medianDrawMs * 4);
  const videoScore = Math.max(0, 100 - medianVideoSeekMs * 0.15);
  return Math.round((decodeScore + drawScore + videoScore) / 3);
}

function pickRenderer(
  wcDecodeMs: number,
  wcDrawMs: number,
  videoSeekMs: number,
  capability: CapabilityScore,
): RendererId {
  if (!capability.hasVideoDecoder || capability.band === "minimal") {
    return videoSeekMs < 900 ? "html-video" : "poster";
  }

  const wcTotal = wcDecodeMs + wcDrawMs;
  const videoTotal = videoSeekMs;

  if (wcTotal >= 900 && videoTotal >= 900) return "html-video";
  if (videoTotal < wcTotal * 0.85) return "html-video";
  if (wcTotal < 28 && wcDecodeMs < 22) return "webcodecs";
  if (wcTotal <= videoTotal) return "webcodecs";
  return "html-video";
}

function pickTierHint(
  capability: CapabilityScore,
  sustainable: boolean,
): QualityTierId | null {
  if (!sustainable && capability.band !== "ultra" && capability.band !== "high") {
    const tiers = capability.recommendedTier;
    return tiers[tiers.length - 1] ?? null;
  }
  return capability.recommendedTier[0] ?? null;
}

function pickPresentHz(
  capability: CapabilityScore,
  sustainable: boolean,
): PresentationRate {
  if (!sustainable) {
    if (capability.band === "minimal") return 20;
    if (capability.band === "low") return 30;
    return capability.initialPresentFps <= 30
      ? 30
      : 45;
  }
  return capability.initialPresentFps as PresentationRate;
}

/**
 * Lightweight startup benchmark (150–300ms budget).
 * Compares WebCodecs vs html-video; seeds renderer and tier hints.
 */
export async function runRuntimeBenchmark(
  demux: DemuxResult,
  canvas: HTMLCanvasElement,
  capability: CapabilityScore,
  blobUrl?: string | null,
  sampleCount = 6,
): Promise<BenchmarkResult> {
  const t0 = performance.now();
  const deadline = t0 + BENCH_BUDGET_MS;

  const wc = await probeWebCodecs(demux, canvas, sampleCount, deadline);
  let videoSeekMs = 999;
  if (blobUrl && performance.now() < deadline) {
    videoSeekMs = await probeHtmlVideo(blobUrl, canvas, deadline);
  }

  const durationMs = performance.now() - t0;
  const sustainable =
    wc.medianDecodeMs < 22 && wc.medianDrawMs < 10 && durationMs < BENCH_BUDGET_MS;
  const score = scoreFromMetrics(
    wc.medianDecodeMs,
    wc.medianDrawMs,
    videoSeekMs,
  );
  const recommendedRenderer = pickRenderer(
    wc.medianDecodeMs,
    wc.medianDrawMs,
    videoSeekMs,
    capability,
  );

  return {
    medianDecodeMs: wc.medianDecodeMs,
    medianDrawMs: wc.medianDrawMs,
    medianVideoSeekMs: videoSeekMs,
    sustainable,
    score,
    recommendedRenderer,
    recommendedTierHint: pickTierHint(capability, sustainable),
    initialPresentHz: pickPresentHz(capability, sustainable),
    durationMs,
  };
}

/** Legacy-compatible thin wrapper when demux-only probe is needed. */
export async function runDecodeSustainabilityCheck(
  demux: DemuxResult,
  canvas: HTMLCanvasElement,
  sampleCount = 4,
): Promise<{ medianDecodeMs: number; medianDrawMs: number; sustainable: boolean }> {
  const deadline = performance.now() + BENCH_BUDGET_MS;
  const wc = await probeWebCodecs(demux, canvas, sampleCount, deadline);
  return {
    ...wc,
    sustainable: wc.medianDecodeMs < 22 && wc.medianDrawMs < 8,
  };
}
