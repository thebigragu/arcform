const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

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

function runFfmpeg(args, label) {
  const r = spawnSync(FFMPEG, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
}

function runFfprobeJson(args) {
  const r = spawnSync(FFPROBE, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout || "{}");
}

module.exports = { FFMPEG, FFPROBE, runFfmpeg, runFfprobeJson };
