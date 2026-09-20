// Regenerates vectors.json from ansel_ref.cpp (+ the vendored splines.cpp) with
// g++. The committed JSON is what the tests read, so a machine without a
// compiler still runs the suite; run this after touching the C++.
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const dir = __dirname;
const build = path.join(dir, ".build");
fs.mkdirSync(build, { recursive: true });
const exe = path.join(build, process.platform === "win32" ? "ansel_ref.exe" : "ansel_ref");

const cc = spawnSync(
  "g++",
  ["-O2", "-std=c++17", `-I${dir}`, path.join(dir, "ansel_ref.cpp"), path.join(dir, "splines.cpp"), "-o", exe],
  { stdio: "inherit" },
);
if (cc.error || cc.status !== 0) {
  console.error("g++ is required to regenerate vectors.json (the committed file still serves the tests)");
  process.exit(2);
}

const run = spawnSync(exe, [], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (run.status !== 0) {
  console.error(run.stderr);
  process.exit(run.status ?? 1);
}
JSON.parse(run.stdout);
fs.writeFileSync(path.join(dir, "vectors.json"), run.stdout);
console.log(`wrote ${path.join(dir, "vectors.json")} (${run.stdout.length} bytes)`);
