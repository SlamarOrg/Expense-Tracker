// The dashboard: filters, KPIs, charts, tables, in-page categorization. Moved verbatim from the
// private single-file version; `state` holds every filter and renderAll() recomputes everything
// from TX on each change, destroying and recreating Chart.js instances through upsert().
// Colours come from CSS custom properties read at render time, which is how light/dark works.
// Chart is the global from vendor/chart.umd.js.
/* global Chart */

import { el, clear } from './dom.js';
import { showTip, tipRow } from './tooltip.js';
import { applyOverrides } from '../store/overrides.js';
import * as i18n from '../i18n/index.js';

/**
 * @param {{tx: object[], categories: string[], folded?: string[], fx?: object, overrides?: object, meta?: object}} DATA
 * @returns {{renderAll: Function, state: object} | null}
 */
export function mountDashboard(DATA) {
  const spending = (DATA && DATA.tx ? DATA.tx : []).filter(t => t.k === 'expense' || t.k === 'investment');
  if (!spending.length) {
    document.body.setAttribute('data-empty', '1');
    document.getElementById('subtitle').textContent = i18n.t('dash.noData');
    document.body.setAttribute('data-ready', '1');
    return null;
  }
  document.body.removeAttribute('data-empty');

  // ---------------------------------------------------------------- constants
  const TX = spending;
  const FOLDED = new Set(DATA.folded || []);
  const SLOT_ORDER = ['Groceries', 'Restaurants & cafés', 'Transport', 'Entertainment', 'Subscriptions', 'Shopping', 'Housing & utilities', 'Travel'];
  const OTHER_LABEL = i18n.t('chart.everythingElse');
  const ALL_SPENDING = i18n.t('trend.all');
  const INVEST = 'Investments';
  const BANKS = [...new Set(TX.map(t => t.s))].sort(); // every bank present in the data, no fixed list
  const ALL_CATS = (DATA.categories || []).slice();
  const DAY = 86400000;

  // ---------------------------------------------------------------- category overrides (merchant -> category)
  // DATA.overridesStore is a store/overrides.js instance; the app persists it and loads it back.
  const OVR = DATA.overridesStore;
  for (const t of TX) { if (t.c0 === undefined) t.c0 = t.c; }
  function applyOverridesNow() { applyOverrides(TX, OVR); }
  function setOverride(key, cat) { OVR.set(key, cat); applyOverridesNow(); renderAll(); }
  applyOverridesNow();

  const fmtCZK = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });
  const fmtCZK2 = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (x) => (x > 0 ? '+' : '') + Math.round(x * 100) + ' %';
  const fmtCompact = (n) => Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n));
  const MONTHS = Array.from({ length: 12 }, (_, i) => i18n.t('month.' + i));
  const fmtMonth = (ym) => i18n.t('date.month', { m: MONTHS[+ym.slice(5, 7) - 1], y: ym.slice(0, 4) });
  const fmtDay = (iso) => { const d = new Date(iso + 'T00:00:00'); return i18n.t('date.day', { d: d.getDate(), m: MONTHS[d.getMonth()], y: d.getFullYear() }); };
  const fmtDayShort = (iso) => { const d = new Date(iso + 'T00:00:00'); return i18n.t('date.dayShort', { d: d.getDate(), m: MONTHS[d.getMonth()] }); };
  const isoOf = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
  const addMonths = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setMonth(d.getMonth() + n); return isoOf(d); };
  const mondayOf = (iso) => { const d = new Date(iso + 'T00:00:00'); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return isoOf(d); };
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY) + 1;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function colorOf(cat) {
    const i = SLOT_ORDER.indexOf(cat);
    if (i >= 0) return css('--s' + (i + 1));
    if (cat === INVEST) return css('--s-invest');
    return css('--s-other');
  }
  function withAlpha(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  function lift(hex) { // hover: lighten slightly
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const mix = (c) => Math.round(c + (255 - c) * 0.22);
    return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
  }

  // ---------------------------------------------------------------- state
  const dates = TX.map(t => t.d).sort();
  const MIN_DATE = dates[0], MAX_DATE = dates[dates.length - 1];
  const state = {
    from: addMonths(MAX_DATE.slice(0, 8) + '01', -11), to: MAX_DATE, preset: '12m',
    banks: new Set(BANKS), invest: false, cat: null, search: '', sortKey: 'd', sortDir: -1, shown: 150,
    trendCat: ALL_SPENDING, monthlyTable: false, oneoff: false, oneoffCap: 50000
  };

  const PRESETS = [
    { id: '30d', label: i18n.t('preset.30d'), from: () => addDays(MAX_DATE, -29) },
    { id: '3m', label: i18n.t('preset.3m'), from: () => addMonths(MAX_DATE.slice(0, 8) + '01', -2) },
    { id: '6m', label: i18n.t('preset.6m'), from: () => addMonths(MAX_DATE.slice(0, 8) + '01', -5) },
    { id: '12m', label: i18n.t('preset.12m'), from: () => addMonths(MAX_DATE.slice(0, 8) + '01', -11) },
    { id: 'ytd', label: i18n.t('preset.ytd'), from: () => MAX_DATE.slice(0, 4) + '-01-01' },
    { id: 'all', label: i18n.t('preset.all'), from: () => MIN_DATE },
  ];

  // ---------------------------------------------------------------- filtering
  function baseFilter(t) {
    if (!state.banks.has(t.s)) return false;
    if (state.oneoff && t.amt > state.oneoffCap) return false;
    if (t.k === 'investment') return state.invest;
    return t.k === 'expense';
  }
  function inRange(t, from, to) { return t.d >= from && t.d <= to; }
  function catMatch(t) { return !state.cat || t.c === state.cat; }
  function selected() { return TX.filter(t => baseFilter(t) && inRange(t, state.from, state.to) && catMatch(t)); }

  function monthsIn(from, to) {
    const out = []; let ym = from.slice(0, 7);
    while (ym <= to.slice(0, 7)) { out.push(ym); ym = addMonths(ym + '-01', 1).slice(0, 7); }
    return out;
  }
  function sumBy(rows, keyFn) {
    const m = new Map();
    for (const t of rows) { const k = keyFn(t); m.set(k, (m.get(k) || 0) + t.amt); }
    return m;
  }
  function chartSeries(cats) { // which series appear in colored charts, in fixed order
    const out = SLOT_ORDER.filter(c => cats.has(c));
    const rest = [...cats].filter(c => !SLOT_ORDER.includes(c) && c !== INVEST);
    if (rest.length) out.push(OTHER_LABEL);
    if (cats.has(INVEST)) out.push(INVEST);
    return out;
  }
  const seriesOf = (cat) => SLOT_ORDER.includes(cat) || cat === INVEST ? cat : OTHER_LABEL;

  // ---------------------------------------------------------------- chart defaults
  const charts = {};
  function baseOptions() {
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: css('--muted'), maxRotation: 0, autoSkipPadding: 12, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: css('--grid'), lineWidth: 1 }, border: { display: false }, ticks: { color: css('--muted'), callback: (v) => fmtCompact(v), font: { size: 11 }, maxTicksLimit: 6 } }
      }
    };
  }
  function setDefaults() {
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    Chart.defaults.color = css('--muted');
  }

  // ---------------------------------------------------------------- renderers
  function renderFilters() {
    const p = clear(document.getElementById('presets'));
    for (const pr of PRESETS) {
      const b = el('button', 'chip', pr.label); b.setAttribute('aria-pressed', String(state.preset === pr.id));
      b.addEventListener('click', () => { state.preset = pr.id; state.from = pr.from(); state.to = MAX_DATE; if (state.from < MIN_DATE) state.from = MIN_DATE; renderAll(); });
      p.appendChild(b);
    }
    document.getElementById('from').value = state.from;
    document.getElementById('to').value = state.to;
    const bk = clear(document.getElementById('banks'));
    for (const b of BANKS) {
      const c = el('button', 'chip', b); c.setAttribute('aria-pressed', String(state.banks.has(b)));
      c.addEventListener('click', () => { if (state.banks.has(b)) { if (state.banks.size > 1) state.banks.delete(b); } else state.banks.add(b); renderAll(); });
      bk.appendChild(c);
    }
    document.getElementById('invest').checked = state.invest;
    document.getElementById('oneoff').checked = state.oneoff;
    document.getElementById('oneoffCap').value = state.oneoffCap;
    const cf = clear(document.getElementById('catfilter'));
    if (state.cat) {
      const c = el('button', 'chip cat-chip'); const d = el('span', 'dot'); d.style.background = colorOf(state.cat);
      c.appendChild(d); c.appendChild(document.createTextNode(state.cat)); c.appendChild(el('span', 'x', '×'));
      c.title = i18n.t('filter.clearCat'); c.addEventListener('click', () => { state.cat = null; renderAll(); });
      cf.appendChild(c);
    }
  }

  function renderKPIs(rows) {
    const total = rows.reduce((a, t) => a + t.amt, 0);
    const days = daysBetween(state.from, state.to);
    const perMonth = total / (days / 30.4375);
    const byCat = sumBy(rows, t => t.c);
    const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
    const prevFrom = addDays(state.from, -days), prevTo = addDays(state.from, -1);
    const prevRows = TX.filter(t => baseFilter(t) && inRange(t, prevFrom, prevTo) && catMatch(t));
    const prev = prevRows.reduce((a, t) => a + t.amt, 0);
    const delta = prev > 0 ? (total - prev) / prev : null;
    const months = monthsIn(state.from, state.to);
    const byMonth = sumBy(rows, t => t.d.slice(0, 7));

    const k = clear(document.getElementById('kpis'));
    const tile = (cls) => { const c = el('div', 'card kpi ' + (cls || '')); k.appendChild(c); return c; };

    const t1 = tile('hero');
    t1.appendChild(el('div', 'label', state.cat ? i18n.t('kpi.spentCat', { cat: state.cat }) : i18n.t('kpi.spent')));
    t1.appendChild(el('div', 'value', fmtCZK.format(total)));
    const d1 = el('div', 'delta ' + (delta == null ? '' : delta > 0 ? 'up' : 'down'));
    if (delta == null) d1.appendChild(el('span', null, i18n.t('kpi.noPrev'))); else { d1.appendChild(el('b', null, fmtPct(delta))); d1.appendChild(el('span', null, i18n.t('kpi.vsPrev', { days, amount: fmtCZK.format(prev) }))); }
    t1.appendChild(d1);
    if (months.length > 1) { const sp = el('div', 'spark'); const cv = document.createElement('canvas'); sp.appendChild(cv); t1.appendChild(sp); drawSpark(cv, months.map(m => byMonth.get(m) || 0)); }

    const t2 = tile();
    t2.appendChild(el('div', 'label', i18n.t('kpi.avgMonth')));
    t2.appendChild(el('div', 'value', fmtCZK.format(perMonth)));
    t2.appendChild(el('div', 'delta', i18n.t('kpi.perWeekDay', { week: fmtCZK.format(total / Math.max(1, days / 7)), day: fmtCZK.format(total / Math.max(1, days)) })));

    const t3 = tile();
    t3.appendChild(el('div', 'label', i18n.t('kpi.biggest')));
    if (top) {
      const v = el('div', 'value'); const sw = el('span', 'swatch'); sw.style.background = colorOf(top[0]); v.appendChild(sw); v.appendChild(document.createTextNode(top[0])); v.style.fontSize = top[0].length > 14 ? '22px' : '26px'; t3.appendChild(v);
      t3.appendChild(el('div', 'delta', i18n.t('kpi.share', { amount: fmtCZK.format(top[1]), pct: Math.round(top[1] / total * 100) })));
    } else { t3.appendChild(el('div', 'value', '—')); t3.appendChild(el('div', 'delta', i18n.t('kpi.noSpending'))); }

    const t4 = tile();
    t4.appendChild(el('div', 'label', i18n.t('kpi.transactions')));
    t4.appendChild(el('div', 'value', String(rows.length)));
    const biggest = rows.slice().sort((a, b) => b.amt - a.amt)[0];
    t4.appendChild(el('div', 'delta', biggest ? i18n.t('kpi.largest', { amount: fmtCZK.format(biggest.amt), merchant: biggest.m || biggest.t }) : '—'));
  }

  function drawSpark(canvas, values) {
    const dpr = window.devicePixelRatio || 1; const W = canvas.parentElement.clientWidth || 200, H = 36;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const max = Math.max(...values, 1), n = values.length;
    const x = (i) => 2 + i * (W - 4) / (n - 1), y = (v) => H - 3 - (v / max) * (H - 8);
    ctx.beginPath(); values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.lineTo(x(n - 1), H); ctx.lineTo(x(0), H); ctx.closePath(); ctx.fillStyle = withAlpha(css('--accent'), 0.12); ctx.fill();
    ctx.beginPath(); values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.strokeStyle = css('--axis'); ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x(n - 1), y(values[n - 1]), 3.5, 0, Math.PI * 2); ctx.fillStyle = css('--accent'); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = css('--surface'); ctx.stroke();
  }

  function renderMonthly(rows) {
    const months = monthsIn(state.from, state.to);
    const cats = new Set(rows.map(t => t.c));
    const series = chartSeries(cats);
    const detail = new Map(); // month -> Map(cat -> amt)
    for (const t of rows) { const ym = t.d.slice(0, 7); if (!detail.has(ym)) detail.set(ym, new Map()); const m = detail.get(ym); m.set(t.c, (m.get(t.c) || 0) + t.amt); }
    const perSeries = series.map(s => months.map(ym => { let v = 0; for (const [c, a] of (detail.get(ym) || [])) if (seriesOf(c) === s) v += a; return Math.round(v); }));
    const totals = months.map((_, i) => perSeries.reduce((a, arr) => a + arr[i], 0));
    const topIdx = months.map((_, i) => { let k = -1; perSeries.forEach((arr, j) => { if (arr[i] > 0) k = j; }); return k; });
    const surface = css('--surface');
    const datasets = series.map((s, j) => ({
      label: s, data: perSeries[j], backgroundColor: colorOf(s), hoverBackgroundColor: lift(colorOf(s)),
      borderColor: surface, borderWidth: { top: 2 }, borderSkipped: false, maxBarThickness: 24,
      borderRadius: (ctx) => topIdx[ctx.dataIndex] === j ? { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } : 0,
    }));
    const opt = baseOptions();
    opt.scales.x.stacked = true; opt.scales.y.stacked = true;
    opt.interaction = { mode: 'index', intersect: false };
    opt.onClick = (evt, els, chart) => { if (!els.length) return; const s = chart.data.datasets[els[0].datasetIndex].label; if (SLOT_ORDER.includes(s) || s === INVEST) { state.cat = state.cat === s ? null : s; renderAll(); } };
    opt.plugins.tooltip.external = (c) => showTip(c.chart, c.tooltip, (box) => {
      const i = c.tooltip.dataPoints[0].dataIndex;
      box.appendChild(el('div', 't', fmtMonth(months[i])));
      box.appendChild(el('div', 'total', fmtCZK.format(totals[i])));
      const items = series.map((s, j) => [s, perSeries[j][i]]).filter(x => x[1] !== 0).sort((a, b) => b[1] - a[1]);
      for (const [s, v] of items) tipRow(box, colorOf(s), s, fmtCZK.format(v), totals[i] ? Math.round(v / totals[i] * 100) + ' %' : '');
      if (months[i] === MAX_DATE.slice(0, 7) && state.to === MAX_DATE) box.appendChild(el('div', 'sub', i18n.t('monthly.currentMonth', { date: fmtDayShort(MAX_DATE) })));
    });
    const labels = months.map(ym => months.length > 18 ? (ym.endsWith('-01') ? ym.slice(0, 4) : MONTHS[+ym.slice(5, 7) - 1].slice(0, 1)) : fmtMonth(ym).replace(/ 20/, " '"));
    if (months.length > 36) opt.scales.x.ticks.callback = (v, i) => months[i].endsWith('-01') ? months[i].slice(0, 4) : '';
    upsert('monthly', document.getElementById('monthly'), { type: 'bar', data: { labels, datasets }, options: opt });
    document.getElementById('monthlyTitle').textContent = state.cat ? i18n.t('monthly.titleCat', { cat: state.cat }) : i18n.t('monthly.title');
    document.getElementById('monthlyHint').textContent = state.cat ? i18n.t('monthly.hintCat', { cat: state.cat }) : i18n.t('monthly.hint');

    const lg = clear(document.getElementById('monthlyLegend'));
    for (const s of series) {
      const b = el('button'); const sw = el('span', 'sw'); sw.style.background = colorOf(s); b.appendChild(sw); b.appendChild(document.createTextNode(s));
      if (s === OTHER_LABEL) b.title = [...cats].filter(c => !SLOT_ORDER.includes(c) && c !== INVEST).join(', ');
      b.addEventListener('click', () => { if (s === OTHER_LABEL) return; state.cat = state.cat === s ? null : s; renderAll(); });
      lg.appendChild(b);
    }

    // table twin
    const tw = clear(document.getElementById('monthlyTable'));
    tw.hidden = !state.monthlyTable; document.getElementById('monthlyTableBtn').setAttribute('aria-pressed', String(state.monthlyTable));
    if (state.monthlyTable) {
      const allCats = [...cats].sort((a, b) => (SLOT_ORDER.indexOf(a) === -1 ? 99 : SLOT_ORDER.indexOf(a)) - (SLOT_ORDER.indexOf(b) === -1 ? 99 : SLOT_ORDER.indexOf(b)) || a.localeCompare(b));
      const table = el('table'); const thead = el('thead'); const hr = el('tr'); hr.appendChild(el('th', null, i18n.t('monthly.colMonth'))); hr.appendChild(el('th', 'num', i18n.t('monthly.colTotal')));
      for (const c of allCats) hr.appendChild(el('th', 'num', c)); thead.appendChild(hr); table.appendChild(thead);
      const tb = el('tbody');
      months.slice().reverse().forEach((ym) => { const i = months.indexOf(ym); const tr = el('tr'); tr.appendChild(el('td', null, fmtMonth(ym))); tr.appendChild(el('td', 'num', fmtCZK.format(totals[i])));
        for (const c of allCats) { const v = (detail.get(ym) || new Map()).get(c) || 0; tr.appendChild(el('td', 'num', v ? fmtCZK.format(v) : '·')); } tb.appendChild(tr); });
      table.appendChild(tb); tw.appendChild(table);
    }
  }

  function renderDonut(rowsNoCat) {
    const total = rowsNoCat.reduce((a, t) => a + t.amt, 0);
    const byCat = [...sumBy(rowsNoCat, t => t.c).entries()].filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const colored = byCat.filter(x => SLOT_ORDER.includes(x[0]) || x[0] === INVEST);
    const top = colored.slice(0, 5);
    const restSum = total - top.reduce((a, x) => a + x[1], 0);
    const labels = top.map(x => x[0]), values = top.map(x => Math.round(x[1]));
    if (restSum > 0.5) { labels.push(OTHER_LABEL); values.push(Math.round(restSum)); }
    const colors = labels.map(l => colorOf(l));
    const surface = css('--surface');
    const centerText = {
      id: 'centerText', afterDraw(chart) {
        const { ctx, chartArea } = chart; if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right) / 2, cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = css('--ink'); ctx.font = '600 20px system-ui, -apple-system, "Segoe UI", sans-serif'; ctx.fillText(fmtCompact(total) + ' Kč', cx, cy - 8);
        ctx.fillStyle = css('--muted'); ctx.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif'; ctx.fillText(state.cat ? i18n.t('donut.allCats') : i18n.t('donut.inRange'), cx, cy + 12);
        ctx.restore();
      }
    };
    const cfg = {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors.map((c, i) => state.cat && labels[i] !== state.cat ? withAlpha(c, 0.35) : c), hoverBackgroundColor: colors.map(lift), borderWidth: 0, spacing: 2, hoverOffset: 6, borderColor: surface }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '72%', animation: { duration: 250 },
        plugins: { legend: { display: false }, tooltip: { enabled: false, external: (c) => showTip(c.chart, c.tooltip, (box) => {
          const dp = c.tooltip.dataPoints[0]; const l = labels[dp.dataIndex], v = values[dp.dataIndex];
          box.appendChild(el('div', 't', l)); box.appendChild(el('div', 'total', fmtCZK.format(v)));
          box.appendChild(el('div', 'sub', i18n.t('donut.shareOf', { pct: Math.round(v / total * 100), total: fmtCZK.format(total) })));
          if (l === OTHER_LABEL) box.appendChild(el('div', 'sub', byCat.filter(x => !labels.includes(x[0])).map(x => x[0]).join(', ')));
        }) } },
        onClick: (evt, els) => { if (!els.length) return; const l = labels[els[0].index]; if (l === OTHER_LABEL) return; state.cat = state.cat === l ? null : l; renderAll(); }
      },
      plugins: [centerText]
    };
    upsert('donut', document.getElementById('donut'), cfg);

    const ul = clear(document.getElementById('catlist'));
    const max = byCat.length ? byCat[0][1] : 1;
    for (const [c, v] of byCat) {
      const li = el('li'); li.setAttribute('aria-selected', String(state.cat === c)); li.tabIndex = 0;
      const sw = el('span', 'sw'); sw.style.background = colorOf(c); li.appendChild(sw);
      const nm = el('span', 'nm'); nm.appendChild(document.createTextNode(c)); const bar = el('small'); const fill = el('i'); fill.style.width = (v / max * 100) + '%'; fill.style.background = colorOf(c); bar.appendChild(fill); nm.appendChild(bar); li.appendChild(nm);
      li.appendChild(el('span', 'amt', fmtCZK.format(v)));
      li.appendChild(el('span', 'pct', Math.round(v / total * 100) + ' %'));
      const act = () => { state.cat = state.cat === c ? null : c; renderAll(); };
      li.addEventListener('click', act); li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
      ul.appendChild(li);
    }
    if (!byCat.length) ul.appendChild(el('li', 'empty', i18n.t('donut.nothing')));
  }

  function renderWeekly(rows) {
    const firstMon = mondayOf(state.from), lastMon = mondayOf(state.to);
    const weeks = []; let w = firstMon; while (w <= lastMon) { weeks.push(w); w = addDays(w, 7); }
    const show = weeks.slice(-16);
    const byWeek = new Map(); const byWeekCat = new Map();
    for (const t of rows) { const k = mondayOf(t.d); byWeek.set(k, (byWeek.get(k) || 0) + t.amt); if (!byWeekCat.has(k)) byWeekCat.set(k, new Map()); const m = byWeekCat.get(k); m.set(t.c, (m.get(t.c) || 0) + t.amt); }
    const vals = show.map(k => Math.round(byWeek.get(k) || 0));
    const complete = show.filter(k => k >= state.from && addDays(k, 6) <= state.to);
    const avgBase = complete.length ? complete : show;
    const avg = avgBase.reduce((a, k) => a + (byWeek.get(k) || 0), 0) / Math.max(1, avgBase.length);
    document.getElementById('weeklyHint').textContent = i18n.t(weeks.length > 16 ? 'weekly.hintLast16' : 'weekly.hintAll', { avg: fmtCZK.format(avg) });
    const label = (k) => fmtDayShort(k);
    const opt = baseOptions();
    opt.interaction = { mode: 'index', intersect: false };
    opt.plugins.tooltip.external = (c) => showTip(c.chart, c.tooltip, (box) => {
      const i = c.tooltip.dataPoints[0].dataIndex; const k = show[i];
      box.appendChild(el('div', 't', i18n.t('weekly.weekOf', { from: fmtDay(k), to: fmtDayShort(addDays(k, 6)) })));
      box.appendChild(el('div', 'total', fmtCZK.format(vals[i])));
      const d = avg ? (vals[i] - avg) / avg : 0; box.appendChild(el('div', 'sub', i18n.t('weekly.vsAvg', { pct: fmtPct(d) })));
      const cats = [...(byWeekCat.get(k) || new Map()).entries()].filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
      for (const [cat, v] of cats) tipRow(box, colorOf(cat), cat, fmtCZK.format(v), vals[i] ? Math.round(v / vals[i] * 100) + ' %' : '');
    });
    const barColor = state.cat ? colorOf(state.cat) : css('--s1');
    upsert('weekly', document.getElementById('weekly'), {
      type: 'bar',
      data: { labels: show.map(label), datasets: [
        { type: 'line', label: i18n.t('chart.average'), data: show.map(() => Math.round(avg)), borderColor: css('--axis'), borderWidth: 1.5, pointRadius: 0, pointHitRadius: 0, fill: false, order: 0 },
        { label: i18n.t('chart.spent'), data: vals, backgroundColor: barColor, hoverBackgroundColor: lift(barColor), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 24, order: 1 }
      ] },
      options: opt
    });
    // table
    const table = clear(document.getElementById('weeklyTable'));
    const thead = el('thead'); const hr = el('tr');
    for (const [txt, cls] of [[i18n.t('weekly.colWeek'), ''], [i18n.t('weekly.colSpent'), 'num'], [i18n.t('weekly.colVsAvg'), 'num'], [i18n.t('weekly.colTop'), ''], [i18n.t('weekly.colTx'), 'num']]) hr.appendChild(el('th', cls, txt));
    thead.appendChild(hr); table.appendChild(thead);
    const tb = el('tbody');
    show.slice().reverse().forEach(k => {
      const v = byWeek.get(k) || 0; const cats = [...(byWeekCat.get(k) || new Map()).entries()].sort((a, b) => b[1] - a[1]); const topCat = cats[0];
      const n = rows.filter(t => mondayOf(t.d) === k).length;
      const tr = el('tr');
      const partial = !(k >= state.from && addDays(k, 6) <= state.to);
      tr.appendChild(el('td', null, fmtDayShort(k) + ' – ' + fmtDayShort(addDays(k, 6)) + (partial ? ' ' + i18n.t('weekly.partial') : '')));
      tr.appendChild(el('td', 'num', fmtCZK.format(v)));
      const d = avg ? (v - avg) / avg : 0; tr.appendChild(el('td', 'num ' + (d > 0.05 ? 'neg' : d < -0.05 ? 'pos' : ''), v ? fmtPct(d) : '—'));
      const td = el('td'); if (topCat) { const p = el('span', 'pill'); const dot = el('span', 'dot'); dot.style.background = colorOf(topCat[0]); p.appendChild(dot); p.appendChild(document.createTextNode(topCat[0])); td.appendChild(p); } else td.textContent = '—'; tr.appendChild(td);
      tr.appendChild(el('td', 'num', String(n)));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
  }

  function renderTrend(rowsNoCat) {
    const sel = document.getElementById('trendCat');
    const options = [ALL_SPENDING, ...ALL_CATS.filter(c => c !== 'Other'), 'Other', ...(state.invest ? [INVEST] : [])];
    if (sel.options.length !== options.length || [...sel.options].some((o, i) => o.value !== options[i])) {
      clear(sel); for (const o of options) { const op = el('option', null, o); op.value = o; sel.appendChild(op); }
    }
    if (!options.includes(state.trendCat)) state.trendCat = ALL_SPENDING;
    sel.value = state.trendCat;
    const months = monthsIn(state.from, state.to);
    const rows = state.trendCat === ALL_SPENDING ? rowsNoCat : rowsNoCat.filter(t => t.c === state.trendCat);
    const byMonth = sumBy(rows, t => t.d.slice(0, 7));
    const vals = months.map(m => Math.round(byMonth.get(m) || 0));
    const color = state.trendCat === ALL_SPENDING ? css('--s1') : colorOf(state.trendCat);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const opt = baseOptions();
    opt.interaction = { mode: 'index', intersect: false };
    opt.plugins.tooltip.external = (c) => showTip(c.chart, c.tooltip, (box) => {
      const i = c.tooltip.dataPoints[0].dataIndex;
      box.appendChild(el('div', 't', fmtMonth(months[i]) + ' · ' + state.trendCat));
      box.appendChild(el('div', 'total', fmtCZK.format(vals[i])));
      if (i > 0 && vals[i - 1]) box.appendChild(el('div', 'sub', i18n.t('trend.vsPrevMonth', { pct: fmtPct((vals[i] - vals[i - 1]) / vals[i - 1]) })));
      box.appendChild(el('div', 'sub', i18n.t('trend.vsRangeAvg', { pct: fmtPct(avg ? (vals[i] - avg) / avg : 0), avg: fmtCZK.format(avg) })));
    });
    if (months.length > 36) opt.scales.x.ticks.callback = (v, i) => months[i].endsWith('-01') ? months[i].slice(0, 4) : '';
    upsert('trend', document.getElementById('trend'), {
      type: 'line',
      data: { labels: months.map(m => months.length > 18 ? (m.endsWith('-01') ? m.slice(0, 4) : MONTHS[+m.slice(5, 7) - 1].slice(0, 1)) : fmtMonth(m).replace(/ 20/, " '")), datasets: [
        { label: state.trendCat, data: vals, borderColor: color, backgroundColor: withAlpha(color, 0.10), fill: true, borderWidth: 2, tension: 0.25, borderJoinStyle: 'round', borderCapStyle: 'round',
          pointRadius: months.length > 30 ? 0 : 4, pointHoverRadius: 5, pointBackgroundColor: color, pointBorderColor: css('--surface'), pointBorderWidth: 2, pointHitRadius: 16 },
        { label: i18n.t('chart.average'), data: months.map(() => Math.round(avg)), borderColor: css('--axis'), borderWidth: 1.5, pointRadius: 0, pointHitRadius: 0, fill: false }
      ] },
      options: opt
    });
    const lg = clear(document.getElementById('trendLegend'));
    const a = el('span'); const ln = el('span', 'ln'); ln.style.background = css('--axis'); a.appendChild(ln); a.appendChild(document.createTextNode(' ' + i18n.t('trend.legend', { avg: fmtCZK.format(avg) }))); a.style.display = 'inline-flex'; a.style.alignItems = 'center'; a.style.gap = '6px';
    lg.appendChild(a);
  }

  function renderTransactions(rows) {
    const q = state.search.trim().toLowerCase();
    let list = rows;
    if (q) list = rows.filter(t => (t.m + ' ' + t.n + ' ' + t.c + ' ' + t.s + ' ' + t.t).toLowerCase().includes(q));
    const dir = state.sortDir;
    list = list.slice().sort((a, b) => {
      if (state.sortKey === 'amt') return (a.amt - b.amt) * dir;
      if (state.sortKey === 'm') return a.m.localeCompare(b.m) * dir;
      if (state.sortKey === 'c') return a.c.localeCompare(b.c) * dir || b.d.localeCompare(a.d);
      return a.d.localeCompare(b.d) * dir || b.amt - a.amt;
    });
    document.getElementById('txHint').textContent = i18n.tn('tx.count', list.length) + (q ? ' ' + i18n.t('tx.matching', { q: state.search.trim() }) : '') + ' · ' + fmtCZK.format(list.reduce((a, t) => a + t.amt, 0));
    const table = clear(document.getElementById('txTable'));
    const thead = el('thead'); const hr = el('tr');
    for (const [key, txt, cls] of [['d', i18n.t('tx.colDate'), ''], ['m', i18n.t('tx.colMerchant'), ''], ['c', i18n.t('tx.colCategory'), ''], ['s', i18n.t('tx.colBank'), ''], ['amt', i18n.t('tx.colAmount'), 'num']]) {
      const th = el('th', (cls + (key === 's' ? '' : ' sortable')).trim(), txt + (state.sortKey === key ? (state.sortDir < 0 ? ' ↓' : ' ↑') : ''));
      if (key !== 's') th.addEventListener('click', () => { if (state.sortKey === key) state.sortDir *= -1; else { state.sortKey = key; state.sortDir = key === 'd' || key === 'amt' ? -1 : 1; } renderTransactions(selected()); });
      hr.appendChild(th);
    }
    thead.appendChild(hr); table.appendChild(thead);
    const tb = el('tbody');
    for (const t of list.slice(0, state.shown)) {
      const tr = el('tr');
      tr.appendChild(el('td', 'date', fmtDay(t.d)));
      const td = el('td'); td.appendChild(el('span', 'm', t.m || t.t)); if (t.n) td.appendChild(el('span', 'note', t.n)); tr.appendChild(td);
      const tc = el('td'); const p = el('span', 'pill'); const dot = el('span', 'dot'); dot.style.background = colorOf(t.c); p.appendChild(dot); p.appendChild(document.createTextNode(t.c)); tc.appendChild(p); tr.appendChild(tc);
      tr.appendChild(el('td', null, t.s));
      const ta = el('td', 'num' + (t.amt < 0 ? ' pos' : ''), (t.amt < 0 ? '+' : '') + fmtCZK2.format(Math.abs(t.amt)));
      if (t.cur !== 'CZK') ta.appendChild(el('span', 'note', Math.abs(t.orig).toFixed(2) + ' ' + t.cur));
      if (t.amt < 0) ta.title = i18n.t('tx.refund'); tr.appendChild(ta);
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    const more = clear(document.getElementById('moreWrap'));
    if (!list.length) more.appendChild(el('div', 'empty', i18n.t('tx.none')));
    else if (list.length > state.shown) { const b = el('button', 'btn', i18n.t('tx.showMore', { n: Math.min(200, list.length - state.shown), total: list.length })); b.addEventListener('click', () => { state.shown += 200; renderTransactions(selected()); }); more.appendChild(b); }
    renderTransactions.current = list;
  }

  function renderOther(rows) {
    const other = rows.filter(t => t.c === 'Other');
    const agg = new Map();
    for (const t of other) { const k = t.m || t.t; const a = agg.get(k) || { n: 0, sum: 0, last: '' }; a.n++; a.sum += t.amt; if (t.d > a.last) a.last = t.d; agg.set(k, a); }
    const list = [...agg.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, 20);
    const table = clear(document.getElementById('otherTable'));
    const thead = el('thead'); const hr = el('tr'); for (const [txt, cls] of [[i18n.t('other.colMerchant'), ''], [i18n.t('other.colTotal'), 'num'], [i18n.t('other.colCategory'), '']]) hr.appendChild(el('th', cls, txt)); thead.appendChild(hr); table.appendChild(thead);
    const tb = el('tbody');
    const catOptions = ALL_CATS.filter(c => c !== 'Other');
    for (const [k, a] of list) {
      const tr = el('tr'); const td = el('td'); td.appendChild(el('span', 'm', k)); td.appendChild(el('span', 'note', i18n.tn('other.count', a.n, { last: fmtDay(a.last) }))); tr.appendChild(td);
      tr.appendChild(el('td', 'num', fmtCZK.format(a.sum)));
      const ts = el('td'); const sel = el('select', 'sel'); sel.setAttribute('aria-label', i18n.t('other.categoryFor', { merchant: k }));
      const o0 = el('option', null, i18n.t('other.choose')); o0.value = ''; sel.appendChild(o0);
      for (const c of catOptions) { const o = el('option', null, c); o.value = c; sel.appendChild(o); }
      sel.addEventListener('change', () => { if (sel.value) setOverride(k, sel.value); });
      ts.appendChild(sel); tr.appendChild(ts); tb.appendChild(tr);
    }
    if (!list.length) { const tr = el('tr'); const td = el('td', 'empty', i18n.t('other.allDone')); td.colSpan = 3; tr.appendChild(td); tb.appendChild(tr); }
    table.appendChild(tb);
    renderOverrides();
    const total = other.reduce((a, t) => a + t.amt, 0);
    const allTotal = rows.reduce((a, t) => a + t.amt, 0);
    const hint = document.querySelector('#otherTable').closest('.card').querySelector('.hint');
    hint.textContent = i18n.t('other.hint', { pct: allTotal ? Math.round(total / allTotal * 100) : 0 });
  }

  let ovrMessage = null; // survives the re-render that follows an import
  function renderOverrides() {
    const box = clear(document.getElementById('ovr'));
    const all = OVR.all();
    const keys = Object.keys(all).sort((a, b) => a.localeCompare(b));
    const nUnsaved = OVR.unsavedCount();
    const h = el('h3', null, i18n.t('ovr.title')); h.appendChild(el('span', 'badge' + (nUnsaved ? '' : ' ok'), nUnsaved ? i18n.t('ovr.notExported', { n: nUnsaved }) : i18n.t('ovr.exported'))); box.appendChild(h);
    if (!keys.length) box.appendChild(el('div', 'status', i18n.t('ovr.none')));
    const ul = el('ul');
    for (const k of keys) {
      const li = el('li'); li.appendChild(el('span', 'k', k));
      const p = el('span', 'pill'); const dot = el('span', 'dot'); dot.style.background = colorOf(all[k]); p.appendChild(dot); p.appendChild(document.createTextNode(all[k])); li.appendChild(p);
      const x = el('button', 'x', '×'); x.title = i18n.t('ovr.remove'); x.addEventListener('click', () => setOverride(k, null)); li.appendChild(x);
      ul.appendChild(li);
    }
    box.appendChild(ul);
    const act = el('div', 'actions');
    const save = el('button', 'btn', i18n.t('ovr.export')); save.disabled = !keys.length && !OVR.savedCount();
    save.addEventListener('click', saveOverridesFile); act.appendChild(save);
    const imp = el('button', 'btn', i18n.t('ovr.import'));
    const file = document.createElement('input'); file.type = 'file'; file.accept = '.json,application/json'; file.className = 'srhide'; file.setAttribute('aria-label', i18n.t('ovr.importLabel'));
    const status = el('span', 'status', ovrMessage || i18n.t('ovr.status'));
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0]; if (!f) return;
      try { const r = OVR.merge(JSON.parse(await f.text())); OVR.markSaved(); ovrMessage = r.ignored ? i18n.t('ovr.importedIgnored', { added: r.added, ignored: r.ignored }) : i18n.t('ovr.imported', { added: r.added }); applyOverridesNow(); renderAll(); }
      catch (e) { ovrMessage = i18n.t('ovr.importFailed', { error: e && e.message ? e.message : e }); renderOverrides(); }
      file.value = '';
    });
    imp.addEventListener('click', () => file.click()); act.appendChild(imp); act.appendChild(file);
    act.appendChild(status);
    box.appendChild(act);
  }
  async function saveOverridesFile() {
    const text = OVR.toJSON();
    const done = () => { OVR.markSaved(); renderOverrides(); };
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: 'overrides.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
        const w = await handle.createWritable(); await w.write(text); await w.close(); done(); return;
      } catch (e) { if (e && e.name === 'AbortError') return; /* fall through to download */ }
    }
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'overrides.json'; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); done();
  }

  function renderFooter() {
    const f = clear(document.getElementById('footer'));
    const meta = DATA.meta || {};
    f.appendChild(el('div', null, i18n.tn('footer.data', (meta.sources || []).length) + (meta.generated ? i18n.t('footer.lastImport', { at: String(meta.generated).replace('T', ' ').slice(0, 16) }) : '') + i18n.t('footer.rules', { rates: Object.entries(DATA.fx || {}).filter(([k]) => k !== 'CZK').map(([k, v]) => '1 ' + k + ' = ' + v + ' CZK').join(', ') })));
    const ul = el('ul');
    for (const s of meta.sources || []) {
      const li = el('li'); li.appendChild(document.createTextNode(i18n.t('footer.rows', { bank: s.bank, file: s.file, rows: s.rows })));
      if (s.bank === 'Airbank') { const ok = s.debits_match; const sp = el('span', ok ? 'ok' : 'warn', ok ? i18n.t('footer.debitsOk') : i18n.t('footer.debitsBad', { printed: s.statement_debits, parsed: s.parsed_debits })); li.appendChild(sp); if (s.unparsed_blocks) li.appendChild(el('span', 'warn', i18n.t('footer.unparsed', { n: s.unparsed_blocks }))); }
      ul.appendChild(li);
    }
    f.appendChild(ul);
  }

  function upsert(key, canvas, cfg) {
    if (charts[key]) { charts[key].destroy(); }
    charts[key] = new Chart(canvas.getContext('2d'), cfg);
  }


  // ---------------------------------------------------------------- orchestration
  function renderAll() {
    setDefaults();
    renderFilters();
    const rows = selected();
    const rowsNoCat = TX.filter(t => baseFilter(t) && inRange(t, state.from, state.to));
    renderKPIs(rows);
    renderMonthly(rows);
    renderDonut(rowsNoCat);
    renderWeekly(rows);
    renderTrend(rowsNoCat);
    state.shown = 150;
    renderTransactions(rows);
    renderOther(rowsNoCat);
    const sub = document.getElementById('subtitle');
    sub.textContent = fmtDay(state.from) + ' – ' + fmtDay(state.to) + ' · ' + [...state.banks].join(', ') + (state.invest ? ' · ' + i18n.t('sub.investIncluded') : '') + (state.oneoff ? ' · ' + i18n.t('sub.oneoffsHidden', { amount: fmtCZK.format(state.oneoffCap) }) : '') + ' · ' + i18n.t('sub.dataThrough', { date: fmtDay(MAX_DATE) });
  }

  // events (bound with an abort signal so mountDashboard can be called again on new data)
  const ac = new AbortController();
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: ac.signal });
  on(document.getElementById('from'), 'change', (e) => { if (e.target.value && e.target.value <= state.to) { state.from = e.target.value; state.preset = null; renderAll(); } else e.target.value = state.from; });
  on(document.getElementById('to'), 'change', (e) => { if (e.target.value && e.target.value >= state.from) { state.to = e.target.value; state.preset = null; renderAll(); } else e.target.value = state.to; });
  on(document.getElementById('invest'), 'change', (e) => { state.invest = e.target.checked; renderAll(); });
  on(document.getElementById('oneoff'), 'change', (e) => { state.oneoff = e.target.checked; renderAll(); });
  on(document.getElementById('oneoffCap'), 'change', (e) => { const v = Math.max(1000, +e.target.value || 50000); state.oneoffCap = v; if (state.oneoff) renderAll(); else e.target.value = v; });
  on(document.getElementById('monthlyTableBtn'), 'click', () => { state.monthlyTable = !state.monthlyTable; renderMonthly(selected()); });
  on(document.getElementById('trendCat'), 'change', (e) => { state.trendCat = e.target.value; renderTrend(TX.filter(t => baseFilter(t) && inRange(t, state.from, state.to))); });
  let searchTimer; on(document.getElementById('search'), 'input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.search = e.target.value; state.shown = 150; renderTransactions(selected()); }, 120); });
  on(document.getElementById('exportBtn'), 'click', () => {
    const list = renderTransactions.current || [];
    const esc = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const lines = ['date,merchant,note,category,bank,type,amount_czk,original_amount,currency'];
    for (const t of list) lines.push([t.d, esc(t.m), esc(t.n), esc(t.c), t.s, esc(t.t), t.amt, t.orig, t.cur].join(','));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'spending_' + state.from + '_' + state.to + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });
  let resizeTimer; on(window, 'resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => renderKPIs(selected()), 150); });

  renderFooter();
  renderAll();
  document.body.setAttribute('data-ready', '1');
  function destroy() {
    ac.abort(); clearTimeout(searchTimer); clearTimeout(resizeTimer);
    for (const k of Object.keys(charts)) { charts[k].destroy(); delete charts[k]; }
  }
  return { renderAll, state, destroy };
}
