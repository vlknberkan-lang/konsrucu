/**
 * KonsRücü — ihtiyati haciz · lib/konsrucu/dava/ihtiyati-haciz.ts (saf)
 *
 * Ray Excel #27 hücresi serbest metindir ("RET", "KABUL", "kabul 12.03.2026 %15 teminat" …). Tanınan kalıplar
 * ayrıştırılır; tanınmayan değer UYDURULMAZ: yalnız `excelHam`'lı kayıt açılır ve "ayrıştırılamadı, elle tamamlayın"
 * etiketi taşır (06 §3.5). Teminat TUTARINI mahkeme belirler; program hesaplamaz, yalnız metinde yazan oranı saklar.
 * Karardan sonra İİK 261 ve 264 süreleri S29'da (lib/sure/ihtiyati-haciz) önerilir (teyit gerekli).
 */
import { trNormal } from '../arabuluculuk/son-tutanak'
import { gunNo, trTarihCoz } from '../arabuluculuk/tarih'
import type { IhSonucu } from './sabitler'

export type IhtiyatiHacizExcel = {
  kayitGerekli: boolean // false: hücre boş ya da "talep edilmedi"
  sonuc: IhSonucu | null
  kararTarihi: string | null // yyyy-aa-gg
  teminatOrani: string | null
  excelHam: string | null
  ayristirilamadi: boolean
}

const YOK = /^(|-|—|yok|talep edilmedi|talep yok|istenmedi|hayir)$/

/** Excel #27 hücresini ayrıştır. */
export function ihtiyatiHacizExcelCoz(ham: unknown): IhtiyatiHacizExcel {
  const s = ham == null ? '' : String(ham).replace(/\s+/g, ' ').trim()
  const n = trNormal(s).trim()
  if (YOK.test(n)) return { kayitGerekli: false, sonuc: null, kararTarihi: null, teminatOrani: null, excelHam: s || null, ayristirilamadi: false }
  let sonuc: IhSonucu | null = null
  if (/kismen/.test(n)) sonuc = 'KISMEN'
  else if (/\bret\b|\bred\b|reddedil/.test(n)) sonuc = 'RED'
  else if (/kabul|verildi|karar verildi/.test(n)) sonuc = 'KABUL'
  else if (/bekl|talep edildi|talep edilmistir|istendi/.test(n)) sonuc = 'BEKLIYOR'
  const tm = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/)
  const kararTarihi = tm ? (() => {
    const d = trTarihCoz(`${tm[1]}.${tm[2]}.${tm[3]}`)
    return d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` : null
  })() : null
  const om = s.match(/%\s*(\d{1,3}(?:[.,]\d+)?)/)
  const teminatOrani = om ? `%${om[1]}` : null
  return { kayitGerekli: true, sonuc, kararTarihi, teminatOrani, excelHam: s, ayristirilamadi: sonuc == null }
}

/** Elle giriş doğrulaması: tarih sırası (talep ≤ karar ≤ tebliğ; ileri tarih yok). */
export function ihtiyatiHacizDogrula(p: {
  talepTarihi?: Date | null
  kararTarihi?: Date | null
  kararTebligTarihi?: Date | null
  teminatYatirildiAt?: Date | null
  infazTalepTarihi?: Date | null
  sonuc: string
}, simdi: Date = new Date()): string[] {
  const h: string[] = []
  const ileri = (d?: Date | null) => !!d && gunNo(d) > gunNo(simdi)
  for (const [ad, d] of [['Talep', p.talepTarihi], ['Karar', p.kararTarihi], ['Karar tebliğ', p.kararTebligTarihi], ['Teminat yatırma', p.teminatYatirildiAt], ['İnfaz talebi', p.infazTalepTarihi]] as const) {
    if (ileri(d)) h.push(`${ad} tarihi ileri bir gün olamaz.`)
  }
  if (p.talepTarihi && p.kararTarihi && gunNo(p.kararTarihi) < gunNo(p.talepTarihi)) h.push('Karar tarihi talep tarihinden önce olamaz.')
  if (p.kararTarihi && p.kararTebligTarihi && gunNo(p.kararTebligTarihi) < gunNo(p.kararTarihi)) h.push('Karar tebliğ tarihi karar tarihinden önce olamaz.')
  if (p.sonuc === 'BEKLIYOR' && p.kararTarihi) h.push('Karar tarihi girildiyse sonucu da seçin.')
  return h
}

/** Karar sonrası bilgi notu (süre hesabı S29'da; burada kural yok). */
export function ihtiyatiHacizSureNotu(p: { sonuc: string; kararTarihi: Date | null; kararTebligTarihi: Date | null; infazTalepTarihi: Date | null }): string | null {
  if (p.sonuc !== 'KABUL' && p.sonuc !== 'KISMEN') return null
  if (p.infazTalepTarihi) return 'İnfaz talep edildi: İİK 261 süresinin kapanış kanıtı kayıtlı (teyit gerekli).'
  if (!p.kararTarihi) return 'Karar tarihini girin: İİK 261 ve 264 süreleri karar/tebliğ tarihinden önerilir (teyit gerekli).'
  return 'Karardan sonra İİK 261 (infaz talebi) ve İİK 264 (dava/takip) süreleri süre defterinde önerilir (teyit gerekli).'
}
