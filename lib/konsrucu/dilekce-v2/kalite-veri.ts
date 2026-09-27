/**
 * KonsRücü — Kalite kapıları: sunucu tarafı veri toplayıcı · lib/konsrucu/dilekce-v2/kalite-veri.ts (server-only)
 *
 * S37. `kapilar.ts`'teki `kaliteRaporu()` saf bir fonksiyondur ve veri tabanına erişmez; bu dosya onun girdisini
 * (`KaliteGirdi`) tek yerde kurar — dosya kartı (davalı/itiraz, çelişkiler), aktif müvekkilin mevzuat kütüphanesi,
 * geçerli `TakipTalebi`, arabuluculuk kaydı (tensip provası) ve bu kullanıcının eriştiği DİĞER müvekkillerin
 * unvanları (K7 KVKK kapısı — "Zurich dosyasında RAY" senaryosu). Her sorgu aktif müvekkil kapsamındadır (M7).
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { KutuphaneKaydi } from '@/lib/konsrucu/mevzuat/atif'
import type { AtifOnayKaydi, KaliteGirdi } from './kapilar'
import { davaDegeriOnerisi } from './kart'
import { icerikOku, kartVerisiniYukle } from './kart-veri'
import type { KartTuru } from './tipler'

function atifOnaylariniOku(json: unknown): AtifOnayKaydi[] {
  if (!Array.isArray(json)) return []
  const out: AtifOnayKaydi[] = []
  for (const x of json) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    if (typeof o.anahtar === 'string' && typeof o.onaylayanId === 'string' && typeof o.at === 'string') {
      out.push({
        anahtar: o.anahtar, metin: typeof o.metin === 'string' ? o.metin : '', onaylayanId: o.onaylayanId, at: o.at,
        resmiUrl: typeof o.resmiUrl === 'string' ? o.resmiUrl : null,
        gerekce: typeof o.gerekce === 'string' ? o.gerekce : null,
      })
    }
  }
  return out
}

export type KaliteVeriGirdisi = {
  musteriId: string
  kullaniciId: string
  dosyaId: string
  /** DilekceSurum.kartId — üretim anında kilitli olan kart (kart-id'siz eski kayıtlarda null olabilir). */
  kartId: string | null
  tur: KartTuru
  /** Kontrol edilecek nihai metin (kaydedilmek istenen ya da ekranda düzenlenmekte olan). */
  metin: string
  /** DilekceSurum.atifJson (ham; henüz doğrulanmamış). */
  atifJsonHam: unknown
}

/** `kaliteRaporu()`nun girdisini DB'den kurar (M7 kapsamlı). Dosya ya da kart bulunamazsa güvenli tarafta
 *  (boş/`gecerli:false`) döner — sunucu eylemi zaten dosya erişimini ayrıca doğrular. */
export async function kaliteGirdisiOlustur(p: KaliteVeriGirdisi): Promise<KaliteGirdi> {
  const [veri, kartRow, kutuphaneKayitlari, takipTalebi, digerMusteriler] = await Promise.all([
    kartVerisiniYukle(prisma, p.musteriId, p.dosyaId),
    p.kartId
      ? prisma.dosyaKarti.findFirst({ where: { id: p.kartId, dosya: { musteriId: p.musteriId } }, select: { icerikJson: true } })
      : Promise.resolve(null),
    prisma.mevzuatKaynak.findMany({
      where: { musteriId: p.musteriId, aktif: true },
      select: { id: true, kunye: true, tur: true, alinti: true, durum: true, etiket: true, resmiUrl: true, kapsamNotu: true, rucuSebebiKodlari: true },
    }),
    prisma.takipTalebi.findFirst({ where: { dosyaId: p.dosyaId, gecerli: true, silindiAt: null }, select: { faizTuru: true, asilAlacak: true, islemisFaiz: true, toplam: true } }),
    prisma.musteriKullanici.findMany({ where: { kullaniciId: p.kullaniciId, musteriId: { not: p.musteriId }, musteri: { aktif: true } }, select: { musteri: { select: { ad: true } } } }),
  ])

  const kartIcerik = kartRow ? icerikOku(kartRow.icerikJson, p.tur) : null
  const kutuphane: KutuphaneKaydi[] = kutuphaneKayitlari.map((k) => ({
    id: k.id, kunye: k.kunye, tur: k.tur, alinti: k.alinti, durum: k.durum, etiket: k.etiket, aktif: true,
    resmiUrl: k.resmiUrl, kapsamNotu: k.kapsamNotu, rucuSebebiKodlari: k.rucuSebebiKodlari,
  }))

  const asil = takipTalebi ? Number(takipTalebi.asilAlacak) : null
  const islemis = takipTalebi?.islemisFaiz != null ? Number(takipTalebi.islemisFaiz) : null
  const toplamTL = takipTalebi?.toplam != null ? Number(takipTalebi.toplam) : asil != null ? asil + (islemis ?? 0) : null
  const toplamKurus = toplamTL != null ? Math.round(toplamTL * 100) : null

  const dd = veri ? davaDegeriOnerisi(veri.girdi) : null
  const vekaletnameVar = veri ? veri.girdi.belgeler.some((b) => /VEKALET/iu.test(`${b.altTur ?? ''} ${b.kategori ?? ''}`)) : false
  const arb = veri?.girdi.arabuluculuk ?? null
  const arabuluculukIstisnasi = !!(kartIcerik?.secimler.arabuluculukGerekmez && kartIcerik.secimler.arabuluculukGerekce?.trim())

  return {
    metin: p.metin,
    kutuphane,
    atifOnaylari: atifOnaylariniOku(p.atifJsonHam),
    davaliAdaylari: kartIcerik?.davaliAdaylari ?? [],
    secilenDavalilar: kartIcerik?.secimler.davalilar ?? [],
    celiskiler: kartIcerik?.celiskiler ?? [],
    davaDegeriKurus: dd?.kurus ?? null,
    takip: takipTalebi ? { gecerli: true, faizTuru: takipTalebi.faizTuru, toplamKurus } : { gecerli: false, faizTuru: null, toplamKurus: null },
    digerMusteriAdlari: digerMusteriler.map((m) => m.musteri.ad),
    tensip: {
      davaSartiArabuluculuk: arb?.tur === 'DAVA_SARTI' && !arabuluculukIstisnasi,
      sonTutanakEkVar: !!arb?.sonTutanakBelgeId,
      vekaletnameVar,
    },
  }
}
