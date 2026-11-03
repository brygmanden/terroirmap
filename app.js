/* Terroir Map — main app.
 * Map: MapLibre GL with Esri World Imagery + AWS Terrain Tiles (3D, tiltable).
 * Data per clicked point:
 *   - Elevation:  Open-Meteo Elevation API (Copernicus DEM 90 m); slope and aspect from a 3×3 grid of it
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
  const state = {
    regionId: DEFAULT_REGION.id, lat: DEFAULT_REGION.lat, lon: DEFAULT_REGION.lon,
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
  for (const r of R) {
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
    const sel = $("regionList").querySelector('[aria-current="true"]');
    if (sel) sel.scrollIntoView({ block: "center" });
    $("regionSearch").focus();
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
    features: R.map(r => ({ type: "Feature", properties: { id: r.id, name: r.name, country: r.country }, geometry: { type: "Point", coordinates: [r.lon, r.lat] } })),
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
        soil: {
          type: "raster", tiles: [SOIL_TILES], tileSize: 256, minzoom: 0, maxzoom: 13,
          attribution: "Soil types © ISRIC SoilGrids (CC BY 4.0)",
        },
        belt: { type: "geojson", data: beltGeo },
        tropics: { type: "geojson", data: tropicLines },
        regions: { type: "geojson", data: regionGeo },
        picked: { type: "geojson", data: pointGeo(state.lat, state.lon) },
        farms: { type: "geojson", data: new URL("data/farms.geojson", location.href).href },
        outline: { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: "Region outlines: © OpenStreetMap contributors (ODbL) via Overture Maps, IBGE, geoBoundaries" },
      },
      layers: [
        { id: "sat", type: "raster", source: "sat", paint: { "raster-saturation": CONFIG.imagery === "grayscale" ? -1 : 0, "raster-contrast": 0.08 } },
        { id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.25, "hillshade-shadow-color": INK } },
        { id: "soil", type: "raster", source: "soil", layout: { visibility: "none" }, paint: { "raster-opacity": CONFIG.soilOpacity, "raster-fade-duration": 150 } },
        { id: "belt", type: "fill", source: "belt", layout: { visibility: beltVis }, paint: { "fill-color": "rgba(196,39,77,0.07)" } },
        { id: "tropics", type: "line", source: "tropics", layout: { visibility: beltVis }, paint: { "line-color": ACCENT, "line-width": 2, "line-dasharray": [3, 2] } },
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
  showRegion(state.regionId);

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
  async function loadSoil() {
    const token = ++soilToken;
    setSoil("Loading…", "Loading…"); setLoading("soil", true);
    $("soilProps").hidden = true; $("soilTypes").innerHTML = "";
    const base = "https://rest.isric.org/soilgrids/v2.0";
    const ll = `lon=${f4(state.lon)}&lat=${f4(state.lat)}`;
    const propUrl = `${base}/properties/query?${ll}`
      + Object.keys(SOIL_PROPS).map(p => `&property=${p}`).join("")
      + ["0-5cm", "5-15cm", "15-30cm"].map(dp => `&depth=${dp}`).join("") + "&value=mean";
    const classUrl = `${base}/classification/query?${ll}&number_classes=5`;

    const [props, cls] = await Promise.allSettled([getJSON(propUrl), getJSON(classUrl)]);
    if (token !== soilToken) return;
    setLoading("soil", false);

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
        out.push(`<div class="soil-row"><span class="term" data-tip="soil.${esc(layer.name)}">${esc(SOIL_PROPS[layer.name] || layer.name)}</span>`
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
        `<div class="prob"><button type="button" class="prob-name soil-link" data-soil="${esc(name)}" data-tip="wrb.${esc(name)}">${esc(name)}</button><span class="prob-track"><span class="prob-fill" style="width:${+p}%"></span></span><span class="prob-pct">${+p}%</span></div>`
      ).join("");
    } else {
      typeMsg = cls.status === "fulfilled" ? "No soil classification here." : "Soil classification unavailable right now.";
    }
    setSoil(msg, typeMsg);
  }

  // ---------- Tooltips ----------
  // Hovering a term (any [data-tip] element) for 1.5 s shows its plain-language explanation from glossary.js.
  // Keyboard focus on a [data-tip] element works the same way; Escape closes.
  const TIP_DELAY = 1500;
  const tip = $("tip");
  let tipTimer = null, tipTarget = null;

  function hideTip() {
    clearTimeout(tipTimer); tipTimer = null;
    if (tipTarget) tipTarget.removeAttribute("aria-describedby");
    tipTarget = null;
    tip.hidden = true;
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
  document.addEventListener("focusin", e => armTip(e.target.closest("[data-tip]")));
  document.addEventListener("focusout", hideTip);
  document.addEventListener("keydown", e => { if (e.key === "Escape") hideTip(); });
  document.addEventListener("pointerdown", hideTip);
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
