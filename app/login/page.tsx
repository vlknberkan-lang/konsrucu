/**
 * KonsRücü — Giriş · app/login/page.tsx
 * Sol panel statik (server). Sağ form bir client island: <LoginForm />.
 * Marka zemini Midnight (#0a1628); aksan KonsRücü teal'i (#0f9b95 / parlak #46d6e0).
 */
import { LoginForm } from '@/components/auth/login-form'

function KonsRucuMark({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <rect x="6" y="10" width="14" height="80" rx="2" fill="#fff" />
      <path d="M22 50 L62 12 L78 12 L36 50 L78 88 L62 88 Z" fill="#fff" />
      <circle cx="50" cy="50" r="8" fill="#2fcad4" />
    </svg>
  )
}

const STATS: [string, string][] = [
  ['≈ 0 ₺', 'çıkarım maliyeti'],
  ['121', 'foto · oto-kümeleme'],
  ['2 yol', 'klasik / idari triyaj'],
]

export default function LoginPage() {
  return (
    <div className="grid min-h-[100dvh] grid-cols-1 md:grid-cols-[1.05fr_1fr]">
      {/* ── sol: marka paneli ── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0a1628] p-12 text-white md:flex">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[length:32px_32px]" />
        <div className="pointer-events-none absolute -bottom-40 -right-36 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(70,214,224,.3),transparent_70%)]" />

        <div className="relative z-10 flex items-center gap-3">
          <KonsRucuMark />
          <span className="font-display text-[26px] font-extrabold tracking-[-0.035em]">
            Kons<span className="text-[#46d6e0]">Law</span>
            <span className="ml-0.5 inline-block h-1.5 w-1.5 translate-y-0.5 rounded-full bg-[#46d6e0]" />
          </span>
        </div>

        <div className="relative z-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/55">Avukatın UYAP Asistanı</div>
          <h1 className="font-display mt-3.5 max-w-[16ch] text-[38px] font-extrabold leading-[1.12] tracking-[-0.035em]">
            Ham evrak yığını içeri; <span className="text-[#46d6e0]">imzaya hazır</span> çıktı dışarı.
          </h1>
          <p className="mt-3 max-w-[42ch] text-[14.5px] leading-relaxed text-white/70">
            At · grupla · oku · triyaj et · üret. Klasik icra ve idari başvuruyu tek omurgada toplayan rücu iş akışı.
          </p>
          <div className="mt-6 flex gap-6">
            {STATS.map(([v, l]) => (
              <div key={l}>
                <div className="font-display text-[22px] font-extrabold">{v}</div>
                <div className="font-mono mt-0.5 text-[9.5px] uppercase tracking-[0.08em] text-white/50">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── sağ: form ── */}
      <div className="grid place-items-center overflow-y-auto bg-background p-10">
        <LoginForm />
      </div>
    </div>
  )
}
