'use client'

/**
 * KonsRücü — 6 DAVA ÖN KONTROLÜ kartı (DA-01/02/03; açık karar 4) · components/dava/on-kontrol.tsx
 * Müvekkil onayı (ya da süre koruma istisnası) yokken KİLİTLİ: hazırlık başlatılamaz, "imzaya hazır" açılmaz.
 * Görevli mahkeme ve usulü avukat seçer; program mahkeme adı önermez. Eksikler yazılı gerekçeyle geçilebilir
 * (müvekkil onayı ve dava şartı arabuluculukta son tutanak hariç).
 */
import { useState } from 'react'
import { ClipboardCheck, Lock } from 'lucide-react'
import { davaHazirligiBaslat, onKontrolMaddesiGec, onKontrolSecimKaydet } from '@/app/(app)/dosya-islem/dava-actions'
import { MAHKEME_TUR_ETIKET, MAHKEME_TURLERI, USUL_ETIKET, USULLER } from '@/lib/konsrucu/dava/sabitler'
import type { DavaUI, OnKontrolUI } from '@/lib/konsrucu/dava/veri'
import { BirincilDugme, IkincilDugme, INP, Kart, LBL, Mesaj, TeyitEtiketi, useAksiyon } from '../arabuluculuk/ortak'

export type OnKontrolKartiProps = {
  dosyaId: string
  onKontrol: OnKontrolUI
  hazirlik: DavaUI | null
  yetki: { yazabilir: boolean; avukat: boolean }
}

const ISARET: Record<string, { k: string; cls: string }> = {
  TAMAM: { k: '[x]', cls: 'text-success' },
  GECILDI: { k: '[~]', cls: 'text-kr-ink' },
  BILGI: { k: '[i]', cls: 'text-muted-foreground' },
  EKSIK: { k: '[ ]', cls: 'text-[hsl(var(--warning-fg))]' },
  UYARI: { k: '[!]', cls: 'text-[hsl(var(--warning-fg))]' },
  ENGEL: { k: '[!]', cls: 'text-danger' },
}

