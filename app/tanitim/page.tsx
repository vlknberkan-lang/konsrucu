/**
 * KonsRücü — Tanıtım / Landing (PUBLIC) · app/tanitim/page.tsx
 * Kimlik: Türk hukuk dosyası + süre/zamanaşımı korkusu. Mürekkep + manila + bordo + pirinç.
 * Spectral / IBM Plex Sans / IBM Plex Mono. İmza: "Süre Cetveli" + kaşe. Oturumsuz (middleware public).
 */
import Link from 'next/link'
import { Spectral, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'

const display = Spectral({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--f-display',
})
const body = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--f-body',
})
const mono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--f-mono',
})

export const dynamic = 'force-static'

export const metadata = {
  title: 'KonsRücü — Sigorta Geri Rücu · İcra Takip Sistemi',
  description:
    'Rücu dosyasının ilk dilekçeden son tahsilata her adımı tek yerde. AI belge çıkarımı, işleyen yasal sürelerin otomatik cetveli, UYAP senkron, kapasite panosu. Bir süre daha sessizce geçmesin.',
}

const MAIL = 'mailto:vberkanbiyikli@gmail.com?subject=KonsR%C3%BCc%C3%BC%20demo'

/* ---- kaşe / mühür ---- */
function Muhur({ size = 118, onBordo = false }: { size?: number; onBordo?: boolean }) {
  const disk = onBordo ? 'var(--paper)' : 'var(--bordo)'
  const kMark = onBordo ? 'var(--bordo)' : 'var(--paper)'
  const arc = onBordo ? 'var(--bordo)' : 'var(--brass)'
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden role="presentation">
      <circle cx="60" cy="60" r="58" fill={disk} stroke="var(--brass)" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="49" fill="none" stroke="var(--brass)" strokeWidth="1" opacity="0.55" />
      <defs>
        <path id="muhurArc" d="M60,60 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0" />
      </defs>
      <text fill={arc} style={{ fontFamily: 'var(--f-mono)', fontSize: 8.2, letterSpacing: '3.2px' }}>
        <textPath href="#muhurArc" startOffset="0%">· KONSRÜCÜ · SİGORTA GERİ RÜCU · İCRA TAKİP </textPath>
      </text>
      <g transform="translate(41.1,37.5) scale(0.45)">
        <rect x="6" y="10" width="14" height="80" rx="2" fill={kMark} />
        <path d="M22 50 L62 12 L78 12 L36 50 L78 88 L62 88 Z" fill={kMark} />
        <circle cx="50" cy="50" r="8" fill="var(--brass)" />
      </g>
    </svg>
  )
}

/* ---- süre cetveli satırları (imza öğe) ---- */
const SURELER: { kod: string; ad: string; sure: string; kalan?: string; acil?: boolean }[] = [
  { kod: 'İİK m.62', ad: 'Ödeme emrine itiraz', sure: '7 gün', kalan: '3 gün kaldı', acil: true },
  { kod: 'İİK m.67', ad: 'İtirazın iptali davası', sure: '1 yıl' },
  { kod: 'İİK m.78', ad: 'Haciz isteme', sure: '1 yıl' },
  { kod: 'İİK m.106', ad: 'Satış isteme', sure: '1 yıl' },
  { kod: 'KTK 109', ad: 'Trafik zamanaşımı', sure: '2 yıl', kalan: '12 gün' },
]

