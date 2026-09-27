/**
 * KonsRücü — "4 · TEBLİĞ VE İTİRAZ · borçlu bazında" paneli · components/dosya/olay/teblig-itiraz-paneli.tsx
 *
 * Bağlanacak yer: Dosya Yol Haritası'nın 4. durağı (S20) ya da eski dosya detayında Takip Süreci'nin üstü.
 * Veri: lib/konsrucu/eksen/yukle.ts → olayPaneliYukle(dosyaId, aktifMusteriId). Yetkiler sunucuda
 * lib/konsrucu/eksen/yetki.ts → olayYetkisi(dbUser, 'ONAY' | 'TARIH_GIR' | 'OKU') ile hesaplanıp verilir.
 * Hook yok (sunucu bileşeninden çağrılabilir); etkileşim alt bileşenlerde.
 */
import { Scale } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import type { OlayPaneliVM } from '@/lib/konsrucu/eksen/gorunum'
import { BorcluBloku } from './borclu-bloku'
import { GelismeListesi } from './gelisme-listesi'
import { ROL_TON } from './rol'

export function TebligItirazPaneli({
  panel, yetkili, tarihGirebilir, okuyabilir,
}: {
  panel: OlayPaneliVM | null
  yetkili: boolean
  tarihGirebilir: boolean
  okuyabilir: boolean
}) {
  if (!panel) return null
  const borclular = panel.borclular.map((b) => ({ id: b.borcluId, ad: b.ad }))
  return (
    <section aria-labelledby="teblig-itiraz-baslik" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-start gap-3 border-b border-border-subtle px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-kr-soft text-kr-ink"><Scale className="h-[18px] w-[18px]" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">4 · Tebliğ ve itiraz · borçlu bazında</div>
          <h2 id="teblig-itiraz-baslik" className="font-display mt-1 text-[17px] font-extrabold tracking-[-0.025em] text-foreground">Tebliğ ve itiraz</h2>
          {panel.ipucu && (
            <p className="mt-1 text-[12.5px] leading-[1.45] text-foreground/85">
              <span className="font-mono text-[10.5px] text-muted-foreground">{panel.ipucu.kural}</span> · {panel.ipucu.metin}
            </p>
          )}
        </div>
        {panel.icraOzet && (
          <div className="shrink-0 text-right text-[11.5px] text-muted-foreground">
            İCRA <Badge tone={ROL_TON[panel.icraOzet.rol]} dot>{panel.icraOzet.etiket}</Badge>
            <div className="mt-0.5">{panel.icraOzet.kaynak}</div>
          </div>
        )}
      </div>
      <div className="px-5 py-[18px]">
        {panel.icraOzet && panel.icraOzet.notlar.length > 0 && (
          <p className="mb-3 text-[12px] leading-[1.45] text-muted-foreground">{panel.icraOzet.notlar.join(' ')}</p>
        )}
        {panel.borclular.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-3 text-[12.5px] text-muted-foreground">
            Bu dosyada borçlu kaydı yok. Borçluları ekleyin; tebliğ ve itiraz borçlu bazında izlenir.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {panel.borclular.map((b) => <BorcluBloku key={b.borcluId} dosyaId={panel.dosyaId} blok={b} tarihGirebilir={tarihGirebilir} />)}
          </div>
        )}
        <GelismeListesi dosyaId={panel.dosyaId} bekleyen={panel.bekleyen} islenen={panel.islenen} borclular={borclular} yetkili={yetkili} okuyabilir={okuyabilir} />
      </div>
    </section>
  )
}
