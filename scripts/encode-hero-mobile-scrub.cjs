#!/usr/bin/env node
/**
 * Encode mobile hero scroll-scrub MP4 from Kling source.
 * Portrait 900px wide at 30fps, keyframe every frame (g=1) for cheap random seeks.
 *
 * Run: node scripts/encode-hero-mobile-scrub.cjs
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VIDEOS = path.join(ROOT, "public", "videos");
const SOURCE = path.join(VIDEOS, "hero-kling-mobile.mp4");
const OUT = path.join(VIDEOS, "hero-mobile-scrub.mp4");
const POSTER = path.join(VIDEOS, "hero-mobile-scrub-poster.webp");

const MAX_WIDTH = 900;
/** Keyframe every frame — every scroll seek decodes exactly one frame. */
const GOP = 1;
const CRF = 21;
/** Halved from the 60fps source: same motion, half the frames and bytes. */
const FPS = 30;
/** Slower analysis trims bytes at identical quality; one-time cost on a 6s clip. */
const PRESET = "slower";

function findBin(name) {
  const envKey = name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH";
  if (process.env[envKey] && fs.existsSync(process.env[envKey])) {
    return process.env[envKey];
  }
  const winget = path.join(
    process.env.LOCALAPPDATA || "",
    "Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin",
    `${name}.exe`,
  );
  if (fs.existsSync(winget)) return winget;
  return name;
}

const FFMPEG = findBin("ffmpeg");
const FFPROBE = findBin("ffprobe");

function run(args, label) {
  const r = spawnSync(FFMPEG, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
}

function probe(file) {
  const r = spawnSync(
    FFPROBE,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,duration,r_frame_rate",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffprobe failed for ${file}`);
  const s = JSON.parse(r.stdout).streams?.[0] || {};
  return {
    width: Number(s.width) || 0,
    height: Number(s.height) || 0,
    duration: Number(s.duration) || 0,
    fps: s.r_frame_rate || "?",
  };
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Missing source: ${SOURCE}`);
  }

  const meta = probe(SOURCE);
  console.log(`Source: ${meta.width}x${meta.height}, ${meta.duration.toFixed(2)}s, ${meta.fps} fps`);

  console.log(`\nEncoding scrub MP4 → ${OUT}`);
  console.log(
    `  fps=${FPS}  scale=${MAX_WIDTH}:-2  g=${GOP}  crf=${CRF}  preset=${PRESET}  +faststart`,
  );

  run(
    [
      "-y",
      "-i",
      SOURCE,
      "-an",
      "-vf",
      `fps=${FPS},scale=${MAX_WIDTH}:-2:flags=lanczos`,
      "-c:v",
      "libx264",
      "-preset",
      PRESET,
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-g",
      String(GOP),
      "-keyint_min",
      String(GOP),
      "-sc_threshold",
      "0",
      "-crf",
      String(CRF),
      "-movflags",
      "+faststart",
      OUT,
    ],
    "encode",
  );

  console.log(`\nPoster → ${POSTER}`);
  run(
    [
      "-y",
      "-i",
      OUT,
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
      POSTER,
    ],
    "poster",
  );

  const outMeta = probe(OUT);
  const mb = (fs.statSync(OUT).size / (1024 * 1024)).toFixed(1);
  console.log(`\nDone: ${outMeta.width}x${outMeta.height}, ${outMeta.duration.toFixed(2)}s, ${mb} MB`);
  console.log(JSON.stringify({ src: OUT, poster: POSTER, ...outMeta }, null, 2));
}

main();
