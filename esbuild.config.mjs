// Bundles src/main.ts into main.js. An import ending in `?text` is the file's text (the engine runs from text inside
// the page iframe); `<file>.js?api` is a classic script whose global has the file's name in capitals (md.js -> MD), as a
// module (the plugin reads pages with md.js too); `?sha256` is the file's SHA-256 in hex (check.mjs, which the plugin
// downloads rather than carries). --watch rebuilds on change.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import esbuild from 'esbuild';

const text = {
  name: 'text',
  setup(build) {
    build.onResolve({ filter: /\?text$/ }, (a) => ({
      path: new URL(a.path.slice(0, -5), `file://${a.resolveDir}/`).pathname,
      namespace: 'text',
    }));
    build.onLoad({ filter: /.*/, namespace: 'text' }, async (a) => ({
      contents: await readFile(a.path, 'utf8'),
      loader: 'text',
    }));
  },
};

const sha256 = {
  name: 'sha256',
  setup(build) {
    build.onResolve({ filter: /\?sha256$/ }, (a) => ({
      path: new URL(a.path.slice(0, -7), `file://${a.resolveDir}/`).pathname,
      namespace: 'sha256',
    }));
    build.onLoad({ filter: /.*/, namespace: 'sha256' }, async (a) => ({
      contents: createHash('sha256')
        .update(await readFile(a.path))
        .digest('hex'),
      loader: 'text',
      watchFiles: [a.path],
    }));
  },
};

const api = {
  name: 'api',
  setup(build) {
    build.onResolve({ filter: /\?api$/ }, (a) => ({
      path: new URL(a.path.slice(0, -4), `file://${a.resolveDir}/`).pathname,
      namespace: 'api',
    }));
    build.onLoad({ filter: /.*/, namespace: 'api' }, async (a) => ({
      contents: `${await readFile(a.path, 'utf8')}\nexport default ${a.path.replace(/^.*\/|\.js$/g, '').toUpperCase()};\n`,
      loader: 'js',
      resolveDir: a.path.replace(/\/[^/]*$/, ''),
    }));
  },
};

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  outfile: 'main.js',
  bundle: true,
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  plugins: [text, sha256, api],
  logLevel: 'info',
});
if (process.argv.includes('--watch')) await ctx.watch();
else {
  await ctx.rebuild();
  await ctx.dispose();
}
