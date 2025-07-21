import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['types/index.ts', 'utils/index.ts'],
  clean: true,
  dts: true,
  outDir: 'dist',
  format: ['cjs', 'esm'],
  external: ['axios'],
})
