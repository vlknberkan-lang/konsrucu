'use client'

/**
 * KonsRücü — Hugo tevdiye Excel'i yükleme paneli · components/akilli-giris/hugo-import-panel.tsx
 * Drop-zone (.xls/.xlsx) → server action → "X yeni / Y mevcut / Z hatalı" özeti + hatalı satır sebepleri.
 * Mock YOK; gerçek parse + DB yazımı server action'da (mevcut dosya asla ezilmez).
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, FileSpreadsheet, Loader2, Check, RotateCcw, AlertTriangle, ArrowRight, GitCompareArrows } from 'lucide-react'
import { hugoIceriAktar, importFarkUygula, type IceriAktarSonuc, type ImportFark } from '@/app/(app)/akilli-giris/iceri-aktar/actions'

function gecerliAd(name: string) {
  const l = name.toLowerCase()
  return l.endsWith('.xls') || l.endsWith('.xlsx')
}

export function HugoImportPanel({ onClose }: { onClose?: () => void } = {}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [hot, setHot] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dosyaAdi, setDosyaAdi] = useState('')
  const [sonuc, setSonuc] = useState<IceriAktarSonuc | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  // fark raporu: seçim + uygulama durumu
  const [secili, setSecili] = useState<Set<number>>(new Set())
  const [farkBusy, setFarkBusy] = useState(false)
  const [farkSonuc, setFarkSonuc] = useState<string | null>(null)
  const router = useRouter()

  async function gonder(file: File) {
    if (!gecerliAd(file.name)) { setHata('Yalnız .xls / .xlsx dosyası yükleyin.'); return }
    setBusy(true); setSonuc(null); setHata(null); setDosyaAdi(file.name); setFarkSonuc(null)
    try {
      const fd = new FormData()
      fd.append('dosya', file)
      const r = await hugoIceriAktar(fd)
      setSonuc(r)
      setSecili(new Set((r.farklar ?? []).map((_, i) => i))) // varsayılan: tüm farklar seçili
      if (r.eklenen > 0) router.refresh()
    } catch {
      setHata('İçe aktarma başarısız oldu. Dosyayı kontrol edip tekrar deneyin.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function farklariUygula() {
    const farklar = sonuc?.farklar ?? []
    const secilenler = farklar.filter((_, i) => secili.has(i))
    if (!secilenler.length) return
    setFarkBusy(true); setFarkSonuc(null)
    try {
      const r = await importFarkUygula(secilenler.map((f) => ({ dosyaId: f.dosyaId, alan: f.alan, yeniDeger: f.yeniDeger })))
      if (r.ok) {
        setFarkSonuc(`${r.uygulanan} güncelleme uygulandı.`)
        setSonuc((s) => (s ? { ...s, farklar: farklar.filter((_, i) => !secili.has(i)) } : s))
        setSecili(new Set())
        router.refresh()
      } else setFarkSonuc(r.error ?? 'Güncellemeler uygulanamadı.')
    } catch {
      setFarkSonuc('Güncellemeler uygulanamadı.')
    } finally {
      setFarkBusy(false)
    }
  }

  function pick(list: FileList | null) {
    const f = list?.[0]
    if (f) gonder(f)
  }

  function reset() {
    setSonuc(null); setHata(null); setDosyaAdi('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="mb-[22px]">
      <input
        ref={inputRef}
        type="file"
        accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />

      {/* ── boşta / yükleniyor: dropzone ── */}
      {!sonuc && (
        <div
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setHot(true) }}
          onDragLeave={() => setHot(false)}
          onDrop={(e) => { e.preventDefault(); setHot(false); if (!busy) pick(e.dataTransfer.files) }}
          className={`group relative overflow-hidden rounded-[18px] border-2 border-dashed px-7 py-10 text-center transition ${
            busy ? 'cursor-wait border-kr bg-kr-soft/40' : 'cursor-pointer ' + (hot ? 'border-kr bg-kr-soft/50 shadow-[inset_0_0_0_4px_hsl(var(--kr)/0.14)]' : 'border-border bg-surface-muted/50 hover:border-kr hover:bg-kr-soft/50')
          }`}
        >
          <div className={`pointer-events-none absolute inset-0 bg-[linear-gradient(hsl(var(--kr)/0.04)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--kr)/0.04)_1px,transparent_1px)] bg-[length:26px_26px] transition-opacity ${hot ? 'opacity-100' : 'opacity-0'}`} />
          <div className="relative">
            <div className={`mx-auto mb-3.5 grid h-16 w-16 place-items-center rounded-[18px] bg-kr/[0.12] text-kr transition ${hot ? '-translate-y-0.5 scale-105' : ''}`}>
              {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <FileSpreadsheet className="h-7 w-7" />}
            </div>
            {busy ? (
              <>
                <div className="font-display text-[19px] font-extrabold tracking-[-0.02em]">İçe aktarılıyor…</div>
                <div className="mt-1.5 text-[13px] text-muted-foreground truncate">{dosyaAdi}</div>
              </>
            ) : (
              <>
                <div className="font-display text-[19px] font-extrabold tracking-[-0.02em]">Tevdiye Excel'ini buraya bırakın</div>
                <div className="mt-1.5 text-[13px] text-muted-foreground">
                  <b>Hugo</b> veya <b>Zurich</b> biçimi otomatik tanınır. Her satır <b>Hukuk Dosya No</b> ile eşlenir; yeni dosyalar <b>HAVUZDA</b> açılır, mevcutlar ezilmeden atlanır.
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {['.xlsx', '.xls'].map((t) => (
                    <span key={t} className="font-mono rounded-md border border-border bg-surface px-2 py-1 text-[10px] tracking-[0.04em] text-muted-foreground">{t}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {hata && !busy && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {hata}
        </div>
      )}

      {/* ── bitti: özet ── */}
      {sonuc && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center gap-2.5 border-b border-border-subtle px-5 py-4">
            <Check className="h-[17px] w-[17px] text-success" />
            <h3 className="font-display text-[15px] font-bold tracking-[-0.02em]">
              İçe aktarma tamam — <span className="text-success">{sonuc.eklenen} yeni</span> / {sonuc.atlanan} mevcut
            </h3>
            <span className="font-mono ml-auto truncate text-[11px] text-muted-foreground">{dosyaAdi}</span>
            <button onClick={reset} className="ml-2 inline-flex items-center gap-1.5 rounded-[9px] border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-kr/40 hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> Yeni dosya
            </button>
          </div>

          {/* sayım kartları */}
          <div className="grid grid-cols-2 gap-3 px-5 pt-4 sm:grid-cols-4">
            {([
              ['Toplam satır', sonuc.toplam, 'text-foreground'],
              ['Eklendi', sonuc.eklenen, 'text-success'],
              ['Mevcut (atlandı)', sonuc.atlanan, 'text-muted-foreground'],
              ['Hatalı', sonuc.hatali, sonuc.hatali > 0 ? 'text-danger' : 'text-muted-foreground'],
            ] as [string, number, string][]).map(([lbl, val, cls]) => (
              <div key={lbl} className="rounded-xl border border-border-subtle bg-surface-muted/40 p-3">
                <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{lbl}</div>
                <div className={`font-display mt-1 text-[24px] font-extrabold tracking-[-0.02em] ${cls}`}>{val.toLocaleString('tr-TR')}</div>
              </div>
            ))}
          </div>

          {/* fark raporu: Excel'de düzeltilmiş ama sistemde eski kalan alanlar (onaylı güncelleme) */}
          {(sonuc.farklar?.length ?? 0) > 0 && (
            <div className="px-5 pt-4">
              <div className="flex items-center gap-1.5">
                <GitCompareArrows className="h-3.5 w-3.5 text-warning" />
                <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                  Excel ile sistem arasında fark · {sonuc.farklar!.length}{(sonuc.fazlaFark ?? 0) > 0 ? ` (+${sonuc.fazlaFark} fark daha — listeyi uygulayıp tekrar yükleyin)` : ''}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Bu dosyalar zaten kayıtlı (ezilmedi) ama Excel'de <b>farklı değerler</b> var — özellikle <b>zamanaşımı</b> farkları kritiktir.
                Onayladıklarınızı seçin ve uygulayın; her güncelleme dosya geçmişine yazılır.
              </p>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-warning/30 bg-warning-soft/20 p-2">
                {sonuc.farklar!.map((f, i) => (
                  <label key={i} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-[12.5px] transition hover:bg-surface-muted/60">
                    <input
                      type="checkbox"
                      checked={secili.has(i)}
                      onChange={(e) => setSecili((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n })}
                      className="h-4 w-4 rounded border-border text-kr focus:ring-kr/40"
                    />
                    <span className="font-mono shrink-0 font-bold">{f.hukukDosyaNo}</span>
                    <span className="shrink-0 text-muted-foreground">{f.etiket}:</span>
                    <span className="font-mono text-muted-foreground line-through">{f.eski ?? 'boş'}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono font-semibold text-foreground">{f.yeni}</span>
                  </label>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={farklariUygula}
                  disabled={farkBusy || secili.size === 0}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-warning px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-warning/90 disabled:opacity-50"
                >
                  {farkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Seçili güncellemeleri uygula ({secili.size})
                </button>
                {farkSonuc && <span className="text-[12.5px] font-medium text-foreground">{farkSonuc}</span>}
              </div>
            </div>
          )}

          {/* hatalı satırlar */}
          {sonuc.hatalar.length > 0 && (
            <div className="px-5 pt-4">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Hatalı / atlanan satırlar · {sonuc.hatalar.length}</div>
              <div className="mt-1.5 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border-subtle bg-surface-muted/30 p-2">
                {sonuc.hatalar.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 px-1.5 py-1 text-[12.5px]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <span className="font-mono shrink-0 text-muted-foreground">{h.satir > 0 ? `Satır ${h.satir}` : 'Genel'}</span>
                    <span className="text-foreground">{h.sebep}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle bg-surface-muted/40 px-5 py-4">
            {onClose ? (
              <button onClick={onClose} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13.5px] font-semibold text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] transition hover:bg-kr/90">
                <Check className="h-4 w-4" /> Kapat
              </button>
            ) : (
              <button onClick={() => router.push('/atanan-dosyalar')} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13.5px] font-semibold text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] transition hover:bg-kr/90">
                Atanan Dosyalar'a git <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <span className="text-[11.5px] text-muted-foreground">
              Yeni dosyalar <b>HAVUZDA</b>. Dosya detayında belgeleri ekleyip <b>AI çıkarımını</b> çalıştırın (borçlu/muhatap).
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
