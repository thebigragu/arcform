const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { runFfmpeg } = require("./ffmpeg.cjs");
const { probeOutput } = require("./probe.cjs");
const {
  FPS,
  SCRUB_GOP,
  PLAYBACK_GOP,
  PRESET,
  CRF_MIN,
  CRF_MAX,
  CRF_START,
  MAX_TIER_BYTES,
} = require("./tiers.cjs");

function hashFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
}

function scaledSize(srcWidth, srcHeight, maxWidth) {
  if (srcWidth <= maxWidth) {
    return { width: srcWidth, height: srcHeight, upscale: false };
  }
  const height = Math.round((srcHeight * maxWidth) / srcWidth);
  const evenH = height % 2 === 0 ? height : height - 1;
  return { width: maxWidth, height: evenH, upscale: false };
}

function encodeScrubTier(masterPath, outPath, tier, srcMeta, crf) {
  const { maxWidth } = tier;
  const cap = tier.device === "desktop" ? 1440 : 900;
  if (maxWidth > cap) return null;

  const target = scaledSize(srcMeta.width, srcMeta.height, maxWidth);
  if (target.width === srcMeta.width && maxWidth < srcMeta.width) {
    /* ok downscale */
  }
  const dimKey = `${target.width}x${target.height}`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  runFfmpeg(
    [
      "-y",
      "-i",
      masterPath,
      "-an",
      "-vf",
      `fps=${FPS},scale=${target.width}:${target.height}:flags=lanczos`,
      "-c:v",
      "libx264",
      "-preset",
      PRESET,
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-g",
      String(SCRUB_GOP),
      "-keyint_min",
      String(SCRUB_GOP),
      "-sc_threshold",
      "0",
      "-crf",
      String(crf),
      "-movflags",
      "+faststart",
      outPath,
    ],
    `scrub ${tier.id}`,
  );

  const meta = probeOutput(outPath);
  return { ...meta, dimKey, crf, tierId: tier.id, device: tier.device, maxWidth };
}

function encodePlayback(masterPath, outPath, device, srcMeta, crf) {
  const maxW = device === "desktop" ? 1080 : 720;
  const target = scaledSize(srcMeta.width, srcMeta.height, maxW);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  runFfmpeg(
    [
      "-y",
      "-i",
      masterPath,
      "-an",
      "-vf",
      `fps=${FPS},scale=${target.width}:${target.height}:flags=lanczos`,
      "-c:v",
      "libx264",
      "-preset",
      PRESET,
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-g",
      String(PLAYBACK_GOP),
      "-keyint_min",
      String(PLAYBACK_GOP),
      "-sc_threshold",
      "0",
      "-crf",
      String(crf + 2),
      "-movflags",
      "+faststart",
      outPath,
    ],
    `playback ${device}`,
  );

  return probeOutput(outPath);
}

function tuneCrf(encodeFn, maxBytes = MAX_TIER_BYTES) {
  let crf = CRF_START;
  let last = null;
  while (crf <= CRF_MAX) {
    last = encodeFn(crf);
    if (last.bytes <= maxBytes) return { crf, meta: last };
    crf += 1;
  }
  while (crf >= CRF_MIN) {
    last = encodeFn(crf);
    if (last.bytes <= maxBytes * 1.1) return { crf, meta: last };
    crf -= 1;
  }
  return { crf: CRF_START, meta: last };
}

function dedupeTiers(encoded) {
  const seen = new Set();
  return encoded.filter((t) => {
    const key = `${t.meta.width}x${t.meta.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  hashFile,
  scaledSize,
  encodeScrubTier,
  encodePlayback,
  tuneCrf,
  dedupeTiers,
};
