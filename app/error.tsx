'use client'

import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background p-8 text-center">
      <div className="max-w-sm">
        <h1 className="font-display text-2xl font-extrabold tracking-brand-tight text-foreground">Bir şeyler ters gitti</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Beklenmedik bir hata oluştu. Tekrar deneyin; sorun sürerse ofise bildirin.
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-sm font-semibold text-kr-foreground transition hover:bg-kr/90"
        >
          <RotateCcw className="h-4 w-4" /> Tekrar dene
        </button>
      </div>
    </div>
  )
}
