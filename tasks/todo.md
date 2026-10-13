# Task list: Bank Statement Dashboard

Plan and rationale: `plan.md`. Spec: `../SPEC.md`. Standing rules for every task: `node --test`
green, no personal data in the repo (denylist test), English only, zero npm dependencies.

## Phase 0: Scaffold and spike

### T1: Repo scaffold, guards, dev server

**Description:** Create the repository skeleton so every later task has tests, a dev server and
the personal-data guard from the start. Includes `git init` (after SPEC open question 3 is
answered), the first commit, and a local `.private-denylist` built from Martin's account numbers
and names (never committed).

**Acceptance criteria:**
- [x] `package.json` with `"type": "module"` and scripts `test`, `serve`, `build`, `samples`, `check`; no dependencies
- [x] `.gitignore` blocks `dist/`, `node_modules/`, `.private-denylist`, and `*.csv` and `*.pdf` everywhere except `samples/`
- [x] `tests/no-personal-data.test.mjs` scans every tracked file against `.private-denylist`, skips when the file is absent, and fails on a planted test string
- [x] `scripts/serve.mjs` serves the repo root with correct MIME types for `.mjs`, `.json`, `.pdf`

**Verification:**
- [x] `node --test tests/` passes
- [x] `node scripts/serve.mjs` then `curl -I http://localhost:8080/index.html` returns 200 and `text/html`
- [x] Manual: planting one denylist string in a scratch file makes the test fail

**Dependencies:** None
**Files:** `package.json`, `.gitignore`, `LICENSE`, `scripts/serve.mjs`, `tests/no-personal-data.test.mjs`
**Scope:** M

### T2: Air Bank pdf.js spike

**Description:** Prove, with throwaway code, that pdf.js can give the Air Bank block parser what
`pdftotext -raw` gave it. Vendor the pdf.js legacy build, write a minimal PDF with a two-column
transaction table and Czech diacritics via `/Differences`, extract text in Node, and load the same
PDF in a scratch page from `file://` in Chrome and Firefox with the fake-worker and Blob-worker
strategies.

**Acceptance criteria:**
- [x] `vendor/pdf.mjs` and `vendor/pdf.worker.mjs` vendored with the exact version in `vendor/VERSIONS.md`
- [x] A Node script prints the spike PDF's lines in the order the block parser expects, diacritics intact
- [x] The same extraction works in Chrome and Firefox from `file://` with at least one worker strategy
- [x] Result and chosen strategy recorded in SPEC.md open question 2; spike page deleted or moved under `scripts/spike/` and excluded from the bundle

**Verification:**
- [x] Manual: console output of the Node script reviewed against the expected line list
- [x] Manual: both browsers show the extracted lines with no console errors

**Dependencies:** T1
**Files:** `vendor/pdf.mjs`, `vendor/pdf.worker.mjs`, `vendor/VERSIONS.md`, `scripts/spike/*`
**Scope:** M

## Checkpoint A: Spike decided
- [ ] Extraction order, diacritics and `file://` strategy proven, or the plan is revised around Air Bank CSV with Martin's approval
- [ ] Martin reviews before Phase 1 continues past T6

## Phase 1: Classifier and foundations

### T3: normalize helpers

**Description:** Port `norm`, `parse_cz_number` and `iso` to `src/classifier/normalize.js`.

**Acceptance criteria:**
- [x] `norm()` lowercases, strips diacritics (NFKD), collapses whitespace, handles `null`
- [x] `parseCzNumber()` handles thin and normal spaces, comma decimals, empty and `-` as 0
- [x] `isoDate()` accepts `d.m.yyyy` and `dd.mm.yyyy`

**Verification:**
- [x] `node --test tests/normalize.test.mjs` with at least 15 cases including `Dekujeme, ROHLIK.CZ`, `-1 012,00`, `3.1.2024`

**Dependencies:** T1
**Files:** `src/classifier/normalize.js`, `tests/normalize.test.mjs`
**Scope:** S

### T4: Rules and classify

**Description:** Port `Rules` and `classify_flow`, and define `RawRow` and `classify(raw, rules)`
that produces `Tx` (the Python `tx()` logic). Rules JSON schema is identical to the private
`categories.json`.

