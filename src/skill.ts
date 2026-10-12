// The skill for coding agents in the vault (Claude Code, Codex, Cursor): the files of skills/myone-page/ (SKILL.md,
// check.mjs, md.js, example.md, templates/) written to .claude/skills/myone-page/ (Claude Code; Cursor reads it too)
// and .agents/skills/myone-page/ (Codex), SKILL.md stamped with the plugin's version. A plugin update refreshes a copy only while every
// file the plugin wrote is unchanged (their hashes are kept in the plugin's data); an edited copy is left alone.
// Desktop only. The settings also point to the Claude app's zip.
// These are dot folders, which the Vault API doesn't index, so the files go through vault.adapter.
// check.mjs reads and writes files with Node's fs, so the plugin doesn't carry its text: it downloads it from the
// sharing server (/web/check/<hash>.mjs, which `pnpm skill` writes) and keeps it only if its SHA-256 is the one
// built in here. The plugin never runs it.
import { Notice, Platform, Setting, requestUrl } from 'obsidian';
import type MyOnePagePlugin from './main';
import { TEMPLATES } from './templates';
import SKILL from '../skills/myone-page/SKILL.md?text';
import CHECK_SHA256 from '../check.mjs?sha256';
import MDJS from '../engine/md.js?text';
import EXAMPLE from '../examples/one-pager.md?text';

const GUIDE = 'https://myone.page/ai'; // the Claude app: the zip and how to upload it
const DIRS = ['.claude/skills/myone-page', '.agents/skills/myone-page'];
const CHECK = 'check.mjs';
type State = 'none' | 'current' | 'old' | 'edited';
export interface SkillPrefs {
  files: Record<string, string>; // name -> hash of each file last written, to tell our copy from an edited one
  version: string;
}

// SKILL.md with `metadata: version:` in its frontmatter, as skill.mjs stamps the zip.
function stamp(text: string, version: string) {
  const end = text.indexOf('\n---', 4);
  const fm = text.slice(0, end).replace(/\nmetadata:\n(?: +.*\n?)*/, '\n');
  return `${fm.replace(/\n*$/, '')}\nmetadata:\n  version: '${version}'${text.slice(end)}`;
}
// The files the plugin carries; check.mjs comes from checker().
const files = (version: string): Record<string, string> => ({
  'SKILL.md': stamp(SKILL, version),
  'md.js': MDJS,
  'example.md': EXAMPLE,
  ...Object.fromEntries(TEMPLATES.map((t) => [`templates/${t.slug}.md`, t.text])),
});
// FNV-1a: enough to notice an edit.
function hash(text: string) {
  let h = 0x811c9dc5;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16);
}
async function sha256(data: string | ArrayBuffer) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class SkillInstall {
  plugin: MyOnePagePlugin;
  constructor(plugin: MyOnePagePlugin) {
    this.plugin = plugin;
  }
  get adapter() {
    return this.plugin.app.vault.adapter;
  }
  get version() {
    return this.plugin.manifest.version;
  }
  dirs() {
    return Promise.resolve(DIRS);
  }
  async state(dir: string): Promise<State> {
    if (!(await this.adapter.exists(`${dir}/SKILL.md`))) return 'none';
    const read = (n: string) => this.adapter.read(`${dir}/${n}`).catch(() => null);
    const now = Object.entries(files(this.version));
    const same = await Promise.all(now.map(async ([n, text]) => (await read(n)) === text));
    if (same.every(Boolean) && (await sha256((await read(CHECK)) ?? '')) === CHECK_SHA256) return 'current';
    const wrote = Object.entries(this.plugin.prefs.skill?.files ?? {});
    const ours = await Promise.all(wrote.map(async ([n, h]) => hash((await read(n)) ?? '') === h));
    return wrote.length && ours.every(Boolean) ? 'old' : 'edited';
  }
  // check.mjs: a copy already in the vault, if it is this version's, or else a download.
  async checker() {
    for (const dir of DIRS) {
      const text = await this.adapter.read(`${dir}/${CHECK}`).catch(() => null);
      if (text !== null && (await sha256(text)) === CHECK_SHA256) return text;
    }
    const r = await requestUrl({
      url: `${this.plugin.web.server}/web/check/${CHECK_SHA256.slice(0, 16)}.mjs`,
      throw: false,
    });
    if (r.status !== 200) throw new Error(`the server answered ${r.status} for the checker (check.mjs)`);
    if ((await sha256(r.arrayBuffer)) !== CHECK_SHA256)
      throw new Error('the checker (check.mjs) from the server is not the one this plugin version expects');
    return r.text;
  }
  async write(dir: string) {
    const now = { ...files(this.version), [CHECK]: await this.checker() };
    for (const d of [dir, `${dir}/templates`]) {
      let at = '';
      for (const part of d.split('/')) {
        at = at ? `${at}/${part}` : part;
        if (!(await this.adapter.exists(at))) await this.adapter.mkdir(at);
      }
    }
    for (const [n, text] of Object.entries(now)) await this.adapter.write(`${dir}/${n}`, text);
    this.plugin.prefs.skill = {
      files: Object.fromEntries(Object.entries(now).map(([n, t]) => [n, hash(t)])),
      version: this.version,
    };
    await this.plugin.saveSettings();
  }
  // Install where it is missing or ours; `force` also replaces an edited copy.
  async install(force = false) {
    for (const dir of await this.dirs()) {
      const s = await this.state(dir);
      if (s !== 'current' && (s !== 'edited' || force)) await this.write(dir);
    }
  }
  // After a plugin update: refresh the copies the plugin wrote and nobody edited, and add a folder an older version
  // didn't write (once set up, every agent's folder has it).
  // Offline, it tries again on the next start.
  async refresh() {
    if (Platform.isMobile || !this.plugin.prefs.skill) return;
    try {
      for (const dir of await this.dirs()) if (['old', 'none'].includes(await this.state(dir))) await this.write(dir);
    } catch (e) {
      console.warn('[myone.page] skill update:', e);
    }
  }
}

