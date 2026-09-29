/* Terroir Map — main app.
 * Map: MapLibre GL with Esri World Imagery + AWS Terrain Tiles (3D, tiltable).
 * Data per clicked point:
 *   - Elevation:  Open-Meteo Elevation API (Copernicus DEM 90 m)
 *   - Weather:    Open-Meteo Historical Weather API (ERA5 / ERA5-Land daily)
 *   - Soil:       ISRIC SoilGrids v2.0 (WRB classification + topsoil properties)
 */
(function () {
  const C = window.Climate;
  const R = window.COFFEE_REGIONS;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Map look (the "Map" props in the Claude Design file).
  const CONFIG = {
    imagery: "color",     // "color" | "grayscale"
    exaggeration: 3,      // terrain exaggeration, 1–3
    showBelt: true,       // coffee belt shading + tropic lines
  };
  const ACCENT = "#c4274d", INK = "#201e1d";
  const wide = window.matchMedia("(min-width: 960px)").matches;

  const state = {
    lat: 6.16, lon: 38.20,
    from: 0, to: 6, years: 5, metric: "rain",
    alt: null, altLoading: true,
    groups: null, yearSpan: null, loadSpan: null, wLoading: true, wError: false,
    hover: null, showTable: false,
  };

  // ---------- Controls ----------
  function fillSelect(el, items, value) {
    el.innerHTML = items.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("");
    el.value = String(value);
  }
  fillSelect($("from"), C.MONTHS.map((m, i) => [i, m]), state.from);
  fillSelect($("to"), C.MONTHS.map((m, i) => [i, m]), state.to);
  fillSelect($("years"), Array.from({ length: 10 }, (_, i) => [i + 1, i + 1]), state.years);
  fillSelect($("region"), [["", "Custom point (tap the map)"], ...R.map((r, i) => [i, `${r[0]} — ${r[1]}`])], 0);

  $("metrics").innerHTML = Object.entries(C.METRICS).map(([k, m]) =>
    `<button type="button" role="radio" class="metric-btn" data-metric="${k}" aria-checked="${k === state.metric}">${esc(m.label)}</button>`
  ).join("");
  $("metrics").addEventListener("click", e => {
    const btn = e.target.closest("[data-metric]");
    if (!btn) return;
    state.metric = btn.dataset.metric; state.hover = null;
    $("metrics").querySelectorAll("[data-metric]").forEach(b => b.setAttribute("aria-checked", String(b === btn)));
    renderWeather();
  });

  $("from").addEventListener("change", e => { state.from = +e.target.value; state.hover = null; renderWeather(); });
  $("to").addEventListener("change", e => { state.to = +e.target.value; state.hover = null; renderWeather(); });
  $("years").addEventListener("change", e => { state.years = +e.target.value; loadWeather(); });
  $("region").addEventListener("change", e => {
    if (e.target.value === "") return;
    const r = R[+e.target.value];
    selectPoint(r[2], r[3], { fly: true, zoom: r[4], region: e.target.value });
  });

  function commitCoords() {
    const lat = parseFloat($("lat").value), lon = parseFloat($("lon").value);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
        && (lat !== state.lat || lon !== state.lon)) {
      selectPoint(lat, lon, { fly: true });
    }
  }
  for (const id of ["lat", "lon"]) {
    $(id).addEventListener("change", commitCoords);
    $(id).addEventListener("keydown", e => { if (e.key === "Enter") commitCoords(); });
  }

  $("hintBtn").addEventListener("click", () => {
    const open = !$("hint").classList.contains("open");
    $("hint").classList.toggle("open", open);
    $("hintBtn").setAttribute("aria-expanded", String(open));
    $("hintBtn").setAttribute("aria-label", open ? "Hide help" : "Show help");
  });

  $("tableBtn").addEventListener("click", () => {
    state.showTable = !state.showTable;
    $("tableBtn").textContent = state.showTable ? "Hide table" : "Show as table";
    renderWeather();
  });

  // ---------- Map ----------
  const TROPIC = 23.44;
  const beltGeo = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-180, -TROPIC], [180, -TROPIC], [180, TROPIC], [-180, TROPIC], [-180, -TROPIC]]] } };
  const tropicLines = {
    type: "FeatureCollection",
    features: [TROPIC, -TROPIC].map(lat => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-180, lat], [180, lat]] } })),
  };
  const regionGeo = {
    type: "FeatureCollection",
    features: R.map((r, i) => ({ type: "Feature", properties: { i, name: r[0], country: r[1] }, geometry: { type: "Point", coordinates: [r[3], r[2]] } })),
  };
  const pointGeo = (lat, lon) => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } }] });
  const beltVis = CONFIG.showBelt ? "visible" : "none";

  const map = new maplibregl.Map({
    container: "map",
    center: [state.lon, state.lat], zoom: wide ? 5.5 : 4.6, pitch: 45, bearing: -10, maxPitch: 80,
    attributionControl: { compact: true },
    style: {
      version: 8,
      sources: {
        sat: {
          type: "raster", tileSize: 256, maxzoom: 18,
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
        },
        dem: {
          type: "raster-dem", encoding: "terrarium", tileSize: 256, maxzoom: 15,
          tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
          attribution: "Terrain © Mapzen, AWS Terrain Tiles",
        },
        belt: { type: "geojson", data: beltGeo },
        tropics: { type: "geojson", data: tropicLines },
        regions: { type: "geojson", data: regionGeo },
        picked: { type: "geojson", data: pointGeo(state.lat, state.lon) },
      },
      layers: [
        { id: "sat", type: "raster", source: "sat", paint: { "raster-saturation": CONFIG.imagery === "grayscale" ? -1 : 0, "raster-contrast": 0.08 } },
        { id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.25, "hillshade-shadow-color": INK } },
        { id: "belt", type: "fill", source: "belt", layout: { visibility: beltVis }, paint: { "fill-color": "rgba(196,39,77,0.07)" } },
        { id: "tropics", type: "line", source: "tropics", layout: { visibility: beltVis }, paint: { "line-color": ACCENT, "line-width": 2, "line-dasharray": [3, 2] } },
        { id: "regions", type: "circle", source: "regions", paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 4, 8, 7], "circle-color": ACCENT,
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } },
        { id: "picked", type: "circle", source: "picked", paint: {
          "circle-radius": 11, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#ffffff", "circle-stroke-width": 4 } },
        { id: "picked-core", type: "circle", source: "picked", paint: {
          "circle-radius": 4, "circle-color": INK, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 } },
      ],
    },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.TerrainControl({ source: "dem", exaggeration: CONFIG.exaggeration }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
  // Start with the compact attribution collapsed to its (i) button.
  const collapseAttrib = () => {
    const a = document.querySelector("#map .maplibregl-ctrl-attrib");
    if (a) { a.classList.remove("maplibregl-compact-show"); a.removeAttribute("open"); }
  };
  map.once("styledata", () => setTimeout(collapseAttrib, 0));
  map.on("load", () => { collapseAttrib(); map.setTerrain({ source: "dem", exaggeration: CONFIG.exaggeration }); });  new ResizeObserver(() => map.resize()).observe($("map"));

  map.on("mouseenter", "regions", e => {
    map.getCanvas().style.cursor = "pointer";
    const f = e.features[0];
    $("regionCardName").textContent = f.properties.name;
    $("regionCardCountry").textContent = f.properties.country;
    $("regionCard").hidden = false;
  });
  map.on("mouseleave", "regions", () => { map.getCanvas().style.cursor = ""; $("regionCard").hidden = true; });

  map.on("click", e => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ["regions"] })[0];
    if (hit) {
      const r = R[hit.properties.i];
      selectPoint(r[2], r[3], { region: String(hit.properties.i) });
    } else {
      selectPoint(e.lngLat.lat, e.lngLat.lng);
    }
  });

  // ---------- Selecting a point ----------
  function selectPoint(lat, lon, opts = {}) {
    state.lat = +lat.toFixed(4);
    state.lon = +(((lon + 540) % 360) - 180).toFixed(4);
    state.hover = null;
    $("lat").value = state.lat.toFixed(2);
    $("lon").value = state.lon.toFixed(2);
    $("region").value = opts.region ?? "";
    const src = map.getSource("picked");
    if (src) src.setData(pointGeo(state.lat, state.lon));
    if (opts.fly) map.flyTo({ center: [state.lon, state.lat], zoom: opts.zoom || Math.max(map.getZoom(), 8), pitch: 55, essential: true });
    loadAll();
  }

  function loadAll() {
    loadElevation();
    loadWeather();
    loadSoil();
  }

  // ---------- Fetch helpers ----------
  const cache = new Map();
  function getJSON(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then(r => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
  }
  const f4 = x => x.toFixed(4);

  // ---------- Elevation ----------
  let elevToken = 0;
  async function loadElevation() {
    const token = ++elevToken;
    state.altLoading = true; renderReadouts();
    let alt = null;
    try {
      const d = await getJSON(`https://api.open-meteo.com/v1/elevation?latitude=${f4(state.lat)}&longitude=${f4(state.lon)}`);
      alt = d.elevation && d.elevation[0];
    } catch (err) {
      const q = map.queryTerrainElevation && map.queryTerrainElevation([state.lon, state.lat]);
      if (q != null) alt = q / (map.getTerrain()?.exaggeration || 1);
    }
    if (token !== elevToken) return;
    state.alt = alt == null || Number.isNaN(alt) ? null : alt;
    state.altLoading = false;
    renderReadouts();
  }

  // ---------- Weather ----------
  let weatherToken = 0;
  async function loadWeather() {
    const token = ++weatherToken;
    const endYear = new Date().getFullYear() - 1; // last complete year
    const startYear = endYear - state.years + 1;
    Object.assign(state, { wLoading: true, wError: false, loadSpan: [startYear, endYear] });
    renderWeather();
    const url = "https://archive-api.open-meteo.com/v1/archive"
      + `?latitude=${f4(state.lat)}&longitude=${f4(state.lon)}`
      + `&start_date=${startYear}-01-01&end_date=${endYear}-12-31`
      + `&daily=${C.DAILY_FIELDS.join(",")}&timezone=auto`;
    try {
      const d = await getJSON(url);
      if (token !== weatherToken) return;
      Object.assign(state, { groups: C.groupMonthly(d.daily), yearSpan: [startYear, endYear], wLoading: false });
    } catch (err) {
      if (token !== weatherToken) return;
      Object.assign(state, { groups: null, wLoading: false, wError: true });
    }
    renderWeather();
  }

  // ---------- Rendering ----------
  let irradiance = null; // W/m² over the selected months; set by renderWeather

  function renderReadouts() {
    const a = state.altLoading ? "…" : state.alt == null ? "–" : null;
    const rows = [
      { k: "Altitude", v: a || Math.round(state.alt).toLocaleString("en-US"), u: "m a.s.l.", title: "Copernicus DEM 90 m" },
      { k: "−ΔT", v: a || C.tempDrop(state.alt).toFixed(1), u: "°C vs sea level", title: "Temperature drop at 6.5 °C per 1000 m" },
      { k: "UV-Rel", v: a || "×" + C.uvRelative(state.alt).toFixed(2), u: "vs sea level", title: "About +10% UV per 1000 m" },
      { k: "Irrad.", v: irradiance == null ? "–" : String(Math.round(irradiance)), u: "W/m², period", title: "Mean shortwave irradiance over the selected months" },
    ];
    $("readouts").innerHTML = rows.map(r =>
      `<div class="readout" title="${r.title}"><span class="label">${r.k}</span><span class="readout-v">${r.v}</span><span class="readout-u">${r.u}</span></div>`
    ).join("");
  }

  function setStatus(text, isError) {
    $("status").textContent = text;
    $("status").classList.toggle("error", !!isError);
  }

  function clearWeather() {
    $("chart").innerHTML = ""; $("table").innerHTML = ""; $("table").hidden = true;
    $("rangeName").textContent = "–"; $("summary").innerHTML = ""; $("fits").innerHTML = "";
    $("kCode").textContent = "–"; $("kName").textContent = ""; $("kVeg").textContent = "";
    irradiance = null; renderReadouts();
  }

  function renderWeather() {
    const metric = C.METRICS[state.metric];
    $("metricLabel").textContent = metric.label;
    $("metricUnit").textContent = metric.unit;

    if (state.wLoading || state.wError || !state.groups) {
      const [a, b] = state.loadSpan || [];
      setStatus(state.wError ? "Weather data unavailable. Check your connection and try again."
        : state.wLoading ? `Loading ${a}–${b}…` : "–", state.wError);
      if (!state.groups || state.wError) clearWeather();
      if (!state.groups) return;
    }

    const months = C.monthRange(state.from, state.to);
    const rows = months.map(m => C.monthlyStats(state.groups, state.metric)[m]);
    const d = metric.digits;

    if (!state.wLoading) {
      const [y0, y1] = state.yearSpan;
      let status = y0 === y1 ? `${y0}` : `Mean ${y0}–${y1} · whiskers show range`;
      const h = state.hover != null && rows[state.hover];
      if (h && h.mean != null) {
        status = `${C.MONTHS[h.month]} · ${h.mean.toFixed(d)} ${metric.unit}` + (h.n > 1 ? ` · ${h.min.toFixed(d)}–${h.max.toFixed(d)}` : "");
      }
      setStatus(status);
    }

    drawChart(rows, metric);
    drawTable(rows, metric);

    irradiance = C.meanIrradiance(state.groups, months);
    renderReadouts();

    // Summary over the selected months
    const st = k => C.monthlyStats(state.groups, k);
    const rain = st("rain"), tMean = st("meanT"), tMax = st("maxT"), tMin = st("minT"), sun = st("sunshine");
    const pick = (s, ms) => ms.map(m => s[m].mean).filter(v => v != null);
    const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    const sum = xs => xs.reduce((a, b) => a + b, 0);
    const fmt = (v, n = 1) => (v == null ? "–" : v.toFixed(n));
    const all = [...Array(12).keys()];
    const MAP = sum(pick(rain, all)), MAT = avg(pick(tMean, all));

    $("rangeName").textContent = months.length === 12 ? "All year" : `${C.MONTHS[months[0]]}–${C.MONTHS[months[months.length - 1]]}`;
    const summary = [
      ["Rain, period", Math.round(sum(pick(rain, months))).toLocaleString("en-US"), "mm"],
      ["Mean temp.", fmt(avg(pick(tMean, months))), "°C"],
      ["Max / min", `${fmt(avg(pick(tMax, months)))} / ${fmt(avg(pick(tMin, months)))}`, "°C"],
      ["Sunshine", fmt(avg(pick(sun, months))), "h/day"],
      ["Annual rain", Math.round(MAP).toLocaleString("en-US"), "mm"],
      ["Annual mean", fmt(MAT), "°C"],
    ];
    $("summary").innerHTML = summary.map(([k, v, u]) =>
      `<div class="stat"><span class="stat-k">${k}</span><span class="stat-v">${v} <span class="unit">${u}</span></span></div>`
    ).join("");
    $("fits").innerHTML = C.coffeeFit(MAT, MAP).map(t =>
      `<span class="fit${/optimum/.test(t) ? " optimum" : /Outside/.test(t) ? " outside" : ""}">${t}</span>`
    ).join("");

    // Vegetation via Köppen–Geiger climate class from the full-year climatology
    const T = all.map(m => tMean[m].mean), P = all.map(m => rain[m].mean);
    if (T.every(v => v != null) && P.every(v => v != null)) {
      const code = C.koppen(T, P, state.lat >= 0);
      const [name, veg] = C.koppenText(code);
      $("kCode").textContent = code;
      $("kName").textContent = name;
      $("kVeg").textContent = veg ? veg.charAt(0).toUpperCase() + veg.slice(1) + "." : "";
    } else {
      $("kCode").textContent = "–"; $("kName").textContent = "Not enough data"; $("kVeg").textContent = "";
    }
  }

  // ---------- Chart (SVG bars + HTML labels) ----------
  function niceTicks(lo, hi, count = 4) {
    const span = hi - lo || 1;
    const step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => span / s <= count) || 10 * mag;
    const start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
    const out = [];
    for (let v = start; v <= end + step / 2; v += step) out.push(+v.toFixed(6));
    return out;
  }

  function drawChart(rows, metric) {
    const W = 400, H = 200, m = { t: 8, r: 4, b: 24, l: 38 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = rows.flatMap(r => [r.min, r.max, r.mean]).filter(v => v != null);
    if (!vals.length) { $("chart").innerHTML = `<p class="note">No data for these months.</p>`; return; }
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const y = v => m.t + ih - ((v - lo) / (hi - lo)) * ih;
    const band = iw / rows.length, bw = Math.min(26, band * 0.62), base = y(Math.max(lo, 0));
    const pct = (v, of) => (v / of * 100) + "%";

    let labels = "", svg = "";
    for (const t of ticks) {
      labels += `<span class="chart-tick" style="top:${pct(y(t), H)}">${t}</span>`;
      svg += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    }
    rows.forEach((r, i) => {
      const cx = m.l + band * i + band / 2, active = state.hover === i ? " active" : "";
      labels += `<span class="chart-month${active}" style="left:${pct(cx, W)}">${C.MONTHS[r.month].slice(0, rows.length > 8 ? 1 : 3)}</span>`;
      if (r.mean != null) {
        const top = y(r.mean);
        svg += `<rect class="bar${active}" x="${cx - bw / 2}" y="${Math.min(top, base)}" width="${bw}" height="${Math.max(Math.abs(base - top), 0.5)}"/>`;
        if (r.n > 1) {
          svg += `<line class="whisker" x1="${cx}" x2="${cx}" y1="${y(r.min)}" y2="${y(r.max)}"/>`
            + `<line class="whisker" x1="${cx - 4}" x2="${cx + 4}" y1="${y(r.min)}" y2="${y(r.min)}"/>`
            + `<line class="whisker" x1="${cx - 4}" x2="${cx + 4}" y1="${y(r.max)}" y2="${y(r.max)}"/>`;
        }
      }
      svg += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="0" width="${band}" height="${H}"/>`;
    });
    svg += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${base}" y2="${base}"/>`;

    $("chart").innerHTML = `<div class="chart-box">${labels}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${metric.label} by month">${svg}</svg></div>`;
  }

  // Hover or tap a month to read its value in the status line.
  function setHover(i) {
    if (state.hover === i) return;
    state.hover = i;
    renderWeather();
  }
  $("chart").addEventListener("pointerover", e => { const h = e.target.closest(".hit"); if (h) setHover(+h.dataset.i); });
  $("chart").addEventListener("click", e => { const h = e.target.closest(".hit"); if (h) setHover(+h.dataset.i); });
  $("chart").addEventListener("pointerleave", () => setHover(null));

  function drawTable(rows, metric) {
    $("table").hidden = !state.showTable;
    if (!state.showTable) { $("table").innerHTML = ""; return; }
    const years = [...new Set(rows.flatMap(r => r.years.map(y => y.year)))].sort();
    const d = metric.digits;
    let h = `<table><thead><tr><th>Month</th><th>Mean</th>${years.map(y => `<th>${y}</th>`).join("")}</tr></thead><tbody>`;
    for (const r of rows) {
      const byYear = Object.fromEntries(r.years.map(y => [y.year, y.v]));
      h += `<tr><td>${C.MONTHS[r.month]}</td><td>${r.mean == null ? "–" : r.mean.toFixed(d)}</td>`
        + years.map(y => `<td>${byYear[y] == null ? "–" : byYear[y].toFixed(d)}</td>`).join("") + `</tr>`;
    }
    $("table").innerHTML = h + "</tbody></table>";
  }

  // ---------- Soil (ISRIC SoilGrids) ----------
  let soilToken = 0;
  const SOIL_PROPS = {
    phh2o: "pH (H₂O)", soc: "Organic carbon", clay: "Clay", sand: "Sand", silt: "Silt", nitrogen: "Nitrogen", cec: "CEC",
  };
  function setSoil(msg, typeMsg) {
    $("soilMsg").textContent = msg; $("soilMsg").hidden = !msg;
    $("soilTypeMsg").textContent = typeMsg; $("soilTypeMsg").hidden = !typeMsg;
  }
  async function loadSoil() {
    const token = ++soilToken;
    setSoil("Loading…", "Loading…");
    $("soilProps").hidden = true; $("soilTypes").innerHTML = "";
    const base = "https://rest.isric.org/soilgrids/v2.0";
    const ll = `lon=${f4(state.lon)}&lat=${f4(state.lat)}`;
    const propUrl = `${base}/properties/query?${ll}`
      + Object.keys(SOIL_PROPS).map(p => `&property=${p}`).join("")
      + ["0-5cm", "5-15cm", "15-30cm"].map(dp => `&depth=${dp}`).join("") + "&value=mean";
    const classUrl = `${base}/classification/query?${ll}&number_classes=5`;

    const [props, cls] = await Promise.allSettled([getJSON(propUrl), getJSON(classUrl)]);
    if (token !== soilToken) return;

    // Topsoil properties, depth-weighted over 0–30 cm
    let msg;
    if (props.status === "fulfilled") {
      const weights = { "0-5cm": 5, "5-15cm": 10, "15-30cm": 15 };
      const out = [];
      for (const layer of props.value.properties?.layers || []) {
        let sum = 0, w = 0;
        for (const dp of layer.depths) {
          const v = dp.values?.mean;
          if (v == null) continue;
          sum += v * weights[dp.label]; w += weights[dp.label];
        }
        if (!w) continue;
        const u = layer.unit_measure || {};
        const val = sum / w / (u.d_factor || 1);
        const unit = layer.name === "phh2o" ? "" : (u.target_units || "").replace("cmol(c)/kg", "cmol₍c₎/kg");
        out.push(`<div class="soil-row"><span>${esc(SOIL_PROPS[layer.name] || layer.name)}</span>`
          + `<span><strong>${val.toFixed(val < 10 ? 1 : 0)}</strong> <span class="unit">${esc(unit)}</span></span></div>`);
      }
      $("soilProps").innerHTML = out.join("");
      $("soilProps").hidden = !out.length;
      msg = out.length ? "" : "No soil data here (water, ice or built-up land).";
    } else {
      msg = "Soil data unavailable right now. SoilGrids may be busy; try again shortly.";
    }

    // WRB reference soil group probabilities
    let typeMsg = "";
    const probs = cls.status === "fulfilled" ? (cls.value.wrb_class_probability || []).filter(p => p[1] > 0) : [];
    if (probs.length) {
      $("soilTypes").innerHTML = probs.map(([name, p]) =>
        `<div class="prob"><span class="prob-name">${esc(name)}</span><span class="prob-track"><span class="prob-fill" style="width:${+p}%"></span></span><span class="prob-pct">${+p}%</span></div>`
      ).join("");
    } else {
      typeMsg = cls.status === "fulfilled" ? "No soil classification here." : "Soil classification unavailable right now.";
    }
    setSoil(msg, typeMsg);
  }

  // ---------- Start ----------
  renderReadouts();
  loadAll();
})();
