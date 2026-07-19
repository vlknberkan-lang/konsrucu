'use client'
/**
 * KonsLaw — Demo kayıt formu (client island) · components/tanitim/demo-form.tsx
 * /tanitim CTA bölümünde durur; demoKaydet server action'ına gönderir.
 * KVKK açık onayı zorunlu; honeypot ("web") alanı botlara karşı gizli.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { demoKaydet } from '@/app/tanitim/actions'

const alanCss =
  'w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-[14.5px] text-white placeholder:text-slate-500 outline-none transition focus:border-[#2fcad4]/60'

export function DemoForm() {
  const [beklemede, basla] = useTransition()
  const [durum, setDurum] = useState<'form' | 'tamam'>('form')
  const [hata, setHata] = useState<string | null>(null)

  if (durum === 'tamam') {
    return (
      <div className="rounded-2xl border border-[#35c994]/30 bg-[#35c994]/10 px-6 py-8 text-center">
        <div className="hd text-[20px] font-bold text-[#5fd6a0]">Talebiniz alındı ✓</div>
        <p className="mt-2 text-[14px] text-slate-300">
          En geç bir iş günü içinde sizi arayıp demoyu planlıyoruz.
        </p>
      </div>
    )
  }

  return (
    <form
      className="grid gap-3 text-left"
      onSubmit={(e) => {
        e.preventDefault()
        setHata(null)
        const f = new FormData(e.currentTarget)
        basla(async () => {
          const r = await demoKaydet({
            ad: f.get('ad') ?? '',
            eposta: f.get('eposta') ?? '',
            telefon: f.get('telefon') ?? '',
            buroAd: f.get('buroAd') ?? '',
            mesaj: f.get('mesaj') ?? '',
            kvkkOnay: f.get('kvkkOnay') === 'on',
            web: f.get('web') ?? '',
          })
          if (r.ok) setDurum('tamam')
          else setHata(r.hata)
        })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="ad" required minLength={2} maxLength={120} placeholder="Ad Soyad *" className={alanCss} autoComplete="name" />
        <input name="eposta" required type="email" maxLength={200} placeholder="E-posta *" className={alanCss} autoComplete="email" />
        <input name="telefon" type="tel" maxLength={24} placeholder="Telefon (önerilir)" className={alanCss} autoComplete="tel" />
        <input name="buroAd" maxLength={160} placeholder="Büro / şirket adı" className={alanCss} autoComplete="organization" />
      </div>
      <textarea name="mesaj" maxLength={2000} rows={3} placeholder="Kısaca: kaç dosya, hangi alanda? (isteğe bağlı)" className={alanCss} />
      {/* honeypot — görme engelli okuyucular dahil kimseye görünmez, botlar doldurur */}
      <input name="web" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <label className="flex items-start gap-2.5 text-[12.5px] leading-[1.55] text-slate-400">
        <input name="kvkkOnay" type="checkbox" required className="mt-0.5 h-4 w-4 shrink-0 accent-[#2fcad4]" />
        <span>
          Kişisel verilerimin demo ve iletişim amacıyla işlenmesine onay veriyorum.{' '}
          <Link href="/gizlilik" className="underline decoration-[#2fcad4]/50 underline-offset-2 hover:text-slate-200">
            Aydınlatma metni
          </Link>
        </span>
      </label>
      {hata && <p className="text-[13px] font-semibold text-[#fca5a5]">{hata}</p>}
      <button
        type="submit"
        disabled={beklemede}
        className="lp-btn mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#2fcad4] to-[#1f9aa2] px-6 py-3.5 text-[15.5px] font-bold text-[#04222a] shadow-[0_12px_34px_rgba(47,202,212,0.32)] disabled:opacity-60"
      >
        {beklemede ? 'Gönderiliyor…' : 'Demo talep et'}
      </button>
    </form>
  )
}
