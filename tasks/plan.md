# Implementation Plan: Bank Statement Dashboard

Spec: `../SPEC.md` (approved 2026-10-12). Task list with acceptance criteria: `todo.md`.

## Overview

Port the private Python-plus-HTML expense tracker to a browser-only, open-source dashboard. Users
drop FIO, Revolut and Air Bank exports onto one HTML file; parsers and classification run in the
browser; data stays in IndexedDB. The build is seven phases over the spec's seven modules, with the
riskiest unknown (Air Bank PDF text extraction with pdf.js) proven in a spike before anything else
depends on it.

## Architecture decisions

- **Parsers emit `RawRow`, the classifier makes `Tx`.** Parsers encode only what the statement
  itself says (amount, text, counterparty, bank-specific hints such as "card refund" or "Revolut
  top-up"). `classify(raw, rules)` applies the user's rules. The store persists `RawRow`, so
  editing own accounts or rules re-classifies without re-importing. This is the one deliberate
  departure from the Python structure, where `tx()` did both.
- **Store behind an adapter.** `store/db.js` exposes `open()`, `putMany()`, `all()`, `clear()`,
  `getSetting()`, `setSetting()`. The IndexedDB implementation is used in the browser; an in-memory
  implementation is used in Node tests and by the bundler's demo mode. Node has no IndexedDB, and
  faking it is more code than the adapter.
- **Spike first.** Task 2 proves pdf.js text order, diacritics and the `file://` worker strategy
  with a throwaway page before any parser depends on it. If the spike fails, the fallback is the
  Air Bank CSV export, and the plan is revised at Checkpoint A.
- **Vertical slices per bank.** Each bank is one task: sample generator branch, parser, snapshot
  test, branch-coverage assertion. The CSV reader and the PDF writer are the only horizontal
  foundations.
- **Dashboard moves verbatim first, changes second.** Task 13 moves the existing IIFE into modules
  with no behaviour change, verified by the headless render check against the samples. Task 14 then
  changes what needs to change (store input, overrides import, empty state).
- **Bundler is a concatenator.** Modules are concatenated in dependency order with `import` and
  `export` lines stripped. Top-level names must be unique across modules; a test enforces it. No
  third-party bundler, per the zero-dependency rule.
- **Strings go through `t()` from Task 13 onward.** Introducing i18n after the UI exists means
  touching every string twice. The dashboard move keeps English literals, and Task 20 replaces them
  in one pass with the key-parity test as the net.
- **Dev needs a server, release does not.** ES modules do not load from `file://` in Chrome, so
  development uses `scripts/serve.mjs`. The bundle has no module imports and works from `file://`.

## Dependency graph

```
T1 scaffold
 ├── T2 Air Bank pdf.js spike (no code deps; decides worker strategy)
 ├── T3 normalize ── T4 Rules + classify ── T5 default-cz.json (review gate)
 └── T6 csv reader
        ├── T7 FIO slice ──────┐
        └── T8 Revolut slice ──┤
T2 + T4 ── T9 PDF writer + Air Bank sample ── T10 Air Bank parser ──┤
                                                                     └── T11 detect + parseFile + dedup ── T12 parse-cli + private comparison
T11 ── T13 dashboard moved to modules ── T14 store input, overrides, empty state ── T15 render-check script
T14 ── T16 store adapter (memory + IndexedDB) ── T17 import UI ── T18 settings panel ── T19 sample loader + privacy text
T19 ── T20 i18n core + dashboard strings ── T21 import/settings strings + switch + parity test
T21 ── T22 bundler ── T23 CI + Pages + CONTRIBUTING ── T24 README ── T25 migration and final checks
```

## Task list

### Phase 0: Scaffold and spike
- [x] T1 Repo scaffold, guards, dev server
- [x] T2 Air Bank pdf.js spike

### Checkpoint A: Spike decided
- [ ] pdf.js extracts the spike PDF in content-stream order with diacritics, in Node and in Chrome and Firefox from `file://`
- [ ] Worker strategy recorded in SPEC.md open question 2
- [ ] If the spike failed: stop, revise the plan around Air Bank CSV, get approval

### Phase 1: Classifier and foundations
- [ ] T3 normalize helpers
- [ ] T4 Rules and classify
- [ ] T5 Default ruleset, cleaned and reviewed
- [ ] T6 CSV reader

### Phase 2: Parsers, one bank per slice
- [ ] T7 FIO: sample, parser, snapshot
- [ ] T8 Revolut: sample, parser, snapshot
- [ ] T9 PDF writer and Air Bank sample
- [ ] T10 Air Bank parser with total check
- [ ] T11 Format detection, parseFile, dedup
- [ ] T12 parse-cli and private comparison with Python

### Checkpoint B: Parsers match Python
- [ ] `node --test` green; every sample parses with zero problems
- [ ] Air Bank sample debit total matches to the cent
- [ ] Private: JS row count, kinds and per-category totals equal `parse_statements.py --dry-run` on Martin's real files; differences explained or fixed
- [ ] Review with Martin before touching the dashboard

### Phase 3: Dashboard
- [ ] T13 Move dashboard into modules, unchanged behaviour
- [ ] T14 Store-fed dashboard, overrides import/export, empty state, footer
- [ ] T15 render-check script

### Checkpoint C: Dashboard renders samples
- [ ] Every feature in the private README works on sample data via the dev server
- [ ] render-check green in light and dark, no console errors

### Phase 4: Import and settings
- [ ] T16 Store adapter: memory and IndexedDB
- [ ] T17 Import UI: drop zone, file cards, problems, total check
- [ ] T18 Settings panel and re-classification
- [ ] T19 Sample loader, privacy statement, forget-my-data

### Checkpoint D: Import flow complete
- [ ] Importing the three samples in any order yields the same store; re-import adds zero rows
- [ ] Changing own accounts or rules re-categorizes without re-import
- [ ] Reload keeps the data; forget-my-data empties it
- [ ] Review with Martin

### Phase 5: Languages
- [ ] T20 i18n core and dashboard strings
- [ ] T21 Import and settings strings, language switch, parity test

### Phase 6: Release
- [ ] T22 Bundler
- [ ] T23 CI, Pages workflow, CONTRIBUTING
- [ ] T24 README, samples README, screenshot
- [ ] T25 Martin's migration and final checks

### Checkpoint E: Success criteria
- [ ] All seven success criteria in SPEC.md ticked with evidence
- [ ] Martin creates the GitHub remote and pushes; CI and Pages confirmed green after push

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| pdf.js text item order differs from `pdftotext -raw`, breaking the block parser | High | Spike in T2 before anything depends on it; line reconstruction by y change and x gap; the printed-total check catches silent misparse; fallback is Air Bank CSV |
| Synthetic PDF cannot carry Czech diacritics with base-14 fonts | Medium | `/Differences` encoding tried in T2; fallback is an ASCII fixture plus the private check on real PDFs |
| pdf.js refuses to run without a worker on `file://` | Medium | T2 tests fake worker and inlined Blob worker in Chrome and Firefox; the winner is recorded in SPEC |
| Bundler name collisions when concatenating modules | Medium | Test in T22 fails on duplicate top-level names; module-prefixed names where needed |
| Personal data leaks into the public repo | High | Code is ported by hand, never copied; `.gitignore` blocks `*.csv` and `*.pdf` outside `samples/`; denylist test from T1; final scan in T25 |
| `.git` under OneDrive sync corrupts the repo | Medium | Open question 3 in SPEC; recommend a folder outside OneDrive before `git init` |
| Dashboard move breaks subtle behaviour (theme, tooltips, focus mode) | Medium | T13 is a verbatim move verified by render-check and a manual feature walk before T14 changes anything |
| Re-classification needs data the parser did not keep | Medium | `RawRow` is the stored unit from T7 on; T18 tests cover own-account and rules changes |
| i18n pass misses strings | Low | Key-parity test plus a grep for string literals in `src/ui/` in T21 |

## Parallelization

Safe to run in parallel: T2 with T3 to T6; T7 with T8; T20 with T22 preparation. Sequential:
everything on the T9 to T12 chain, the dashboard chain, and T25 last.

## Open questions

- GitHub account and initial visibility (SPEC open question 1). Needed by T23.
- Repo location inside or outside OneDrive (SPEC open question 3). Needed before T1 runs `git init`.
