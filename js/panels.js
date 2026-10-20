// Drawer panels: Parameters, Sizing, Results, Risk. Dashboards live in dashboards.js.
// Explanations live in the manual (manual.js); the panels only show inputs and numbers.
import { h, s, fmt, stackedChart, lineChart, hbars, tile } from './charts.js';
import { GROUPS, ADVANCED, MONTH_NAMES, getPath, derived, clone } from './params.js';
import { PRESET_SHAPES, SEASONS } from './load-shapes.js';
import { panelsForKwp, solveForSolarFraction, dieselOptions, firmDieselKw, sweep, rankCells, OBJECTIVES, tornado, monteCarlo } from './sizing.js';
import { MONTH_START_DAY } from './solar.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const cap = (t) => t[0].toUpperCase() + t.slice(1);

// ---------------------------------------------------------------- inputs
function info(app, path) {
  return h('button', { type: 'button', class: 'info', title: 'Explain this parameter', 'aria-label': 'Explain this parameter', onclick: (e) => { e.preventDefault(); e.stopPropagation(); app.manual.openParam(path); } }, 'i');
}

function numInput(app, f) {
  const input = h('input', { type: 'number', min: f.min, max: f.max, step: f.step, value: +Number(getPath(app.params, f.path)).toPrecision(8), inputmode: 'decimal', 'aria-label': f.label });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v) && v >= f.min && v <= f.max) { input.classList.remove('bad'); app.setParam(f.path, v); } else input.classList.add('bad');
  });
  input.addEventListener('blur', () => {
    const v = parseFloat(input.value);
    if (!Number.isFinite(v) || v < f.min || v > f.max) {
      const c = Number.isFinite(v) ? Math.min(f.max, Math.max(f.min, v)) : getPath(app.params, f.path);
      input.value = c; input.classList.remove('bad'); app.setParam(f.path, c);
    }
  });
  return input;
}

function fieldRow(app, f) {
  if (f.type === 'bool') {
    const cb = h('input', { type: 'checkbox' });
    cb.checked = !!getPath(app.params, f.path);
    cb.addEventListener('change', () => app.setParam(f.path, cb.checked));
    return h('label', { class: 'frow bool' }, cb, h('span', { class: 'fl' }, f.label, info(app, f.path)));
  }
  return h('label', { class: 'frow' }, h('span', { class: 'fl' }, f.label, info(app, f.path)),
    h('span', { class: 'fi' }, numInput(app, f), h('span', { class: 'fu' }, f.unit || '')));
}

function monthGrid(app, a) {
  const arr = getPath(app.params, a.path);
  const grid = h('div', { class: 'mgrid' });
  arr.forEach((v, i) => {
    const inp = h('input', { type: 'number', min: a.min, max: a.max, step: a.step, value: v, 'aria-label': MONTH_NAMES[i] });
    inp.addEventListener('input', () => {
      const x = parseFloat(inp.value);
      if (Number.isFinite(x) && x >= a.min && x <= a.max) { inp.classList.remove('bad'); const cur = clone(getPath(app.params, a.path)); cur[i] = x; app.setParam(a.path, cur); } else inp.classList.add('bad');
    });
    grid.append(h('label', null, h('span', null, MONTH_NAMES[i]), inp));
  });
  return h('div', { class: 'frow wide' }, h('span', { class: 'fl' }, a.label, info(app, a.path)), grid);
}

// ---------------------------------------------------------------- 24h shape editor
function shapeEditor(getShape, setShape) {
  const W = 480, H = 110, m = { l: 6, r: 6, t: 6, b: 18 };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg shape' });
  const MAXV = 0.2, bw = (W - m.l - m.r) / 24, bars = [];
  const tip = h('div', { class: 'tip', hidden: true });
  function draw() {
    const sh = getShape(), sum = sh.reduce((a, b) => a + b, 0) || 1;
    bars.forEach((b, i) => {
      const hh = (Math.min(MAXV, sh[i]) / MAXV) * (H - m.t - m.b);
      b.setAttribute('y', H - m.b - hh); b.setAttribute('height', Math.max(1, hh));
      b.dataset.pct = ((sh[i] / sum) * 100).toFixed(1);
    });
  }
  for (let i = 0; i < 24; i++) {
    const r = s('rect', { x: m.l + i * bw + 1.5, width: bw - 3, rx: 2, class: 'sbar' });
    bars.push(r); svg.append(r);
    if (i % 3 === 0) svg.append(s('text', { x: m.l + i * bw + bw / 2, y: H - 4, 'text-anchor': 'middle', class: 'tick' }, String(i).padStart(2, '0')));
  }
  svg.append(s('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis' }));
  let drag = false;
  const setFrom = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W, py = ((ev.clientY - r.top) / r.height) * H;
    const i = Math.max(0, Math.min(23, Math.floor((px - m.l) / bw)));
    const v = Math.max(0, Math.min(MAXV, ((H - m.b - py) / (H - m.t - m.b)) * MAXV));
    const sh = getShape().slice(); sh[i] = v; setShape(sh); draw();
    tip.hidden = false; tip.textContent = `${String(i).padStart(2, '0')}:00 — ${bars[i].dataset.pct}% of the day`;
  };
  svg.addEventListener('pointerdown', (e) => { drag = true; svg.setPointerCapture(e.pointerId); setFrom(e); });
  svg.addEventListener('pointermove', (e) => { if (drag) setFrom(e); });
  svg.addEventListener('pointerup', () => { drag = false; tip.hidden = true; });
  draw();
  return h('div', { class: 'chart shapewrap' }, svg, tip);
}

