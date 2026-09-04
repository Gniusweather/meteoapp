# meteoapp (RWCAPP)

Live METAR, TAF, SYNOP encoder, ATC map, and weather tools for Curaçao, Aruba, and Bonaire.

## Enable GitHub Pages

1. Open **Settings → Pages**
2. **Source:** Deploy from a branch
3. **Branch:** `main` / folder `/ (root)` → Save
4. Site URL: **https://gniusweather.github.io/meteoapp/**

## Status

Already in this repo:

- `sw.js` — service worker
- `manifest.webmanifest` — PWA manifest
- `icon.svg` — app icon
- `styles.css` — (partial; full styles are inside `index.html`)

**You still need to upload `index.html`** (main app, ~330 KB):

1. Open https://github.com/Gniusweather/meteoapp/upload/main
2. Drag **index.html** from your download (RWCAPP folder)
3. Commit to `main`

Optional lesson images: upload the `images/` folder the same way.

After Pages is on and `index.html` is present, hard-refresh the live site.
