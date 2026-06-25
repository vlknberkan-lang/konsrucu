/**
 * KonsRücü — Masraf modülü ortak tipler/sözlükler (DB YOK; client-safe).
 * Masraflar sayfası, Excel çıktısı, makbuz çıkarımı ve cron e-postası BURADAN tip/etiket alır.
 * Kaynak şema: prisma/schema.prisma → model Masraf. Tasarım: RAY SİGORTA RÜCU MASRAF FORMU (Excel A→N).
 */
import type { Tone } from '@/components/konsrucu/ui'

export type MasrafDurumKod = 'YENI' | 'ONAYLI' | 'FATURALANDI' | 'TAHSIL' | 'ARSIV'
export type MasrafTarafKod = 'BIZ' | 'KARSI' | 'BELIRSIZ'

// Durum akışı: Yeni → Onaylı → Faturalandı → Tahsil (+ Arşiv). Faturalanan tekrar talep edilmez.
export const MASRAF_DURUM: Record<MasrafDurumKod, { label: string; tone: Tone }> = {
  YENI: { label: 'Yeni', tone: 'warning' },
  ONAYLI: { label: 'Onaylı', tone: 'info' },
  FATURALANDI: { label: 'Faturalandı', tone: 'success' },
  TAHSIL: { label: 'Tahsil', tone: 'brand' },
  ARSIV: { label: 'Arşiv', tone: 'steel' },
}
export const MASRAF_DURUM_SIRA: MasrafDurumKod[] = ['YENI', 'ONAYLI', 'FATURALANDI', 'TAHSIL', 'ARSIV']

// Kendi taraf filtresi (B1): yalnız BIZ faturalanır; BELIRSIZ kullanıcı kararına düşer; KARSI hariç.
export const MASRAF_TARAF: Record<MasrafTarafKod, { label: string; tone: Tone }> = {
  BIZ: { label: 'Bizim taraf', tone: 'success' },
  KARSI: { label: 'Karşı taraf', tone: 'steel' },
  BELIRSIZ: { label: 'Belirsiz', tone: 'warning' },
}

// Excel "Sayfa2" — H sütununun yalnız seçebileceği 63 sabit MASRAF CİNSİ/ADI (sıra korunur).
export const MASRAF_CINSLERI: string[] = [
  'APS Tebliğ', 'Adli Tıp Masrafı', 'Bakiye İlam Harcı', 'Bakiye İlam Harcı Faizi', 'Baro Pulu',
  'Başvuru Harcı', 'Birinci Bilirkişi Ücreti', 'Birinci Ek Bilirkişi Ücreti', 'Cezaevi Harcı',
  'Delil Avansı', 'Dosya Araştırma Ücreti', 'Dosya Masrafı', 'Feragat Harcı', 'Fotokopi Ücreti',
  'Gider Avansı', 'Haciz Gideri', 'Haciz,Teslim ve Satış Harcı', 'Karar Düzeltme Harcı', 'Keşif Harcı',
  'Keşif Masrafı', 'Konaklama Ücreti', 'Masraf Avansı (Satış Avansı)', 'Masraf Avansı (Taşıt Ücreti)',
  'Muhtelif Diğer', 'Müdahil Harcı', 'Müzekkere Tezkere Gideri', 'Noter Masrafları', 'Peşin Harç',
  'Posta Gideri', 'Suret Harcı', "TK m.35'e göre Tebliğ", 'Tahkim İtiraz Ücreti', 'Tahliye Harcı',
  'Tahsil Harcı', 'Tamamlama Harcı', 'Tebliğ Gideri', 'Tehiri İcra Harcı', 'Teminat', 'Temyiz Harcı',
  'Temyiz Karar Harcı (Nispi)', 'Temyiz Karar Harcı (Maktu)', 'Temyiz Posta Gideri',
  'Temyiz Yoluna Başvurma Harcı', 'Tercüme Gideri', 'Vekalet Harcı', 'Yakalama Avansı', 'Yenileme Harcı',
  'Yol Gideri Akaryakıt', 'Yol Gideri Bilet', 'Yolluk Masrafı', 'Yurtdışı Rücu Masrafı',
  'Yürütmeyi Durdurma Harcı', 'İcra Başvuru Harcı', 'İhtiyati Haciz Harcı', 'İkinci Bilirkişi Ücreti',
  'İkinci Ek Bilirkişi Ücreti', 'İlanen Tebliğ', 'İslah Harcı', 'İstinaf Avansı', 'İstinaf Harcı',
  'İstinaf Kanun Yoluna Başvurma Harcı', 'İstinaf Karar Harcı (Maktu)', 'İstinaf Karar Harcı (Nispi)',
]

