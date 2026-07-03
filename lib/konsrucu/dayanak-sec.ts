/**
 * KonsRücü — İcra dayanak belge seçimi · lib/konsrucu/dayanak-sec.ts (saf, paylaşımlı)
 * Bir dosyanın 100+ belgesi/fotoğrafı arasından icra takibi açmak için gerekli ~6-7 DAYANAK belgeyi seçer:
 *   Poliçe · KTT (yoksa İfade/Görgü tutanağı) · Sigortalının Beyanı (varsa) · Ekspertiz (raporda "rücu yok"
 *   yazmıyorsa) · Ödeme Dekontu · + hasar fotoğrafı adayları (en net 2'yi AI vision ayrı seçer).
 * Deterministik + ucuz: yalnız kategori + dosyaAdi + extractedText sinyalleri. Foto seçimi burada DEĞİL.
 */
import { trSade } from './belge-siniflandir'

export type DayanakRol = 'POLICE' | 'KTT' | 'IFADE' | 'GORGU' | 'TUTANAK' | 'BEYAN' | 'EKSPERTIZ' | 'DEKONT'

export const ROL_LABEL: Record<DayanakRol | 'HASAR_FOTO', string> = {
  POLICE: 'Poliçe',
  KTT: 'Kaza Tespit Tutanağı (KTT)',
  IFADE: 'İfade Tutanağı',
  GORGU: 'Görgü Tutanağı',
  TUTANAK: 'Tutanak',
  BEYAN: 'Sigortalının Beyanı',
  EKSPERTIZ: 'Ekspertiz Raporu',
  DEKONT: 'Ödeme Dekontu',
  HASAR_FOTO: 'Hasar Fotoğrafı',
}

export type DayanakGirdi = {
  id: string
  dosyaAdi: string
  kategori: string
  extractedText?: string | null
  storagePath?: string | null
  belgeTarihi?: Date | string | null
  confidence?: number | null
}

export type DayanakBelge = {
  id: string
  dosyaAdi: string
  kategori: string
  rol: DayanakRol
  rolLabel: string
  acilabilir: boolean
  belgeTarihi: string | null
  not?: string
}

export type HasarAday = { id: string; dosyaAdi: string; acilabilir: boolean }

export type DayanakSonuc = {
  secilenler: DayanakBelge[]
  hasarAdaylar: HasarAday[]
  notlar: string[]
}

// Ekspertiz raporunda rücu OLMADIĞINI söyleyen kalıplar → bu rapor dayanağa ALINMAZ.
const RUCU_YOK = /\brucu(su)?\s+(yok|bulunma|hakk[i]?\s+(yok|bulunma)|tespit\s+edileme|soz\s+konusu\s+degil|dogma)/

const sade = (b: DayanakGirdi) => trSade(`${b.dosyaAdi} ${b.extractedText ?? ''}`)
const isoGun = (d: Date | string | null | undefined) => {
  if (!d) return null
  const t = typeof d === 'string' ? new Date(d) : d
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10)
}
// Aynı kategoriden birden çok belge varsa: metni olan + güveni yüksek olanı yeğle.
const skor = (b: DayanakGirdi) => (b.extractedText && b.extractedText.trim() ? 2 : 0) + (b.confidence ?? 0)
const enIyi = (arr: DayanakGirdi[]) => arr.slice().sort((a, b) => skor(b) - skor(a))[0]

function tutanakSinifi(b: DayanakGirdi): 'KTT' | 'IFADE' | 'GORGU' | 'TUTANAK' {
  const s = sade(b)
  if (/kaza tespit tutanag|trafik kazasi tespit|maddi hasarli trafik kazasi tespit/.test(s)) return 'KTT'
  if (/ifade tutanag|ifade ve tespit|ifadesi alin|sifahi beyan|beyan ve ifade/.test(s)) return 'IFADE'
  if (/gorgu tespit|gorgu tutanag|gorgu ve tespit/.test(s)) return 'GORGU'
  return 'TUTANAK'
}

/** Dosyanın belgelerinden icra dayanağını seç. Foto seçimi (vision) ayrı; burada yalnız adaylar döner. */
export function dayanakSec(belgeler: DayanakGirdi[]): DayanakSonuc {
  const secilenler: DayanakBelge[] = []
  const notlar: string[] = []
  const kullanilan = new Set<string>()

  const push = (b: DayanakGirdi | undefined, rol: DayanakRol, not?: string) => {
    if (!b || kullanilan.has(b.id)) return
    kullanilan.add(b.id)
    secilenler.push({
      id: b.id, dosyaAdi: b.dosyaAdi, kategori: b.kategori, rol, rolLabel: ROL_LABEL[rol],
      acilabilir: !!b.storagePath, belgeTarihi: isoGun(b.belgeTarihi), not,
    })
  }
  const kat = (k: string) => belgeler.filter((b) => b.kategori === k)

  // 1) Poliçe
  push(enIyi(kat('POLICE')), 'POLICE')

  // 2) Tutanak: KTT > İfade > Görgü > genel. KTT yoksa nedenini not düş.
  const tutanaklar = kat('TUTANAK')
  if (tutanaklar.length) {
    const sinifli = tutanaklar.map((b) => ({ b, sinif: tutanakSinifi(b) }))
    const oncelik: DayanakRol[] = ['KTT', 'IFADE', 'GORGU', 'TUTANAK']
    const secilenSinif = oncelik.find((s) => sinifli.some((x) => x.sinif === s)) ?? 'TUTANAK'
    const aday = enIyi(sinifli.filter((x) => x.sinif === secilenSinif).map((x) => x.b))
    push(aday, secilenSinif)
    if (secilenSinif !== 'KTT') notlar.push(`KTT (Kaza Tespit Tutanağı) bulunamadı; ${ROL_LABEL[secilenSinif]} dayanak alındı.`)
  } else {
    notlar.push('Tutanak bulunamadı (KTT/ifade/görgü) — icra dayanağı için kaza tutanağı gerekir.')
  }

  // 3) Sigortalının beyanı (varsa) — herhangi bir belgede "sigortalı beyanı" geçenler
  const beyan = enIyi(belgeler.filter((b) => /sigortali(nin)? beyan|sigortali ifade|beyan formu/.test(sade(b))))
  if (beyan) push(beyan, 'BEYAN')

  // 4) Ekspertiz — raporda "rücu yok" yazıyorsa ALMA
  const eksList = kat('EKSPERTIZ')
  if (eksList.length) {
    const temiz = eksList.filter((b) => !RUCU_YOK.test(sade(b)))
    if (temiz.length) push(enIyi(temiz), 'EKSPERTIZ')
    else notlar.push('Ekspertiz raporunda "rücu yok" ifadesi var — dayanağa eklenmedi (gözden geçirin).')
  }

  // 5) Ödeme dekontu — rücu tutarının/ödemenin kanıtı
  push(enIyi(kat('DEKONT')), 'DEKONT')

  // 6) Hasar fotoğrafı adayları (en net 2'yi AI vision seçer; burada hepsi aday)
  const hasarAdaylar: HasarAday[] = kat('HASAR_FOTO')
    .filter((b) => !!b.storagePath)
    .map((b) => ({ id: b.id, dosyaAdi: b.dosyaAdi, acilabilir: true }))
  if (!hasarAdaylar.length) notlar.push('Hasar fotoğrafı bulunamadı.')

  return { secilenler, hasarAdaylar, notlar }
}
