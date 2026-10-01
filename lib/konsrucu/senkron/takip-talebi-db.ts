/**
 * KonsRücü — Takip talebi: veritabanı katmanı · lib/konsrucu/senkron/takip-talebi-db.ts (server-only)
 *
 *  - takipTalebiYaz(): değişmez kayıt kuralı (taslak yerinde güncellenir; dondurulmuş kayıt yeni sürüm açar).
 *    Dosya başına tek geçerli kayıt kısmi tekil indeksle korunur (007_takip_talebi.sql); sürüm yarışını
 *    @@unique([dosyaId, surum]) keser.
 *  - takipTalebiGorunumu(): program ekranı (faiz seçimi, önizleme, hesap izi, kilit sebepleri). Kopilotla
 *    AYNI hesap (takipAlacakHesapla) kullanılır: "kopilot özeti = programdaki önizleme" (06 §2(c) D4 ölçütü).
 * Hukuki kayıttır: silinmez (silindiAt); tüm sorgular dosya + müvekkil kapsamından geçer.
 */
import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { oranlariOku, sonDekontTarihi, type DekontGirdi } from '@/lib/konsrucu/faiz'
import { footerOlustur, aciklamaTam } from '@/lib/konsrucu/takip'
import { yetkiliIcraOner } from '@/lib/konsrucu/adli-rehber'
import { listeKaynagi } from '@/lib/konsrucu/oneri/kaynaklar'
import {
  faizTalepMetni, hesapIziHalaGecerli, kopilotFaizDestekli, rucuHesapIzi, surumKarari, takipAlacakHesapla, takipIsoGun,
  takipTalebiKilitSebepleri, type AlacakSonucu, type FaizSecimi, type HesapIzi, type SurumKarari,
} from './takip-talebi'

type Tx = Prisma.TransactionClient

export type TakipTalebiAlanlari = {
  asilAlacak?: number
  islemisFaiz?: number | null
  toplam?: number | null
  faizTuru?: string | null
  faizOraniMetni?: string | null
  faizBaslangicTuru?: string | null
  faizBaslangic?: Date | null
  hesapIziJson?: Prisma.InputJsonValue
  onaylayanId?: string | null
}

const dec = (n: number | null | undefined) => (n == null ? null : new Prisma.Decimal(Math.round(n * 100) / 100))

/**
 * Geçerli takip talebine yazar. `varsayilanAsil`: ilk kayıtta asıl alacak bilinmiyorsa (asilAlacak zorunlu kolon).
 */
