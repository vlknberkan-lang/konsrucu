'use client'

/**
 * KonsRücü — İskelet ve üslup kartı ayarları (dilekçe v2) · components/dilekce-v2/sablon-ayarlari.tsx
 *
 * S36 (06 §7.1): iskelet ve üslup kartı müvekkil bazındadır ve avukat onaylıdır. Basit akış: avukat yeni bir
 * iskelet ya da üslup kuralı yazar, kaydettiği an onaylanmış sayılır (aktif + onaylı). Var olanı "pasife al"
 * ile devre dışı bırakabilir; kayıt silinmez.
 */
import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { sablonKaydetVeOnayla, sablonPasifeAl, uslupKaydetVeOnayla, uslupPasifeAl } from '@/app/(app)/dilekceler/sablon/actions'
import { KART_TURLERI, KART_TUR_ADI, type KartTuru } from '@/lib/konsrucu/dilekce-v2/tipler'
import { alan, birincilDugme, kart as kartCls, kucukDugme, odak } from './stil'

export type SablonSatiri = { id: string; kod: string; tur: string; surum: number; aktif: boolean; onayAt: string | null; varyantJson: unknown }
export type UslupSatiri = { id: string; kapsam: string; metin: string; ornek: string | null; durum: string }

export type SablonAyarlariProps = {
  sablonlar: SablonSatiri[]
  kurallar: UslupSatiri[]
  /** Yalnız avukat kaydeder/pasife alır (server action da aynı kapıyı tekrar kontrol eder). */
  yazabilir: boolean
}

const KAPSAM_SECENEKLERI = ['HEPSI', ...KART_TURLERI] as const

function varyantOzeti(v: unknown): string {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'genel (her varyanta uyar)'
  const o = v as Record<string, unknown>
  const s = Object.entries(o).filter(([, x]) => typeof x === 'string' && x).map(([k, x]) => `${k}=${x}`)
  return s.length ? s.join(', ') : 'genel (her varyanta uyar)'
}

