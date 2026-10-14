#!/usr/bin/env node
// Bundles the app into one self-contained HTML file that works from file:// with no network.
//
//   node scripts/build.mjs [--with-samples] [--out dist/dashboard.html]
//
// How: the ES module graph under src/ is walked from src/app.js. Every module (and every JSON
// module) becomes a function in a tiny registry, so module scopes stay separate and names can
// never collide. Static imports become registry lookups, exports become live getters. Chart.js
// is inlined as a classic script; pdf.js runs in its own module script, unchanged except for its
// final export statement; the pdf.js worker is inlined as text and started from a Blob URL.
// Two modules are replaced for the bundle: src/pdfjs-loader.js and src/samples-source.js.
// --with-samples builds the demo: memory store, samples preloaded, a "fake data" banner.
// The page carries a Content Security Policy: only its own inline scripts (by hash) and the pdf.js
// worker Blob may run, and no network request of any kind is allowed, so the "nothing leaves the
// browser" promise is enforced by the browser, not only by the code.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
const SAMPLE_NAMES = ['demo-fio-year.csv', 'fio-sample.csv', 'revolut-sample.csv', 'airbank-sample.pdf'];

// ------------------------------------------------------------------------------- replacements
const REPLACED = {
  'src/pdfjs-loader.js': `// bundle version: pdf.js comes from its own module script, the worker from inlined text
export async function loadPdfjs() {
  const lib = globalThis.__BSD_PDFJS;
  if (!lib) throw new Error('pdf.js failed to load');
  if (!lib.GlobalWorkerOptions.workerSrc) {
    const src = document.getElementById('bsd-pdf-worker').textContent;
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  }
  return lib;
}
`,
  'src/samples-source.js': () => {
    const data = Object.fromEntries(SAMPLE_NAMES.map((n) => [n, readFileSync(resolve(ROOT, 'samples', n)).toString('base64')]));
    return `// bundle version: the sample statements are embedded
const DATA = ${JSON.stringify(data)};
export const SAMPLE_FILES = Object.keys(DATA);
export async function getSampleFiles() {
  return SAMPLE_FILES.map((name) => ({ name, bytes: Uint8Array.from(atob(DATA[name]), (c) => c.charCodeAt(0)) }));
}
`;
  },
};

// ------------------------------------------------------------------------------- module transform
const IMPORT_RE = /^import\s+([\s\S]*?)\s+from\s+'([^']+)'(?:\s+with\s*\{\s*type:\s*'json'\s*\})?\s*;?[ \t]*$/gm;
const BARE_IMPORT_RE = /^import\s+'([^']+)'\s*;?\s*$/gm;

function resolveId(fromId, spec) {
  if (!spec.startsWith('.')) throw new Error(`${fromId}: bare import "${spec}" is not supported`);
  return posix.normalize(posix.join(posix.dirname(fromId), spec));
}

function bindingsOf(clause) {
  // default | { a, b as c } | * as ns | default, { a }
  const out = { def: null, named: [], ns: null };
  const s = clause.trim();
  const ns = /^\*\s+as\s+(\w+)$/.exec(s);
  if (ns) { out.ns = ns[1]; return out; }
  const m = /^(?:(\w+)\s*,?\s*)?(?:\{([\s\S]*)\})?$/.exec(s);
  if (!m) throw new Error(`cannot parse import clause: ${s}`);
  if (m[1]) out.def = m[1];
  if (m[2]) {
    for (const part of m[2].split(',').map((p) => p.trim()).filter(Boolean)) {
      const [name, alias] = part.split(/\s+as\s+/);
      out.named.push([name.trim(), (alias || name).trim()]);
    }
  }
  return out;
}

