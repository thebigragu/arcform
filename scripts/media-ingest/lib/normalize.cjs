const fs = require("fs");
const path = require("path");
const { runFfmpeg } = require("./ffmpeg.cjs");
const { FPS } = require("./tiers.cjs");

function normalizeMaster(inputPath, outputPath, device) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const vf = [
    "fps=30",
    "scale='min(iw,3840)':-2:flags=lanczos",
    "setsar=1",
  ].join(",");

  runFfmpeg(
    [
      "-y",
      "-i",
      inputPath,
      "-an",
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-g",
      "1",
      "-keyint_min",
      "1",
      "-sc_threshold",
      "0",
      "-crf",
      "18",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    `normalize ${device}`,
  );

  return {
    outputPath,
    steps: ["cfr30", "square_pixels", "yuv420p", "no_audio", "faststart"],
  };
}

module.exports = { normalizeMaster };