// ---------------------------------------------------------------- PARAMETERS
function paramsPanel(app) {
  const root = h('div', { class: 'panel' });
  const p = app.params;
  root.append(h('div', { class: 'namebar' },
    h('input', { type: 'text', class: 'name', value: p.meta.name, maxlength: 80, placeholder: 'Scenario name', 'aria-label': 'Scenario name', oninput: (e) => app.setParam('meta.name', e.target.value, true) })),
  h('details', { class: 'grp' }, h('summary', null, 'Notes'),
    h('textarea', { rows: 3, 'aria-label': 'Notes', oninput: (e) => app.setParam('meta.notes', e.target.value, true) }, p.meta.notes)));

  const readouts = {};
  for (const g of GROUPS) {
    const det = h('details', { class: 'grp', open: g.id === 'site' ? true : null }, h('summary', null, g.title));
    if (g.id === 'pv') det.append((readouts.pv = h('div', { class: 'readout' })));
    const adv = h('details', { class: 'grp flat adv' }, h('summary', null, 'Advanced'));
    const add = (path, node) => (ADVANCED.has(path) ? adv : det).append(node);
    for (const f of g.fields) add(f.path, fieldRow(app, f));
    for (const a of g.arrays || []) add(a.path, monthGrid(app, a));
    if (g.custom === 'load') det.append(loadEditor(app, readouts));
    if (adv.children.length > 1) det.append(adv);
    root.append(det);
  }
  root.refresh = () => {
    const d = derived(app.params);
    readouts.pv.textContent = `${fmt.n(d.kWp, 1)} kWp · inverter ${fmt.n(d.acKw, 0)} kW · ${fmt.n(d.areaM2)} m²`;
    if (readouts.load) {
      const ld = app.ctx.load.station;
      let e = 0; for (let i = 0; i < 8760; i++) e += ld[i];
      readouts.load.textContent = `${fmt.n(e / 1000, 0)} MWh/yr · average ${fmt.n(e / 8760, 0)} kW · peak ${fmt.n(app.totals.peakLoadKw, 0)} kW · ${fmt.n(e * (1 - app.params.load.lossesPct / 100) / 365 / app.params.load.subscribers, 1)} kWh per user per day`;
    }
  };
  return root;
}

function loadEditor(app, readouts) {
  const box = h('div', { class: 'loadbox' });
  let season = 'summer', dtype = 'weekday';
  readouts.load = h('div', { class: 'readout' });
  const weekend = h('div', { class: 'frow wide' }, h('span', { class: 'fl' }, 'Weekend days', info(app, 'load.weekendDays')),
    h('div', { class: 'chips' }, DAY_NAMES.map((n, i) => {
      const cb = h('input', { type: 'checkbox' }); cb.checked = app.params.load.weekendDays.includes(i);
      cb.addEventListener('change', () => { const cur = new Set(app.params.load.weekendDays); cb.checked ? cur.add(i) : cur.delete(i); app.setParam('load.weekendDays', [...cur].sort()); });
      return h('label', { class: 'chip' }, cb, n);
    })));
  const body = h('div');
  function build() {
    const path = `load.seasons.${season}.${dtype}`;
    const getShape = () => getPath(app.params, path + '.shape');
    const preset = h('select', { 'aria-label': 'Apply a preset shape', onchange: (e) => {
      const v = e.target.value; e.target.value = '';
      if (v === 'all') {
        const sh = getShape().slice();
        for (const sn of SEASONS) for (const dt of ['weekday', 'weekend']) app.setParam(`load.seasons.${sn}.${dt}.shape`, sh.slice(), true);
        app.recompute(); app.toast('Shape copied to every season and day type.');
      } else if (v) { app.setParam(path + '.shape', PRESET_SHAPES[v].shape.slice()); build(); }
    } }, h('option', { value: '' }, 'Preset…'), Object.entries(PRESET_SHAPES).map(([k, v]) => h('option', { value: k }, v.label)), h('option', { value: 'all' }, 'Copy this shape to all'));
    body.replaceChildren(
      h('div', { class: 'row' },
        h('div', { class: 'seg small' }, SEASONS.map((sn) => h('button', { type: 'button', class: sn === season ? 'on' : '', onclick: () => { season = sn; build(); } }, cap(sn)))),
        h('div', { class: 'seg small' }, ['weekday', 'weekend'].map((dt) => h('button', { type: 'button', class: dt === dtype ? 'on' : '', onclick: () => { dtype = dt; build(); } }, cap(dt))))),
      h('label', { class: 'frow' }, h('span', { class: 'fl' }, `kWh per user per day`),
        h('span', { class: 'fi' }, numInput(app, { path: path + '.kwh', label: 'kWh per user per day', min: 0.1, max: 500, step: 0.1 }), h('span', { class: 'fu' }, 'kWh'))),
      shapeEditor(getShape, (sh) => app.setParam(path + '.shape', sh)),
      h('div', { class: 'row end' }, preset));
  }
  build();
  box.append(h('div', { class: 'fl sub' }, 'Demand profile', info(app, 'load.seasons')), weekend, body, readouts.load);
  return box;
}

