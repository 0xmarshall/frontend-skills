# Measurement reference — Vite + React

## Source of truth

Read the app's installed `vite` version and config. The included `scripts/audit.mjs` creates a production build with the project's Vite JS API and records a JSON snapshot via `generateBundle`. It produces *build evidence*, not an observed session. No new Vite plugin is persisted in the application.

For **Vite 8+**, the official [Vite DevTools for Rolldown](https://devtools.vite.dev/rolldown/) provides visual module graphs, package analysis, duplicate detection, chunks/assets, and snapshot comparisons. Install only with the user's permission if not already present, because doing so changes dependencies. On earlier versions, use the bundled generic snapshot tool or a **version-compatible** analyzer; do not assume a Rollup-only plugin works on Rolldown.

## Terms

- **Emitted bytes:** UTF-8 size of final generated minified JS or output asset. This is not transfer size.
- **gzip bytes:** gzipped size of each emitted JS/CSS file, computed consistently with the default gzip algorithm. Actual CDN compression can differ. Summing separate files' gzip sizes approximates (but does not equal) cached network transfer.
- **`modules[].renderedLength`:** Bundler-attributed byte counts for modules as represented in a chunk. Use to find contributors; not equivalent to emitted output size or compression.
- **Static entry closure:** One emitted JS entry plus *transitive* `imports`; excludes `dynamicImports` unless startup code triggers them. Distinct from React route/path. Also inspect output HTML for scripts, preloads, and CSS.
- **Lazy output:** A chunk marked `isDynamicEntry` or referenced via `dynamicImports`. It may still be downloaded early due to prefetch, eager execution, explicit preload or shared imports.
- **SPA route:** Client-side URL; typically all routes share a single Vite HTML entry. Infer which route loads which lazy chunk using actual router imports and a browser network inspection.
- **Shared bytes:** Count a shared chunk once per entry closure. Do not add per-entry costs and call that the size of the unique app bundle.

## Comparison guards

Use the same commit context except the candidate, dependency versions, lockfile, build mode, Vite version, environment, config, minifier/target, sourcemap settings, and output class. Cache state must be held constant for browser tests. Watch for historical Vite <=7 Rollup vs Vite 8+ Rolldown config differences. Do not change `build.rolldownOptions` or `build.rollupOptions` without checking the installed Vite docs.

An entry gzip reduction can still be a net loss if more modules are fetched eagerly, extra network waterfalls are introduced, or CSS/SSR behavior regresses. Check both output and runtime. Production builds can emit assets into an existing `dist/` and may run project plugins with side effects; inspect before execution.

## Useful source documentation

- https://vite.dev/guide/build
- https://vite.dev/guide/api-javascript
- https://vite.dev/guide/api-plugin
- https://vite.dev/guide/performance
- https://devtools.vite.dev/rolldown/
- https://react.dev/reference/react/lazy
- https://react.dev/reference/react/Suspense
