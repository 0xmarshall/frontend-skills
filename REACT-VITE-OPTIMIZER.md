---
name: vite-bundle-optimizer
description: >
  Audit and reduce browser initial-load JavaScript in React + Vite apps. Use for
  oversized bundles, slow route startup, heavy dependencies, duplicate packages,
  or UI/features that can load after interaction. Produce evidence-based before/after
  reports using the project's Vite production build; audit by default, fix only when asked.
---

# React + Vite bundle optimizer

Use for React SPAs and multi-page applications built with Vite. This is a **bundle and loading-boundary workflow**, not an all-purpose React performance or Lighthouse skill. Follow the installed project's Vite and bundler versions; **Vite 8+ uses Rolldown, older releases may use Rollup**. Do not use `next analyze`, Next.js route terminology, or Next-specific APIs.

## 1. Establish the contract

- Inspect `package.json`, lockfile, `vite.config.*`, app entries, router, deployed `base`, output mode, and existing build scripts. Identify installed Vite version, package manager, and React router (if any).
- Default to the **whole client app** including shared dependencies and all reachable features. Scope to a named page/feature only when requested. **Audit** is the default: do not edit application source, `package.json`, lockfiles, or persistent Vite configuration. The audit may create disposable build and analysis artifacts. **Fix** mode requires explicit authorization to optimize code.
- Keep behavior, authentication/access checks, feature availability, data fetching order, Suspense fallbacks, CSS appearance, and browser support unchanged unless the user approves the tradeoff. Record the target (initial JS, route transition, optional feature, duplicate module, or asset) and its conditions.
- For SPA routes, the router path is **not automatically a bundler entry**. Build chunks alone cannot prove per-URL initial transfer, especially if preloads, cached chunks, or eager route modules exist.

**Done:** mode, scope, app/bundler version, package manager and behavior contract are recorded.

## 2. Capture a reproducible production-build baseline

Use the repository's existing package manager and installed dependencies; don't upgrade or install packages just to audit. Prefer a clean working tree; record existing changes and do not reset them. Run from the Vite application root:

```bash
# Copy this skill into .agents/skills/vite-bundle-optimizer (or .claude/skills/).
# Build with the project's own Vite config, using a temporary in-memory reporting plugin.
node .agents/skills/vite-bundle-optimizer/scripts/audit.mjs \
  --out .vite-bundle-audit/before.json
node .agents/skills/vite-bundle-optimizer/scripts/report.mjs \
  .vite-bundle-audit/before.json
```

For Claude Code, replace `.agents/skills/` with `.claude/skills/`. If an application runs Vite in a workspace subdirectory, `cd` there before running. Use `--config path/to/vite.config.ts` or `--mode production` when required to match its normal build. An alternative is the **official Vite DevTools → Rolldown integration on Vite 8+**, which shows module, chunk, package, and session comparisons; see [measurement](references/measurement.md). Do not require experimental tooling for the default script.

The included audit script invokes the **locally installed Vite JavaScript build API** with an in-memory `generateBundle` reporting plugin. It reads the app's existing Vite config, emits output to the configured build directory, and writes a separate JSON snapshot. It does **not** edit app source/config/dependencies. Vite builds may run existing project plugins; inspect their side effects first. If the project requires special environment variables, use its legitimate build environment without printing or recording secrets.

Record the build command/config, snapshot path, time, Vite version, mode, deployment base, and whether it is a client-only or SSR/library build. **A successful Vite bundle build does not necessarily run the repo's separate `tsc`, lint, or test scripts.**

**Done:** a valid production build and separate baseline snapshot exist, or a precise blocker is reported.

## 3. Interpret evidence before optimizing

Read the snapshot/report and relevant application source:

