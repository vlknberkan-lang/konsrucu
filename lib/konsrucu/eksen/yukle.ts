/**
 * KonsRücü — Tebliğ-itiraz paneli ve gölge eksen YÜKLEYİCİSİ · lib/konsrucu/eksen/yukle.ts (server, salt-okur)
 *
 * Bağlanacak sayfa (Dosya Yol Haritası ya da eski dosya detayı) bu fonksiyonları çağırıp sonucu
 * components/dosya/olay/* bileşenlerine verir. Kapsam: dosya yalnız verilen müvekkilde aranır (M7).
 * Eksen her çağrıda TAZE türetilir (önbellek bayrak kapalıyken güncellenmez; ekran onaylı olguyla tutarlı kalsın).
 * Hiçbir kayıt yazmaz.
 */
import { prisma } from '@/lib/prisma'
import { eksenGirdisiYukle } from './kaydet'
import { eksenTuret, type EksenSonuc } from './turet'
import { golgeEksen, olayPaneli, type GolgeEksenVM, type OlayPaneliVM, type PanelBelge } from './gorunum'
import { mazbataBelgesiMi } from './mazbata'

/** Dosyanın gölge ekseni (künyedeki "Yeni hesap" satırı için). Dosya bu müvekkilde değilse null. */
export async function golgeEksenYukle(dosyaId: string, musteriId: string): Promise<(GolgeEksenVM & { hesapAt: string | null }) | null> {
  const d = await prisma.rucuDosyasi.findFirst({ where: { id: dosyaId, musteriId }, select: { id: true, durum: true, eksenHesapAt: true } })
  if (!d) return null
  const g = await eksenGirdisiYukle(d.id)
  if (!g) return null
  return { ...golgeEksen(eksenTuret(g), d.durum), hesapAt: d.eksenHesapAt ? d.eksenHesapAt.toISOString() : null }
}

/** Tebliğ ve itiraz paneli (borçlu blokları + gelişme kartları). Dosya bu müvekkilde değilse null. */
export async function olayPaneliYukle(dosyaId: string, musteriId: string, bugun: Date = new Date()): Promise<OlayPaneliVM | null> {
  const d = await prisma.rucuDosyasi.findFirst({
    where: { id: dosyaId, musteriId },
    select: {
      id: true,
      borclular: {
        orderBy: { adUnvan: 'asc' },
        select: {
          id: true, adUnvan: true, tur: true,
          takip: {
            select: {
              id: true, updatedAt: true, silindiAt: true, tebligTarihi: true, tebligSekli: true, tebligSonucu: true, uetsUlasmaTarihi: true,
              itirazVar: true, itirazVerilisTarihi: true, itirazUyapTarihi: true, itirazTipi: true, itirazKapsamJson: true,
              itirazEdilenTutar: true, itirazAlacakliyaTebligTarihi: true, itirazAlacakliyaTebligKaynak: true,
            },
          },
        },
      },
      olaylar: {
        where: { teyit: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 150,
        select: {
          id: true, tip: true, altTip: true, teyit: true, borcluId: true, hukukiTarih: true, tarih: true, sonuc: true, tebligSekli: true,
          muhatap: true, kaynakBelgeId: true, kaynakTuru: true, kural: true, aciklama: true, tutar: true, createdAt: true, teyitAt: true, hamJson: true,
        },
      },
      belgeler: {
        where: { silindiAt: null, extractedText: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { id: true, dosyaAdi: true, belgeTarihi: true, altTur: true, uyapEvrakTuru: true, metinYontemi: true, metinGuven: true },
      },
    },
  })
  if (!d) return null
  // Metin yalnız mazbata gibi görünen belgeler için okunur (tüm evrak metnini belleğe almamak için).
  const adaylar = d.belgeler.filter(mazbataBelgesiMi).slice(0, 30)
  const metinler = adaylar.length
    ? await prisma.belge.findMany({ where: { id: { in: adaylar.map((b) => b.id) }, dosyaId: d.id }, select: { id: true, extractedText: true } })
    : []
  const belgeler: PanelBelge[] = adaylar.map((b) => ({ ...b, extractedText: metinler.find((m) => m.id === b.id)?.extractedText ?? null }))
  let eksen: EksenSonuc | null = null
  const g = await eksenGirdisiYukle(d.id)
  if (g) eksen = eksenTuret(g)
  return olayPaneli({
    dosyaId: d.id,
    borclular: d.borclular.map((b) => ({
      id: b.id, adUnvan: b.adUnvan, tur: b.tur,
      takip: b.takip && !b.takip.silindiAt
        ? { ...b.takip, itirazEdilenTutar: b.takip.itirazEdilenTutar != null ? Number(b.takip.itirazEdilenTutar) : null }
        : null,
    })),
    olaylar: d.olaylar.map((o) => ({ ...o, tutar: o.tutar != null ? Number(o.tutar) : null })),
    belgeler,
    eksen,
    bugun,
  })
}
