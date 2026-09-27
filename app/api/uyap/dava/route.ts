/**
 * KonsRücü — UYAP dava keşfi · POST /api/uyap/dava (S28, eklenti 2.0)
 *
 * Eklenti avukatın açık hukuk (dava) dosyalarını tarar ve her biri için dosyaAyrintiBilgileri_brd.ajx'in HAM
 * alanlarını gönderir (davaTurleriStr, ilgiliDosyaListesiStr, birlesenDosyaListStr, durum, tarihler, taraflar).
 * Yorumu sunucu yapar (lib/konsrucu/senkron/ilgili-dosya.ts):
 *   • UYAP dosya kimliği programda bir Dava'ya zaten bağlıysa → yalnız UYAP alanları tazelenir (durum metni,
 *     ön inceleme / duruşma / keşif tarihleri, ilgili dosyalar). Açılış tarihi boşsa doldurulur.
 *   • Bağlı değilse ilgili dosyalardaki icra (daire + esas) programdaki icra dosyasıyla eşleştirilir ve dosyaya
 *     "davaAdayi" önerisi (AlanDegeri, kaynak UYAP) yazılır. Bağı AVUKAT onay kartında kurar; dava no ve
 *     arabuluculuk no elle girilmez. "Bizim değil" denmiş aday tekrar önerilmez.
 *   • Eşleşmeyen dava "sahipsiz" olarak yanıtta döner (eklenti panelinde gösterilir; programa yazılmaz).
 * Salt-okuma kaynaklıdır: UYAP'a hiçbir şey yazılmaz. Tenant-kapsamlı (Bearer eklenti anahtarı).
 */
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'
import { esasCoz, mahkemeCoz } from '@/lib/konsrucu/dava/kayit'
import { trNorm } from '@/lib/konsrucu/senkron/ilgili-dosya'
import { DAVA_ADAYI_ALAN as ADAY_ALAN, davaBagOnerisi, ilgiliDosyaCoz, rolumuzCoz, uyapTarih } from '@/lib/konsrucu/senkron/ilgili-dosya'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return preflight(req)
}

const metin = (n: number) => z.union([z.string(), z.number()]).transform((v) => String(v).slice(0, n)).nullish()
const tarihHam = z.union([z.string().max(40), z.number()]).nullish()
const davaGirdi = z.object({
  uyapDosyaId: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1).max(80)),
  dosyaNo: metin(40),
  birimAdi: metin(200),
  acilis: tarihHam,
  durumMetni: metin(200),
  ayrinti: z.object({
    davaTurleriStr: metin(500),
    ilgiliDosyaListesiStr: metin(2000),
    birlesenDosyaListStr: metin(2000),
    dosyaDurumu: metin(200),
    durusmaTarihi: tarihHam,
    onIncelemeTarihi: tarihHam,
    kesifTarihi: tarihHam,
  }).partial().nullish(),
  taraflar: z.array(z.object({ ad: metin(200), rol: metin(80) })).max(40).nullish(),
})
const govde = z.object({ davalar: z.array(davaGirdi).max(300) })


