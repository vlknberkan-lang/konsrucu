'use client'

/**
 * KonsRücü — Dosya kartı: avukatın seçimleri · components/dilekce-v2/secimler.tsx
 * Sistem önerir (etiketli), avukat seçer ve kaydeder. Görevli mahkeme ve talep sonucu programca kesinleştirilmez.
 * İnkâr tazminatı işaretlenince likit alacağı destekleyen kaynaklı olgu sayısı gösterilir.
 */
import { useId, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { likiditeOlguSayisi, type SecimGirdisi } from '@/lib/konsrucu/dilekce-v2/kart'
import { TALEP_ADI, TALEP_KODLARI, type KartIcerik, type TalepKodu } from '@/lib/konsrucu/dilekce-v2/tipler'
import { tarihTR } from '@/lib/konsrucu/format'
import { alan, ikincilDugme, kart, sessizDugme } from './stil'

type Props = {
  icerik: KartIcerik
  /** Avukat ve kart ESKIDI değil. */
  duzenlenebilir: boolean
  kilitli: boolean
  bekliyor: boolean
  onKaydet: (s: SecimGirdisi) => void
}

export function KartSecimleri({ icerik, duzenlenebilir, kilitli, bekliyor, onKaydet }: Props) {
  const id = useId()
  const s = icerik.secimler
  const o = icerik.oneriler
  const [mahkeme, setMahkeme] = useState(s.mahkeme ?? '')
  const [usul, setUsul] = useState<'' | 'YAZILI' | 'BASIT'>(s.usul ?? '')
  const [esas, setEsas] = useState(s.esas ?? '')
  const [davalilar, setDavalilar] = useState<string[]>(s.davalilar)
  const [talepler, setTalepler] = useState<TalepKodu[]>(s.talepler)
  const [arbGerekmez, setArbGerekmez] = useState(s.arabuluculukGerekmez)
  const [arbGerekce, setArbGerekce] = useState(s.arabuluculukGerekce ?? '')
  const [not, setNot] = useState(s.not ?? '')
  const likidite = likiditeOlguSayisi(icerik)
  const itirazinIptali = !icerik.davaTuru || icerik.davaTuru === 'ITIRAZIN_IPTALI'
  const degil = (a: string[], x: string) => (a.includes(x) ? a.filter((y) => y !== x) : [...a, x])

  function kaydet(e: React.FormEvent) {
    e.preventDefault()
    onKaydet({
      mahkeme: mahkeme.trim() || null, usul: usul || null, esas: esas.trim() || null, davalilar, talepler,
      arabuluculukGerekmez: arbGerekmez, arabuluculukGerekce: arbGerekce.trim() || null, not: not.trim() || null,
    })
  }

  return (
    <section className={kart} aria-labelledby={`${id}-baslik`}>
      <div className="border-b border-border px-4 py-3">
        <h2 id={`${id}-baslik`} className="font-display text-base font-extrabold">Avukatın seçimleri</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {s.kayitAt ? `Son kayıt: ${tarihTR(s.kayitAt)}` : 'Henüz kaydedilmedi. Öneriler etiketlidir; seçim sizindir.'}
        </p>
      </div>
      <form onSubmit={kaydet} className="space-y-4 p-4">
        <fieldset disabled={!duzenlenebilir || bekliyor} className="space-y-4">
          <div>
            <label htmlFor={`${id}-mahkeme`} className="text-xs font-semibold">Mahkeme</label>
            <input id={`${id}-mahkeme`} value={mahkeme} onChange={(e) => setMahkeme(e.target.value)} maxLength={300} placeholder="Görevli ve yetkili mahkemeyi siz seçersiniz" className={`${alan} mt-1`} />
            {o.mahkeme && o.mahkeme !== mahkeme && (
              <button type="button" onClick={() => setMahkeme(o.mahkeme!)} className={`${sessizDugme} mt-1 !min-h-7 !px-2 text-xs`}>Dava kaydındaki: {o.mahkeme}</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${id}-usul`} className="text-xs font-semibold">Usul</label>
              <select id={`${id}-usul`} value={usul} onChange={(e) => setUsul(e.target.value as '' | 'YAZILI' | 'BASIT')} className={`${alan} mt-1`}>
                <option value="">Seçilmedi</option>
                <option value="YAZILI">Yazılı</option>
                <option value="BASIT">Basit</option>
              </select>
              {o.usul && !usul && <p className="mt-1 text-[11px] text-muted-foreground">Dava kaydında: {o.usul === 'YAZILI' ? 'yazılı' : 'basit'}</p>}
            </div>
            <div>
              <label htmlFor={`${id}-esas`} className="text-xs font-semibold">Esas no</label>
              <input id={`${id}-esas`} value={esas} onChange={(e) => setEsas(e.target.value)} maxLength={60} placeholder={o.esas ?? 'Dava açılınca'} className={`${alan} mt-1 font-mono`} />
            </div>
          </div>

          {icerik.davaliAdaylari.length > 0 && (
            <fieldset>
              <legend className="text-xs font-semibold">Davalılar</legend>
              <ul className="mt-1 space-y-1.5">
                {icerik.davaliAdaylari.map((a) => {
                  const secili = davalilar.includes(a.borcluId)
                  return (
                    <li key={a.borcluId}>
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1" checked={secili} onChange={() => setDavalilar(degil(davalilar, a.borcluId))} />
                        <span>
                          {a.ad}
                          <span className="ml-1.5 text-[11px] text-muted-foreground">{a.itirazVar === true ? 'itiraz etti' : a.itirazVar === false ? 'itiraz etmedi' : 'itiraz kaydı yok'}</span>
                          {o.davalilar.includes(a.borcluId) && <span className="ml-1.5"><Badge tone="kr">önerilir</Badge></span>}
                          {secili && itirazinIptali && a.itirazVar !== true && (
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-danger"><AlertTriangle className="h-3 w-3" aria-hidden /> İtirazın iptalinde davalı yalnız itiraz eden borçludur (B08).</span>
                          )}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          )}

          {icerik.tur === 'DAVA' && (
            <fieldset>
              <legend className="text-xs font-semibold">Talepler</legend>
              <ul className="mt-1 space-y-1.5">
                {TALEP_KODLARI.map((t) => (
                  <li key={t}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={talepler.includes(t)} onChange={() => setTalepler(degil(talepler, t) as TalepKodu[])} />
                      <span>
                        {TALEP_ADI[t]}
                        {o.talepler.includes(t) && <span className="ml-1.5"><Badge tone="kr">önerilir</Badge></span>}
                        {t === 'INKAR_TAZMINATI' && talepler.includes(t) && (
                          <span className={`mt-0.5 block text-[11px] ${likidite ? 'text-muted-foreground' : 'text-warning'}`}>
                            Likidite olguları: {likidite}{likidite ? '' : ' — likit alacağı gösteren kaynaklı olgu yok (teyit gerekli)'}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Faiz türü, oranı ve başlangıcı takip talebindekinden farklı yazılamaz (talep sonucu kapısı).</p>
            </fieldset>
          )}

          <div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={arbGerekmez} onChange={(e) => setArbGerekmez(e.target.checked)} />
              <span>Arabuluculuk bu dava için dava şartı değil</span>
            </label>
            {arbGerekmez && (
              <textarea aria-label="Arabuluculuğun dava şartı olmama gerekçesi" value={arbGerekce} onChange={(e) => setArbGerekce(e.target.value)} rows={2} maxLength={1000} placeholder="Gerekçe (zorunlu)" className={`${alan} mt-1`} />
            )}
          </div>
          <div>
            <label htmlFor={`${id}-not`} className="text-xs font-semibold">Not</label>
            <textarea id={`${id}-not`} value={not} onChange={(e) => setNot(e.target.value)} rows={2} maxLength={2000} className={`${alan} mt-1`} />
          </div>
        </fieldset>
        {duzenlenebilir ? (
          <div className="space-y-1">
            <button type="submit" disabled={bekliyor} className={ikincilDugme}>Seçimleri kaydet</button>
            {kilitli && <p className="text-[11px] text-warning">Kart kilitli: kaydettiğinizde yeni sürüm açılır.</p>}
          </div>
        ) : <p className="text-[11px] text-muted-foreground">Seçimleri yalnız avukat kaydeder.</p>}
      </form>
    </section>
  )
}
