// How pages look in Obsidian: a theme (its colours and font are in engine.css) and light or dark, which follows
// Obsidian until the setting or ☀/☾ on a page picks one. The plugin sets both on each page's <html>.
import { Setting } from 'obsidian';
import css from '../engine/engine.css?text';
import type MyOnePagePlugin from './main';

export type Scheme = 'light' | 'dark';
export interface LookPrefs {
  theme?: string; // a value of THEMES (DEFAULT: none on the page)
  scheme?: Scheme | 'obsidian'; // unset: obsidian
}
const DEFAULT = 'mint'; // engine.css's own colours (:root)
// The themes, [value, name], read from engine.css: each theme's block opens with --theme, its name.
export const THEMES = [...css.matchAll(/:root(?:\[data-theme='([\w-]+)'\])? \{\s*--theme: '([^']+)'/g)].map(
  (m) => [m[1] || DEFAULT, m[2]] as const,
);
export const isScheme = (s: unknown): s is Scheme => s === 'light' || s === 'dark';

// What a page gets: theme '' for the default (no data-theme), and light or dark.
export function look(prefs: LookPrefs) {
  const theme = prefs.theme !== DEFAULT && THEMES.some(([v]) => v === prefs.theme) ? (prefs.theme as string) : '';
  const scheme = isScheme(prefs.scheme)
    ? prefs.scheme
    : document.body.classList.contains('theme-light')
      ? 'light'
      : 'dark';
  return { theme, scheme };
}
// for <html>
export function lookAttrs(prefs: LookPrefs) {
  const { theme, scheme } = look(prefs);
  return `data-scheme="${scheme}"${theme ? ` data-theme="${theme}"` : ''}`;
}

// Settings: "Appearance".
export function lookSettings(el: HTMLElement, plugin: MyOnePagePlugin) {
  const p = plugin.prefs;
  new Setting(el).setName('Appearance').setHeading();
  new Setting(el)
    .setName('Theme')
    .setDesc('The colours and font of pages in Obsidian, and of the HTML files they save.')
    .addDropdown((d) => {
      for (const [v, name] of THEMES) d.addOption(v, name + (v === DEFAULT ? ' (default)' : ''));
      d.setValue(look(p).theme || DEFAULT).onChange((theme) => void plugin.setLook({ theme }));
    });
  new Setting(el)
    .setName('Light or dark')
    .setDesc('Also ☀ and ☾ in the bar of a page.')
    .addDropdown((d) =>
      d
        .addOptions({ obsidian: 'Follow Obsidian', light: 'Light', dark: 'Dark' })
        .setValue(p.scheme || 'obsidian')
        .onChange((v) => void plugin.setLook({ scheme: isScheme(v) ? v : 'obsidian' })),
    );
}
