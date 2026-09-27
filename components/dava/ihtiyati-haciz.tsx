'use client'

/**
 * KonsRücü — İHTİYATİ HACİZ kartı · components/dava/ihtiyati-haciz.tsx
 * Talep, sonuç, karar ve tebliğ tarihleri, teminat (oran metni ve tutarı mahkemeden; program hesaplamaz), infaz talebi.
 * Excel #27'den gelen ayrıştırılamamış kayıt "elle tamamlayın" etiketiyle görünür. Karardan sonra İİK 261/264
 * süreleri süre defterinde önerilir (teyit gerekli).
 */
import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { ihtiyatiHacizKaydet, kayitTeyit } from '@/app/(app)/dosya-islem/dava-actions'
import { IH_SONUC_ETIKET, IH_SONUCLARI, type IhSonucu } from '@/lib/konsrucu/dava/sabitler'
import type { DavaUI } from '@/lib/konsrucu/dava/veri'
import { BirincilDugme, bugunIso, gunGoster, IkincilDugme, INP, Kart, KaynakRozeti, LBL, Mesaj, paraGoster, TeyitEtiketi, useAksiyon } from '../arabuluculuk/ortak'

type IH = DavaUI['ihtiyatiHacizler'][number]
export type IhtiyatiHacizKartiProps = { dosyaId: string; davaId: string | null; kayitlar: IH[]; yetki: { yazabilir: boolean; avukat: boolean } }

function Form({ dosyaId, davaId, k, onBitti }: { dosyaId: string; davaId: string | null; k: IH | null; onBitti: () => void }) {
  const { bekliyor, hata, bilgi, calistir } = useAksiyon()
  const [sonuc, setSonuc] = useState<string>(k?.sonuc ?? '')
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault()
        const fd = new FormData(ev.currentTarget)
        const s = (x: string) => String(fd.get(x) ?? '').trim() || undefined
        calistir(() => ihtiyatiHacizKaydet({
          dosyaId, id: k?.id, davaId: davaId ?? undefined, asama: s('asama') ?? 'DAVADA', sonuc,
          talepTarihi: s('talep'), kararTarihi: s('karar'), kararTebligTarihi: s('teblig'), teminatOrani: s('oran'), teminatTutari: s('tutar'), teminatYatirildiAt: s('yatirma'), infazTalepTarihi: s('infaz'),
        }), (r) => { onBitti(); return ((r as unknown as { uyari?: string | null }).uyari) ?? 'Kaydedildi.' })
      }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <div><label className={LBL} htmlFor="ih-asama">Aşama</label>
        <select id="ih-asama" name="asama" defaultValue={k?.asama ?? (davaId ? 'DAVADA' : 'TAKIP_ONCESI')} className={INP}>
          <option value="TAKIP_ONCESI">Takip öncesi</option><option value="DAVADA">Dava sırasında</option><option value="ILAMLI">İlamlı</option>
        </select>
      </div>
      <div><label className={LBL} htmlFor="ih-sonuc">Sonuç</label>
        <select id="ih-sonuc" value={sonuc} onChange={(e) => setSonuc(e.target.value)} className={INP} required>
          <option value="">Seçin</option>
          {IH_SONUCLARI.map((x) => <option key={x} value={x}>{IH_SONUC_ETIKET[x]}</option>)}
        </select>
      </div>
      <div><label className={LBL} htmlFor="ih-talep">Talep tarihi</label><input id="ih-talep" type="date" name="talep" max={bugunIso()} defaultValue={k?.talepTarihi ?? ''} className={INP} /></div>
      <div><label className={LBL} htmlFor="ih-karar">Karar tarihi</label><input id="ih-karar" type="date" name="karar" max={bugunIso()} defaultValue={k?.kararTarihi ?? ''} className={INP} /></div>
      <div><label className={LBL} htmlFor="ih-teblig">Karar tebliğ tarihi</label><input id="ih-teblig" type="date" name="teblig" max={bugunIso()} defaultValue={k?.kararTebligTarihi ?? ''} className={INP} /></div>
      <div><label className={LBL} htmlFor="ih-oran">Teminat oranı (kararda yazan)</label><input id="ih-oran" name="oran" defaultValue={k?.teminatOrani ?? ''} placeholder="%15" className={INP} /></div>
      <div><label className={LBL} htmlFor="ih-tutar">Teminat tutarı (mahkemenin)</label><input id="ih-tutar" name="tutar" inputMode="decimal" defaultValue={k?.teminatTutari != null ? String(k.teminatTutari).replace('.', ',') : ''} className={INP} /></div>
      <div><label className={LBL} htmlFor="ih-yat">Teminat yatırıldı</label><input id="ih-yat" type="date" name="yatirma" max={bugunIso()} defaultValue={k?.teminatYatirildiAt ?? ''} className={INP} /></div>
      <div><label className={LBL} htmlFor="ih-infaz">İnfaz talebi</label><input id="ih-infaz" type="date" name="infaz" max={bugunIso()} defaultValue={k?.infazTalepTarihi ?? ''} className={INP} /></div>
      {hata && <div className="sm:col-span-3"><Mesaj tur="hata">{hata}</Mesaj></div>}
      {bilgi && <div className="sm:col-span-3"><Mesaj tur="ok">{bilgi}</Mesaj></div>}
      <div className="sm:col-span-3"><BirincilDugme type="submit" bekliyor={bekliyor} disabled={!sonuc}>{k ? 'Kaydı güncelle' : 'İhtiyati haciz kaydı ekle'}</BirincilDugme></div>
    </form>
  )
}

