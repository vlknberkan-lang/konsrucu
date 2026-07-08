/**
 * KonsRücü — Tanıtım / Landing (PUBLIC) · app/tanitim/page.tsx
 * Satış için ikna odaklı tek sayfa; oturumsuz erişilir (middleware'de public rota).
 * Promo videolarıyla aynı premium dark-teal marka dili. Auth/ctx KULLANMAZ.
 */
import Link from 'next/link'
import {
  Sparkles, CalendarClock, Gauge, Puzzle, Scale, Coins,
  ShieldCheck, ArrowRight, Check, Mail, LogIn,
} from 'lucide-react'
import { KonsRucuMark } from '@/components/brand/konsrucu-mark'

export const dynamic = 'force-static'

export const metadata = {
  title: 'KonsRücü — Sigorta Rücu Otomasyonu',
  description:
    'Rücu dosyalarını uçtan uca yöneten platform: AI belge çıkarımı, otomatik süre radarı (zamanaşımı/itiraz/haciz), UYAP senkron, kapasite panosu. Hiçbir dosya, hiçbir süre kaçmaz.',
}

const MAIL =
  'mailto:vberkanbiyikli@gmail.com?subject=KonsR%C3%BCc%C3%BC%20demo%20talebi'

const FEATURES = [
  { icon: Sparkles, t: 'AI Belge Çıkarımı', d: 'Dosyanın tüm evrakından borçlu(lar), kusur oranı, rücu tutarı, yetkili icra ve eyleme dönük öneriler — saniyeler içinde, kaynağı gösterilerek.' },
  { icon: CalendarClock, t: 'Otomatik Süre Radarı', d: 'Zamanaşımı, itiraz (İİK 62), haciz (İİK 78), satış (İİK 106) süreleri otomatik izlenir; yaklaşan/geçen süre için görev + uyarı. Hiçbiri kaçmaz.' },
  { icon: Gauge, t: 'Kapasite & Darboğaz Panosu', d: 'Portföy nerede yığılıyor, haftalık giriş/çıkış dengesi, en uzun açık dosyalar — yönetim tek bakışta görür.' },
  { icon: Puzzle, t: 'UYAP Senkron', d: 'Chrome eklentisiyle Avukat Portalından durum, safahat, finansal döküm, evrak ve masraf otomatik akar. Salt-okuma; takip açma yalnız avukat onayıyla.' },
  { icon: Scale, t: 'Dava, Dilekçe & Emsal', d: 'İtirazın iptali/dava dilekçesi üreticisi, görevli mahkeme rücu yönünden; talep-anında Yargıtay emsal karar arama ve dayanak.' },
  { icon: Coins, t: 'Taksit · Masraf · Faiz', d: 'Dönemsel kanuni faiz hesabı, taksit planı + hatırlatma, makbuzdan otomatik masraf çıkarımı ve Excel raporu.' },
]

const ASAMALAR = ['İcra', 'İtiraz', 'Arabuluculuk', 'Dava', 'Karar', 'İnfaz', 'Tahsil']

const GUVEN = [
  'KVKK uyumlu; kişisel veriler yalnız yetkili takip amacıyla işlenir',
  'Çok-kiracılı izolasyon — her sorgu müşteri kapsamında',
  'UYAP tarafında salt-okuma; yazma yalnız avukat onaylı tevzi',
  'Her işlem denetim izinde; süre/olay kaydı kalıcı',
]

