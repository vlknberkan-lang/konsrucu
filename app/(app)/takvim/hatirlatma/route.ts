/**
 * KonsRücü — Etkinlik hatırlatma e-postası ÖNİZLEME · GET /takvim/hatirlatma?id=<etkinlikId>
 * Verilen etkinliği (yoksa en yakın gelecekteki) + dosya künyesini hatırlatma e-postası olarak render eder
 * (lib/konsrucu/hatirlatma-mail). Zamanlı gönderim aynı üreticiyi kullanacak. Tenant-kapsamlı, auth zorunlu.
 */
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { etkinlikHatirlatmaHtml, type HatirlatmaGirdi } from '@/lib/konsrucu/hatirlatma-mail'
import { durumAsama, ASAMA_META } from '@/lib/konsrucu/asama'
import { kalanGun } from '@/lib/konsrucu/format'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { aktifMusteriId } = await ctx()
  if (!aktifMusteriId) return new Response('Aktif müşteri seçili değil', { status: 400 })

  const id = new URL(req.url).searchParams.get('id') ?? ''
  const dosyaInc = { dosya: { include: { borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' as const } } } } }

  const sec = id
    ? await prisma.etkinlik.findFirst({ where: { id, dosya: { musteriId: aktifMusteriId } }, include: dosyaInc })
    : null
  // id yoksa/bulunamazsa: önizleme için en yakın gelecekteki etkinlik
  const kayit = sec ?? (await prisma.etkinlik.findFirst({
    where: { dosya: { musteriId: aktifMusteriId }, baslar: { gte: new Date() } },
    orderBy: { baslar: 'asc' },
    include: dosyaInc,
  }))

  if (!kayit) return new Response('Önizlenecek etkinlik yok — takvimden bir etkinlik ekleyin.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })

  const d = kayit.dosya
  const za = d.zamanasimi
  const girdi: HatirlatmaGirdi = {
    aliciAd: 'Yelda',
    etkinlik: {
      tur: kayit.tur,
      baslik: kayit.baslik,
      baslar: kayit.baslar.toISOString(),
      biter: kayit.biter ? kayit.biter.toISOString() : null,
      yer: kayit.yer,
      online: kayit.online,
      hatirlatmaDk: kayit.hatirlatmaDk,
    },
    dosya: {
      hukukNo: d.hukukDosyaNo ?? d.hasarDosyaNo,
      borclu: d.borclular[0]?.adUnvan ?? null,
      borcluSayisi: d.borclular.length,
      asilAlacak: d.asilAlacak != null ? Number(d.asilAlacak) : d.rucuTutari != null ? Number(d.rucuTutari) : null,
      asama: ASAMA_META[durumAsama(d.durum)]?.label ?? null,
      yetkiliIcra: d.yetkiliIcra ?? null,
      icraNo: d.icraDosyaNo ?? null,
      zamanasimi: za ? za.toISOString() : null,
      zamanasimiKalan: za ? kalanGun(za) : null,
    },
    dosyaUrl: new URL(`/akilli-giris/${d.id}`, req.url).toString(),
  }

  const { html } = etkinlikHatirlatmaHtml(girdi)
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
