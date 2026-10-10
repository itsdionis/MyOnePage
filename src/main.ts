// Obsidian plugin: opens a note as a MyOnePage. The engine (md.js, engine.js, engine.css) runs unchanged
// inside a sandboxed iframe; a shim stands in for the server: its fetch GET reads the note, PUT writes it.
// esbuild bundles it into main.js, with the engine files as text (`?text`, see esbuild.config.mjs).
import { Plugin, TextFileView, MarkdownView, Notice, Modal, TFile, normalizePath, setIcon } from 'obsidian';
import type { WorkspaceLeaf, View } from 'obsidian';
import css from '../engine/engine.css?text';
import md from '../engine/md.js?text';
import js from '../engine/engine.js?text';
import { WebSync, WebSettings, frontmatter, webLive, webList, webShare } from './web';
import type { Frontmatter } from './web';

const ENGINE = { css, md, js };

const VIEW = 'myone-page';
const FLAG = 'myone.page'; // frontmatter `myone.page: true` opens the note as a page
const esc = (s: string, tag: string) => s.replace(new RegExp('</' + tag, 'gi'), '<\\/' + tag);

// Runs in the iframe before engine.js.
const SHIM = `(function(){
  const pend=new Map(); let n=0;
  addEventListener('message',e=>{ const d=e.data;
    if(e.source===parent&&d&&d.op==='theme') document.documentElement.dataset.theme=d.theme;
    if(e.source===parent&&d&&d.op==='reply'&&pend.has(d.n)){ pend.get(d.n)(d); pend.delete(d.n); } });
  const ask=(op,body)=>new Promise(res=>{ const k=++n; pend.set(k,res); parent.postMessage({myonepage:true,op,n:k,body},'*'); });
  window.HOST={ sources:async()=>(await ask('sources')).sources, saveHTML:async(html)=>(await ask('html',html)).text };
  const log=(...a)=>parent.postMessage({myonepage:true,op:'log',body:a.map(String).join(' ')},'*');
  addEventListener('error',e=>log('error:',e.message,'at',e.lineno+':'+e.colno));
  addEventListener('unhandledrejection',e=>log('rejection:',e.reason&&(e.reason.stack||e.reason)));
  for(const k of ['replaceState','pushState']){ const f=history[k].bind(history); // the srcdoc URL may refuse a hash
    history[k]=(...a)=>{ try{ f(...a); }catch{ /* the srcdoc URL may refuse a hash */ } }; }
  window.fetch=async(url,opt)=>{
    if(opt&&opt.method==='PUT'){ const r=await ask('put',opt.body); return new Response('',{status:r.ok?200:500}); }
    const r=await ask('get'); return new Response(r.text,{status:200});
  };
  addEventListener('click',e=>{ // links go to Obsidian: web links open in the browser, the rest as notes
    const a=e.target.closest&&e.target.closest('a[href]'); if(!a||e.defaultPrevented) return;
    const h=a.getAttribute('href'); if(!h||h[0]==='#') return;
    e.preventDefault(); ask('open',h);
  });
})();`;

// What the iframe posts to the plugin (see SHIM).
interface Message {
  myonepage?: boolean;
  op?: string;
  n?: number;
  body?: unknown;
}
export interface Prefs {
  server: string;
  token: string; // the sharing server's token (see WebSync): in data.json, so it syncs with the vault
  every: number;
  htmlFolder: string;
}
type Mode = 'source' | 'preview';

const theme = () => (document.body.classList.contains('theme-light') ? 'light' : 'dark');

function page() {
  return `<!doctype html><html data-theme="${theme()}"><head><meta charset="utf-8">
<style>${esc(ENGINE.css, 'style')}
#dl{display:none}</style></head><body>
<script>${esc(SHIM, 'script')}</script>
<script>${esc(ENGINE.md, 'script')}</script>
<script>${esc(ENGINE.js, 'script')}</script>
</body></html>`;
}

