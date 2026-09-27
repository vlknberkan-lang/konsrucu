/**
 * KonsRücü — Onarım teşhisi (kuru liste üretimi) · lib/konsrucu/onarim/teshis.ts (saf; girdiyi servis okur)
 *
 * Canlı veriden (aktif müvekkil kapsamında okunan düz nesneler) KURU onarım satırları üretir. Kişisel
 * veri kanıt metnine YAZILMAZ: evrak adı yerine evrak türü, borçlu adı yerine kimlik. Kaynak: 08 §2.
 *
 *  - R1 (tutar): Hugo ham hücresi ABD biçimli ve içe aktarma değeri doğrunun 1/1000'i → doğru okuma önerilir.
 *    Takip açılmış dosyada satır C sınıfıdır ("hukuki değerlendirme: Yelda"; program ek takip/ıslah önermez).
 *  - R0 (İİK 67): itiraz izi olan dosyada `Sure(IIK67)` EKLE önerisi; ihtiyatlı alt sınır = itiraz + 1 yıl
 *    (tebliğ tarihi yoksa). Durma ve tatil eklenmez. Onaylanan son gün YAZILMAZ.
 *  - R2 (kanıtsız KESİNLEŞTİ): durum KESİNLEŞTİ ama gerçek kesinleşme kaydı yok → yeni icra ekseni
 *    önerisi (itiraz izi varsa DURDU_ITIRAZ, yoksa BILINMIYOR). Eski `durum` alanına dokunulmaz.
 */
import { paraTR } from '@/lib/import/hugo'
import { hesapIziJsonu, sureOnerisiHesapla } from '@/lib/konsrucu/sure/hesap'
import { gunNo, gunTR, isoGun } from '@/lib/konsrucu/sure/takvim'
import type { GuvenSinifi, OnarimKodu } from './kurallar'

export type KuruSatir = {
  dosyaId: string
  kod: OnarimKodu
  islem: 'GUNCELLE' | 'EKLE'
  hedefTablo: string
  alan: string
  eskiJson: Record<string, unknown>
  yeniJson: Record<string, unknown>
  kanit: string
  guvenSinifi: GuvenSinifi
}

// ───────────────────────────── R1 · tutar ─────────────────────────────

export type R1Dosya = {
  id: string
  rucuTutari: string | null // Decimal.toString()
  davaMiktari: string | null
  kaynakJson: unknown
  takipAcildi: boolean
}

const R1_ALANLAR = ['rucuTutari', 'davaMiktari'] as const
const ABD_KESIN = /^-?\d{1,3}(,\d{3})+\.\d{1,2}$/
const TL_EKI = /₺|ytl|try|tl/gi

