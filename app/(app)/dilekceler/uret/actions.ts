'use server'

/**
 * KonsRücü — Dilekçe üretimi (aşama 2) eylemleri · app/(app)/dilekceler/uret/actions.ts
 *
 * S36 (06 §7.3 Aşama 2): kilitli (ONAYLI) dosya kartından, müvekkilin onaylı iskeleti ve üslup kartıyla
 * dilekçe taslağı üretir. Kodun bastığı bloklar (başlık, taraflar, değer, EKLER, talep sonucu) deterministiktir;
 * yalnız AÇIKLAMALAR yapay zekâdan gelir ve kart dışı olgu içerirse "kaynaksız" işaretlenir (composer.ts).
 *
 * Sürümleme: her "taslak üret" `UretilenCikti`nin YENİ bir `DilekceSurum` ÇİFTİ açar — `AI_HAM` (modelin/kodun
 * o anki ham çıktısı, değişmez) ve `AVUKAT` (avukatın düzenleyeceği kopya, başlangıçta aynı). Önceki sürümler
 * ezilmez (yalnız yeni `sira` eklenir). "Kaydet" yalnız `AVUKAT` satırını günceller (iyimser kilit, v1 dilekçe
 * hattındaki `davaTaslagiKaydet` ile aynı desen).
 */
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { AiDurdurulduHata, KrediYetersizHata } from '@/lib/konsrucu/ai-kredi'
import { acilamayanUyarisi, aiKapiHatasiMi, aiOturumu } from '@/lib/ai/cagri'
import { KVKK_KAPALI_MESAJI, yuzeyAcik } from '@/lib/ai/bayrak'
import { avukatRoluMu, dilekceV2Acik } from '@/lib/konsrucu/dilekce-v2/bayrak'
import { davaDegeriOnerisi } from '@/lib/konsrucu/dilekce-v2/kart'
import { icerikOku, kartVerisiniYukle } from '@/lib/konsrucu/dilekce-v2/kart-veri'
import { baglamKur, dilekceyiOlustur, type AiParagrafGirdi, type ComposerGirdisi } from '@/lib/konsrucu/dilekce-v2/composer'
import { iskeletSec, type SablonKaydi } from '@/lib/konsrucu/dilekce-v2/iskelet'
import { kaliteRaporu, type AtifOnayKaydi, type KaliteRaporu } from '@/lib/konsrucu/dilekce-v2/kapilar'
import { kaliteGirdisiOlustur } from '@/lib/konsrucu/dilekce-v2/kalite-veri'
import { COMPOSER_MODEL, COMPOSER_PROMPT_SURUM, composerUretici } from '@/lib/konsrucu/dilekce-v2/model'
import { aciklamaParagraflariniUret } from '@/lib/konsrucu/dilekce-v2/paragraf'
import { blokIsle } from '@/lib/konsrucu/dilekce-v2/sablon-dil'
import { KART_TUR_ADI, KART_TURLERI, kartTuruMu, type KartTuru } from '@/lib/konsrucu/dilekce-v2/tipler'
import { uslupIstemi, type UslupKuraliKaydi } from '@/lib/konsrucu/dilekce-v2/uslup'
import { atifKapisi, type KutuphaneKaydi } from '@/lib/konsrucu/mevzuat/atif'

type Hata = { ok: false; error: string }
const uuid = z.string().uuid()
const CAKISMA = 'Bu dilekçe başka bir oturumda değişti. Sayfayı yenileyip güncel sürüm üzerinden devam edin.'
const jsonVeri = (v: unknown) => v as Prisma.InputJsonValue

type Oturum = { kullaniciId: string; rol: string; musteriId: string; avukat: boolean }

