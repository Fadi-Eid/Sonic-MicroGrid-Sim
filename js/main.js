// App shell: state, recompute, playback, UI wiring.
import { defaultParams, sanitize, toJSON, fromJSON, setPath, clone, getPath, MONTH_NAMES } from './params.js';
import { getContext, simulateYear } from './engine.js';
import { compare } from './economics.js';
import { solarPosition, MONTH_START_DAY, monthOfDay } from './solar.js';
import { createScene } from './scene.js';
import { createDashboards, computeUserSeries, computeCumulative, DASH_TITLES } from './dashboards.js';
import { TABS } from './panels.js';
import { h, fmt } from './charts.js';
import { createManual } from './manual.js';
import { REFERENCE_YEAR } from './load.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'microgrid.scenario.v1';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- app state
const app = {
  params: null, ctx: null, cmp: null, series: null, totals: null, user: null, baseFuel: 0,
  T: 287 * 24 + 10, playing: true, speed: 2, version: 0,
  live: null, scene: null, listeners: new Set(),
  toast(msg, kind) {
    const t = h('div', { class: 'toast ' + (kind || '') }, msg);
    $('toast').append(t); setTimeout(() => t.remove(), kind === 'bad' ? 6000 : 3200);
  },
  setParam(path, value, silent) {
    setPath(app.params, path, value);
    if (!silent) app.scheduleRecompute();
  },
  replaceParams(p) { app.params = p; panelCache.clear(); app.recompute(); showTab(currentTab || 'params', true); },
  quick(p) { return simulateYear(p, getContext(p), { yearIdx: 0 }).totals; },
  applyDesign(panels, battKwh) {
    app.params.pv.panelCount = panels;
    app.params.battery.enabled = battKwh > 0;
    if (battKwh > 0) app.params.battery.capacityKwh = battKwh;
    app.recompute();
    app.toast(`Applied: ${panels} panels (${fmt.n((panels * app.params.pv.panelWp) / 1000, 0)} kWp)` + (battKwh > 0 ? ` + ${fmt.n(battKwh)} kWh battery.` : ', no battery.'));
  },
  download(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },
  saveFile() {
    const nm = (app.params.meta.name || 'scenario').replace(/[^\w\-]+/g, '-').toLowerCase();
    app.download(`${nm}.microgrid.json`, toJSON(app.params), 'application/json');
    app.toast('Scenario saved.');
  },
  openFile() { $('fileIn').click(); },
  recompute() { clearTimeout(rcTimer); doRecompute(); },
  scheduleRecompute() { $('busy').hidden = false; clearTimeout(rcTimer); rcTimer = setTimeout(doRecompute, 220); },
};
let rcTimer = 0, currentTab = null;
const panelCache = new Map();

function doRecompute() {
  try {
    const p = app.params;
    app.ctx = getContext(p);
    app.cmp = compare(p, app.ctx, { recordFirst: true });
    app.series = app.cmp.hy.first.series;
    app.totals = app.cmp.hy.first.totals;
    app.baseFuel = app.cmp.base.rows[0].fuelL;
    app.user = computeUserSeries(app);
    app.cum = computeCumulative(app);
    app.version++;
    app.scene && app.scene.update(computeLive(), p);
    $('scenTitle').textContent = p.meta.name;
    document.title = (p.meta.name ? p.meta.name + ' · ' : '') + 'Microgrid Sizer';
    // refresh open panels
    if (currentTab) {
      const cached = panelCache.get(currentTab);
      if (currentTab === 'results') showTab('results', true);
      else if (cached && cached.refresh) cached.refresh();
    }
    autosave();
  } catch (e) {
    console.error(e);
    app.toast('Calculation failed: ' + e.message, 'bad');
  }
  $('busy').hidden = true;
}

let saveTimer = 0;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(app.params)); } catch (e) { /* storage may be unavailable or full */ } }, 600);
}