// ---------------------------------------------------------------- SIZING
function sizingPanel(app) {
  const root = h('div', { class: 'panel' });
  const p = app.params;
  const peak = app.totals.peakLoadKw;

  // ---- 1. solar
  const out = h('div');
  let mode = 'kwp', value = Math.round(derived(p).kWp);
  const unit = h('span', { class: 'fu' }, 'kWp');
  const input = h('input', { type: 'number', value, step: 'any', min: 0, 'aria-label': 'Target' });
  input.addEventListener('input', () => { value = parseFloat(input.value) || 0; compute(); });
  const modeSel = h('select', { 'aria-label': 'How to specify the solar plant', onchange: (e) => {
    mode = e.target.value;
    value = mode === 'kwp' ? Math.round(derived(app.params).kWp) : mode === 'share' ? 40 : app.params.pv.panelCount;
    input.value = value; unit.textContent = mode === 'kwp' ? 'kWp' : mode === 'share' ? '% solar' : 'panels'; compute();
  } }, h('option', { value: 'kwp' }, 'Capacity'), h('option', { value: 'share' }, 'Solar share'), h('option', { value: 'panels' }, 'Panel count'));
  function compute() {
    const q = app.params;
    let panels, warn = '';
    if (mode === 'kwp') panels = panelsForKwp(value, q.pv.panelWp);
    else if (mode === 'panels') panels = Math.max(0, Math.round(value));
    else {
      const r = solveForSolarFraction(q, Math.min(0.99, value / 100), app.ctx);
      panels = r.panels;
      if (!r.reachable) warn = `Not reachable: solar share tops out at ${fmt.pct(r.ceiling, 0)}${q.battery.enabled ? '' : ' without a battery'}.`;
    }
    const t = clone(q); t.pv.panelCount = panels;
    const d = derived(t), r2 = app.quick(t);
    out.replaceChildren(...[
      h('div', { class: 'tiles' },
        tile('Panels', fmt.n(panels), `${fmt.n(d.areaM2)} m²`), tile('Capacity', fmt.n(d.kWp, 1) + ' kWp', `inverter ${fmt.n(d.acKw, 0)} kW`),
        tile('Solar share', fmt.pct(r2.solarFraction, 1), `${fmt.pct(r2.curtailFraction, 0)} curtailed`), tile('Fuel saved', fmt.n(app.baseFuel - r2.fuelL) + ' L/yr', fmt.pct(1 - r2.fuelL / app.baseFuel, 0))),
      warn ? h('p', { class: 'note warn' }, warn) : null,
      h('div', { class: 'btnrow' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { app.setParam('pv.panelCount', panels); app.toast(`Applied ${panels} panels.`); } }, 'Apply'))].filter(Boolean));
  }
  root.append(h('section', { class: 'card' }, h('h3', null, 'Solar'), h('div', { class: 'frow' }, modeSel, h('span', { class: 'fi' }, input, unit)), out));

  // ---- 2. generators
  const gen = h('div');
  function genPanel() {
    const q = app.params, firm = firmDieselKw(q), ok = firm >= peak;
    gen.replaceChildren(
      h('p', { class: 'note ' + (ok || q.battery.enabled ? 'good' : 'warn') }, `Peak ${fmt.n(peak)} kW · installed ${fmt.n(q.diesel.units * q.diesel.ratedKw)} kW · N−1 ${fmt.n(firm)} kW — ${ok ? 'covered' : q.battery.enabled ? 'battery relaxes this' : 'not covered'}`),
      h('table', { class: 'dt wide' }, h('thead', null, h('tr', null, ['Units', 'Size', 'N−1', ''].map((t) => h('th', null, t)))),
        h('tbody', null, dieselOptions(peak).map((o) => h('tr', null, h('td', null, o.units), h('td', null, fmt.n(o.ratedKw) + ' kW'), h('td', null, fmt.n(o.firmKw) + ' kW'),
          h('td', null, h('button', { class: 'btn small', type: 'button', onclick: () => { app.setParam('diesel.units', o.units, true); app.setParam('diesel.ratedKw', o.ratedKw); app.toast(`Applied ${o.units} × ${o.ratedKw} kW.`); genPanel(); } }, 'Use')))))));
  }
  root.append(h('section', { class: 'card' }, h('h3', null, 'Generators'), gen));
  genPanel();

  // ---- 3. design sweep
  const sp = { pvMin: 0, pvMax: Math.max(100, Math.round(peak * 1.4 / 50) * 50), pvSteps: 7, batMin: 0, batMax: Math.round(peak * 4 / 100) * 100 || 1000, batSteps: 5, objective: 'lcoe', maxUnserved: 0.5, minSolar: 0, maxCapex: '' };
  const num = (key, label, unitText, step = 'any') => h('label', { class: 'frow compact' }, h('span', { class: 'fl' }, label),
    h('span', { class: 'fi' }, h('input', { type: 'number', value: sp[key], step, min: 0, oninput: (e) => { sp[key] = e.target.value === '' ? '' : parseFloat(e.target.value); } }), h('span', { class: 'fu' }, unitText || '')));
  const objSel = h('select', { 'aria-label': 'Optimise for', onchange: (e) => { sp.objective = e.target.value; if (lastSweep) showSweep(lastSweep); } }, Object.entries(OBJECTIVES).map(([k, o]) => h('option', { value: k }, o.label)));
  const prog = h('div', { class: 'progress', hidden: true }, h('div'));
  const sweepOut = h('div');
  let lastSweep = null, running = false, cancel = false;
  const runBtn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    if (running) { cancel = true; return; }
    running = true; cancel = false; runBtn.textContent = 'Cancel'; prog.hidden = false;
    const spec = { pvMin: sp.pvMin, pvMax: Math.max(sp.pvMax, sp.pvMin + 1), pvSteps: Math.max(1, Math.round(sp.pvSteps)), batMin: sp.batMin, batMax: Math.max(sp.batMax, sp.batMin), batSteps: Math.max(1, Math.round(sp.batSteps)) };
    if (spec.batMax === spec.batMin) spec.batSteps = 1;
    const res = await sweep(app.params, spec, (f) => { prog.firstChild.style.width = f * 100 + '%'; }, () => cancel);
    running = false; runBtn.textContent = 'Run'; prog.hidden = true;
    lastSweep = res; showSweep(res);
  } }, 'Run');
  root.append(h('section', { class: 'card' }, h('h3', null, 'Best design'),
    h('div', { class: 'row' }, objSel, runBtn),
    h('details', { class: 'grp flat' }, h('summary', null, 'Search range and limits'),
      h('div', { class: 'grid2' }, num('pvMin', 'Solar min', 'kWp'), num('pvMax', 'Solar max', 'kWp'), num('pvSteps', 'Solar steps', '', 1),
        num('batMin', 'Battery min', 'kWh'), num('batMax', 'Battery max', 'kWh'), num('batSteps', 'Battery steps', '', 1),
        num('maxUnserved', 'Max unserved', '%'), num('minSolar', 'Min solar share', '%'), num('maxCapex', 'Max capex', '$'))),
    prog, sweepOut));

  function showSweep(res) {
    const cons = { maxUnservedPct: sp.maxUnserved === '' ? null : sp.maxUnserved, minSolarPct: sp.minSolar || null, maxCapex: sp.maxCapex === '' ? null : sp.maxCapex };
    const ranked = rankCells(res.cells, sp.objective, cons);
    const best = ranked[0], feasible = new Set(ranked), o = OBJECTIVES[sp.objective];
    const vals = ranked.map(o.get).filter(Number.isFinite);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const nx = res.pvAxis.length, ny = res.batAxis.length;
    const W = 560, H = Math.min(300, 40 + ny * 44), m = { l: 52, r: 8, t: 6, b: 34 };
    const cw = (W - m.l - m.r) / nx, ch = (H - m.t - m.b) / ny;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg heat' });
    const fmtVal = (c) => sp.objective === 'lcoe' ? '$' + c.lcoe.toFixed(3) : sp.objective === 'solar' ? fmt.pct(c.solarFraction) : sp.objective === 'payback' ? (c.incPayback == null ? '–' : c.incPayback.toFixed(1) + 'y') : fmt.usdC(o.get(c));
    const tipEl = h('div', { class: 'tip', hidden: true });
    const detail = h('div');
    const mark = s('rect', { class: 'selmark', rx: 3, style: 'display:none', fill: 'none' });
    res.cells.forEach((c) => {
      const x = m.l + c.i * cw, y = m.t + (ny - 1 - c.j) * ch, ok = feasible.has(c);
      let t = ok && hi > lo ? (o.get(c) - lo) / (hi - lo) : 0;
      if (o.better === 'min') t = 1 - t;
      const g = s('g', { class: 'cell' + (ok ? '' : ' off'), tabindex: 0 });
      g.append(s('rect', { x: x + 1, y: y + 1, width: cw - 2, height: ch - 2, rx: 3, fill: ok ? `hsl(212 ${30 + 45 * t}% ${92 - 52 * t}%)` : 'var(--hatch)', class: 'cellrect' }));
      if (cw > 46) g.append(s('text', { x: x + cw / 2, y: y + ch / 2 + 3.5, 'text-anchor': 'middle', class: 'celltxt', fill: ok && t > 0.55 ? '#fff' : 'var(--ink)' }, ok ? fmtVal(c) : '✕'));
      const pick = () => { mark.setAttribute('x', x + 1); mark.setAttribute('y', y + 1); mark.setAttribute('width', cw - 2); mark.setAttribute('height', ch - 2); mark.style.display = ''; showDetail(c, ok); };
      g.addEventListener('click', pick); g.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
      g.addEventListener('pointermove', (e) => { const r = svg.getBoundingClientRect(); tipEl.hidden = false; tipEl.innerHTML = `<b>${fmt.n(c.kWp, 0)} kWp · ${fmt.n(c.battKwh)} kWh</b><div>LCOE<span>$${c.lcoe == null ? '–' : c.lcoe.toFixed(3)}</span></div><div>Solar share<span>${fmt.pct(c.solarFraction, 0)}</span></div><div>Unserved<span>${c.unservedPct.toFixed(2)}%</span></div>${ok ? '' : '<div class="tot">breaks a limit</div>'}`; tipEl.style.left = Math.min(r.width - 170, e.clientX - r.left + 12) + 'px'; tipEl.style.top = Math.max(0, e.clientY - r.top - 10) + 'px'; });
      g.addEventListener('pointerleave', () => { tipEl.hidden = true; });
      svg.append(g);
    });
    svg.append(mark);
    res.pvAxis.forEach((v, i) => { if (nx <= 9 || i % 2 === 0) svg.append(s('text', { x: m.l + i * cw + cw / 2, y: H - 18, 'text-anchor': 'middle', class: 'tick' }, fmt.n(v, 0))); });
    svg.append(s('text', { x: m.l + (W - m.l - m.r) / 2, y: H - 3, 'text-anchor': 'middle', class: 'tick' }, 'Solar kWp'));
    res.batAxis.forEach((v, j) => svg.append(s('text', { x: m.l - 6, y: m.t + (ny - 1 - j) * ch + ch / 2 + 3.5, 'text-anchor': 'end', class: 'tick' }, fmt.n(v, 0))));
    svg.append(s('text', { x: 4, y: m.t + 9, class: 'tick' }, 'kWh'));

    function showDetail(c, ok) {
      detail.replaceChildren(h('div', { class: 'selbox' },
        h('div', { class: 'selhead' }, `${fmt.n(c.kWp, 0)} kWp (${c.panels} panels) + ${fmt.n(c.battKwh)} kWh`),
        h('div', { class: 'tiles' }, tile('LCOE', '$' + (c.lcoe == null ? '–' : c.lcoe.toFixed(3)), 'per kWh'), tile('Solar share', fmt.pct(c.solarFraction, 0), ''), tile('NPV gain', fmt.usdC(c.incNpv), 'vs diesel-only'), tile('Payback', fmt.years(c.incPayback), ''), tile('Unserved', c.unservedPct.toFixed(2) + '%', '', c.unservedPct > 0.5 ? 'bad' : '')),
        ok ? null : h('p', { class: 'note warn' }, 'Breaks one of your limits.'),
        h('div', { class: 'btnrow' }, h('button', { class: 'btn primary', type: 'button', onclick: () => app.applyDesign(c.panels, c.battKwh) }, 'Apply'))));
    }
    const edge = best && ((best.i === nx - 1 && nx > 1) || (best.j === ny - 1 && ny > 1));
    sweepOut.replaceChildren(
      best ? h('p', { class: 'note good' }, `Best: ${fmt.n(best.kWp, 0)} kWp + ${fmt.n(best.battKwh)} kWh — $${best.lcoe.toFixed(3)}/kWh, ${fmt.pct(best.solarFraction, 0)} solar, payback ${fmt.years(best.incPayback)}`) : h('p', { class: 'note warn' }, 'Nothing meets the limits. Relax them or widen the range.'),
      edge ? h('p', { class: 'note warn' }, 'The best cell is on the edge of the range; widen it and run again.') : null,
      h('div', { class: 'chart' }, svg, tipEl), detail);
    if (best) showDetail(best, true);
  }
  compute();
  root.refresh = () => genPanel();
  return root;
}

