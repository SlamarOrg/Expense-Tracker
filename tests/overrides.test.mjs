import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverrides, applyOverrides } from '../src/store/overrides.js';

const mem = () => { const box = { value: null }; return { box, persist: (obj) => { box.value = JSON.parse(JSON.stringify(obj)); } }; };

test('starts from saved plus pending, pending wins', () => {
  const o = createOverrides({ saved: { A: 'Groceries', B: 'Fees' }, pending: { B: 'Transport', C: 'Travel' } });
  assert.deepEqual(o.all(), { A: 'Groceries', B: 'Transport', C: 'Travel' });
  assert.equal(o.get('B'), 'Transport');
  assert.equal(o.get('Z'), undefined);
});

test('set and remove persist and track what is unsaved against the saved copy', () => {
  const { box, persist } = mem();
  const o = createOverrides({ saved: { A: 'Groceries' }, persist });
  o.set('B', 'Travel');
  assert.deepEqual(box.value, { A: 'Groceries', B: 'Travel' });
  assert.deepEqual(o.unsaved(), { B: 'Travel' });
  o.remove('A');
  assert.deepEqual(o.unsaved(), { B: 'Travel', A: null });
  assert.equal(o.unsavedCount(), 2);
  o.markSaved();
  assert.deepEqual(o.unsaved(), {});
  assert.deepEqual(o.all(), { B: 'Travel' });
});

test('setting Other or an empty category removes the override', () => {
  const o = createOverrides({ saved: { A: 'Groceries' } });
  o.set('A', 'Other');
  assert.deepEqual(o.all(), {});
  o.set('A', '');
  assert.deepEqual(o.all(), {});
});

test('merge takes a plain object (import), ignores non-string values and reports counts', () => {
  const o = createOverrides({ saved: {} });
  const r = o.merge({ A: 'Groceries', B: 42, C: 'Travel' });
  assert.deepEqual(r, { added: 2, ignored: 1 });
  assert.deepEqual(o.all(), { A: 'Groceries', C: 'Travel' });
  assert.throws(() => o.merge([]), /object/);
});

test('toJSON is sorted and stable for export', () => {
  const o = createOverrides({ saved: { Zeta: 'Travel', Alpha: 'Fees' } });
  assert.equal(o.toJSON(), '{\n  "Alpha": "Fees",\n  "Zeta": "Travel"\n}\n');
});

test('applyOverrides recomputes c from c0 for expense rows only', () => {
  const o = createOverrides({ saved: { 'Pan Novák': 'Gifts & donations' } });
  const rows = [
    { k: 'expense', m: 'Pan Novák', t: 'Platba', c0: 'Other', c: 'Other' },
    { k: 'expense', m: '', t: 'Pan Novák', c0: 'Other', c: 'Other' },
    { k: 'investment', m: 'Pan Novák', t: 'Platba', c0: 'Investments', c: 'Investments' },
    { k: 'expense', m: 'Billa', t: 'Platba', c0: 'Groceries', c: 'Travel' },
  ];
  applyOverrides(rows, o);
  assert.deepEqual(rows.map((r) => r.c), ['Gifts & donations', 'Gifts & donations', 'Investments', 'Groceries']);
});

test('markSaved hands the new baseline to persistSaved, reset empties everything', () => {
  let baseline = null;
  const o = createOverrides({ saved: {}, pending: { A: 'Travel' }, persistSaved: (b) => { baseline = b; } });
  assert.equal(o.unsavedCount(), 1);
  o.markSaved();
  assert.deepEqual(baseline, { A: 'Travel' });
  assert.equal(o.unsavedCount(), 0);
  o.reset();
  assert.deepEqual(o.all(), {});
  assert.equal(o.savedCount(), 0);
});
