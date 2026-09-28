/**
 * KonsRücü — sayfa geçişi göstergesi · app/(app)/loading.tsx
 * Dosya ve liste sayfaları sunucuda birkaç saniye hesaplanabiliyor; tıklamadan hemen sonra geri bildirim verir
 * (kabuk yerinde kalır, yalnız içerik alanı değişir).
 */
import { Loader2 } from 'lucide-react'

export default function Yukleniyor() {
  return (
    <div className="grid min-h-[60vh] place-items-center" role="status" aria-live="polite">
      <div className="flex items-center gap-2.5 text-[13.5px] font-medium text-muted-foreground">
        <Loader2 className="h-5 w-5 text-kr motion-safe:animate-spin" aria-hidden />
        Yükleniyor…
      </div>
    </div>
  )
}
