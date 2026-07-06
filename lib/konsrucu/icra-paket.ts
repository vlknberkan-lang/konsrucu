/**
 * KonsRücü — İcra Takibine Hazırlık paketi üreticisi · lib/konsrucu/icra-paket.ts (sunucu, paylaşımlı)
 * Dosyanın dayanak klasörünü TEK .zip olarak kurar (Berkan'ın 5 maddesi, 2026-07-07):
 *   1) Vekaletname (MÜŞTERİ BAZLI ortak belge — Ayarlar/Şirket Bilgileri'nden)
 *   2) Poliçe
 *   3) KTT + Görgü + İfade tutanakları + Sigortalı Beyanı (HANGİLERİ VARSA)
 *   4) 2-3 hasar fotoğrafı (AI vision seçimi; yoksa ilk 2)
 *   5) Ekspertiz — YALNIZ tutarı alacakla uyuşuyorsa VE "rücu yok" yazmıyorsa
 *   + Ödeme dekontu + 00-OZET hap bilgiler metni.
 * İki tüketici: /api/icra-hazirlik/[id] (oturum) ve /api/uyap/takip-paket (eklenti Bearer — tevzi sonrası otomatik).
 */
import JSZip from 'jszip'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { dayanakSec, ROL_LABEL, type DayanakGirdi } from '@/lib/konsrucu/dayanak-sec'
import { footerOlustur, aciklamaTam } from '@/lib/konsrucu/takip'
import { faizHesapla, oranlariOku, sonDekontTarihi, odenenToplam, type DekontGirdi } from '@/lib/konsrucu/faiz'
import { tarihTR } from '@/lib/konsrucu/format'

const para = (n: number | null | undefined) =>
  n != null && Number.isFinite(Number(n)) ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n)) + ' ₺' : '—'
const gun = (d: Date | null | undefined) => tarihTR(d)
const dosyaAdiTemizle = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
const uzanti = (yol: string | null, ad: string) => {
  const m = (yol || ad).match(/\.([a-z0-9]{2,5})(?:$|\?)/i)
  return m ? `.${m[1].toLowerCase()}` : ''
}

export type IcraPaket =
  | { ok: true; zip: Buffer; dosyaAdi: string }
  | { ok: false; error: string; status: number }