async function oturumAl(o: { avukatGerekli: boolean }): Promise<Oturum | Hata> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif || dbUser.rol === 'GORUNTULEYEN') return { ok: false, error: 'Dilekçe üretiminde değişiklik yetkiniz yok.' }
  if (!aktifMusteriId) return { ok: false, error: 'Aktif müşteri bulunamadı.' }
  if (!dilekceV2Acik(dbUser.rol)) return { ok: false, error: 'Dilekçe v2 bu hesap için henüz açık değil.' }
  const avukat = avukatRoluMu(dbUser.rol)
  if (o.avukatGerekli && !avukat) return { ok: false, error: 'Bu işlemi yalnız avukat yapabilir.' }
  const musteri = await prisma.musteri.findFirst({ where: { id: aktifMusteriId, aktif: true }, select: { id: true } })
  if (!musteri) return { ok: false, error: 'Bu müşteri pasif olduğu için dilekçe üretilemez.' }
  return { kullaniciId: dbUser.id, rol: dbUser.rol, musteriId: aktifMusteriId, avukat }
}
const hataMi = (x: unknown): x is Hata => !!x && typeof x === 'object' && (x as Hata).ok === false

function yenile(dosyaId: string) {
  revalidatePath('/dilekceler')
  revalidatePath('/dilekceler/uret')
  revalidatePath(`/akilli-giris/${dosyaId}`)
}

// ───────────────────────── taslak üret ─────────────────────────

const uretGirdi = z.object({ dosyaId: uuid, tur: z.enum(KART_TURLERI) })

export type UretimSonucu = {
  ok: true
  ciktiId: string
  hamSurumId: string
  avukatSurumId: string
  metin: string
  uyarilar: string[]
}

/**
 * Kilitli (ONAYLI) karttan yeni bir dilekçe taslağı üretir. Kilit yoksa üretmez (asama 2 kapısı). Yeni üretim
 * eski `DilekceSurum` satırlarını EZMEZ; her çağrı yeni bir `sira` çifti (AI_HAM + AVUKAT) açar.
 */
