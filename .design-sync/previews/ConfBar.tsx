import { ConfBar } from 'konsrucu'

const row = { width: 260, marginBottom: 16 }
const label = {
  font: '600 11px/1.4 ui-sans-serif, system-ui',
  color: 'hsl(222 10% 46%)',
  marginBottom: 7,
  display: 'flex',
  justifyContent: 'space-between',
}

// The thin extraction-confidence bar, one per extracted field.
export const Levels = () => (
  <div style={{ padding: 24 }}>
    <div style={row}>
      <div style={label}><span>Plaka eşleşmesi</span><span>%93</span></div>
      <ConfBar c={0.93} />
    </div>
    <div style={row}>
      <div style={label}><span>Kaza tarihi</span><span>%76</span></div>
      <ConfBar c={0.76} />
    </div>
    <div style={row}>
      <div style={label}><span>Sigortalı adı</span><span>%52</span></div>
      <ConfBar c={0.52} />
    </div>
  </div>
)
