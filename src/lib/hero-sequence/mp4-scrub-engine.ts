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

const MAX_CACHE = 48;

export class Mp4ScrubEngine {
  private samples: EncodedScrubSample[] = [];
  private config!: VideoDecoderConfig;
  readonly meta: Mp4ScrubMetadata;
  private cache = new Map<number, VideoFrame>();
  private decoder: VideoDecoder | null = null;
  private serial: Promise<unknown> = Promise.resolve();
  private closed = false;
  private pendingResolve: ((frame: VideoFrame) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;

  private constructor(meta: Mp4ScrubMetadata) {
    this.meta = meta;
  }

  static async create(
    buffer: ArrayBuffer,
    onProgress?: (progress: number) => void,
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
    onProgress?.(0.92);

    await engine.getFrame(0);
    onProgress?.(1);
    return engine;
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

  private ensureDecoder(): VideoDecoder {
    if (!this.decoder || this.decoder.state === "closed") {
      this.decoder = new VideoDecoder({
        output: (frame) => {
          const resolve = this.pendingResolve;
          this.pendingResolve = null;
          if (resolve) resolve(frame);
          else frame.close();
        },
        error: (error) => {
          const reject = this.pendingReject;
          this.pendingResolve = null;
          this.pendingReject = null;
          if (reject) reject(error);
        },
      });
      this.decoder.configure(this.config);
    }
    return this.decoder;
  }

  private decodeIndex(index: number): Promise<VideoFrame> {
    if (this.closed) {
      return Promise.reject(new Error("Mp4ScrubEngine is closed"));
    }

    const cached = this.cache.get(index);
    if (cached) {
      return Promise.resolve(cached.clone());
    }

    const sample = this.samples[index];
    if (!sample) {
      return Promise.reject(new Error(`Missing sample at index ${index}`));
    }

    return new Promise<VideoFrame>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      try {
        const decoder = this.ensureDecoder();
        decoder.decode(
          new EncodedVideoChunk({
            type: sample.isKey ? "key" : "delta",
            timestamp: sample.timestamp,
            duration: sample.duration,
            data: sample.data,
          }),
        );
        void decoder.flush().catch((error: Error) => {
          this.pendingResolve = null;
          this.pendingReject = null;
          reject(error);
        });
      } catch (error) {
        this.pendingResolve = null;
        this.pendingReject = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }).then((frame) => {
      this.putCache(index, frame);
      return frame.clone();
    });
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
    this.decoder?.close();
    this.decoder = null;
    this.pendingResolve = null;
    this.pendingReject = null;
  }
}
