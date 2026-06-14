import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background p-8 text-center">
      <div className="max-w-sm">
        <div className="font-mono text-[11px] uppercase tracking-label text-kr-ink">404</div>
        <h1 className="font-display mt-2 text-2xl font-extrabold tracking-brand-tight text-foreground">Sayfa bulunamadı</h1>
        <p className="mt-2 text-sm text-muted-foreground">Aradığınız sayfa taşınmış veya hiç var olmamış olabilir.</p>
        <Link
          href="/akilli-giris"
          className="mt-6 inline-block rounded-[10px] bg-kr px-4 py-2.5 text-sm font-semibold text-kr-foreground transition hover:bg-kr/90"
        >
          Gelen Kutusu&apos;na dön
        </Link>
      </div>
    </div>
  )
}
