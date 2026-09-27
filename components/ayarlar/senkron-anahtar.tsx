'use client'

/**
 * KonsRücü — Şirket Bilgileri · UYAP eklenti anahtarları.
 *
 * S14 (F17, B51): KİŞİSEL ANAHTAR (EklentiAnahtar) — kişiye bağlı, 90 gün geçerli, iptal edilebilir; düz anahtar
 * saklanmaz (yalnız sha256 özeti), bir kez gösterilir, sonra yalnız ilk 6 karakter. Eklenti 2.0 bununla çalışır;
 * işlemler kişinin adıyla kaydedilir; iş kuyruğu (anlık senkron) yalnız kişisel anahtarla açılır.
 * ESKİ ŞİRKET ANAHTARI (Ayarlar.senkronToken): 1.9 eklentisi geçiş süresince bununla çalışmaya devam eder.
 * Aynı şirket için eklentiye kişisel anahtar girilince eklenti eskisini kullanmaz.
 *
 * Props (değişmedi): musteriId, init.yuklu, programUrl, saglik. Kişisel anahtarlar bileşen içinden yüklenir.
 */
import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, RefreshCw, Trash2, AlertTriangle, Plus } from 'lucide-react'
import { senkronTokenUret, senkronTokenSil } from '@/app/(app)/ayarlar/actions'
import { eklentiAnahtarIptal, eklentiAnahtarlariGetir, eklentiAnahtarOlustur, type EklentiAnahtarlariSonuc, type EklentiAnahtarSatiri } from '@/app/(app)/dosya-islem/senkron-actions'
import { Kopyala } from '@/components/akilli-giris/kopyala'
import { UyapBaglanti } from '@/components/senkron/uyap-baglanti'

export type SenkronSaglik = {
  aktifToplam: number
  bekleyen: number
  sonSenkron: string | null
  enEskiSenkron?: string | null // en az güncel çekilmiş dosya (ISO) — "en eski bekleyen"
  hicSenkronsuz?: number // eklentinin hiç ulaşmadığı dosya sayısı
  senkronDisi?: number // uyapEslesme ≠ OK: eklenti çalışıp UYAP'ta eşleştiremedi
}

