"use client";

import {
  createFile,
  DataStream,
  Endianness,
  type ISOFile,
  type MP4BoxBuffer,
  type Sample,
  type Track,
} from "mp4box";

type MP4Buffer = ArrayBuffer & { fileStart: number };

export type EncodedScrubSample = {
  data: Uint8Array;
  timestamp: number;
  duration: number;
  isKey: boolean;
};

export type Mp4ScrubMetadata = {
  frameCount: number;
  width: number;
  height: number;
  codedWidth: number;
  codedHeight: number;
};

type IndexedMp4 = {
  samples: EncodedScrubSample[];
  config: VideoDecoderConfig;
  meta: Mp4ScrubMetadata;
};

const MAX_CACHE = 64;
const DECODE_TIMEOUT_MS = 8000;

function getCodecDescription(
  file: ISOFile,
  trackId: number,
): Uint8Array | undefined {
  const trak = file.getTrackById(trackId);
  if (!trak) return undefined;

  const entry = trak.mdia.minf.stbl.stsd.entries[0] as {
    avcC?: { write: (stream: DataStream) => void };
    hvcC?: { write: (stream: DataStream) => void };
  };

  const box = entry?.avcC ?? entry?.hvcC;
  if (!box) return undefined;

  const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
  box.write(stream);
  return new Uint8Array(stream.buffer, 8, stream.getPosition() - 8);
}

async function indexMp4Scrub(buffer: ArrayBuffer): Promise<IndexedMp4> {
  return new Promise((resolve, reject) => {
    const file = createFile();
    const samples: EncodedScrubSample[] = [];
    let videoTrack: Track | null = null;
    let expected = 0;
    let settled = false;

    const finish = () => {
      if (settled || !videoTrack) return;
      settled = true;

      const description = getCodecDescription(file, videoTrack.id);
      const config: VideoDecoderConfig = {
        codec: videoTrack.codec,
        codedWidth: videoTrack.track_width,
        codedHeight: videoTrack.track_height,
        description,
      };

      resolve({
        samples,
        config,
        meta: {
          frameCount: samples.length,
          width: videoTrack.video?.width ?? videoTrack.track_width,
          height: videoTrack.video?.height ?? videoTrack.track_height,
          codedWidth: videoTrack.track_width,
          codedHeight: videoTrack.track_height,
        },
      });
    };

    file.onError = (error: string) => {
      if (!settled) reject(new Error(error));
    };

    file.onReady = (info) => {
      videoTrack = info.videoTracks[0] ?? null;
      if (!videoTrack) {
        reject(new Error("No video track in MP4"));
        return;
      }

      expected = videoTrack.nb_samples;
      file.setExtractionOptions(videoTrack.id, null, {
        nbSamples: expected,
      });
      file.start();
    };

    file.onSamples = (_id: number, _user: unknown, batch: Sample[]) => {
      for (const sample of batch) {
        if (!sample.data) continue;
        samples.push({
          data: sample.data,
          timestamp: sample.cts,
          duration: sample.duration,
          isKey: sample.is_sync,
        });
      }

      if (videoTrack && samples.length >= expected) {
        finish();
      }
    };

    const mp4 = buffer as MP4Buffer & MP4BoxBuffer;
    mp4.fileStart = 0;
    file.appendBuffer(mp4);
    file.flush();
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

export class Mp4ScrubEngine {
  private samples: EncodedScrubSample[] = [];
  private config!: VideoDecoderConfig;
  readonly meta: Mp4ScrubMetadata;
  private cache = new Map<number, VideoFrame>();
  private serial: Promise<unknown> = Promise.resolve();
  private closed = false;

  private constructor(meta: Mp4ScrubMetadata) {
    this.meta = meta;
  }

  static async create(
    buffer: ArrayBuffer,
    onProgress?: (progress: number) => void,
    prewarmCount = 32,
  ): Promise<Mp4ScrubEngine> {
    onProgress?.(0.82);
    const { samples, config, meta } = await indexMp4Scrub(buffer);

    const support = await VideoDecoder.isConfigSupported(config);
    if (!support.supported) {
      throw new Error("WebCodecs H.264 configuration is not supported");
    }

    const engine = new Mp4ScrubEngine(meta);
    engine.samples = samples;
    engine.config = config;

    const warmMax = Math.min(
      meta.frameCount,
      Math.max(1, prewarmCount),
    );

    onProgress?.(0.9);
    for (let i = 0; i < warmMax; i++) {
      await engine.getFrame(i);
      onProgress?.(0.9 + (0.1 * (i + 1)) / warmMax);
    }

    onProgress?.(1);
    return engine;
  }

  hasFrame(index: number): boolean {
    return this.cache.has(index);
  }

  nearestCached(index: number): number | null {
    if (this.cache.has(index)) return index;

    let best: number | null = null;
    let bestDistance = Infinity;
    for (const key of this.cache.keys()) {
      const distance = Math.abs(key - index);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = key;
      }
    }
    return best;
  }

  getFrame(index: number): Promise<VideoFrame> {
    const i = Math.max(0, Math.min(this.samples.length - 1, index | 0));
    const cached = this.cache.get(i);
    if (cached) {
      return Promise.resolve(cached.clone());
    }

    const task = this.serial.then(() => this.decodeIndex(i));
    this.serial = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private decodeSample(sample: EncodedScrubSample): Promise<VideoFrame> {
    return withTimeout(
      new Promise<VideoFrame>((resolve, reject) => {
        let output: VideoFrame | null = null;

        const decoder = new VideoDecoder({
          output: (frame) => {
            output = frame;
          },
          error: (error) => {
            try {
              decoder.close();
            } catch {
              /* ignore */
            }
            reject(error);
          },
        });

        decoder.configure(this.config);
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
            if (!output) {
              reject(new Error("WebCodecs decode produced no frame"));
              return;
            }
            resolve(output);
          })
          .catch((error: Error) => {
            try {
              decoder.close();
            } catch {
              /* ignore */
            }
            reject(error);
          });
      }),
      DECODE_TIMEOUT_MS,
      "WebCodecs frame decode",
    );
  }

  private async decodeIndex(index: number): Promise<VideoFrame> {
    if (this.closed) {
      throw new Error("Mp4ScrubEngine is closed");
    }

    const cached = this.cache.get(index);
    if (cached) {
      return cached.clone();
    }

    const sample = this.samples[index];
    if (!sample) {
      throw new Error(`Missing sample at index ${index}`);
    }

    const frame = await this.decodeSample(sample);
    this.putCache(index, frame);
    return frame.clone();
  }

  private putCache(index: number, frame: VideoFrame) {
    const existing = this.cache.get(index);
    if (existing && existing !== frame) existing.close();

    this.cache.set(index, frame);

    if (this.cache.size <= MAX_CACHE) return;

    let furthest = -1;
    let maxDistance = -1;
    for (const key of this.cache.keys()) {
      const distance = Math.abs(key - index);
      if (distance > maxDistance) {
        maxDistance = distance;
        furthest = key;
      }
    }

    if (furthest >= 0) {
      this.cache.get(furthest)?.close();
      this.cache.delete(furthest);
    }
  }

  close() {
    this.closed = true;
    for (const frame of this.cache.values()) frame.close();
    this.cache.clear();
  }
}
