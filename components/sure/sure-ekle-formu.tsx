'use client'

/**
 * KonsRücü — Süre önerisi ekleme formu · components/sure/sure-ekle-formu.tsx
 *
 * Tür seçilir, tetik tarihi girilir; öneri (ihtiyatlı + durmalı) aynı saf fonksiyonla (sureOnerisiHesapla)
 * ekranda anında görünür, kayıt sunucuda yeniden hesaplanır. İİK 67'de arabuluculuk durması dosyadaki
 * arabuluculuk kaydından sunucuda eklenir. Onaylanan son gün bu formda YOKTUR — avukat defterden onaylar.
 */
import { useId, useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { sureOner } from '@/app/(app)/sureler/actions'
import { sureOnerisiHesapla, type Usul } from '@/lib/konsrucu/sure/hesap'
import { gunTR, isoGundenTarih } from '@/lib/konsrucu/sure/takvim'
import { GRUP_ETIKET, SURE_TURLERI, SURE_TUR_KODLARI, TETIK_TURLERI, TETIK_TURU_ETIKET, type SureGrubu, type SureTurKodu, type TetikTuru } from '@/lib/konsrucu/sure/turler'
import { BTN_BIRINCIL, BTN_IKINCIL, ETIKET, GIRDI } from './stil'
import { IslemMesaji, useSureIslem } from './islem'

export type SureEkleSecenekleri = {
  borclular: { id: string; etiket: string }[]
  davalar: { id: string; etiket: string; usul: string | null }[]
  belgeler: { id: string; etiket: string }[]
}

export type SureEkleFormuProps = {
  dosyaId: string
  secenekler: SureEkleSecenekleri
  varsayilanTur?: SureTurKodu
  /** true: yalnız "Süre ekle" düğmesi görünür, tıklanınca form açılır. */
  kapaliBasla?: boolean
}

const GRUPLAR: SureGrubu[] = ['ICRA', 'DAVA', 'IDARI', 'DIGER']

export function SureEkleFormu({ dosyaId, secenekler, varsayilanTur = 'IIK67', kapaliBasla = true }: SureEkleFormuProps) {
  const id = useId()
  const [acik, setAcik] = useState(!kapaliBasla)
  const [tur, setTur] = useState<SureTurKodu>(varsayilanTur)
  const t = SURE_TURLERI[tur]
  const [borcluId, setBorcluId] = useState('')
  const [davaId, setDavaId] = useState('')
  const [tetikTuru, setTetikTuru] = useState<TetikTuru>('TEBLIG')
  const [tetik, setTetik] = useState('')
  const [uets, setUets] = useState('')
  const [itiraz, setItiraz] = useState('')
  const [eylem, setEylem] = useState('')
  const [hakim, setHakim] = useState('')
  const [usul, setUsul] = useState<'' | Usul>('')
  const [kesin, setKesin] = useState(false)
  const [dayanak, setDayanak] = useState('')
  const [belgeId, setBelgeId] = useState('')
  const [alinti, setAlinti] = useState('')
  const { pending, mesaj, calistir, setMesaj } = useSureIslem()

  const uetsTetik = tetikTuru === 'UETS_ULASMA'
  const davaUsul = secenekler.davalar.find((d) => d.id === davaId)?.usul as Usul | null | undefined
  const etkinUsul: Usul | null = usul || davaUsul || null

  const oneri = useMemo(() => sureOnerisiHesapla({
    tur,
    tetikTarihi: isoGundenTarih(tetik),
    tetikTuru,
    uetsUlasmaTarihi: uetsTetik ? isoGundenTarih(tetik) : isoGundenTarih(uets),
    hakimSuresiGun: hakim ? Number(hakim) : null,
    itirazTarihi: isoGundenTarih(itiraz),
    eylemTarihi: isoGundenTarih(eylem),
    usul: etkinUsul,
  }), [tur, tetik, tetikTuru, uets, uetsTetik, hakim, itiraz, eylem, etkinUsul])

  function sifirla() {
    setTetik(''); setUets(''); setItiraz(''); setEylem(''); setHakim(''); setUsul(''); setKesin(false); setDayanak(''); setBelgeId(''); setAlinti('')
  }

  if (!acik) {
    return (
      <button type="button" onClick={() => { setAcik(true); setMesaj(null) }} className={BTN_IKINCIL}>
        <Plus className="h-3.5 w-3.5" aria-hidden /> Süre ekle
      </button>
    )
  }

  return (
    <form
      className="rounded-2xl border border-border bg-card p-4 shadow-card"
      onSubmit={(e) => {
        e.preventDefault()
        calistir(() => sureOner({
          dosyaId,
          tur,
          borcluId: t.borcluBazinda && borcluId ? borcluId : null,
          davaId: davaId || null,
          tetikTuru,
          tetikTarihi: tetik || null,
          uetsUlasmaTarihi: uetsTetik ? tetik || null : uets || null,
          hakimSuresiGun: t.kural.tip === 'HAKIM' && hakim ? Number(hakim) : null,
          itirazTarihi: tur === 'IIK67' && itiraz ? itiraz : null,
          eylemTarihi: tur === 'IYUK13_BASVURU' && eylem ? eylem : null,
          usul: tur === 'HMK136' ? etkinUsul : null,
          kesinSureIhtari: tur === 'AVANS' || tur === 'ARA_KARAR' ? kesin : null,
          dayanak: tur === 'DIGER' ? dayanak || null : null,
          kaynakBelgeId: belgeId || null,
          kaynakAlinti: alinti || null,
        }), () => sifirla())
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="font-display text-[15px] font-bold">Süre önerisi ekle</div>
        <button type="button" onClick={() => setAcik(false)} className="text-[12px] font-semibold text-muted-foreground hover:text-foreground">Kapat</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-tur`} className={ETIKET}>Süre türü</label>
          <select id={`${id}-tur`} value={tur} onChange={(e) => setTur(e.target.value as SureTurKodu)} className={GIRDI}>
            {GRUPLAR.map((gr) => (
              <optgroup key={gr} label={GRUP_ETIKET[gr]}>
                {SURE_TUR_KODLARI.filter((k) => SURE_TURLERI[k].grup === gr).map((k) => (
                  <option key={k} value={k}>{SURE_TURLERI[k].etiket} · {SURE_TURLERI[k].ad}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-1 text-[11.5px] text-muted-foreground">Dayanak: {t.dayanak} (teyit gerekli) · tetik: {t.tetik}</p>
        </div>

        {t.borcluBazinda && (
          <div>
            <label htmlFor={`${id}-b`} className={ETIKET}>Borçlu (süre borçlu bazında)</label>
            <select id={`${id}-b`} value={borcluId} onChange={(e) => setBorcluId(e.target.value)} className={GIRDI} required={secenekler.borclular.length > 0}>
              <option value="">Seçin</option>
              {secenekler.borclular.map((b) => <option key={b.id} value={b.id}>{b.etiket}</option>)}
            </select>
          </div>
        )}

        {t.grup === 'DAVA' && secenekler.davalar.length > 0 && (
          <div>
            <label htmlFor={`${id}-d`} className={ETIKET}>Dava</label>
            <select id={`${id}-d`} value={davaId} onChange={(e) => setDavaId(e.target.value)} className={GIRDI}>
              <option value="">Seçilmedi</option>
              {secenekler.davalar.map((d) => <option key={d.id} value={d.id}>{d.etiket}</option>)}
            </select>
          </div>
        )}

        {tur === 'HMK136' && (
          <div>
            <label htmlFor={`${id}-us`} className={ETIKET}>Yargılama usulü</label>
            <select id={`${id}-us`} value={usul} onChange={(e) => setUsul(e.target.value as '' | Usul)} className={GIRDI}>
              <option value="">{davaUsul ? `Davadaki: ${davaUsul === 'YAZILI' ? 'yazılı' : 'basit'}` : 'Seçin'}</option>
              <option value="YAZILI">Yazılı</option>
              <option value="BASIT">Basit</option>
            </select>
          </div>
        )}

        <div>
          <label htmlFor={`${id}-tt`} className={ETIKET}>Tetik türü</label>
          <select id={`${id}-tt`} value={tetikTuru} onChange={(e) => setTetikTuru(e.target.value as TetikTuru)} className={GIRDI}>
            {TETIK_TURLERI.map((k) => <option key={k} value={k}>{TETIK_TURU_ETIKET[k]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-t`} className={ETIKET}>{uetsTetik ? 'UETS ulaşma tarihi' : t.tetik}</label>
          <input id={`${id}-t`} type="date" value={tetik} onChange={(e) => setTetik(e.target.value)} className={`${GIRDI} font-mono`} />
        </div>
        {tetikTuru === 'TEBLIG' && (
          <div>
            <label htmlFor={`${id}-u`} className={ETIKET}>UETS ulaşma tarihi (varsa, ayrı alan)</label>
            <input id={`${id}-u`} type="date" value={uets} onChange={(e) => setUets(e.target.value)} className={`${GIRDI} font-mono`} />
          </div>
        )}
        {tur === 'IIK67' && (
          <div>
            <label htmlFor={`${id}-i`} className={ETIKET}>İtiraz tarihi (tebliğ yoksa ihtiyatlı alt sınır)</label>
            <input id={`${id}-i`} type="date" value={itiraz} onChange={(e) => setItiraz(e.target.value)} className={`${GIRDI} font-mono`} />
          </div>
        )}
        {tur === 'IYUK13_BASVURU' && (
          <div>
            <label htmlFor={`${id}-e`} className={ETIKET}>Eylem (kaza) tarihi</label>
            <input id={`${id}-e`} type="date" value={eylem} onChange={(e) => setEylem(e.target.value)} className={`${GIRDI} font-mono`} />
          </div>
        )}
        {t.kural.tip === 'HAKIM' && (
          <div>
            <label htmlFor={`${id}-h`} className={ETIKET}>Mahkemenin verdiği süre (gün)</label>
            <input id={`${id}-h`} type="number" min={1} max={3650} value={hakim} onChange={(e) => setHakim(e.target.value)} className={`${GIRDI} font-mono`} />
          </div>
        )}
        {(tur === 'AVANS' || tur === 'ARA_KARAR') && (
          <label className="flex items-center gap-2 self-end text-[12.5px]">
            <input type="checkbox" checked={kesin} onChange={(e) => setKesin(e.target.checked)} /> Kesin süre ihtarı var (avukat işaretler)
          </label>
        )}
        {tur === 'DIGER' && (
          <div>
            <label htmlFor={`${id}-dy`} className={ETIKET}>Dayanak</label>
            <input id={`${id}-dy`} maxLength={200} value={dayanak} onChange={(e) => setDayanak(e.target.value)} className={GIRDI} placeholder="Ör. HMK 147 (teyit gerekli)" />
          </div>
        )}
        {secenekler.belgeler.length > 0 && (
          <div>
            <label htmlFor={`${id}-kb`} className={ETIKET}>Tetikleyen evrak</label>
            <select id={`${id}-kb`} value={belgeId} onChange={(e) => setBelgeId(e.target.value)} className={GIRDI}>
              <option value="">Seçilmedi</option>
              {secenekler.belgeler.map((b) => <option key={b.id} value={b.id}>{b.etiket}</option>)}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-a`} className={ETIKET}>Evraktan alıntı (isteğe bağlı)</label>
          <textarea id={`${id}-a`} rows={2} maxLength={2000} value={alinti} onChange={(e) => setAlinti(e.target.value)} className={GIRDI}
            placeholder="Ör. ...davacı vekiline 2 hafta kesin süre verilmesine..." />
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-kr/25 bg-kr-soft/30 p-3 text-[12.5px]" aria-live="polite">
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-kr-ink">Öneri (teyit gerekli)</div>
        {oneri.eksik ? (
          <p className="mt-1 text-muted-foreground">{oneri.eksik}</p>
        ) : (
          <p className="mt-1">
            İhtiyatlı son gün <b className="font-mono">{gunTR(oneri.onerilenIhtiyatli)}</b>
            {oneri.onerilenSonGun && <> · önerilen <b className="font-mono">{gunTR(oneri.onerilenSonGun)}</b></>}
          </p>
        )}
        {tur === 'IIK67' && <p className="mt-1 text-[11.5px] text-muted-foreground">Arabuluculuk durması, dosyadaki arabuluculuk kaydından kayıt sırasında eklenir.</p>}
        {oneri.uyarilar.length > 0 && <ul className="mt-1.5 space-y-0.5 text-warning">{oneri.uyarilar.map((u) => <li key={u}>{u}</li>)}</ul>}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={BTN_BIRINCIL}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Süre önerisini kaydet
        </button>
      </div>
      <IslemMesaji mesaj={mesaj} />
    </form>
  )
}
