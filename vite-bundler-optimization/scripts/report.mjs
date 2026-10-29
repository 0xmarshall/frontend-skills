#!/usr/bin/env node
/** Inspect and compare vite-bundle-optimizer/audit.mjs JSON snapshots. */
import fs from 'node:fs'
import path from 'node:path'
const files = process.argv.slice(2)
if (files.includes('--help') || files.includes('-h') || files.length < 1 || files.length > 2) {
  console.log('Usage: node scripts/report.mjs before.json [after.json]')
  process.exit(files.length ? 0 : 1)
}
function read(f) {
  const s = JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'))
  if (s.schemaVersion !== 1 || !Array.isArray(s.outputs)) throw Error(`Unsupported or invalid snapshot: ${f}`)
  return s
}
const before = read(files[0])
const after = files[1] ? read(files[1]) : null
function pretty(n) { return n == null ? 'n/a' : `${(n / 1024).toFixed(1)} KiB` }
function pct(b, a) { return b ? `${((a - b) / b * 100).toFixed(1)}%` : 'n/a' }
function graph(output) {
  const map = new Map(output.chunks.map(c => [c.fileName, c]))
  const entries = output.chunks.filter(c => c.isEntry)
  return entries.map(entry => {
    const seen = new Set(), stack = [entry.fileName]
    while (stack.length) {
      const name = stack.pop()
      if (seen.has(name) || !map.has(name)) continue
      seen.add(name)
      for (const dep of map.get(name).imports) stack.push(dep)
    }
    const chunks = [...seen].map(n => map.get(n))
    return {
      id: entry.facadeModuleId || entry.name || entry.fileName,
      label: entry.facadeModuleId || entry.name || entry.fileName,
      fileName: entry.fileName,
      chunks: chunks.map(c => c.fileName),
      bytes: chunks.reduce((s, c) => s + c.bytes, 0),
      gzipBytes: chunks.reduce((s, c) => s + c.gzipBytes, 0),
    }
  })
}
function summarize(s) {
  const chunks = s.outputs.flatMap(o => o.chunks)
  const assets = s.outputs.flatMap(o => o.assets)
  const entryGroups = s.outputs.map((o, i) => ({ outputIndex: i, entries: graph(o) }))
  const packages = new Map()
  for (const c of chunks) for (const m of c.modules) {
    if (!m.package || m.renderedLength == null) continue
    packages.set(m.package, (packages.get(m.package) ?? 0) + m.renderedLength)
  }
  return { chunks, assets, entryGroups, packages }
}
function display(s) {
  const d = summarize(s)
  console.log(`\n=== ${s.project} — Vite ${s.viteVersion} (${s.createdAt}) ===`)
  console.log(`Mode: ${s.config.mode} | base: ${s.config.base} | outDir: ${s.config.outDir} | SSR: ${s.config.ssr} | library: ${s.config.lib}`)
  console.log(`Emitted JS: ${pretty(d.chunks.reduce((a,c)=>a+c.bytes,0))}, gzip-sum: ${pretty(d.chunks.reduce((a,c)=>a+c.gzipBytes,0))}`)
  console.log(`Emitted CSS: ${pretty(d.assets.filter(a=>a.kind==='css').reduce((a,c)=>a+c.bytes,0))} | Other assets: ${pretty(d.assets.filter(a=>a.kind==='other').reduce((a,c)=>a+c.bytes,0))}`)
  for (const group of d.entryGroups) {
    console.log(`\nEntry closures (output ${group.outputIndex}; synchronous JS only, excludes preload/runtime behavior):`)
    if (!group.entries.length) console.log('  No emitted entry chunks; inspect custom output configuration.')
    for (const e of group.entries.sort((a,b)=>b.gzipBytes-a.gzipBytes))
      console.log(`  ${e.label}: ${pretty(e.bytes)} emitted | ${pretty(e.gzipBytes)} gzip-sum | ${e.chunks.length} chunks`)
  }
  console.log('\nLargest JS chunks (each emitted file counted once):')
  for (const c of [...d.chunks].sort((a,b)=>b.gzipBytes-a.gzipBytes).slice(0,12)) {
    console.log(`  ${c.fileName}: ${pretty(c.gzipBytes)} gzip | ${pretty(c.bytes)} emitted | ${c.isEntry ? 'entry' : c.isDynamicEntry ? 'dynamic entry' : 'shared'} | ${c.modules.length} modules`)
  }
  console.log('\nLargest dependency package contributions (approximate rendered JS bytes):')
  for (const [p, n] of [...d.packages].sort((a,b)=>b[1]-a[1]).slice(0,15)) console.log(`  ${p}: ${pretty(n)}`)
  console.log('\nBuild output is not proof of actual browser transfer, cache state, preload behavior, CPU time or UX performance.')
  return d
}
const b = display(before)
if (after) {
  const a = display(after)
  console.log('\n=== Before → after (identical scope/config required) ===')
  const bEntries = b.entryGroups.flatMap(g => g.entries.map(e=>({ ...e, outputIndex:g.outputIndex })))
  const aEntries = a.entryGroups.flatMap(g => g.entries.map(e=>({ ...e, outputIndex:g.outputIndex })))
  const next = new Map(aEntries.map(e=>[`${e.outputIndex}:${e.id}`, e]))
  for (const e of bEntries) {
    const n = next.get(`${e.outputIndex}:${e.id}`)
    if (n) console.log(`  ${e.label}: ${pretty(e.gzipBytes)} → ${pretty(n.gzipBytes)} gzip-sum (${pct(e.gzipBytes, n.gzipBytes)}), ${pretty(e.bytes)} → ${pretty(n.bytes)} emitted (${pct(e.bytes,n.bytes)})`)
    else console.log(`  ${e.label}: unmatched (entry identity/output order changed)`) 
  }
  if (before.viteVersion !== after.viteVersion || JSON.stringify(before.config) !== JSON.stringify(after.config))
    console.warn('WARNING: Vite version or build config differs; comparisons may be invalid.')
  const beforeJS = b.chunks.reduce((x,c)=>x+c.gzipBytes,0)
  const afterJS = a.chunks.reduce((x,c)=>x+c.gzipBytes,0)
  console.log(`  Total emitted JS gzip-sum: ${pretty(beforeJS)} → ${pretty(afterJS)} (${pct(beforeJS,afterJS)})`)
  console.log('Compare per-entry closures and runtime behavior before claiming an initial-load win.')
}