class MyOnePageView extends TextFileView {
  plugin: MyOnePagePlugin;
  frame: HTMLIFrameElement | null = null;
  shown: string | null = null;
  shareAction: HTMLElement | null = null;
  constructor(leaf: WorkspaceLeaf, plugin: MyOnePagePlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW;
  }
  getDisplayText() {
    return this.file ? this.file.basename : 'myone.page';
  }
  getIcon() {
    return 'layout-template';
  }

  onload() {
    super.onload();
    this.addAction('rotate-cw', 'Reload the page from the file', () => this.show(true));
    this.addAction('book-open', 'Reading view', () => this.plugin.asMarkdown(this.leaf, this.file, 'preview'));
    this.addAction('pencil', 'Editing view', () => this.plugin.asMarkdown(this.leaf, this.file, 'source'));
    this.shareAction = this.addAction('share-2', 'Share on the web', () => this.plugin.shareOrOpen(this.file));
    this.registerDomEvent(window, 'message', (e) => void this.onMessage(e));
  }

  getViewData() {
    return this.data;
  }
  setViewData(data: string, clear: boolean) {
    this.data = data;
    this.show(clear);
    this.refreshShare();
  }

  // The share button: shares the note, or opens its web copy once it has a link.
  refreshShare() {
    if (!this.shareAction || !this.file) return;
    const s = this.plugin.shareState(this.file);
    setIcon(
      this.shareAction,
      s === 'live' ? 'globe' : s === 'pending' ? 'loader' : s === 'waiting' ? 'clock' : 'share-2',
    );
    this.shareAction.setAttribute(
      'aria-label',
      s === 'live'
        ? 'Open on the web'
        : s === 'pending'
          ? 'Publishing…'
          : s === 'waiting'
            ? 'Waiting for room to share: see plans'
            : 'Share on the web',
    );
  }
  clear() {
    this.data = '';
  }

  // Rebuild the iframe unless it already shows this text (our own save comes back as a modify event).
  show(force?: boolean) {
    if (!force && this.frame && this.shown === this.data) return;
    this.shown = this.data;
    this.contentEl.empty();
    this.contentEl.addClass('myone-page-host');
    this.frame = this.contentEl.createEl('iframe', { cls: 'myone-page-frame' });
    this.frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads');
    this.frame.srcdoc = page();
  }

  async onMessage(e: MessageEvent) {
    const d = e.data as Message | null,
      win = this.frame?.contentWindow;
    if (!win || e.source !== win || !d || !d.myonepage) return;
    const reply = (x: object) => win.postMessage({ op: 'reply', n: d.n, ...x }, '*');
    if (d.op === 'log') return this.plugin.log(`${this.file ? this.file.path : '?'}: ${String(d.body)}`);
    if (d.op === 'sources') return reply({ sources: ENGINE });
    if (d.op === 'html') {
      try {
        if (!this.file) throw new Error('no file');
        reply({ text: await this.plugin.saveHTML(this.file, String(d.body)) });
      } catch (err) {
        console.error(err);
        reply({ text: 'could not save the HTML file' });
      }
      return;
    }
    if (d.op === 'get') return reply({ text: this.file ? await this.app.vault.read(this.file) : this.data });
    if (d.op === 'put') {
      try {
        this.data = this.shown = String(d.body);
        await this.save();
        reply({ ok: true });
      } catch (err) {
        console.error(err);
        reply({ ok: false });
      }
      return;
    }
    if (d.op === 'open') {
      const h = String(d.body);
      if (/^(https?|mailto):/i.test(h)) window.open(h);
      else void this.app.workspace.openLinkText(decodeURIComponent(h), this.file ? this.file.path : '', true);
    }
  }
}

