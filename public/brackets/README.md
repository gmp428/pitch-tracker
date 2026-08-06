# 🏆 Brackets — Tournament Maker

A self-contained, installable web app (PWA) for running knockout tournaments.
No build step, no dependencies, no network required after first load.

## Features

- **Add players** — build the participant list, remove anyone before you start.
- **Single or double elimination** — pick the format on the setup screen.
- **Seeding** — randomize the draw (default) or keep the entry order. Fields that
  aren't a power of two automatically get **byes** for the top seeds.
- **Visual bracket** — winners bracket, losers bracket, and grand final laid out
  in scrollable rounds. Winners are highlighted; scores are shown inline.
- **Log results** — tap any ready match, choose the winner, and (optionally) enter
  scores. Winners and losers advance automatically, including the double-elim
  losers bracket and the grand-final **bracket reset** if the losers-bracket
  champion wins the first final.
- **Autosave** — the whole tournament is stored in `localStorage`, so closing the
  tab or app resumes exactly where you left off.
- **Installable & offline** — a web app manifest + service worker let you
  "Add to Home Screen" and run fully offline.

## Run it

It's plain static files. Serve the folder over HTTP(S):

```bash
cd tournament-bracket
python3 -m http.server 8080
# then open http://localhost:8080
```

Any static host works (GitHub Pages, Netlify, an S3 bucket, …). A service worker
requires `https://` or `localhost`, so for full install/offline support host it
rather than opening `index.html` from disk (it still runs from disk, just without
the service worker).

### Add to your home screen

- **iOS Safari** — Share → *Add to Home Screen*.
- **Android Chrome** — menu → *Install app* / *Add to Home Screen*.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell and views |
| `styles.css` | Styling (dark, mobile-first, safe-area aware) |
| `bracket.js` | Pure bracket engine — seeding, byes, single/double elimination, result advancement (framework-free, unit-testable in Node) |
| `app.js` | UI controller, rendering, persistence |
| `manifest.webmanifest` | PWA metadata |
| `sw.js` | Service worker (offline cache) |
| `icons/` | App icons (SVG + generated PNGs) |