// ---------------------------------------------------------------- RESULTS
function csvDownload(app, name, rows) {
  const text = rows.map((r) => r.map((v) => (typeof v === 'number' ? (Number.isInteger(v) ? v : +v.toFixed(4)) : `"${String(v).replace(/"/g, '""')}"`)).join(',')).join('\n');
  app.download(name, text, 'text/csv');
}

function resultsPanel(app) {
  const root = h('div', { class: 'panel' });
  const c = app.cmp, hy = c.hy, base = c.base, p = app.params, T = app.totals, y1 = hy.rows[0], b1 = base.rows[0], S = app.series;
  const d = derived(p);
  const co2 = (b1.fuelL - y1.fuelL) * 2.68 / 1000;

  root.append(h('div', { class: 'tiles' },
    tile('Solar share', fmt.pct(y1.solarFraction, 0), 'year 1'),
    tile('Fuel saved', fmt.n(c.fuelSavedL1) + ' L/yr', `${fmt.pct(b1.fuelL > 0 ? c.fuelSavedL1 / b1.fuelL : 0)} · ${fmt.n(co2, 0)} t CO₂`),
    tile('Cost per kWh', '$' + (hy.lcoe == null ? '–' : hy.lcoe.toFixed(3)), `diesel-only $${base.lcoe == null ? '–' : base.lcoe.toFixed(3)}`),
    tile('Capex', fmt.usdC(hy.capex.total), base.capex.total > 0 ? `diesel-only ${fmt.usdC(base.capex.total)}` : 'generators already owned'),
    tile('NPV gain', fmt.usdC(c.incNpv), 'vs diesel-only', c.incNpv < 0 ? 'bad' : 'good'),
    tile('Payback', fmt.years(c.incPayback), 'extra capex')));
  if (T.unservedFraction > 0.005) root.append(h('p', { class: 'note warn' }, `Unserved energy ${fmt.pct(T.unservedFraction, 1)} (${fmt.n(T.lolHours)} h/yr). Add generator or battery capacity.`));

  const month = (arr) => MONTH_NAMES.map((_, m) => { let t = 0; for (let i = MONTH_START_DAY[m] * 24; i < MONTH_START_DAY[m + 1] * 24; i++) t += arr[i]; return t; });
  root.append(stackedChart({
    title: 'Energy by source (kWh per month)', x: MONTH_NAMES, tickEvery: 1, unit: 'kWh', mode: 'bar', digits: 0,
    series: [{ name: 'Solar', color: 'var(--c-solar)', values: month(S.solarToLoad) }, { name: 'Diesel', color: 'var(--c-diesel)', values: month(S.dieselToLoad) }, ...(T.unservedKwh > 0 ? [{ name: 'Unserved', color: 'var(--c-bad)', values: month(S.unserved) }] : [])],
  }).el);

  const N = hy.rows.length;
  const cum = (flows) => { let a = 0; return flows.map((f) => (a += f)); };
  root.append(lineChart({
    title: 'Cumulative cash flow', xName: 'Year', x: Array.from({ length: N + 1 }, (_, i) => String(i)), tickEvery: Math.max(1, Math.round(N / 8)), prefix: '$',
    series: [{ name: 'This design', color: 'var(--series-1)', values: cum(hy.flows) }, { name: 'Diesel only', color: 'var(--series-2)', values: cum(base.flows), dash: '5 4' }],
  }).el);

  // details (collapsed)
  const row = (k, v, sub) => h('tr', null, h('th', null, k), h('td', null, v), h('td', { class: 'sub' }, sub || ''));
  root.append(h('details', { class: 'grp' }, h('summary', null, 'Energy balance (year 1)'),
    h('table', { class: 'dt wide' }, h('tbody', null,
      row('Demand at the station', fmt.n(T.loadKwh) + ' kWh', `peak ${fmt.n(T.peakLoadKw)} kW`),
      row('From solar', fmt.n(T.solarToLoadKwh) + ' kWh', fmt.pct(T.solarFraction, 1)),
      row('From diesel', fmt.n(T.dieselToLoadKwh) + ' kWh', `${fmt.n(T.fuelL)} L`),
      row('Solar curtailed', fmt.n(T.pvCurtKwh) + ' kWh', fmt.pct(T.curtailFraction, 1)),
      row('Inverter clipping', fmt.n(T.clippedKwh) + ' kWh', ''),
      d.batt ? row('Battery cycles', fmt.n(T.cycles, 0), `losses ${fmt.n(T.battLossKwh)} kWh`) : null,
      row('Generator hours', fmt.n(T.genHours) + ' h', `${fmt.n(T.lowLoadHours)} at low load`),
      row('Unserved', fmt.n(T.unservedKwh, 0) + ' kWh', '')))));

  const cx = hy.capex.items;
  const labels = { panels: 'Panels', pvInstall: 'Mounting & install', pvInverter: 'PV inverter', battery: 'Battery', battInverter: 'Battery inverter', diesel: 'Generators', network: 'Network', subscribers: 'Per-subscriber', other: 'Other' };
  const ox = y1.opex;
  root.append(h('details', { class: 'grp' }, h('summary', null, 'Costs'),
    h('div', { class: 'sub-h' }, `Capex ${fmt.usd(hy.capex.total)}`), hbars(Object.entries(cx).filter(([, v]) => v > 0).map(([k, v]) => ({ label: labels[k], value: v, color: 'var(--series-1)' })), { format: fmt.usd }),
    h('div', { class: 'sub-h' }, `Year-1 operating cost ${fmt.usd(y1.opexTotal)}`), hbars([['Fuel', ox.fuel], ['Generator O&M', ox.dieselOm], ['Solar O&M', ox.solarOm], ['Battery O&M', ox.battOm], ['Fixed', ox.fixed], ['Insurance', ox.insurance]].filter(([, v]) => v > 0).map(([label, value]) => ({ label, value, color: 'var(--series-2)' })), { format: fmt.usd }),
    h('p', { class: 'note' }, `Revenue ${fmt.usd(y1.revenue)} · operating profit ${fmt.usd(y1.revenue - y1.opexTotal)} (diesel-only ${fmt.usd(b1.revenue - b1.opexTotal)})`)));

  root.append(h('details', { class: 'grp' }, h('summary', null, 'Project finance'),
    h('table', { class: 'dt wide' }, h('tbody', null,
      row('Project NPV', fmt.usd(hy.npv), `${p.finance.projectYears} years at ${p.finance.discountRatePct}%`),
      row('Project IRR', hy.irr == null ? 'n/a' : fmt.pct(hy.irr, 1), ''),
      row('Project payback', fmt.years(hy.payback), ''),
      row('Diesel-only NPV', fmt.usd(base.npv), '')))));

  root.append(h('details', { class: 'grp' }, h('summary', null, 'Year by year'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'dt wide' }, h('thead', null, h('tr', null, ['Year', 'Solar', 'Fuel L', 'Revenue', 'Opex', 'Cash'].map((t) => h('th', null, t)))),
      h('tbody', null, hy.rows.map((r) => h('tr', null, h('td', null, r.year), h('td', null, fmt.pct(r.solarFraction)), h('td', null, fmt.n(r.fuelL)), h('td', null, fmt.usdC(r.revenue)), h('td', null, fmt.usdC(r.opexTotal + r.replTotal)), h('td', null, fmt.usdC(r.cash))))))),
    h('div', { class: 'links' },
      h('button', { class: 'link', type: 'button', onclick: () => csvDownload(app, 'yearly.csv', [['year', 'solar_fraction', 'fuel_L', 'sold_kWh', 'unserved_kWh', 'revenue', 'opex', 'replacements', 'tax', 'cash', 'base_cash'], ...hy.rows.map((r, i) => [r.year, r.solarFraction, r.fuelL, r.soldKwh, r.unservedKwh, r.revenue, r.opexTotal, r.replTotal, r.tax, r.cash, base.rows[i].cash])]) }, 'Download yearly CSV'),
      h('button', { class: 'link', type: 'button', onclick: () => csvDownload(app, 'hourly-year1.csv', [['hour', 'day', 'hour_of_day', 'load_kW', 'pv_avail_kW', 'pv_used_kW', 'pv_curtailed_kW', 'solar_to_load_kW', 'diesel_to_load_kW', 'diesel_out_kW', 'fuel_L', 'units_on', 'batt_charge_kW', 'batt_discharge_kW', 'soc_pct', 'unserved_kW'], ...Array.from({ length: 8760 }, (_, i) => [i, Math.floor(i / 24) + 1, i % 24, S.load[i], S.pvAvail[i], S.pvUsed[i], S.pvCurt[i], S.solarToLoad[i], S.dieselToLoad[i], S.dieselOut[i], S.fuel[i], S.units[i], S.battChg[i], S.battDis[i], S.soc[i], S.unserved[i]])]) }, 'Download hourly CSV'))));
  return root;
}

