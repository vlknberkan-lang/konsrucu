'use client'

/**
 * KonsRücü — Dosya Detay · "Kaynak İzi" (şeffaflık katmanı).
 * Çıkarılan her bilgiyi dayandığı belgeye bağlar: alan → değer → kaynak belge(ler) (açılabilir) ya da
 * türetilmiş not (ör. yetkili icra ← kaza yeri; zamanaşımı ← hasar tarihi). Belge yoksa "AI metinden çıkardı".
 */
import { useState } from 'react'
import { FileText, Eye, Sparkles, CornerDownRight } from 'lucide-react'
import { BelgeOnizleme, type OnizlemeBelge } from '@/components/akilli-giris/detay/belge-onizleme'

export type KaynakBelge = { id: string; dosyaAdi: string; kategori: string; acilabilir: boolean }
export type KaynakAlan = { alan: string; deger: string; turetilmis: string | null; belgeler: KaynakBelge[] }

const KAT_AD: Record<string, string> = {
  POLICE: 'Poliçe', DEKONT: 'Dekont', TUTANAK: 'Kaza Tutanağı', EKSPERTIZ: 'Ekspertiz', EHLIYET: 'Ehliyet',
  RUHSAT: 'Ruhsat', LEHE: 'Lehe formu', SBM: 'SBM', ALKOL: 'Alkol raporu', HASAR_FOTO: 'Hasar fotoğrafı', DIGER: 'Belge',
}

export function KaynakIzi({ alanlar }: { alanlar: KaynakAlan[] }) {
  const [onizle, setOnizle] = useState<OnizlemeBelge | null>(null)
  if (!alanlar.length) return null
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        <CornerDownRight className="h-3.5 w-3.5 text-kr" /> Alan-Kaynak İzi · bilgi nereden geldi
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        {alanlar.map((a, i) => (
          <div key={a.alan} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 p-[10px_13px] ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
            <span className="w-[150px] shrink-0 text-[12px] text-muted-foreground">{a.alan}</span>
            <span className="min-w-[110px] flex-1 text-[13px] font-semibold text-foreground">{a.deger}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {a.turetilmis ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-[2px] text-[10.5px] text-muted-foreground" title="Belgeden değil, başka alanlardan türetildi">
                  <Sparkles className="h-3 w-3" /> {a.turetilmis}
                </span>
              ) : a.belgeler.length ? (
                a.belgeler.map((b) =>
                  b.acilabilir ? (
                    <button key={b.id} onClick={() => setOnizle({ id: b.id, dosyaAdi: b.dosyaAdi })} title={b.dosyaAdi}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-[2px] text-[10.5px] font-medium text-muted-foreground transition hover:border-kr/40 hover:text-kr-ink">
                      <FileText className="h-3 w-3" /> {KAT_AD[b.kategori] ?? b.kategori} <Eye className="h-3 w-3" />
                    </button>
                  ) : (
                    <span key={b.id} title={b.dosyaAdi}
                      className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-muted px-2 py-[2px] text-[10.5px] text-muted-foreground">
                      <FileText className="h-3 w-3" /> {KAT_AD[b.kategori] ?? b.kategori}
                    </span>
                  ),
                )
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-[2px] text-[10.5px] text-[hsl(var(--warning-fg))]" title="Bu kategoride yüklü belge yok; değer AI tarafından evrak metninden çıkarıldı">
                  belge yok · AI metinden çıkardı
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <BelgeOnizleme belge={onizle} onKapat={() => setOnizle(null)} />
    </div>
  )
}
