// Obsidian plugin: opens a note as a one-pager. The engine (md.js, engine.js, engine.css) runs unchanged
// inside a sandboxed iframe; a shim stands in for the server: its fetch GET reads the note, PUT writes it.
// esbuild bundles it into main.js, with the engine files as text (`?text`, see esbuild.config.mjs).
import { Plugin, TextFileView, MarkdownView, Notice, Modal, Platform, setIcon } from 'obsidian';
import css from '../engine/engine.css?text';
import md from '../engine/md.js?text';
import js from '../engine/engine.js?text';
import { WebSync, WebSettings, webLive, webList, webShare } from './web.js';

const ENGINE = { css, md, js };

const VIEW = 'myone-page';
const FLAG = 'myone.page';           // frontmatter `myone.page: true` opens the note as a page
const esc = (s, tag) => s.replace(new RegExp('</' + tag, 'gi'), '<\\/' + tag);

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

const theme = () => document.body.classList.contains('theme-light') ? 'light' : 'dark';

function page(md) {
  return `<!doctype html><html data-theme="${theme()}"><head><meta charset="utf-8">
<style>${esc(ENGINE.css, 'style')}
#dl{display:none}</style></head><body>
<script>${esc(SHIM, 'script')}</script>
<script>${esc(ENGINE.md, 'script')}</script>
<script>${esc(ENGINE.js, 'script')}</script>
</body></html>`;
}

// Electron's save dialog and Node's fs, on desktop only; null when this Obsidian does not expose them.
function desktopDialog() {
  try {
    const req = window.require;
    const { remote } = req('electron');
    return remote?.dialog ? { remote, path: req('path'), fs: req('fs') } : null;
  } catch {
    return null;
  }
}

class MyOnePageView extends TextFileView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; this.frame = null; this.shown = null; }
  getViewType() { return VIEW; }
  getDisplayText() { return this.file ? this.file.basename : 'myone.page'; }
  getIcon() { return 'layout-template'; }

  onload() {
    super.onload();
    this.addAction('rotate-cw', 'Reload the page from the file', () => this.show(true));
    this.addAction('book-open', 'Reading view', () => this.plugin.asMarkdown(this.leaf, this.file, 'preview'));
    this.addAction('pencil', 'Editing view', () => this.plugin.asMarkdown(this.leaf, this.file, 'source'));
    this.shareAction = this.addAction('share-2', 'Share on the web', () => this.plugin.shareOrOpen(this.file));
    this.registerDomEvent(window, 'message', (e) => this.onMessage(e));
  }

  getViewData() { return this.data; }
  setViewData(data, clear) { this.data = data; this.show(clear); this.refreshShare(); }

  // The share button: shares the note, or opens its web copy once it has a link.
  refreshShare() {
    if (!this.shareAction || !this.file) return;
    const s = this.plugin.shareState(this.file);
    setIcon(this.shareAction, s === 'live' ? 'globe' : s === 'pending' ? 'loader' : 'share-2');
    this.shareAction.setAttribute('aria-label', s === 'live' ? 'Open on the web' : s === 'pending' ? 'Publishing…' : 'Share on the web');
  }
  clear() { this.data = ''; }

  // Rebuild the iframe unless it already shows this text (our own save comes back as a modify event).
  show(force) {
    if (!force && this.frame && this.shown === this.data) return;
    this.shown = this.data;
    this.contentEl.empty();
    this.contentEl.addClass('one-pager-host');
    this.frame = this.contentEl.createEl('iframe', { cls: 'one-pager-frame' });
    this.frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads');
    this.frame.srcdoc = page(this.data);
  }

  async onMessage(e) {
    const d = e.data;
    if (!this.frame || e.source !== this.frame.contentWindow || !d || !d.myonepage) return;
    const reply = (x) => this.frame.contentWindow.postMessage({ op: 'reply', n: d.n, ...x }, '*');
    if (d.op === 'log') return this.plugin.log(`${this.file ? this.file.path : '?'}: ${d.body}`);
    if (d.op === 'sources') return reply({ sources: ENGINE });
    if (d.op === 'html') {
      try { reply({ text: await this.plugin.saveHTML(this.file, d.body) }); }
      catch (err) { console.error(err); reply({ text: 'could not save the HTML file' }); }
      return;
    }
    if (d.op === 'get') return reply({ text: this.file ? await this.app.vault.read(this.file) : this.data });
    if (d.op === 'put') {
      try { this.data = this.shown = d.body; await this.save(); reply({ ok: true }); }
      catch (err) { console.error(err); reply({ ok: false }); }
      return;
    }
    if (d.op === 'open') {
      const h = String(d.body);
      if (/^(https?|mailto):/i.test(h)) window.open(h);
      else this.app.workspace.openLinkText(decodeURIComponent(h), this.file ? this.file.path : '', true);
    }
  }
}

