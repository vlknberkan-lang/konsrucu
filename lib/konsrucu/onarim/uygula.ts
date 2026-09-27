/**
 * KonsRücü — Onarım satırını uygulama ve geri alma · lib/konsrucu/onarim/uygula.ts (DB'den bağımsız çekirdek)
 *
 * 06 §6.3 (5–6), 07 S13:
 *  - GUNCELLE: hedefte `WHERE alan = eskiDeger` koruması. Araya değişiklik girdiyse (0 satır) satır ATLANDI.
 *    Durum/eksen alanında DurumGecisi(kaynakTuru = ONARIM) yazılır; her uygulamada Aktivite yazılır.
 *  - EKLE: hedef satırı açar ve VeriOnarim.hedefId'yi doldurur. Hedefte aynı kayıt varsa (tekillik) ATLANDI.
 *  - Geri al: GUNCELLE'de `WHERE alan = yeniDeger` ile eski değer yazılır (sonradan değiştiyse dokunulmaz);
 *    EKLE'de hedef satıra silindiAt yazılır. Geri alma da yeni bir DurumGecisi satırıdır.
 *  - VeriOnarim satırı yalnız durum değiştirir; silinmez. Durum yazımı `WHERE durum = beklenen` ile korunur;
 *    korunamazsa hata fırlatılır ve çağıranın işlemi (transaction) tümüyle geri döner.
 *
 * Hedef tablolara erişim `HedefAdaptoru`, iz yazımı `IzYazici` üzerinden yapılır: servis katmanı Prisma
 * işlemiyle bağlar, testler sahte hedef tabloyla sınar.
 */
import { degerMetni, degerOku, guncelleHedefi, type DurumEkseni } from './hedefler'

export type OnarimSatiri = {
  id: string
  musteriId: string
  dosyaId: string
  parti: string
  kod: string
  islem: string // GUNCELLE | EKLE
  hedefTablo: string
  hedefId: string | null
  alan: string
  eskiJson: unknown
  yeniJson: unknown
  durum: string
  not: string | null
}

export type UygulaBaglami = { kullaniciId: string; simdi: Date }

export interface HedefAdaptoru {
  /** GUNCELLE: `alan = beklenen` ise `yeni` yazar; değişen satır sayısını döner. */
  guncelle?(s: OnarimSatiri, beklenen: unknown, yeni: unknown): Promise<number>
  /** EKLE: satırı açar ve id döner; aynı kayıt hedefte zaten varsa null. */
  ekle?(s: OnarimSatiri, b: UygulaBaglami): Promise<string | null>
  /** EKLE geri alma: hedef satıra silindiAt yazar; değişen satır sayısı. */
  ekleGeriAl?(s: OnarimSatiri, b: UygulaBaglami): Promise<number>
}

export type SatirDurumYazimi = { durum: string; uygulandiAt?: Date; geriAlindiAt?: Date; hedefId?: string; not?: string }

export interface IzYazici {
  /** VeriOnarim satırının durumunu `WHERE durum = beklenen` ile değiştirir; değişen satır sayısı. */
  satirDurumu(id: string, beklenen: string, veri: SatirDurumYazimi): Promise<number>
  durumGecisi(d: { dosyaId: string; eksen: DurumEkseni; eski: string | null; yeni: string; sebep: string; kaynakId: string; kullaniciId: string }): Promise<void>
  aktivite(d: { dosyaId: string; kullaniciId: string; eylem: string; detayJson: Record<string, unknown> }): Promise<void>
}

export type Adaptorler = Record<string, HedefAdaptoru>

export type IslemSonucu = { sonuc: 'UYGULANDI' | 'ATLANDI' | 'GERI_ALINDI' | 'GECILDI'; sebep?: string }

/** DurumGecisi.yeni zorunlu metin: alan boşa (null) döndüğünde bu işaret yazılır. */
export const BOS = 'BOS'

const notEkle = (not: string | null, ek: string) => (not ? `${not} · ${ek}` : ek).slice(0, 1000)
const metin = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))

