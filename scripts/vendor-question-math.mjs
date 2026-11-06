import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function prepareQuestionMath(check = false) {
  const root = new URL('../', import.meta.url);
  const result = await build({
    absWorkingDir: fileURLToPath(root), entryPoints: ['katex'], bundle: true, minify: true,
    format: 'esm', target: 'es2022', write: false, legalComments: 'inline',
  });
  const target = new URL('js/vendor/katex.js', root), bytes = result.outputFiles[0].contents;
  if (check) {
    if (!Buffer.from(bytes).equals(await readFile(target))) throw new Error('Stale question bank KaTeX bundle');
  } else {
    await mkdir(new URL('js/vendor/', root), { recursive: true });
    await writeFile(target, bytes);
    await writeFile(new URL('js/vendor/katex-LICENSE', root), await readFile(new URL('node_modules/katex/LICENSE', root)));
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await prepareQuestionMath(process.argv.includes('--check'));
