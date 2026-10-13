// Plain-language explanations shown in the hover tooltips (see "Tooltips" in app.js).
// Elements opt in with data-tip="<key>"; edit the wording here.
window.GLOSSARY = (function () {
  const tips = {
    // Map
    "coffee-belt": "The band between the Tropics of Cancer and Capricorn (about 23.4° north and south of the equator), where almost all of the world's coffee is grown.",

    // Location
    "region": "Well-known coffee-growing areas. Pick one to jump there, or tap anywhere on the map to explore your own point.",

    // Readouts
    "altitude": "Height above mean sea level (m a.s.l. = metres above sea level), from a 90 m satellite elevation model. Higher farms are cooler, so cherries ripen more slowly, which is linked to denser beans and more complex flavour.",
    "deltaT": "Temperature drop (−ΔT): how much cooler this spot is than it would be at sea level, estimated at 6.5 °C for every 1000 m of altitude (the standard lapse rate).",
    "uvRel": "Relative UV: ultraviolet intensity compared with sea level. UV rises by roughly 10% per 1000 m because there is less air above to filter it. ×1.19 means about 19% more UV than at sea level.",
    "irradiance": "Solar irradiance: the average power of sunlight reaching the ground over the selected months, in watts per square metre (W/m²), cloudy days included. Light drives photosynthesis, but strong sun can stress coffee grown without shade.",

    // Period controls
    "from": "First month of the period shown in the chart and the weather summary. The period can run across the new year, e.g. Oct to Mar.",
    "to": "Last month of the period shown in the chart and the weather summary.",
    "years": "How many recent complete years of weather history to average. More years smooth out unusual seasons; the whiskers on the chart show how much the years differ.",

    // Weather variables
    "metric.rain": "Rain: total precipitation per month, in millimetres. 1 mm equals 1 litre of water on every square metre.",
    "metric.rainHrs": "Rain hours: hours per month with measurable rain. Shows whether rain comes in short bursts or long, steady spells.",
    "metric.maxT": "MaxT: average daily maximum temperature, the daytime high.",
    "metric.meanT": "MeanT: average daily mean temperature, the day-and-night average.",
    "metric.minT": "MinT: average daily minimum temperature, the night-time low. Cool nights slow ripening; frost (below 0 °C) damages coffee plants.",
    "metric.sunshine": "Sunshine: average hours per day of direct, bright sunshine (sun not blocked by cloud).",
    "metric.daylight": "Daylight: average hours between sunrise and sunset. Changes little through the year near the equator.",
    "metric.wind": "Wind: average of each day's strongest wind speed at 10 m above ground, in km/h. Strong winds can damage flowers and dry out soil.",

    // Chart
    "chart-status": "Bars show the average for each month across the selected years. The thin lines (whiskers) run from the lowest to the highest year. Hover over or tap a month to read its values here.",

    // Weather summary
    "summary": "Totals and averages for the months selected in From and To, plus full-year values, averaged across the selected years.",
    "stat.rainPeriod": "Total rain over the selected months, averaged across the years.",
    "stat.meanTemp": "Average temperature over the selected months.",
    "stat.maxMin": "Average daytime high / night-time low over the selected months. A big day–night gap is typical of highland coffee areas.",
    "stat.sunshine": "Average hours of direct sunshine per day over the selected months.",
    "stat.annualRain": "Average total rain in a full year. Arabica usually does best with about 1,200–2,200 mm, robusta with about 1,500–3,000 mm.",
    "stat.annualMean": "Average temperature over a full year. Arabica's optimum is about 18–22 °C, robusta's about 22–28 °C.",

    // Coffee fit
    "fit.Arabica optimum": "The annual mean temperature (18–22 °C) and rainfall (1,200–2,200 mm) both fall in arabica's commonly quoted optimum range. A rough guide only: altitude, soil, rain timing and farming practice matter too.",
    "fit.Arabica marginal": "Near, but outside, arabica's optimum: annual mean 16–24 °C and rainfall 1,000–2,800 mm. Arabica can grow here with more risk or care.",
    "fit.Robusta optimum": "The annual mean temperature (22–28 °C) and rainfall (1,500–3,000 mm) both fall in robusta's commonly quoted optimum range. A rough guide only.",
    "fit.Robusta marginal": "Near, but outside, robusta's optimum: annual mean 20–30 °C and rainfall 1,200–3,500 mm.",
    "fit.Outside typical coffee ranges": "The annual temperature or rainfall is outside the usual ranges for both arabica and robusta.",

    // Vegetation
    "koppen": "Köppen–Geiger is the most widely used climate classification. It groups places into climate types from their monthly temperature and rainfall, and each type goes with a typical natural vegetation. Hover over the code for what its letters mean.",

    // Soil
    "topsoil": "Soil properties averaged over the top 30 cm, where most of coffee's feeding roots are. These are modelled estimates from ISRIC SoilGrids (about 250 m resolution), not a soil test of a particular field.",
    "soil.phh2o": "pH (H₂O): soil acidity measured in water. 7 is neutral; lower is more acidic. Coffee prefers slightly acidic soil, roughly pH 5–6.5.",
    "soil.soc": "Organic carbon: carbon from decomposed plant and animal matter, in grams per kilogram of soil. Organic matter holds water and nutrients and feeds soil life; higher is generally better.",
    "soil.clay": "Clay: share of the finest particles (under 0.002 mm). Clay holds water and nutrients well, but very clayey soil drains slowly. Clay, sand and silt add up to about 100%.",
    "soil.sand": "Sand: share of the coarsest particles (0.05–2 mm). Sandy soil drains fast but holds little water or nutrients.",
    "soil.silt": "Silt: share of medium-sized particles (0.002–0.05 mm). Silt holds water well and is usually fertile.",
    "soil.nitrogen": "Nitrogen: total nitrogen in grams per kilogram of soil. Nitrogen is the nutrient coffee needs most, for leaves and cherries.",
    "soil.cec": "CEC (cation exchange capacity): how many positively charged nutrients, such as calcium, magnesium and potassium, the soil can hold and release to roots, in centimoles of charge per kilogram. Higher means more fertile soil.",
    "wrb": "WRB (World Reference Base for Soil Resources) is the international system for naming soils. The percentages are SoilGrids' estimated probability that the soil here belongs to each group; the top 5 are shown.",
  };

  // WRB reference soil groups, as named by SoilGrids.
  const wrb = {
    Acrisols: "Strongly weathered, acidic tropical soils with clay washed down into the subsoil and few nutrient reserves. Usually need lime and fertiliser.",
    Albeluvisols: "Acidic soils with bleached, tongue-shaped streaks reaching into the subsoil; found in cool, humid climates.",
    Alisols: "Acidic soils with a clay-rich subsoil and a lot of aluminium, which can be toxic to roots.",
    Andosols: "Young soils formed in volcanic ash: light, porous, rich in organic matter and very good at holding water. Valued for coffee, for example in Central America and Indonesia, though they lock up phosphorus.",
    Anthrosols: "Soils changed deeply by long human use, such as centuries of irrigation or manuring.",
    Arenosols: "Sandy soils that drain quickly and hold little water or nutrients.",
    Calcisols: "Soils of dry regions with built-up lime (calcium carbonate); alkaline.",
    Cambisols: "Young to moderately developed soils with only the beginnings of distinct layers; often reasonably fertile.",
    Chernozems: "Deep, black, very fertile grassland soils rich in organic matter.",
    Cryosols: "Soils with permafrost.",
    Durisols: "Soils of dry regions with a hardened, silica-cemented layer.",
    Ferralsols: "Very old, deeply weathered red or yellow tropical soils. Well drained with good structure, but naturally low in nutrients; common in Brazil's coffee areas.",
    Fluvisols: "Young soils on river, lake or sea deposits; often fertile but may flood.",
    Gleysols: "Soils saturated by groundwater for long periods; poor for coffee unless drained.",
    Gypsisols: "Soils of dry regions with built-up gypsum.",
    Histosols: "Peat soils made mostly of organic material.",
    Kastanozems: "Dark brown grassland soils of drier steppes, with lime in the subsoil.",
    Leptosols: "Very shallow soils over hard rock, or very stony soils; common on steep slopes.",
    Lixisols: "Tropical soils with a clay-rich subsoil, less acidic than Acrisols but prone to crusting and erosion.",
    Luvisols: "Soils with clay washed into the subsoil and plenty of nutrients; generally fertile.",
    Nitisols: "Deep, well-drained, red tropical soils with a crumbly structure; among the most productive tropical soils and excellent for coffee, for example in Ethiopia and Kenya.",
    Phaeozems: "Dark, organic-rich, fertile soils of wetter grasslands.",
    Planosols: "Soils where a light upper layer sits sharply on dense clay, so water collects above it after rain.",
    Plinthosols: "Tropical soils with an iron-rich, mottled layer that hardens permanently if exposed.",
    Podzols: "Acidic, sandy soils with a bleached layer above an iron- and humus-rich layer; typical of cool forests.",
    Regosols: "Weakly developed soils in loose material, with little layering.",
    Solonchaks: "Salty soils.",
    Solonetz: "Soils with a dense, sodium-rich clay subsoil; alkaline.",
    Stagnosols: "Soils that become waterlogged for periods from water held near the surface.",
    Technosols: "Soils made largely of human-made materials.",
    Umbrisols: "Acidic soils with a thick, dark, organic-rich topsoil; common in cool, wet uplands.",
    Vertisols: "Heavy clay soils that swell when wet and crack deeply when dry; hard to work.",
  };

  // Spell out a Köppen–Geiger code letter by letter, e.g. "Cwb".
  function koppenCode(code) {
    const first = {
      A: "A = tropical: every month averages 18 °C or more",
      B: "B = dry: more water evaporates than falls as rain",
      C: "C = temperate: the coldest month averages between 0 and 18 °C",
      D: "D = continental: the coldest month averages below 0 °C",
      E: "E = polar or high alpine: the warmest month averages below 10 °C",
    };
    const second = {
      A: { f: "f = rainforest: wet all year", m: "m = monsoon: a short dry season", w: "w = savanna: a distinct dry season" },
      B: { W: "W = desert", S: "S = semi-arid steppe" },
      C: { f: "f = no dry season", s: "s = dry summer", w: "w = dry winter" },
      D: { f: "f = no dry season", s: "s = dry summer", w: "w = dry winter" },
      E: { T: "T = tundra", F: "F = ice cap" },
    };
    const third = {
      B: { h: "h = hot: annual mean 18 °C or more", k: "k = cold: annual mean below 18 °C" },
      C: { a: "a = hot summer: warmest month 22 °C or more", b: "b = warm summer", c: "c = cool summer", d: "d = very cold winter" },
    };
    third.D = third.C;
    const [a, b, c] = code;
    const parts = [first[a], second[a] && second[a][b], third[a] && third[a][c]].filter(Boolean);
    return parts.length ? `${code}: ${parts.join("; ")}.` : "";
  }

  function get(key) {
    if (tips[key]) return tips[key];
    if (key.startsWith("wrb.")) {
      const name = key.slice(4);
      const group = Object.keys(wrb).find(g => name.includes(g));
      return group ? wrb[group] : "";
    }
    if (key.startsWith("koppen.")) return koppenCode(key.slice(7));
    return "";
  }

  return { get };
})();