async function durumYaz(iz: IzYazici, s: OnarimSatiri, beklenen: string, veri: SatirDurumYazimi) {
  const n = await iz.satirDurumu(s.id, beklenen, veri)
  if (n !== 1) throw new Error(`Onarım satırı bu arada değişti (${s.parti}); işlem geri alındı, sayfayı yenileyin.`)
}

async function atla(iz: IzYazici, s: OnarimSatiri, sebep: string): Promise<IslemSonucu> {
  await durumYaz(iz, s, 'ONAYLI', { durum: 'ATLANDI', not: notEkle(s.not, `ATLANDI: ${sebep}`) })
  return { sonuc: 'ATLANDI', sebep }
}

export async function satirUygula(s: OnarimSatiri, adaptorler: Adaptorler, iz: IzYazici, b: UygulaBaglami): Promise<IslemSonucu> {
  if (s.durum !== 'ONAYLI') return { sonuc: 'GECILDI', sebep: 'Satır onaylı değil' }
  const a = adaptorler[s.hedefTablo]

  if (s.islem === 'GUNCELLE') {
    const hedef = guncelleHedefi(s.hedefTablo, s.alan)
    if (!hedef || !a?.guncelle) return atla(iz, s, `Desteklenmeyen hedef: ${s.hedefTablo}.${s.alan}`)
    const eski = degerOku(s.eskiJson)
    const yeni = hedef.dogrula(degerOku(s.yeniJson))
    if (yeni === undefined) return atla(iz, s, 'Önerilen değer geçersiz')
    const beklenen = eski === undefined ? null : hedef.dogrula(eski) ?? eski
    const n = await a.guncelle(s, beklenen, yeni)
    if (n === 0) return atla(iz, s, 'Eski değer değişmiş: araya değişiklik girdi')
    if (hedef.eksen) {
      await iz.durumGecisi({ dosyaId: s.dosyaId, eksen: hedef.eksen, eski: metin(beklenen), yeni: yeni ?? BOS, sebep: `Veri onarımı ${s.parti} (${s.kod}), avukat onayı`, kaynakId: s.id, kullaniciId: b.kullaniciId })
    }
    await iz.aktivite({
      dosyaId: s.dosyaId, kullaniciId: b.kullaniciId,
      eylem: `[ONARIM] ${s.parti} · ${hedef.etiket}: ${degerMetni(beklenen)} → ${degerMetni(yeni)}`,
      detayJson: { veriOnarimId: s.id, kod: s.kod, alan: s.alan, eski: beklenen ?? null, yeni },
    })
    await durumYaz(iz, s, 'ONAYLI', { durum: 'UYGULANDI', uygulandiAt: b.simdi, hedefId: s.hedefId ?? s.dosyaId })
    return { sonuc: 'UYGULANDI' }
  }

  if (s.islem === 'EKLE') {
    if (!a?.ekle) return atla(iz, s, `Desteklenmeyen hedef tablo: ${s.hedefTablo}`)
    const id = await a.ekle(s, b)
    if (!id) return atla(iz, s, 'Aynı kayıt hedefte zaten var (tekillik)')
    await iz.aktivite({
      dosyaId: s.dosyaId, kullaniciId: b.kullaniciId,
      eylem: `[ONARIM] ${s.parti} · ${s.hedefTablo} satırı açıldı`,
      detayJson: { veriOnarimId: s.id, kod: s.kod, hedefTablo: s.hedefTablo, hedefId: id },
    })
    await durumYaz(iz, s, 'ONAYLI', { durum: 'UYGULANDI', uygulandiAt: b.simdi, hedefId: id })
    return { sonuc: 'UYGULANDI' }
  }

  return atla(iz, s, `Bilinmeyen işlem: ${s.islem}`)
}