// Every note shared on the web, read from the vault (the server never lists pages to anyone).
class SharedPages extends Modal {
  constructor(plugin) { super(plugin.app); this.plugin = plugin; }
  onOpen() {
    const { contentEl } = this, web = this.plugin.web;
    this.titleEl.setText('Shared on the web');
    const site = web.server || 'https://myone.page';
    const top = contentEl.createDiv('one-pager-shared-site');
    top.createEl('a', { text: site.replace(/^https?:\/\//, ''), href: site });
    if (web.server) top.createEl('a', { text: 'Settings', href: `${site}/settings` });
    const rows = this.app.vault.getMarkdownFiles()
      .map((f) => [f, this.app.metadataCache.getFileCache(f)?.frontmatter])
      .filter(([, fm]) => fm && fm.share != null)
      .sort((a, b) => b[0].stat.mtime - a[0].stat.mtime);
    if (!rows.length) contentEl.createEl('p', { text: 'Nothing is shared yet. Use the share button on a page.' });
    for (const [f, fm] of rows) {
      const link = String(fm.share).trim(), live = webLive(link), eds = webList(fm.editors), vws = webList(fm.viewers);
      const row = contentEl.createDiv('one-pager-shared'), info = row.createDiv('one-pager-shared-info');
      info.createDiv({ cls: 'one-pager-shared-title', text: String(fm.title || f.basename) });
      const who = [...eds.map((e) => `✎ ${e}`), ...vws].join(' · ') || 'only you';
      info.createDiv({ cls: 'one-pager-shared-who', text: live ? who : 'publishing…' });
      if ([...eds, ...vws].includes('anyone')) info.createSpan({ cls: 'one-pager-shared-open', text: 'anyone with the link' });
      const btns = row.createDiv('one-pager-shared-btns');
      const btn = (icon, label, fn) => { const b = btns.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } }); setIcon(b, icon); b.onclick = fn; };
      btn('file-text', 'Open note', () => { this.app.workspace.getLeaf('tab').openFile(f); this.close(); });
      if (live) {
        btn('copy', 'Copy link', () => navigator.clipboard.writeText(link).then(() => new Notice('Link copied')));
        btn('globe', 'Open in browser', () => window.open(link));
      }
    }
  }
  onClose() { this.contentEl.empty(); }
}