export async function dilekceV2TaslakUret(input: { dosyaId: string; tur: KartTuru }): Promise<UretimSonucu | Hata> {
  const o = await oturumAl({ avukatGerekli: false })
  if (hataMi(o)) return o
  const p = uretGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Dosya ya da dilekçe türü geçersiz.' }
  const { dosyaId, tur } = p.data

  try {
    const kartRow = await prisma.dosyaKarti.findFirst({
      where: { dosyaId, tur, durum: 'ONAYLI', silindiAt: null, dosya: { musteriId: o.musteriId } },
      orderBy: { surum: 'desc' },
      select: { id: true, davaId: true, icerikJson: true },
    })
    if (!kartRow) return { ok: false, error: 'Bu tür için kilitli (onaylı) bir dosya kartı yok. Önce dosya kartını tamamlayıp kilitleyin.' }
    const kartIcerikVal = icerikOku(kartRow.icerikJson, tur)
    if (!kartIcerikVal) return { ok: false, error: 'Kilitli kartın içeriği okunamadı; kartı yeniden hazırlayıp kilitleyin.' }

    const [veri, ayarlar, sablonlar, uslupKayitlari, kutuphaneKayitlari] = await Promise.all([
      kartVerisiniYukle(prisma, o.musteriId, dosyaId),
      prisma.ayarlar.findUnique({ where: { musteriId: o.musteriId }, select: { alacakliUnvan: true, davaciAdres: true, davaciVkn: true, vekilAd: true, vekilUets: true } }),
      prisma.dilekceSablon.findMany({ where: { musteriId: o.musteriId, tur }, select: { id: true, tur: true, kod: true, surum: true, varyantJson: true, bloklarJson: true, aktif: true, onayAt: true } }),
      prisma.uslupKurali.findMany({ where: { musteriId: o.musteriId, durum: 'ONAYLI' }, select: { id: true, kapsam: true, metin: true, ornek: true, durum: true } }),
      prisma.mevzuatKaynak.findMany({ where: { musteriId: o.musteriId, aktif: true }, select: { id: true, kunye: true, tur: true, alinti: true, durum: true, etiket: true, resmiUrl: true, kapsamNotu: true, rucuSebebiKodlari: true } }),
    ])
    if (!veri) return { ok: false, error: 'Dosya aktif müşteride bulunamadı veya erişiminiz yok.' }

    const secimler = kartIcerikVal.secimler
    const mahkemeAdi = secimler.mahkeme || kartIcerikVal.oneriler.mahkeme
    const esasNo = secimler.esas || kartIcerikVal.oneriler.esas
    const dd = davaDegeriOnerisi(veri.girdi)
    const kutuphane: KutuphaneKaydi[] = kutuphaneKayitlari.map((k) => ({
      id: k.id, kunye: k.kunye, tur: k.tur, alinti: k.alinti, durum: k.durum, etiket: k.etiket, aktif: true, resmiUrl: k.resmiUrl, kapsamNotu: k.kapsamNotu, rucuSebebiKodlari: k.rucuSebebiKodlari,
    }))

    const composerGirdi: ComposerGirdisi = {
      kart: kartIcerikVal,
      davaci: { unvan: ayarlar?.alacakliUnvan ?? null, adres: ayarlar?.davaciAdres ?? null, vkn: ayarlar?.davaciVkn ?? null },
      vekil: { adSoyad: ayarlar?.vekilAd ?? null, uets: ayarlar?.vekilUets ?? null },
      mahkemeAdi, esasNo,
      icraDairesi: veri.girdi.dosya.icraDairesi, icraEsasNo: veri.girdi.dosya.icraDosyaNo,
      davaDegeri: dd ? { kurus: dd.kurus, aciklama: dd.aciklama } : null,
      tarih: new Date(),
      kutuphane,
    }

    const iskelet = iskeletSec(sablonlar as SablonKaydi[], tur, {
      rucuSebebiKod: veri.girdi.dosya.rucuSebebiKod, mahkemeTuru: null, usul: secimler.usul, davaliTur: null,
    })
    const baglam = baglamKur(composerGirdi)
    const yuvalar = iskelet.bloklar.flatMap((b) => blokIsle(b, baglam).aiYuvalari)

    const uyarilarAi: string[] = []
    let aiSonucu: AiParagrafGirdi[] | null = null
    let modelUretici: string | null = null
    if (!yuvalar.length) {
      // İskelette AÇIKLAMALAR yuvası yoksa yapay zekâ hiç çağrılmaz.
    } else if (!yuzeyAcik('dilekce')) {
      uyarilarAi.push(`${KVKK_KAPALI_MESAJI} AÇIKLAMALAR yer tutucu olarak bırakıldı.`)
    } else if (!process.env.ANTHROPIC_API_KEY) {
      uyarilarAi.push('Sunucuda yapay zekâ bağlantısı yapılandırılmamış; AÇIKLAMALAR yer tutucu olarak bırakıldı.')
    } else {
      try {
        const oturum = aiOturumu({ yuzey: 'dilekce', ai: { musteriId: o.musteriId, dosyaId }, maske: veri.maske })
        const uslupEki = uslupIstemi(uslupKayitlari as UslupKuraliKaydi[], tur)
        const r = await aciklamaParagraflariniUret({
          oturum, tur, uslupEki, yuvalar, olgular: kartIcerikVal.olgular.map((x) => ({ id: x.id, metin: x.metin })),
        })
        if (r.cikti) { aiSonucu = r.cikti.paragraflar; modelUretici = composerUretici(true) }
        else uyarilarAi.push('Yapay zekâ geçerli bir paragraf listesi döndürmedi; AÇIKLAMALAR yer tutucu olarak bırakıldı.')
        if (r.kesildi) uyarilarAi.push('Yapay zekâ yanıtı uzunluk sınırında kesildi; bazı paragraflar eksik olabilir.')
        const jetonUyarisi = acilamayanUyarisi(r.acilamayanJetonlar)
        if (jetonUyarisi) uyarilarAi.push(jetonUyarisi)
      } catch (e) {
        if (e instanceof KrediYetersizHata || e instanceof AiDurdurulduHata || aiKapiHatasiMi(e)) return { ok: false, error: e.message }
        console.error('[dilekce-v2] açıklama paragrafları alınamadı', e instanceof Error ? e.name : 'Bilinmeyen hata')
        uyarilarAi.push('Yapay zekâ açıklaması alınamadı; AÇIKLAMALAR yer tutucu olarak bırakıldı.')
      }
    }

    const sonuc = dilekceyiOlustur(composerGirdi, iskelet.bloklar, aiSonucu)
    const uyarilar = [...sonuc.uyarilar, ...uyarilarAi]

    const kayit = await prisma.$transaction(async (tx) => {
      const hala = await tx.rucuDosyasi.findFirst({ where: { id: dosyaId, musteriId: o.musteriId }, select: { id: true } })
      if (!hala) throw new Error('Dosya erişimi değişti')
      let ciktiRow = await tx.uretilenCikti.findFirst({ where: { dosyaId, tip: 'DILEKCE', tur }, orderBy: { createdAt: 'desc' }, select: { id: true } })
      if (!ciktiRow) ciktiRow = await tx.uretilenCikti.create({ data: { dosyaId, tip: 'DILEKCE', tur, davaId: kartRow.davaId, durum: 'TASLAK', modelSurum: modelUretici } })
      const sonSurum = await tx.dilekceSurum.findFirst({ where: { ciktiId: ciktiRow.id }, orderBy: { sira: 'desc' }, select: { sira: true } })
      const taban = sonSurum?.sira ?? 0
      const ortak = {
        ciktiId: ciktiRow.id, dosyaId, kartId: kartRow.id, sablonId: iskelet.sablonId, uslupSurum: uslupKayitlari.length ? 1 : null,
        model: aiSonucu ? COMPOSER_MODEL : null, promptSurum: aiSonucu ? COMPOSER_PROMPT_SURUM : null, kaynakBelgeIds: [] as string[],
        olguBaglariJson: jsonVeri(sonuc.olguBaglari),
        uretimJson: jsonVeri({ uyarilar, aiKullanildi: !!aiSonucu, iskeletKaynak: iskelet.kaynak, iskeletKod: iskelet.kod }),
        kaliteJson: jsonVeri({ atifKirmizi: sonuc.atiflar.filter((a) => a.kirmizi).length, yerTutucu: sonuc.yerTutucular.length, kaynaksizParagraf: sonuc.paragraflar.filter((x) => x.kaynaksiz).length }),
        yazanId: o.kullaniciId,
      }
      const ham = await tx.dilekceSurum.create({ data: { ...ortak, sira: taban + 1, kaynak: 'AI_HAM', icerik: sonuc.metin } })
      const avukat = await tx.dilekceSurum.create({ data: { ...ortak, sira: taban + 2, kaynak: 'AVUKAT', icerik: sonuc.metin } })
      await tx.aktivite.create({ data: { dosyaId, kullaniciId: o.kullaniciId, eylem: `Dilekçe taslağı üretildi: ${KART_TUR_ADI[tur]}, sürüm ${avukat.sira}`, detayJson: { ciktiId: ciktiRow.id, hamSurumId: ham.id, avukatSurumId: avukat.id } } })
      return { ciktiId: ciktiRow.id, hamId: ham.id, avukatId: avukat.id }
    })

    yenile(dosyaId)
    return { ok: true, ciktiId: kayit.ciktiId, hamSurumId: kayit.hamId, avukatSurumId: kayit.avukatId, metin: sonuc.metin, uyarilar }
  } catch (e) {
    console.error('[dilekce-v2] dilekçe üretilemedi', e instanceof Error ? e.name : 'Bilinmeyen hata')
    return { ok: false, error: 'Dilekçe taslağı üretilemedi. Önceki sürümler korunuyor; lütfen tekrar deneyin.' }
  }
}

