'use client'

/**
 * KonsRücü — "UYAP'tan gelen gelişme · onay bekliyor (aday)" kartı · components/dosya/olay/gelisme-karti.tsx
 *
 * 06 §2(e) kart taslağı: cümle, Kaynak, Alıntı, Kural, Etkisi ve [Doğru] [Düzelt] [Yanlış — gerekçe yaz].
 * Onaylanana kadar eksen "teyitsiz" kalır (kartın alt satırı). Onaylanmış ya da reddedilmiş kart [Geri al] taşır.
 * Karar yalnız avukatındır: yetkisiz kullanıcı "Bu adım avukat onayını bekliyor" görür (asıl kapı sunucuda).
 * Kesinleşme riski azaltır: ikinci onay kutusu işaretlenmeden gönderilmez.
 */
import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, PenLine, X, Undo2, AlertTriangle, Clock } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { adayGeriAlEylem, adayOnaylaEylem, adayReddetEylem, type AdayOnayGirdisi } from '@/app/(app)/dosya-islem/olay-actions'
import { ROL_ETIKET, type GelismeKartiVM } from '@/lib/konsrucu/eksen/gorunum'
import { ITIRAZ_KAPSAM_ANAHTAR, ITIRAZ_KAPSAM_ETIKET, TEBLIG_SEKLI, TEBLIG_SEKLI_ETIKET, type ItirazKapsamAnahtar } from '@/lib/konsrucu/eksen/sabitler'
import { DUGME_IKINCIL, DUGME_ONAY, ETIKET, GIRDI, ROL_TON } from './rol'

export type KartBorclu = { id: string; ad: string }

type Mod = 'goster' | 'duzelt' | 'reddet' | 'geriAl'

function Alan({ etiket, children, id }: { etiket: string; children: React.ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="flex min-w-[150px] flex-col gap-1">
      <span className={ETIKET}>{etiket}</span>
      {children}
    </label>
  )
}

