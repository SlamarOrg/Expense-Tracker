// Tiny snapshot helper. Snapshots live in tests/snapshots/<name>.json and are updated only on
// purpose: UPDATE_SNAPSHOTS=1 node --test ...
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const DIR = new URL('../snapshots/', import.meta.url);

export function checkSnapshot(name, value) {
  const file = new URL(`${name}.json`, DIR);
  const actual = JSON.stringify(value, null, 2) + '\n';
  if (process.env.UPDATE_SNAPSHOTS || !existsSync(file)) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, actual, 'utf8');
    if (!process.env.UPDATE_SNAPSHOTS) assert.fail(`snapshot ${name} was missing and has been written; re-run the tests`);
    return;
  }
  const expected = readFileSync(file, 'utf8');
  assert.equal(actual, expected, `snapshot ${name} differs; run with UPDATE_SNAPSHOTS=1 if the change is intended`);
}
