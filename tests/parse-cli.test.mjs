import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { run, format } from '../scripts/parse-cli.mjs';

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const files = [p('../samples/fio-sample.csv'), p('../samples/revolut-sample.csv'), p('../samples/airbank-sample.pdf')];

test('parse-cli report on the samples has a stable shape and the expected totals', async () => {
  const r = await run(files, { rulesPath: p('./fixtures/rules.json') });
  assert.deepEqual(Object.keys(r), ['files', 'warnings', 'duplicatesRemoved', 'total', 'overridesApplied', 'kinds', 'categories', 'topOther']);
  assert.equal(r.files.length, 3);
  assert.equal(r.total, 47);
  assert.equal(r.duplicatesRemoved, 0);
  assert.equal(r.kinds.expense + r.kinds.income + r.kinds.transfer + r.kinds.investment + r.kinds.skip, 47);
  assert.equal(r.categories['Housing & utilities'], 12500 + 1890 + 12500);
  assert.equal(r.files[2].summary.ok, true);
  const text = format(r);
  assert.match(text, /airbank .*-> OK/);
  assert.match(text, /Total 47 transactions/);
});

test('parse-cli applies merchant overrides to expense rows only', async () => {
  const r = await run([files[0]], { rulesPath: p('./fixtures/rules.json'), overridesPath: p('./fixtures/overrides.json') });
  assert.equal(r.overridesApplied, 1);
  assert.equal(r.categories['Travel'], 990);
});
