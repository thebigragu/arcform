const fs = require("fs");
const path = require("path");
const { probeSource } = require("./lib/probe.cjs");
const { normalizeMaster } = require("./lib/normalize.cjs");
const {
  hashFile,
  encodeScrubTier,
  encodePlayback,
  tuneCrf,
  dedupeTiers,
} = require("./lib/encode.cjs");
const { encodePoster, encodeContactSheet } = require("./lib/posters.cjs");
const {
  buildManifestV4,
  syncLegacyLadder,
  validateTimeline,
} = require("./lib/manifest.cjs");
const { certifyStatic } = require("./lib/certify-static.cjs");
const {
  DESKTOP_TIERS,
  MOBILE_TIERS,
} = require("./lib/tiers.cjs");

const ROOT = path.join(__dirname, "..", "..");
const VIDEOS = path.join(ROOT, "public", "videos");

function probeForManifest(probe, sourcePath) {
  const rel = path.relative(ROOT, sourcePath).replace(/\\/g, "/");
  return {
    ...probe,
    path: rel.startsWith("..") ? path.basename(sourcePath) : rel,
  };
}

function parseArgs(argv) {
  const args = {
    id: "hero",
    desktop: null,
    mobile: null,
    dryRun: false,
    force: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force") args.force = true;
    else if (a === "--id") args.id = argv[++i];
    else if (a === "--desktop") args.desktop = path.resolve(argv[++i]);
    else if (a === "--mobile") args.mobile = path.resolve(argv[++i]);
  }
  if (!args.desktop) {
    args.desktop = path.join(VIDEOS, "hero-master-desktop.mp4");
  }
  if (!args.mobile) {
    args.mobile = path.join(VIDEOS, "hero-master-mobile.mp4");
  }
  return args;
}

function planTiers(desktopMeta, mobileMeta) {
  const desktop = DESKTOP_TIERS.filter(
    (t) => desktopMeta.width >= t.maxWidth * 0.85 || t.maxWidth <= desktopMeta.width,
  );
  const mobile = MOBILE_TIERS.filter(
    (t) => mobileMeta.width >= t.maxWidth * 0.85 || t.maxWidth <= mobileMeta.width,
  );
  return { desktop, mobile };
}