export async function takipTalebiYaz(tx: Tx, dosyaId: string, alanlar: TakipTalebiAlanlari, varsayilanAsil: number): Promise<{ id: string; surum: number; islem: SurumKarari }> {
  const mevcut = await tx.takipTalebi.findFirst({ where: { dosyaId, gecerli: true, silindiAt: null } })
  const islem = surumKarari(mevcut)
  const veri = {
    ...(alanlar.asilAlacak != null ? { asilAlacak: dec(alanlar.asilAlacak)! } : {}),
    ...(alanlar.islemisFaiz !== undefined ? { islemisFaiz: dec(alanlar.islemisFaiz) } : {}),
    ...(alanlar.toplam !== undefined ? { toplam: dec(alanlar.toplam) } : {}),
    ...(alanlar.faizTuru !== undefined ? { faizTuru: alanlar.faizTuru } : {}),
    ...(alanlar.faizOraniMetni !== undefined ? { faizOraniMetni: alanlar.faizOraniMetni } : {}),
    ...(alanlar.faizBaslangicTuru !== undefined ? { faizBaslangicTuru: alanlar.faizBaslangicTuru } : {}),
    ...(alanlar.faizBaslangic !== undefined ? { faizBaslangic: alanlar.faizBaslangic } : {}),
    ...(alanlar.hesapIziJson !== undefined ? { hesapIziJson: alanlar.hesapIziJson } : {}),
    ...(alanlar.onaylayanId !== undefined ? { onaylayanId: alanlar.onaylayanId } : {}),
  }
  if (islem === 'GUNCELLE' && mevcut) {
    // yarış koruması: okuma ile yazım arasında kesinleşmiş (dondurulmuş) talep ezilmez
    const n = await tx.takipTalebi.updateMany({ where: { id: mevcut.id, dondurulduAt: null }, data: veri })
    if (n.count !== 1) throw new Error('Takip talebi bu arada kesinleşti; sayfayı yenileyip yeniden deneyin.')
    return { id: mevcut.id, surum: mevcut.surum, islem }
  }
  const max = await tx.takipTalebi.aggregate({ where: { dosyaId }, _max: { surum: true } })
  const surum = (max._max.surum ?? 0) + 1
  if (islem === 'YENI_SURUM' && mevcut) {
    await tx.takipTalebi.update({ where: { id: mevcut.id }, data: { gecerli: false } })
    const r = await tx.takipTalebi.create({
      data: {
        dosyaId, surum, gecerli: true, kaynak: 'ELLE',
        asilAlacak: mevcut.asilAlacak, islemisFaiz: mevcut.islemisFaiz, toplam: mevcut.toplam,
        faizTuru: mevcut.faizTuru, faizOraniMetni: mevcut.faizOraniMetni, faizBaslangicTuru: mevcut.faizBaslangicTuru,
        faizBaslangic: mevcut.faizBaslangic, takipYolu: mevcut.takipYolu, ornekNo: mevcut.ornekNo, takipTarihi: mevcut.takipTarihi,
        hesapIziJson: (mevcut.hesapIziJson ?? undefined) as Prisma.InputJsonValue | undefined, onaylayanId: mevcut.onaylayanId,
        ...veri,
      },
      select: { id: true, surum: true },
    })
    return { ...r, islem }
  }
  const r = await tx.takipTalebi.create({
    data: { dosyaId, surum, gecerli: true, kaynak: 'ELLE', asilAlacak: dec(alanlar.asilAlacak ?? varsayilanAsil)!, ...veri },
    select: { id: true, surum: true },
  })
  return { ...r, islem }
}

// ── Program ekranı ──────────────────────────────────────────────────────────
export type HesapIziOnayi = { kullaniciId: string; kullaniciAd: string | null; at: string; asilAlacak: number }

export type TakipTalebiGorunumu = {
  dosyaId: string
  takipTalebi: {
    id: string; surum: number; asilAlacak: number; toplam: number | null; islemisFaizElle: number | null
    dondurulduAt: string | null; takipTarihi: string | null
  } | null
  surumler: { surum: number; gecerli: boolean; createdAt: string; dondurulduAt: string | null }[]
  faiz: { faizTuru: string | null; faizOraniMetni: string | null; faizBaslangicTuru: string | null; faizBaslangic: string | null }
  talepMetni: string | null
  kopilotDestekli: boolean
  hesapIzi: HesapIzi
  hesapIziOnayi: HesapIziOnayi | null
  hesapIziGecerli: boolean
  alacak: AlacakSonucu
  avukatOnayi: boolean
  tevziEdildi: boolean
  kilitSebepleri: string[]
  /** Kilit sebepleri dosya ekranının hazırlık maddelerine göre gruplu (Borçlular · Dosya bilgileri · Faiz · Avukat onayı). */
  kontrol: { borclu: string[]; dosya: string[]; faiz: string[]; onay: string[] }
  /** Açıklama düzenleyicisi için: kayıtlı ham açıklama + şablon alanları (UYAP takip açıklaması tek yerden düzenlenir). */
  aciklamaDuzen: { ham: string; kazaTarihi: string; sigortaliPlaka: string; karsiPlaka: string; alacakliUnvan: string }
  onizleme: {
    alacakli: string | null
    borclular: { ad: string; tur: string }[]
    adliye: string | null
    yolOrnek: string
    aciklama: string
  }
}

type Cikarim = { aciklama?: string | null; onay?: { ok?: boolean }; tevzi?: unknown }

const bugunIst = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)

function borcluTuru(tcVkn: string | null): string {
  const t = (tcVkn ?? '').replace(/\D/g, '')
  return t.length === 10 ? 'tüzel kişi (VKN)' : t.length === 11 ? 'gerçek kişi' : 'kimlik no eksik'
}

