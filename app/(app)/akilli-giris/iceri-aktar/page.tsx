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
        Akıllı Giriş · Hugo · İçe Aktar
      </div>
      <h1 className="font-display mt-1.5 text-[30px] font-extrabold tracking-[-0.035em]">Hugo tevdiye listesini içe aktar</h1>
      <p className="mt-1.5 max-w-[64ch] text-sm text-muted-foreground">
        Hugo'nun Excel tevdiye listesini bırakın. Her satır <b>Hukuk Dosya No</b> ile eşlenir; yeni dosyalar{' '}
        <b>HAVUZDA</b> olarak açılır, mevcut dosyalar <b>ezilmez, atlanır</b>. Kolon sırası önemsizdir —
        eşleme başlık adına göredir. Borçlu/muhatap bu listede yoktur; sonradan AI çıkarımıyla dolar.
      </p>

      <div className="mt-6">
        <HugoImportPanel />
      </div>
    </div>
  )
}
