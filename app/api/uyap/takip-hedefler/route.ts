/**
 * KonsRücü — Takip Aç Kopilotu · GET /api/uyap/takip-hedefler
 * Eklentiye "UYAP'ta takibi AÇILABİLECEK" dosyaların tam yükünü verir: TAKIBE_HAZIR + avukat onaylı
 * + henüz icra no'suz + tevzi edilmemiş. Eklenti bu yükle UYAP takip açma sihirbazının payload'ını
 * kurar (keşif kaydı 2026-07-06: icra_harc_hesaplama_islemleri + icra_takip_tevzi_islemleri).
 *
 * EMNİYET: eksik/teyitsiz alanlı dosya da listede döner ama `engeller[]` doluysa eklenti "Hazırla"yı
 * KAPATIR — avukat neyin eksik olduğunu görür, sessizce atlanmaz. Tenant-kapsamlı (Bearer).
 *
 * S21 (B04, B10, B26): anapara, işlemiş faiz ve FAİZ SEÇİMİ geçerli TakipTalebi'nden gelir (`faiz` alanı).
 * Faiz türü, oranı ve başlangıcı avukat seçmeden, rücu tutarı hesap izi onaylanmadan kopilot KİLİTLİDİR.
 * Faiz seçimini UYAP'a yalnız eklenti 2.0 aktarır: 1.9 ("Adi Kanuni Faiz" + "%......" yazar) bu uçtan
 * dosya alamaz — listede görür ama "eklentiyi güncelleyin" engeliyle.
 * Önizleme (program) ile kopilot AYNI hesabı kullanır: lib/konsrucu/senkron/takip-talebi.ts.
 */
import { prisma } from '@/lib/prisma'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'
import { footerOlustur, aciklamaTam } from '@/lib/konsrucu/takip'
import { oranlariOku, sonDekontTarihi, type DekontGirdi } from '@/lib/konsrucu/faiz'
import { yetkiliIcraOner } from '@/lib/konsrucu/adli-rehber'
import { ilPlakaKodu } from '@/lib/konsrucu/il-plaka'
import { istekSurumu, KOPILOT_FAIZ_SURUMU, surumEnAz } from '@/lib/konsrucu/senkron/ozellikler'
import {
  faizTalepMetni, kopilotFaizDestekli, takipAlacakHesapla, takipIsoGun, takipTalebiKilitSebepleri, type FaizSecimi,
} from '@/lib/konsrucu/senkron/takip-talebi'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return preflight(req)
}

type Cikarim = { aciklama?: string | null; onay?: { ok?: boolean }; tevzi?: unknown }
type HesapIziJson = { onay?: { kullaniciId?: string; at?: string } | null } | null

/** Bugünün İstanbul günü (YYYY-MM-DD). */
const bugunIst = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)