- Rank **static entry closures** (entry chunk + transitively imported *synchronous* chunks) by emitted JS bytes and the sum of per-file gzip sizes; include applicable CSS separately. Check `index.html` for initial `modulepreload` and script tags; graph closures are **proxies**, not measured browser transfers.
- Rank large chunks, package contributions using per-module **rendered length**, unexpectedly shared dependencies, and `dynamicImports` boundaries. Examine actual imports in the source; do not label large dependencies as initial if they are only in lazy chunks.
- Compare bytes **within the same metric**: minified emitted bytes vs minified emitted bytes, per-chunk gzip vs per-chunk gzip. Module rendered-length attribution is approximate and **must not** be presented as compressed transfer size. Sum each chunk only once per entry closure; if one shared chunk appears in several entries, don't sum entry totals to claim app-wide unique bytes.
- Trace **every eager import path** from selected entry root(s) to each candidate. Include alternate importers, barrel re-exports, circular dependencies, module side effects, eager preloading, and router imports. An `import()` expression does not prove laziness if it runs at startup.
- Mark missing evidence when route mapping, preloads, SSR, runtime execution, browser cache, CSS relationships or dependency provenance is uncertain.

For complex graphs, use [graph methods](references/graph-methods.md); for a single dependency or feature, directly trace its importers. Use [fix patterns](references/fix-patterns.md) for concrete React/Vite interventions.

**Done:** each candidate has its exact source/importers, estimated benefit, affected entry/interaction, correctness risks, and a named verification test. In audit mode, **report now and stop**; do not edit.

## 4. Select narrow, high-confidence changes (fix mode only)

Prioritize changes that detach heavy, truly optional functionality from the **initial synchronous graph**:

1. Lazy-load route components via the router's supported API or `React.lazy(() => import(...))` with correct `<Suspense>` and error behavior. Ensure eager imports, route metadata files, and shared barrels do not pull the feature back into startup.
2. Lazy-load expensive dialogs, editors, charts, dashboards and admin features at **the point of use**. Account for hover/open timing, preload triggers, UX fallback and failed dynamic imports.
3. Replace large dependencies or imports **only** when source evidence shows a lighter API or alternative is compatible (including tree-shaking and side effects). Preserve date/locale/crypto behavior and web compatibility.
4. Fix accidental duplication and broad imports; inspect package resolution, shared module strategy, and output metadata before changing chunk configuration.
5. Adjust Vite chunking only after establishing a need and verifying installed bundler syntax. **Moving bytes to `vendor` does not by itself improve startup**, and hand-written splitting can cause eager fetches, duplication or broken load order.

Don't treat bundle warnings as performance thresholds, don't silently change `browserslist`/targets/polyfills, don't defer security checks, and don't use fake lazy-loading that immediately imports on mount. Avoid blanket `React.memo` or `useMemo` changes: they address rendering, not necessarily bundle size.

**Done:** the smallest behavior-preserving change is selected with explicit acceptance criteria.

## 5. Verify one change at a time (fix mode only)

After **each** cohesive edit, run a fresh capture under the same build mode and scope:

```bash
node .agents/skills/vite-bundle-optimizer/scripts/audit.mjs \
  --out .vite-bundle-audit/after-01.json
node .agents/skills/vite-bundle-optimizer/scripts/report.mjs \
  .vite-bundle-audit/before.json .vite-bundle-audit/after-01.json
```

- Run the app's type-check, lint, unit tests and relevant browser checks using its established scripts. Check startup, navigation, direct deep link refresh (where supported), fallbacks, loading/errors, CSS, auth boundaries, and user interaction affected by the edit.
- Compare the **same entry identity** and scoped metric; inspect whether any new static or preload path cancels the benefit. For route-specific work, confirm the route actually uses the intended lazy chunk (source graph + browser network inspection when available).
- Keep the edit only if the target metric improves **and** behavior checks pass. Otherwise revert **only your own edit**; never clobber unrelated changes. If checks cannot be run, report the unverified edit as such, not a verified win.
- Promote the accepted snapshot as the baseline for the next independent change.

**Done:** one measured, validated improvement is accepted—or the attempt is explicitly reverted/unverified.

## 6. Report and stop

Report: mode/scope, Vite/build setup, baseline and after snapshot paths, changed source/import boundaries, entry/chunk/package evidence, **before/after bytes and percent**, test results, behavior caveats, unknowns and next best candidates. Distinguish **build-graph estimates** from **real browser requests, transfer, TTI and Core Web Vitals**, which require independent runtime measurements. Count only accepted changes as improvements.

For audit-only requests, provide ranked actionable candidates and evidence; leave source unchanged. For fix requests, include all accepted/reverted/unverified edits.

**Done:** every scoped candidate or attempted edit has evidence, an action or a stated evidence gap.
