# Progress

## 2026-10-18

### Built

- **Logo**: the kite sketch redrawn as `public/logo.svg` (64×64, stroke only, dark strokes in light mode and light strokes in dark mode). Used as the SVG favicon and on the auth pages in place of the placeholder icon.
- **Icons**: `favicon.ico` (16/32/48), `apple-touch-icon.png` and the two Android icons, rendered from the logo on white. The TanStack starter icons and the unused `favicon-16x16.png`, `favicon-32x32.png` and `favicon.png` are gone.
- **OG image**: `public/og.png` (1200×630): logo, "Matilda" in Geist and the tagline.
- **Head** (`src/routes/__root.tsx`): description, `og:*` and `twitter:*` tags. `og:image` is prefixed with `VITE_SITE_URL` when it's set.
- **README**: bio, what's built, stack, setup, env vars, scripts.

### Verified

- `pnpm lint` (typecheck + ESLint) passes.
- On the dev server, all meta tags render and `/logo.svg`, `/og.png`, `/favicon.ico`, `/apple-touch-icon.png` and `/site.webmanifest` return 200. The logo switches to light strokes under dark mode.
- Found that TanStack's `HeadContent` keeps only one meta per `name`, so the two media-scoped `theme-color` tags were dropped.

### Logo v2: kite chat bubble

- Designed in Paper (file "Matilda — Logo"). There are three directions: A has dotted spar, B the sketch's spar, C typing dots. It also has light and dark lockups and 32/16px previews.
- Picked C: the kite body is a speech bubble with three rounded corners, the sharp fourth corner is the tail, and the kite string runs from it. Three level typing dots sit inside. A was dropped because diagonal dots in a rounded square read as a die.
- Stroke went from 3.5 to 4.5 so the mark holds at 16–32px.
- `public/logo.svg`, every icon PNG, `favicon.ico` and `og.png` were re-rendered from it. Checked in light and dark mode with headless Chrome.

### Logo v2.1: diagonal dots

- The three typing dots now run diagonally at 45°, falling left to right (`transform="rotate(45 26.4 28)"` on the dots group in `public/logo.svg`).
- `favicon.ico`, `apple-touch-icon.png`, both Android icons and `og.png` were re-rendered to match.

### Vendored shadcn CSS (Dependabot #1)

- `shadcn` was a devDependency only so `app.css` could import `shadcn/tailwind.css`, and it pulled in `braces@3.0.3` (high-severity DoS, no patched release). That file now lives at `src/styles/shadcn.css` and the dependency is gone, along with braces.
- Run the CLI with `pnpm dlx shadcn@latest add <component>`.

### Assistants sidebar (2026-10-19)

- The sidebar lists assistants: the workspace's lead (Matilda by default) first, then its bots. Each one opens to its recent chats, including the sub-threads where the lead handed it work.
- You can chat with any bot directly. Threads record `botId`, and the bot answers with its own instructions.
- A workspace switcher sits at the top of the sidebar. New accounts start with a workspace led by Matilda, and `/` opens your first workspace.
- Verified on a local backend with verify-matlida: sign-up lands in the Matilda workspace, an added bot shows in the sidebar, and a message to it files the chat under that bot. Replies need the AI gateway, which the anonymous local backend can't reach.

### Orb avatars, settings, library and members (2026-10-19)

- Assistants wear one of 12 preset orbs (CSS gradients in `src/components/orb.tsx`, ids in `convex/lib/avatars.ts`). You pick one on the bot form or, for the lead, in Settings. Nobody uploads images.
- Settings (`/p/$projectId/settings`) edits the workspace, the lead's name and look, and links to texting. Library (`/p/$projectId/library`) replaces the Commands page.
- Chats have members. The members bar on a chat adds or removes other assistants, and the chat's assistant can hand work to them with `ask_bot`. The lead works with every bot until you pick members. A bot works alone until you add some.
- Verified on a local backend: picking coral in Settings saves `avatar: "coral"` and the sidebar orb follows; adding Nora to Ivy's chat shows "With Nora".
