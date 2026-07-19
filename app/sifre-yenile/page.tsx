'use client'
/**
 * KonsLaw — Yeni şifre belirleme · app/sifre-yenile/page.tsx (PUBLIC)
 * Sıfırlama mailindeki bağlantı buraya düşer; Supabase browser client URL'deki kodu
 * otomatik oturuma çevirir (PKCE), sonra updateUser ile şifre değiştirilir.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SifreYenilePage() {
  const router = useRouter()
  const [hata, setHata] = useState<string | null>(null)
  const [beklemede, basla] = useTransition()

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background p-6">
      <form
        className="w-full max-w-[400px] rounded-2xl border border-border bg-card p-8 shadow-card"
        onSubmit={(e) => {
          e.preventDefault()
          setHata(null)
          const f = new FormData(e.currentTarget)
          const s1 = String(f.get('sifre') ?? '')
          const s2 = String(f.get('sifre2') ?? '')
          if (s1.length < 8) { setHata('Şifre en az 8 karakter olmalı.'); return }
          if (s1 !== s2) { setHata('Şifreler aynı değil.'); return }
          basla(async () => {
            const supabase = createClient()
            const { error } = await supabase.auth.updateUser({ password: s1 })
            if (error) {
              setHata(
                /session/i.test(error.message)
                  ? 'Bağlantının süresi dolmuş ya da geçersiz — sıfırlama bağlantısını yeniden iste.'
                  : `Şifre güncellenemedi: ${error.message}`,
              )
              return
            }
            router.push('/dashboard')
            router.refresh()
          })
        }}
      >
        <h1 className="text-[22px] font-bold tracking-[-0.01em]">Yeni şifre belirle</h1>
        <p className="mb-5 mt-1.5 text-[13.5px] text-muted-foreground">En az 8 karakter; tahmin edilmesi zor bir şifre seç.</p>
        <div className="grid gap-3">
          <input name="sifre" type="password" required minLength={8} maxLength={72} placeholder="Yeni şifre" autoComplete="new-password"
            className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-[14.5px] outline-none transition focus:border-kr focus:ring-2 focus:ring-kr/25" />
          <input name="sifre2" type="password" required minLength={8} maxLength={72} placeholder="Yeni şifre (tekrar)" autoComplete="new-password"
            className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-[14.5px] outline-none transition focus:border-kr focus:ring-2 focus:ring-kr/25" />
        </div>
        {hata && <p className="mt-3 text-[13px] font-semibold text-danger">{hata}</p>}
        <button type="submit" disabled={beklemede}
          className="mt-4 w-full rounded-lg bg-kr px-5 py-3 text-[14.5px] font-bold text-kr-foreground transition hover:brightness-105 disabled:opacity-60">
          {beklemede ? 'Kaydediliyor…' : 'Şifreyi güncelle ve gir'}
        </button>
        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          Bağlantı sorunluysa <Link href="/sifre-sifirla" className="font-semibold text-kr hover:underline">yeniden iste</Link>
        </p>
      </form>
    </div>
  )
}
