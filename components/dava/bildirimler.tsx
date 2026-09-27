'use client'

/**
 * KonsRücü — MÜVEKKİL BİLDİRİM taslakları (SN-08; B17) · components/dava/bildirimler.tsx
 * Karar, arabuluculuk sonucu ve tahsilat için yapay zekâsız taslak. Program göndermez: avukat kopyalar, elle gönderir
 * ve "Gönderildi" işaretler (Aktivite'ye yazılır, SN-08 kapanır).
 */
import { useState } from 'react'
import { Mail } from 'lucide-react'
import { musteriBildirimiGonderildi } from '@/app/(app)/dosya-islem/arabuluculuk-actions'
import { IkincilDugme, Kart, KopyaDugmesi, Mesaj, useAksiyon } from '../arabuluculuk/ortak'

export type MusteriBildirimleriProps = {
  dosyaId: string
  bildirimler: { konu: 'KARAR' | 'ARABULUCULUK_SONUCU' | 'TAHSILAT'; refId: string; baslik: string; taslak: string }[]
  yetki: { yazabilir: boolean; avukat: boolean }
}

export function MusteriBildirimleri({ dosyaId, bildirimler, yetki }: MusteriBildirimleriProps) {
  const [acik, setAcik] = useState<string | null>(null)
  const a = useAksiyon()
  if (!bildirimler.length) return null
  return (
    <Kart id="bildirim" kicker="Müvekkile bildirim" baslik={`${bildirimler.length} bildirim taslağı hazır`} sag={<Mail className="h-4 w-4 text-muted-foreground" />} alt="Gönderim elle ve avukat onayıyla yapılır.">
      <ul className="flex flex-col gap-2">
        {bildirimler.map((b) => (
          <li key={`${b.konu}:${b.refId}`} className="rounded-xl border border-border-subtle p-3">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <b>{b.baslik}</b>
              <IkincilDugme onClick={() => setAcik(acik === b.refId ? null : b.refId)}>{acik === b.refId ? 'Gizle' : 'Taslağı aç'}</IkincilDugme>
              <KopyaDugmesi metin={b.taslak} />
              {yetki.avukat && <IkincilDugme bekliyor={a.bekliyor} onClick={() => a.calistir(() => musteriBildirimiGonderildi({ dosyaId, konu: b.konu, refId: b.refId }), () => 'Gönderildi olarak işaretlendi.')}>Gönderildi</IkincilDugme>}
            </div>
            {acik === b.refId && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-muted/50 p-3 text-[12px] leading-[1.5]">{b.taslak}</pre>}
          </li>
        ))}
      </ul>
      {a.hata && <div className="mt-2"><Mesaj tur="hata">{a.hata}</Mesaj></div>}
    </Kart>
  )
}
