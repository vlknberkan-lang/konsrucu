'use client'

/**
 * KonsRücü — Giriş formu (client island) · components/auth/login-form.tsx
 * Supabase signInWithPassword'a bağlı. Tema: next-themes. Aksan: kr (teal) token sınıfları.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, ShieldCheck, Sun, Moon, AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setBusy(false)
      setError('E-posta veya şifre hatalı.')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="w-[min(420px,100%)]">
      {/* tema (next-themes) */}
      <div className="mb-6 inline-flex rounded-full border border-border bg-muted p-[3px]">
        {(['light', 'dark'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTheme(t)}
            aria-label={t === 'light' ? 'Açık tema' : 'Koyu tema'}
            className={`grid h-[30px] w-[30px] place-items-center rounded-full transition ${
              theme === t ? 'bg-card text-kr shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t === 'light' ? <Sun className="h-[15px] w-[15px]" /> : <Moon className="h-[15px] w-[15px]" />}
          </button>
        ))}
      </div>

      <h2 className="font-display text-[26px] font-extrabold tracking-brand-tight">Tekrar hoş geldiniz</h2>
      <p className="mb-6 mt-1.5 text-[13.5px] text-muted-foreground">Dosya havuzunuza erişmek için giriş yapın.</p>

      {/* e-posta */}
      <label htmlFor="email" className="font-mono mb-1.5 block text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
        E-posta
      </label>
      <div className="relative mb-4">
        <Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-card py-3 pl-10 pr-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-kr focus:ring-4 focus:ring-kr/15"
        />
      </div>

      {/* şifre */}
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor="password" className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
          Şifre
        </label>
        <a href="#" className="text-[11px] font-medium text-kr hover:underline">Şifremi unuttum</a>
      </div>
      <div className="relative mb-[18px]">
        <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
        <input
          id="password"
          type={show ? 'text' : 'password'}
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-card py-3 pl-10 pr-11 text-sm text-foreground outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'}
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {/* hata */}
      {error && (
        <div className="mb-4 flex items-center gap-2.5 rounded-[10px] border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* beni hatırla */}
      <label className="mb-[22px] flex cursor-pointer items-center gap-2.5 text-[13px]">
        <input type="checkbox" defaultChecked className="peer sr-only" />
        <span className="relative h-[23px] w-10 rounded-full bg-border transition-colors peer-checked:bg-kr after:absolute after:left-[3px] after:top-[3px] after:h-[17px] after:w-[17px] after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:left-5" />
        Beni hatırla
      </label>

      {/* giriş */}
      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-kr px-4 py-3 text-[14.5px] font-semibold text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] transition hover:bg-kr/90 disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Giriş yapılıyor…
          </>
        ) : (
          <>
            Giriş yap <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      {/* ayraç */}
      <div className="my-5 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> VEYA <span className="h-px flex-1 bg-border" />
      </div>

      {/* KEP / e-imza — placeholder (ileri faz) */}
      <button
        type="button"
        disabled
        title="Yakında"
        className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground opacity-70"
      >
        <ShieldCheck className="h-4 w-4" /> KEP / e-İmza ile giriş
        <span className="font-mono ml-1 rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-label">yakında</span>
      </button>
    </form>
  )
}
