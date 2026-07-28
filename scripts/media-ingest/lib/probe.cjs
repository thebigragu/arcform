const { runFfprobeJson } = require("./ffmpeg.cjs");

function parseFps(rFrameRate) {
  const parts = String(rFrameRate || "0/1").split("/");
  if (parts.length === 2 && Number(parts[1])) {
    return Number(parts[0]) / Number(parts[1]);
  }
  return Number(parts[0]) || 0;
}

function probeSource(file) {
  const data = runFfprobeJson([
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    file,
  ]);
  const video = (data.streams || []).find((s) => s.codec_type === "video");
  if (!video) throw new Error(`No video stream: ${file}`);

  const fps = parseFps(video.r_frame_rate);
  const avgFps = parseFps(video.avg_frame_rate);
  const duration = Number(data.format?.duration || video.duration || 0);
  const nbFrames = Number(video.nb_frames) || Math.round(duration * fps);

  return {
    path: file,
    codec: video.codec_name,
    profile: video.profile || null,
    pixFmt: video.pix_fmt,
    bitDepth: video.bits_per_raw_sample
      ? Number(video.bits_per_raw_sample)
      : video.pix_fmt?.includes("10") ? 10 : 8,
    width: Number(video.width) || 0,
    height: Number(video.height) || 0,
    sar: video.sample_aspect_ratio || "1:1",
    dar: video.display_aspect_ratio || null,
    duration,
    fps,
    avgFps,
    nbFrames,
    bitrate: Number(data.format?.bit_rate || video.bit_rate || 0),
    fileSize: Number(data.format?.size || 0),
    colorPrimaries: video.color_primaries || null,
    colorTransfer: video.color_transfer || null,
    colorSpace: video.color_space || null,
    rotation: Number(video.tags?.rotate || video.side_data_list?.[0]?.rotation || 0),
    hasAudio: (data.streams || []).some((s) => s.codec_type === "audio"),
    isLandscape: Number(video.width) >= Number(video.height),
  };
}

function probeOutput(file) {
  const data = runFfprobeJson([
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate,nb_frames,codec_name,profile,pix_fmt",
    "-show_entries",
    "format=duration,bit_rate,size",
    "-of",
    "json",
    file,
  ]);
  const s = data.streams?.[0] || {};
  const f = data.format || {};
  const fps = parseFps(s.r_frame_rate);
  const duration = Number(f.duration) || 0;
  const nbFrames = Number(s.nb_frames) || Math.round(duration * fps);
  return {
    width: Number(s.width) || 0,
    height: Number(s.height) || 0,
    fps,
    duration,
    frameCount: nbFrames,
    codec: s.codec_name,
    profile: s.profile || null,
    pixFmt: s.pix_fmt,
    bytes: Number(f.size) || 0,
    bitrate: Number(f.bit_rate) || 0,
  };
}

module.exports = { probeSource, probeOutput, parseFps };
