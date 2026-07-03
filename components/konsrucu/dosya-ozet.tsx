/**
 * KonsRücü — DosyaÖzet "hap bilgi" kapsülü (tekrar kullanılır)
 * Detay yapışkan şeridinde, takvim etkinlik popover'ında ve listede aynı künyeyi gösterir. Tek kaynak.
 * Saf/presentational (server & client tree'de çalışır). Veri = ozetKur() ile dosyadan üretilir.
 */
import { Badge, type Tone } from '@/components/konsrucu/ui'
import { durumAsama, ASAMA_META } from '@/lib/konsrucu/asama'
import { tarihTR, kalanGun } from '@/lib/konsrucu/format'

export type DosyaOzetData = {
  id: string
  hukukNo: string | null
  borclu: string | null
  borcluSayi: number
  asilAlacak: number | null
  faiz: number | null
  toplam: number | null
  kusur: string | null
  asamaLabel: string
  asamaTone: Tone
  guncelNo: string | null
  zamanasimi: string | null // ISO
}

type OzetGirdi = {
  id: string
  hukukDosyaNo?: string | null
  durum: string
  icraDosyaNo?: string | null
  asilAlacak?: unknown
  faizTutari?: unknown
  rucuTutari?: unknown
  kusurDurumu?: string | null
  rucuOrani?: string | null
  zamanasimi?: Date | string | null
  borclular?: { adUnvan: string }[]
}

const num = (v: unknown) => (v == null ? null : Number(v))

/** Dosyadan kapsül verisi üret (durum → aşama; tutar = asıl + işlemiş faiz). */
export function ozetKur(d: OzetGirdi): DosyaOzetData {
  const meta = ASAMA_META[durumAsama(d.durum)]
  const asil = num(d.asilAlacak) ?? num(d.rucuTutari)
  const faiz = num(d.faizTutari)
  return {
    id: d.id,
    hukukNo: d.hukukDosyaNo ?? null,
    borclu: d.borclular?.[0]?.adUnvan ?? null,
    borcluSayi: d.borclular?.length ?? 0,
    asilAlacak: asil,
    faiz,
    toplam: asil != null ? asil + (faiz ?? 0) : null,
    kusur: d.kusurDurumu ?? d.rucuOrani ?? null,
    asamaLabel: meta.label,
    asamaTone: meta.tone,
    guncelNo: d.icraDosyaNo ?? null,
    zamanasimi: d.zamanasimi ? new Date(d.zamanasimi).toISOString() : null,
  }
}

const fmtTRY = (n: number | null) => (n != null ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺' : '—')
const fmtDate = (iso: string | null) => tarihTR(iso)

function Hucre({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted-foreground">{k}</div>
      <div className="mt-0.5 truncate text-[12.5px] font-semibold text-foreground">{children}</div>
    </div>
  )
}

/** Yatay künye kapsülü. bugun = zamanaşımı geri sayımı için referans (ISO 'YYYY-MM-DD'). */
export function DosyaOzet({ data, bugun }: { data: DosyaOzetData; bugun: string }) {
  const kalan = data.zamanasimi ? kalanGun(data.zamanasimi, new Date(bugun)) : null
  const zaTone: Tone = kalan == null ? 'steel' : kalan < 0 ? 'danger' : kalan <= 30 ? 'danger' : kalan <= 90 ? 'warning' : 'steel'
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <Hucre k="Hukuk No"><span className="font-mono">{data.hukukNo ?? '—'}</span></Hucre>
      <Hucre k="Borçlu">{data.borclu ?? '—'}{data.borcluSayi > 1 ? <span className="text-muted-foreground"> +{data.borcluSayi - 1}</span> : null}</Hucre>
      <Hucre k="Toplam alacak"><span className="font-mono tabular-nums text-kr-ink">{fmtTRY(data.toplam)}</span>{data.faiz != null ? <span className="ml-1 font-mono text-[10px] text-muted-foreground">(faiz {fmtTRY(data.faiz)})</span> : null}</Hucre>
      <Hucre k="Kusur">{data.kusur ?? '—'}</Hucre>
      <Hucre k="Aşama"><Badge tone={data.asamaTone} dot>{data.asamaLabel}</Badge>{data.guncelNo ? <span className="font-mono ml-1.5 text-[11px] text-muted-foreground">{data.guncelNo}</span> : null}</Hucre>
      <Hucre k="Zamanaşımı"><Badge tone={zaTone} dot={zaTone !== 'steel'}><span className="font-mono">{fmtDate(data.zamanasimi)}{kalan != null ? ` · ${kalan < 0 ? 'geçti' : kalan + 'g'}` : ''}</span></Badge></Hucre>
    </div>
  )
}
