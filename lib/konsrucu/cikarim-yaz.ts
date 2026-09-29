/**
 * KonsRücü — AI çıkarımının belge metni ve kolon yazımı · lib/konsrucu/cikarim-yaz.ts  (sunucu)
 *
 * Eski ekranın "AI ile Çıkarım Yap"ı (app/(app)/akilli-giris/actions.ts · aiCikar) ile yeni ekranın
 * "Belgelerden yeniden bul"u (lib/konsrucu/oneri/ai-oneri.ts) aynı yardımcıları kullanır: belge metnini önem
 * sırasıyla kurmak, birleştiricinin alanlarını DB'den okumak ve yalnız beyaz listedeki kolonlara yazmak.
 */
import { Prisma, Yol, Brans, BorcluRol } from '@prisma/client'
import { sayiTR } from '@/lib/konsrucu/sayi'
import { ALANLAR, type AlanAdi, type YazilacakAnahtar } from '@/lib/konsrucu/cikarim-birlestir'

export const yolDb = (y?: string): Yol | null => (y === 'klasik' ? Yol.KLASIK : y === 'idari' ? Yol.IDARI : y === 'belirsiz' ? Yol.BELIRSIZ : null)
export const bransDb = (b?: string): Brans | null => (b === 'KASKO' ? Brans.KASKO : b === 'ZMMS' ? Brans.ZMMS : b === 'OTO_DISI' ? Brans.OTO_DISI : null)
export const rolDb = (r?: string): BorcluRol => (r && r in BorcluRol ? (r as BorcluRol) : BorcluRol.DIGER)

/** LLM'den gelen tutarı güvenle Decimal'e çevir (sayı/string/biçimli gelebilir; bozuksa null).
 *  Parse tek kaynak: lib/konsrucu/sayi.sayiTR (iki formatı da çözer). */
export function guvenliDecimal(v: unknown): Prisma.Decimal | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : sayiTR(v)
  return Number.isFinite(n) && Math.abs(n) < 1e12 ? new Prisma.Decimal(Math.round(n * 100) / 100) : null
}

// ───────────────── belge metni ─────────────────

/** Belgeleri ÖNEM sırasına diz: DELİL ÖNCE (tutanaklar/bilirkişi/ekspertiz/sorgular) → AI olay bağlamını
 *  bunlardan kursun; Lehe formu yalnız ipucu olarak sonra gelir. */
const ONCELIK = ['TUTANAK', 'EKSPERTIZ', 'SBM', 'ALKOL', 'EHLIYET', 'RUHSAT', 'LEHE', 'POLICE', 'DEKONT', 'DIGER', 'HASAR_FOTO']
const onc = (k: string) => { const i = ONCELIK.indexOf(k); return i < 0 ? 99 : i }

/** AI'a gidecek birleşik belge metni (en çok 150.000 karakter). Mükerrer metin elenir; metinsiz belge atlanır. */
export function cikarimMetni(belgeler: readonly { extractedText: string | null; kategori: string; dosyaAdi: string }[]): string {
  const gorulen = new Set<string>()
  const parcalar: string[] = []
  for (const b of [...belgeler].sort((a, c) => onc(a.kategori) - onc(c.kategori))) {
    const t = (b.extractedText ?? '').trim()
    if (!t) continue
    const imza = t.replace(/\s+/g, ' ').slice(0, 160)
    if (gorulen.has(imza)) continue // aynı poliçe/ekspertiz kopyalarını tek say
    gorulen.add(imza)
    parcalar.push(`### ${b.kategori} · ${b.dosyaAdi}\n${t}`)
  }
  return parcalar.join('\n\n').slice(0, 150000).trim()
}

// ───────────────── S07 · yeniden çıkarım koruması: alan okuma/yazma ─────────────────

/** Birleştiricinin karşılaştırdığı kolonlar (aciklama cikarimJson'dadır). */
export const ALAN_SELECT = {
  yol: true, brans: true, sigortaliUnvan: true, sigortaliTelefon: true, sigortaliPlaka: true, karsiPlaka: true,
  il: true, kazaYeri: true, olusSekli: true, kusurDurumu: true, asilAlacak: true, rucuTutari: true, rucuOrani: true,
  yetkiliIcra: true, muhatapOzet: true,
} as const

export type AlanKaydi = Prisma.RucuDosyasiGetPayload<{ select: typeof ALAN_SELECT }>

/** DB kaydı → birleştiricinin saf alan değerleri (Decimal → sayı). */
export function mevcutAlanlar(d: AlanKaydi): Partial<Record<Exclude<AlanAdi, 'aciklama'>, unknown>> {
  const o: Partial<Record<Exclude<AlanAdi, 'aciklama'>, unknown>> = {}
  for (const k of Object.keys(ALAN_SELECT) as (keyof typeof ALAN_SELECT)[]) o[k] = d[k]
  o.asilAlacak = d.asilAlacak != null ? Number(d.asilAlacak) : null
  o.rucuTutari = d.rucuTutari != null ? Number(d.rucuTutari) : null
  return o
}

/** Kolon karşılığı olan yazılabilir anahtarlar (beyaz liste — öneri JSON'undan gelen anahtar kolona körlemesine gitmez). */
const YAZILABILIR = new Set<string>([...ALANLAR.filter((a) => a !== 'aciklama'), 'yolGuven', 'yolNeden'])

/** Birleştiricinin saf değerleri → Prisma update verisi (para → Decimal, enum doğrulanır, bilinmeyen anahtar atlanır). */
export function alanVerisi(yaz: Partial<Record<YazilacakAnahtar, string | number | null>>): Prisma.RucuDosyasiUpdateInput {
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(yaz)) {
    if (v == null || !YAZILABILIR.has(k)) continue
    if (k === 'asilAlacak' || k === 'rucuTutari') { const d = guvenliDecimal(v); if (d) data[k] = d }
    else if (k === 'yol') { if (typeof v === 'string' && v in Yol) data.yol = v as Yol }
    else if (k === 'brans') { if (typeof v === 'string' && v in Brans) data.brans = v as Brans }
    else if (k === 'yolGuven') { if (typeof v === 'number' && Number.isFinite(v)) data.yolGuven = v }
    else data[k] = String(v)
  }
  return data as Prisma.RucuDosyasiUpdateInput
}
