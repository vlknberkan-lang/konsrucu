'use client'

/**
 * KonsRücü — Ayarlar · Mentor öğrenilen kuralları yönet.
 * Avukatların dosya detayında "Mentor'a öğret" ile yazdığı kurallar burada listelenir; aç/kapat ve sil.
 * Kapalı/silinen kural sonraki AI çıkarımında sistem promptuna ENJEKTE EDİLMEZ ("artık gerek yok").
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Pencil, Trash2, Loader2, GraduationCap, Power } from 'lucide-react'
import { mentorKuralSil, mentorKuralKapat } from '@/app/(app)/ayarlar/actions'

export type KuralUI = {
  id: string
  kaynak: 'ADIM' | 'TEYIT'
  tur: 'KALDIR' | 'DUZELT'
  hedef: string | null
  yorum: string
  olayTuru: string | null
  aktif: boolean
  createdAt: string
  yazan: string | null
}

const fmt = (s: string) => new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function MentorKurallar({ init }: { init: KuralUI[] }) {
  const [pending, start] = useTransition()
  const [isleyen, setIsleyen] = useState<string | null>(null)
  const router = useRouter()

  function kapat(id: string, aktif: boolean) {
    setIsleyen(id)
    start(async () => { await mentorKuralKapat(id, aktif); setIsleyen(null); router.refresh() })
  }
  function sil(id: string) {
    if (!window.confirm('Bu kural silinsin mi? Sonraki çıkarımlarda artık uygulanmaz.')) return
    setIsleyen(id)
    start(async () => { await mentorKuralSil(id); setIsleyen(null); router.refresh() })
  }

  if (!init.length) {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        Henüz kural yok. Bir dosyanın <b>AI Çıkarım</b> bölümünde, alakasız bir “Önerilen Adım” ya da “Risk/Öneri” notunun altındaki
        <span className="mx-1 inline-flex items-center gap-1 rounded-[6px] border border-border px-1.5 py-0.5 text-[11px] font-semibold text-kr-ink"><GraduationCap className="h-3 w-3" /> Mentor'a öğret</span>
        ile düzeltme yazın; kural buraya gelir ve sonraki çıkarımlarda uygulanır.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {init.map((k) => {
        const TurIcon = k.tur === 'KALDIR' ? Ban : Pencil
        const turCls = k.tur === 'KALDIR' ? 'bg-danger-soft text-danger' : 'bg-kr-soft text-kr-ink'
        const turLbl = k.tur === 'KALDIR' ? 'Bunu önerme' : 'Düzeltme'
        return (
          <li key={k.id} className={`rounded-[12px] border p-3 transition ${k.aktif ? 'border-border-subtle bg-surface' : 'border-border-subtle bg-surface-muted/40 opacity-60'}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-semibold ${turCls}`}><TurIcon className="h-3 w-3" /> {turLbl}</span>
              <span className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-[2px] text-[10.5px] font-medium text-muted-foreground">{k.kaynak === 'TEYIT' ? 'Risk/Öneri' : 'Önerilen Adım'}</span>
              <span className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10.5px] font-medium ${k.olayTuru ? 'bg-info-soft text-info' : 'bg-surface-muted text-muted-foreground'}`}>{k.olayTuru ? `Yalnız: ${k.olayTuru}` : 'Tüm dosyalar'}</span>
              {!k.aktif && <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-[2px] text-[10.5px] font-semibold text-muted-foreground">Kapalı</span>}
              <span className="font-mono ml-auto text-[10px] text-muted-foreground">{fmt(k.createdAt)}{k.yazan ? ` · ${k.yazan}` : ''}</span>
            </div>
            {k.yorum && <p className="mt-1.5 text-[12.5px] leading-[1.45] text-foreground">{k.yorum}</p>}
            {k.hedef && <p className="mt-1 line-clamp-2 text-[11px] italic leading-[1.4] text-muted-foreground" title={k.hedef}>İlgili öneri: “{k.hedef}”</p>}
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => kapat(k.id, !k.aktif)} disabled={pending && isleyen === k.id} className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-60">
                {pending && isleyen === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />} {k.aktif ? 'Devre dışı bırak' : 'Etkinleştir'}
              </button>
              <button type="button" onClick={() => sil(k.id)} disabled={pending && isleyen === k.id} className="inline-flex items-center gap-1.5 rounded-[8px] border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-danger/40 hover:text-danger disabled:opacity-60">
                <Trash2 className="h-3.5 w-3.5" /> Sil
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