**Acceptance criteria:**
- [x] `Rules.from(json)` ignores `_` keys, normalizes keywords, builds account rules with leading zeros stripped and bank code dropped
- [x] `classifyFlow()` order is transfer, income, investment, expense, exactly as Python
- [x] `classify(raw, rules)` honours raw hints (`forceKind`, `refund`, `isCard`, `fee`) and returns a `Tx` with `c0` set and `c` equal to `c0`
- [x] JSDoc typedefs for `RawRow` and `Tx` in `src/classifier/types.js`

**Verification:**
- [x] `node --test tests/classify.test.mjs`: table-driven, at least 30 cases, including own-account transfer, investment account, `stk `/`částka ` regression, EUR conversion, unknown currency warning path, category-by-account beating keywords

**Dependencies:** T3
**Files:** `src/classifier/rules.js`, `src/classifier/classify.js`, `src/classifier/types.js`, `tests/classify.test.mjs`
**Scope:** M

### T5: Default ruleset, cleaned and reviewed

**Description:** Derive `rules/default-cz.json` from Martin's `categories.json`: keep national
chains and services, drop local businesses and location hints, empty all account lists. Produce
`tasks/rules-review.md` listing every dropped keyword with a one-word reason. Commit only after
Martin's OK. The review itself stays local and is never committed: the dropped keywords are the
private data the cleanup removes. The distinctive ones are in `.private-denylist`.

**Acceptance criteria:**
- [x] `default-cz.json` validates with `Rules.from()`; `own_accounts`, `investment_accounts`, `category_accounts` are empty
- [x] No keyword from the dropped list appears in the file; no account number appears anywhere (the ASCII forms `jidlo` and `obed` stay; only their diacritic duplicates were dropped)
- [x] Martin has reviewed `tasks/rules-review.md` and approved

**Verification:**
- [x] `node --test tests/rules-default.test.mjs` loads the file and asserts the empty account lists and at least 10 categories
- [x] Denylist test passes

**Dependencies:** T4; ask-first gate (Martin reviews the dropped list)
**Files:** `rules/default-cz.json`, `tests/rules-default.test.mjs` (plus the local, uncommitted `tasks/rules-review.md`)
**Scope:** S

### T6: CSV reader

**Description:** A small RFC 4180 reader: configurable delimiter, quoted fields with escaped
quotes, CRLF and LF, BOM stripping, header row to objects.

**Acceptance criteria:**
- [x] Parses FIO style (`;`, all fields quoted, BOM) and Revolut style (`,`, unquoted) correctly
- [x] A quoted field containing the delimiter and a newline round-trips

**Verification:**
- [x] `node --test tests/csv.test.mjs` with at least 8 cases

**Dependencies:** T1
**Files:** `src/parsers/csv.js`, `tests/csv.test.mjs`
**Scope:** S

## Phase 2: Parsers, one bank per slice

### T7: FIO: sample, parser, snapshot

**Description:** The FIO vertical slice: the FIO part of `scripts/make-samples.mjs` producing
`samples/fio-sample.csv` with every branch listed in SPEC, `src/parsers/fio.js` returning
`RawRow[]`, and a snapshot test.

**Acceptance criteria:**
- [x] Sample has card purchase with `dne` and `částka` in EUR, `Kredit:` refund, ATM withdrawal, Revolut top-up, own-account transfer, fixed-account payment with empty message, interest, interest tax, salary, and a `REVOLT` bank code row
- [x] Parser is a port of `parse_fio` including `FIO_CARD_RE`, purchase-date override, ATM prefix, refund hint, Revolut-as-transfer rules
- [x] `classify()` on the sample yields the expected kind per row (asserted explicitly, not only by snapshot)

**Verification:**
- [x] `node --test tests/fio.test.mjs`: snapshot of all rows, branch-coverage assertion (each listed branch hit at least once), `make-samples.mjs` idempotent

**Dependencies:** T4, T6
**Files:** `scripts/make-samples.mjs`, `samples/fio-sample.csv`, `src/parsers/fio.js`, `tests/fio.test.mjs`, `tests/snapshots/fio.json`
**Scope:** M

