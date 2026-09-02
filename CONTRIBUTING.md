# Contributing to VeloSync

## Versioning

VeloSync follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`),
starting at `0.1.0`. The version lives in `package.json` and is surfaced in the
app at build time (Settings → About), so it never needs to be hand-synced in
the UI.

Bump the version **as part of the same PR/commit** that introduces the change
— not as a follow-up afterthought:

- **Patch (`0.1.x`)** — bug fixes, small tweaks, no behavior/API changes.
- **Minor (`0.x.0`)** — new features or non-breaking enhancements.
- **Major (`x.0.0`)** — reserved for genuinely breaking changes, or the
  eventual `v1.0.0` launch milestone.

To bump the version:

1. Update `"version"` in `package.json`.
2. Include the bump in the same commit/PR as the change it corresponds to.
3. No other files need updating — `src/pages/Settings.tsx` reads the version
   from `package.json` via Vite's `__APP_VERSION__` build-time define
   (see `vite.config.ts`).