const ISLER: { mark: string; ad: string; ac: string }[] = [
  { mark: 'AI · ÇIKARIM', ad: 'Belgeyi okur, dosyayı kurar', ac: 'Tüm evraktan borçlu(lar), kusur oranı, rücu tutarı ve yetkili icra — her biri hangi belgeden çıktığı gösterilerek.' },
  { mark: 'İİK 62·78·106', ad: 'Süreleri sayar', ac: 'İtiraz, haciz, satış ve zamanaşımı süreleri otomatik işler; yaklaşan süre görev olarak önünüze gelir.' },
  { mark: 'UYAP · PORTAL', ad: 'Portalla senkron', ac: 'Avukat Portalından durum, safahat, finansal döküm, evrak ve masraf canlı akar. Salt-okuma; takip açma yalnız avukat onayıyla.' },
  { mark: 'KAPASİTE', ad: 'Darboğazı gösterir', ac: 'Portföy nerede yığılıyor, haftalık giriş-çıkış dengesi, en uzun bekleyen dosyalar — yönetim tek bakışta görür.' },
  { mark: 'HMK · EMSAL', ad: 'Dava ve dayanak', ac: 'İtirazın iptali dilekçesini üretir, görevli mahkemeyi rücu yönünden ayırır; talep-anında Yargıtay emsalı getirir.' },
  { mark: 'TBK · FAİZ', ad: 'Tahsili tamamlar', ac: 'Dönemsel kanuni faiz, taksit planı ve hatırlatma, makbuzdan otomatik masraf ve tahsilat kaydı.' },
]

const DONGU = ['İcra', 'İtiraz', 'Arabuluculuk', 'Dava', 'Karar', 'İnfaz', 'Tahsil']

const GUVENCE = [
  ['KVKK', 'Kişisel veriler yalnız yetkili takip amacıyla, büronun sorumluluğunda işlenir.'],
  ['İzolasyon', 'Çok-kiracılı yapı; her sorgu müşteri kapsamında, veriler ayrık.'],
  ['Salt-okuma', 'UYAP tarafında yazma yok; tek istisna avukat onaylı tevzi.'],
  ['Denetim izi', 'Her işlem, her süre, her olay kalıcı kayıtta.'],
]

const CSS = `
.kx { font-family: var(--f-body); background: var(--ink); color: var(--paper); -webkit-font-smoothing: antialiased; }
.kx ::selection { background: var(--bordo); color: var(--paper); }
.kx a { color: inherit; text-decoration: none; }
.kx :focus-visible { outline: 2px solid var(--brass); outline-offset: 3px; border-radius: 2px; }
.kx-serif { font-family: var(--f-display); }
.kx-mono { font-family: var(--f-mono); }
.kx-eyebrow { font-family: var(--f-mono); font-size: 12.5px; letter-spacing: 0.34em; text-transform: uppercase; color: var(--brass); }
.kx-rule { height: 1px; background: linear-gradient(90deg, transparent, var(--brass), transparent); opacity: .5; }
.kx-btn { font-family: var(--f-body); font-weight: 600; font-size: 15.5px; padding: 14px 26px; border-radius: 2px; display: inline-flex; align-items: center; gap: 10px; transition: transform .18s ease, background .18s ease, color .18s ease; }
.kx-btn-primary { background: var(--bordo); color: var(--paper); border: 1px solid var(--bordoLit); }
.kx-btn-primary:hover { transform: translateY(-1px); background: var(--bordoLit); }
.kx-btn-ghost { border: 1px solid rgba(176,134,58,.45); color: var(--paper); }
.kx-btn-ghost:hover { border-color: var(--brass); background: rgba(176,134,58,.08); }
.kx-idx { border-top: 1px solid rgba(176,134,58,.18); transition: background .2s ease; }
.kx-idx:hover { background: rgba(176,134,58,.05); }
.kx-doc { background: var(--paper); color: var(--ink); border-radius: 3px; box-shadow: 0 30px 70px rgba(0,0,0,.5), 0 2px 0 var(--brass); }
.kx-tick { width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--ink); background: var(--paper); }
@keyframes kxpulse { 0%,100% { box-shadow: 0 0 0 0 rgba(166,50,59,0); } 50% { box-shadow: 0 0 0 5px rgba(166,50,59,.22); } }
.kx-acil { animation: kxpulse 2.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .kx-acil { animation: none; } .kx-btn:hover { transform: none; } }
@media (max-width: 760px) { .kx-h1 { font-size: 52px !important; } .kx-hero-grid { grid-template-columns: 1fr !important; } .kx-isler { grid-template-columns: 1fr !important; } }
`

