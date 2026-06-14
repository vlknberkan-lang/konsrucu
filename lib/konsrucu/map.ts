/**
 * KonsRücü — UI tipleri + sözlükleri + saf dönüştürme (DB YOK; client-safe).
 * data.ts mock'unun mock'suz hali. Tüm ekranlar tip/etiket/çevrimi buradan alır.
 */
export type YolUi = 'klasik' | 'idari' | 'belirsiz' | null
export type Durum = 'isleniyor' | 'gozden' | 'idariBekl' | 'takibeHazir' | 'gonderildi'
export type Conf = number

export const YOLLAR: Record<'klasik' | 'idari' | 'belirsiz', { label: string; icon: string; tone: string }> = {
  klasik: { label: 'Klasik İcra', icon: 'gavel', tone: 'info' },
  idari: { label: 'İdari Yol', icon: 'landmark', tone: 'kr' },
  belirsiz: { label: 'Belirsiz', icon: 'help-circle', tone: 'warning' },
}
export const DURUM: Record<Durum, { label: string; tone: string }> = {
  isleniyor: { label: 'İşleniyor', tone: 'kr' },
  gozden: { label: 'Gözden geçir', tone: 'warning' },
  idariBekl: { label: 'Dilekçe bekliyor', tone: 'info' },
  takibeHazir: { label: 'Takibe hazır', tone: 'success' },
  gonderildi: { label: 'İmzaya gönderildi', tone: 'steel' },
}
export const FLOW = ['Ingest', 'Grupla', 'Çıkar', 'Triyaj', 'Yönlendir']

export type CaseT = {
  id: string; hasarNo: string; yol: YolUi; karar: string; yolGuven: number; yolNeden?: string
  fieldset: 'klasik' | 'idari' | null; step: number; durum: Durum
  sigortali: string; il: string; muhatap: string; kazaTarih: string; tutar: number
  pdf: number; foto: number; dusuk: number; kamera: number; islendi: string; detayli: boolean
  facts?: [string, string, boolean][]
}

export type Field = {
  k: string; label: string; v: string; conf: Conf; src: string
  mono?: boolean; layer: number; kind: 'belge' | 'hesap' | 'beyan'; flag?: boolean; crit?: boolean
}

export const money = (n: number) => '₺ ' + n.toLocaleString('tr-TR')
export const confLevel = (c: number) => (c >= 0.85 ? 'high' : c >= 0.7 ? 'mid' : 'low')

// Prisma enum (string) → UI
export function mapYol(y: string | null | undefined): YolUi {
  if (y === 'KLASIK') return 'klasik'
  if (y === 'IDARI') return 'idari'
  if (y === 'BELIRSIZ') return 'belirsiz'
  return null
}
export function mapDurum(d: string): Durum {
  switch (d) {
    case 'INCELENIYOR': return 'gozden'
    case 'IDARI_YOL': return 'idariBekl'
    case 'TAKIBE_HAZIR': return 'takibeHazir'
    case 'TAKIP_ACILDI':
    case 'TEBLIG_EDILDI':
    case 'ITIRAZ':
    case 'KESINLESTI':
    case 'TAHSIL':
    case 'KAPANDI': return 'gonderildi'
    default: return 'isleniyor'
  }
}
export function durumStep(d: string): number {
  switch (d) {
    case 'HAVUZDA': return 1
    case 'INCELENIYOR': return 3
    case 'IDARI_YOL':
    case 'TAKIBE_HAZIR': return 4
    case 'TAKIP_ACILDI':
    case 'TEBLIG_EDILDI':
    case 'ITIRAZ':
    case 'KESINLESTI':
    case 'TAHSIL':
    case 'KAPANDI': return 5
    default: return 2
  }
}
