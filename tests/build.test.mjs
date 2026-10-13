import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, transformModule } from '../scripts/build.mjs';
import { checkPage } from '../scripts/render-check.mjs';
import { launch } from '../scripts/cdp.mjs';

const SAMPLES = ['fio-sample.csv', 'revolut-sample.csv', 'airbank-sample.pdf'].map((f) => fileURLToPath(new URL(`../samples/${f}`, import.meta.url)));
// Deduplicated by real path: on Linux google-chrome and google-chrome-stable link to the same binary.
const BROWSERS = [...new Map(['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', process.env.BROWSER]
  .filter((p) => p && existsSync(p)).map((p) => [realpathSync(p), p])).values()];

test('transformModule rewrites every import and export form the sources use', () => {
  const src = [
    "import a from './a.json' with { type: 'json' };",
    "import { b, c as d } from '../x/b.js';",
    "import * as ns from './ns.js';",
    'export const K = 1;',
    'export function f() { return K; }',
    'export async function g() {}',
    'export class C {}',
    'let v = 2;',
    'export { v, f as alias };',
  ].join('\n');
  const { deps, code } = transformModule('src/m/m.js', src);
  assert.deepEqual(deps, ['src/m/a.json', 'src/x/b.js', 'src/m/ns.js']);
  assert.match(code, /const a = __bsd_require\("src\/m\/a\.json"\)\.default;/);
  assert.match(code, /const \{ b, c: d \} = __bsd_require\("src\/x\/b\.js"\);/);
  assert.match(code, /const ns = __bsd_require\("src\/m\/ns\.js"\);/);
  for (const name of ['K', 'f', 'g', 'C', 'v', 'alias']) assert.match(code, new RegExp(`defineProperty\\(exports, "${name}"`));
  assert.doesNotMatch(code, /^\s*(import|export)\s/m);
});

test('transformModule refuses import.meta and dynamic import, and ignores them in JSDoc', () => {
  assert.throws(() => transformModule('src/x.js', 'const u = import.meta.url;'), /REPLACED/);
  assert.throws(() => transformModule('src/x.js', "const m = await import('./y.js');"), /REPLACED/);
  assert.doesNotThrow(() => transformModule('src/x.js', "/** @param {import('./t.js').T} x */\nexport function f(x) { return x; }"));
});

test('the bundle is self-contained, small enough and includes every source module', () => {
  const { html, modules } = build();
  assert.ok(Buffer.byteLength(html) < 3 * 1024 * 1024, 'under 3 MB');
  assert.doesNotMatch(html, /<script[^>]+src=/, 'no external scripts');
  assert.doesNotMatch(html, /<link[^>]+stylesheet/, 'no external stylesheets');
  assert.doesNotMatch(html, /https?:\/\/(?!www\.chartjs\.org|mozilla\.github\.io)[^\s"')]+\.(js|css|json)/, 'no fetched assets');
  const srcModules = (dir) => readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? srcModules(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));
  const expected = srcModules('src').filter((m) => m !== 'src/classifier/types.js'); // type-only module
  assert.deepEqual(expected.filter((m) => !modules.includes(m)), [], 'every src module is reachable from app.js');
  assert.ok(modules.includes('rules/default-cz.json'));
  assert.match(html, /bsd-pdf-worker/);
  assert.doesNotMatch(html, /window\.BSD_DEMO/);
  assert.match(build({ withSamples: true }).html, /window\.BSD_DEMO = true/);
});

for (const browser of BROWSERS) {
  test(`bundle from file:// in ${browser.split(/[\\/]/).pop()}: imports all three samples, keeps them across a reload`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bsd-build-'));
    const file = join(dir, 'dashboard.html');
    writeFileSync(file, build().html, 'utf8');
    const b = await launch({ browser });
    try {
      const page = await b.newPage();
      await page.goto(pathToFileURL(file).href);
      const first = await checkPage(page);
      assert.equal(first.errors, '');
      assert.equal(first.empty, true);
      await page.setFiles('body > input[type=file]', SAMPLES);
      await page.waitFor('/47 new transactions/.test(document.getElementById("importPanel").textContent)');
      assert.match(await page.eval('document.getElementById("importPanel").textContent'), /Debit total matches the statement/);
      await page.reload();
      const after = await checkPage(page);
      assert.equal(after.errors, '');
      assert.equal(after.empty, false, 'IndexedDB persists on file://');
      assert.deepEqual(page.exceptions, []);
      // the privacy promise: nothing but the page itself and in-memory blob/data URLs is ever requested
      const external = page.requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:') && u.split('?')[0] !== pathToFileURL(file).href);
      assert.deepEqual(external, [], 'no network requests');
      assert.ok(page.requests.length > 0, 'request logging works');
    } finally {
      await b.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
