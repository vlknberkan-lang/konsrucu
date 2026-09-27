/**
 * KonsRücü — Süre hatırlatmalarını gönderen görev · lib/konsrucu/sure/hatirlatma-gorevi.ts (server)
 *
 * Mevcut etkinlik-hatirlatma cron'u (15 dk) tenant başına bunu çağırır — yeni cron AÇILMAZ (07 S24).
 * Adımlar: pencere (bugün…+8 gün) içindeki açık süreler → aynı dosyadaki açık sürelerle tekilleştirme
 * (dosya + tür + borçlu) → hatirlatmaKarari (7/3/1, mükerrer yok) → e-posta → Sure.hatirlatmaJson'a kayıt.
 *
 * B52: EMAIL_SERVICE=console iken e-posta gönderilmez; kayıt "gonderildi: false" düşer ve SistemOlay'a
 * (MAIL_HATA) yazılır. Bu durum cron'u başarısız saymaz (yerelde console olağandır) ama ekranda uyarı çıkar.
 * Saat: gerçek gönderim İstanbul 08:00'den sonra (test için ?to= verilince saat kapısı atlanır).
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { mailGonder } from '@/lib/konsrucu/mail'
import { HATIRLATMA_DISI, hatirlatmaKapsaminda } from '@/lib/konsrucu/aktiflik'
import { bugunIstBasi } from '@/lib/konsrucu/format'
import { epostaKipi, gonderimSaatiMi, hatirlatmaKarari, hatirlatmaKaydiEkle, tekillestir, type EpostaKipi, type HatirlatmaKaydi } from './hatirlatma'
import { sureHatirlatmaMail } from './hatirlatma-mail'
import { ACIK_DURUMLAR, SURE_TUR_KODLARI, sureTuru } from './turler'

const GUN_MS = 86_400_000
const PENCERE_GUN = 8

export type SureHatirlatmaDetay = { tenant: string; id: string; tur: string; esik?: number; hedef?: string; ok: boolean; kip?: string; err?: string }

export type SureHatirlatmaSonucu = {
  atlandi?: 'saat'
  aday: number
  due: number
  gonderilen: number
  gonderilmedi: number // console kipi: kaydedildi ama gönderilmedi (B52)
  hata: number
  tekilAtlanan: number
  detay: SureHatirlatmaDetay[]
}

export type SureHatirlatmaGirdi = {
  musteriId: string
  musteriAd: string
  alicilar: string[]
  aliciAd: string
  /** Birden çok tenant varsa konuya tenant adı eklenir (etkinlik hatırlatmasıyla aynı). */
  konuEki?: (konu: string) => string
  simdi?: Date
  dry?: boolean
  /** ?to= test alıcısı verildiyse saat kapısı atlanır ve eşik kaydı YAZILMAZ (ekibin gerçek hatırlatması düşmesin). */
  test?: boolean
  baseUrl: string
  kip?: EpostaKipi
}

const SURE_HATIRLATMA_SELECT = {
  id: true, dosyaId: true, borcluId: true, tur: true, dayanak: true, durum: true, silindiAt: true,
  onaylananSonGun: true, onerilenIhtiyatli: true, hatirlatmaJson: true,
  dosya: { select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, icraDosyaNo: true, durum: true, uyapDurum: true } },
} satisfies Prisma.SureSelect