function hamHucre(kaynakJson: unknown, alan: string): string | null {
  const ham = (kaynakJson as { ham?: Record<string, unknown> } | null)?.ham
  const v = ham && typeof ham === 'object' ? ham[alan] : null
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function r1TutarTeshis(dosyalar: R1Dosya[]): KuruSatir[] {
  const out: KuruSatir[] = []
  for (const d of dosyalar) {
    for (const alan of R1_ALANLAR) {
      const mevcutMetin = d[alan]
      const ham = hamHucre(d.kaynakJson, alan)
      if (mevcutMetin == null || !ham) continue
      const mevcut = Number(mevcutMetin)
      const dogru = paraTR(ham)
      if (!Number.isFinite(mevcut) || dogru == null) continue // döviz ya da bozuk hücre: öneri yok
      if (Math.abs(dogru - mevcut) <= 5) continue // zaten doğru
      if (Math.abs(mevcut * 1000 - dogru) > 5) continue // 1000 kat bölünme deseni değil
      const sade = ham.replace(TL_EKI, '').trim()
      let sinif: GuvenSinifi = ABD_KESIN.test(sade) ? 'A' : 'B'
      const notlar = [`Hugo ham hücresi "${ham}" ABD biçiminde; içe aktarma ${mevcut.toFixed(2)} yazmış, doğru okuma ${dogru.toFixed(2)} (1000 kat). Hugo ve dekontla teyit edin.`]
      if (sinif === 'B') notlar.push('Ondalıksız tek virgüllü değer ABD binlik ayracı varsayıldı.')
      if (d.takipAcildi) {
        sinif = 'C'
        notlar.push('Takip açılmış: hukuki değerlendirme Yelda\'da; program ek takip ya da ıslah önermez.')
      }
      out.push({
        dosyaId: d.id, kod: 'R1', islem: 'GUNCELLE', hedefTablo: 'RucuDosyasi', alan,
        eskiJson: { deger: mevcutMetin }, yeniJson: { deger: dogru.toFixed(2) },
        kanit: notlar.join(' '), guvenSinifi: sinif,
      })
    }
  }
  return out
}

// ───────────────────────────── R0 · İİK 67 ─────────────────────────────

export type R0Itiraz = {
  borcluId: string | null
  tarih: Date
  kaynak: 'BORCLU_TAKIP' | 'OLAY_TEYITLI' | 'OLAY_ADAY' | 'BELGE'
  tebligTarihi?: Date | null // itirazın alacaklıya tebliği (yalnız BorcluTakip'ten)
  belgeId?: string | null
  etiket: string // "Borca itiraz evrakı (UYAP)", "Onaylı itiraz kaydı" — kişisel veri yok
}

export type R0Dosya = {
  id: string
  itirazlar: R0Itiraz[]
  /** Açık İİK 67 süreleri (borcluId null = dosya bazında). */
  mevcutIik67: { borcluId: string | null }[]
}

const KAYNAK_SINIF: Record<R0Itiraz['kaynak'], GuvenSinifi> = { BORCLU_TAKIP: 'A', OLAY_TEYITLI: 'B', BELGE: 'B', OLAY_ADAY: 'C' }
const KAYNAK_ONCELIK: Record<R0Itiraz['kaynak'], number> = { BORCLU_TAKIP: 0, OLAY_TEYITLI: 1, BELGE: 2, OLAY_ADAY: 3 }

export function r0Iik67Teshis(dosyalar: R0Dosya[], simdi: Date = new Date()): KuruSatir[] {
  const adaylar: { satir: KuruSatir; kalan: number }[] = []
  for (const d of dosyalar) {
    if (!d.itirazlar.length) continue
    const dosyaBazliVar = d.mevcutIik67.some((m) => m.borcluId == null)
    const borcluBazli = d.itirazlar.some((i) => i.borcluId)
    // Borçlu bazında iz varsa dosya bazındaki (evrak/olay) izler aynı itiraz sayılır ve ayrıca önerilmez.
    const kullanilan = borcluBazli ? d.itirazlar.filter((i) => i.borcluId) : d.itirazlar
    const gruplar = new Map<string, R0Itiraz[]>()
    for (const i of kullanilan) gruplar.set(i.borcluId ?? '-', [...(gruplar.get(i.borcluId ?? '-') ?? []), i])
    for (const [anahtar, liste] of gruplar) {
      const borcluId = anahtar === '-' ? null : anahtar
      if (dosyaBazliVar || d.mevcutIik67.some((m) => m.borcluId === borcluId)) continue
      // En erken itiraz tarihi (ihtiyatlı); eşitlikte daha güvenilir kaynak.
      const secilen = [...liste].sort((a, b) => gunNo(a.tarih) - gunNo(b.tarih) || KAYNAK_ONCELIK[a.kaynak] - KAYNAK_ONCELIK[b.kaynak])[0]
      const teblig = liste.find((x) => x.tebligTarihi)?.tebligTarihi ?? null
      const girdi = { tur: 'IIK67', tetikTarihi: teblig, tetikTuru: teblig ? ('TEBLIG' as const) : null, itirazTarihi: secilen.tarih }
      const oneri = sureOnerisiHesapla(girdi)
      if (!oneri.onerilenIhtiyatli) continue
      const kalan = gunNo(oneri.onerilenIhtiyatli) - gunNo(simdi)
      const kanit = [
        `${secilen.etiket}: itiraz ${gunTR(secilen.tarih)}.`,
        teblig
          ? `İtirazın alacaklıya tebliği ${gunTR(teblig)} → ihtiyatlı son gün ${gunTR(oneri.onerilenIhtiyatli)}.`
          : `Tebliğ tarihi yok: ihtiyatlı alt sınır itiraz + 1 yıl = ${gunTR(oneri.onerilenIhtiyatli)}.`,
        'İİK 67/1, teyit gerekli. Arabuluculuk durması ve tatil eklenmedi; onaylanan son günü avukat defterden girer.',
        kalan < 0 ? `Alt sınır ${-kalan} gün önce geçmiş görünüyor: arabuluculuk ya da dava açılmış olabilir, kontrol edin.` : `Kalan ${kalan} gün.`,
      ].join(' ')
      adaylar.push({
        kalan,
        satir: {
          dosyaId: d.id, kod: 'R0', islem: 'EKLE', hedefTablo: 'Sure', alan: '*',
          eskiJson: {},
          yeniJson: {
            tur: 'IIK67',
            dayanak: 'İİK 67/1',
            borcluId,
            tetikTarihi: teblig ? isoGun(teblig) : null,
            tetikTuru: teblig ? 'TEBLIG' : null,
            itirazTarihi: isoGun(secilen.tarih),
            onerilenIhtiyatli: isoGun(oneri.onerilenIhtiyatli),
            onerilenSonGun: oneri.onerilenSonGun ? isoGun(oneri.onerilenSonGun) : null,
            kaynakBelgeId: secilen.belgeId ?? null,
            hesapIziJson: hesapIziJsonu(girdi, oneri, simdi),
          },
          kanit,
          guvenSinifi: KAYNAK_SINIF[secilen.kaynak],
        },
      })
    }
  }
  // 08 §2(c): önce son günü yaklaşanlar (artan), sonra geçmiş görünenler (en yakın geçmiş önce).
  return adaylar
    .sort((a, b) => {
      const ga = a.kalan >= 0 ? 0 : 1, gb = b.kalan >= 0 ? 0 : 1
      if (ga !== gb) return ga - gb
      return ga === 0 ? a.kalan - b.kalan : b.kalan - a.kalan
    })
    .map((x) => x.satir)
}

// ───────────────────────────── R2 · kanıtsız KESİNLEŞTİ ─────────────────────────────

export type R2Dosya = {
  id: string
  durum: string
  icraEksen: string | null
  /** Dosyada gerçek kesinleşme kaydı var mı (takip-olay.ts kesinlesmeKaydiMi ile servis hesaplar). */
  gercekKesinlesme: boolean
  /** İtiraz izi: ITIRAZ olayı ya da borca itiraz evrakı. */
  itirazIzi: boolean
}

export function r2KesinlestiTeshis(dosyalar: R2Dosya[]): KuruSatir[] {
  const out: KuruSatir[] = []
  for (const d of dosyalar) {
    if (d.durum !== 'KESINLESTI' || d.gercekKesinlesme) continue
    const yeni = d.itirazIzi ? 'DURDU_ITIRAZ' : 'BILINMIYOR'
    if (d.icraEksen === yeni) continue
    out.push({
      dosyaId: d.id, kod: 'R2', islem: 'GUNCELLE', hedefTablo: 'RucuDosyasi', alan: 'icraEksen',
      eskiJson: { deger: d.icraEksen }, yeniJson: { deger: yeni },
      kanit: d.itirazIzi
        ? 'Durum KESİNLEŞTİ ama kesinleşme kaydı yok; itiraz izi var (evrak ya da olay). UYAP\'ta borçlu bazında kontrol edin. Eski durum alanı değişmez.'
        : 'Durum KESİNLEŞTİ ama kesinleşme kaydı ve itiraz izi yok. UYAP\'ta kontrol edin. Eski durum alanı değişmez.',
      guvenSinifi: d.itirazIzi ? 'B' : 'C',
    })
  }
  // itiraz izli (daha riskli) dosyalar önce
  return out.sort((a, b) => (a.guvenSinifi === b.guvenSinifi ? 0 : a.guvenSinifi === 'B' ? -1 : 1))
}
