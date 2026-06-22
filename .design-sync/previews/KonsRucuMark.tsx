import { KonsRucuMark } from 'konsrucu'

// The aperture "K" mark. Default fill is white, so it's shown on the brand
// midnight surface it's designed for, at the three common sizes.
export const OnMidnight = () => (
  <div style={{ display: 'flex', gap: 28, alignItems: 'center', padding: 32, background: '#0a1628' }}>
    <KonsRucuMark size={48} />
    <KonsRucuMark size={32} />
    <KonsRucuMark size={24} />
  </div>
)

// Custom fill / aperture-dot colors.
export const Tinted = () => (
  <div style={{ display: 'flex', gap: 28, alignItems: 'center', padding: 32, background: '#0a1628' }}>
    <KonsRucuMark size={40} fill="#ffffff" dot="#2fcad4" />
    <KonsRucuMark size={40} fill="#46d6e0" dot="#ffffff" />
  </div>
)