export async function sureHatirlatmalariniIsle(g: SureHatirlatmaGirdi): Promise<SureHatirlatmaSonucu> {
  const simdi = g.simdi ?? new Date()
  const kip = g.kip ?? epostaKipi()
  const sonuc: SureHatirlatmaSonucu = { aday: 0, due: 0, gonderilen: 0, gonderilmedi: 0, hata: 0, tekilAtlanan: 0, detay: [] }
  if (!g.test && !gonderimSaatiMi(simdi)) return { ...sonuc, atlandi: 'saat' }

  const bas = bugunIstBasi(simdi)
  const bit = new Date(bas.getTime() + PENCERE_GUN * GUN_MS)
  const epostaTurleri = SURE_TUR_KODLARI.filter((k) => sureTuru(k).eposta)
  const temel: Prisma.SureWhereInput = {
    silindiAt: null,
    durum: { in: [...ACIK_DURUMLAR] },
    tur: { in: epostaTurleri },
    dosya: { musteriId: g.musteriId, durum: { notIn: [...HATIRLATMA_DISI] } },
  }
  const pencere = await prisma.sure.findMany({
    where: {
      ...temel,
      OR: [
        { onaylananSonGun: { gte: bas, lt: bit } },
        { onaylananSonGun: null, onerilenIhtiyatli: { gte: bas, lt: bit } },
      ],
    },
    select: { dosyaId: true },
    take: 500,
  })
  if (!pencere.length) return sonuc

  // Tekilleştirme pencere dışındaki kardeş satırları da görmeli (ör. onaylanan günü ileride olan R0 aktarımı).
  const dosyaIds = [...new Set(pencere.map((p) => p.dosyaId))]
  const tumu = await prisma.sure.findMany({ where: { ...temel, dosyaId: { in: dosyaIds } }, select: SURE_HATIRLATMA_SELECT, take: 2000 })
  sonuc.aday = tumu.length
  const gruplar = tekillestir(tumu)
  sonuc.tekilAtlanan = gruplar.reduce((n, gr) => n + gr.atlananIds.length, 0)

  const konsolaDusenler: string[] = []
  for (const { sure: s, digerGecmis } of gruplar) {
    if (!hatirlatmaKapsaminda(s.dosya)) continue
    const karar = hatirlatmaKarari(s, simdi, kip, digerGecmis)
    if (!karar.gonder) continue
    sonuc.due++
    const t = sureTuru(s.tur)
    const dosyaNo = s.dosya.hukukDosyaNo ?? s.dosya.hasarDosyaNo ?? s.dosyaId.slice(0, 8)
    const mail = sureHatirlatmaMail({
      aliciAd: g.aliciAd,
      sure: { turEtiket: t.etiket, turAd: t.ad, dayanak: s.dayanak, hedefTarih: karar.hedefTarih, hedefKaynak: karar.kaynak, kalanGun: karar.kalan },
      dosya: { dosyaNo, icraNo: s.dosya.icraDosyaNo },
      dosyaUrl: `${g.baseUrl}/akilli-giris/${s.dosyaId}`,
    })
    const konu = g.konuEki ? g.konuEki(mail.konu) : mail.konu
    const temelDetay = { tenant: g.musteriAd, id: s.id, tur: s.tur, esik: karar.esik, hedef: karar.hedef }
    if (g.dry) { sonuc.detay.push({ ...temelDetay, ok: true, kip: kip.kip }); continue }

    let kayit: HatirlatmaKaydi
    if (!kip.gercek) {
      kayit = { esik: karar.esik, hedef: karar.hedef, kaynak: karar.kaynak, at: simdi.toISOString(), kip: kip.kip, gonderildi: false, hata: "E-posta kipi 'console': gönderilmedi" }
      sonuc.gonderilmedi++
      konsolaDusenler.push(s.id)
      sonuc.detay.push({ ...temelDetay, ok: false, kip: kip.kip, err: 'console kipi: gönderilmedi' })
    } else {
      const r = await mailGonder({ to: g.alicilar, konu, html: mail.html, text: mail.text })
      kayit = { esik: karar.esik, hedef: karar.hedef, kaynak: karar.kaynak, at: simdi.toISOString(), kip: kip.kip, gonderildi: r.ok, ...(r.ok ? {} : { hata: (r.error ?? 'bilinmeyen hata').slice(0, 300) }) }
      if (r.ok) sonuc.gonderilen++
      else sonuc.hata++
      sonuc.detay.push({ ...temelDetay, ok: r.ok, kip: kip.kip, err: r.error })
    }
    // Test alıcısına (?to=) giden hatırlatma eşiği "gönderildi" saymaz — yoksa ekip gerçek hatırlatmayı hiç almaz.
    if (!g.test) await prisma.sure.update({ where: { id: s.id }, data: { hatirlatmaJson: hatirlatmaKaydiEkle(s.hatirlatmaJson, kayit) as unknown as Prisma.InputJsonValue } })
  }

  if (konsolaDusenler.length) {
    const { sistemOlayKaydet } = await import('@/lib/konsrucu/sistem-olay')
    await sistemOlayKaydet('MAIL_HATA', 'etkinlik-hatirlatma/sure', `${konsolaDusenler.length} süre hatırlatması e-posta kipi 'console' olduğu için GÖNDERİLMEDİ (${g.musteriAd})`, { sureIds: konsolaDusenler })
  }
  return sonuc
}
