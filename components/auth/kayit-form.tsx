'use client'
/**
 * KonsLaw — Kayıt formu (client island) · components/auth/kayit-form.tsx
 * kayitOl server action'ına gönderir; başarıda doğrulama yönergesi ya da /login yönlendirmesi.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { kayitOl } from '@/app/kayit/actions'

const alanCss =
  'w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-[14.5px] outline-none transition focus:border-kr focus:ring-2 focus:ring-kr/25'

export function KayitForm() {
  const router = useRouter()
  const [beklemede, basla] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const [dogrulama, setDogrulama] = useState(false)

  if (dogrulama) {
    return (
      <div className="w-full max-w-[400px] rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <div className="text-[20px] font-bold text-kr">Doğrulama e-postası gönderdik ✓</div>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          Gelen kutunuzdaki bağlantıya tıklayın, ardından giriş yapın. E-posta birkaç dakika
          içinde gelmezse spam klasörünü kontrol edin.
        </p>
        <Link href="/login" className="mt-6 inline-block rounded-lg bg-kr px-5 py-2.5 text-[14px] font-semibold text-kr-foreground">
          Giriş sayfasına git
        </Link>
      </div>
    )
  }

  return (
    <form
      className="w-full max-w-[400px]"
      onSubmit={(e) => {
        e.preventDefault()
        setHata(null)
        const f = new FormData(e.currentTarget)
        basla(async () => {
          const r = await kayitOl({
            ad: f.get('ad') ?? '',
            buroAd: f.get('buroAd') ?? '',
            eposta: f.get('eposta') ?? '',
            sifre: f.get('sifre') ?? '',
            kvkkOnay: f.get('kvkkOnay') === 'on',
            web: f.get('web') ?? '',
          })
          if (!r.ok) { setHata(r.hata); return }
          if (r.dogrulamaGerekli) setDogrulama(true)
          else { router.push('/dashboard'); router.refresh() }
        })
      }}
    >
      <h1 className="text-[24px] font-bold tracking-[-0.01em]">Hesap oluştur</h1>
      <p className="mb-6 mt-1.5 text-[13.5px] text-muted-foreground">
        Büronuzu 2 dakikada kurun — kurulum ücreti yok.
      </p>
      <div className="grid gap-3.5">
        <input name="ad" required minLength={2} maxLength={120} placeholder="Ad Soyad" className={alanCss} autoComplete="name" />
        <input name="buroAd" required minLength={2} maxLength={160} placeholder="Büro / şirket adı" className={alanCss} autoComplete="organization" />
        <input name="eposta" required type="email" maxLength={200} placeholder="E-posta" className={alanCss} autoComplete="email" />
        <input name="sifre" required type="password" minLength={8} maxLength={72} placeholder="Şifre (en az 8 karakter)" className={alanCss} autoComplete="new-password" />
        <input name="web" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <label className="flex items-start gap-2.5 text-[12.5px] leading-[1.55] text-muted-foreground">
          <input name="kvkkOnay" type="checkbox" required className="mt-0.5 h-4 w-4 shrink-0 accent-[#0f9b95]" />
          <span>
            Kişisel verilerimin üyelik ve hizmet amacıyla işlenmesine onay veriyorum.{' '}
            <Link href="/gizlilik" className="underline underline-offset-2 hover:text-foreground">Aydınlatma metni</Link>
          </span>
        </label>
      </div>
      {hata && <p className="mt-3 text-[13px] font-semibold text-danger">{hata}</p>}
      <button
        type="submit"
        disabled={beklemede}
        className="mt-5 w-full rounded-lg bg-kr px-5 py-3 text-[15px] font-bold text-kr-foreground transition hover:brightness-105 disabled:opacity-60"
      >
        {beklemede ? 'Hesap oluşturuluyor…' : 'Ücretsiz hesap oluştur'}
      </button>
      <p className="mt-5 text-center text-[13px] text-muted-foreground">
        Zaten hesabın var mı?{' '}
        <Link href="/login" className="font-semibold text-kr underline-offset-2 hover:underline">Giriş yap</Link>
      </p>
    </form>
  )
}
