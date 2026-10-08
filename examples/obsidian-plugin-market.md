---
title: Obsidian plugin market
updated: 2026-10-08
lang: en
myone.page: true
---

# What makes an Obsidian plugin win.
# The pattern: ==fill a hole in core, keep it plain Markdown==.

Market research, October 2026. Sources: Obsidian's public `community-plugin-stats.json` and `community-plugins.json` (obsidianmd/obsidian-releases), as of today, plus snapshots from 2025-10-08 and 2024-10-08. Downloads are lifetime installs and updates, not active users.

## PART 1 · The market
power law, and it just got a lot more crowded

> [!stats]
> - **8,566** plugins listed (2,635 a year ago, 1,929 two years ago)
> - **156M** total downloads (92M a year ago)
> - [!] **830** median downloads per plugin
> - **27** plugins over 1M downloads
> - **197** over 100K
> - [x] **55%** of all downloads go to the top 50

**Power law:** the top 1% of plugins (85) take 65% of all downloads. Half of all plugins never pass ~800 installs.

**The flood:** 6,120 plugins were added in the last 12 months, 3.3x the whole previous catalog. Almost all of it came in 2026: about 2,700 listed at the end of 2025, 6,188 by July, and now about 230–280 new ones a week. About 770 of the new ones are AI/LLM/agent plugins. New plugins have a median of 366 downloads; only 139 passed 10K and only 8 passed 100K.

