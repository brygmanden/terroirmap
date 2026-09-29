# The original app

Source: https://www.stevenabbott.co.uk/practical-mechanical/Coffee-Map.php
Author: Prof Steven Abbott (© 2015–2024, content and code published as CC BY)
Credits: "Under development with Dr Anja Rahn and Barista Hustle."
Menu: Practical Mechanical → Coffee Science (alongside Drum Roasting, Grind Analysis, Basket Holes, Extraction, Settling, Brew Calculator).

The PHP page's source and JavaScript couldn't be downloaded, so this rebuild is based on the visible interface only.

## Quick Start text

"Explore key data at coffee producing locations. Zoom, pan, tilt and then click to get local information."

## Interface

- 3D map: zoom, pan, tilt, click to query a point
- Readouts: **Lat**, **Lon**, **Alt. m**, **−ΔT °C**, **UV-Rel**, **W/m²**
- **From** month (default Jan), **To** month (default Jul)
- **# Years**: 1–10 (default 5)
- **Region** selector
- **Weather** selector: Rain mm, Rain hrs, MaxT, MeanT, MinT, Sunshine, Daylight, Wind
- Info lines: **Weather Info**, **Vegetation**, **Soil Info**, **Soil Type (% Probability)**
- "What's going on?" section (placeholder text on the live page)

## How the rebuild interprets it

- −ΔT: lapse-rate cooling at the site's altitude
- UV-Rel: UV increase with altitude
- W/m²: mean solar irradiance over the selected months
- Soil Type (% probability) matches the SoilGrids WRB classification output, which strongly suggests the original uses SoilGrids too
- The weather variable names match Open-Meteo / ERA5 daily variables
