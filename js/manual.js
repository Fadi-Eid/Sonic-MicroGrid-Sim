// In-app manual: guided documentation + an auto-generated parameter reference.
// The reference reads GROUPS/defaults from params.js, so ranges and defaults can never go stale;
// only the "how to choose it" text lives here (GUIDE). tests.js checks every parameter has an entry.
import { h } from './charts.js';
import { GROUPS, ADVANCED, defaultParams, getPath } from './params.js';

export const GUIDE = {
  'site.lat': 'Read it from a map of the plant location (the solar field, not the capital city). Sets sun height, day length and the sun-path in the 3D scene. A negative latitude flips the panels to face north automatically.',
  'site.lon': 'Decimal degrees east. Together with latitude and the time zone it places solar noon on the clock.',
  'site.tzOffset': 'Hours ahead of UTC on the local clock all year (e.g. +2 or +3). Daylight-saving changes are ignored, so use the offset of the season that matters most or the standard one.',
  'site.tilt': 'Slope of the panels from horizontal. For maximum yearly energy use roughly the latitude; use a smaller angle to favour summer, a larger one to favour winter. Flat roofs are often 10–15° to shed dust.',
  'site.azimuth': '0 faces the equator (south in the northern hemisphere). Use a positive value if the roof faces somewhat west, negative for east. A 30° error costs only ~2 % of yearly energy.',
  'site.albedo': 'Share of sunlight reflected by the ground onto the back of tilted panels. Leave at 0.2 unless the field is white gravel/sand (0.3) or concrete (0.25).',
  'site.diurnalRangeC': 'Difference between the daily low and high air temperature. Hot cells lose power, so a hotter place lowers the solar yield a little. Use the average over the year.',
  'site.cloudVariability': 'How changeable the weather is. 0 gives every day the monthly average (smooth, optimistic for sizing diesel). 0.5 is a reasonable Mediterranean default; raise it for unsettled climates. It does not change the monthly averages, only the day-to-day spread.',
  'site.seed': 'The weather and demand noise is pseudo-random but repeatable. Change the seed to see another possible year; the same seed always gives the same year. The Risk tab already varies it for you.',
  'site.monthlyClearness': 'The key weather input. 1.0 means every hour is perfectly clear; 0.7 means clouds and haze remove 30 % of the clear-sky sun on average. Best source: a satellite dataset (PVGIS, NASA POWER) converted to “actual ÷ clear-sky”. Defaults are typical for the eastern Mediterranean.',
  'site.monthlyTempC': 'Average air temperature of each month (not the cell temperature). Any weather site or the same satellite dataset gives it.',

  'load.subscribers': 'Number of paying connections. Demand scales linearly with it. If households and shops differ a lot, use the average and adjust kWh/day to match the real total.',
  'load.lossesPct': 'Energy lost in cables and transformers between the station and the meters. 5–10 % is typical; illegal connections count as losses too. You can measure it as (station kWh − sum of meter kWh) ÷ station kWh once metering exists.',
  'load.growthPctYr': 'Yearly growth of consumption per subscriber (new appliances, A/C). Applied compound over the project life, so it pushes the peak up and eventually needs more generator capacity.',
  'load.dayNoisePct': 'Random day-to-day swing of total demand (heat waves, holidays). Mean-neutral: it does not change yearly energy, only the peaks.',
  'load.hourNoisePct': 'Random hourly scatter. Large compounds are smooth (2–4 %); a few dozen users could be 10 %+.',
  'load.featuredUserScale': 'Only affects the single house in the 3D scene and its dashboard. 1 = an average user; 2 = a user who consumes twice as much as the average.',
  'load.weekendDays': 'Tick the days that use the “weekend” curves. Defaults to Sat+Sun; use Fri+Sat where that is the weekend. The calendar starts on a Friday (1 January); the exact year does not matter.',
  'load.seasons': 'For each season (months are assigned by hemisphere) and for weekdays and weekends: the kWh one average subscriber uses per day, and the shape of that use over 24 hours. Drag the bars to reshape; the preset buttons give an evening-peak, home-all-day, out-by-day or shop curve. Only the shape matters, not the bar heights: the kWh/day box sets the total.',

  'pv.panelWp': 'Nameplate power of one panel from its datasheet (STC rating). Modern modules are 400–600 Wp.',
  'pv.panelCount': 'Total number of panels. Installed kWp = count × panel Wp ÷ 1000. The Sizing tab can compute it from a target.',
  'pv.panelAreaM2': 'Module area from the datasheet (length × width). Used only for the land/roof estimate; add 2–3× for walkways and row spacing when planning land.',
  'pv.tempCoeffPctPerC': 'Datasheet “power temperature coefficient”, typically −0.30 to −0.40 %/°C. Output falls this much per °C of cell temperature above 25 °C.',
  'pv.noct': 'Datasheet “nominal operating cell temperature”, typically 42–47 °C. Higher means hotter cells and lower output.',
  'pv.soilingPct': 'Average loss from dust and dirt between cleanings. 2–3 % with regular cleaning, 8 % or more in dusty places with no cleaning. Compare yield before and after a wash to measure it.',
  'pv.mismatchWiringPct': 'DC cabling resistance plus mismatch between panels. 2–4 % for a decent installation.',
  'pv.availabilityPct': 'Share of time the plant is actually producing (faults, maintenance, grid-forming limits not counted here). 98–99.5 % is normal.',
  'pv.dcAcRatio': 'Panel kWp divided by inverter AC kW. 1.2 is common: a slightly smaller inverter is cheaper and rarely clips. Above ~1.4 you start throwing away midday energy (see “Inverter clipping” in Results).',
  'pv.inverterEffPct': 'Average efficiency of the PV inverter, 96–98.5 %.',
  'pv.degradationPctYr': 'Yearly output loss of the panels. 0.4–0.7 %/yr is typical of the datasheet warranty.',
  'pv.maxPenetrationPct': 'Without a battery a grid-following solar inverter needs the generator to set the voltage and frequency, and if a cloud passes the generator must pick up the load. This caps solar as a share of the instantaneous load. 60–80 % is common; check with your inverter and generator controller supplier. It has no effect when a battery is present.',

  'diesel.units': 'Identical generator sets in the plant. More, smaller units run closer to their efficient loading and give N+1 protection; fewer, larger units are cheaper per kW. The Sizing tab suggests combinations.',
  'diesel.ratedKw': 'Continuous (prime) electrical output of one set, not the standby rating and not kVA. Prime kW ≈ 0.8 × kVA for typical sets.',
  'diesel.minLoadPct': 'Lowest recommended loading of a running set (often 25–40 %). Below it the engine burns fuel poorly and carbons up. The model curtails solar so a running generator stays above this, when no battery can absorb the surplus.',
  'diesel.fuelA': 'Fuel burned at zero output, per kW of rated power per hour. Typical 0.07–0.10. Together with the next parameter it forms the fuel curve L/h = A × rated + B × output. Use the datasheet fuel table at 25/50/75/100 % load to fit it.',
  'diesel.fuelB': 'Extra litres per kWh produced. Typical 0.22–0.27. A + B at full load gives the full-load fuel rate (0.33 L/kWh ≈ 3 kWh/L). Check against your fuel bill ÷ kWh generated.',
  'diesel.cycleCharging': 'Only with a battery. When a generator starts anyway, run it harder (more efficient) and store the surplus instead of idling it at low load. Usually saves fuel when the battery is small relative to the load.',
  'diesel.cycleChargeLoadPct': 'Target loading while cycle charging. 70–85 % is the efficient zone for most engines.',
  'diesel.lifetimeHours': 'Running hours per unit before a major overhaul or replacement (30,000–60,000 h for good sets). At that point the model charges the replacement cost.',

  'battery.enabled': 'Turns the battery on. It adds capex but lets generators stop completely and absorbs solar that would otherwise be curtailed.',
  'battery.capacityKwh': 'Nameplate energy of the pack. Usable energy is this × (max SoC − min SoC). A pack of 2–4 hours of average evening demand is a common starting point; use the Sizing sweep to find the economic size.',
  'battery.cRate': 'Battery inverter power as a multiple of capacity per hour. 0.5 means a 1,000 kWh pack has a 500 kW inverter. Higher costs more inverter but can cover short peaks.',
  'battery.socMinPct': 'Lower limit of discharge, kept as reserve and to protect the cells. 10–20 %.',
  'battery.socMaxPct': 'Upper limit of charge. 90–100 %; lower values extend life.',
  'battery.socInitPct': 'State of charge at 00:00 on 1 January of each simulated year. Only affects the first day.',
  'battery.roundTripEffPct': 'AC-to-AC efficiency including the inverter. 88–93 % for lithium iron phosphate (LFP).',
  'battery.calendarFadePctYr': 'Capacity lost per year just from age. 1–2.5 % for LFP.',
  'battery.cycleLife': 'Full equivalent cycles until the pack reaches the end-of-life capacity (the next-but-one parameter). 4,000–8,000 for LFP at moderate depth of discharge.',
  'battery.eolCapacityPct': 'Capacity (share of nameplate) at which the pack is considered worn out and replaced. 70–80 %.',
  'battery.calendarLifeYears': 'Maximum age before replacement regardless of use. 10–15 years.',

  'costs.panelUsdPerWp': 'Module price delivered to site per watt. Multiply by Wp for the price of one panel (e.g. $0.20 × 550 = $110).',
  'costs.pvInstallUsdPerKwp': 'Everything else for the solar field per kWp: mounting structure, DC cables, combiner boxes, earthing, labour, commissioning, transport. Get a quote; $200–400/kWp is common.',
  'costs.pvInverterUsdPerKw': 'Price per kW of AC inverter capacity (not per kWp). The AC size is kWp ÷ DC/AC ratio.',
  'costs.pvOmUsdPerKwpYr': 'Yearly cost of cleaning, inspection and small repairs, per kWp.',
  'costs.battUsdPerKwh': 'Installed cost of battery cells, racks, enclosure and BMS per nameplate kWh.',
  'costs.battInverterUsdPerKw': 'Cost of the battery inverter/power conversion system per kW (capacity × C-rate).',
  'costs.battOmPctYr': 'Yearly battery maintenance as a share of its initial cost.',
  'costs.battReplaceUsdPerKwh': 'Price per kWh when the pack must be replaced. Usually lower than today’s price.',
  'costs.dieselCapexIncluded': 'Leave unticked when the generators already exist (they are then a sunk cost for both the hybrid and the diesel-only baseline). Tick it when the project must also buy them.',
  'costs.dieselUsdPerKw': 'Installed cost of the generator plant per kW (sets, switchgear, tank, civil works).',
  'costs.dieselOmUsdPerUnitHour': 'Consumables, spares and labour per running hour of one set. Typical 1–3 $/h for a 100–200 kW set.',
  'costs.oilChangeIntervalH': 'Hours between oil and filter services (250 h is common).',
  'costs.oilChangeUsd': 'Cost of one service including oil, filters and labour.',
  'costs.dieselReplaceUsdPerKw': 'Cost per kW of replacing or fully overhauling the sets when engine life is reached.',
  'costs.fuelUsdPerL': 'Delivered price of diesel per litre in year 1. Use the actual price you pay including transport to the island.',
  'costs.fuelEscalationPctYr': 'Real yearly change of the diesel price above general inflation. 0–3 % is a typical planning range; use 0 for a conservative view of solar savings.',
  'costs.networkCapexUsd': 'Poles, cables and transformers if the project builds or rebuilds the network. Same for hybrid and diesel-only, so it does not change the solar decision, only the project totals.',
  'costs.perSubscriberCapexUsd': 'Per-customer connection and meter cost borne by the project.',
  'costs.otherCapexUsd': 'Land, permits, buildings, studies and anything else up front.',
  'costs.fixedOpexUsdMonth': 'Staff, administration and other costs that do not depend on how the plant runs.',
  'costs.insurancePctCapexYr': 'Yearly insurance as a share of total capex. 0.3–1 %.',
  'costs.inverterReplaceYear': 'Project year in which inverters are replaced once. 10–15 is typical.',

  'finance.tariffUsdKwh': 'What you charge per kWh sold to users (after losses). Revenue = kWh sold × this × collection rate.',
  'finance.tariffEscalationPctYr': 'Real yearly change of the tariff. A fuel-indexed tariff rises with the diesel price: keep it equal to the fuel escalation; a frozen tariff squeezes profit as fuel gets dearer.',
  'finance.feeUsdPerSubMonth': 'Fixed monthly fee per subscriber, independent of consumption.',
  'finance.collectionPct': 'Share of billed revenue that is actually paid. Lower it to model non-payment.',
  'finance.discountRatePct': 'Your required return, in real terms. NPV discounts all cash flows at this rate; 8–15 % is typical for small private utilities.',
  'finance.projectYears': 'Length of the analysis. Panels and batteries outlive 20 years but diesel plants and finance often do not.',
  'finance.taxPct': 'Income tax on profit after straight-line depreciation. 0 if tax-exempt or not modelled.',
  'finance.residualPct': 'Share of initial capex you could recover at the end (resale or continued use).',

};

