#!/usr/bin/env node
/**
 * Extract scroll-scrub WebP frame sequences from hero MP4s (native fps, max 900).
 * Run: npm run hero:frames
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VIDEOS = path.join(ROOT, "public", "videos");
const OUT = path.join(ROOT, "public", "hero-sequences");
const MAX_FRAMES = 900;
const WEBP_QUALITY = 90;

const VARIANTS = [
  {
    id: "desktop",
    source: path.join(VIDEOS, "hero-kling.mp4"),
    outDir: path.join(OUT, "desktop"),
    // 1440p (height) — never scale below; never upscale.
    maxHeight: 1440,
  },
  // Mobile hero uses MP4 scroll-scrub — see scripts/encode-hero-mobile-scrub.cjs
];

function findBin(name) {
  const envKey = name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH";
  if (process.env[envKey] && fs.existsSync(process.env[envKey])) return process.env[envKey];
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

function parseFps(avgFrameRate) {
  if (!avgFrameRate || avgFrameRate === "0/0") return 0;
  const [num, den] = String(avgFrameRate).split("/").map(Number);
  if (!den) return Number(avgFrameRate) || 0;
  return num / den;
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
      "stream=avg_frame_rate,nb_frames,width,height,duration",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffprobe failed for ${file}`);
  const json = JSON.parse(r.stdout);
  const s = json.streams?.[0] || {};
  const duration =
    Number(s.duration) || Number(json.format?.duration) || 0;
  return {
    width: Number(s.width) || 0,
    height: Number(s.height) || 0,
    duration,
    nbFrames: Number(s.nb_frames) || 0,
    fps: parseFps(s.avg_frame_rate),
  };
}

function dirSizeBytes(dir) {
  let total = 0;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) total += dirSizeBytes(p);
    else total += st.size;
  }
  return total;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function computeExtractPlan(meta) {
  const fps = meta.fps > 0 ? meta.fps : 24;
  const fromNb =
    meta.nbFrames > 0 && meta.nbFrames < meta.duration * fps * 2
      ? meta.nbFrames
      : 0;
  const nativeCount =
    fromNb || Math.max(1, Math.round(meta.duration * fps));

  if (nativeCount > MAX_FRAMES) {
    const extractFps = MAX_FRAMES / meta.duration;
    return { extractFps, frameCount: MAX_FRAMES, fps, capped: true };
  }
  return { extractFps: fps, frameCount: nativeCount, fps, capped: false };
}

function extractVariant(v) {
  if (!fs.existsSync(v.source)) {
    throw new Error(`Missing source: ${v.source}`);
  }

  fs.mkdirSync(v.outDir, { recursive: true });

  for (const f of fs.readdirSync(v.outDir)) {
    if (f.startsWith("frame-") && f.endsWith(".webp")) {
      fs.unlinkSync(path.join(v.outDir, f));
    }
  }

  const meta = probe(v.source);
  const plan = computeExtractPlan(meta);
  // Prefer height cap (1440p) when set; else width cap. Never upscale.
  let scaleFilter;
  let scaleLabel;
  if (v.maxHeight) {
    const scaleH = Math.min(meta.height || v.maxHeight, v.maxHeight);
    scaleFilter = `scale=-2:${scaleH}:flags=lanczos`;
    scaleLabel = `-2:${scaleH}`;
  } else {
    const scaleW = Math.min(meta.width || v.maxWidth, v.maxWidth);
    scaleFilter = `scale=${scaleW}:-2:flags=lanczos`;
    scaleLabel = `${scaleW}:-2`;
  }
  const outPattern = path.join(v.outDir, "frame-%05d.webp");

  console.log(`\n=== ${v.id} ===`);
  console.log(
    `Source: ${v.source} (${meta.width}x${meta.height}, ${meta.duration.toFixed(2)}s, ${meta.fps.toFixed(3)} fps, nb_frames=${meta.nbFrames || "n/a"})`,
  );
  console.log(
    `Plan: extractFps=${plan.extractFps.toFixed(4)}, targetFrames=${plan.frameCount}${plan.capped ? " (capped)" : " (native)"}, scale=${scaleLabel}`,
  );

  run(
    [
      "-y",
      "-i",
      v.source,
      "-vf",
      `fps=${plan.extractFps},${scaleFilter}`,
      "-frames:v",
      String(plan.frameCount),
      "-c:v",
      "libwebp",
      "-quality",
      String(WEBP_QUALITY),
      "-compression_level",
      "5",
      "-preset",
      "picture",
      outPattern,
    ],
    `${v.id} extract`,
  );

  const frames = fs
    .readdirSync(v.outDir)
    .filter((f) => f.startsWith("frame-") && f.endsWith(".webp"))
    .sort();

  if (frames.length === 0) throw new Error(`No frames written to ${v.outDir}`);

  if (frames[0] !== "frame-00001.webp") {
    console.warn(
      `Warning: first frame is ${frames[0]} (expected frame-00001.webp)`,
    );
  }

  const firstFrame = path.join(v.outDir, frames[0]);
  const frameMeta = probe(firstFrame);

  const manifest = {
    id: v.id,
    source: `public/videos/${path.basename(v.source)}`,
    frameCount: frames.length,
    width: frameMeta.width,
    height: frameMeta.height,
    fps: plan.fps,
    pattern: `/hero-sequences/${v.id}/frame-%05d.webp`,
  };

  fs.writeFileSync(
    path.join(v.outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  const size = dirSizeBytes(v.outDir);
  console.log(`Wrote ${frames.length} frames → ${v.outDir}`);
  console.log(`Output size: ${formatMb(size)}`);
  console.log(`Manifest: ${JSON.stringify(manifest)}`);
}

function main() {
  const filter = process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, ""))
    .filter((a) => a === "desktop" || a === "mobile");
  const variants =
    filter.length > 0
      ? VARIANTS.filter((v) => filter.includes(v.id))
      : VARIANTS;

  if (variants.length === 0) {
    throw new Error("No matching variants. Use --desktop and/or --mobile.");
  }

  console.log(`ffmpeg: ${FFMPEG}`);
  console.log(`ffprobe: ${FFPROBE}`);
  fs.mkdirSync(OUT, { recursive: true });

  for (const v of variants) {
    extractVariant(v);
  }

  const total = dirSizeBytes(OUT);
  console.log(`\nDone. Total hero-sequences size: ${formatMb(total)}`);
}

main();