export async function satirGeriAl(s: OnarimSatiri, adaptorler: Adaptorler, iz: IzYazici, b: UygulaBaglami): Promise<IslemSonucu> {
  if (s.durum !== 'UYGULANDI') return { sonuc: 'GECILDI', sebep: 'Satır uygulanmamış' }
  const a = adaptorler[s.hedefTablo]

  if (s.islem === 'GUNCELLE') {
    const hedef = guncelleHedefi(s.hedefTablo, s.alan)
    if (!hedef || !a?.guncelle) return { sonuc: 'ATLANDI', sebep: 'Desteklenmeyen hedef' }
    const yeni = hedef.dogrula(degerOku(s.yeniJson))
    const eskiHam = degerOku(s.eskiJson)
    const eski = eskiHam === undefined ? null : hedef.dogrula(eskiHam) ?? eskiHam
    if (yeni === undefined) return { sonuc: 'ATLANDI', sebep: 'Kayıtlı yeni değer geçersiz' }
    const n = await a.guncelle(s, yeni, eski)
    if (n === 0) return { sonuc: 'ATLANDI', sebep: 'Değer uygulamadan sonra değişmiş; geri alınmadı' }
    if (hedef.eksen) {
      await iz.durumGecisi({ dosyaId: s.dosyaId, eksen: hedef.eksen, eski: yeni, yeni: eski === null ? BOS : String(eski), sebep: `Veri onarımı geri alındı ${s.parti} (${s.kod})`, kaynakId: s.id, kullaniciId: b.kullaniciId })
    }
    await iz.aktivite({
      dosyaId: s.dosyaId, kullaniciId: b.kullaniciId,
      eylem: `[ONARIM · GERİ AL] ${s.parti} · ${hedef.etiket}: ${degerMetni(yeni)} → ${degerMetni(eski)}`,
      detayJson: { veriOnarimId: s.id, kod: s.kod, alan: s.alan, eski: yeni, yeni: eski ?? null },
    })
    await durumYaz(iz, s, 'UYGULANDI', { durum: 'GERI_ALINDI', geriAlindiAt: b.simdi })
    return { sonuc: 'GERI_ALINDI' }
  }

  if (s.islem === 'EKLE') {
    if (!a?.ekleGeriAl || !s.hedefId) return { sonuc: 'ATLANDI', sebep: 'Hedef satır bilinmiyor' }
    const n = await a.ekleGeriAl(s, b)
    if (n === 0) return { sonuc: 'ATLANDI', sebep: 'Hedef satır bulunamadı ya da zaten silinmiş' }
    await iz.aktivite({
      dosyaId: s.dosyaId, kullaniciId: b.kullaniciId,
      eylem: `[ONARIM · GERİ AL] ${s.parti} · ${s.hedefTablo} satırı kaldırıldı (silindiAt)`,
      detayJson: { veriOnarimId: s.id, kod: s.kod, hedefTablo: s.hedefTablo, hedefId: s.hedefId },
    })
    await durumYaz(iz, s, 'UYGULANDI', { durum: 'GERI_ALINDI', geriAlindiAt: b.simdi })
    return { sonuc: 'GERI_ALINDI' }
  }

  return { sonuc: 'ATLANDI', sebep: `Bilinmeyen işlem: ${s.islem}` }
}

export type TopluSonuc = { uygulanan: number; atlanan: number; gecilen: number; geriAlinan: number; atlamaSebepleri: { id: string; sebep: string }[] }

/** Satırları sırayla işler (çağıran tek transaction içinde çağırır). */
export async function satirlariIsle(
  satirlar: OnarimSatiri[],
  fn: (s: OnarimSatiri) => Promise<IslemSonucu>,
): Promise<TopluSonuc> {
  const r: TopluSonuc = { uygulanan: 0, atlanan: 0, gecilen: 0, geriAlinan: 0, atlamaSebepleri: [] }
  for (const s of satirlar) {
    const x = await fn(s)
    if (x.sonuc === 'UYGULANDI') r.uygulanan++
    else if (x.sonuc === 'GERI_ALINDI') r.geriAlinan++
    else if (x.sonuc === 'ATLANDI') { r.atlanan++; r.atlamaSebepleri.push({ id: s.id, sebep: x.sebep ?? '' }) }
    else r.gecilen++
  }
  return r
}
