'use client'

/**
 * KonsRücü — MÜVEKKİL ONAYI kartı (AR-02; B16) · components/arabuluculuk/onay-kaydi.tsx
 * Onay talebi taslağı (yapay zekâsız) kopyalanır ve ELLE gönderilir; avukat "gönderildi" işaretler. Müvekkilin
 * kararı (ONAY/RET, tarih, unvan, tutar sınırı) kayda geçer. İhtiyatlı İİK 67 son güne ≤ 14 gün kaldıysa süre koruma
 * istisnası yazılı gerekçeyle kullanılabilir (açık karar 4).
 */
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { musteriBildirimiGonderildi, onayIstisnasiKaydet, onayKaydiKaydet } from '@/app/(app)/dosya-islem/arabuluculuk-actions'
import { ONAY_SONUC_ETIKET, ONAY_TUR_ETIKET, ONAY_TURLERI, type OnaySonucu, type OnayTuru } from '@/lib/konsrucu/arabuluculuk/sabitler'
import { BirincilDugme, bugunIso, gunGoster, IkincilDugme, INP, Kart, KopyaDugmesi, LBL, Mesaj, paraGoster, useAksiyon } from './ortak'

export type OnayKaydiKartiProps = {
  dosyaId: string
  onaylar: { id: string; tur: string; sonuc: string; istenmeAt: string | null; alinmaAt: string | null; onaylayanUnvan: string | null; tutar: number | null; istisnaGerekce: string | null }[]
  onayKapisi: { acik: boolean; neden: string; mesaj: string | null; istisnaMumkun: boolean; kalanGun: number | null }
  gerekenOnayTuru: OnayTuru | null
  onayTaslagi: string | null
  yetki: { yazabilir: boolean; avukat: boolean }
}

