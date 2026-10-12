import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCsv, parseCsvRows } from '../src/parsers/csv.js';

test('reads FIO style: BOM, semicolons, every field quoted, CRLF', () => {
  const text = '﻿"Datum";"Objem";"Měna"\r\n"03.01.2024";"-120,50";"CZK"\r\n"04.01.2024";"1 000,00";"EUR"\r\n';
  const rows = readCsv(text, { delimiter: ';' });
  assert.deepEqual(rows, [
    { Datum: '03.01.2024', Objem: '-120,50', Měna: 'CZK' },
    { Datum: '04.01.2024', Objem: '1 000,00', Měna: 'EUR' },
  ]);
});

test('reads Revolut style: commas, unquoted, LF', () => {
  const text = 'Typ,Produkt,Částka\nPlatba kartou,Current,-12.5\nPřevod,Current,100\n';
  assert.deepEqual(readCsv(text, { delimiter: ',' }), [
    { Typ: 'Platba kartou', Produkt: 'Current', Částka: '-12.5' },
    { Typ: 'Převod', Produkt: 'Current', Částka: '100' },
  ]);
});

test('quoted field with delimiter, escaped quote and newline round-trips', () => {
  const text = 'a,b\n"x, y","say ""hi""\nthere"\n';
  assert.deepEqual(readCsv(text, { delimiter: ',' }), [{ a: 'x, y', b: 'say "hi"\nthere' }]);
});

test('detects the delimiter from the header when not given', () => {
  assert.deepEqual(readCsv('a;b\n1;2\n'), [{ a: '1', b: '2' }]);
  assert.deepEqual(readCsv('a,b\n1,2\n'), [{ a: '1', b: '2' }]);
});

test('short rows are padded and blank lines are skipped', () => {
  assert.deepEqual(readCsv('a,b,c\n1,2\n\n3,4,5\n'), [{ a: '1', b: '2', c: '' }, { a: '3', b: '4', c: '5' }]);
});

test('parseCsvRows returns raw arrays including the header', () => {
  assert.deepEqual(parseCsvRows('a;b\n"1";"2"', ';'), [['a', 'b'], ['1', '2']]);
});

test('empty input gives no rows', () => {
  assert.deepEqual(readCsv(''), []);
  assert.deepEqual(readCsv('a,b\n'), []);
});

test('duplicate header names get a numeric suffix instead of being lost', () => {
  assert.deepEqual(readCsv('a,a,b\n1,2,3\n'), [{ a: '1', a_2: '2', b: '3' }]);
});
