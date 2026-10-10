# Changelog

## 1.0.4 (unreleased)

- Share with no setup: the first share makes an account on myone.page with a random token, no sign-up and no token
  to copy. The token now lives in the plugin's settings (moved from this device's local storage), so devices that
  sync the vault share it. The globe button opens a page signed in as its owner (a one-time link).
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
