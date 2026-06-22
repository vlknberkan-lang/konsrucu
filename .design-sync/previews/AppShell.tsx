import { AppShell, PageHeader, Badge } from 'konsrucu'

const user = { ad: 'Av. Berkan Bıyıklı', rol: 'Kıdemli Avukat', init: 'BB' }
const tenant = { musteri: 'Ray Sigorta A.Ş.', ofis: 'K&Partners Hukuk', init: 'RS' }
const recentCases = [
  { hasarNo: 'HS-2024-0198', durum: 'gozden', dusuk: 2 },
  { hasarNo: 'HS-2024-0211', durum: 'takibeHazir', dusuk: 0 },
  { hasarNo: 'HS-2024-0237', durum: 'idariBekl', dusuk: 1 },
]

// The full application shell: 72px rail + 272px context panel + main column
// (global header + scrolling content). Rendered with realistic inbox content.
export const Default = () => (
  <AppShell user={user} tenant={tenant} recentCases={recentCases} crumb="Gelen Kutusu">
    <div style={{ padding: 28 }}>
      <PageHeader
        kicker="AKILLI GİRİŞ"
        title="Gelen Kutusu"
        sub="Ham evrak yığını içeri; imzaya hazır çıktı dışarı."
      />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Badge tone="kr" dot>İşleniyor</Badge>
        <Badge tone="warning" dot>Gözden geçir</Badge>
        <Badge tone="success" dot>Takibe hazır</Badge>
        <Badge tone="info">Klasik İcra</Badge>
      </div>
    </div>
  </AppShell>
)