// ---------------------------------------------------------------- RISK
function riskPanel(app) {
  const root = h('div', { class: 'panel' });
  const torOut = h('div'), mcOut = h('div');
  const torProg = h('div', { class: 'progress', hidden: true }, h('div'));
  const mcProg = h('div', { class: 'progress', hidden: true }, h('div'));
  let metric = 'incNpv', torData = null, busy = false;

  function drawTornado() {
    if (!torData) return;
    let items = torData.items.map((it) => ({ label: it.label, lo: it.low[metric], hi: it.high[metric] })).filter((it) => Number.isFinite(it.lo) && Number.isFinite(it.hi));
    const base = torData.base[metric];
    items.forEach((it) => { it.swing = Math.abs(it.hi - it.lo); });
    items.sort((a, b) => b.swing - a.swing);
    const maxSwing = items.length ? items[0].swing : 0;
    items = items.filter((it) => it.swing > maxSwing * 0.005);
    const W = 600, rowH = 26, m = { l: 150, r: 14, t: 14, b: 22 }, H = m.t + items.length * rowH + m.b;
    const ext = Math.max(...items.flatMap((it) => [Math.abs(it.lo - base), Math.abs(it.hi - base)]), 1e-9);
    const half = (W - m.l - m.r) / 2 - 46;
    const X = (v) => m.l + (W - m.l - m.r) / 2 + ((v - base) / ext) * half;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg' });
    const fv = (v) => (metric === 'lcoe' ? '$' + v.toFixed(3) : fmt.usdC(v));
    const better = (v) => (metric === 'lcoe' ? v < base : v > base);
    items.forEach((it, i) => {
      const y = m.t + i * rowH, a = X(it.lo), b = X(it.hi);
      svg.append(s('text', { x: m.l - 8, y: y + 15, 'text-anchor': 'end', class: 'tick lab' }, it.label));
      svg.append(s('rect', { x: Math.min(a, X(base)), y: y + 4, width: Math.abs(a - X(base)), height: 16, rx: 3, fill: better(it.lo) ? 'var(--c-good)' : 'var(--c-bad)' }));
      svg.append(s('rect', { x: Math.min(b, X(base)), y: y + 4, width: Math.abs(b - X(base)), height: 16, rx: 3, fill: better(it.hi) ? 'var(--c-good)' : 'var(--c-bad)', opacity: 0.55 }));
      svg.append(s('text', { x: Math.max(a, b) + 5, y: y + 16, class: 'tick' }, fv(Math.max(it.lo, it.hi))));
      svg.append(s('text', { x: Math.min(a, b) - 5, y: y + 16, 'text-anchor': 'end', class: 'tick' }, fv(Math.min(it.lo, it.hi))));
    });
    svg.append(s('line', { x1: X(base), x2: X(base), y1: m.t - 4, y2: H - m.b, class: 'axis' }));
    svg.append(s('text', { x: X(base), y: H - 6, 'text-anchor': 'middle', class: 'tick' }, 'base ' + fv(base)));
    torOut.replaceChildren(
      h('div', { class: 'seg small' }, [['incNpv', 'NPV gain'], ['lcoe', 'Cost per kWh'], ['npv', 'Project NPV']].map(([k, l]) => h('button', { type: 'button', class: k === metric ? 'on' : '', onclick: () => { metric = k; drawTornado(); } }, l))),
      h('div', { class: 'chart' }, svg),
      h('p', { class: 'note' }, 'Solid bar: input 20% lower. Faded: 20% higher. Green is better than the base case.'));
  }
  const torBtn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    if (busy) return; busy = true; torProg.hidden = false; torBtn.disabled = true;
    torData = await tornado(app.params, 0.2, (f) => { torProg.firstChild.style.width = f * 100 + '%'; });
    busy = false; torProg.hidden = true; torBtn.disabled = false; drawTornado();
  } }, 'Run');

  const nIn = h('input', { type: 'number', value: 60, min: 10, max: 400, step: 10, 'aria-label': 'Number of runs' });
  const mcBtn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    if (busy) return; busy = true; mcProg.hidden = false; mcBtn.disabled = true;
    const r = await monteCarlo(app.params, Math.max(10, Math.min(400, parseInt(nIn.value) || 60)), (f) => { mcProg.firstChild.style.width = f * 100 + '%'; });
    busy = false; mcProg.hidden = true; mcBtn.disabled = false;
    const bins = 14, vals = r.runs.map((x) => x.incNpv), lo = Math.min(...vals), hi = Math.max(...vals), w = (hi - lo) / bins || 1;
    const cnt = new Array(bins).fill(0);
    vals.forEach((v) => { cnt[Math.min(bins - 1, Math.floor((v - lo) / w))]++; });
    const rowS = (name, st, f, lowerIsBetter) => h('tr', null, h('th', null, name), h('td', null, f(lowerIsBetter ? st.p90 : st.p10)), h('td', null, f(st.p50)), h('td', null, f(lowerIsBetter ? st.p10 : st.p90)));
    mcOut.replaceChildren(
      h('table', { class: 'dt wide' }, h('thead', null, h('tr', null, ['', 'Pessimistic', 'Median', 'Optimistic'].map((t) => h('th', null, t)))),
        h('tbody', null, rowS('NPV gain', r.incNpv, fmt.usdC), rowS('Cost per kWh', r.lcoe, (v) => '$' + v.toFixed(3), true), rowS('Solar share', r.solarFraction, (v) => fmt.pct(v, 0)), rowS('Fuel (L/yr)', r.fuelL, fmt.n, true))),
      stackedChart({ title: 'NPV gain across runs', x: cnt.map((_, i) => fmt.usdC(lo + w * (i + 0.5))), tickEvery: 2, unit: 'runs', mode: 'bar', height: 140, digits: 0, series: [{ name: 'Runs', color: 'var(--series-1)', values: cnt }] }).el,
      h('p', { class: 'note' }, `${r.n} runs. Pessimistic = P10, optimistic = P90.`));
  } }, 'Run');

  root.append(
    h('section', { class: 'card' }, h('h3', null, 'Sensitivity'), h('div', { class: 'row' }, h('span', { class: 'fu' }, 'Which inputs move the answer most'), torBtn), torProg, torOut),
    h('section', { class: 'card' }, h('h3', null, 'Uncertainty'), h('div', { class: 'row' }, h('span', { class: 'fi' }, nIn, h('span', { class: 'fu' }, 'runs')), mcBtn), mcProg, mcOut));
  return root;
}

export const TABS = [
  { id: 'params', label: 'Parameters', build: paramsPanel },
  { id: 'sizing', label: 'Sizing', build: sizingPanel },
  { id: 'results', label: 'Results', build: resultsPanel },
  { id: 'risk', label: 'Risk', build: riskPanel },
];