// ---------------------------------------------------------------- live state at time T
function sample(arr, T) {
  const x = T - 0.5, i0 = Math.floor(x), f = x - i0, n = arr.length;
  const a = arr[clamp(i0, 0, n - 1)], b = arr[clamp(i0 + 1, 0, n - 1)];
  return a + (b - a) * f;
}
function computeLive() {
  const p = app.params, S = app.series, T = app.T, ctx = app.ctx;
  const hr = clamp(Math.floor(T), 0, 8759), day = Math.floor(T / 24), hod = T - day * 24;
  const sun = solarPosition(p.site.lat, p.site.lon, p.site.tzOffset, day + 1, hod);
  const cloud = sample(ctx.solar.cloud, T);
  const coverage = clamp((1 - cloud) / 0.8, 0, 1), rain = clamp((0.3 - cloud) / 0.15, 0, 1);
  const load = sample(S.load, T), unserved = sample(S.unserved, T);
  const houseKw = sample(ctx.load.perUser, T) * p.load.featuredUserScale;
  const speedFactor = app.playing ? Math.min(1, 3 / Math.max(app.speed, 0.1)) : 1;
  return {
    T, day, hod, sun, cloud, weather: { coverage, rain },
    poa: sample(ctx.solar.poa, T), tcell: sample(ctx.solar.tcell, T), tamb: sample(ctx.solar.tamb, T),
    load, served: load - unserved, unserved, peakLoad: app.totals.peakLoadKw,
    pvAvail: sample(S.pvAvail, T), pvUsed: sample(S.pvUsed, T), pvCurt: sample(S.pvCurt, T),
    solarToLoad: sample(S.solarToLoad, T), dieselToLoad: sample(S.dieselToLoad, T),
    dieselOut: sample(S.dieselOut, T), fuel: sample(S.fuel, T), battChg: sample(S.battChg, T), battDis: sample(S.battDis, T), soc: sample(S.soc, T),
    unitsOn: S.units[hr], unitsTotal: p.diesel.units, dieselCap: p.diesel.units * p.diesel.ratedKw,
    subscribers: p.load.subscribers, houseKw, housePeakKw: app.user.peak, speedFactor, wind: 1,
  };
}

