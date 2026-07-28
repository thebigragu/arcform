#!/usr/bin/env node
/** @deprecated Use `npm run media:ingest`. Thin wrapper for hero masters. */
const { spawnSync } = require("child_process");
const path = require("path");

const ingest = path.join(__dirname, "media-ingest", "index.cjs");
const r = spawnSync(
  process.execPath,
  [
    ingest,
    "--id",
    "hero",
    "--desktop",
    path.join(__dirname, "..", "public", "videos", "hero-master-desktop.mp4"),
    "--mobile",
    path.join(__dirname, "..", "public", "videos", "hero-master-mobile.mp4"),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
