# MyOnePage

Turn a note into a one-page report that people can read, edit in place and share.

A MyOnePage is an ordinary Markdown note. MyOnePage shows it as a styled page: a hero line, numbered parts, cards,
big numbers, funnels, tables, timelines. You edit the text right on the page, and every edit is saved back to the
note, so it stays a plain note you can still open, search and link as usual.

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

You can publish a page so that other people can read or edit it in a browser. This is off until you set it up.
Everything above (pages, editing, HTML export, the Claude skill) is free and works without an account.

- **Payment is required to publish.** Sharing needs an account on a sharing server, such as
  [myone.page](https://myone.page) (sign-in with Google), where publishing is a paid plan. The people you share
  with need only a Google account, or nothing for a page open to anyone. The server is a separate service and is
  not part of this repository.
- **Network use.** Once you enter a server and a token in the plugin settings, the plugin talks to that server and
  nothing else. It sends only notes that have `share:` in their frontmatter, and syncs them both ways (every 60
  seconds by default, and a few seconds after you stop typing in a shared note). Notes without `share:` never leave
  your device.
- **End-to-end encrypted.** A shared note is encrypted on your device (AES-GCM) before it is sent. The key is the
  part of the link after `#`, which browsers never send to the server, so the server stores only ciphertext. Besides
  that, it receives the `editors:` and `viewers:` lists, so it can check who may open the page.
- The token is kept in this device's local storage, not in the vault, so it does not sync to other devices.

To share a note, click the share button on the page (or run **Share current note on the web**). The plugin adds
`share: new`, publishes the note, writes the link into `share:` and copies it. Add emails, `@domain`s or `anyone` to
`editors:` and `viewers:` to let people in. Remove `share:` to take the page offline.

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
pnpm build     # main.js: src/main.js bundled by esbuild, with the engine files (engine/) as text
pnpm dev       # rebuild on change
pnpm verify    # Prettier, ESLint (Obsidian's rules), the sample page, the build: what a release runs
```

The engine (`engine/`) is classic browser scripts. The plugin runs it inside a sandboxed iframe; `check.mjs` loads
`md.js` in Node.

## License

[MIT](LICENSE)
