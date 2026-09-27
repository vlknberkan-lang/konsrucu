/**
 * KonsRücü — dava ön kontrolü (dava ön kontrol kapısı) · lib/konsrucu/dava/on-kontrol.ts (saf)
 *
 * 06 2(g) ve §8.4. Eksik varken "imzaya hazır" KİLİTLİDİR.
 *  - Müvekkil onayı yoksa kapı tümüyle kilitli; tek istisna İİK 67 ihtiyatlı son güne ≤ 14 gün + yazılı gerekçe
 *    (arabuluculuk/onay.ts). Onay maddesi gerekçeyle "geçilemez"; yalnız istisna kaydıyla açılır.
 *  - Diğer maddeler avukatın yazılı gerekçesiyle aşılabilir (gerekçe Aktivite'ye ve Dava.onKontrolJson'a yazılır).
 *    Aşılamayanlar: dava şartı arabuluculukta son tutanak yokluğu.
 *  - Görevli mahkeme ve usulü AVUKAT seçer; program mahkeme adı önermez.
 */
import { musteriOnayiKapisi, type KapiDurumu, type OnayKaydiOzet } from '../arabuluculuk/onay'
import { gunFarki, trGun } from '../arabuluculuk/tarih'
import { caprazKontrol } from './capraz-kontrol'

export type MaddeDurumu = 'TAMAM' | 'EKSIK' | 'UYARI' | 'ENGEL' | 'GECILDI' | 'BILGI'
export type OnKontrolMaddesi = {
  kod: string
  baslik: string
  durum: MaddeDurumu
  aciklama: string
  gecilebilir: boolean
  gerekce?: string
  etiket?: string
}
export type Gecis = { kod: string; gerekce: string; gecenId?: string | null; at?: string }

export type OnKontrolGirdi = {
  onaylar: OnayKaydiOzet[]
  ihtiyatliSonGun: Date | null
  onaylananSonGun: Date | null
  yolSecimi: string | null
  arabuluculuk: { tur: string | null; sonTutanakTarihi: Date | null; sonuc: string | null; sonTutanakBelgeId: string | null } | null
  itirazEdenTeyitliSayisi: number
  itirazEdilenToplam: number | null
  takipTalebiVar: boolean
  mahkemeTuru: string | null
  usul: string | null
  vekaletnameVar: boolean
  harcAvansGirildi: boolean
  gecisler: Gecis[]
}

export type OnKontrolSonucu = {
  kilitli: boolean
  kilitMesaji: string | null
  onayKapisi: KapiDurumu
  maddeler: OnKontrolMaddesi[]
  imzayaHazir: boolean
  ilkEksik: OnKontrolMaddesi | null
}

const para = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' TL'

