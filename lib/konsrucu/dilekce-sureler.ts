/** Kayıtlı iş tarihlerini birleştirir; hukuki süre hesaplamaz ve veritabanına erişmez. */
import { kalanGun } from './format'

type Tarih = Date | string | null

export type DilekceSureGirdisi = {
  etkinlikler?: ReadonlyArray<{
    id: string
    tur: string
    baslik: string
    baslar: Tarih
    biter?: Tarih
    durum: string
  }>
  gorevler?: ReadonlyArray<{
    id: string
    baslik: string
    sonTarih: Tarih
    durum: string
    aciklama?: string | null
  }>
  onemliOlaylar?: ReadonlyArray<{
    id: string
    baslik?: string | null
    sonTarih: Tarih
    durum: string
    kaynakOlayId?: string | null
    kaynakBelgeId?: string | null
  }>
  uyapSenkronAt?: Tarih
  uyapEslesme?: string | null
}

export type DilekceSureDurumu = 'GECIKMIS' | 'BUGUN' | 'YAKLASAN' | 'PLANLI' | 'TARIH_EKSIK'

export type DilekceSureKaydi = {
  id: string
  kaynak: 'ETKINLIK' | 'GOREV' | 'ONEMLI_OLAY'
  baslik: string
  tarih: string | null
  tarihEtiketi: 'Kayıtlı tarih' | 'Hatırlatma tarihi'
  kalanGun: number | null
  durum: DilekceSureDurumu
  /** Bağlı kaynak varlığıdır; kaynağın hukuken teyit edildiği anlamına gelmez. */
  kaynakEksik: boolean
  aciklama: string | null
}

export type DilekceUyapDurumu = {
  durum: 'HIC_YOK' | 'GUNCEL' | 'ESKI' | 'ESLESME_SORUNU'
  sonSenkron: string | null
  aciklama: string
}

// Bunlar iş kuyruğu/güncellik eşikleridir; kanuni süre değildir.
const YAKLASAN_GUN = 7
const SENKRON_ESKILIK_MS = 24 * 60 * 60 * 1000
// Server-only teblig-gorev modülünü client-safe yardımcıya taşımamak için sabit önek.
const HACIZ_HATIRLATMA_ONEKI = 'Haciz isteme süresi'
const ONCELIK: Record<DilekceSureDurumu, number> = {
  GECIKMIS: 0, BUGUN: 1, TARIH_EKSIK: 2, YAKLASAN: 3, PLANLI: 4,
}

function gecerliTarih(value: Tarih | undefined): Date | null {
  if (value == null || value === '') return null
  const tarih = new Date(value)
  return Number.isNaN(tarih.getTime()) ? null : tarih
}

function kayitHazirla(
  temel: Omit<DilekceSureKaydi, 'tarih' | 'kalanGun' | 'durum'>,
  value: Tarih,
  simdi: Date,
): DilekceSureKaydi {
  const tarih = gecerliTarih(value)
  const gun = tarih ? kalanGun(tarih, simdi) : null
  const durum: DilekceSureDurumu = gun == null ? 'TARIH_EKSIK'
    : gun < 0 ? 'GECIKMIS' : gun === 0 ? 'BUGUN' : gun <= YAKLASAN_GUN ? 'YAKLASAN' : 'PLANLI'
  return { ...temel, tarih: tarih?.toISOString() ?? null, kalanGun: gun, durum }
}

function uyapDurumu(girdi: DilekceSureGirdisi, simdi: Date): DilekceUyapDurumu {
  const tarih = gecerliTarih(girdi.uyapSenkronAt)
  const sonSenkron = tarih?.toISOString() ?? null
  if (girdi.uyapEslesme && girdi.uyapEslesme !== 'OK') {
    return { durum: 'ESLESME_SORUNU', sonSenkron, aciklama: 'UYAP dosya eşleşmesi kontrol edilmeli; son veriler eksik olabilir.' }
  }
  if (!tarih) {
    return { durum: 'HIC_YOK', sonSenkron, aciklama: 'UYAP aktarım tarihi yok. Yeni evrak ve tebliğleri UYAP üzerinden kontrol edin.' }
  }
  if (simdi.getTime() - tarih.getTime() > SENKRON_ESKILIK_MS) {
    return { durum: 'ESKI', sonSenkron, aciklama: 'Son UYAP aktarımının üzerinden 24 saat geçti. Yeni evrak ve tebliğleri kontrol edin.' }
  }
  return { durum: 'GUNCEL', sonSenkron, aciklama: 'Son UYAP aktarımı 24 saat içinde. Aktarım zamanı, tüm evrak ve sürelerin teyidi anlamına gelmez.' }
}

/**
 * Auth ve tenant kapsamı çağıranın sorgusunda uygulanmalıdır.
 * Etkinlik.baslar takvimdeki kayıtlı iş tarihidir; biter'den yeni son gün çıkarılmaz.
 * Son tarihi olmayan açık işleri saklamaz. Kayıtların sırası girdi dizilerini değiştirmez.
 */
export function dilekceSureleriniHazirla(girdi: DilekceSureGirdisi, simdi: Date = new Date()): {
  kayitlar: DilekceSureKaydi[]
  uyap: DilekceUyapDurumu
} {
  const kayitlar: DilekceSureKaydi[] = []
  for (const e of girdi.etkinlikler ?? []) {
    if (e.durum !== 'PLANLANDI') continue
    kayitlar.push(kayitHazirla({
      id: e.id, kaynak: 'ETKINLIK', baslik: e.baslik,
      tarihEtiketi: e.tur === 'HATIRLATMA' ? 'Hatırlatma tarihi' : 'Kayıtlı tarih',
      kaynakEksik: true, aciklama: null,
    }, e.baslar, simdi))
  }
  for (const g of girdi.gorevler ?? []) {
    if (g.durum !== 'ACIK' && g.durum !== 'ISLEMDE') continue
    kayitlar.push(kayitHazirla({
      id: g.id, kaynak: 'GOREV', baslik: g.baslik,
      tarihEtiketi: g.baslik.startsWith(HACIZ_HATIRLATMA_ONEKI) ? 'Hatırlatma tarihi' : 'Kayıtlı tarih',
      kaynakEksik: true, aciklama: g.aciklama ?? null,
    }, g.sonTarih, simdi))
  }
  for (const o of girdi.onemliOlaylar ?? []) {
    if (o.durum !== 'ACIK' && o.durum !== 'ISLEMDE') continue
    kayitlar.push(kayitHazirla({
      id: o.id, kaynak: 'ONEMLI_OLAY', baslik: o.baslik?.trim() || 'Önemli olay',
      tarihEtiketi: 'Kayıtlı tarih', kaynakEksik: !(o.kaynakBelgeId || o.kaynakOlayId), aciklama: null,
    }, o.sonTarih, simdi))
  }
  kayitlar.sort((a, b) => ONCELIK[a.durum] - ONCELIK[b.durum]
    || (a.tarih ?? '').localeCompare(b.tarih ?? '')
    || a.baslik.localeCompare(b.baslik, 'tr')
    || a.id.localeCompare(b.id))
  return { kayitlar, uyap: uyapDurumu(girdi, simdi) }
}
