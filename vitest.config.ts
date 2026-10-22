import { defineConfig } from 'vitest/config'

export default defineConfig({
  // `~/` and `@convex/` from tsconfig.json, as in the app.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
  },
})
