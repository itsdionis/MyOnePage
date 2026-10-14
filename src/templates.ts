// Templates: outlines to start a page from (../templates), each in an established format, with every field saying
// what goes there. ../examples has the same pages finished (myone.page/examples shows them). A new page gets today's
// `updated:` and `template: <slug>`, which shows a line above the page until it is dismissed (see MyOnePageView).
// `share:`, `editors:` and `viewers:` never come along.
import { FuzzySuggestModal, normalizePath } from 'obsidian';
import type { App, FuzzyMatch, TFile, TFolder } from 'obsidian';
import investorUpdate from '../templates/investor-update.md?text';
import boardPreRead from '../templates/board-pre-read.md?text';
import clientProposal from '../templates/client-proposal.md?text';
import clientReport from '../templates/client-report.md?text';
import productBrief from '../templates/product-brief.md?text';
import strategyMemo from '../templates/strategy-memo.md?text';
import projectStatusReport from '../templates/project-status-report.md?text';
import weeklyUpdate from '../templates/weekly-update.md?text';
import projectBrief from '../templates/project-brief.md?text';
import onePageBusinessPlan from '../templates/one-page-business-plan.md?text';
import businessOnePager from '../templates/business-one-pager.md?text';
import blank from '../templates/blank.md?text';

export interface Template {
  slug: string;
  title: string; // also the new note's name
  line: string; // what it shows, under the title in the picker
  text: string;
}

// In the order founders reach for them: investors and the board, clients, the team's projects and weeks, the company
// itself. Each follows an established format (YC's investor update, Sequoia's board deck, a quarterly business review,
// Shape Up's pitch, Rumelt's kernel, a RAG status report, progress-plans-problems, the classic project brief with a
// RACI table, Ash Maurya's lean canvas, a sales one-pager).
export const TEMPLATES: Template[] = [
  {
    slug: 'investor-update',
    title: 'Investor update',
    line: 'Monthly: numbers, highlights and lowlights, asks, goals',
    text: investorUpdate,
  },
  {
    slug: 'board-pre-read',
    title: 'Board pre-read',
    line: 'Quarterly: the big picture, numbers against plan, one decision',
    text: boardPreRead,
  },
  {
    slug: 'client-proposal',
    title: 'Client proposal',
    line: 'Options as cards, a timeline and a price table',
    text: clientProposal,
  },
  {
    slug: 'client-report',
    title: 'Client results report',
    line: 'Quarterly for a client: results against goals, the next 90 days',
    text: clientReport,
  },
  {
    slug: 'product-brief',
    title: 'Product brief',
    line: 'Problem, appetite, solution, rabbit holes, no-gos',
    text: productBrief,
  },
  {
    slug: 'strategy-memo',
    title: 'Strategy memo',
    line: 'Diagnosis, guiding policy, coherent actions',
    text: strategyMemo,
  },
  {
    slug: 'project-status-report',
    title: 'Project status report',
    line: 'Red, amber or green per area, milestones, risks, decisions needed',
    text: projectStatusReport,
  },
  {
    slug: 'weekly-update',
    title: 'Weekly update',
    line: 'Short: what shipped, the numbers, next week, blockers',
    text: weeklyUpdate,
  },
  {
    slug: 'project-brief',
    title: 'Project brief',
    line: 'Goal, scope in and out, stakeholders, timeline, budget, metrics',
    text: projectBrief,
  },
  {
    slug: 'one-page-business-plan',
    title: 'One-page business plan',
    line: 'A lean canvas, the market, the revenue model, 12 months of milestones',
    text: onePageBusinessPlan,
  },
  {
    slug: 'business-one-pager',
    title: 'Company one-pager',
    line: 'For buyers, partners and funders: problem, solution, traction, team, ask',
    text: businessOnePager,
  },
  { slug: 'blank', title: 'Blank', line: 'A title and one part, to fill in yourself', text: blank },
];

// The template's text for a new note: today's date, `template: <slug>`, no sharing keys (with their list items).
export function fromTemplate(t: Template, today: string) {
  const m = /^---\n([\s\S]*?\n)---\n/.exec(t.text);
  if (!m) return t.text;
  const fm = m[1]
    .replace(/^(share|editors|viewers):.*\n(?:[ \t]+-.*\n)*/gm, '')
    .replace(/^template:.*\n/m, '')
    .replace(/^updated:.*$/m, `updated: ${today}`);
  return `---\n${fm}template: ${t.slug}\n---\n${t.text.slice(m[0].length)}`;
}

// Today as YYYY-MM-DD, local time (Obsidian's moment is untyped without the moment package).
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Creates `<title>.md` in the folder (` 2`, ` 3` when taken); never overwrites.
export async function newFromTemplate(app: App, t: Template, folder: TFolder): Promise<TFile> {
  const dir = folder.isRoot() ? '' : `${folder.path}/`;
  let path = normalizePath(`${dir}${t.title}.md`);
  for (let n = 2; app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${dir}${t.title} ${n}.md`);
  return app.vault.create(path, fromTemplate(t, today()));
}

export class TemplatePicker extends FuzzySuggestModal<Template> {
  pick: (t: Template) => void;
  items: Template[];
  constructor(app: App, pick: (t: Template) => void, items = TEMPLATES) {
    super(app);
    this.pick = pick;
    this.items = items;
    this.setPlaceholder('Make a page: from a template, or from your notes with AI');
  }
  getItems() {
    return this.items;
  }
  getItemText(t: Template) {
    return `${t.title} ${t.line}`;
  }
  renderSuggestion(m: FuzzyMatch<Template>, el: HTMLElement) {
    el.addClass('myone-page-template');
    el.createDiv({ text: m.item.title });
    el.createEl('small', { text: m.item.line });
  }
  onChooseItem(t: Template) {
    this.pick(t);
  }
}
