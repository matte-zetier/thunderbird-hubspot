// @ts-check
import * as esbuild from 'esbuild'
import { cp, mkdir } from 'fs/promises'

const isWatch = process.argv.includes('--watch')

const ENTRY_POINTS = [
  'src/background/index.ts',
  'src/popup/message-display/index.ts',
  'src/popup/compose/index.ts',
  'src/options/index.ts',
]

const STATIC_ASSETS = [
  ['manifest.json',                               'dist/manifest.json'],
  ['src/popup/message-display/index.html',        'dist/popup/message-display/index.html'],
  ['src/popup/compose/index.html',                'dist/popup/compose/index.html'],
  ['src/options/index.html',                      'dist/options/index.html'],
  ['icons',                                       'dist/icons'],
]

async function copyAssets() {
  await mkdir('dist', { recursive: true })
  await Promise.all(
    STATIC_ASSETS.map(([src, dest]) => cp(src, dest, { recursive: true })),
  )
}

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ENTRY_POINTS,
  bundle: true,
  outdir: 'dist',
  outbase: 'src',
  format: 'iife',
  target: 'firefox91',
  sourcemap: true,
}

await copyAssets()

if (isWatch) {
  const ctx = await esbuild.context(buildOptions)
  await ctx.watch()
  console.log('Watching for changes — run "web-ext run --source-dir dist" in a second terminal.')
} else {
  await esbuild.build(buildOptions)
  console.log('Build complete → dist/')
}
