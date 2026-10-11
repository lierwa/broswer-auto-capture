import { build } from 'esbuild'
import path from 'node:path'
import { root, directory } from '../locations.mjs'

await build({ entryPoints: [path.join(root, 'tests/input-fixture.tsx')], bundle: true,
  platform: 'browser', format: 'iife', outfile: path.join(directory, 'runtime/input-fixture.js') })