export function SablonAyarlari({ sablonlar, kurallar, yazabilir }: SablonAyarlariProps) {
  const router = useRouter()
  const id = useId()
  const [bekliyor, setBekliyor] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)

  const [kod, setKod] = useState('')
  const [tur, setTur] = useState<KartTuru>('DAVA')
  const [rucuSebebiKod, setRucuSebebiKod] = useState('')
  const [mahkemeTuru, setMahkemeTuru] = useState('')
  const [usul, setUsul] = useState('')
  const [kaynakMetni, setKaynakMetni] = useState('')

  const [kapsam, setKapsam] = useState<(typeof KAPSAM_SECENEKLERI)[number]>('HEPSI')
  const [uslupMetin, setUslupMetin] = useState('')
  const [ornek, setOrnek] = useState('')

  async function calistir(anahtar: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>, basariMesaji: string) {
    if (bekliyor) return
    setBekliyor(anahtar); setHata(null); setBilgi(null)
    try {
      const r = await fn()
      if (!r.ok) setHata(r.error)
      else { setBilgi(basariMesaji); router.refresh() }
    } catch {
      setHata('İşlem tamamlanamadı. Lütfen tekrar deneyin.')
    } finally {
      setBekliyor(null)
    }
  }

  async function iskeletKaydet() {
    await calistir('iskelet', () => sablonKaydetVeOnayla({
      kod, tur, kaynakMetni,
      rucuSebebiKod: rucuSebebiKod || undefined, mahkemeTuru: mahkemeTuru || undefined, usul: usul || undefined,
    }), 'İskelet kaydedildi ve onaylandı.')
    setKod(''); setKaynakMetni(''); setRucuSebebiKod(''); setMahkemeTuru(''); setUsul('')
  }

  async function uslupEkle() {
    await calistir('uslup', () => uslupKaydetVeOnayla({ kapsam, metin: uslupMetin, ornek: ornek || undefined }), 'Üslup kuralı kaydedildi ve onaylandı.')
    setUslupMetin(''); setOrnek('')
  }

  return (
    <div className="space-y-5">
      {hata && <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{hata}</div>}
      {bilgi && <div role="status" className="rounded-xl bg-info-soft px-4 py-3 text-xs leading-5 text-info">{bilgi}</div>}

      {/* İskelet */}
      <section className={kartCls} aria-labelledby={`${id}-iskelet-baslik`}>
        <div className="border-b border-border px-4 py-3">
          <h2 id={`${id}-iskelet-baslik`} className="font-display text-base font-extrabold">İskeletler</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Bölüm sırası, sabit ve koşullu bloklar ({'{{alan}}'} ve {'{{AI: …}}'} dilinde). Bu müvekkile özeldir; başka müvekkilde görünmez.</p>
        </div>
        <ul className="divide-y divide-border">
          {sablonlar.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <span className="font-mono font-semibold">{s.kod}</span> · {KART_TUR_ADI[s.tur as KartTuru] ?? s.tur} · sürüm {s.surum}
                <p className="text-[11px] text-muted-foreground">{varyantOzeti(s.varyantJson)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone={s.aktif ? 'success' : 'steel'}>{s.aktif ? 'aktif' : 'pasif'}</Badge>
                {s.aktif && yazabilir && (
                  <button type="button" disabled={!!bekliyor} onClick={() => calistir(`pasif-${s.id}`, () => sablonPasifeAl({ id: s.id }), 'İskelet pasife alındı.')} className={`${kucukDugme} border border-border hover:bg-muted`}>
                    {bekliyor === `pasif-${s.id}` ? <Loader2 className="dd-spin h-3.5 w-3.5" aria-hidden /> : null} Pasife al
                  </button>
                )}
              </div>
            </li>
          ))}
          {!sablonlar.length && <li className="px-4 py-3 text-sm text-muted-foreground">Henüz onaylı iskelet yok; kod içindeki varsayılan iskelet kullanılıyor.</li>}
        </ul>
        {yazabilir && (
          <div className="space-y-2.5 border-t border-border p-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="text-xs font-semibold">Kod<input value={kod} onChange={(e) => setKod(e.target.value)} placeholder="itirazin-iptali-kasko" className={`${alan} mt-1`} /></label>
              <label className="text-xs font-semibold">Tür<select value={tur} onChange={(e) => setTur(e.target.value as KartTuru)} className={`${alan} mt-1`}>{KART_TURLERI.map((t) => <option key={t} value={t}>{KART_TUR_ADI[t]}</option>)}</select></label>
              <label className="text-xs font-semibold">Rücu sebebi kodu (boşsa genel)<input value={rucuSebebiKod} onChange={(e) => setRucuSebebiKod(e.target.value)} placeholder="KASKO_HALEFIYET" className={`${alan} mt-1`} /></label>
              <label className="text-xs font-semibold">Mahkeme türü (boşsa genel)<input value={mahkemeTuru} onChange={(e) => setMahkemeTuru(e.target.value)} placeholder="ASLIYE_HUKUK" className={`${alan} mt-1`} /></label>
              <label className="text-xs font-semibold">Usul (boşsa genel)<select value={usul} onChange={(e) => setUsul(e.target.value)} className={`${alan} mt-1`}><option value="">Genel</option><option value="YAZILI">Yazılı</option><option value="BASIT">Basit</option></select></label>
            </div>
            <label className="block text-xs font-semibold">Şablon metni ({'{{alan}}'}, {'{{#koşul}}'}, {'{{AI: talimat}}'})
              <textarea value={kaynakMetni} onChange={(e) => setKaynakMetni(e.target.value)} rows={12} className={`${alan} mt-1 font-mono text-xs`} placeholder={'{{! [B01 BASLIK] SABİT }}\n{{mahkeme_adi|buyuk}}\n…'} />
            </label>
            <button type="button" onClick={iskeletKaydet} disabled={!!bekliyor || kod.trim().length < 2 || kaynakMetni.trim().length < 20} className={birincilDugme}>
              {bekliyor === 'iskelet' ? <Loader2 className="dd-spin h-4 w-4" aria-hidden /> : null} Kaydet ve onayla
            </button>
          </div>
        )}
      </section>

      {/* Üslup kartı */}
      <section className={kartCls} aria-labelledby={`${id}-uslup-baslik`}>
        <div className="border-b border-border px-4 py-3">
          <h2 id={`${id}-uslup-baslik`} className="font-display text-base font-extrabold">Üslup kartı</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Hitap, paragraf uzunluğu, talep formülleri, kaçınılan ifadeler … Yalnız onaylı kurallar yapay zekâya gider.</p>
        </div>
        <ul className="divide-y divide-border">
          {kurallar.map((k) => (
            <li key={k.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <Badge tone="steel">{k.kapsam === 'HEPSI' ? 'Tüm türler' : KART_TUR_ADI[k.kapsam as KartTuru] ?? k.kapsam}</Badge>
                <p className="mt-1">{k.metin}</p>
                {k.ornek && <p className="mt-0.5 text-[11px] italic text-muted-foreground">Örnek: “{k.ornek}”</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge tone={k.durum === 'ONAYLI' ? 'success' : 'steel'}>{k.durum === 'ONAYLI' ? 'onaylı' : 'pasif'}</Badge>
                {k.durum === 'ONAYLI' && yazabilir && (
                  <button type="button" disabled={!!bekliyor} onClick={() => calistir(`uslup-pasif-${k.id}`, () => uslupPasifeAl({ id: k.id }), 'Üslup kuralı pasife alındı.')} className={`${kucukDugme} border border-border hover:bg-muted`}>
                    {bekliyor === `uslup-pasif-${k.id}` ? <Loader2 className="dd-spin h-3.5 w-3.5" aria-hidden /> : null} Pasife al
                  </button>
                )}
              </div>
            </li>
          ))}
          {!kurallar.length && <li className="px-4 py-3 text-sm text-muted-foreground">Henüz onaylı üslup kuralı yok; yapay zekâ varsayılan (nötr) üslupla yazar.</li>}
        </ul>
        {yazabilir && (
          <div className="space-y-2.5 border-t border-border p-4">
            <div className="grid gap-2.5 sm:grid-cols-[200px_1fr]">
              <label className="text-xs font-semibold">Kapsam
                <select value={kapsam} onChange={(e) => setKapsam(e.target.value as typeof kapsam)} className={`${alan} mt-1`}>
                  {KAPSAM_SECENEKLERI.map((k) => <option key={k} value={k}>{k === 'HEPSI' ? 'Tüm türler' : KART_TUR_ADI[k]}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold">Kural<textarea value={uslupMetin} onChange={(e) => setUslupMetin(e.target.value)} rows={2} placeholder="Örn. Sayın Hakimliğinize yerine Sayın Mahkemenize kullanılır." className={`${alan} mt-1`} /></label>
            </div>
            <label className="block text-xs font-semibold">Maskeli örnek paragraf (isteğe bağlı)<textarea value={ornek} onChange={(e) => setOrnek(e.target.value)} rows={2} className={`${alan} mt-1`} /></label>
            <button type="button" onClick={uslupEkle} disabled={!!bekliyor || uslupMetin.trim().length < 5} className={birincilDugme}>
              {bekliyor === 'uslup' ? <Loader2 className="dd-spin h-4 w-4" aria-hidden /> : null} Kaydet ve onayla
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
