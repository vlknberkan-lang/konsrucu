/**
 * KonsLaw — Tanıtım / Landing (PUBLIC) · app/tanitim/page.tsx
 * Beğenilen midnight+teal marka dili (promo videolarıyla aynı), cilalanmış:
 * Sora başlık + Inter gövde, sade "K" logo, daha premium kartlar + ince hareket.
 * Oturumsuz erişilir (middleware'de public rota). Auth/ctx KULLANMAZ.
 * Demo kayıt formu → DemoKaydi (app/tanitim/actions.ts).
 */
import Link from 'next/link'
import { Sora, Inter } from 'next/font/google'
import {
  Sparkles, CalendarClock, Gauge, Puzzle, Scale, Coins,
  ShieldCheck, ArrowRight, Check, Mail, LogIn,
} from 'lucide-react'
import { KonsRucuMark } from '@/components/brand/konsrucu-mark'
import { DemoForm } from '@/components/tanitim/demo-form'

const heading = Sora({ subsets: ['latin', 'latin-ext'], weight: ['500', '600', '700', '800'], variable: '--f-head' })
const bodyF = Inter({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], variable: '--f-body' })

export const dynamic = 'force-static'

export const metadata = {
  title: 'KonsLaw — Avukatın UYAP Asistanı',
  description:
    'İcra dosyalarını uçtan uca yöneten platform: AI belge çıkarımı, otomatik süre radarı (zamanaşımı/itiraz/haciz), UYAP senkron, kapasite panosu. Hiçbir dosya, hiçbir süre kaçmaz.',
}

const MAIL = 'mailto:vberkanbiyikli@gmail.com?subject=KonsLaw%20demo%20talebi'

const FEATURES = [
  { icon: Sparkles, t: 'AI Belge Çıkarımı', d: 'Tüm evraktan borçlu(lar), alacak tutarı, dayanak belgeler, yetkili icra ve eyleme dönük öneriler — kaynağı gösterilerek, saniyeler içinde.' },
  { icon: CalendarClock, t: 'Otomatik Süre Radarı', d: 'Zamanaşımı, itiraz (İİK 62), haciz (İİK 78), satış (İİK 106) süreleri otomatik izlenir; yaklaşan süre görev olarak önünüze gelir.' },
  { icon: Gauge, t: 'Kapasite & Darboğaz', d: 'Portföy nerede yığılıyor, haftalık giriş/çıkış dengesi, en uzun bekleyen dosyalar — yönetim tek bakışta.' },
  { icon: Puzzle, t: 'UYAP Senkron', d: 'Chrome eklentisiyle Avukat Portalından durum, safahat, evrak ve masraf canlı akar. Salt-okuma; takip açma yalnız avukat onayıyla.' },
  { icon: Scale, t: 'Dava, Dilekçe & Emsal', d: 'İtirazın iptali ve dava dilekçesi üreticisi, görevli mahkeme önerisiyle; talep-anında Yargıtay emsal karar.' },
  { icon: Coins, t: 'Taksit · Masraf · Faiz', d: 'Dönemsel kanuni faiz hesabı, taksit planı + hatırlatma, makbuzdan otomatik masraf çıkarımı ve rapor.' },
]

const ASAMALAR = ['İcra', 'İtiraz', 'Arabuluculuk', 'Dava', 'Karar', 'İnfaz', 'Tahsil']

const GUVEN = [
  'KVKK uyumlu; kişisel veriler yalnız yetkili takip amacıyla işlenir',
  'Çok-kiracılı izolasyon — her sorgu müşteri kapsamında',
  'UYAP tarafında salt-okuma; yazma yalnız avukat onaylı tevzi',
  'Her işlem denetim izinde; süre ve olay kaydı kalıcı',
]

const CSS = `
.lp { font-family: var(--f-body); }
.lp .hd { font-family: var(--f-head); }
.lp ::selection { background:#2fcad4; color:#04222a; }
.lp :focus-visible { outline:2px solid #46d6e0; outline-offset:3px; border-radius:4px; }
.lp-card { transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease, background .22s ease; }
.lp-card:hover { transform: translateY(-3px); border-color: rgba(47,202,212,.42); background: rgba(255,255,255,.05); box-shadow: 0 22px 55px rgba(0,0,0,.42); }
.lp-ico { transition: color .22s ease; color:#46d6e0; }
.lp-btn { transition: transform .18s ease, filter .18s ease; }
.lp-btn:hover { transform: translateY(-1px); filter: brightness(1.06); }
@keyframes lpglow { 0%,100%{opacity:.45; transform:scale(1)} 50%{opacity:.8; transform:scale(1.06)} }
.lp-glow { animation: lpglow 6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce){ .lp-glow{animation:none} .lp-card:hover,.lp-btn:hover{transform:none} }
`

