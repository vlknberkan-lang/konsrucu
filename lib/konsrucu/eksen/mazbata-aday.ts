/**
 * KonsRücü — Mazbata metninden ADAY üretme ve zenginleştirme · lib/konsrucu/eksen/mazbata-aday.ts
 *
 * S23: "İADE tebliğden ayrılsın; taranmış mazbata da okunsun". Evrak metin hattının (S16/S17) okuduğu mazbata
 * metni mazbata.ts'ten geçer:
 *   • Aynı tebligata ait, kaynağı belgesiz bir UYAP adayı varsa (±3 gün) o aday ZENGİNLEŞTİRİLİR: sonuç, şekil,
 *     muhatap, borçlu ve hukuki tarih önerisi mazbatadan gelir (evrak adından değil — 06 §2(e)).
 *   • Yoksa belgeye bağlı YENİ aday açılır (tip 'DURUM': eski durum makinesine ve görev kancalarına dokunmaz).
 *   • Bir belge yalnız bir kez aday doğurur (kaynakBelgeId ve tekil anahtar).
 * Onaylanmış (TEYITLI) ya da reddedilmiş aday değiştirilmez.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { gunNo } from './norm'
import { mazbataBelgesiMi, mazbataOku, type MazbataBorclu, type MazbataOkuma } from './mazbata'
import { adayTekilAnahtar, tekilIhlaliMi } from './tekil'
import { birlesecekAdayIdBul, adayaKaynakEkle } from './aday-birlestir'
import type { AltTip } from './sabitler'

export type MazbataBelge = {
  id: string
  dosyaAdi: string
  altTur: string | null
  uyapEvrakTuru: string | null
  kaynak: string | null
  belgeTarihi: Date | null
  extractedText: string | null
  metinYontemi: string | null
  metinGuven: number | null
}

export type EslesenAday = {
  id: string
  altTip: string | null
  teyit: string | null
  borcluId: string | null
  hukukiTarih: Date | null
  tarih: Date | null
  kaynakBelgeId: string | null
}

const BORCLU_TEBLIG_AILESI: ReadonlySet<string> = new Set(['TEBLIG_SONUCU', 'TEBLIG_IADE'])
const ALACAKLIYA_AILESI: ReadonlySet<string> = new Set(['ITIRAZIN_ALACAKLIYA_TEBLIGI'])

export function mazbataAltTipi(o: MazbataOkuma): AltTip {
  if (o.muhatap === 'ALACAKLI_VEKILI') return 'ITIRAZIN_ALACAKLIYA_TEBLIGI'
  return o.sonuc === 'IADE' ? 'TEBLIG_IADE' : 'TEBLIG_SONUCU'
}

/**
 * Mazbata bu adaya ait olabilir mi? Aynı aile (borçluya tebliğ ↔ borçluya tebliğ; alacaklıya tebliğ ↔ alacaklıya
 * tebliğ) ve borçlular çelişmiyor (ikisi de belliyse aynı olmalı). Farklı borçlunun mazbatası başka karta yazılmaz.
 */
export function mazbataAdayaUyarMi(okuma: MazbataOkuma, aday: { altTip: string | null; borcluId: string | null; muhatap?: string | null }): boolean {
  const aile = mazbataAltTipi(okuma) === 'ITIRAZIN_ALACAKLIYA_TEBLIGI' ? ALACAKLIYA_AILESI : BORCLU_TEBLIG_AILESI
  const adayAlacakliya = aday.altTip === 'ITIRAZIN_ALACAKLIYA_TEBLIGI' || (aday.altTip === 'TEBLIG_SONUCU' && aday.muhatap === 'ALACAKLI_VEKILI')
  const adayAile = adayAlacakliya ? ALACAKLIYA_AILESI : BORCLU_TEBLIG_AILESI.has(aday.altTip ?? '') ? BORCLU_TEBLIG_AILESI : null
  if (adayAile !== aile) return false
  return !(aday.borcluId && okuma.borcluId && aday.borcluId !== okuma.borcluId)
}

export type MazbataPlani =
  | { tur: 'ZENGINLESTIR'; olayId: string; okuma: MazbataOkuma; altTip: AltTip }
  | { tur: 'YENI'; okuma: MazbataOkuma; altTip: AltTip }

/** Belge + okuma + dosyadaki adaylar → ne yapılacak (saf). Belge zaten bir olaya bağlıysa null. */
export function mazbataPlani(belge: MazbataBelge, okuma: MazbataOkuma, adaylar: EslesenAday[]): MazbataPlani | null {
  if (adaylar.some((a) => a.kaynakBelgeId === belge.id)) return null
  const altTip = mazbataAltTipi(okuma)
  const referans = okuma.tarih ?? okuma.uetsUlasma ?? belge.belgeTarihi
  if (referans) {
    const aday = adaylar
      .filter((a) => a.teyit === 'ADAY' && !a.kaynakBelgeId && mazbataAdayaUyarMi(okuma, a))
      .map((a) => ({ a, t: a.hukukiTarih ?? a.tarih }))
      .filter((x) => x.t && Math.abs(gunNo(x.t) - gunNo(referans)) <= 3)
      .sort((x, y) => Math.abs(gunNo(x.t!) - gunNo(referans)) - Math.abs(gunNo(y.t!) - gunNo(referans)))[0]
    if (aday) return { tur: 'ZENGINLESTIR', olayId: aday.a.id, okuma, altTip }
  }
  return { tur: 'YENI', okuma, altTip }
}

