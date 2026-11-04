/* Terroir Map — main app.
 * Map: MapLibre GL with Esri World Imagery + AWS Terrain Tiles (3D, tiltable).
 * Data per clicked point:
 *   - Elevation:  Open-Meteo Elevation API (Copernicus DEM 90 m); slope and aspect from a 3×3 grid of it
 *   - Weather:    Open-Meteo Historical Weather API (ERA5 / ERA5-Land daily)
 *   - Soil:       ISRIC SoilGrids v2.0 map server (WRB classification + topsoil properties; REST API as fallback)
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
    soilOpacity: 0.65,    // soil overlay strength set when the "Try the Soil Types Overlay" bubble is clicked
  };
  // Soil type overlay: most probable WRB soil group from ISRIC SoilGrids, served as a WMS
  // (map images drawn on request), so it drapes over both the flat map and the 3D terrain.
  const SOIL_WMS = "https://maps.isric.org/mapserv?map=/map/wrb.map&SERVICE=WMS&VERSION=1.3.0";
  const SOIL_GETMAP = `${SOIL_WMS}&REQUEST=GetMap&LAYERS=MostProbable&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE`;
  const SOIL_LEGEND = `${SOIL_WMS}&REQUEST=GetLegendGraphic&LAYER=MostProbable&FORMAT=image/png&SLD_VERSION=1.1.0`;
  // SoilGrids "MostProbable" class values 0–29, in its (alphabetical, WRB 2006) order.
  const SOIL_CODES = ["Acrisols", "Albeluvisols", "Alisols", "Andosols", "Arenosols", "Calcisols", "Cambisols", "Chernozems",
    "Cryosols", "Durisols", "Ferralsols", "Fluvisols", "Gleysols", "Gypsisols", "Histosols", "Kastanozems", "Leptosols",
    "Lixisols", "Luvisols", "Nitisols", "Phaeozems", "Planosols", "Plinthosols", "Podzols", "Regosols", "Solonchaks",
    "Solonetz", "Stagnosols", "Umbrisols", "Vertisols"];
  // Soil type info and colours (Prof Steven Abbott, soils.js). Albeluvisols were renamed Retisols in WRB 2014.
  const SOILS = new Map(window.SOIL_TYPES.map(t => [t.name, t]));
  const soilInfo = name => {
    const key = [...SOILS.keys()].find(g => String(name).includes(g));
    return key ? SOILS.get(key) : /Albeluvisol/.test(name) ? SOILS.get("Retisols") : null;
  };
  // Ask ISRIC's map server to draw the soil map in Abbott's colours, by sending a style (SLD) with each request.
  const soilSld = '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">'
    + "<NamedLayer><Name>MostProbable</Name><UserStyle><FeatureTypeStyle><Rule><RasterSymbolizer><ColorMap>"
    + SOIL_CODES.map((n, i) => `<ColorMapEntry color="${soilInfo(n).colour}" quantity="${i}" label="${n}"/>`).join("")
    + '<ColorMapEntry color="#000000" quantity="30" opacity="0"/>'
    + "</ColorMap></RasterSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>";
  const SOIL_TILES = `${SOIL_GETMAP}&STYLES=&SLD_BODY=${encodeURIComponent(soilSld)}`;
  const SOIL_TILES_ISRIC = `${SOIL_GETMAP}&STYLES=`; // fallback: ISRIC's own colours
  const ACCENT = "#c4274d", INK = "#201e1d", OUTLINE = "#f9f9f9";
  const FARM_COLORS = { f: "#3b9e5d", m: "#e0a526", a: "#4f7be8" }; // farm, mill, auction (also in style.css legend)
  const wide = window.matchMedia("(min-width: 960px)").matches;

  const DEFAULT_REGION = R.find(r => /^Yirgacheffe/.test(r.name)) || R[0];

  // ---------- Start place from the URL ----------
  // ?place=<country or region> opens the map on that place. It matches country names and ISO codes (Ethiopia, ET),
  // region names, aliases and ids (Yirgacheffe, ET-05), ignoring case, accents, spaces and punctuation; a repeated
  // region name can be narrowed with its country ("Eastern Province, Kenya"). Unrecognised values are ignored.
  // &isolate=1 (only with a recognised place) limits the region list to the place, hides region dots, farms, mills
  // and auctions outside it, and dims the map around it. isolate=0 (or leaving it out) shows everything.
  const placeKey = s => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  function resolvePlace(raw) {
    const q = raw ? placeKey(raw) : "";
    if (!q) return null;
    const asCountry = cc => ({ kind: "country", cc, name: R.find(r => r.cc === cc).country, regions: R.filter(r => r.cc === cc) });
    const asRegion = r => ({ kind: "region", cc: r.cc, name: r.name, region: r, regions: [r] });
    const findRegion = (list, k) => list.find(r => placeKey(r.id) === k) || list.find(r => placeKey(r.name) === k)
      || list.find(r => r.aka && r.aka.split(/[;,]/).some(a => placeKey(a) === k));
    const byId = R.find(r => placeKey(r.id) === q);
    if (byId) return asRegion(byId);
    const c = R.find(r => r.cc.toLowerCase() === q || placeKey(r.country) === q);
    if (c) return asCountry(c.cc);
    const r = findRegion(R, q);
    if (r) return asRegion(r);
    const parts = raw.split(","); // "Region, Country"
    if (parts.length === 2) {
      const pc = resolvePlace(parts[1]);
      const pr = pc && pc.kind === "country" && findRegion(pc.regions, placeKey(parts[0]));
      if (pr) return asRegion(pr);
    }
    return null;
  }
  const params = new URLSearchParams(location.search);
  const PLACE = resolvePlace(params.get("place"));
  const ISOLATE = !!PLACE && /^(1|true|yes)$/i.test((params.get("isolate") || "").trim());
  if (params.get("place") && !PLACE) console.warn(`Terroir Map: place "${params.get("place")}" was not recognised.`);
  // The point whose data loads first: the region itself, or for a country the coffee region nearest the middle of its regions.
  function startRegion() {
    if (!PLACE) return DEFAULT_REGION;
    if (PLACE.region) return PLACE.region;
    const n = PLACE.regions.length, mLat = PLACE.regions.reduce((a, r) => a + r.lat, 0) / n, mLon = PLACE.regions.reduce((a, r) => a + r.lon, 0) / n;
    return PLACE.regions.reduce((best, r) => ((r.lat - mLat) ** 2 + (r.lon - mLon) ** 2 < (best.lat - mLat) ** 2 + (best.lon - mLon) ** 2 ? r : best));
  }
  const START = startRegion();
  const PICKABLE = ISOLATE ? PLACE.regions : R; // regions offered in the drop-down and shown as dots

  const state = {
    regionId: START.id, lat: START.lat, lon: START.lon,
    from: 0, to: 6, years: 5, metric: "rain",
    alt: null, altLoading: true, slope: null, aspect: null,
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

  $("metrics").innerHTML = Object.entries(C.METRICS).map(([k, m]) =>
    `<button type="button" role="radio" class="metric-btn" data-metric="${k}" data-tip="metric.${k}" aria-checked="${k === state.metric}">${esc(m.label)}</button>`
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

  // ---------- Region picker: countries expand to show their regions ----------
  const byId = new Map(R.map(r => [r.id, r]));
  const countries = [];
  for (const r of PICKABLE) {
    const last = countries[countries.length - 1];
    if (last && last.name === r.country) last.regions.push(r);
    else countries.push({ name: r.country, regions: [r] });
  }
  const fold = s => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const expanded = new Set();
  const chev = `<svg class="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;

  function renderRegionList() {
    const q = fold($("regionSearch").value.trim());
    let html = "";
    countries.forEach((c, ci) => {
      const countryHit = q && fold(c.name).includes(q);
      const list = !q || countryHit ? c.regions : c.regions.filter(r => fold(r.name + " " + r.aka).includes(q));
      if (!list.length) return;
      const open = q ? true : expanded.has(c.name);
      html += `<div class="country"><button type="button" class="country-btn" data-country="${ci}" aria-expanded="${open}">`
        + `${esc(c.name)}<span class="country-count">${list.length}</span>${chev}</button>`;
      if (open) {
        html += `<div class="country-regions">` + list.map(r =>
          `<button type="button" class="region-item" data-region="${esc(r.id)}"${r.id === state.regionId ? ' aria-current="true"' : ""}>`
          + `<span class="region-item-name">${esc(r.name)}</span>`
          + `<span class="region-meta">${esc(r.species)}${r.aka ? " · " + esc(r.aka) : ""}</span></button>`
        ).join("") + `</div>`;
      }
      html += `</div>`;
    });
    $("regionList").innerHTML = html || `<p class="region-empty">No regions match “${esc($("regionSearch").value)}”.</p>`;
  }
  function setPicker(open) {
    $("regionPop").hidden = !open;
    $("regionBtn").setAttribute("aria-expanded", String(open));
    if (!open) return;
    const cur = byId.get(state.regionId);
    if (cur) expanded.add(cur.country);
    $("regionSearch").value = "";
    renderRegionList();
    // Scroll the list (only the list, not the page) so the current region is in the middle.
    const list = $("regionList"), sel = list.querySelector('[aria-current="true"]');
    if (sel) list.scrollTop += sel.getBoundingClientRect().top - list.getBoundingClientRect().top - (list.clientHeight - sel.offsetHeight) / 2;
    // Keyboard and mouse: type to search straight away. Touch: don't, as that would pop up the on-screen keyboard
    // over the list; tapping the search box opens it.
    if (!window.matchMedia("(pointer: coarse)").matches) $("regionSearch").focus();
  }
  function updateRegionButton() {
    const r = byId.get(state.regionId);
    $("regionBtnText").textContent = r ? `${r.name} — ${r.country}` : "Custom point (tap the map)";
  }
  $("regionBtn").addEventListener("click", () => setPicker($("regionPop").hidden));
  $("regionSearch").addEventListener("input", renderRegionList);
  $("regionList").addEventListener("click", e => {
    const cb = e.target.closest("[data-country]");
    if (cb) {
      const name = countries[+cb.dataset.country].name;
      expanded.has(name) ? expanded.delete(name) : expanded.add(name);
      renderRegionList();
      $("regionList").querySelector(`[data-country="${cb.dataset.country}"]`).focus();
      return;
    }
    const rb = e.target.closest("[data-region]");
    if (rb) {
      const r = byId.get(rb.dataset.region);
      setPicker(false);
      $("regionBtn").focus({ preventScroll: true });
      selectPoint(r.lat, r.lon, { fly: true, region: r.id });
      // Phones: the map sits above the panel, so scroll back up to show the whole map flying to the region.
      if (!window.matchMedia("(min-width: 960px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
  document.addEventListener("pointerdown", e => {
    if (!$("regionPop").hidden && !e.target.closest(".region-picker")) setPicker(false);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("regionPop").hidden) { setPicker(false); $("regionBtn").focus(); }
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

  function setHint(open) {
    $("hint").classList.toggle("open", open);
    $("hintBtn").setAttribute("aria-expanded", String(open));
    $("hintBtn").setAttribute("aria-label", open ? "Hide help" : "Show help");
    scheduleFitTopLeft();
  }
  $("hintBtn").addEventListener("click", () => setHint(!$("hint").classList.contains("open")));
  // Minimise the help box on the first click anywhere (except its own ? button) or after 15 s.
  // Presses on the other top-left controls (such as the i below it) wait for the click to finish: collapsing
  // on press would move them up under the pointer and the click would miss.
  const autoHideHint = () => {
    clearTimeout(hintTimer);
    document.removeEventListener("pointerdown", onFirstPointer, true);
    document.removeEventListener("click", onFirstClick, true);
    setHint(false);
  };
  const inTopLeft = t => t.closest(".maplibregl-ctrl-top-left");
  const onFirstPointer = e => { if (!e.target.closest("#hintBtn") && !inTopLeft(e.target)) autoHideHint(); };
  const onFirstClick = e => { if (!e.target.closest("#hintBtn") && inTopLeft(e.target)) setTimeout(autoHideHint, 0); };
  const hintTimer = setTimeout(autoHideHint, 15000);
  document.addEventListener("pointerdown", onFirstPointer, true);
  document.addEventListener("click", onFirstClick, true);

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
    features: PICKABLE.map(r => ({ type: "Feature", properties: { id: r.id, name: r.name, country: r.country }, geometry: { type: "Point", coordinates: [r.lon, r.lat] } })),
  };
  const pointGeo = (lat, lon) => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } }] });
  const beltVis = CONFIG.showBelt ? "visible" : "none";

  const map = new maplibregl.Map({
    container: "map",
    center: [state.lon, state.lat], zoom: wide ? 5.5 : 4.6, pitch: 45, bearing: -10, maxPitch: 80,
    attributionControl: false, // added below, in the top-left stack
    style: {
      version: 8,
      // Map-label glyphs built from the NoBH fonts (assets/fonts/glyphs); Chinese characters use the system font.
      glyphs: new URL("assets/fonts/glyphs/", location.href).href + "{fontstack}/{range}.pbf",
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
        // Same tiles as "dem", as a separate source for the hillshade: MapLibre renders better when 3D terrain and
        // hillshading don't share a source (the browser cache mostly avoids downloading the tiles twice).
        "dem-hillshade": {
          type: "raster-dem", encoding: "terrarium", tileSize: 256, maxzoom: 15,
          tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        },
        soil: {
          type: "raster", tiles: [SOIL_TILES], tileSize: 256, minzoom: 0, maxzoom: 13,
          attribution: "Soil types © ISRIC SoilGrids (CC BY 4.0)",
        },
        belt: { type: "geojson", data: beltGeo },
        tropics: { type: "geojson", data: tropicLines },
        regions: { type: "geojson", data: regionGeo },
        picked: { type: "geojson", data: pointGeo(state.lat, state.lon) },
        // When isolating, farms start empty and are filled with only those inside the place (see isolatePlace).
        farms: { type: "geojson", data: ISOLATE ? { type: "FeatureCollection", features: [] } : new URL("data/farms.geojson", location.href).href },
        mask: { type: "geojson", data: { type: "FeatureCollection", features: [] }, ...(ISOLATE && PLACE.kind === "country" ? { attribution: "Borders: Natural Earth" } : {}) },
        outline: { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: "Region outlines: © OpenStreetMap contributors (ODbL) via Overture Maps, IBGE, geoBoundaries" },
      },
      layers: [
        { id: "sat", type: "raster", source: "sat", paint: { "raster-saturation": CONFIG.imagery === "grayscale" ? -1 : 0, "raster-contrast": 0.08 } },
        { id: "hillshade", type: "hillshade", source: "dem-hillshade", paint: { "hillshade-exaggeration": 0.25, "hillshade-shadow-color": INK } },
        { id: "soil", type: "raster", source: "soil", layout: { visibility: "none" }, paint: { "raster-opacity": CONFIG.soilOpacity, "raster-fade-duration": 150 } },
        { id: "belt", type: "fill", source: "belt", layout: { visibility: beltVis }, paint: { "fill-color": "rgba(196,39,77,0.07)" } },
        { id: "tropics", type: "line", source: "tropics", layout: { visibility: beltVis }, paint: { "line-color": ACCENT, "line-width": 2, "line-dasharray": [3, 2] } },
        // isolate=1: everything outside the place is dimmed.
        { id: "mask", type: "fill", source: "mask", paint: { "fill-color": "rgba(20, 19, 18, 0.6)" } },
        // Selected region's outline: a faint dark casing keeps the light dashed line readable on bright imagery.
        { id: "outline-casing", type: "line", source: "outline", layout: { "line-join": "round" }, paint: { "line-color": "rgba(32,30,29,0.45)", "line-width": 4 } },
        { id: "outline", type: "line", source: "outline", layout: { "line-join": "round" }, paint: { "line-color": OUTLINE, "line-width": 2, "line-dasharray": [3, 2] } },
        // Farms, mills and auctions: coloured dots, with name (+ variety for farms) labels once zoomed in.
        // Labels that would overlap are hidden automatically, so more appear as you zoom in.
        { id: "farms", type: "circle", source: "farms", minzoom: 3, paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 1.6, 8, 3.5, 13, 6],
          "circle-color": ["match", ["get", "t"], "m", FARM_COLORS.m, "a", FARM_COLORS.a, FARM_COLORS.f],
          "circle-stroke-color": "#ffffff", "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 10, 1.2],
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.7, 7, 1] } },
        // Styled like the selected region's name label: a dark rounded box with light text, name in bold and
        // (farms only) the varieties in a smaller line underneath, sitting just above the dot.
        { id: "farm-labels", type: "symbol", source: "farms", minzoom: 9, layout: {
          "text-field": ["case", ["has", "v"],
            ["format", ["get", "n"], {}, "\n", {}, ["get", "v"], { "font-scale": 0.79, "text-font": ["literal", ["NoBH Regular"]], "text-color": "rgba(249,249,249,0.8)" }],
            ["get", "n"]],
          "text-font": ["NoBH Bold"], "text-size": 14, "text-line-height": 1.15, "text-max-width": 14,
          "text-anchor": "bottom", "text-offset": [0, -1.3], "text-justify": "center",
          "icon-image": "label-bg", "icon-text-fit": "both", "icon-text-fit-padding": [5, 10, 6, 10], "icon-anchor": "bottom",
          "text-padding": 4 },
          paint: { "text-color": "#f9f9f9" } },
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
  // Rounded dark background for farm labels (matches .region-label), drawn at 2x for sharp edges and
  // stretched around each label's text by "icon-text-fit".
  map.on("styleimagemissing", e => {
    if (e.id !== "label-bg" || map.hasImage("label-bg")) return;
    const size = 48, r = 12, c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgba(32,30,29,0.82)";
    ctx.beginPath(); ctx.roundRect(0, 0, size, size, r); ctx.fill();
    map.addImage("label-bg", ctx.getImageData(0, 0, size, size), {
      pixelRatio: 2, stretchX: [[r, size - r]], stretchY: [[r, size - r]],
    });
  });
  // Top right: zoom/compass, terrain on/off, fullscreen.
  const wideMq = window.matchMedia("(min-width: 960px)");
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.TerrainControl({ source: "dem", exaggeration: CONFIG.exaggeration }), "top-right");
  // Fullscreen takes the whole app on desktop (map + side panel) and only the map area on phones/tablets.
  // MapLibre fixes the fullscreen element when the button is created, so it is recreated (outside
  // fullscreen) when the window is resized across the 960px breakpoint.
  let fullscreen = null;
  const placeFullscreen = () => {
    if (document.fullscreenElement) return; // finish this fullscreen first; re-checked on exit below
    const container = document.querySelector(wideMq.matches ? ".app" : ".map-pane");
    if (fullscreen && fullscreen._container === container) return;
    if (fullscreen) map.removeControl(fullscreen);
    fullscreen = new maplibregl.FullscreenControl({ container });
    map.addControl(fullscreen, "top-right");
  };
  placeFullscreen();
  wideMq.addEventListener("change", placeFullscreen);
  document.addEventListener("fullscreenchange", () => {
    // Tooltips are drawn at page level; move them into the fullscreen element so they still show.
    document.getElementById("tip").hidden = true;
    (document.fullscreenElement || document.body).appendChild(document.getElementById("tip"));
    if (!document.fullscreenElement) placeFullscreen();
  });
  // Top left, stacked from the top with the same 10px spacing as the navigation buttons:
  // messages (e.g. "Loading regional data…"), help (?), credits (i). The message box is hidden when
  // empty, so ? and i only move down while a message is showing.
  const asControl = el => ({ onAdd() { el.classList.add("maplibregl-ctrl"); return el; }, onRemove() {} });
  const messages = document.querySelector(".map-topleft");
  const updateMessages = () => { messages.hidden = ![...messages.children].some(c => !c.hidden); scheduleFitTopLeft(); };
  map.addControl(asControl(messages), "top-left");
  map.addControl(asControl($("hint")), "top-left");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-left");
  updateMessages();
  // Scale: bottom right on desktop, top right (left of the navigation buttons) on phones and tablets;
  // it moves if the window is resized across the 960px breakpoint.
  const scale = new maplibregl.ScaleControl({ unit: "metric" });
  const placeScale = () => {
    if (scale._map) map.removeControl(scale);
    map.addControl(scale, wideMq.matches ? "bottom-right" : "top-right");
  };
  placeScale();
  wideMq.addEventListener("change", () => { placeScale(); scheduleFitTopLeft(); });
  // Keep the compact attribution collapsed to its (i) button until the viewer opens it.
  // MapLibre re-expands it whenever the credits change, so undo that until the viewer opens it themselves.
  const attrib = document.querySelector("#map .maplibregl-ctrl-attrib");
  if (attrib) {
    let userOpened = false;
    // Capture phase, so this runs before MapLibre's own toggle handler.
    attrib.addEventListener("click", e => { if (e.target.closest(".maplibregl-ctrl-attrib-button")) userOpened = true; }, true);
    const collapse = () => {
      if (!userOpened && attrib.classList.contains("maplibregl-compact-show")) {
        attrib.classList.remove("maplibregl-compact-show");
        attrib.removeAttribute("open");
      }
    };
    new MutationObserver(() => { collapse(); scheduleFitTopLeft(); }).observe(attrib, { attributes: true, attributeFilter: ["class"] });
    collapse();
  }

  // Keep the top-left boxes (messages, help, credits) clear of the top-right controls (navigation buttons, and
  // the scale bar on phones), with the same 10px gap: any top-left box at the same height as a top-right control
  // is narrowed to end 10px before it. The scale bar's width changes with zoom, so this re-runs on zoom,
  // resize, and whenever a top-left box opens, closes or changes.
  function fitTopLeft() {
    const gap = 10;
    const boxes = [document.querySelector(".map-topleft"), $("hint"), document.querySelector("#map .maplibregl-ctrl-attrib")]
      .filter(e => e && e.offsetParent !== null);
    const right = [...document.querySelectorAll(".maplibregl-ctrl-top-right > .maplibregl-ctrl")].filter(e => e.offsetParent !== null);
    boxes.forEach(e => { e.style.maxWidth = ""; });
    for (let pass = 0; pass < 2; pass++) { // a narrowed box gets taller, so check its new height once more
      for (const e of boxes) {
        const r = e.getBoundingClientRect();
        let limit = Infinity;
        for (const c of right) {
          const q = c.getBoundingClientRect();
          if (q.bottom > r.top && q.top < r.bottom) limit = Math.min(limit, q.left - gap);
        }
        if (r.right > limit) {
          // max-width excludes padding and border for content-box elements (MapLibre's credits box is one)
          const cs = getComputedStyle(e);
          const extra = cs.boxSizing === "content-box"
            ? ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"].reduce((t, k) => t + parseFloat(cs[k]), 0) : 0;
          e.style.maxWidth = Math.max(60, Math.floor(limit - r.left - extra)) + "px";
        }
      }
    }
  }
  // (The "queued" flag lives on the function, so it can be called before this point in the file runs.)
  function scheduleFitTopLeft() {
    if (scheduleFitTopLeft.queued) return;
    scheduleFitTopLeft.queued = true;
    requestAnimationFrame(() => { scheduleFitTopLeft.queued = false; fitTopLeft(); });
  }
  map.on("zoom", scheduleFitTopLeft);
  map.on("resize", scheduleFitTopLeft);
  scheduleFitTopLeft();
  map.on("load", () => map.setTerrain({ source: "dem", exaggeration: CONFIG.exaggeration }));
  new ResizeObserver(() => map.resize()).observe($("map"));

  // ---------- Soil type overlay ----------
  // Off by default, so no soil images are requested until someone switches it on.
  // Legend: the 30 groups SoilGrids maps, grouped by theme; each opens the soil details popup.
  $("soilLegendList").innerHTML = (() => {
    const shown = SOIL_CODES.map(soilInfo);
    const themes = new Map(); // theme -> soils, in order of first appearance in the WRB key
    for (const t of window.SOIL_TYPES.filter(t => shown.includes(t))) {
      if (!themes.has(t.theme)) themes.set(t.theme, []);
      themes.get(t.theme).push(t);
    }
    let html = "";
    for (const [theme, list] of themes) html += `<div class="soil-legend-theme">${esc(theme)}</div>` + list.map(t => `<button type="button" class="soil-legend-item" data-soil="${esc(t.name)}">`
        + `<span class="soil-swatch" style="background:${t.colour}"></span>${esc(t.name)}${t.formerly ? ` <span class="soil-legend-aka">(${esc(t.formerly)})</span>` : ""}</button>`).join("");
    return html;
  })();
  let soilErrors = 0, soilFallback = false;
  // ---------- "Try the Soil Types Overlay" nudge ----------
  // Shown on every visit, 30 s after load, if the soil slider and link haven't been used yet.
  // It closes by itself after 20 s, or when the slider, the link, the bubble or its x is used.
  try { localStorage.removeItem("terroirmap.soilOverlayUsed"); } catch (e) { /* old "don't show again" flag; no longer used */ }
  const nudge = $("soilNudge");
  function placeNudge() {
    if (nudge.hidden) return;
    const pane = nudge.parentElement.getBoundingClientRect(), b = $("soilControl").getBoundingClientRect();
    const w = nudge.offsetWidth, cx = b.left + b.width / 2 - pane.left;
    const left = Math.max(8, Math.min(cx - w / 2, pane.width - w - 8));
    nudge.style.left = left + "px";
    // Sit above the whole legend (it wraps onto two lines on phones), pointing at the soil control.
    const legendTop = $("soilControl").closest(".legend").getBoundingClientRect().top;
    nudge.style.bottom = (pane.bottom - legendTop + 10) + "px";
    $("soilNudgeArrow").style.left = (cx - left) + "px";
  }
  let nudgeHideTimer = null;
  function hideNudge() { clearTimeout(nudgeTimer); clearTimeout(nudgeHideTimer); nudge.hidden = true; }
  const nudgeTimer = setTimeout(() => {
    if (soilTouched) return;
    nudge.hidden = false;
    placeNudge();
    nudgeHideTimer = setTimeout(hideNudge, 20000);
  }, 30000);
  window.addEventListener("resize", placeNudge);
  $("soilNudgeClose").addEventListener("click", hideNudge);
  $("soilNudgeBody").addEventListener("click", () => {
    hideNudge();
    $("soilSlider").value = Math.round(CONFIG.soilOpacity * 100);
    setSoilStrength(+$("soilSlider").value);
    setSoilLegend(true);
  });

  // Slider: 0 = overlay off (nothing is requested from ISRIC); above 0 fades the soil colours in.
  let soilTouched = false; // the slider or the "Soil types" link has been used (no help bubble then)
  let soilOn = false;
  function setSoilStrength(v) {
    const on = v > 0;
    // Desktop: the legend opens when the overlay is switched on and closes when it is switched off.
    if (on !== soilOn && window.matchMedia("(min-width: 960px)").matches) setSoilLegend(on);
    soilOn = on;
    $("soilSlider").setAttribute("aria-valuetext", on ? `${v}%` : "Off");
    // Accent pill from the left end to the knob's right edge (11px knob, 2px inset); none when off.
    $("soilSliderWrap").style.setProperty("--fill", on ? `calc(11px + (100% - 15px) * ${v / 100})` : "0px");
    const apply = () => {
      const wasOn = map.getLayoutProperty("soil", "visibility") === "visible";
      if (on && !wasOn) { soilErrors = 0; $("soilLayerMsg").hidden = true; }
      map.setLayoutProperty("soil", "visibility", on ? "visible" : "none");
      map.setPaintProperty("soil", "raster-opacity", v / 100);
    };
    // Apply as soon as the soil layer exists. (Not map.isStyleLoaded(): that is false while soil images are
    // still downloading, i.e. during a drag, and waiting for "load" then never happens, so the change was lost.)
    map.getLayer("soil") ? apply() : map.once("load", apply);
  }
  $("soilSlider").addEventListener("input", e => { soilTouched = true; hideNudge(); setSoilStrength(+e.target.value); });
  // Also apply the final position when the knob is released (or set with the keyboard).
  $("soilSlider").addEventListener("change", e => setSoilStrength(+e.target.value));
  // "Soil types" link: shows or hides the colour legend.
  function setSoilLegend(open) {
    $("soilPanel").hidden = !open;
    $("soilLegendLink").setAttribute("aria-expanded", String(open));
  }
  $("soilLegendLink").addEventListener("click", () => { soilTouched = true; hideNudge(); setSoilLegend($("soilPanel").hidden); });
  // The legend starts hidden everywhere (on desktop it opens with the overlay; see setSoilStrength).
  setSoilLegend(false);
  $("soilLegendImg").addEventListener("error", () => { $("soilLegendImg").hidden = true; });
  // If ISRIC's server refuses the custom colours, fall back to its own colours and legend image.
  map.on("error", e => {
    if (e.sourceId !== "soil") return;
    if (soilFallback && /SLD_BODY/.test(e.error && e.error.url || "")) return; // late failures of custom-colour tiles
    if (++soilErrors < 3) return;
    if (!soilFallback) {
      soilFallback = true; soilErrors = 0;
      map.getSource("soil").setTiles([SOIL_TILES_ISRIC]);
      $("soilLegendList").hidden = true;
      $("soilLegendImg").src = SOIL_LEGEND; $("soilLegendImg").hidden = false;
      $("soilLayerMsg").textContent = "Showing ISRIC's own colours: the soil map service didn't accept the custom colours.";
    } else {
      $("soilLayerMsg").textContent = "The soil map service isn't responding right now. Try again later.";
    }
    $("soilLayerMsg").hidden = false;
  });

  map.on("mouseenter", "regions", e => {
    map.getCanvas().style.cursor = "pointer";
    const f = e.features[0];
    $("regionCardName").textContent = f.properties.name;
    $("regionCardCountry").textContent = f.properties.country;
    $("regionCard").hidden = false;
  });
  map.on("mouseleave", "regions", () => { map.getCanvas().style.cursor = ""; $("regionCard").hidden = true; });

  // Hovering a farm, mill or auction shows its name, type, variety and how exact its position is.
  const FARM_TYPE = { f: "Farm", m: "Mill", a: "Auction" };
  const FARM_PREC = { e: "exact location", t: "approximate location (town)", m: "approximate location (municipality)", s: "approximate location (state centroid)" };
  map.on("mousemove", "farms", e => {
    if (map.queryRenderedFeatures(e.point, { layers: ["regions"] }).length) return;
    map.getCanvas().style.cursor = "pointer";
    const p = e.features[0].properties;
    $("regionCardName").textContent = p.n;
    $("regionCardCountry").textContent = [FARM_TYPE[p.t], p.v, FARM_PREC[p.p]].filter(Boolean).join(" · ");
    $("regionCard").hidden = false;
  });
  map.on("mouseleave", "farms", () => { map.getCanvas().style.cursor = ""; $("regionCard").hidden = true; });

  map.on("click", e => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ["regions"] })[0];
    if (hit) {
      const r = byId.get(hit.properties.id);
      selectPoint(r.lat, r.lon, { region: r.id });
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
    state.regionId = opts.region || null;
    updateRegionButton();
    const src = map.getSource("picked");
    if (src) src.setData(pointGeo(state.lat, state.lon));
    showRegion(state.regionId, opts.fly);
    if (opts.fly && !state.regionId) map.flyTo({ center: [state.lon, state.lat], zoom: Math.max(map.getZoom(), 8), pitch: 55, essential: true });
    loadAll();
  }

  // ---------- Selected region: name label + dashed outline ----------
  // Outlines live in data/outlines/<country code>.json and are fetched per country when first needed.
  const labelEl = document.createElement("div");
  labelEl.className = "region-label";
  const regionLabel = new maplibregl.Marker({ element: labelEl, anchor: "bottom", offset: [0, -12], opacityWhenCovered: "1" });
  const outlineFiles = new Map();
  function loadOutline(r) {
    if (!outlineFiles.has(r.cc)) {
      const p = fetch(`data/outlines/${r.cc}.json`).then(res => { if (!res.ok) throw new Error(res.status); return res.json(); });
      p.catch(() => outlineFiles.delete(r.cc));
      outlineFiles.set(r.cc, p);
    }
    return outlineFiles.get(r.cc).then(d => d[r.id] || null);
  }
  function geomBounds(g) {
    const b = new maplibregl.LngLatBounds();
    const walk = c => (typeof c[0] === "number" ? b.extend(c) : c.forEach(walk));
    walk(g.coordinates);
    return b;
  }
  function setOutline(geom) {
    const data = { type: "FeatureCollection", features: geom ? [{ type: "Feature", properties: {}, geometry: geom }] : [] };
    const apply = () => map.getSource("outline").setData(data);
    map.getSource("outline") ? apply() : map.once("load", apply);
  }
  // Shows region `id` (or clears with null). With fit, zooms to its outline (or its label point if it has none).
  async function showRegion(id, fit) {
    const r = id ? byId.get(id) : null;
    setOutline(null);
    if (!r) { regionLabel.remove(); return; }
    labelEl.innerHTML = `<span class="region-label-name">${esc(r.name)}</span><span class="region-label-country">${esc(r.country)}</span>`;
    labelEl.title = r.units ? `Outline: ${r.approx ? "approximated from " : ""}${r.units}` : "";
    regionLabel.setLngLat([r.lon, r.lat]).addTo(map);
    let geom = null;
    try { geom = await loadOutline(r); } catch (err) { /* no outline: label only */ }
    if (state.regionId !== id) return; // another selection happened meanwhile
    setOutline(geom);
    if (!fit) return;
    if (geom) map.fitBounds(geomBounds(geom), { padding: 60, pitch: 50, maxZoom: 11, essential: true });
    else map.flyTo({ center: [r.lon, r.lat], zoom: 9, pitch: 55, essential: true });
  }
  updateRegionButton();
  $("lat").value = state.lat.toFixed(2);
  $("lon").value = state.lon.toFixed(2);
  showRegion(state.regionId, PLACE && PLACE.kind === "region"); // a region from ?place= is zoomed to its outline
  if (PLACE && PLACE.kind === "country") fitCountry(PLACE);
  if (ISOLATE) isolatePlace(PLACE);

  // ---------- ?place= a country: frame all its coffee regions ----------
  async function fitCountry(place) {
    const geoms = await Promise.all(place.regions.map(r => loadOutline(r).catch(() => null)));
    const b = new maplibregl.LngLatBounds();
    place.regions.forEach((r, i) => (geoms[i] ? b.extend(geomBounds(geoms[i])) : b.extend([r.lon, r.lat])));
    map.fitBounds(b, { padding: 40, pitch: 45, maxZoom: 9, essential: true });
  }

  // ---------- isolate=1: dim the map outside the place and hide farms, mills and auctions outside it ----------
  // A country uses its border (data/countries.json, Natural Earth 1:50m); a region uses its outline. A country
  // without a border in that file (Réunion) uses the outlines of its coffee regions instead.
  async function placeGeometry(place) {
    if (place.kind === "region") return loadOutline(place.region);
    try {
      const res = await fetch("data/countries.json");
      if (res.ok) { const d = await res.json(); if (d[place.cc]) return d[place.cc]; }
    } catch (err) { /* fall back to the region outlines */ }
    const parts = (await Promise.all(place.regions.map(r => loadOutline(r).catch(() => null)))).filter(Boolean);
    const polys = parts.flatMap(g => (g.type === "Polygon" ? [g.coordinates] : g.coordinates));
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
  }
  const polygonsOf = g => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // Inside the place, or within `km` of its edge (borders are simplified, so coastal and border farms can sit just outside).
  function placeTest(geom, km) {
    const polys = polygonsOf(geom).map(p => {
      const b = geomBounds({ coordinates: p[0] });
      return { rings: p, w: b.getWest(), e: b.getEast(), s: b.getSouth(), n: b.getNorth() };
    });
    const tol = km / 111.32; // degrees of latitude
    const nearRing = (x, y, ring, k) => {
      for (let i = 1; i < ring.length; i++) {
        const ax = ring[i - 1][0] * k, ay = ring[i - 1][1], bx = ring[i][0] * k, by = ring[i][1], px = x * k;
        const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (y - ay) * dy) / len)) : 0;
        if ((ax + t * dx - px) ** 2 + (ay + t * dy - y) ** 2 < tol * tol) return true;
      }
      return false;
    };
    return (x, y) => {
      const k = Math.cos(y * Math.PI / 180), tx = tol / Math.max(k, 0.1);
      for (const p of polys) {
        if (x < p.w - tx || x > p.e + tx || y < p.s - tol || y > p.n + tol) continue;
        if (inRing(x, y, p.rings[0]) && !p.rings.slice(1).some(h => inRing(x, y, h))) return true;
        if (nearRing(x, y, p.rings[0], k)) return true;
      }
      return false;
    };
  }
  async function isolatePlace(place) {
    const [geom, farms] = await Promise.all([
      placeGeometry(place).catch(() => null),
      fetch("data/farms.geojson").then(r => r.json()).catch(() => null),
    ]);
    let farmData = farms || { type: "FeatureCollection", features: [] }, mask = { type: "FeatureCollection", features: [] };
    if (geom) {
      const inside = placeTest(geom, 3);
      farmData = { type: "FeatureCollection", features: farmData.features.filter(f => inside(...f.geometry.coordinates)) };
      // One world-sized polygon with a hole for each part of the place (holes kept just inside ±180° so they never touch the edge).
      const clampX = c => [Math.max(-179.999, Math.min(179.999, c[0])), c[1]];
      const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
      mask.features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...polygonsOf(geom).map(p => p[0].map(clampX))] } });
    }
    const apply = () => { map.getSource("farms").setData(farmData); map.getSource("mask").setData(mask); };
    map.getSource("mask") ? apply() : map.once("load", apply);
  }

  // "Loading regional data…" shows while any of altitude, weather or soil is still loading.
  const pending = new Set();
  function setLoading(kind, on) {
    on ? pending.add(kind) : pending.delete(kind);
    $("loading").hidden = pending.size === 0;
    updateMessages();
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

  // ---------- Elevation, slope and aspect ----------
  // One request for a 3×3 grid of points 90 m apart (the elevation model's detail) centred on the chosen point.
  // The centre gives the altitude; the grid gives slope and aspect with Horn's method (as used by GIS hillshading).
  const GRID_M = 90;
  function gridPoints(lat, lon) {
    const dLat = GRID_M / 111320, dLon = GRID_M / (111320 * Math.cos(lat * Math.PI / 180));
    const pts = [];
    for (const r of [1, 0, -1]) for (const c of [-1, 0, 1]) pts.push([lat + r * dLat, lon + c * dLon]); // rows north → south
    return pts;
  }
  function slopeAspect(z) {
    if (z.length !== 9 || z.some(v => v == null || Number.isNaN(v))) return { slope: null, aspect: null };
    const [a, b, c, d, , f, g, h, i] = z;
    const dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * GRID_M); // rise towards the east
    const dzdy = ((a + 2 * b + c) - (g + 2 * h + i)) / (8 * GRID_M); // rise towards the north
    const slope = Math.atan(Math.hypot(dzdx, dzdy)) * 180 / Math.PI;
    // Aspect: the compass direction the slope faces (downhill), clockwise from north.
    const aspect = (Math.atan2(-dzdx, -dzdy) * 180 / Math.PI + 360) % 360;
    return { slope, aspect };
  }
  let elevToken = 0;
  async function loadElevation() {
    const token = ++elevToken;
    state.altLoading = true; renderReadouts(); setLoading("elevation", true);
    const pts = gridPoints(state.lat, state.lon);
    let z = null;
    try {
      const d = await getJSON(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p[0].toFixed(6)).join(",")}&longitude=${pts.map(p => p[1].toFixed(6)).join(",")}`);
      z = d.elevation;
    } catch (err) {
      // Offline fallback: the map's own terrain tiles (coarser, and only while terrain is on).
      if (map.queryTerrainElevation) {
        const ex = map.getTerrain()?.exaggeration || 1;
        z = pts.map(([la, lo]) => { const q = map.queryTerrainElevation([lo, la]); return q == null ? null : q / ex; });
      }
    }
    if (token !== elevToken) return;
    setLoading("elevation", false);
    const alt = z && z[4];
    state.alt = alt == null || Number.isNaN(alt) ? null : alt;
    Object.assign(state, z ? slopeAspect(z) : { slope: null, aspect: null });
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
    setLoading("weather", true);
    renderWeather();
    const url = "https://archive-api.open-meteo.com/v1/archive"
      + `?latitude=${f4(state.lat)}&longitude=${f4(state.lon)}`
      + `&start_date=${startYear}-01-01&end_date=${endYear}-12-31`
      + `&daily=${C.DAILY_FIELDS.join(",")}&timezone=auto`;
    try {
      const d = await getJSON(url);
      if (token !== weatherToken) return;
      Object.assign(state, { groups: C.groupMonthly(d.daily), yearSpan: [startYear, endYear], wLoading: false });
      setLoading("weather", false);
    } catch (err) {
      if (token !== weatherToken) return;
      Object.assign(state, { groups: null, wLoading: false, wError: true });
      setLoading("weather", false);
    }
    renderWeather();
  }

  // ---------- Rendering ----------
  let irradiance = null; // W/m² over the selected months; set by renderWeather

  const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const FLAT_DEG = 1; // below this the ground is essentially flat and has no meaningful facing
  function slopeRow() {
    const pending = state.altLoading ? "…" : state.slope == null ? "–" : null;
    const deg = state.slope;
    return { k: "Slope", tip: "slope", wide: true, g: slopeSvg(pending ? null : deg),
      v: pending || (deg < 10 ? deg.toFixed(1) : Math.round(deg)) + "°",
      u: pending ? "steepness" : `${Math.round(Math.tan(deg * Math.PI / 180) * 100)}% gradient` };
  }
  function aspectRow() {
    const pending = state.altLoading ? "…" : state.aspect == null ? "–" : null;
    if (pending) return { k: "Aspect", v: pending, u: "direction faced", tip: "aspect", wide: true, g: compassSvg(null) };
    if (state.slope < FLAT_DEG) return { k: "Aspect", v: "Flat", u: "no clear facing", tip: "aspect", wide: true, g: compassSvg("flat") };
    return { k: "Aspect", v: COMPASS[Math.round(state.aspect / 45) % 8], u: `faces ${Math.round(state.aspect)}°`, tip: "aspect", wide: true, g: compassSvg(state.aspect) };
  }
  // Slope drawing: a hillside triangle at the true angle, with the angle marked where it meets the level ground.
  function slopeSvg(deg) {
    const B = 50, R = 92, maxW = 84, maxH = 44;
    let shape = "";
    if (deg != null) {
      const a = deg * Math.PI / 180, t = Math.tan(a);
      const w = t * maxW <= maxH ? maxW : maxH / t, h = w * t, x0 = R - w;
      const r = Math.min(16, w * 0.6), ax = x0 + r * Math.cos(a), ay = B - r * Math.sin(a);
      shape = `<path d="M${x0.toFixed(1)} ${B}L${R} ${B}L${R} ${(B - h).toFixed(1)}Z" class="g-fill"/>`
        + (deg >= 1 ? `<path d="M${(x0 + r).toFixed(1)} ${B}A${r} ${r} 0 0 0 ${ax.toFixed(1)} ${ay.toFixed(1)}" class="g-line"/>` : "")
        + `<path d="M${x0.toFixed(1)} ${B}L${R} ${(B - h).toFixed(1)}" class="g-accent"/>`;
    }
    return `<svg class="readout-g" width="96" height="56" viewBox="0 0 96 56" aria-hidden="true"><path d="M4 ${B}H${R}" class="g-base"/>${shape}</svg>`;
  }
  // Aspect drawing: a compass ring with N marked; the red needle points the way the slope faces (downhill).
  function compassSvg(deg) {
    const ticks = [0, 90, 180, 270].map(d => `<path d="M28 13v4" transform="rotate(${d} 28 33)" class="g-base"/>`).join("");
    const needle = deg == null ? "" : deg === "flat" ? `<circle cx="28" cy="33" r="3" class="g-dot"/>`
      : `<g transform="rotate(${Math.round(deg)} 28 33)"><path d="M28 16L33 33H23Z" class="g-needle"/><path d="M23 33H33L28 48Z" class="g-tail"/></g>`;
    return `<svg class="readout-g" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">`
      + `<circle cx="28" cy="33" r="20" class="g-ring"/>${ticks}<text x="28" y="9" class="g-n">N</text>${needle}</svg>`;
  }

  function renderReadouts() {
    const a = state.altLoading ? "…" : state.alt == null ? "–" : null;
    const rows = [
      { k: "Altitude", v: a || Math.round(state.alt).toLocaleString("en-US"), u: "m a.s.l.", tip: "altitude" },
      { k: "−ΔT", v: a || C.tempDrop(state.alt).toFixed(1), u: "°C vs sea level", tip: "deltaT" },
      { k: "UV-Rel", v: a || "×" + C.uvRelative(state.alt).toFixed(2), u: "vs sea level", tip: "uvRel" },
      { k: "Irrad.", v: irradiance == null ? "–" : String(Math.round(irradiance)), u: "W/m², period", tip: "irradiance" },
      slopeRow(), aspectRow(),
    ];
    $("readouts").innerHTML = rows.map(r =>
      `<div class="readout${r.wide ? " readout-wide" : ""}" data-tip="${r.tip}"><span class="label term">${r.k}</span><span class="readout-v">${r.v}</span><span class="readout-u">${r.u}</span>${r.g || ""}</div>`
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
    delete $("kCode").dataset.tip;
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
      ["Rain, period", Math.round(sum(pick(rain, months))).toLocaleString("en-US"), "mm", "rainPeriod"],
      ["Mean temp.", fmt(avg(pick(tMean, months))), "°C", "meanTemp"],
      ["Max / min", `${fmt(avg(pick(tMax, months)))} / ${fmt(avg(pick(tMin, months)))}`, "°C", "maxMin"],
      ["Sunshine", fmt(avg(pick(sun, months))), "h/day", "sunshine"],
      ["Annual rain", Math.round(MAP).toLocaleString("en-US"), "mm", "annualRain"],
      ["Annual mean", fmt(MAT), "°C", "annualMean"],
    ];
    $("summary").innerHTML = summary.map(([k, v, u, tip]) =>
      `<div class="stat" data-tip="stat.${tip}"><span class="stat-k term">${k}</span><span class="stat-v">${v} <span class="unit">${u}</span></span></div>`
    ).join("");
    $("fits").innerHTML = C.coffeeFit(MAT, MAP).map(t =>
      `<span class="fit${/optimum/.test(t) ? " optimum" : /Outside/.test(t) ? " outside" : ""}" data-tip="fit.${t}">${t}</span>`
    ).join("");

    // Vegetation via Köppen–Geiger climate class from the full-year climatology
    const T = all.map(m => tMean[m].mean), P = all.map(m => rain[m].mean);
    if (T.every(v => v != null) && P.every(v => v != null)) {
      const code = C.koppen(T, P, state.lat >= 0);
      const [name, veg] = C.koppenText(code);
      $("kCode").textContent = code;
      $("kCode").dataset.tip = "koppen." + code;
      $("kName").textContent = name;
      $("kVeg").textContent = veg ? veg.charAt(0).toUpperCase() + veg.slice(1) + "." : "";
    } else {
      $("kCode").textContent = "–"; $("kName").textContent = "Not enough data"; $("kVeg").textContent = "";
      delete $("kCode").dataset.tip;
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

  // ---------- Soil values at a point ----------
  // ISRIC's REST API (rest.isric.org) is paused and limited to 5 requests a minute, so values come from the SoilGrids
  // map server (maps.isric.org), which also draws the soil overlay. The app first reads the server's own description
  // (GetCapabilities: layer names and the reply formats it offers), then for each map asks either:
  //   1. GetFeatureInfo, "what is the value here?", in a format the server offers (JSON, GML/XML or plain text), or
  //   2. if it can't answer that, a 3×3-pixel GetMap image drawn with a custom style in which every value has its own
  //      colour (the same kind of request as the overlay), and reads the value back from the middle pixel.
  // The REST API is the last resort. Every request has a time limit. Opening the page with ?soildebug=1 writes each
  // step to the browser console ("Terroir Map soil: …") to diagnose problems on the live site.
  const SOIL_SERVER = "https://maps.isric.org/mapserv";
  const SOIL_TIMEOUT = 10000;
  const SOIL_DEPTHS = { "0-5cm": 5, "5-15cm": 10, "15-30cm": 15 }; // cm thickness, for the 0–30 cm average
  // The maps store whole numbers; divide by these to get the units shown (as in the SoilGrids documentation).
  // max/step: the value range covered by the colour-coded image fallback (see codeSld).
  const SOIL_UNITS = {
    phh2o: { div: 10, unit: "", max: 140, step: 4 }, soc: { div: 10, unit: "g/kg", max: 4095, step: 64 },
    clay: { div: 10, unit: "%", max: 1000, step: 16 }, sand: { div: 10, unit: "%", max: 1000, step: 16 },
    silt: { div: 10, unit: "%", max: 1000, step: 16 }, nitrogen: { div: 100, unit: "g/kg", max: 4095, step: 64 },
    cec: { div: 10, unit: "cmol₍c₎/kg", max: 1023, step: 16 },
  };
  const SOIL_DEBUG = params.has("soildebug"); // ?soildebug=1 writes what the soil loading did to the browser console
  let soilLog = [];
  const slog = msg => soilLog.push(msg);
  const replied = msg => Object.assign(new Error(msg), { replied: true }); // the server answered, but not usefully
  const soilCache = new Map();
  function soilFetch(url, as = "text", ms = SOIL_TIMEOUT) {
    const key = as + " " + url;
    if (soilCache.has(key)) return soilCache.get(key);
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), ms);
    const p = fetch(url, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw replied(`HTTP ${r.status}`); return as === "blob" ? r.blob() : r.text(); })
      .catch(err => {
        throw err.name === "AbortError" ? Object.assign(new Error(`no answer within ${ms / 1000} s`), { timeout: true })
          : err.replied ? err : new Error(`request blocked or failed (${err.message})`);
      })
      .finally(() => clearTimeout(timer));
    soilCache.set(key, p);
    p.catch(() => soilCache.delete(key));
    return p;
  }
  const mapUrl = (name, params) => `${SOIL_SERVER}?map=/map/${name}.map&SERVICE=WMS&VERSION=1.3.0&${params}`;
  const xmlDoc = text => {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw replied("unreadable XML reply");
    return doc;
  };
  const snippet = text => String(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);

  // The server's description of one map: GetFeatureInfo formats and layers (with whether each can be queried).
  const capsCache = new Map();
  function soilCaps(name) {
    if (!capsCache.has(name)) {
      const p = soilFetch(mapUrl(name, "REQUEST=GetCapabilities"), "text", 8000).then(text => {
        if (/ServiceException/i.test(text)) throw replied(`capabilities error: ${snippet(text)}`);
        const all = [...xmlDoc(text).getElementsByTagName("*")];
        const gfi = all.find(e => e.localName === "GetFeatureInfo");
        const formats = gfi ? [...gfi.children].filter(e => e.localName === "Format").map(e => e.textContent.trim()) : [];
        const layers = new Map();
        for (const L of all.filter(e => e.localName === "Layer")) {
          const n = [...L.children].find(c => c.localName === "Name");
          if (n) layers.set(n.textContent.trim(), L.getAttribute("queryable") === "1");
        }
        return { formats, layers };
      });
      p.catch(() => capsCache.delete(name));
      capsCache.set(name, p);
    }
    return capsCache.get(name);
  }
  // Reply formats in order of preference. GML/XML and plain text answer for many layers in one request (8 requests per
  // point); GeoJSON needs one request per layer (52), so it comes last. (ISRIC's GML replies carry no values, so
  // there the app settles on plain text or GeoJSON, and remembers which in this browser.)
  const GFI_FORMATS = [["application/vnd.ogc.gml", "xml"], ["text/xml", "xml"], ["application/xml", "xml"], ["text/plain", "text"],
    ["application/geo+json", "json"], ["application/json", "json"], ["geojson", "json"]];
  function pickFormats(offered) {
    const out = [];
    for (const [f, kind] of GFI_FORMATS) {
      const m = offered.find(o => o.toLowerCase().startsWith(f) && !out.some(x => x.fmt === o));
      if (m) out.push({ fmt: m, kind });
    }
    return out;
  }
  // The first format that has returned real values. Until one has, an empty reply (e.g. a GML reply this app can't
  // match up) is retried in the next format; afterwards an empty reply just means "no data here" (sea, ice, towns).
  // Remembered in this browser (if storage is available), so later visits go straight to the working format.
  const SOIL_FMT_KEY = "terroirmap.soilFormat";
  let soilFmtConfirmed = null;
  try { soilFmtConfirmed = localStorage.getItem(SOIL_FMT_KEY); } catch (err) { /* storage blocked: work it out again */ }
  let soilFmtVerifiedNow = false; // true once the confirmed format has returned values during this visit
  function confirmSoilFmt(fmt) {
    soilFmtVerifiedNow = true;
    if (soilFmtConfirmed === fmt) return;
    soilFmtConfirmed = fmt;
    try { localStorage.setItem(SOIL_FMT_KEY, fmt); } catch (err) { /* fine: only remembered for this visit */ }
  }
  // The pixel value among a feature's attributes: a known name if present, otherwise the first number that isn't a
  // coordinate, id or colour.
  const firstNumber = props => {
    if (!props) return NaN;
    for (const k of ["pixel_value", "value_0", "value_list", "value", "pixel", "GRAY_INDEX", "band_1", "Band1"]) if (props[k] != null && props[k] !== "") return parseFloat(props[k]);
    const v = Object.entries(props).find(([k, x]) => !/^(x|y|class|red|green|blue|fid|gml_id|id|name)$/i.test(k) && x !== "" && Number.isFinite(parseFloat(x)));
    return v == null ? NaN : parseFloat(v[1]);
  };
  const rawSample = text => String(text).replace(/\s+/g, " ").trim().slice(0, 400);
  const withSample = (out, text) => Object.defineProperty(out, "sample", { value: rawSample(text) }); // not counted as a value
  function* ancestorsUpTo(el, stop) { for (let a = el.parentElement; a && a !== stop; a = a.parentElement) yield a; }
  // { layer: value } from a GetFeatureInfo reply.
  function parseGfi(text, kind, layers) {
    if (/ServiceException/i.test(text)) throw replied(`server error: ${snippet(text)}`);
    const out = {};
    if (kind === "json") { // one layer per request in this format
      let j;
      try { j = JSON.parse(text); } catch (err) { throw replied(`unreadable JSON reply: ${snippet(text)}`); }
      const f = (j.features || [])[0];
      if (f) out[layers[0]] = firstNumber(f.properties);
      return withSample(out, JSON.stringify(f ? f.properties : j));
    }
    if (kind === "xml") {
      // Features are the elements named <layer>_feature (MapServer GML 2) or the children of featureMember/member
      // (GML 3). Their attributes are the child elements outside the gml: namespace (which holds geometry and bounds).
      // Layer names are matched ignoring case and punctuation, from the element names or a gml:name.
      const doc = xmlDoc(text);
      const norm = n => String(n).toLowerCase().replace(/[^a-z0-9]/g, "");
      const byNorm = new Map(layers.map(l => [norm(l), l]));
      const isGml = el => /^http:\/\/www\.opengis\.net\/gml/.test(el.namespaceURI || "");
      const layerOf = el => {
        for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
          const base = norm(a.localName.replace(/_(layer|feature)$/i, ""));
          if (byNorm.has(base)) return byNorm.get(base);
          const nm = [...a.children].find(c => c.localName === "name");
          if (nm && byNorm.has(norm(nm.textContent))) return byNorm.get(norm(nm.textContent));
        }
        return layers.length === 1 ? layers[0] : null;
      };
      const feats = [...doc.getElementsByTagName("*")].filter(e =>
        /_feature$/i.test(e.localName) || /^(featureMember|member)$/.test(e.parentElement ? e.parentElement.localName : ""));
      for (const f of feats) {
        const layer = layerOf(f);
        if (!layer || layer in out) continue;
        const props = {};
        for (const leaf of f.getElementsByTagName("*")) {
          if (leaf.children.length || isGml(leaf) || [...ancestorsUpTo(leaf, f)].some(isGml)) continue;
          if (!(leaf.localName in props)) props[leaf.localName] = leaf.textContent.trim();
        }
        const v = firstNumber(props);
        if (Number.isFinite(v)) out[layer] = v;
      }
      // Sample for the console: the first feature (or layer) as sent, which shows how the server names its values.
      const first = feats[0] || [...doc.getElementsByTagName("*")].find(e => /_layer$/i.test(e.localName)) || doc.documentElement;
      return withSample(out, new XMLSerializer().serializeToString(first).replace(/ xmlns(:\w+)?="[^"]*"/g, ""));
    }
    if (!/GetFeatureInfo results/i.test(text)) throw replied(`unexpected reply: ${snippet(text)}`);
    // Plain text: "Layer 'name'" headings, each followed by "  key = 'value'" lines for its feature(s).
    const norm = n => String(n).toLowerCase().replace(/[^a-z0-9]/g, "");
    const byNorm = new Map(layers.map(l => [norm(l), l]));
    const props = {};
    let layer = null, firstSection = "";
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*Layer '([^']+)'/);
      if (m) { layer = byNorm.get(norm(m[1])) || (layers.length === 1 ? layers[0] : null); continue; }
      const kv = line.match(/^\s*([\w.:-]+)\s*=\s*'([^']*)'/);
      if (layer && kv) {
        (props[layer] = props[layer] || {})[kv[1]] ??= kv[2];
        if (!firstSection || firstSection.startsWith(layer + ":")) firstSection = firstSection || `${layer}:`, firstSection += ` ${kv[1]}='${kv[2]}'`;
      }
    }
    for (const [l, p] of Object.entries(props)) { const v = firstNumber(p); if (Number.isFinite(v)) out[l] = v; }
    return withSample(out, firstSection || text);
  }
  // A 3×3-pixel image 120 m across centred on the point, in the overlay's EPSG:3857 grid (SoilGrids cells are 250 m).
  function pointBox(lat, lon) {
    const R = 6378137, x = R * lon * Math.PI / 180, y = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)), d = 60;
    return `CRS=EPSG:3857&BBOX=${(x - d).toFixed(1)},${(y - d).toFixed(1)},${(x + d).toFixed(1)},${(y + d).toFixed(1)}&WIDTH=3&HEIGHT=3`;
  }
  const gfiUrl = (name, list, fmt, lat, lon) => mapUrl(name, `REQUEST=GetFeatureInfo&LAYERS=${list}&QUERY_LAYERS=${list}&STYLES=&${pointBox(lat, lon)}`
    + `&I=1&J=1&FEATURE_COUNT=1&INFO_FORMAT=${encodeURIComponent(fmt)}`);
  // GeoJSON features don't say which layer they come from, but the server lists layers in a fixed order (its map
  // file's), which its plain-text replies show by name. That order is learned once per map from one plain-text reply
  // (and remembered in this browser); then a single GeoJSON request answers for all of a map's layers.
  const SOIL_ORDER_KEY = "terroirmap.soilLayerOrder";
  const SOIL_MULTI_KEY = "terroirmap.soilGeoJsonMulti"; // "no" once a multi-layer GeoJSON reply proved unreadable
  let soilMultiJson = true;
  try { soilMultiJson = localStorage.getItem(SOIL_MULTI_KEY) !== "no"; } catch (err) { /* assume yes */ }
  let soilOrders = {};
  try { soilOrders = JSON.parse(localStorage.getItem(SOIL_ORDER_KEY) || "{}") || {}; } catch (err) { soilOrders = {}; }
  async function layerOrder(name, layers, plan, lat, lon) {
    const key = `${name}:${[...layers].sort().join(",")}`;
    if (Array.isArray(soilOrders[key])) return soilOrders[key];
    const text = plan.fmts.find(f => f.kind === "text");
    if (!text) return null;
    try {
      const reply = await soilFetch(gfiUrl(name, layers.join(","), text.fmt, lat, lon));
      const order = [...reply.matchAll(/^\s*Layer '([^']+)'/gm)].map(m => m[1]);
      // Usable only if it names exactly the layers asked for, each once.
      if (order.length !== layers.length || new Set(order).size !== order.length || !order.every(l => layers.includes(l))) return null;
      soilOrders[key] = order;
      try { localStorage.setItem(SOIL_ORDER_KEY, JSON.stringify(soilOrders)); } catch (err) { /* only kept for this visit */ }
      return order;
    } catch (err) { return null; }
  }
  // Every JSON value in a reply: normally one, but some servers write one FeatureCollection per layer back to back.
  function jsonValues(text) {
    try { return [JSON.parse(text)]; } catch (err) { /* several values, or not JSON */ }
    const out = [];
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") { if (depth++ === 0) start = i; }
      else if ((c === "}" || c === "]") && depth > 0 && --depth === 0) {
        try { out.push(JSON.parse(text.slice(start, i + 1))); } catch (err) { return []; }
      }
    }
    return out;
  }
  // { layer: value } from the GeoJSON reply to a multi-layer request, or null if it can't be matched safely:
  //  - several FeatureCollections (one per layer): matched by their "name" if they all name a requested layer,
  //    otherwise by the server's layer order when there is one per layer;
  //  - one FeatureCollection: one feature per layer, in the server's layer order (none at all: no data here).
  function matchGeoJson(values, order) {
    const norm = n => String(n).toLowerCase().replace(/[^a-z0-9]/g, "");
    const byNorm = new Map(order.map(l => [norm(l), l]));
    const cols = values.flatMap(v => (Array.isArray(v) ? v : [v])).filter(v => v && Array.isArray(v.features));
    const out = {};
    const take = (layer, f) => { if (layer && f) out[layer] = firstNumber(f.properties); };
    if (cols.length > 1) {
      if (cols.every(c => c.name && byNorm.has(norm(c.name)))) cols.forEach(c => take(byNorm.get(norm(c.name)), c.features[0]));
      else if (cols.length === order.length) cols.forEach((c, i) => take(order[i], c.features[0]));
      else return null;
      return out;
    }
    if (cols.length === 1) {
      const feats = cols[0].features;
      if (feats.length === 0) return out;
      // Features that name their layer (some servers add it as a property) are matched by that name.
      const named = feats.map(f => f.properties && (f.properties.layer || f.properties.layer_name || f.properties.name));
      if (named.every(n => n && byNorm.has(norm(n)))) { feats.forEach((f, i) => take(byNorm.get(norm(named[i])), f)); return out; }
      if (feats.length !== order.length) return null;
      feats.forEach((f, i) => take(order[i], f));
      return out;
    }
    return null;
  }
  async function gfiValues(name, layers, fmt, lat, lon, plan) {
    const ask = list => soilFetch(gfiUrl(name, list, fmt.fmt, lat, lon)).then(t => parseGfi(t, fmt.kind, list.split(",")));
    if (fmt.kind !== "json") return ask(layers.join(","));
    if (layers.length > 1 && soilMultiJson) {
      const order = await layerOrder(name, layers, plan, lat, lon);
      if (order) {
        const text = await soilFetch(gfiUrl(name, order.join(","), fmt.fmt, lat, lon));
        if (/ServiceException/i.test(text)) throw replied(`server error: ${snippet(text)}`);
        const values = jsonValues(text);
        const out = matchGeoJson(values, order);
        if (out) return withSample(out, rawSample(text));
        if (!values.some(v => v && (Array.isArray(v) || Array.isArray(v.features)))) { // unreadable: don't try this again
          soilMultiJson = false;
          try { localStorage.setItem(SOIL_MULTI_KEY, "no"); } catch (err) { /* only for this visit */ }
        }
        slog(`${name}: couldn't match a ${order.length}-layer GeoJSON reply to its layers; asking layer by layer. Reply: ${rawSample(text)}`);
      }
    }
    const parts = await Promise.all(layers.map(ask));
    return withSample(Object.assign({}, ...parts), (parts.find(x => hasValues(x)) || parts[0] || {}).sample || "");
  }
  // Colour code for the image fallback: value v is drawn as red = v ÷ 256, green = v mod 256. Style entries every
  // `step` (and at the end of each block of 256) let the server's colour ramp hit every whole number exactly; values
  // outside 0…max (including "no data") come out transparent.
  function codeSld(layer, max, step) {
    const hex = v => "#" + [v >> 8, v & 255, 0].map(c => c.toString(16).padStart(2, "0")).join("");
    const qs = new Set([max]);
    for (let v = 0; v <= max; v += step) qs.add(v);
    for (let v = 255; v <= max; v += 256) qs.add(v);
    const entries = [...qs].sort((a, b) => a - b).map(v => `<ColorMapEntry color="${hex(v)}" quantity="${v}"/>`).join("");
    return '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">'
      + `<NamedLayer><Name>${layer}</Name><UserStyle><FeatureTypeStyle><Rule><RasterSymbolizer><ColorMap>${entries}`
      + "</ColorMap></RasterSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>";
  }
  async function imageValue(name, layer, max, step, lat, lon) {
    const blob = await soilFetch(mapUrl(name, `REQUEST=GetMap&LAYERS=${layer}&STYLES=&${pointBox(lat, lon)}`
      + `&FORMAT=image/png&TRANSPARENT=TRUE&SLD_BODY=${encodeURIComponent(codeSld(layer, max, step))}`), "blob");
    if (!/^image\//.test(blob.type)) throw replied(`not an image: ${snippet(await blob.text())}`);
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width; canvas.height = bmp.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const [r, g, , a] = ctx.getImageData(Math.floor(bmp.width / 2), Math.floor(bmp.height / 2), 1, 1).data;
    return a < 128 ? NaN : r * 256 + g;
  }
  async function imageValues(name, layers, rangeOf, lat, lon) {
    const vals = await Promise.allSettled(layers.map(l => imageValue(name, l, rangeOf(l).max, rangeOf(l).step, lat, lon)));
    const bad = vals.find(v => v.status === "rejected");
    if (vals.every(v => v.status === "rejected")) throw bad.reason;
    if (bad) slog(`${name}: some images failed (${bad.reason.message})`);
    return Object.fromEntries(layers.map((l, i) => [l, vals[i].status === "fulfilled" ? vals[i].value : NaN]));
  }
  // How to ask the server, worked out from its description; null if it can't be reached at all.
  async function soilPlan() {
    const [pc, wc] = await Promise.allSettled([soilCaps("phh2o"), soilCaps("wrb")]);
    if (pc.status === "rejected" && wc.status === "rejected") {
      slog(`map server description unavailable: ${pc.reason.message}`);
      // No answer in time: the server is out of reach. Otherwise (an odd reply, or only this request blocked) still try,
      // guessing GML replies and the usual layer names; failures there fall through to the colour-coded images.
      if (pc.reason.timeout && wc.reason.timeout) return null;
      return { fmts: [{ fmt: "application/vnd.ogc.gml", kind: "xml" }, { fmt: "application/geo+json", kind: "json" }], wrbLayers: null, propsQueryable: true, wrbQueryable: true };
    }
    const caps = pc.status === "fulfilled" ? pc.value : wc.value;
    let fmts = pickFormats(caps.formats);
    if (soilFmtConfirmed) fmts = [...fmts.filter(f => f.fmt === soilFmtConfirmed), ...fmts.filter(f => f.fmt !== soilFmtConfirmed)];
    const wrb = wc.status === "fulfilled" ? wc.value : null;
    const plan = {
      fmts,
      propsQueryable: pc.status === "fulfilled" ? [...pc.value.layers.values()].some(Boolean) : true,
      wrbQueryable: wrb ? [...wrb.layers.values()].some(Boolean) : true,
      // probability layers: the WRB group names the server lists (falls back to the known list)
      wrbLayers: wrb ? [...wrb.layers.keys()].filter(n => n !== "MostProbable" && soilInfo(n)) : null,
    };
    plan.used = new Set();
    slog(`map server: GetFeatureInfo formats ${caps.formats.join(", ") || "none"}`);
    return plan;
  }
  const hasValues = obj => Object.values(obj).some(v => Number.isFinite(v) && v >= 0);
  // Values of `layers` in one map: GetFeatureInfo if possible, otherwise colour-coded images.
  async function mapValues(name, layers, rangeOf, plan, queryable, lat, lon) {
    if (plan.fmts.length && queryable) {
      let empty = null;
      for (const fmt of plan.fmts) {
        try {
          const v = await gfiValues(name, layers, fmt, lat, lon, plan);
          if (hasValues(v)) {
            if (!soilFmtVerifiedNow) slog(`values read from ${fmt.fmt}, e.g. ${name}: ${v.sample || "(no sample)"}`);
            if (!soilFmtVerifiedNow) confirmSoilFmt(fmt.fmt);
            plan.used.add(fmt.fmt); return v;
          }
          empty = empty || v;
          // This format has returned values during this visit: an empty reply really means no data here.
          if (soilFmtVerifiedNow && soilFmtConfirmed === fmt.fmt) break;
          slog(`${name}: no values in ${fmt.fmt} reply; trying the next format. Reply: ${v.sample || "(empty)"}`);
        } catch (err) { slog(`${name}: GetFeatureInfo in ${fmt.fmt} failed (${err.message})`); }
      }
      if (empty) return empty;
      slog(`${name}: trying images`);
    }
    if (soilFallback) throw new Error("the map server doesn't accept custom styles"); // seen by the overlay
    return imageValues(name, layers, rangeOf, lat, lon);
  }
  // Result shape shared by both sources: props = [{ name, value, unit }] (empty when the point has no soil data),
  // types = [[group, percent or null]] (null percent: only the most likely group is known); null = unavailable.
  let soilFmtUsed = new Set();
  async function soilFromMapServer(lat, lon) {
    const plan = await soilPlan();
    if (!plan) return { props: null, types: null };
    plan.used = plan.used || new Set();
    soilFmtUsed = plan.used;
    const names = Object.keys(SOIL_PROPS);
    const typesP = soilTypesFromMapServer(plan, lat, lon);
    const replies = await Promise.allSettled(names.map(n =>
      mapValues(n, Object.keys(SOIL_DEPTHS).map(dp => `${n}_${dp}_mean`), () => SOIL_UNITS[n], plan, plan.propsQueryable, lat, lon)));
    let props = null;
    const failed = replies.find(r => r.status === "rejected");
    if (failed) slog(`soil properties: ${failed.reason.message}`);
    if (replies.some(r => r.status === "fulfilled")) {
      props = [];
      names.forEach((n, i) => {
        if (replies[i].status !== "fulfilled") return;
        let sum = 0, w = 0;
        for (const [dp, t] of Object.entries(SOIL_DEPTHS)) {
          const v = replies[i].value[`${n}_${dp}_mean`];
          if (v == null || !Number.isFinite(v) || v < 0) continue; // −32768 or transparent = no data
          sum += v * t; w += t;
        }
        if (w) props.push({ name: n, value: sum / w / SOIL_UNITS[n].div, unit: SOIL_UNITS[n].unit });
      });
    }
    return { props, types: await typesP };
  }
  // Soil group probabilities (top 5), or just the most likely group if the probability layers can't be read.
  async function soilTypesFromMapServer(plan, lat, lon) {
    const groups = plan.wrbLayers && plan.wrbLayers.length ? plan.wrbLayers : SOIL_CODES;
    const range = l => (l === "MostProbable" ? { max: 29, step: 1 } : { max: 100, step: 4 });
    try {
      const v = await mapValues("wrb", ["MostProbable", ...groups], range, plan, plan.wrbQueryable, lat, lon);
      const types = groups.map(g => [g, v[g]]).filter(([, p]) => Number.isFinite(p) && p > 0 && p <= 100)
        .sort((a, b) => b[1] - a[1]).slice(0, 5);
      const top = SOIL_CODES[v.MostProbable];
      return types.length ? types : top ? [[top, null]] : [];
    } catch (err) {
      slog(`soil groups: ${err.message}`);
      if (!err.replied) return null;
      try { // answered with an error (e.g. a layer name it doesn't know): ask for the most likely group alone
        const top = SOIL_CODES[(await mapValues("wrb", ["MostProbable"], range, plan, plan.wrbQueryable, lat, lon)).MostProbable];
        return top ? [[top, null]] : [];
      } catch (err2) { slog(`most likely soil group: ${err2.message}`); return null; }
    }
  }
  async function soilFromRest(lat, lon, needProps, needTypes) {
    const base = "https://rest.isric.org/soilgrids/v2.0";
    const ll = `lon=${f4(lon)}&lat=${f4(lat)}`;
    const propUrl = `${base}/properties/query?${ll}` + Object.keys(SOIL_PROPS).map(p => `&property=${p}`).join("")
      + Object.keys(SOIL_DEPTHS).map(dp => `&depth=${dp}`).join("") + "&value=mean";
    const classUrl = `${base}/classification/query?${ll}&number_classes=5`;
    const [pr, cr] = await Promise.allSettled([
      needProps ? soilFetch(propUrl, "text", 8000).then(JSON.parse) : Promise.reject(new Error("not needed")),
      needTypes ? soilFetch(classUrl, "text", 8000).then(JSON.parse) : Promise.reject(new Error("not needed")),
    ]);
    let props = null, types = null;
    if (pr.status === "fulfilled") {
      props = [];
      for (const layer of pr.value.properties?.layers || []) {
        let sum = 0, w = 0;
        for (const dp of layer.depths) {
          const v = dp.values?.mean;
          if (v == null) continue;
          sum += v * SOIL_DEPTHS[dp.label]; w += SOIL_DEPTHS[dp.label];
        }
        const u = layer.unit_measure || {};
        if (w) props.push({ name: layer.name, value: sum / w / (u.d_factor || 1), unit: SOIL_UNITS[layer.name]?.unit ?? (u.target_units || "") });
      }
    }
    if (cr.status === "fulfilled") types = (cr.value.wrb_class_probability || []).filter(p => p[1] > 0);
    return { props, types };
  }

  async function loadSoil() {
    const token = ++soilToken;
    const { lat, lon } = state;
    setSoil("Loading…", "Loading…"); setLoading("soil", true);
    $("soilProps").hidden = true; $("soilTypes").innerHTML = "";

    soilLog = []; soilFmtUsed = new Set();
    let { props, types } = await soilFromMapServer(lat, lon);
    if (token !== soilToken) return;
    const fromMap = { props: props != null, types: types != null };
    if (props == null || types == null) { // map server failed for one or both: last resort, the REST API
      const rest = await soilFromRest(lat, lon, props == null, types == null);
      if (token !== soilToken) return;
      if (props == null) slog(`REST API properties: ${rest.props == null ? "unavailable" : "ok"}`);
      if (types == null) slog(`REST API soil groups: ${rest.types == null ? "unavailable" : "ok"}`);
      props = props ?? rest.props; types = types ?? rest.types;
    }
    setLoading("soil", false);
    // Diagnosis for the browser console, only when the page is opened with ?soildebug=1: what was tried and what worked.
    const ok = props != null && types != null;
    if (SOIL_DEBUG) console[ok ? "info" : "warn"](`Terroir Map soil (${lat}, ${lon}): properties ${props == null ? "unavailable" : fromMap.props ? "from map server" : "from REST API"}, `
      + `soil groups ${types == null ? "unavailable" : fromMap.types ? "from map server" : "from REST API"}`
      + (soilFmtUsed.size ? ` (${[...soilFmtUsed].join(" + ")})` : "")
      + (soilLog.length ? "\n  " + soilLog.join("\n  ") : ""));

    // Topsoil properties, depth-weighted over 0–30 cm
    let msg = "";
    if (props == null) msg = "Soil data unavailable right now. SoilGrids may be busy; try again shortly.";
    else if (!props.length) msg = "No soil data here (water, ice or built-up land).";
    $("soilProps").innerHTML = (props || []).map(({ name, value, unit }) =>
      `<div class="soil-row"><span class="term" data-tip="soil.${esc(name)}">${esc(SOIL_PROPS[name] || name)}</span>`
      + `<span><strong>${value.toFixed(value < 10 ? 1 : 0)}</strong> <span class="unit">${esc(unit)}</span></span></div>`).join("");
    $("soilProps").hidden = !(props && props.length);

    // WRB reference soil group probabilities
    let typeMsg = "";
    if (types && types.length) {
      $("soilTypes").innerHTML = types.map(([name, p]) =>
        `<div class="prob"><button type="button" class="prob-name soil-link" data-soil="${esc(name)}" data-tip="wrb.${esc(name)}">${esc(name)}</button>`
        + (p == null ? `<span class="prob-track"></span><span class="prob-pct">top</span>`
          : `<span class="prob-track"><span class="prob-fill" style="width:${+p}%"></span></span><span class="prob-pct">${+p}%</span>`) + `</div>`
      ).join("");
      if (types[0][1] == null) typeMsg = "Most likely soil group (probabilities unavailable).";
    } else {
      typeMsg = types ? "No soil classification here." : "Soil classification unavailable right now.";
    }
    setSoil(msg, typeMsg);
  }

  // ---------- Glossary tips ----------
  // Hovering a term (any [data-tip] element) for 1.5 s shows its plain-language explanation from glossary.js.
  // Keyboard focus on a [data-tip] element works the same way; Escape closes.
  // Touch screens can't hover, so there a tap on a term shows its tip straight away (see below).
  const TIP_DELAY = 1500;
  const tip = $("tip");
  let tipTimer = null, tipTarget = null;

  function hideTip() {
    clearTimeout(tipTimer); tipTimer = null;
    if (tipTarget) tipTarget.removeAttribute("aria-describedby");
    tipTarget = null;
    tip.hidden = true;
    tip.classList.remove("tapped");
  }
  function showTip(el) {
    const g = window.GLOSSARY.get(el.dataset.tip);
    if (!g || !el.isConnected) return;
    const part = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text });
    tip.replaceChildren(
      part("strong", "tip-title", g.title),
      part("span", "tip-h", "What it is"), part("p", "tip-p", g.what),
      part("span", "tip-h", "What it means for coffee"), part("p", "tip-p", g.why),
    );
    tip.hidden = false;
    el.setAttribute("aria-describedby", "tip");
    // Below the term, or above it when there is no room; kept inside the viewport.
    const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight, gap = 8;
    const left = Math.max(8, Math.min(r.left, innerWidth - tw - 8));
    const top = r.bottom + gap + th <= innerHeight - 8 ? r.bottom + gap : Math.max(8, r.top - gap - th);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function armTip(el) {
    if (el === tipTarget) return;
    hideTip();
    if (!el || !window.GLOSSARY.get(el.dataset.tip || "")) return;
    tipTarget = el;
    tipTimer = setTimeout(() => showTip(el), TIP_DELAY);
  }
  document.addEventListener("pointerover", e => {
    if (e.pointerType === "touch") return;
    armTip(e.target.closest("[data-tip]"));
  });
  document.addEventListener("pointerout", e => {
    if (tipTarget && !(e.relatedTarget && tipTarget.contains(e.relatedTarget))) hideTip();
  });
  // Touch: tapping a term opens its tip at once; tapping it again, the tip, or anywhere else closes it. Terms that
  // already do something when tapped (buttons such as the weather variables and "Soil types", soil type links,
  // form fields) keep doing just that, with no tip. Tapping a field's label shows the tip instead of opening the field.
  const TAP_ACTIONS = "a, button, input, select, textarea, [data-soil], [role=button], [role=radio]";
  let lastPointer = "mouse", openAtPress = null, pressOnTip = false;
  document.addEventListener("pointerdown", e => {
    lastPointer = e.pointerType; openAtPress = tip.hidden ? null : tipTarget; pressOnTip = tip.contains(e.target);
  }, true);
  // A tap on an open tip just closes it. Browsers can send that tap's click to a nearby element underneath
  // ("touch adjustment"), so the click is stopped here before anything else sees it.
  document.addEventListener("click", e => {
    if (!pressOnTip) return;
    pressOnTip = false; e.stopPropagation(); e.preventDefault(); hideTip();
  }, true);
  document.addEventListener("click", e => {
    if (lastPointer !== "touch") return;
    const el = e.target.closest("[data-tip]");
    if (!el || el.closest(TAP_ACTIONS) || el.querySelector(TAP_ACTIONS) || !window.GLOSSARY.get(el.dataset.tip || "")) return;
    if (e.target.closest("label")) e.preventDefault(); // keep the label from opening its field
    if (openAtPress === el) return; // second tap on the same term: it was closed on press
    hideTip();
    tipTarget = el;
    tip.classList.add("tapped"); // the open tip catches the next tap (which closes it) instead of passing it through
    showTip(el);
  });
  // Focus from a tap (e.g. on a button) shouldn't open a tip; keyboard focus still does.
  document.addEventListener("focusin", e => { if (lastPointer !== "touch") armTip(e.target.closest("[data-tip]")); });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("keydown", e => { if (e.key === "Escape") hideTip(); });
  document.addEventListener("pointerdown", e => { if (!tip.contains(e.target)) hideTip(); });
  document.addEventListener("scroll", hideTip, true);

  // ---------- Soil type details popup ----------
  // Any element with data-soil="<group name>" opens it: the legend, and the soil type list in the panel.
  const SUIT_CLASS = { "Important for coffee": "good", "Sometimes used for coffee": "some", "Rarely used for coffee": "rare", "Generally unsuitable for coffee": "no" };
  function soilProfile(t) {
    const total = Math.max(...t.horizons.map(h => h.bottom));
    const bar = t.horizons.map(h =>
      `<div class="sp-layer${h.abrupt ? " abrupt" : ""}" style="height:${(h.bottom - h.top) / total * 100}%;background:${h.colour}" title="${esc(h.h)}: ${esc(h.desc)}"><span>${esc(h.h)}</span></div>`).join("");
    const ticks = [0, 50, 100, 150].filter(d => d <= total).map(d => `<span style="top:${d / total * 100}%">${d}</span>`).join("");
    const list = t.horizons.map(h =>
      `<li><span class="sp-chip" style="background:${h.colour}"></span><span class="sp-code">${esc(h.h)}</span>`
      + `<span class="sp-depth">${h.top}–${h.bottom} cm</span><span class="sp-desc">${esc(h.desc)}</span></li>`).join("");
    return `<div class="sp"><div class="sp-scale" aria-hidden="true">${ticks}</div><div class="sp-bar" aria-hidden="true">${bar}</div><ol class="sp-list">${list}</ol></div>`;
  }
  function openSoil(name) {
    const t = soilInfo(name);
    if (!t) return;
    hideTip();
    const fact = (k, v) => `<div class="sd-fact"><span class="label">${k}</span><span>${esc(v)}</span></div>`;
    $("soilDlgBody").innerHTML = `
      <header class="sd-head">
        <span class="sd-swatch" style="background:${t.colour}"></span>
        <div>
          <p class="sd-theme">${esc(t.theme)}</p>
          <h2 id="soilDlgTitle">${esc(t.name)}</h2>
          ${t.formerly ? `<p class="sd-formerly">Formerly ${esc(t.formerly)}</p>` : ""}
        </div>
      </header>
      <p class="sd-what">${esc(t.what)}</p>
      <section class="sd-coffee ${SUIT_CLASS[t.suitability] || ""}">
        <span class="sd-badge">${esc(t.suitability)}</span>
        <p>${esc(t.coffee)}</p>
      </section>
      <div class="sd-facts">${fact("Drainage", t.drainage)}${fact("Nutrients", t.nutrients)}${fact("Acidity", t.acidity)}${fact("Depth", t.depth)}</div>
      <section><h3 class="label">Typical profile (cm)</h3>${soilProfile(t)}</section>
      <section><h3 class="label">How to recognise it</h3><p>${esc(t.recognise)}</p></section>
      ${t.question ? `<section><h3 class="label">Key question</h3><p class="sd-question">${esc(t.question)}</p></section>` : ""}
      <details class="sd-more"><summary>Formal definition and name</summary>
        <p>${esc(t.definition)}</p><p class="sd-origin">${esc(t.origin)}</p></details>`;
    const dlg = $("soilDialog");
    if (!dlg.open) dlg.showModal();
    $("soilDlgBody").scrollTop = 0;
    $("soilDlgClose").focus();
  }
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-soil]");
    if (el) openSoil(el.dataset.soil);
  });
  $("soilDlgClose").addEventListener("click", () => $("soilDialog").close());
  // Clicking the dimmed backdrop (outside the card) also closes it; Escape is handled by <dialog>.
  $("soilDialog").addEventListener("click", e => { if (e.target === $("soilDialog")) $("soilDialog").close(); });

  // ---------- Start ----------
  renderReadouts();
  loadAll();
})();