export async function GET(req: Request) {
  const k = await uyapKimlik(req)
  if (!k) return corsJson({ ok: false, error: 'unauthorized' }, 401, req)
  const faizAktarabilir = surumEnAz(istekSurumu(req), KOPILOT_FAIZ_SURUMU)

  // DİKKAT: durum alanı hiçbir akışta TAKIBE_HAZIR'a ÇEKİLMİYOR — "Takibe Hazır" detay sayfasında
  // canlı hesaplanan görünümdür (checkler + avukat onayı), DB'de dosya INCELENIYOR kalır.
  // Bu yüzden filtre durum=TAKIBE_HAZIR DEĞİL; asıl kapı avukat onayı (cikarimJson.onay.ok, aşağıda).
  const dosyalar = await prisma.rucuDosyasi.findMany({
    where: { musteriId: { in: k.izinli }, durum: { in: ['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR'] }, icraDosyaNo: null },
    select: {
      id: true, musteriId: true, hukukDosyaNo: true, hasarDosyaNo: true,
      rucuTutari: true, asilAlacak: true, faizTutari: true, faizBaslangic: true, faizBitis: true,
      kazaTarihi: true, hasarTarihi: true, kazaYeri: true, il: true, yetkiliIcra: true,
      sigortaliPlaka: true, karsiPlaka: true, cikarimJson: true,
      borclular: { select: { adUnvan: true, tcVkn: true, rol: true, teyitDurumu: true } },
      odemeler: { select: { tarih: true, tutar: true, haricMi: true } },
      belgeler: { select: { kategori: true } },
      takipTalepleri: {
        where: { gecerli: true, silindiAt: null },
        take: 1,
        select: {
          id: true, surum: true, asilAlacak: true, islemisFaiz: true, faizTuru: true, faizOraniMetni: true,
          faizBaslangicTuru: true, faizBaslangic: true, hesapIziJson: true, dondurulduAt: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })

  const musteriIds = [...new Set(dosyalar.map((d) => d.musteriId))]
  const ayarlarList = musteriIds.length
    ? await prisma.ayarlar.findMany({
        where: { musteriId: { in: musteriIds } },
        select: { musteriId: true, alacakliUnvan: true, mersis: true, davaciVkn: true, iban: true, vekilAd: true, vekilBaro: true, vekilAdres: true, aciklamaFooter: true, faizJson: true },
      })
    : []
  const ayarMap = new Map(ayarlarList.map((a) => [a.musteriId, a]))

  const hedefler = []
  for (const d of dosyalar) {
    const cj = (d.cikarimJson ?? {}) as Cikarim
    if (!cj.onay?.ok) continue // avukat onayı yoksa kopilota hiç düşmez (Takip Aç kapısıyla aynı kural)
    if (cj.tevzi) continue // zaten tevzi edilmiş (harç ödemesi/esas no bekliyor) — çift açma koruması
    const tt = d.takipTalepleri[0] ?? null
    if (tt?.dondurulduAt) continue // takip talebi tevzide donduruldu — çift açma koruması
    const ay = ayarMap.get(d.musteriId)

    // ── faiz seçimi (varsayılan YOK) ──
    const faiz: FaizSecimi | null = tt
      ? { faizTuru: tt.faizTuru, faizOraniMetni: tt.faizOraniMetni, faizBaslangicTuru: tt.faizBaslangicTuru, faizBaslangic: tt.faizBaslangic }
      : null

    // ── alacak: TakipTalebi varsa oradan; yoksa eski kolonlar (bilgi amaçlı — dosya zaten kilitli) ──
    const dekontlar: DekontGirdi[] = d.odemeler.map((o) => ({ tarih: o.tarih ? o.tarih.toISOString().slice(0, 10) : null, tutar: o.tutar != null ? Number(o.tutar) : 0, haricMi: o.haricMi }))
    const anapara = tt ? Number(tt.asilAlacak) : d.rucuTutari != null ? Number(d.rucuTutari) : d.asilAlacak != null ? Number(d.asilAlacak) : 0
    // UYAP "alacak tarihi": tek tarih seçildiyse o; "her ödeme tarihinden" seçildiyse son ödeme tarihi (ihtiyatlı —
    // hiçbir ödeme için fazla faiz istenmez). Eski yol: elle girilen faizBaslangic, yoksa son dekont.
    const faizBas = tt?.faizBaslangicTuru === 'TEK_TARIH'
      ? takipIsoGun(tt.faizBaslangic)
      : tt ? sonDekontTarihi(dekontlar) : d.faizBaslangic ? d.faizBaslangic.toISOString().slice(0, 10) : null
    const alacak = takipAlacakHesapla({
      anapara,
      islemisFaizElle: tt?.islemisFaiz != null ? Number(tt.islemisFaiz) : d.faizTutari != null ? Number(d.faizTutari) : null,
      dekontlar,
      faizBaslangic: faizBas,
      faizBitis: d.faizBitis ? d.faizBitis.toISOString().slice(0, 10) : null,
      oranlar: oranlariOku(ay?.faizJson),
      bugun: bugunIst(),
    })

    // ── yetkili adliye: kaza yeri ilçesinden (HMK m.16) — tevzi DAİREYİ adliye içinde kendisi atar ──
    const adli = yetkiliIcraOner(d.kazaYeri, d.il)
    const ilAdi = adli?.il ?? d.il ?? null
    const ilKodu = ilPlakaKodu(ilAdi)

    const aciklama = aciklamaTam(cj.aciklama, footerOlustur(ay))

    // ── pre-flight engelleri: engel varken eklenti bu dosyayı GÖNDEREMEZ (listede görünür, nedeni yazar) ──
    const engeller: string[] = []
    if (!faizAktarabilir) engeller.push("Eklentiyi 2.0 sürümüne güncelleyin: faiz seçimini UYAP'a yalnız 2.0 aktarır")
    const hesapIziOnayli = !!(tt?.hesapIziJson as HesapIziJson)?.onay?.at
    for (const s of takipTalebiKilitSebepleri(tt ? { ...faiz!, asilAlacak: anapara, hesapIziOnayli, dondurulduAt: tt.dondurulduAt } : null)) engeller.push(s)
    if (faiz && faizTalepMetni(faiz) && !kopilotFaizDestekli(faiz)) engeller.push("Bu faiz seçimi kopilotla aktarılamıyor (UYAP kodu keşifle teyit edilmedi) — takibi UYAP'ta elle açın, faiz türünü elle seçin")
    if (!d.borclular.length) engeller.push('borçlu yok')
    for (const b of d.borclular) {
      const tc = (b.tcVkn ?? '').replace(/\D/g, '')
      if (!tc) engeller.push(`${b.adUnvan}: TC/VKN eksik`)
      else if (tc.length === 10) engeller.push(`${b.adUnvan}: kurum borçlu (VKN) — v1 desteklemiyor, manuel aç`)
      else if (tc.length !== 11) engeller.push(`${b.adUnvan}: TC 11 hane değil`)
      if (b.teyitDurumu !== 'TEYIT_EDILDI') engeller.push(`${b.adUnvan}: borçlu teyitli değil (${b.teyitDurumu})`)
    }
    if (!tt && !(anapara > 0)) engeller.push('anapara (asıl alacak) yok')
    if (!alacak.faizBaslangic) engeller.push('faiz başlangıcı yok (dekont tarihi eksik)')
    if (alacak.islemisFaiz == null && alacak.uyari) engeller.push(alacak.uyari)
    if (!aciklama.trim()) engeller.push('takip açıklaması yok')
    if (!ay?.mersis) engeller.push('alacaklı MERSİS tanımsız (Şirket Bilgileri)')
    if (!ay?.alacakliUnvan) engeller.push('alacaklı ünvanı tanımsız (Şirket Bilgileri)')
    if (!adli) engeller.push(`yetkili adliye çözülemedi (kaza yeri: ${d.kazaYeri ?? '—'})`)
    if (adli && ilKodu == null) engeller.push(`il plaka kodu çözülemedi (${ilAdi ?? '—'})`)

    // ── uyarılar: gönderime MANİ DEĞİL, özet ekranında sarı gösterilir ──
    // Evrak (poliçe/dekont/tutanak) UYAP tevzisi için yüklenmiyor ve zorunlu değil; ama borçlu
    // itiraz ederse ispat bunlarla yapılır — eksikse avukat bilerek göndersin.
    const uyarilar: string[] = []
    const katSet = new Set(d.belgeler.map((b) => b.kategori))
    const evrakEksik = ['POLICE', 'DEKONT', 'TUTANAK'].filter((x) => !katSet.has(x as never))
    if (evrakEksik.length) uyarilar.push(`dosyada eksik evrak: ${evrakEksik.join(', ')} — itiraz halinde ispat için tamamlanmalı`)
    if (tt?.faizBaslangicTuru === 'HER_ODEMEDEN' && tt.islemisFaiz == null && dekontlar.filter((x) => !x.haricMi).length > 1) {
      uyarilar.push('işlemiş faiz son ödeme tarihinden hesaplandı (ihtiyatlı); her ödemenin kendi tarihinden hesabı K1 teyidi bekliyor')
    }

    hedefler.push({
      id: d.id,
      hukukDosyaNo: d.hukukDosyaNo,
      hasarDosyaNo: d.hasarDosyaNo,
      alacakli: {
        unvan: ay?.alacakliUnvan ?? null,
        mersis: ay?.mersis ?? null,
        vergiNo: ay?.davaciVkn ?? null,
        iban: ay?.iban ?? null,
      },
      borclular: d.borclular.map((b) => ({ adUnvan: b.adUnvan, tc: (b.tcVkn ?? '').replace(/\D/g, ''), rol: b.rol })),
      alacak: {
        anapara: alacak.anapara,
        islemisFaiz: alacak.islemisFaiz ?? 0,
        toplam: alacak.toplam ?? alacak.anapara,
        faizBaslangic: alacak.faizBaslangic, // YYYY-MM-DD — UYAP "alacak tarihi" (eklenti GG/AA/YYYY'ye çevirir)
      },
      // S21: programdaki seçim; eklenti 2.0 faizBilgileri ve dosyaAciklama_48_4'ü bundan kurar ve talepMetni ile karşılaştırır
      faiz: faiz
        ? {
            faizTuru: faiz.faizTuru, faizOraniMetni: faiz.faizOraniMetni, faizBaslangicTuru: faiz.faizBaslangicTuru,
            faizBaslangic: takipIsoGun(faiz.faizBaslangic), talepMetni: faizTalepMetni(faiz),
          }
        : null,
      takipTalebi: tt ? { id: tt.id, surum: tt.surum } : null,
      kazaTarihi: d.kazaTarihi ? d.kazaTarihi.toISOString().slice(0, 10) : d.hasarTarihi ? d.hasarTarihi.toISOString().slice(0, 10) : null,
      kazaYeri: d.kazaYeri ?? null,
      adliye: adli ? { ad: adli.adliye, il: ilAdi, ilKodu } : null,
      aciklama,
      engeller,
      uyarilar,
    })
  }

  return corsJson({ ok: true, sayi: hedefler.length, hedefler }, 200, req)
}
