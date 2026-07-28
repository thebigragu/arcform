const fs = require("fs");
const path = require("path");
const { runFfmpeg } = require("./ffmpeg.cjs");

function pickPosterFrame(durationSec) {
  return Math.min(Math.max(0.05, durationSec * 0.04), durationSec - 0.05);
}

function encodePoster(videoPath, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  runFfmpeg(
    [
      "-y",
      "-ss",
      String(pickPosterFrame(6)),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-update",
      "1",
      "-c:v",
      "libwebp",
      "-quality",
      "82",
      "-compression_level",
      "6",
      outPath,
    ],
    `poster ${path.basename(outPath)}`,
  );
  return fs.statSync(outPath).size;
}

function encodeContactSheet(videoPath, outPath, durationSec) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const times = [0.02, 0.15, 0.5, 0.65, 0.85, Math.max(0.1, durationSec - 0.08)];
  const filters = times
    .map((t, i) => `[0:v]select='eq(n\\,${Math.round(t * 30)})',scale=320:-1[v${i}]`)
    .join(";");
  runFfmpeg(
    [
      "-y",
      "-i",
      videoPath,
      "-filter_complex",
      `${filters};[v0][v1][v2][v3][v4][v5]xstack=inputs=6:layout=0_0|320_0|640_0|0_180|320_180|640_180`,
      "-frames:v",
      "1",
      "-update",
      "1",
      outPath,
    ],
    "contact sheet",
  );
}

module.exports = { encodePoster, encodeContactSheet, pickPosterFrame };
