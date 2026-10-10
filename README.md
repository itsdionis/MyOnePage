# MyOnePage

Stop rewriting your notes for your team. Add `myone.page: true` to a note and it opens as a styled one-page report:
big numbers, cards, funnels, tables, a Gantt timeline. Click any text to edit it, and the edit is saved back to the
note. It stays a plain Markdown note you can still open, search and link.

![MyOnePage: a Markdown note becomes a page you edit in place and share as a link](https://raw.githubusercontent.com/itsdionis/MyOnePage/main/assets/demo.gif)

**See finished pages first** (each one is a single note, open in a browser, no sign-in):
[investor update](https://myone.page/examples/investor-update) ·
[client proposal](https://myone.page/examples/client-proposal) ·
[strategy memo](https://myone.page/examples/strategy-memo) ·
[product brief](https://myone.page/examples/product-brief) ·
[Obsidian plugin market analysis](https://myone.page/examples/obsidian-plugin-market)

**The plugin is free.** Pages, editing on the page, HTML export and the Claude skill work without an account, with
no time limit. **Sharing is optional:** publish a page to [myone.page](https://myone.page) and your team edits it in
the browser, with their edits back in your note within 60 seconds, end-to-end encrypted. Your first 3 shared pages
are free (the people you share with sign in); a paid plan adds unlimited pages and links open to anyone. Readers
don't need Obsidian and pay nothing. See [Share on the web](#share-on-the-web-optional).

## Use

Add `myone.page: true` to a note's frontmatter. The note then opens as a page. You can also open any note as a page
with **Open current note as a one-pager**, or from the file menu.

```markdown
---
myone.page: true
title: Q4 plan
---

# Ship the ==new onboarding== by December

## 01 · Where we are

> [!stats]
>
> - **42%** finish setup today
> - [x] **3** teams on board

**Rule:** one owner per part.
```

- Click any text on the page to edit it. Drag items to reorder them.
- The buttons at the top of the tab switch between the page, reading view and editing view. **Cycle view: editing,
  reading, one-pager** does the same from the command palette.
- **HTML** saves `<note>.html`: one read-only file you can send to anyone. It goes next to the note, or to the
  folder set in **HTML export folder** in the plugin settings.
- The page follows Obsidian's light or dark theme.

### Blocks

| Block              | Markdown                                          |
| ------------------ | ------------------------------------------------- |
| Part               | `## 01 · Title`                                   |
| Small heading      | `### Text`                                        |
| Rule               | `**Lead:** text`                                  |
| Numbered list      | `1. **Lead.** text`                               |
| Table              | a Markdown table                                  |
| Callout box        | `> [!lineage] Lead`                               |
| Cards, small cards | `> [!cards]`, `> [!uc]` with `> - **Title** text` |
| Big numbers        | `> [!stats]` with `> - **42** label`              |
| Funnel             | `> [!cascade]` with `> - **85** label`            |
| Steps              | `> [!flow]` with `> - step`                       |
| Command columns    | `> [!cmdcols]`                                    |
| Lean canvas        | `> [!canvas]`                                     |
| Timeline           | a ` ```mermaid ` block starting with `gantt`      |

Anything else is shown as plain text, exactly as written.

## Share on the web (optional)

You can publish a page so that other people can read or edit it in a browser. Nothing is sent anywhere until you
click share. Everything above (pages, editing, HTML export, the Claude skill) is free and works without an account.

- **An account is required to publish (made for you); payment for more than 3 pages.** Sharing needs an account
  on a sharing server, [myone.page](https://myone.page) unless you set another. The first time you click share, the
  plugin makes a random token and registers it as a new account, with no sign-up. You sign in (Google or an email
  link) only when you want to: the globe button on a shared page opens it signed in as its owner. 3 shared pages
  are free, shared with people who sign in. A paid plan adds unlimited pages and pages open to anyone with the link
  (founding price $1.99/month, normally $3.99; $19/year; $49 lifetime; 30-day refund). The people you share with
  sign in with Google or any email address, or not at all for a page open to anyone. The server is a separate service and is
  not part of this repository.
- **Network use.** From your first share (or once you enter a token), the plugin talks to the sharing server and
  nothing else. It sends only notes that have `share:` in their frontmatter, and syncs them both ways (every 60
  seconds by default, and a few seconds after you stop typing in a shared note). Notes without `share:` never leave
  your device.
- **End-to-end encrypted.** A shared note is encrypted on your device (AES-GCM) before it is sent. The key is the
  part of the link after `#`, which browsers never send to the server, so the server stores only ciphertext. Besides
  that, it receives the `editors:` and `viewers:` lists, so it can check who may open the page.
- The token is kept in the plugin's settings (`.obsidian/plugins/myone-page/data.json`), so every device that syncs
  the vault shares one account. The vault already holds each page's key (in its `share:` link); keep both out of a
  public repository. A note shared from another account is left alone, never moved.

To share a note, click the share button on the page (or run **Share current note on the web**). The plugin adds
`share: new`, publishes the note, writes the link into `share:` and copies it. Add emails, `@domain`s or `anyone` to
`editors:` and `viewers:` to let people in (`anyone` needs a plan). Remove `share:` to take the page offline. A
note the free plan has no room for gets `share: waiting` and is published by itself once there is room (a page taken
offline, or a plan).

## Files

The plugin writes only to your vault: to the notes you edit on a page, to `<note>.html` when you click **HTML**,
and, when a shared note was changed on both sides, to `<note> (web version).md`. Errors are also logged to
`log.txt` in the plugin folder.

## Writing pages with Claude (or by hand)

`skills/myone-page/SKILL.md` is the whole page format as an agent skill. Copy the `myone-page` folder into your
vault's `.claude/skills/` and Claude Code can write and fix one-pagers there. `examples/one-pager.md` uses every
block type.

`check.mjs` checks a page and rewrites it in the canonical form the page saves (Node 18 or later, no install):

```sh
node check.mjs path/to/note.md          # errors, warnings, and blocks that fell back to plain text
node check.mjs --fix path/to/note.md    # rewrite it canonically
```

## Build

```sh
pnpm install
pnpm build     # main.js: src/main.ts bundled by esbuild, with the engine files (engine/) as text
pnpm dev       # rebuild on change
pnpm verify    # Prettier, ESLint (Obsidian's rules), the sample page, the build: what a release runs
```

The engine (`engine/`) is classic browser scripts. The plugin runs it inside a sandboxed iframe; `check.mjs` loads
`md.js` in Node.

## License

[MIT](LICENSE)