export function OnayKaydiKarti(p: OnayKaydiKartiProps) {
  const [tur, setTur] = useState<string>(p.gerekenOnayTuru ?? '')
  const [sonuc, setSonuc] = useState<OnaySonucu | ''>('')
  const [taslakAcik, setTaslakAcik] = useState(false)
  const [istisnaTaslak, setIstisnaTaslak] = useState<string | null>(null)
  const kayit = useAksiyon()
  const istisna = useAksiyon()
  const bildirim = useAksiyon()

  function kaydet(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget)
    const s = (k: string) => String(fd.get(k) ?? '').trim() || undefined
    kayit.calistir(() => onayKaydiKaydet({ dosyaId: p.dosyaId, tur, sonuc, istenmeTarihi: s('istenme'), alinmaTarihi: s('alinma'), onaylayanUnvan: s('unvan'), tutar: s('tutar') }), () => 'Onay kaydı eklendi.')
  }
  function istisnaKaydet(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const gerekce = String(new FormData(ev.currentTarget).get('gerekce') ?? '')
    istisna.calistir(() => onayIstisnasiKaydet({ dosyaId: p.dosyaId, gerekce }), (r) => { setIstisnaTaslak((r as unknown as { bildirimTaslagi: string }).bildirimTaslagi); return 'İstisna kayda geçti. Müvekkile bildirim taslağını gönderin.' })
  }

  const k = p.onayKapisi
  return (
    <Kart id="onay-kaydi" kicker="Müvekkil onayı" baslik={k.acik ? (k.neden === 'ISTISNA' ? 'Süre koruma istisnasıyla açık' : 'Onay kayıtlı') : 'Onay bekleniyor'} vurgu={k.acik ? undefined : 'uyari'} sag={<ShieldCheck className={`h-4 w-4 ${k.acik ? 'text-success' : 'text-[hsl(var(--warning-fg))]'}`} />}
      alt="Dava açma, takibi bırakma, sulh/iskonto ve kanun yolu kararı müvekkilindir. Program göndermez; taslağı siz gönderirsiniz.">
      {!k.acik && k.mesaj && <div className="mb-3"><Mesaj tur="uyari">{k.mesaj}</Mesaj></div>}

      {p.onayTaslagi && (
        <div className="mb-4 rounded-xl border border-border-subtle bg-surface-muted/40 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className={LBL}>Onay talebi taslağı ({p.gerekenOnayTuru ? ONAY_TUR_ETIKET[p.gerekenOnayTuru] : '—'})</span>
            <div className="flex gap-2">
              <IkincilDugme onClick={() => setTaslakAcik((x) => !x)}>{taslakAcik ? 'Gizle' : 'Taslağı aç'}</IkincilDugme>
              <KopyaDugmesi metin={p.onayTaslagi} />
              {p.yetki.avukat && <IkincilDugme bekliyor={bildirim.bekliyor} onClick={() => bildirim.calistir(() => musteriBildirimiGonderildi({ dosyaId: p.dosyaId, konu: 'ONAY_TALEBI' }), () => 'Gönderildi olarak işaretlendi.')}>Gönderildi</IkincilDugme>}
            </div>
          </div>
          {taslakAcik && <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-[12px] leading-[1.5]">{p.onayTaslagi}</pre>}
          {bildirim.hata && <Mesaj tur="hata">{bildirim.hata}</Mesaj>}
          {bildirim.bilgi && <Mesaj tur="ok">{bildirim.bilgi}</Mesaj>}
        </div>
      )}

      {p.onaylar.length > 0 && (
        <ul className="mb-4 flex flex-col gap-1.5">
          {p.onaylar.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border-subtle px-3 py-2 text-[12.5px]">
              <b>{ONAY_TUR_ETIKET[o.tur as OnayTuru] ?? o.tur}</b>
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${o.sonuc === 'ONAY' ? 'bg-success-soft text-success' : o.sonuc === 'RET' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-[hsl(var(--warning-fg))]'}`}>{ONAY_SONUC_ETIKET[o.sonuc as OnaySonucu] ?? o.sonuc}</span>
              {o.alinmaAt && <span className="text-muted-foreground">{gunGoster(o.alinmaAt)}</span>}
              {o.onaylayanUnvan && <span className="text-muted-foreground">· {o.onaylayanUnvan}</span>}
              {o.tutar != null && <span className="font-mono text-muted-foreground">· sınır {paraGoster(o.tutar)}</span>}
              {o.istisnaGerekce && <span className="text-[11.5px] text-[hsl(var(--warning-fg))]">· istisna: {o.istisnaGerekce}</span>}
            </li>
          ))}
        </ul>
      )}

      {p.yetki.avukat ? (
        <form onSubmit={kaydet} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={LBL} htmlFor="ok-tur">Onay türü</label>
            <select id="ok-tur" value={tur} onChange={(e) => setTur(e.target.value)} className={INP} required>
              <option value="">Seçin</option>
              {ONAY_TURLERI.map((t) => <option key={t} value={t}>{ONAY_TUR_ETIKET[t]}</option>)}
            </select>
          </div>
          <div><label className={LBL} htmlFor="ok-sonuc">Müvekkil kararı</label>
            <select id="ok-sonuc" value={sonuc} onChange={(e) => setSonuc(e.target.value as OnaySonucu)} className={INP} required>
              <option value="">Seçin</option>
              <option value="BEKLIYOR">Talep gönderildi, bekleniyor</option>
              <option value="ONAY">Onay verdi</option>
              <option value="RET">Reddetti</option>
            </select>
          </div>
          <div><label className={LBL} htmlFor="ok-istenme">Talep tarihi</label><input id="ok-istenme" type="date" name="istenme" max={bugunIso()} className={INP} /></div>
          <div><label className={LBL} htmlFor="ok-alinma">Karar tarihi</label><input id="ok-alinma" type="date" name="alinma" max={bugunIso()} className={INP} required={sonuc === 'ONAY' || sonuc === 'RET'} /></div>
          <div><label className={LBL} htmlFor="ok-unvan">Onayı veren unvan</label><input id="ok-unvan" name="unvan" placeholder="ör. Rücu Birim Müdürü" className={INP} /></div>
          <div><label className={LBL} htmlFor="ok-tutar">Tutar sınırı (sulh/avans)</label><input id="ok-tutar" name="tutar" inputMode="decimal" placeholder="1.000.000,00" className={INP} /></div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <BirincilDugme type="submit" bekliyor={kayit.bekliyor} disabled={!tur || !sonuc}>Onay kaydını ekle</BirincilDugme>
          </div>
          {kayit.hata && <div className="sm:col-span-2"><Mesaj tur="hata">{kayit.hata}</Mesaj></div>}
          {kayit.bilgi && <div className="sm:col-span-2"><Mesaj tur="ok">{kayit.bilgi}</Mesaj></div>}
        </form>
      ) : (
        <p className="text-[12px] text-muted-foreground">Onay kaydını yalnız avukat girer.</p>
      )}

      {!k.acik && k.istisnaMumkun && p.yetki.avukat && (
        <form onSubmit={istisnaKaydet} className="mt-4 flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft/30 p-3">
          <span className="text-[12.5px] font-semibold">Süre koruma istisnası · ihtiyatlı son güne {k.kalanGun} gün kaldı</span>
          <label className={LBL} htmlFor="ok-istisna">Yazılı gerekçe (kayda geçer, müvekkile bildirilir)</label>
          <textarea id="ok-istisna" name="gerekce" rows={2} required minLength={10} className={`${INP} resize-y bg-surface`} />
          <div><IkincilDugme type="submit" bekliyor={istisna.bekliyor}>İstisnayla ön kontrolü aç</IkincilDugme></div>
          {istisna.hata && <Mesaj tur="hata">{istisna.hata}</Mesaj>}
          {istisna.bilgi && <Mesaj tur="ok">{istisna.bilgi}</Mesaj>}
          {istisnaTaslak && (
            <div className="rounded-lg bg-surface p-3">
              <div className="mb-1 flex justify-end"><KopyaDugmesi metin={istisnaTaslak} /></div>
              <pre className="whitespace-pre-wrap text-[12px]">{istisnaTaslak}</pre>
            </div>
          )}
        </form>
      )}
    </Kart>
  )
}
