/**
 * KonsRücü — Süre defterinin sabit uyarıları · components/sure/sure-sabit-uyarilar.tsx
 * 06 §2(i): UETS 5 gün, adli tatil, resmî tatil ve "teyit gerekli" uyarıları ekranda HER ZAMAN görünür.
 * Sunucu ya da istemci bileşeni içinde kullanılabilir (durumsuz).
 */
import { Info } from 'lucide-react'

export const SABIT_UYARILAR: readonly string[] = [
  'Önerilen son gün bir öneridir; onaylanan son günü avukat kaynak evraka bakarak girer. Madde atıflarının hepsi teyit gereklidir.',
  'UETS: tebliğ, ulaşmayı izleyen 5. günün sonunda yapılmış sayılır (Tebligat K. 7/a, teyit gerekli). Ulaşma ve tebliğ tarihi ayrı tutulur; ihtiyatlı hesap ulaşma gününden başlar.',
  'Adli tatil (20 Temmuz–31 Ağustos) uzatması motor tarafından uygulanmaz (HMK 104, teyit gerekli). Hak düşürücü sürelerde (İİK 67 gibi) adli tatil uzatması hiç düşünülmez.',
  'Resmî tatil ve bayramlar kontrol edilmez; son gün tatile denk geliyorsa uzama olup olmadığını avukat teyit eder. Hafta sonu yalnız uyarı olarak işaretlenir.',
  'Hatırlatma e-postası onaylanan son güne, yoksa ihtiyatlı öneriye göre 7, 3 ve 1 gün kala gider.',
]

export function SureSabitUyarilar({ sikistir = false }: { sikistir?: boolean }) {
  return (
    <aside aria-label="Süre defteri uyarıları" className="rounded-2xl border border-border bg-surface-muted/50 px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <Info className="h-3.5 w-3.5" aria-hidden /> Sabit uyarılar
      </div>
      <ul className={`list-disc space-y-1 pl-4 text-muted-foreground ${sikistir ? 'text-[11.5px]' : 'text-[12.5px]'}`}>
        {SABIT_UYARILAR.map((u) => <li key={u}>{u}</li>)}
      </ul>
    </aside>
  )
}
