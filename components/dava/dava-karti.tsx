'use client'

/**
 * KonsRücü — DAVA KARTI · components/dava/dava-karti.tsx
 * Künye (mahkeme, esas, açılış, usul, değer), taraflar (ad maskeli), işlemler (dilekçe/tensip/ara karar …; ADAY olanlar
 * teyit edilir), İİK 67 kanıtla kapanış (DA-06a/b) ve işlem ekleme. Geri doldurma/Excel kayıtları rozetle ayrışır.
 */
import { useState } from 'react'
import { Gavel } from 'lucide-react'
import { davaIslemEkle, iik67Kapat, kayitTeyit } from '@/app/(app)/dosya-islem/dava-actions'
import { DAVA_DURUM_ETIKET, DAVA_ISLEM_TURLERI, EVRE_ETIKET, ISLEM_ETIKET, USUL_ETIKET, type DavaDurumu, type DavaEvresi, type DavaIslemTuru } from '@/lib/konsrucu/dava/sabitler'
import type { DavaUI } from '@/lib/konsrucu/dava/veri'
import { anGoster, BirincilDugme, bugunIso, gunGoster, IkincilDugme, INP, Kart, KaynakRozeti, LBL, MaskeliMetin, Mesaj, paraGoster, TeyitEtiketi, useAksiyon } from '../arabuluculuk/ortak'
import { DavaKayitFormu } from './dava-kayit-formu'

export type DavaKartiProps = {
  dosyaId: string
  dava: DavaUI
  borclular: { id: string; adUnvan: string }[]
  arabuluculuklar: { id: string; etiket: string }[]
  yetki: { yazabilir: boolean; avukat: boolean }
}

function Iik67Satirlari({ dava, avukat }: { dava: DavaUI; avukat: boolean }) {
  const a = useAksiyon()
  if (!dava.iik67.length) return null
  return (
    <div id="iik67-kapanis" className="flex flex-col gap-2">
      {dava.iik67.map((s) => {
        const k = s.kontrol
        const tur = k.durum === 'SONRA' ? 'hata' : k.durum === 'KAPANMAYA_HAZIR' ? 'uyari' : k.durum === 'KAPALI' ? 'ok' : 'bilgi'
        return (
          <div key={s.sureId} className="flex flex-col gap-1.5">
            <Mesaj tur={tur}>
              <b>İİK 67:</b> {k.mesaj} {'not' in k ? <span className="block text-[11.5px]">{k.not}</span> : null}
            </Mesaj>
            {k.durum === 'KAPANMAYA_HAZIR' && avukat && (
              <div><IkincilDugme bekliyor={a.bekliyor} onClick={() => a.calistir(() => iik67Kapat({ sureId: s.sureId, davaId: dava.id }), () => 'İİK 67 kaydı kapatıldı.')}>İİK 67 kaydını kapat</IkincilDugme></div>
            )}
          </div>
        )
      })}
      {a.hata && <Mesaj tur="hata">{a.hata}</Mesaj>}
      {a.bilgi && <Mesaj tur="ok">{a.bilgi}</Mesaj>}
    </div>
  )
}

