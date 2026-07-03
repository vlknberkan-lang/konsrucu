/**
 * KonsRücü — Tamamlanan Olaylar · app/(app)/tamamlanan-olaylar/page.tsx
 * Önemli Olaylar kuyruğundan çıkmış kayıtlar: arabuluculuğu başlatılan (TAMAMLANDI) + iptal edilenler.
 * Loglama: başvuru no/tarih/arabulucu + kim ne zaman tamamladı. Tenant-kapsamlı, auth zorunlu.
 */
import Link from 'next/link'
import { CheckCircle2, Inbox } from 'lucide-react'
import { OnemliOlayDurum } from '@prisma/client'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { Badge, type Tone } from '@/components/konsrucu/ui'
import { tarihTR, tarihSaatTR } from '@/lib/konsrucu/format'

const fmtDate = (d: Date | null) => tarihTR(d)
const fmtDateTime = (d: Date | null) => tarihSaatTR(d, { day: '2-digit', month: '2-digit', year: 'numeric' })

const COLS = 'grid-cols-[150px_minmax(140px,1fr)_120px_110px_minmax(130px,1fr)_120px_150px_104px]'
const MINW = 'min-w-[1180px]'

export default async function TamamlananOlaylarPage() {
  const { aktifMusteriId } = await ctx()

  if (!aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[1500px] px-7 py-6">
        <Baslik />
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center">
          <div className="font-display text-lg font-bold text-danger">Aktif müşteri seçili değil</div>
        </div>
      </div>
    )
  }

  const rows = await prisma.onemliOlay.findMany({
    where: { dosya: { musteriId: aktifMusteriId }, durum: { in: [OnemliOlayDurum.TAMAMLANDI, OnemliOlayDurum.IPTAL] } },
    orderBy: [{ tamamlanmaAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    take: 300,
    select: {
      id: true, durum: true, baslik: true, basvuruNo: true, basvuruTarihi: true, arabulucu: true,
      tamamlayanId: true, tamamlanmaAt: true, not: true,
      dosya: { select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, sigortaliUnvan: true, icraDosyaNo: true } },
    },
  })

  // tamamlayan adlarını çöz (relation yok → tek sorguda map'le)
  const kimlikler = [...new Set(rows.map((r) => r.tamamlayanId).filter((x): x is string => !!x))]
  const kullanicilar = kimlikler.length ? await prisma.kullanici.findMany({ where: { id: { in: kimlikler } }, select: { id: true, ad: true } }) : []
  const adMap = new Map(kullanicilar.map((u) => [u.id, u.ad]))

  return (
    <div className="mx-auto max-w-[1500px] px-7 py-6">
      <Baslik toplam={rows.length} />

      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/40 px-7 py-14 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-kr/[0.12] text-kr">
            <Inbox className="h-7 w-7" />
          </div>
          <div className="font-display text-lg font-bold">Henüz tamamlanan olay yok</div>
          <p className="mx-auto mt-1.5 max-w-[54ch] text-[13px] text-muted-foreground">
            Arabuluculuğu başlatılan ya da iptal edilen önemli olaylar burada arşivlenir.
            Açık işler <Link href="/onemli-olaylar" className="font-semibold text-kr-ink hover:underline">Önemli Olaylar</Link>'da.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="overflow-x-auto">
            <div className={`font-mono grid ${COLS} ${MINW} gap-2 border-b border-border-subtle bg-surface-muted px-5 py-2.5 text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground`}>
              <span>Dosya / Esas</span>
              <span>Sigortalı</span>
              <span>Başvuru No</span>
              <span>Başvuru T.</span>
              <span>Arabulucu</span>
              <span>Tamamlayan</span>
              <span>Tamamlanma</span>
              <span>Durum</span>
            </div>

            {rows.map((r) => {
              const iptal = r.durum === 'IPTAL'
              const dt: { label: string; tone: Tone } = iptal ? { label: 'İptal', tone: 'steel' } : { label: 'Arabuluculuk başlatıldı', tone: 'success' }
              return (
                <div key={r.id} className={`grid ${COLS} ${MINW} items-center gap-2 border-b border-border-subtle px-5 py-3 text-[13px] transition last:border-0 hover:bg-surface-muted/50`}>
                  <div className="min-w-0">
                    <Link href={`/akilli-giris/${r.dosya.id}`} className="font-mono block truncate rounded text-[12.5px] font-bold text-foreground transition hover:text-kr hover:underline">
                      {r.dosya.hukukDosyaNo ?? r.dosya.hasarDosyaNo ?? r.dosya.id.slice(0, 8)}
                    </Link>
                    <div className="font-mono truncate text-[10.5px] text-muted-foreground">{r.dosya.icraDosyaNo ?? '—'}</div>
                  </div>
                  <div className="min-w-0 truncate font-semibold">{r.dosya.sigortaliUnvan ?? '—'}</div>
                  <div className="font-mono truncate text-[12px]">{r.basvuruNo ?? '—'}</div>
                  <div className="font-mono text-[11.5px] text-muted-foreground">{fmtDate(r.basvuruTarihi)}</div>
                  <div className="min-w-0 truncate text-[12.5px]">{r.arabulucu ?? '—'}</div>
                  <div className="min-w-0 truncate text-[12px] font-semibold">{r.tamamlayanId ? adMap.get(r.tamamlayanId) ?? '—' : '—'}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{fmtDateTime(r.tamamlanmaAt)}</div>
                  <div className="min-w-0"><Badge tone={dt.tone} dot>{dt.label}</Badge></div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {rows.length >= 300 && <p className="mt-3 text-center text-[12px] text-muted-foreground">Son 300 kayıt gösteriliyor.</p>}
    </div>
  )
}

function Baslik({ toplam }: { toplam?: number }) {
  return (
    <div className="mb-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Arşiv · İş Akışı Kapanışı</div>
      <h1 className="font-display mt-1.5 flex items-center gap-2.5 text-[30px] font-extrabold tracking-[-0.035em]">
        <CheckCircle2 className="h-7 w-7 text-success" /> Tamamlanan Olaylar
      </h1>
      <p className="mt-1.5 max-w-[64ch] text-sm text-muted-foreground">
        Arabuluculuğu başlatılan veya iptal edilen önemli olaylar — kim, ne zaman, hangi başvuruyla tamamladı.
        {typeof toplam === 'number' && <span className="font-mono ml-1 text-muted-foreground">· {toplam} kayıt</span>}
      </p>
    </div>
  )
}
