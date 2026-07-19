'use client'
/**
 * KonsLaw — Şifre sıfırlama isteği · app/sifre-sifirla/page.tsx (PUBLIC)
 * E-posta alır → Supabase sıfırlama bağlantısı gönderir (dönüş: /sifre-yenile).
 * Hesap var/yok bilgisi SIZDIRILMAZ — her durumda aynı başarı ekranı.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SifreSifirlaPage() {
  const [gonderildi, setGonderildi] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [beklemede, basla] = useTransition()

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background p-6">
      <div className="w-full max-w-[400px] rounded-2xl border border-border bg-card p-8 shadow-card">
        {gonderildi ? (
          <>
            <h1 className="text-[20px] font-bold text-kr">Bağlantı yolda ✓</h1>
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              Bu e-postayla kayıtlı bir hesap varsa sıfırlama bağlantısı gönderdik.
              Gelen kutunu (gerekirse spam klasörünü) kontrol et — bağlantı seni yeni
              şifre belirleme ekranına götürür.
            </p>
            <Link href="/login" className="mt-6 inline-block text-[13.5px] font-semibold text-kr hover:underline">← Girişe dön</Link>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setHata(null)
              const eposta = String(new FormData(e.currentTarget).get('eposta') ?? '').trim()
              basla(async () => {
                const supabase = createClient()
                const { error } = await supabase.auth.resetPasswordForEmail(eposta, {
                  redirectTo: `${window.location.origin}/sifre-yenile`,
                })
                if (error) setHata(`Gönderilemedi: ${error.message}`)
                else setGonderildi(true)
              })
            }}
          >
            <h1 className="text-[22px] font-bold tracking-[-0.01em]">Şifreni sıfırla</h1>
            <p className="mb-5 mt-1.5 text-[13.5px] text-muted-foreground">
              Kayıtlı e-postanı yaz; sana yeni şifre belirleme bağlantısı gönderelim.
            </p>
            <input
              name="eposta"
              type="email"
              required
              maxLength={200}
              placeholder="E-posta"
              autoComplete="email"
              className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-[14.5px] outline-none transition focus:border-kr focus:ring-2 focus:ring-kr/25"
            />
            {hata && <p className="mt-3 text-[13px] font-semibold text-danger">{hata}</p>}
            <button
              type="submit"
              disabled={beklemede}
              className="mt-4 w-full rounded-lg bg-kr px-5 py-3 text-[14.5px] font-bold text-kr-foreground transition hover:brightness-105 disabled:opacity-60"
            >
              {beklemede ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
            </button>
            <p className="mt-5 text-center text-[13px] text-muted-foreground">
              <Link href="/login" className="font-semibold text-kr hover:underline">← Girişe dön</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
