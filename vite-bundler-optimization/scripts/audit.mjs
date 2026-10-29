#!/usr/bin/env node
/**
 * Capture a version-neutral Vite production bundle snapshot using an in-memory plugin.
 * Does not modify project source, dependencies, lockfiles or persistent Vite config.
 * Requires Vite to already be installed in the target project.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const cwd = process.cwd()
const argv = process.argv.slice(2)
const options = { out: '.vite-bundle-audit/before.json' }

function usage() {
  console.log(`Usage: node scripts/audit.mjs [--out path] [--config vite.config.ts] [--mode production]\n\nRun from your Vite app directory. Builds with existing config; generates a separate JSON bundle snapshot.\nNo new project dependencies or persistent configuration edits are needed.`)
}
function getArg(name) {
  const i = argv.indexOf(name)
  if (i < 0) return undefined
  if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw Error(`${name} requires a value`)
  return argv[i + 1]
}
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--help' || argv[i] === '-h') { usage(); process.exit(0) }
  if (['--out', '--config', '--mode'].includes(argv[i])) { i++; continue }
  throw Error(`Unknown argument: ${argv[i]}`)
}
options.out = getArg('--out') ?? options.out
options.config = getArg('--config')
options.mode = getArg('--mode')

const outfile = path.resolve(cwd, options.out)
function slash(p) { return p.replace(/\\/g, '/') }
function cleanModuleId(id) {
  if (!id) return null
  let value = slash(String(id))
  if (value.startsWith('\u0000')) value = `[virtual]${value.slice(1)}`
  const rel = slash(path.relative(cwd, value))
  if (path.isAbsolute(value) && !rel.startsWith('../') && rel !== '..') return rel
  return value
}
function packageName(id) {
  const p = slash(String(id))
  const at = p.lastIndexOf('node_modules/')
  if (at === -1) return null
  const suffix = p.slice(at + 'node_modules/'.length)
  const m = suffix.match(/^(@[^/]+\/[^/]+|[^/]+)/)
  return m && m[1] !== '.pnpm' ? m[1] : null
}
function sizeOf(source) { return Buffer.isBuffer(source) ? source : Buffer.from(source ?? '') }
function gzipped(buffer) { return gzipSync(buffer).byteLength }

async function importProjectVite() {
  // Resolve as a dependency of the project, not of this skill's source location.
  const req = createRequire(pathToFileURL(path.join(cwd, 'package.json')))
  let entry
  try { entry = req.resolve('vite') }
  catch { throw Error('Could not resolve Vite from this project. Run inside an app that has installed Vite (`node_modules` or workspace resolution).') }
  let vite = await import(pathToFileURL(entry).href)
  if (typeof vite.build !== 'function') {
    // Some versions resolve the CJS compatibility shim via require.resolve.
    let dir = path.dirname(entry)
    while (dir !== path.dirname(dir)) {
      const pkg = path.join(dir, 'package.json')
      if (fs.existsSync(pkg)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(pkg, 'utf8'))
          if (metadata.name === 'vite') {
            const esm = metadata.exports?.['.']?.import ?? './dist/node/index.js'
            const relative = typeof esm === 'string' ? esm : esm?.default
            if (relative) vite = await import(pathToFileURL(path.resolve(dir, relative)).href)
            break
          }
        } catch { /* try ancestors */ }
      }
      dir = path.dirname(dir)
    }
  }
  if (typeof vite.build !== 'function') throw Error('Installed Vite entry does not export build(). Check installed Vite version and module resolution.')
  return vite
}

const snapshot = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  project: path.basename(cwd),
  nodeVersion: process.version,
  viteVersion: null,
  config: {},
  outputs: [],
}
const plugin = {
  name: 'vite-bundle-optimizer:capture',
  apply: 'build',
  enforce: 'post',
  configResolved(config) {
    snapshot.config = {
      root: slash(path.relative(cwd, config.root)) || '.',
      mode: config.mode,
      base: config.base,
      outDir: config.build?.outDir,
      ssr: Boolean(config.build?.ssr),
      lib: Boolean(config.build?.lib),
      sourcemap: config.build?.sourcemap ?? false,
      target: config.build?.target ?? null,
      minify: config.build?.minify ?? null,
    }
  },
  generateBundle(outputOptions, bundle) {
    const result = { output: outputOptions?.dir ?? outputOptions?.file ?? '', chunks: [], assets: [] }
    for (const item of Object.values(bundle)) {
      if (item.type === 'chunk') {
        const content = Buffer.from(item.code ?? '', 'utf8')
        result.chunks.push({
          fileName: item.fileName,
          name: item.name,
          isEntry: Boolean(item.isEntry),
          isDynamicEntry: Boolean(item.isDynamicEntry),
          facadeModuleId: cleanModuleId(item.facadeModuleId),
          imports: [...(item.imports ?? [])],
          dynamicImports: [...(item.dynamicImports ?? [])],
          bytes: content.byteLength,
          gzipBytes: gzipped(content),
          modules: Object.entries(item.modules ?? {}).map(([id, info]) => ({
            id: cleanModuleId(id),
            package: packageName(id),
            renderedLength: typeof info?.renderedLength === 'number' ? info.renderedLength : null,
          })),
        })
      } else if (item.type === 'asset') {
        const body = sizeOf(item.source)
        const isCss = /\.css$/i.test(item.fileName)
        result.assets.push({
          fileName: item.fileName,
          bytes: body.byteLength,
          gzipBytes: isCss ? gzipped(body) : null,
          kind: isCss ? 'css' : 'other',
        })
      }
    }
    snapshot.outputs.push(result)
  },
}

try {
  if (!fs.existsSync(path.resolve(cwd, 'package.json'))) throw Error('Run from a Vite app root containing package.json')
  const vite = await importProjectVite()
  snapshot.viteVersion = vite.version ?? 'unknown'
  const config = { plugins: [plugin] }
  if (options.config) config.configFile = path.resolve(cwd, options.config)
  if (options.mode) config.mode = options.mode
  console.log(`Building ${snapshot.project} with Vite ${snapshot.viteVersion}…`)
  const output = await vite.build(config)
  if (output && typeof output.on === 'function') throw Error('Build is in watch mode. Disable build.watch for this audit.')
  if (!snapshot.outputs.length) throw Error('No output was captured. Check whether Vite was configured for a custom/SSR build that bypasses this plugin.')
  fs.mkdirSync(path.dirname(outfile), { recursive: true })
  fs.writeFileSync(outfile, JSON.stringify(snapshot, null, 2) + '\n', { encoding: 'utf8' })
  console.log(`Wrote ${outfile}`)
  console.log(`Outputs: ${snapshot.outputs.length}, chunks: ${snapshot.outputs.reduce((n, a) => n + a.chunks.length, 0)}`)
  console.log(`Inspect with: node ${path.relative(cwd, fileURLToPath(new URL('./report.mjs', import.meta.url)))} ${path.relative(cwd, outfile)}`)
} catch (err) {
  console.error(`vite-bundle-optimizer: ${err.message}`)
  process.exitCode = 1
}
