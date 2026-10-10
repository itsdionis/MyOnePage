// The skill folder (skills/myone-page/) is what every way in gets: the Claude app's zip, the plugin's install into a
// vault, `npx skills add`. SKILL.md is written by hand; check.mjs, md.js, example.md and templates/ next to it are
// copies, made here.
//   node skill.mjs                 copy check.mjs, engine/md.js, examples/one-pager.md and templates/ into the folder
//   node skill.mjs --zip <out>     also write the zip for the Claude app: myone-page/ with those files, SKILL.md
//                                  stamped with the version in manifest.json
//   node skill.mjs --check [--zip <out>]   change nothing; fail if a copy (or that zip) is out of date (pnpm verify)
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const md = (dir) =>
  readdirSync(join(HERE, dir))
    .filter((n) => n.endsWith('.md'))
    .sort();
const COPIES = { 'check.mjs': 'check.mjs', 'md.js': 'engine/md.js', 'example.md': 'examples/one-pager.md' };
for (const n of md('templates')) COPIES[`templates/${n}`] = `templates/${n}`;
const read = (p) => readFileSync(join(HERE, p), 'utf8');
const SKT = 'skills/myone-page/templates';

const args = process.argv.slice(2),
  check = args.includes('--check'),
  out = args.includes('--zip') ? args[args.indexOf('--zip') + 1] : null;
if (args.includes('--zip') && !out) throw new Error('--zip needs an output path');

const stale = [];
if (!check) mkdirSync(join(HERE, SKT), { recursive: true });
for (const [to, from] of Object.entries(COPIES)) {
  const dest = `skills/myone-page/${to}`;
  if (!check) writeFileSync(join(HERE, dest), read(from));
  else if (!existsSync(join(HERE, dest)) || read(dest) !== read(from)) stale.push(`${dest} differs from ${from}`);
}
// a template that is gone goes from the skill too
for (const n of existsSync(join(HERE, SKT)) ? md(SKT) : [])
  if (!COPIES[`templates/${n}`]) {
    if (!check) rmSync(join(HERE, SKT, n));
    else stale.push(`${SKT}/${n} has no templates/${n}`);
  }
if (out) {
  const { version } = JSON.parse(read('manifest.json'));
  const bytes = zip(
    ['SKILL.md', ...Object.keys(COPIES)].map((n) => {
      const text = read(`skills/myone-page/${n}`);
      return [`myone-page/${n}`, Buffer.from(n === 'SKILL.md' ? stamp(text, version) : text)];
    }),
  );
  if (!check) (writeFileSync(out, bytes), console.log(`skill: ${out} (${version})`));
  else if (!existsSync(out) || !readFileSync(out).equals(bytes))
    stale.push(`${out} is not the zip of skills/myone-page`);
}
if (stale.length) {
  for (const s of stale) console.error(`skill: ${s}; run node skill.mjs${out ? ' --zip ' + out : ''}`);
  process.exit(1);
}
if (check) console.log('skill: up to date');

// SKILL.md with `metadata: version:` in its frontmatter (the plugin stamps its installs the same way, src/skill.ts).
function stamp(text, version) {
  const end = text.indexOf('\n---', 4);
  const fm = text.slice(0, end).replace(/\nmetadata:\n(?: +.*\n?)*/, '\n');
  return `${fm.replace(/\n*$/, '')}\nmetadata:\n  version: '${version}'${text.slice(end)}`;
}

// A plain zip (deflate), with a fixed date so the same files give the same bytes.
function zip(files) {
  const DOS_TIME = 0,
    DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const n = Buffer.from(name),
      body = deflateRawSync(data),
      crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // names are UTF-8
    head.writeUInt16LE(8, 8);
    head.writeUInt16LE(DOS_TIME, 10);
    head.writeUInt16LE(DOS_DATE, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(n.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(DOS_TIME, 12);
    dir.writeUInt16LE(DOS_DATE, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(n.length, 28);
    dir.writeUInt32LE(offset, 42);
    local.push(head, n, body);
    central.push(dir, n);
    offset += head.length + n.length + body.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
