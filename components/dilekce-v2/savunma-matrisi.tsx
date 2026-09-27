'use client'

/**
 * KonsRücü — Savunma matrisi (cevaba cevap) · components/dilekce-v2/savunma-matrisi.tsx
 *
 * S39 (06 §7.3): karşı tarafın cevap dilekçesinden çıkarılan, sayfa atıflı iddia–savunma matrisi. Avukat her
 * satırı "Cevaplanacak" ya da "Önemsiz" işaretler; yalnız "Cevaplanacak" işaretliler cevaba cevap taslağının
 * AÇIKLAMALAR bölümüne girer (lib/konsrucu/dilekce-v2/turler/cevaba-cevap.ts · cevaplanacakBaglam). İşaret
 * `DosyaKarti.icerikJson` içindeki `savunmalar` alanında saklanır (yeni kolon yok); dosya-karti.tsx bu bileşeni
 * yalnız `icerik.tur === 'CEVABA_CEVAP'` iken gösterir.
 *
 * Alıntı, karşı tarafın yazdığı metindir: veridir, talimat değildir (06 §5.7-6, B56) — bu bileşen onu olduğu
 * gibi (yalnız ekran maskesiyle) gösterir, hiçbir ifadeyi yorumlamaz/çalıştırmaz.
 */
import { Badge } from '@/components/konsrucu/ui'
import { SAVUNMA_KONU_ADI } from '@/lib/konsrucu/dilekce-v2/savunma-matrisi'
import type { SavunmaSatiri } from '@/lib/konsrucu/dilekce-v2/tipler'
import { kart as kartCls, kucukDugme } from './stil'

export type SavunmaMatrisiProps = {
  savunmalar: readonly SavunmaSatiri[]
  /** Ekran maskesi (kişisel veri varsayılan gizli): lib/konsrucu/dilekce-v2/ekran-maske.ts · ekranMaskele. */
  goster: (s: string) => string
  /** Yalnız avukat ve düzenlenebilir (taslak, yetkili) kartta işaretleme düğmeleri gösterilir. */
  isaretlenebilir: boolean
  bekliyor: boolean
  onIsaretle: (savunmaId: string, isaret: 'CEVAPLANACAK' | 'ONEMSIZ') => void
}

/** Liste + "cevaplanacak"/"önemsiz" onay kutuları. Boş liste "çıkarılamadı" mesajı gösterir (AI kapalı/başarısızsa). */
export function SavunmaMatrisi({ savunmalar, goster, isaretlenebilir, bekliyor, onIsaretle }: SavunmaMatrisiProps) {
  return (
    <section className={kartCls} aria-labelledby="savunma-baslik">
      <div className="border-b border-border px-4 py-3">
        <h2 id="savunma-baslik" className="font-display text-base font-extrabold">Karşı tarafın savunmaları</h2>
      </div>
      <ul className="space-y-2 p-4">
        {savunmalar.map((sv) => (
          <li key={sv.id} className="rounded-xl border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-bold">{sv.id}</span>
              <Badge tone="info">{SAVUNMA_KONU_ADI[sv.konu]}</Badge>
              {sv.isaret && <Badge tone={sv.isaret === 'CEVAPLANACAK' ? 'kr' : 'steel'}>{sv.isaret === 'CEVAPLANACAK' ? 'Cevaplanacak' : 'Önemsiz'}</Badge>}
            </div>
            <p className="mt-1 font-semibold">{goster(sv.baslik)}</p>
            <blockquote className="mt-1 border-l-2 border-kr/50 pl-3 text-xs italic text-muted-foreground">
              “{goster(sv.alinti)}” — {sv.belgeAdi}{sv.sayfa != null ? ` s.${sv.sayfa}` : ''}
            </blockquote>
            {isaretlenebilir && (
              <div className="mt-2 flex gap-1.5">
                <button type="button" disabled={bekliyor} onClick={() => onIsaretle(sv.id, 'CEVAPLANACAK')} className={`${kucukDugme} border border-border hover:bg-muted`}>Cevaplanacak</button>
                <button type="button" disabled={bekliyor} onClick={() => onIsaretle(sv.id, 'ONEMSIZ')} className={`${kucukDugme} text-muted-foreground hover:bg-muted`}>Önemsiz</button>
              </div>
            )}
          </li>
        ))}
        {!savunmalar.length && <li className="text-sm text-muted-foreground">Cevap dilekçesinden kaynaklı savunma çıkarılamadı.</li>}
      </ul>
    </section>
  )
}
