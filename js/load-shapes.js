// Load-shape library: normalised 24-hour curves (hour 0..23) and helpers.
// Typical starting shapes; they are
// editable in the UI.

const gauss = (h, mu, sigma) => {
  // wrap-around gaussian so the curve is continuous across midnight
  let d = Math.abs(h - mu);
  d = Math.min(d, 24 - d);
  return Math.exp(-0.5 * (d / sigma) ** 2);
};
const logistic = (x) => 1 / (1 + Math.exp(-x));

export function normalise(shape) {
  const s = shape.reduce((a, b) => a + b, 0);
  return s > 0 ? shape.map((v) => v / s) : new Array(24).fill(1 / 24);
}

const make = (fn) => normalise(Array.from({ length: 24 }, (_, h) => fn(h + 0.5)));

export const PRESET_SHAPES = {
  eveningPeak: {
    label: 'Evening peak',
    shape: make((h) => 0.28 + 0.7 * gauss(h, 7.5, 1.3) + 0.45 * gauss(h, 13, 2.5) + 2.3 * gauss(h, 20.5, 2.2)),
  },
  homeAllDay: {
    label: 'Home all day',
    shape: make((h) => 0.7 + 0.5 * gauss(h, 8, 1.5) + 0.7 * gauss(h, 13.5, 3.2) + 1.0 * gauss(h, 20.5, 2.4)),
  },
  outByDay: {
    label: 'Out by day',
    shape: make((h) => 0.3 + 1.4 * gauss(h, 7, 1.0) + 0.25 * gauss(h, 13, 2.5) + 2.4 * gauss(h, 20.5, 2.4)),
  },
  smallShop: {
    label: 'Small shop',
    shape: make((h) => 0.08 + 1.6 * logistic((h - 8.5) * 2.2) * (1 - logistic((h - 18.5) * 2.2))),
  },
};

export const SEASONS = ['winter', 'spring', 'summer', 'autumn'];

// Weighted blend of presets (weights need not sum to 1).
export function mixShapes(weights) {
  const keys = Object.keys(PRESET_SHAPES);
  const out = new Array(24).fill(0);
  let tot = 0;
  for (const k of keys) {
    const w = weights[k] || 0;
    tot += w;
    for (let h = 0; h < 24; h++) out[h] += w * PRESET_SHAPES[k].shape[h];
  }
  return normalise(tot > 0 ? out : PRESET_SHAPES.eveningPeak.shape);
}

// Seasonal add-on bumps (shape multipliers applied before normalising).
const SEASON_BUMPS = {
  winter: (h) => 1 + 0.45 * gauss(h, 20.5, 2.0) + 0.25 * gauss(h, 7.5, 1.5), // heating/lighting
  spring: () => 1,
  summer: (h) => 1 + 0.55 * gauss(h, 15.5, 3.5) + 0.25 * gauss(h, 1.5, 3.0), // A/C afternoon + night
  autumn: (h) => 1 + 0.10 * gauss(h, 20, 2),
};

const WEEKDAY_MIX = { eveningPeak: 55, homeAllDay: 15, outByDay: 20, smallShop: 10 };
const WEEKEND_MIX = { eveningPeak: 40, homeAllDay: 35, outByDay: 10, smallShop: 15 };

export function defaultSeasonShape(season, dayType) {
  const base = mixShapes(dayType === 'weekend' ? WEEKEND_MIX : WEEKDAY_MIX);
  const bump = SEASON_BUMPS[season];
  return normalise(base.map((v, h) => v * bump(h + 0.5)));
}

// Daily kWh per subscriber (typical values; weekday, weekend is ~8% higher).
export const DEFAULT_KWH = { winter: 8.5, spring: 6.5, summer: 9.5, autumn: 7.5 };