**Why the flood:** on 2026-05-12 Obsidian replaced its manual first-submission review with automated security and malware scans of every version. It named coding agents as the reason the queue got too long. More than 2,300 queued submissions cleared within days, results now arrive in minutes, and new plugins appear in-app within 24 hours, marked "not manually reviewed". Manual review stays for popular, featured and flagged plugins. ([Obsidian blog](https://obsidian.md/blog/future-of-plugins/))

**The new directory:** it sorts by downloads, popularity and dates. Each plugin gets a Scorecard from the automated scans showing vault read/write access and **network call counts**, a Free / Optional payments / Paid label, and author profiles with sponsor links. In-app search matches only **name, author and description**.

**What that means:** listing is free and gives almost nothing. Third-party "trending" lists are topped by plugins with 160–880 total downloads, so trending is cheap and weak. Real traction comes from outside the directory. The research could not verify which channels (YouTube, Reddit, newsletters) drove the winners, so that part is still a hypothesis.

## PART 2 · The leaders
lifetime downloads, top 20

%% table accentCol=1 cols="1.4fr 110px 110px 2fr" %%
| Plugin | Total | Last 12 mo | What it is |
| --- | --- | --- | --- |
| Excalidraw | 8.39M | +3.75M | Hand-drawn diagrams stored in the vault |
| Templater | 5.84M | +2.72M | Scripted templates for new notes |
| Dataview | 5.10M | +1.79M | Query the vault like a database |
| Tasks | 4.37M | +1.58M | Tasks with due dates and recurrence across all notes |
| Git | 3.26M | +1.41M | Version control and auto backup |
| Advanced Tables | 3.26M | +0.82M | Makes Markdown tables bearable to edit |
| Calendar | 3.17M | +1.08M | Calendar sidebar for daily notes |
| Style Settings | 2.75M | +0.92M | UI knobs for themes and CSS |
| Kanban | 2.73M | +0.81M | Boards that are plain Markdown files |
| Copilot | 2.40M | +1.61M | AI chat and agents over the vault |
| Claudian | 2.34M | +2.34M | Claude Code and Codex inside Obsidian (new this year) |
| Remotely Save | 2.29M | +0.84M | Sync via S3, Dropbox, WebDAV, OneDrive |
| Iconize | 2.26M | +0.58M | Icons on files and folders |
| QuickAdd | 2.20M | +0.88M | Capture and macros |
| Editing Toolbar | 1.99M | +1.05M | Word-style formatting toolbar |
| TaskNotes | 1.98M | +1.93M | One note per task, calendar, time tracking (new this year) |
| Omnisearch | 1.97M | +0.93M | Better search, PDFs, OCR |
| Minimal Theme Settings | 1.84M | +0.58M | Settings for the top theme |
| Importer | 1.77M | +0.95M | Official: bring in Notion, Evernote, Apple Notes |
| Outliner | 1.44M | +0.40M | Workflowy-style list editing |

### Fastest risers (12-month gain)

> [!cards]
> - **Claudian +2.34M** Created 2025-12-05, level with Copilot in about 10 months; #3 by weekly downloads in mid-August. Rides Claude Code: the agent you already pay for, now inside your notes. Its 90 releases inflate the count (updates count as downloads).
> - **TaskNotes +1.93M** From 55K to 2M in a year. One file per task fits Obsidian's new Bases views.
> - **Notebook Navigator +0.97M** From 72K to 1M. Apple Notes and Bear style file browser for people who left those apps.
> - **Local REST API + MCP +0.61M** From 169K to 775K, almost all after adding MCP. Lets outside AI agents read and write the vault.

## PART 3 · Why they win
seven patterns behind the top 50

1. **Fill a hole in core.** Templater, Calendar, Tasks, Kanban, Advanced Tables, Outliner, Omnisearch. Each one fixes something a new user hits in the first week. The plugin feels like a missing feature, not an extra.
2. **Data stays plain Markdown.** Kanban boards, tasks, Dataview queries and Excalidraw drawings are all files in the vault. Uninstall and nothing is lost. That is the Obsidian promise, and plugins that keep it get trusted.
3. **Turn the vault into a database.** Dataview, Tasks, Templater, QuickAdd, TaskNotes. Power users build whole systems on them, then teach those systems on YouTube. Every setup video is free distribution.
4. **Bring a visual mode to text.** Excalidraw, Kanban, Mind Map, Advanced Slides, Advanced Canvas. The note is still Markdown, but there is a second, visual way to see it. Excalidraw is number one by a wide margin.
5. **Fix ownership worries.** Git, Remotely Save, Self-hosted LiveSync. A free alternative to Obsidian Sync with your own storage.
6. **One maintainer who never stops.** Excalidraw (zsviczian) ships constantly and makes videos about it. Templater, Tasks, Dataview and Kanban all have years of releases behind them. Rank compounds with time.
7. **Catch the new wave first.** Copilot, Claudian, Smart Connections, Local REST API with MCP. Every AI cycle produces a new leader in months. Claudian beat 8,000 plugins in under a year by wrapping a tool people already use daily.

### What kills plugins

> [!uc]
> - **Core absorbs it** Canvas (2022) and Bases (2025) went straight at Excalidraw and Dataview. Their downloads show no visible dent: Excalidraw led 2025 with 1.93M, Dataview was #3. Nobody has measured active use, so substitution may still be happening underneath. A late entrant in a space that core covers has no chance.
> - **Maintainer leaves** Kanban and Calendar slowed and moved to community orgs. Users stay, but rivals take the new growth (TaskNotes, Notebook Navigator).
> - **Data lock-in** A plugin that stores data outside Markdown, or breaks notes when removed, gets bad word of mouth fast.

## PART 4 · How plugins make money
Obsidian is not a store: billing is always outside

> [!stats]
> - **\$902K** Copilot (Brevilabs) all-time revenue
> - **\$18.5K** MRR, 1,401 subscriptions
> - [!] **\$66.6K** peak month (Feb 2026), now ~\$29–38K
> - [!] **6** active sponsors for Templater at 3.9M downloads

**Copilot is open core:** the AGPL plugin is free with your own API key, agent or local model. Paid Plus / Believer licenses add hosted models, cloud tools (web search, PDF parsing) and multi-agent mode from a closed backend. Revenue figures come from TrustMRR's read of their Stripe account, not an audit. The drop since February lines up with free agent plugins like Claudian arriving, but nobody has shown that one caused the other.

**Donations don't pay:** Templater, one of the top 3 plugins ever, had 6 active sponsors when its author [raised it on the forum](https://forum.obsidian.md/t/the-open-source-sponsor-problem-templater-has-3-9m-downloads-and-6-active-sponsors/112828). Downloads don't turn into donations. The model that pays is a free local path plus a paid hosted service.

**Rules:** Obsidian has no payment system. Money goes through external license keys, logins or API keys. Each plugin must be labeled Free, Optional payments or Paid; a plugin that calls a paid hosted service counts as Optional payments even with a free tier.

### Sources

Obsidian's own download stats on GitHub (today, 2025-10-08, 2024-10-08); [Obsidian: future of plugins](https://obsidian.md/blog/future-of-plugins/); [obsidianstats Wrapped 2025](https://www.obsidianstats.com/posts/2025-12-04-wrapped-2025); [obsidianstats weekly 2026-08-16](https://www.obsidianstats.com/posts/2026-08-16-weekly-updates); [plugin milestones](https://www.moritzjung.dev/obsidian-stats/pluginstats/milestones); [TrustMRR: Brevilabs](https://trustmrr.com/startup/brevilabs); directory pages for [Copilot](https://community.obsidian.md/plugins/copilot), [Claudian](https://community.obsidian.md/plugins/realclaudian), [Share Hosted](https://community.obsidian.md/plugins/share-hosted). The seven patterns in Part 3 are a reading of the download data, not a measured result.
