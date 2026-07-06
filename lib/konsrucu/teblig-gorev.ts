/**
 * KonsRücü — Tebliğ sonrası YASAL SÜRE görevleri · lib/konsrucu/teblig-gorev.ts (server)
 *
 * Ödeme emri TEBLİĞ olayı kaydedilince iki takip görevi doğar (takipOlayKaydet kancası):
 *   1) İTİRAZ PENCERESİ — İİK m.62: ödeme emrine itiraz 7 gün. Pencere dolunca itiraz yoksa
 *      takip kesinleştirilmeli. sonTarih = tebliğ + 7 gün.
 *   2) HACİZ İSTEME SÜRESİ — İİK m.78: kesinleşen takipte tebliğden itibaren 1 YIL içinde haciz
 *      istenmezse TAKİP DÜŞER. Uyarı görevi son günden 30 gün önce vadelenir (marj), başlıkta
 *      gerçek son gün yazar.
 * NOT: Süre uzunlukları genel kuraldır; dosya özelinde (borçlu türü/tebligat şekli) avukat teyidi
 * gerekir — görev açıklamasında hatırlatılır.
 *
 * Kapanış kancaları: ITIRAZ/KESINLESTI olayı itiraz-penceresi görevini, HACIZ olayı haciz görevini,
 * KAPANDI her ikisini kapatır (IPTAL) — kuyruğa bayat görev birikmesin.
 *
 * Mükerrerlik: başlık deterministik (dosya + tebliğ günü) → aynı başlıkla ikinci görev açılmaz.
 */
import { Rol } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tarihTR } from './format'

const GUN_MS = 86_400_000
export const ITIRAZ_SURESI_GUN = 7
export const HACIZ_UYARI_ERKEN_GUN = 30

// Görev başlık önekleri — kapanış kancaları bunlarla eşleşir; DEĞİŞTİRİRSEN eski görevler kapanmaz.
export const ITIRAZ_GOREV_ONEK = 'İtiraz penceresi'
export const HACIZ_GOREV_ONEK = 'Haciz isteme süresi'

/** TEBLIG olayından yasal süre görevlerini üret (idempotent). */
export async function tebligGorevleriOlustur(dosyaId: string, tebligTarihi: Date, kullaniciId: string | null): Promise<void> {
  const dosya = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    select: { musteriId: true, atananKullaniciId: true },
  })
  if (!dosya) return

  // sorumlu: dosyanın atananı; yoksa tenant ADMIN'i (hatırlatma maili sorumluya gider — boş kalmasın)
  let sorumluId = dosya.atananKullaniciId
  if (!sorumluId) {
    const admin = await prisma.kullanici.findFirst({
      where: { rol: Rol.ADMIN, aktif: true, musteriler: { some: { musteriId: dosya.musteriId } } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    sorumluId = admin?.id ?? null
  }

  const itirazSon = new Date(tebligTarihi.getTime() + ITIRAZ_SURESI_GUN * GUN_MS)
  const hacizSon = new Date(tebligTarihi)
  hacizSon.setFullYear(hacizSon.getFullYear() + 1)
  const hacizUyari = new Date(hacizSon.getTime() - HACIZ_UYARI_ERKEN_GUN * GUN_MS)

  const gorevler = [
    {
      baslik: `${ITIRAZ_GOREV_ONEK} (tebliğ ${tarihTR(tebligTarihi)}): ${tarihTR(itirazSon)}'e kadar itiraz gelmezse kesinleştir`,
      sonTarih: itirazSon,
      aciklama:
        `Ödeme emri ${tarihTR(tebligTarihi)} tarihinde tebliğ edildi. İİK m.62 uyarınca itiraz süresi 7 gündür ` +
        `(genel kural — dosya özelinde teyit edin). ${tarihTR(itirazSon)} itibarıyla UYAP'ta itiraz görünmüyorsa takibin ` +
        `kesinleştirilmesini işleyin; itiraz geldiyse bu görev otomatik kapanır.`,
    },
    {
      baslik: `${HACIZ_GOREV_ONEK} (İİK m.78): son gün ${tarihTR(hacizSon)} — geçerse takip düşer`,
      sonTarih: hacizUyari,
      aciklama:
        `Ödeme emri ${tarihTR(tebligTarihi)} tarihinde tebliğ edildi. İİK m.78 uyarınca tebliğden itibaren 1 YIL içinde ` +
        `haciz istenmezse takip düşer. Gerçek son gün: ${tarihTR(hacizSon)}. Bu görev ${HACIZ_UYARI_ERKEN_GUN} gün önce ` +
        `hatırlatılır; haciz işlendiyse otomatik kapanır.`,
    },
  ]

  for (const g of gorevler) {
    // Dedup: başlık deterministik (dosya + tebliğ günü) → findFirst yeterli. Teorik yarış (eşzamanlı
    // iki TEBLIG işleme) kabul edilmiş risk: UYAP senkronu olayları sıralı işler ve baslik'e unique
    // koymak ELLE açılan aynı-başlıklı görevleri kırardı.
    const mevcut = await prisma.takipGorevi.findFirst({ where: { dosyaId, baslik: g.baslik }, select: { id: true } })
    if (mevcut) continue
    await prisma.takipGorevi.create({
      data: { dosyaId, baslik: g.baslik, aciklama: g.aciklama, sonTarih: g.sonTarih, sorumluId, atayanId: kullaniciId },
    })
    await prisma.aktivite.create({
      data: { dosyaId, kullaniciId, eylem: `Otomatik takip görevi: ${g.baslik}` },
    })
  }
}

/** Olay tipine göre bayatlayan süre görevlerini kapat (IPTAL). */
export async function tebligGorevleriKapat(dosyaId: string, olayTip: string): Promise<void> {
  const onekler: string[] = []
  if (olayTip === 'ITIRAZ' || olayTip === 'KESINLESTI') onekler.push(ITIRAZ_GOREV_ONEK)
  // HACIZ = takip kesinleşmiş demektir (durum makinesiyle tutarlı) → itiraz-penceresi görevi de kapanır
  if (olayTip === 'HACIZ') onekler.push(HACIZ_GOREV_ONEK, ITIRAZ_GOREV_ONEK)
  if (olayTip === 'KAPANDI') onekler.push(ITIRAZ_GOREV_ONEK, HACIZ_GOREV_ONEK)
  if (!onekler.length) return
  await prisma.takipGorevi.updateMany({
    where: { dosyaId, durum: { in: ['ACIK', 'ISLEMDE'] }, OR: onekler.map((o) => ({ baslik: { startsWith: o } })) },
    data: { durum: 'IPTAL' },
  })
}
