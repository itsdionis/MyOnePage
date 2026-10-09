// The plugin (src/) is linted with Obsidian's recommended rules, type-checked as Obsidian's review does. The engine (engine/) runs as classic scripts in a
// sandboxed iframe and on the web, not in Obsidian's window, so it gets the plain browser rules.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['main.js', 'node_modules']),
  {
    files: ['src/**/*.ts'],
    extends: [obsidianmd.configs.recommended],
    languageOptions: { globals: globals.browser, parserOptions: { projectService: true } },
    rules: { 'obsidianmd/ui/sentence-case': ['warn', { ignoreWords: ['MyOnePage'] }] },
  },
  {
    files: ['engine/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'script', globals: globals.browser },
    rules: { 'no-redeclare': ['error', { builtinGlobals: false }] },
  },
  // seal.js is bundled into the plugin, so the review scans it with type information too.
  {
    files: ['engine/seal.js'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true } },
  },
  { files: ['engine/engine.js'], languageOptions: { globals: { MD: 'readonly' } } },
  {
    files: ['*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
]);