export async function POST(req: Request) {
  const k = await uyapKimlik(req)
  if (!k) return corsJson({ ok: false, error: 'unauthorized' }, 401, req)
  let ham: unknown
  try { ham = await req.json() } catch { return corsJson({ ok: false, error: 'gövde JSON değil' }, 400, req) }
  const p = govde.safeParse(ham)
  if (!p.success) return corsJson({ ok: false, error: 'gövde geçersiz', ayrinti: p.error.issues.slice(0, 3).map((i) => i.path.join('.')) }, 400, req)

  const unvanlar = new Map((await prisma.ayarlar.findMany({ where: { musteriId: { in: k.izinli } }, select: { musteriId: true, alacakliUnvan: true } })).map((a) => [a.musteriId, a.alacakliUnvan]))
  let guncellenen = 0, yeniAday = 0, mevcutAday = 0
  const sahipsiz: { dosyaNo: string | null; birimAdi: string | null; rolumuz: string | null }[] = []
  // bağlı (avukatın onayladığı) davalar → eklenti bunların evrakını programdaki dosyaya indirir
  const bagliDavalar: { uyapDosyaId: string; dosyaId: string }[] = []

  for (const d of p.data.davalar) {
    const a = d.ayrinti ?? {}
    const tarihler = {
      onIncelemeTarihi: uyapTarih(a.onIncelemeTarihi),
      sonrakiDurusma: uyapTarih(a.durusmaTarihi),
      kesifTarihi: uyapTarih(a.kesifTarihi),
    }
    const acilis = uyapTarih(d.acilis)

    // 1) Zaten bağlı dava → UYAP alanlarını tazele
    const bagli = await prisma.dava.findFirst({
      where: { uyapDosyaId: d.uyapDosyaId, silindiAt: null, dosya: { musteriId: { in: k.izinli } } },
      select: { id: true, dosyaId: true, acilisTarihi: true },
    })
    if (bagli) {
      await prisma.dava.update({
        where: { id: bagli.id },
        data: {
          ...(a.dosyaDurumu || d.durumMetni ? { uyapDurumMetni: a.dosyaDurumu || d.durumMetni } : {}),
          ...(a.davaTurleriStr ? { uyapDavaTuruMetni: a.davaTurleriStr } : {}),
          ...(a.ilgiliDosyaListesiStr ? { ilgiliDosyaHam: a.ilgiliDosyaListesiStr } : {}),
          ...(a.birlesenDosyaListStr ? { birlesenHam: a.birlesenDosyaListStr } : {}),
          ...(tarihler.onIncelemeTarihi ? { onIncelemeTarihi: tarihler.onIncelemeTarihi } : {}),
          ...(tarihler.sonrakiDurusma ? { sonrakiDurusma: tarihler.sonrakiDurusma } : {}),
          ...(tarihler.kesifTarihi ? { kesifTarihi: tarihler.kesifTarihi } : {}),
          ...(!bagli.acilisTarihi && acilis ? { acilisTarihi: acilis } : {}),
        },
      })
      guncellenen++
      bagliDavalar.push({ uyapDosyaId: d.uyapDosyaId, dosyaId: bagli.dosyaId })
      continue
    }

    // 2) İlgili dosyalardan icra eşleşmesi
    const ilgili = ilgiliDosyaCoz(a.ilgiliDosyaListesiStr)
    const esaslar = [...new Set(ilgili.filter((x) => x.tur === 'ICRA' && x.esas).map((x) => `${x.esas!.yil}/${x.esas!.sira}`))]
    const adaylar = esaslar.length
      ? await prisma.rucuDosyasi.findMany({
          where: { musteriId: { in: k.izinli }, OR: esaslar.map((e) => ({ icraDosyaNo: { contains: e } })) },
          select: { id: true, musteriId: true, icraDosyaNo: true, icraDairesi: true, yetkiliIcra: true },
          take: 50,
        })
      : []
    const bag = davaBagOnerisi(ilgili, adaylar)
    const musteriId = adaylar.find((x) => x.id === bag.dosyaIdler[0])?.musteriId ?? k.izinli[0]
    const taraflar = (d.taraflar ?? []).map((t) => ({ ad: t.ad ?? null, rol: t.rol ?? null }))
    const rolumuz = rolumuzCoz(taraflar, unvanlar.get(musteriId))
    if (bag.durum === 'YOK') { sahipsiz.push({ dosyaNo: d.dosyaNo ?? null, birimAdi: d.birimAdi ?? null, rolumuz }); continue }

    // 3) Aynı dosyada aynı esasla elle/Excel'den girilmiş dava varsa: öneri değil, UYAP kimliği o davaya bağlanır
    const esas = esasCoz(d.dosyaNo)
    if (bag.durum === 'TEK' && esas) {
      // esas no tek başına kimlik değil: elle girilmiş mahkeme (tür / yer / no) UYAP birim adıyla çelişmemeli
      const m = mahkemeCoz(d.birimAdi)
      const adaylarElle = await prisma.dava.findMany({ where: { dosyaId: bag.dosyaIdler[0], esasYil: esas.yil, esasSira: esas.sira, uyapDosyaId: null, silindiAt: null }, select: { id: true, mahkemeTuru: true, mahkemeYer: true, mahkemeNo: true } })
      const uyumlu = adaylarElle.filter((x) => !!m && !m.ayristirilamadi && (!x.mahkemeTuru || x.mahkemeTuru === m.tur) && (!x.mahkemeYer || trNorm(x.mahkemeYer) === trNorm(m.yer)) && (!x.mahkemeNo || x.mahkemeNo === m.no))
      const elle = uyumlu.length === 1 ? uyumlu[0] : null
      if (elle) {
        await prisma.dava.update({
          where: { id: elle.id },
          data: {
            uyapDosyaId: d.uyapDosyaId,
            ...(a.dosyaDurumu ? { uyapDurumMetni: a.dosyaDurumu } : {}),
            ...(a.davaTurleriStr ? { uyapDavaTuruMetni: a.davaTurleriStr } : {}),
            ...(a.ilgiliDosyaListesiStr ? { ilgiliDosyaHam: a.ilgiliDosyaListesiStr } : {}),
            ...(tarihler.onIncelemeTarihi ? { onIncelemeTarihi: tarihler.onIncelemeTarihi } : {}),
            ...(tarihler.sonrakiDurusma ? { sonrakiDurusma: tarihler.sonrakiDurusma } : {}),
          },
        })
        guncellenen++
        bagliDavalar.push({ uyapDosyaId: d.uyapDosyaId, dosyaId: bag.dosyaIdler[0] })
        continue
      }
    }

    // 4) Aday öneri (dosya başına, UYAP dosya kimliğiyle tekil; reddedilen tekrar açılmaz)
    const deger = {
      uyapDosyaId: d.uyapDosyaId,
      dosyaNo: d.dosyaNo ?? null,
      birimAdi: d.birimAdi ?? null,
      acilis: acilis?.toISOString() ?? null,
      durumMetni: a.dosyaDurumu || d.durumMetni || null,
      davaTurleriStr: a.davaTurleriStr ?? null,
      ilgiliDosyaHam: a.ilgiliDosyaListesiStr ?? null,
      birlesenHam: a.birlesenDosyaListStr ?? null,
      onIncelemeTarihi: tarihler.onIncelemeTarihi?.toISOString() ?? null,
      sonrakiDurusma: tarihler.sonrakiDurusma?.toISOString() ?? null,
      kesifTarihi: tarihler.kesifTarihi?.toISOString() ?? null,
      rolumuz,
      taraflar: taraflar.slice(0, 12),
      eslesme: { durum: bag.durum, zayif: bag.zayif, adet: bag.dosyaIdler.length, icra: bag.icra?.ham ?? null, arabuluculukNo: bag.arabuluculuk?.esas ? `${bag.arabuluculuk.esas.yil}/${bag.arabuluculuk.esas.sira}` : null, arabuluculukBirim: bag.arabuluculuk?.birim ?? null },
    }
    for (const dosyaId of bag.dosyaIdler) {
      const onceki = await prisma.alanDegeri.findFirst({
        where: { dosyaId, alan: ADAY_ALAN, silindiAt: null, degerJson: { path: ['uyapDosyaId'], equals: d.uyapDosyaId } },
        select: { id: true, durum: true },
      })
      if (onceki?.durum === 'REDDEDILDI' || onceki?.durum === 'ONAYLI') continue
      if (onceki) { await prisma.alanDegeri.update({ where: { id: onceki.id }, data: { degerJson: deger as Prisma.InputJsonValue } }); mevcutAday++; continue }
      await prisma.alanDegeri.create({ data: { dosyaId, alan: ADAY_ALAN, degerJson: deger as Prisma.InputJsonValue, kaynakTuru: 'UYAP', uretici: 'eklenti-2.0/dava-kesif', durum: 'ONERI' } })
      yeniAday++
    }
  }

  return corsJson({ ok: true, alinan: p.data.davalar.length, guncellenen, yeniAday, mevcutAday, sahipsiz: sahipsiz.slice(0, 100), bagliDavalar }, 200, req)
}
