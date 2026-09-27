'use client'

/**
 * KonsRücü — YOL SEÇİMİ kartı (AR-01) · components/arabuluculuk/yol-secimi.tsx
 * İtiraz sonrası avukat yolu ÖNERİR; müvekkil onaylar (onay kaydı ayrı kartta). Varsayılan seçim yok.
 * Dava ekonomisi satırları elle (harç, avans, haciz sonucu, malvarlığı; B29 tam kart ertelendi).
 */
import { useState } from 'react'
import { Route } from 'lucide-react'
import { yolSec } from '@/app/(app)/dosya-islem/arabuluculuk-actions'
import { ITIRAZ_SONRASI_ETIKET, ITIRAZ_SONRASI_YOLLAR } from '@/lib/konsrucu/arabuluculuk/sabitler'
import { BirincilDugme, gunGoster, INP, Kart, LBL, Mesaj, TeyitEtiketi, useAksiyon } from './ortak'

export type YolSecimiKartiProps = {
  dosyaId: string
  itirazOnayli: boolean
  yolSecimi: { id: string; secim: string; gerekce: string | null; ekonomi: Record<string, string> | null; secimAt: string } | null
  ihtiyatliSonGun: string | null
  yetki: { yazabilir: boolean; avukat: boolean }
}

export function YolSecimiKarti(p: YolSecimiKartiProps) {
  const [secim, setSecim] = useState<string>(p.yolSecimi?.secim ?? '')
  const { bekliyor, hata, bilgi, calistir } = useAksiyon()
  const e = p.yolSecimi?.ekonomi ?? {}

  function kaydet(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget)
    const s = (k: string) => String(fd.get(k) ?? '').trim() || undefined
    calistir(
      () => yolSec({ dosyaId: p.dosyaId, asama: 'ITIRAZ_SONRASI', secim, gerekce: s('gerekce'), ekonomi: { harc: s('harc'), avans: s('avans'), hacizSonucu: s('hacizSonucu'), malvarligi: s('malvarligi') } }),
      () => 'Yol kaydedildi. Müvekkil onayını isteyin.',
    )
  }

  return (
    <Kart id="yol-secimi" kicker="Yol seçimi · itiraz sonrası" baslik="Hangi yoldan ilerleyelim?" alt="Avukat önerir, müvekkil onaylar. Onay kaydı yokken dava ön kontrolü kilitli kalır." sag={<Route className="h-4 w-4 text-muted-foreground" />}>
      {!p.itirazOnayli && <div className="mb-3"><Mesaj tur="bilgi">Onaylı bir itiraz kaydı yok. Yol seçimi itiraz onaylandıktan sonra anlamlıdır.</Mesaj></div>}
      {p.ihtiyatliSonGun && (
        <p className="mb-3 text-[12.5px] text-muted-foreground">
          İİK 67 ihtiyatlı son gün: <b className="font-mono text-foreground">{gunGoster(p.ihtiyatliSonGun)}</b> <TeyitEtiketi />
        </p>
      )}
      <form onSubmit={kaydet} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-1.5" disabled={!p.yetki.avukat}>
          <legend className={LBL}>Önerilen yol</legend>
          {ITIRAZ_SONRASI_YOLLAR.map((y) => (
            <label key={y} className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-2 text-[13px] transition ${secim === y ? 'border-kr bg-kr-soft/50' : 'border-border-subtle hover:border-kr/40'}`}>
              <input type="radio" name="secim" value={y} checked={secim === y} onChange={() => setSecim(y)} className="accent-[hsl(var(--kr))]" />
              {ITIRAZ_SONRASI_ETIKET[y]}
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={LBL} htmlFor="ys-harc">Harç (elle)</label><input id="ys-harc" name="harc" defaultValue={e.harc ?? ''} className={INP} disabled={!p.yetki.avukat} /></div>
          <div><label className={LBL} htmlFor="ys-avans">Gider avansı (elle)</label><input id="ys-avans" name="avans" defaultValue={e.avans ?? ''} className={INP} disabled={!p.yetki.avukat} /></div>
          <div><label className={LBL} htmlFor="ys-haciz">Haciz sonucu</label><input id="ys-haciz" name="hacizSonucu" defaultValue={e.hacizSonucu ?? ''} className={INP} disabled={!p.yetki.avukat} /></div>
          <div><label className={LBL} htmlFor="ys-mal">Borçlu malvarlığı</label><input id="ys-mal" name="malvarligi" defaultValue={e.malvarligi ?? ''} className={INP} disabled={!p.yetki.avukat} /></div>
          <div className="sm:col-span-2"><label className={LBL} htmlFor="ys-gerekce">Gerekçe</label><textarea id="ys-gerekce" name="gerekce" rows={2} defaultValue={p.yolSecimi?.gerekce ?? ''} className={`${INP} resize-y`} disabled={!p.yetki.avukat} /></div>
        </div>
        {hata && <Mesaj tur="hata">{hata}</Mesaj>}
        {bilgi && <Mesaj tur="ok">{bilgi}</Mesaj>}
        <div className="flex flex-wrap items-center gap-3">
          <BirincilDugme type="submit" bekliyor={bekliyor} disabled={!secim || !p.yetki.avukat}>Yolu kaydet</BirincilDugme>
          {p.yolSecimi && <span className="text-[11.5px] text-muted-foreground">Son seçim {gunGoster(p.yolSecimi.secimAt)} · değiştirirseniz eski seçim "eskidi" olarak kalır.</span>}
          {!p.yetki.avukat && <span className="text-[11.5px] text-muted-foreground">Yolu yalnız avukat seçer.</span>}
        </div>
      </form>
    </Kart>
  )
}
