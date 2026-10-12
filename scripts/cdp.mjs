// Minimal Chrome DevTools Protocol driver for headless Chrome or Edge, no dependencies (Node 22+
// has a global WebSocket). Used by the render check and the browser tests: unlike --dump-dom it
// waits on real conditions, keeps IndexedDB working, and can set files on <input type="file">.
//
//   const b = await launch({ browser });  const page = await b.newPage();
//   await page.goto(url);  await page.waitFor('document.body.dataset.ready === "1"');
//   await page.eval('1 + 1');  await page.setFiles('input[type=file]', [path]);  await b.close();

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForFile(path, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (existsSync(path)) {
      const text = readFileSync(path, 'utf8');
      if (text.includes('\n')) return text;
    }
    await sleep(50);
  }
  throw new Error('browser did not start (no DevToolsActivePort)');
}

class Session {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ''}`.trim())); else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
}

class Page {
  constructor(session) {
    this.s = session;
    this.console = [];
    this.exceptions = [];
    session.on('Runtime.consoleAPICalled', (p) => this.console.push(p.args.map((a) => a.value ?? a.description ?? '').join(' ')));
    session.on('Runtime.exceptionThrown', (p) => this.exceptions.push((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text));
  }

  async init({ width = 1400, height = 1000 } = {}) {
    await this.s.send('Page.enable');
    await this.s.send('Runtime.enable');
    await this.s.send('DOM.enable');
    await this.s.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  }

  async goto(url) {
    const loaded = new Promise((r) => this.s.on('Page.loadEventFired', r));
    await this.s.send('Page.navigate', { url });
    await Promise.race([loaded, sleep(15000)]);
  }

  async reload() {
    const loaded = new Promise((r) => this.s.on('Page.loadEventFired', r));
    await this.s.send('Page.reload', { ignoreCache: true });
    await Promise.race([loaded, sleep(15000)]);
  }

  /** Evaluate an expression in the page; promises are awaited. */
  async eval(expression) {
    const r = await this.s.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page eval failed: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
    return r.result.value;
  }

  /** Poll until the expression is truthy. */
  async waitFor(expression, { timeout = 20000, interval = 100 } = {}) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      try { last = await this.eval(expression); if (last) return last; } catch { /* page still loading */ }
      await sleep(interval);
    }
    throw new Error(`timed out waiting for: ${expression}`);
  }

  async setFiles(selector, paths) {
    const { root } = await this.s.send('DOM.getDocument', { depth: 1 });
    const { nodeId } = await this.s.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`no element for ${selector}`);
    await this.s.send('DOM.setFileInputFiles', { nodeId, files: paths });
  }

  /**
   * Full-page screenshots grow the viewport to the page height first and wait, because responsive
   * charts re-layout (and animate) on resize; capturing beyond the viewport catches them mid-way.
   */
  async screenshot(path, { fullPage = true, settle = 900 } = {}) {
    const { writeFileSync } = await import('node:fs');
    const view = await this.eval('({ w: window.innerWidth, h: window.innerHeight })');
    if (fullPage) {
      const h = await this.eval('document.documentElement.scrollHeight');
      await this.s.send('Emulation.setDeviceMetricsOverride', { width: view.w, height: h, deviceScaleFactor: 1, mobile: false });
      await sleep(settle);
    }
    const { data } = await this.s.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path, Buffer.from(data, 'base64'));
    if (fullPage) await this.s.send('Emulation.setDeviceMetricsOverride', { width: view.w, height: view.h, deviceScaleFactor: 1, mobile: false });
  }
}

export async function launch({ browser, timeout = 15000 } = {}) {
  if (!browser) throw new Error('no browser given');
  if (typeof WebSocket === 'undefined') throw new Error('global WebSocket missing: Node 22 or newer is required');
  const profile = mkdtempSync(join(tmpdir(), 'bsd-cdp-'));
  const proc = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  const portFile = await waitForFile(join(profile, 'DevToolsActivePort'), timeout);
  const port = Number(portFile.split('\n')[0]);
  const base = `http://127.0.0.1:${port}`;

  return {
    async newPage(opts) {
      const target = await (await fetch(`${base}/json/new?about:blank`, { method: 'PUT' })).json();
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
      const page = new Page(new Session(ws));
      await page.init(opts);
      page.close = () => ws.close();
      return page;
    },
    async close() {
      proc.kill();
      await new Promise((r) => { if (proc.exitCode !== null) r(); else proc.once('exit', r); setTimeout(r, 3000); });
      for (let i = 0; i < 10; i++) {
        try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(200); }
      }
    },
  };
}