export function SenkronAnahtar({ musteriId, init, programUrl, saglik }: { musteriId: string; init: { yuklu: boolean }; programUrl: string; saglik?: SenkronSaglik }) {
  const [token, setToken] = useState<string | null>(null) // sadece yeni üretilince gösterilir
  const [yuklu, setYuklu] = useState(init.yuklu)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  function uret() {
    setErr(null)
    start(async () => {
      const r = await senkronTokenUret(musteriId)
      if (r.ok && r.token) { setToken(r.token); setYuklu(true); router.refresh() } else setErr(r.error ?? 'Üretilemedi')
    })
  }
  function sil() {
    setErr(null)
    start(async () => {
      const r = await senkronTokenSil(musteriId)
      if (r.ok) { setToken(null); setYuklu(false); router.refresh() } else setErr(r.error ?? 'Kaldırılamadı')
    })
  }

  const INP = 'w-full rounded-[9px] border border-border bg-surface-muted px-3 py-2 font-mono text-[12.5px] text-foreground outline-none'

  // son senkron tazeliği: >28 saat = uyarı rengi (eklenti susmuş olabilir)
  const sonSenkronDt = saglik?.sonSenkron ? new Date(saglik.sonSenkron) : null
  const saatOnce = sonSenkronDt ? Math.round((Date.now() - sonSenkronDt.getTime()) / 3_600_000) : null
  const bayat = saglik ? saglik.aktifToplam > 0 && (!sonSenkronDt || (saatOnce ?? 0) >= 28) : false
  const hicSenkronsuz = saglik?.hicSenkronsuz ?? 0
  const senkronDisi = saglik?.senkronDisi ?? 0
  // tarih + yaş etiketi (İstanbul); 48 saatten eski → gün cinsinden
  const yasla = (iso: string) => {
    const dt = new Date(iso)
    const sa = Math.round((Date.now() - dt.getTime()) / 3_600_000)
    const yas = sa >= 48 ? `~${Math.round(sa / 24)} gün önce` : `~${sa} sa önce`
    return `${dt.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })} (${yas})`
  }

  return (
    <div className="flex flex-col gap-3">
      <EklentiAnahtarlari />

      <div className="mt-2 border-t border-border-subtle pt-3">
        <div className="font-display text-[14px] font-bold text-foreground">Eski şirket anahtarı (eklenti 1.9)</div>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground">
          Geçiş süresince 1.9 eklentisi bu ortak anahtarla çalışmaya devam eder. Eklenti 2.0&apos;a kişisel anahtarınızı girdiğinizde
          eklenti bu şirket için eski anahtarı kullanmaz. Anlık çekme ve kopilot faizi yalnız kişisel anahtarla çalışır.
        </p>
      </div>

      {saglik && saglik.aktifToplam > 0 && (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border px-3 py-2 text-[12px] ${bayat ? 'border-danger/30 bg-danger-soft/40 text-danger' : 'border-border-subtle bg-surface-muted/40 text-muted-foreground'}`}>
          {bayat && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
          <span>
            Son senkron:{' '}
            <b className="font-mono">{saglik.sonSenkron ? yasla(saglik.sonSenkron) : 'hiç gelmedi'}</b>
          </span>
          <span>· {saglik.aktifToplam} aktif dosya · <b>{saglik.bekleyen}</b> senkron bekliyor</span>
          {hicSenkronsuz > 0 ? (
            <span>· <b>{hicSenkronsuz}</b> dosya hiç çekilmemiş</span>
          ) : saglik.enEskiSenkron ? (
            <span className="font-mono text-[11.5px]">· en eskisi {yasla(saglik.enEskiSenkron)}</span>
          ) : null}
          {bayat && <span className="basis-full text-[11.5px]">Eklenti susmuş görünüyor — Chrome + UYAP oturumu + eklentiyi kontrol edin.</span>}
        </div>
      )}

      {senkronDisi > 0 && (
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1 rounded-[10px] border border-warning/30 bg-warning-soft/40 px-3 py-2 text-[12px] text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span><b>{senkronDisi}</b> dosya UYAP&apos;ta eşleşmedi (senkron dışı) — daire eksik / bulunamadı / başka dairede olabilir. Bu dosyalarda olay akışı gelmez; icra no ve daireyi kontrol edin.</span>
        </div>
      )}

      <div>
        <label className="font-mono mb-1 block text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Program adresi (eklentiye)</label>
        <div className="flex items-center gap-2">
          <input readOnly value={programUrl} className={INP} onFocus={(e) => e.currentTarget.select()} />
          <Kopyala metin={programUrl} etiket="Kopyala" />
        </div>
      </div>

      {token ? (
        <div className="rounded-xl border border-success/30 bg-success-soft/40 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-success"><AlertTriangle className="h-3.5 w-3.5" /> Anahtar bir kez gösterilir — şimdi kopyalayıp eklentiye yapıştırın.</div>
          <div className="flex items-center gap-2">
            <input readOnly value={token} className={INP} onFocus={(e) => e.currentTarget.select()} />
            <Kopyala metin={token} etiket="Kopyala" />
          </div>
        </div>
      ) : (
        <div className="text-[12.5px] text-muted-foreground">{yuklu ? 'Anahtar tanımlı (gizli). Kaybettiyseniz yenileyin — eskisi geçersiz olur.' : 'Henüz anahtar yok.'}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={uret} disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] border border-border px-3 py-2 text-[13px] font-medium text-foreground transition hover:border-kr/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : yuklu ? <RefreshCw className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />} {yuklu ? 'Anahtarı yenile' : 'Anahtar üret'}
        </button>
        {yuklu && (
          <button type="button" onClick={sil} disabled={pending} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[13px] font-medium text-muted-foreground transition hover:border-danger/40 hover:text-danger disabled:opacity-60">
            <Trash2 className="h-4 w-4" /> Kaldır
          </button>
        )}
        {err && <span className="text-[12px] text-danger">{err}</span>}
      </div>
    </div>
  )
}

// ─────────────────────────── kişisel eklenti anahtarları (S14) ───────────────────────────

const DURUM_ETIKET: Record<EklentiAnahtarSatiri['durum'], { metin: string; cls: string }> = {
  AKTIF: { metin: 'ETKİN', cls: 'bg-success-soft text-success' },
  YAKINDA_DOLACAK: { metin: 'YAKINDA DOLACAK', cls: 'bg-warning-soft text-warning' },
  SURESI_DOLDU: { metin: 'SÜRESİ DOLDU', cls: 'bg-danger-soft text-danger' },
  IPTAL: { metin: 'İPTAL', cls: 'bg-muted text-muted-foreground' },
}

function gunTR(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Istanbul' })
}

/** Kişisel eklenti anahtarları: oluştur (bir kez gösterilir), ad ver, iptal et, son görülme. */
export function EklentiAnahtarlari() {
  const [veri, setVeri] = useState<EklentiAnahtarlariSonuc | null>(null)
  const [ad, setAd] = useState('')
  const [yeni, setYeni] = useState<string | null>(null)
  const [iptalOnay, setIptalOnay] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const yukle = useCallback(async () => {
    const r = await eklentiAnahtarlariGetir().catch(() => null)
    setVeri(r ?? { ok: false, error: 'Anahtarlar okunamadı.' })
  }, [])
  useEffect(() => { yukle() }, [yukle])

  function olustur(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setYeni(null)
    start(async () => {
      const r = await eklentiAnahtarOlustur({ ad: ad.trim() || undefined })
      if (!r.ok || !r.anahtar) { setErr(r.error ?? 'Oluşturulamadı'); return }
      setYeni(r.anahtar); setAd('')
      await yukle()
    })
  }
  function iptal(id: string) {
    setErr(null)
    start(async () => {
      const r = await eklentiAnahtarIptal({ id })
      if (!r.ok) setErr(r.error ?? 'İptal edilemedi')
      setIptalOnay(null)
      await yukle()
    })
  }

  const INP = 'w-full rounded-[9px] border border-border bg-surface-muted px-3 py-2 font-mono text-[12.5px] text-foreground outline-none'

  return (
    <section aria-label="Kişisel eklenti anahtarları" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-[14px] font-bold text-foreground">Kişisel eklenti anahtarları</div>
        <UyapBaglanti baglanti={veri?.baglanti ?? null} ayrintili />
      </div>
      <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
        Eklenti 2.0 kişisel anahtarla çalışır: işlemler adınızla kaydedilir, anahtar 90 gün geçerlidir ve istediğiniz an iptal edilir.
        Anahtar yalnız oluşturulduğunda bir kez gösterilir; eklentide ⚙ Ayar&apos;a yapıştırın.
      </p>

      {veri && !veri.ok && <p role="alert" className="text-[12px] text-danger">{veri.error}</p>}

      {veri?.olusturabilir && (
        <form onSubmit={olustur} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[12px] font-medium text-muted-foreground">
            Anahtarın adı (isteğe bağlı)
            <input value={ad} onChange={(e) => setAd(e.target.value)} maxLength={60} placeholder="ör. Büro bilgisayarı" className="rounded-[9px] border border-input bg-background px-3 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 disabled:opacity-60">
            {pending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Plus className="h-4 w-4" />} Anahtar oluştur
          </button>
        </form>
      )}
      {veri?.ok && !veri.olusturabilir && <p className="text-[12.5px] text-muted-foreground">Görüntüleyen rolü eklenti anahtarı oluşturamaz.</p>}

      {yeni && (
        <div className="rounded-xl border border-success/30 bg-success-soft/40 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-success"><AlertTriangle className="h-3.5 w-3.5" /> Anahtar bir kez gösterilir — şimdi kopyalayıp eklentiye yapıştırın.</div>
          <div className="flex items-center gap-2">
            <input readOnly value={yeni} className={INP} onFocus={(e) => e.currentTarget.select()} aria-label="Yeni eklenti anahtarı" />
            <Kopyala metin={yeni} etiket="Kopyala" />
          </div>
        </div>
      )}

      {err && <p role="alert" className="text-[12px] text-danger">{err}</p>}

      {veri?.ok && (veri.anahtarlar?.length ? (
        <div className="overflow-x-auto rounded-[10px] border border-border-subtle">
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-muted text-left text-[11.5px] text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1.5">Anahtar</th>
                <th className="px-2.5 py-1.5">Ad</th>
                {veri.yonetici && <th className="px-2.5 py-1.5">Sahibi</th>}
                <th className="px-2.5 py-1.5">Durum</th>
                <th className="px-2.5 py-1.5">Son kullanma</th>
                <th className="px-2.5 py-1.5">Son görülme</th>
                <th className="px-2.5 py-1.5"><span className="sr-only">İşlem</span></th>
              </tr>
            </thead>
            <tbody>
              {veri.anahtarlar.map((a) => (
                <tr key={a.id} className="border-t border-border-subtle">
                  <td className="font-mono px-2.5 py-1.5">{a.gosterim}</td>
                  <td className="px-2.5 py-1.5">{a.ad ?? '—'}</td>
                  {veri.yonetici && <td className="px-2.5 py-1.5">{a.sahibiAd ?? '—'}{a.benim ? ' (siz)' : ''}</td>}
                  <td className="px-2.5 py-1.5"><span className={`rounded-full px-2 py-[2px] text-[10.5px] font-semibold ${DURUM_ETIKET[a.durum].cls}`}>{DURUM_ETIKET[a.durum].metin}</span></td>
                  <td className="font-mono px-2.5 py-1.5">{gunTR(a.sonKullanma)}{a.durum === 'AKTIF' || a.durum === 'YAKINDA_DOLACAK' ? ` · ${a.kalanGun} gün` : ''}</td>
                  <td className="font-mono px-2.5 py-1.5">{a.sonGorulme ? gunTR(a.sonGorulme) : 'henüz yok'}</td>
                  <td className="px-2.5 py-1.5 text-right">
                    {a.durum !== 'IPTAL' && (a.benim || veri.yonetici) && (iptalOnay === a.id ? (
                      <span className="inline-flex gap-1.5">
                        <button type="button" disabled={pending} onClick={() => iptal(a.id)} className="rounded-[8px] border border-danger/40 px-2 py-0.5 text-[11.5px] font-semibold text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Evet, iptal et</button>
                        <button type="button" onClick={() => setIptalOnay(null)} className="rounded-[8px] border border-border px-2 py-0.5 text-[11.5px] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Vazgeç</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setIptalOnay(a.id)} className="rounded-[8px] border border-border px-2 py-0.5 text-[11.5px] text-muted-foreground transition hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">İptal et</button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">Henüz kişisel anahtarınız yok. Bir anahtar oluşturup eklentiye yapıştırın.</p>
      ))}
    </section>
  )
}