export function transformModule(id, source) {
  const deps = [];
  let code = source.replace(IMPORT_RE, (_, clause, spec) => {
    const dep = resolveId(id, spec);
    deps.push(dep);
    const b = bindingsOf(clause);
    const req = `__bsd_require(${JSON.stringify(dep)})`;
    const lines = [];
    if (b.ns) lines.push(`const ${b.ns} = ${req};`);
    if (b.def) lines.push(`const ${b.def} = ${req}.default;`);
    if (b.named.length) lines.push(`const { ${b.named.map(([n, a]) => (n === a ? n : `${n}: ${a}`)).join(', ')} } = ${req};`);
    return lines.join(' ');
  });
  code = code.replace(BARE_IMPORT_RE, (_, spec) => { const dep = resolveId(id, spec); deps.push(dep); return `__bsd_require(${JSON.stringify(dep)});`; });

  const exported = [];
  code = code.replace(/^export\s+(async\s+function|function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => { exported.push([name, name]); return `${kind} ${name}`; });
  code = code.replace(/^export\s*\{([^}]*)\}\s*;?\s*$/gm, (_, list) => {
    for (const part of list.split(',').map((p) => p.trim()).filter(Boolean)) {
      const [name, alias] = part.split(/\s+as\s+/);
      exported.push([name.trim(), (alias || name).trim()]);
    }
    return '';
  });
  code = code.replace(/^export\s+default\s+/gm, () => { exported.push(['__bsd_default', 'default']); return 'const __bsd_default = '; });
  if (/^\s*export\s/m.test(code)) throw new Error(`${id}: unsupported export form`);
  if (/^\s*import[\s{*'"]/m.test(code)) throw new Error(`${id}: unsupported import form`);
  if (/\bimport\.meta\b/.test(code) || /\bimport\(/.test(code.replace(/@(?:param|returns?|typedef|type)\b[^\n]*/g, ''))) {
    throw new Error(`${id}: import.meta or dynamic import() cannot be bundled; add it to REPLACED`);
  }
  const getters = exported.map(([local, name]) => `Object.defineProperty(exports, ${JSON.stringify(name)}, { enumerable: true, get: () => ${local} });`).join('\n');
  return { deps, code: `${getters}\n${code}` };
}

// ------------------------------------------------------------------------------- graph
export function collectModules(entry = 'src/app.js') {
  const modules = new Map();
  const visit = (id) => {
    if (modules.has(id)) return;
    if (id.endsWith('.json')) {
      modules.set(id, `exports.default = ${JSON.stringify(JSON.parse(read(id)))};`);
      return;
    }
    const replaced = REPLACED[id];
    const source = typeof replaced === 'function' ? replaced() : replaced !== undefined ? replaced : read(id);
    const { deps, code } = transformModule(id, source);
    modules.set(id, code);
    for (const d of deps) visit(d);
  };
  visit(entry);
  return modules;
}

// ------------------------------------------------------------------------------- html
/**
 * Inline script text must not end its <script> element early. "</script" is escaped; "<!--" and
 * "<script" would switch the HTML parser into its escaped script states, where "</script>" no
 * longer ends the element. They cannot be escaped safely outside string literals, so they fail
 * the build instead (none of the current sources contain them).
 */
export function escapeScript(s) {
  const bad = /<!--|<script/i.exec(s);
  if (bad) throw new Error(`inline script contains "${bad[0]}" at offset ${bad.index}; it would confuse the HTML parser`);
  return s.replace(/<\/script/gi, '<\\/script');
}

const cspHash = (body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;

/** The page policy; scriptBodies are the exact texts of the inline executable scripts. */
export function contentSecurityPolicy(scriptBodies) {
  return [
    "default-src 'none'",
    `script-src ${scriptBodies.map(cspHash).join(' ')} blob:`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    "connect-src 'none'",
    "font-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

function pdfjsModuleScript() {
  let lib = read('vendor/pdf.min.mjs');
  const m = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(lib);
  if (!m) throw new Error('pdf.js: final export statement not found');
  const pairs = m[1].split(',').map((p) => p.trim()).filter(Boolean).map((p) => { const [local, name] = p.split(/\s+as\s+/); return `${JSON.stringify((name || local).trim())}: ${local.trim()}`; });
  lib = lib.slice(0, m.index) + `globalThis.__BSD_PDFJS = { ${pairs.join(', ')} };\n`;
  return lib;
}

function appScript(modules) {
  const defs = [...modules].map(([id, code]) => `__bsd_define(${JSON.stringify(id)}, function (exports) {\n${code}\n});`).join('\n');
  return `const __bsd_defs = Object.create(null);
const __bsd_cache = Object.create(null);
function __bsd_define(id, fn) { __bsd_defs[id] = fn; }
function __bsd_require(id) {
  if (__bsd_cache[id]) return __bsd_cache[id];
  const exports = {};
  __bsd_cache[id] = exports;
  if (!__bsd_defs[id]) throw new Error('bundle: missing module ' + id);
  __bsd_defs[id](exports);
  return exports;
}
${defs}
__bsd_require('src/app.js');
`;
}

export function build({ withSamples = false } = {}) {
  const modules = collectModules();
  let html = read('index.html');
  const swap = (from, to) => {
    if (!html.includes(from)) throw new Error(`index.html: "${from}" not found`);
    html = html.split(from).join(to);
  };
  swap('<link rel="stylesheet" href="src/styles.css">', `<style>\n${read('src/styles.css')}</style>`);
  // [attributes, body]; the text/plain block is data (the pdf.js worker source), never executed
  const parts = [
    withSamples ? ['', 'window.BSD_DEMO = true;'] : null,
    ['', `\n/* Chart.js 4.4.4 | MIT | https://www.chartjs.org */\n${escapeScript(read('vendor/chart.umd.js').replace(/\/\/# sourceMappingURL=\S+\s*$/, ''))}\n`],
    [' type="text/plain" id="bsd-pdf-worker"', escapeScript(read('vendor/pdf.worker.min.mjs'))],
    [' type="module"', `\n/* pdf.js 4.10.38 | Apache-2.0 | https://mozilla.github.io/pdf.js/ */\n${escapeScript(pdfjsModuleScript())}\n`],
    [' type="module"', `\n${escapeScript(appScript(modules))}`],
  ].filter(Boolean);
  const scripts = parts.map(([attrs, body]) => `<script${attrs}>${body}</script>`).join('\n');
  swap('<script src="vendor/chart.umd.js"></script>\n<script type="module" src="src/app.js"></script>', scripts);
  // hash every inline executable script of the final page, index.html's error logger included
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*text\/plain)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const csp = contentSecurityPolicy(inline);
  swap('<meta charset="utf-8">\n', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="referrer" content="no-referrer">\n`);
  if (withSamples) html = html.replace('<title>Bank Statement Dashboard</title>', '<title>Bank Statement Dashboard (demo)</title>');
  return { html, modules: [...modules.keys()] };
}

if (process.argv[1] && /build\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const args = process.argv.slice(2);
  const withSamples = args.includes('--with-samples');
  const i = args.indexOf('--out');
  const out = resolve(ROOT, i >= 0 ? args[i + 1] : 'dist/dashboard.html');
  const { html, modules } = build({ withSamples });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, 'utf8');
  console.log(`wrote ${out}: ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB, ${modules.length} modules${withSamples ? ', demo with samples' : ''}`);
}
