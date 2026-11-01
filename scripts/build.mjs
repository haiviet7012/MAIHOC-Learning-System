import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { build, transform } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  dist = path.join(root, "dist");
const sources = ["js", "css", "configs", "study-rooms", "public"];
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
const check = process.argv.includes("--check");
let index = await readFile(path.join(root, "index.html"), "utf8");
const generated = new Map();
const bundled = await build({
  entryPoints: { app: "./js/app.js", chat: "./js/chat.js" },
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2022"],
  outdir: "dist/assets",
  entryNames: "[name]-[hash]",
  splitting: true,
  chunkNames: "chunk-[hash]",
  external: ["/vendor/*"],
  write: false,
  metafile: true,
  legalComments: "none",
});
for (const output of bundled.outputFiles)
  generated.set(path.relative(dist, output.path), output.contents);
for (const [output, info] of Object.entries(bundled.metafile.outputs)) {
  if (!info.entryPoint) continue;
  const entry = path
    .relative(root, path.resolve(info.entryPoint))
    .replaceAll("\\", "/");
  if (["js/app.js", "js/chat.js"].includes(entry)) {
    const url = "/" + path.relative(dist, output).replaceAll("\\", "/");
    index = index.replace(
      new RegExp(`src="/${entry.replaceAll(".", "\\.")}[^"\\s]*"`),
      `src="${url}"`,
    );
  }
}
for (const match of [
  ...index.matchAll(/<link rel="stylesheet" href="([^"?]+)(?:\?[^"\s]*)?">/g),
]) {
  const source = match[1].replace(/^\//, "");
  const css = await readFile(path.join(root, source), "utf8");
  const { code } = await transform(css, {
    loader: "css",
    minify: true,
    target: "es2022",
  });
  const filename = `assets/${source.replaceAll("/", "-").replace(/\.css$/, "")}-${hash(code).slice(0, 12)}.css`;
  generated.set(filename, Buffer.from(code));
  index = index.replace(
    match[0],
    `<link rel="stylesheet" href="/${filename}">`,
  );
}
if (check) {
  for (const folder of sources) {
    async function compare(source, target) {
      for (const entry of await readdir(source, { withFileTypes: true })) {
        const a = path.join(source, entry.name),
          b = path.join(target, entry.name);
        if (entry.isDirectory()) await compare(a, b);
        else if (!(await readFile(a)).equals(await readFile(b)))
          throw new Error(`Stale source copy: ${a}`);
      }
    }
    await compare(path.join(root, folder), path.join(dist, folder));
  }
  if ((await readFile(path.join(dist, "index.html"), "utf8")) !== index)
    throw new Error("Stale compiled index");
  for (const [name, bytes] of generated)
    if (!Buffer.from(bytes).equals(await readFile(path.join(dist, name))))
      throw new Error(`Stale asset ${name}`);
  const manifest = JSON.parse(
    await readFile(path.join(dist, "build-manifest.json"), "utf8"),
  );
  for (const [file, checksum] of Object.entries(manifest.files))
    if (hash(await readFile(path.join(dist, file))) !== checksum)
      throw new Error(`Invalid manifest: ${file}`);
  console.log("Source, compiled assets and manifest match.");
} else {
  await rm(dist, { recursive: true, force: true });
  await mkdir(path.join(dist, "assets"), { recursive: true });
  for (const folder of sources)
    await cp(path.join(root, folder), path.join(dist, folder), { recursive: true });
  await cp(path.join(root, "public"), dist, { recursive: true });
  await writeFile(path.join(dist, "index.html"), index);
  for (const [name, bytes] of generated)
    await writeFile(path.join(dist, name), bytes);
  const files = {};
  async function manifest(dir, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const name = path.posix.join(prefix, entry.name),
        file = path.join(dir, entry.name);
      if (entry.isDirectory()) await manifest(file, name);
      else files[name] = hash(await readFile(file));
    }
  }
  await manifest(dist);
  await writeFile(
    path.join(dist, "build-manifest.json"),
    JSON.stringify({ files }, null, 2) + "\n",
  );
  console.log(
    `Built ${Object.keys(files).length} assets, including ${generated.size} minified bundles with content hashes.`,
  );
}
