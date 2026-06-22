import { PageHeader } from 'konsrucu'

const frame = { padding: 28, background: 'hsl(214 32% 98%)' }

// The canonical page header: mono kicker, display title, muted sub.
export const Default = () => (
  <div style={frame}>
    <PageHeader
      kicker="AKILLI GİRİŞ"
      title="Gelen Kutusu"
      sub="Ham evrak yığını içeri; imzaya hazır çıktı dışarı. Tarama, gruplama ve çıkarım otomatik yürür."
    />
  </div>
)

// Kicker + title only — used on detail screens where the sub is redundant.
export const Compact = () => (
  <div style={frame}>
    <PageHeader kicker="DOSYA DETAYI" title="HS-2024-0198" />
  </div>
)
