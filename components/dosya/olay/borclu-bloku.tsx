'use client'

/**
 * KonsRücü — Borçlu bazında tebliğ ve itiraz bloğu · components/dosya/olay/borclu-bloku.tsx
 *
 * 06 §2(e) "4 TEBLİĞ VE İTİRAZ · borçlu bazında": ödeme emri tebliği, itiraz (kaşe ve UYAP kayıt tarihi ayrı),
 * itirazın size tebliği ve İİK 62 / 67 / 78 satırları. Süreler ÖNERİDİR ("teyit gerekli"); onaylanan son gün
 * süre defterinde girilir (S24). İtirazın size tebliği eksikse [Tarih gir] (TB-08) burada açılır.
 * İtiraz onaylı ama kapsamı yoksa (ya da düzeltilecekse) [Kapsamı gir] / [Düzelt] (TB-07) burada açılır;
 * bu KARARDIR (06 §8.3) → yalnız `yetkili` (avukat/ADMIN) düzenleyebilir, diğerleri satırı salt görür.
 */
import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Check, ClipboardList, Loader2 } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { alacakliyaTebligTarihiGirEylem, itirazKapsamGirEylem } from '@/app/(app)/dosya-islem/olay-actions'
import { ROL_ETIKET, type BorcluBlokVM } from '@/lib/konsrucu/eksen/gorunum'
import { ITIRAZ_KAPSAM_ANAHTAR, ITIRAZ_KAPSAM_ETIKET, type ItirazKapsamAnahtar } from '@/lib/konsrucu/eksen/sabitler'
import { formatTRInput, toTRInput } from '@/lib/konsrucu/sayi'
import { DUGME_IKINCIL, DUGME_ONAY, ETIKET, GIRDI, ROL_TON, ROL_YAZI } from './rol'