/** Dosyanın icra hazırlık .zip paketini üret (tenant kapsaması ÇAĞIRANIN izinli listesiyle). */
export async function icraPaketOlustur(dosyaId: string, izinli: string[]): Promise<IcraPaket> {
  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { id: dosyaId, musteriId: { in: izinli } },
    include: {
      musteri: true,
      borclular: true,
      odemeler: true,
      belgeler: { select: { id: true, dosyaAdi: true, kategori: true, extractedText: true, storagePath: true, belgeTarihi: true, confidence: true } },
    },
  })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok', status: 404 }
  const ayarlar = await prisma.ayarlar.findUnique({ where: { musteriId: dosya.musteriId } })

  // ── faiz (hap bilgiler için) ──
  const anapara = dosya.rucuTutari != null ? Number(dosya.rucuTutari) : dosya.asilAlacak != null ? Number(dosya.asilAlacak) : 0
  const oranlar = oranlariOku(ayarlar?.faizJson)
  const dekontGirdi: DekontGirdi[] = dosya.odemeler.map((o) => ({ tarih: o.tarih ? o.tarih.toISOString().slice(0, 10) : null, tutar: o.tutar != null ? Number(o.tutar) : 0, haricMi: o.haricMi }))
  const faizBas = dosya.faizBaslangic ? dosya.faizBaslangic.toISOString().slice(0, 10) : sonDekontTarihi(dekontGirdi)
  const faizBit = dosya.faizBitis ? dosya.faizBitis.toISOString().slice(0, 10) : new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10) // bugün = Türkiye günü (UTC+3)
  const faizHesap = anapara > 0 && faizBas ? faizHesapla(anapara, new Date(faizBas), new Date(faizBit), oranlar) : null
  const islemisFaiz = dosya.faizTutari != null ? Number(dosya.faizTutari) : faizHesap ? faizHesap.faiz : null
  const toplam = islemisFaiz != null ? anapara + islemisFaiz : anapara

  // ── dayanak seçimi: ekspertiz tutar kıyası hedefleri = rücu tutarı / asıl alacak / ödenen tazminat ──
  const alacakTutarlari = [
    dosya.rucuTutari != null ? Number(dosya.rucuTutari) : NaN,
    dosya.asilAlacak != null ? Number(dosya.asilAlacak) : NaN,
    odenenToplam(dekontGirdi),
  ].filter((n) => Number.isFinite(n) && n > 0)
  const { secilenler, notlar } = dayanakSec(dosya.belgeler as DayanakGirdi[], { alacakTutarlari })

  // Hasar fotoğrafları: AI seçtiyse onlar (en fazla 3); yoksa ilk 2 hasar fotoğrafı.
  const cj = (dosya.cikarimJson ?? {}) as { aciklama?: string | null; dayanakFotoIds?: unknown }
  const fotoIds = Array.isArray(cj.dayanakFotoIds) ? cj.dayanakFotoIds.filter((x): x is string => typeof x === 'string') : []
  const hasarHepsi = dosya.belgeler.filter((b) => b.kategori === 'HASAR_FOTO' && b.storagePath)
  const hasarSecili = fotoIds.length ? hasarHepsi.filter((b) => fotoIds.includes(b.id)).slice(0, 3) : hasarHepsi.slice(0, 2)

  const footer = footerOlustur(ayarlar)
  const aciklama = aciklamaTam(cj.aciklama, footer)

  const dayanakListe = [
    ...(ayarlar?.vekaletnamePath ? [`  00. Vekaletname (şirket ortak) — ${ayarlar.vekaletnameAd ?? 'vekaletname'}`] : []),
    ...secilenler.map((d, i) => `  ${String(i + 1).padStart(2, '0')}. ${d.rolLabel} — ${d.dosyaAdi}${d.not ? ` (${d.not})` : ''}`),
    ...hasarSecili.map((b, i) => `  ${String(secilenler.length + i + 1).padStart(2, '0')}. Hasar Fotoğrafı — ${b.dosyaAdi}`),
  ].join('\n')

  const paketNotlar = [...notlar]
  if (!ayarlar?.vekaletnamePath) paketNotlar.push('Vekaletname yüklenmemiş — Şirket Bilgileri sayfasından müşteri vekaletnamesini yükleyin.')

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
    `DAYANAK BELGELER (${(ayarlar?.vekaletnamePath ? 1 : 0) + secilenler.length + hasarSecili.length})`,
    dayanakListe || '  (dayanak seçilemedi)',
    ...(paketNotlar.length ? ['', 'NOTLAR', ...paketNotlar.map((n) => `  ! ${n}`)] : []),
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
  // 1) Vekaletname — müşteri bazlı ortak belge, paketin başına
  if (ayarlar?.vekaletnamePath) await indir(ayarlar.vekaletnamePath, 'Vekaletname', ayarlar.vekaletnameAd ?? 'vekaletname')
  for (const d of secilenler) {
    const b = dosya.belgeler.find((x) => x.id === d.id)
    await indir(b?.storagePath ?? null, ROL_LABEL[d.rol], d.dosyaAdi)
  }
  for (const b of hasarSecili) await indir(b.storagePath, 'Hasar Fotografi', b.dosyaAdi)

  const out = await zip.generateAsync({ type: 'nodebuffer' })
  const zipAdi = `icra-hazirlik-${dosyaAdiTemizle(dosya.hukukDosyaNo ?? dosya.hasarDosyaNo ?? dosya.id.slice(0, 8))}.zip`
  return { ok: true, zip: out, dosyaAdi: zipAdi }
}