// ───────────────────────── avukatın düzenlediği sürümü kaydet ─────────────────────────

const kaydetGirdi = z.object({
  surumId: uuid, icerik: z.string().min(1).max(200_000), beklenenIcerik: z.string().max(200_000),
  imzayaHazir: z.boolean().optional(),
})

/** Beklenen içeriği WHERE'e dahil ederek başka oturumun düzenlemesini ezmez (v1 dilekçe hattıyla aynı desen). */
export async function dilekceV2TaslakKaydet(input: z.input<typeof kaydetGirdi>): Promise<{ ok: true } | Hata> {
  const p = kaydetGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Dilekçe metni geçersiz (1–200.000 karakter olmalı).' }
  const o = await oturumAl({ avukatGerekli: !!p.data.imzayaHazir })
  if (hataMi(o)) return o
  const surum = await prisma.dilekceSurum.findFirst({
    where: { id: p.data.surumId, kaynak: 'AVUKAT', silindiAt: null, dosya: { musteriId: o.musteriId } },
    select: { id: true, dosyaId: true, durum: true, kartId: true, atifJson: true, cikti: { select: { tur: true } } },
  })
  if (!surum) return { ok: false, error: 'Dilekçe sürümü bulunamadı veya erişiminiz yok.' }
  if (surum.durum === 'GONDERILDI_UYAP') return { ok: false, error: 'UYAP\'a gönderildi olarak kilitlenmiş sürüm değiştirilemez.' }

  // S37 (06 §7.4): "İmzaya hazır" yalnız kırmızı kalite kapısı yokken kabul edilir; rol kapısı yukarıda (oturumAl).
  let kaliteJson: Prisma.InputJsonValue | undefined
  if (p.data.imzayaHazir) {
    const tur: KartTuru = kartTuruMu(surum.cikti.tur) ? surum.cikti.tur : 'DAVA'
    const girdi = await kaliteGirdisiOlustur({
      musteriId: o.musteriId, kullaniciId: o.kullaniciId, dosyaId: surum.dosyaId, kartId: surum.kartId, tur,
      metin: p.data.icerik, atifJsonHam: surum.atifJson,
    })
    const rapor = kaliteRaporu(girdi)
    kaliteJson = jsonVeri({ kirmizi: rapor.kirmizi, sari: rapor.sari, kontrolAt: new Date().toISOString() })
    if (!rapor.imzayaHazirOlabilir) {
      const ilkler = rapor.kirmizi.slice(0, 3).map((b) => b.mesaj)
      const kalan = rapor.kirmizi.length - ilkler.length
      return { ok: false, error: `İmzaya hazır kilitli: ${ilkler.join(' ')}${kalan > 0 ? ` (+${kalan} bulgu daha)` : ''}` }
    }
  }

  try {
    const r = await prisma.dilekceSurum.updateMany({
      where: { id: surum.id, icerik: p.data.beklenenIcerik, durum: { not: 'GONDERILDI_UYAP' } },
      data: {
        icerik: p.data.icerik,
        ...(p.data.imzayaHazir ? { durum: 'IMZAYA_HAZIR', kilitAt: new Date(), ...(kaliteJson ? { kaliteJson } : {}) } : {}),
      },
    })
    if (r.count !== 1) return { ok: false, error: CAKISMA }
    await prisma.aktivite.create({ data: { dosyaId: surum.dosyaId, kullaniciId: o.kullaniciId, eylem: p.data.imzayaHazir ? 'Dilekçe imzaya hazır olarak kaydedildi' : 'Dilekçe taslağı düzenlendi', detayJson: { surumId: surum.id } } })
    yenile(surum.dosyaId)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Dilekçe kaydedilemedi. Düzenlediğiniz metni koruyup tekrar deneyin.' }
  }
}

