import { KonsRucuWordmark } from 'konsrucu'

// "Kons" + teal "Rücü" + aperture dot, on a light surface.
export const Light = () => (
  <div style={{ display: 'flex', gap: 28, alignItems: 'baseline', padding: 32, background: '#ffffff' }}>
    <KonsRucuWordmark size={30} />
    <KonsRucuWordmark size={22} />
  </div>
)

// The onDark variant for the midnight rail / dark surfaces.
export const OnDark = () => (
  <div style={{ padding: 32, background: '#0a1628' }}>
    <KonsRucuWordmark size={30} onDark />
  </div>
)
