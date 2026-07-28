const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");

function parseArgs(argv) {
  const args = { id: "hero", skipBuild: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--id") args.id = argv[++i];
    else if (a === "--skip-build") args.skipBuild = true;
  }
  return args;
}

function run(label, cmd, cmdArgs, opts = {}) {
  console.log(`\n→ ${label}`);
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`${label} failed (exit ${r.status})`);
  }
}

function scanStaleLadderRefs(mediaId) {
  const stale = [];
  const mediaDir = path.join(ROOT, "public", "videos", "media", mediaId);
  const hasV4 = fs.existsSync(path.join(mediaDir, "manifest.json"));
  if (!hasV4) stale.push(`missing public/videos/media/${mediaId}/manifest.json`);
  return stale;
}

function main() {
  const args = parseArgs(process.argv);
  const mediaDir = path.join(ROOT, "public", "videos", "media", args.id);
  const manifestPath = path.join(mediaDir, "manifest.json");
  const report = {
    mediaId: args.id,
    at: new Date().toISOString(),
    gates: [],
  };

  const gate = (name, pass, detail = "") => {
    report.gates.push({ name, pass, detail });
    console.log(pass ? `  ✓ ${name}` : `  ✗ ${name}${detail ? `: ${detail}` : ""}`);
    return pass;
  };

  console.log(`\n=== Media certify: ${args.id} ===`);

  let allPass = true;

  if (!fs.existsSync(manifestPath)) {
    allPass = gate("manifest_exists", false, manifestPath) && allPass;
  } else {
    gate("manifest_exists", true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const { certifyStatic } = require("../media-ingest/lib/certify-static.cjs");
    const cert = certifyStatic(manifest, mediaDir);
    allPass = gate("static_certification", cert.pass) && allPass;
    if (!cert.pass) {
      for (const c of cert.checks.filter((x) => !x.pass)) {
        console.error(`    - ${c.name}: ${c.msg}`);
      }
    }
  }

  const stale = scanStaleLadderRefs(args.id);
  allPass = gate("v4_layout", stale.length === 0, stale.join("; ")) && allPass;

  try {
    run("TypeScript", path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc"), ["--noEmit"]);
    gate("typescript", true);
  } catch (e) {
    allPass = gate("typescript", false, String(e.message)) && allPass;
  }

  try {
    const eslintBin = path.join(
      ROOT,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "eslint.cmd" : "eslint",
    );
    run("ESLint (media-engine)", eslintBin, [
      "src/lib/media-engine",
      "src/components/media",
      "src/components/hero/HeroPosterPreload.tsx",
      "src/components/hero/HeroResourceHints.tsx",
      "src/app/dev/media-cert",
    ]);
    gate("eslint", true);
  } catch (e) {
    allPass = gate("eslint", false, String(e.message)) && allPass;
  }

  if (!args.skipBuild) {
    try {
      run(
        "Next build",
        process.execPath,
        [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "build"],
        { shell: false },
      );
      gate("next_build", true);
    } catch (e) {
      allPass = gate("next_build", false, String(e.message)) && allPass;
    }
  }

  const reportPath = path.join(
    mediaDir,
    "reports",
    `${Date.now()}-certify.json`,
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ ...report, pass: allPass }, null, 2));
  console.log(`\nReport: ${reportPath}`);

  if (!allPass) {
    console.error("\nCertification FAILED");
    process.exit(1);
  }
  console.log("\nCertification PASSED");
}

main();