export async function takipTalebiGorunumu(dosyaId: string, musteriId: string): Promise<TakipTalebiGorunumu | null> {
  const d = await prisma.rucuDosyasi.findFirst({
    where: { id: dosyaId, musteriId },
    select: {
      id: true, rucuTutari: true, asilAlacak: true, rucuOrani: true, faizTutari: true, faizBaslangic: true, faizBitis: true,
      kazaYeri: true, il: true, cikarimJson: true, kaynakJson: true, kazaTarihi: true, hasarTarihi: true, sigortaliPlaka: true, karsiPlaka: true,
      borclular: { select: { adUnvan: true, tcVkn: true, teyitDurumu: true } },
      odemeler: { select: { tarih: true, tutar: true, haricMi: true } },
      takipTalepleri: {
        where: { silindiAt: null },
        orderBy: { surum: 'desc' },
        take: 10,
        select: {
          id: true, surum: true, gecerli: true, asilAlacak: true, islemisFaiz: true, toplam: true, faizTuru: true, faizOraniMetni: true,
          faizBaslangicTuru: true, faizBaslangic: true, hesapIziJson: true, dondurulduAt: true, takipTarihi: true, createdAt: true,
        },
      },
    },
  })
  if (!d) return null
  const ay = await prisma.ayarlar.findUnique({ where: { musteriId }, select: { alacakliUnvan: true, mersis: true, faizJson: true, aciklamaFooter: true } })
  const cj = (d.cikarimJson ?? {}) as Cikarim
  const tt = d.takipTalepleri.find((t) => t.gecerli) ?? null

  const dekontlar: DekontGirdi[] = d.odemeler.map((o) => ({ tarih: o.tarih ? o.tarih.toISOString().slice(0, 10) : null, tutar: o.tutar != null ? Number(o.tutar) : 0, haricMi: o.haricMi }))
  const hesapIzi = rucuHesapIzi({ dekontlar, rucuOrani: d.rucuOrani, hugoRucuTutari: d.rucuTutari != null ? Number(d.rucuTutari) : null, excelEsas: listeKaynagi(d.kaynakJson) === 'zurich' })
  const onay = ((tt?.hesapIziJson ?? null) as { onay?: HesapIziOnayi | null } | null)?.onay ?? null
  const hesapIziGecerli = !!onay && hesapIziHalaGecerli(onay.asilAlacak, hesapIzi.asilAlacak)

  const faiz: FaizSecimi = {
    faizTuru: tt?.faizTuru ?? null, faizOraniMetni: tt?.faizOraniMetni ?? null,
    faizBaslangicTuru: tt?.faizBaslangicTuru ?? null, faizBaslangic: tt?.faizBaslangic ?? null,
  }
  const anapara = tt ? Number(tt.asilAlacak) : hesapIzi.asilAlacak ?? (d.rucuTutari != null ? Number(d.rucuTutari) : d.asilAlacak != null ? Number(d.asilAlacak) : 0)
  const faizBas = tt?.faizBaslangicTuru === 'TEK_TARIH' ? takipIsoGun(tt.faizBaslangic) : tt ? sonDekontTarihi(dekontlar) : d.faizBaslangic ? d.faizBaslangic.toISOString().slice(0, 10) : null
  const alacak = takipAlacakHesapla({
    anapara,
    islemisFaizElle: tt?.islemisFaiz != null ? Number(tt.islemisFaiz) : d.faizTutari != null ? Number(d.faizTutari) : null,
    dekontlar,
    faizBaslangic: faizBas,
    faizBitis: d.faizBitis ? d.faizBitis.toISOString().slice(0, 10) : null,
    oranlar: oranlariOku(ay?.faizJson),
    bugun: bugunIst(),
  })

  const avukatOnayi = !!cj.onay?.ok
  const tevziEdildi = !!cj.tevzi || !!tt?.dondurulduAt
  // Eklentinin ön kontrolüyle (app/api/uyap/takip-hedefler) AYNI engeller: düğme açık görünüp eklenti reddetmesin.
  const kontrol = { borclu: [] as string[], dosya: [] as string[], faiz: [] as string[], onay: [] as string[] }
  kontrol.faiz.push(...takipTalebiKilitSebepleri(tt ? { ...faiz, asilAlacak: anapara, hesapIziOnayli: hesapIziGecerli, dondurulduAt: tt.dondurulduAt } : null))
  if (tt && onay && !hesapIziGecerli) kontrol.faiz.push('Hesap izi onaydan sonra değişti (ödeme ya da oran); yeniden onaylayın')
  if (alacak.islemisFaiz == null && alacak.uyari) kontrol.faiz.push(alacak.uyari)
  if (!alacak.faizBaslangic) kontrol.faiz.push('Faiz başlangıcı yok (ödeme dekontu tarihi eksik)')
  if (!avukatOnayi) kontrol.onay.push('Avukat onayı verilmedi')
  const adli = yetkiliIcraOner(d.kazaYeri, d.il)
  const aciklama = aciklamaTam(cj.aciklama, footerOlustur(ay))
  if (!d.borclular.length) kontrol.borclu.push('Borçlu yok')
  for (const b of d.borclular) {
    const tc = (b.tcVkn ?? '').replace(/\D/g, '')
    if (!tc) kontrol.borclu.push(`${b.adUnvan}: TC kimlik no eksik`)
    else if (tc.length === 10) kontrol.borclu.push(`${b.adUnvan}: kurum borçlu (VKN) kopilotla açılamıyor; takibi UYAP'ta elle açın`)
    else if (tc.length !== 11) kontrol.borclu.push(`${b.adUnvan}: TC kimlik no 11 hane değil`)
    if (b.teyitDurumu !== 'TEYIT_EDILDI') kontrol.borclu.push(`${b.adUnvan}: borçlu teyit edilmedi`)
  }
  if (!aciklama.trim()) kontrol.dosya.push('Takip açıklaması yok')
  if (!ay?.alacakliUnvan) kontrol.dosya.push('Alacaklı unvanı tanımsız (Şirket Bilgileri)')
  if (!ay?.mersis) kontrol.dosya.push('Alacaklı MERSİS no tanımsız (Şirket Bilgileri)')
  if (!adli) kontrol.dosya.push(`Yetkili adliye bulunamadı (kaza yeri: ${d.kazaYeri ?? 'yok'})`)
  const kilit = [...kontrol.faiz, ...kontrol.onay, ...kontrol.borclu, ...kontrol.dosya]

  return {
    dosyaId: d.id,
    takipTalebi: tt
      ? {
          id: tt.id, surum: tt.surum, asilAlacak: Number(tt.asilAlacak), toplam: tt.toplam != null ? Number(tt.toplam) : null,
          islemisFaizElle: tt.islemisFaiz != null ? Number(tt.islemisFaiz) : null,
          dondurulduAt: tt.dondurulduAt ? tt.dondurulduAt.toISOString() : null, takipTarihi: tt.takipTarihi ? tt.takipTarihi.toISOString() : null,
        }
      : null,
    surumler: d.takipTalepleri.map((t) => ({ surum: t.surum, gecerli: t.gecerli, createdAt: t.createdAt.toISOString(), dondurulduAt: t.dondurulduAt ? t.dondurulduAt.toISOString() : null })),
    faiz: { faizTuru: faiz.faizTuru, faizOraniMetni: faiz.faizOraniMetni, faizBaslangicTuru: faiz.faizBaslangicTuru, faizBaslangic: takipIsoGun(faiz.faizBaslangic) },
    talepMetni: faizTalepMetni(faiz),
    kopilotDestekli: kopilotFaizDestekli(faiz),
    hesapIzi,
    hesapIziOnayi: onay,
    hesapIziGecerli,
    alacak,
    avukatOnayi,
    tevziEdildi,
    kilitSebepleri: [...new Set(kilit)],
    kontrol,
    aciklamaDuzen: {
      ham: cj.aciklama ?? '',
      kazaTarihi: (d.kazaTarihi ?? d.hasarTarihi)?.toISOString() ?? '',
      sigortaliPlaka: d.sigortaliPlaka ?? '',
      karsiPlaka: d.karsiPlaka ?? '',
      alacakliUnvan: ay?.alacakliUnvan ?? '',
    },
    onizleme: {
      alacakli: ay?.alacakliUnvan ?? null,
      borclular: d.borclular.map((b) => ({ ad: b.adUnvan, tur: borcluTuru(b.tcVkn) })),
      adliye: adli ? `${adli.adliyeAdi} Adliyesi (kaza yeri; tevzi daireyi atar)` : null,
      yolOrnek: 'İlamsız · Örnek 7 · genel haciz yolu',
      aciklama,
    },
  }
}
