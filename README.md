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
| `index.html` | Page layout: map, input fields, controls, chart and info panel |
| `style.css` | Design tokens (light and dark themes) and layout |
| `app.js` | Map setup, data fetching, chart and table rendering, soil panel |
| `climate.js` | Pure calculations: monthly aggregation, Köppen–Geiger class, altitude effects, coffee fit. Also works in Node (`require('./climate.js')`) |
| `regions.js` | List of coffee regions (name, country, lat, lon, zoom) |
| `docs/original-app.md` | Notes on the original app's interface |

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

All the APIs are free, need no key and allow cross-origin requests. Open-Meteo is free for non-commercial use; commercial use needs their paid plan. SoilGrids is a beta service and is sometimes slow, so the app shows a message and carries on without it.

## Settings you may want to change

- `LAPSE_RATE` and `UV_PER_KM` in `climate.js`
- The arabica and robusta ranges in `coffeeFit()` in `climate.js`
- The region list in `regions.js`
- Map imagery and terrain sources in the `style` object in `app.js`
- Colours, fonts and spacing: the design tokens at the top of `style.css`

## Ideas for next steps

- Get the original app's exact formulas and data sources from Prof Abbott so the numbers match his version
- Add a proper land-cover layer for Vegetation (for example ESA WorldCover)
- Allow comparing two origins side by side
- Export the monthly table as CSV
