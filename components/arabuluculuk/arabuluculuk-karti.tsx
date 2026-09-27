'use client'

/**
 * KonsRücü — 5 ARABULUCULUK kartı · components/arabuluculuk/arabuluculuk-karti.tsx
 *
 * - Kayıt yoksa ELLE AÇMA FORMU (büro/dosya no, başvuru, arabulucu, süreç başlangıcı, konu): eklenti bulamazsa avukat girer.
 * - Tür seçimi: dava şartı / ihtiyari / belirsiz — VARSAYILAN YOK, avukat seçer (açık karar 3; bilgi notu K1'den geçene
 *   kadar gizli). Belirsizse başvuru önerilir.
 * - Zaman çizgisi (başvuru → toplantılar → son tutanak), toplantı ekleme ve sonucu (AR-05), son tutanak (AR-06/07/09).
 * - Geri doldurma/Excel'den gelen ADAY kayıt rozetle ayrışır; avukat teyit eder ya da reddeder.
 */
import { useState } from 'react'
import { Scale, CalendarPlus } from 'lucide-react'
import { arabuluculukKaydet, arabuluculukToplantiEkle, arabuluculukToplantiSonucu, arabuluculukTurSec } from '@/app/(app)/dosya-islem/arabuluculuk-actions'
import { kayitTeyit } from '@/app/(app)/dosya-islem/dava-actions'
import { ARABULUCULUK_SONUC_ETIKET, ARABULUCULUK_TUR_ETIKET, ARABULUCULUK_TURLERI, type ArabuluculukSonucu, type ArabuluculukTuru } from '@/lib/konsrucu/arabuluculuk/sabitler'
import type { ArabuluculukUI } from '@/lib/konsrucu/arabuluculuk/veri'
import { anGoster, BirincilDugme, bugunIso, gunGoster, IkincilDugme, INP, Kart, KaynakRozeti, LBL, MaskeliMetin, Mesaj, useAksiyon } from './ortak'
import { SonTutanakOneri } from './son-tutanak-oneri'

export type ArabuluculukKartiProps = {
  dosyaId: string
  arabuluculuk: ArabuluculukUI | null
  toplantilar: { id: string; baslar: string; durum: string; sonucNot: string | null; yer: string | null; online: boolean }[]
  belgeler: { id: string; dosyaAdi: string; altTur: string | null }[]
  itirazEdenAdlari: string[]
  yetki: { yazabilir: boolean; avukat: boolean }
}

