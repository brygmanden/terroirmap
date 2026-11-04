# Coffee Origin Map

An interactive map for exploring the growing conditions at coffee origins: altitude, weather history, climate class and soil. Zoom, pan and tilt the 3D map, then click any point.

Based on the **Coffee Map** by Prof Steven Abbott (https://www.stevenabbott.co.uk/practical-mechanical/Coffee-Map.php), developed with Dr Anja Rahn and Barista Hustle. The site says all its content and code are Creative Commons BY, so keep the attribution in the footer.

## Run it

It's a static site with no build step. Serve the repo root over HTTP, since some browsers block `fetch` from `file://`:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Any static host works too, for example GitHub Pages, Netlify or Cloudflare Pages.

### GitHub Pages

`.github/workflows/pages.yml` deploys the site on every push to the default branch. To turn it on, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. The site is then served at `https://brygmanden.github.io/terroirmap/`. You can also run it by hand from the **Actions** tab ("Deploy to GitHub Pages" → "Run workflow").

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout: top bar, map, and the data panel (inputs, readouts, chart, weather, vegetation, soil) |
| `style.css` | Design tokens (colours, Archivo font, radius) and component styles, ported from the Claude Design file |
| `app.js` | Map setup and look (`CONFIG`: imagery, terrain exaggeration, coffee belt), data fetching, rendering |
| `climate.js` | Pure calculations: monthly aggregation, Köppen–Geiger class, altitude effects, coffee fit. Also works in Node (`require('./climate.js')`) |
| `glossary.js` | Plain-language explanations for the hover tooltips (terms, abbreviations, soil groups, Köppen letters). Elements opt in with `data-tip="key"` |
| `data/outlines/<CC>.json` | Region outlines, one file per country (ISO code), loaded only when a region in that country is selected |
| `data/farms.geojson` | 3,959 coffee farms, mills and auctions with a location (from `global_coffee_farms_mills_auctions.csv`): type, name, up to three varieties (farms only) and how exact the position is. Contact details and owner names are left out |
| `data/countries.json` | Borders of the 60 coffee countries (Natural Earth 1:50m, public domain), keyed by ISO code; loaded only for `?place=<country>&isolate=1` |
| `assets/fonts/bh/` | Barista Hustle web fonts (Head, NoBH) used by the page |
| `assets/fonts/glyphs/` | Map-label glyphs (SDF `.pbf`) built from NoBH Regular/Bold: Latin, Thai (system Thai font fallback) and punctuation ranges |
| `soils.js` | The 32 WRB soil groups from Prof Steven Abbott: map colour, theme, descriptions, drainage/nutrients/acidity/depth, coffee suitability and a typical horizon profile. Drives the soil map colours, legend, tooltips and the soil details popup |
| `regions.js` | 389 coffee regions in 60 countries, sorted by country then region: name, other names, main species, label point and the admin units behind each outline |
| `docs/original-app.md` | Notes on the original app's interface |

## Link to a place

Two URL parameters open the map on a chosen place:

| Parameter | Values | Effect |
|---|---|---|
| `place` | A country name or ISO code (`Ethiopia`, `ET`), or a region name, alias or id (`Yirgacheffe`, `Cerrado`, `ET-05`). Case, accents, spaces and punctuation are ignored. A repeated region name can be narrowed with its country: `Eastern Province, Rwanda` | Zooms to the region's outline, or for a country to all its coffee regions, and loads the data for that region (for a country, the coffee region nearest the middle of its regions) |
| `isolate` | `1` or `0` (`true`/`false` also work) | With a recognised `place`, `1` limits the region drop-down to the place, hides region dots, farms, mills and auctions outside it (with 3 km allowance for simplified borders) and dims the map around it. Ignored without a recognised `place` |

Examples: `?place=Ethiopia`, `?place=Yirgacheffe&isolate=1`, `?place=BR&isolate=1`. A printable guide with all country codes and region IDs: [`docs/terroir-map-link-guide.pdf`](docs/terroir-map-link-guide.pdf). An unrecognised `place` is ignored (the default view loads, and a warning is written to the browser console).

## What each output means

| Field | Source / formula |
|---|---|
| Alt. m | Open-Meteo Elevation API (Copernicus DEM, 90 m) |
| −ΔT °C | Temperature drop from sea level: 6.5 °C per 1000 m (standard atmosphere lapse rate) |
| UV-Rel | UV relative to sea level: about +10% per 1000 m |
| W/m² | Mean shortwave irradiance over the selected months (ERA5 `shortwave_radiation_sum`, MJ/m²/day × 10⁶ / 86400) |
| Weather chart | Open-Meteo Historical Weather API (ERA5), last *N* complete years. Bars show the mean across years and whiskers show the min–max range |
| Weather Info | Totals and means for the selected months, plus annual totals, checked against typical arabica and robusta ranges |
| Vegetation | Köppen–Geiger class (Peel et al. 2007 thresholds) worked out from the 12-month climatology, with a typical vegetation description |
| Soil Info | ISRIC SoilGrids v2.0 properties, depth-weighted over 0–30 cm: pH, organic carbon, clay, sand, silt, nitrogen, CEC |
| Soil Type | SoilGrids WRB reference soil group probabilities (top 5) |
| Soil types map | Map overlay (slider in the map legend fades it in; the "Soil types" link shows the legend): most probable WRB soil group from the ISRIC SoilGrids WMS (`maps.isric.org`, layer `MostProbable`), with ISRIC's own colour legend. Works on the flat map and the 3D terrain |

All the APIs are free, need no key and allow cross-origin requests. Open-Meteo is free for non-commercial use; commercial use needs their paid plan. Soil values are read from SoilGrids' map server (`maps.isric.org`, the same server as the overlay). The app first reads the server's GetCapabilities (layer names and the GetFeatureInfo reply formats it offers), then asks each map for its value at the point with WMS GetFeatureInfo. GML is preferred because one reply covers several layers (8 requests per point); if a GML reply can't be read, it falls back to GeoJSON (one request per layer, 52 per point), then plain text. Once a format has returned real values it is used first for later points. If the server can't answer that, it requests a 3×3-pixel GetMap image drawn with a custom style in which every value has its own colour, and reads the value from the middle pixel. ISRIC's REST API (`rest.isric.org`) is paused and limited to 5 requests a minute, so it is only the last resort. Every soil request has a time limit (about 16 s in total if nothing answers), and each attempt is logged in the browser console as "Terroir Map soil: …" to help diagnose problems.

## Settings you may want to change

- `LAPSE_RATE` and `UV_PER_KM` in `climate.js`
- The arabica and robusta ranges in `coffeeFit()` in `climate.js`
- The region list in `regions.js`
- Map imagery and terrain sources in the `style` object in `app.js`
- Colours, fonts and spacing: the design tokens at the top of `style.css`
- Map imagery (colour or grayscale), terrain exaggeration, the coffee belt overlay and the soil overlay's default opacity: `CONFIG` at the top of `app.js`

## Design

The look comes from a Claude Design file (Modernist system: crimson accent `#c4274d`, square data tiles), with Barista Hustle's fonts: Head-Bold for headings and large numbers, NoBH-Bold for sub-headings and emphasis, NoBH-Regular for body text. The fonts load from baristahustle.com. It was ported to plain HTML/CSS rather than shipping the design tool's bundled runtime. To change the design, edit it in Claude Design, export it, and port the differences into `index.html` and `style.css`.

## Ideas for next steps

- Get the original app's exact formulas and data sources from Prof Abbott so the numbers match his version
- Add a proper land-cover layer for Vegetation (for example ESA WorldCover)
- Allow comparing two origins side by side
- Export the monthly table as CSV

## Backups

Before bigger changes a backup branch is created, e.g. `backup/before-soil-overlay`. To roll back, open the backup branch on GitHub and compare it with the working branch, or ask Claude to restore it.

## Regions data

`regions.js` and `data/outlines/` are generated from `coffee_growing_regions.csv` / `.geojson` (built 2026-10-13: 387 regions in 60 countries), plus Huye (Rwanda) and Marcala (Honduras) from the earlier list, which the new list only covers as part of larger regions.

- Outlines are administrative units, or unions of them where a coffee region (a mountain range, origin brand or GI) has no boundary of its own. Sources: Overture Maps divisions (OpenStreetMap-derived, ODbL); IBGE municipal boundaries for Brazil; geoBoundaries (CC BY 4.0) for Huye and Marcala. Simplified to about 300 m, with large lakes cut out.
- Known limits: Yirgacheffe is drawn as Gedeo zone and Limu/Agaro/Gera as Jimma zone (no woreda outlines); Vietnam follows the 2025 province mergers; Burundi uses pre-2025 provinces; Kona and Kaʻū are the whole of Hawaiʻi County; Blue Mountains is its three parishes.

## Farms, mills and auctions

`data/farms.geojson` is generated from `global_coffee_farms_mills_auctions.csv` (4,135 rows; 176 without a usable location are left out, including most auctions, which run online). Farms are green, mills amber, auctions blue; names (and, for farms, varieties) appear from zoom 9, and overlapping labels are hidden automatically.

Only 136 positions are exact; most are the centre of the farm's town or state. Entries sharing the same point are fanned out on a small spiral (about 100 m–1.5 km) so each dot can be seen and hovered. The spread is a display aid, not a real position; the hover card says how exact each one is.

## Soil types

Soil colours and descriptions come from Prof Steven Abbott's soil types data (`soil_types.csv`, `soil_horizons.csv`), built into `soils.js`. The map uses each group's `colour_hex`.

- **Map colours:** the overlay is ISRIC's SoilGrids "MostProbable" WMS layer. Each map image request carries a style (`SLD_BODY`) that maps SoilGrids' class values 0–29 (alphabetical WRB 2006 names) to Abbott's colours; SoilGrids' Albeluvisols use the colour of Retisols, their WRB 2014 name. If the server rejects the custom style, the app falls back to ISRIC's own colours and legend image and says so.
- **Legend:** the 30 groups SoilGrids maps, grouped by Abbott's themes. Anthrosols and Technosols are in the data and popup but never appear on the SoilGrids map.
- **Soil details popup:** clicking a soil type in the legend or in the panel's soil type list opens a popup with the description, coffee suitability, drainage/nutrients/acidity/depth, a typical profile, how to recognise it and the formal definition. Close with ×, Escape or by clicking outside.
