// Small dependency-free SVG chart kit + DOM/format helpers.
// Colours come from CSS custom properties (see style.css) so light/dark themes both work.

const SVGNS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
export function s(tag, attrs, ...children) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  for (const c of children.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

// ---- number formatting -------------------------------------------------------------
export const fmt = {
  n(v, d = 0) { return v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  compact(v, d = 1) {
    if (v == null || !Number.isFinite(v)) return '–';
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(d) + 'M';
    if (a >= 1e4) return (v / 1e3).toFixed(0) + 'k';
    if (a >= 1e3) return (v / 1e3).toFixed(d) + 'k';
    return v.toFixed(a >= 100 ? 0 : d);
  },
  usd(v, d = 0) { return v == null || !Number.isFinite(v) ? '–' : (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  usdC(v) { return v == null || !Number.isFinite(v) ? '–' : (v < 0 ? '−$' : '$') + fmt.compact(Math.abs(v)); },
  pct(v, d = 0) { return v == null || !Number.isFinite(v) ? '–' : (v * 100).toFixed(d) + '%'; },
  years(v) { return v == null ? 'never' : v.toFixed(1) + ' y'; },
};

// ---- helpers --------------------------------------------------------------------------
function niceMax(v) {
  if (!(v > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / e;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return m * e;
}

function legend(series, extra) {
  const items = series.map((se) => h('span', { class: 'lg' }, h('i', { style: { background: se.color }, class: se.kind === 'line' ? 'ln' : '' }), se.name));
  if (extra) for (const se of extra) items.push(h('span', { class: 'lg' }, h('i', { class: 'ln', style: { background: se.color } }), se.name));
  return h('div', { class: 'legend' }, items);
}

function tableOf(xLabels, series, unit, d = 1) {
  const t = h('table', { class: 'dt' },
    h('thead', null, h('tr', null, h('th', null, ''), series.map((se) => h('th', null, se.name + (unit ? ` (${unit})` : ''))))),
    h('tbody', null, xLabels.map((xl, i) => h('tr', null, h('th', null, xl), series.map((se) => h('td', null, fmt.n(se.values[i], d)))))));
  return h('div', { class: 'tablewrap', hidden: true }, t);
}

// ---- stacked area / bar chart with a crosshair tooltip ---------------------------------
// opts: title, subtitle, x: labels[], tickEvery, series:[{name,color,values}] (stacked bottom->top),
//       lines:[{name,color,values,dash}] (overlaid, not stacked), unit, mode:'area'|'bar', height, digits
export function stackedChart(opts) {
  const W = 600, H = opts.height || 190, m = { l: 44, r: 8, t: 8, b: 22 };
  const n = opts.x.length, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const stack = [];
  const totals = new Array(n).fill(0);
  for (const se of opts.series) {
    const lo = totals.slice();
    for (let i = 0; i < n; i++) totals[i] += Math.max(0, se.values[i] || 0);
    stack.push({ se, lo, hi: totals.slice() });
  }
  let ymax = Math.max(...totals, ...(opts.lines || []).flatMap((l) => l.values), 1e-9);
  ymax = opts.yMax || niceMax(ymax * 1.05);
  const X = (i) => (opts.mode === 'bar' ? m.l + (iw * (i + 0.5)) / n : m.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1)));
  const Y = (v) => m.t + ih - (v / ymax) * ih;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': opts.title || 'chart' });
  // grid + y labels
  for (let k = 0; k <= 4; k++) {
    const v = (ymax * k) / 4, y = Y(v);
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: k === 0 ? 'axis' : 'grid' }));
    svg.append(s('text', { x: m.l - 6, y: y + 3.5, 'text-anchor': 'end', class: 'tick' }, fmt.compact(v, ymax < 10 ? 1 : 0)));
  }
  const every = opts.tickEvery || Math.max(1, Math.ceil(n / 8));
  for (let i = 0; i < n; i += every) svg.append(s('text', { x: X(i), y: H - 6, 'text-anchor': 'middle', class: 'tick' }, opts.x[i]));
  // marks
  const bw = opts.mode === 'bar' ? Math.max(2, (iw / n) * 0.72) : 0;
  for (const { se, lo, hi } of stack) {
    if (opts.mode === 'bar') {
      for (let i = 0; i < n; i++) {
        const y1 = Y(hi[i]), y0 = Y(lo[i]);
        if (y0 - y1 < 0.2) continue;
        svg.append(s('rect', { x: X(i) - bw / 2, y: y1, width: bw, height: Math.max(0, y0 - y1 - 1), fill: se.color, rx: 1.5 }));
      }
    } else {
      let d = '';
      for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(hi[i]).toFixed(1);
      for (let i = n - 1; i >= 0; i--) d += 'L' + X(i).toFixed(1) + ' ' + Y(lo[i]).toFixed(1);
      svg.append(s('path', { d: d + 'Z', fill: se.color, class: 'area' }));
    }
  }
  for (const l of opts.lines || []) {
    let d = '';
    for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(l.values[i]).toFixed(1);
    svg.append(s('path', { d, fill: 'none', stroke: l.color, 'stroke-width': 2, 'stroke-dasharray': l.dash || null, 'stroke-linejoin': 'round' }));
  }
  const marker = s('line', { class: 'marker', y1: m.t, y2: m.t + ih, x1: 0, x2: 0, style: 'display:none' });
  const cross = s('line', { class: 'cross', y1: m.t, y2: m.t + ih, x1: 0, x2: 0, style: 'display:none' });
  const future = s('rect', { class: 'future', x: 0, y: m.t, width: 0, height: ih, style: 'display:none' });
  svg.append(future, marker, cross);
  const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent', class: 'hit' });
  svg.append(hit);

  const tip = h('div', { class: 'tip', hidden: true });
  const wrap = h('div', { class: 'chart' }, svg, tip);
  const d = opts.digits == null ? (ymax < 10 ? 2 : 1) : opts.digits;
  const all = [...opts.series, ...(opts.lines || [])];
  hit.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    let i = opts.mode === 'bar' ? Math.floor(((px - m.l) / iw) * n) : Math.round(((px - m.l) / iw) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.style.display = '';
    tip.hidden = false;
    tip.innerHTML = `<b>${opts.x[i]}</b>` + all.slice().reverse().map((se) => `<div><i style="background:${se.color}"></i>${se.name}<span>${fmt.n(se.values[i], d)} ${opts.unit || ''}</span></div>`).join('')
      + (opts.series.length > 1 ? `<div class="tot">Total<span>${fmt.n(totals[i], d)} ${opts.unit || ''}</span></div>` : '');
    const px2 = (X(i) / W) * r.width;
    tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, px2 + 10)) + 'px';
    tip.style.top = '6px';
  });
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.style.display = 'none'; });

  const head = h('div', { class: 'chart-head' }, h('div', { class: 'chart-title' }, opts.title || ''));
  const root = h('figure', { class: 'fig' }, opts.title ? head : null, wrap, legend(opts.series, opts.lines));
  return {
    el: root,
    // i is the position in bucket units (fractional); everything to its right is faded as "not yet"
    setMarker(i) {
      if (i == null) { marker.style.display = 'none'; future.style.display = 'none'; return; }
      const c = Math.min(Math.max(i, 0), opts.mode === 'bar' ? n : n - 1);
      const x = opts.mode === 'bar' ? m.l + (iw * c) / n : m.l + (n === 1 ? iw / 2 : (iw * c) / (n - 1));
      marker.style.display = ''; marker.setAttribute('x1', x); marker.setAttribute('x2', x);
      future.style.display = ''; future.setAttribute('x', x); future.setAttribute('width', Math.max(0, m.l + iw - x));
    },
  };
}

