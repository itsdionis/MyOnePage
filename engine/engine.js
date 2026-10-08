// page.html?p=<slug> renders and edits pages/<slug>.md. md.js (loaded first) reads and writes the Markdown.
// A host may set window.ONEPAGER={data, slug} first (the web server does): data is the page's URL.
// It may also set open(body)/seal(text), async, to decrypt what it loads and encrypt what it saves, and hash:
// a fragment part (the key, "k=...") that the engine keeps in front of its own (#k=...&edit, #k=...&s3).
document.body.insertAdjacentHTML(
  'afterbegin',
  `
<div class="wrap" id="app"></div>
<div class="wrap"><div id="palette"></div></div>
<div id="bar">
  <span id="st">loading</span>
  <button id="rest" title="this browser has edits that are not in the file" hidden>⟲ browser edits</button>
  <button id="undo" title="Cmd+Z">↶</button>
  <button id="edit" title="click any text for a quick edit; this is full editing: drag, add and delete blocks">✎ edit</button>
  <button id="dl" title="download the page as Markdown">MD</button>
  <button id="html" title="download one HTML file to share">HTML</button>
</div>`,
);
const $ = (t, c, h) => {
  const e = document.createElement(t);
  if (c) e.className = c;
  if (h != null) e.textContent = h;
  return e;
};
const CFG = window.ONEPAGER || {};
const SLUG = CFG.slug || new URLSearchParams(location.search).get('p') || '';
const DATA = CFG.data || `pages/${encodeURIComponent(SLUG)}.md`,
  LSKEY = SLUG + '-doc';
// A shared file carries its content in #seed[data-shared] and opens read-only.
const SHARED = !!document.querySelector('#seed[data-shared]');
const ENGINE_JS = document.currentScript.src,
  MD_JS = document.querySelector('script[src$="md.js"]')?.src;
// ETAG: the version the page was loaded at, when the server sends one; a save then sends If-Match
// and the server refuses it (409) if someone saved in between. RO: read only (a shared file, a viewer).
let DOC = null,
  DIRTY = false,
  MODE = 'server',
  BASE = null,
  ETAG = null,
  RO = SHARED;
const fromWire = (t) => (CFG.open ? CFG.open(t) : t),
  toWire = (t) => (CFG.seal ? CFG.seal(t) : t);
const HASH = CFG.hash ? '#' + CFG.hash : '';
const frag = () => {
  const h = location.hash;
  if (!HASH) return h;
  if (h === HASH) return '';
  return h.startsWith(HASH + '&') ? '#' + h.slice(HASH.length + 1) : h;
};
const toFrag = (id) => (HASH ? HASH + '&' + id : '#' + id);
// An in-page link in the text replaces the whole fragment: put the host's part back in front.
if (HASH)
  addEventListener('hashchange', () => {
    const h = location.hash;
    if (h !== HASH && !h.startsWith(HASH + '&'))
      history.replaceState(null, '', h.length > 1 ? HASH + '&' + h.slice(1) : HASH);
  });

function get(path) {
  return path.split('.').reduce((o, k) => o[/^\d+$/.test(k) ? +k : k], DOC);
}
function set(path, val) {
  const ks = path.split('.');
  const last = ks.pop();
  const o = ks.reduce((o, k) => o[/^\d+$/.test(k) ? +k : k], DOC);
  o[/^\d+$/.test(last) ? +last : last] = val;
}
function ed(el, path) {
  el.dataset.p = path;
  el.spellcheck = false;
  return el;
}

const AXIS = {
  gantt: 'vert',
  canvas: 'vert',
  cards: 'horiz',
  uc: 'vert',
  cascade: 'horiz',
  stats: 'horiz',
  flow: 'horiz',
  cmdcols: 'vert',
  ol: 'vert',
  table: 'vert',
};
function itm(el, arrPath, idx) {
  el.dataset.it = arrPath;
  el.dataset.idx = idx;
  return el;
}

const TPL = {
  h2: () => ({ type: 'h2', text: 'Heading' }),
  lineage: () => ({ type: 'lineage', lead: 'Lead:', text: 'text' }),
  part: () => ({ type: 'part', num: 'PART N', ttl: 'Title', note: '' }),
  cards: () => ({ type: 'cards', items: [{ b: 'Title', s: 'Text' }] }),
  uc: () => ({ type: 'uc', items: [{ b: 'Title', s: 'Text' }] }),
  cascade: () => ({ type: 'cascade', steps: [{ n: '0', l: 'label', d: 'detail' }] }),
  stats: () => ({ type: 'stats', items: [{ v: '0', k: 'label' }] }),
  rule: () => ({ type: 'rule', lead: 'Lead:', text: 'text' }),
  flow: () => ({ type: 'flow', steps: [{ t: 'step' }] }),
  cmdcols: () => ({
    type: 'cmdcols',
    cols: [{ title: 'Column', link: null, href: null, items: [{ c: ['cmd'], s: 'what it does' }] }],
  }),
  ol: () => ({ type: 'ol', items: [{ b: 'Step.', s: 'detail' }] }),
  table: () => ({ type: 'table', accentCol: -1, head: ['Column', 'Column'], rows: [['', '']] }),
  p: () => ({ type: 'p', text: 'Text' }),
  gantt: () => ({
    type: 'gantt',
    title: '',
    dateFormat: 'YYYY-MM-DD',
    extra: [],
    sections: [
      {
        name: 'Product',
        tasks: [
          { t: 'Task', tags: ['active'], id: '', start: isoToday(), end: '2w' },
          { t: 'Next task', tags: [], id: '', start: '', end: '3w' },
        ],
      },
      { name: 'Engineering', tasks: [{ t: 'Task', tags: [], id: '', start: isoToday(), end: '4w' }] },
    ],
  }),
  canvas: () => ({
    type: 'canvas',
    cells: [
      'c:1:Customer segments',
      'p:2:Problem',
      'u:3:Unique value proposition',
      's:4:Solution',
      'h:5:Channels',
      'r:6:Revenue streams',
      'k:7:Cost structure',
      'm:8:Key metrics',
      'a:9:Unfair advantage',
    ].map((x) => {
      const [k, n, t] = x.split(':');
      return { k, n, t, items: [''] };
    }),
  }),
};
const TPL_ITEM = {
  cards: () => ({ b: 'Title', s: 'Text' }),
  uc: () => ({ b: 'Title', s: 'Text' }),
  cascade: () => ({ n: '0', l: 'label', d: 'detail' }),
  stats: () => ({ v: '0', k: 'label' }),
  flow: () => ({ t: 'step' }),
  ol: () => ({ b: 'Step.', s: 'detail' }),
  cmdcols: () => ({ c: ['cmd'], s: 'what it does' }),
  gantt: () => ({ t: 'Task', tags: [], id: '', start: '', end: '2w' }),
  table: () => null,
};
const LABEL = {
  h2: 'heading',
  lineage: 'callout',
  part: 'section',
  cards: 'cards',
  uc: 'grid of 3',
  cascade: 'cascade',
  stats: 'numbers',
  rule: 'line',
  flow: 'flow',
  cmdcols: 'command columns',
  ol: 'numbered list',
  table: 'table',
  gantt: 'gantt',
  p: 'text',
  canvas: 'lean canvas',
};

