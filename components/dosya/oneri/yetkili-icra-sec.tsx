'use client'

/**
 * KonsRücü — Yetkili icra seçimi · components/dosya/oneri/yetkili-icra-sec.tsx  (S19; 06 §2(c) adım 4; B07)
 *
 * İki seçenek gerekçesiyle: kaza yeri (Adli Rehber) ve borçlunun yerleşim yeri. Dayanaklar "teyit gerekli".
 * Seçim yalnız AVUKAT/ADMIN. Gerekirse daire elle yazılır. AI'ın yetkili icra önerisi bu alana yazılmaz; eski
 * kolondaki onaysız değer yalnız bilgi olarak görünür. Adres ekrana gelmez; yalnız çözülen ilçe/il ve adliye.
 *
 * Veri: oneriPaneliYukle(dosyaId).yetkiliIcra. Eylem: yetkiliIcraSecEylem (seçenekler sunucuda yeniden hesaplanır).
 */
import { useState } from 'react'
import { Check, Loader2, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { yetkiliIcraSecEylem } from '@/app/(app)/dosya-islem/oneri-actions'
import type { YetkiliIcraVerisi } from '@/lib/konsrucu/oneri/tipler'
import { BolumBasligi, DUGME_ONAY, GIRDI, HataSatiri, useEylem } from './ortak'

/** `capa`: bölüm kimliği (Hazırlık durağında "Yetkili icra" maddesinin bağlantısı). */
export function YetkiliIcraSec({ veri, capa = 'yh-yetkili-icra' }: { veri: YetkiliIcraVerisi; capa?: string }) {
  const { calistir, buMu, bekliyor, hata } = useEylem()
  const [secim, setSecim] = useState<string>('')
  const [elle, setElle] = useState('')
  const yetkili = veri.yetki.kararVerebilir

  return (
    <section id={capa} aria-labelledby="yetkili-icra-baslik" className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <BolumBasligi
        id="yetkili-icra-baslik" kicker="Yetkili icra"
        baslik={veri.onayli ? veri.onayli.icraDairesi : 'Yetkili icra dairesini seçin'}
        alt="Program iki seçeneği gerekçesiyle gösterir; seçim avukatındır (teyit gerekli)."
        sag={veri.onayli ? <Badge tone="success">ONAYLI</Badge> : <Badge tone="warning">SEÇİLMEDİ</Badge>}
      />
      <div className="space-y-3 px-5 py-4 text-[12.5px]">
        {veri.onayli && (
          <p className="text-muted-foreground">
            {veri.onayli.onaylayanAd ? `${veri.onayli.onaylayanAd} seçti` : 'Seçildi'}
            {veri.onayli.secenek === 'KAZA_YERI' ? ' · kaza yeri' : veri.onayli.secenek === 'YERLESIM_YERI' ? ' · yerleşim yeri' : ' · elle'}.
            {veri.onayli.gerekce ? ` ${veri.onayli.gerekce}` : ''}
          </p>
        )}
        {veri.eskiDeger && (
          <p className="text-[11.5px] text-muted-foreground">
            Eski kayıttaki onaysız değer: <span className="font-semibold text-foreground">{veri.eskiDeger}</span>. Bu alan artık yalnız avukat seçimiyle dolar.
          </p>
        )}
        {veri.uyarilar.length > 0 && (
          <ul className="space-y-1 text-[11.5px] text-warning">
            {veri.uyarilar.map((u) => <li key={u} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{u}</li>)}
          </ul>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!secim) return
            calistir('sec', () => yetkiliIcraSecEylem({ dosyaId: veri.dosyaId, anahtar: secim, elleDaire: secim === 'ELLE' ? elle.trim() : undefined, beklenenOnayliId: veri.onayli?.id ?? null }))
          }}
        >
          <fieldset disabled={!yetkili || bekliyor} className="space-y-2">
            <legend className="sr-only">Yetkili icra seçenekleri</legend>
            {veri.secenekler.length === 0 && <p className="text-muted-foreground">Kaza yeri ya da borçlu adresinden seçenek çıkarılamadı; daireyi elle yazın.</p>}
            {veri.secenekler.map((s) => (
              <label key={s.anahtar} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${secim === s.anahtar ? 'border-kr/40 bg-kr-soft/40' : 'border-border-subtle hover:border-border'}`}>
                <input type="radio" name="yetkili-icra" value={s.anahtar} checked={secim === s.anahtar} onChange={() => setSecim(s.anahtar)} className="mt-1 accent-[hsl(var(--kr))]" />
                <span className="min-w-0">
                  <span className="block font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">{s.baslik}</span>
                  <span className="block text-[13px] font-semibold text-foreground">{s.icraDairesi}</span>
                  <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{s.gerekce}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{s.dayanak}</span>
                </span>
              </label>
            ))}
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${secim === 'ELLE' ? 'border-kr/40 bg-kr-soft/40' : 'border-border-subtle hover:border-border'}`}>
              <input type="radio" name="yetkili-icra" value="ELLE" checked={secim === 'ELLE'} onChange={() => setSecim('ELLE')} className="mt-1 accent-[hsl(var(--kr))]" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">Başka daire</span>
                <input
                  aria-label="İcra dairesinin adı" className={`${GIRDI} w-full max-w-[420px]`} placeholder="ör. … İcra Dairesi"
                  value={elle} maxLength={120} onFocus={() => setSecim('ELLE')} onChange={(e) => setElle(e.target.value)}
                />
              </span>
            </label>
          </fieldset>
          <div className="mt-3">
            {yetkili ? (
              <button type="submit" disabled={bekliyor || !secim || (secim === 'ELLE' && !elle.trim())} className={DUGME_ONAY}>
                {buMu('sec') ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />} Seçimi kaydet
              </button>
            ) : (
              <p className="text-[12px] text-muted-foreground">Bu seçimi avukat yapar.</p>
            )}
          </div>
        </form>
      </div>
      <HataSatiri hata={hata} />
    </section>
  )
}
