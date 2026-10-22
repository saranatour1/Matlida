/// <reference types="vite/client" />
import shoppingSchema from './components/shopping/schema'

/** Every Convex module, for `convexTest(schema, modules)`. */
export const modules = import.meta.glob('./**/*.*s')

/** The shopping component, for tests that buy or watch: `registerShopping(t)` after `convexTest`. */
const shoppingModules = import.meta.glob('./components/shopping/**/*.ts')
export const registerShopping = (t: {
  registerComponent: (
    name: string,
    schema: typeof shoppingSchema,
    modules: typeof shoppingModules,
  ) => unknown
}) => t.registerComponent('shopping', shoppingSchema, shoppingModules)