export default class MyOnePagePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({ server: '', every: 60 }, await this.loadData());
    this.web = new WebSync(this);
    this.addSettingTab(new WebSettings(this.app, this));
    this.app.workspace.onLayoutReady(() => { this.schedule(); this.web.soon(3000); });
    // a shared note changed (seen once Obsidian has re-read its frontmatter): sync once typing stops
    this.registerEvent(this.app.metadataCache.on('changed', (file, data, cache) => {
      if (cache?.frontmatter?.share != null) this.web.soon();
    }));
    this.addCommand({ id: 'web-share', name: 'Share current note on the web', checkCallback: (checking) => {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== 'md' || !this.web.ready) return false;
      if (!checking) this.shareOrOpen(file);
      return true;
    } });
    this.addCommand({ id: 'web-list', name: 'List shared pages', callback: () => new SharedPages(this).open() });
    this.addRibbonIcon('globe', 'Shared pages', () => new SharedPages(this).open());
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) if (leaf.view.file === file) leaf.view.refreshShare();
    }));
    this.addCommand({ id: 'web-link', name: 'Copy web link of current note', checkCallback: (checking) => {
      const file = this.app.workspace.getActiveFile(), fm = file && this.app.metadataCache.getFileCache(file)?.frontmatter;
      const link = fm && String(fm.share ?? '').trim();
      if (!webLive(link)) return false;
      if (!checking) navigator.clipboard.writeText(link).then(() => new Notice('Link copied'));
      return true;
    } });
    this.addCommand({ id: 'web-sync', name: 'Sync shared pages now', callback: async () => {
      if (!this.web.ready) return new Notice('MyOnePage: set the server and token in the plugin settings first');
      await this.web.run(true); new Notice(`MyOnePage: ${this.web.status}`);
    } });

    this.markdownLeaves = new WeakMap(); // leaf -> path the user chose to read as Markdown
    this.registerView(VIEW, (leaf) => new MyOnePageView(leaf, this));
    this.registerEvent(this.app.workspace.on('css-change', () => { // the page follows the light/dark theme
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW))
        leaf.view.frame?.contentWindow?.postMessage({ op: 'theme', theme: theme() }, '*');
    }));

    this.addCommand({ id: 'open', name: 'Open current note as a one-pager', checkCallback: (checking) => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || !view.file) return false;
      if (!checking) this.asPage(view.leaf, view.file);
      return true;
    } });
    this.addCommand({ id: 'cycle', name: 'Cycle view: editing, reading, one-pager', checkCallback: (checking) => {
      const page = this.app.workspace.getActiveViewOfType(MyOnePageView), md = this.app.workspace.getActiveViewOfType(MarkdownView);
      const view = page || md; if (!view || !view.file) return false;
      if (checking) return true;
      if (page) this.asMarkdown(page.leaf, page.file, 'source');
      else if (md.getMode() === 'source') this.asMarkdown(md.leaf, md.file, 'preview');
      else this.asPage(md.leaf, md.file);
      return true;
    } });
    this.addCommand({ id: 'markdown', name: 'Open current one-pager as Markdown', checkCallback: (checking) => {
      const view = this.app.workspace.getActiveViewOfType(MyOnePageView);
      if (!view) return false;
      if (!checking) this.asMarkdown(view.leaf, view.file);
      return true;
    } });

    this.registerEvent(this.app.workspace.on('file-menu', (menu, file, source, leaf) => {
      if (file.extension !== 'md') return;
      if (leaf && leaf.view.getViewType() === VIEW)
        menu.addItem((i) => i.setTitle('Open as Markdown').setIcon('file-text').onClick(() => this.asMarkdown(leaf, file)));
      else
        menu.addItem((i) => i.setTitle('Open as one-pager').setIcon('layout-template')
          .onClick(() => leaf ? this.asPage(leaf, file) : this.app.workspace.getLeaf('tab').setViewState({ type: VIEW, state: { file: file.path }, active: true })));
    }));

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

  async saveSettings() { await this.saveData(this.settings); }

  shareState(file) {
    const v = this.app.metadataCache.getFileCache(file)?.frontmatter?.share;
    return v == null ? 'none' : webLive(v) ? 'live' : 'pending';
  }

  // Shared: open the web copy. Not shared: add share: new and publish (only you can open it until
  // editors: or viewers: name someone).
  async shareOrOpen(file) {
    if (!file) return;
    const v = this.app.metadataCache.getFileCache(file)?.frontmatter?.share;
    if (webLive(v)) return window.open(String(v).trim());
    if (!this.web.ready) return new Notice('MyOnePage: set the server and token in the plugin settings first');
    if (v == null) await this.app.vault.process(file, (text) => webShare(text) != null ? text
      : text.startsWith('---\n') ? text.replace(/^---\n/, '---\nshare: new\neditors: []\nviewers: []\n')
      : `---\nshare: new\neditors: []\nviewers: []\n---\n${text}`);
    new Notice('MyOnePage: publishing. The link is copied when it is online; add editors: or viewers: to share it.');
    this.web.soon(500);
  }
  schedule() {
    if (this.every) window.clearInterval(this.every);
    this.every = this.registerInterval(window.setInterval(() => this.web.run(), (this.settings.every || 60) * 1000));
  }

  sweep() {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view, file = view.file, flagged = !!file && this.flagged(file);
      if (flagged && !view.myOnePageAction && view.addAction)
        view.myOnePageAction = view.addAction('layout-template', 'myone.page view', () => view.file && this.asPage(leaf, view.file));
      else if (!flagged && view.myOnePageAction) { view.myOnePageAction.remove(); view.myOnePageAction = null; }
      if (!flagged || this.markdownLeaves.get(leaf) === file.path) continue;
      this.asPage(leaf, file, leaf === this.app.workspace.getMostRecentLeaf());
    }
  }

  onunload() { // take the one-pager button off Markdown tabs
    window.clearTimeout(this.web.timer);
    for (const leaf of this.app.workspace.getLeavesOfType('markdown'))
      if (leaf.view.myOnePageAction) { leaf.view.myOnePageAction.remove(); leaf.view.myOnePageAction = null; }
  }

  // HTML button: <note>.html next to the note, replaced if it is there.
  // Desktop: a save dialog that starts in Downloads (as Obsidian's own PDF export does). Mobile, or no dialog:
  // next to the note in the vault. Returns the status line the page shows.
  async saveHTML(file, html) {
    const dialog = Platform.isDesktopApp && desktopDialog();
    if (dialog) {
      const { remote, path, fs } = dialog;
      const r = await remote.dialog.showSaveDialog({
        defaultPath: path.join(remote.app.getPath('downloads'), `${file.basename}.html`),
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (r.canceled || !r.filePath) return 'not saved';
      await fs.promises.writeFile(r.filePath, html, 'utf8');
      new Notice(`Saved ${r.filePath}`);
      return `saved ${path.basename(r.filePath)}`;
    }
    const p = file.path.replace(/\.md$/, '') + '.html', old = this.app.vault.getFileByPath(p);
    if (old) await this.app.vault.modify(old, html); else await this.app.vault.create(p, html);
    new Notice(`Saved ${p}`);
    return `saved ${p.split('/').pop()}`;
  }

  // Errors from the pages go to the console and to log.txt in the plugin folder.
  log(msg) {
    console.error('[one-pager]', msg); // only page errors and sync failures come here
    const path = `${this.manifest.dir}/log.txt`, line = `${new Date().toISOString()} ${msg}\n`;
    this.app.vault.adapter.append(path, line).catch(() => {});
  }

  flagged(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return !!fm && (fm[FLAG] === true || fm[FLAG] === 'true');
  }
  asPage(leaf, file, active = true) {
    this.markdownLeaves.delete(leaf);
    return leaf.setViewState({ type: VIEW, state: { file: file.path }, active });
  }
  asMarkdown(leaf, file, mode) { // mode: 'source' (editing) or 'preview' (reading); default keeps the user's setting
    if (!file) return;
    this.markdownLeaves.set(leaf, file.path);
    const state = mode ? { file: file.path, mode, source: false } : { file: file.path };
    return leaf.setViewState({ type: 'markdown', state, active: true });
  }
}
