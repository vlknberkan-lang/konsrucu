'use client'

/**
 * KonsRücü — Veri Onarımı istemci eylemleri · app/(app)/yonetim/veri-onarim/onarim-eylemleri.tsx
 *  - OnarimSatirKarari: satır başına [Onayla] [Reddet] [Sonra] + gerekçe; R1'de "örnek teyidi" işareti.
 *  - OnarimPartiEylemleri: [Onaylananları uygula] (birincil), [Partiyi geri al], R1 toplu onay.
 *  - KuruListeOlustur: canlı veriden R0 / R1 / R2 kuru partileri üretir (veriye dokunmaz).
 */
import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, PlayCircle, RotateCcw, X, Clock, ListChecks, DatabaseZap } from 'lucide-react'
import {
  onarimKuruListe, onarimPartiGeriAl, onarimPartiUygula, onarimSatirGeriAl, onarimSatirKarari, onarimTopluOnay, type OnarimSonuc,
} from './actions'

const BTN_BIRINCIL = 'inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30 disabled:opacity-60'
const BTN = 'inline-flex items-center justify-center gap-1.5 rounded-[9px] border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold transition hover:border-kr/40 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30 disabled:opacity-60'
const BTN_TEHLIKE = 'inline-flex items-center justify-center gap-1.5 rounded-[9px] border border-danger/30 bg-danger-soft/40 px-2.5 py-1.5 text-[12px] font-semibold text-danger transition hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/20 disabled:opacity-60'
const GIRDI = 'w-full rounded-[9px] border border-border bg-surface px-2.5 py-1.5 text-[12px] outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15'

type Mesaj = { tur: 'hata' | 'tamam'; metin: string } | null

function useOnarimIslem() {
  const [pending, start] = useTransition()
  const [mesaj, setMesaj] = useState<Mesaj>(null)
  const router = useRouter()
  function calistir(fn: () => Promise<OnarimSonuc>, onay?: string) {
    if (onay && typeof window !== 'undefined' && !window.confirm(onay)) return
    setMesaj(null)
    start(async () => {
      const r = await fn()
      setMesaj(r.ok ? (r.mesaj ? { tur: 'tamam', metin: r.mesaj } : null) : { tur: 'hata', metin: r.error })
      router.refresh()
    })
  }
  return { pending, mesaj, calistir }
}

function MesajKutusu({ mesaj }: { mesaj: Mesaj }) {
  if (!mesaj) return null
  return (
    <div role={mesaj.tur === 'hata' ? 'alert' : 'status'} className={`mt-2 rounded-[9px] border px-2.5 py-1.5 text-[12px] font-medium ${mesaj.tur === 'hata' ? 'border-danger/30 bg-danger-soft/50 text-danger' : 'border-success/30 bg-success-soft/50 text-success'}`}>
      {mesaj.metin}
    </div>
  )
}

export function OnarimSatirKarari({ id, durum, ornekSecilebilir }: { id: string; durum: string; ornekSecilebilir: boolean }) {
  const uid = useId()
  const [gerekce, setGerekce] = useState('')
  const [ornek, setOrnek] = useState(false)
  const { pending, mesaj, calistir } = useOnarimIslem()

  if (durum === 'UYGULANDI') {
    return (
      <div>
        <button type="button" disabled={pending} className={BTN} onClick={() => calistir(() => onarimSatirGeriAl({ id }), 'Bu satır geri alınsın mı? Eski değer yazılır (değer sonradan değiştiyse dokunulmaz).')}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />} Satırı geri al
        </button>
        <MesajKutusu mesaj={mesaj} />
      </div>
    )
  }
  if (durum === 'ONAYLI' || durum === 'REDDEDILDI') {
    return (
      <div>
        <button type="button" disabled={pending} className={BTN} onClick={() => calistir(() => onarimSatirKarari({ id, karar: 'KARARI_GERI_AL' }))}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Kararı geri al
        </button>
        <MesajKutusu mesaj={mesaj} />
      </div>
    )
  }
  if (durum !== 'KURU') return null

  return (
    <div className="space-y-1.5">
      <label htmlFor={`${uid}-g`} className="sr-only">Gerekçe</label>
      <input id={`${uid}-g`} value={gerekce} maxLength={500} onChange={(e) => setGerekce(e.target.value)} className={GIRDI} placeholder={ornek ? 'Neye bakıldı (Hugo ve dekont)' : 'Gerekçe (retde zorunlu)'} />
      {ornekSecilebilir && (
        <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <input type="checkbox" checked={ornek} onChange={(e) => setOrnek(e.target.checked)} /> Hugo ve dekontla elle teyit ettim (örnek)
        </label>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={pending} className={BTN} onClick={() => calistir(() => onarimSatirKarari({ id, karar: 'ONAYLA', gerekce, ornekTeyit: ornek }))}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />} Onayla
        </button>
        <button type="button" disabled={pending} className={BTN_TEHLIKE} onClick={() => calistir(() => onarimSatirKarari({ id, karar: 'REDDET', gerekce }))}>
          <X className="h-3.5 w-3.5" aria-hidden /> Reddet
        </button>
        <button type="button" disabled={pending} className={BTN} onClick={() => calistir(() => onarimSatirKarari({ id, karar: 'SONRA', gerekce }))}>
          <Clock className="h-3.5 w-3.5" aria-hidden /> Sonra
        </button>
      </div>
      <MesajKutusu mesaj={mesaj} />
    </div>
  )
}