### T8: Revolut: sample, parser, snapshot

**Description:** Same slice for Revolut.

**Acceptance criteria:**
- [x] Sample has `Platba kartou` with fee, `Směna` pair, `Dobíjení`, `TRADE` buy and sell, `Převod` to a broker (investment keyword) and to a person, `Poplatek`, `FEE_REVERSAL`, one non-`DOKONČENO` row, English-header variant covered by the test
- [x] Parser is a port of `parse_revolut`, fee netted into card amount, exchange legs skipped

**Verification:**
- [x] `node --test tests/revolut.test.mjs`: snapshot, branch coverage, idempotent sample

**Dependencies:** T4, T6
**Files:** `scripts/make-samples.mjs`, `samples/revolut-sample.csv`, `src/parsers/revolut.js`, `tests/revolut.test.mjs`, `tests/snapshots/revolut.json`
**Scope:** M

### T9: PDF writer and Air Bank sample

**Description:** `scripts/pdf-writer.mjs`, a dependency-free text-only PDF writer (grown from the
spike), and the Air Bank part of `make-samples.mjs` producing `samples/airbank-sample.pdf` with
header totals, both block layouts, page furniture, two pages and the footer sentence.

**Acceptance criteria:**
- [x] PDF opens in Chrome, Firefox and Edge and looks like a statement table
- [x] Header `Odepsáno z účtu` equals the sum of the generated debit rows to the cent; `Připsáno na účet` likewise for credits
- [x] Contains: modern block, old-layout block (account on code line), two-line type, text after amount line, `Vrácení`, `Odměna`, card row, account row, page break with `Pokračování na straně 2`

**Verification:**
- [x] `node --test tests/pdf-writer.test.mjs`: output starts with `%PDF-`, deterministic bytes, pdf.js extracts the expected line list

**Dependencies:** T2
**Files:** `scripts/pdf-writer.mjs`, `scripts/make-samples.mjs`, `samples/airbank-sample.pdf`, `tests/pdf-writer.test.mjs`
**Scope:** M

### T10: Air Bank parser with total check

**Description:** `src/parsers/airbank.js`: `pdfToLines(arrayBuffer)` per the spike's strategy, the
block parser ported from `parse_airbank`, and a per-file summary with the printed-versus-parsed
totals and problem blocks.

**Acceptance criteria:**
- [x] Sample parses with zero problems; `summary.debits === summary.parsedDebits`
- [x] Old-layout and modern blocks both yield the right counterparty, merchant and note
- [x] Card refund, reward, fee netting and Revolut-as-transfer hints set on `RawRow`

**Verification:**
- [x] `node --test tests/airbank.test.mjs`: snapshot, branch coverage, total check, a deliberately corrupted block lands in `problems`

**Dependencies:** T4, T9
**Files:** `src/parsers/airbank.js`, `tests/airbank.test.mjs`, `tests/snapshots/airbank.json`
**Scope:** M

### T11: Format detection, parseFile, dedup

**Description:** `src/parsers/index.js`: `detectFormat(name, bytes)` by filename pattern then
content sniffing, `parseFile(file, rules)` returning `{ rows, summary }`, and `dedupe(rows)` by id
across files.

**Acceptance criteria:**
- [x] All three samples detected by name; renamed copies detected by content; an unknown file yields a clear error, not a throw
- [x] Parsing the same file twice yields zero new rows after dedupe; overlapping Air Bank statements dedupe on transaction code

**Verification:**
- [x] `node --test tests/parsers-index.test.mjs`

**Dependencies:** T7, T8, T10
**Files:** `src/parsers/index.js`, `tests/parsers-index.test.mjs`
**Scope:** S

### T12: parse-cli and private comparison with Python

**Description:** `scripts/parse-cli.mjs <files...> [--rules file]` prints row counts, kinds and
per-category totals as JSON, the same numbers the Python `--dry-run` report prints. Martin runs it
on his real statements with his real rules (both outside the repo) and compares.

