# Changelog

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
