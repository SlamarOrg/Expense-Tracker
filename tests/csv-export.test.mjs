import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, transactionsCsv } from '../src/ui/csv-export.js';

test('text cells that a spreadsheet would run as a formula get a leading apostrophe', () => {
  for (const s of ['=HYPERLINK("http://x","y")', '+1+1', '-2+3', '@SUM(A1)', '\tx', '\rx']) {
    assert.equal(csvCell(s), '"\'' + s.replace(/"/g, '""') + '"', JSON.stringify(s));
  }
});

test('ordinary text is quoted with doubled quotes, numbers and empty values stay plain', () => {
  assert.equal(csvCell('BILLA 123, "PRAHA"'), '"BILLA 123, ""PRAHA"""');
  assert.equal(csvCell(-245.5), '-245.5');
  assert.equal(csvCell(0), '0');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
});

test('transactionsCsv writes a BOM, the header and one defused line per row', () => {
  const csv = transactionsCsv([{ d: '2024-03-05', m: '=cmd', n: '', c: 'Groceries', s: 'FIO', t: 'Platba', amt: 245.5, orig: -245.5, cur: 'CZK' }]);
  assert.ok(csv.startsWith('﻿date,merchant,'));
  assert.equal(csv.split('\n')[1], '"2024-03-05","\'=cmd","","Groceries","FIO","Platba",245.5,-245.5,"CZK"');
});
