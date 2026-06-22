# design-sync notes — konsrucu

This repo is a **Next.js app**, not a published component library. The sync runs the
**package shape in synth-entry mode**, but via a **curated `--entry`** rather than letting
the converter scan `components/` (which would pull the backend-coupled feature components —
Supabase / Prisma / server actions — into the bundle).

## How it's wired
- **Scope gate:** `.design-sync/ds-entry.tsx` re-exports ONLY the 11 scoped components
  (reusable UI + brand + shell). Passed as `--entry`. To add/remove a component, edit this
  file AND `cfg.componentSrcMap`.
- **Render shims** (in `.design-sync/shims/`), routed via `cfg.tsconfig`
  (`.design-sync/tsconfig.dssync.json`) `paths` — esbuild's tsconfig-paths plugin:
  - `next/link` → plain `<a>`; `next/navigation` → stable `usePathname()='/akilli-giris'`
    etc. (the real hook returns null outside a router and Rail/Sidebar crash on it).
  - `@/app/actions/auth` → no-op `signOutAction` (the real one imports Supabase/cookies).
  - `next-themes` is NOT shimmed — `useTheme` is guarded by `mounted`, renders idle (light).
- **CSS:** `cfg.cssEntry` = `.design-sync/ds-styles.css`, compiled by `cfg.buildCmd` from
  `app/globals.css` + `.design-sync/tailwind.dssync.ts` (content scan widened to include
  `.design-sync/previews/`). **Recompile before every build** (it's gitignored/generated).
- **Sidebar** is `hidden md:flex` (desktop-only). Its preview injects a scoped
  `.kr-sb-card > nav{display:flex !important}` style so the card renders it at its true
  272px width without needing a ≥768px viewport.
- **Shell card viewports** are set in `cfg.overrides` (AppShell single 1280×780; Sidebar
  300×700; Rail 112×640; GlobalHeader 1080×300). Screenshots are full-page, so width matters.

## Gotchas (learned the hard way)
- **`cfg.tsconfig` must be comment-free JSON.** A `"//": "..."` key broke the converter's
  comment-stripper (`/(^|[^:])\/\/.*$/` ate the `//` inside the string), `JSON.parse` threw,
  the paths plugin silently returned null, and esbuild fell back to the repo tsconfig
  (`@/* → real`) — bundling the real `next/link` + the real Supabase server action. Symptom:
  979 KB bundle, `ReferenceError: process is not defined`, `[BUNDLE_EXPORT] 11/11`. With the
  shims active the bundle is ~31 KB. Keep that tsconfig clean.
- **playwright:** repo has no pin; the machine cache has chromium-headless-shell builds
  1148/1200/1208. `playwright@1.58.0` pins **1208** (installed in `.ds-sync` with
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`). playwright@latest pins 1228 (not cached → would
  download).

## Fonts
- `[FONT_REMOTE]`: `globals.css` `@import`s Google Fonts (Hanken Grotesk / Inter / Inter
  Tight / JetBrains Mono). They load at runtime from the font host — nothing to ship. No action.

## Known render warns
- None. (11/11 render clean; no thin/variantsIdentical/fallback cards.)

## Re-sync risks (watch-list)
- **`ds-styles.css` is generated and gitignored** — run `cfg.buildCmd` (or the `resync`
  driver's rebuild) before the converter, or `cssEntry` won't exist and components ship unstyled.
- **Shims track upstream component APIs.** If Rail/Sidebar start reading more of
  `next/navigation` (params, search), or GlobalHeader imports more from `@/app/actions/auth`,
  extend the corresponding shim or the preview crashes/blanks.
- **`ds-entry.tsx` is the scope boundary** — it does not auto-discover new components.
- **next-themes renders idle** (no provider) — the theme toggle only ever shows the light state
  in previews; that's expected, not a bug.
- **Shell preview mock data** (user/tenant/recentCases) is inlined in the preview `.tsx` —
  illustrative only; update if the real shapes (`ShellUser`/`ShellTenant`/`RecentCase`) change.
