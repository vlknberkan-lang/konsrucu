'use client'

/**
 * KonsRücü — Dosya kartı ekranı (dilekçe v2, aşama 1) · components/dilekce-v2/dosya-karti.tsx
 *
 * 06 §2(h) ekran taslağı: solda kaynaklı olgular, sağda avukatın seçimleri; altta "Kod basar: …" ve tek birincil
 * eylem. Kart yoksa birincil eylem "Dosya kartını hazırla"; taslak kartta "Kart doğru – kilitle" (yalnız avukat;
 * kritik olgular onaylanmadan kilitli). Kilitli kartta düzeltme yeni sürüm açar. Kişisel veri varsayılan maskeli.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, FileSearch, History, Loader2, Lock, RefreshCw, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { BelgeOnizleme, type OnizlemeBelge } from '@/components/akilli-giris/detay/belge-onizleme'
import {
  dosyaKartiHazirla, kartiKilitle, kartOlguDuzelt, kartOlguOnayla, kartSavunmaIsaretle, kartSecimleriKaydet,
} from '@/app/(app)/dilekceler/kart/actions'
import type { SecimGirdisi } from '@/lib/konsrucu/dilekce-v2/kart'
import { ekranMaskele } from '@/lib/konsrucu/dilekce-v2/ekran-maske'
import { KART_TUR_ADI, type KartGorunum, type KartTuru } from '@/lib/konsrucu/dilekce-v2/tipler'
import { tarihSaatTR, tarihTR } from '@/lib/konsrucu/format'
import { OlguSatiri, type OlguDuzeltGirdisi } from './olgu-satiri'
import { SavunmaMatrisi } from './savunma-matrisi'
import { KartSecimleri } from './secimler'
import { birincilDugme, ikincilDugme, kart as kartCls, odak, sessizDugme } from './stil'

export type DosyaKartiEkraniProps = {
  dosya: { id: string; no: string; taraf: string }
  tur: KartTuru
  kart: KartGorunum | null
  gecmis: { id: string; surum: number; durum: string; onayAt: string | null; createdAt: string }[]
  /** Düzeltmede kaynak seçimi ve "Kaynağı aç" için dosyanın belgeleri. */
  belgeler: { id: string; ad: string }[]
  yetki: { yazabilir: boolean; avukat: boolean }
  /** Yapay zekâ yüzeyi açık mı (kapalıysa kart kayıtlardan kurulur). */
  ai: { acik: boolean; mesaj: string | null }
}

const DURUM_ADI: Record<string, string> = { TASLAK: 'taslak', ONAYLI: 'kilitli', ESKIDI: 'eskidi' }

