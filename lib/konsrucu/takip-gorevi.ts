/**
 * KonsRücü — Takip görevi yardımcıları · lib/konsrucu/takip-gorevi.ts (server)
 * DB kaydını mail üreticisinin girdisine çeviren tek kaynak. Action + cron + önizleme ortak kullanır.
 */
import { Prisma } from '@prisma/client'
import { ASAMA_META, durumAsama } from './asama'
import { kalanGun } from './format'
import type { TakipGoreviGirdi } from './takip-gorevi-mail'

/** Görevi mail için gereken ilişkilerle çek (dosya künyesi + bağlam etkinliği + sorumlu). */
export const GOREV_INCLUDE = {
  sorumlu: { select: { id: true, ad: true, eposta: true } },
  etkinlik: { select: { tur: true, baslik: true, baslar: true, durum: true, sonucNot: true } },
  dosya: {
    select: {
      id: true, hukukDosyaNo: true, hasarDosyaNo: true, icraDosyaNo: true, yetkiliIcra: true,
      durum: true, asilAlacak: true, rucuTutari: true, faizTutari: true, zamanasimi: true,
      borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' } },
    },
  },
} satisfies Prisma.TakipGoreviInclude

export type GorevMailPayload = Prisma.TakipGoreviGetPayload<{ include: typeof GOREV_INCLUDE }>

/** Görev kaydı → mail girdisi. atayanAd anlık gönderimde dbUser.ad'dan geçer. */
export function gorevMailGirdisi(g: GorevMailPayload, opts: { atayanAd?: string | null; baseUrl?: string }): TakipGoreviGirdi {
  const d = g.dosya
  const asil = d.asilAlacak != null ? Number(d.asilAlacak) : d.rucuTutari != null ? Number(d.rucuTutari) : null
  const faiz = d.faizTutari != null ? Number(d.faizTutari) : null
  const za = d.zamanasimi
  return {
    gorev: {
      baslik: g.baslik,
      aciklama: g.aciklama,
      sonTarih: g.sonTarih ? g.sonTarih.toISOString() : null,
      atayanAd: opts.atayanAd ?? null,
      sorumluAd: g.sorumlu?.ad ?? null,
    },
    etkinlik: g.etkinlik
      ? { tur: g.etkinlik.tur, baslik: g.etkinlik.baslik, baslar: g.etkinlik.baslar.toISOString(), durum: g.etkinlik.durum, sonucNot: g.etkinlik.sonucNot }
      : null,
    dosya: {
      hukukNo: d.hukukDosyaNo ?? d.hasarDosyaNo,
      borclu: d.borclular[0]?.adUnvan ?? null,
      borcluSayisi: d.borclular.length,
      icraNo: d.icraDosyaNo,
      yetkiliIcra: d.yetkiliIcra,
      toplam: asil != null ? asil + (faiz ?? 0) : null,
      faiz,
      asama: ASAMA_META[durumAsama(d.durum)]?.label ?? null,
      zamanasimi: za ? za.toISOString() : null,
      zamanasimiKalan: za ? kalanGun(za) : null,
    },
    dosyaUrl: opts.baseUrl ? `${opts.baseUrl}/akilli-giris/${d.id}` : undefined,
  }
}
