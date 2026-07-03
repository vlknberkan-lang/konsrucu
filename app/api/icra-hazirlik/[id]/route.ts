/**
 * KonsRücü — İcra Takibine Hazırlık paketi · GET /api/icra-hazirlik/[id]
 * Dosyanın dayanak belgelerini (Poliçe, KTT/ifade, sigortalı beyanı, ekspertiz, dekont) + AI'ın seçtiği
 * 2 hasar fotoğrafını + "hap bilgiler" özet metnini TEK .zip olarak indirir. Tenant-kapsamlı, auth zorunlu.
 */
import JSZip from 'jszip'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { dayanakSec, ROL_LABEL, type DayanakGirdi } from '@/lib/konsrucu/dayanak-sec'
import { footerOlustur, aciklamaTam } from '@/lib/konsrucu/takip'
import { faizHesapla, oranlariOku, sonDekontTarihi, type DekontGirdi } from '@/lib/konsrucu/faiz'
import { tarihTR } from '@/lib/konsrucu/format'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const para = (n: number | null | undefined) =>
  n != null && Number.isFinite(Number(n)) ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n)) + ' ₺' : '—'
const gun = (d: Date | null | undefined) => tarihTR(d)
const dosyaAdiTemizle = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
const uzanti = (yol: string | null, ad: string) => {
  const m = (yol || ad).match(/\.([a-z0-9]{2,5})(?:$|\?)/i)
  return m ? `.${m[1].toLowerCase()}` : ''
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { id: params.id, musteriId: { in: izinli } },
    include: {
      musteri: true,
      borclular: true,
      odemeler: true,
      belgeler: { select: { id: true, dosyaAdi: true, kategori: true, extractedText: true, storagePath: true, belgeTarihi: true, confidence: true } },
    },
  })
  if (!dosya) return new Response('Dosya bulunamadı veya yetkiniz yok', { status: 404 })
  const ayarlar = await prisma.ayarlar.findUnique({ where: { musteriId: dosya.musteriId } })

  const { secilenler, notlar } = dayanakSec(dosya.belgeler as DayanakGirdi[])
  // Hasar fotoğrafları: AI seçtiyse onlar; yoksa ilk 2 hasar fotoğrafı.
  const cj = (dosya.cikarimJson ?? {}) as { aciklama?: string | null; dayanakFotoIds?: unknown }
  const fotoIds = Array.isArray(cj.dayanakFotoIds) ? cj.dayanakFotoIds.filter((x): x is string => typeof x === 'string') : []
  const hasarHepsi = dosya.belgeler.filter((b) => b.kategori === 'HASAR_FOTO' && b.storagePath)
  const hasarSecili = (fotoIds.length ? hasarHepsi.filter((b) => fotoIds.includes(b.id)) : hasarHepsi.slice(0, 2)).slice(0, 2)

  // ── faiz (hap bilgiler için) ──
  const anapara = dosya.rucuTutari != null ? Number(dosya.rucuTutari) : dosya.asilAlacak != null ? Number(dosya.asilAlacak) : 0
  const oranlar = oranlariOku(ayarlar?.faizJson)
  const dekontGirdi: DekontGirdi[] = dosya.odemeler.map((o) => ({ tarih: o.tarih ? o.tarih.toISOString().slice(0, 10) : null, tutar: o.tutar != null ? Number(o.tutar) : 0, haricMi: o.haricMi }))
  const faizBas = dosya.faizBaslangic ? dosya.faizBaslangic.toISOString().slice(0, 10) : sonDekontTarihi(dekontGirdi)
  const faizBit = dosya.faizBitis ? dosya.faizBitis.toISOString().slice(0, 10) : new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10) // bugün = Türkiye günü (UTC+3)
  const faizHesap = anapara > 0 && faizBas ? faizHesapla(anapara, new Date(faizBas), new Date(faizBit), oranlar) : null
  const islemisFaiz = dosya.faizTutari != null ? Number(dosya.faizTutari) : faizHesap ? faizHesap.faiz : null
  const toplam = islemisFaiz != null ? anapara + islemisFaiz : anapara

  const footer = footerOlustur(ayarlar)
  const aciklama = aciklamaTam(cj.aciklama, footer)

  const dayanakListe = [
    ...secilenler.map((d, i) => `  ${String(i + 1).padStart(2, '0')}. ${d.rolLabel} — ${d.dosyaAdi}${d.not ? ` (${d.not})` : ''}`),
    ...hasarSecili.map((b, i) => `  ${String(secilenler.length + i + 1).padStart(2, '0')}. Hasar Fotoğrafı — ${b.dosyaAdi}`),
  ].join('\n')

  const ozet = [
    `İCRA TAKİBİNE HAZIRLIK — HAP BİLGİLER`,
    `Hukuk Dosya No: ${dosya.hukukDosyaNo ?? '—'}   Hasar No: ${dosya.hasarDosyaNo ?? '—'}`,
    ``,
    `ALACAKLI`,
    `  Ünvan : ${ayarlar?.alacakliUnvan ?? dosya.musteri.ad}`,
    `  MERSİS/VKN : ${ayarlar?.mersis ?? ayarlar?.davaciVkn ?? '—'}`,
    `  Vekil : ${ayarlar?.vekilAd ?? '—'}${ayarlar?.vekilBaro ? ` (${ayarlar.vekilBaro})` : ''}`,
    ``,
    `BORÇLU(LAR)`,
    ...(dosya.borclular.length
      ? dosya.borclular.map((b) => `  • ${b.adUnvan}${b.tcVkn ? ` · TC/VKN ${b.tcVkn}` : ''}${b.adres ? ` · ${b.adres}` : ''} [${b.teyitDurumu}]`)
      : ['  • (henüz borçlu çıkarılmadı)']),
    ``,
    `ALACAK`,
    `  Asıl alacak (anapara) : ${para(anapara)}`,
    `  Rücu oranı : ${dosya.rucuOrani ?? '—'}`,
    `  İşlemiş faiz : ${para(islemisFaiz)}${faizBas ? `  (başlangıç ${gun(new Date(faizBas))} → ${gun(new Date(faizBit))})` : ''}`,
    `  Takip çıkışı (anapara + faiz) : ${para(toplam)}`,
    ``,
    `KAZA / YETKİ`,
    `  Kaza tarihi : ${gun(dosya.kazaTarihi ?? dosya.hasarTarihi)}   Kaza yeri : ${dosya.kazaYeri ?? dosya.il ?? '—'}`,
    `  Branş : ${dosya.brans ?? '—'}   Rücu sebebi : ${dosya.rucuSebebi ?? '—'}`,
    `  Yetkili icra (kaza yeri) : ${dosya.yetkiliIcra ?? dosya.icraDairesi ?? '—'}`,
    `  Zamanaşımı : ${gun(dosya.zamanasimi)}`,
    ``,
    `UYAP TAKİP AÇIKLAMASI`,
    aciklama || '  (açıklama henüz oluşturulmadı)',
    ``,
    `DAYANAK BELGELER (${secilenler.length + hasarSecili.length})`,
    dayanakListe || '  (dayanak seçilemedi)',
    ...(notlar.length ? ['', 'NOTLAR', ...notlar.map((n) => `  ! ${n}`)] : []),
    ``,
    `Hazırlandı: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}  ·  KonsRücü`,
  ].join('\n')

  // ── zip ──
  const zip = new JSZip()
  zip.file('00-OZET-icra-hazirlik.txt', ozet)
  const admin = createAdminClient()
  let sira = 1
  const indir = async (storagePath: string | null, etiket: string, ad: string) => {
    if (!storagePath) return
    try {
      const { data, error } = await admin.storage.from('evrak').download(storagePath)
      if (error || !data) return
      const buf = Buffer.from(await data.arrayBuffer())
      const isim = `${String(sira).padStart(2, '0')}-${dosyaAdiTemizle(etiket)} - ${dosyaAdiTemizle(ad)}${uzanti(storagePath, ad)}`
      zip.file(isim, buf)
      sira++
    } catch { /* belge atlanır */ }
  }
  for (const d of secilenler) {
    const b = dosya.belgeler.find((x) => x.id === d.id)
    await indir(b?.storagePath ?? null, ROL_LABEL[d.rol], d.dosyaAdi)
  }
  for (const b of hasarSecili) await indir(b.storagePath, 'Hasar Fotografi', b.dosyaAdi)

  const out = await zip.generateAsync({ type: 'nodebuffer' })
  const dosyaAdi = `icra-hazirlik-${dosyaAdiTemizle(dosya.hukukDosyaNo ?? dosya.hasarDosyaNo ?? dosya.id.slice(0, 8))}.zip`
  return new Response(new Uint8Array(out), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${dosyaAdi}"`,
      'Cache-Control': 'no-store',
    },
  })
}
