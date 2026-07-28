import type { DemuxResult } from "../types";

/**
 * Lightweight decode/draw probe after demux.
 * If median decode is too slow, caller should force html-video or lower tier.
 */
export async function runRuntimeBenchmark(
  demux: DemuxResult,
  canvas: HTMLCanvasElement,
  sampleCount = 4,
): Promise<{
  medianDecodeMs: number;
  medianDrawMs: number;
  sustainable: boolean;
}> {
  if (typeof VideoDecoder === "undefined") {
    return { medianDecodeMs: 999, medianDrawMs: 999, sustainable: false };
  }

  const support = await VideoDecoder.isConfigSupported(demux.config);
  if (!support.supported) {
    return { medianDecodeMs: 999, medianDrawMs: 999, sustainable: false };
  }

  const decodeTimes: number[] = [];
  const drawTimes: number[] = [];
  const ctx = canvas.getContext("2d");
  const n = Math.min(sampleCount, demux.samples.length);
  const step = Math.max(1, Math.floor(demux.samples.length / n));

  for (let i = 0; i < n; i++) {
    const sample = demux.samples[Math.min(i * step, demux.samples.length - 1)];
    if (!sample) continue;

    const t0 = performance.now();
    const frame = await decodeOne(demux.config, sample);
    decodeTimes.push(performance.now() - t0);

    if (ctx && frame) {
      const t1 = performance.now();
      ctx.drawImage(frame, 0, 0, Math.min(64, canvas.width), Math.min(64, canvas.height));
      drawTimes.push(performance.now() - t1);
      frame.close();
    } else {
      frame?.close();
    }
  }

  const medianDecodeMs = median(decodeTimes);
  const medianDrawMs = median(drawTimes);
  const sustainable = medianDecodeMs < 22 && medianDrawMs < 8;

  return { medianDecodeMs, medianDrawMs, sustainable };
}

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
