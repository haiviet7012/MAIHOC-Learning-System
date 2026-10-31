import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { build, transform } from "esbuild";
import path from "node:path";
const root = new URL("../", import.meta.url),
  dist = new URL("dist/", root);
const sources = ["js", "css", "configs", "study-rooms", "public"];
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
const check = process.argv.includes("--check");
let index = await readFile(new URL("index.html", root), "utf8");
const generated = new Map();
const bundled = await build({
  absWorkingDir: root.pathname,
  entryPoints: { app: "js/app.js", chat: "js/chat.js" },
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
  generated.set(path.relative(dist.pathname, output.path), output.contents);
for (const [output, info] of Object.entries(bundled.metafile.outputs)) {
  if (!info.entryPoint) continue;
  const entry = info.entryPoint.split("?")[0];
  if (["js/app.js", "js/chat.js"].includes(entry)) {
    const url = "/" + path.relative("dist", output).replaceAll("\\", "/");
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
  const css = await readFile(new URL(source, root), "utf8");
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
        const suffix = entry.name + (entry.isDirectory() ? "/" : "");
        const a = new URL(suffix, source),
          b = new URL(suffix, target);
        if (entry.isDirectory()) await compare(a, b);
        else if (!(await readFile(a)).equals(await readFile(b)))
          throw new Error(`Stale source copy: ${a.pathname}`);
      }
    }
    await compare(new URL(folder + "/", root), new URL(folder + "/", dist));
  }
  if ((await readFile(new URL("index.html", dist), "utf8")) !== index)
    throw new Error("Stale compiled index");
  for (const [name, bytes] of generated)
    if (!Buffer.from(bytes).equals(await readFile(new URL(name, dist))))
      throw new Error(`Stale asset ${name}`);
  const manifest = JSON.parse(
    await readFile(new URL("build-manifest.json", dist), "utf8"),
  );
  for (const [file, checksum] of Object.entries(manifest.files))
    if (hash(await readFile(new URL(file, dist))) !== checksum)
      throw new Error(`Invalid manifest: ${file}`);
  console.log("Source, compiled assets and manifest match.");
} else {
  await rm(dist, { recursive: true, force: true });
  await mkdir(new URL("assets/", dist), { recursive: true });
  for (const folder of sources)
    await cp(new URL(folder, root), new URL(folder, dist), { recursive: true });
  await cp(new URL("public/", root), dist, { recursive: true });
  await writeFile(new URL("index.html", dist), index);
  for (const [name, bytes] of generated)
    await writeFile(new URL(name, dist), bytes);
  const files = {};
  async function manifest(dir, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const name = path.posix.join(prefix, entry.name),
        url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
      if (entry.isDirectory()) await manifest(url, name);
      else files[name] = hash(await readFile(url));
    }
  }
  await manifest(dist);
  await writeFile(
    new URL("build-manifest.json", dist),
    JSON.stringify({ files }, null, 2) + "\n",
  );
  console.log(
    `Built ${Object.keys(files).length} assets, including ${generated.size} minified bundles with content hashes.`,
  );
}
