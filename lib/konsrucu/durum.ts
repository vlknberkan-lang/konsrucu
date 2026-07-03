/**
 * KonsRücü — Dosya durumu MERKEZİ İLERLETME · lib/konsrucu/durum.ts (server)
 *
 * Sorun: durum alanı birçok yerden KOŞULSUZ yazılıyordu — geç gelen bir UYAP TEBLIG olayı
 * KESINLESTI'deki dosyayı TEBLIG_EDILDI'ye, bir aşama düzenlemesi DAVA'daki dosyayı
 * TAKIP_ACILDI'ya geri çekebiliyordu. Durum; aktiflik kapısını, listeleri ve zamanaşımı
 * radarını beslediği için sessiz bozulma pahalı.
 *
 * Kural: otomatik akışlar (UYAP olayları, toplu eşleştirme) yalnız İLERİ yönde günceller.
 * Kullanıcının bilinçli evre kararı (yeni ARABULUCULUK/DAVA aşaması açmak gibi) zorla=true
 * ile sırayı ezebilir — avukat kararı makineden üstündür.
 *
 * "Kısmi tahsilat kapatmaz" kuralı korunur: TAHSILAT olayının durum eşlemesi zaten yok
 * (lib/konsrucu/takip-olay.ts); bu modül o karara dokunmaz.
 */
import { DosyaDurum } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** Yaşam döngüsü sırası — büyük sayı = daha ileri evre. IDARI_YOL yan yol (inceleme sonrası ayrım). */
export const DURUM_RANK: Record<DosyaDurum, number> = {
  HAVUZDA: 0,
  INCELENIYOR: 1,
  TAKIBE_HAZIR: 2,
  IDARI_YOL: 2, // yan yol: icra yerine idari başvuru — inceleme sonrası ayrım
  TAKIP_ACILDI: 3,
  TEBLIG_EDILDI: 4,
  ITIRAZ: 5,
  ARABULUCULUK: 6,
  DAVA: 7,
  KESINLESTI: 8,
  INFAZ: 9,
  TAHSIL: 10,
  KAPANDI: 10,
}

/** hedef, mevcut durumdan İLERİ bir evre mi? (eşitse/gerideyse false) */
export function ileriMi(mevcut: DosyaDurum, hedef: DosyaDurum): boolean {
  return DURUM_RANK[hedef] > DURUM_RANK[mevcut]
}

/**
 * Dosya durumunu TEK KAPIDAN ilerlet. Varsayılan: yalnız ileri yön (geri çekme sessizce reddedilir).
 * zorla=true: kullanıcının bilinçli evre kararı — sıra kontrolü atlanır.
 * Dönüş: durum gerçekten değiştiyse true.
 */
export async function dosyaDurumIlerlet(
  dosyaId: string,
  hedef: DosyaDurum,
  opts?: { zorla?: boolean },
): Promise<boolean> {
  const d = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { durum: true } })
  if (!d || d.durum === hedef) return false
  if (!opts?.zorla && !ileriMi(d.durum, hedef)) return false
  await prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { durum: hedef } })
  return true
}