/** Dosyanın okunmuş mazbatalarını işler. Dönüş: açılan, zenginleştirilen ve BİRLEŞTİRİLEN (var olan karta kaynak eklenen) aday sayısı. */
export async function mazbataAdaylariniIsle(dosyaId: string): Promise<{ yeni: number; zengin: number; birlesen: number }> {
  const [belgelerHam, borclular, adaylar] = await Promise.all([
    prisma.belge.findMany({
      where: {
        dosyaId, silindiAt: null, extractedText: { not: null },
        OR: [
          { altTur: 'ICRA_TEBLIG_MAZBATASI' },
          { dosyaAdi: { contains: 'mazbata', mode: 'insensitive' } },
          { dosyaAdi: { contains: 'MAZBATA' } },
          { uyapEvrakTuru: { contains: 'mazbata', mode: 'insensitive' } },
          { uyapEvrakTuru: { contains: 'MAZBATA' } },
          { dosyaAdi: { contains: 'bila', mode: 'insensitive' } },
          { dosyaAdi: { contains: 'BİLA' } },
          { dosyaAdi: { contains: 'teblig', mode: 'insensitive' } },
          { dosyaAdi: { contains: 'tebliğ', mode: 'insensitive' } },
          { dosyaAdi: { contains: 'TEBLİĞ' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, dosyaAdi: true, altTur: true, uyapEvrakTuru: true, kaynak: true, belgeTarihi: true, extractedText: true, metinYontemi: true, metinGuven: true },
    }),
    prisma.borclu.findMany({ where: { dosyaId }, select: { id: true, adUnvan: true } }),
    prisma.takipOlayi.findMany({
      where: { dosyaId, teyit: { not: null } },
      select: { id: true, altTip: true, teyit: true, borcluId: true, hukukiTarih: true, tarih: true, kaynakBelgeId: true },
    }),
  ])
  const belgeler = belgelerHam.filter(mazbataBelgesiMi)
  let yeni = 0
  let zengin = 0
  let birlesen = 0
  for (const b of belgeler) {
    const okuma = mazbataOku(b.extractedText, borclular as MazbataBorclu[], b.metinYontemi === 'OCR' ? b.metinGuven : null)
    if (!okuma) continue
    const plan = mazbataPlani(b, okuma, adaylar)
    if (!plan) continue
    const ortak = {
      altTip: plan.altTip, sonuc: okuma.sonuc, tebligSekli: okuma.sekil, muhatap: okuma.muhatap,
      kural: okuma.kural, kaynakBelgeId: b.id,
    }
    if (plan.tur === 'ZENGINLESTIR') {
      const hedef = adaylar.find((a) => a.id === plan.olayId)!
      const g = await prisma.takipOlayi.updateMany({
        where: { id: plan.olayId, dosyaId, teyit: 'ADAY', kaynakBelgeId: null },
        data: {
          ...ortak,
          ...(okuma.tarih ? { hukukiTarih: okuma.tarih } : {}),
          ...(hedef.borcluId ? {} : { borcluId: okuma.borcluId }),
        },
      })
      if (g.count) {
        zengin++
        hedef.kaynakBelgeId = b.id
      }
      continue
    }
    const aciklamaMazbata = `Mazbata: ${b.dosyaAdi}`.slice(0, 200)
    const kaynakTuruMazbata = b.kaynak && b.kaynak.startsWith('UYAP') ? 'UYAP_EVRAK' : 'ELLE'
    const tekilAnahtar = adayTekilAnahtar({ altTip: plan.altTip, hukukiTarih: okuma.tarih, belgeId: b.id })
    // S15 birleştirme: bu mazbatanın anlattığı olay dosyada (başka kaynaktan — safahat/evrak listesi) zaten
    // aday olarak var olabilir (dosya+altTip+hukuki gün aynı). Varsa YENİ SATIR AÇILMAZ; belge var olan karta
    // ek kaynak olarak eklenir (mazbataPlani'nın kendi ±3 gün ZENGINLESTIR eşleşmesinden bağımsız, daha kaba
    // ama daha kesin bir "aynı olay" testi).
    const birlesecekId = await birlesecekAdayIdBul({ dosyaId, altTip: plan.altTip, hukukiTarih: okuma.tarih, borcluId: okuma.borcluId })
    if (birlesecekId) {
      if (await adayaKaynakEkle(birlesecekId, { aciklama: aciklamaMazbata, kaynakTuru: kaynakTuruMazbata, kaynakBelgeId: b.id, tekilAnahtar })) birlesen++
      continue
    }
    try {
      const o = await prisma.takipOlayi.create({
        data: {
          dosyaId, tip: 'DURUM', tarih: okuma.tarih ?? b.belgeTarihi, aciklama: aciklamaMazbata,
          teyit: 'ADAY', kaynakTuru: kaynakTuruMazbata, ...ortak,
          hukukiTarih: okuma.tarih, borcluId: okuma.borcluId,
          tekilAnahtar,
          hamJson: { kaynak: 'mazbata', uyarilar: okuma.uyarilar } as Prisma.InputJsonValue,
        },
        select: { id: true },
      })
      adaylar.push({ id: o.id, altTip: plan.altTip, teyit: 'ADAY', borcluId: okuma.borcluId, hukukiTarih: okuma.tarih, tarih: okuma.tarih, kaynakBelgeId: b.id })
      yeni++
    } catch (e) {
      if (!tekilIhlaliMi(e)) throw e // eşzamanlı ikinci işlem aynı adayı açtı — sessiz geç
    }
  }
  return { yeni, zengin, birlesen }
}
