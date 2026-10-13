// Plain-language explanations shown in the hover tooltips (see "Tooltips" in app.js).
// Elements opt in with data-tip="<key>". Each entry has a title, "what" (what it is)
// and "why" (what it means for coffee). Edit the wording here.
window.GLOSSARY = (function () {
  const tips = {
    // ---- Map ----
    "coffee-belt": {
      title: "Coffee belt",
      what: "The band around the equator between the Tropics of Cancer and Capricorn, about 23.4° north and south.",
      why: "Almost all coffee grows here, because the plant cannot survive frost. Near the equator arabica needs altitude to stay cool enough; robusta grows in the hot lowlands. Towards the edges of the belt, as in Brazil, good coffee grows lower down.",
    },

    "soil-overlay": {
      title: "Soil types map",
      what: "Colours the map by the most likely soil group at each spot, from ISRIC SoilGrids, a global soil map with about 250 m detail. It works on both the flat map and the 3D terrain; use the slider to see the satellite image through it.",
      why: "Shows how soils change across a region, for example the red Nitisols of the East African highlands or the volcanic Andosols of Central America. It is a modelled estimate: tap a point for its soil details in the panel, and test real fields before planting.",
    },

    // ---- Location ----
    "region": {
      title: "Region",
      what: "389 known coffee-growing regions in 60 countries, grouped by country. Click a country to see its regions, or type to search; each region shows its main species and other names it goes by.",
      why: "Choosing a region zooms the map to its outline and loads its altitude, weather and soil, so you can compare famous origins with each other or with any spot you tap on the map.",
    },

    // ---- Readouts ----
    "altitude": {
      title: "Altitude (m a.s.l.)",
      what: "Height in metres above sea level (a.s.l.) at the chosen point, from a satellite elevation model with 90 m detail.",
      why: "Altitude is a big driver of cup quality. Higher means cooler, so cherries ripen more slowly and beans grow denser, usually with more acidity and complexity. Near the equator, specialty arabica is typically grown at about 1,200–2,200 m; robusta mostly below 800 m.",
    },
    "deltaT": {
      title: "−ΔT (temperature drop)",
      what: "How many degrees cooler this point is than sea level would be at the same place, estimated at 6.5 °C per 1,000 m of altitude (the standard \"lapse rate\").",
      why: "This is why tropical coffee is grown in the mountains: a lowland at 30 °C becomes about 18 °C at 1,800 m, right in arabica's comfort zone. The real rate varies with humidity, so treat it as an estimate.",
    },
    "uvRel": {
      title: "UV-Rel (relative UV)",
      what: "Ultraviolet (UV) intensity compared with sea level, estimated at about +10% per 1,000 m because there is less air above to filter it. ×1.19 means roughly 19% more UV.",
      why: "Strong UV and bright sun can scorch unshaded coffee leaves and stress the plant. It is one reason many high-altitude farms grow coffee under shade trees.",
    },
    "irradiance": {
      title: "Irrad. (solar irradiance, W/m²)",
      what: "The average power of sunlight reaching the ground over the selected months, in watts per square metre, averaged over day and night with cloudy days included. Tropical values are typically about 150–300 W/m².",
      why: "Sunlight powers photosynthesis, but coffee evolved as a forest-understorey plant and its leaves are saturated by moderate light. High light plus heat causes stress and can exhaust the plant after a big crop; cloud, mist or shade softens this.",
    },

    // ---- Period controls ----
    "from": {
      title: "From",
      what: "The first month of the period shown in the chart and the weather summary. The period can run across the new year, for example October to March.",
      why: "Choose a season that matters, such as flowering, which is often triggered by the first rains after a dry spell, or harvest, when dry weather makes picking and drying easier.",
    },
    "to": {
      title: "To",
      what: "The last month of the period shown in the chart and the weather summary.",
      why: "Together with From, it lets you zoom in on one season, such as the dry season before flowering or the months when cherries ripen.",
    },
    "years": {
      title: "Years",
      what: "How many recent complete years of weather history to average, from ERA5, a global weather reanalysis.",
      why: "One year shows a single, possibly unusual season. Five to ten years show the typical climate, and the whiskers on the chart show how much it varies, which tells you how reliable the weather is for farmers.",
    },

    // ---- Weather variables ----
    "metric.rain": {
      title: "Rain",
      what: "Total rain (precipitation) per month, in millimetres. 1 mm equals 1 litre of water on every square metre.",
      why: "Arabica usually needs about 1,200–2,200 mm a year, well spread out, plus a dry spell of a couple of months that triggers even, synchronised flowering. Heavy rain at harvest makes picking and drying harder and can hurt quality.",
    },
    "metric.rainHrs": {
      title: "Rain hours",
      what: "The number of hours per month with measurable rain.",
      why: "The same rainfall can come as a few heavy downpours, which run off and erode slopes, or as long drizzle, which keeps leaves wet. Long wet spells favour fungal diseases such as coffee leaf rust, which needs water on the leaf to infect it.",
    },
    "metric.maxT": {
      title: "MaxT (maximum temperature)",
      what: "The average daytime high temperature for each month.",
      why: "Regular highs above about 30 °C stress arabica: flowers can drop and beans fill poorly. Robusta tolerates more heat.",
    },
    "metric.meanT": {
      title: "MeanT (mean temperature)",
      what: "The average temperature over day and night for each month.",
      why: "The best single climate measure for coffee. Arabica does best at an annual mean of about 18–22 °C, robusta at about 22–28 °C. Cooler conditions mean slower ripening and usually more complex flavour.",
    },
    "metric.minT": {
      title: "MinT (minimum temperature)",
      what: "The average night-time low temperature for each month.",
      why: "Cool nights slow ripening and are linked to better cup quality. Frost (0 °C or below) kills leaves and branches; it is a real risk in southern Brazil's coffee areas.",
    },
    "metric.sunshine": {
      title: "Sunshine",
      what: "The average number of hours per day of direct, bright sunshine, when the sun is not hidden by cloud.",
      why: "A good measure of cloudiness. Many classic highland origins are often cloudy or misty, which keeps temperatures mild. Too little sun lowers yields; full sun without shade can stress the plants.",
    },
    "metric.daylight": {
      title: "Daylight",
      what: "The average number of hours from sunrise to sunset.",
      why: "Near the equator it stays close to 12 hours all year, so rain usually controls when coffee flowers. Farther from the equator, as in Brazil or Hawaii, the shorter days of autumn help the plant form flower buds.",
    },
    "metric.wind": {
      title: "Wind",
      what: "The average of each day's strongest wind speed at 10 m above ground, in kilometres per hour.",
      why: "Strong or dry winds tear leaves, knock off flowers and young cherries, and dry out plants and soil. Exposed farms often plant windbreaks.",
    },

    // ---- Chart ----
    "chart-status": {
      title: "Reading the chart",
      what: "Each bar is the average for that month across the selected years. The thin lines (whiskers) run from the lowest to the highest year.",
      why: "Long whiskers mean the weather changes a lot from year to year, which makes farming riskier. Hover over or tap a month to see its exact values here.",
    },

    // ---- Weather summary ----
    "summary": {
      title: "Weather summary",
      what: "Totals and averages for the months selected in From and To, plus full-year values, averaged across the selected years.",
      why: "A quick check of whether the season and the year as a whole suit coffee. The coloured labels below compare the yearly values with arabica's and robusta's typical ranges.",
    },
    "stat.rainPeriod": {
      title: "Rain, period",
      what: "Total rain over the selected months, averaged across the years.",
      why: "Compare it with what the plant needs in that season: steady moisture while cherries grow, and a drier spell before flowering and during harvest.",
    },
    "stat.meanTemp": {
      title: "Mean temperature",
      what: "The average temperature over the selected months.",
      why: "Compare it with arabica's comfort zone of about 18–22 °C. During ripening, cooler means slower development and usually more flavour.",
    },
    "stat.maxMin": {
      title: "Max / min",
      what: "The average daytime high and night-time low over the selected months.",
      why: "A big gap between day and night is typical of highland coffee areas. Warm days drive growth while cool nights slow ripening, which is linked to sweeter, more complex coffee.",
    },
    "stat.sunshine": {
      title: "Sunshine",
      what: "The average hours of direct sunshine per day over the selected months.",
      why: "Shows how cloudy the season is. Lots of sun dries harvested cherries quickly; cloudy, misty seasons keep the plants cool.",
    },
    "stat.annualRain": {
      title: "Annual rain",
      what: "The average total rain in a full year.",
      why: "Arabica usually does best with about 1,200–2,200 mm a year and robusta with about 1,500–3,000 mm. How the rain is spread through the year matters as much as the total.",
    },
    "stat.annualMean": {
      title: "Annual mean temperature",
      what: "The average temperature over a full year, day and night.",
      why: "The single most useful number for coffee. Arabica's optimum is about 18–22 °C, robusta's about 22–28 °C.",
    },

    // ---- Coffee fit ----
    "fit.Arabica optimum": {
      title: "Arabica optimum",
      what: "Both the annual mean temperature (18–22 °C) and annual rain (1,200–2,200 mm) fall in arabica's commonly quoted ideal range.",
      why: "A promising climate for arabica. It is only a rough guide: altitude, soil, the timing of rain and farming practice matter too.",
    },
    "fit.Arabica marginal": {
      title: "Arabica marginal",
      what: "Close to, but outside, arabica's ideal: annual mean 16–24 °C and rain 1,000–2,800 mm.",
      why: "Arabica can grow here, but with more risk, such as heat or drought stress, or needs extra care like shade or irrigation.",
    },
    "fit.Robusta optimum": {
      title: "Robusta optimum",
      what: "Both the annual mean temperature (22–28 °C) and annual rain (1,500–3,000 mm) fall in robusta's commonly quoted ideal range.",
      why: "A promising climate for robusta (Coffea canephora), the hardier, higher-caffeine species grown mainly in hot lowlands such as Vietnam and Uganda.",
    },
    "fit.Robusta marginal": {
      title: "Robusta marginal",
      what: "Close to, but outside, robusta's ideal: annual mean 20–30 °C and rain 1,200–3,500 mm.",
      why: "Robusta can grow here, but with more risk or care.",
    },
    "fit.Outside typical coffee ranges": {
      title: "Outside typical coffee ranges",
      what: "The annual temperature or rain is outside the usual ranges for both arabica and robusta.",
      why: "Commercial coffee would be difficult here without major help such as irrigation or protection from cold.",
    },

    // ---- Vegetation ----
    "koppen": {
      title: "Köppen–Geiger climate class",
      what: "The most widely used climate classification. It sorts places into climate types from their 12 monthly temperatures and rainfall totals, and each type goes with a typical natural vegetation.",
      why: "Most classic arabica highlands are Cwb or Cfb (mild highland climates); robusta and lowland arabica grow mostly in tropical Af, Am and Aw. Hover over the code for what its letters mean.",
    },

    // ---- Soil ----
    "topsoil": {
      title: "Topsoil 0–30 cm",
      what: "Soil properties averaged over the top 30 cm. They are modelled estimates from ISRIC SoilGrids at about 250 m detail, not a test of a particular field.",
      why: "Most of coffee's fine feeding roots are in this layer, so it is the soil that matters most for nutrition. For decisions on a real farm, take a soil sample.",
    },
    "soil.phh2o": {
      title: "pH (H₂O)",
      what: "Soil acidity, measured in a mix of soil and water. 7 is neutral; lower numbers are more acidic.",
      why: "Coffee prefers slightly acidic soil, about pH 5–6.5. Below about 5, aluminium becomes toxic to roots and phosphorus gets locked up, so farmers add lime. Above 7, iron and zinc become hard for the plant to take up.",
    },
    "soil.soc": {
      title: "Organic carbon",
      what: "Carbon from decomposed plants and animals, in grams per kilogram of soil. Soil organic matter is roughly 1.7 times this number.",
      why: "Organic matter holds water and nutrients, keeps soil crumbly and feeds soil life. Higher is generally better; forest and volcanic soils are often rich in it. Mulch, compost and shade-tree leaf litter build it up.",
    },
    "soil.clay": {
      title: "Clay",
      what: "The share of the finest soil particles, smaller than 0.002 mm. Clay, sand and silt add up to about 100% and together make the soil's texture.",
      why: "Clay holds water and nutrients well, but very clayey soil drains slowly and can waterlog roots. Coffee likes deep, well-drained loams and clay loams.",
    },
    "soil.sand": {
      title: "Sand",
      what: "The share of the coarsest soil particles, 0.05–2 mm.",
      why: "Sand lets water drain and air reach the roots, but very sandy soil dries out fast and holds few nutrients, so the plants need more mulch, water and fertiliser.",
    },
    "soil.silt": {
      title: "Silt",
      what: "The share of medium-sized soil particles, 0.002–0.05 mm.",
      why: "Silt holds water well and is usually fertile, but silty soil can form a crust and erode easily on slopes.",
    },
    "soil.nitrogen": {
      title: "Nitrogen",
      what: "Total nitrogen in grams per kilogram of soil. Organic carbon divided by nitrogen gives the C:N ratio; about 10–12 is typical of healthy soil.",
      why: "Nitrogen is the nutrient coffee uses most, for new leaves and for filling cherries. Much of it comes from organic matter; the rest is usually added as fertiliser.",
    },
    "soil.cec": {
      title: "CEC (cation exchange capacity)",
      what: "How many positively charged nutrients, such as calcium, magnesium and potassium, the soil can hold and release to roots, in centimoles of charge per kilogram.",
      why: "A measure of the soil's nutrient \"pantry\". Low CEC (under about 10) means fertiliser washes out quickly and is best given little and often; high CEC (over about 25) holds nutrients well.",
    },
    "wrb": {
      title: "WRB soil groups",
      what: "WRB (World Reference Base for Soil Resources) is the international system for naming soils. The percentages are SoilGrids' estimated probability that the soil here belongs to each group; the top 5 are shown.",
      why: "The soil group sums up how the soil formed and how it behaves: how deep, fertile and well drained it is. Hover over a group name to learn about it.",
    },
  };

  // WRB reference soil groups, as named by SoilGrids: [what it is, what it means for coffee].
  const wrb = {
    Acrisols: ["Strongly weathered, acidic tropical soils with clay washed down into the subsoil.", "Low in nutrients and often high in aluminium. Coffee can do well with lime, fertiliser and organic matter."],
    Albeluvisols: ["Acidic soils with bleached, tongue-shaped streaks reaching into the subsoil, found in cool, humid climates.", "Rare in coffee regions."],
    Alisols: ["Acidic soils with a clay-rich subsoil and a lot of aluminium.", "Aluminium can be toxic to roots; liming helps. Fertility is often fair at the surface."],
    Andosols: ["Young soils formed in volcanic ash: light, porous and rich in organic matter.", "Excellent for coffee: deep, well drained and good at holding water. Common in Central America, Colombia and Indonesia. They lock up phosphorus, so it needs managing."],
    Anthrosols: ["Soils deeply changed by long human use, such as centuries of irrigation or manuring.", "Properties depend on how they were used."],
    Arenosols: ["Sandy soils with little development.", "Drain fast and hold little water or nutrients; coffee needs mulch, irrigation and fertiliser."],
    Calcisols: ["Soils of dry regions with built-up lime (calcium carbonate).", "Alkaline, which coffee dislikes, and usually too dry."],
    Cambisols: ["Young to moderately developed soils that are just starting to form distinct layers.", "Often reasonably fertile and well structured; widely used for coffee."],
    Chernozems: ["Deep, black, very fertile grassland soils rich in organic matter.", "Found in temperate steppes, outside the coffee belt."],
    Cryosols: ["Soils with permafrost.", "Far outside coffee's range."],
    Durisols: ["Soils of dry regions with a hardened, silica-cemented layer.", "Shallow rooting and dry; unsuited to coffee."],
    Ferralsols: ["Very old, deeply weathered red or yellow tropical soils.", "Deep, well drained and easy to work, but naturally poor in nutrients. Much of Brazil's coffee grows on them, with lime and fertiliser."],
    Fluvisols: ["Young soils on river, lake or sea deposits.", "Often fertile, but may flood or have a high water table, which coffee roots don't tolerate."],
    Gleysols: ["Soils saturated by groundwater for long periods.", "Too wet for coffee unless drained."],
    Gypsisols: ["Soils of dry regions with built-up gypsum.", "Too dry for coffee."],
    Histosols: ["Peat soils made mostly of organic material.", "Waterlogged and acidic; rarely used for coffee."],
    Kastanozems: ["Dark brown grassland soils of drier steppes, with lime in the subsoil.", "Mostly outside the coffee belt."],
    Leptosols: ["Very shallow soils over hard rock, or very stony soils; common on steep slopes.", "Little room for roots and little water storage; coffee struggles unless pockets of deeper soil exist."],
    Lixisols: ["Tropical soils with a clay-rich subsoil, less acidic than Acrisols.", "Moderately fertile but prone to crusting and erosion; mulch and ground cover help."],
    Luvisols: ["Soils with clay washed into the subsoil and plenty of nutrients.", "Generally fertile and good for coffee if well drained."],
    Nitisols: ["Deep, well-drained red tropical soils with a crumbly, nutty structure, often from volcanic rock.", "Among the best tropical soils for coffee, for example in Ethiopia, Kenya and Tanzania."],
    Phaeozems: ["Dark, organic-rich, fertile soils of wetter grasslands.", "Fertile; good for coffee where the climate fits."],
    Planosols: ["Soils where a light upper layer sits sharply on dense clay.", "Water collects above the clay after rain, waterlogging roots; poor for coffee."],
    Plinthosols: ["Tropical soils with an iron-rich, mottled layer that hardens permanently if exposed.", "Restricted rooting and drainage; poor for coffee."],
    Podzols: ["Acidic, sandy soils with a bleached layer above an iron- and humus-rich layer.", "Very poor in nutrients; rarely used for coffee."],
    Regosols: ["Weakly developed soils in loose material, with little layering.", "Quality varies with the parent material."],
    Solonchaks: ["Salty soils.", "Salt harms coffee roots; unsuitable."],
    Solonetz: ["Soils with a dense, sodium-rich clay subsoil.", "Alkaline and poorly drained; unsuitable for coffee."],
    Stagnosols: ["Soils that become waterlogged for periods from water held near the surface.", "Coffee roots suffer in waterlogged soil; drainage needed."],
    Technosols: ["Soils made largely of human-made materials.", "Usually urban or industrial land."],
    Umbrisols: ["Acidic soils with a thick, dark, organic-rich topsoil, common in cool, wet uplands.", "Good structure and organic matter; can suit highland coffee with liming."],
    Vertisols: ["Heavy clay soils that swell when wet and crack deeply when dry.", "Hard to work and can tear roots; generally poor for coffee."],
  };

  // What common Köppen classes mean for coffee.
  const koppenCoffee = {
    Af: "Hot and wet all year: lowland robusta country; arabica only at altitude.",
    Am: "Hot with a short dry season: good for robusta; the dry spell helps flowering.",
    Aw: "Hot with a long dry season: robusta and lower-altitude arabica, often with irrigation. The dry season helps harvest and drying.",
    Cfb: "Mild all year with no real dry season: in the tropics this is a highland climate typical of fine arabica, for example in Colombia.",
    Cwb: "Mild highland climate with a dry winter: the classic arabica climate of places such as Ethiopia, Kenya and Guatemala.",
    Cwa: "Warm, with a dry winter: good arabica country at moderate altitude, for example parts of Brazil.",
    Cfa: "Warm and humid with no dry season: coffee grows at the warm edge of this climate, as in parts of southern Brazil, with some frost risk.",
    Csa: "Mediterranean with dry summers: too dry and cold in winter for most coffee.",
    Csb: "Mediterranean with dry summers: rarely suited to coffee.",
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
    if (!parts.length) return null;
    return {
      title: `Climate class ${code}`,
      what: parts.join("; ") + ".",
      why: koppenCoffee[code] || (a === "B" ? "Too dry for coffee without irrigation." : a === "D" || a === "E" ? "Too cold for coffee." : "An unusual climate for coffee."),
    };
  }

  // Returns { title, what, why } for a data-tip key, or null.
  function get(key) {
    if (tips[key]) return tips[key];
    if (key.startsWith("wrb.")) {
      const name = key.slice(4);
      const group = Object.keys(wrb).find(g => name.includes(g));
      return group ? { title: name, what: wrb[group][0], why: wrb[group][1] } : null;
    }
    if (key.startsWith("koppen.")) return koppenCode(key.slice(7));
    return null;
  }

  return { get };
})();
