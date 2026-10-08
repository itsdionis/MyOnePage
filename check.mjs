// Checks one-pager Markdown files; with --fix, rewrites them in the format the page saves.
//   node check.mjs [--fix] [--quiet] [note.md …]    (no files: every .md in ./pages, if there is one)
// Exits 1 on an error or a file that is not formatted (and was not fixed). Runs next to engine/md.js (this repository)
// or next to a copy of md.js (the vault's plugin folder, where the owner's install puts both).
import { existsSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const MD_JS = [join(HERE, 'engine', 'md.js'), join(HERE, 'md.js')].find((p) => existsSync(p));
// md.js is the page's own converter, a classic script that defines the global MD.
const sandbox = {};
runInNewContext(readFileSync(MD_JS, 'utf8'), sandbox);
const { MD } = sandbox;

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const quiet = args.includes('--quiet');
let files = args.filter((a) => !a.startsWith('--'));
if (!files.length && existsSync('pages')) {
  files = readdirSync('pages')
    .filter((n) => n.endsWith('.md'))
    .map((n) => join('pages', n));
}
if (!files.length) {
  console.log('usage: node check.mjs [--fix] [--quiet] note.md …');
  process.exit(2);
}

let failed = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const { doc, issues, at } = MD.parse(src);
  const all = [...issues, ...MD.check(doc, at)].sort((a, b) => a.line - b.line);
  for (const i of all) if (!(quiet && i.level === 'info')) console.log(`${file}:${i.line}: ${i.level}: ${i.msg}`);
  if (all.some((i) => i.level === 'error')) failed++;

  const out = MD.serialize(doc);
  if (MD.serialize(MD.parse(out).doc) !== out) {
    console.log(`${file}: error: formatting is not stable, left as is (a bug in md.js)`);
    failed++;
  } else if (out !== src) {
    if (fix) {
      // write next to the real file, so a symlinked note stays a symlink
      const real = realpathSync(file);
      const tmp = join(dirname(real), `.${basename(real)}.tmp`);
      writeFileSync(tmp, out);
      renameSync(tmp, real);
      console.log(`${file}: formatted`);
    } else {
      const a = src.split('\n'),
        b = out.split('\n');
      let n = 0;
      while (n < a.length && a[n] === b[n]) n++;
      console.log(
        `${file}:${n + 1}: not formatted (run again with --fix):\n  - ${a[n] ?? '(end of file)'}\n  + ${b[n] ?? '(end of file)'}`,
      );
      failed++;
    }
  }
}
if (failed)
  console.log(`${failed} problem${failed > 1 ? 's' : ''} in ${files.length} file${files.length > 1 ? 's' : ''}`);
else console.log(`ok: ${files.length} file${files.length > 1 ? 's' : ''}`);
process.exit(failed ? 1 : 0);
