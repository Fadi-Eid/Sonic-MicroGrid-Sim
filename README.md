# Microgrid Sizer

Hourly simulator + 3D visualiser for an **islanded diesel / solar / optional battery microgrid**. It is a static site (no build step) and runs on GitHub Pages.

## Run it

- **Locally:** from this folder run `python -m http.server 8000` and open <http://localhost:8000>. (Opening `index.html` by double-click does not work: browsers block ES modules on `file://`.)
- **GitHub Pages:** push the contents of this folder as the repository root (so `index.html` is at the top), then *Settings → Pages → Deploy from branch*. Everything is relative-path and three.js is vendored in `lib/`, so nothing is fetched from a CDN.
- **Engine tests:** open `/tests.html` (served over http). It prints PASS/FAIL for 54 checks (energy balance every hour, SoC bounds, solar geometry, edge cases, economics, solver, sweep, Monte Carlo).

## What you get

| Area | What it does |
|---|---|
| **3D scene** | A procedural island (hills, beaches, rock, forest, animated sea with shoreline foam) with the solar field, inverter, diesel plant (one machine per unit), optional battery containers, a compound of apartment blocks and one detached house, plus a jetty and boats. Sun position, day/night, stars, moon, clouds, rain, lit windows and power-flow particles all come from the simulation. Orbit with the mouse. |
| **Click-through dashboards** | Click the compound, generator, solar field/inverter, battery or the single house. Each has *Day / Month / Year* views and live "now" numbers. The house shows its kWh from solar vs diesel. |
| **Parameters** | Every input, with units, limits and help text. Seasonal × weekday/weekend demand curves are editable by dragging bars. |
| **Sizing** | (1) panels from a target kWp, a target solar share, or a panel count; (2) generator N+1 options; (3) a full design sweep over solar kWp × battery kWh, ranked by LCOE, NPV gain, solar share or payback, with constraints (max unserved energy, min solar share, max capex). |
| **Results** | LCOE, NPV, IRR, payback, fuel saved, CO₂, energy balance, capex/opex breakdown, 20-year cash flow vs a diesel-only baseline, CSV export (yearly and hourly). |
| **Risk** | Tornado sensitivity (±20 % on 13 inputs) and Monte Carlo (random weather/load years plus uncertain demand, fuel price and sunshine) → P10/P50/P90. |
| **Manual** | The **?** button (or <kbd>H</kbd>) opens an in-app manual: quick start, how the model works, how to read results, and a searchable reference of all 80 parameters with default, range and advice on choosing each. The **i** beside every parameter jumps to its entry. |
| **Save / load** | *Save* writes a `.microgrid.json` scenario; *Open* reads one back (missing fields take defaults, bad numbers are clamped and reported). The browser also autosaves to local storage. |

## How the simulation works

One engine, hourly steps, 8,760 hours (365 days), run for every project year (default 20) with demand growth, panel degradation, battery ageing/replacement, fuel escalation and equipment replacements.

**Solar.** Sun position from latitude/longitude/time zone; Kasten-Young air mass; Meinel clear-sky beam + 10 % diffuse; transposition to the tilted plane; a *cloud factor* from your monthly clearness values plus seeded day-to-day and hour-to-hour variability; temperature derating through NOCT; soiling, wiring, availability, inverter efficiency and DC/AC clipping. Southern-hemisphere sites flip automatically.

**Demand.** `subscribers × kWh/day × 24-hour shape`, picked by season and weekday/weekend, divided by `(1 − distribution losses)`, with seeded noise and yearly growth. The noise is mean-normalised, so annual energy equals your input.

**Dispatch, no battery.** The generators form the grid, so:
- the online diesel capacity must cover the whole load (ride-through if the sun drops);
- solar ≤ the *max instantaneous share* and ≤ load − the generators' minimum loading;
- everything above that is **curtailed** (and reported).

**Dispatch with battery.** The battery inverter forms the grid. Solar serves load first, surplus charges the battery, the battery covers deficits down to its minimum SoC, and diesel covers the rest (optionally *cycle charging* at a higher, more efficient loading). Energy is tracked by origin through the battery so each delivered kWh is labelled solar or diesel; the per-user dashboard uses that.

**Diesel fuel.** `L/h = units_running × A × rated_kW + B × output_kW` (the standard linear generator curve), so part-load running burns more fuel per kWh. Defaults A = 0.0845, B = 0.246 (≈ 3 kWh/L at full load).

**Economics.** Capex (panels, install/BOS, inverters, battery, optional generators, network, per-subscriber), opex (fuel with escalation, run-hour O&M, oil changes, solar and battery O&M, fixed, insurance), replacements (inverter, battery by fade/age, engines by running hours), revenue (tariff × energy sold × collection rate + fixed fee), tax with straight-line depreciation. Outputs: LCOE per kWh sold, NPV, IRR, payback, and the same figures *incremental to a diesel-only baseline* (same generators, no solar, no battery), which is the number that justifies the solar investment.

## Defaults

This is a fast approximation: everything is entered as a handful of numbers. Defaults are typical starting values (demand, tariff and fuel follow the earlier Sonic Utility model: 400 subscribers, 8 kWh/day, $0.40/kWh, $0.90/L, Beirut coordinates). Replace them with your own and use the *Risk* tab to see which ones move the answer most.

## Known simplifications

- Hourly resolution: it will not see sub-hour cloud transients or motor-start spikes. Min-loading and the stability cap stand in for them.
- No grid, network voltage/thermal limits or reactive power; losses are a single percentage.
- Generators are identical units sharing load equally; start/stop costs and minimum run times are not modelled.
- Battery: constant efficiency, no temperature effect; fade is calendar + cycle-throughput based.
- One tariff (flat per kWh plus optional fixed fee), all-equity financing, real (inflation-free) terms.
- Leap days and daylight-saving changes are ignored.

## Files

```
index.html, css/style.css      app shell and styling (light/dark)
js/params.js                   defaults, field metadata, validation, JSON save/load
js/load-shapes.js, load.js     demand model
js/solar.js                    sun, clear-sky, weather, PV yield
js/engine.js                   hourly dispatch (the physics)
js/economics.js                capex, lifecycle cash flow, KPIs, diesel-only comparison
js/sizing.js                   solvers, design sweep, tornado, Monte Carlo
js/scene.js                    three.js scene (draws only; reads state)
js/scene/                      terrain + sea shader, vegetation, buildings, props, textures (all procedural)
js/dashboards.js, panels.js    dashboards and drawer panels
js/charts.js                   dependency-free SVG charts
js/manual.js                   in-app manual and parameter guidance
js/main.js                     state, playback, wiring
lib/                           three.js r160 and OrbitControls (vendored)
tests.html, js/tests.js        engine tests
```

Deep links (handy for demos): `index.html#open=results&t=5000&play=0` — `open` is `params|sizing|results|risk|compound|generator|solar|battery|house`, `t` is the hour of the year.
