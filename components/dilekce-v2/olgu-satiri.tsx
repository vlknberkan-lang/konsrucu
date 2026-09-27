'use client'

/**
 * KonsRücü — Dosya kartı olgu satırı · components/dilekce-v2/olgu-satiri.tsx
 * Solda kaynaklı olgu: [O-n], metin, kaynak (belge ve sayfa, birebir alıntı), kritik ve onay durumu.
 * "Doğru" yalnız avukata; "Düzelt" kayıt kaynaklı olmayan olgularda (kayıt kaynaklıysa ilgili kayıt düzeltilir).
 */
import { useId, useState } from 'react'
import { Check, Eye, Pencil, X } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { ekranMaskele } from '@/lib/konsrucu/dilekce-v2/ekran-maske'
import { KRITIK_ALAN_ADI, type KartOlgu } from '@/lib/konsrucu/dilekce-v2/tipler'
import { tarihSaatTR } from '@/lib/konsrucu/format'
import { alan, ikincilDugme, kucukDugme, sessizDugme } from './stil'

export type OlguDuzeltGirdisi = { metin: string; kaynak?: { belgeId: string; sayfa: number | null; alinti: string } }

type Props = {
  olgu: KartOlgu
  /** Ekranda kişisel veri maskeli mi (varsayılan evet). */
  maskeli: boolean
  /** Kart değiştirilebilir mi (ESKIDI değil, yazma yetkisi var). */
  duzenlenebilir: boolean
  /** Avukat rolü: "Doğru" yalnız avukatta. */
  avukat: boolean
  /** Kilitli kart: düzeltme yeni sürüm açar. */
  kilitli: boolean
  bekliyor: boolean
  belgeler: { id: string; ad: string }[]
  onDogru: (id: string) => void
  onDuzelt: (id: string, d: OlguDuzeltGirdisi) => void
  onKaynakAc?: (belge: { id: string; dosyaAdi: string }) => void
}

const KAYNAK_ADI: Record<KartOlgu['kaynakTuru'], string> = { KAYIT: 'Kayıt', ALAN: 'Onaylı alan', AI: 'Belge' }

