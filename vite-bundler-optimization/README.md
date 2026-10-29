# vite-bundle-optimizer

A standalone **agent skill** for analyzing React + Vite production bundles. Inspired by the workflow of Vercel's `next-bundle-optimizer`, but adapted to Vite's own build API and React loading boundaries. It is **not** an official Vite or Vercel skill.

## Install (local)

Copy the entire `vite-bundle-optimizer` folder into:

- `.agents/skills/vite-bundle-optimizer/` (Codex, Cursor and other tools that discover `.agents/skills`)
- `.claude/skills/vite-bundle-optimizer/` (Claude Code)

For global usage, copy it under the corresponding user's `~/.agents/skills/` or `~/.claude/skills/` folder. If you later publish it in a GitHub repository following the Agent Skills convention, you can install it using the skills CLI. It is not currently published on skills.sh.

## Run audit (from a Vite project root)

```bash
node .agents/skills/vite-bundle-optimizer/scripts/audit.mjs --out .vite-bundle-audit/before.json
node .agents/skills/vite-bundle-optimizer/scripts/report.mjs .vite-bundle-audit/before.json
```

The script uses the project's **already installed Vite**, existing config, and production build API. No dependency install or config change is required. It writes a snapshot file and updates the project's normal build output (`dist` unless configured otherwise). `.vite-bundle-audit/` should normally be gitignored by the app owner.

For audit-only agent use:

> Use vite-bundle-optimizer to audit all client initial-load dependencies in this React + Vite app. Don't change source files or dependencies. Report ranked candidates with exact importers, baseline evidence and the likely safe split boundaries.

For actual optimization:

> Use vite-bundle-optimizer in fix mode. Make the smallest behavior-preserving change, compare the before/after bundle reports, run our tests and keep only verified improvements.

## Scripts

- `scripts/audit.mjs`: captures a Vite production-build chunk/module snapshot. Supports `--out`, `--config`, `--mode` and `--help`.
- `scripts/report.mjs`: reads one snapshot or compares baseline and after snapshots.

The reporter captures generated JS/CSS byte and gzip sizes, chunk import links and approximate per-module rendered lengths. These are **build metrics**, not real browser load timings. See `references/measurement.md` for caveats.

## Offline smoke test

```bash
node tests/smoke-test.mjs
```

This checks snapshot/report handling with a **mock Vite build API**. It is not a substitute for running the audit in a real Vite project. The scripts were designed against Vite's documented build API and bundler output hooks.
