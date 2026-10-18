import { defineConfig, globalIgnores } from 'eslint/config'
import { tanstackConfig } from '@tanstack/eslint-config'
import convexPlugin from '@convex-dev/eslint-plugin'

export default defineConfig([
  ...tanstackConfig,
  ...convexPlugin.configs.recommended,
  // Generated code, build output and other checkouts.
  globalIgnores([
    'convex/_generated',
    'src/components/ui',
    'src/routeTree.gen.ts',
    'dist',
    '.claude',
  ]),
])
