/**
 * KonsRücü — Akıllı Giriş (Gelen Kutusu) · app/(app)/akilli-giris/page.tsx
 * Başlık + ingest paneli + gerçek dosya listesi (kart/tablo/timeline).
 */
import Link from 'next/link'
import { FileSpreadsheet } from 'lucide-react'
import { IngestPanel } from '@/components/akilli-giris/ingest-panel'
import { CaseList } from '@/components/akilli-giris/case-list'
import { listeDosyalar } from '@/lib/konsrucu/db'

export default async function AkilliGirisPage({ searchParams }: { searchParams: { yukle?: string } }) {
  const list = await listeDosyalar()
  return (
    <div className="mx-auto max-w-[1500px] px-7 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Akıllı Giriş · Oku · Çıkar · Triyaj
          </div>
          <h1 className="font-display mt-1.5 text-[30px] font-extrabold tracking-[-0.035em]">Gelen Kutusu</h1>
          <p className="mt-1.5 max-w-[60ch] text-sm text-muted-foreground">
            Ham evrak yığınını atın; sistem gruplar, alanları çıkarır ve dosyanın <b>yolunu belirler</b> — klasik icra mı, idari mi.
          </p>
        </div>
        <Link
          href="/akilli-giris/iceri-aktar"
          className="inline-flex shrink-0 items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13px] font-semibold text-foreground shadow-card transition hover:border-kr/40 hover:text-kr-ink"
        >
          <FileSpreadsheet className="h-4 w-4 text-kr" /> Hugo'dan içe aktar
        </Link>
      </div>

      <div className="mt-6">
        {/* searchParams.yukle === '1' → "Yeni dosya yükle"den gelindi, otomatik başlar */}
        <IngestPanel autoStart={searchParams?.yukle === '1'} />
      </div>

      <div className="mt-2">
        <CaseList list={list} />
      </div>
    </div>
  )
}