/** Masraflar sayfası + Excel + cron'un kullandığı zenginleştirilmiş satır tipi (Prisma → UI). */
export type MasrafUi = {
  id: string
  dosyaId: string
  // dosya künyesi (Excel C–F)
  hukukKodu: string | null // C HUKUK KODU   ← dosya.hukukDosyaNo
  hasarDosya: string | null // D HASAR DOSYA  ← dosya.hasarDosyaNo
  mahkeme: string | null // E MAHKEME      ← asama.birim ?? dosya.icraDairesi
  esas: string | null // F ESAS         ← asama.kimlikNo ?? dosya.icraDosyaNo
  sigortali: string | null // gösterim (tabloda dosya adı)
  // makbuz kimliği
  dekontNo: string | null // B DEKONT NO
  makbuzSayi: string | null
  makbuzNo: string | null
  // tutar + tarih
  tutar: number // G BRÜT ÜCRET/MASRAF
  tarih: string | null // I MASRAF TARİHİ (ISO) — sıralama esası
  // cins
  cinsHam: string | null
  cins: string | null // H MASRAF CİNSİ/ADI (63 kalemden biri) — null = "Eşleştirilmedi"
  cinsGuven: number | null
  // taraf / sorumlu
  taraf: MasrafTarafKod
  sorumlu: string | null // K SORUMLU
  // belge
  belgeId: string | null
  belgeAdi: string | null // makbuz dosya adı (önizleme için)
  belgeli: boolean // J BELGELİ/BELGESİZ
  // durum + faturalama
  durum: MasrafDurumKod
  faturaDonem: string | null
  faturaTarihi: string | null
  // köken + güven
  kaynak: string
  guven: number | null
  createdAt: string
}

const norm = (s: string | null | undefined) =>
  (s ?? '').toString().trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ')

/**
 * İçerik-temelli mükerrerlik anahtarı (B3): aynı makbuz iki kez girilmesin.
 * dekontNo + ham cins + tutar + tarih(gün) → tek string. Hepsi boşsa null (manuel kayıt çoğalabilir).
 */
export function masrafDedupKey(p: {
  dekontNo?: string | null
  cinsHam?: string | null
  tutar?: number | null
  tarih?: string | Date | null
}): string | null {
  const dk = norm(p.dekontNo)
  const td = p.tarih ? new Date(p.tarih).toISOString().slice(0, 10) : ''
  // Güçlü anahtar şart: dekont no YA DA tarih yoksa dedup uygulama (farklı kalemleri
  // yanlışlıkla 'mükerrer' sayıp atlamasın). Aynı fiziksel makbuzun tekrarı belgeId ile yakalanır.
  if (!dk && !td) return null
  const ch = norm(p.cinsHam)
  const tt = p.tutar != null ? Number(p.tutar).toFixed(2) : ''
  return [dk, ch, tt, td].join('|')
}

/**
 * TR-duyarlı para parse: "1.234,56" → 1234.56 · "71.54" → 71.54 · "1.234" → 1234 · "1234,56" → 1234.56.
 * Hem virgül-ondalık hem nokta-ondalık hem nokta-binlik biçimini çözer (×100 "milyon" hatasını önler).
 */
export function paraGuvenli(s: string | number | null | undefined): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  let t = (s ?? '').toString().trim().replace(/[^\d.,-]/g, '')
  if (!t) return null
  const nokta = t.includes('.')
  const virgul = t.includes(',')
  if (nokta && virgul) {
    // son ayraç ondalıktır; diğeri binlik
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (virgul) {
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (nokta) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '') // 1.234 / 1.234.567 = binlik
    // aksi halde nokta ondalık kalır (ör. 71.54)
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** ISO hafta dönemi (faturalandığı dönem) — ör. "2026-W26". */
export function isoHaftaDonem(d: Date = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yilBasi = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const hafta = Math.ceil(((t.getTime() - yilBasi.getTime()) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(hafta).padStart(2, '0')}`
}
