/**
 * Runtime certification harness — starts dev server if needed, runs Playwright matrix.
 * Usage: node scripts/media-certify-runtime.mjs --id hero
 */
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const http = require("http");

const PORT = Number(process.env.PORT || 3459);
const ROOT = path.join(__dirname, "..");
const HOST = `http://localhost:${PORT}`;

function parseArgs(argv) {
  const args = { id: "hero", port: PORT };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--id") args.id = argv[++i];
    else if (argv[i] === "--port") args.port = Number(argv[++i]);
  }
  return args;
}

function waitForServer(url, timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - started > timeoutMs) {
            reject(new Error(`Dev server not ready at ${url}`));
            return;
          }
          setTimeout(tick, 500);
        });
    };
    tick();
  });
}

async function readScorecard(page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-media-cert]");
    if (!el?.textContent) return null;
    try {
      return JSON.parse(el.textContent);
    } catch {
      return null;
    }
  });
}

async function waitForScorecard(page, predicate, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const s = await readScorecard(page);
    if (s && predicate(s)) return s;
    await page.waitForTimeout(400);
  }
  return null;
}

async function surfaceState(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const video = document.querySelector("video");
    const canvasVisible =
      canvas &&
      canvas.style.opacity !== "0" &&
      getComputedStyle(canvas).opacity !== "0";
    const videoVisible =
      video &&
      video.style.display !== "none" &&
      getComputedStyle(video).display !== "none" &&
      getComputedStyle(video).visibility !== "hidden";
    return {
      hasCanvas: Boolean(canvas),
      hasVideo: Boolean(video),
      canvasVisible: Boolean(canvasVisible),
      videoVisible: Boolean(videoVisible),
      simultaneous: Boolean(canvasVisible && videoVisible),
    };
  });
}

async function runMode(page, args, mode, expectations) {
  const checks = [];
  const check = (name, pass, detail = "") => {
    checks.push({ name: `${mode}:${name}`, pass, detail });
    console.log(pass ? `  ✓ ${mode}:${name}` : `  ✗ ${mode}:${name}: ${detail}`);
    return pass;
  };

  const url = `${HOST}/dev/media-cert?media=${args.id}&mode=${mode}&device=desktop`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });

  const scorecard = await waitForScorecard(
    page,
    (s) => s.experienceMode === mode && s.ttfvfMs != null,
    45000,
  );

  let allPass = true;
  allPass = check("scorecard_ready", Boolean(scorecard)) && allPass;
  if (!scorecard) return { allPass: false, checks };

  allPass =
    check("experience_mode", scorecard.experienceMode === mode) && allPass;
  allPass =
    check(
      "renderer",
      expectations.renderers.includes(scorecard.renderer),
      scorecard.renderer,
    ) && allPass;

  const surfaces = await surfaceState(page);
  allPass =
    check(
      "no_simultaneous_surfaces",
      !surfaces.simultaneous,
      JSON.stringify(surfaces),
    ) && allPass;

  if (mode === "playback") {
    allPass = check("video_visible", surfaces.videoVisible) && allPass;
  } else if (mode === "poster") {
    allPass = check("no_active_video", !surfaces.videoVisible) && allPass;
  } else {
    allPass = check("canvas_active", surfaces.hasCanvas) && allPass;
  }

  if (mode === "full-scrub" || mode === "lite-scrub") {
    const before = scorecard.cacheHits ?? 0;
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(1500);
    await page.mouse.wheel(0, -3000);
    await page.waitForTimeout(1500);
    const after = await readScorecard(page);
    if (after) {
      allPass =
        check(
          "scrub_progress",
          after.progress > 0.05,
          `progress=${after.progress}`,
        ) && allPass;
      allPass =
        check(
          "cache_reuse",
          (after.cacheHits ?? 0) >= before,
          `hits ${before}→${after.cacheHits}`,
        ) && allPass;
      allPass =
        check(
          "bounded_memory",
          (after.memoryBudgetPct ?? 0) <= 150,
          `${after.memoryBudgetPct}%`,
        ) && allPass;
      allPass =
        check(
          "bounded_queue",
          (after.decodeQueueDepth ?? 0) <= 12,
          `q=${after.decodeQueueDepth}`,
        ) && allPass;
    }
  }

  return { allPass, checks };
}

async function main() {
  const args = parseArgs(process.argv);
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    console.error("playwright is required for runtime certification");
    process.exit(1);
  }

  let devProc = null;
  const devReady = await new Promise((resolve) => {
    http
      .get(`${HOST}/`, (res) => {
        res.resume();
        resolve(true);
      })
      .on("error", () => resolve(false));
  });

  if (!devReady) {
    console.log(`Starting dev server on :${args.port}...`);
    devProc = spawn(
      process.execPath,
      [
        path.join(ROOT, "node_modules", "next", "dist", "bin", "next"),
        "dev",
        "-p",
        String(args.port),
      ],
      { cwd: ROOT, stdio: "pipe", shell: false },
    );
    await waitForServer(`${HOST}/`, 180000);
  }

  const report = {
    mediaId: args.id,
    at: new Date().toISOString(),
    checks: [],
  };

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const modes = [
    {
      mode: "full-scrub",
      expectations: { renderers: ["webcodecs", "html-video"] },
    },
    {
      mode: "lite-scrub",
      expectations: { renderers: ["webcodecs", "html-video"] },
    },
    {
      mode: "playback",
      expectations: { renderers: ["playback"] },
    },
    {
      mode: "poster",
      expectations: { renderers: ["poster"] },
    },
  ];

  let allPass = true;
  for (const { mode, expectations } of modes) {
    console.log(`\n→ Runtime mode: ${mode}`);
    const result = await runMode(page, args, mode, expectations);
    report.checks.push(...result.checks);
    allPass = result.allPass && allPass;
  }

  console.log("\n→ Fallback: webcodecs forced then html-video");
  await page.goto(
    `${HOST}/dev/media-cert?media=${args.id}&renderer=html-video&mode=full-scrub`,
    { waitUntil: "networkidle", timeout: 120000 },
  );
  const fallback = await waitForScorecard(
    page,
    (s) => s.renderer === "html-video" && s.ttfvfMs != null,
    45000,
  );
  const fbPass = Boolean(fallback);
  report.checks.push({
    name: "fallback:html-video",
    pass: fbPass,
    detail: fallback?.renderer ?? "missing",
  });
  console.log(fbPass ? "  ✓ fallback:html-video" : "  ✗ fallback:html-video");
  allPass = fbPass && allPass;

  await browser.close();
  if (devProc) devProc.kill("SIGTERM");

  const outDir = path.join(ROOT, "public", "videos", "media", args.id, "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${Date.now()}-runtime-certify.json`);
  fs.writeFileSync(outPath, JSON.stringify({ ...report, pass: allPass }, null, 2));
  console.log(`\nRuntime report: ${outPath}`);

  if (!allPass) process.exit(1);
  console.log("\nRuntime certification PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
