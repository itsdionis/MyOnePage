// Make a page with AI: any chat app writes the page, with copy and paste only. Step 1 copies a request (the format,
// cut from the skill's marked sections, a template's outline to start from if one is chosen, then the note); step 2
// takes the answer back, finds the page in it, puts it through the engine's own converter (md.js) and opens it as a
// new note next to the source. A page just made from a template ("Fill it with AI" on it) is the outline itself: its
// text is not sent as notes, and while nobody has changed it the answer takes its place.
import { Modal, Notice, Setting, TFile, moment, normalizePath } from 'obsidian';
import type MyOnePagePlugin from './main';
import { TEMPLATES, fromTemplate } from './templates';
import type { Template } from './templates';
import { frontmatter } from './web';
import MD from '../engine/md.js?api';
import skill from '../skills/myone-page/SKILL.md?text';

// The parts of SKILL.md between <!-- prompt --> and <!-- /prompt -->: the page, the blocks, text inside them, what
// to avoid. So the short prompt can't drift from the skill.
const FORMAT = [...skill.matchAll(/<!-- prompt -->\n([\s\S]*?)<!-- \/prompt -->/g)]
  .map((m) => m[1].trim())
  .join('\n\n');

// The templates the AI can start from (blank has nothing to follow).
export const OUTLINES = TEMPLATES.filter((t) => t.slug !== 'blank');

export function promptFor(note: string, purpose: string, template?: Template) {
  const today = moment().format('YYYY-MM-DD');
  const outline = template
    ? `

## Outline

Start from this outline (${template.title.toLowerCase()}: ${template.line.toLowerCase()}). Keep its parts and blocks and their order. Replace every \`[placeholder]\` and every sample line with what my notes say; drop a part or a line my notes have nothing for rather than invent it.

\`\`\`\`markdown
${template.text.trim()}
\`\`\`\``
    : '';
  return `You write a MyOnePage: one Markdown note that the MyOnePage plugin for Obsidian shows as a styled one-page report. Follow this format exactly.

${FORMAT}

## Rules

1. Start with the frontmatter: \`title\`, \`updated: ${today}\`, \`lang\` (the language of my notes, two letters), \`myone.page: true\`. Write the page in that language.
2. Then one to three \`# \` hero lines, the last one with one ==highlight==, and a one-paragraph subtitle.
3. Split the page into \`## \` parts, and use the blocks from the table: numbers as stats, steps as flow, comparisons as tables. Anything else shows as plain text.
4. Keep every fact from my notes and invent none: no numbers, names or dates that are not in them.
5. One blank line between blocks, none inside a block. No HTML. Write \\$ for a dollar sign.${outline}

## Task

Rewrite my notes below as a MyOnePage.${purpose.trim() ? ` The page is for: ${purpose.trim()}.` : ''} Answer with the Markdown only, in one code block that starts with \`\`\`\`markdown (four backticks) and ends with \`\`\`\`.

## My notes

${note.trim() || '(after this request: I paste them or attach files)'}
`;
}

