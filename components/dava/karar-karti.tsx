'use client'

/**
 * KonsRücü — 8 SONUÇ · KARAR KARTI ve KANUN YOLU (S31; SN-01 … SN-05) · components/dava/karar-karti.tsx
 * Karar alanları yalnız avukat onayıyla yazılır. Kod rakamları karşılaştırır: kabul edilen tutar dava değerini aşarsa
 * KIRMIZI (onay için yazılı gerekçe). Onaydan sonra: takibe devam, istinaf (gerekçeli karar tebliğinden; yoksa
 * TETİK BEKLİYOR), İİK 78 notu, müvekkil bildirimi. Kanun yolu kararı müvekkilindir (OnayKaydi KANUN_YOLU).
 */
import { useMemo, useState } from 'react'
import { Landmark } from 'lucide-react'
import { gerekceliTebligKaydet, kararOnayla, kesinlesmeKaydet } from '@/app/(app)/dosya-islem/dava-actions'
import { yolSec } from '@/app/(app)/dosya-islem/arabuluculuk-actions'
import { kararKontrol } from '@/lib/konsrucu/dava/karar'
import { HUKUM_ETIKET, HUKUMLER, type Hukum } from '@/lib/konsrucu/dava/sabitler'
import { KARAR_SONRASI_ETIKET, KARAR_SONRASI_YOLLAR, type KararSonrasiYol } from '@/lib/konsrucu/arabuluculuk/sabitler'
import type { DavaUI } from '@/lib/konsrucu/dava/veri'
import { BirincilDugme, bugunIso, gunGoster, IkincilDugme, INP, Kart, LBL, Mesaj, paraGoster, useAksiyon } from '../arabuluculuk/ortak'

export type KararKartiProps = { dosyaId: string; dava: DavaUI; takipToplam: number | null; yetki: { yazabilir: boolean; avukat: boolean } }