// Every note shared on the web, read from the vault (the server never lists pages to anyone).
class SharedPages extends Modal {
  plugin: MyOnePagePlugin;
  constructor(plugin: MyOnePagePlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this,
      web = this.plugin.web;
    this.titleEl.setText('Shared on the web');
    const site = web.server;
    const top = contentEl.createDiv('myone-page-shared-site');
    top.createEl('a', { text: site.replace(/^https?:\/\//, ''), href: site });
    if (web.ready)
      top.createEl('a', { text: 'Settings', href: '#' }).onclick = (e) => {
        e.preventDefault();
        void web.ownerLink(`${site}/settings`).then((u) => window.open(u));
      };
    const rows = this.app.vault
      .getMarkdownFiles()
      .map((f): [TFile, Frontmatter] => [f, frontmatter(this.app, f)])
      .filter(([, fm]) => fm.share != null)
      .sort((a, b) => b[0].stat.mtime - a[0].stat.mtime);
    if (!rows.length) contentEl.createEl('p', { text: 'Nothing is shared yet. Use the share button on a page.' });
    for (const [f, fm] of rows) {
      const link = String(fm.share).trim(),
        live = webLive(link),
        eds = webList(fm.editors),
        vws = webList(fm.viewers);
      const row = contentEl.createDiv('myone-page-shared'),
        info = row.createDiv('myone-page-shared-info');
      info.createDiv({
        cls: 'myone-page-shared-title',
        text: String((fm.title as string | number | undefined) || f.basename),
      });
      const who = [...eds.map((e) => `✎ ${e}`), ...vws].join(' · ') || 'only you';
      const waits = /^waiting$/i.test(link);
      info.createDiv({ cls: 'myone-page-shared-who', text: live ? who : waits ? 'waiting for room' : 'publishing…' });
      if ([...eds, ...vws].includes('anyone'))
        info.createSpan({ cls: 'myone-page-shared-open', text: 'anyone with the link' });
      const btns = row.createDiv('myone-page-shared-btns');
      const btn = (icon: string, label: string, fn: () => void) => {
        const b = btns.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
        setIcon(b, icon);
        b.onclick = fn;
      };
      btn('file-text', 'Open note', () => {
        void this.app.workspace.getLeaf('tab').openFile(f);
        this.close();
      });
      if (live) {
        btn('copy', 'Copy link', () => void navigator.clipboard.writeText(link).then(() => new Notice('Link copied')));
        btn('globe', 'Open in browser', () => void web.ownerLink(link).then((u) => window.open(u)));
      }
    }
  }
  onClose() {
    this.contentEl.empty();
  }
}

export default class MyOnePagePlugin extends Plugin {
  prefs: Prefs = { server: '', token: '', every: 60, htmlFolder: '' };
  web!: WebSync;
  every = 0;
  markdownLeaves = new WeakMap<WorkspaceLeaf, string>(); // leaf -> path the user chose to read as Markdown
  pageActions = new WeakMap<View, HTMLElement>(); // Markdown view -> its MyOnePage button

  async onload() {
    this.prefs = Object.assign(this.prefs, (await this.loadData()) as Partial<Prefs> | null);
    this.web = new WebSync(this);
    this.addSettingTab(new WebSettings(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      this.schedule();
      this.web.soon(3000);
    });
    // a shared note changed (seen once Obsidian has re-read its frontmatter): sync once typing stops
    this.registerEvent(
      this.app.metadataCache.on('changed', (file, data, cache) => {
        if (cache?.frontmatter?.share != null) this.web.soon();
      }),
    );
    this.addCommand({
      id: 'web-share',
      name: 'Share current note on the web',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') return false;
        if (!checking) void this.shareOrOpen(file);
        return true;
      },
    });
    this.addCommand({ id: 'web-list', name: 'List shared pages', callback: () => new SharedPages(this).open() });
    this.addRibbonIcon('globe', 'Shared pages', () => new SharedPages(this).open());
    this.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW))
          if (leaf.view instanceof MyOnePageView && leaf.view.file === file) leaf.view.refreshShare();
      }),
    );
    this.addCommand({
      id: 'web-link',
      name: 'Copy web link of current note',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile(),
          share = file && frontmatter(this.app, file).share;
        const link = typeof share === 'string' ? share.trim() : '';
        if (!webLive(link)) return false;
        if (!checking) void navigator.clipboard.writeText(link).then(() => new Notice('Link copied'));
        return true;
      },
    });
    this.addCommand({
      id: 'web-sync',
      name: 'Sync shared pages now',
      callback: async () => {
        if (!this.web.ready) return new Notice('MyOnePage: nothing is shared yet. Use the share button on a page.');
        await this.web.run(true);
        new Notice(`MyOnePage: ${this.web.status}`);
      },
    });

    this.registerView(VIEW, (leaf) => new MyOnePageView(leaf, this));
    this.registerEvent(
      this.app.workspace.on('css-change', () => {
        // the page follows the light/dark theme
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW))
          if (leaf.view instanceof MyOnePageView)
            leaf.view.frame?.contentWindow?.postMessage({ op: 'theme', theme: theme() }, '*');
      }),
    );

    this.addCommand({
      id: 'open',
      name: 'Open current note as a one-pager',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return false;
        if (!checking) void this.asPage(view.leaf, view.file);
        return true;
      },
    });
    this.addCommand({
      id: 'cycle',
      name: 'Cycle view: editing, reading, one-pager',
      checkCallback: (checking) => {
        const page = this.app.workspace.getActiveViewOfType(MyOnePageView),
          md = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (page?.file) {
          if (!checking) void this.asMarkdown(page.leaf, page.file, 'source');
          return true;
        }
        if (!md?.file) return false;
        if (checking) return true;
        if (md.getMode() === 'source') void this.asMarkdown(md.leaf, md.file, 'preview');
        else void this.asPage(md.leaf, md.file);
        return true;
      },
    });
    this.addCommand({
      id: 'markdown',
      name: 'Open current one-pager as Markdown',
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MyOnePageView);
        if (!view) return false;
        if (!checking) void this.asMarkdown(view.leaf, view.file);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file, source, leaf) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        if (leaf && leaf.view.getViewType() === VIEW)
          menu.addItem((i) =>
            i
              .setTitle('Open as Markdown')
              .setIcon('file-text')
              .onClick(() => void this.asMarkdown(leaf, file)),
          );
        else
          menu.addItem((i) =>
            i
              .setTitle('Open as MyOnePage')
              .setIcon('layout-template')
              .onClick(
                () =>
                  void (leaf
                    ? this.asPage(leaf, file)
                    : this.app.workspace
                        .getLeaf('tab')
                        .setViewState({ type: VIEW, state: { file: file.path }, active: true })),
              ),
          );
      }),
    );

    // A flagged note opens as a page, unless the user switched that tab to Markdown for it.
    // Checked after the open has finished (a switch made during it gets overwritten), on every
    // Markdown tab showing a flagged note. Never getLeaf() here: with "open in new tab"
    // (Open Tab Settings) that creates a fresh empty tab.
    const sweep = () => window.setTimeout(() => this.sweep(), 0);
    this.registerEvent(this.app.workspace.on('file-open', sweep));
    this.registerEvent(this.app.workspace.on('layout-change', sweep));
    this.registerEvent(this.app.metadataCache.on('changed', sweep)); // the flag was just added
    this.app.workspace.onLayoutReady(sweep);
  }

  async saveSettings() {
    await this.saveData(this.prefs);
  }

  shareState(file: TFile) {
    const v = frontmatter(this.app, file).share;
    if (v == null) return 'none';
    if (webLive(v)) return 'live';
    return typeof v === 'string' && /^waiting$/i.test(v.trim()) ? 'waiting' : 'pending';
  }

  // Shared: open the web copy. Not shared: add share: new and publish (only you can open it until
  // editors: or viewers: name someone).
  async shareOrOpen(file: TFile | null) {
    if (!file) return;
    const v = frontmatter(this.app, file).share;
    if (webLive(v)) return window.open(await this.web.ownerLink(String(v).trim()));
    if (this.shareState(file) === 'waiting')
      return window.open(await this.web.ownerLink(`${this.web.server}/settings`));
    if (!this.web.ready) {
      const err = await this.web.register();
      if (err) return new Notice(`MyOnePage: could not start sharing: ${err}`);
    }
    if (v == null)
      await this.app.vault.process(file, (text) =>
        webShare(text) != null
          ? text
          : text.startsWith('---\n')
            ? text.replace(/^---\n/, '---\nshare: new\neditors: []\nviewers: []\n')
            : `---\nshare: new\neditors: []\nviewers: []\n---\n${text}`,
      );
    new Notice('MyOnePage: publishing. The link is copied when it is online; add editors: or viewers: to share it.');
    this.web.soon(500);
  }
  schedule() {
    if (this.every) window.clearInterval(this.every);
    this.every = this.registerInterval(window.setInterval(() => void this.web.run(), (this.prefs.every || 60) * 1000));
  }

  sweep() {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      const file = view.file,
        flagged = !!file && this.flagged(file),
        action = this.pageActions.get(view);
      if (flagged && !action)
        this.pageActions.set(
          view,
          view.addAction('layout-template', 'myone.page view', () => view.file && this.asPage(leaf, view.file)),
        );
      else if (!flagged && action) {
        action.remove();
        this.pageActions.delete(view);
      }
      if (!file || !flagged || this.markdownLeaves.get(leaf) === file.path) continue;
      void this.asPage(leaf, file, leaf === this.app.workspace.getMostRecentLeaf());
    }
  }

  onunload() {
    // take the MyOnePage button off Markdown tabs
    window.clearTimeout(this.web.timer);
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      this.pageActions.get(leaf.view)?.remove();
      this.pageActions.delete(leaf.view);
    }
  }

  // HTML button: <note>.html in the HTML export folder of the settings (created if missing), or next to the note
  // when none is set; replaced if it is there. Returns the status line the page shows.
  async saveHTML(file: TFile, html: string) {
    const dir = normalizePath(this.prefs.htmlFolder || file.parent?.path || '/');
    if (dir !== '/' && !this.app.vault.getFolderByPath(dir)) await this.app.vault.createFolder(dir);
    const p = normalizePath(`${dir === '/' ? '' : dir + '/'}${file.basename}.html`),
      old = this.app.vault.getFileByPath(p);
    if (old) await this.app.vault.modify(old, html);
    else await this.app.vault.create(p, html);
    new Notice(`Saved ${p}`);
    return `saved ${p}`;
  }

  // Errors from the pages go to the console and to log.txt in the plugin folder.
  log(msg: string) {
    console.error('[myone.page]', msg); // only page errors and sync failures come here
    const path = `${this.manifest.dir}/log.txt`,
      line = `${new Date().toISOString()} ${msg}\n`;
    this.app.vault.adapter.append(path, line).catch(() => {});
  }

  flagged(file: TFile) {
    const fm = frontmatter(this.app, file);
    return fm[FLAG] === true || fm[FLAG] === 'true';
  }
  asPage(leaf: WorkspaceLeaf, file: TFile, active = true) {
    this.markdownLeaves.delete(leaf);
    return leaf.setViewState({ type: VIEW, state: { file: file.path }, active });
  }
  asMarkdown(leaf: WorkspaceLeaf, file: TFile | null, mode?: Mode) {
    // mode: 'source' (editing) or 'preview' (reading); default keeps the user's setting
    if (!file) return;
    this.markdownLeaves.set(leaf, file.path);
    const state = mode ? { file: file.path, mode, source: false } : { file: file.path };
    return leaf.setViewState({ type: 'markdown', state, active: true });
  }
}
