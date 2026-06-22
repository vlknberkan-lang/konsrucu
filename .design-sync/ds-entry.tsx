// design-sync curated bundle entry.
// Re-exports ONLY the scoped design-system layer (reusable UI + brand + shell),
// so the converter's esbuild graph never pulls in the backend-coupled feature
// components (Supabase / Prisma / server actions). This is the --entry passed to
// package-build.mjs; it is the single source of the window.KonsRucu.* exports.
export { Badge, PageHeader, Conf, ConfBar, FlowStrip } from '@/components/konsrucu/ui'
export { KonsRucuMark, KonsRucuWordmark } from '@/components/brand/konsrucu-mark'
export { AppShell } from '@/components/shell/app-shell'
export { GlobalHeader } from '@/components/shell/global-header'
export { Rail } from '@/components/shell/rail'
export { Sidebar } from '@/components/shell/sidebar'