**Acceptance criteria:**
- [x] CLI works on the samples and prints a stable JSON shape
- [x] Private: counts and totals equal Python's for all three banks, or every difference is understood and either fixed or recorded in `tasks/plan.md` as accepted

**Verification:**
- [x] `node scripts/parse-cli.mjs samples/*` matches the snapshot totals
- [x] Manual, private, outside CI: comparison table pasted into the task notes, no real figures committed

**Dependencies:** T11
**Files:** `scripts/parse-cli.mjs`, `tests/parse-cli.test.mjs`
**Scope:** S

## Checkpoint B: Parsers match Python
- [ ] All Phase 1 and 2 tests green; samples parse with zero problems
- [ ] Private comparison done and reviewed with Martin

## Phase 3: Dashboard

### T13: Move dashboard into modules, unchanged behaviour

**Description:** Move the private `dashboard.html` into `index.html`, `src/styles.css`,
`src/ui/dashboard.js` and `src/ui/tooltip.js` as ES modules, exposing `mountDashboard(rowsProvider)`.
Chart.js goes to `vendor/chart.umd.js`. `src/app.js` feeds it by parsing the three samples over
the dev server. No feature changes, English literals kept.

**Acceptance criteria:**
- [x] No embedded data block; the dashboard renders from parsed samples
- [x] Theme, presets, bank toggles, investments switch, one-off cap, category focus, tables, CSV export and tooltips behave as in the private version
- [x] `window.EXPENSE_DATA` and `DATA.*` references gone

**Verification:**
- [x] Manual feature walk over the dev server against the private README's feature list
- [x] Headless dump of `http://localhost:8080/` shows `data-ready="1"` and empty `#errlog`

**Dependencies:** T11
**Files:** `index.html`, `src/styles.css`, `src/ui/dashboard.js`, `src/ui/tooltip.js`, `src/app.js`, `vendor/chart.umd.js`
**Scope:** M (large diff, mechanical)

### T14: Store-fed dashboard, overrides import/export, empty state, footer

**Description:** Replace `localStorage` overrides with `src/store/overrides.js`, add "Export
overrides" and "Import overrides", render an empty state when there are no rows, and make the
footer list imported files and dates.

**Acceptance criteria:**
- [x] Overrides survive reload; import merges and re-renders; export downloads JSON via `showSaveFilePicker` with blob fallback
- [x] Empty store shows an empty state with a placeholder for the drop zone, no empty charts
- [x] Footer shows file names, banks, row counts and the Air Bank total check result

**Verification:**
- [x] `node --test tests/overrides.test.mjs` for merge and unsaved-diff logic
- [x] Manual: reload, import and export round trip

**Dependencies:** T13
**Files:** `src/store/overrides.js`, `src/ui/dashboard.js`, `src/app.js`, `tests/overrides.test.mjs`
**Scope:** M

### T15: render-check script

**Description:** `scripts/render-check.mjs <url-or-file> [--theme dark] [--lang cs]` runs headless
Chrome or Edge, dumps the DOM, asserts `data-ready="1"` and empty `#errlog`, and optionally writes
a screenshot. Browser found via `$BROWSER` then default paths.

**Acceptance criteria:**
- [x] Exits non-zero on missing `data-ready` or any `#errlog` text
- [x] Works against the dev server URL now and the built file later

**Verification:**
- [x] `node scripts/render-check.mjs http://localhost:8080/` passes; a planted `throw` in `app.js` makes it fail

**Dependencies:** T13
**Files:** `scripts/render-check.mjs`
**Scope:** S

## Checkpoint C: Dashboard renders samples
- [ ] Feature walk complete, render-check green in light and dark
- [ ] Review with Martin

## Phase 4: Import and settings

### T16: Store adapter: memory and IndexedDB

**Description:** `src/store/db.js` with `openStore({ backend })`: `putRows`, `allRows`, `clear`,
`listImports`, `addImport`, `getSetting`, `setSetting`. Memory backend for Node tests and demo
mode; IndexedDB backend with schema version 1 for the browser.