function main() {
  const args = parseArgs(process.argv);
  const mediaDir = path.join(VIDEOS, "media", args.id);
  const manifestPath = path.join(mediaDir, "manifest.json");

  if (fs.existsSync(manifestPath) && !args.force && !args.dryRun) {
    throw new Error(
      `Manifest exists at ${manifestPath}. Use --force to replace or --dry-run to preview.`,
    );
  }

  if (!fs.existsSync(args.desktop)) throw new Error(`Missing desktop: ${args.desktop}`);
  if (!fs.existsSync(args.mobile)) throw new Error(`Missing mobile: ${args.mobile}`);

  const desktopProbe = probeSource(args.desktop);
  const mobileProbe = probeSource(args.mobile);

  if (desktopProbe.isLandscape === mobileProbe.isLandscape) {
    throw new Error(
      "Ambiguous orientation: desktop and mobile have same aspect. Provide distinct landscape/portrait masters.",
    );
  }

  validateTimeline(desktopProbe, mobileProbe);

  const tierPlan = planTiers(desktopProbe, mobileProbe);

  if (args.dryRun) {
    console.log(JSON.stringify({ args: { id: args.id }, desktopProbe, mobileProbe, tierPlan }, null, 2));
    return;
  }

  fs.mkdirSync(mediaDir, { recursive: true });
  const mastersDir = path.join(mediaDir, "masters");
  fs.mkdirSync(mastersDir, { recursive: true });

  const normDesktop = normalizeMaster(
    args.desktop,
    path.join(mastersDir, "desktop-normalized.mp4"),
    "desktop",
  );
  const normMobile = normalizeMaster(
    args.mobile,
    path.join(mastersDir, "mobile-normalized.mp4"),
    "mobile",
  );

  const dNorm = probeSource(normDesktop.outputPath);
  const mNorm = probeSource(normMobile.outputPath);
  validateTimeline(dNorm, mNorm);

  const assets = [];
  const scrubEncoded = [];

  for (const tier of tierPlan.desktop) {
    const tmpPath = path.join(mediaDir, "scrub", `_tmp_${tier.id}.mp4`);
    const { crf, meta } = tuneCrf((crfVal) => {
      return encodeScrubTier(normDesktop.outputPath, tmpPath, tier, dNorm, crfVal);
    });
    if (!meta) continue;
    const hash = hashFile(tmpPath);
    const finalName = `${tier.id}-${hash}.mp4`;
    const finalPath = path.join(mediaDir, "scrub", finalName);
    fs.renameSync(tmpPath, finalPath);
    scrubEncoded.push({ tier, meta, hash, crf, finalPath });
  }

  for (const tier of tierPlan.mobile) {
    const tmpPath = path.join(mediaDir, "scrub", `_tmp_${tier.id}.mp4`);
    const { crf, meta } = tuneCrf((crfVal) => {
      return encodeScrubTier(normMobile.outputPath, tmpPath, tier, mNorm, crfVal);
    });
    if (!meta) continue;
    const hash = hashFile(tmpPath);
    const finalName = `${tier.id}-${hash}.mp4`;
    const finalPath = path.join(mediaDir, "scrub", finalName);
    fs.renameSync(tmpPath, finalPath);
    scrubEncoded.push({ tier, meta, hash, crf, finalPath });
  }

  const deduped = dedupeTiers(scrubEncoded);

  for (const item of deduped) {
    const pub = `/videos/media/${args.id}/scrub/${item.tier.id}-${item.hash}.mp4`;
    assets.push({
      id: `scrub-${item.tier.id}`,
      intent: "scrub",
      tierId: item.tier.id,
      device: item.tier.device,
      maxWidth: item.tier.maxWidth,
      src: pub,
      width: item.meta.width,
      height: item.meta.height,
      duration: item.meta.duration,
      fps: item.meta.fps,
      frameCount: item.meta.frameCount,
      bytes: item.meta.bytes,
      bitrate: item.meta.bitrate,
      codec: "avc1",
      gop: 1,
      crf: item.crf,
      contentHash: item.hash,
      recommendedBands: ["ultra", "high"],
      safeDefaultTier: item.tier.id === "d1440" ? "d1080" : item.tier.id,
    });
  }

  for (const device of ["desktop", "mobile"]) {
    const master = device === "desktop" ? normDesktop.outputPath : normMobile.outputPath;
    const meta = device === "desktop" ? dNorm : mNorm;
    const tmpPb = path.join(mediaDir, "playback", `_tmp_${device}.mp4`);
    encodePlayback(master, tmpPb, device, meta, 21);
    const hash = hashFile(tmpPb);
    const finalPath = path.join(mediaDir, "playback", `${device}-${hash}.mp4`);
    fs.renameSync(tmpPb, finalPath);
    const pbMeta = require("./lib/probe.cjs").probeOutput(finalPath);
    assets.push({
      id: `playback-${device}`,
      intent: "playback",
      device,
      tierId: null,
      maxWidth: pbMeta.width,
      src: `/videos/media/${args.id}/playback/${device}-${hash}.mp4`,
      width: pbMeta.width,
      height: pbMeta.height,
      duration: pbMeta.duration,
      fps: pbMeta.fps,
      frameCount: pbMeta.frameCount,
      bytes: pbMeta.bytes,
      bitrate: pbMeta.bitrate,
      codec: "avc1",
      gop: 60,
      contentHash: hash,
    });
  }

  const defaultDesktopScrub =
    deduped.find((d) => d.tier.id === "d1080") ||
    deduped.find((d) => d.tier.device === "desktop");
  const defaultMobileScrub =
    deduped.find((d) => d.tier.id === "m720") ||
    deduped.find((d) => d.tier.device === "mobile");

  for (const device of ["desktop", "mobile"]) {
    const scrub =
      device === "desktop" ? defaultDesktopScrub : defaultMobileScrub;
    if (!scrub) continue;
    const posterPath = path.join(
      mediaDir,
      "posters",
      `${device}-poster.webp`,
    );
    encodePoster(scrub.finalPath, posterPath);
    encodeContactSheet(
      scrub.finalPath,
      path.join(mediaDir, "reports", `contact-${device}.jpg`),
      scrub.meta.duration,
    );
    assets.push({
      id: `poster-${device}`,
      intent: "poster",
      device,
      src: `/videos/media/${args.id}/posters/${device}-poster.webp`,
      bytes: fs.statSync(posterPath).size,
      contentHash: hashFile(posterPath),
    });
  }

  const defaults = {
    safeDefaultTier: {
      desktop: "d1080",
      mobile: "m720",
    },
    poster: {
      desktop: `/videos/media/${args.id}/posters/desktop-poster.webp`,
      mobile: `/videos/media/${args.id}/posters/mobile-poster.webp`,
    },
    playback: {
      desktop: assets.find((a) => a.id === "playback-desktop")?.src,
      mobile: assets.find((a) => a.id === "playback-mobile")?.src,
    },
    ladderUrl: `/videos/media/${args.id}/manifest.json`,
    legacyLadderUrl: "/videos/media-ladder/media-ladder.json",
  };

  for (const a of assets) {
    if (a.intent === "scrub") {
      const poster =
        a.device === "desktop" ? defaults.poster.desktop : defaults.poster.mobile;
      a.poster = poster;
    }
  }

  const manifest = buildManifestV4({
    mediaId: args.id,
    createdAt: new Date().toISOString(),
    sources: {
      desktop: { probe: probeForManifest(desktopProbe, args.desktop), normalized: normDesktop.steps },
      mobile: { probe: probeForManifest(mobileProbe, args.mobile), normalized: normMobile.steps },
    },
    defaults,
    assets,
  });

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  if (args.id === "hero") {
    syncLegacyLadder(mediaDir, manifest);
  }

  const cert = certifyStatic(manifest, mediaDir);
  const report = {
    mediaId: args.id,
    at: new Date().toISOString(),
    sources: { desktop: args.desktop, mobile: args.mobile },
    assets: assets.map((a) => ({
      id: a.id,
      intent: a.intent,
      src: a.src,
      bytes: a.bytes,
      width: a.width,
      height: a.height,
    })),
    defaults,
    certification: cert,
  };

  const reportPath = path.join(
    mediaDir,
    "reports",
    `${Date.now()}-ingest.json`,
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("\n=== Ingest complete ===");
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Report: ${reportPath}`);
  for (const a of assets.filter((x) => x.intent === "scrub")) {
    console.log(
      `  ${a.tierId}: ${a.width}x${a.height} ${a.frameCount}f ${(a.bytes / 1e6).toFixed(1)}MB crf${a.crf}`,
    );
  }
  if (!cert.pass) {
    console.error("Static certification FAILED:");
    for (const c of cert.checks.filter((x) => !x.pass)) {
      console.error(`  - ${c.name}: ${c.msg}`);
    }
    process.exit(1);
  }
  console.log("Static certification: PASS");
}

main();
