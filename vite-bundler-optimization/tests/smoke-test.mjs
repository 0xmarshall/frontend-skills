/** Offline contract test: fakes the Vite build API, not a real Vite build. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-bundle-optimizer-test-'))
try {
  fs.mkdirSync(path.join(root, 'node_modules', 'vite'), { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test-vite-react', private: true }))
  fs.writeFileSync(path.join(root, 'node_modules', 'vite', 'package.json'), JSON.stringify({ name: 'vite', version: '8.0.0-test', type: 'module', main: 'index.js', exports: { '.': { import: './index.js', require: './index.js' } } }))
  fs.writeFileSync(path.join(root, 'node_modules', 'vite', 'index.js'), `export const version = '8.0.0-test';\nexport async function build({ plugins }) {\nconst plugin = plugins[0];\nplugin.configResolved({ root: process.cwd(), mode: 'production', base: '/', build: { outDir: 'dist', minify: true } });\nplugin.generateBundle({ dir: 'dist' }, {\n 'assets/index.js': { type: 'chunk', name: 'index', fileName: 'assets/index.js', code: 'import "./shared.js";console.log("test")', isEntry: true, isDynamicEntry: false, facadeModuleId: process.cwd() + '/src/main.tsx', imports: ['assets/shared.js'], dynamicImports: ['assets/optional.js'], modules: { [process.cwd() + '/src/main.tsx']: { renderedLength: 100 } } },\n 'assets/shared.js': { type: 'chunk', name: 'shared', fileName: 'assets/shared.js', code: 'export const shared=1;', isEntry: false, isDynamicEntry: false, imports: [], dynamicImports: [], modules: { [process.cwd() + '/node_modules/react/index.js']: { renderedLength: 21 } } },\n 'assets/optional.js': { type: 'chunk', name: 'optional', fileName: 'assets/optional.js', code: 'export const optional=1;', isEntry: false, isDynamicEntry: true, imports: [], dynamicImports: [], modules: { [process.cwd() + '/node_modules/heavy-lib/index.js']: { renderedLength: 22 } } },\n 'assets/styles.css': { type: 'asset', fileName: 'assets/styles.css', source: 'body{margin:0}' }\n});\nreturn {};\n}`)
  const auditPath = path.join(skill, 'scripts', 'audit.mjs')
  const before = path.join(root, '.vite-bundle-audit', 'before.json')
  const after = path.join(root, '.vite-bundle-audit', 'after.json')
  for (const out of [before, after]) {
    const result = spawnSync(process.execPath, [auditPath, '--out', out], { cwd: root, encoding: 'utf8' })
    if (result.status !== 0) throw Error(`Capture failed (${result.status}):\n${result.stdout}\n${result.stderr}`)
  }
  const report = spawnSync(process.execPath, [path.join(skill, 'scripts', 'report.mjs'), before, after], { cwd: root, encoding: 'utf8' })
  if (report.status !== 0) throw Error(`Report failed: ${report.stderr}`)
  const data = JSON.parse(fs.readFileSync(before, 'utf8'))
  if (data.outputs[0].chunks.length !== 3) throw Error('Incorrect chunk count')
  if (!report.stdout.includes('react:') || !report.stdout.includes('Before → after')) throw Error('Missing package summary or comparison')
  if (!report.stdout.includes('2 chunks')) throw Error('Static entry closure included lazy chunk or skipped shared chunk')
  console.log('PASS: offline snapshot / static entry closure / report comparison smoke test')
} finally { fs.rmSync(root, { recursive: true, force: true }) }