export function DosyaKartiEkrani({ dosya, tur, kart, gecmis, belgeler, yetki, ai }: DosyaKartiEkraniProps) {
  const router = useRouter()
  const [bekliyor, setBekliyor] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string[]>([])
  const [maskeli, setMaskeli] = useState(true)
  const [onizleme, setOnizleme] = useState<OnizlemeBelge | null>(null)
  const icerik = kart?.icerik
  const kilitli = kart?.durum === 'ONAYLI'
  const duzenlenebilir = !!kart && kart.durum !== 'ESKIDI' && yetki.yazabilir
  const goster = (s: string) => (maskeli ? ekranMaskele(s) : s)

  const [kritikler, digerleri] = useMemo(() => {
    const o = icerik?.olgular ?? []
    return [o.filter((x) => x.kritik), o.filter((x) => !x.kritik)]
  }, [icerik])
  const onaysizKritik = kritikler.filter((x) => !x.onayli).length

  async function calistir(ad: string, fn: () => Promise<{ ok: true; uyarilar?: string[] } | { ok: false; error: string }>) {
    if (bekliyor) return
    setBekliyor(ad); setHata(null); setBilgi([])
    try {
      const r = await fn()
      if (!r.ok) setHata(r.error)
      else { setBilgi(r.uyarilar ?? []); router.refresh() }
    } catch {
      setHata('İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.')
    } finally {
      setBekliyor(null)
    }
  }

  const hazirla = () => calistir('hazirla', () => dosyaKartiHazirla({ dosyaId: dosya.id, tur }))
  const dogru = (id: string) => kart && calistir('onay', () => kartOlguOnayla({ kartId: kart.id, olguIdleri: [id], beklenenGuncelleme: kart.updatedAt }))
  const duzelt = (id: string, d: OlguDuzeltGirdisi) => kart && calistir('duzelt', () => kartOlguDuzelt({ kartId: kart.id, olguId: id, ...d, beklenenGuncelleme: kart.updatedAt }))
  const secimKaydet = (s: SecimGirdisi) => kart && calistir('secim', () => kartSecimleriKaydet({ kartId: kart.id, secimler: s, beklenenGuncelleme: kart.updatedAt }))
  const kilitle = () => kart && calistir('kilit', () => kartiKilitle({ kartId: kart.id, beklenenGuncelleme: kart.updatedAt }))
  const savunma = (id: string, isaret: 'CEVAPLANACAK' | 'ONEMSIZ') => kart && calistir('savunma', () => kartSavunmaIsaretle({ kartId: kart.id, savunmaId: id, isaret, beklenenGuncelleme: kart.updatedAt }))

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-7">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Dilekçe v2 · aşama 1</div>
          <h1 className="font-display mt-1.5 text-[26px] font-extrabold tracking-[-0.03em]">
            Dosya kartı · {KART_TUR_ADI[tur]}{kart ? ` · sürüm ${kart.surum} (${DURUM_ADI[kart.durum] ?? kart.durum})` : ''}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono">{dosya.no}</span> · {goster(dosya.taraf)}</p>
          <p className="mt-1.5 max-w-[70ch] text-xs text-muted-foreground">Her olgu kaynağıyla gelir. Kritik olguları “Doğru” ile onaylayın, seçimlerinizi kaydedin ve kartı kilitleyin. Kart kilitlenmeden dilekçe taslağı üretilmez.</p>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
          <input type="checkbox" checked={!maskeli} onChange={(e) => setMaskeli(!e.target.checked)} /> Kişisel veriyi göster
        </label>
      </div>

      {!ai.acik && <div role="status" className="mb-4 rounded-xl bg-info-soft px-4 py-3 text-xs leading-5 text-info">{ai.mesaj ?? 'Yapay zekâ kapalı: kart yalnız kayıtlı ve onaylı alanlardan kurulur.'}</div>}
      {hata && <div role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{hata}</div>}
      {bilgi.length > 0 && <div role="status" className="mb-4 space-y-1 rounded-xl bg-warning-soft px-4 py-3 text-xs leading-5 text-warning">{bilgi.map((b) => <p key={b}>{b}</p>)}</div>}

      {!kart || !icerik ? (
        <div className={`${kartCls} px-6 py-12 text-center`}>
          <FileSearch className="mx-auto h-9 w-9 text-primary" aria-hidden />
          <h2 className="font-display mt-4 text-xl font-extrabold">{kart ? 'Kart içeriği okunamadı' : 'Bu dosya için henüz kart yok'}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Program kayıtlardaki taraf, tutar, itiraz ve arabuluculuk bilgilerini toplar; belgelerden kaynaklı olguları ekler. Alıntısı belgede bulunamayan olgu karta giremez.</p>
          {yetki.yazabilir && (
            <button type="button" onClick={hazirla} disabled={!!bekliyor} className={`${birincilDugme} mt-5`}>
              {bekliyor === 'hazirla' ? <Loader2 className="dd-spin h-4 w-4" aria-hidden /> : <FileSearch className="h-4 w-4" aria-hidden />} Dosya kartını hazırla
            </button>
          )}
        </div>
      ) : (
        <>
          {kart.durum === 'ESKIDI' && <div role="status" className="mb-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">Bu sürüm eskidi. Güncel sürüm için sayfayı yenileyin.</div>}
          {icerik.ai.uyari && <div role="status" className="mb-4 rounded-xl bg-info-soft px-4 py-3 text-xs leading-5 text-info">{icerik.ai.uyari}</div>}

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
            {/* Olgular */}
            <section className={kartCls} aria-labelledby="olgular-baslik">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 id="olgular-baslik" className="font-display text-base font-extrabold">Olgular (kaynaklı)</h2>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={onaysizKritik ? 'warning' : 'success'} dot>{onaysizKritik ? `${onaysizKritik} kritik olgu onay bekliyor` : 'Kritik olguların hepsi onaylı'}</Badge>
                  <Badge tone="steel">{icerik.olgular.length} olgu</Badge>
                </div>
              </div>
              <div className="space-y-5 p-4">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-label text-muted-foreground">Kritik olgular</h3>
                  {kritikler.length ? (
                    <ul className="space-y-2">
                      {kritikler.map((o) => <OlguSatiri key={o.id} olgu={o} maskeli={maskeli} duzenlenebilir={duzenlenebilir} avukat={yetki.avukat} kilitli={kilitli} bekliyor={!!bekliyor} belgeler={belgeler} onDogru={dogru} onDuzelt={duzelt} onKaynakAc={setOnizleme} />)}
                    </ul>
                  ) : <p className="text-sm text-muted-foreground">Kritik olgu yok; aşağıdaki eksiklere bakın.</p>}
                </div>
                {digerleri.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-label text-muted-foreground">Diğer olgular</h3>
                    <ul className="space-y-2">
                      {digerleri.map((o) => <OlguSatiri key={o.id} olgu={o} maskeli={maskeli} duzenlenebilir={duzenlenebilir} avukat={yetki.avukat} kilitli={kilitli} bekliyor={!!bekliyor} belgeler={belgeler} onDogru={dogru} onDuzelt={duzelt} onKaynakAc={setOnizleme} />)}
                    </ul>
                  </div>
                )}
                {icerik.kaynaksizlar.length > 0 && (
                  <details className="rounded-xl border border-danger/30 bg-danger-soft/40 p-3">
                    <summary className={`cursor-pointer rounded text-sm font-semibold text-danger ${odak}`}>Karta giremeyen olgular ({icerik.kaynaksizlar.length})</summary>
                    <p className="mt-1 text-[11px] text-muted-foreground">Alıntısı belgede bulunamadı; dilekçede kullanılamaz.</p>
                    <ul className="mt-2 space-y-2">
                      {icerik.kaynaksizlar.map((k, i) => (
                        <li key={i} className="text-xs leading-5">
                          <span className="font-semibold">{goster(k.metin)}</span>
                          <span className="block text-muted-foreground">{k.belgeAdi ?? 'Belge yok'}{k.sayfa != null ? ` s.${k.sayfa}` : ''} · {k.neden}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </section>

            {/* Sağ sütun */}
            <div className="space-y-5">
              <KartSecimleri key={`${kart.id}-${kart.updatedAt}`} icerik={icerik} duzenlenebilir={duzenlenebilir && yetki.avukat} kilitli={kilitli} bekliyor={!!bekliyor} onKaydet={secimKaydet} />

              {icerik.tur === 'CEVABA_CEVAP' && (
                <SavunmaMatrisi
                  savunmalar={icerik.savunmalar}
                  goster={goster}
                  isaretlenebilir={duzenlenebilir && yetki.avukat}
                  bekliyor={!!bekliyor}
                  onIsaretle={savunma}
                />
              )}

              {(icerik.eksikler.length > 0 || icerik.celiskiler.length > 0) && (
                <section className={kartCls} aria-labelledby="eksik-baslik">
                  <div className="border-b border-border px-4 py-3"><h2 id="eksik-baslik" className="flex items-center gap-2 font-display text-base font-extrabold"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> Eksikler ve çelişkiler</h2></div>
                  <ul className="space-y-2 p-4 text-xs leading-5">
                    {icerik.eksikler.map((e, i) => <li key={`e${i}`} className={e.kritik ? 'text-danger' : 'text-muted-foreground'}>{e.kritik ? 'Kritik: ' : ''}{e.metin}</li>)}
                    {icerik.celiskiler.map((c, i) => <li key={`c${i}`} className="text-warning">⟨çelişki⟩ {goster(c.aciklama)}{c.olguIdleri.length ? ` (${c.olguIdleri.join(', ')})` : ''}</li>)}
                  </ul>
                </section>
              )}

              <details className={kartCls}>
                <summary className={`cursor-pointer rounded-2xl px-4 py-3 text-sm font-semibold ${odak}`}>Ekler ({icerik.ekler.length}) ve hukuki dayanaklar ({icerik.dayanaklar.length})</summary>
                <div className="space-y-3 border-t border-border p-4 text-xs leading-5">
                  <ol className="list-decimal space-y-0.5 pl-5">{icerik.ekler.map((e) => <li key={e.belgeId}>{e.ad}</li>)}</ol>
                  <div>
                    <p className="font-semibold">Hukuki sebepler bloğuna girecek doğrulanmış kayıtlar</p>
                    {icerik.dayanaklar.length ? <ul className="mt-1 list-disc pl-5 font-mono">{icerik.dayanaklar.map((d) => <li key={d.kaynakId}>{d.kunye}</li>)}</ul>
                      : <p className="text-muted-foreground">Doğrulanmış kayıt yok; atıf kütüphanesinde avukat doğrulaması bekleniyor.</p>}
                  </div>
                </div>
              </details>

              {gecmis.length > 1 && (
                <details className={kartCls}>
                  <summary className={`flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${odak}`}><History className="h-4 w-4" aria-hidden /> Sürümler ({gecmis.length})</summary>
                  <ul className="space-y-1 border-t border-border p-4 text-xs">
                    {gecmis.map((g) => <li key={g.id} className="flex justify-between gap-2"><span className="font-mono">Sürüm {g.surum}</span><span className="text-muted-foreground">{DURUM_ADI[g.durum] ?? g.durum} · {g.onayAt ? `kilit ${tarihSaatTR(g.onayAt, { day: '2-digit', month: '2-digit', year: 'numeric' })}` : tarihTR(g.createdAt)}</span></li>)}
                  </ul>
                </details>
              )}
            </div>
          </div>

          {/* Alt çubuk: kod basar + tek birincil eylem */}
          <div className={`${kartCls} sticky bottom-3 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
            <div className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
              <p><span className="font-semibold text-foreground">Kod basar:</span> başlık, taraflar, vekil, değer, deliller, EKLER, talep sonucu.</p>
              {kart.durum === 'TASLAK' && !kart.kilit.kilitlenebilir && (
                <p className="mt-0.5 flex items-start gap-1 text-warning"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {kart.kilit.nedenler.slice(0, 3).join(' ')}{kart.kilit.nedenler.length > 3 ? ` (+${kart.kilit.nedenler.length - 3})` : ''}</p>
              )}
              {kilitli && <p className="mt-0.5 flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Kart kilitli{kart.onayAt ? ` (${tarihSaatTR(kart.onayAt, { day: '2-digit', month: '2-digit', year: 'numeric' })})` : ''}. Dilekçe taslağı bu karttan üretilir.</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {kilitli && (
                <Link href={`/dilekceler/uret?dosya=${encodeURIComponent(dosya.id)}&tur=${tur}`} className={birincilDugme}>
                  Dilekçe taslağını üret
                </Link>
              )}
              {yetki.yazabilir && kart.durum !== 'ESKIDI' && (
                <button type="button" onClick={hazirla} disabled={!!bekliyor} className={sessizDugme} title="Kayıtlar ve belgelerden yeni sürüm hazırlar; aynı olguların onayı korunur">
                  {bekliyor === 'hazirla' ? <Loader2 className="dd-spin h-4 w-4" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Kartı yeniden hazırla
                </button>
              )}
              {kart.durum === 'TASLAK' && (
                yetki.avukat ? (
                  <button type="button" onClick={kilitle} disabled={!!bekliyor || !kart.kilit.kilitlenebilir} className={birincilDugme} aria-describedby={kart.kilit.kilitlenebilir ? undefined : 'kilit-neden'}>
                    {bekliyor === 'kilit' ? <Loader2 className="dd-spin h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />} Kart doğru – kilitle
                  </button>
                ) : <span className={`${ikincilDugme} pointer-events-none opacity-60`}>Kilit yalnız avukatta</span>
              )}
              {!kart.kilit.kilitlenebilir && <span id="kilit-neden" className="sr-only">{kart.kilit.nedenler.join(' ')}</span>}
            </div>
          </div>
        </>
      )}
      <BelgeOnizleme belge={onizleme} onKapat={() => setOnizleme(null)} />
    </div>
  )
}