// Settings: "Write pages with AI" (the Claude app's skill) and, on desktop, "Coding agents".
export function skillSettings(el: HTMLElement, plugin: MyOnePagePlugin) {
  new Setting(el).setName('Write pages with AI').setHeading();
  new Setting(el)
    .setName('Claude app')
    .setDesc(
      'Better pages: give Claude the whole page format and the templates once, as a skill (in Claude: Customize → ' +
        'Skills → Upload a skill). Then ask Claude for a one-pager and paste its answer into Make a page with AI.',
    )
    .addButton((b) => b.setButtonText('Download the Claude skill').onClick(() => window.open(GUIDE)));
  if (Platform.isMobile) return;
  new Setting(el).setName('Coding agents').setHeading();
  const row = new Setting(el).setName('Set up Claude Code, Codex and Cursor'),
    sk = plugin.skill;
  // the row repaints itself after a click (the tab's display() is deprecated)
  const paint = async () => {
    const dirs = await sk.dirs(),
      states = await Promise.all(dirs.map((d) => sk.state(d)));
    const where = dirs.map((d) => `${d}/`).join(' and ');
    const say = (s: string) =>
      row.setDesc(
        `So they can write pages when you work with them in this vault: the page format, the templates and the checker, in ${where}. ${s}`,
      );
    row.controlEl.empty();
    const act = (label: string, force: boolean) =>
      row.addButton((b) => {
        b.setButtonText(label).onClick(async () => {
          try {
            await sk.install(force);
          } catch (e) {
            new Notice(`MyOnePage: could not set up the skill: ${e instanceof Error ? e.message : String(e)}`);
          }
          await paint();
        });
        if (!force) b.setCta();
      });
    if (states.every((s) => s === 'current')) {
      say(`Set up (version ${sk.version}).`);
      row.addButton((b) => b.setButtonText('Done').setDisabled(true));
    } else if (states.includes('edited')) {
      say('Update available: your copy was edited, so it is left alone.');
      act('Replace with the new version', true);
    } else {
      say(states.includes('old') ? 'An older version is set up.' : 'Not set up yet.');
      act(states.includes('old') ? 'Update' : 'Set up', false);
    }
  };
  row.setDesc('…');
  void paint();
}