let HIST = [];
function snap() {
  HIST.push(JSON.stringify(DOC));
  if (HIST.length > 30) HIST.shift();
}
function undo() {
  if (!HIST.length) {
    status('nothing to undo');
    return;
  }
  DOC = JSON.parse(HIST.pop());
  render();
  DIRTY = true;
  save();
  status('undone');
}
function arrAt(path) {
  return path.split('.').reduce((o, k) => o[/^\d+$/.test(k) ? +k : k], DOC);
}
function move(arr, from, to) {
  const [x] = arr.splice(from, 1);
  arr.splice(to > from ? to - 1 : to, 0, x);
}

function pillTone(s) {
  s = (s || '').trim().toLowerCase();
  if (/^yes,? but/.test(s)) return 'warn';
  if (/^(yes|supported|go|will renew|renews?|active|paid)\b/.test(s)) return 'ok';
  if (/^(no|stop|kill|refuted|cancel\w*|churn\w*|expired|failed)\b/.test(s)) return 'bad';
  return 'warn';
}
function daysAgo(s) {
  // "dd.mm" -> "N days ago", counted from today
  const m = /^(\d{1,2})\.(\d{1,2})$/.exec((s || '').trim());
  if (!m) return '';
  const now = new Date(),
    t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let d = new Date(now.getFullYear(), +m[2] - 1, +m[1]);
  if (d > t) d.setFullYear(d.getFullYear() - 1);
  const n = Math.round((t - d) / 86400000);
  return n === 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`;
}
const isoToday = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
};
function render() {
  const root = document.getElementById('app');
  root.replaceChildren();
  const h = DOC.hero;
  const h1 = $('h1');
  h.lines.forEach((ln, i) => {
    const s = ed($('span'), `hero.lines.${i}`);
    s.textContent = ln;
    h1.appendChild(s);
    if (i < h.lines.length - 1) h1.appendChild($('br'));
  });
  const hl = ed($('span', 'hl'), 'hero.highlight');
  hl.textContent = h.highlight;
  h1.appendChild(hl);
  h1.appendChild(document.createTextNode(h.tail || ''));
  root.appendChild(h1);
  const sub = ed($('p', 'sub'), 'hero.sub');
  sub.textContent = h.sub;
  root.appendChild(sub);

  DOC.blocks.forEach((b, bi) => {
    const P = `blocks.${bi}`;
    const sec = $('section', 'blk');
    sec.dataset.bi = bi;
    sec.dataset.axis = AXIS[b.type] || 'vert';
    root.appendChild(sec);
    const app = { appendChild: (n) => sec.appendChild(n) };
    if (b.type === 'h2') {
      const e = ed($('h2'), P + '.text');
      e.textContent = b.text;
      app.appendChild(e);
    } else if (b.type === 'lineage') {
      const p = $('p', 'lineage');
      const l = ed($('b'), P + '.lead');
      l.textContent = b.lead;
      p.appendChild(l);
      p.appendChild(document.createTextNode(' '));
      const t = ed($('span'), P + '.text');
      t.textContent = b.text;
      p.appendChild(t);
      app.appendChild(p);
    } else if (b.type === 'part') {
      const d = $('div', 'part');
      d.appendChild(ed(Object.assign($('span', 'num'), { textContent: b.num }), P + '.num'));
      d.appendChild(ed(Object.assign($('span', 'ttl'), { textContent: b.ttl }), P + '.ttl'));
      d.appendChild(ed(Object.assign($('span', 'note'), { textContent: b.note || '' }), P + '.note'));
      app.appendChild(d);
    } else if (b.type === 'cards' || b.type === 'uc') {
      const wrap = $('div', b.type === 'cards' ? 'cols' : 'uc');
      b.items.forEach((it, i) => {
        const c = itm($('div', b.type === 'cards' ? 'card' : 'u'), `${P}.items`, i);
        c.appendChild(ed(Object.assign($('b'), { textContent: it.b }), `${P}.items.${i}.b`));
        c.appendChild(ed(Object.assign($('span'), { textContent: it.s }), `${P}.items.${i}.s`));
        wrap.appendChild(c);
      });
      app.appendChild(wrap);
    } else if (b.type === 'cascade') {
      const wrap = $('div', 'cascade');
      b.steps.forEach((s, i) => {
        if (i) wrap.appendChild($('div', 'arrow', '→'));
        const st = itm($('div', 'step c' + Math.min(i, 4)), `${P}.steps`, i);
        st.appendChild(ed(Object.assign($('div', 'n'), { textContent: s.n }), `${P}.steps.${i}.n`));
        st.appendChild(ed(Object.assign($('div', 'l'), { textContent: s.l }), `${P}.steps.${i}.l`));
        st.appendChild(ed(Object.assign($('div', 'd'), { textContent: s.d }), `${P}.steps.${i}.d`));
        wrap.appendChild(st);
      });
      app.appendChild(wrap);
    } else if (b.type === 'stats') {
      const wrap = $('div', 'stats');
      b.items.forEach((it, i) => {
        const s = itm($('div', 'stat' + (it.zero ? ' zero' : '') + (it.warn ? ' warn' : '')), `${P}.items`, i);
        s.appendChild(ed(Object.assign($('div', 'v'), { textContent: it.v }), `${P}.items.${i}.v`));
        s.appendChild(ed(Object.assign($('div', 'k'), { textContent: it.k }), `${P}.items.${i}.k`));
        wrap.appendChild(s);
      });
      app.appendChild(wrap);
    } else if (b.type === 'rule') {
      const p = $('p', 'rule');
      p.appendChild(ed(Object.assign($('b'), { textContent: b.lead }), P + '.lead'));
      p.appendChild(document.createTextNode(' '));
      p.appendChild(ed(Object.assign($('span'), { textContent: b.text }), P + '.text'));
      app.appendChild(p);
    } else if (b.type === 'flow') {
      const wrap = $('div', 'flow');
      b.steps.forEach((s, i) => {
        if (i) wrap.appendChild($('span', 'farr', '→'));
        const holder = itm($('span', 'fwrap'), `${P}.steps`, i);
        const el = s.href ? $('a', 'fstep') : $('span', 'fstep' + (s.hi ? ' hi' : ''));
        if (s.href) setHref(el, s.href);
        el.textContent = s.t;
        ed(el, `${P}.steps.${i}.t`);
        holder.appendChild(el);
        wrap.appendChild(holder);
      });
      app.appendChild(wrap);
    } else if (b.type === 'cmdcols') {
      const wrap = $('div', 'split');
      b.cols.forEach((col, ci) => {
        const c = $('div', 'col');
        const h3 = $('h3');
        h3.appendChild(ed(Object.assign($('span'), { textContent: col.title }), `${P}.cols.${ci}.title`));
        if (col.link) {
          h3.appendChild(document.createTextNode(' '));
          const a = $('a');
          setHref(a, col.href);
          a.textContent = col.link;
          h3.appendChild(ed(a, `${P}.cols.${ci}.link`));
        }
        c.appendChild(h3);
        col.items.forEach((it, ii) => {
          const row = itm($('div', 'cmd' + (it.star ? ' star' : '')), `${P}.cols.${ci}.items`, ii);
          it.c.forEach((code, ci2) => {
            row.appendChild(
              ed(Object.assign($('code'), { textContent: code }), `${P}.cols.${ci}.items.${ii}.c.${ci2}`),
            );
          });
          row.appendChild(ed(Object.assign($('span'), { textContent: it.s }), `${P}.cols.${ci}.items.${ii}.s`));
          c.appendChild(row);
        });
        wrap.appendChild(c);
      });
      app.appendChild(wrap);
    } else if (b.type === 'table') {
      const sc = $('div', 'tscroll'),
        t = $('div', 'tbl');
      const n = b.head.length;
      const cols = b.cols || (n > 2 ? `1.2fr repeat(${n - 1},1fr)` : '0.9fr 3fr');
      const th = $('div', 'trow th');
      th.style.gridTemplateColumns = cols;
      b.head.forEach((h, ci) => {
        th.appendChild(ed(Object.assign($('div'), { textContent: h }), `${P}.head.${ci}`));
      });
      t.appendChild(th);
      b.rows.forEach((row, ri) => {
        const r = itm($('div', 'trow'), `${P}.rows`, ri);
        r.style.gridTemplateColumns = cols;
        for (let ci = 0; ci < n; ci++) {
          const cls = ci === b.accentCol ? 'acc' : '',
            path = `${P}.rows.${ri}.${ci}`,
            txt = row[ci] || '';
          let c;
          if (ci === b.linkCol && row[n]) {
            // link stored after the last column, travels with the row
            c = $('div', cls);
            const a = ed($('a'), path);
            setHref(a, row[n]);
            a.target = '_blank';
            a.rel = 'noopener';
            a.title = 'open in PostHog (Alt+click to edit)';
            a.textContent = txt;
            c.appendChild(a);
          } else if (ci === b.pillCol) {
            // short verdict label, coloured by its first word
            c = $('div', cls);
            const p = ed($('span', 'pill ' + pillTone(txt)), path);
            p.textContent = txt;
            c.appendChild(p);
            p.addEventListener('blur', () => {
              p.className = 'pill ' + pillTone(p.textContent);
            });
          } else if (ci === b.agoCol) {
            c = $('div', cls);
            const sp = ed($('span'), path);
            sp.textContent = txt;
            c.appendChild(sp);
            const ag = daysAgo(txt);
            if (ag) c.appendChild($('span', 'ago', ag));
          } else {
            c = ed($('div', cls), path);
            c.textContent = txt;
          }
          r.appendChild(c);
        }
        t.appendChild(r);
      });
      sc.appendChild(t);
      app.appendChild(sc);
    } else if (b.type === 'canvas') {
      const g = $('div', 'lc');
      b.cells.forEach((cell, ci) => {
        const C = `${P}.cells.${ci}`,
          box = $('div', 'lcc ' + cell.k);
        box.style.gridArea = cell.k;
        const hd = $('div', 'hd');
        hd.appendChild(ed(Object.assign($('span', 'no'), { textContent: cell.n }), C + '.n'));
        hd.appendChild(ed(Object.assign($('span', 'tt'), { textContent: cell.t }), C + '.t'));
        box.appendChild(hd);
        const list = (key, cls) => {
          const ul = $('ul', cls || '');
          (cell[key] || []).forEach((x, ii) => {
            const li = itm($('li'), `${C}.${key}`, ii);
            const t = ed(Object.assign($('span'), { textContent: x }), `${C}.${key}.${ii}`);
            t.dataset.line = '';
            li.appendChild(t);
            ul.appendChild(li);
          });
          box.appendChild(ul);
          const add = $('button', 'lcadd', '+');
          add.title = 'add a line';
          add.onclick = () => {
            snap();
            (cell[key] = cell[key] || []).push('');
            render();
            focusPath(`${C}.${key}.${cell[key].length - 1}`);
          };
          box.appendChild(add);
        };
        list('items');
        if (cell.st != null) {
          box.appendChild(ed(Object.assign($('div', 'st'), { textContent: cell.st }), C + '.st'));
          list('sub', 'sub');
        }
        g.appendChild(box);
      });
      app.appendChild(g);
    } else if (b.type === 'gantt') app.appendChild(gantt(b, P));
    else if (b.type === 'p') {
      // Markdown that is not a block, kept as written
      const e = ed($('div', 'ptext'), P + '.text');
      e.textContent = b.text;
      app.appendChild(e);
    } else if (b.type === 'ol') {
      const ol = $('ol');
      b.items.forEach((it, i) => {
        const li = itm($('li'), `${P}.items`, i);
        li.appendChild(ed(Object.assign($('b'), { textContent: it.b }), `${P}.items.${i}.b`));
        li.appendChild(document.createTextNode(' '));
        li.appendChild(ed(Object.assign($('span'), { textContent: it.s }), `${P}.items.${i}.s`));
        ol.appendChild(li);
      });
      app.appendChild(ol);
    }
  });
  buildTools();
  buildPalette();
  applyEditable();
  nav();
}

// Gantt: task names on the left, bars on a shared time axis. Dates come from md.js schedule();
// names and sections are edited here, dates in the file.
function gantt(b, P) {
  const sc = $('div', 'gscroll'),
    g = $('div', 'gantt');
  sc.appendChild(g);
  const rows = MD.schedule(b),
    all = rows.flat().filter(Boolean);
  const lo = all.length ? Math.min(...all.map((r) => r.from)) : 0,
    end = Math.max(lo + 7, ...all.map((r) => r.to));
  const hi = end + Math.max(1, (end - lo) * 0.03); // room for a milestone on the last day
  const now = new Date(),
    today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5;
  const at = (d) => (((d - lo) / (hi - lo)) * 100).toFixed(3) + '%';
  const date = (d) => new Date(d * 864e5);
  const dm = (d) => {
    const x = date(d);
    return String(x.getUTCDate()).padStart(2, '0') + '.' + String(x.getUTCMonth() + 1).padStart(2, '0');
  };
  if (b.title) sc.insertBefore(Object.assign(ed($('div', 'gtitle'), P + '.title'), { textContent: b.title }), g);

  // ticks: Mondays for up to ~4 months (a quarter), else the 1st of each month
  const ticks = [];
  if (hi - lo <= 125) {
    for (let d = lo + ((7 - ((lo + 3) % 7)) % 7); d < hi; d += 7) ticks.push([d, dm(d)]);
  } // day 0 (1970-01-01) was a Thursday
  else {
    let x = date(lo);
    x = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + (x.getUTCDate() > 1 ? 1 : 0), 1));
    for (; x / 864e5 < hi; x = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1)))
      ticks.push([x / 864e5, x.toLocaleString('en', { month: 'short', timeZone: 'UTC' })]);
  }
  const over = $('div', 'gover');
  ticks.forEach(([d]) => {
    const i = $('i');
    i.style.left = at(d);
    over.appendChild(i);
  });
  if (today >= lo && today <= hi) {
    const i = $('i', 'today');
    i.style.left = at(today);
    i.title = 'today';
    over.appendChild(i);
  }
  g.appendChild(over);
  const axis = $('div', 'grow gaxis');
  axis.appendChild($('div', 'gn'));
  const tr = $('div', 'gtrack');
  ticks.forEach(([d, l]) => {
    if ((d - lo) / (hi - lo) > 0.96) return;
    const t = $('span', 'gtick', l);
    t.style.left = at(d);
    tr.appendChild(t);
  });
  axis.appendChild(tr);
  g.appendChild(axis);

  b.sections.forEach((s, si) => {
    if (s.name || si) {
      const r = $('div', 'grow gsec');
      r.appendChild(Object.assign(ed($('div', 'gn'), `${P}.sections.${si}.name`), { textContent: s.name }));
      r.appendChild($('div'));
      g.appendChild(r);
    }
    s.tasks.forEach((t, ti) => {
      const r = itm($('div', 'grow' + (t.tags.includes('done') ? ' done' : '')), `${P}.sections.${si}.tasks`, ti);
      r.appendChild(Object.assign(ed($('div', 'gn'), `${P}.sections.${si}.tasks.${ti}.t`), { textContent: t.t }));
      const track = $('div', 'gtrack'),
        x = rows[si][ti];
      if (!x) track.appendChild($('span', 'gnone', 'no dates: ' + [t.start, t.end].filter(Boolean).join(', ')));
      else if (t.tags.includes('milestone')) {
        const m = $('span', 'gms');
        m.style.left = at(x.from);
        m.title = dm(x.from);
        track.appendChild(m);
        gdrag(m, { b, t, x, lo, hi, dm, at, ms: true });
      } else {
        const bar = $('span', 'gbar ' + t.tags.filter((k) => k !== 'milestone').join(' '));
        bar.style.left = at(x.from);
        bar.style.width = `calc(${at(x.to)} - ${at(x.from)})`;
        bar.title = `${dm(x.from)} – ${dm(Math.max(x.from, x.to - 1))}`;
        track.appendChild(bar);
        gdrag(bar, { b, t, x, lo, hi, dm, at, ms: false });
      }
      r.appendChild(track);
      g.appendChild(r);
    });
  });
  return sc;
}

// Drag a gantt bar to move the task, its right edge to change its length (whole days).
// The result is written back in the task's own terms: a start date or a length stays one;
// a task that followed another (no start, or "after id") gets a fixed start when moved.
function gdrag(el, { b, t, x, lo, hi, dm, at, ms }) {
  if (RO) return;
  el.addEventListener('dragstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const track = el.parentElement,
      perDay = track.getBoundingClientRect().width / (hi - lo);
    const edge = !ms && e.clientX > el.getBoundingClientRect().right - 10;
    const tip = $('span', 'gtip');
    track.appendChild(tip);
    let dd = 0;
    const show = () => {
      const from = edge ? x.from : x.from + dd,
        to = edge ? Math.max(x.from + 1, x.to + dd) : x.to + dd;
      el.style.left = at(from);
      if (!ms) el.style.width = `calc(${at(to)} - ${at(from)})`;
      tip.style.left = at(ms ? from : to);
      tip.textContent = ms ? dm(from) : `${dm(from)} – ${dm(Math.max(from, to - 1))} · ${to - from}d`;
    };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    show();
    el.onpointermove = (ev) => {
      const n = Math.round((ev.clientX - e.clientX) / perDay);
      if (n !== dd) {
        dd = n;
        show();
      }
    };
    el.onpointerup = el.onpointercancel = () => {
      el.onpointermove = el.onpointerup = el.onpointercancel = null;
      el.classList.remove('dragging');
      tip.remove();
      if (!dd) return;
      snap();
      gmove(b, t, x, dd, edge);
      render();
      DIRTY = true;
      save();
      status(edge ? 'length changed' : 'moved');
    };
  });
}
function gmove(b, t, x, dd, edge) {
  const iso = (d) => new Date(d * 864e5).toISOString().slice(0, 10);
  const incl = (b.extra || []).some((l) => /^inclusiveEndDates\b/.test(l)) ? 1 : 0;
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const len = (n) => (n % 7 === 0 ? `${n / 7}w` : `${n}d`);
  if (edge) {
    const to = Math.max(x.from + 1, x.to + dd);
    t.end = isDate(t.end) ? iso(to - incl) : len(to - x.from);
  } else {
    t.start = iso(x.from + dd);
    if (isDate(t.end)) t.end = iso(x.to + dd - incl);
  }
}

// ---------- sections: side contents and tabs ----------
// A part block starts a section; blocks before the first part are the intro. The side list
// jumps between sections (scroll view) or switches them (tabs view). The view is the viewer's
// choice, kept in this browser; meta.view (frontmatter "view: tabs") sets the default.
let VIEW = null,
  TAB = null;
function sections() {
  const out = [];
  let cur = null,
    n = 0;
  DOC.blocks.forEach((b, i) => {
    if (b.type === 'part')
      out.push(
        (cur = {
          id: 's' + ++n,
          label: [b.num, b.ttl].map(MD.plain).filter(Boolean).join(' · '),
          blocks: [],
          heads: [],
        }),
      );
    else if (!cur) out.push((cur = { id: 'intro', label: 'Intro', blocks: [], heads: [] }));
    cur.blocks.push(i);
    if (b.type === 'h2') cur.heads.push({ i, label: MD.plain(b.text) });
  });
  return out;
}
const blkEl = (i) => document.querySelector(`section.blk[data-bi="${i}"]`);
function nav() {
  document.getElementById('toc')?.remove();
  document.getElementById('tocbtn')?.remove();
  const secs = sections(),
    on = secs.filter((s) => s.id !== 'intro').length >= 2;
  document.body.classList.toggle('hastoc', on);
  if (!on) {
    document.body.classList.remove('tabs');
    return;
  }
  if (VIEW == null) {
    let v = null;
    try {
      v = localStorage.getItem(SLUG + '-view');
    } catch {
      /* storage may be blocked */
    }
    VIEW = v || (DOC.meta?.view === 'tabs' ? 'tabs' : 'scroll');
  }
  if (!secs.some((s) => s.id === TAB)) TAB = (secs.find((s) => '#' + s.id === frag()) || secs[0]).id;
  secs.forEach((s) => {
    s.blocks.forEach((i) => {
      const el = blkEl(i);
      if (el) el.dataset.sec = s.id;
    });
    const first = blkEl(s.blocks[0]);
    if (first) first.id = s.id;
  });

  const toc = $('nav');
  toc.id = 'toc';
  const sw = $('div', 'tsw');
  [
    ['scroll', 'scroll'],
    ['tabs', 'tabs'],
  ].forEach(([v, l]) => {
    const b = $('button', '', l);
    b.dataset.view = v;
    b.onclick = () => setView(v);
    sw.appendChild(b);
  });
  const fold = $('button', 'tfold', '«');
  fold.title = 'hide the section list';
  fold.onclick = () => shut(true);
  sw.appendChild(fold);
  toc.appendChild(sw);
  const link = (cls, label, sec, bi) => {
    const a = $('a', cls);
    a.href = '#' + sec;
    a.textContent = label;
    a.onclick = (e) => {
      e.preventDefault();
      go(sec, bi);
    };
    return a;
  };
  secs.forEach((s) => {
    const a = link('tl', s.label, s.id);
    a.dataset.sec = s.id;
    toc.appendChild(a);
    if (s.heads.length) {
      const sub = $('div', 'tsub');
      sub.dataset.sec = s.id;
      s.heads.forEach((h) => sub.appendChild(link('th', h.label, s.id, h.i)));
      toc.appendChild(sub);
    }
  });
  document.body.appendChild(toc);
  const btn = $('button', '', '≡');
  btn.id = 'tocbtn';
  btn.title = 'sections';
  btn.onclick = () => (WIDE.matches ? shut(false) : document.body.classList.toggle('tocopen'));
  document.body.appendChild(btn);
  if (SHUT == null) {
    try {
      SHUT = localStorage.getItem('toc-shut') === '1';
    } catch {
      SHUT = false;
    }
  }
  document.body.classList.toggle('tocshut', SHUT);

  const strip = $('div', 'tabstrip'); // tabs on narrow screens, where the side list is folded away
  secs.forEach((s) => {
    const b = $('button', '', s.label);
    b.dataset.sec = s.id;
    b.onclick = () => go(s.id);
    strip.appendChild(b);
  });
  document.querySelector('#app .sub').after(strip);
  applyView();
}
// wide screens: the side list can be folded away (remembered in this browser); narrow ones fold it always
const WIDE = matchMedia('(min-width:1300px)');
let SHUT = null;
function shut(on) {
  SHUT = on;
  document.body.classList.toggle('tocshut', on);
  try {
    localStorage.setItem('toc-shut', on ? '1' : '0');
  } catch {
    /* storage may be blocked */
  }
}
function setView(v) {
  VIEW = v;
  try {
    localStorage.setItem(SLUG + '-view', v);
  } catch {
    /* storage may be blocked */
  }
  applyView();
  go(TAB);
}
function applyView() {
  const tabs = VIEW === 'tabs';
  document.body.classList.toggle('tabs', tabs);
  document.querySelectorAll('#toc .tsw button').forEach((b) => b.classList.toggle('on', b.dataset.view === VIEW));
  document.querySelectorAll('section.blk').forEach((el) => el.classList.toggle('off', tabs && el.dataset.sec !== TAB));
  if (tabs) mark(TAB);
  else spy();
}
function mark(id) {
  document
    .querySelectorAll('#toc [data-sec],.tabstrip [data-sec]')
    .forEach((e) => e.classList.toggle('on', e.dataset.sec === id));
  const strip = document.querySelector('.tabstrip'),
    b = strip?.querySelector('button.on'); // keep the active tab in view
  if (b && strip.clientWidth) strip.scrollTo({ left: b.offsetLeft - (strip.clientWidth - b.offsetWidth) / 2 });
}
function go(id, bi) {
  document.body.classList.remove('tocopen');
  history.replaceState(null, '', toFrag(id));
  if (VIEW === 'tabs') {
    TAB = id;
    applyView();
  }
  const el = bi != null ? blkEl(bi) : document.getElementById(id);
  if (VIEW === 'tabs' && bi == null) window.scrollTo({ top: 0 });
  else el?.scrollIntoView({ behavior: 'smooth' });
}
function spy() {
  // scroll view: the section at the top of the screen
  if (VIEW === 'tabs' || !document.body.classList.contains('hastoc')) return;
  let cur = null;
  for (const el of document.querySelectorAll('section.blk[data-sec]')) {
    if (el.getBoundingClientRect().top < 160) cur = el.dataset.sec;
    else break;
  }
  TAB = cur || document.querySelector('section.blk[data-sec]')?.dataset.sec;
  mark(TAB);
}
document.addEventListener('click', (e) => {
  // a click outside the folded-out list closes it
  if (document.body.classList.contains('tocopen') && !e.target.closest('#toc,#tocbtn'))
    document.body.classList.remove('tocopen');
});
let spyQueued = false;
addEventListener(
  'scroll',
  () => {
    if (spyQueued) return;
    spyQueued = true;
    requestAnimationFrame(() => {
      spyQueued = false;
      spy();
    });
  },
  { passive: true },
);

function buildTools() {
  document.querySelectorAll('section.blk').forEach((sec) => {
    const bi = +sec.dataset.bi,
      b = DOC.blocks[bi];
    const t = $('div', 'btools');
    const mk = (cls, txt, title, fn) => {
      const x = $('button', cls, txt);
      x.title = title;
      x.onclick = fn;
      return x;
    };
    t.appendChild(mk('h', '⠿', 'drag the block', () => {}));
    t.appendChild($('span', 'lbl', LABEL[b.type] || b.type));
    if (TPL_ITEM[b.type])
      t.appendChild(
        mk('', '+', 'add an item', () => {
          snap();
          if (b.type === 'cmdcols') b.cols[0].items.push(TPL_ITEM.cmdcols());
          else if (b.type === 'gantt') {
            // a new task starts where the previous one ends
            const t = TPL_ITEM.gantt();
            if (!b.sections.some((x) => x.tasks.length)) t.start = isoToday();
            if (!b.sections.length) b.sections.push({ name: '', tasks: [] });
            b.sections[b.sections.length - 1].tasks.push(t);
          } else if (b.type === 'table') b.rows.push(b.head.map(() => ''));
          else (b.items || b.steps).push(TPL_ITEM[b.type]());
          render();
          DIRTY = true;
          save();
        }),
      );
    t.appendChild(
      mk('', '×', 'delete the block', () => {
        if (!confirm('Delete the whole block?')) return;
        snap();
        DOC.blocks.splice(bi, 1);
        render();
        DIRTY = true;
        save();
      }),
    );
    sec.insertBefore(t, sec.firstChild);
    sec.draggable = document.body.classList.contains('edit');
    sec.addEventListener('dragstart', (e) => {
      if (!sec.draggable) return;
      if (!HANDLE && (e.target.closest('[data-p]') || e.target.closest('[data-it]'))) {
        e.preventDefault();
        return;
      }
      e.stopPropagation();
      DRAG = { kind: 'block', bi };
      sec.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'b');
    });
    sec.addEventListener('dragend', () => {
      sec.classList.remove('dragging');
      HANDLE = false;
      clearMarks();
    });
  });

  document.querySelectorAll('[data-it]').forEach((el) => {
    const hd = $('button', 'ihandle', '⠿');
    hd.title = 'drag';
    const dl = $('button', 'idel', '×');
    dl.title = 'delete';
    hd.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      HANDLE = true;
    });
    dl.onclick = (e) => {
      e.stopPropagation();
      snap();
      arrAt(el.dataset.it).splice(+el.dataset.idx, 1);
      render();
      DIRTY = true;
      save();
    };
    el.appendChild(hd);
    el.appendChild(dl);
    el.draggable = document.body.classList.contains('edit');
    el.addEventListener('dragstart', (e) => {
      if (!el.draggable) return;
      if (!HANDLE && e.target.closest('[data-p]')) {
        e.preventDefault();
        return;
      }
      e.stopPropagation();
      DRAG = { kind: 'item', arr: el.dataset.it, idx: +el.dataset.idx };
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'i');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      HANDLE = false;
      clearMarks();
    });
  });
}

function buildPalette() {
  const p = document.getElementById('palette');
  p.replaceChildren();
  p.appendChild($('b', '', 'add a block'));
  Object.keys(TPL).forEach((k) => {
    const btn = $('button', '', LABEL[k] || k);
    btn.onclick = () => {
      snap();
      DOC.blocks.push(TPL[k]());
      TAB = sections().at(-1).id;
      render();
      DIRTY = true;
      save();
      window.scrollTo(0, document.body.scrollHeight);
    };
    p.appendChild(btn);
  });
}

let DRAG = null,
  HANDLE = false;
document.addEventListener('mouseup', () => {
  HANDLE = false;
});
function clearMarks() {
  document
    .querySelectorAll('.dropbefore,.dropafter')
    .forEach((e) => e.classList.remove('dropbefore', 'dropafter', 'vert'));
}

document.addEventListener('dragover', (e) => {
  if (!DRAG) return;
  const sel = DRAG.kind === 'block' ? 'section.blk' : `[data-it="${DRAG.arr}"]`;
  const tgt = e.target.closest ? e.target.closest(sel) : null;
  if (!tgt) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  clearMarks();
  const r = tgt.getBoundingClientRect();
  let vert = DRAG.kind === 'block' || (tgt.closest('section.blk') || {}).dataset?.axis !== 'horiz';
  const before = vert ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
  tgt.classList.add(before ? 'dropbefore' : 'dropafter');
  if (vert) tgt.classList.add('vert');
  DROP = { tgt, before };
});
let DROP = null;
document.addEventListener('drop', (e) => {
  if (!DRAG || !DROP) return;
  e.preventDefault();
  snap();
  const { tgt, before } = DROP;
  if (DRAG.kind === 'block') {
    const to = +tgt.dataset.bi + (before ? 0 : 1);
    move(DOC.blocks, DRAG.bi, to);
  } else {
    const arr = arrAt(DRAG.arr);
    const to = +tgt.dataset.idx + (before ? 0 : 1);
    move(arr, DRAG.idx, to);
  }
  DRAG = null;
  DROP = null;
  clearMarks();
  render();
  DIRTY = true;
  save();
  status('moved');
});

const isEdit = () => document.body.classList.contains('edit');
function applyEditable() {
  const on = isEdit();
  document.querySelectorAll('[data-p]').forEach((el) => {
    el.contentEditable = on ? 'true' : 'false';
    if (!el._wired) {
      el._wired = true;
      wire(el);
    }
    paint(el);
  });
}
// Text fields hold Markdown. Shown formatted; the source comes back while the field is edited.
function paint(el) {
  if (el.tagName === 'CODE' || el === document.activeElement) return;
  const src = get(el.dataset.p);
  if (typeof src !== 'string') return;
  const ns = MD.inline(src);
  if (ns.length < 2 && (!ns.length || (ns[0].t === 'text' && ns[0].v === src))) return;
  el.textContent = '';
  mdNodes(ns).forEach((n) => el.appendChild(n));
  el._painted = true;
}
function unpaint(el) {
  if (!el._painted) return false;
  el.textContent = MD.untx(get(el.dataset.p));
  el._painted = false;
  return true;
}
function mdNodes(ns) {
  return ns.map((n) => {
    if (n.t === 'text') return document.createTextNode(n.v);
    if (n.t === 'code') return Object.assign($('code'), { textContent: n.v });
    const e = $({ b: 'b', i: 'i', mark: 'mark', s: 's', a: 'a' }[n.t]);
    if (n.t === 'a') {
      setHref(e, n.href);
      e.target = '_blank';
      e.rel = 'noopener';
    }
    mdNodes(n.c).forEach((x) => e.appendChild(x));
    return e;
  });
}
let PTR = null; // last pointer-down, to put the caret back after the source replaces the formatted text
document.addEventListener(
  'mousedown',
  (e) => {
    PTR = { x: e.clientX, y: e.clientY };
  },
  true,
);
function wire(el) {
  // undo step is taken lazily on the first keystroke, so a click without typing leaves no empty step
  el.addEventListener('focus', () => {
    if (unpaint(el)) {
      if (PTR) caretAt(PTR.x, PTR.y, el);
      else focusEnd(el);
    }
    el._orig = el.textContent;
    el._snap = JSON.stringify(DOC);
    el._snapped = false;
  });
  el.addEventListener('input', () => {
    if (!el._snapped) {
      el._snapped = true;
      HIST.push(el._snap);
      if (HIST.length > 30) HIST.shift();
    }
    set(el.dataset.p, el.textContent);
    DIRTY = true;
    queueSave();
  });
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text'));
  });
  el.addEventListener('keydown', (e) => {
    if ('line' in el.dataset && lineKey(el, e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      el.blur();
    } else if (e.key === 'Escape' && !isEdit()) {
      e.preventDefault(); // quick edit: Esc cancels
      if (el._snapped) {
        HIST.pop();
        el._snapped = false;
        el.textContent = el._orig;
        set(el.dataset.p, el._orig);
        DIRTY = true;
      }
      el.blur();
    }
  });
  el.addEventListener('blur', () => {
    if ('line' in el.dataset && !el.textContent.trim() && el.isConnected) dropLine(el);
    if (el.isConnected) paint(el);
    if (isEdit()) return;
    el.contentEditable = 'false';
    if (DIRTY) {
      clearTimeout(timer);
      save();
    }
  });
  if (el.tagName === 'A')
    el.addEventListener('click', (e) => {
      if (el.isContentEditable) e.preventDefault();
    });
}

// List lines (data-line): one string each in an array, edited like a bullet list.
function focusPath(path) {
  const el = document.querySelector(`[data-p="${path}"]`);
  if (!el) return;
  el.contentEditable = 'true';
  PTR = null;
  el.focus();
  focusEnd(el);
}
function focusEnd(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}
function lineKey(el, e) {
  const li = el.closest('[data-it]'),
    idx = +li.dataset.idx,
    arr = arrAt(li.dataset.it);
  if (e.key === 'Enter' && !e.shiftKey && el.textContent.trim()) {
    e.preventDefault();
    snap();
    arr.splice(idx + 1, 0, '');
    DIRTY = true;
    queueSave();
    render();
    focusPath(`${li.dataset.it}.${idx + 1}`);
    return true;
  }
  if (e.key === 'Backspace' && !el.textContent) {
    e.preventDefault();
    const prev = li.previousElementSibling?.querySelector('[data-line]');
    dropLine(el);
    if (prev) focusPath(prev.dataset.p);
    return true;
  }
  return false;
}
// Removes the line in place and renumbers the lines after it, so a click
// that caused the blur still lands on the element it was aimed at.
function dropLine(el) {
  const li = el.closest('[data-it]'),
    idx = +li.dataset.idx;
  if (!el._snapped) snap();
  arrAt(li.dataset.it).splice(idx, 1);
  let n = li.nextElementSibling;
  for (; n; n = n.nextElementSibling) {
    const i = +n.dataset.idx - 1,
      t = n.querySelector('[data-line]');
    n.dataset.idx = i;
    t.dataset.p = `${n.dataset.it}.${i}`;
  }
  el.contentEditable = 'false';
  li.remove();
  DIRTY = true;
  queueSave();
}

// view mode: click a text to edit just that text; links need Alt+click
document.getElementById('app').addEventListener('click', (e) => {
  if (isEdit() || document.body.classList.contains('print')) return;
  const el = e.target.closest && e.target.closest('[data-p]');
  if (!el || el.isContentEditable) return;
  const a = e.target.closest('a');
  if (a && a !== el && !e.altKey) return; // a link inside formatted text: follow it
  if (el.tagName === 'A') {
    if (!e.altKey) return;
    e.preventDefault();
  }
  if (a) e.preventDefault();
  if (!getSelection().isCollapsed) return; // user was selecting text to copy
  el.contentEditable = 'true';
  PTR = { x: e.clientX, y: e.clientY };
  el.focus();
  caretAt(e.clientX, e.clientY, el);
});
function caretAt(x, y, el) {
  let r = null;
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (p) {
      r = document.createRange();
      r.setStart(p.offsetNode, p.offset);
    }
  } else if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(x, y);
  if (!r || !el.contains(r.startContainer)) {
    r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
  }
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

const status = (t) => (document.getElementById('st').textContent = t);
let timer = null;
function queueSave() {
  status('editing…');
  clearTimeout(timer);
  timer = setTimeout(save, 700);
}

const keepLocal = () => {
  try {
    localStorage.setItem(LSKEY, JSON.stringify(DOC));
  } catch {
    /* storage may be blocked */
  }
};
async function save() {
  if (RO) return;
  DOC.meta.updated = new Date().toISOString().slice(0, 10);
  if (MODE === 'server' && ETAG) {
    const body = MD.serialize(DOC);
    let r;
    try {
      r = await fetch(DATA, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'If-Match': ETAG },
        body: await toWire(body),
      });
    } catch {
      keepLocal();
      status('offline: kept in this browser, reload to retry');
      return;
    }
    if (r.ok) {
      ETAG = r.headers.get('ETag') || ETAG;
      BASE = body;
      DIRTY = false;
      status('saved');
      if (document.getElementById('rest').hidden) {
        try {
          localStorage.removeItem(LSKEY);
        } catch {
          /* storage may be blocked */
        }
      }
      return;
    }
    keepLocal(); // the edits survive a reload: the ⟲ button brings them back
    status(
      r.status === 409
        ? 'someone else saved: reload (⟲ brings your edits back)'
        : r.status === 401
          ? 'signed out: reload to sign in, your edits are kept'
          : r.status === 403
            ? 'view only: this page is not shared with you for editing'
            : `not saved (${r.status}): kept in this browser`,
    );
    return;
  }
  if (MODE === 'server') {
    try {
      const cur = await fromWire(await (await fetch(DATA, { cache: 'no-store' })).text());
      if (BASE !== null && cur !== BASE) {
        status('the file changed on disk: reload the page');
        return;
      }
      const body = MD.serialize(DOC);
      const r = await fetch(DATA, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        body: await toWire(body),
      });
      if (!r.ok) throw new Error(r.status);
      BASE = body;
      DIRTY = false;
      status('saved');
      if (document.getElementById('rest').hidden) {
        try {
          localStorage.removeItem(LSKEY);
        } catch {
          /* storage may be blocked */
        }
      }
    } catch {
      MODE = 'local';
      save();
    }
  } else {
    try {
      localStorage.setItem(LSKEY, JSON.stringify(DOC));
    } catch {
      /* storage may be blocked */
    }
    DIRTY = false;
    status('in this browser only');
  }
}

function applyMeta() {
  document.title = DOC.meta?.title || SLUG;
  document.documentElement.lang = DOC.meta?.lang || 'ru';
}
async function load() {
  if (SHARED) {
    DOC = MD.parse(document.getElementById('seed').textContent.replace(/<\\\/(script)/gi, '</$1')).doc;
    document.body.classList.add('print');
    applyMeta();
    render();
    return;
  }
  try {
    const r = await fetch(DATA, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    ETAG = r.headers.get('ETag');
    if (r.headers.get('X-Role') === 'viewer') {
      RO = true;
      document.body.classList.add('print');
    }
    const wire = await r.text();
    try {
      BASE = await fromWire(wire);
    } catch (e) {
      RO = true;
      status(e.message);
      document.querySelectorAll('#bar button').forEach((b) => (b.hidden = true));
      const m = $('p', '', e.message);
      m.style.cssText = 'margin:20vh 0;font-size:18px';
      document.getElementById('app').replaceChildren(m);
      return false;
    }
    DOC = MD.parse(BASE).doc;
    MODE = 'server';
    status('ready');
    let ls = null;
    try {
      ls = localStorage.getItem(LSKEY);
    } catch {
      /* storage may be blocked */
    }
    if (ls) {
      const L = JSON.parse(ls);
      if (JSON.stringify([L.hero, L.blocks]) !== JSON.stringify([DOC.hero, DOC.blocks])) {
        const b = document.getElementById('rest');
        b.hidden = false;
        b.onclick = () => {
          snap();
          DOC = L;
          render();
          DIRTY = true;
          save();
          b.hidden = true;
          status('taken from the browser, ↶ brings back the file');
        };
      }
    }
  } catch {
    let ls = null;
    try {
      ls = localStorage.getItem(LSKEY);
    } catch {
      /* storage may be blocked */
    }
    if (ls) {
      DOC = JSON.parse(ls);
      MODE = 'local';
      status('from this browser');
    } else {
      status('no data: is the server running?');
      return;
    }
  }
  applyMeta();
  render();
}

document.getElementById('edit').onclick = (e) => {
  document.body.classList.toggle('edit');
  const on = document.body.classList.contains('edit');
  e.target.classList.toggle('on', on);
  e.target.textContent = on ? '✓ done' : '✎ edit';
  status(on ? 'editing on' : DIRTY ? 'not saved' : 'saved');
  render();
};
document.getElementById('undo').onclick = undo;
document.getElementById('dl').onclick = () => {
  const b = new Blob([MD.serialize(DOC)], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = SLUG + '.md';
  a.click();
};
// A host page that embeds the engine (the Obsidian plugin) may set window.HOST:
// sources() -> {css, md, js} as text, and saveHTML(html) to keep the file itself.
const HOST = window.HOST || null;
document.getElementById('html').onclick = async () => {
  const [css, md, js] = HOST
    ? (({ css, md, js }) => [css, md, js])(await HOST.sources())
    : await Promise.all(
        [document.querySelector('link[href$="engine.css"]').href, MD_JS, ENGINE_JS].map(async (u) =>
          (await fetch(u, { cache: 'no-store' })).text(),
        ),
      );
  const esc = (s, tag) => s.replace(new RegExp('</' + tag, 'gi'), '<\\/' + tag);
  const html = `<!doctype html>
<html lang="${document.documentElement.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${document.title.replace(/</g, '&lt;')}</title>
<style>
${esc(css, 'style')}
</style>
</head>
<body>
<script type="text/markdown" id="seed" data-shared>${MD.serialize(DOC).replace(/<\/(script)/gi, '<\\/$1')}</script>
<script>
${esc(md, 'script')}
</script>
<script>
${esc(js, 'script')}
</script>
</body>
</html>
`;
  if (HOST) {
    status(await HOST.saveHTML(html));
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = SLUG + '.html';
  a.click();
};
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    save();
  }
  // undo: always in edit mode; otherwise when no text is being typed (e.g. after dragging a gantt bar)
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !RO && (isEdit() || !document.activeElement?.isContentEditable)) {
    e.preventDefault();
    undo();
  }
  if (e.key === 'Escape' && document.body.classList.contains('edit')) document.getElementById('edit').click();
  if (
    VIEW === 'tabs' &&
    (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
    !e.metaKey &&
    !e.altKey &&
    !e.ctrlKey &&
    !document.activeElement?.isContentEditable &&
    document.body.classList.contains('hastoc')
  ) {
    const ids = sections().map((s) => s.id),
      i = ids.indexOf(TAB) + (e.key === 'ArrowLeft' ? -1 : 1);
    if (i >= 0 && i < ids.length) go(ids[i]);
  }
});
window.addEventListener('beforeunload', (e) => {
  if (DIRTY) {
    e.preventDefault();
    e.returnValue = '';
  }
});
load().then((ok) => {
  if (ok === false) return;
  if (!RO && frag() === '#edit') document.getElementById('edit').click();
  else if (VIEW === 'scroll' && /^#(s\d+|intro)$/.test(frag()))
    document.getElementById(frag().slice(1))?.scrollIntoView();
});

// Links come from page text that editors write: only web, mail and in-page addresses, never javascript: and the like.
function setHref(a, h) {
  h = String(h || '').trim();
  if (/^(https?:|mailto:|#|[^:]*$)/i.test(h)) a.href = h;
}
