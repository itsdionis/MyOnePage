// Sharing on the web (a sharing server such as myone.page): a note with `share:` in its frontmatter is published to the server and kept in
// sync both ways. The owner-only keys (share, editors, viewers) stay in the note and go to the server as lists;
// the server never stores or shows them in the text.
// `share:` holds the page link, <server>/p/<acct>/<id>#k=<key>. The server only ever gets the text sealed with
// that key (SEAL), so it cannot read it; anyone with the link and the right to open the page can.
//
// Each round, per shared note: base = the text both sides had at the last sync (kept per device).
//   only the web changed -> rewrite the note    only the note changed -> push it (with the version it was based on)
//   both changed -> merge by lines; a clean merge is written and pushed, a clash leaves the note alone and puts the
//   web text in "<note> (web version).md"; delete that file once the note says what you want, and the note is pushed.
// `share: new` gets a fresh id and key and the link is copied. Removing `share:` takes the page offline.
import * as WEB from 'obsidian';
import type { App, TFile } from 'obsidian';
import type MyOnePagePlugin from './main';
import '../engine/seal.js'; // a classic script: sets window.SEAL

const { SEAL } = window;

// The frontmatter keys read here; Obsidian types every value as any.
export interface Frontmatter {
  share?: unknown;
  editors?: unknown;
  viewers?: unknown;
  title?: unknown;
  [key: string]: unknown;
}
export const frontmatter = (app: App, file: TFile): Frontmatter =>
  app.metadataCache.getFileCache(file)?.frontmatter ?? {};
interface PageState {
  path: string;
  base: string;
  version: number;
  key: string;
  conflict?: string;
}
interface State {
  server: string;
  acct: string | null;
  pages: Record<string, PageState>;
}
interface Page {
  id: string;
  key: string;
  link: string;
  fresh?: boolean;
  upgraded?: boolean;
}
// A page in GET /api/owner/pages.
interface Summary {
  id: string;
  version: number;
  editors: string[];
  viewers: string[];
}

const WEB_ID = /^[A-Za-z0-9]{22}$/;
const WEB_LINK = /^(https?:\/\/[^/\s]+)\/p\/([A-Za-z0-9_-]{16})\/([A-Za-z0-9]{22})#k=([A-Za-z0-9_-]{43})$/;
const WEB_KEYS = /^(share|editors|viewers):/;
// per-device localStorage: {server, acct, pages: {id: {path, base, version, key, conflict?}}}; base is plaintext
const WEB_STATE = 'myone-page-web';
const WEB_TOKEN = 'myone-page-token'; // per device too: data.json syncs with the vault, a secret must not
// The keys before the rename; moved over once per device. Remove after every device has run a version with this.
const WEB_OLD = { [WEB_STATE]: 'one-pager-web-2', [WEB_TOKEN]: 'one-pager-token' };

function webId() {
  // 22 base62 characters, ~131 bits
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  while (s.length < 22)
    for (const b of crypto.getRandomValues(new Uint8Array(32))) if (b < 248 && s.length < 22) s += abc[b % 62];
  return s;
}