function Feature({ icon: Icon, t, d }: { icon: typeof Sparkles; t: string; d: string }) {
  return (
    <div className="lp-card rounded-2xl border border-white/10 bg-white/[0.025] p-6">
      <Icon className="lp-ico h-6 w-6" strokeWidth={1.75} />
      <h3 className="hd mt-4 text-[19px] font-bold tracking-[-0.01em] text-white">{t}</h3>
      <p className="mt-2 text-[14.5px] leading-[1.6] text-slate-300/85">{d}</p>
    </div>
  )
}

export default function TanitimPage() {
  return (
    <main className={`lp ${heading.variable} ${bodyF.variable} min-h-screen bg-[#0a1628] text-white`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* arka plan: derinlik + ince nokta dokusu + teal ışıltı */}
      <div className="pointer-events-none fixed inset-0 -z-10" style={{
        background:
          'radial-gradient(60rem 40rem at 50% -10%, rgba(47,202,212,0.07), transparent 60%), linear-gradient(180deg,#0a1628,#0b1b2e 60%,#0a1628)',
      }} />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.5]" style={{
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
        backgroundSize: '26px 26px',
        maskImage: 'radial-gradient(70rem 50rem at 70% 0%, #000, transparent 70%)',
        WebkitMaskImage: 'radial-gradient(70rem 50rem at 70% 0%, #000, transparent 70%)',
      }} />

      {/* header */}
      <header className="mx-auto flex max-w-[1140px] items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <KonsRucuMark size={30} />
          <span className="hd text-[20px] font-extrabold tracking-[-0.02em]">Kons<span className="text-[#46d6e0]">Law</span></span>
        </div>
        <Link href="/login" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3.5 py-2 text-[13.5px] font-semibold text-slate-200 transition hover:border-[#2fcad4]/50 hover:text-white">
          <LogIn className="h-4 w-4" /> Giriş
        </Link>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-[1140px] px-6 pb-16 pt-12 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#2fcad4]/25 bg-[#2fcad4]/[0.06] px-3.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#46d6e0]" />
              <span className="font-mono text-[11.5px] uppercase tracking-[0.22em] text-[#8fe3ea]">Avukatın UYAP Asistanı</span>
            </div>
            <h1 className="hd mt-6 text-[46px] font-extrabold leading-[1.04] tracking-[-0.04em] sm:text-[62px]">
              İcra dosyalarınız,<br /><span className="text-[#46d6e0]">uçtan uca</span> tek platformda
            </h1>
            <p className="mt-6 max-w-[50ch] text-[17.5px] leading-[1.6] text-slate-300">
              Belgeyi AI okur ve dosyayı kurar; zamanaşımı–itiraz–haciz süreleri otomatik izlenir; portföyün nerede yığıldığı tek bakışta.
              <b className="text-white"> Hiçbir dosya, hiçbir süre kaçmaz.</b>
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a href="#demo" className="lp-btn inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#2fcad4] to-[#1f9aa2] px-6 py-3.5 text-[15.5px] font-bold text-[#04222a] shadow-[0_12px_34px_rgba(47,202,212,0.32)]">
                <Mail className="h-[18px] w-[18px]" /> Demo iste
              </a>
              <Link href="/login" className="lp-btn inline-flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3.5 text-[15.5px] font-semibold text-slate-100 hover:border-[#2fcad4]/50">
                Giriş yap <ArrowRight className="h-[18px] w-[18px]" />
              </Link>
            </div>
          </div>

          {/* hero görsel — AI çıkarım kartı */}
          <div className="relative">
            <div className="lp-glow pointer-events-none absolute -inset-8 -z-10 rounded-[40px]" style={{ background: 'radial-gradient(460px 320px at 62% 36%, rgba(47,202,212,0.22), transparent 70%)' }} />
            <div className="rounded-2xl p-[1px]" style={{ background: 'linear-gradient(160deg, rgba(47,202,212,0.5), rgba(47,202,212,0.05) 45%, rgba(255,255,255,0.06))' }}>
              <div className="rounded-2xl bg-[#0c1a2c]">
                <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4" style={{ background: 'linear-gradient(180deg,rgba(47,202,212,0.08),transparent)' }}>
                  <KonsRucuMark size={26} />
                  <div>
                    <div className="hd text-[14.5px] font-bold">AI Çıkarımı</div>
                    <div className="text-[11.5px] text-slate-400">tüm evraktan otomatik</div>
                  </div>
                  <span className="ml-auto rounded-full bg-[#35c994]/16 px-2.5 py-1 text-[11px] font-bold text-[#5fd6a0]">✓ 12 alan</span>
                </div>
                <div className="px-5 py-2">
                  {[['Borçlu(lar)', '2 kişi · teyit önerili'], ['Asıl alacak', '128.400,00 ₺'], ['Dayanak', 'Fatura + sözleşme'], ['Yetkili icra', 'Otomatik önerildi']].map(([k, v], i) => (
                    <div key={k} className={`flex items-center gap-3 py-3 text-[13.5px] ${i > 0 ? 'border-t border-white/5' : ''}`}>
                      <span className="w-[110px] shrink-0 text-slate-400">{k}</span>
                      <span className="font-semibold text-slate-100">{v}</span>
                    </div>
                  ))}
                  <div className="my-3 rounded-xl border border-[#2fcad4]/22 bg-[#2fcad4]/10 px-4 py-3 text-[12.5px] text-[#bfe9ee]">
                    💡 Öneri: plaka tescil sorgusu — işleteni doğrula
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* stat şeridi */}
      <section className="border-y border-white/8 bg-white/[0.02]">
        <div className="mx-auto grid max-w-[1140px] grid-cols-2 gap-6 px-6 py-9 sm:grid-cols-4">
          {[['1.000+', 'dosya/yıl kapasite'], ['13', 'aşama, tek dosyada'], ['UYAP', 'canlı senkron'], ['KVKK', 'uyumlu · izole']].map(([n, l]) => (
            <div key={l} className="text-center">
              <div className="hd text-[32px] font-extrabold tracking-[-0.02em] text-[#46d6e0]">{n}</div>
              <div className="mt-1 text-[13px] text-slate-400">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* özellikler */}
      <section className="mx-auto max-w-[1140px] px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-[46ch] text-center">
          <h2 className="hd text-[32px] font-extrabold tracking-[-0.03em] sm:text-[40px]">İcradan tahsile, her adım burada</h2>
          <p className="mt-3 text-[15.5px] text-slate-300">Ayrı ayrı araçlar değil — takibin tüm yaşam döngüsü tek sistemde.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => <Feature key={f.t} {...f} />)}
        </div>
      </section>

      {/* yaşam döngüsü */}
      <section className="mx-auto max-w-[1140px] px-6 pb-16">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-10 sm:px-10">
          <div className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[#8fe3ea]">Dosyanın yaşam döngüsü</div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
            {ASAMALAR.map((a, i) => (
              <div key={a} className="flex items-center gap-2 sm:gap-2.5">
                <span className="hd rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[14px] font-semibold text-slate-100">{a}</span>
                {i < ASAMALAR.length - 1 && <ArrowRight className="h-4 w-4 text-[#2fcad4]/70" />}
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-[60ch] text-center text-[14px] leading-[1.6] text-slate-300/85">
            Toplantılar, duruşmalar, süreler ve AI yardımlı yazışmalar tek yerden koordine edilir; aşama değişince süre görevleri otomatik doğar.
          </p>
        </div>
      </section>

      {/* güvenlik */}
      <section className="mx-auto max-w-[1140px] px-6 pb-16">
        <div className="grid gap-8 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.045] to-transparent px-6 py-10 sm:grid-cols-[0.8fr_1.2fr] sm:px-10">
          <div>
            <ShieldCheck className="lp-ico h-8 w-8" strokeWidth={1.75} />
            <h2 className="hd mt-3 text-[26px] font-extrabold tracking-[-0.02em]">Güvenlik & uyum</h2>
            <p className="mt-2 text-[14.5px] leading-[1.6] text-slate-300/85">Hukuki veri ciddiyetle korunur; sistem güvenle devredilebilir.</p>
          </div>
          <ul className="grid gap-3">
            {GUVEN.map((g) => (
              <li key={g} className="flex items-start gap-3 text-[14.5px] text-slate-200">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[#35c994]/16 text-[#5fd6a0]"><Check className="h-3.5 w-3.5" /></span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* final CTA — demo kaydı */}
      <section id="demo" className="mx-auto max-w-[1140px] px-6 pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-[#2fcad4]/25 px-6 py-12 sm:px-10" style={{ background: 'radial-gradient(720px 420px at 50% 0%, rgba(47,202,212,0.16), transparent 62%), #0c1c30' }}>
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr]">
            <div>
              <div className="mb-5 w-fit"><KonsRucuMark size={56} /></div>
              <h2 className="hd text-[32px] font-extrabold tracking-[-0.03em] sm:text-[42px]">Bürona uyarlayalım</h2>
              <p className="mt-3 max-w-[46ch] text-[16px] leading-[1.6] text-slate-300">
                Formu bırak, bir iş günü içinde arayalım: dosya devrini, şablonları ve UYAP akışını
                büronun çalışma düzenine göre kuruyoruz — birkaç günde canlıya.
              </p>
              <p className="mt-4 text-[13px] text-slate-400">
                E-postayı tercih edersen: <a href={MAIL} className="underline decoration-[#2fcad4]/50 underline-offset-2 hover:text-slate-200">vberkanbiyikli@gmail.com</a>
              </p>
            </div>
            <DemoForm />
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-white/8">
        <div className="mx-auto flex max-w-[1140px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-[13px] text-slate-400">
          <div className="flex items-center gap-2">
            <KonsRucuMark size={22} />
            <span className="hd font-bold text-slate-200">Kons<span className="text-[#46d6e0]">Law</span></span>
            <span className="ml-2">· Avukatın UYAP Asistanı</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/gizlilik" className="transition hover:text-slate-200">Gizlilik</Link>
            <a href={MAIL} className="transition hover:text-slate-200">İletişim</a>
            <Link href="/login" className="transition hover:text-slate-200">Giriş</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
