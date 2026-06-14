/**
 * KonsRücü — Akıllı Giriş (Gelen Kutusu) · app/(app)/akilli-giris/page.tsx
 * Başlık + ingest paneli + gerçek dosya listesi (kart/tablo/timeline).
 */
import { IngestPanel } from '@/components/akilli-giris/ingest-panel'
import { CaseList } from '@/components/akilli-giris/case-list'
import { listeDosyalar } from '@/lib/konsrucu/db'

export default async function AkilliGirisPage({ searchParams }: { searchParams: { yukle?: string } }) {
  const list = await listeDosyalar()
  return (
    <div className="mx-auto max-w-[1500px] px-7 py-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Akıllı Giriş · Oku · Çıkar · Triyaj
      </div>
      <h1 className="font-display mt-1.5 text-[30px] font-extrabold tracking-[-0.035em]">Gelen Kutusu</h1>
      <p className="mt-1.5 max-w-[60ch] text-sm text-muted-foreground">
        Ham evrak yığınını atın; sistem gruplar, alanları çıkarır ve dosyanın <b>yolunu belirler</b> — klasik icra mı, idari mi.
      </p>

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
