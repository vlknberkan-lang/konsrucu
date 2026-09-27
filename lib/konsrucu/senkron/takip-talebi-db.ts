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
    const r = await tx.takipTalebi.update({ where: { id: mevcut.id }, data: veri, select: { id: true, surum: true } })
    return { ...r, islem }
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
      kazaYeri: true, il: true, cikarimJson: true,
      borclular: { select: { adUnvan: true, tcVkn: true } },
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
  const ay = await prisma.ayarlar.findUnique({ where: { musteriId }, select: { alacakliUnvan: true, faizJson: true, aciklamaFooter: true } })
  const cj = (d.cikarimJson ?? {}) as Cikarim
  const tt = d.takipTalepleri.find((t) => t.gecerli) ?? null

  const dekontlar: DekontGirdi[] = d.odemeler.map((o) => ({ tarih: o.tarih ? o.tarih.toISOString().slice(0, 10) : null, tutar: o.tutar != null ? Number(o.tutar) : 0, haricMi: o.haricMi }))
  const hesapIzi = rucuHesapIzi({ dekontlar, rucuOrani: d.rucuOrani, hugoRucuTutari: d.rucuTutari != null ? Number(d.rucuTutari) : null })
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
  const kilit = takipTalebiKilitSebepleri(tt ? { ...faiz, asilAlacak: anapara, hesapIziOnayli: hesapIziGecerli, dondurulduAt: tt.dondurulduAt } : null)
  if (tt && onay && !hesapIziGecerli) kilit.push('Hesap izi onaydan sonra değişti (ödeme ya da oran); yeniden onaylayın')
  if (alacak.islemisFaiz == null && alacak.uyari) kilit.push(alacak.uyari)
  if (!avukatOnayi) kilit.push('Avukat onayı ("Takibe hazır") verilmedi')
  const adli = yetkiliIcraOner(d.kazaYeri, d.il)

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
    kilitSebepleri: kilit,
    onizleme: {
      alacakli: ay?.alacakliUnvan ?? null,
      borclular: d.borclular.map((b) => ({ ad: b.adUnvan, tur: borcluTuru(b.tcVkn) })),
      adliye: adli ? `${adli.adliye} Adliyesi (kaza yeri; tevzi daireyi atar)` : null,
      yolOrnek: 'İlamsız · Örnek 7 · genel haciz yolu',
      aciklama: aciklamaTam(cj.aciklama, footerOlustur(ay)),
    },
  }
}
