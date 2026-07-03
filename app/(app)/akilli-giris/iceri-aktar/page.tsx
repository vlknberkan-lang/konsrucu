/**
 * KonsRücü — Hugo tevdiye listesini içe aktar · app/(app)/akilli-giris/iceri-aktar/page.tsx
 */
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { HugoImportPanel } from '@/components/akilli-giris/hugo-import-panel'

export default function HugoIceriAktarPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-7 py-6">
      <Link href="/atanan-dosyalar" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Atanan Dosyalar
      </Link>
      <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Akıllı Giriş · İçe Aktar
      </div>
      <h1 className="font-display mt-1.5 text-[30px] font-extrabold tracking-[-0.035em]">Tevdiye listesini içe aktar</h1>
      <p className="mt-1.5 max-w-[68ch] text-sm text-muted-foreground">
        <b>Hugo</b> veya <b>Zurich (Hukuki Takip)</b> Excel'ini bırakın — biçim başlık adlarından otomatik tanınır.
        Her satır <b>Hukuk Dosya No</b> ile eşlenir; yeni dosyalar <b>HAVUZDA</b> olarak açılır, mevcut dosyalar{' '}
        <b>ezilmez, atlanır</b>. Kolon sırası önemsizdir. Zurich listesinde branş, sigortalı, hasar yeri, rücu tutarı ve
        tazminat ödeme tarihi hazır gelir; borçlu/muhatap yine sonradan AI çıkarımıyla dolar.
      </p>
      <p className="mt-2 max-w-[68ch] rounded-lg border border-border-subtle bg-surface-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground">
        Dosyalar <b>aktif şirkete</b> yazılır. Zurich listesini yüklemeden önce üst menüden <b>aktif şirketi Zurich</b>{' '}
        seçtiğinizden emin olun.
      </p>

      <div className="mt-6">
        <HugoImportPanel />
      </div>
    </div>
  )
}
