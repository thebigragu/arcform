#!/usr/bin/env node
"use strict";
// Thin wrapper delegating to the installed media-engine skill's certify script.
const path = require("path");
const { spawnSync } = require("child_process");
const SKILL_CERTIFY = "C:\\Users\\jacob\\.cursor\\skills\\media-engine\\scripts\\certify.cjs";
const r = spawnSync(process.execPath, [SKILL_CERTIFY, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status == null ? 1 : r.status);
