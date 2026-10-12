// One shared tooltip element for every chart, built with textContent only.
import { el, clear } from './dom.js';

export function showTip(chart, tooltipModel, build) {
  const tip = document.getElementById('tip');
  if (!tooltipModel || tooltipModel.opacity === 0) { tip.style.opacity = 0; tip.setAttribute('aria-hidden', 'true'); return; }
  clear(tip);
  build(tip);
  const rect = chart.canvas.getBoundingClientRect();
  const x = rect.left + tooltipModel.caretX, y = rect.top + tooltipModel.caretY;
  tip.style.opacity = 1; tip.setAttribute('aria-hidden', 'false');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let left = x + 14, top = y - h / 2;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
  tip.style.left = left + 'px'; tip.style.top = top + 'px';
}

export function tipRow(parent, color, name, value, pct) {
  const r = el('div', 'row');
  const k = el('span', 'k'); k.style.background = color; r.appendChild(k);
  r.appendChild(el('span', 'n', name));
  r.appendChild(el('span', 'v', value));
  r.appendChild(el('span', 'p', pct == null ? '' : pct));
  parent.appendChild(r);
}
