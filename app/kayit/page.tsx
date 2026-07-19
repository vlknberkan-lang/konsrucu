/**
 * KonsLaw — Kayıt · app/kayit/page.tsx (PUBLIC)
 * /login ile aynı iki-panel düzen: sol marka paneli (server), sağ <KayitForm /> client island.
 */
import { KayitForm } from '@/components/auth/kayit-form'

export const metadata = { title: 'Kayıt ol — KonsLaw' }

function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <rect x="6" y="10" width="14" height="80" rx="2" fill="#fff" />
      <path d="M22 50 L62 12 L78 12 L36 50 L78 88 L62 88 Z" fill="#fff" />
      <circle cx="50" cy="50" r="8" fill="#2fcad4" />
    </svg>
  )
}

const MADDELER = [
  'AI belge çıkarımı ve dilekçe taslağı',
  'İİK m.78 haciz süresi + zamanaşımı radarı',
  'UYAP senkron — Chrome eklentisiyle',
]

export default function KayitPage() {
  return (
    <div className="grid min-h-[100dvh] grid-cols-1 md:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0a1628] p-12 text-white md:flex">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[length:32px_32px]" />
        <div className="pointer-events-none absolute -bottom-40 -right-36 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(70,214,224,.3),transparent_70%)]" />

        <div className="relative z-10 flex items-center gap-3">
          <Mark />
          <span className="font-display text-[26px] font-extrabold tracking-[-0.035em]">
            Kons<span className="text-[#46d6e0]">Law</span>
            <span className="ml-0.5 inline-block h-1.5 w-1.5 translate-y-0.5 rounded-full bg-[#46d6e0]" />
          </span>
        </div>

        <div className="relative z-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/55">Avukatın UYAP Asistanı</div>
          <h1 className="font-display mt-3.5 max-w-[16ch] text-[38px] font-extrabold leading-[1.12] tracking-[-0.035em]">
            İlk dosyanı <span className="text-[#46d6e0]">bugün</span> sisteme al.
          </h1>
          <ul className="mt-6 grid max-w-[46ch] gap-2.5">
            {MADDELER.map((m) => (
              <li key={m} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-white/80">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#46d6e0]" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid place-items-center overflow-y-auto bg-background p-10">
        <KayitForm />
      </div>
    </div>
  )
}
