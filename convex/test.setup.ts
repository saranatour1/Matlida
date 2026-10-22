/// <reference types="vite/client" />
import shoppingSchema from './components/shopping/schema'
import studySchema from './components/study/schema'

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

/** The study component, for tests that make decks or check in: `registerStudy(t)` after `convexTest`. */
const studyModules = import.meta.glob('./components/study/**/*.ts')
export const registerStudy = (t: {
  registerComponent: (
    name: string,
    schema: typeof studySchema,
    modules: typeof studyModules,
  ) => unknown
}) => t.registerComponent('study', studySchema, studyModules)
