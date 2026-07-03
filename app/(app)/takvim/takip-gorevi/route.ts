/**
 * KonsRücü — Takip görevi e-postası ÖNİZLEME · GET /takvim/takip-gorevi?id=<gorevId>
 * Verilen görevi (yoksa en son görevi) takip-görevi mailine render eder. Hiç görev yoksa en yakın
 * etkinlikten örnek bir görev kurgular (DB'ye yazmaz). Anlık/cron gönderim aynı üreticiyi kullanır.
 * Tenant-kapsamlı, auth zorunlu.
 */
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { takipGoreviMail, type TakipGoreviGirdi } from '@/lib/konsrucu/takip-gorevi-mail'
import { GOREV_INCLUDE, gorevMailGirdisi } from '@/lib/konsrucu/takip-gorevi'
import { durumAsama, ASAMA_META } from '@/lib/konsrucu/asama'
import { kalanGun } from '@/lib/konsrucu/format'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { aktifMusteriId } = await ctx()
  if (!aktifMusteriId) return new Response('Aktif müşteri seçili değil', { status: 400 })

  const id = new URL(req.url).searchParams.get('id') ?? ''
  const base = new URL(req.url).origin

  // gerçek görev: id verildiyse o, yoksa en son oluşturulan
  const gorev = id
    ? await prisma.takipGorevi.findFirst({ where: { id, dosya: { musteriId: aktifMusteriId } }, include: GOREV_INCLUDE })
    : await prisma.takipGorevi.findFirst({ where: { dosya: { musteriId: aktifMusteriId } }, orderBy: { createdAt: 'desc' }, include: GOREV_INCLUDE })

  if (gorev) {
    const { html } = takipGoreviMail(gorevMailGirdisi(gorev, { atayanAd: 'Yelda', baseUrl: base }))
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
  }

  // hiç görev yok → en yakın etkinlikten örnek kurgu (kalıcı değil)
  const etk = await prisma.etkinlik.findFirst({
    where: { dosya: { musteriId: aktifMusteriId } },
    orderBy: { baslar: 'desc' },
    include: { dosya: { include: { borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' } } } } },
  })
  if (!etk) return new Response('Önizlenecek görev/etkinlik yok — takvimden bir etkinlik ekleyin.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })

  const d = etk.dosya
  const za = d.zamanasimi
  const asil = d.asilAlacak != null ? Number(d.asilAlacak) : d.rucuTutari != null ? Number(d.rucuTutari) : null
  const faiz = d.faizTutari != null ? Number(d.faizTutari) : null
  const girdi: TakipGoreviGirdi = {
    gorev: {
      baslik: 'Arabulucuyla iletişime geç, yeni gün ata',
      aciklama: 'Toplantı yapılmadı. Arabulucuyla iletişime geçip yeni bir gün belirle ve etkinliği yeni tarihle güncelle.',
      sonTarih: null,
      atayanAd: 'Yelda',
      sorumluAd: 'Sude',
    },
    etkinlik: { tur: etk.tur, baslik: etk.baslik, baslar: etk.baslar.toISOString(), durum: etk.durum, sonucNot: etk.sonucNot },
    dosya: {
      hukukNo: d.hukukDosyaNo ?? d.hasarDosyaNo,
      borclu: d.borclular[0]?.adUnvan ?? null,
      borcluSayisi: d.borclular.length,
      icraNo: d.icraDosyaNo,
      yetkiliIcra: d.yetkiliIcra,
      toplam: asil != null ? asil + (faiz ?? 0) : null,
      faiz,
      asama: ASAMA_META[durumAsama(d.durum)]?.label ?? null,
      zamanasimi: za ? za.toISOString() : null,
      zamanasimiKalan: za ? kalanGun(za) : null,
    },
    dosyaUrl: new URL(`/akilli-giris/${d.id}`, req.url).toString(),
  }
  const { html } = takipGoreviMail(girdi)
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
