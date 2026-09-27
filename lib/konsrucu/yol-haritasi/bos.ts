/**
 * KonsRücü — Dosya Yol Haritası · boş gerçekler · lib/konsrucu/yol-haritasi/bos.ts (saf; client-safe)
 *
 * Hiç verisi olmayan yeni bir dosyanın `Gercekler`'i. Motorun tablo güdümlü testleri kurgusal dosyayı buradan
 * başlatır; ekran da "henüz hesaplanmadı" iskeleti için kullanabilir. Kişisel veri içermez.
 */
import type { Gercekler } from './tipler'

export function bosGercekler(dosyaId = 'dosya-kurgu', olusturma: Date = new Date('2026-01-01T09:00:00Z')): Gercekler {
  return {
    dosya: {
      id: dosyaId, hukukDosyaNo: null, muvekkilAd: 'Ray Sigorta A.Ş.', durum: 'INCELENIYOR', yol: null, yolGuven: null, yolNeden: null, yolOnayAt: null,
      icraEksen: null, arabEksen: null, davaEksen: null, eksenTeyit: { icra: null, arab: null, dava: null }, onarimDurumu: null, onarimBekleyen: 0,
      rucuSebebiKod: null, zamanasimi: null, yetkiliIcra: null, icraDairesi: null, icraDosyaNo: null, takipTarihi: null,
      uyapDurum: null, uyapSenkronAt: null, uyapEslesme: null, uyapEslesmeNot: null, rucuTutari: null, asilAlacak: null, uyapTahsilat: null,
      kapanisSebebi: null, kapanisAt: null, eskiOnay: null, tevzi: null, createdAt: olusturma,
    },
    ayar: { alacakliUnvanVar: true, mersisVar: true, vekaletnameVar: true },
    belgeler: [], odemeler: [], borclular: [], olaylar: [], alanlar: [], takipTalebi: null, sureler: [], senkronIsleri: [], nabiz: null,
    arabuluculuk: null, etkinlikler: [], yolSecimleri: [], onayKayitlari: [], davalar: [], davaIslemleri: [], dilekceler: [], taksitPlanlari: [],
    ertelemeler: [], zorunluEvrak: null, kesimTarihi: null,
  }
}
