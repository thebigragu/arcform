import type { DemuxerPort } from "../ports/DemuxerPort";
import type { DemuxResult, EncodedSample } from "../types";

/**
 * Mediabunny MP4-only demux behind DemuxerPort.
 * Dynamic import keeps the dependency off the html-video-only path.
 */
export class MediabunnyDemuxer implements DemuxerPort {
  async index(buffer: ArrayBuffer): Promise<DemuxResult> {
    const { Input, BlobSource, Mp4InputFormat, EncodedPacketSink } =
      await import("mediabunny");

    const input = new Input({
      source: new BlobSource(new Blob([buffer], { type: "video/mp4" })),
      formats: [new Mp4InputFormat()],
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("No video track");

    const decoderConfig = await videoTrack.getDecoderConfig();
    if (!decoderConfig) throw new Error("Missing decoder config");

    const sink = new EncodedPacketSink(videoTrack);
    const samples: EncodedSample[] = [];

    for await (const packet of sink.packets()) {
      samples.push({
        data: new Uint8Array(packet.data),
        timestamp: Math.round(packet.timestamp * 1_000_000),
        duration: Math.round((packet.duration || 1 / 60) * 1_000_000),
        isKey: packet.type === "key",
      });
    }

    if (samples.length === 0) {
      throw new Error("Demux produced zero samples");
    }

    const durationSec = await videoTrack.computeDuration();

    return {
      samples,
      config: decoderConfig as VideoDecoderConfig,
      meta: {
        frameCount: samples.length,
        width: videoTrack.displayWidth || videoTrack.codedWidth,
        height: videoTrack.displayHeight || videoTrack.codedHeight,
        durationSec,
        fps: samples.length / Math.max(0.001, durationSec),
      },
    };
  }

  /** Range-friendly demux via Mediabunny UrlSource (progressive Future path). */
  async indexUrl(url: string): Promise<DemuxResult> {
    const { Input, UrlSource, Mp4InputFormat, EncodedPacketSink } =
      await import("mediabunny");

    const input = new Input({
      source: new UrlSource(url),
      formats: [new Mp4InputFormat()],
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("No video track");

    const decoderConfig = await videoTrack.getDecoderConfig();
    if (!decoderConfig) throw new Error("Missing decoder config");

    const sink = new EncodedPacketSink(videoTrack);
    const samples: EncodedSample[] = [];

    for await (const packet of sink.packets()) {
      samples.push({
        data: new Uint8Array(packet.data),
        timestamp: Math.round(packet.timestamp * 1_000_000),
        duration: Math.round((packet.duration || 1 / 60) * 1_000_000),
        isKey: packet.type === "key",
      });
    }

    if (samples.length === 0) {
      throw new Error("Demux produced zero samples");
    }

    const durationSec = await videoTrack.computeDuration();

    return {
      samples,
      config: decoderConfig as VideoDecoderConfig,
      meta: {
        frameCount: samples.length,
        width: videoTrack.displayWidth || videoTrack.codedWidth,
        height: videoTrack.displayHeight || videoTrack.codedHeight,
        durationSec,
        fps: samples.length / Math.max(0.001, durationSec),
      },
    };
  }
}
