import { Badge } from 'konsrucu'

const wrap = { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: 24 }

// Every tone in the KonsRücü palette, with realistic status labels.
export const Tones = () => (
  <div style={wrap}>
    <Badge tone="kr">Akıllı çıkarım</Badge>
    <Badge tone="info">Klasik İcra</Badge>
    <Badge tone="success">Takibe hazır</Badge>
    <Badge tone="warning">Gözden geçir</Badge>
    <Badge tone="danger">Düşük güven</Badge>
    <Badge tone="brand">Kobalt</Badge>
    <Badge tone="steel">Arşiv</Badge>
  </div>
)

// The status-dot variant used in case lists and the inbox.
export const WithStatusDot = () => (
  <div style={wrap}>
    <Badge tone="success" dot>İmzaya hazır</Badge>
    <Badge tone="warning" dot>Dilekçe bekliyor</Badge>
    <Badge tone="danger" dot>3 alan düşük</Badge>
    <Badge tone="kr" dot>İşleniyor</Badge>
  </div>
)
