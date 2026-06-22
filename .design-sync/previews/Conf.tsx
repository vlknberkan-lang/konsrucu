import { Conf } from 'konsrucu'

const wrap = { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 24 }

// Confidence pill across the three levels (high >= 0.85, mid >= 0.7, else low).
export const Levels = () => (
  <div style={wrap}>
    <Conf c={0.93} />
    <Conf c={0.78} />
    <Conf c={0.55} />
  </div>
)

// Without the percentage suffix — just the level word.
export const WithoutPercent = () => (
  <div style={wrap}>
    <Conf c={0.91} pct={false} />
    <Conf c={0.72} pct={false} />
    <Conf c={0.48} pct={false} />
  </div>
)