const sayi = (s: string) => {
  const t = s.trim().replace(/\s|TL|₺/gi, '')
  if (!t) return null
  const n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function KararFormu({ dava, takipToplam }: { dava: DavaUI; takipToplam: number | null }) {
  const { bekliyor, hata, bilgi, calistir } = useAksiyon()
  const [f, setF] = useState({ kararTarihi: '', kararNo: '', hukum: '', kabulAsil: '', vekaletUcretiAleyhe: '', yargilamaGideriAleyhe: '', vekaletUcretiYon: '', kirmiziGerekce: '' })
  const [ek, setEk] = useState({ kabulFaizBaslangic: '', inkarTazminati: '', inkarTazminatiYon: '', yargilamaGideri: '', vekaletUcreti: '' })
  const uyarilar = useMemo(() => kararKontrol({
    hukum: f.hukum || null, kabulAsil: sayi(f.kabulAsil), davaDegeri: dava.davaDegeri, takipToplam,
    kararTarihi: f.kararTarihi ? new Date(`${f.kararTarihi}T00:00:00Z`) : null, vekaletUcretiAleyhe: sayi(f.vekaletUcretiAleyhe),
    yargilamaGideriAleyhe: sayi(f.yargilamaGideriAleyhe), vekaletUcretiYon: f.vekaletUcretiYon || null, inkarTazminatiYon: ek.inkarTazminatiYon || null,
  }), [f, ek.inkarTazminatiYon, dava.davaDegeri, takipToplam])
  const kirmizi = uyarilar.filter((u) => u.seviye === 'KIRMIZI' && u.kod !== 'KR-HUKUM' && u.kod !== 'KR-TARIH')
  const alan = (k: keyof typeof f, etiket: string, tip = 'text') => (
    <div><label className={LBL} htmlFor={`kr-${k}`}>{etiket}</label><input id={`kr-${k}`} type={tip} max={tip === 'date' ? bugunIso() : undefined} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={INP} inputMode={tip === 'text' && k !== 'kararNo' ? 'decimal' : undefined} /></div>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {alan('kararTarihi', 'Karar tarihi', 'date')}
        {alan('kararNo', 'Karar no')}
        <div><label className={LBL} htmlFor="kr-hukum">Hüküm</label>
          <select id="kr-hukum" value={f.hukum} onChange={(e) => setF({ ...f, hukum: e.target.value })} className={INP}>
            <option value="">Seçin</option>
            {HUKUMLER.map((h) => <option key={h} value={h}>{HUKUM_ETIKET[h]}</option>)}
          </select>
        </div>
        {alan('kabulAsil', 'Kabul edilen asıl alacak')}
        <div><label className={LBL} htmlFor="kr-kfb">Faiz başlangıcı</label><input id="kr-kfb" type="date" max={bugunIso()} value={ek.kabulFaizBaslangic} onChange={(e) => setEk({ ...ek, kabulFaizBaslangic: e.target.value })} className={INP} /></div>
        <div><label className={LBL} htmlFor="kr-inkar">İcra inkâr tazminatı</label><input id="kr-inkar" inputMode="decimal" value={ek.inkarTazminati} onChange={(e) => setEk({ ...ek, inkarTazminati: e.target.value })} className={INP} /></div>
        <div><label className={LBL} htmlFor="kr-inkyon">İnkâr tazminatı yönü</label>
          <select id="kr-inkyon" value={ek.inkarTazminatiYon} onChange={(e) => setEk({ ...ek, inkarTazminatiYon: e.target.value })} className={INP}><option value="">—</option><option value="LEHE">Lehe</option><option value="ALEYHE">Aleyhe</option></select>
        </div>
        <div><label className={LBL} htmlFor="kr-yg">Yargılama gideri (lehe)</label><input id="kr-yg" inputMode="decimal" value={ek.yargilamaGideri} onChange={(e) => setEk({ ...ek, yargilamaGideri: e.target.value })} className={INP} /></div>
        {alan('yargilamaGideriAleyhe', 'Yargılama gideri (aleyhe)')}
        <div><label className={LBL} htmlFor="kr-vu">Vekâlet ücreti (lehe)</label><input id="kr-vu" inputMode="decimal" value={ek.vekaletUcreti} onChange={(e) => setEk({ ...ek, vekaletUcreti: e.target.value })} className={INP} /></div>
        {alan('vekaletUcretiAleyhe', 'Vekâlet ücreti (aleyhe)')}
        <div><label className={LBL} htmlFor="kr-vyon">Vekâlet ücreti yönü</label>
          <select id="kr-vyon" value={f.vekaletUcretiYon} onChange={(e) => setF({ ...f, vekaletUcretiYon: e.target.value })} className={INP}><option value="">—</option><option value="LEHE">Lehe</option><option value="ALEYHE">Aleyhe</option><option value="IKI_YONLU">İki yönlü</option></select>
        </div>
      </div>
      <div className="text-[12px] text-muted-foreground">Dava değeri {paraGoster(dava.davaDegeri)} · takip toplamı {paraGoster(takipToplam)}</div>
      {uyarilar.filter((u) => u.seviye !== 'BILGI' || f.hukum).map((u) => <Mesaj key={u.kod} tur={u.seviye === 'KIRMIZI' ? 'hata' : u.seviye === 'SARI' ? 'uyari' : 'bilgi'}>{u.mesaj}</Mesaj>)}
      {kirmizi.length > 0 && (
        <div><label className={LBL} htmlFor="kr-kg">Kırmızı uyarıya rağmen onay için yazılı gerekçe</label><textarea id="kr-kg" rows={2} value={f.kirmiziGerekce} onChange={(e) => setF({ ...f, kirmiziGerekce: e.target.value })} className={`${INP} resize-y`} /></div>
      )}
      {hata && <Mesaj tur="hata">{hata}</Mesaj>}
      {bilgi && <Mesaj tur="ok">{bilgi}</Mesaj>}
      <div>
        <BirincilDugme bekliyor={bekliyor} disabled={!f.kararTarihi || !f.hukum} onClick={() => calistir(() => kararOnayla({
          davaId: dava.id, kararTarihi: f.kararTarihi, kararNo: f.kararNo || undefined, hukum: f.hukum, kabulAsil: f.kabulAsil || undefined,
          kabulFaizBaslangic: ek.kabulFaizBaslangic || undefined, inkarTazminati: ek.inkarTazminati || undefined, inkarTazminatiYon: ek.inkarTazminatiYon || undefined,
          yargilamaGideri: ek.yargilamaGideri || undefined, yargilamaGideriAleyhe: f.yargilamaGideriAleyhe || undefined, vekaletUcreti: ek.vekaletUcreti || undefined,
          vekaletUcretiAleyhe: f.vekaletUcretiAleyhe || undefined, vekaletUcretiYon: f.vekaletUcretiYon || undefined, kirmiziGerekce: f.kirmiziGerekce || undefined,
        }), () => 'Karar kartı onaylandı.')}>Kararı onayla</BirincilDugme>
      </div>
    </div>
  )
}

export function KararKarti({ dosyaId, dava: d, takipToplam, yetki }: KararKartiProps) {
  const [tebliğ, setTeblig] = useState('')
  const [kesin, setKesin] = useState('')
  const [yol, setYol] = useState<string>(d.kararSonrasiYol?.secim ?? '')
  const tA = useAksiyon(), kA = useAksiyon(), yA = useAksiyon()
  const k = d.karar
  if (!k.kararOnayAt) {
    return (
      <Kart id="karar-karti" kicker="8 · Sonuç" baslik="Karar kartı" sag={<Landmark className="h-4 w-4 text-muted-foreground" />} alt="Karar gelince hükmü ve tutarları girin; kod dava değeriyle karşılaştırır. Onaylanmadan hiçbir eksen ve para toplamı değişmez.">
        {yetki.avukat ? <KararFormu dava={d} takipToplam={takipToplam} /> : <p className="text-[12.5px] text-muted-foreground">Karar kartını yalnız avukat onaylar.</p>}
      </Kart>
    )
  }
  return (
    <Kart id="karar-karti" kicker="8 · Sonuç ve tahsil" baslik={`Karar ${gunGoster(k.kararTarihi)} · ${k.hukum ? HUKUM_ETIKET[k.hukum as Hukum] ?? k.hukum : ''}`} sag={<Landmark className="h-4 w-4 text-muted-foreground" />}>
      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-3">
        <div><dt className={LBL}>Kabul edilen asıl</dt><dd className="font-mono">{paraGoster(k.kabulAsil)} <span className="text-muted-foreground">(talep {paraGoster(d.davaDegeri)})</span></dd></div>
        <div><dt className={LBL}>Faiz başlangıcı</dt><dd className="font-mono">{gunGoster(k.kabulFaizBaslangic)}</dd></div>
        <div><dt className={LBL}>İnkâr tazminatı</dt><dd>{k.inkarTazminati != null ? `${paraGoster(k.inkarTazminati)} · ${k.inkarTazminatiYon ?? ''}` : 'yok'}</dd></div>
        <div><dt className={LBL}>Yargılama gideri</dt><dd className="font-mono">lehe {paraGoster(k.yargilamaGideri)} · aleyhe {paraGoster(k.yargilamaGideriAleyhe)}</dd></div>
        <div><dt className={LBL}>Vekâlet ücreti</dt><dd className="font-mono">lehe {paraGoster(k.vekaletUcreti)} · aleyhe {paraGoster(k.vekaletUcretiAleyhe)}</dd></div>
        <div><dt className={LBL}>Gerekçeli karar tebliği</dt><dd className="font-mono">{gunGoster(k.gerekceliTebligTarihi)}</dd></div>
      </dl>
      {d.kararUyarilari.map((u) => <div key={u.kod} className="mb-1.5"><Mesaj tur={u.seviye === 'KIRMIZI' ? 'hata' : u.seviye === 'SARI' ? 'uyari' : 'bilgi'}>{u.mesaj}</Mesaj></div>)}

      <div className="mt-3">
        <div className={LBL}>Sırada</div>
        <ul className="flex flex-col gap-1 text-[12.5px]">
          {d.kararSonrasi.map((a) => (
            <li key={a.kod}><b>{a.baslik}</b> <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${a.durum === 'TETIK_BEKLIYOR' ? 'bg-warning-soft text-[hsl(var(--warning-fg))]' : a.durum === 'BILGI' ? 'bg-surface-muted text-muted-foreground' : 'bg-kr-soft text-kr-ink'}`}>{a.durum === 'TETIK_BEKLIYOR' ? 'tetik bekliyor' : a.durum === 'BILGI' ? 'bilgi' : 'açık'}</span> <span className="text-muted-foreground">{a.aciklama}</span></li>
          ))}
        </ul>
      </div>

      {!k.gerekceliTebligTarihi && yetki.yazabilir && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-surface-muted/40 p-3">
          <div><label className={LBL} htmlFor="kr-gt">Gerekçeli karar tebliğ tarihi (SN-04)</label><input id="kr-gt" type="date" max={bugunIso()} min={k.kararTarihi ?? undefined} value={tebliğ} onChange={(e) => setTeblig(e.target.value)} className={`${INP} bg-surface`} /></div>
          <IkincilDugme bekliyor={tA.bekliyor} disabled={!tebliğ} onClick={() => tA.calistir(() => gerekceliTebligKaydet({ davaId: d.id, tarih: tebliğ }), () => 'Tebliğ tarihi kaydedildi; istinaf süresi önerildi (teyit gerekli).')}>Tebliğ tarihini kaydet</IkincilDugme>
          {tA.hata && <Mesaj tur="hata">{tA.hata}</Mesaj>}
          {tA.bilgi && <Mesaj tur="ok">{tA.bilgi}</Mesaj>}
        </div>
      )}

      {yetki.avukat && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border-subtle p-3">
          <span className={LBL}>Takibe devam / kanun yolu (SN-02 · müvekkil onayı)</span>
          <div className="flex flex-wrap gap-2">
            {KARAR_SONRASI_YOLLAR.map((y) => (
              <label key={y} className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-1.5 text-[12.5px] ${yol === y ? 'border-kr bg-kr-soft/50' : 'border-border-subtle'}`}>
                <input type="radio" name={`ks-${d.id}`} checked={yol === y} onChange={() => setYol(y)} className="accent-[hsl(var(--kr))]" /> {KARAR_SONRASI_ETIKET[y as KararSonrasiYol]}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <IkincilDugme bekliyor={yA.bekliyor} disabled={!yol} onClick={() => yA.calistir(() => yolSec({ dosyaId, asama: 'KARAR_SONRASI', secim: yol, davaId: d.id }), () => 'Seçim kaydedildi.')}>Seçimi kaydet</IkincilDugme>
            <span className={`text-[11.5px] ${d.kanunYoluKapisi.acik ? 'text-success' : 'text-[hsl(var(--warning-fg))]'}`}>{d.kanunYoluKapisi.acik ? 'Kanun yolu için müvekkil onayı kayıtlı.' : `Kanun yolu dilekçesi imzaya hazır olamaz: ${d.kanunYoluKapisi.mesaj}`}</span>
          </div>
          {yA.hata && <Mesaj tur="hata">{yA.hata}</Mesaj>}
        </div>
      )}

      {yetki.avukat && !k.kesinlesmeTarihi && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div><label className={LBL} htmlFor="kr-ks">Kesinleşme tarihi (şerhle)</label><input id="kr-ks" type="date" max={bugunIso()} value={kesin} onChange={(e) => setKesin(e.target.value)} className={INP} /></div>
          <IkincilDugme bekliyor={kA.bekliyor} disabled={!kesin} onClick={() => kA.calistir(() => kesinlesmeKaydet({ davaId: d.id, tarih: kesin }), () => 'Kesinleşme kaydedildi.')}>Kesinleşmeyi kaydet</IkincilDugme>
          {kA.hata && <Mesaj tur="hata">{kA.hata}</Mesaj>}
        </div>
      )}
    </Kart>
  )
}