export function OlguSatiri({ olgu, maskeli, duzenlenebilir, avukat, kilitli, bekliyor, belgeler, onDogru, onDuzelt, onKaynakAc }: Props) {
  const id = useId()
  const [acik, setAcik] = useState(false)
  const [metin, setMetin] = useState(olgu.metin)
  const [kaynakDegisir, setKaynakDegisir] = useState(false)
  const [belgeId, setBelgeId] = useState(olgu.belgeId ?? belgeler[0]?.id ?? '')
  const [sayfa, setSayfa] = useState(olgu.sayfa ? String(olgu.sayfa) : '')
  const [alinti, setAlinti] = useState('')
  const goster = (s: string | null) => (maskeli ? ekranMaskele(s) : s ?? '')

  function gonder(e: React.FormEvent) {
    e.preventDefault()
    const sayfaNo = sayfa.trim() ? Number(sayfa) : null
    onDuzelt(olgu.id, { metin, ...(kaynakDegisir ? { kaynak: { belgeId, sayfa: Number.isFinite(sayfaNo) ? sayfaNo : null, alinti } } : {}) })
  }

  return (
    <li className={`rounded-xl border p-3 ${olgu.kritik && !olgu.onayli ? 'border-warning/40 bg-warning-soft/30' : 'border-border'}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-xs font-bold text-primary">{olgu.id}</span>
        {olgu.kritik && olgu.kritikAlan && <Badge tone="warning">Kritik · {KRITIK_ALAN_ADI[olgu.kritikAlan]}</Badge>}
        {olgu.onayli ? <Badge tone="success" dot>Doğru</Badge> : <Badge tone="steel">Onay bekliyor</Badge>}
        {olgu.duzeltildi && <Badge tone="info">Düzeltildi</Badge>}
        {olgu.alanlar.includes('LIKIDITE') && <Badge tone="kr">Likidite</Badge>}
        {olgu.alanlar.includes('ALEYHE') && <Badge tone="danger">Aleyhe</Badge>}
      </div>
      <p className="mt-2 break-words text-sm leading-6">{goster(olgu.metin)}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>{KAYNAK_ADI[olgu.kaynakTuru]}: {olgu.kaynakEtiketi}</span>
        {olgu.onayli && olgu.onayAt && <span className="font-mono">onay {tarihSaatTR(olgu.onayAt, { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>}
        {olgu.belgeId && onKaynakAc && (
          <button type="button" onClick={() => onKaynakAc({ id: olgu.belgeId!, dosyaAdi: olgu.belgeAdi ?? 'Belge' })} className={`${kucukDugme} text-primary hover:bg-primary/10`}>
            <Eye className="h-3.5 w-3.5" aria-hidden /> Kaynağı aç
          </button>
        )}
      </div>
      {olgu.alinti && (
        <blockquote className="mt-2 border-l-2 border-kr/50 pl-3 text-xs italic leading-5 text-muted-foreground">
          “{goster(olgu.alinti)}”
        </blockquote>
      )}

      {duzenlenebilir && !acik && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {avukat && !olgu.onayli && !kilitli && (
            <button type="button" disabled={bekliyor} onClick={() => onDogru(olgu.id)} className={`${kucukDugme} border border-success/40 text-success hover:bg-success-soft`}>
              <Check className="h-3.5 w-3.5" aria-hidden /> Doğru
            </button>
          )}
          {olgu.kaynakTuru === 'AI' && (
            <button type="button" disabled={bekliyor} onClick={() => setAcik(true)} className={`${kucukDugme} text-muted-foreground hover:bg-muted`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Düzelt
            </button>
          )}
          {olgu.kaynakTuru !== 'AI' && <span className="text-[11px] text-muted-foreground">{olgu.kaynakTuru === 'ALAN' ? 'Onaylı alandan gelir; değişiklik öneriler ekranından yapılır.' : 'Kayıttan gelir; değişiklik ilgili kayıttan yapılır.'}</span>}
        </div>
      )}

      {acik && (
        <form onSubmit={gonder} className="mt-3 space-y-2 rounded-lg bg-surface-muted p-3">
          <label htmlFor={`${id}-metin`} className="text-xs font-semibold">Olgunun doğru hâli</label>
          <textarea id={`${id}-metin`} value={metin} onChange={(e) => setMetin(e.target.value)} rows={2} maxLength={600} className={alan} />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={kaynakDegisir} onChange={(e) => setKaynakDegisir(e.target.checked)} />
            Kaynağı da değiştir (alıntı belgede aranır; bulunamazsa olgu karta giremez)
          </label>
          {kaynakDegisir && (
            <div className="grid gap-2 sm:grid-cols-[1fr_90px]">
              <div>
                <label htmlFor={`${id}-belge`} className="text-[11px] text-muted-foreground">Belge</label>
                <select id={`${id}-belge`} value={belgeId} onChange={(e) => setBelgeId(e.target.value)} className={alan}>
                  {belgeler.map((b) => <option key={b.id} value={b.id}>{b.ad}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-sayfa`} className="text-[11px] text-muted-foreground">Sayfa</label>
                <input id={`${id}-sayfa`} inputMode="numeric" value={sayfa} onChange={(e) => setSayfa(e.target.value.replace(/\D/g, ''))} className={alan} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`${id}-alinti`} className="text-[11px] text-muted-foreground">Belgeden birebir alıntı (8–300 karakter)</label>
                <textarea id={`${id}-alinti`} value={alinti} onChange={(e) => setAlinti(e.target.value)} rows={2} maxLength={300} className={alan} />
              </div>
            </div>
          )}
          {kilitli && <p className="text-[11px] text-warning">Kart kilitli: kaydettiğinizde yeni bir kart sürümü açılır ve yeniden kilitlemeniz gerekir.</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={bekliyor || metin.trim().length < 3 || (kaynakDegisir && alinti.trim().length < 8)} className={ikincilDugme}>Düzeltmeyi kaydet</button>
            <button type="button" onClick={() => { setAcik(false); setMetin(olgu.metin) }} className={sessizDugme}><X className="h-4 w-4" aria-hidden /> Vazgeç</button>
          </div>
        </form>
      )}
    </li>
  )
}