**Acceptance criteria:**
- [x] Both backends pass the same contract test suite
- [x] Rows are stored as `RawRow` plus the import id; `allRows()` returns them in insertion order
- [x] IndexedDB backend handles a blocked or failed open by falling back to memory and flagging it in the UI

**Verification:**
- [x] `node --test tests/store.test.mjs` (memory backend, contract suite)
- [x] Manual: IndexedDB backend exercised in Chrome via a scratch call in the console

**Dependencies:** T14
**Files:** `src/store/db.js`, `src/store/memory.js`, `src/store/indexeddb.js`, `tests/store.test.mjs`
**Scope:** M

### T17: Import UI: drop zone, file cards, problems, total check

**Description:** `src/ui/import.js`: drop zone and file picker accepting multiple files, one card
per file showing bank, rows, kinds breakdown, dedup count, problems and the Air Bank total check,
then `putRows` and dashboard re-render.

**Acceptance criteria:**
- [x] Drop three samples at once: three cards, correct counts, dashboard updates once
- [x] Unknown file shows an error card, nothing stored
- [x] Re-dropping a file shows "0 new rows"

**Verification:**
- [x] `node --test tests/import-flow.test.mjs` runs the flow headlessly on the memory store with sample bytes
- [x] Manual in Chrome and Firefox over the dev server

**Dependencies:** T16
**Files:** `src/ui/import.js`, `src/app.js`, `src/styles.css`, `tests/import-flow.test.mjs`
**Scope:** M

### T18: Settings panel and re-classification

**Description:** `src/ui/settings.js`: own accounts, investment accounts, FX rates, rules JSON
import and export, reset to defaults. Any change re-runs `classify()` over all stored `RawRow`s and
re-renders.

**Acceptance criteria:**
- [x] Adding an own account turns the matching sample transfer rows from expense to transfer without re-import
- [x] Importing Martin's private rules file (locally, not committed) reproduces his categories on his data
- [x] Invalid rules JSON is rejected with a message; settings persist via the store

**Verification:**
- [x] `node --test tests/settings.test.mjs` on the memory store
- [x] Manual round trip in the browser

**Dependencies:** T17
**Files:** `src/ui/settings.js`, `src/app.js`, `src/styles.css`, `tests/settings.test.mjs`
**Scope:** M

### T19: Sample loader, privacy statement, forget-my-data

**Description:** "Try with sample data" in the empty state loads `samples/` over HTTP or the
embedded copy when bundled; a privacy statement near the drop zone; "Forget my data" with a confirm
that clears the store and reloads to the empty state.

**Acceptance criteria:**
- [x] Sample loader works over the dev server; the bundled path is stubbed for T22
- [x] Forget-my-data removes rows, imports, overrides and settings, leaving theme and language

**Verification:**
- [x] `node --test tests/forget.test.mjs`
- [x] Manual: reload after forget shows the empty state

**Dependencies:** T18
**Files:** `src/ui/import.js`, `src/app.js`, `tests/forget.test.mjs`
**Scope:** S

## Checkpoint D: Import flow complete
- [ ] Samples in any order yield the same store; re-import adds zero rows; settings re-categorize; reload persists
- [ ] Review with Martin

## Phase 5: Languages

### T20: i18n core and dashboard strings

**Description:** `src/i18n/index.js` with `t()`, `setLanguage()`, persisted choice and browser
default; `en.json` and `cs.json`; replace every literal in `dashboard.js` and `tooltip.js`.

**Acceptance criteria:**
- [x] Missing key renders the key and throws under test; Czech falls back to English per key
- [x] Chart labels, tooltips, KPI tiles, table headers and presets switch language without reload

**Verification:**
- [x] `node --test tests/i18n.test.mjs`: parity of key sets, fallback, parameter substitution
- [x] Manual: toggle language on the dev server

**Dependencies:** T19
**Files:** `src/i18n/index.js`, `src/i18n/en.json`, `src/i18n/cs.json`, `src/ui/dashboard.js`, `tests/i18n.test.mjs`
**Scope:** M

### T21: Import and settings strings, language switch, parity test

**Description:** Replace literals in `import.js`, `settings.js` and `index.html`; add the language
switch next to the theme switch; a test greps `src/ui/` for untranslated user-facing literals.