// ───────────────────────── kalite raporu (S37) ─────────────────────────

const kaliteGirdi = z.object({ surumId: uuid, metin: z.string().min(1).max(200_000) })

/** Ekranda "Kaliteyi kontrol et": kaydetmeden, o an düzenlenen metin için kalite raporu döner (06 §7.4). */
export async function dilekceV2KaliteKontrolEt(input: z.input<typeof kaliteGirdi>): Promise<{ ok: true; rapor: KaliteRaporu } | Hata> {
  const p = kaliteGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Dilekçe metni geçersiz.' }
  const o = await oturumAl({ avukatGerekli: false })
  if (hataMi(o)) return o
  const surum = await prisma.dilekceSurum.findFirst({
    where: { id: p.data.surumId, kaynak: 'AVUKAT', silindiAt: null, dosya: { musteriId: o.musteriId } },
    select: { dosyaId: true, kartId: true, atifJson: true, cikti: { select: { tur: true } } },
  })
  if (!surum) return { ok: false, error: 'Dilekçe sürümü bulunamadı veya erişiminiz yok.' }
  const tur: KartTuru = kartTuruMu(surum.cikti.tur) ? surum.cikti.tur : 'DAVA'
  const girdi = await kaliteGirdisiOlustur({
    musteriId: o.musteriId, kullaniciId: o.kullaniciId, dosyaId: surum.dosyaId, kartId: surum.kartId, tur,
    metin: p.data.metin, atifJsonHam: surum.atifJson,
  })
  return { ok: true, rapor: kaliteRaporu(girdi) }
}

// ───────────────────────── atıf onayı (S37, 06 §7.4-1) ─────────────────────────