export default function TanitimPage() {
  return (
    <main
      className={`kx ${display.variable} ${body.variable} ${mono.variable}`}
      style={
        {
          '--ink': '#17130F',
          '--ink2': '#221A13',
          '--paper': '#EFE9DC',
          '--paperLine': '#D7CBB2',
          '--bordo': '#7C1D24',
          '--bordoLit': '#A6323B',
          '--brass': '#B0863A',
          '--ink60': '#6B6154',
          '--paper60': '#A99E8B',
        } as React.CSSProperties
      }
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* künye şeridi (dosya başlığı gibi) */}
      <div className="mx-auto flex max-w-[1160px] items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <Muhur size={38} />
          <span className="kx-serif" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>KonsRücü</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="kx-mono hidden sm:inline" style={{ fontSize: 11.5, letterSpacing: '0.18em', color: 'var(--paper60)' }}>ESAS · SÜRE · SAFAHAT</span>
          <Link href="/login" className="kx-mono" style={{ fontSize: 13, letterSpacing: '0.12em', color: 'var(--brass)' }}>GİRİŞ →</Link>
        </div>
      </div>
      <div className="mx-auto max-w-[1160px] px-6"><div className="kx-rule" /></div>

      {/* HERO */}
      <section className="mx-auto max-w-[1160px] px-6 pb-20 pt-14 sm:pt-20">
        <div className="kx-hero-grid grid items-center gap-16" style={{ gridTemplateColumns: '1.08fr 0.92fr' }}>
          <div>
            <div className="kx-eyebrow">Sigorta Geri Rücu · İcra Takip</div>
            <h1 className="kx-serif kx-h1" style={{ marginTop: 22, fontSize: 84, lineHeight: 1.02, letterSpacing: '-0.025em', fontWeight: 700 }}>
              Zamanaşımı<br />kimseyi<br /><span style={{ fontStyle: 'italic', color: 'var(--brass)' }}>beklemez.</span>
            </h1>
            <p style={{ marginTop: 28, maxWidth: '46ch', fontSize: 18, lineHeight: 1.62, color: '#D9D0BF' }}>
              KonsRücü belgeyi okur, işleyen yasal süreleri sayar ve dosyayı ilk dilekçeden son tahsilata kadar yürütür — böylece bir süre daha sessizce geçmez.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a href={MAIL} className="kx-btn kx-btn-primary">Demo iste</a>
              <Link href="/login" className="kx-btn kx-btn-ghost">Giriş yap →</Link>
            </div>
          </div>

          {/* imza: SÜRE CETVELİ (manila evrak, dosya sekmeli) */}
          <div>
            <div className="kx-mono" style={{ display: 'inline-block', marginLeft: 20, background: 'var(--paper)', color: 'var(--bordo)', fontSize: 11, letterSpacing: '0.14em', padding: '6px 15px 7px', borderRadius: '3px 3px 0 0', borderBottom: '2px solid var(--brass)' }}>
              ESAS · 2026/1487
            </div>
            <div className="kx-doc" style={{ padding: '30px 30px 26px' }}>
              <div className="flex items-baseline justify-between">
                <div className="kx-serif" style={{ fontSize: 21, fontWeight: 700, color: 'var(--ink)' }}>Süre Cetveli</div>
                <div className="kx-mono" style={{ fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--bordo)' }}>OTOMATİK</div>
              </div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--ink60)' }}>her dosyada işleyen yasal süreler</div>
              <div style={{ height: 1, background: 'var(--paperLine)', margin: '18px 0 6px' }} />
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 4.5, top: 14, bottom: 14, width: 1, background: 'var(--paperLine)' }} />
                {SURELER.map((s) => (
                  <div key={s.kod} className="flex items-center gap-4" style={{ padding: '13px 0', position: 'relative' }}>
                    <span className="kx-tick" style={s.acil ? { borderColor: 'var(--bordo)', background: 'var(--bordoLit)' } : undefined} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>{s.ad}</div>
                      <div className="kx-mono" style={{ fontSize: 11, color: 'var(--ink60)', marginTop: 1 }}>{s.kod}</div>
                    </div>
                    <span className="kx-mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{s.sure}</span>
                    {s.kalan && (
                      <span
                        className={`kx-mono ${s.acil ? 'kx-acil' : ''}`}
                        style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 2, color: 'var(--paper)', background: 'var(--bordo)', whiteSpace: 'nowrap' }}
                      >
                        {s.kalan}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="kx-mono" style={{ marginTop: 14, textAlign: 'center', fontSize: 11, letterSpacing: '0.14em', color: 'var(--paper60)' }}>
              hiçbir süre sessizce geçmez
            </div>
          </div>
        </div>
      </section>

      {/* künye/stat bandı */}
      <section style={{ borderTop: '1px solid rgba(176,134,58,.18)', borderBottom: '1px solid rgba(176,134,58,.18)', background: 'rgba(176,134,58,.03)' }}>
        <div className="mx-auto grid max-w-[1160px] grid-cols-2 gap-x-6 gap-y-8 px-6 py-10 sm:grid-cols-4">
          {[['1.000+', 'dosya / yıl'], ['13', 'aşama, tek dosyada'], ['UYAP', 'canlı senkron'], ['0', 'kaçan süre hedefi']].map(([n, l]) => (
            <div key={l}>
              <div className="kx-serif" style={{ fontSize: 40, fontWeight: 700, color: 'var(--paper)' }}>{n}</div>
              <div className="kx-mono" style={{ marginTop: 4, fontSize: 11.5, letterSpacing: '0.1em', color: 'var(--paper60)', textTransform: 'uppercase' }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* İŞLER — dosya fihristi */}
      <section className="mx-auto max-w-[1160px] px-6 py-20">
        <div className="flex items-end justify-between gap-6">
          <h2 className="kx-serif" style={{ fontSize: 44, lineHeight: 1.05, letterSpacing: '-0.02em', fontWeight: 700, maxWidth: '16ch' }}>
            Dosya kapanana kadar<br />yanınızda
          </h2>
          <div className="kx-mono hidden sm:block" style={{ fontSize: 11.5, letterSpacing: '0.14em', color: 'var(--paper60)', textAlign: 'right', paddingBottom: 8 }}>FİHRİST · 6 BAŞLIK</div>
        </div>
        <div className="kx-isler mt-10 grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {ISLER.map((it) => (
            <div key={it.ad} className="kx-idx" style={{ padding: '26px 4px' }}>
              <div className="flex items-start gap-5">
                <div className="kx-mono" style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--brass)', width: 118, flex: 'none', paddingTop: 5 }}>{it.mark}</div>
                <div>
                  <h3 className="kx-serif" style={{ fontSize: 23, fontWeight: 600, color: 'var(--paper)' }}>{it.ad}</h3>
                  <p style={{ marginTop: 7, fontSize: 14.5, lineHeight: 1.6, color: '#B8AF9E', maxWidth: '42ch' }}>{it.ac}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* YAŞAM DÖNGÜSÜ */}
      <section style={{ background: 'var(--ink2)', borderTop: '1px solid rgba(176,134,58,.18)', borderBottom: '1px solid rgba(176,134,58,.18)' }}>
        <div className="mx-auto max-w-[1160px] px-6 py-16">
          <div className="kx-eyebrow" style={{ textAlign: 'center' }}>Dosyanın yaşam döngüsü</div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-4">
            {DONGU.map((d, i) => (
              <div key={d} className="flex items-center gap-3">
                <span className="flex items-center gap-2.5">
                  <span className="kx-mono" style={{ fontSize: 11, color: 'var(--brass)' }}>{String(i + 1).padStart(2, '0')}</span>
                  <span className="kx-serif" style={{ fontSize: 22, fontWeight: 600, color: 'var(--paper)' }}>{d}</span>
                </span>
                {i < DONGU.length - 1 && <span style={{ color: 'var(--bordo)', fontSize: 18 }}>—</span>}
              </div>
            ))}
          </div>
          <p style={{ margin: '26px auto 0', maxWidth: '58ch', textAlign: 'center', fontSize: 14.5, lineHeight: 1.6, color: '#B8AF9E' }}>
            Toplantılar, duruşmalar, süreler ve AI yardımlı yazışmalar tek yerden yürür; aşama değişince süre görevleri kendiliğinden doğar.
          </p>
        </div>
      </section>

      {/* GÜVENCE */}
      <section className="mx-auto max-w-[1160px] px-6 py-20">
        <div className="grid gap-12" style={{ gridTemplateColumns: '0.9fr 1.1fr' }}>
          <div>
            <div className="kx-eyebrow">Güvence</div>
            <h2 className="kx-serif" style={{ marginTop: 18, fontSize: 40, lineHeight: 1.06, letterSpacing: '-0.02em', fontWeight: 700 }}>
              Hukuki veri, hukukun<br />ciddiyetiyle
            </h2>
            <p style={{ marginTop: 16, fontSize: 15.5, lineHeight: 1.62, color: '#B8AF9E', maxWidth: '38ch' }}>
              Sistem güvenle devredilebilir; erişim yetkiyle sınırlı, aktarım şifreli, her adım kayıtlı.
            </p>
          </div>
          <div>
            {GUVENCE.map(([t, d]) => (
              <div key={t} className="kx-idx" style={{ padding: '22px 0' }}>
                <div className="flex items-baseline gap-5">
                  <div className="kx-mono" style={{ fontSize: 12, letterSpacing: '0.12em', color: 'var(--brass)', width: 110, flex: 'none' }}>{t.toUpperCase()}</div>
                  <p style={{ fontSize: 15.5, lineHeight: 1.55, color: 'var(--paper)' }}>{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'var(--bordo)' }}>
        <div className="mx-auto max-w-[1160px] px-6 py-20 text-center">
          <div className="mx-auto w-fit"><Muhur size={92} onBordo /></div>
          <h2 className="kx-serif" style={{ marginTop: 22, fontSize: 46, lineHeight: 1.05, letterSpacing: '-0.02em', fontWeight: 700, color: 'var(--paper)' }}>
            Bürona uyarlayalım
          </h2>
          <p style={{ margin: '14px auto 0', maxWidth: '52ch', fontSize: 16, lineHeight: 1.6, color: '#F0E4D4' }}>
            Kendi alacaklı, vekil ve faiz ayarlarınızla, UYAP senkronunuzla — birkaç günde canlıya.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href={MAIL} className="kx-btn" style={{ background: 'var(--paper)', color: 'var(--bordo)', fontWeight: 700 }}>Demo iste</a>
            <Link href="/login" className="kx-btn" style={{ border: '1px solid rgba(239,233,220,.5)', color: 'var(--paper)' }}>Giriş yap →</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-4 px-6 py-9">
          <div className="flex items-center gap-2.5">
            <Muhur size={26} />
            <span className="kx-serif" style={{ fontSize: 16, fontWeight: 700 }}>KonsRücü</span>
            <span className="kx-mono" style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--paper60)', marginLeft: 6 }}>SİGORTA RÜCU OTOMASYONU</span>
          </div>
          <div className="kx-mono flex items-center gap-6" style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--paper60)' }}>
            <Link href="/gizlilik">GİZLİLİK</Link>
            <a href={MAIL}>İLETİŞİM</a>
            <Link href="/login">GİRİŞ</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
