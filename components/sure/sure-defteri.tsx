'use client'

/**
 * KonsRücü — Süre defteri tablosu · components/sure/sure-defteri.tsx
 *
 * 06 §2(i) ekran taslağı: Tür · Tetik (kaynak) · Önerilen · Onaylanan · Kalan · Durum. Satır açılınca:
 * dayanak (teyit gerekli), alıntı, hesap izi, UETS ulaşma ve tebliğ ayrı, bakılan evrak, onaylayan,
 * ikinci teyit, hatırlatma geçmişi, kapanış kanıtı. Eylemler role göre (avukat onaylar; yardımcı tetik girer).
 * Hem genel defter sayfasında (dosyaSutunu) hem dosya panelinde kullanılır.
 */
import { Fragment, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Loader2, MailCheck, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { sureIkinciTeyit, sureTestHatirlatmasi } from '@/app/(app)/sureler/actions'
import { GORUNUM_ETIKET, gorunumDurumu, hedefGun, kalan, type SureSatiri } from '@/lib/konsrucu/sure/gorunum'
import { gunTR, tarihOku } from '@/lib/konsrucu/sure/takvim'
import { TETIK_TURU_ETIKET, type TetikTuru } from '@/lib/konsrucu/sure/turler'
import { SureOnayFormu } from './sure-onay-formu'
import { SureTetikFormu } from './sure-tetik-formu'
import { SureKapanisFormu, type BelgeSecenegi } from './sure-kapanis-formu'
import { IslemMesaji, useSureIslem } from './islem'
import { BTN_IKINCIL } from './stil'

export type SureDefteriProps = {
  sureler: SureSatiri[]
  /** Oturumdaki kullanıcının rolü (ADMIN | AVUKAT | AVUKAT_YRD | GORUNTULEYEN). */
  rol: string
  kullaniciId: string
  /** Sunucudaki "şimdi" (ISO) — kalan gün hesabı sunucu ve istemcide aynı çıksın. */
  simdiIso: string
  /** Genel defterde dosya kolonu gösterilir; dosya panelinde gizlenir. */
  dosyaSutunu?: boolean
  /** Kapatma formunda kanıt olarak seçilebilecek evraklar (dosya panelinde). */
  belgeler?: BelgeSecenegi[]
  bosMetin?: string
}

const g = (v: string | null) => gunTR(tarihOku(v))

function KalanRozet({ s, simdi }: { s: SureSatiri; simdi: Date }) {
  const k = kalan(s, simdi)
  if (k == null) return <span className="text-muted-foreground">—</span>
  const tone = k < 0 ? 'danger' : k <= 3 ? 'danger' : k <= 14 ? 'warning' : 'steel'
  return <Badge tone={tone} dot={k <= 14}><span className="font-mono">{k < 0 ? `${-k} g geçti` : k === 0 ? 'bugün' : `${k} g`}</span></Badge>
}

export function SureDefteri({ sureler, rol, kullaniciId, simdiIso, dosyaSutunu = false, belgeler, bosMetin }: SureDefteriProps) {
  const simdi = new Date(simdiIso)
  const [acik, setAcik] = useState<string | null>(null)
  const kolon = dosyaSutunu
    ? 'grid-cols-[130px_minmax(150px,1.2fr)_minmax(150px,1fr)_104px_104px_84px_128px_28px]'
    : 'grid-cols-[minmax(150px,1.2fr)_minmax(150px,1fr)_104px_104px_84px_128px_28px]'
  const minW = dosyaSutunu ? 'min-w-[960px]' : 'min-w-[820px]'

  if (!sureler.length) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/40 px-6 py-8 text-center text-[13px] text-muted-foreground">
        {bosMetin ?? 'Defterde süre yok.'}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="overflow-x-auto">
        <div className={`font-mono grid ${kolon} ${minW} gap-2 border-b border-border-subtle bg-surface-muted px-4 py-2.5 text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground`}>
          {dosyaSutunu && <span>Dosya</span>}
          <span>Tür</span>
          <span>Tetik (kaynak)</span>
          <span>Önerilen</span>
          <span>Onaylanan</span>
          <span>Kalan</span>
          <span>Durum</span>
          <span className="sr-only">Aç</span>
        </div>
        {sureler.map((s) => {
          const d = GORUNUM_ETIKET[gorunumDurumu(s, simdi)]
          const acikMi = acik === s.id
          return (
            <Fragment key={s.id}>
              <button
                type="button"
                aria-expanded={acikMi}
                aria-controls={`sure-${s.id}`}
                onClick={() => setAcik(acikMi ? null : s.id)}
                className={`grid w-full ${kolon} ${minW} items-center gap-2 border-b border-border-subtle px-4 py-2.5 text-left text-[13px] transition hover:bg-surface-muted/50 focus-visible:bg-surface-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40`}
              >
                {dosyaSutunu && (
                  <span className="min-w-0">
                    <span className="font-mono block truncate text-[12px] font-bold">{s.dosyaNo}</span>
                    <span className="font-mono block truncate text-[10.5px] text-muted-foreground">{s.icraNo ?? '—'}</span>
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.turEtiket}{s.borcluEtiket ? <span className="font-normal text-muted-foreground"> · {s.borcluEtiket}</span> : null}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{s.turAd}</span>
                </span>
                <span className="min-w-0 truncate text-[12px] text-muted-foreground">
                  {s.tetikTarihi ? <>{s.tetikAciklama} <span className="font-mono text-foreground">{g(s.tetikTarihi)}</span></> : s.eksik ? 'Tetik bekleniyor' : s.tetikAciklama}
                </span>
                <span className="font-mono text-[12px]">
                  {s.onerilenIhtiyatli ? <>{g(s.onerilenIhtiyatli)}<span className="text-muted-foreground"> (ih.)</span></> : '—'}
                  {s.onerilenSonGun && s.onerilenSonGun !== s.onerilenIhtiyatli ? <span className="block text-[10.5px] text-muted-foreground">durmalı {g(s.onerilenSonGun)}</span> : null}
                </span>
                <span className="font-mono text-[12px]">{s.onaylananSonGun ? g(s.onaylananSonGun) : <span className="text-muted-foreground">—</span>}</span>
                <span><KalanRozet s={s} simdi={simdi} /></span>
                <span><Badge tone={d.tone} dot>{d.label}</Badge></span>
                <span aria-hidden className="text-muted-foreground">{acikMi ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
              </button>
              {acikMi && (
                <div id={`sure-${s.id}`} className="border-b border-border-subtle bg-surface-muted/30 px-4 py-4">
                  <SureAyrinti s={s} rol={rol} kullaniciId={kullaniciId} belgeler={belgeler} dosyaSutunu={dosyaSutunu} />
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

const AVUKAT_ROLLERI = ['ADMIN', 'AVUKAT']

function SureAyrinti({ s, rol, kullaniciId, belgeler, dosyaSutunu }: { s: SureSatiri; rol: string; kullaniciId: string; belgeler?: BelgeSecenegi[]; dosyaSutunu: boolean }) {
  const [form, setForm] = useState<'ONAY' | 'TETIK' | 'KAPANIS' | null>(null)
  const { pending, mesaj, calistir } = useSureIslem()
  const avukat = AVUKAT_ROLLERI.includes(rol)
  const yazabilir = avukat || rol === 'AVUKAT_YRD'
  const kapali = s.durum === 'KAPANDI' || s.durum === 'IPTAL'
  const h = hedefGun(s)

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-3 text-[12.5px]">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">Dayanak: {s.dayanak}</Badge>
          <Badge tone="warning">teyit gerekli</Badge>
          {s.kritik && <Badge tone="danger">Kritik süre</Badge>}
          {s.kesinSureIhtari && <Badge tone="steel">Kesin süre ihtarı var</Badge>}
          {dosyaSutunu && <Link href={`/akilli-giris/${s.dosyaId}`} className="font-semibold text-kr-ink hover:underline">Dosyayı aç</Link>}
        </div>

        <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Tetik</dt>
          <dd>{s.tetikAciklama}: <span className="font-mono">{g(s.tetikTarihi)}</span>{s.tetikTuru ? ` (${TETIK_TURU_ETIKET[s.tetikTuru as TetikTuru] ?? s.tetikTuru})` : ''}</dd>
          <dt className="text-muted-foreground">UETS ulaşma</dt>
          <dd className="font-mono">{g(s.uetsUlasmaTarihi)}</dd>
          <dt className="text-muted-foreground">Hatırlatma günü</dt>
          <dd>{h.tarih ? <><span className="font-mono">{g(h.tarih)}</span> · {h.kaynak === 'ONAYLANAN' ? 'onaylanan' : 'ihtiyatlı öneri'}</> : '—'}</dd>
          <dt className="text-muted-foreground">Onaylayan</dt>
          <dd>{s.onaylayanAd ? `${s.onaylayanAd} · ${g(s.onayAt)}` : '—'}</dd>
          <dt className="text-muted-foreground">Bakılan evrak</dt>
          <dd>{s.bakilanEvrak ?? '—'}</dd>
          <dt className="text-muted-foreground">İkinci teyit</dt>
          <dd>{s.ikinciTeyitAd ? `${s.ikinciTeyitAd} · ${g(s.ikinciTeyitAt)}` : s.kritik ? 'Yok (kritik sürede önerilir)' : '—'}</dd>
          {s.kapanisAt && <><dt className="text-muted-foreground">Kapanış</dt><dd>{g(s.kapanisAt)} · {s.kapanisNot ?? (s.kapanisKanitiBelgeId ? 'Evrak kanıtıyla' : '—')}</dd></>}
        </dl>

        {s.kaynakAlinti && (
          <blockquote className="border-l-2 border-kr pl-3 italic text-muted-foreground">&ldquo;{s.kaynakAlinti}&rdquo;</blockquote>
        )}

        {s.iz.length > 0 && (
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Hesap izi</div>
            <ol className="list-decimal space-y-0.5 pl-5">{s.iz.map((x, i) => <li key={i}>{x}</li>)}</ol>
          </div>
        )}
        {(s.uyarilar.length > 0 || s.eksik) && (
          <ul className="space-y-1">
            {s.eksik && <li className="rounded-[8px] bg-info-soft/60 px-2.5 py-1.5 text-info">{s.eksik}</li>}
            {s.uyarilar.map((u, i) => <li key={i} className="rounded-[8px] bg-warning-soft/60 px-2.5 py-1.5 text-warning">{u}</li>)}
          </ul>
        )}
        {s.hatirlatmalar.length > 0 && (
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Hatırlatmalar</div>
            <ul className="space-y-0.5">
              {s.hatirlatmalar.map((k, i) => (
                <li key={i} className="font-mono text-[11.5px]">
                  {k.esik} gün kala · son gün {gunTR(tarihOku(k.hedef))} · {k.gonderildi ? 'gönderildi' : k.kip === 'console' ? 'GÖNDERİLMEDİ (console)' : `gönderilemedi${k.hata ? `: ${k.hata}` : ''}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {!kapali && yazabilir && !form && (
          <div className="flex flex-wrap gap-2">
            {avukat && !s.onaylananSonGun && (
              <button type="button" onClick={() => setForm('ONAY')} className={BTN_IKINCIL}>Son günü onayla</button>
            )}
            {avukat && s.onaylananSonGun && (
              <button type="button" onClick={() => setForm('ONAY')} className={BTN_IKINCIL}>Onaylanan günü değiştir</button>
            )}
            {avukat && s.onaylananSonGun && !s.ikinciTeyitAd && s.onaylayanId !== kullaniciId && (
              <button type="button" disabled={pending} onClick={() => calistir(() => sureIkinciTeyit({ sureId: s.id }))} className={BTN_IKINCIL}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />} İkinci teyit ver
              </button>
            )}
            {(s.durum === 'TETIK_BEKLIYOR' || !s.onaylananSonGun || avukat) && (
              <button type="button" onClick={() => setForm('TETIK')} className={BTN_IKINCIL}>Tetik tarihini gir</button>
            )}
            {avukat && (
              <button type="button" onClick={() => setForm('KAPANIS')} className={BTN_IKINCIL}>Kapat / iptal</button>
            )}
            {avukat && (h.tarih != null) && (
              <button type="button" disabled={pending} onClick={() => calistir(() => sureTestHatirlatmasi({ sureId: s.id }))} className={BTN_IKINCIL}>
                <MailCheck className="h-3.5 w-3.5" aria-hidden /> Bana test hatırlatması gönder
              </button>
            )}
          </div>
        )}
        {!yazabilir && <p className="text-[12px] text-muted-foreground">Görüntüleme yetkiniz var; süre üzerinde işlem yapamazsınız.</p>}
        {form === 'ONAY' && <SureOnayFormu sure={s} onKapat={() => setForm(null)} />}
        {form === 'TETIK' && <SureTetikFormu sure={s} onKapat={() => setForm(null)} />}
        {form === 'KAPANIS' && <SureKapanisFormu sure={s} belgeler={belgeler} onKapat={() => setForm(null)} />}
        <IslemMesaji mesaj={mesaj} />
      </div>
    </div>
  )
}
