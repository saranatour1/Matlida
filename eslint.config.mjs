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
  {
    files: ['convex/*.ts'],
    ignores: [
      'convex/schema.ts',
      'convex/convex.config.ts',
      'convex/auth.config.ts',
      'convex/http.ts',
      'convex/crons.ts',
      'convex/test.setup.ts',
      'convex/test.budget.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            'Only Convex config files go directly in convex/. Define functions in convex/models/<table>/functions.ts and re-export them from convex/api/<table>.ts.',
        },
      ],
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
