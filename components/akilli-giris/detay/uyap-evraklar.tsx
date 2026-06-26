'use client'

/**
 * KonsRücü — Dosya Detay · UYAP Evrakları kovası.
 * Eklenti senkronundan inen evraklar (Belge.kaynakRef) — adından türe ayrılıp gruplu listelenir + önizleme.
 * Salt görüntüleme: yükleme senkronla yapılır. (Daha önce TakipSureci içinde gömülüydü; buraya taşındı.)
 */
import { useState } from 'react'
import { AlertTriangle, Gavel, Scale, FileCheck, FileText, Eye, Mail, Receipt, FileSignature } from 'lucide-react'
import { BelgeOnizleme, type OnizlemeBelge } from '@/components/akilli-giris/detay/belge-onizleme'

// t = belgenin GERÇEK tarihi (UYAP ad sonundan); indirme = sisteme indiği an (createdAt)
export type EvrakUI = { id: string; dosyaAdi: string; kategori: string; t: string; indirme?: string; acilabilir: boolean }

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('tr-TR') : '')
const fmtDateTime = (s: string) => new Date(s).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// UYAP evrakını adından türe ayır (icra/takip evrakları) — kullanıcı dostu gruplama
const EVRAK_TUR: { key: string; label: string; Icon: typeof FileText; cls: string; re: RegExp }[] = [
  { key: 'tebligat', label: 'Tebligat', Icon: Mail, cls: 'bg-info-soft text-info', re: /tebli|mazbata|ptt|tebligat/i },
  { key: 'itiraz', label: 'İtiraz', Icon: AlertTriangle, cls: 'bg-warning-soft text-warning', re: /itiraz/i },
  { key: 'haciz', label: 'Haciz', Icon: Gavel, cls: 'bg-warning-soft text-[hsl(var(--warning-fg))]', re: /haciz/i },
  { key: 'odeme', label: 'Ödeme / Makbuz', Icon: Receipt, cls: 'bg-success-soft text-success', re: /makbuz|harç|harc|tahsil|reddiyat|ödeme|odeme|dekont|alınd|alind/i },
  { key: 'karar', label: 'Karar / Tutanak', Icon: FileCheck, cls: 'bg-kr-soft text-kr-ink', re: /tensip|zapıt|zapt|zabıt|zabit|tutanak|karar|müzekkere|muzekkere/i },
  { key: 'vekalet', label: 'Vekaletname', Icon: FileSignature, cls: 'bg-surface-muted text-foreground', re: /vekalet/i },
  { key: 'talep', label: 'Talep / Dilekçe', Icon: FileText, cls: 'bg-kr-soft text-kr-ink', re: /talep|dilekçe|dilekce|başvuru|basvuru/i },
  { key: 'rapor', label: 'Bilirkişi / Rapor', Icon: Scale, cls: 'bg-info-soft text-info', re: /bilirkiş|bilirkis|rapor|ekspertiz/i },
]
const EVRAK_DIGER = { key: 'diger', label: 'Diğer', Icon: FileText, cls: 'bg-surface-muted text-muted-foreground' }
function evrakTuru(ad: string) { for (const t of EVRAK_TUR) if (t.re.test(ad)) return t; return EVRAK_DIGER }

export function UyapEvraklar({ evraklar }: { evraklar: EvrakUI[] }) {
  const [onizle, setOnizle] = useState<OnizlemeBelge | null>(null)

  const evrakGruplari = (() => {
    const m = new Map<string, { key: string; label: string; Icon: typeof FileText; cls: string; items: EvrakUI[] }>()
    for (const e of evraklar) {
      const t = evrakTuru(e.dosyaAdi)
      if (!m.has(t.key)) m.set(t.key, { key: t.key, label: t.label, Icon: t.Icon, cls: t.cls, items: [] })
      m.get(t.key)!.items.push(e)
    }
    for (const g of m.values()) g.items.sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime())
    const sira = [...EVRAK_TUR.map((t) => t.key), 'diger']
    return [...m.values()].sort((a, b) => sira.indexOf(a.key) - sira.indexOf(b.key))
  })()

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex items-start gap-[14px] border-b border-border-subtle px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">UYAP EVRAKLARI · türüne göre</div>
          <h2 className="font-display mt-1 text-[17px] font-extrabold tracking-[-0.025em]">UYAP&apos;tan İnen Evraklar</h2>
          <p className="mt-[5px] max-w-[64ch] text-[12.5px] leading-[1.45] text-muted-foreground">Eklenti senkronundan otomatik iner; adından türü anlaşılıp gruplanır. Açmak için “Aç”a basın.</p>
        </div>
        {evraklar.length > 0 && <span className="font-mono shrink-0 text-[11px] text-muted-foreground">{evraklar.length} evrak</span>}
      </div>

      <div className="px-5 py-[18px]">
        {evraklar.length === 0 ? (
          <div className="py-2 text-center text-[12.5px] text-muted-foreground">Henüz UYAP evrakı inmedi · takip açılıp eklenti senkronu çalıştıkça evraklar burada türüne göre listelenir.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {evrakGruplari.map((g) => (
              <div key={g.key} className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
                <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-muted/50 px-3 py-2">
                  <span className={`grid h-6 w-6 place-items-center rounded-[7px] ${g.cls}`}><g.Icon className="h-3.5 w-3.5" /></span>
                  <span className="text-[12.5px] font-bold">{g.label}</span>
                  <span className="font-mono rounded-full border border-border bg-surface px-1.5 py-[1px] text-[10px] text-muted-foreground">{g.items.length}</span>
                </div>
                <div className="flex flex-col divide-y divide-border-subtle">
                  {g.items.map((b) => (
                    <div key={b.id} className="flex items-center gap-2.5 px-3 py-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[12px]" title={b.dosyaAdi}>{b.dosyaAdi}</span>
                      <span className="font-mono shrink-0 text-[10px] text-muted-foreground" title={b.indirme ? `belge tarihi · ${fmtDate(b.t)}\nindirme · ${fmtDateTime(b.indirme)}` : undefined}>{fmtDate(b.t)}</span>
                      {b.acilabilir
                        ? <button onClick={() => setOnizle({ id: b.id, dosyaAdi: b.dosyaAdi })} aria-label="Evrağı aç" className="inline-flex shrink-0 items-center gap-1 rounded-[7px] border border-border px-2 py-1 text-[10.5px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-kr-ink"><Eye className="h-3 w-3" /> Aç</button>
                        : <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground" title="Storage'sız (eski) kayıt">—</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BelgeOnizleme belge={onizle} onKapat={() => setOnizle(null)} />
    </section>
  )
}
