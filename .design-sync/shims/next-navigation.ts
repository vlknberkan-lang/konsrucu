// design-sync render shim for next/navigation.
// The DS components (Rail, Sidebar) call usePathname() to highlight the active
// nav item. Outside a Next router the real hook returns null and `.startsWith`
// crashes — so this shim returns a stable, sensible pathname for static preview
// rendering. NOT shipped to consumers; only used while building preview cards.
export function usePathname(): string {
  return '/akilli-giris'
}
export function useRouter() {
  const noop = () => {}
  return { push: noop, replace: noop, back: noop, forward: noop, refresh: noop, prefetch: noop }
}
export function useSearchParams(): URLSearchParams {
  return new URLSearchParams()
}
export function useParams(): Record<string, string> {
  return {}
}
export function useSelectedLayoutSegment(): string | null {
  return null
}
export function useSelectedLayoutSegments(): string[] {
  return []
}
export function redirect(): void {}
export function permanentRedirect(): void {}
export function notFound(): void {}
