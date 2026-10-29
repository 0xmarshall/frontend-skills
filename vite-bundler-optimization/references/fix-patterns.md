# React + Vite fix patterns

Only use after confirming the candidate is in a *synchronous* path that the user wants to shrink. Fix mode must be explicitly requested. Verify output and behavior.

## Lazy route or optional feature

```tsx
import { lazy, Suspense } from 'react'

// Define at module level, not during render.
const AdvancedChart = lazy(() => import('./AdvancedChart'))

export function AnalyticsPage({ showAdvanced }: { showAdvanced: boolean }) {
  return (
    <section>
      <h1>Analytics</h1>
      {showAdvanced && (
        <Suspense fallback={<p>Loading chart…</p>}>
          <AdvancedChart />
        </Suspense>
      )}
    </section>
  )
}
```

`React.lazy` requires an async module with a **default export**. If the existing component uses a named export, prefer a deliberate module boundary or the router's supported lazy API; preserve error handling. Check the user-visible fallback, route navigation, refresh, auth rules and retry behavior. Avoid heavy barrel imports or eager imports elsewhere that defeat the split.

For click-triggered utilities where React.lazy is unnecessary:

```ts
async function exportCsv(rows: Row[]) {
  const { exportRows } = await import('./csv-export')
  return exportRows(rows)
}
```

Ensure the import runs **only on invocation**, not immediately at module evaluation or effect mount.

## Dependencies and tree shaking

- Inspect the generated module list before blaming a library. A package in a lazy chunk may not affect startup.
- Inspect entrypoint imports, CJS/ESM variants, side effects, and bundler output. ESM deep-imports can help only when supported and semantically equivalent.
- Scope locale packs, icons, charts, editors, syntax highlighting and date/formatting libraries to actual usage. Avoid installing alternatives just to change a headline package size.
- Shared chunks and duplicate package versions: trace exact importers and resolution paths. Deduping may require dependency changes; obtain permission first.

## Vendor splitting — last resort

Vite 8+ uses Rolldown; current configuration discusses `build.rolldownOptions.output.codeSplitting`. Older Vite releases may use Rollup's `manualChunks` through `build.rollupOptions`. These are **not interchangeable**. Consult the app's installed Vite version and docs before editing. Vendor splitting can worsen route waterfalls, cache invalidation and eager loads. Compare initial entry closure, not merely main chunk size.

## Non-bundle issues

- Huge images or font files: report under assets and use appropriate image/asset optimization, preserving visual appearance. Don't present their raw bytes as JS savings.
- Too much JS execution or slow React rendering: use React Profiler / browser Performance panel; bundle bytes alone cannot diagnose it.
- Dev server slowness: use `vite --debug plugin-transform`, plugin inspection or `vite --profile`; production bundle measurements do not explain dev server latency.
