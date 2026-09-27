'use client'

/**
 * KonsRücü — SON TUTANAK: sürükle → öneri → onay (AR-06, AR-07, AR-09; B02) · components/arabuluculuk/son-tutanak-oneri.tsx
 *
 * Tutanak metni TARAYICIDA çıkarılır (lib/konsrucu/evrak-cikar) ve kural katmanıyla (lib/konsrucu/arabuluculuk/son-tutanak)
 * tarih ve sonuç ALINTIYLA önerilir; metin AI'a gitmez. Tarih alanının varsayılanı YOKTUR ("bugün" alınmaz), ileri tarih
 * seçilemez. Avukat "Son tutanağı onayla" deyince durma işlenir ve İİK 67 onaylanan günü yeniden onaya düşer.
 */
import { useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { sonTutanakBelgesiEkle, sonTutanakOnayla } from '@/app/(app)/dosya-islem/arabuluculuk-actions'
import { karsiTarafUyumu, sonTutanakOnerisi, type SonTutanakOnerisi } from '@/lib/konsrucu/arabuluculuk/son-tutanak'
import { ARABULUCULUK_SONUC_ETIKET, ARABULUCULUK_SONUCLARI, type ArabuluculukSonucu } from '@/lib/konsrucu/arabuluculuk/sabitler'
import { createClient } from '@/lib/supabase/client'
import { BirincilDugme, bugunIso, gunGoster, IkincilDugme, INP, LBL, Mesaj, useAksiyon } from './ortak'

export type SonTutanakOneriProps = {
  dosyaId: string
  arabuluculukId: string
  basvuruTarihi: string | null
  mevcut: { tarih: string | null; sonuc: string | null; belgeId: string | null }
  belgeler: { id: string; dosyaAdi: string; altTur: string | null }[]
  itirazEdenAdlari: string[]
  avukat: boolean
}

export function SonTutanakOneri(p: SonTutanakOneriProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [hot, setHot] = useState(false)
  const [okuyor, setOkuyor] = useState(false)
  const [oneri, setOneri] = useState<SonTutanakOnerisi | null>(null)
  const [dosya, setDosya] = useState<{ file: File; metin: string | null } | null>(null)
  const [uyum, setUyum] = useState<string | null>(null)
  const [tarih, setTarih] = useState<string>(p.mevcut.tarih ?? '') // varsayılan YOK: yalnız kayıtlı değer ya da öneri
  const [sonuc, setSonuc] = useState<string>(p.mevcut.sonuc ?? '')
  const [belgeId, setBelgeId] = useState<string>(p.mevcut.belgeId ?? '')
  const [ek, setEk] = useState<{ katilmayan: string; anlasilan: string; anlasilmayan: string }>({ katilmayan: '', anlasilan: '', anlasilmayan: '' })
  const [okumaHata, setOkumaHata] = useState<string | null>(null)
  const ekle = useAksiyon()
  const onay = useAksiyon()
  const [durmaBilgi, setDurmaBilgi] = useState<string[] | null>(null)

  async function oku(list: FileList | null) {
    const f = list?.[0]
    if (!f) return
    setOkuyor(true); setOkumaHata(null); setOneri(null); setUyum(null)
    try {
      const { evrakCikar } = await import('@/lib/konsrucu/evrak-cikar')
      const [b] = await evrakCikar([f])
      const metin = b?.extractedText ?? ''
      const o = sonTutanakOnerisi(metin)
      setOneri(o)
      setDosya({ file: f, metin: metin || null })
      if (o.tarih && !tarih) setTarih(o.tarih.deger)
      if (o.sonuc && !sonuc) setSonuc(o.sonuc.deger)
      const k = karsiTarafUyumu(metin, p.itirazEdenAdlari)
      setUyum(k.uyari)
    } catch (e) {
      setOkumaHata(`Belge okunamadı: ${(e as Error).message}`)
    } finally {
      setOkuyor(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function belgeyiEkle() {
    if (!dosya) return
    ekle.calistir(async () => {
      const supa = createClient()
      const guvenli = dosya.file.name.replace(/[^\w.\-]+/g, '_').slice(0, 80)
      const yol = `${p.dosyaId}/${crypto.randomUUID()}-${guvenli}`
      const { error } = await supa.storage.from('evrak').upload(yol, dosya.file, { contentType: dosya.file.type || 'application/octet-stream', upsert: false })
      const r = await sonTutanakBelgesiEkle(p.dosyaId, { dosyaAdi: dosya.file.name, storagePath: error ? '' : yol, extractedText: dosya.metin })
      if (r.ok) setBelgeId(r.belgeId)
      return r
    }, () => 'Belge dosyaya eklendi ve tutanağa bağlandı.')
  }

  function onayla() {
    onay.calistir(
      () => sonTutanakOnayla({
        arabuluculukId: p.arabuluculukId, sonTutanakTarihi: tarih, sonuc, sonTutanakBelgeId: belgeId || undefined,
        katilmayanTaraf: ek.katilmayan || undefined, anlasilanKalemler: ek.anlasilan || undefined, anlasilmayanKalemler: ek.anlasilmayan || undefined,
      }),
      (r) => {
        const x = r as unknown as { durma: { gun: number; sayildi: boolean } | null; yenidenOnay: number; uyarilar: string[] }
        setDurmaBilgi([
          x.durma ? `Durma: ${x.durma.gun} gün${x.durma.sayildi ? '' : ' (sayılmadı)'}` : 'Durma hesaplanmadı',
          x.yenidenOnay ? `${x.yenidenOnay} İİK 67 kaydı yeniden onay bekliyor (ihtiyatlı gün değişmedi).` : '',
          ...x.uyarilar,
        ].filter(Boolean))
        return 'Son tutanak onaylandı.'
      },
    )
  }

  const tutanaklar = [...p.belgeler].sort((a, b) => (b.altTur === 'ARB_SON_TUTANAK' ? 1 : 0) - (a.altTur === 'ARB_SON_TUTANAK' ? 1 : 0))
  return (
    <div id="son-tutanak" className="flex flex-col gap-3">
      <input ref={inputRef} type="file" accept=".pdf,.udf,.docx,.txt,image/*" className="hidden" onChange={(e) => oku(e.target.files)} />
      <div
        role="button"
        tabIndex={0}
        onClick={() => !okuyor && inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        onDragOver={(e) => { e.preventDefault(); setHot(true) }}
        onDragLeave={() => setHot(false)}
        onDrop={(e) => { e.preventDefault(); setHot(false); if (!okuyor) oku(e.dataTransfer.files) }}
        className={`flex items-center gap-3 rounded-[12px] border-[1.5px] border-dashed px-4 py-3 transition motion-reduce:transition-none ${hot ? 'border-kr bg-kr-soft' : 'border-border bg-surface-muted hover:border-kr/50'} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50`}
      >
        {okuyor ? <Loader2 className="h-5 w-5 animate-spin text-kr-ink" /> : <FileUp className="h-5 w-5 text-muted-foreground" />}
        <div className="text-[12.5px]">
          <div className="font-semibold">Son tutanağı buraya sürükleyin</div>
          <div className="text-muted-foreground">Metin tarayıcıda okunur; tarih ve sonuç öneri olarak gelir. Hiçbir alan kendiliğinden kaydedilmez.</div>
        </div>
      </div>
      {okumaHata && <Mesaj tur="hata">{okumaHata}</Mesaj>}
      {oneri && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border-subtle bg-surface-muted/40 p-3 text-[12.5px]">
          <div className={LBL}>Öneri (belgeden, alıntılı)</div>
          {oneri.tarih && <div><b>Tarih:</b> {gunGoster(oneri.tarih.deger)} · <span className="italic text-muted-foreground">"{oneri.tarih.alinti.metin}"</span></div>}
          {oneri.sonuc && <div><b>Sonuç:</b> {ARABULUCULUK_SONUC_ETIKET[oneri.sonuc.deger]} · <span className="italic text-muted-foreground">"{oneri.sonuc.alinti.metin}"</span></div>}
          {oneri.arabuluculukNo && <div><b>Arabuluculuk no:</b> <span className="font-mono">{oneri.arabuluculukNo.deger}</span></div>}
          {oneri.uyarilar.map((u) => <Mesaj key={u} tur="uyari">{u}</Mesaj>)}
          {uyum && <Mesaj tur="uyari">{uyum}</Mesaj>}
          {dosya && !belgeId && <div><IkincilDugme bekliyor={ekle.bekliyor} onClick={belgeyiEkle}>Belgeyi dosyaya ekle</IkincilDugme></div>}
          {ekle.hata && <Mesaj tur="hata">{ekle.hata}</Mesaj>}
          {ekle.bilgi && <Mesaj tur="ok">{ekle.bilgi}</Mesaj>}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={LBL} htmlFor="st-tarih">Son tutanak tarihi</label>
          <input id="st-tarih" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} min={p.basvuruTarihi ?? undefined} max={bugunIso()} className={INP} disabled={!p.avukat} />
        </div>
        <div>
          <label className={LBL} htmlFor="st-sonuc">Sonuç</label>
          <select id="st-sonuc" value={sonuc} onChange={(e) => setSonuc(e.target.value)} className={INP} disabled={!p.avukat}>
            <option value="">Seçin</option>
            {ARABULUCULUK_SONUCLARI.map((s) => <option key={s} value={s}>{ARABULUCULUK_SONUC_ETIKET[s as ArabuluculukSonucu]}</option>)}
          </select>
        </div>
        <div>
          <label className={LBL} htmlFor="st-belge">Tutanak belgesi</label>
          <select id="st-belge" value={belgeId} onChange={(e) => setBelgeId(e.target.value)} className={INP} disabled={!p.avukat}>
            <option value="">Bağlanmadı</option>
            {tutanaklar.map((b) => <option key={b.id} value={b.id}>{b.dosyaAdi}</option>)}
          </select>
        </div>
      </div>
      {sonuc === 'KATILMAMA' && (
        <div><label className={LBL} htmlFor="st-katilmayan">Katılmayan taraf</label><input id="st-katilmayan" value={ek.katilmayan} onChange={(e) => setEk({ ...ek, katilmayan: e.target.value })} className={INP} disabled={!p.avukat} /></div>
      )}
      {sonuc === 'KISMEN' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className={LBL} htmlFor="st-anl">Anlaşılan kalemler</label><textarea id="st-anl" rows={2} value={ek.anlasilan} onChange={(e) => setEk({ ...ek, anlasilan: e.target.value })} className={`${INP} resize-y`} disabled={!p.avukat} /></div>
          <div><label className={LBL} htmlFor="st-anlm">Anlaşılmayan kalemler (dava bunlarla sınırlı)</label><textarea id="st-anlm" rows={2} value={ek.anlasilmayan} onChange={(e) => setEk({ ...ek, anlasilmayan: e.target.value })} className={`${INP} resize-y`} disabled={!p.avukat} /></div>
        </div>
      )}
      {onay.hata && <Mesaj tur="hata">{onay.hata}</Mesaj>}
      {onay.bilgi && <Mesaj tur="ok">{onay.bilgi}</Mesaj>}
      {durmaBilgi && durmaBilgi.map((d) => <Mesaj key={d} tur="bilgi">{d}</Mesaj>)}
      <div className="flex flex-wrap items-center gap-3">
        <BirincilDugme onClick={onayla} bekliyor={onay.bekliyor} disabled={!p.avukat || !tarih || !sonuc}>Son tutanağı onayla</BirincilDugme>
        {!p.avukat && <span className="text-[11.5px] text-muted-foreground">Son tutanağı yalnız avukat onaylar.</span>}
      </div>
    </div>
  )
}
