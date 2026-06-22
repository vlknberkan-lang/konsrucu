import { Sidebar } from 'konsrucu'

const tenant = { musteri: 'Ray Sigorta A.Ş.', ofis: 'K&Partners Hukuk', init: 'RS' }
const recentCases = [
  { hasarNo: 'HS-2024-0198', durum: 'gozden', dusuk: 2 },
  { hasarNo: 'HS-2024-0211', durum: 'takibeHazir', dusuk: 0 },
  { hasarNo: 'HS-2024-0237', durum: 'idariBekl', dusuk: 1 },
]

// Sidebar is `hidden md:flex` (desktop-only). The scoped style below forces the
// desktop layout so the card can render it at its real 272px width without
// needing a >=768px viewport.
const showDesktop = '.kr-sb-card > nav{display:flex !important}'

// The context panel with a tenant and a few recent cases.
export const Default = () => (
  <>
    <style>{showDesktop}</style>
    <div className="kr-sb-card" style={{ width: 272, height: 640, background: 'hsl(214 32% 98%)' }}>
      <Sidebar tenant={tenant} recentCases={recentCases} />
    </div>
  </>
)

// No tenant selected and no recent files yet — the empty state.
export const EmptyState = () => (
  <>
    <style>{showDesktop}</style>
    <div className="kr-sb-card" style={{ width: 272, height: 640, background: 'hsl(214 32% 98%)' }}>
      <Sidebar tenant={null} recentCases={[]} />
    </div>
  </>
)
