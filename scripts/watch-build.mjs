import { watch } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const watched = ["index.html", "css", "js", "configs", "study-rooms", "public"];
let timer;
let building = false;
let pending = false;

function build() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  const child = spawn(process.execPath, [path.join(root, "scripts/build.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    building = false;
    if (code !== 0) console.error(`Preview build exited with code ${code}.`);
    if (pending) {
      pending = false;
      build();
    }
  });
}

function scheduleBuild() {
  clearTimeout(timer);
  timer = setTimeout(build, 350);
}

const watchers = watched.map((entry) =>
  watch(path.join(root, entry), { recursive: entry !== "index.html" }, scheduleBuild),
);

console.log("Watching index.html, css/, js/, configs/, study-rooms/ and public/ for changes.");
build();

function stop() {
  clearTimeout(timer);
  for (const watcher of watchers) watcher.close();
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
