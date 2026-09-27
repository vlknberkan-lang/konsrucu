/**
 * KonsRücü — "Telefon hazır" özeti · lib/konsrucu/arabuluculuk/telefon-hazir.ts (saf)
 *
 * Arabulucu ya da karşı taraf aradığında avukatın tek ekranda görmesi gerekenler (06 2(f)):
 * tutar, itiraz kapsamı, önceki görüşmeler/teklifler, müvekkil onay sınırı. Kişisel veri (TCKN, telefon, IBAN)
 * bu özete GİRMEZ; borçlu adları sıra numarasıyla gösterilir.
 */
import { onaySiniri, type OnayKaydiOzet } from './onay'
import { ARABULUCULUK_SONUC_ETIKET, ARABULUCULUK_TUR_ETIKET, type ArabuluculukSonucu, type ArabuluculukTuru } from './sabitler'
import { trGun } from './tarih'

export type TelefonHazirGirdi = {
  hukukDosyaNo: string | null
  icra: { daire: string | null; esas: string | null }
  takipToplam: number | null // geçerli TakipTalebi.toplam (yoksa asıl alacak)
  itirazlar: { sira: number; tip: string | null; tutar: number | null; kapsam: unknown }[]
  arabuluculuk: { tur: string | null; basvuruNo: string | null; buroNo: string | null; uyapDosyaNo: string | null; sonuc: string | null } | null
  toplantilar: { baslar: Date; durum: string; sonucNot: string | null }[]
  onaylar: OnayKaydiOzet[]
}

export type TelefonHazirOzet = {
  satirlar: { etiket: string; deger: string }[]
  onaySiniri: string
  gorusmeler: string[]
  uyarilar: string[]
  metin: string // kopyalanabilir düz metin
}

const para = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' TL'

function kapsamMetni(k: unknown): string {
  if (!k || typeof k !== 'object') return ''
  const e = Object.entries(k as Record<string, unknown>).filter(([, v]) => v === true).map(([a]) => a)
  return e.length ? ` (${e.join(', ')})` : ''
}

export function telefonHazirOzeti(g: TelefonHazirGirdi): TelefonHazirOzet {
  const itirazToplam = g.itirazlar.reduce((a, x) => a + (x.tutar ?? 0), 0)
  const itirazMetin = g.itirazlar.length
    ? g.itirazlar.map((i) => `Borçlu-${i.sira}: ${i.tip === 'KISMI' ? 'kısmi' : i.tip === 'TAM' ? 'tam' : 'kapsam belirsiz'} itiraz${i.tutar != null ? ` · ${para(i.tutar)}` : ''}${kapsamMetni(i.kapsam)}`).join(' · ')
    : 'Onaylı itiraz kaydı yok'
  const s = onaySiniri(g.onaylar)
  const onayMetni = s
    ? `${s.tutar != null ? para(s.tutar) : 'tutar yazılmamış'}${s.unvan ? ` · ${s.unvan}` : ''}${s.tarih ? ` · ${trGun(s.tarih)}` : ''}`
    : 'Sulh/iskonto onayı yok: teklif kabul edilemez, müvekkile sorun'
  const a = g.arabuluculuk
  const satirlar = [
    { etiket: 'Dosya', deger: [g.hukukDosyaNo, g.icra.daire, g.icra.esas].filter(Boolean).join(' · ') || '—' },
    { etiket: 'Takip toplamı', deger: para(g.takipToplam) },
    { etiket: 'İtiraz edilen', deger: g.itirazlar.length ? para(itirazToplam) : '—' },
    { etiket: 'İtiraz kapsamı', deger: itirazMetin },
    {
      etiket: 'Arabuluculuk',
      deger: a
        ? [a.tur ? ARABULUCULUK_TUR_ETIKET[a.tur as ArabuluculukTuru] ?? a.tur : 'tür seçilmedi', a.basvuruNo && `başvuru ${a.basvuruNo}`, a.buroNo && `büro ${a.buroNo}`, a.uyapDosyaNo && `UYAP ${a.uyapDosyaNo}`, a.sonuc && (ARABULUCULUK_SONUC_ETIKET[a.sonuc as ArabuluculukSonucu] ?? a.sonuc)].filter(Boolean).join(' · ')
        : 'kayıt yok',
    },
  ]
  const gorusmeler = g.toplantilar
    .slice()
    .sort((x, y) => x.baslar.getTime() - y.baslar.getTime())
    .map((t) => `${trGun(t.baslar)} · ${t.durum === 'YAPILDI' ? 'yapıldı' : t.durum === 'YAPILMADI' ? 'yapılmadı' : t.durum === 'ERTELENDI' ? 'ertelendi' : t.durum === 'IPTAL' ? 'iptal' : 'planlandı'}${t.sonucNot ? ` · ${t.sonucNot.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`)
  const uyarilar: string[] = []
  if (!s) uyarilar.push('Müvekkil onay sınırı yok: telefonda teklif kabul etmeyin.')
  if (!g.itirazlar.length) uyarilar.push('İtiraz kapsamı onaylanmamış.')
  const metin = [
    'TELEFON HAZIR · arabuluculuk özeti',
    ...satirlar.map((r) => `${r.etiket}: ${r.deger}`),
    `Onay sınırı: ${onayMetni}`,
    gorusmeler.length ? `Görüşmeler: ${gorusmeler.join(' | ')}` : 'Görüşmeler: kayıt yok',
    ...uyarilar.map((u) => `(!) ${u}`),
  ].join('\n')
  return { satirlar, onaySiniri: onayMetni, gorusmeler, uyarilar, metin }
}
