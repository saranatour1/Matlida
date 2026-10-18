import { defineConfig, globalIgnores } from 'eslint/config'
import { tanstackConfig } from '@tanstack/eslint-config'
import convexPlugin from '@convex-dev/eslint-plugin'

export default defineConfig([
  ...tanstackConfig,
  ...convexPlugin.configs.recommended,
  {
    files: ['**/convex/**/*.ts'],
    rules: {
      '@convex-dev/no-collect-in-query': 'error',
      '@convex-dev/require-access-control': 'error',
    },
  },
  // Generated code, build output and other checkouts.
  globalIgnores([
    'convex/_generated',
    'src/components/ui',
    'src/routeTree.gen.ts',
    'dist',
    '.claude',
  ]),
])
