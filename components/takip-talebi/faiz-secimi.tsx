'use client'

/**
 * KonsRücü — Faiz türü, oranı ve başlangıcı seçimi (S21; 06 §2(c); B26).
 * VARSAYILAN YOK: hiçbir seçenek önceden işaretli gelmez; seçilmeden takip talebi kilitli kalır.
 * Faiz türü tarafların tacir olup olmadığına ve işin niteliğine bağlıdır — teyit gerekli; karar avukatındır.
 * Talep cümlesi seçimden canlı kurulur; "%......" boşluğu hiçbir zaman oluşmaz.
 *
 * Props:
 *   dosyaId, deger (kayıtlı seçim), avukat (yalnız avukat/yönetici değiştirir), dondurulmus (tevzide donduruldu → yeni sürüm uyarısı)
 *   onKaydedildi — kayıttan sonra (panel yeniden yükler)
 */
import { useMemo, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { faizSeciminiKaydet } from '@/app/(app)/dosya-islem/takip-talebi-actions'
import {
  FAIZ_BASLANGIC_ETIKET, FAIZ_TURU_ETIKET, ORAN_DEGISEN, faizSecimiEksikleri, faizTalepMetni, kopilotFaizDestekli, oranCoz,
  type FaizBaslangicTuru, type FaizTuru,
} from '@/lib/konsrucu/senkron/takip-talebi'

export type FaizSecimiDegeri = { faizTuru: string | null; faizOraniMetni: string | null; faizBaslangicTuru: string | null; faizBaslangic: string | null }

const RADYO = 'h-4 w-4 accent-kr focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const INP = 'rounded-[9px] border border-input bg-background px-2.5 py-1.5 text-[14px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'

export function FaizSecimi({ dosyaId, deger, avukat, dondurulmus = false, onKaydedildi }: {
  dosyaId: string
  deger: FaizSecimiDegeri
  avukat: boolean
  dondurulmus?: boolean
  onKaydedildi?: () => void
}) {
  const baslangicOran = oranCoz(deger.faizOraniMetni)
  const [tur, setTur] = useState<FaizTuru | null>((deger.faizTuru as FaizTuru) ?? null)
  const [oranTipi, setOranTipi] = useState<'DEGISEN' | 'YUZDE' | null>(baslangicOran?.tip ?? null)
  const [yuzde, setYuzde] = useState(baslangicOran?.tip === 'YUZDE' ? String(baslangicOran.yuzde).replace('.', ',') : '')
  const [basTuru, setBasTuru] = useState<FaizBaslangicTuru | null>((deger.faizBaslangicTuru as FaizBaslangicTuru) ?? null)
  const [basTarih, setBasTarih] = useState(deger.faizBaslangic ?? '')
  const [pending, start] = useTransition()
  const [mesaj, setMesaj] = useState<{ tur: 'ok' | 'hata'; metin: string } | null>(null)

  const secim = useMemo(() => ({
    faizTuru: tur,
    faizOraniMetni: tur === 'DIGER' || oranTipi === 'YUZDE' ? (yuzde.trim() ? `%${yuzde.trim()}` : null) : oranTipi === 'DEGISEN' ? ORAN_DEGISEN : null,
    faizBaslangicTuru: basTuru,
    faizBaslangic: basTuru === 'TEK_TARIH' ? basTarih || null : null,
  }), [tur, oranTipi, yuzde, basTuru, basTarih])
  const eksik = faizSecimiEksikleri(secim)
  const talep = faizTalepMetni(secim)
  const kopilotOlur = kopilotFaizDestekli(secim)

  function kaydet() {
    setMesaj(null)
    if (eksik.length) { setMesaj({ tur: 'hata', metin: eksik.join('; ') }); return }
    start(async () => {
      const r = await faizSeciminiKaydet({ dosyaId, faizTuru: secim.faizTuru!, faizOraniMetni: secim.faizOraniMetni!, faizBaslangicTuru: secim.faizBaslangicTuru!, faizBaslangic: secim.faizBaslangic })
      if (!r.ok) setMesaj({ tur: 'hata', metin: r.error ?? 'Kaydedilemedi' })
      else { setMesaj({ tur: 'ok', metin: r.bilgi ?? 'Kaydedildi' }); onKaydedildi?.() }
    })
  }

  const kilitli = !avukat || pending

  return (
    <fieldset className="rounded-2xl border border-border bg-card p-4" disabled={kilitli}>
      <legend className="px-1 font-display text-[15px] font-bold text-foreground">Faiz türü, oranı ve başlangıcı</legend>
      <p className="text-[12.5px] text-muted-foreground">
        Varsayılan yoktur. Faiz türü tarafların tacir olup olmadığına ve işin niteliğine bağlıdır (teyit gerekli); seçim avukatındır.
        {!avukat && ' Bu seçimi yalnız avukat ya da yönetici yapar.'}
      </p>

      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <div role="radiogroup" aria-label="Faiz türü" className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-foreground">Faiz türü</span>
          {(['YASAL', 'AVANS', 'DIGER'] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 text-[14px]">
              <input type="radio" name={`faiz-turu-${dosyaId}`} className={RADYO} checked={tur === t} onChange={() => { setTur(t); if (t === 'DIGER') setOranTipi('YUZDE') }} />
              {FAIZ_TURU_ETIKET[t]}
            </label>
          ))}
        </div>

        <div role="radiogroup" aria-label="Faiz oranı" className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-foreground">Oran</span>
          <label className={`flex items-center gap-2 text-[14px] ${tur === 'DIGER' ? 'opacity-50' : ''}`}>
            <input type="radio" name={`faiz-oran-${dosyaId}`} className={RADYO} disabled={tur === 'DIGER'} checked={oranTipi === 'DEGISEN' && tur !== 'DIGER'} onChange={() => setOranTipi('DEGISEN')} />
            Değişen oranlarda
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="radio" name={`faiz-oran-${dosyaId}`} className={RADYO} checked={oranTipi === 'YUZDE' || tur === 'DIGER'} onChange={() => setOranTipi('YUZDE')} />
            Yıllık
            <input aria-label="Yıllık faiz oranı (yüzde)" value={yuzde} onChange={(e) => { setYuzde(e.target.value.replace(/[^\d,]/g, '').slice(0, 7)); setOranTipi('YUZDE') }} placeholder="örn. 24" className={`${INP} font-mono w-20 text-right`} inputMode="decimal" />
            %
          </label>
        </div>

        <div role="radiogroup" aria-label="Faiz başlangıcı" className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-foreground">Başlangıç</span>
          {(['HER_ODEMEDEN', 'TEK_TARIH'] as const).map((b) => (
            <label key={b} className="flex items-center gap-2 text-[14px]">
              <input type="radio" name={`faiz-bas-${dosyaId}`} className={RADYO} checked={basTuru === b} onChange={() => setBasTuru(b)} />
              {FAIZ_BASLANGIC_ETIKET[b]}
              {b === 'TEK_TARIH' && (
                <input type="date" aria-label="Faiz başlangıç tarihi" value={basTarih} onChange={(e) => { setBasTarih(e.target.value); setBasTuru('TEK_TARIH') }} className={`${INP} font-mono`} />
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-[10px] bg-surface-muted/60 px-3 py-2">
        <div className="text-[12px] font-semibold text-muted-foreground">Takip talebindeki faiz cümlesi</div>
        <p className="mt-0.5 text-[13.5px] text-foreground">{talep ?? <span className="text-muted-foreground">Seçim tamamlanınca burada görünür. Eksik: {eksik.join(', ')}.</span>}</p>
        {talep && !kopilotOlur && (
          <p className="mt-1 text-[12.5px] text-warning">Kopilot bu seçimi UYAP&apos;a aktaramaz (UYAP kodu keşifle teyit edilmedi). Takibi UYAP&apos;ta elle açın ve faiz türünü elle seçin.</p>
        )}
        {talep && kopilotOlur && <p className="mt-1 text-[12.5px] text-muted-foreground">UYAP faiz türü: Adi Kanuni Faiz (değişen oranlarda) — teyit gerekli.</p>}
      </div>

      {avukat && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={kaydet} disabled={pending || eksik.length > 0} className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-background px-3.5 py-1.5 text-[13.5px] font-semibold text-foreground transition hover:border-kr/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
            {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />} Faizi kaydet
          </button>
          {dondurulmus && <span className="text-[12px] text-muted-foreground">Takip talebi tevzide donduruldu; kayıt yeni sürüm olarak açılır.</span>}
          {mesaj && <span role={mesaj.tur === 'hata' ? 'alert' : 'status'} className={`text-[12.5px] ${mesaj.tur === 'hata' ? 'text-danger' : 'text-success'}`}>{mesaj.metin}</span>}
        </div>
      )}
    </fieldset>
  )
}
