# Import-graph methods

Start with emitted chunks and module-to-chunk attribution. Verify each candidate against real source imports. The snapshot records **chunk-level** static/dynamic edges, not necessarily the complete original module-level dependency graph.

1. Select one or more true initial roots (HTML `type=module` scripts, Vite emitted entries, and any linked `modulepreload` assets). For SPA route-specific questions, inspect the router and browser requests.
2. Traverse each chunk's `imports` edges; those are statically reachable. Record the closure and unique members. Keep `dynamicImports` edges separate.
3. Locate high-rendered-length modules in root-reachable chunks. Inspect their actual source importers and all alternate eager paths. Consider module side effects and import cycles.
4. For a large optional feature, search for a *small set of source boundaries* where `import` can become event/route-gated `import()`. Changing just one importer is insufficient if another eager path remains.
5. Only if the app graph is large enough to justify it, construct a directed module graph from actual compiler import metadata or a separate version-compatible analyzer. A min-cut result from the incomplete chunk graph is **a hypothesis**, not a safe automatic edit. Validate every proposed cut against source, route conditions and behavior checks.
6. Rebuild and compare after; detached functionality should move out of the relevant static entry closure. Runtime network and preloading checks settle whether this was a real load deferral.

Never equate a graph edge's removal with saved transfer bytes without checking emitted outputs. Attribute each emitted chunk only once within an entry; preserve unknown/unsupported edges as an evidence gap.
