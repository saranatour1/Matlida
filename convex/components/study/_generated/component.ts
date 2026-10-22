/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    decks: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          format: "cards" | "quiz";
          items: Array<{
            answer?: number;
            back: string;
            choices?: Array<string>;
            front: string;
            kind: "card" | "choice" | "short";
          }>;
          projectId: string;
          title: string;
          topic: string;
          userId: string;
        },
        string,
        Name
      >;
      due: FunctionReference<
        "query",
        "internal",
        { limit: number; userId: string },
        Array<{
          deck: string;
          item: {
            _creationTime: number;
            _id: string;
            answer?: number;
            back: string;
            choices?: Array<string>;
            deckId: string;
            due: number;
            ease: number;
            front: string;
            interval: number;
            kind: "card" | "choice" | "short";
            reps: number;
            userId: string;
          };
        }>,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { id: string; userId: string },
        {
          deck: {
            _creationTime: number;
            _id: string;
            format: "cards" | "quiz";
            projectId: string;
            title: string;
            topic: string;
            userId: string;
          };
          items: Array<{
            _creationTime: number;
            _id: string;
            answer?: number;
            back: string;
            choices?: Array<string>;
            deckId: string;
            due: number;
            ease: number;
            front: string;
            interval: number;
            kind: "card" | "choice" | "short";
            reps: number;
            userId: string;
          }>;
        } | null,
        Name
      >;
      grade: FunctionReference<
        "mutation",
        "internal",
        {
          grade: "again" | "hard" | "good" | "easy";
          id: string;
          userId: string;
        },
        number,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { projectId: string; userId: string },
        Array<{
          deck: {
            _creationTime: number;
            _id: string;
            format: "cards" | "quiz";
            projectId: string;
            title: string;
            topic: string;
            userId: string;
          };
          due: number;
        }>,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { id: string; userId: string },
        null,
        Name
      >;
    };
  };
