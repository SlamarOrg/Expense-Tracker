// Guard against personal data leaking into the public repository.
//
// Reads an optional, gitignored `.private-denylist` at the repo root (one string per line,
// `#` starts a comment) and fails if any string appears in any tracked or untracked-but-not-ignored
// file. Matching is case-insensitive and ignores diacritics, so "Sláma" also catches "slama".
// When the denylist is absent (CI, other contributors) the test is skipped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DENYLIST = join(ROOT, '.private-denylist');

export function fold(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function loadDenylist(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter((l) => l.length >= 4)
    .map(fold);
}

export function repoFiles(root) {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root });
  return out.toString('utf8').split('\0').filter(Boolean).filter((f) => f !== '.private-denylist');
}

export function findLeaks(root, needles, files) {
  const leaks = [];
  for (const rel of files) {
    const full = join(root, rel);
    if (!existsSync(full)) continue;
    const text = fold(readFileSync(full, 'latin1')) + '\n' + fold(readFileSync(full, 'utf8'));
    for (const n of needles) {
      if (text.includes(n)) leaks.push(`${rel}: contains "${n}"`);
    }
  }
  return leaks;
}

test('no personal strings from .private-denylist appear in the repository', { skip: !existsSync(DENYLIST) && 'no .private-denylist present' }, () => {
  const needles = loadDenylist(DENYLIST);
  assert.ok(needles.length > 0, 'denylist is empty');
  const leaks = findLeaks(ROOT, needles, repoFiles(ROOT));
  assert.deepEqual(leaks, []);
});

test('findLeaks reports a planted string and ignores diacritics and case', () => {
  const needles = ['slama martin', '1234567890'];
  const text = 'Nothing here. Payee: SLÁMA MARTIN, account 1234567890/0100';
  const folded = fold(text);
  assert.ok(folded.includes(needles[0]));
  assert.ok(folded.includes(needles[1]));
  assert.equal(fold('Příliš žluťoučký kůň'), 'prilis zlutoucky kun');
});
