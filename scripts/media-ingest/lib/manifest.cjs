const fs = require("fs");
const path = require("path");
const { probeOutput } = require("./probe.cjs");
const { FPS, SCRUB_GOP } = require("./tiers.cjs");

function buildManifestV4(ctx) {
  const { mediaId, sources, assets, defaults, createdAt } = ctx;
  return {
    version: 4,
    mediaId,
    createdAt,
    fpsSource: FPS,
    gop: SCRUB_GOP,
    codec: "avc1",
    sources,
    defaults,
    assets,
  };
}

function buildManifestV3Legacy(assets) {
  const scrub = assets.filter((a) => a.intent === "scrub");
  return {
    version: 3,
    fpsSource: FPS,
    gop: SCRUB_GOP,
    crf: 21,
    codec: "avc1",
    tiers: scrub.map((a) => ({
      id: a.tierId,
      device: a.device,
      maxWidth: a.maxWidth,
      src: a.src,
      poster: a.poster || "",
      width: a.width,
      height: a.height,
      duration: a.duration,
      fps: a.fps,
      frameCount: a.frameCount,
      bytes: a.bytes,
    })),
  };
}

function syncLegacyLadder(mediaRoot, manifestV4) {
  const legacyDir = path.join(mediaRoot, "..", "media-ladder");
  fs.mkdirSync(legacyDir, { recursive: true });
  const v3 = buildManifestV3Legacy(manifestV4.assets);

  for (const asset of manifestV4.assets) {
    const srcAbs = path.join(
      mediaRoot,
      "..",
      "..",
      asset.src.replace(/^\/videos\//, ""),
    );
    if (!fs.existsSync(srcAbs)) continue;
    if (asset.intent === "scrub") {
      const dest = path.join(legacyDir, `${asset.tierId}.mp4`);
      fs.copyFileSync(srcAbs, dest);
    }
    if (asset.intent === "poster" || asset.poster) {
      const posterAsset = manifestV4.assets.find(
        (a) => a.intent === "poster" && a.device === asset.device,
      );
      if (posterAsset && asset.intent === "scrub") {
        const pSrc = path.join(
          mediaRoot,
          "..",
          "..",
          posterAsset.src.replace(/^\/videos\//, ""),
        );
        const pDest = path.join(legacyDir, `${asset.tierId}-poster.webp`);
        if (fs.existsSync(pSrc)) fs.copyFileSync(pSrc, pDest);
      }
    }
  }

  fs.writeFileSync(
    path.join(legacyDir, "media-ladder.json"),
    JSON.stringify(v3, null, 2),
  );
  return v3;
}

function validateTimeline(desktop, mobile, toleranceMs = 100) {
  const dMs = desktop.duration * 1000;
  const mMs = mobile.duration * 1000;
  if (Math.abs(dMs - mMs) > toleranceMs) {
    throw new Error(
      `Timeline mismatch: desktop ${dMs.toFixed(0)}ms vs mobile ${mMs.toFixed(0)}ms`,
    );
  }
}

module.exports = {
  buildManifestV4,
  buildManifestV3Legacy,
  syncLegacyLadder,
  validateTimeline,
};
