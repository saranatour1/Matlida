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
  // Arrow functions everywhere but React components, which stay declarations.
  {
    files: ['convex/**/*.ts', 'src/lib/**/*.ts', 'src/hooks/**/*.ts'],
    rules: { 'func-style': ['error', 'expression'] },
  },
  // The app imports the backend as @convex/…, never up a chain of ../.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(\\.\\./)+convex/',
              message: 'Import from @convex/… instead.',
            },
          ],
        },
      ],
    },
  },
  // Dates and times go through luxon (convex/lib/time.ts), never the native Date API.
  {
    files: ['convex/**/*.ts', 'src/**/*.{ts,tsx}'],
    ignores: ['convex/tests/**', 'src/tests/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          "NewExpression[callee.name='Date']",
          "CallExpression[callee.object.name='Date'][callee.property.name=/^(parse|UTC)$/]",
          'MemberExpression[property.name=/^(toLocaleDateString|toLocaleTimeString|toISOString)$/]',
          "MemberExpression[object.name='Intl'][property.name='DateTimeFormat']",
        ].map((selector) => ({
          selector,
          message:
            'Use luxon for dates and times: the helpers in convex/lib/time.ts, or DateTime.',
        })),
      ],
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
    'convex/**/_generated',
    'src/components/ui',
    'src/routeTree.gen.ts',
    'dist',
    '.claude',
  ]),
])