const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const anchorFor = (path) => 'p-' + path.replace(/\./g, '-');

function fmtDefault(v) {
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (typeof v === 'number') return String(+v.toPrecision(6));
  return String(v);
}

// ---- guided content --------------------------------------------------------------
const SECTIONS = [
  { id: 'start', title: 'Quick start', html: `
    <p>This tool answers one question: <b>how much solar (and battery) should an island diesel grid add, and does it pay?</b> It simulates every hour of a year with your assumptions, repeats that for the whole project life, and reports cost, profit and fuel use.</p>
    <ol>
      <li><b>Parameters.</b> Enter what you know: location, number of subscribers and how much they use, the generators, prices. Each group has an <b>Advanced</b> fold with sensible defaults; leave it alone until the Risk tab shows it matters.</li>
      <li><b>Look at the scene.</b> Press play, change the day and hour, jump between seasons. Click the compound, generator, solar field, battery or house for a dashboard.</li>
      <li><b>Sizing.</b> Pick a solar size, check the generators (N+1) and run the design sweep to find the best solar × battery combination. <i>Apply</i> any result to the scenario.</li>
      <li><b>Results.</b> Compare the design with running on diesel only: LCOE, NPV gain, payback, fuel and CO₂ saved.</li>
      <li><b>Risk.</b> Run the sensitivity and Monte Carlo to see how far the answer can move because of what you do not know yet.</li>
      <li><b>Save.</b> Use <i>File → Save scenario</i> to download it as JSON; <i>File → Open scenario</i> loads it back. The browser also remembers the last scenario.</li>
    </ol>
    <p class="callout">Every number you change recalculates the whole lifecycle in a few tenths of a second, so just experiment.</p>` },
  { id: 'scene', title: 'The 3D scene', html: `
    <p>The scene never invents anything: every light, particle and number is read from the hourly simulation for the date and hour shown.</p>
    <ul>
      <li><b>Controls (bottom bar):</b> play/pause (<kbd>Space</kbd>), speed from 0.5 hours per second to 4 days per second, and a day and an hour slider.</li>
      <li><b>Sun and sky:</b> the sun and moon are placed from latitude, longitude, date and time. Sunrise/sunset colours, stars at night, cloud cover from the modelled cloud factor of that hour, and rain when the day is very overcast. The weather you see is the weather the simulation used.</li>
      <li><b>Power flow:</b> glowing dots run along the cables. Yellow = solar, blue = diesel, green = battery. The cable to the compound and the house is coloured by the current solar share. More dots = more power.</li>
      <li><b>Machines:</b> each generator set lights its lamp, spins its fan and smokes when running (the label shows how many are on). The inverter LED is green when producing, amber when curtailing. The battery has ten LEDs for state of charge. The windows of the buildings light up with the demand at night.</li>
      <li><b>Solar field:</b> shows at most 288 model panels; each one stands for several real panels when you have more.</li>
      <li><b>Mouse:</b> drag to orbit, scroll to zoom, right-drag to pan. Click a machine, a building or its label to open its dashboard.</li>
    </ul>` },
  { id: 'dash', title: 'Dashboards', html: `
    <p>Every dashboard has <b>live “now” tiles</b> for the instant on screen and a <b>Day / Month / Year</b> switch. The totals are <b>cumulative up to the time on the sliders</b>: Day counts from 00:00, Month from the 1st, Year from 1 January (so on 15 May, Year shows January to mid-May). The chart shows the whole period with the part that has not happened yet faded. Hover a chart for exact values.</p>
    <dl>
      <dt>Compound (all users)</dt><dd>Demand and who supplies it (solar direct or via the battery, diesel, unserved). Energy delivered, solar share, billed sales, fuel and generator O&amp;M, operating margin before fixed costs, unserved energy.</dd>
      <dt>Diesel generators</dt><dd>Output, units online, loading, fuel rate and efficiency now; energy, fuel, running hours, cost per diesel kWh, yearly engine wear. Shows whether N−1 capacity covers the yearly peak, low-load hours and average loading.</dd>
      <dt>Solar array and inverter</dt><dd>Output, sunlight on the panels, cell temperature and inverter loading now; energy, specific yield (kWh per kWp), curtailment, capacity factor, plant size and area. “Used” is solar that reached the load or battery; “curtailed” is solar the grid could not accept.</dd>
      <dt>Battery</dt><dd>State of charge, power, usable energy; charged and delivered energy, cycles per year, round-trip losses, capacity after the project life. (Only when a battery is enabled.)</dd>
      <dt>Single user (house)</dt><dd>That house’s consumption in kWh from solar and from diesel, now, per day, month and year, and its bill. Every user on the grid gets the same hourly mix, so a user’s kWh by source is their hourly use × that hour’s solar share.</dd>
    </dl>` },
  { id: 'model', title: 'How the simulation works', html: `
    <h4>Time</h4><p>One year of 8,760 hourly steps, repeated for every project year with growth, degradation, ageing and price escalation. The year-1 hourly run is what the scene and dashboards show.</p>
    <h4>Solar</h4><p>Sun position from latitude/longitude/date → clear-sky sunlight (air mass, direct beam plus 10 % diffuse) → projected onto the tilted panels → multiplied by the <i>cloud factor</i> (monthly clearness plus seeded day and hour variability) → cell temperature and temperature coefficient → soiling, wiring and availability losses → inverter efficiency and clipping at the AC rating.</p>
    <h4>Demand</h4><p>subscribers × kWh/day (by season and weekday/weekend) × the 24-hour shape ÷ (1 − losses), with repeatable noise and yearly growth. The noise is mean-neutral, so yearly energy equals your input.</p>
    <h4>Dispatch without a battery</h4>
    <ul><li>The generators hold the grid; enough sets run to carry the <b>whole</b> load (in case the sun vanishes).</li>
    <li>Solar can only displace diesel up to the <i>max instantaneous share</i> and down to the generators’ <i>minimum loading</i>.</li>
    <li>Anything above that is <b>curtailed</b>.</li><li>If the load exceeds installed diesel plus allowed solar, the rest is <b>unserved</b>.</li></ul>
    <h4>Dispatch with a battery</h4>
    <ul><li>The battery inverter holds the grid, so generators can switch off.</li>
    <li>Solar serves the load first; surplus charges the battery (power and SoC limits apply); the rest is curtailed.</li>
    <li>The battery covers deficits down to the minimum SoC; diesel covers only what is left.</li>
    <li>With <i>cycle charging</i>, a starting generator is loaded harder and the surplus charges the battery.</li></ul>
    <h4>Fuel</h4><p>Per running set: litres/hour = A × rated kW + B × output kW. Running sets at light load therefore waste fuel, which is why more solar does not save fuel one-for-one.</p>
    <h4>Lifecycle and money</h4><p>Each year: revenue (tariff × kWh sold × collection + fixed fees) minus fuel, generator and solar and battery upkeep, fixed costs and insurance, minus replacements (inverters in a set year, battery when worn or old, engines at their running-hour life) and tax. Year 0 is capex. The same is done for a <b>diesel-only baseline</b> (same generators, no solar, no battery), and the difference is the value of the solar investment.</p>
    <h4>Energy origin</h4><p>Energy keeps its label (solar or diesel) while stored in the battery, so every delivered kWh is either solar or diesel. This feeds the solar share and the single-user dashboard.</p>` },
  { id: 'params', title: 'Parameter reference', html: '' },
  { id: 'sizing', title: 'Sizing tab', html: `
    <h4>1 · Solar capacity</h4><p>Choose how you specify it: <b>target capacity</b> (kWp), <b>target solar share</b> (the smallest plant reaching that share of yearly energy), or a <b>panel count</b>. The panel count is rounded up. The tiles show area, expected solar share, curtailment, fuel saved and yield. If a share is unreachable, the message tells you the ceiling: without a battery, solar saturates because the generators must keep running.</p>
    <h4>2 · Generators (N+1)</h4><p>Compares your plant with the yearly peak. N+1 means the peak is still met with the largest unit out of service. The table lists unit counts with the smallest standard size that satisfies N+1 with 10 % margin; <i>Use</i> applies one. With a battery the rule is relaxed, so check unserved energy instead.</p>
    <h4>3 · Find the best design</h4><p>Runs a full lifecycle for every solar × battery combination in the ranges you set (all other parameters stay as they are) and ranks them. The heat map shows your objective, dark = better; hatched cells break a constraint. Click a cell for details and <i>Apply this design</i>.</p>
    <ul><li><b>Objective:</b> lowest cost per kWh, biggest NPV gain over diesel-only, highest solar share, or shortest payback.</li>
    <li><b>Constraints:</b> maximum unserved energy (default 0.5 %), minimum solar share, maximum capex.</li>
    <li>If the best cell sits on the edge of the range, widen the range and run again.</li>
    <li>Real supply is also limited by what is physically possible; always check the winner in the scene and in <i>Results</i>.</li></ul>` },
  { id: 'results', title: 'Reading the Results', html: `
    <dl>
      <dt>Solar share</dt><dd>Share of the energy delivered that came from solar (directly or via the battery), year 1 and lifetime average.</dd>
      <dt>LCOE (levelized cost of energy)</dt><dd>Present value of all costs (capex, running costs, replacements) divided by the present value of kWh sold. It is the break-even tariff. Compare with your tariff and with the diesel-only LCOE.</dd>
      <dt>NPV (net present value)</dt><dd>All yearly cash flows discounted at your discount rate, minus capex. Positive means the project beats your required return.</dd>
      <dt>NPV gain vs diesel-only</dt><dd>The extra NPV caused by adding the solar and battery. This is the number that justifies the investment, because the generators and customers exist either way.</dd>
      <dt>IRR</dt><dd>The discount rate at which NPV is zero. Shown as n/a when it cannot be computed (for example the cash flow never turns positive or changes sign several times).</dd>
      <dt>Payback</dt><dd>Years until cumulative cash flow turns positive (simple, undiscounted). For the design this is measured on the extra capex vs diesel-only.</dd>
      <dt>Curtailment</dt><dd>Solar that was available but could not be used (no battery space, generator minimum load, stability cap). High curtailment means the field is too big for the load, or a battery would help.</dd>
      <dt>Inverter clipping</dt><dd>DC energy lost because panel power exceeded the inverter’s AC rating.</dd>
      <dt>Unserved energy</dt><dd>Demand the plant could not meet. It should be ~0; if not, add generator capacity or battery.</dd>
      <dt>Capacity factor / specific yield</dt><dd>Solar energy ÷ (kWp × hours in a year) and kWh per kWp per year. Compare with your inverter portal or PVGIS as a sanity check.</dd>
    </dl>
    <p>The tables export as CSV: <i>yearly</i> cash flow and the <i>hourly</i> year-1 results for your own analysis in a spreadsheet.</p>` },
  { id: 'risk', title: 'Risk tab', html: `
    <p>You have no measured data yet, so the honest answer is a range.</p>
    <ul><li><b>Sensitivity:</b> each input is lowered and raised by 20 % in turn. The bars show how the chosen measure moves; the longest bars are the inputs worth measuring first. Inputs with no effect on that measure are hidden.</li>
    <li><b>Monte Carlo:</b> repeats the full lifecycle (default 60 runs) with a different random weather and load year each time, demand ±12 %, fuel price ±20 % and sunshine ±6 % (one standard deviation). The table shows pessimistic (P10), median and optimistic (P90) values: 1 run in 10 is worse than P10 and 1 in 10 better than P90.</li></ul>` },
  { id: 'files', title: 'Saving, loading, sharing', html: `
    <ul><li><b>File → Save</b> downloads <code>name.microgrid.json</code> with every parameter (and any imported series). <b>File → Open</b> loads one.</li>
    <li>Loading is forgiving: missing fields take defaults, numbers outside the allowed range are clamped, and a toast reports what was changed. Unknown fields are ignored.</li>
    <li>The browser also autosaves the current scenario in local storage, so reloading the page keeps your work. Clearing site data removes it, so save files for anything important.</li>
    <li>Share a scenario by sending the JSON file. Anyone opening the same page can load it.</li>
    <li>Deep link for a demo: <code>#open=results&amp;t=5000&amp;play=0</code> (open = params, sizing, results, risk, compound, generator, solar, battery, house; t = hour of the year).</li></ul>` },
  { id: 'limits', title: 'Limits to keep in mind', html: `
    <ul><li><b>Hourly steps.</b> Cloud flicker and motor starts are not seen; the minimum-loading and stability-cap parameters stand in for them.</li>
    <li><b>No network model.</b> One bus, losses as a single percentage; no voltage, current or reactive power limits.</li>
    <li><b>Generators</b> are identical, share load equally, and have no start costs or minimum run times.</li>
    <li><b>Battery</b> has constant efficiency and no temperature effects; fade is calendar plus cycle based.</li>
    <li><b>Money</b> is in real terms (no inflation), all-equity, with a flat tariff plus optional fixed fee.</li>
    <li><b>Calendar:</b> 365 days, no leap days, no daylight-saving shifts.</li>
    <li><b>Synthetic weather</b> is statistically plausible, not a measured year. Use measured yield data for the final design.</li></ul>
    <p class="callout">Use the model to compare options and find which assumptions matter. It is a quick approximation, not a design.</p>` },
  { id: 'keys', title: 'Shortcuts and tips', html: `
    <table class="dt wide"><tbody>
      <tr><td><kbd>Space</kbd></td><td>Play / pause the scene</td></tr>
      <tr><td><kbd>H</kbd> or <kbd>?</kbd></td><td>This manual</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Close the manual, or the side panel</td></tr>
      <tr><td>Click the <b>i</b> next to a parameter</td><td>Opens the manual at that parameter</td></tr>
    </tbody></table>` },
];

