'use client'

/**
 * KonsRücü — Ray takip Excel'i: icra sütunları içe aktarma (S21; 06 §3.5 #11–#18).
 * İki adım: "Önizle" (kuru; hiçbir şey yazılmaz) → "Önerileri aç". Excel'den gelen her değer ÖNERİdir;
 * avukat dosyada onaylayınca hedef alana yazılır (onaylı esas no dosyayı UYAP senkron hedefine sokar).
 * Mevcut değerle aynı olan ve zaten açık olan öneri yeniden açılmaz.
 *
 * Props: yok (aktif müvekkilin dosyalarıyla eşler). Menüdeki bir içe aktarma sayfasına ya da Atanan Dosyalar'a bağlanır.
 */
import { useRef, useState, useTransition } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { rayExcelIcraIceAktar, rayExcelIcraOnizle, type ExcelOnizlemeSonuc } from '@/app/(app)/dosya-islem/takip-talebi-actions'

function degerMetni(v: string | number | null): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'number') return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' TL'
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v
}

export function ExcelIcraAktar() {
  const girdi = useRef<HTMLInputElement>(null)
  const [dosyaAdi, setDosyaAdi] = useState<string | null>(null)
  const [onizleme, setOnizleme] = useState<ExcelOnizlemeSonuc | null>(null)
  const [sonuc, setSonuc] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function formVerisi(): FormData | null {
    const f = girdi.current?.files?.[0]
    if (!f) { setHata('Önce Excel dosyasını seçin.'); return null }
    const fd = new FormData()
    fd.set('file', f)
    return fd
  }

  function onizle() {
    setHata(null); setSonuc(null)
    const fd = formVerisi(); if (!fd) return
    start(async () => {
      const r = await rayExcelIcraOnizle(fd)
      if (!r.ok) { setHata(r.error ?? 'Excel okunamadı'); setOnizleme(null) } else setOnizleme(r)
    })
  }
  function iceAktar() {
    setHata(null)
    const fd = formVerisi(); if (!fd) return
    start(async () => {
      const r = await rayExcelIcraIceAktar(fd)
      if (!r.ok) { setHata(r.error ?? 'İçe aktarılamadı'); return }
      setSonuc(`${r.acilan ?? 0} öneri açıldı, ${r.atlanan ?? 0} öneri atlandı (değer aynı ya da zaten açık).${r.bulunamayan?.length ? ` ${r.bulunamayan.length} satırın dosyası bulunamadı.` : ''} Öneriler dosyalarda avukat onayını bekliyor.`)
      setOnizleme(null)
    })
  }

  const yeniOneri = onizleme?.ozet?.oneri ?? 0

  return (
    <section aria-label="Ray takip Excel'i — icra sütunları" className="rounded-2xl border border-border bg-card p-4">
      <h3 className="font-display text-[15px] font-bold text-foreground">Ray takip Excel&apos;i: icra sütunları</h3>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        İcra müdürlüğü, icra esas, takip tarihi, takip çıkışı ve kişi sütunları öneri olarak dosyalara eşlenir (hukuk dosya no ile). Hiçbir değer onaysız yazılmaz.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-dashed border-border px-3 py-2 text-[13px] text-foreground focus-within:ring-2 focus-within:ring-ring">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden />
          {dosyaAdi ?? 'Excel dosyası seçin (.xlsx)'}
          <input ref={girdi} type="file" accept=".xlsx,.xls" className="sr-only" onChange={(e) => { setDosyaAdi(e.target.files?.[0]?.name ?? null); setOnizleme(null); setSonuc(null) }} />
        </label>
        {!onizleme ? (
          <button type="button" onClick={onizle} disabled={pending || !dosyaAdi} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[14px] font-semibold text-kr-foreground transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 disabled:opacity-60">
            {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />} Önizle
          </button>
        ) : (
          <button type="button" onClick={iceAktar} disabled={pending || yeniOneri === 0} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[14px] font-semibold text-kr-foreground transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 disabled:opacity-60">
            {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />} {yeniOneri} öneriyi aç
          </button>
        )}
      </div>

      {hata && <p role="alert" className="mt-2 text-[12.5px] text-danger">{hata}</p>}
      {sonuc && <p role="status" className="mt-2 text-[12.5px] text-success">{sonuc}</p>}

      {onizleme?.satirlar && (
        <div className="mt-3">
          <p className="text-[12.5px] text-muted-foreground">
            {onizleme.ozet?.satir} satır · {onizleme.ozet?.dosyaBulunan} dosya eşleşti · {yeniOneri} yeni öneri
            {onizleme.ozet?.bulunamayan.length ? ` · bulunamayan hukuk no: ${onizleme.ozet.bulunamayan.slice(0, 8).join(', ')}${onizleme.ozet.bulunamayan.length > 8 ? '…' : ''}` : ''}
          </p>
          <div className="mt-2 max-h-[420px] overflow-auto rounded-[10px] border border-border-subtle">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-muted text-left text-[12px] text-muted-foreground">
                <tr><th className="px-2 py-1.5">Satır</th><th className="px-2 py-1.5">Hukuk no</th><th className="px-2 py-1.5">Alan</th><th className="px-2 py-1.5 text-right">Excel</th><th className="px-2 py-1.5 text-right">Programda</th></tr>
              </thead>
              <tbody>
                {onizleme.satirlar.flatMap((s) => [
                  ...s.oneriler.map((o) => (
                    <tr key={`${s.excelSatir}-${o.no}`} className={`border-t border-border-subtle ${!s.dosyaId || o.ayni ? 'text-muted-foreground' : ''}`}>
                      <td className="font-mono px-2 py-1">{s.excelSatir}</td>
                      <td className="font-mono px-2 py-1">{s.hukukDosyaNo}{!s.dosyaId && <span className="font-sans ml-1 text-[11px] text-danger">dosya yok</span>}</td>
                      <td className="px-2 py-1">#{o.no} {o.etiket}</td>
                      <td className="font-mono px-2 py-1 text-right">{degerMetni(o.deger)}</td>
                      <td className="font-mono px-2 py-1 text-right">{o.ayni ? 'aynı' : degerMetni(o.mevcut)}</td>
                    </tr>
                  )),
                  ...s.sorunlar.map((m, i) => (
                    <tr key={`${s.excelSatir}-s${i}`} className="border-t border-border-subtle text-warning"><td className="font-mono px-2 py-1">{s.excelSatir}</td><td className="font-mono px-2 py-1">{s.hukukDosyaNo}</td><td colSpan={3} className="px-2 py-1">{m}</td></tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
          {onizleme.hatalar && onizleme.hatalar.length > 0 && (
            <ul className="mt-2 text-[12px] text-warning">{onizleme.hatalar.slice(0, 10).map((h, i) => <li key={i}>Satır {h.satir}: {h.sebep}</li>)}</ul>
          )}
        </div>
      )}
    </section>
  )
}
