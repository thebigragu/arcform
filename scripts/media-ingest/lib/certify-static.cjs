const fs = require("fs");
const { probeOutput } = require("./probe.cjs");
const { FPS, SCRUB_GOP, MAX_TIER_BYTES } = require("./tiers.cjs");

function certifyStatic(manifest, mediaRoot) {
  const checks = [];
  const fail = (name, msg) => checks.push({ name, pass: false, msg });
  const pass = (name, msg = "ok") => checks.push({ name, pass: true, msg });

  if (manifest.version !== 4) fail("manifest_version", "expected version 4");
  else pass("manifest_version");

  if (!manifest.assets?.length) fail("assets", "no assets");
  else pass("assets", `${manifest.assets.length} assets`);

  for (const asset of manifest.assets || []) {
    const rel = asset.src.replace(/^\/videos\//, "");
    const abs = require("path").join(mediaRoot, "..", "..", rel);
    if (!fs.existsSync(abs)) {
      fail(`file_${asset.id}`, `missing ${abs}`);
      continue;
    }
    pass(`file_${asset.id}`);

    if (asset.intent === "scrub" || asset.intent === "playback") {
      const meta = probeOutput(abs);
      if (Math.abs(meta.fps - FPS) > 0.5) {
        fail(`cfr_${asset.id}`, `fps ${meta.fps} != ${FPS}`);
      } else pass(`cfr_${asset.id}`);

      if (asset.intent === "scrub" && asset.bytes > MAX_TIER_BYTES * 1.15) {
        fail(`budget_${asset.id}`, `${(asset.bytes / 1e6).toFixed(1)}MB over budget`);
      } else if (asset.intent === "scrub") {
        pass(`budget_${asset.id}`);
      }
    }
  }

  const posters = manifest.assets.filter((a) => a.intent === "poster");
  if (posters.length < 2) fail("posters", "need desktop + mobile posters");
  else pass("posters");

  const scrubDesktop = manifest.assets.filter(
    (a) => a.intent === "scrub" && a.device === "desktop",
  );
  const scrubMobile = manifest.assets.filter(
    (a) => a.intent === "scrub" && a.device === "mobile",
  );
  if (!scrubDesktop.length) fail("scrub_desktop", "missing");
  else pass("scrub_desktop");
  if (!scrubMobile.length) fail("scrub_mobile", "missing");
  else pass("scrub_mobile");

  const allPass = checks.every((c) => c.pass);
  return { pass: allPass, checks };
}

module.exports = { certifyStatic };