export function BorcluBloku({ dosyaId, blok, tarihGirebilir, yetkili }: { dosyaId: string; blok: BorcluBlokVM; tarihGirebilir: boolean; yetkili: boolean }) {
  const kimlik = useId()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [acik, setAcik] = useState(false)
  const [tarih, setTarih] = useState('')
  const [hata, setHata] = useState<string | null>(null)
  const [uyari, setUyari] = useState<string[]>([])

  // TB-07 "Kapsamı gir" / "Düzelt" formu
  const [kapsamAcik, setKapsamAcik] = useState(false)
  const [itirazTipi, setItirazTipi] = useState<'TAM' | 'KISMI' | ''>('')
  const [kapsam, setKapsam] = useState<Partial<Record<ItirazKapsamAnahtar, boolean>>>({})
  const [tutar, setTutar] = useState('')
  const [kase, setKase] = useState('')
  const [ustuneYaz, setUstuneYaz] = useState(false)

  function kaydet(e: React.FormEvent) {
    e.preventDefault()
    setHata(null)
    start(async () => {
      const r = await alacakliyaTebligTarihiGirEylem({ dosyaId, borcluId: blok.borcluId, tarih })
      if (!r.ok) { setHata(r.error); return }
      setUyari(r.uyarilar ?? [])
      setAcik(false)
      router.refresh()
    })
  }

  function kapsamAc() {
    const it = blok.itiraz
    setItirazTipi(it?.tipi ?? '')
    setKapsam(it?.kapsam ?? {})
    setTutar(it?.tutar != null ? toTRInput(it.tutar) : '')
    setKase(it?.kaseTarihi ?? '')
    setUstuneYaz(false)
    setHata(null)
    setKapsamAcik(true)
  }

  function kapsamKaydet(e: React.FormEvent) {
    e.preventDefault()
    if (!itirazTipi) return
    setHata(null)
    start(async () => {
      const r = await itirazKapsamGirEylem({
        dosyaId, borcluId: blok.borcluId, itirazTipi, itirazKapsam: kapsam,
        itirazEdilenTutar: itirazTipi === 'KISMI' ? tutar : null, itirazVerilisTarihi: kase || null,
        ustuneYaz, surum: blok.surum,
      })
      if (!r.ok) { setHata(r.error); return }
      setUyari(r.uyarilar ?? [])
      setKapsamAcik(false)
      router.refresh()
    })
  }

  return (
    <div role="group" aria-labelledby={`${kimlik}-ad`} className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${kimlik}-ad`} className="text-[13.5px] font-bold text-foreground">{blok.ad}</span>
        {blok.turEtiket && <span className="text-[11.5px] text-muted-foreground">{blok.turEtiket}</span>}
        {blok.eksen && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            İCRA <Badge tone={ROL_TON[blok.eksen.rol]} dot>{blok.eksen.etiket}</Badge> ({blok.eksen.teyit})
          </span>
        )}
      </div>

      <dl className="mt-2.5 grid grid-cols-[minmax(120px,160px)_1fr_auto] items-start gap-x-3 gap-y-1.5 text-[12.5px] leading-[1.45]">
        {blok.satirlar.map((s) => (
          <div key={s.etiket} className="contents">
            <dt className="text-muted-foreground">{s.etiket}</dt>
            <dd className="text-foreground">{s.metin}</dd>
            <dd><Badge tone={ROL_TON[s.rol]}>{ROL_ETIKET[s.rol]}</Badge></dd>
          </div>
        ))}
        {blok.sureler.map((s) => (
          <div key={s.etiket} className="contents">
            <dt className="text-muted-foreground">{s.etiket}</dt>
            <dd className={s.rol === 'risk' ? ROL_YAZI.risk : 'text-foreground/85'}>
              {s.metin}
              {s.uyarilar.map((u) => <span key={u} className="mt-0.5 block text-[11px] text-warning">{u}</span>)}
            </dd>
            <dd />
          </div>
        ))}
      </dl>

      {blok.alacakliyaTebligEksik && tarihGirebilir && (
        <div className="mt-3">
          {!acik ? (
            <button type="button" onClick={() => setAcik(true)} className={DUGME_IKINCIL}><CalendarPlus className="h-3.5 w-3.5" /> Tarih gir</button>
          ) : (
            <form onSubmit={kaydet} className="flex flex-wrap items-end gap-2">
              <label htmlFor={`${kimlik}-t`} className="flex flex-col gap-1">
                <span className={ETIKET}>İtirazın size tebliğ tarihi (UETS)</span>
                <input id={`${kimlik}-t`} type="date" required className={GIRDI} value={tarih} onChange={(e) => setTarih(e.target.value)} />
              </label>
              <button type="submit" disabled={pending || !tarih} className={DUGME_ONAY}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />} Tarihi kaydet
              </button>
              <button type="button" onClick={() => setAcik(false)} className={DUGME_IKINCIL}>Vazgeç</button>
            </form>
          )}
        </div>
      )}

      {blok.itiraz && yetkili && (
        <div className="mt-3">
          {!kapsamAcik ? (
            <button type="button" onClick={kapsamAc} className={DUGME_IKINCIL}>
              <ClipboardList className="h-3.5 w-3.5" /> {blok.itiraz.tipi ? 'Kapsamı düzelt' : 'Kapsamı gir'}
            </button>
          ) : (
            <form onSubmit={kapsamKaydet} className="rounded-lg border border-border-subtle bg-surface-muted/40 p-3">
              <div className="flex flex-wrap gap-3">
                <fieldset className="flex flex-col gap-1">
                  <legend className={ETIKET}>Kapsam</legend>
                  <div className="flex gap-3 pt-1 text-[12.5px]">
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${kimlik}-kt`} checked={itirazTipi === 'TAM'} onChange={() => setItirazTipi('TAM')} /> Tam itiraz</label>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${kimlik}-kt`} checked={itirazTipi === 'KISMI'} onChange={() => setItirazTipi('KISMI')} /> Kısmi itiraz</label>
                  </div>
                </fieldset>
                <fieldset className="flex flex-col gap-1">
                  <legend className={ETIKET}>İtiraz edilenler</legend>
                  <div className="flex flex-wrap gap-3 pt-1 text-[12.5px]">
                    {ITIRAZ_KAPSAM_ANAHTAR.map((a) => (
                      <label key={a} className="inline-flex items-center gap-1.5">
                        <input type="checkbox" checked={!!kapsam[a]} onChange={(e) => setKapsam((k) => ({ ...k, [a]: e.target.checked }))} /> {ITIRAZ_KAPSAM_ETIKET[a]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {itirazTipi === 'KISMI' && (
                  <label htmlFor={`${kimlik}-kt-tutar`} className="flex flex-col gap-1">
                    <span className={ETIKET}>İtiraz edilen tutar (TL)</span>
                    <input id={`${kimlik}-kt-tutar`} inputMode="decimal" required className={`${GIRDI} text-right`} placeholder="1.234,56" value={tutar} onChange={(e) => setTutar(formatTRInput(e.target.value))} />
                  </label>
                )}
                <label htmlFor={`${kimlik}-kt-kase`} className="flex flex-col gap-1">
                  <span className={ETIKET}>Kalem kaşesi tarihi (ops.)</span>
                  <input id={`${kimlik}-kt-kase`} type="date" className={GIRDI} value={kase} onChange={(e) => setKase(e.target.value)} />
                </label>
              </div>
              <label className="mt-2.5 inline-flex items-center gap-2 text-[11.5px] text-muted-foreground">
                <input type="checkbox" checked={ustuneYaz} onChange={(e) => setUstuneYaz(e.target.checked)} /> Onaylı kaşe tarihinin üzerine yaz
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="submit" disabled={pending || !itirazTipi || (itirazTipi === 'KISMI' && !tutar)} className={DUGME_ONAY}>
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Onayla
                </button>
                <button type="button" onClick={() => { setKapsamAcik(false); setHata(null) }} className={DUGME_IKINCIL}>Vazgeç</button>
              </div>
            </form>
          )}
        </div>
      )}
      {uyari.map((u) => <p key={u} className="mt-1.5 text-[11.5px] text-muted-foreground">{u}</p>)}
      {hata && <p role="alert" className="mt-1.5 text-[11.5px] font-medium text-danger">{hata}</p>}
    </div>
  )
}
