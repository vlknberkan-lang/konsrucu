/**
 * KonsRücü — UYAP senkron · POST /api/uyap/senkron
 * Eklenti her takip için durum + finansal + yeni olayları gönderir; icraDosyaNo ile dosyaya bağlanır.
 * Idempotent: aynı olay (tip+tarih+açıklama) tekrar yazılmaz. Tenant-kapsamlı (Bearer program oturumu).
 *
 * Gövde: { icraDosyaNo, dosyaId?, durum?, hesap?:{asilAlacak,islemisFaiz,tahsilat,bakiye,...},
 *          olaylar?:[{tip, tarih?, tutar?, aciklama?}] }
 * Eşleşme: dosyaId varsa KESİN eşleşme (hedefler zaten id gönderiyor — çok-adliyeli portföyde aynı
 * esas no'lu iki dosya karışmasın); yoksa icraDosyaNo fallback (eski eklenti sürümleri).
 *
 * S15 (aday olaylar, üç eksen gölge, tahsilat kuralı) — GERİYE UYUMLU: 1.8 ve 1.9 gövdesi aynen kabul edilir.
 *   • Olaylar HUKUKİ sıraya göre (tarih artan) işlenir: aynı partide geç tarihli olay erken olayı ezmesin (docs/04 K2).
 *   • Eski durum UYAP_OLAY_DURUM kipine göre değişir (varsayılan asimetrik: UYAP kesinleşme/kapanışı durumu
 *     değiştirmez, görev kapatmaz — 06 M2/M3). Tarihsiz olaya "bugün" yazılmaz.
 *   • Evrak adından gelen TAHSILAT tahsilat değildir (docs/04 K1): "TAHSİLAT SİNYALİ" etiketli DURUM olarak yazılır.
 *   • EKSEN_KIPI=golge iken her olay aynı satıra ADAY kolonlarıyla yazılır (eklenti 1.9'un DURUM + etiketle
 *     gönderdiği İADE, dosya alacağına haciz, ihtiyati haciz, itirazın alacaklıya tebliği … alt tipe çevrilir);
 *     durum metnindeki itiraz tarihsiz DURDURMA_ITIRAZ adayı olur; UYAP "Yatan Para" artışı fark kadar
 *     TAHSILAT_BORCLUDAN adayı doğurur; okunmuş mazbatalar adayları zenginleştirir; eksenler gölge yazılır.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { takipOlayKaydet, OLAY_TIPLERI, type OlayTip, type AdayKolonlari } from '@/lib/konsrucu/takip-olay'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'
import { cinsEslesti, ogrenilenMap } from '@/lib/konsrucu/masraf-cins'
import { eksenAcik, uyapOlayDurumKipi } from '@/lib/konsrucu/eksen/bayrak'
import { durumMetniItirazAdayi, durumMetniItirazMi, eklentiOlayiniSinifla } from '@/lib/konsrucu/eksen/aday-siniflandir'
import { adayTekilAnahtar, DURUM_METNI_ITIRAZ_ANAHTARI, tahsilatTekilAnahtar, tekilIhlaliMi } from '@/lib/konsrucu/eksen/tekil'
import { tahsilatAdayMetni, yatanParaFarki } from '@/lib/konsrucu/eksen/tahsilat'
import { mazbataAdaylariniIsle } from '@/lib/konsrucu/eksen/mazbata-aday'
import { birlesecekAdayIdBul, adayaKaynakEkle } from '@/lib/konsrucu/eksen/aday-birlestir'
import { eksenYenidenHesapla } from '@/lib/konsrucu/eksen/kaydet'
import { TAHSILAT_SINYALI_ETIKET } from '@/lib/konsrucu/eksen/sabitler'
import { isoGun } from '@/lib/konsrucu/eksen/norm'

/** Eklentinin dosya düzeyi yapısal tebliğ olayının açıklaması (extension/siniflandir.js olaylarTuret). */
const YAPISAL_TEBLIG_ACIKLAMA = 'Tebliğ (UYAP)'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return preflight(req)
}

