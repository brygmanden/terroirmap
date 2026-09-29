// Pure calculation helpers (no DOM). Loaded in the browser as window.Climate,
// and usable from Node for testing: const Climate = require('./climate.js').
(function (root) {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Weather metrics offered in the "Weather" selector.
  // agg: "sum" = monthly total, "mean" = mean of daily values. scale converts API units.
  const METRICS = {
    rain:     { label: "Rain",      unit: "mm / month", field: "precipitation_sum",   agg: "sum",  scale: 1,        digits: 0 },
    rainHrs:  { label: "Rain hrs",  unit: "h / month",  field: "precipitation_hours", agg: "sum",  scale: 1,        digits: 0 },
    maxT:     { label: "MaxT",      unit: "°C",         field: "temperature_2m_max",  agg: "mean", scale: 1,        digits: 1 },
    meanT:    { label: "MeanT",     unit: "°C",         field: "temperature_2m_mean", agg: "mean", scale: 1,        digits: 1 },
    minT:     { label: "MinT",      unit: "°C",         field: "temperature_2m_min",  agg: "mean", scale: 1,        digits: 1 },
    sunshine: { label: "Sunshine",  unit: "h / day",    field: "sunshine_duration",   agg: "mean", scale: 1 / 3600, digits: 1 },
    daylight: { label: "Daylight",  unit: "h / day",    field: "daylight_duration",   agg: "mean", scale: 1 / 3600, digits: 1 },
    wind:     { label: "Wind",      unit: "km/h (daily max)", field: "wind_speed_10m_max", agg: "mean", scale: 1, digits: 0 },
  };

  const DAILY_FIELDS = [...new Set(Object.values(METRICS).map(m => m.field)), "shortwave_radiation_sum"];

  // Months from `from` to `to` inclusive (0-based), wrapping past December (e.g. Oct→Mar).
  function monthRange(from, to) {
    const out = [];
    let m = from;
    for (let i = 0; i < 12; i++) { out.push(m); if (m === to) break; m = (m + 1) % 12; }
    return out;
  }

  // Group daily series into per-(year, month) sums and counts for each field.
  function groupMonthly(daily) {
    const groups = {}; // key "YYYY-M" -> { year, month, fields: {f: {sum, n}} }
    const t = daily.time || [];
    for (let i = 0; i < t.length; i++) {
      const year = +t[i].slice(0, 4), month = +t[i].slice(5, 7) - 1;
      const key = year + "-" + month;
      const g = groups[key] || (groups[key] = { year, month, days: 0, fields: {} });
      g.days++;
      for (const f of DAILY_FIELDS) {
        const v = daily[f] ? daily[f][i] : null;
        if (v == null || Number.isNaN(v)) continue;
        const s = g.fields[f] || (g.fields[f] = { sum: 0, n: 0 });
        s.sum += v; s.n++;
      }
    }
    return Object.values(groups);
  }

  // Value of one metric for one (year, month) group, or null if data is too sparse.
  function monthValue(g, metric) {
    const s = g.fields[metric.field];
    if (!s || s.n < g.days * 0.8) return null;
    const v = metric.agg === "sum" ? s.sum * (g.days / s.n) : s.sum / s.n;
    return v * metric.scale;
  }

  // For each calendar month: mean, min and max of the metric across years.
  function monthlyStats(groups, metricKey) {
    const metric = METRICS[metricKey];
    const byMonth = MONTHS.map(() => []);
    for (const g of groups) {
      const v = monthValue(g, metric);
      if (v != null) byMonth[g.month].push({ year: g.year, v });
    }
    return byMonth.map((vals, month) => {
      if (!vals.length) return { month, mean: null, min: null, max: null, n: 0, years: [] };
      const xs = vals.map(d => d.v);
      return {
        month,
        mean: xs.reduce((a, b) => a + b, 0) / xs.length,
        min: Math.min(...xs), max: Math.max(...xs), n: xs.length,
        years: vals.sort((a, b) => a.year - b.year),
      };
    });
  }

  // Mean solar irradiance (W/m²) over the chosen months. shortwave_radiation_sum is MJ/m² per day.
  function meanIrradiance(groups, months) {
    let sum = 0, n = 0;
    for (const g of groups) {
      if (!months.includes(g.month)) continue;
      const s = g.fields.shortwave_radiation_sum;
      if (s) { sum += s.sum; n += s.n; }
    }
    return n ? (sum / n) * 1e6 / 86400 : null;
  }

  // Altitude effects relative to sea level.
  const LAPSE_RATE = 6.5;          // °C per 1000 m (ICAO standard atmosphere)
  const UV_PER_KM = 0.10;          // ~10% more UV per 1000 m (WHO rule of thumb)
  const tempDrop = alt => LAPSE_RATE * Math.max(alt, 0) / 1000;
  const uvRelative = alt => 1 + UV_PER_KM * Math.max(alt, 0) / 1000;

  // Köppen–Geiger classification (Peel et al. 2007 thresholds) from 12 monthly means.
  // T: monthly mean temperature °C, P: monthly precipitation mm, north: hemisphere flag.
  function koppen(T, P, north) {
    const MAT = T.reduce((a, b) => a + b, 0) / 12;
    const MAP = P.reduce((a, b) => a + b, 0);
    const Thot = Math.max(...T), Tcold = Math.min(...T);
    const summer = north ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
    const winter = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(m => !summer.includes(m));
    const Ps = summer.map(m => P[m]), Pw = winter.map(m => P[m]);
    const Psum = Ps.reduce((a, b) => a + b, 0);
    const Pdry = Math.min(...P);
    const Psdry = Math.min(...Ps), Pswet = Math.max(...Ps);
    const Pwdry = Math.min(...Pw), Pwwet = Math.max(...Pw);

    // Aridity threshold (Peel et al. 2007): compare MAP (mm) with 10 × Pth.
    const Pth = 2 * MAT + (Psum >= 0.7 * MAP ? 28 : (MAP - Psum) >= 0.7 * MAP ? 0 : 14);

    if (Thot < 10) return Thot > 0 ? "ET" : "EF";
    if (MAP < 10 * Pth) {
      const sub = MAP < 5 * Pth ? "W" : "S";
      return "B" + sub + (MAT >= 18 ? "h" : "k");
    }
    if (Tcold >= 18) {
      if (Pdry >= 60) return "Af";
      if (Pdry >= 100 - MAP / 25) return "Am";
      return "Aw";
    }
    let second;
    if (Psdry < 40 && Psdry < Pwwet / 3) second = "s";
    else if (Pwdry < Pswet / 10) second = "w";
    else second = "f";
    const warmMonths = T.filter(t => t >= 10).length;
    let third;
    if (Thot >= 22) third = "a";
    else if (warmMonths >= 4) third = "b";
    else if (Tcold < -38) third = "d";
    else third = "c";
    return (Tcold > 0 ? "C" : "D") + second + third;
  }

  const KOPPEN_TEXT = {
    Af: ["Tropical rainforest", "evergreen broadleaf forest; shade-grown coffee common"],
    Am: ["Tropical monsoon", "seasonal tropical forest with a short dry season"],
    Aw: ["Tropical savanna", "savanna and dry forest; distinct dry season aids harvest"],
    BWh: ["Hot desert", "sparse desert scrub"], BWk: ["Cold desert", "sparse steppe-desert scrub"],
    BSh: ["Hot semi-arid", "thorn scrub and dry grassland"], BSk: ["Cold semi-arid", "steppe grassland"],
    Cfa: ["Humid subtropical", "mixed broadleaf forest"], Cfb: ["Temperate oceanic / tropical highland", "montane evergreen forest; classic arabica highlands"],
    Cfc: ["Subpolar oceanic", "cool mixed forest"],
    Cwa: ["Monsoon-influenced humid subtropical", "seasonal broadleaf forest"], Cwb: ["Subtropical highland", "montane forest and grassland with dry winters; classic arabica highlands"],
    Cwc: ["Cold subtropical highland", "high montane grassland"],
    Csa: ["Hot-summer Mediterranean", "sclerophyll shrubland"], Csb: ["Warm-summer Mediterranean", "sclerophyll woodland"], Csc: ["Cold-summer Mediterranean", "cool woodland"],
    ET: ["Tundra / high alpine", "alpine grassland, no trees"], EF: ["Ice cap", "no vegetation"],
  };
  function koppenText(code) {
    if (KOPPEN_TEXT[code]) return KOPPEN_TEXT[code];
    if (code[0] === "D") return ["Continental", "boreal or temperate forest"];
    return ["Unclassified", ""];
  }

  // Rough suitability against widely quoted optimum ranges.
  // Arabica: annual mean 18–22 °C, 1200–2200 mm rain. Robusta: 22–28 °C, 1500–3000 mm.
  function coffeeFit(MAT, MAP) {
    const out = [];
    const inR = (x, a, b) => x >= a && x <= b;
    if (inR(MAT, 18, 22) && inR(MAP, 1200, 2200)) out.push("Arabica optimum");
    else if (inR(MAT, 16, 24) && inR(MAP, 1000, 2800)) out.push("Arabica marginal");
    if (inR(MAT, 22, 28) && inR(MAP, 1500, 3000)) out.push("Robusta optimum");
    else if (inR(MAT, 20, 30) && inR(MAP, 1200, 3500)) out.push("Robusta marginal");
    return out.length ? out : ["Outside typical coffee ranges"];
  }

  const api = { MONTHS, METRICS, DAILY_FIELDS, monthRange, groupMonthly, monthlyStats, meanIrradiance, tempDrop, uvRelative, koppen, koppenText, coffeeFit };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Climate = api;
})(typeof window !== "undefined" ? window : globalThis);