export function davaOnKontrol(g: OnKontrolGirdi, simdi: Date = new Date()): OnKontrolSonucu {
  const kapi = musteriOnayiKapisi('DAVA_ACMA', g.onaylar, { ihtiyatliSonGun: g.ihtiyatliSonGun, simdi })
  const m: OnKontrolMaddesi[] = []

  // 1 müvekkil onayı
  if (kapi.acik && kapi.neden === 'ONAY') {
    m.push({ kod: 'MUVEKKIL_ONAYI', baslik: 'Müvekkil onayı', durum: 'TAMAM', aciklama: `${kapi.onay.onaylayanUnvan ?? 'Müvekkil'}, ${trGun(kapi.onay.alinmaAt)} (onay kaydı)`, gecilebilir: false })
  } else if (kapi.acik && kapi.neden === 'ISTISNA') {
    m.push({ kod: 'MUVEKKIL_ONAYI', baslik: 'Müvekkil onayı', durum: 'GECILDI', aciklama: 'Süre koruma istisnasıyla açıldı; müvekkile bildirim taslağı hazırlanmalı.', gecilebilir: false, gerekce: kapi.onay.istisnaGerekce ?? undefined })
  } else {
    m.push({ kod: 'MUVEKKIL_ONAYI', baslik: 'Müvekkil onayı', durum: 'ENGEL', aciklama: kapi.mesaj + (kapi.istisnaMumkun ? ` İhtiyatlı son güne ${kapi.kalanGun} gün kaldı: yazılı gerekçeyle istisna kullanılabilir.` : ''), gecilebilir: false })
  }

  // 2 son tutanak
  const a = g.arabuluculuk
  if (!a) {
    if (g.yolSecimi === 'ARABULUCULUK_IIK67') m.push({ kod: 'SON_TUTANAK', baslik: 'Son tutanak', durum: 'EKSIK', aciklama: 'Arabuluculuk kaydı yok.', gecilebilir: true })
    else m.push({ kod: 'SON_TUTANAK', baslik: 'Son tutanak', durum: 'BILGI', aciklama: 'Arabuluculuk kaydı yok (seçilen yol arabuluculuk değil).', gecilebilir: true })
  } else if (!a.sonTutanakTarihi) {
    const sartli = a.tur === 'DAVA_SARTI'
    m.push({ kod: 'SON_TUTANAK', baslik: 'Son tutanak', durum: sartli ? 'ENGEL' : 'EKSIK', aciklama: sartli ? 'Dava şartı arabuluculukta son tutanak yok: kırmızı engel.' : 'Son tutanak tarihi girilmedi.', gecilebilir: !sartli, etiket: sartli ? 'HUAK 18/A · teyit gerekli' : undefined })
  } else if (a.sonuc === 'ANLASMA') {
    m.push({ kod: 'SON_TUTANAK', baslik: 'Son tutanak', durum: 'ENGEL', aciklama: `${trGun(a.sonTutanakTarihi)} · anlaşma: anlaşılan kalem için dava açılmaz.`, gecilebilir: true })
  } else {
    const belge = a.sonTutanakBelgeId ? 'belge EK-1 olacak' : 'belge yüklenmedi'
    m.push({
      kod: 'SON_TUTANAK',
      baslik: 'Son tutanak',
      durum: a.sonTutanakBelgeId ? (a.sonuc === 'KISMEN' ? 'UYARI' : 'TAMAM') : 'UYARI',
      aciklama: `${trGun(a.sonTutanakTarihi)} · ${a.sonuc ? a.sonuc.toLocaleLowerCase('tr') : 'sonuç yok'} · ${belge}${a.sonuc === 'KISMEN' ? ' · dava yalnız anlaşılmayan kalemle sınırlı' : ''}`,
      gecilebilir: true,
    })
  }

  // 3 İİK 67 onaylanan son gün
  if (g.onaylananSonGun) {
    m.push({ kod: 'IIK67_SON_GUN', baslik: 'İİK 67 onaylanan son gün', durum: 'TAMAM', aciklama: `${trGun(g.onaylananSonGun)} · kalan ${gunFarki(simdi, g.onaylananSonGun)} gün`, gecilebilir: true, etiket: 'teyit gerekli' })
  } else {
    m.push({ kod: 'IIK67_SON_GUN', baslik: 'İİK 67 onaylanan son gün', durum: 'EKSIK', aciklama: g.ihtiyatliSonGun ? `Onaylanmadı (ihtiyatlı öneri ${trGun(g.ihtiyatliSonGun)}).` : 'İİK 67 süre kaydı yok.', gecilebilir: true, etiket: 'teyit gerekli' })
  }

  // 4 davalılar
  m.push(g.itirazEdenTeyitliSayisi > 0
    ? { kod: 'DAVALILAR', baslik: 'Davalılar', durum: 'TAMAM', aciklama: `Süresinde itiraz eden, teyitli ${g.itirazEdenTeyitliSayisi} borçlu`, gecilebilir: true }
    : { kod: 'DAVALILAR', baslik: 'Davalılar', durum: 'EKSIK', aciklama: 'İtirazı onaylanmış borçlu yok.', gecilebilir: true })

  // 5 dava değeri
  m.push(g.itirazEdilenToplam != null && g.itirazEdilenToplam > 0
    ? { kod: 'DAVA_DEGERI', baslik: 'Dava değeri', durum: 'TAMAM', aciklama: `İtiraz edilen tutar: ${para(g.itirazEdilenToplam)}`, gecilebilir: true }
    : { kod: 'DAVA_DEGERI', baslik: 'Dava değeri', durum: 'EKSIK', aciklama: 'İtiraz edilen tutar bilinmiyor.', gecilebilir: true })

  // 6 talep kalemleri
  m.push(g.takipTalebiVar
    ? { kod: 'TALEP_KALEMLERI', baslik: 'Talep kalemleri', durum: 'TAMAM', aciklama: 'Takip talebi kaydı var: dilekçedeki kalemler bunu aşmamalı (faiz türü aynı).', gecilebilir: true }
    : { kod: 'TALEP_KALEMLERI', baslik: 'Talep kalemleri', durum: 'EKSIK', aciklama: 'Geçerli takip talebi kaydı yok.', gecilebilir: true })

  // 7 görevli mahkeme · 8 usul (avukat seçer)
  m.push(g.mahkemeTuru
    ? { kod: 'GOREVLI_MAHKEME', baslik: 'Görevli mahkeme', durum: 'TAMAM', aciklama: 'Avukat seçti.', gecilebilir: true }
    : { kod: 'GOREVLI_MAHKEME', baslik: 'Görevli mahkeme', durum: 'EKSIK', aciklama: 'Avukat seçer (kriterlere bakın).', gecilebilir: true })
  m.push(g.usul
    ? { kod: 'USUL', baslik: 'Usul', durum: 'TAMAM', aciklama: g.usul === 'BASIT' ? 'Basit usul' : 'Yazılı usul', gecilebilir: true }
    : { kod: 'USUL', baslik: 'Usul', durum: 'EKSIK', aciklama: 'Avukat seçer.', gecilebilir: true })

  // 9 çapraz kontrol
  const ck = caprazKontrol({ mahkemeTuru: g.mahkemeTuru, arabuluculukTuru: a?.tur ?? null, arabuluculukVar: !!a, sonTutanakVar: !!a?.sonTutanakTarihi })
  if (!ck.length) {
    m.push({ kod: 'CAPRAZ_KONTROL', baslik: 'Çapraz kontrol', durum: g.mahkemeTuru ? 'TAMAM' : 'BILGI', aciklama: g.mahkemeTuru ? 'Mahkeme türü ile arabuluculuk türü arasında bilinen çelişki yok.' : 'Mahkeme türü seçilince yapılır.', gecilebilir: true })
  } else {
    for (const u of ck) {
      if (u.kod === 'CK-SARTLI-TUTANAK-YOK') continue // SON_TUTANAK maddesinde engel olarak var
      m.push({ kod: u.kod, baslik: 'Çapraz kontrol', durum: u.seviye === 'KIRMIZI' ? 'ENGEL' : 'UYARI', aciklama: u.mesaj, gecilebilir: u.gecilebilir, etiket: u.dayanak })
    }
  }

  // 10 vekaletname · 11 harç ve avans (elle, bilgi)
  m.push(g.vekaletnameVar
    ? { kod: 'VEKALETNAME', baslik: 'Vekâletname', durum: 'TAMAM', aciklama: 'Dosyada var.', gecilebilir: true }
    : { kod: 'VEKALETNAME', baslik: 'Vekâletname', durum: 'EKSIK', aciklama: 'Dosyada vekâletname evrakı bulunamadı.', gecilebilir: true })
  m.push({ kod: 'HARC_AVANS', baslik: 'Harç ve avans', durum: g.harcAvansGirildi ? 'TAMAM' : 'BILGI', aciklama: g.harcAvansGirildi ? 'Elle girildi.' : 'Tutarı elle girin (tarife hesabı ertelendi).', gecilebilir: true })

  // gerekçeyle geçişler
  for (const madde of m) {
    if (!madde.gecilebilir || madde.durum === 'TAMAM' || madde.durum === 'BILGI' || madde.durum === 'GECILDI') continue
    const gc = g.gecisler.find((x) => x.kod === madde.kod && (x.gerekce ?? '').trim().length > 0)
    if (gc) {
      madde.durum = 'GECILDI'
      madde.gerekce = gc.gerekce
    }
  }

  const kilitli = !kapi.acik
  const hazirDurumlar: MaddeDurumu[] = ['TAMAM', 'GECILDI', 'BILGI']
  const ilkEksik = m.find((x) => !hazirDurumlar.includes(x.durum)) ?? null
  return {
    kilitli,
    kilitMesaji: kilitli ? 'Müvekkil onayı kaydı yokken dava ön kontrolü kilitli.' : null,
    onayKapisi: kapi,
    maddeler: m,
    imzayaHazir: !kilitli && !ilkEksik,
    ilkEksik,
  }
}

/** onKontrolJson / Aktivite detayından geçiş listesini oku. */
export function gecisleriOku(...kaynaklar: unknown[]): Gecis[] {
  const out: Gecis[] = []
  for (const k of kaynaklar) {
    const liste = Array.isArray(k) ? k : k && typeof k === 'object' && Array.isArray((k as { gecisler?: unknown }).gecisler) ? (k as { gecisler: unknown[] }).gecisler : k ? [k] : []
    for (const x of liste) {
      if (x && typeof x === 'object' && typeof (x as Gecis).kod === 'string' && typeof (x as Gecis).gerekce === 'string') out.push(x as Gecis)
    }
  }
  return out
}
