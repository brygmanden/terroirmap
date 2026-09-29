/* Coffee Origin Map — main app.
 * Map: MapLibre GL with Esri World Imagery + AWS Terrain Tiles (3D, tiltable).
 * Data per clicked point:
 *   - Elevation:  Open-Meteo Elevation API (Copernicus DEM 90 m)
 *   - Weather:    Open-Meteo Historical Weather API (ERA5 / ERA5-Land daily)
 *   - Soil:       ISRIC SoilGrids v2.0 (WRB classification + topsoil properties)
 */
(function () {
  const C = window.Climate;
  const $ = id => document.getElementById(id);

  const state = {
    lat: 6.16, lon: 38.20,
    from: 0, to: 6, years: 5, metric: "rain",
    alt: null, groups: null, soil: null, loadToken: 0,
  };

  // ---------- Controls ----------
  function fillSelect(el, items, value) {
    el.innerHTML = items.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
    el.value = String(value);
  }
  fillSelect($("from"), C.MONTHS.map((m, i) => [i, m]), state.from);
  fillSelect($("to"), C.MONTHS.map((m, i) => [i, m]), state.to);
  fillSelect($("years"), Array.from({ length: 10 }, (_, i) => [i + 1, i + 1]), state.years);
  fillSelect($("metric"), Object.entries(C.METRICS).map(([k, m]) => [k, m.label]), state.metric);
  fillSelect($("region"),
    [["", "Custom point (click the map)"], ...window.COFFEE_REGIONS.map((r, i) => [i, `${r[0]} — ${r[1]}`])],
    0);

  $("from").addEventListener("change", e => { state.from = +e.target.value; renderWeather(); });
  $("to").addEventListener("change", e => { state.to = +e.target.value; renderWeather(); });
  $("metric").addEventListener("change", e => { state.metric = e.target.value; renderWeather(); });
  $("years").addEventListener("change", e => { state.years = +e.target.value; loadWeather(); });
  $("region").addEventListener("change", e => {
    if (e.target.value === "") return;
    const r = window.COFFEE_REGIONS[+e.target.value];
    selectPoint(r[2], r[3], { fly: true, zoom: r[4], keepRegion: true });
  });
  for (const id of ["lat", "lon"]) {
    $(id).addEventListener("change", () => {
      const lat = parseFloat($("lat").value), lon = parseFloat($("lon").value);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        selectPoint(lat, lon, { fly: true });
      }
    });
  }

  // ---------- Map ----------
  const TROPIC = 23.44;
  const beltGeo = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-180, -TROPIC], [180, -TROPIC], [180, TROPIC], [-180, TROPIC], [-180, -TROPIC]]] } },
    ],
  };
  const tropicLines = {
    type: "FeatureCollection",
    features: [TROPIC, -TROPIC].map(lat => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-180, lat], [180, lat]] } })),
  };
  const regionGeo = {
    type: "FeatureCollection",
    features: window.COFFEE_REGIONS.map((r, i) => ({
      type: "Feature", properties: { i, name: r[0], country: r[1] },
      geometry: { type: "Point", coordinates: [r[3], r[2]] },
    })),
  };
  const pointGeo = lat => lon => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } }] });

  const map = new maplibregl.Map({
    container: "map",
    center: [state.lon, state.lat], zoom: 5.5, pitch: 45, bearing: -10, maxPitch: 80,
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
        picked: { type: "geojson", data: pointGeo(state.lat)(state.lon) },
      },
      layers: [
        { id: "sat", type: "raster", source: "sat" },
        { id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.25, "hillshade-shadow-color": "#1b2a20" } },
        { id: "belt", type: "fill", source: "belt", paint: { "fill-color": "rgba(230,180,60,0.10)" } },
        { id: "tropics", type: "line", source: "tropics", paint: { "line-color": "rgba(240,195,80,0.8)", "line-width": 1.2, "line-dasharray": [4, 3] } },
        { id: "regions", type: "circle", source: "regions", paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 4, 8, 7], "circle-color": "#e5675c",
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } },
        { id: "picked", type: "circle", source: "picked", paint: {
          "circle-radius": 9, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#ffd166", "circle-stroke-width": 3 } },
      ],
    },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.TerrainControl({ source: "dem", exaggeration: 1.4 }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
  map.on("load", () => map.setTerrain({ source: "dem", exaggeration: 1.4 }));

  const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
  map.on("mouseenter", "regions", e => {
    map.getCanvas().style.cursor = "pointer";
    const f = e.features[0];
    hoverPopup.setLngLat(f.geometry.coordinates).setHTML(`<strong>${f.properties.name}</strong><br>${f.properties.country}`).addTo(map);
  });
  map.on("mouseleave", "regions", () => { map.getCanvas().style.cursor = ""; hoverPopup.remove(); });

  map.on("click", e => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ["regions"] })[0];
    if (hit) {
      const r = window.COFFEE_REGIONS[hit.properties.i];
      $("region").value = String(hit.properties.i);
      selectPoint(r[2], r[3], { keepRegion: true });
    } else {
      selectPoint(e.lngLat.lat, e.lngLat.lng);
    }
  });

  // ---------- Selecting a point ----------
  function selectPoint(lat, lon, opts = {}) {
    state.lat = +lat.toFixed(4);
    state.lon = +(((lon + 540) % 360) - 180).toFixed(4);
    $("lat").value = state.lat.toFixed(2);
    $("lon").value = state.lon.toFixed(2);
    if (!opts.keepRegion) $("region").value = "";
    const src = map.getSource("picked");
    if (src) src.setData(pointGeo(state.lat)(state.lon));
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
  async function getJSON(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then(async r => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
  }
  const f2 = x => x.toFixed(4);

  // ---------- Elevation ----------
  async function loadElevation() {
    const token = ++state.loadToken;
    ["alt", "dT", "uv"].forEach(id => ($(id).textContent = "…"));
    let alt = null;
    try {
      const d = await getJSON(`https://api.open-meteo.com/v1/elevation?latitude=${f2(state.lat)}&longitude=${f2(state.lon)}`);
      alt = d.elevation && d.elevation[0];
    } catch (err) {
      const q = map.queryTerrainElevation && map.queryTerrainElevation([state.lon, state.lat]);
      if (q != null) alt = q / (map.getTerrain()?.exaggeration || 1);
    }
    if (token !== state.loadToken) return;
    state.alt = alt;
    if (alt == null || Number.isNaN(alt)) {
      ["alt", "dT", "uv"].forEach(id => ($(id).textContent = "–"));
      return;
    }
    $("alt").textContent = Math.round(alt);
    $("dT").textContent = C.tempDrop(alt).toFixed(1);
    $("uv").textContent = "×" + C.uvRelative(alt).toFixed(2);
  }

  // ---------- Weather ----------
  let weatherToken = 0;
  async function loadWeather() {
    const token = ++weatherToken;
    const endYear = new Date().getFullYear() - 1; // last complete year
    const startYear = endYear - state.years + 1;
    setStatus(`Loading ${startYear}–${endYear}…`);
    const url = "https://archive-api.open-meteo.com/v1/archive"
      + `?latitude=${f2(state.lat)}&longitude=${f2(state.lon)}`
      + `&start_date=${startYear}-01-01&end_date=${endYear}-12-31`
      + `&daily=${C.DAILY_FIELDS.join(",")}&timezone=auto`;
    try {
      const d = await getJSON(url);
      if (token !== weatherToken) return;
      state.groups = C.groupMonthly(d.daily);
      state.yearSpan = [startYear, endYear];
      renderWeather();
    } catch (err) {
      if (token !== weatherToken) return;
      state.groups = null;
      setStatus("Weather data unavailable. Check your connection and try again.", true);
      $("chart").innerHTML = ""; $("table").innerHTML = "";
      $("weatherInfo").textContent = "–"; $("vegetation").textContent = "–"; $("wm2").textContent = "–";
    }
  }

  function setStatus(text, isError) {
    const el = $("status");
    el.textContent = text;
    el.classList.toggle("error", !!isError);
  }

  function renderWeather() {
    const metric = C.METRICS[state.metric];
    $("chartTitle").innerHTML = `${metric.label}<span class="unit">${metric.unit}</span>`;
    if (!state.groups) return;
    const months = C.monthRange(state.from, state.to);
    const stats = C.monthlyStats(state.groups, state.metric);
    const [y0, y1] = state.yearSpan;
    setStatus(y0 === y1 ? `${y0}` : `mean of ${y0}–${y1}, bars show range`);

    drawChart(months.map(m => stats[m]), metric);
    drawTable(months.map(m => stats[m]), metric);

    // Irradiance over selected months
    const wm2 = C.meanIrradiance(state.groups, months);
    $("wm2").textContent = wm2 == null ? "–" : Math.round(wm2);

    // Summary over the selected months
    const rain = C.monthlyStats(state.groups, "rain");
    const tMean = C.monthlyStats(state.groups, "meanT");
    const tMax = C.monthlyStats(state.groups, "maxT");
    const tMin = C.monthlyStats(state.groups, "minT");
    const sun = C.monthlyStats(state.groups, "sunshine");
    const pick = (s, ms) => ms.map(m => s[m].mean).filter(v => v != null);
    const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    const sum = xs => xs.reduce((a, b) => a + b, 0);
    const rangeName = months.length === 12 ? "All year" : `${C.MONTHS[months[0]]}–${C.MONTHS[months[months.length - 1]]}`;
    const rainSel = sum(pick(rain, months));
    const all = [...Array(12).keys()];
    const MAP = sum(pick(rain, all)), MAT = avg(pick(tMean, all));
    const fmt = (v, d = 1) => (v == null ? "–" : v.toFixed(d));

    const fit = C.coffeeFit(MAT, MAP).map(t => `<span class="fit">${t}</span>`).join(" ");
    $("weatherInfo").innerHTML =
      `<strong>${rangeName}:</strong> ${Math.round(rainSel)} mm rain, mean ${fmt(avg(pick(tMean, months)))} °C `
      + `(max ${fmt(avg(pick(tMax, months)))}, min ${fmt(avg(pick(tMin, months)))}), `
      + `${fmt(avg(pick(sun, months)))} h sunshine/day.<br>`
      + `<strong>Annual:</strong> ${Math.round(MAP)} mm, mean ${fmt(MAT)} °C. ${fit}`;

    // Vegetation via Köppen–Geiger climate class from the full-year climatology
    const T = all.map(m => tMean[m].mean), P = all.map(m => rain[m].mean);
    if (T.every(v => v != null) && P.every(v => v != null)) {
      const code = C.koppen(T, P, state.lat >= 0);
      const [name, veg] = C.koppenText(code);
      $("vegetation").innerHTML = `<strong>${code}</strong> ${name}${veg ? ` — ${veg}` : ""}. <span class="muted">Estimated from the Köppen–Geiger climate class.</span>`;
    } else {
      $("vegetation").textContent = "–";
    }
  }

  // ---------- Chart (SVG) ----------
  const tooltip = $("tooltip");
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
    const W = 400, H = 210, m = { t: 10, r: 8, b: 24, l: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = rows.flatMap(r => [r.min, r.max, r.mean]).filter(v => v != null);
    if (!vals.length) { $("chart").innerHTML = `<p class="status">No data for these months.</p>`; return; }
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const y = v => m.t + ih - ((v - lo) / (hi - lo)) * ih;
    const band = iw / rows.length, bw = Math.min(28, band * 0.6);
    const base = y(Math.max(lo, 0));

    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${metric.label} by month">`;
    for (const t of ticks) {
      s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
      s += `<text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
    }
    s += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${base}" y2="${base}"/>`;
    rows.forEach((r, i) => {
      const cx = m.l + band * i + band / 2;
      if (r.mean != null) {
        const top = y(r.mean), x0 = cx - bw / 2;
        const up = top < base, h = Math.abs(base - top), rad = Math.min(4, h);
        // Bar with 4px rounded data-end, square at the baseline.
        const d = up
          ? `M${x0},${base}V${top + rad}Q${x0},${top} ${x0 + rad},${top}H${x0 + bw - rad}Q${x0 + bw},${top} ${x0 + bw},${top + rad}V${base}Z`
          : `M${x0},${base}V${top - rad}Q${x0},${top} ${x0 + rad},${top}H${x0 + bw - rad}Q${x0 + bw},${top} ${x0 + bw},${top - rad}V${base}Z`;
        s += `<path class="bar" data-i="${i}" d="${d}"/>`;
        if (r.n > 1) {
          s += `<line class="whisker" x1="${cx}" x2="${cx}" y1="${y(r.min)}" y2="${y(r.max)}"/>`;
          s += `<line class="whisker" x1="${cx - 4}" x2="${cx + 4}" y1="${y(r.min)}" y2="${y(r.min)}"/>`;
          s += `<line class="whisker" x1="${cx - 4}" x2="${cx + 4}" y1="${y(r.max)}" y2="${y(r.max)}"/>`;
        }
      }
      s += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${C.MONTHS[r.month]}</text>`;
      s += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}"/>`;
    });
    s += `</svg>`;
    const el = $("chart");
    el.innerHTML = s;

    el.querySelectorAll(".hit").forEach(hit => {
      const i = +hit.dataset.i, r = rows[i];
      const bar = el.querySelector(`.bar[data-i="${i}"]`);
      hit.addEventListener("mousemove", ev => {
        if (r.mean == null) return;
        bar && bar.classList.add("hover");
        const d = metric.digits;
        tooltip.innerHTML = `<strong>${C.MONTHS[r.month]}</strong> · ${r.mean.toFixed(d)} ${metric.unit}`
          + (r.n > 1 ? `<br>range ${r.min.toFixed(d)} – ${r.max.toFixed(d)} (${r.n} yrs)` : "");
        tooltip.hidden = false;
        const tw = tooltip.offsetWidth;
        tooltip.style.left = Math.min(ev.clientX + 12, window.innerWidth - tw - 8) + "px";
        tooltip.style.top = ev.clientY - 44 + "px";
      });
      hit.addEventListener("mouseleave", () => { tooltip.hidden = true; bar && bar.classList.remove("hover"); });
    });
  }

  function drawTable(rows, metric) {
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
  async function loadSoil() {
    const token = ++soilToken;
    $("soilInfo").textContent = "Loading…";
    $("soilType").textContent = "Loading…";
    const base = "https://rest.isric.org/soilgrids/v2.0";
    const ll = `lon=${f2(state.lon)}&lat=${f2(state.lat)}`;
    const propUrl = `${base}/properties/query?${ll}`
      + Object.keys(SOIL_PROPS).map(p => `&property=${p}`).join("")
      + ["0-5cm", "5-15cm", "15-30cm"].map(dp => `&depth=${dp}`).join("") + "&value=mean";
    const classUrl = `${base}/classification/query?${ll}&number_classes=5`;

    const [props, cls] = await Promise.allSettled([getJSON(propUrl), getJSON(classUrl)]);
    if (token !== soilToken) return;

    // Topsoil properties, depth-weighted over 0–30 cm
    if (props.status === "fulfilled") {
      const weights = { "0-5cm": 5, "5-15cm": 10, "15-30cm": 15 };
      const parts = [];
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
        const unit = (u.target_units || "").replace("cmol(c)/kg", "cmol₍c₎/kg");
        parts.push(`${SOIL_PROPS[layer.name] || layer.name} <strong>${val.toFixed(val < 10 ? 1 : 0)}</strong>${unit && layer.name !== "phh2o" ? " " + unit : ""}`);
      }
      $("soilInfo").innerHTML = parts.length
        ? parts.join(" · ") + ` <span class="muted">(topsoil 0–30 cm)</span>`
        : `No soil data here (water, ice or built-up land).`;
    } else {
      $("soilInfo").textContent = "Soil data unavailable right now. SoilGrids may be busy; try again shortly.";
    }

    // WRB reference soil group probabilities
    if (cls.status === "fulfilled" && cls.value.wrb_class_probability?.length) {
      const probs = cls.value.wrb_class_probability.filter(p => p[1] > 0);
      $("soilType").innerHTML = `<div class="probs">` + probs.map(([name, p]) =>
        `<div class="prob"><span>${name}</span><span class="track"><span class="fill" style="width:${p}%"></span></span><span class="pct">${p}%</span></div>`
      ).join("") + `</div>`;
    } else if (cls.status === "fulfilled") {
      $("soilType").textContent = "No soil classification here.";
    } else {
      $("soilType").textContent = "Soil classification unavailable right now.";
    }
  }

  // ---------- Start ----------
  renderWeather();
  loadAll();
})();