function Feature({ icon: Icon, t, d }: { icon: typeof Sparkles; t: string; d: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-[#2fcad4]/40 hover:bg-white/[0.05]">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[#2fcad4]/12 text-[#46d6e0]">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-[19px] font-bold tracking-[-0.01em] text-white">{t}</h3>
      <p className="mt-2 text-[14.5px] leading-[1.6] text-slate-300/85">{d}</p>
    </div>
  )
}

export default function TanitimPage() {
  return (
    <main className="min-h-screen bg-[#0a1628] text-white">
      {/* arka plan ışıltıları */}
      <div className="pointer-events-none fixed inset-0 -z-10" style={{
        background:
          'radial-gradient(1100px 800px at 78% -5%, rgba(47,202,212,0.20), transparent 55%), radial-gradient(900px 700px at 12% 100%, rgba(47,202,212,0.10), transparent 55%), linear-gradient(160deg,#0a1628,#0e1f34 60%,#0b1a2e)',
      }} />

      {/* header */}
      <header className="mx-auto flex max-w-[1140px] items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <KonsRucuMark size={30} />
          <span className="text-[20px] font-extrabold tracking-[-0.02em]">Kons<span className="text-[#46d6e0]">Rücu</span></span>
        </div>
        <Link href="/login" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3.5 py-2 text-[13.5px] font-semibold text-slate-200 transition hover:border-[#2fcad4]/50 hover:text-white">
          <LogIn className="h-4 w-4" /> Giriş
        </Link>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-[1140px] px-6 pt-12 pb-14 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="font-mono text-[12px] uppercase tracking-[0.24em] text-[#6fdce4]">Sigorta Rücu Otomasyonu</div>
            <h1 className="mt-4 text-[44px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[58px]">
              Rücu dosyalarınız,<br /><span className="text-[#46d6e0]">uçtan uca</span> tek platformda
            </h1>
            <p className="mt-5 max-w-[52ch] text-[17px] leading-[1.6] text-slate-300">
              Belgeyi AI okur ve dosyayı kurar; zamanaşımı–itiraz–haciz süreleri otomatik izlenir; portföyün nerede yığıldığı tek bakışta görünür.
              <b className="text-white"> Hiçbir dosya, hiçbir süre kaçmaz.</b>
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href={MAIL} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#2fcad4] to-[#1f9aa2] px-5 py-3 text-[15px] font-bold text-[#04222a] shadow-[0_10px_30px_rgba(47,202,212,0.35)] transition hover:brightness-105">
                <Mail className="h-[18px] w-[18px]" /> Demo / iletişim
              </a>
              <Link href="/login" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-[15px] font-semibold text-slate-100 transition hover:border-[#2fcad4]/50">
                Giriş yap <ArrowRight className="h-[18px] w-[18px]" />
              </Link>
            </div>
          </div>

          {/* hero görsel — AI çıkarım kartı mock */}
          <div className="relative">
            <div className="rounded-2xl border border-white/10 bg-[#0d1b2e] shadow-[0_40px_90px_rgba(0,0,0,0.5)]">
              <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4" style={{ background: 'linear-gradient(180deg,rgba(47,202,212,0.09),transparent)' }}>
                <KonsRucuMark size={26} />
                <div>
                  <div className="text-[14.5px] font-bold">AI Çıkarımı</div>
                  <div className="text-[11.5px] text-slate-400">tüm evraktan otomatik</div>
                </div>
                <span className="ml-auto rounded-full bg-[#35c994]/16 px-2.5 py-1 text-[11px] font-bold text-[#5fd6a0]">✓ 12 alan</span>
              </div>
              <div className="px-5 py-2">
                {[['Borçlu', 'Sürücü + Ruhsat Sahibi'], ['Kusur oranı', '%75'], ['Rücu tutarı', '128.400,00 ₺'], ['Yetkili icra', 'Kaza yeri']].map(([k, v], i) => (
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
            <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px]" style={{ background: 'radial-gradient(500px 300px at 60% 40%, rgba(47,202,212,0.22), transparent 70%)' }} />
          </div>
        </div>
      </section>

      {/* stat şeridi */}
      <section className="border-y border-white/8 bg-white/[0.02]">
        <div className="mx-auto grid max-w-[1140px] grid-cols-2 gap-6 px-6 py-8 sm:grid-cols-4">
          {[['1.000+', 'dosya/yıl kapasite'], ['13', 'aşamalı süreç'], ['UYAP', 'canlı senkron'], ['KVKK', 'uyumlu · izole']].map(([n, l]) => (
            <div key={l} className="text-center">
              <div className="text-[30px] font-extrabold tracking-[-0.02em] text-[#46d6e0]">{n}</div>
              <div className="mt-1 text-[13px] text-slate-400">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* özellikler */}
      <section className="mx-auto max-w-[1140px] px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-[42ch] text-center">
          <h2 className="text-[32px] font-extrabold tracking-[-0.03em] sm:text-[40px]">İcradan tahsile, her adım burada</h2>
          <p className="mt-3 text-[15.5px] text-slate-300">Ayrı ayrı araçlar değil — rücunun tüm yaşam döngüsü tek sistemde.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => <Feature key={f.t} {...f} />)}
        </div>
      </section>

      {/* yaşam döngüsü */}
      <section className="mx-auto max-w-[1140px] px-6 pb-16">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-10 sm:px-10">
          <div className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[#6fdce4]">Dosyanın yaşam döngüsü</div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {ASAMALAR.map((a, i) => (
              <div key={a} className="flex items-center gap-2 sm:gap-3">
                <span className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[14px] font-semibold text-slate-100">{a}</span>
                {i < ASAMALAR.length - 1 && <ArrowRight className="h-4 w-4 text-[#2fcad4]/70" />}
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-[60ch] text-center text-[14px] leading-[1.6] text-slate-300/85">
            Toplantılar, duruşmalar, süreler ve AI yardımlı yazışmalar — hepsi tek yerden koordine edilir; aşama değişince süre görevleri otomatik doğar.
          </p>
        </div>
      </section>

      {/* güven / güvenlik */}
      <section className="mx-auto max-w-[1140px] px-6 pb-16">
        <div className="grid gap-8 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent px-6 py-10 sm:grid-cols-[0.8fr_1.2fr] sm:px-10">
          <div>
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-[#2fcad4]/12 text-[#46d6e0]"><ShieldCheck className="h-6 w-6" /></div>
            <h2 className="text-[26px] font-extrabold tracking-[-0.02em]">Güvenlik & uyum</h2>
            <p className="mt-2 text-[14.5px] leading-[1.6] text-slate-300/85">Hukuki veri ciddiyetle korunur; sistem güvenle devredilebilir.</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-1">
            {GUVEN.map((g) => (
              <li key={g} className="flex items-start gap-3 text-[14.5px] text-slate-200">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[#35c994]/16 text-[#5fd6a0]"><Check className="h-3.5 w-3.5" /></span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* final CTA */}
      <section className="mx-auto max-w-[1140px] px-6 pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-[#2fcad4]/25 px-6 py-14 text-center sm:px-10" style={{ background: 'radial-gradient(700px 400px at 50% 0%, rgba(47,202,212,0.16), transparent 60%), #0c1c30' }}>
          <div className="mx-auto mb-5 w-fit"><KonsRucuMark size={56} /></div>
          <h2 className="text-[32px] font-extrabold tracking-[-0.03em] sm:text-[42px]">Bürona uyarlayalım</h2>
          <p className="mx-auto mt-3 max-w-[54ch] text-[16px] leading-[1.6] text-slate-300">
            Çok-kiracılı yapı, kendi alacaklı/vekil/faiz ayarların ve UYAP senkronunla — birkaç günde canlıya.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={MAIL} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#2fcad4] to-[#1f9aa2] px-6 py-3.5 text-[15.5px] font-bold text-[#04222a] shadow-[0_10px_30px_rgba(47,202,212,0.35)] transition hover:brightness-105">
              <Mail className="h-[18px] w-[18px]" /> İletişime geç
            </a>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3.5 text-[15.5px] font-semibold text-slate-100 transition hover:border-[#2fcad4]/50">
              Giriş yap <ArrowRight className="h-[18px] w-[18px]" />
            </Link>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-white/8">
        <div className="mx-auto flex max-w-[1140px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-[13px] text-slate-400">
          <div className="flex items-center gap-2">
            <KonsRucuMark size={22} />
            <span className="font-bold text-slate-200">Kons<span className="text-[#46d6e0]">Rücu</span></span>
            <span className="ml-2">· Sigorta Rücu Otomasyonu</span>
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
