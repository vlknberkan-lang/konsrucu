import { FlowStrip } from 'konsrucu'

// The 5-step pipeline (Ingest → Grupla → Çıkar → Triyaj → Yönlendir) at
// different progress steps — done steps get a check, the current step glows.
export const Steps = () => (
  <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
    <FlowStrip step={1} />
    <FlowStrip step={3} />
    <FlowStrip step={5} />
  </div>
)

// The dark-surface variant, e.g. on the midnight rail context panel.
export const OnDark = () => (
  <div style={{ padding: 24, background: '#0a1628' }}>
    <FlowStrip step={3} dark />
  </div>
)