// ---- multi-line chart (for cash flow etc.) -------------------------------------------
export function lineChart(opts) {
  const W = 600, H = opts.height || 190, m = { l: 52, r: 10, t: 8, b: 22 };
  const n = opts.x.length, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const vals = opts.series.flatMap((se) => se.values).filter(Number.isFinite);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.06; lo -= lo < 0 ? pad : 0; hi += pad;
  const X = (i) => m.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
  const Y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': opts.title || 'chart' });
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4, y = Y(v);
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: 'grid' }));
    svg.append(s('text', { x: m.l - 6, y: y + 3.5, 'text-anchor': 'end', class: 'tick' }, (opts.prefix || '') + fmt.compact(v, 1)));
  }
  svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), class: 'axis' }));
  const every = opts.tickEvery || Math.max(1, Math.ceil(n / 8));
  for (let i = 0; i < n; i += every) svg.append(s('text', { x: X(i), y: H - 6, 'text-anchor': 'middle', class: 'tick' }, opts.x[i]));
  for (const se of opts.series) {
    let d = '';
    se.values.forEach((v, i) => { d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); });
    svg.append(s('path', { d, fill: 'none', stroke: se.color, 'stroke-width': 2, 'stroke-dasharray': se.dash || null, 'stroke-linejoin': 'round' }));
  }
  const cross = s('line', { class: 'cross', y1: m.t, y2: m.t + ih, x1: 0, x2: 0, style: 'display:none' });
  const dots = opts.series.map((se) => s('circle', { r: 4, fill: se.color, class: 'dot', cx: 0, cy: 0, style: 'display:none' }));
  svg.append(cross, ...dots);
  const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
  svg.append(hit);
  const tip = h('div', { class: 'tip', hidden: true });
  const wrap = h('div', { class: 'chart' }, svg, tip);
  hit.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    let i = Math.round((((ev.clientX - r.left) / r.width) * W - m.l) / iw * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.style.display = '';
    dots.forEach((dd, k) => { dd.setAttribute('cx', X(i)); dd.setAttribute('cy', Y(opts.series[k].values[i])); dd.style.display = ''; });
    tip.hidden = false;
    tip.innerHTML = `<b>${opts.xName || ''} ${opts.x[i]}</b>` + opts.series.map((se) => `<div><i style="background:${se.color}"></i>${se.name}<span>${(opts.prefix === '$' ? fmt.usd(se.values[i]) : fmt.n(se.values[i], 1))}</span></div>`).join('');
    tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, (X(i) / W) * r.width + 10)) + 'px';
    tip.style.top = '6px';
  });
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.style.display = 'none'; dots.forEach((dd) => { dd.style.display = 'none'; }); });
  const head = h('div', { class: 'chart-head' }, h('div', { class: 'chart-title' }, opts.title || ''));
  return { el: h('figure', { class: 'fig' }, opts.title ? head : null, wrap, legend(opts.series)) };
}

// ---- horizontal bars (cost breakdown, ranges) ---------------------------------------------
export function hbars(rows, opts = {}) {
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  return h('div', { class: 'hbars' }, rows.map((r) => h('div', { class: 'hb' },
    h('span', { class: 'hb-l' }, r.label),
    h('span', { class: 'hb-t' }, h('span', { class: 'hb-f', style: { width: Math.max(0.5, (r.value / max) * 100) + '%', background: r.color || 'var(--series-1)' } })),
    h('span', { class: 'hb-v' }, opts.format ? opts.format(r.value) : fmt.n(r.value)))));
}

// ---- KPI tile --------------------------------------------------------------------------
export function tile(label, value, sub, tone) {
  const v = h('div', { class: 'tile-v' }, value);
  const sEl = h('div', { class: 'tile-s' }, sub || '');
  const root = h('div', { class: 'tile' + (tone ? ' ' + tone : '') }, h('div', { class: 'tile-l' }, label), v, sEl);
  root.set = (val, subtext) => { v.textContent = val; if (subtext !== undefined) sEl.textContent = subtext; };
  root.setTone = (t) => { root.classList.remove('bad', 'good'); if (t) root.classList.add(t); };
  return root;
}