// The page in an AI's answer: the code block that looks most like a page (frontmatter or a `# ` line; the longest one
// wins), or the whole answer from its frontmatter on when there is no code block. A fence inside the block with an
// info string (```mermaid) opens an inner block, so its closing ``` doesn't end the page.
export function pageText(answer: string) {
  const L = answer.replace(/\r\n?/g, '\n').split('\n'),
    found: string[] = [];
  const fence = (s: string) => /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/.exec(s);
  for (let i = 0; i < L.length; i++) {
    const open = fence(L[i]);
    if (!open) continue;
    const mark = open[1];
    let inner = '',
      j = i + 1;
    for (; j < L.length; j++) {
      const f = fence(L[j]);
      if (!f || f[1][0] !== mark[0]) continue;
      if (inner) {
        if (!f[2] && f[1].length >= inner.length) inner = '';
      } else if (f[2]) inner = f[1];
      else if (f[1].length >= mark.length) break;
    }
    found.push(L.slice(i + 1, j).join('\n'));
    i = j;
  }
  const text = L.join('\n'),
    fm = /^---\n(?=[\w.-]+:)/m.exec(text);
  const looks = (s: string) => /^---\n[\s\S]*?\n---/.test(s.trimStart()) || /^# /m.test(s);
  const longest = (a: string[]) => a.sort((x, y) => y.length - x.length)[0],
    pick = longest(found.filter(looks)) ?? (fm || /^# /m.test(text) ? undefined : longest(found));
  // no block holds the page: it is the answer itself (a fenced Gantt chart inside it is not the page)
  return (pick ?? (fm ? text.slice(fm.index) : text)).trim() + '\n';
}

// The page as the plugin saves it: canonical form, `myone.page: true`, today's `updated`, a title, and never the
// sharing keys (a pasted `share: new` would put the page online), nor `template:` (the "click to write" line).
// `unread` counts the parts that fell back to text (what md.js says is "plain text": a block it could not read, a
// list outside a callout), not ordinary paragraphs.
export function toPage(text: string, fallbackTitle: string) {
  const { doc, issues } = MD.parse(text);
  doc.meta.updated = moment().format('YYYY-MM-DD');
  if (!doc.meta.title)
    doc.meta.title =
      doc.hero.lines
        .join(' ')
        .replace(/[=*_`]/g, '')
        .trim() || fallbackTitle;
  const fm: string[] = [];
  let drop = false; // the lines of a list under a dropped key go with it
  for (const l of (doc.fm ?? '').split('\n')) {
    if (/^\S/.test(l)) drop = /^(share|editors|viewers|template|myone\.page):/.test(l);
    if (!drop && l.trim()) fm.push(l);
  }
  doc.fm = [...fm, 'myone.page: true'].join('\n');
  return {
    text: MD.serialize(doc),
    unread: issues.filter((i) => /plain text/.test(i.msg)).length,
    title: doc.meta.title,
  };
}

// A note name from a title: no characters Obsidian refuses in a file name or a link.
const fileName = (title: string) =>
  title
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'Page';

// Still exactly the outline the note was made from (only its date is the note's own).
function untouched(text: string, t: Template | undefined) {
  const date = /^updated: (\S+)$/m.exec(text)?.[1];
  return !!t && !!date && fromTemplate(t, date) === text;
}

export class MakeWithAI extends Modal {
  plugin: MyOnePagePlugin;
  source: TFile | null;
  made: Template | undefined; // the template the source was made from, while it says so (`template:`)
  template: Template | undefined; // the one the AI starts from
  purpose = '';
  constructor(plugin: MyOnePagePlugin, source: TFile | null) {
    super(plugin.app);
    this.plugin = plugin;
    this.source = source;
    const slug = source ? frontmatter(plugin.app, source).template : null;
    this.made = TEMPLATES.find((t) => t.slug === slug);
    this.template = OUTLINES.find((t) => t.slug === slug);
  }

  onOpen() {
    void this.draw();
  }
  async draw() {
    const { contentEl } = this,
      src = this.source;
    const outline = !!src && untouched(await this.app.vault.cachedRead(src), this.made); // the note is no notes
    this.titleEl.setText('Make a page with AI');
    contentEl.addClass('myone-page-ai');
    contentEl.createEl('p', {
      text: outline
        ? 'The AI fills in this page from your notes, which you give it in the chat. Its answer replaces the outline.'
        : src
          ? `The AI rewrites "${src.basename}" as a page. Your note stays as it is; the page is a new note next to it.`
          : 'No note is open: you give the AI your notes in the chat, and the page is a new note.',
    });
    new Setting(contentEl)
      .setName('Start from')
      .setDesc('A template the AI follows, or none: it chooses the parts itself.')
      .addDropdown((d) => {
        d.addOption('', 'No template');
        for (const t of OUTLINES) d.addOption(t.slug, t.title);
        d.setValue(this.template?.slug ?? '').onChange((v) => (this.template = OUTLINES.find((t) => t.slug === v)));
      });
    new Setting(contentEl)
      .setName('What is the page for?')
      .setDesc('Optional.')
      .addText((t) => t.setPlaceholder('An investor update').onChange((v) => (this.purpose = v)));

    contentEl.createEl('h4', { text: '1. Copy the request' });
    new Setting(contentEl)
      .setDesc(
        src && !outline
          ? 'Paste it into Claude, ChatGPT or any AI chat.'
          : 'Paste it into Claude, ChatGPT or any AI chat, then add your notes after it (paste them, or attach files).',
      )
      .addButton((b) =>
        b
          .setButtonText('Copy the request')
          .setCta()
          .onClick(async () => {
            const note = src && !outline ? await this.app.vault.cachedRead(src) : '';
            await navigator.clipboard.writeText(promptFor(note, this.purpose, this.template));
            b.setButtonText('Copied');
            new Notice('Request copied. Paste it into your AI chat.');
          }),
      );

    contentEl.createEl('h4', { text: "2. Paste the AI's answer" });
    new Setting(contentEl).setDesc("Copy the AI's whole answer (its copy button), then:").addButton((b) =>
      b
        .setButtonText('Paste the answer')
        .setCta()
        .onClick(async () => {
          // one click instead of select, paste, click; the box below is there if the clipboard can't be read
          const text = await navigator.clipboard.readText().catch(() => '');
          if (text.trim()) return this.make(text);
          new Notice('Nothing to paste: copy the answer first, or paste it into the box below.');
        }),
    );
    const answer = contentEl.createEl('textarea', {
      cls: 'myone-page-ai-answer',
      attr: { placeholder: 'Or paste it here', rows: '6' },
    });
    new Setting(contentEl).addButton((b) =>
      b.setButtonText('Make the page').onClick(() => void this.make(answer.value)),
    );
    const tip = contentEl.createEl('p', { cls: 'myone-page-ai-tip' });
    tip.appendText('Using Claude? ');
    tip.createEl('a', { text: 'Add the MyOnePage skill once', href: 'https://myone.page/ai' });
    tip.appendText(' and it writes better pages.');
  }

  async make(answer: string) {
    if (!answer.trim()) return new Notice("Paste the AI's answer first.");
    const src = this.source,
      page = toPage(pageText(answer), src?.basename ?? 'Page');
    // still the bare outline: the page takes its place, in the tab that shows it (checked again inside process, so
    // an edit made meanwhile is never overwritten)
    let replaced = false;
    if (src && untouched(await this.app.vault.read(src), this.made))
      await this.app.vault.process(src, (text) => (untouched(text, this.made) ? ((replaced = true), page.text) : text));
    if (replaced) this.close();
    else {
      const dir = src?.parent?.path ?? this.app.fileManager.getNewFileParent('').path,
        base = fileName(page.title),
        at = (n: number) => normalizePath(`${dir === '/' ? '' : dir + '/'}${base}${n > 1 ? ` ${n}` : ''}.md`);
      let n = 1;
      while (this.app.vault.getAbstractFileByPath(at(n))) n++;
      const file = await this.app.vault.create(at(n), page.text);
      this.close();
      await this.plugin.openPage(file);
    }
    const u = page.unread;
    new Notice(
      u
        ? `Page made. ${u === 1 ? '1 part was' : `${u} parts were`} not recognised and ${u === 1 ? 'shows' : 'show'} ` +
            'as text: click it on the page to fix or delete it.'
        : 'Page made.',
      u ? 10000 : 4000,
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