/** Elle açma / düzenleme formu. */
export function ArabuluculukKayitFormu({ dosyaId, arabuluculuk, avukat, onBitti }: { dosyaId: string; arabuluculuk: ArabuluculukUI | null; avukat: boolean; onBitti?: () => void }) {
  const { bekliyor, hata, bilgi, calistir } = useAksiyon()
  const [uyarilar, setUyarilar] = useState<string[]>([])
  const [tur, setTur] = useState<string>(arabuluculuk?.tur ?? '')
  function gonder(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget)
    const s = (k: string) => String(fd.get(k) ?? '').trim() || undefined
    calistir(
      () => arabuluculukKaydet({
        dosyaId, arabuluculukId: arabuluculuk?.id, tur: (avukat && tur ? tur : undefined) as ArabuluculukTuru | undefined, turGerekce: s('turGerekce'),
        basvuruTarihi: s('basvuruTarihi'), basvuruNo: s('basvuruNo'), buroNo: s('buroNo'), uyapDosyaNo: s('uyapDosyaNo'),
        arabulucu: s('arabulucu'), surecBaslangic: s('surecBaslangic'), konuMetni: s('konuMetni'),
      }),
      (r) => { setUyarilar(((r as unknown as { uyarilar?: string[] }).uyarilar) ?? []); onBitti?.(); return 'Arabuluculuk kaydı kaydedildi.' },
    )
  }
  return (
    <form onSubmit={gonder} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div><label className={LBL} htmlFor="ar-bno">Başvuru no</label><input id="ar-bno" name="basvuruNo" defaultValue={arabuluculuk?.basvuruNo ?? ''} className={`${INP} font-mono`} /></div>
      <div><label className={LBL} htmlFor="ar-btarih">Başvuru tarihi</label><input id="ar-btarih" type="date" name="basvuruTarihi" max={bugunIso()} defaultValue={arabuluculuk?.basvuruTarihi ?? ''} className={INP} /></div>
      <div><label className={LBL} htmlFor="ar-buro">Büro dosya no</label><input id="ar-buro" name="buroNo" defaultValue={arabuluculuk?.buroNo ?? ''} className={`${INP} font-mono`} /></div>
      <div><label className={LBL} htmlFor="ar-uyap">UYAP arabuluculuk no</label><input id="ar-uyap" name="uyapDosyaNo" defaultValue={arabuluculuk?.uyapDosyaNo ?? ''} placeholder="2026/…" className={`${INP} font-mono`} /></div>
      <div><label className={LBL} htmlFor="ar-arb">Arabulucu</label><input id="ar-arb" name="arabulucu" defaultValue={arabuluculuk?.arabulucu ?? ''} autoComplete="off" className={INP} /></div>
      <div><label className={LBL} htmlFor="ar-surec">Süreç başlangıcı</label><input id="ar-surec" type="date" name="surecBaslangic" max={bugunIso()} defaultValue={arabuluculuk?.surecBaslangic ?? ''} className={INP} /></div>
      {avukat && (
        <div className="sm:col-span-2">
          <span className={LBL}>Tür (avukat seçer · varsayılan yok)</span>
          <div className="flex flex-wrap gap-2">
            {ARABULUCULUK_TURLERI.map((t) => (
              <label key={t} className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-1.5 text-[12.5px] ${tur === t ? 'border-kr bg-kr-soft/50' : 'border-border-subtle'}`}>
                <input type="radio" name="tur" value={t} checked={tur === t} onChange={() => setTur(t)} className="accent-[hsl(var(--kr))]" /> {ARABULUCULUK_TUR_ETIKET[t]}
              </label>
            ))}
            {tur && <IkincilDugme onClick={() => setTur('')}>Seçimi kaldır</IkincilDugme>}
          </div>
        </div>
      )}
      <div className="sm:col-span-2"><label className={LBL} htmlFor="ar-konu">Uyuşmazlık konusu</label><textarea id="ar-konu" name="konuMetni" rows={2} defaultValue={arabuluculuk?.konuMetni ?? ''} className={`${INP} resize-y`} /></div>
      {hata && <div className="sm:col-span-2"><Mesaj tur="hata">{hata}</Mesaj></div>}
      {bilgi && <div className="sm:col-span-2"><Mesaj tur="ok">{bilgi}</Mesaj></div>}
      {uyarilar.map((u) => <div key={u} className="sm:col-span-2"><Mesaj tur="uyari">{u}</Mesaj></div>)}
      <div className="sm:col-span-2"><BirincilDugme type="submit" bekliyor={bekliyor}>{arabuluculuk ? 'Kaydı güncelle' : 'Arabuluculuk kaydını aç'}</BirincilDugme></div>
    </form>
  )
}

export function ArabuluculukKarti(p: ArabuluculukKartiProps) {
  const a = p.arabuluculuk
  const [duzenle, setDuzenle] = useState(false)
  const turA = useAksiyon()
  const topA = useAksiyon()
  const sonA = useAksiyon()
  const teyitA = useAksiyon()

  if (!a) {
    return (
      <Kart id="arabuluculuk" kicker="5 · Arabuluculuk" baslik="Arabuluculuk kaydı yok" alt="Başvuruyu yaptıysanız bilgileri buradan girin. Eklenti arabuluculuk dosyasını bulamazsa kayıt elle tutulur." sag={<Scale className="h-4 w-4 text-muted-foreground" />}>
        {p.yetki.yazabilir ? <ArabuluculukKayitFormu dosyaId={p.dosyaId} arabuluculuk={null} avukat={p.yetki.avukat} /> : <p className="text-[12.5px] text-muted-foreground">Kayıt açma yetkiniz yok.</p>}
      </Kart>
    )
  }

  const bugun = bugunIso()
  const sonucEt = a.sonuc ? ARABULUCULUK_SONUC_ETIKET[a.sonuc as ArabuluculukSonucu] ?? a.sonuc : null
  return (
    <Kart
      id="arabuluculuk"
      kicker="5 · Arabuluculuk"
      baslik={sonucEt ? `Sonuçlandı · ${sonucEt}` : 'Süreç devam ediyor'}
      sag={<div className="flex flex-wrap items-center gap-1.5"><KaynakRozeti teyit={a.teyit} kaynakTuru={a.kaynakTuru} />{a.onayAt && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10.5px] font-semibold text-success">onaylı</span>}</div>}
    >
      {a.teyit === 'ADAY' && p.yetki.avukat && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft/30 px-3 py-2 text-[12.5px]">
          <span>Bu kayıt {a.kaynakTuru === 'GERI_DOLDURMA' ? 'geri doldurmayla' : 'otomatik'} açıldı: bilgileri kontrol edip teyit edin.</span>
          <IkincilDugme bekliyor={teyitA.bekliyor} onClick={() => teyitA.calistir(() => kayitTeyit({ tablo: 'ARABULUCULUK', id: a.id, karar: 'TEYITLI' }))}>Teyit et</IkincilDugme>
          <IkincilDugme tehlike bekliyor={teyitA.bekliyor} onClick={() => teyitA.calistir(() => kayitTeyit({ tablo: 'ARABULUCULUK', id: a.id, karar: 'REDDEDILDI' }))}>Yanlış, kaldır</IkincilDugme>
          {teyitA.hata && <Mesaj tur="hata">{teyitA.hata}</Mesaj>}
        </div>
      )}

      {/* tür seçimi (AR-03) */}
      <div id="arabuluculuk-tur" className="mb-4">
        <span className={LBL}>Tür</span>
        {a.tur ? (
          <div className="text-[13px]"><b>{ARABULUCULUK_TUR_ETIKET[a.tur as ArabuluculukTuru] ?? a.tur}</b>{a.turGerekce ? <span className="text-muted-foreground"> · {a.turGerekce}</span> : null}</div>
        ) : (
          <Mesaj tur="uyari">Arabuluculuk dava şartı mı? Avukat seçer; belirsizse başvurmak güvenli yoldur (dava şartı değilse kayıp yok, dava şartıysa usulden ret önlenir).</Mesaj>
        )}
        {p.yetki.avukat && (
          <div className="mt-2 flex flex-wrap gap-2">
            {ARABULUCULUK_TURLERI.map((t) => (
              <IkincilDugme key={t} bekliyor={turA.bekliyor} disabled={a.tur === t} onClick={() => turA.calistir(() => arabuluculukTurSec({ arabuluculukId: a.id, tur: t }))}>{ARABULUCULUK_TUR_ETIKET[t]}</IkincilDugme>
            ))}
          </div>
        )}
        {turA.hata && <Mesaj tur="hata">{turA.hata}</Mesaj>}
      </div>

      {/* zaman çizgisi */}
      <ol className="mb-4 flex flex-col gap-1.5 border-l-2 border-border-subtle pl-3 text-[12.5px]">
        <li><b>Başvuru</b> {gunGoster(a.basvuruTarihi)} {a.basvuruNo && <span className="font-mono text-muted-foreground">· başvuru {a.basvuruNo}</span>} {a.buroNo && <span className="font-mono text-muted-foreground">· büro {a.buroNo}</span>} {a.uyapDosyaNo && <span className="font-mono text-muted-foreground">· UYAP {a.uyapDosyaNo}</span>}</li>
        {a.arabulucu && <li className="text-muted-foreground">Arabulucu: <MaskeliMetin deger={a.arabulucu} /></li>}
        {p.toplantilar.map((t) => {
          const gecti = t.baslar.slice(0, 10) < bugun && t.durum === 'PLANLANDI'
          return (
            <li key={t.id} id="arabuluculuk-toplanti" className={gecti ? 'text-[hsl(var(--warning-fg))]' : ''}>
              <b>Toplantı</b> {anGoster(t.baslar)} · {t.durum.toLocaleLowerCase('tr')}{t.sonucNot ? ` · ${t.sonucNot}` : ''}
              {gecti && p.yetki.yazabilir && (
                <span className="ml-2 inline-flex flex-wrap gap-1.5">
                  <IkincilDugme bekliyor={sonA.bekliyor} onClick={() => sonA.calistir(() => arabuluculukToplantiSonucu({ etkinlikId: t.id, durum: 'YAPILDI' }))}>Yapıldı</IkincilDugme>
                  <IkincilDugme bekliyor={sonA.bekliyor} onClick={() => sonA.calistir(() => arabuluculukToplantiSonucu({ etkinlikId: t.id, durum: 'YAPILMADI' }))}>Yapılmadı</IkincilDugme>
                </span>
              )}
            </li>
          )
        })}
        <li><b>Son tutanak</b> {a.sonTutanakTarihi ? `${gunGoster(a.sonTutanakTarihi)} · ${sonucEt ?? ''}${a.sonTutanakBelgeId ? ' · belge var' : ' · belge yok'}` : 'girilmedi'}</li>
      </ol>
      {sonA.hata && <Mesaj tur="hata">{sonA.hata}</Mesaj>}

      {p.yetki.yazabilir && !a.onayAt && (
        <form
          onSubmit={(ev) => {
            ev.preventDefault()
            const fd = new FormData(ev.currentTarget)
            topA.calistir(() => arabuluculukToplantiEkle({ arabuluculukId: a.id, baslar: String(fd.get('baslar') ?? ''), yer: String(fd.get('yer') ?? '') || undefined }), () => 'Toplantı eklendi.')
          }}
          className="mb-4 flex flex-wrap items-end gap-2 rounded-xl bg-surface-muted/40 p-3"
        >
          <div><label className={LBL} htmlFor="ar-top">Toplantı (tarih ve saat)</label><input id="ar-top" type="datetime-local" name="baslar" required className={`${INP} bg-surface`} /></div>
          <div className="min-w-[140px] flex-1"><label className={LBL} htmlFor="ar-yer">Yer</label><input id="ar-yer" name="yer" placeholder="büro / telekonferans" className={`${INP} bg-surface`} /></div>
          <IkincilDugme type="submit" bekliyor={topA.bekliyor}><CalendarPlus className="h-4 w-4" /> Toplantı ekle</IkincilDugme>
          {topA.hata && <Mesaj tur="hata">{topA.hata}</Mesaj>}
        </form>
      )}

      <SonTutanakOneri
        dosyaId={p.dosyaId}
        arabuluculukId={a.id}
        basvuruTarihi={a.basvuruTarihi}
        mevcut={{ tarih: a.sonTutanakTarihi, sonuc: a.sonuc, belgeId: a.sonTutanakBelgeId }}
        belgeler={p.belgeler}
        itirazEdenAdlari={p.itirazEdenAdlari}
        avukat={p.yetki.avukat}
      />

      {p.yetki.yazabilir && (
        <div className="mt-4 border-t border-border-subtle pt-3">
          <IkincilDugme onClick={() => setDuzenle((x) => !x)}>{duzenle ? 'Düzenlemeyi kapat' : 'Başvuru bilgilerini düzenle'}</IkincilDugme>
          {duzenle && <div className="mt-3"><ArabuluculukKayitFormu dosyaId={p.dosyaId} arabuluculuk={a} avukat={p.yetki.avukat} onBitti={() => setDuzenle(false)} /></div>}
        </div>
      )}
    </Kart>
  )
}
