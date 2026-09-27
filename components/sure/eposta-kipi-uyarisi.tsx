/**
 * KonsRücü — E-posta kipi uyarısı · components/sure/eposta-kipi-uyarisi.tsx (B52)
 * EMAIL_SERVICE=console iken hatırlatmalar GÖNDERİLMEZ; ekranda açıkça söylenir. Kip sunucuda okunur
 * (lib/konsrucu/sure/hatirlatma.ts epostaKipi) ve prop olarak gelir.
 */
import { MailWarning } from 'lucide-react'

export function EpostaKipiUyarisi({ kip }: { kip: string }) {
  if (kip !== 'console') return null
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-danger/30 bg-danger-soft/40 px-4 py-3 text-[13px]">
      <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <div>
        <div className="font-semibold text-danger">E-posta gönderilmiyor (kip: console)</div>
        <p className="mt-0.5 text-muted-foreground">
          Süre hatırlatmaları kaydediliyor ama e-posta olarak gitmiyor ve gönderilmiş sayılmıyor. Her kayıt Sistem Olayları&apos;na düşer.
          Hatırlatmaların gitmesi için sunucuda EMAIL_SERVICE ayarlanmalı.
        </p>
      </div>
    </div>
  )
}
