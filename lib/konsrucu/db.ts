/**
 * KonsRücü — tenant-scope'lu DB loader katmanı (server-only). data.ts mock'unun yerini alır.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { type CaseT, mapDurum, mapYol, durumStep } from './map'

/** Giriş yapan kullanıcı + erişilebilir müşteriler + aktif müşteri (cookie). */
export async function ctx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({ where: { id: user.id }, include: { musteriler: true } })
  if (!dbUser) redirect('/login')
  const izinli = dbUser.musteriler.map((m) => m.musteriId)
  const aktifId = cookies().get('aktif_musteri')?.value
  const aktifMusteriId = aktifId && izinli.includes(aktifId) ? aktifId : (izinli[0] ?? null)
  return { dbUser, izinli, aktifMusteriId }
}

/**
 * Silme yetkisi kapısı: GORUNTULEYEN asla silemez; diğer roller kişi-bazlı silmeYetkisi bayrağına
 * tabidir (Sude ve Ervanur aynı rolde olduğu için bayrak şart). Her silme action'ının başında çağır.
 */
export function silebilir(k: { rol: string; silmeYetkisi?: boolean | null }): boolean {
  if (k.rol === 'GORUNTULEYEN') return false
  return k.silmeYetkisi !== false
}

/** silebilir() false ise action'ların döndürdüğü standart hata. */
export const SILME_YETKISI_YOK = 'Bu işlem için silme yetkiniz yok — yöneticinize (ADMIN) başvurun.'

/** Tenant'taki aktif kullanıcılar (sorumlu/atama seçimi için: Yelda, Sude, Ervanur…). */
export async function tenantKullanicilari(musteriId: string): Promise<{ id: string; ad: string; rol: string }[]> {
  const rows = await prisma.musteriKullanici.findMany({
    where: { musteriId, kullanici: { aktif: true } },
    select: { kullanici: { select: { id: true, ad: true, rol: true } } },
    orderBy: { kullanici: { ad: 'asc' } },
  })
  return rows.map((r) => ({ id: r.kullanici.id, ad: r.kullanici.ad, rol: r.kullanici.rol }))
}

function rel(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'şimdi'
  const m = Math.floor(s / 60); if (m < 60) return `${m} dk önce`
  const h = Math.floor(m / 60); if (h < 24) return `${h} saat önce`
  const g = Math.floor(h / 24); if (g < 30) return `${g} gün önce`
  return d.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })
}

/** cikarimJson içinde güven < 0.7 olan alan sayısı (zengin şekil; düz şekilde 0). */
function dusukSay(cj: unknown): number {
  const a = (cj as { alanlar?: Record<string, unknown> } | null)?.alanlar
  if (!a || typeof a !== 'object') return 0
  let n = 0
  for (const v of Object.values(a)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { confidence?: number }).confidence === 'number') {
      if ((v as { confidence: number }).confidence < 0.7) n++
    }
  }
  return n
}

/** Gelen Kutusu listesi — gerçek dosyalar (CASES mock'unun yerini alır). */
export async function listeDosyalar(): Promise<CaseT[]> {
  const { aktifMusteriId } = await ctx()
  if (!aktifMusteriId) return []
  const rows = await prisma.rucuDosyasi.findMany({
    where: { musteriId: aktifMusteriId },
    orderBy: { createdAt: 'desc' },
    include: { belgeler: { select: { kategori: true, kamera: true } } },
  })
  return rows.map((r) => {
    const foto = r.belgeler.filter((b) => b.kategori === 'HASAR_FOTO').length
    const pdf = r.belgeler.length - foto
    const kamera = new Set(r.belgeler.map((b) => b.kamera).filter(Boolean) as string[]).size
    const tutar = r.rucuTutari ? Number(r.rucuTutari) : r.asilAlacak ? Number(r.asilAlacak) : 0
    return {
      id: r.id,
      hasarNo: r.hasarDosyaNo ?? r.id.slice(0, 8),
      yol: mapYol(r.yol),
      karar: '',
      yolGuven: r.yolGuven ?? 0,
      yolNeden: r.yolNeden ?? undefined,
      fieldset: r.yol === 'KLASIK' ? 'klasik' : r.yol === 'IDARI' ? 'idari' : null,
      step: durumStep(r.durum),
      durum: mapDurum(r.durum),
      sigortali: r.sigortaliUnvan ?? '—',
      il: r.il ?? '—',
      muhatap: r.muhatapOzet ?? '—',
      kazaTarih: r.kazaTarihi ? r.kazaTarihi.toLocaleDateString('tr-TR') : '—',
      tutar,
      pdf,
      foto,
      dusuk: dusukSay(r.cikarimJson),
      kamera,
      islendi: rel(r.createdAt),
      detayli: false,
    } satisfies CaseT
  })
}
