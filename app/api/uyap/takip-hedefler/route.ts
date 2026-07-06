/**
 * KonsRücü — Takip Aç Kopilotu (Faz 1) · GET /api/uyap/takip-hedefler
 * Eklentiye "UYAP'ta takibi AÇILABİLECEK" dosyaların tam yükünü verir: TAKIBE_HAZIR + avukat onaylı
 * + henüz icra no'suz + tevzi edilmemiş. Eklenti bu yükle UYAP takip açma sihirbazının payload'ını
 * kurar (keşif kaydı 2026-07-06: icra_harc_hesaplama_islemleri + icra_takip_tevzi_islemleri).
 *
 * EMNİYET: eksik/teyitsiz alanlı dosya da listede döner ama `engeller[]` doluysa eklenti "Hazırla"yı
 * KAPATIR — avukat neyin eksik olduğunu görür, sessizce atlanmaz. Tenant-kapsamlı (Bearer).
 */
import { prisma } from '@/lib/prisma'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'
import { footerOlustur, aciklamaTam } from '@/lib/konsrucu/takip'
import { faizHesapla, oranlariOku, sonDekontTarihi, type DekontGirdi } from '@/lib/konsrucu/faiz'
import { yetkiliIcraOner } from '@/lib/konsrucu/adli-rehber'
import { ilPlakaKodu } from '@/lib/konsrucu/il-plaka'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return preflight()
}

type Cikarim = { aciklama?: string | null; onay?: { ok?: boolean }; tevzi?: unknown }

export async function GET(req: Request) {
  const k = await uyapKimlik(req)
  if (!k) return corsJson({ ok: false, error: 'unauthorized' }, 401)

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
    const ay = ayarMap.get(d.musteriId)

    // ── alacak: anapara = rücu tutarı (kusur payı); işlemiş faiz = elle override ?? dönemsel hesap ──
    const anapara = d.rucuTutari != null ? Number(d.rucuTutari) : d.asilAlacak != null ? Number(d.asilAlacak) : 0
    const dekontlar: DekontGirdi[] = d.odemeler.map((o) => ({ tarih: o.tarih ? o.tarih.toISOString().slice(0, 10) : null, tutar: o.tutar != null ? Number(o.tutar) : 0, haricMi: o.haricMi }))
    const faizBas = d.faizBaslangic ? d.faizBaslangic.toISOString().slice(0, 10) : sonDekontTarihi(dekontlar)
    const faizBit = d.faizBitis ? d.faizBitis.toISOString().slice(0, 10) : new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10) // bugün (TR günü)
    const hesap = anapara > 0 && faizBas ? faizHesapla(anapara, new Date(faizBas), new Date(faizBit), oranlariOku(ay?.faizJson)) : null
    const islemisFaiz = d.faizTutari != null ? Number(d.faizTutari) : hesap ? hesap.faiz : 0

    // ── yetkili adliye: kaza yeri ilçesinden (HMK m.16) — tevzi DAİREYİ adliye içinde kendisi atar ──
    const adli = yetkiliIcraOner(d.kazaYeri, d.il)
    const ilAdi = adli?.il ?? d.il ?? null
    const ilKodu = ilPlakaKodu(ilAdi)

    const aciklama = aciklamaTam(cj.aciklama, footerOlustur(ay))

    // ── pre-flight engelleri: engel varken eklenti bu dosyayı GÖNDEREMEZ (listede görünür, nedeni yazar) ──
    const engeller: string[] = []
    if (!d.borclular.length) engeller.push('borçlu yok')
    for (const b of d.borclular) {
      const tc = (b.tcVkn ?? '').replace(/\D/g, '')
      if (!tc) engeller.push(`${b.adUnvan}: TC/VKN eksik`)
      else if (tc.length === 10) engeller.push(`${b.adUnvan}: kurum borçlu (VKN) — v1 desteklemiyor, manuel aç`)
      else if (tc.length !== 11) engeller.push(`${b.adUnvan}: TC 11 hane değil`)
      if (b.teyitDurumu !== 'TEYIT_EDILDI') engeller.push(`${b.adUnvan}: borçlu teyitli değil (${b.teyitDurumu})`)
    }
    if (!(anapara > 0)) engeller.push('anapara (rücu tutarı) yok')
    if (!faizBas) engeller.push('faiz başlangıcı yok (dekont tarihi eksik)')
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
        anapara: Math.round(anapara * 100) / 100,
        islemisFaiz: Math.round(islemisFaiz * 100) / 100,
        toplam: Math.round((anapara + islemisFaiz) * 100) / 100,
        faizBaslangic: faizBas, // YYYY-MM-DD — UYAP "alacak tarihi" (eklenti GG/AA/YYYY'ye çevirir)
      },
      kazaTarihi: d.kazaTarihi ? d.kazaTarihi.toISOString().slice(0, 10) : d.hasarTarihi ? d.hasarTarihi.toISOString().slice(0, 10) : null,
      kazaYeri: d.kazaYeri ?? null,
      adliye: adli ? { ad: adli.adliye, il: ilAdi, ilKodu } : null,
      aciklama,
      engeller,
      uyarilar,
    })
  }

  return corsJson({ ok: true, sayi: hedefler.length, hedefler })
}