export function GelismeKarti({ dosyaId, kart, borclular, yetkili }: { dosyaId: string; kart: GelismeKartiVM; borclular: KartBorclu[]; yetkili: boolean }) {
  const kimlik = useId()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mod, setMod] = useState<Mod>('goster')
  const [hata, setHata] = useState<string | null>(null)
  const [uyari, setUyari] = useState<string[]>([])
  const o = kart.oneri
  // form durumu (Düzelt)
  const [borcluId, setBorcluId] = useState(o.borcluId ?? '')
  const [borcluIdler, setBorcluIdler] = useState<string[]>(o.borcluId ? [o.borcluId] : borclular.length === 1 ? [borclular[0].id] : [])
  const [tarih, setTarih] = useState(o.tarih ?? '')
  const [sonuc, setSonuc] = useState<'TEBLIG' | 'IADE' | ''>(o.sonuc ?? (kart.altTip === 'TEBLIG_IADE' ? 'IADE' : ''))
  const [sekil, setSekil] = useState<string>(o.tebligSekli ?? '')
  const [ulasma, setUlasma] = useState(o.uetsUlasmaTarihi ?? '')
  const [kase, setKase] = useState('')
  const [itirazTipi, setItirazTipi] = useState<'TAM' | 'KISMI' | ''>('')
  const [kapsam, setKapsam] = useState<Partial<Record<ItirazKapsamAnahtar, boolean>>>({})
  const [tutar, setTutar] = useState('')
  const [ustuneYaz, setUstuneYaz] = useState(false)
  const [kesinOnay, setKesinOnay] = useState(false)
  const [gerekce, setGerekce] = useState('')

  const bekliyor = kart.durum === 'ADAY'
  const onaylanabilir = bekliyor && kart.yol !== 'YOK'

  function calistir(is: () => Promise<{ ok: boolean; error?: string; uyarilar?: string[] }>) {
    setHata(null)
    start(async () => {
      const r = await is()
      if (!r.ok) { setHata(r.error ?? 'İşlem tamamlanamadı'); return }
      setUyari(r.uyarilar ?? [])
      setMod('goster')
      router.refresh()
    })
  }

  function girdi(duzeltme: boolean): AdayOnayGirdisi {
    const temel: AdayOnayGirdisi = { dosyaId, olayId: kart.id, ustuneYaz }
    if (!duzeltme) {
      return { ...temel, altTip: o.altTip, borcluId: o.borcluId, tarih: o.tarih, sonuc: o.sonuc, tebligSekli: o.tebligSekli, uetsUlasmaTarihi: o.uetsUlasmaTarihi, kesinlesmeOnay: kesinOnay }
    }
    if (kart.yol === 'ITIRAZ') {
      return {
        ...temel, borcluIdler, tarih: tarih || null, itirazVerilisTarihi: kase || null, itirazTipi: itirazTipi || null,
        itirazKapsam: kapsam, itirazEdilenTutar: itirazTipi === 'KISMI' ? tutar : null,
      }
    }
    if (kart.yol === 'TEBLIG') {
      return { ...temel, altTip: sonuc === 'IADE' ? 'TEBLIG_IADE' : 'TEBLIG_SONUCU', borcluId: borcluId || null, tarih: tarih || null, sonuc: sonuc || null, tebligSekli: sekil || null, uetsUlasmaTarihi: ulasma || null }
    }
    if (kart.yol === 'ALACAKLIYA_TEBLIG') return { ...temel, altTip: 'ITIRAZIN_ALACAKLIYA_TEBLIGI', borcluId: borcluId || null, tarih: tarih || null, tebligSekli: sekil || null }
    return { ...temel, tarih: tarih || null, kesinlesmeOnay: kesinOnay }
  }

  // [Doğru] eksik bilgiyle gönderilemiyorsa formu açar (ör. iki borçlu varken borçlu belirsiz).
  function dogru() {
    const eksik =
      (kart.yol === 'TEBLIG' && (!o.borcluId || !o.sonuc || (o.sonuc === 'TEBLIG' && !o.tarih && !o.uetsUlasmaTarihi))) ||
      (kart.yol === 'ITIRAZ' && !o.borcluId && borclular.length !== 1) ||
      (kart.yol === 'ALACAKLIYA_TEBLIG' && (!o.tarih || (!o.borcluId && borclular.length !== 1))) ||
      (kart.yol === 'KESINLESME' && !kesinOnay)
    if (eksik) { setMod('duzelt'); setHata(kart.yol === 'KESINLESME' ? null : 'Eksik bilgi var: formu tamamlayın.'); return }
    calistir(() => adayOnaylaEylem(girdi(false)))
  }

  const tarihEtiketi = kart.yol === 'ITIRAZ' ? 'UYAP kayıt tarihi' : kart.yol === 'ALACAKLIYA_TEBLIG' ? 'Size tebliğ tarihi' : kart.yol === 'KESINLESME' ? 'Kesinleşme tarihi' : 'Hukuki tebliğ tarihi'

  return (
    <article aria-labelledby={`${kimlik}-b`} className={`rounded-xl border px-4 py-3.5 ${kart.rol === 'risk' ? 'border-danger/40' : kart.durum === 'ADAY' ? 'border-warning/35' : 'border-border'} bg-surface`}>
      <div className="flex flex-wrap items-start gap-2">
        <Badge tone={ROL_TON[kart.rol]} dot>{kart.durum === 'ADAY' ? (kart.gecikti ? '3 GÜNÜ AŞTI' : ROL_ETIKET.onay) : kart.durum === 'TEYITLI' ? 'ONAYLI' : 'REDDEDİLDİ'}</Badge>
        {kart.gecikti && <Clock className="mt-0.5 h-3.5 w-3.5 text-danger" aria-label="Onay 3 günü aştı" />}
        <h3 id={`${kimlik}-b`} className="min-w-[220px] flex-1 text-[13.5px] font-semibold leading-[1.45] text-foreground">{kart.baslik}</h3>
      </div>
      <dl className="mt-2 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 text-[12px] leading-[1.45]">
        <dt className={ETIKET}>Kaynak</dt><dd className="text-foreground/85">{kart.kaynak}</dd>
        {kart.alinti && (<><dt className={ETIKET}>Alıntı</dt><dd className="italic text-foreground/85">“{kart.alinti}”</dd></>)}
        <dt className={ETIKET}>Kural</dt><dd className="font-mono text-[11px] text-muted-foreground">{kart.kural}</dd>
        {kart.etki && (<><dt className={ETIKET}>Etkisi</dt><dd className="text-foreground/85">{kart.etki}</dd></>)}
      </dl>
      {[...kart.uyarilar, ...uyari].length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {[...new Set([...kart.uyarilar, ...uyari])].map((u) => (
            <li key={u} className="flex items-start gap-1.5 text-[11.5px] text-warning"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{u}</li>
          ))}
        </ul>
      )}

      {mod === 'duzelt' && onaylanabilir && (
        <form className="mt-3 rounded-lg border border-border-subtle bg-surface-muted/40 p-3" onSubmit={(e) => { e.preventDefault(); calistir(() => adayOnaylaEylem(girdi(true))) }}>
          <div className="flex flex-wrap gap-3">
            {(kart.yol === 'TEBLIG' || kart.yol === 'ALACAKLIYA_TEBLIG') && borclular.length > 0 && (
              <Alan etiket={kart.yol === 'TEBLIG' ? 'Borçlu' : 'İtirazı tebliğ edilen borçlu'} id={`${kimlik}-borclu`}>
                <select id={`${kimlik}-borclu`} className={GIRDI} value={borcluId} onChange={(e) => setBorcluId(e.target.value)}>
                  <option value="">Seçin</option>
                  {borclular.map((b) => <option key={b.id} value={b.id}>{b.ad}</option>)}
                </select>
              </Alan>
            )}
            {kart.yol === 'TEBLIG' && (
              <fieldset className="flex flex-col gap-1">
                <legend className={ETIKET}>Sonuç</legend>
                <div className="flex gap-3 pt-1 text-[12.5px]">
                  <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${kimlik}-s`} checked={sonuc === 'TEBLIG'} onChange={() => setSonuc('TEBLIG')} /> Tebliğ edildi</label>
                  <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${kimlik}-s`} checked={sonuc === 'IADE'} onChange={() => setSonuc('IADE')} /> İADE (tebliğ edilemedi)</label>
                </div>
              </fieldset>
            )}
            {(kart.yol === 'TEBLIG' || kart.yol === 'ALACAKLIYA_TEBLIG') && (
              <Alan etiket="Tebliğ şekli" id={`${kimlik}-sekil`}>
                <select id={`${kimlik}-sekil`} className={GIRDI} value={sekil} onChange={(e) => setSekil(e.target.value)}>
                  <option value="">Seçin</option>
                  {TEBLIG_SEKLI.map((s) => <option key={s} value={s}>{TEBLIG_SEKLI_ETIKET[s]}</option>)}
                </select>
              </Alan>
            )}
            {kart.yol === 'TEBLIG' && sekil === 'UETS' && (
              <Alan etiket="UETS ulaşma tarihi" id={`${kimlik}-ulasma`}>
                <input id={`${kimlik}-ulasma`} type="date" className={GIRDI} value={ulasma} onChange={(e) => setUlasma(e.target.value)} />
              </Alan>
            )}
            {kart.yol !== 'GENEL' && !(kart.yol === 'TEBLIG' && sonuc === 'IADE') && (
              <Alan etiket={tarihEtiketi} id={`${kimlik}-tarih`}>
                <input id={`${kimlik}-tarih`} type="date" className={GIRDI} value={tarih} onChange={(e) => setTarih(e.target.value)} />
              </Alan>
            )}
            {kart.yol === 'ITIRAZ' && (
              <>
                <fieldset className="flex flex-col gap-1">
                  <legend className={ETIKET}>İtiraz eden borçlu</legend>
                  <div className="flex flex-wrap gap-3 pt-1 text-[12.5px]">
                    {borclular.map((b) => (
                      <label key={b.id} className="inline-flex items-center gap-1.5">
                        <input type="checkbox" checked={borcluIdler.includes(b.id)} onChange={(e) => setBorcluIdler((l) => (e.target.checked ? [...l, b.id] : l.filter((x) => x !== b.id)))} /> {b.ad}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Alan etiket="Kalem kaşesi tarihi" id={`${kimlik}-kase`}>
                  <input id={`${kimlik}-kase`} type="date" className={GIRDI} value={kase} onChange={(e) => setKase(e.target.value)} />
                </Alan>
                <fieldset className="flex flex-col gap-1">
                  <legend className={ETIKET}>Kapsam</legend>
                  <div className="flex gap-3 pt-1 text-[12.5px]">
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${kimlik}-k`} checked={itirazTipi === 'TAM'} onChange={() => setItirazTipi('TAM')} /> Tam</label>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${kimlik}-k`} checked={itirazTipi === 'KISMI'} onChange={() => setItirazTipi('KISMI')} /> Kısmi</label>
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
                  <Alan etiket="İtiraz edilen tutar (TL)" id={`${kimlik}-tutar`}>
                    <input id={`${kimlik}-tutar`} inputMode="decimal" className={`${GIRDI} text-right`} placeholder="1.234,56" value={tutar} onChange={(e) => setTutar(e.target.value)} />
                  </Alan>
                )}
              </>
            )}
            {kart.yol === 'KESINLESME' && (
              <label className="inline-flex max-w-[48ch] items-start gap-2 text-[12.5px] text-foreground">
                <input type="checkbox" className="mt-0.5" checked={kesinOnay} onChange={(e) => setKesinOnay(e.target.checked)} />
                Takibin kesinleştiğini UYAP kaydından ve itiraz olmadığını teyit ettim. (Riski azaltan karar; kayda adımla geçer.)
              </label>
            )}
          </div>
          <label className="mt-2.5 inline-flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <input type="checkbox" checked={ustuneYaz} onChange={(e) => setUstuneYaz(e.target.checked)} /> Onaylı kaydın üzerine yaz
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" disabled={pending || (kart.yol === 'KESINLESME' && !kesinOnay)} className={DUGME_ONAY}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Düzeltip onayla
            </button>
            <button type="button" onClick={() => { setMod('goster'); setHata(null) }} className={DUGME_IKINCIL}>Vazgeç</button>
          </div>
        </form>
      )}

      {(mod === 'reddet' || mod === 'geriAl') && (
        <form className="mt-3 rounded-lg border border-border-subtle bg-surface-muted/40 p-3" onSubmit={(e) => {
          e.preventDefault()
          const g = { dosyaId, olayId: kart.id, gerekce }
          calistir(() => (mod === 'reddet' ? adayReddetEylem(g) : adayGeriAlEylem(g)))
        }}>
          <Alan etiket={mod === 'reddet' ? 'Neden yanlış?' : 'Neden geri alıyorsunuz?'} id={`${kimlik}-g`}>
            <textarea id={`${kimlik}-g`} rows={2} maxLength={500} className={GIRDI} value={gerekce} onChange={(e) => setGerekce(e.target.value)} placeholder={mod === 'reddet' ? 'Örnek: harç iadesi, tebligat değil' : 'Örnek: yanlış borçluya işlendi'} />
          </Alan>
          <div className="mt-2 flex gap-2">
            <button type="submit" disabled={pending || gerekce.trim().length < 5} className={DUGME_ONAY}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mod === 'reddet' ? <X className="h-3.5 w-3.5" /> : <Undo2 className="h-3.5 w-3.5" />} {mod === 'reddet' ? 'Yanlış olarak kaydet' : 'Geri al'}
            </button>
            <button type="button" onClick={() => { setMod('goster'); setHata(null) }} className={DUGME_IKINCIL}>Vazgeç</button>
          </div>
        </form>
      )}

      {mod === 'goster' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {kart.yol === 'YOK' && kart.yokNedeni && <span className="text-[11.5px] text-muted-foreground">{kart.yokNedeni}</span>}
          {onaylanabilir && yetkili && (
            <>
              <button type="button" disabled={pending} onClick={dogru} className={DUGME_ONAY}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Doğru
              </button>
              {kart.yol !== 'GENEL' && (
                <button type="button" disabled={pending} onClick={() => { setMod('duzelt'); setHata(null) }} className={DUGME_IKINCIL}><PenLine className="h-3.5 w-3.5" /> Düzelt</button>
              )}
              <button type="button" disabled={pending} onClick={() => { setMod('reddet'); setHata(null) }} className={DUGME_IKINCIL}><X className="h-3.5 w-3.5" /> Yanlış, gerekçe yaz</button>
            </>
          )}
          {bekliyor && kart.yol !== 'YOK' && !yetkili && <span className="text-[11.5px] text-muted-foreground">Bu adım avukat onayını bekliyor.</span>}
          {!bekliyor && yetkili && (
            <button type="button" disabled={pending} onClick={() => { setMod('geriAl'); setHata(null) }} className={DUGME_IKINCIL}><Undo2 className="h-3.5 w-3.5" /> {kart.durum === 'TEYITLI' ? 'Onayı geri al' : 'Reddi geri al'}</button>
          )}
        </div>
      )}
      {kart.bekleme && mod === 'goster' && <p className="mt-2 text-[11.5px] text-muted-foreground">{kart.bekleme}</p>}
      {hata && <p role="alert" className="mt-2 text-[11.5px] font-medium text-danger">{hata}</p>}
    </article>
  )
}
