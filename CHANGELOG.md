# Changelog

## 1.0.8 (unreleased)

- No more style warnings in Obsidian's plugin check. Pages look the same, on older iPhones and iPads too.

## 1.0.7

- **Five new templates** in **New page from template** (and in **Start from** under **Make a page with AI**): a
  **project status report** (red, amber or green per area, milestones, risks, the decisions needed), a **weekly
  update** (what shipped, the numbers, next week, blockers), a **project brief** (goal, scope in and out, who
  decides, timeline, budget, success metrics), a **one-page business plan** (a lean canvas, the market, the revenue
  model, 12 months of milestones) and a **company one-pager** for customers and investors (problem, solution,
  traction, customers, team, the ask). Each has a finished example on myone.page, and coding agents get them too
  after **Set up**.
- New block: **pie chart**. Add it from **add a block** while editing, or write a Mermaid `pie` chart in the note
  (Obsidian draws it too). The page shows a donut with the total in the middle and a legend with each slice's share;
  labels and values are edited right in the legend and the chart follows as you type. Slices can be reordered, added
  and deleted.
- New block: **bar chart**, a Mermaid `xychart-beta` chart (Obsidian draws it too): bars, side by side when there are
  several series, lines drawn over them, negative values, and a horizontal version with names on the left. Values
  are edited right on the bars and points and the chart rescales as you type; categories can be reordered, added
  and deleted.
- **Themes**: the plugin settings have an **Appearance** section with a theme for every page: Mint (the look so
  far, still the default), Minimal, GitHub, Things, Cupertino, Claude Warm or Paper, each in light and dark. HTML files a
  page saves keep its theme. A theme is a whole look, not just colours: its own corners, borders, shadows, spacing,
  page width, fonts and headings (GitHub's underlined section titles and striped tables, Cupertino's rounded cards
  on grey with a frosted bar, Claude Warm's serif text, Minimal's flat, airy page, Things' soft lifted cards, Paper's printed report: book serif, hairlines and a heavy rule over
  each part).
- Pie and bar charts sit in a card, like the rest of the page, and take their colours from the theme.
- **☀ / ☾** in the bar switches a page between light and dark, and every page follows. Until you use it, pages
  follow Obsidian as before; **Light or dark** in the settings sets it back to that. Shared pages and HTML files
  follow the reader's system, and readers can switch too.

## 1.0.6

- **Set up** for coding agents downloads the page checker (`check.mjs`) from myone.page instead of carrying it inside
  the plugin, and keeps it only if it is exactly the file this version expects. It needs a connection the first time;
  if it fails, a notice says so and nothing is written. The plugin itself no longer contains any code that reads or
  writes files directly.
- Mistakes in a page's Markdown are shown: while editing, a note above a block says what is wrong with it and on which
  line (a callout with a stray line, a code block left open, an unknown option), and **⚠ N** in the bar counts them
  and takes you to the first. Readers never see them.
- Saving no longer loses what the page couldn't read: a second `title:`, a `[?]` a block has no use for, or an unknown
  table option stays in the note as written (they used to disappear on the first edit).
- A code block left open (a stray ` ``` `) turns only the rest of its part into plain text, not the rest of the page.
- A page with a frontmatter missing its closing `---` gets it closed on save, instead of a second frontmatter on top.
- A numbered list with a pasted line separator in it no longer leaves the page blank. A page that can't be shown says
  so, instead of an empty page that reads "ready"; **Make a page with AI** says when it fails instead of doing nothing.

## 1.0.5

- Releases carry only the plugin's files (`main.js`, `manifest.json`, `styles.css`). The skill for the Claude app is
  at myone.page/ai.
- The README says what the plugin reads and writes: notes only through Obsidian, the clipboard only when you copy or
  click **Paste the answer**, and never your files directly.
- Small fixes from Obsidian's plugin review; nothing changes in how pages look or work.

## 1.0.4

- Start from a template: **New page from template** (command, ribbon, **New MyOnePage…** on a folder, and the
  settings) makes a new note from an outline and opens it: investor update, board pre-read, client proposal, client
  results report, product brief, strategy memo, or blank. Every field says what goes there; a line above the page
  says to click and write, until you dismiss it. **Use this template** on the example pages of myone.page does the same from the
  browser. The first start points to the templates.
- **Make a page with AI**: in every note's ⋯ and right-click menu, first in **New MyOnePage**
  (the ribbon icon), and as a command. Copy a request into Claude, ChatGPT or any AI
  chat, paste the answer back, and the page opens as a new note next to yours. Parts the page can't read stay as
  text, and a notice says how many. **Start from** a template, and the AI follows its outline; on a page just made
  from a template, **Fill it with AI** fills that page. Works on mobile.
- Settings, **Write pages with AI**: a link to download the skill for the Claude app (myone.page/ai), and on desktop
  **Set up Claude Code, Codex and Cursor**, which puts the skill, the templates and the checker in the vault
  (`.claude/skills/myone-page/`, `.agents/skills/myone-page/`) and keeps them up to date unless you edit them.
- Fewer buttons: a page's header has one **Open as Markdown** instead of reading view and editing view, and the
  **Shared pages** icon shows in the ribbon once a note is shared (the command is always there).
- The skill no longer needs the plugin's repository or a terminal: its checker and the templates come with it, and it
  works in a chat too. Download it for the Claude app from myone.page/ai; it installs in Claude Code from this repository.

- Share with no setup: the first share makes an account on myone.page with a random token, no sign-up and no token
  to copy. The token now lives in the plugin's settings (moved from this device's local storage), so devices that
  sync the vault share it. The globe button opens a page signed in as its owner (a one-time link).
- A note the free plan has no room for gets `share: waiting` (a clock on its share button) instead of a link that
  leads nowhere, and is published by itself once there is room. `anyone` the plan doesn't allow is not resent every
  round: the page keeps syncing with the lists the server has until you change them.
- A note shared from another account is left alone (with a notice) instead of being moved to this one.
- Settings: an Account row (who owns it, the plan, pages used; Sign in / See plans). Server and token moved under
  "Use another server or token"; an empty server means myone.page.

- Sharing: when the server refuses a page (on myone.page: more than 3 shared pages, or `anyone`, on the free plan),
  the plugin says why in a notice, once per note, instead of skipping the page silently.
- Settings: the token's **Open settings page** link works before a server is entered (it opens myone.page).
- README: a new top (what it does, the demo, five example pages, free vs paid), and the free plan for sharing.

## 1.0.3

- Source in TypeScript with types; lint type-checked (Obsidian's review).

## 1.0.2

- Settings kept as prefs (`Plugin.settings` is Obsidian's own since 1.13).

## 1.0.1

- Code font without `ui-monospace`, which Obsidian's Electron doesn't have.

## 1.0.0

- First release.
