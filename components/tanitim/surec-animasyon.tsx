'use client'
/**
 * KonsLaw — Scroll'a bağlı süreç canlandırması · components/tanitim/surec-animasyon.tsx
 * Kaydırdıkça bir icra dosyası 5 sahnede yaşam döngüsünü oynar: içe aktar → AI okur →
 * takip aç → süre bekçisi → tahsil. Sticky sahne + scroll-progress; harici kütüphane yok.
 * prefers-reduced-motion: sahneler statik alt alta listelenir (sticky/animasyon kapalı).
 */
import { useEffect, useRef, useState } from 'react'

const ADIMLAR = [
  {
    no: '01',
    t: 'İçe aktar',
    d: "Müvekkilin dosya listesi Excel'den tek hamlede havuza alınır; mükerrer kayıt veritabanı düzeyinde engellenir.",
  },
  {
    no: '02',
    t: 'AI dosyayı okur',
    d: 'Evraktan borçlular, alacak tutarı ve dayanak belgeler çıkarılır; teyit önerileri hazırlanır.',
  },
  {
    no: '03',
    t: 'Takip aç',
    d: 'UYAP kopilotu tevzi hazırlığını ve dayanak paketini kurar — Gönder düğmesi her zaman avukatta.',
  },
  {
    no: '04',
    t: 'Süre bekçisi devrede',
    d: 'Tebliğle birlikte İİK m.78 haciz süresi ve zamanaşımı radara girer; görev sorumlusuna düşer.',
  },
  {
    no: '05',
    t: 'Tahsil & kapanış',
    d: 'Tahsilat ve taksitler kuruşu kuruşuna izlenir; dosya kapanır, arşiv denetim iziyle kalır.',
  },
]

const BORU = ['HAVUZ', 'İNCELEME', 'TAKİP', 'TEBLİĞ', 'TAHSİL']
const BORU_YUZDE = [10, 30, 52, 74, 100]