const atifOnayGirdi = z.object({
  surumId: uuid, anahtar: z.string().min(1).max(300),
  resmiUrl: z.string().trim().max(500).optional(), gerekce: z.string().trim().max(500).optional(),
})

/**
 * Doğrulanmamış (ya da kütüphanede teyit gerekli/kullanma işaretli) tek bir atfı, avukatın kayıtlı onayıyla
 * geçirir (kim, ne zaman, resmî bağlantı; 06 §7.4-1). Yasak cümleler (kalıp ihlali) bu yolla onaylanamaz —
 * kapilar.ts onlara `atif` alanı vermez, yalnız metnin düzeltilmesiyle geçer. Onay Aktivite'ye yazılır.
 */
export async function dilekceV2AtifOnayla(input: z.input<typeof atifOnayGirdi>): Promise<{ ok: true } | Hata> {
  const p = atifOnayGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Atıf onayı geçersiz.' }
  const o = await oturumAl({ avukatGerekli: true })
  if (hataMi(o)) return o
  const surum = await prisma.dilekceSurum.findFirst({
    where: { id: p.data.surumId, kaynak: 'AVUKAT', silindiAt: null, dosya: { musteriId: o.musteriId } },
    select: { id: true, dosyaId: true, durum: true, icerik: true, atifJson: true },
  })
  if (!surum) return { ok: false, error: 'Dilekçe sürümü bulunamadı veya erişiminiz yok.' }
  if (surum.durum === 'GONDERILDI_UYAP') return { ok: false, error: 'UYAP\'a gönderildi olarak kilitlenmiş sürümde atıf onayı değiştirilemez.' }

  const kutuphaneKayitlari = await prisma.mevzuatKaynak.findMany({
    where: { musteriId: o.musteriId, aktif: true },
    select: { id: true, kunye: true, tur: true, alinti: true, durum: true, etiket: true, resmiUrl: true, kapsamNotu: true, rucuSebebiKodlari: true },
  })
  const kutuphane: KutuphaneKaydi[] = kutuphaneKayitlari.map((k) => ({
    id: k.id, kunye: k.kunye, tur: k.tur, alinti: k.alinti, durum: k.durum, etiket: k.etiket, aktif: true,
    resmiUrl: k.resmiUrl, kapsamNotu: k.kapsamNotu, rucuSebebiKodlari: k.rucuSebebiKodlari,
  }))
  const sonuc = atifKapisi(surum.icerik, kutuphane)
  const bulunan = sonuc.atiflar.find((a) => a.anahtar === p.data.anahtar && a.kirmizi)
  if (!bulunan) return { ok: false, error: 'Bu atıf metinde bulunamadı ya da zaten doğrulanmış görünüyor; sayfayı yenileyip tekrar deneyin.' }

  const mevcut: AtifOnayKaydi[] = Array.isArray(surum.atifJson)
    ? (surum.atifJson as unknown[]).filter((x): x is AtifOnayKaydi => !!x && typeof x === 'object' && typeof (x as AtifOnayKaydi).anahtar === 'string')
    : []
  const yeniKayit: AtifOnayKaydi = {
    anahtar: p.data.anahtar, metin: bulunan.metin, onaylayanId: o.kullaniciId, at: new Date().toISOString(),
    resmiUrl: p.data.resmiUrl?.trim() || null, gerekce: p.data.gerekce?.trim() || null,
  }
  const yeniListe = [...mevcut.filter((x) => x.anahtar !== p.data.anahtar), yeniKayit]

  try {
    await prisma.$transaction([
      prisma.dilekceSurum.update({ where: { id: surum.id }, data: { atifJson: jsonVeri(yeniListe) } }),
      prisma.aktivite.create({
        data: {
          dosyaId: surum.dosyaId, kullaniciId: o.kullaniciId, eylem: `Atıf onaylandı (elle): ${p.data.anahtar}`,
          detayJson: { surumId: surum.id, anahtar: p.data.anahtar, resmiUrl: yeniKayit.resmiUrl, gerekce: yeniKayit.gerekce },
        },
      }),
    ])
    yenile(surum.dosyaId)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Atıf onayı kaydedilemedi. Tekrar deneyin.' }
  }
}