export function DavaKarti({ dosyaId, dava: d, borclular, arabuluculuklar, yetki }: DavaKartiProps) {
  const [duzenle, setDuzenle] = useState(false)
  const [tur, setTur] = useState<string>('')
  const islemA = useAksiyon()
  const teyitA = useAksiyon()
  const baslik = [d.mahkemeAdi, d.esas].filter(Boolean).join(' · ') || 'Dava'
  const durumEt = DAVA_DURUM_ETIKET[d.durum as DavaDurumu] ?? d.durum
  const adaylar = d.islemler.filter((i) => i.teyit === 'ADAY').length + d.taraflar.filter((t) => t.teyit === 'ADAY').length

  return (
    <Kart id="dava-karti" kicker={`6 · Dava${d.rolumuz === 'DAVALI' ? ' · karşı taraf davası' : ''}`} baslik={baslik} vurgu={d.rolumuz === 'DAVALI' ? 'uyari' : undefined}
      sag={<div className="flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-kr-soft px-2 py-0.5 text-[10.5px] font-semibold text-kr-ink">{durumEt}</span><KaynakRozeti teyit={d.teyit} kaynakTuru={d.kaynakTuru} /><Gavel className="h-4 w-4 text-muted-foreground" /></div>}>
      {d.teyit === 'ADAY' && yetki.avukat && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft/30 px-3 py-2 text-[12.5px]">
          <span>Bu dava kaydı {d.kaynakTuru === 'GERI_DOLDURMA' ? 'geri doldurmayla' : 'otomatik'} açıldı: UYAP'la karşılaştırıp teyit edin.</span>
          <IkincilDugme bekliyor={teyitA.bekliyor} onClick={() => teyitA.calistir(() => kayitTeyit({ tablo: 'DAVA', id: d.id, karar: 'TEYITLI' }))}>Teyit et</IkincilDugme>
          <IkincilDugme tehlike bekliyor={teyitA.bekliyor} onClick={() => teyitA.calistir(() => kayitTeyit({ tablo: 'DAVA', id: d.id, karar: 'REDDEDILDI' }))}>Yanlış, kaldır</IkincilDugme>
        </div>
      )}
      {teyitA.hata && <Mesaj tur="hata">{teyitA.hata}</Mesaj>}

      <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-4">
        <div><dt className={LBL}>Açılış</dt><dd className="font-mono font-semibold">{gunGoster(d.acilisTarihi)}</dd></div>
        <div><dt className={LBL}>Usul</dt><dd>{d.usul ? USUL_ETIKET[d.usul as 'BASIT' | 'YAZILI'] : '—'}</dd></div>
        <div><dt className={LBL}>Evre</dt><dd>{d.evre ? EVRE_ETIKET[d.evre as DavaEvresi] ?? d.evre : '—'}</dd></div>
        <div><dt className={LBL}>Dava değeri</dt><dd className="font-mono">{paraGoster(d.davaDegeri)}</dd></div>
        <div><dt className={LBL}>Sonraki duruşma</dt><dd className="font-mono">{anGoster(d.sonrakiDurusma)}</dd></div>
        <div><dt className={LBL}>Ön inceleme</dt><dd className="font-mono">{anGoster(d.onIncelemeTarihi)}</dd></div>
        <div><dt className={LBL}>Üst dosya no</dt><dd className="font-mono">{d.ustDosyaNoHam ?? '—'}</dd></div>
        <div><dt className={LBL}>UYAP bağı</dt><dd>{d.uyapDosyaId ? 'var' : 'yok'}</dd></div>
      </dl>

      <Iik67Satirlari dava={d} avukat={yetki.avukat} />

      <div className="mt-4">
        <div className={LBL}>Taraflar</div>
        <ul className="flex flex-col gap-1">
          {d.taraflar.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="w-16 font-semibold">{t.rol === 'DAVACI' ? 'Davacı' : t.rol === 'DAVALI' ? 'Davalı' : t.rol}</span>
              {t.rol === 'DAVACI' && !t.ad ? <span>Müvekkil</span> : <MaskeliMetin deger={t.ad} />}
              <KaynakRozeti teyit={t.teyit} kaynakTuru={t.kaynakTuru} />
              {t.teyit === 'ADAY' && yetki.avukat && (
                <>
                  <IkincilDugme bekliyor={teyitA.bekliyor} onClick={() => teyitA.calistir(() => kayitTeyit({ tablo: 'DAVA_TARAF', id: t.id, karar: 'TEYITLI' }))}>Teyit</IkincilDugme>
                  <IkincilDugme tehlike bekliyor={teyitA.bekliyor} onClick={() => teyitA.calistir(() => kayitTeyit({ tablo: 'DAVA_TARAF', id: t.id, karar: 'REDDEDILDI' }))}>Reddet</IkincilDugme>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between"><span className={LBL}>İşlemler</span>{adaylar > 0 && <span className="text-[11px] text-[hsl(var(--warning-fg))]">{adaylar} aday kayıt teyit bekliyor</span>}</div>
        {d.islemler.length === 0 && <p className="text-[12.5px] text-muted-foreground">Henüz işlem yok.</p>}
        <ul className="flex flex-col gap-1">
          {d.islemler.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border-subtle px-3 py-1.5 text-[12.5px]">
              <span className="font-mono w-[84px] text-muted-foreground">{gunGoster(i.tarih)}</span>
              <b>{ISLEM_ETIKET[i.tur as DavaIslemTuru] ?? i.tur}</b>
              {i.referansNo && <span className="font-mono text-muted-foreground">· {i.referansNo}</span>}
              {i.tebligTarihi && <span className="text-muted-foreground">· tebliğ {gunGoster(i.tebligTarihi)}</span>}
              {i.ozet && <span className="text-muted-foreground">· {i.ozet}</span>}
              {i.excelHam && !i.referansNo && <span className="italic text-muted-foreground">· Excel: "{i.excelHam}"</span>}
              <KaynakRozeti teyit={i.teyit} kaynakTuru={i.kaynakTuru} />
              {i.teyit === 'ADAY' && yetki.avukat && (
                <>
                  <IkincilDugme bekliyor={teyitA.bekliyor} onClick={() => teyitA.calistir(() => kayitTeyit({ tablo: 'DAVA_ISLEM', id: i.id, karar: 'TEYITLI' }))}>Teyit</IkincilDugme>
                  <IkincilDugme tehlike bekliyor={teyitA.bekliyor} onClick={() => teyitA.calistir(() => kayitTeyit({ tablo: 'DAVA_ISLEM', id: i.id, karar: 'REDDEDILDI' }))}>Reddet</IkincilDugme>
                </>
              )}
            </li>
          ))}
        </ul>
        {yetki.yazabilir && (
          <form
            onSubmit={(ev) => {
              ev.preventDefault()
              const fd = new FormData(ev.currentTarget)
              const s = (k: string) => String(fd.get(k) ?? '').trim() || undefined
              islemA.calistir(() => davaIslemEkle({ davaId: d.id, tur, tarih: s('tarih'), tebligTarihi: s('teblig'), referansNo: s('ref'), ozet: s('ozet') }), () => 'İşlem eklendi.')
            }}
            className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-surface-muted/40 p-3"
          >
            <div><label className={LBL} htmlFor={`di-tur-${d.id}`}>İşlem</label>
              <select id={`di-tur-${d.id}`} value={tur} onChange={(e) => setTur(e.target.value)} className={`${INP} bg-surface`} required>
                <option value="">Seçin</option>
                {DAVA_ISLEM_TURLERI.map((t) => <option key={t} value={t}>{ISLEM_ETIKET[t]}</option>)}
              </select>
            </div>
            <div><label className={LBL} htmlFor={`di-t-${d.id}`}>Tarih</label><input id={`di-t-${d.id}`} type="date" name="tarih" max={bugunIso()} className={`${INP} bg-surface`} /></div>
            <div><label className={LBL} htmlFor={`di-tb-${d.id}`}>Tebliğ</label><input id={`di-tb-${d.id}`} type="date" name="teblig" max={bugunIso()} className={`${INP} bg-surface`} /></div>
            <div><label className={LBL} htmlFor={`di-r-${d.id}`}>Referans (iş emri / yazı no)</label><input id={`di-r-${d.id}`} name="ref" className={`${INP} bg-surface`} /></div>
            <div className="min-w-[160px] flex-1"><label className={LBL} htmlFor={`di-o-${d.id}`}>Özet</label><input id={`di-o-${d.id}`} name="ozet" className={`${INP} bg-surface`} /></div>
            <IkincilDugme type="submit" bekliyor={islemA.bekliyor} disabled={!tur}>İşlem ekle</IkincilDugme>
            {islemA.hata && <Mesaj tur="hata">{islemA.hata}</Mesaj>}
          </form>
        )}
      </div>

      {yetki.yazabilir && (
        <div className="mt-4 border-t border-border-subtle pt-3">
          {duzenle ? (
            <DavaKayitFormu dosyaId={dosyaId} dava={d} borclular={borclular} arabuluculuklar={arabuluculuklar} onBitti={() => setDuzenle(false)} />
          ) : (
            <BirincilDugme onClick={() => setDuzenle(true)}>Dava bilgilerini düzenle</BirincilDugme>
          )}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Süre ve tarih önerileri <TeyitEtiketi /> Kesin son gün avukat onayıyla yazılır.</p>
    </Kart>
  )
}