// ---------------------------------------------------------------- drawer & tabs
let dash;
function setDrawerTitle(t) { $('drawerTitle').textContent = t; }
function openDrawer() { $('drawer').hidden = false; }
function closeDrawer() {
  $('drawer').hidden = true; currentTab = null; dash.close(); app.scene.setSelected(null);
  document.querySelectorAll('.tabbtn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
}
function showTab(id, force) {
  if (!force && currentTab === id) { closeDrawer(); return; }
  currentTab = id; dash.close(); app.scene.setSelected(null);
  document.querySelectorAll('.tabbtn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === id)));
  const tab = TABS.find((t) => t.id === id);
  let el = panelCache.get(id);
  const keep = id === 'sizing' || id === 'risk';
  const body = $('drawerBody');
  const scroll = body.scrollTop;
  if (!el || !keep) { el = tab.build(app); if (keep) panelCache.set(id, el); }
  body.replaceChildren(el);
  if (el.refresh) el.refresh();
  setDrawerTitle(tab.label);
  openDrawer();
  if (force) body.scrollTop = scroll;
}
function showDash(kind) {
  currentTab = null;
  document.querySelectorAll('.tabbtn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  if (kind === 'battery' && !app.params.battery.enabled) { app.toast('No battery in this scenario. Enable it under Parameters → Battery.'); return; }
  setDrawerTitle(DASH_TITLES[kind]);
  $('drawerBody').replaceChildren(h('div', { id: 'dashMount' }));
  dash.close();
  dash = createDashboards(app, $('dashMount'));
  dash.open(kind);
  app.scene.setSelected(kind);
  app.scene.focus(kind);
  openDrawer();
  setDrawerTitle(DASH_TITLES[kind]);
}

// ---------------------------------------------------------------- playback HUD
function whenText() {
  const day = Math.floor(app.T / 24), hod = app.T - day * 24, m = monthOfDay(day);
  const dom = day - MONTH_START_DAY[m] + 1;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][(new Date(Date.UTC(REFERENCE_YEAR, 0, 1)).getUTCDay() + day) % 7];
  const hh = Math.floor(hod), mm = Math.floor((hod - hh) * 60);
  return `${wd} ${dom} ${MONTH_NAMES[m]} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
let hudAcc = 0, lastDay = -1;
function pills(L) {
  const sh = L.served > 0 ? L.solarToLoad / L.served : 0;
  const p = (color, k, v) => `<div class="pill"><div class="k"><i style="background:${color}"></i>${k}</div><div class="v">${v}</div></div>`;
  $('live').innerHTML = p('var(--ink-3)', 'Demand', fmt.n(L.load) + ' kW') + p('var(--c-solar)', 'Solar', fmt.n(L.pvUsed) + ' kW') +
    p('var(--c-diesel)', 'Diesel', fmt.n(L.dieselOut) + ' kW') +
    (app.params.battery.enabled ? p('var(--c-batt)', 'Battery', fmt.n(L.soc) + '%') : '');
}

function onFrame(dt) {
  if (app.playing) {
    app.T += dt * app.speed;
    if (app.T >= 8760) app.T -= 8760;
  }
  const L = app.live = computeLive();
  app.scene.update(L, null);
  hudAcc += dt;
  if (hudAcc > 0.1) {
    hudAcc = 0;
    $('when').textContent = whenText();
    if (document.activeElement !== $('daySl')) $('daySl').value = Math.floor(app.T / 24);
    if (document.activeElement !== $('hourSl')) $('hourSl').value = clamp(app.T % 24, 0, 23.99);
    pills(L);
    dash.tick(L);
  }
}

// ---------------------------------------------------------------- init
function loadInitial() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const r = sanitize(JSON.parse(raw)); return r.params; }
  } catch (e) { /* ignore corrupt autosave */ }
  return defaultParams();
}

function init() {
  app.params = loadInitial();
  const canvas = $('scene');
  const hover = $('hovertip');
  app.manual = createManual(app);
  app.scene = createScene(canvas, {
    adaptive: !location.hash.includes('quality=high'),
    onSelect: (k) => showDash(k),
    onHover: (k, e) => {
      if (!k) { hover.hidden = true; return; }
      const r = $('stage').getBoundingClientRect();
      hover.hidden = false; hover.textContent = (DASH_TITLES[k] || k) + ' — click for dashboard';
      hover.style.left = (e.clientX - r.left + 14) + 'px'; hover.style.top = (e.clientY - r.top + 14) + 'px';
    },
  });
  dash = createDashboards(app, document.createElement('div'));
  doRecompute();
  app.live = computeLive();
  app.scene.update(app.live, app.params);
  $('loading').remove();
  app.scene.start(onFrame);

  // HUD wiring
  $('playBtn').addEventListener('click', () => { app.playing = !app.playing; $('playBtn').textContent = app.playing ? '❚❚' : '▶'; });
  $('speedSel').addEventListener('change', (e) => { app.speed = parseFloat(e.target.value); });
  $('daySl').addEventListener('input', (e) => { app.T = parseInt(e.target.value) * 24 + (app.T % 24); });
  $('hourSl').addEventListener('input', (e) => { app.T = Math.floor(app.T / 24) * 24 + parseFloat(e.target.value); });
  document.querySelectorAll('.tabbtn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('drawerClose').addEventListener('click', closeDrawer);
  $('btnHelp').addEventListener('click', () => app.manual.open());
  $('fileMenu').addEventListener('click', (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    $('fileMenu').open = false;
    if (act === 'save') app.saveFile(); else if (act === 'open') app.openFile();
    else if (act === 'reset' && confirm('Reset every parameter to its default?')) app.replaceParams(defaultParams());
  });
  document.addEventListener('click', (e) => { if (!$('fileMenu').contains(e.target)) $('fileMenu').open = false; });
  $('fileIn').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const r = fromJSON(await f.text());
      app.replaceParams(r.params);
      app.toast(`Loaded “${r.params.meta.name}”` + (r.warnings.length ? ` — ${r.warnings.length} warning(s): ${r.warnings.slice(0, 2).join('; ')}` : '.'), r.warnings.length ? 'bad' : '');
    } catch (err) { app.toast(err.message, 'bad'); }
    e.target.value = '';
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.manual.isOpen) { app.manual.close(); return; }
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'h' || e.key === 'H' || e.key === '?') { app.manual.isOpen ? app.manual.close() : app.manual.open(); return; }
    if (e.key === ' ') { e.preventDefault(); $('playBtn').click(); }
    if (e.key === 'Escape') closeDrawer();
  });
  window.__app = app; // handy for debugging in the console
  applyDeepLink();
}

// Optional deep links, e.g. index.html#open=results&t=5000&play=0  (open = params|sizing|results|risk|compound|generator|solar|battery|house)
function applyDeepLink() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.has('t')) app.T = clamp(parseFloat(q.get('t')) || 0, 0, 8759);
  if (q.get('play') === '0') { app.playing = false; $('playBtn').textContent = '▶'; }
  const o = q.get('open');
  if (o) { if (TABS.some((t) => t.id === o)) showTab(o); else showDash(o); }
}
init();
