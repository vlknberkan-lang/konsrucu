import { GlobalHeader } from 'konsrucu'

const user = { ad: 'Av. Berkan Bıyıklı', rol: 'Kıdemli Avukat', init: 'BB' }

// Breadcrumb · search · theme toggle · notifications · sign-out · user chip.
// useTheme has no provider here, so the theme toggle renders in its idle state.
export const Default = () => (
  <div style={{ background: 'hsl(0 0% 100%)' }}>
    <GlobalHeader crumb="Gelen Kutusu" user={user} />
  </div>
)

// A deeper breadcrumb context (e.g. a case detail screen).
export const CaseDetail = () => (
  <div style={{ background: 'hsl(0 0% 100%)' }}>
    <GlobalHeader crumb="HS-2024-0198 · Triyaj" user={user} />
  </div>
)