**Acceptance criteria:**
- [x] No user-facing literal remains outside the dictionaries (allowlist for data such as bank names)
- [x] Render check passes with `--lang cs`

**Verification:**
- [x] `node --test tests/i18n-coverage.test.mjs`
- [x] `node scripts/render-check.mjs http://localhost:8080/ --lang cs`

**Dependencies:** T20
**Files:** `src/ui/import.js`, `src/ui/settings.js`, `index.html`, `src/i18n/cs.json`, `tests/i18n-coverage.test.mjs`
**Scope:** M

## Phase 6: Release

### T22: Bundler

**Description:** `scripts/build.mjs` concatenates modules in dependency order with `import` and
`export` lines stripped, inlines CSS, vendor scripts, dictionaries and the default rules into
`dist/dashboard.html`; `--with-samples` embeds the sample rows and a "fake data" banner.

**Acceptance criteria:**
- [x] Bundle under 3 MB, no `import ` statements, no network requests (checked in DevTools)
- [x] Opens from `file://` in Chrome, Edge and Firefox; importing the three samples works, including the Air Bank PDF with the strategy chosen in T2
- [x] Module scopes stay separate in the bundle (registry, see plan.md), so duplicate names cannot collide

**Verification:**
- [x] `node --test tests/build.test.mjs` builds to a temp dir and asserts size, no imports, unique names
- [x] `node scripts/render-check.mjs dist/dashboard.html` passes for both themes and languages

**Dependencies:** T21
**Files:** `scripts/build.mjs`, `tests/build.test.mjs`, `src/app.js`
**Scope:** M

### T23: CI, Pages workflow, CONTRIBUTING

**Description:** `ci.yml` (Node 20: test, build, render-check with the preinstalled Chrome),
`pages.yml` (build `--with-samples`, deploy `dist/`), and `CONTRIBUTING.md` explaining the
`RawRow` contract and how to add a bank parser with a sample and snapshot.

**Acceptance criteria:**
- [x] Workflows pass `node --check`-style YAML sanity and reference only built-in actions
- [x] CONTRIBUTING walks through adding a fictional bank end to end

**Verification:**
- [x] Manual review; real verification only after Martin's first push (Checkpoint E)

**Dependencies:** T22; needs SPEC open question 1 (account) answered
**Files:** `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `CONTRIBUTING.md`
**Scope:** S

### T24: README, samples README, screenshot

**Description:** Public README: what it is, screenshot from the demo build, privacy promise,
supported banks and how to export from each, download-and-open instructions, dev commands, link
to CONTRIBUTING, credits. `samples/README.md` documents the fake account range.

**Acceptance criteria:**
- [x] A reader can go from zero to an imported FIO export using only the README
- [x] Screenshot generated by `render-check.mjs --screenshot` from the demo build, no real data

**Verification:**
- [x] Manual read-through; denylist test green

**Dependencies:** T22
**Files:** `README.md`, `samples/README.md`, `docs/screenshot.png`
**Scope:** S

### T25: Martin's migration and final checks

**Description:** Martin imports his real statements and private rules into a local `dist/`
build, compares totals with `parse_statements.py --dry-run`, and keeps the build as his new tool.
Final denylist scan with the full list, success criteria ticked with evidence.

**Acceptance criteria:**
- [x] Row counts, kinds and per-category totals match Python, or every difference is explained (plan.md, success criteria evidence)
- [x] Martin accepts the two explained differences (keyword word boundaries, numbered repeats in FIO exports)
- [x] Both real Air Bank PDFs pass the printed-total check in the browser
- [x] All seven SPEC success criteria have evidence noted in `tasks/plan.md`

**Verification:**
- [x] Manual, private, nothing committed
- [x] `node --test` with the full `.private-denylist` present

**Dependencies:** T24
**Files:** `tasks/plan.md` (evidence notes only)
**Scope:** S

## Checkpoint E: Success criteria
- [ ] Martin creates the remote, pushes, and confirms CI and Pages green
- [x] Vault ADR written after approval (`Architecture/adr-browser-only-open-source-dashboard.md` in the vault)
