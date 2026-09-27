'use client'

/**
 * KonsRücü — DAVA KAYDI elle açma/düzenleme formu · components/dava/dava-kayit-formu.tsx
 * Mahkeme, esas no, açılış tarihi, taraflar (+ usul, dava değeri, üst dosya no, duruşma). Eklenti davayı bulamazsa
 * avukat girer. Mahkeme türü ve usulün varsayılanı YOK; açılış tarihi ileri olamaz; esas "2026/384" biçiminde.
 */
import { useState } from 'react'
import { davaKaydet } from '@/app/(app)/dosya-islem/dava-actions'
import { DAVA_TUR_ETIKET, DAVA_TURLERI, MAHKEME_TUR_ETIKET, MAHKEME_TURLERI, USUL_ETIKET, USULLER } from '@/lib/konsrucu/dava/sabitler'
import { adMaskele } from '@/lib/konsrucu/dava/maske'
import type { DavaUI } from '@/lib/konsrucu/dava/veri'
import { BirincilDugme, bugunIso, INP, LBL, Mesaj, useAksiyon } from '../arabuluculuk/ortak'

export type DavaKayitFormuProps = {
  dosyaId: string
  dava: DavaUI | null
  borclular: { id: string; adUnvan: string }[]
  arabuluculuklar: { id: string; etiket: string }[]
  onBitti?: () => void
}

const tarihInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

