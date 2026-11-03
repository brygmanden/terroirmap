# Barista Hustle fonts

Put the three font files here, with exactly these names:

- `Head-Bold.woff2`: headings and large numbers
- `NoBH-Regular.woff2`: body text
- `NoBH-Bold.woff2`: sub-headings and emphasis

`style.css` loads them from this folder first. Serving them from the same site avoids the browser's
cross-site font check (CORS), which can block fonts loaded directly from baristahustle.com.