export type TopluOnayBilgisi = { var: boolean; acik: boolean; sebep: string; uygunSayi: number; ornekSayisi: number }

export function OnarimPartiEylemleri({ parti, onayliSayisi, uygulananSayisi, topluOnay }: { parti: string; onayliSayisi: number; uygulananSayisi: number; topluOnay: TopluOnayBilgisi }) {
  const { pending, mesaj, calistir } = useOnarimIslem()
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending || onayliSayisi === 0} className={BTN_BIRINCIL}
          onClick={() => calistir(() => onarimPartiUygula({ parti }), `${onayliSayisi} onaylı satır tek işlemde uygulanacak. Eski değeri değişmiş satırlar atlanır. Devam edilsin mi?`)}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlayCircle className="h-4 w-4" aria-hidden />} Onaylananları uygula ({onayliSayisi})
        </button>
        {topluOnay.var && (
          <button type="button" disabled={pending || !topluOnay.acik || topluOnay.uygunSayi === 0} className={BTN}
            onClick={() => calistir(() => onarimTopluOnay({ parti }), `${topluOnay.uygunSayi} A sınıfı kuru satır toplu onaylanacak. Devam edilsin mi?`)}>
            <ListChecks className="h-3.5 w-3.5" aria-hidden /> A sınıfını toplu onayla ({topluOnay.uygunSayi})
          </button>
        )}
        <button type="button" disabled={pending || uygulananSayisi === 0} className={BTN_TEHLIKE}
          onClick={() => calistir(() => onarimPartiGeriAl({ parti }), `Partideki ${uygulananSayisi} uygulanmış satır geri alınacak. Devam edilsin mi?`)}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Partiyi geri al
        </button>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">
        Uygulama tek işlemdir; her satırda eski değer kontrol edilir, araya değişiklik girdiyse satır atlanır.
        {topluOnay.var ? ` Toplu onay: ${topluOnay.acik ? `açık (örnek teyidi ${topluOnay.ornekSayisi}/5 tamam; yalnız A sınıfı)` : topluOnay.sebep}` : ' Bu partide toplu onay yok; satırlar tek tek onaylanır.'}
      </p>
      <MesajKutusu mesaj={mesaj} />
    </div>
  )
}

const URETIM: { kod: 'R0' | 'R1' | 'R2'; etiket: string; aciklama: string }[] = [
  { kod: 'R0', etiket: 'İİK 67 süreleri (R0)', aciklama: 'İtiraz izi olan dosyalara ihtiyatlı İİK 67 süresi önerir; uygulanınca süre defterine satır açılır.' },
  { kod: 'R1', etiket: 'Tutar (R1)', aciklama: 'Hugo ham hücresi ABD biçimli, değeri 1000 kat küçük okunmuş tutarlar.' },
  { kod: 'R2', etiket: 'Kanıtsız KESİNLEŞTİ (R2)', aciklama: 'Kesinleşme kaydı olmadan KESİNLEŞTİ görünen dosyalar için icra ekseni önerisi.' },
]

export function KuruListeOlustur() {
  const { pending, mesaj, calistir } = useOnarimIslem()
  return (
    <div className="rounded-2xl border border-border bg-surface-muted/40 p-4">
      <div className="mb-1 flex items-center gap-1.5 font-display text-[14px] font-bold"><DatabaseZap className="h-4 w-4 text-kr-ink" aria-hidden /> Kuru liste oluştur</div>
      <p className="mb-3 text-[12px] text-muted-foreground">Canlı veriyi yalnız okur ve 20 satırlık KURU partiler açar; hiçbir alan değişmez. Bekleyen partisi olan dosya yeniden listelenmez.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {URETIM.map((u) => (
          <div key={u.kod} className="rounded-xl border border-border bg-surface p-3">
            <div className="text-[12.5px] font-semibold">{u.etiket}</div>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">{u.aciklama}</p>
            <button type="button" disabled={pending} className={`${BTN} mt-2`} onClick={() => calistir(() => onarimKuruListe({ kod: u.kod }))}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Kuru listeyi oluştur
            </button>
          </div>
        ))}
      </div>
      <MesajKutusu mesaj={mesaj} />
    </div>
  )
}
