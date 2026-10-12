#!/usr/bin/env node
// Parse statement files from the command line and print the same report the dashboard shows:
// rows per file, Air Bank total checks, duplicates removed, rows by kind, spending by category.
//
//   node scripts/parse-cli.mjs <files...> [--rules rules.json] [--overrides overrides.json] [--json]
//
// Used for the private comparison against the Python reference and handy for tuning rules.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Rules } from '../src/classifier/rules.js';
import { classify, KIND } from '../src/classifier/classify.js';
import { parseFile, dedupe } from '../src/parsers/index.js';
import { loadPdfjs } from '../tests/helpers/pdfjs.mjs';

export async function run(files, { rulesPath, overridesPath } = {}) {
  const rules = Rules.from(JSON.parse(await readFile(rulesPath || new URL('../rules/default-cz.json', import.meta.url), 'utf8')));
  const overrides = overridesPath ? JSON.parse(await readFile(overridesPath, 'utf8')) : {};
  const pdfjs = await loadPdfjs();
  const report = { files: [], warnings: [] };
  let all = [];
  for (const path of files) {
    const bytes = new Uint8Array(await readFile(path));
    const res = await parseFile({ name: basename(path), bytes }, { pdfjs });
    report.files.push({ name: basename(path), format: res.format, rows: res.rows.length, summary: res.summary, error: res.error });
    all.push(...res.rows);
  }
  const { rows, dropped } = dedupe(all);
  const txs = rows.map((r) => classify(r, rules)).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  let applied = 0;
  for (const t of txs) {
    const key = t.m || t.t;
    if (t.k === KIND.EXPENSE && overrides[key]) { t.c = overrides[key]; applied++; }
  }
  const kinds = {};
  const cats = {};
  const other = {};
  for (const t of txs) {
    kinds[t.k] = (kinds[t.k] || 0) + 1;
    if (t.k === KIND.EXPENSE) {
      cats[t.c] = (cats[t.c] || 0) + t.amt;
      if (t.c === 'Other') { const k = (t.m || t.t).slice(0, 50); other[k] = (other[k] || 0) + t.amt; }
    }
  }
  report.duplicatesRemoved = dropped;
  report.total = txs.length;
  report.overridesApplied = applied;
  report.kinds = kinds;
  report.categories = Object.fromEntries(Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, Math.round(v)]));
  report.topOther = Object.entries(other).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([m, v]) => [Math.round(v), m]);
  report.warnings = rules.warnings;
  return report;
}

export function format(report) {
  const out = [];
  for (const f of report.files) {
    if (f.error) { out.push(`${f.name}: ERROR ${f.error}`); continue; }
    let line = `${f.format.padEnd(8)} ${f.name}: ${f.rows} rows`;
    if (f.format === 'airbank') {
      const s = f.summary;
      line += ` | debits statement ${s.debits} vs parsed ${s.parsedDebits} -> ${Math.abs(s.debits - s.parsedDebits) < 0.005 ? 'OK' : 'MISMATCH'}`;
      line += ` | credits ${s.credits} vs ${s.parsedCredits} -> ${Math.abs(s.credits - s.parsedCredits) < 0.005 ? 'OK' : 'MISMATCH'} | unparsed blocks: ${s.problems.length}`;
    }
    out.push(line);
  }
  out.push(`Applied overrides to ${report.overridesApplied} transactions.`);
  out.push(`\nTotal ${report.total} transactions after removing ${report.duplicatesRemoved} duplicates.`);
  out.push(`By kind: ${JSON.stringify(report.kinds)}`);
  out.push('\nSpending by category (all time, CZK):');
  for (const [c, v] of Object.entries(report.categories)) out.push(`  ${c.padEnd(22)} ${v.toLocaleString('en-US').padStart(14)}`);
  out.push("\nTop 'Other' merchants:");
  for (const [v, m] of report.topOther) out.push(`  ${v.toLocaleString('en-US').padStart(10)}  ${m}`);
  for (const w of report.warnings) out.push(`  ! ${w}`);
  return out.join('\n');
}

if (process.argv[1] && /parse-cli\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const rulesPath = opt('--rules');
  const overridesPath = opt('--overrides');
  const json = args.includes('--json');
  const files = args.filter((a) => !a.startsWith('--'));
  if (!files.length) { console.error('usage: node scripts/parse-cli.mjs <files...> [--rules rules.json] [--overrides overrides.json] [--json]'); process.exit(2); }
  const report = await run(files, { rulesPath, overridesPath });
  console.log(json ? JSON.stringify(report, null, 2) : format(report));
}