export function IhtiyatiHacizKarti({ dosyaId, davaId, kayitlar, yetki }: IhtiyatiHacizKartiProps) {
  const [acik, setAcik] = useState<string | null>(null)
  const teyit = useAksiyon()
  return (
    <Kart id="ihtiyati-haciz" kicker="İhtiyati haciz" baslik={kayitlar.length ? `${kayitlar.length} kayıt` : 'Kayıt yok'} sag={<ShieldAlert className="h-4 w-4 text-muted-foreground" />}
      alt="Teminatı mahkeme belirler; program hesaplamaz. Karardan sonra İİK 261 ve 264 süreleri önerilir (teyit gerekli).">
      <ul className="mb-3 flex flex-col gap-2">
        {kayitlar.map((k) => (
          <li key={k.id} className="rounded-xl border border-border-subtle p-3 text-[12.5px]">
            <div className="flex flex-wrap items-center gap-2">
              <b>{IH_SONUC_ETIKET[k.sonuc as IhSonucu] ?? k.sonuc}</b>
              <span className="text-muted-foreground">talep {gunGoster(k.talepTarihi)} · karar {gunGoster(k.kararTarihi)} · tebliğ {gunGoster(k.kararTebligTarihi)}</span>
              {k.teminatOrani && <span className="text-muted-foreground">· teminat {k.teminatOrani}</span>}
              {k.teminatTutari != null && <span className="font-mono text-muted-foreground">· {paraGoster(k.teminatTutari)}</span>}
              <KaynakRozeti teyit={k.teyit} kaynakTuru={k.kaynakTuru} />
            </div>
            {k.excelHam && <div className="mt-1 italic text-muted-foreground">Excel #27: "{k.excelHam}"{k.teyit === 'ADAY' ? ' · ayrıştırılamadıysa elle tamamlayın' : ''}</div>}
            {(k.sonuc === 'KABUL' || k.sonuc === 'KISMEN') && <div className="mt-1 text-[11.5px] text-muted-foreground">İİK 261 (infaz) ve 264 süreleri süre defterinde <TeyitEtiketi /></div>}
            {yetki.yazabilir && (
              <div className="mt-2 flex flex-wrap gap-2">
                <IkincilDugme onClick={() => setAcik(acik === k.id ? null : k.id)}>{acik === k.id ? 'Kapat' : 'Düzenle'}</IkincilDugme>
                {k.teyit === 'ADAY' && yetki.avukat && <IkincilDugme bekliyor={teyit.bekliyor} onClick={() => teyit.calistir(() => kayitTeyit({ tablo: 'IHTIYATI_HACIZ', id: k.id, karar: 'TEYITLI' }))}>Teyit et</IkincilDugme>}
              </div>
            )}
            {acik === k.id && <div className="mt-3"><Form dosyaId={dosyaId} davaId={davaId} k={k} onBitti={() => setAcik(null)} /></div>}
          </li>
        ))}
      </ul>
      {teyit.hata && <Mesaj tur="hata">{teyit.hata}</Mesaj>}
      {yetki.yazabilir && (acik === 'yeni' ? <Form dosyaId={dosyaId} davaId={davaId} k={null} onBitti={() => setAcik(null)} /> : <IkincilDugme onClick={() => setAcik('yeni')}>Yeni ihtiyati haciz kaydı</IkincilDugme>)}
    </Kart>
  )
}