export function createManual(app) {
  const root = h('div', { id: 'manual', class: 'modal', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Manual' });
  const toc = h('nav', { class: 'toc', 'aria-label': 'Manual contents' });
  const doc = h('article', { class: 'doc' });
  const search = h('input', { type: 'search', placeholder: 'Search parameters…', 'aria-label': 'Search the manual' });
  const def = defaultParams();

  function paramReference() {
    const wrap = h('div');
    wrap.append(h('p', null, 'Every input, with its default, unit, allowed range and advice on how to choose it. Defaults are typical starting values. Use the search box to filter. The ', h('b', null, 'i'), ' button beside each parameter in the Parameters tab opens this page at that entry.'));
    for (const g of GROUPS) {
      const sec = h('section', { class: 'pgroup' }, h('h4', null, g.title));
      const items = [
        ...g.fields,
        ...(g.arrays || []).map((a) => ({ ...a, array: true })),
        ...(g.custom === 'load' ? [{ path: 'load.weekendDays', label: 'Weekend days', unit: '', help: 'Which weekdays use the weekend demand curves.', special: true }, { path: 'load.seasons', label: 'Demand by season (kWh/day and 24-hour shape)', help: 'Four seasons × weekday/weekend.', special: true }] : []),
      ];
      for (const f of items) {
        const dv = f.special || f.array ? null : getPath(def, f.path);
        const meta = [];
        if (dv != null) meta.push(h('span', null, 'Default ', h('b', null, fmtDefault(dv) + (f.unit ? ' ' + f.unit : ''))));
        if (f.min != null) meta.push(h('span', null, 'Range ', h('b', null, `${f.min} – ${f.max}`)));
        if (f.array) meta.push(h('span', null, '12 monthly values'));
        if (ADVANCED.has(f.path)) meta.push(h('span', { class: 'badge' }, 'Advanced'));
        const card = h('div', { class: 'pcard', id: anchorFor(f.path), 'data-search': (f.label + ' ' + f.path + ' ' + (f.help || '') + ' ' + (GUIDE[f.path] || '')).toLowerCase() },
          h('div', { class: 'pname' }, f.label), h('div', { class: 'pmeta' }, meta),
          GUIDE[f.path] ? h('div', { class: 'pguide' }, GUIDE[f.path]) : (f.help ? h('div', { class: 'pdesc' }, f.help) : null));
        sec.append(card);
      }
      wrap.append(sec);
    }
    return wrap;
  }

  SECTIONS.forEach((s) => {
    toc.append(h('a', { href: '#sec-' + s.id, 'data-sec': s.id, onclick: (e) => { e.preventDefault(); goto('sec-' + s.id); } }, s.title));
    const sec = h('section', { id: 'sec-' + s.id }, h('h3', null, s.title));
    if (s.id === 'params') sec.append(paramReference()); else sec.insertAdjacentHTML('beforeend', s.html);
    doc.append(sec);
  });

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    doc.querySelectorAll('.pcard').forEach((c) => { c.hidden = q && !c.dataset.search.includes(q); });
    doc.querySelectorAll('.pgroup').forEach((g) => { g.hidden = q && ![...g.querySelectorAll('.pcard')].some((c) => !c.hidden); });
    if (q) goto('sec-params');
  });

  function goto(id) {
    const el = doc.querySelector('#' + CSS.escape(id));
    if (el) { doc.style.scrollBehavior = 'auto'; el.scrollIntoView({ block: 'start' }); doc.style.scrollBehavior = ''; if (el.classList.contains('pcard')) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); } }
    toc.querySelectorAll('a').forEach((a) => a.classList.toggle('on', 'sec-' + a.dataset.sec === id));
  }

  const head = h('div', { class: 'modal-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Manual'), h('h2', null, 'Using the Microgrid Sizer')),
    h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close manual', onclick: () => close() }, '✕'));
  root.append(h('div', { class: 'modal-card' }, head, h('div', { class: 'modal-body' }, h('div', { class: 'toc-wrap' }, search, toc), doc)));
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  document.body.append(root);

  let prevFocus = null;
  function open(anchor) {
    prevFocus = document.activeElement;
    root.hidden = false;
    search.value = ''; search.dispatchEvent(new Event('input'));
    goto(anchor || 'sec-start');
    root.querySelector('.iconbtn').focus();
  }
  function close() { root.hidden = true; if (prevFocus && prevFocus.focus) prevFocus.focus(); }
  return { open, close, get isOpen() { return !root.hidden; }, openParam: (path) => open(anchorFor(path)) };
}
