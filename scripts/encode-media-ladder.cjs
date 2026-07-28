#!/usr/bin/env node
/**
 * Encode Media Engine V2.2/V2.3 quality ladder from archival 30fps masters.
 * Default tiers: d1440, d1080 (desktop), m900 (mobile) — 30fps, g=1, H.264, WebP posters.
 *
 * Run: npm run media:ladder
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VIDEOS = path.join(ROOT, "public", "videos");
const OUT_DIR = path.join(VIDEOS, "media-ladder");

/** V2.2 proportional ladder — no unnecessary tiers */
const TIERS = [
  {
    id: "d1440",
    master: "hero-master-desktop.mp4",
    maxWidth: 1440,
    device: "desktop",
  },
  {
    id: "d1080",
    master: "hero-master-desktop.mp4",
    maxWidth: 1080,
    device: "desktop",
  },
  {
    id: "m900",
    master: "hero-master-mobile.mp4",
    maxWidth: 900,
    device: "mobile",
  },
];

/** Legacy tiers removed by V2.2 — delete if present after encode */
const LEGACY_TIER_IDS = ["d2560", "d1920", "m1440", "m1080"];

const GOP = 1;
const CRF = 21;
const FPS = 30;
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
      "stream=width,height,duration,r_frame_rate,nb_frames",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffprobe failed for ${file}`);
  const s = JSON.parse(r.stdout).streams?.[0] || {};
  const fpsParts = String(s.r_frame_rate || "0/1").split("/");
  const fps =
    fpsParts.length === 2 && Number(fpsParts[1])
      ? Number(fpsParts[0]) / Number(fpsParts[1])
      : Number(fpsParts[0]) || 0;
  return {
    width: Number(s.width) || 0,
    height: Number(s.height) || 0,
    duration: Number(s.duration) || 0,
    fps,
    nbFrames:
      Number(s.nb_frames) || Math.round((Number(s.duration) || 0) * FPS),
  };
}

function encodeTier(tier) {
  const source = path.join(VIDEOS, tier.master);
  if (!fs.existsSync(source)) throw new Error(`Missing master: ${source}`);

  const outMp4 = path.join(OUT_DIR, `${tier.id}.mp4`);
  const outPoster = path.join(OUT_DIR, `${tier.id}-poster.webp`);

  console.log(`\n=== ${tier.id} (max ${tier.maxWidth}w, ${FPS}fps, g=${GOP}) ===`);
  run(
    [
      "-y",
      "-i",
      source,
      "-an",
      "-vf",
      `fps=${FPS},scale=${tier.maxWidth}:-2:flags=lanczos`,
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
      outMp4,
    ],
    `encode ${tier.id}`,
  );

  run(
    [
      "-y",
      "-i",
      outMp4,
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
      outPoster,
    ],
    `poster ${tier.id}`,
  );

  const meta = probe(outMp4);
  const bytes = fs.statSync(outMp4).size;
  return {
    id: tier.id,
    device: tier.device,
    maxWidth: tier.maxWidth,
    src: `/videos/media-ladder/${tier.id}.mp4`,
    poster: `/videos/media-ladder/${tier.id}-poster.webp`,
    width: meta.width,
    height: meta.height,
    duration: meta.duration,
    fps: meta.fps,
    frameCount: meta.nbFrames || Math.round(meta.duration * FPS),
    bytes,
  };
}

function removeLegacyTiers() {
  for (const id of LEGACY_TIER_IDS) {
    for (const ext of [".mp4", "-poster.webp"]) {
      const p = path.join(OUT_DIR, `${id}${ext}`);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        console.log(`Removed legacy ${path.basename(p)}`);
      }
    }
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tiers = TIERS.map(encodeTier);
  const manifest = {
    version: 3,
    fpsSource: FPS,
    gop: GOP,
    crf: CRF,
    codec: "avc1",
    tiers,
  };
  const manifestPath = path.join(OUT_DIR, "media-ladder.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  removeLegacyTiers();
  console.log(`\nWrote ${manifestPath}`);
  for (const t of tiers) {
    console.log(
      `  ${t.id}: ${t.width}x${t.height} ${t.frameCount}f ${(t.bytes / (1024 * 1024)).toFixed(1)}MB`,
    );
  }
}

main();