// The note without its owner-only keys (pub), and those lines (own), kept as written.
function webSplit(text: string) {
  const L = text.replace(/\r\n?/g, '\n').split('\n'),
    end = L[0] === '---' ? L.indexOf('---', 1) : -1;
  if (end < 0) return { pub: L.join('\n'), own: [] };
  const fm: string[] = [],
    own: string[] = [];
  for (let i = 1; i < end; i++) {
    if (!WEB_KEYS.test(L[i])) {
      fm.push(L[i]);
      continue;
    }
    own.push(L[i]);
    while (i + 1 < end && /^(\s|-)/.test(L[i + 1])) own.push(L[++i]);
  }
  return { pub: ['---', ...fm, ...L.slice(end)].join('\n'), own };
}
function webJoin(pub: string, own: string[]) {
  const L = pub.split('\n');
  return L[0] === '---' ? ['---', ...own, ...L.slice(1)].join('\n') : ['---', ...own, '---', ...L].join('\n');
}
export function webShare(text: string): string | undefined {
  // the share: value in the frontmatter, or undefined
  const L = text.replace(/\r\n?/g, '\n').split('\n'),
    end = L[0] === '---' ? L.indexOf('---', 1) : -1;
  for (let i = 1; i < end; i++) {
    const m = /^share:\s*(.*?)\s*$/.exec(L[i]);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
}
// A share: value -> {id, key, link, fresh?, upgraded?}, or null when it is not one.
//   new|true|yes|"" -> a new page; a bare 22-character id (before encryption) -> same id, new key;
//   a link -> its id and key, moved to this server and account if it names others.
function webResolve(value: unknown, server: string, acct: string): Page | null {
  const v = String((value as string) ?? '').trim(),
    m = WEB_LINK.exec(v);
  const at = (id: string, key: string, extra?: Partial<Page>): Page => ({
    id,
    key,
    link: webLink(server, acct, id, key),
    ...extra,
  });
  if (/^(new|true|yes|)$/i.test(v)) return at(webId(), SEAL.newKey(), { fresh: true });
  if (WEB_ID.test(v)) return at(v, SEAL.newKey(), { upgraded: true });
  return m ? at(m[3], m[4]) : null;
}
const webLink = (server: string, acct: string, id: string, key: string) => `${server}/p/${acct}/${id}#k=${key}`;
export const webLive = (v: unknown) => typeof v === 'string' && WEB_LINK.test(v.trim());
const webAcct = (token: string) => {
  const m = /^([A-Za-z0-9_-]{16})\.[A-Za-z0-9_-]+$/.exec(token || '');
  return m ? m[1] : null;
};
// The web text, decrypted, without owner-only keys: an editor must not set share/editors/viewers through the web.
async function webOpen(key: string, address: string, envelope: string) {
  return webSplit(await SEAL.open(key, address, envelope)).pub;
}

export const webList = (v: unknown): string[] =>
  (Array.isArray(v) ? (v as unknown[]) : v == null || v === '' ? [] : String(v as string).split(','))
    .map((e) =>
      String(e as string)
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

// Three-way merge by lines. For each line of base: its match in a and in b (or -1), from a longest common subsequence.
function webMatch(base: string[], x: string[]) {
  const n = base.length,
    m = x.length,
    map = new Array<number>(n).fill(-1);
  let p = 0;
  while (p < n && p < m && base[p] === x[p]) {
    map[p] = p;
    p++;
  }
  let s = 0;
  while (s < n - p && s < m - p && base[n - 1 - s] === x[m - 1 - s]) {
    map[n - 1 - s] = m - 1 - s;
    s++;
  }
  const N = n - p - s,
    M = m - p - s,
    W = M + 1,
    t = new Uint32Array((N + 1) * W);
  for (let i = N - 1; i >= 0; i--)
    for (let j = M - 1; j >= 0; j--)
      t[i * W + j] =
        base[p + i] === x[p + j] ? t[(i + 1) * W + j + 1] + 1 : Math.max(t[(i + 1) * W + j], t[i * W + j + 1]);
  for (let i = 0, j = 0; i < N && j < M;) {
    if (base[p + i] === x[p + j]) {
      map[p + i] = p + j;
      i++;
      j++;
    } else if (t[(i + 1) * W + j] >= t[i * W + j + 1]) i++;
    else j++;
  }
  return map;
}
function webMerge(baseText: string, aText: string, bText: string): { clean: true; text: string } | { clean: false } {
  if (aText === bText || bText === baseText) return { clean: true, text: aText };
  if (aText === baseText) return { clean: true, text: bText };
  const base = baseText.split('\n'),
    a = aText.split('\n'),
    b = bText.split('\n');
  const ma = webMatch(base, a),
    mb = webMatch(base, b),
    out: string[] = [];
  const eq = (x: string[], y: string[]) => x.length === y.length && x.every((l, i) => l === y[i]);
  let i = 0,
    ja = 0,
    jb = 0;
  for (;;) {
    let k = i;
    while (k < base.length && !(ma[k] >= ja && mb[k] >= jb)) k++; // next line both sides kept
    const ea = k < base.length ? ma[k] : a.length,
      eb = k < base.length ? mb[k] : b.length;
    const B = base.slice(i, k),
      A = a.slice(ja, ea),
      C = b.slice(jb, eb);
    if (eq(A, B)) out.push(...C);
    else if (eq(C, B) || eq(A, C)) out.push(...A);
    else return { clean: false };
    if (k >= base.length) break;
    out.push(base[k]);
    i = k + 1;
    ja = ea + 1;
    jb = eb + 1;
  }
  return { clean: true, text: out.join('\n') };
}

export class WebSync {
  plugin: MyOnePagePlugin;
  app: App;
  running: boolean;
  timer: number | undefined;
  status: string;
  warned: Set<string>;
  fresh: string | null = null; // the id of a page just given a new link: its link is copied once it is online

  constructor(plugin: MyOnePagePlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    for (const [key, old] of Object.entries(WEB_OLD)) {
      const v = this.app.loadLocalStorage(old) as string | null;
      if (v && !this.app.loadLocalStorage(key)) this.app.saveLocalStorage(key, v);
      if (v) this.app.saveLocalStorage(old, null);
    }
    this.running = false;
    this.timer = undefined;
    this.status = 'not connected';
    this.warned = new Set();
  }
  get server() {
    return (this.plugin.prefs.server || '').trim().replace(/\/+$/, '');
  }
  get token(): string {
    return (this.app.loadLocalStorage(WEB_TOKEN) as string | null) || '';
  }
  set token(v: string) {
    this.app.saveLocalStorage(WEB_TOKEN, v || null);
  }
  get ready() {
    return !!(this.server && this.token);
  }
  get acct() {
    return webAcct(this.token);
  }

  load(): State {
    let s: State | null = null;
    try {
      s = JSON.parse((this.app.loadLocalStorage(WEB_STATE) as string | null) || 'null') as State | null;
    } catch {
      /* none yet */
    }
    return s && s.server === this.server && s.acct === this.acct
      ? s
      : { server: this.server, acct: this.acct, pages: {} };
  }
  store(s: State) {
    this.app.saveLocalStorage(WEB_STATE, JSON.stringify(s));
  }

  async call(method: string, path: string, body?: object): Promise<{ status: number; data: unknown }> {
    const r = await WEB.requestUrl({
      url: this.server + path,
      method,
      throw: false,
      headers: { Authorization: `Bearer ${this.token}` },
      ...(body ? { contentType: 'application/json', body: JSON.stringify(body) } : {}),
    });
    let data: unknown = null;
    try {
      data = r.json as unknown;
    } catch {
      /* not JSON */
    }
    return { status: r.status, data };
  }

  soon(ms = 4000) {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(), ms);
  }

  // force: take more than two pages offline in one round (normally a sign the vault is not fully loaded).
  async run(force = false) {
    if (!this.ready || this.running) return;
    if (!this.acct) {
      this.status = 'old token: make a new one on the settings page';
      return;
    }
    this.running = true;
    try {
      await this.round(force);
      this.status = `synced ${new Date().toLocaleTimeString()}`;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.status = `error: ${err.message}`;
      this.plugin.log(`sync: ${err.stack || err.message}`);
    } finally {
      this.running = false;
    }
  }

  async round(force: boolean) {
    const state = this.load(),
      vault = this.app.vault,
      acct = this.acct;
    if (!acct) return;
    const list = await this.call('GET', '/api/owner/pages');
    if (list.status === 401) throw new Error('the token was refused: make a new one on the settings page');
    if (list.status !== 200) throw new Error(`server answered ${list.status}`);
    const remote = new Map((list.data as Summary[]).map((p) => [p.id, p]));

    const seen = new Map<string, TFile>(),
      upgraded: string[] = []; // id -> file; notes whose link changed
    for (const file of vault.getMarkdownFiles()) {
      if (frontmatter(this.app, file).share == null) continue;
      let text = await vault.read(file),
        share = webShare(text);
      if (share == null) continue;
      const page = webResolve(share, this.server, acct);
      if (!page) {
        new WEB.Notice(`${file.path}: share: must be "new" or a myone.page link`);
        continue;
      }
      if (page.link !== share) {
        const done = await this.replace(file, text, text.replace(/^share:.*$/m, `share: ${page.link}`));
        if (!done) continue;
        text = done;
        if (page.fresh) this.fresh = page.id;
        else if (page.upgraded) upgraded.push(file.basename);
      }
      if (seen.has(page.id)) {
        new WEB.Notice(
          `${file.path} has the same share link as ${seen.get(page.id)?.path ?? ''}: set share: new on the copy`,
        );
        continue;
      }
      seen.set(page.id, file);
      await this.one(state, acct, page, file, text, remote.get(page.id));
    }
    if (upgraded.length)
      new WEB.Notice(
        `MyOnePage: these pages are now encrypted and have new links (the old ones no longer work): ` +
          `${upgraded.join(', ')}. Send the new links again.`,
        0,
      );

    // pages that were shared from this device and no longer are
    const gone = Object.keys(state.pages).filter((id) => !seen.has(id));
    if (gone.length > 2 && !force) {
      new WEB.Notice(
        `MyOnePage: ${gone.length} pages are no longer shared. Run "Sync shared pages now" to take them offline.`,
      );
    } else
      for (const id of gone) {
        const r = await this.call('DELETE', `/api/owner/p/${id}`);
        if (r.status === 200 || r.status === 404) delete state.pages[id];
      }
    this.store(state);
  }

  async one(state: State, acct: string, page: Page, file: TFile, text: string, summary: Summary | undefined) {
    const { id, key, link } = page,
      address = `${acct}/${id}`;
    const fm = frontmatter(this.app, file);
    const acl = { editors: webList(fm.editors), viewers: webList(fm.viewers) };
    const { pub, own } = webSplit(text);
    let st = state.pages[id];
    if (st && st.conflict) {
      if (this.app.vault.getAbstractFileByPath(st.conflict)) return; // waiting for you to settle it
      delete st.conflict;
    }
    const put = async (base: number, body: string) => {
      const r = await this.call('PUT', `/api/owner/p/${id}`, {
        base,
        text: await SEAL.seal(key, address, body),
        ...acl,
      });
      if (r.status !== 200) return null; // 409: the next round sees the web change
      return (r.data as { version: number }).version;
    };
    const keep = (base: string, version: number, extra?: Partial<PageState>) => {
      state.pages[id] = { path: file.path, base, version, key, ...extra };
    };

    if (!summary) {
      // new, or gone from the server: publish the note as it is
      const v = await put(0, pub);
      if (v == null) return;
      keep(pub, v);
      if (this.fresh === id) {
        try {
          await navigator.clipboard.writeText(link);
        } catch {
          /* no clipboard: the link is in the note */
        }
        new WEB.Notice(`Shared ${file.basename}: link copied\n${link}`);
        this.fresh = null;
      }
      return;
    }

    const aclChanged = JSON.stringify(acl) !== JSON.stringify({ editors: summary.editors, viewers: summary.viewers });
    const local = !st || pub !== st.base || st.key !== key,
      web = !st || summary.version !== st.version;
    if (st && !local && !web) {
      if (aclChanged) await this.call('PUT', `/api/owner/p/${id}`, { base: summary.version, text: null, ...acl });
      st.path = file.path;
      return;
    }
    if (st && local && !web) {
      const v = await put(st.version, pub);
      if (v != null) keep(pub, v);
      return;
    }
    const r = await this.call('GET', `/api/owner/p/${id}`);
    if (r.status !== 200) return;
    const got = r.data as { version: number; text: string };
    let w;
    try {
      w = { version: got.version, text: await webOpen(key, address, got.text) };
    } catch {
      if (!this.warned.has(id))
        new WEB.Notice(
          `MyOnePage: the web copy of ${file.basename} does not open with the key in its link. ` +
            'The note was left as it is.',
          0,
        );
      this.warned.add(id);
      return;
    }
    if (!local || pub === w.text) {
      // only the web changed (or both the same way)
      if (pub !== w.text && !(await this.replace(file, text, webJoin(w.text, own)))) return;
      keep(w.text, w.version);
      if (aclChanged) await this.call('PUT', `/api/owner/p/${id}`, { base: w.version, text: null, ...acl });
      return;
    }
    const m = webMerge(st ? st.base : '', pub, w.text);
    if (m.clean) {
      if (!(await this.replace(file, text, webJoin(m.text, own)))) return;
      const v = await put(w.version, m.text);
      if (v != null) keep(m.text, v);
      else keep(w.text, w.version);
      return;
    }
    const copy =
      (file.parent && file.parent.path !== '/' ? file.parent.path + '/' : '') + `${file.basename} (web version).md`;
    const old = this.app.vault.getFileByPath(copy);
    if (old) await this.app.vault.modify(old, w.text);
    else await this.app.vault.create(copy, w.text);
    keep(w.text, w.version, { conflict: copy });
    new WEB.Notice(
      `${file.basename} was edited here and on the web in the same places. The web text is in "${copy}": ` +
        'bring what you want into the note, then delete that file.',
      0,
    );
  }

  // Write a note only if it still holds what we read: a change typed meanwhile wins, and waits for the next round.
  async replace(file: TFile, was: string, now: string) {
    let ok = false;
    await this.app.vault.process(file, (cur) => {
      ok = cur === was;
      return ok ? now : cur;
    });
    return ok ? now : null;
  }
}

export class WebSettings extends WEB.PluginSettingTab {
  plugin: MyOnePagePlugin;
  constructor(app: App, plugin: MyOnePagePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl: el } = this,
      p = this.plugin,
      sync = p.web;
    el.empty();
    new WEB.Setting(el)
      .setName('HTML export folder')
      .setDesc('Where the HTML button saves <note>.html, relative to the vault. Empty: next to the note.')
      .addText((t) =>
        t
          .setPlaceholder('Exports')
          .setValue(p.prefs.htmlFolder || '')
          .onChange(async (v) => {
            p.prefs.htmlFolder = v.trim().replace(/^\/+|\/+$/g, '');
            await p.saveSettings();
          }),
      );
    new WEB.Setting(el).setName('Share on the web').setHeading();
    el.createEl('p', {
      text:
        'Share a note on the web: put "share: new" in its frontmatter, plus "editors:" and "viewers:" lists of ' +
        'emails, @domains, or anyone (whoever has the link). share: then holds the link, which is copied when the page is published. ' +
        'The note is encrypted on this device and the key is the part of the link after #, so the server cannot read it: ' +
        'whoever has the full link and is allowed in can. To cut off an anyone page, set share: new (a new link). ' +
        'This needs an account on a sharing server such as myone.page; notes go only to the server set here, and only notes with share:.',
    });
    new WEB.Setting(el)
      .setName('Server')
      .setDesc(
        createFragment((f) => {
          f.appendText('For example ');
          f.createEl('a', { text: 'https://myone.page', href: 'https://myone.page' });
        }),
      )
      .addText((t) =>
        t
          .setPlaceholder('https://myone.page')
          .setValue(p.prefs.server || '')
          .onChange(async (v) => {
            p.prefs.server = v.trim();
            await p.saveSettings();
          }),
      );
    new WEB.Setting(el)
      .setName('Token')
      .setDesc(
        createFragment((f) => {
          f.appendText(
            "From the server's settings page, signed in with an account allowed to publish. Kept on this device only. ",
          );
          if (sync.server) f.createEl('a', { text: 'Open settings page', href: `${sync.server}/settings` });
        }),
      )
      .addText((t) => {
        t.inputEl.type = 'password';
        t.setValue(sync.token).onChange((v) => {
          sync.token = v.trim();
        });
      });
    new WEB.Setting(el)
      .setName('Sync every')
      .setDesc(
        'Seconds, while Obsidian is open. Changes in a shared note also sync a few seconds after you stop typing.',
      )
      .addText((t) =>
        t.setValue(String(p.prefs.every || 60)).onChange(async (v) => {
          p.prefs.every = Math.max(15, Number(v) || 60);
          await p.saveSettings();
          p.schedule();
        }),
      );
    new WEB.Setting(el)
      .setName('Status')
      .setDesc(sync.status)
      .addButton((b) =>
        b.setButtonText('Sync now').onClick(async () => {
          await sync.run(true);
          this.display();
        }),
      );
  }
}