function Sahne({ adim }: { adim: number }) {
  return (
    <div className="relative rounded-2xl p-[1px]" style={{ background: 'linear-gradient(160deg, rgba(47,202,212,0.5), rgba(47,202,212,0.05) 45%, rgba(255,255,255,0.06))' }}>
      <div className="rounded-2xl bg-[#0c1a2c] p-5">
        {/* boru hattı — tüm sahnelerde ortak, adımla dolar */}
        <div className="flex justify-between">
          {BORU.map((b, i) => (
            <span key={b} className={`font-mono text-[10px] tracking-[0.06em] transition-colors duration-500 ${i <= adim ? 'font-bold text-[#46d6e0]' : 'text-slate-500'}`}>{b}</span>
          ))}
        </div>
        <div className="relative mt-2 h-[3px] rounded bg-white/10">
          <div className="absolute inset-y-0 left-0 rounded bg-gradient-to-r from-[#1f9aa2] to-[#2fcad4] transition-[width] duration-700 ease-out" style={{ width: `${BORU_YUZDE[adim]}%` }} />
        </div>

        {/* sahne içerikleri — aynı hücrede üst üste; aktif olan görünür */}
        <div className="relative mt-5 grid min-h-[220px]">
          {/* 01 — excel satırları */}
          <div className={`col-start-1 row-start-1 transition-all duration-500 ${adim === 0 ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-3'}`}>
            {[['2026/0845', 'A** Tekstil Ltd.', '84.200 ₺'], ['2026/0846', 'M** K**', '41.750 ₺'], ['2026/0847', 'B** İnşaat A.Ş.', '128.400 ₺']].map(([no, borclu, tutar], i) => (
              <div key={no} className={`flex items-center gap-3 py-2.5 text-[13px] ${i > 0 ? 'border-t border-white/5' : ''}`}>
                <span className="font-mono text-slate-400">{no}</span>
                <span className="font-semibold text-slate-100">{borclu}</span>
                <span className="ml-auto font-mono text-slate-300">{tutar}</span>
              </div>
            ))}
            <div className="mt-3 rounded-lg bg-[#2fcad4]/10 px-3.5 py-2 text-center font-mono text-[11.5px] text-[#8fe3ea]">142 satır içe alındı · 0 mükerrer</div>
          </div>

          {/* 02 — AI çıkarım */}
          <div className={`col-start-1 row-start-1 transition-all duration-500 ${adim === 1 ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-3'}`}>
            {[['Borçlu(lar)', 'B** İnşaat A.Ş. + kefil'], ['Asıl alacak', '128.400,00 ₺'], ['Dayanak', 'Fatura + sözleşme'], ['Yetkili icra', 'İstanbul Anadolu']].map(([k, v], i) => (
              <div key={k} className={`flex items-center gap-3 py-2.5 text-[13px] ${i > 0 ? 'border-t border-white/5' : ''}`}>
                <span className="w-[100px] shrink-0 text-slate-400">{k}</span>
                <span className="font-semibold text-slate-100">{v}</span>
                <span className="ml-auto text-[#5fd6a0]">✓</span>
              </div>
            ))}
            <div className="mt-3 rounded-lg border border-[#2fcad4]/25 bg-[#2fcad4]/10 px-3.5 py-2 text-[12px] text-[#bfe9ee]">💡 Öneri: kefalet sözleşmesindeki imza teyidi</div>
          </div>

          {/* 03 — UYAP kopilot */}
          <div className={`col-start-1 row-start-1 transition-all duration-500 ${adim === 2 ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-3'}`}>
            {[['Tevzi payload', 'hazır'], ['Dayanak paketi', '6 belge · zip'], ['Harç provası', '4.812,40 ₺'], ['Vekaletname', 'ekli']].map(([k, v], i) => (
              <div key={k} className={`flex items-center gap-3 py-2.5 text-[13px] ${i > 0 ? 'border-t border-white/5' : ''}`}>
                <span className="w-[120px] shrink-0 text-slate-400">{k}</span>
                <span className="font-semibold text-slate-100">{v}</span>
                <span className="ml-auto text-[#5fd6a0]">✓</span>
              </div>
            ))}
            <div className="mt-3 flex items-center justify-between rounded-lg border border-[#2fcad4]/30 bg-[#2fcad4]/10 px-3.5 py-2.5">
              <span className="text-[12.5px] text-[#bfe9ee]">UYAP'a gönderim</span>
              <span className="rounded-md bg-gradient-to-b from-[#2fcad4] to-[#1f9aa2] px-3 py-1 text-[12px] font-bold text-[#04222a]">Gönder — avukat onayı</span>
            </div>
          </div>

          {/* 04 — süre bekçisi */}
          <div className={`col-start-1 row-start-1 transition-all duration-500 ${adim === 3 ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-3'}`}>
            <div className="flex items-center justify-between py-2.5 text-[13px]">
              <span className="text-slate-400">Ödeme emri tebliği</span>
              <span className="font-mono font-semibold text-[#5fd6a0]">05.07.2026 ✓</span>
            </div>
            <div className="flex items-center justify-between border-t border-white/5 py-2.5 text-[13px]">
              <div>
                <div className="font-semibold text-slate-100">Haciz isteme süresi <span className="font-normal text-slate-500">· İİK m.78</span></div>
                <div className="text-[11.5px] text-slate-400">görev otomatik açıldı → sorumlusuna atandı</div>
              </div>
              <span className="font-mono font-semibold text-[#46d6e0]">son gün 14.03.2027</span>
            </div>
            <div className="flex items-center justify-between border-t border-white/5 py-2.5 text-[13px]">
              <span className="text-slate-400">Zamanaşımı radarı</span>
              <span className="font-mono text-slate-200">02.09.2027</span>
            </div>
            <div className="mt-3 rounded-lg bg-[#2fcad4]/10 px-3.5 py-2 text-center font-mono text-[11.5px] text-[#8fe3ea]">UYAP senkron · her 30 dakikada</div>
          </div>

          {/* 05 — tahsil */}
          <div className={`col-start-1 row-start-1 transition-all duration-500 ${adim === 4 ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-3'}`}>
            {[['Taksit 1/3', '45.000 ₺', true], ['Taksit 2/3', '45.000 ₺', true], ['Taksit 3/3', '38.400 ₺', true]].map(([k, v], i) => (
              <div key={String(k)} className={`flex items-center gap-3 py-2.5 text-[13px] ${i > 0 ? 'border-t border-white/5' : ''}`}>
                <span className="w-[100px] shrink-0 text-slate-400">{String(k)}</span>
                <span className="font-mono font-semibold text-slate-100">{String(v)}</span>
                <span className="ml-auto text-[#5fd6a0]">ödendi ✓</span>
              </div>
            ))}
            <div className="mt-3 rounded-lg border border-[#35c994]/30 bg-[#35c994]/12 px-3.5 py-2.5 text-center text-[13px] font-bold text-[#5fd6a0]">128.400,00 ₺ tahsil edildi — dosya kapandı</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SurecAnimasyon() {
  const dis = useRef<HTMLDivElement>(null)
  const [adim, setAdim] = useState(0)
  const [azHareket, setAzHareket] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setAzHareket(mq.matches)
    const dinle = (e: MediaQueryListEvent) => setAzHareket(e.matches)
    mq.addEventListener('change', dinle)
    return () => mq.removeEventListener('change', dinle)
  }, [])

  useEffect(() => {
    if (azHareket) return
    let raf = 0
    const guncelle = () => {
      raf = 0
      const el = dis.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const toplam = el.offsetHeight - window.innerHeight
      if (toplam <= 0) return
      const p = Math.min(1, Math.max(0, -rect.top / toplam))
      setAdim(Math.min(ADIMLAR.length - 1, Math.floor(p * ADIMLAR.length)))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(guncelle) }
    window.addEventListener('scroll', onScroll, { passive: true })
    guncelle()
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [azHareket])

  // az-hareket: sticky/scroll yok — sahneler alt alta statik
  if (azHareket) {
    return (
      <section className="mx-auto max-w-[1140px] px-6 py-16">
        <div className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-[#8fe3ea]">Bir dosyanın yolculuğu</div>
        <div className="mt-8 grid gap-10">
          {ADIMLAR.map((a, i) => (
            <div key={a.no} className="grid items-center gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="font-mono text-[13px] font-bold text-[#46d6e0]">{a.no}</div>
                <h3 className="hd mt-1 text-[22px] font-bold text-white">{a.t}</h3>
                <p className="mt-2 text-[14.5px] leading-[1.65] text-slate-300/85">{a.d}</p>
              </div>
              <Sahne adim={i} />
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section ref={dis} aria-label="Bir dosyanın yolculuğu" style={{ height: `${ADIMLAR.length * 92}vh` }}>
      <div className="sticky top-0 flex h-[100dvh] items-center">
        <div className="mx-auto grid w-full max-w-[1140px] items-center gap-10 px-6 lg:grid-cols-[0.9fr_1.1fr]">
          {/* sol: adım listesi + ray */}
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#8fe3ea]">Bir dosyanın yolculuğu</div>
            <div className="relative mt-6 grid gap-1.5">
              <div className="absolute bottom-2 left-[7px] top-2 w-[2px] rounded bg-white/10" aria-hidden="true">
                <div className="w-full rounded bg-gradient-to-b from-[#2fcad4] to-[#1f9aa2] transition-[height] duration-700 ease-out" style={{ height: `${((adim + 1) / ADIMLAR.length) * 100}%` }} />
              </div>
              {ADIMLAR.map((a, i) => (
                <div key={a.no} className={`relative rounded-xl py-2.5 pl-8 pr-3 transition-all duration-500 ${i === adim ? 'bg-white/[0.04]' : ''}`}>
                  <span className={`absolute left-0 top-[18px] h-4 w-4 rounded-full border-2 transition-colors duration-500 ${i <= adim ? 'border-[#2fcad4] bg-[#0a1628]' : 'border-white/20 bg-[#0a1628]'}`} aria-hidden="true">
                    {i <= adim && <span className="absolute inset-[3px] rounded-full bg-[#46d6e0]" />}
                  </span>
                  <div className={`hd text-[17px] font-bold transition-colors duration-500 ${i === adim ? 'text-white' : i < adim ? 'text-slate-300' : 'text-slate-500'}`}>
                    <span className="mr-2 font-mono text-[12px] text-[#46d6e0]/80">{a.no}</span>{a.t}
                  </div>
                  <p className={`mt-1 max-w-[42ch] text-[13.5px] leading-[1.6] transition-all duration-500 ${i === adim ? 'text-slate-300/90' : 'hidden text-slate-500 lg:block lg:opacity-40'}`}>{a.d}</p>
                </div>
              ))}
            </div>
          </div>
          {/* sağ: canlı dosya kartı */}
          <div className="hidden sm:block">
            <div className="lp-glow pointer-events-none absolute -z-10 h-0 w-0" />
            <Sahne adim={adim} />
          </div>
        </div>
      </div>
    </section>
  )
}
