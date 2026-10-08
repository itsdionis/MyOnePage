// Page Markdown <-> page document ({meta, hero, blocks}). The format is described in
// .claude/skills/myone-page/SKILL.md. Shared by the browser (engine.js, index.html) and
// scripts/check.ts, so it stays one classic script that defines the global MD.
//
// Text fields hold Markdown source as written (bold, links, \$ escapes...); MD.inline()
// turns one into display nodes. parse() never drops text: anything that is not a block
// becomes a `p` block holding the lines verbatim.
/* exported MD -- the global the page and check.mjs use */
var MD = (function () {
  'use strict';

  const CALLOUTS = ['lineage', 'cards', 'uc', 'stats', 'cascade', 'flow', 'cmdcols', 'canvas'];
  const TABLE_OPTS = ['accentCol', 'cols', 'linkCol', 'pillCol', 'agoCol'];
  const SLOTS = 'psuacmhkr';
  const SEP = ' · ';

  // ---------- small helpers ----------

  const blank = (s) => !s || !s.trim();
  const isHead = (s) => /^#{1,6}(\s|$)/.test(s);
  const isQuote = (s) => /^ {0,3}>/.test(s);
  const isTable = (s) => /^ {0,3}\|/.test(s);
  const isTableOpt = (s) => /^%%\s*table\b.*%%\s*$/.test(s);
  const isFence = (s) => /^ {0,3}(```|~~~)/.test(s);
  const isOl = (s) => /^\d{1,9}[.)]( |$)/.test(s);
  const startsBlock = (s) => isHead(s) || isQuote(s) || isTable(s) || isTableOpt(s) || isFence(s);

  // [text](url) or [text](<url>), the whole string
  const LINK = /^\[((?:[^\]\\]|\\.)*)\]\((<[^>]*>|(?:[^()\s]|\((?:[^()\s]|\([^()\s]*\))*\))*)\)/;
  function wholeLink(s) {
    const m = LINK.exec(s);
    if (!m || m[0].length !== s.length) return null;
    const d = m[2];
    return { t: m[1], href: d[0] === '<' ? d.slice(1, -1) : d };
  }
  function link(t, href) {
    let open = 0,
      bad = /[\s<>]/.test(href);
    for (const c of href) {
      if (c === '(') open++;
      else if (c === ')' && --open < 0) bad = true;
    }
    return `[${t}](${bad || open ? `<${href}>` : href})`;
  }

  // Leading **bold**, then the rest: "**b** s" -> {b, s}
  function splitBold(s) {
    const m = /^\*\*((?:[^*\\]|\\.|\*(?!\*))+?)\*\*(?:\s+([\s\S]*))?$/.exec(s);
    return m ? { b: m[1], s: m[2] || '' } : { b: '', s };
  }
  // A field written inside **...** cannot hold ** itself, so its * are escaped.
  const strong = (b) => one(b).replace(/\\[\s\S]|\*/g, (m) => (m === '*' ? '\\*' : m));
  const bold = (b) => (b ? `**${strong(b)}**` : '');
  const lead = (b, s) => [bold(b), one(s)].filter(Boolean).join(' ');

  // Code spans at the start: "`a` `b` rest" -> {c:['a','b'], s:'rest'}
  function splitCode(s) {
    const c = [];
    let i = 0;
    for (;;) {
      const run = /^`+/.exec(s.slice(i));
      if (!run) break;
      // the closing run: the first run of exactly n backticks (no lookbehind: iOS before 16.4 lacks it)
      const n = run[0].length,
        re = /`+/g,
        t = s.slice(i + n);
      let m;
      while ((m = re.exec(t)) && m[0].length !== n);
      if (!m) break;
      let v = s.slice(i + n, i + n + m.index);
      if (/^ [\s\S]* $/.test(v) && v.trim()) v = v.slice(1, -1);
      c.push(v);
      i += n + m.index + n;
      const sp = /^ +/.exec(s.slice(i));
      if (!sp) break;
      i += sp[0].length;
    }
    return { c, s: s.slice(i) };
  }
  function code(v) {
    const longest = Math.max(0, ...(v.match(/`+/g) || []).map((x) => x.length));
    const f = '`'.repeat(longest + 1),
      pad = v.startsWith('`') || v.endsWith('`') || (/^ .* $/.test(v) && v.trim()) ? ' ' : '';
    return f + pad + v + pad + f;
  }

  // Text written back to Markdown. Bare $ is escaped: Obsidian reads $...$ as maths.
  function tx(s) {
    return String(s ?? '').replace(/(`+)[\s\S]*?\1|\\[\s\S]|\$/g, (m) => (m === '$' ? '\\$' : m));
  }
  // The reverse of tx(), for the editor: shows \$ as $ while a field is edited; tx() adds it back on save.
  function untx(s) {
    return String(s ?? '').replace(/(`+)[\s\S]*?\1|\\[\s\S]/g, (m) => (m === '\\$' ? '$' : m));
  }
  const one = (s) => tx(s).replace(/\s*\n\s*/g, ' '); // a single-line spot: heading, list line, cell
  const lines = (s) => tx(s).split('\n');

  // ---------- frontmatter ----------

  function yamlIn(v) {
    v = v.trim();
    if (v[0] === '"') {
      try {
        return JSON.parse(v);
      } catch {
        /* not JSON: kept as written */
      }
    }
    if (v[0] === "'" && v.endsWith("'") && v.length > 1) return v.slice(1, -1).replace(/''/g, "'");
    return v;
  }
  function yamlOut(v) {
    v = String(v);
    return v === '' || /^[\s'"[\]{}>|*&!%@`#,?:~-]|: | #|\s$|^(true|false|null|yes|no)$/i.test(v)
      ? JSON.stringify(v)
      : v;
  }

  // ---------- parse ----------

  function parse(src) {
    const issues = [];
    const note = (line, level, msg) => issues.push({ line, level, msg });
    const L = String(src).replace(/\r\n?/g, '\n').split('\n');
    const doc = { meta: {}, hero: { lines: [], highlight: '', tail: '', sub: '' }, blocks: [] };
    const at = []; // line of each block, for messages
    let i = 0,
      start = 0;
    const add = (b, ln = start) => {
      doc.blocks.push(b);
      at.push(ln);
    };

    if (L[0] === '---') {
      const end = L.indexOf('---', 1);
      if (end < 0) note(1, 'error', 'frontmatter is not closed with ---');
      else {
        const extra = [];
        for (let j = 1; j < end; j++) {
          const m = /^(title|updated|lang|view):(?:\s+(.*))?$/.exec(L[j]);
          if (m && !(j + 1 < end && /^\s/.test(L[j + 1]))) doc.meta[m[1]] = yamlIn(m[2] || '');
          else extra.push(L[j]);
        }
        if (extra.length) doc.fm = extra.join('\n');
        i = end + 1;
      }
    } else note(1, 'error', 'no frontmatter: start with --- title / updated --- ');

    const p = (from, to, why) => {
      add({ type: 'p', text: L.slice(from, to).join('\n') }, from + 1);
      if (why) note(from + 1, 'warn', why + '; kept as plain text');
    };
    // a paragraph runs to a blank line or to the start of another block
    const paraEnd = (j) => {
      while (j < L.length && !blank(L[j]) && !startsBlock(L[j])) j++;
      return j;
    };

    // hero: the # lines at the top, then the first paragraph as sub
    while (i < L.length && blank(L[i])) i++;
    if (/^# /.test(L[i] || '')) {
      const hl = [];
      while (i < L.length && /^# /.test(L[i])) hl.push(L[i++].slice(2));
      const last = hl.pop(),
        m = /^(.*?)==(.+?)==(.*)$/.exec(last);
      doc.hero.lines = hl.map((s) => s.trimEnd());
      if (m) {
        doc.hero.lines.push(m[1]);
        doc.hero.highlight = m[2];
        doc.hero.tail = m[3].trimEnd();
      } else doc.hero.lines.push(last.trimEnd());
      while (i < L.length && blank(L[i])) i++;
      if (i < L.length && !startsBlock(L[i]) && !isOl(L[i]) && !/^\*\*/.test(L[i])) {
        const e = paraEnd(i);
        doc.hero.sub = L.slice(i, e).join('\n');
        i = e;
      }
    } else note(i + 1, 'warn', 'no hero: the page should start with a "# " line');

    while (i < L.length) {
      const s = L[i],
        ln = i + 1;
      if (blank(s)) {
        i++;
        continue;
      }
      start = ln;

      if (/^##(?: |$)/.test(s)) {
        const t = s.slice(2).trim();
        let num = '',
          ttl = t;
        if (t.startsWith('· ')) ttl = t.slice(2);
        else {
          const k = t.indexOf(SEP);
          if (k >= 0) {
            num = t.slice(0, k);
            ttl = t.slice(k + SEP.length);
          }
        }
        i++;
        let nt = '';
        if (i < L.length && !blank(L[i]) && !startsBlock(L[i]) && !isOl(L[i])) nt = L[i++].trim();
        add({ type: 'part', num, ttl, note: nt });
        continue;
      }
      if (/^###(?: |$)/.test(s)) {
        add({ type: 'h2', text: s.slice(3).trim() });
        i++;
        continue;
      }
      if (isHead(s)) {
        p(i, i + 1, 'only "## " (part) and "### " (heading) are blocks');
        i++;
        continue;
      }

      if (isFence(s)) {
        const f = /^ {0,3}(`{3,}|~{3,})/.exec(s)[1],
          info = s.trim().slice(f.length).trim();
        let e = i + 1;
        while (e < L.length && !L[e].trimStart().startsWith(f)) e++;
        const b = info === 'mermaid' && e < L.length ? gantt(L.slice(i + 1, e), ln, note) : null;
        if (b) add(b);
        else p(i, Math.min(e + 1, L.length));
        i = e + 1;
        continue;
      }

      if (isQuote(s)) {
        let e = i;
        while (e < L.length && isQuote(L[e])) e++;
        const b = callout(
          L.slice(i, e).map((x) => x.replace(/^ {0,3}> ?/, '')),
          ln,
          note,
        );
        if (b) add(b);
        else p(i, e);
        i = e;
        continue;
      }

      if (isTableOpt(s) || isTable(s)) {
        let e = isTableOpt(s) ? i + 1 : i;
        while (e < L.length && isTable(L[e])) e++;
        const b = table(L.slice(i, e), ln, note);
        if (b) add(b);
        else p(i, e, 'not a table: needs a header row and a | --- | row');
        i = e;
        continue;
      }

      if (isOl(s)) {
        const items = [];
        let e = i;
        for (; e < L.length && !blank(L[e]) && !(e > i && startsBlock(L[e])); e++) {
          const m = /^\d{1,9}[.)](?: (.*))?$/.exec(L[e]);
          if (m) {
            items.push(splitBold(m[1] || ''));
            continue;
          }
          const last = items[items.length - 1];
          last.s += (last.s ? '\n' : '') + L[e].trim();
        }
        add({ type: 'ol', items });
        i = e;
        continue;
      }

      const e = paraEnd(i),
        text = L.slice(i, e).join('\n');
      const r = /^\*\*((?:[^*\\]|\\.|\*(?!\*))+?)\*\*(?:[ \t]+([\s\S]*)|\n([\s\S]*))?$/.exec(text);
      if (r) add({ type: 'rule', lead: r[1], text: r[2] ?? r[3] ?? '' });
      else {
        p(i, e);
        if (/^[-*+] /.test(s))
          note(ln, 'info', 'a bullet list outside a callout is plain text; for cards use > [!cards]');
      }
      i = e;
    }
    return { doc, issues, at };
  }

  // "- [x] text" lines with indented continuation lines; null when a line is not part of a list
  function list(body) {
    const items = [];
    for (const s of body) {
      if (blank(s)) continue;
      const m = /^[-*+](?:[ \t]+(?:\[(.)\][ \t]+|\[(.)\]$)?(.*))?$/.exec(s);
      if (m) {
        items.push({ mark: m[1] || m[2] || '', text: m[3] || '', cont: [] });
        continue;
      }
      if (!items.length || !/^\s/.test(s)) return null;
      items[items.length - 1].cont.push(s.trim());
    }
    return items;
  }

  // Groups under "#### " headings, for cmdcols and canvas; null when text comes before the first one
  function groups(body) {
    const out = [];
    for (const s of body) {
      if (/^#### /.test(s)) {
        out.push({ head: s.slice(5).trim(), body: [] });
        continue;
      }
      if (!out.length) {
        if (blank(s)) continue;
        return null;
      }
      out[out.length - 1].body.push(s);
    }
    return out;
  }

  function callout(body, ln, note) {
    const h = /^\[!([\w-]+)\][+-]?(?:[ \t]+(.*))?$/.exec(body[0]);
    if (!h) return null;
    const type = h[1].toLowerCase(),
      title = (h[2] || '').trim(),
      rest = body.slice(1);
    if (!CALLOUTS.includes(type)) {
      note(ln, 'info', `[!${h[1]}] is not a block type; kept as plain text`);
      return null;
    }
    const fail = (why) => {
      note(ln, 'warn', `[!${type}]: ${why}; kept as plain text`);
      return null;
    };

    if (type === 'lineage') {
      while (rest.length && blank(rest[rest.length - 1])) rest.pop();
      while (rest.length && blank(rest[0])) rest.shift();
      return { type, lead: title, text: rest.join('\n') };
    }
    if (title) return fail('only [!lineage] takes a title after the type');

    if (type === 'cmdcols' || type === 'canvas') {
      const gs = groups(rest);
      if (!gs || !gs.length) return fail('each column starts with a "#### " line');
      if (type === 'cmdcols') {
        const cols = [];
        for (const g of gs) {
          const items = list(g.body);
          if (!items) return fail(`"${g.head}": only "- " lines go under a column`);
          const m = /^(.*?)[ \t]*(\[(?:[^\]\\]|\\.)*\]\([^\n]*\))$/.exec(g.head),
            lk = m && wholeLink(m[2]);
          cols.push({
            title: lk ? m[1] : g.head,
            link: lk ? lk.t : null,
            href: lk ? lk.href : null,
            items: items.map((it) => {
              const x = splitCode([it.text, ...it.cont].join(' ')),
                o = { c: x.c, s: x.s };
              if (it.mark === 'x') o.star = true;
              return o;
            }),
          });
        }
        return { type, cols };
      }
      const cells = [];
      for (const g of gs) {
        const m = /^(?:(.*?) · )?(.*?)\s*%%\s*([a-z])\s*%%$/.exec(g.head);
        if (!m) return fail(`"${g.head}": a cell heading is "#### N · Title %%slot%%"`);
        const st = g.body.findIndex((x) => /^##### ?/.test(x));
        const items = list(st < 0 ? g.body : g.body.slice(0, st)),
          sub = st < 0 ? [] : list(g.body.slice(st + 1));
        if (!items || !sub) return fail(`"${m[2]}": only "- " lines go in a cell`);
        const line = (it) => [it.text, ...it.cont].join('\n');
        const c = { k: m[3], n: m[1] || '', t: m[2], items: items.map(line) };
        if (st >= 0) {
          c.st = g.body[st].replace(/^##### ?/, '').trim();
          c.sub = sub.map(line);
        }
        cells.push(c);
      }
      return { type, cells };
    }

    const items = list(rest);
    if (!items) return fail('only "- " lines go inside');
    const flags = { stats: 'x!', flow: 'x' }[type] || '';
    for (const it of items)
      if (it.mark && !flags.includes(it.mark))
        note(ln, 'warn', `[!${type}]: "[${it.mark}]" means nothing here, dropped`);
    if (type === 'flow')
      return {
        type,
        steps: items.map((it) => {
          const t = [it.text, ...it.cont].join(' '),
            lk = wholeLink(t),
            o = { t: lk ? lk.t : t };
          if (it.mark === 'x') o.hi = true;
          if (lk) o.href = lk.href;
          return o;
        }),
      };
    if (type === 'cascade')
      return {
        type,
        steps: items.map((it) => {
          const x = splitBold(it.text);
          return { n: x.b, l: x.s, d: it.cont.join('\n') };
        }),
      };
    const xs = items.map((it) => ({ ...splitBold([it.text, ...it.cont].join('\n')), mark: it.mark }));
    if (type === 'stats')
      return {
        type,
        items: xs.map((x) => {
          const o = { v: x.b, k: x.s };
          if (x.mark === 'x') o.zero = true;
          if (x.mark === '!') o.warn = true;
          return o;
        }),
      };
    return { type, items: xs.map((x) => ({ b: x.b, s: x.s })) };
  }

  // A Mermaid gantt chart (```mermaid / gantt), which Obsidian draws too. Supported: title, dateFormat,
  // other directives before the first section (kept, mostly ignored), sections, and tasks
  // "Name :tags, id, start, end" where start may be empty or "after id" and end a date or 3d / 2w.
  const GANTT_TAGS = ['done', 'active', 'crit', 'milestone'];
  const GANTT_DIRECTIVES = [
    'axisFormat',
    'tickInterval',
    'excludes',
    'includes',
    'todayMarker',
    'weekday',
    'inclusiveEndDates',
    'topAxis',
    'displayMode',
    'accTitle',
    'accDescr',
  ];
  function gantt(body, ln, note) {
    const ls = body.map((x) => x.trim()).filter(Boolean);
    if (ls.shift() !== 'gantt') return null;
    const fail = (why) => {
      note(ln, 'warn', `gantt: ${why}; kept as plain text`);
      return null;
    };
    const b = { type: 'gantt', title: '', dateFormat: '', extra: [], sections: [] };
    let sec = null;
    for (const x of ls) {
      const w = /^[A-Za-z]+/.exec(x)?.[0];
      if (w === 'section') {
        sec = { name: x.slice(7).trim(), tasks: [] };
        b.sections.push(sec);
        continue;
      }
      if (!sec) {
        if (w === 'title') {
          b.title = x.slice(5).trim();
          continue;
        }
        if (w === 'dateFormat') {
          b.dateFormat = x.slice(10).trim();
          continue;
        }
        if (GANTT_DIRECTIVES.includes(w) || x.startsWith('%%')) {
          b.extra.push(x);
          continue;
        }
      }
      const k = x.indexOf(':');
      if (k < 0) return fail(`"${x}" is not a task ("Name :start, end"); settings go before the first section`);
      const meta = x
          .slice(k + 1)
          .split(',')
          .map((y) => y.trim()),
        tags = [];
      while (meta.length > 1 && GANTT_TAGS.includes(meta[0])) tags.push(meta.shift());
      if (meta.length > 3 || !meta[meta.length - 1])
        return fail(`"${x}": a task is "Name :tags, id, start, end" (a colon in the name is written #58;)`);
      const [id, start, end] = meta.length === 3 ? meta : meta.length === 2 ? ['', ...meta] : ['', '', meta[0]];
      if (!sec) {
        sec = { name: '', tasks: [] };
        b.sections.push(sec);
      }
      sec.tasks.push({ t: x.slice(0, k).trim().replace(/#58;/g, ':'), tags, id, start, end });
    }
    return b;
  }

  // Days (UTC day numbers) of each gantt task: rows[section][task] = {from, to} or null when its dates
  // do not resolve. Ends are exclusive, as in Mermaid, unless the chart says inclusiveEndDates.
  function schedule(b) {
    const day = (s) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
      return m ? Date.UTC(+m[1], m[2] - 1, +m[3]) / 864e5 : null;
    };
    const dur = (s) => {
      const m = /^(\d+(?:\.\d+)?)\s*(w|d|h)$/.exec(s || '');
      return m ? +m[1] * { w: 7, d: 1, h: 1 / 24 }[m[2]] : null;
    };
    const incl = (b.extra || []).some((x) => /^inclusiveEndDates\b/.test(x));
    const ends = {};
    let prev = null;
    const rows = b.sections.map((s) =>
      s.tasks.map((t) => {
        let from;
        if (!t.start) from = prev;
        else if (/^after\s/.test(t.start)) {
          const xs = t.start
            .slice(6)
            .trim()
            .split(/\s+/)
            .map((id) => ends[id]);
          from = xs.some((x) => x == null) ? null : Math.max(...xs);
        } else from = day(t.start);
        let to = day(t.end);
        if (to != null) {
          if (incl) to += 1;
        } else {
          const d = dur(t.end);
          to = d != null && from != null ? from + d : null;
        }
        if (from == null || to == null || to < from) return null;
        if (t.id) ends[t.id] = to;
        prev = to;
        return { from, to };
      }),
    );
    return rows;
  }

  function cells(s) {
    s = s
      .trim()
      .replace(/^\|/, '')
      .replace(/(^|[^\\])\|$/, '$1');
    const out = [];
    let from = 0; // split on | not after \ (no lookbehind: iOS before 16.4 lacks it)
    for (let k = 0; k < s.length; k++)
      if (s[k] === '|' && s[k - 1] !== '\\') {
        out.push(s.slice(from, k));
        from = k + 1;
      }
    out.push(s.slice(from));
    return out.map((c) => c.trim().replace(/\\\|/g, '|'));
  }
  function table(rows, ln, note) {
    const b = { type: 'table', accentCol: -1 };
    if (isTableOpt(rows[0])) {
      const o = rows
        .shift()
        .replace(/^%%\s*table\b/, '')
        .replace(/%%\s*$/, '');
      for (const m of o.matchAll(/(\w+)=("[^"]*"|\S+)/g)) {
        const k = m[1],
          v = m[2][0] === '"' ? m[2].slice(1, -1) : m[2];
        if (!TABLE_OPTS.includes(k)) {
          note(ln, 'warn', `table: unknown option ${k}, dropped`);
          continue;
        }
        b[k] = k === 'cols' ? v : +v;
        if (k !== 'cols' && !Number.isInteger(b[k])) {
          note(ln, 'error', `table: ${k} must be a column number`);
          delete b[k];
        }
      }
    }
    if (rows.length < 2 || !/^[\s|:-]+$/.test(rows[1]) || !rows[1].includes('-')) return null;
    b.head = cells(rows[0]);
    const n = b.head.length;
    b.rows = rows.slice(2).map((r) => {
      const c = cells(r);
      while (c.length < n) c.push('');
      if (b.linkCol != null) {
        const lk = wholeLink(c[b.linkCol] || '');
        if (lk) {
          c[b.linkCol] = lk.t;
          c.splice(n, 0, lk.href);
        }
      }
      return c;
    });
    return b;
  }

  // ---------- serialize ----------

  function serialize(doc) {
    const o = [],
      m = doc.meta || {},
      h = doc.hero || {};
    o.push('---');
    const KNOWN = ['title', 'updated', 'lang', 'view'];
    for (const k of KNOWN) if (m[k] != null && m[k] !== '') o.push(`${k}: ${yamlOut(m[k])}`);
    for (const k of Object.keys(m))
      if (!KNOWN.includes(k) && typeof m[k] !== 'object') o.push(`${k}: ${yamlOut(m[k])}`);
    if (doc.fm) o.push(doc.fm);
    o.push('---', '');

    const hl = (h.lines || []).map(one);
    if (hl.length || h.highlight) {
      const last = hl.pop() ?? '';
      hl.forEach((x) => o.push('# ' + x.trimEnd()));
      o.push(
        '# ' +
          (h.highlight ? `${last}==${one(h.highlight)}==${one(h.tail || '')}` : last + one(h.tail || '')).trimEnd(),
        '',
      );
      if (h.sub) o.push(...lines(h.sub), '');
    }

    const q = (s) => (s ? '> ' + s : '>');
    const item = (mark, text, cont, ind = '  ') => {
      const ls = String(text).split('\n');
      o.push(q(`- ${mark ? `[${mark}] ` : ''}${ls[0]}`.trimEnd()));
      for (const x of [...ls.slice(1), ...cont]) o.push(q(ind + x));
    };

    for (const b of doc.blocks || []) {
      switch (b.type) {
        case 'part':
          o.push('## ' + (b.num ? one(b.num) + SEP : String(b.ttl).includes(SEP) ? '· ' : '') + one(b.ttl));
          if (b.note) o.push(one(b.note));
          break;
        case 'h2':
          o.push(('### ' + one(b.text)).trimEnd());
          break;
        case 'rule':
          o.push(...(`**${strong(b.lead)}**` + (b.text ? ' ' + tx(b.text) : '')).split('\n'));
          break;
        case 'lineage':
          o.push(q(`[!lineage] ${one(b.lead)}`.trimEnd()), ...(b.text ? lines(b.text).map(q) : []));
          break;
        case 'cards':
        case 'uc':
          o.push(`> [!${b.type}]`);
          for (const it of b.items) item('', [bold(it.b), tx(it.s)].filter(Boolean).join(' '), []);
          break;
        case 'stats':
          o.push('> [!stats]');
          for (const it of b.items) item(it.zero ? 'x' : it.warn ? '!' : '', lead(it.v, it.k), []);
          break;
        case 'cascade':
          o.push('> [!cascade]');
          for (const s of b.steps) item('', lead(s.n, s.l), s.d ? lines(s.d) : []);
          break;
        case 'flow':
          o.push('> [!flow]');
          for (const s of b.steps) item(s.hi ? 'x' : '', s.href ? link(one(s.t), s.href) : one(s.t), []);
          break;
        case 'ol':
          b.items.forEach((it, i) => {
            const ls = [bold(it.b), tx(it.s)].filter(Boolean).join(' ').split('\n');
            o.push(`${i + 1}. ${ls[0]}`.trimEnd(), ...ls.slice(1).map((x) => '   ' + x));
          });
          break;
        case 'cmdcols':
          o.push('> [!cmdcols]');
          b.cols.forEach((c, ci) => {
            if (ci) o.push('>');
            o.push(q(`#### ${one(c.title)}${c.link ? ' ' + link(one(c.link), c.href || '') : ''}`));
            for (const it of c.items)
              item(it.star ? 'x' : '', [...(it.c || []).map(code), one(it.s)].filter(Boolean).join(' '), []);
          });
          break;
        case 'canvas':
          o.push('> [!canvas]');
          b.cells.forEach((c, ci) => {
            if (ci) o.push('>');
            o.push(q(`#### ${c.n ? one(c.n) + SEP : ''}${one(c.t)} %%${c.k}%%`));
            for (const x of c.items || []) item('', tx(x), []);
            if (c.st != null) {
              o.push(q(`##### ${one(c.st)}`.trimEnd()));
              for (const x of c.sub || []) item('', tx(x), []);
            }
          });
          break;
        case 'table': {
          const opts = TABLE_OPTS.filter((k) => b[k] != null && !(k === 'accentCol' && b[k] === -1)).map(
            (k) => `${k}=${k === 'cols' && /\s/.test(b[k]) ? `"${b[k]}"` : b[k]}`,
          );
          if (opts.length) o.push(`%% table ${opts.join(' ')} %%`);
          const n = b.head.length,
            cell = (s) => one(s).replace(/\|/g, '\\|');
          const row = (cs) => '| ' + cs.join(' | ') + ' |';
          o.push(row(b.head.map(cell)), row(b.head.map(() => '---')));
          for (const r of b.rows) {
            const cs = r.slice(0, n).map(cell);
            while (cs.length < n) cs.push('');
            if (b.linkCol != null && r[n] && b.linkCol < n) cs[b.linkCol] = link(cs[b.linkCol], r[n]);
            cs.push(...r.slice(b.linkCol != null && r[n] ? n + 1 : n).map(cell));
            o.push(row(cs));
          }
          break;
        }
        case 'gantt':
          o.push('```mermaid', 'gantt');
          if (b.title) o.push('  title ' + String(b.title).replace(/\s*\n\s*/g, ' '));
          o.push('  dateFormat ' + (b.dateFormat || 'YYYY-MM-DD'));
          for (const x of b.extra || []) o.push('  ' + x);
          b.sections.forEach((s, si) => {
            if (s.name || si) o.push(('  section ' + String(s.name).replace(/\s*\n\s*/g, ' ')).trimEnd());
            for (const t of s.tasks) {
              const name = String(t.t)
                .replace(/\s*\n\s*/g, ' ')
                .replace(/:/g, '#58;');
              o.push(`    ${name} :${[...(t.tags || []), t.id, t.start, t.end].filter(Boolean).join(', ')}`);
            }
          });
          o.push('```');
          break;
        case 'p':
          o.push(...String(b.text).split('\n'));
          break;
        default:
          throw new Error(`unknown block type: ${b.type}`);
      }
      o.push('');
    }
    return o.join('\n').replace(/\n+$/, '') + '\n';
  }

  // ---------- checks beyond syntax ----------

  // `at` is parse()'s line of each block, when there is one
  function check(doc, at) {
    const out = [];
    let line = 1;
    const w = (level, msg) => out.push({ line, level, msg });
    const m = doc.meta || {};
    if (!m.title) w('error', 'meta: title is missing');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.updated || '')) w('error', 'meta: updated must be YYYY-MM-DD');
    if (m.lang != null && !/^[a-z]{2}$/.test(m.lang)) w('warn', 'meta: lang should be a two-letter code');
    if (m.view != null && !['scroll', 'tabs'].includes(m.view)) w('warn', 'meta: view is scroll or tabs');
    (doc.blocks || []).forEach((b, i) => {
      line = at?.[i] || 0;
      const what = `${b.type} block`;
      if (b.type === 'rule' && !b.lead) w('warn', `${what}: no lead`);
      if (b.type === 'stats')
        b.items.forEach((x) => {
          if (x.zero && x.warn) w('warn', `${what}: "${x.v}" is both zero and warn`);
        });
      if (b.type === 'table') {
        const n = b.head.length;
        for (const k of ['accentCol', 'linkCol', 'pillCol', 'agoCol'])
          if (b[k] != null && b[k] !== -1 && !(b[k] >= 0 && b[k] < n))
            w('error', `${what}: ${k}=${b[k]} is not a column (0..${n - 1})`);
        b.rows.forEach((r, ri) => {
          const len = r.length - (b.linkCol != null && r.length > n ? 1 : 0);
          if (len !== n) w('warn', `${what}: row ${ri + 1} has ${len} cells, the header has ${n}`);
        });
      }
      if (b.type === 'canvas') {
        const seen = new Set();
        for (const c of b.cells) {
          if (!SLOTS.includes(c.k)) w('error', `${what}: slot "${c.k}" is not one of ${SLOTS}`);
          if (seen.has(c.k)) w('error', `${what}: slot "${c.k}" is used twice`);
          seen.add(c.k);
        }
      }
      if (b.type === 'gantt') {
        if ((b.dateFormat || 'YYYY-MM-DD') !== 'YYYY-MM-DD')
          w('error', `${what}: dateFormat must be YYYY-MM-DD, the page cannot place other dates`);
        if ((b.extra || []).some((x) => /^excludes\b/.test(x)))
          w('warn', `${what}: excludes is ignored by the page, bars will be longer than in Obsidian`);
        const ids = new Set(),
          rows = schedule(b);
        b.sections.forEach((s, si) =>
          s.tasks.forEach((t, ti) => {
            if (t.id) {
              if (ids.has(t.id)) w('error', `${what}: id "${t.id}" is used twice`);
              ids.add(t.id);
            }
            if (t.id && !t.start)
              w('error', `${what}: "${t.t}" has an id but no start, Mermaid would read the id as the start`);
            if (!rows[si][ti])
              w(
                'warn',
                `${what}: "${t.t}" has no dates the page can place (start "${t.start || 'after the previous task'}", end "${t.end}")`,
              );
          }),
        );
      }
      if (b.type === 'p')
        w('info', `${what}: plain text, not a styled block: "${String(b.text).split('\n')[0].slice(0, 60)}"`);
    });
    return out;
  }

  // ---------- inline Markdown, for display ----------

  // -> [{t:'text',v} | {t:'code',v} | {t:'b'|'i'|'mark'|'s', c:[...]} | {t:'a', href, c:[...]}]
  function inline(s) {
    s = String(s ?? '');
    const out = [];
    let buf = '';
    const flush = () => {
      if (buf) {
        out.push({ t: 'text', v: buf });
        buf = '';
      }
    };
    const wrap = (t, c) => {
      flush();
      out.push({ t, c: inline(c) });
    };
    for (let i = 0; i < s.length;) {
      const ch = s[i],
        rest = s.slice(i);
      if (ch === '\\' && /[!-/:-@[-`{-~]/.test(s[i + 1] || '')) {
        buf += s[i + 1];
        i += 2;
        continue;
      }
      if (ch === '`') {
        const run = /^`+/.exec(rest)[0],
          m = new RegExp('^' + run + '([\\s\\S]*?[^`])' + run + '(?!`)').exec(rest);
        if (m) {
          flush();
          let v = m[1];
          if (/^ [\s\S]* $/.test(v) && v.trim()) v = v.slice(1, -1);
          out.push({ t: 'code', v });
          i += m[0].length;
          continue;
        }
        buf += run;
        i += run.length;
        continue;
      }
      if (rest.startsWith('%%')) {
        const j = s.indexOf('%%', i + 2);
        if (j > 0) {
          i = j + 2;
          continue;
        }
      }
      if (rest.startsWith('[[')) {
        const j = s.indexOf(']]', i + 2);
        if (j > 0) {
          const x = s.slice(i + 2, j),
            bar = x.indexOf('|');
          buf += bar >= 0 ? x.slice(bar + 1) : x.replace(/#\^?/, ' › ');
          i = j + 2;
          continue;
        }
      }
      if (ch === '[') {
        const m = LINK.exec(rest);
        if (m) {
          flush();
          const d = m[2];
          out.push({ t: 'a', href: d[0] === '<' ? d.slice(1, -1) : d, c: inline(m[1]) });
          i += m[0].length;
          continue;
        }
      }
      const pair = (d, t) => {
        if (!rest.startsWith(d) || /\s/.test(s[i + d.length] || ' ')) return false;
        let j = s.indexOf(d, i + d.length + 1);
        while (j > 0 && (s[j - 1] === '\\' || /\s/.test(s[j - 1]))) j = s.indexOf(d, j + 1);
        if (j < 0) return false;
        if (d === '_' && /\w/.test(s[j + 1] || '')) return false;
        wrap(t, s.slice(i + d.length, j));
        i = j + d.length;
        return true;
      };
      if (pair('**', 'b') || pair('__', 'b') || pair('==', 'mark') || pair('~~', 's') || pair('*', 'i')) continue;
      if (ch === '_' && !/\w/.test(s[i - 1] || '') && pair('_', 'i')) continue;
      buf += ch;
      i++;
    }
    flush();
    return out;
  }
  function plain(s) {
    const walk = (ns) => ns.map((n) => (n.c ? walk(n.c) : n.v)).join('');
    return walk(inline(s));
  }

  return { parse, serialize, check, inline, plain, schedule, untx };
})();