export function OnKontrolKarti({ dosyaId, onKontrol: o, hazirlik, yetki }: OnKontrolKartiProps) {
  const [gecilen, setGecilen] = useState<string | null>(null)
  const baslat = useAksiyon()
  const secim = useAksiyon()
  const gec = useAksiyon()

  return (
    <Kart id="on-kontrol" kicker="6 · Dava ön kontrolü" baslik={o.kilitli ? 'Kilitli: müvekkil onayı yok' : o.imzayaHazir ? 'Hazır: dava dilekçesine geçilebilir' : `Eksik: ${o.ilkEksik?.baslik ?? '—'}`}
      vurgu={o.kilitli ? 'tehlike' : o.imzayaHazir ? undefined : 'uyari'} sag={o.kilitli ? <Lock className="h-4 w-4 text-danger" /> : <ClipboardCheck className="h-4 w-4 text-muted-foreground" />}
      alt={`Eksik varken "imzaya hazır" kilitli. Hazır olunca dava dilekçesini hazırlayın ve davayı UYAP'ta siz açın.`}>
      {o.kilitli && <div className="mb-3"><Mesaj tur="hata">{o.kilitMesaji}{o.istisnaMumkun ? ` İhtiyatlı son güne ${o.kalanGun} gün kaldı: müvekkil onayı kartından yazılı gerekçeyle istisna kullanılabilir.` : ''}</Mesaj></div>}

      <ul className="flex flex-col gap-1.5 font-mono text-[12.5px]">
        {o.maddeler.map((m) => (
          <li key={m.kod} className="flex flex-col gap-1 rounded-[8px] px-2 py-1 hover:bg-surface-muted/50">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`w-7 font-bold ${ISARET[m.durum]?.cls ?? ''}`}>{ISARET[m.durum]?.k ?? '[?]'}</span>
              <span className="font-sans font-semibold">{m.baslik}:</span>
              <span className="font-sans text-muted-foreground">{m.aciklama}</span>
              {m.etiket && <TeyitEtiketi metin={m.etiket} />}
              {m.gerekce && <span className="font-sans text-[11.5px] text-kr-ink">gerekçe: {m.gerekce}</span>}
              {!o.kilitli && yetki.avukat && m.gecilebilir && ['EKSIK', 'UYARI', 'ENGEL'].includes(m.durum) && (
                <IkincilDugme onClick={() => setGecilen(gecilen === m.kod ? null : m.kod)}>Gerekçeyle geç</IkincilDugme>
              )}
            </div>
            {gecilen === m.kod && (
              <form
                onSubmit={(ev) => {
                  ev.preventDefault()
                  const gerekce = String(new FormData(ev.currentTarget).get('gerekce') ?? '')
                  gec.calistir(() => onKontrolMaddesiGec({ dosyaId, kod: m.kod, gerekce }), () => { setGecilen(null); return 'Madde gerekçeyle geçildi (kayda yazıldı).' })
                }}
                className="ml-9 flex flex-wrap items-end gap-2 font-sans"
              >
                <div className="min-w-[240px] flex-1"><label className={LBL} htmlFor={`gc-${m.kod}`}>Yazılı gerekçe</label><input id={`gc-${m.kod}`} name="gerekce" required minLength={10} className={INP} /></div>
                <IkincilDugme type="submit" bekliyor={gec.bekliyor}>Kaydet</IkincilDugme>
              </form>
            )}
          </li>
        ))}
      </ul>
      {gec.hata && <div className="mt-2"><Mesaj tur="hata">{gec.hata}</Mesaj></div>}
      {gec.bilgi && <div className="mt-2"><Mesaj tur="ok">{gec.bilgi}</Mesaj></div>}

      {!o.kilitli && yetki.avukat && (
        <div className="mt-4 border-t border-border-subtle pt-3">
          {!hazirlik ? (
            <div className="flex flex-wrap items-center gap-3">
              <BirincilDugme bekliyor={baslat.bekliyor} onClick={() => baslat.calistir(() => davaHazirligiBaslat({ dosyaId }), () => 'Dava hazırlığı başladı: görevli mahkemeyi ve usulü seçin.')}>Dava hazırlığını başlat</BirincilDugme>
              <span className="text-[11.5px] text-muted-foreground">Görevli mahkeme ve usul seçimleri hazırlık kaydına yazılır.</span>
            </div>
          ) : (
            <form
              onSubmit={(ev) => {
                ev.preventDefault()
                const fd = new FormData(ev.currentTarget)
                const s = (k: string) => String(fd.get(k) ?? '').trim() || undefined
                secim.calistir(() => onKontrolSecimKaydet({ davaId: hazirlik.id, mahkemeTuru: s('mahkemeTuru'), usul: s('usul'), harcAvans: s('harcAvans') }), () => 'Seçimler kaydedildi.')
              }}
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              <div><label className={LBL} htmlFor="ok-mt">Görevli mahkeme (avukat seçer)</label>
                <select id="ok-mt" name="mahkemeTuru" defaultValue={hazirlik.mahkemeTuru ?? ''} className={INP}>
                  <option value="">Seçin</option>
                  {MAHKEME_TURLERI.slice(0, 5).map((m) => <option key={m} value={m}>{MAHKEME_TUR_ETIKET[m]}</option>)}
                </select>
              </div>
              <div><label className={LBL} htmlFor="ok-usul">Usul (avukat seçer)</label>
                <select id="ok-usul" name="usul" defaultValue={hazirlik.usul ?? ''} className={INP}>
                  <option value="">Seçin</option>
                  {USULLER.map((u) => <option key={u} value={u}>{USUL_ETIKET[u]}</option>)}
                </select>
              </div>
              <div><label className={LBL} htmlFor="ok-harc">Harç ve avans (elle)</label><input id="ok-harc" name="harcAvans" defaultValue={hazirlik.harcAvans ?? ''} className={INP} /></div>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
                <BirincilDugme type="submit" bekliyor={secim.bekliyor}>Seçimleri kaydet</BirincilDugme>
                <span className="text-[11.5px] text-muted-foreground">Kriterler: taraflar tacir mi, tüketici işlemi mi, halefiyetin kaynağı (ZMSS/kasko). Hepsi teyit gerekli.</span>
              </div>
            </form>
          )}
          {baslat.hata && <Mesaj tur="hata">{baslat.hata}</Mesaj>}
          {secim.hata && <Mesaj tur="hata">{secim.hata}</Mesaj>}
          {secim.bilgi && <Mesaj tur="ok">{secim.bilgi}</Mesaj>}
          {o.imzayaHazir && <div className="mt-3"><Mesaj tur="ok">Ön kontrol tamam: dava dilekçesini hazırlayabilirsiniz (DA-03).</Mesaj></div>}
        </div>
      )}
    </Kart>
  )
}