const dec = (v: unknown): Prisma.Decimal | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? new Prisma.Decimal(Math.round(n * 100) / 100) : null
}
const tarihParse = (v: unknown): Date | null => {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

export async function POST(req: Request) {
  const k = await uyapKimlik(req)
  if (!k) return corsJson({ ok: false, error: 'unauthorized' }, 401, req)

  let body: {
    icraDosyaNo?: string; dosyaId?: string; durum?: string; hesap?: Record<string, unknown>
    olaylar?: { tip?: string; tarih?: string; tutar?: number; aciklama?: string }[]
    // v1 eklenti eşleşme raporu: dosya UYAP'ta bulunamasa bile POST gelir — kör nokta kalmaz
    eslesme?: { durum?: string; not?: string }
    // v1 yapılandırılmış masraf kalemleri (kaynak ekran belirlenince eklenti dolduracak)
    masraflar?: { tarih?: string; ad?: string; tutar?: number; makbuzNo?: string }[]
  }
  try { body = await req.json() } catch { return corsJson({ ok: false, error: 'bad json' }, 400, req) }

  const icraDosyaNo = String(body?.icraDosyaNo ?? '').trim()
  const dosyaIdGirdi = String(body?.dosyaId ?? '').trim()
  if (!icraDosyaNo && !dosyaIdGirdi) return corsJson({ ok: false, error: 'icraDosyaNo veya dosyaId gerekli' }, 400, req)

  // dosyaId (hedefler'den gelen kesin kimlik) öncelikli; yoksa icraDosyaNo (esas no adliyeye özgü DEĞİL).
  // durum + önceki hesap görüntüsü: asimetrik iz (ESKI_DURUM) ve "Yatan Para" farkı için (hesap aşağıda EZİLİR)
  const DOSYA_SELECT = { id: true, musteriId: true, durum: true, uyapHesapJson: true } as const
  const dosya = dosyaIdGirdi
    ? await prisma.rucuDosyasi.findFirst({ where: { id: dosyaIdGirdi, musteriId: { in: k.izinli } }, select: DOSYA_SELECT })
    : await prisma.rucuDosyasi.findFirst({ where: { icraDosyaNo, musteriId: { in: k.izinli } }, select: DOSYA_SELECT })
  if (!dosya) return corsJson({ ok: false, error: `dosya bulunamadı (${dosyaIdGirdi ? 'dosyaId' : 'icraDosyaNo'})` }, 404, req)

  // eşleşme raporu (v1): beyaz-listeli durum + teşhis notu. OK dışı = "senkron dışı" radarına düşer.
  const ESLESME_DURUMLARI = ['OK', 'DAIRE_EKSIK', 'DAIRE_COZULEMEDI', 'BULUNAMADI', 'BASKA_DAIRE', 'COKLU_BELIRSIZ', 'TARAF_UYUSMAZ', 'HATA']
  const eslesmeHam = String(body?.eslesme?.durum ?? '').trim().toUpperCase()
  const eslesme = ESLESME_DURUMLARI.includes(eslesmeHam) ? eslesmeHam : undefined
  const eslesmeNot = body?.eslesme?.not ? String(body.eslesme.not).slice(0, 1000) : eslesme ? null : undefined

  // durum + finansal snapshot + eşleşme. uyapSenkronAt bulunamayan dosyada da damgalanır:
  // "kontrol edildi" demektir — hedef penceresi ve sağlık bekçisi buna göre çalışır.
  // İSTİSNA: yalnız masraf taşıyan gönderi (Ödeme İşlemlerim taraması) damga ATMAZ — dosya
  // artımlı senkron penceresinden düşmesin (olay/evrak senkronu gecikmesin).
  const yalnizMasraf = !body?.durum && !body?.hesap && !Array.isArray(body?.olaylar) && !eslesme && Array.isArray(body?.masraflar)
  await prisma.rucuDosyasi.update({
    where: { id: dosya.id },
    data: {
      uyapDurum: body?.durum ? String(body.durum).slice(0, 80) : undefined,
      uyapSenkronAt: yalnizMasraf ? undefined : new Date(),
      uyapHesapJson: body?.hesap && typeof body.hesap === 'object' ? (body.hesap as Prisma.InputJsonValue) : undefined,
      uyapEslesme: eslesme,
      uyapEslesmeNot: eslesmeNot,
    },
  })

  // yeni olaylar (tip+tarih+açıklama tekrarını atla) — hukuki sıraya göre (tarih artan; tarihsizler sonda)
  const kip = uyapOlayDurumKipi()
  const adayKipi = eksenAcik()
  let eklenen = 0
  let yeniAday = 0
  let birlesenKaynak = 0
  // Eklentinin dosya düzeyindeki yapısal tebliğ özeti ("Tebliğ (UYAP)") aynı günlü bir tebliğ evrakının kopyasıdır:
  // aynı gün başka tebliğ olayı varsa ondan AYRICA aday açılmaz (tek tebligata iki kart çıkmasın). Aynı gün
  // içinde yapısal özet en sona alınır.
  const yapisalTeblig = (o: { tip?: string; aciklama?: string } | undefined) => o?.tip === 'TEBLIG' && String(o?.aciklama ?? '').trim() === YAPISAL_TEBLIG_ACIKLAMA
  const olaylar = (Array.isArray(body?.olaylar) ? body!.olaylar! : [])
    .map((o, sira) => ({ o, sira, t: tarihParse(o?.tarih) }))
    .sort((a, b) => (a.t && b.t ? a.t.getTime() - b.t.getTime() : a.t ? -1 : b.t ? 1 : 0) || Number(yapisalTeblig(a.o)) - Number(yapisalTeblig(b.o)) || a.sira - b.sira)
  const partiTebligGunleri = new Set(olaylar.filter((x) => x.o?.tip === 'TEBLIG' && !yapisalTeblig(x.o) && x.t).map((x) => isoGun(x.t)))
  for (const { o, t: tarih } of olaylar) {
    const hamTip = String(o?.tip ?? '').trim().slice(0, 40)
    if (!hamTip) continue
    // Beyaz liste: eklentiden gelen serbest tip DB'yi kirletmesin — bilinmeyen tip 'DURUM'a katlanır,
    // orijinali hamJson'da saklanır (OLAY_DURUM lookup'ı ve rozetler tanımlı tiplerle çalışır).
    // Evrak adından gelen TAHSILAT tahsilat DEĞİLDİR (K1): etiketli DURUM'a katlanır, hiçbir toplama girmez.
    const tahsilatSinyali = hamTip === 'TAHSILAT'
    const tip: OlayTip = tahsilatSinyali ? 'DURUM' : (OLAY_TIPLERI as readonly string[]).includes(hamTip) ? (hamTip as OlayTip) : 'DURUM'
    const hamAciklama = o?.aciklama ? String(o.aciklama).slice(0, 2000) : null
    const aciklama = tahsilatSinyali ? `${TAHSILAT_SINYALI_ETIKET} · ${hamAciklama ?? ''}`.slice(0, 2000) : hamAciklama
    // Tekrar: aynı olay yeni biçimde ya da (katlanan TAHSILAT için) eski biçimde yazılmış olabilir
    const mevcut = await prisma.takipOlayi.findFirst({
      where: tahsilatSinyali
        ? { dosyaId: dosya.id, tarih, OR: [{ tip: 'DURUM', aciklama }, { tip: 'TAHSILAT', aciklama: hamAciklama }] }
        : { dosyaId: dosya.id, tip, tarih, aciklama },
      select: { id: true },
    })
    if (mevcut) continue

    let adayKolon: AdayKolonlari | undefined
    let birlesti = false
    if (adayKipi) {
      const a = eklentiOlayiniSinifla({ tip: hamTip, aciklama: hamAciklama, tarih })
      const tekilAnahtar = adayTekilAnahtar({ altTip: a.altTip, hukukiTarih: a.hukukiTarih, metin: hamAciklama, olayTarihi: tarih })
      const ayniAday = await prisma.takipOlayi.findFirst({ where: { dosyaId: dosya.id, tekilAnahtar }, select: { id: true } })
      const yapisalKopya = yapisalTeblig(o) && !!tarih && (
        partiTebligGunleri.has(isoGun(tarih)) ||
        !!(await prisma.takipOlayi.findFirst({ where: { dosyaId: dosya.id, altTip: { in: ['TEBLIG_SONUCU', 'TEBLIG_IADE'] }, hukukiTarih: tarih, teyit: { not: null } }, select: { id: true } }))
      )
      if (!ayniAday && !yapisalKopya) {
        // S15 birleştirme: UYAP aynı olayı birden çok yerde (safahat + evrak listesi + tensip zaptı) FARKLI
        // metinle gösterir → tekilAnahtar (metin hash'i) her seferinde farklı çıkar. Grup anahtarı (dosya+altTip+
        // hukuki gün) bunu yakalar: eşleşme varsa YENİ SATIR AÇILMAZ, ek kaynak var olan karta eklenir.
        const birlesecekId = await birlesecekAdayIdBul({ dosyaId: dosya.id, altTip: a.altTip, hukukiTarih: a.hukukiTarih })
        if (birlesecekId) {
          birlesti = true
          if (await adayaKaynakEkle(birlesecekId, { aciklama: hamAciklama, kaynakTuru: a.kaynakTuru, kaynakBelgeId: null, tekilAnahtar })) birlesenKaynak++
        } else {
          adayKolon = {
            altTip: a.altTip, teyit: 'ADAY', kaynakTuru: a.kaynakTuru, kural: a.kural, hukukiTarih: a.hukukiTarih,
            sonuc: a.sonuc, tebligSekli: a.tebligSekli, muhatap: a.muhatap, tekilAnahtar,
          }
        }
      }
    }
    if (birlesti) continue // ek kaynak var olan karta eklendi (aday-birlestir.ts) — yeni satır açılmadı
    const hamJson = { kaynak: 'uyap', ...(tip !== hamTip ? { hamTip } : {}), ...(tahsilatSinyali ? { kaynakTip: 'TAHSILAT' } : {}) }
    try {
      // Tarih UYDURULMAZ: tarihsiz olay tarihsiz kaydedilir ("bugün" yazılmaz).
      await takipOlayKaydet(dosya.id, k.userId ?? null, { tip, tarih, tutar: dec(o?.tutar), aciklama, hamJson: hamJson as Prisma.InputJsonValue, aday: adayKolon }, { kip })
      eklenen++
      if (adayKolon) yeniAday++
    } catch (e) {
      // Eşzamanlı ikinci senkron aynı adayı açtı (tekil anahtar) — olay orada kayıtlı; sessiz geç.
      if (!tekilIhlaliMi(e)) throw e
    }
  }

  if (adayKipi) {
    // 1) Durum metni itiraz diyorsa: tarihsiz DURDURMA_ITIRAZ adayı (dosya başına tek) — itirazın BİRİNCİ sinyali.
    const hesapObj = body?.hesap && typeof body.hesap === 'object' ? body.hesap : null
    const durumMetni = String((hesapObj?.durumMetni as string | undefined) ?? body?.durum ?? '').slice(0, 300)
    if (durumMetniItirazMi(durumMetni) || durumMetniItirazMi(hesapObj?.asama)) {
      const varOlan = await prisma.takipOlayi.findFirst({ where: { dosyaId: dosya.id, tekilAnahtar: DURUM_METNI_ITIRAZ_ANAHTARI }, select: { id: true } })
      if (!varOlan) {
        const a = durumMetniItirazAdayi()
        try {
          await prisma.$transaction([
            prisma.takipOlayi.create({
              data: {
                dosyaId: dosya.id, tip: 'DURUM', tarih: null, aciklama: 'İtiraz sinyali (UYAP durum metni) — tarih teyit gerekli',
                altTip: a.altTip, teyit: 'ADAY', kaynakTuru: a.kaynakTuru, kural: a.kural, hukukiTarih: null,
                tekilAnahtar: DURUM_METNI_ITIRAZ_ANAHTARI, hamJson: { kaynak: 'uyap', durumMetni } as Prisma.InputJsonValue,
              },
            }),
            prisma.aktivite.create({ data: { dosyaId: dosya.id, eylem: 'İtiraz sinyali (UYAP durum metni), tarih teyit gerekli' } }),
          ])
          yeniAday++
        } catch (e) {
          if (!tekilIhlaliMi(e)) throw e
        }
      }
    }

    // 2) Tahsilat kuralı: UYAP "Yatan Para" artışı → fark kadar TAHSILAT_BORCLUDAN adayı (06 §2(j)). Azalış → not.
    if (hesapObj) {
      const f = yatanParaFarki(dosya.uyapHesapJson, hesapObj)
      if (f?.tur === 'ARTIS') {
        try {
          await prisma.takipOlayi.create({
            data: {
              dosyaId: dosya.id, tip: 'DURUM', tarih: new Date(), tutar: new Prisma.Decimal(f.fark), aciklama: tahsilatAdayMetni(f),
              altTip: 'TAHSILAT_BORCLUDAN', teyit: 'ADAY', kaynakTuru: 'UYAP_YAPISAL', kural: 'UY-YATAN-PARA@1', hukukiTarih: null,
              tekilAnahtar: tahsilatTekilAnahtar(f.onceki, f.yeni),
              hamJson: { kaynak: 'uyap', yatanPara: { onceki: f.onceki, yeni: f.yeni, ilkGorunum: f.ilkGorunum } } as Prisma.InputJsonValue,
            },
          })
          yeniAday++
        } catch (e) {
          if (!tekilIhlaliMi(e)) throw e
        }
      } else if (f?.tur === 'AZALIS') {
        await prisma.aktivite.create({ data: { dosyaId: dosya.id, eylem: `UYAP "Yatan Para" toplamı azaldı (${f.onceki} → ${f.yeni}); tahsilat kaydını kontrol edin` } })
      }
    }

    // 3) Okunmuş mazbatalar adayları zenginleştirir; 4) eksenler gölge yazılır. Hata senkronu bozmaz.
    try {
      await mazbataAdaylariniIsle(dosya.id)
    } catch (e) {
      console.error('mazbata adayları:', (e as Error).message)
    }
    try {
      const son = await prisma.rucuDosyasi.findUnique({ where: { id: dosya.id }, select: { durum: true } })
      await eksenYenidenHesapla(dosya.id, {
        sebep: 'UYAP senkronu',
        eskiDurum: son && son.durum !== dosya.durum ? { eski: dosya.durum, yeni: son.durum, sebep: `UYAP olayı (${kip} kip)` } : null,
      })
    } catch (e) {
      console.error('eksen hesabı:', (e as Error).message)
    }
  }

  // v1: yapılandırılmış masraf kalemleri (UYAP hesap/tahsilat ekranından — PDF okumadan kesin veri).
  // Dedup: @@unique([dosyaId, kaynakRef]); kaynakRef = UYAPH|makbuzNo|tarih|tutar (içerik-temelli).
  // CİNS: ham ad, 63-kalem sözlüğüne + tenant'ın öğrettiği eşlemelere (masrafEslestirJson) bağlanır —
  // PDF hattıyla aynı yol; öğretilen eşleme ("16" → Vekalet Harcı gibi) burada da geçerli.
  let masrafEklenen = 0
  const masraflar = Array.isArray(body?.masraflar) ? body!.masraflar! : []
  let ogrenilen: ReturnType<typeof ogrenilenMap> | undefined
  if (masraflar.length) {
    const ayar = await prisma.ayarlar.findUnique({ where: { musteriId: dosya.musteriId }, select: { masrafEslestirJson: true } })
    ogrenilen = ogrenilenMap(ayar?.masrafEslestirJson ?? null)
  }
  for (const m of masraflar.slice(0, 200)) {
    const tutar = Number(m?.tutar)
    if (!Number.isFinite(tutar) || tutar <= 0) continue
    const tarih = tarihParse(m?.tarih)
    const ad = String(m?.ad ?? '').trim().slice(0, 200) || null
    const makbuzNo = String(m?.makbuzNo ?? '').trim().slice(0, 60) || null
    const { cins, guven } = cinsEslesti(ad, ogrenilen)
    const kaynakRef = `UYAPH|${makbuzNo ?? ''}|${tarih ? tarih.toISOString().slice(0, 10) : ''}|${Math.round(tutar * 100)}`.slice(0, 190)
    try {
      await prisma.masraf.create({
        data: {
          dosyaId: dosya.id, tutar: new Prisma.Decimal(Math.round(tutar * 100) / 100), tarih,
          cinsHam: ad, cins, cinsGuven: cins ? guven : null, makbuzNo, taraf: 'BIZ', kaynak: 'UYAP_HESAP', kaynakRef,
        },
      })
      masrafEklenen++
    } catch (e) {
      // P2002 = aynı kalem zaten var (dedup) — sessiz geç; başka hata masraf dışı akışı bozmasın
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) console.error('uyap masraf yazımı:', (e as Error).message)
    }
  }

  return corsJson({ ok: true, dosyaId: dosya.id, yeniOlay: eklenen, yeniAday, birlesenKaynak, yeniMasraf: masrafEklenen }, 200, req)
}