export function DavaKayitFormu({ dosyaId, dava, borclular, arabuluculuklar, onBitti }: DavaKayitFormuProps) {
  const { bekliyor, hata, bilgi, calistir } = useAksiyon()
  const [secili, setSecili] = useState<string[]>(dava?.taraflar.filter((t) => t.rol === 'DAVALI' && t.borcluId).map((t) => t.borcluId as string) ?? [])
  const [iik, setIik] = useState<string | null>(null)

  function gonder(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget)
    const s = (k: string) => String(fd.get(k) ?? '').trim() || undefined
    const serbest = (s('davaliSerbest') ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
    calistir(
      () => davaKaydet({
        dosyaId, davaId: dava?.id,
        tur: s('tur') as never, rolumuz: (s('rolumuz') ?? 'DAVACI') as 'DAVACI' | 'DAVALI',
        mahkemeTuru: s('mahkemeTuru') as never, mahkemeYer: s('mahkemeYer'), mahkemeNo: s('mahkemeNo'), esas: s('esas'),
        acilisTarihi: s('acilisTarihi'), usul: s('usul') as never, davaDegeri: s('davaDegeri'),
        arabuluculukId: s('arabuluculukId'), ustDosyaNoHam: s('ustDosyaNoHam'), sonrakiDurusma: s('sonrakiDurusma'), onIncelemeTarihi: s('onIncelemeTarihi'),
        davalilar: [...secili.map((borcluId) => ({ borcluId })), ...serbest.map((adHam) => ({ adHam }))],
      }),
      (r) => {
        const x = r as unknown as { iik67: { hazir: number; sonra: number } }
        setIik(x.iik67.sonra ? 'Açılış tarihi İİK 67 onaylanan son günden sonra görünüyor: kontrol edin (DA-06b).' : x.iik67.hazir ? 'İİK 67 kaydı "kapanmaya hazır": kapanışı dava kartından onaylayın (DA-06a).' : null)
        onBitti?.()
        return dava ? 'Dava kaydı güncellendi.' : 'Dava kaydı açıldı.'
      },
    )
  }

  return (
    <form onSubmit={gonder} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div><label className={LBL} htmlFor="dk-mt">Mahkeme türü</label>
        <select id="dk-mt" name="mahkemeTuru" defaultValue={dava?.mahkemeTuru ?? ''} className={INP}>
          <option value="">Seçin</option>
          {MAHKEME_TURLERI.map((m) => <option key={m} value={m}>{MAHKEME_TUR_ETIKET[m]}</option>)}
        </select>
      </div>
      <div><label className={LBL} htmlFor="dk-yer">Yer</label><input id="dk-yer" name="mahkemeYer" defaultValue={dava?.mahkemeYer ?? ''} placeholder="Ankara" className={INP} /></div>
      <div><label className={LBL} htmlFor="dk-no">Mahkeme no</label><input id="dk-no" name="mahkemeNo" defaultValue={dava?.mahkemeNo ?? ''} placeholder="51" inputMode="numeric" className={INP} /></div>
      <div><label className={LBL} htmlFor="dk-esas">Esas no</label><input id="dk-esas" name="esas" defaultValue={dava?.esas ?? ''} placeholder="2026/384" className={`${INP} font-mono`} /></div>
      <div><label className={LBL} htmlFor="dk-acilis">Açılış tarihi</label><input id="dk-acilis" type="date" name="acilisTarihi" max={bugunIso()} defaultValue={tarihInput(dava?.acilisTarihi ?? null)} className={INP} /></div>
      <div><label className={LBL} htmlFor="dk-rol">Rolümüz</label>
        <select id="dk-rol" name="rolumuz" defaultValue={dava?.rolumuz ?? 'DAVACI'} className={INP}>
          <option value="DAVACI">Davacı</option><option value="DAVALI">Davalı (karşı taraf davası)</option>
        </select>
      </div>
      <div><label className={LBL} htmlFor="dk-tur">Dava türü</label>
        <select id="dk-tur" name="tur" defaultValue={dava?.tur ?? ''} className={INP}>
          <option value="">Seçin</option>
          {DAVA_TURLERI.map((t) => <option key={t} value={t}>{DAVA_TUR_ETIKET[t]}</option>)}
        </select>
      </div>
      <div><label className={LBL} htmlFor="dk-usul">Usul</label>
        <select id="dk-usul" name="usul" defaultValue={dava?.usul ?? ''} className={INP}>
          <option value="">Seçin</option>
          {USULLER.map((u) => <option key={u} value={u}>{USUL_ETIKET[u]}</option>)}
        </select>
      </div>
      <div><label className={LBL} htmlFor="dk-deger">Dava değeri</label><input id="dk-deger" name="davaDegeri" inputMode="decimal" defaultValue={dava?.davaDegeri != null ? String(dava.davaDegeri).replace('.', ',') : ''} className={INP} /></div>
      <div><label className={LBL} htmlFor="dk-dur">Sonraki duruşma</label><input id="dk-dur" type="datetime-local" name="sonrakiDurusma" className={INP} /></div>
      <div><label className={LBL} htmlFor="dk-oi">Ön inceleme</label><input id="dk-oi" type="datetime-local" name="onIncelemeTarihi" className={INP} /></div>
      <div><label className={LBL} htmlFor="dk-ust">Üst dosya no (ham)</label><input id="dk-ust" name="ustDosyaNoHam" defaultValue={dava?.ustDosyaNoHam ?? ''} className={INP} /></div>
      {arabuluculuklar.length > 0 && (
        <div className="sm:col-span-3"><label className={LBL} htmlFor="dk-arb">Arabuluculuk bağı</label>
          <select id="dk-arb" name="arabuluculukId" defaultValue={dava?.arabuluculukId ?? ''} className={INP}>
            <option value="">Bağlama</option>
            {arabuluculuklar.map((a) => <option key={a.id} value={a.id}>{a.etiket}</option>)}
          </select>
        </div>
      )}
      <fieldset className="sm:col-span-3">
        <legend className={LBL}>Davalılar (borçlulardan)</legend>
        <div className="flex flex-wrap gap-2">
          {borclular.length === 0 && <span className="text-[12px] text-muted-foreground">Borçlu kaydı yok.</span>}
          {borclular.map((b, i) => (
            <label key={b.id} className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-1.5 text-[12.5px] ${secili.includes(b.id) ? 'border-kr bg-kr-soft/50' : 'border-border-subtle'}`}>
              <input type="checkbox" checked={secili.includes(b.id)} onChange={(e) => setSecili(e.target.checked ? [...secili, b.id] : secili.filter((x) => x !== b.id))} className="accent-[hsl(var(--kr))]" />
              borçlu-{i + 1} · {adMaskele(b.adUnvan)}
            </label>
          ))}
        </div>
        <label className={`${LBL} mt-2`} htmlFor="dk-serbest">Borçlu listesinde olmayan davalı (her satıra bir ad)</label>
        <textarea id="dk-serbest" name="davaliSerbest" rows={2} className={`${INP} resize-y`} autoComplete="off" />
      </fieldset>
      {hata && <div className="sm:col-span-3"><Mesaj tur="hata">{hata}</Mesaj></div>}
      {bilgi && <div className="sm:col-span-3"><Mesaj tur="ok">{bilgi}</Mesaj></div>}
      {iik && <div className="sm:col-span-3"><Mesaj tur="uyari">{iik}</Mesaj></div>}
      <div className="sm:col-span-3"><BirincilDugme type="submit" bekliyor={bekliyor}>{dava ? 'Davayı güncelle' : 'Dava kaydını aç'}</BirincilDugme></div>
    </form>
  )
}
