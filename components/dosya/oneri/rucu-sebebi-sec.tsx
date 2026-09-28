'use client'

/**
 * KonsRücü — Rücu sebebi seçimi · components/dosya/oneri/rucu-sebebi-sec.tsx  (S19; 06 §2(a); B05; EV-07)
 *
 * Hugo "Rücu Nedeni" müvekkilin serbest metnidir; kod listesinden bir ÖNERİYE çevrilir, kodu avukat seçer.
 * Her kodun yanında K1 etiketi ("K1: bekliyor · teyit gerekli" ya da "K1: doğrulandı"), dayanak etiketleri
 * ("teyit gerekli") ve ZMSS kodlarında poliçe tarihine göre GŞ sürümü (iki rejim) görünür.
 * Seçim yalnız AVUKAT/ADMIN; yardımcı "Bu seçimi avukat yapar" görür. GŞ-DİĞER'de gerekçe zorunlu.
 *
 * Veri: oneriPaneliYukle(dosyaId).rucuSebebi. Eylem: rucuSebebiSecEylem.
 */
import { useState } from 'react'
import { Check, Loader2, Scale, Info } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { rucuSebebiSecEylem } from '@/app/(app)/dosya-islem/oneri-actions'
import type { RucuSebebiVerisi } from '@/lib/konsrucu/oneri/tipler'
import type { RucuSebebiKodu } from '@/lib/konsrucu/rucu-sebebi'
import { BolumBasligi, DUGME_ONAY, GIRDI, HataSatiri, useEylem } from './ortak'

const tarihYaz = (iso: string) => iso.split('-').reverse().join('.')

/** `capa`: bölüm kimliği — Yol Haritası EV-07 "Seç" eylemi bu çapaya gider. */
export function RucuSebebiSec({ veri, capa = 'yh-rucu-sebebi' }: { veri: RucuSebebiVerisi; capa?: string }) {
  const { calistir, buMu, bekliyor, hata } = useEylem()
  const varsayilan = veri.onayli?.kod ?? veri.oneriler[0]?.kod ?? ''
  const [kod, setKod] = useState<RucuSebebiKodu | ''>(varsayilan)
  const [gerekce, setGerekce] = useState('')
  const secili = veri.secenekler.find((s) => s.kod === kod) ?? null
  const gerekceGerekli = kod === 'GS_DIGER'
  const degismedi = !!veri.onayli && veri.onayli.kod === kod
  const uygunlar = veri.secenekler.filter((s) => s.bransUygun)
  const digerleri = veri.secenekler.filter((s) => !s.bransUygun)

  return (
    <section id={capa} aria-labelledby="rucu-sebebi-baslik" className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <BolumBasligi
        id="rucu-sebebi-baslik" kicker="Rücu sebebi"
        baslik={veri.onayli ? veri.onayli.ad : 'Rücu sebebini seçin'}
        alt={veri.ev07.gerekli ? veri.ev07.metin : 'Kod dilekçe türünü, dayanakları ve asgari evrak setini belirler.'}
        sag={
          veri.onayli ? (
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="success">ONAYLI</Badge>
              {veri.onayli.teyitGerekli && <Badge tone="warning">teyit gerekli</Badge>}
            </div>
          ) : <Badge tone="warning">SEÇİLMEDİ</Badge>
        }
      />

      <div className="space-y-4 px-5 py-4 text-[12.5px]">
        {(veri.hugoHam || veri.oneriler.length > 0) && (
          <div className="rounded-xl border border-border-subtle bg-surface-muted/60 p-3">
            {veri.hugoHam && (
              <div className="text-muted-foreground">
                Excel &quot;Rücu Nedeni&quot;: <span className="font-semibold text-foreground">{veri.hugoHam}</span>
              </div>
            )}
            {veri.oneriler.map((o) => (
              <div key={o.id} className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-warning">Öneri</span>
                <span className="font-semibold text-foreground">{o.ad}</span>
                <Badge tone="info">{o.kaynakEtiketi}</Badge>
                {o.guven != null && <span className="font-mono text-[10.5px] text-muted-foreground">güven %{Math.round(o.guven * 100)}</span>}
                <span className="text-[11px] text-muted-foreground">{o.k1Etiketi}</span>
              </div>
            ))}
            {veri.hugoGerekce && <div className="mt-1.5 text-[11.5px] text-muted-foreground">{veri.hugoGerekce}</div>}
            {veri.hugoAdaylar.length > 0 && (
              <div className="mt-1 text-[11.5px] text-muted-foreground">
                Adaylar: {veri.hugoAdaylar.map((k) => veri.secenekler.find((s) => s.kod === k)?.ad ?? k).join(' · ')}
              </div>
            )}
          </div>
        )}

        {veri.gsRejimi.rejim !== 'UYGULANMAZ' && (kod || veri.onayli) && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Scale className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <span className="font-semibold text-foreground">GŞ sürümü: {veri.gsRejimi.etiket}</span>
              {veri.gsRejimi.esasTarih && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  poliçe {veri.gsRejimi.esasTur === 'TANZIM' ? 'tanzim' : 'başlangıç'} {tarihYaz(veri.gsRejimi.esasTarih)}
                </span>
              )}
              <Badge tone="warning">teyit gerekli</Badge>
            </div>
            {veri.gsRejimi.uyarilar.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[11.5px] text-muted-foreground">
                {veri.gsRejimi.uyarilar.map((u) => <li key={u}>{u}</li>)}
              </ul>
            )}
          </div>
        )}

        {veri.dayanaklar.length > 0 && (
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Dayanak (hepsi teyit gerekli)</div>
            <ul className="mt-1 space-y-0.5 text-[12px]">
              {veri.dayanaklar.map((d) => (
                <li key={d.etiket}><span className="text-foreground">{d.etiket}</span>{d.not && <span className="text-muted-foreground"> · {d.not}</span>}</li>
              ))}
            </ul>
            {veri.notlar.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-muted-foreground">
                {veri.notlar.map((n) => <li key={n} className="flex gap-1.5"><Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{n}</li>)}
              </ul>
            )}
          </div>
        )}

        {veri.yetki.kararVerebilir ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!kod) return
              calistir('sec', () => rucuSebebiSecEylem({ dosyaId: veri.dosyaId, kod, beklenenOnayliId: veri.onayli?.id ?? null, gerekce: gerekce.trim() || undefined }))
            }}
          >
            <label className="flex min-w-[280px] flex-1 flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-muted-foreground">Rücu sebebi kodu</span>
              <select required className={GIRDI} value={kod} onChange={(e) => setKod(e.target.value as RucuSebebiKodu | '')}>
                <option value="">Kod seçin</option>
                <optgroup label={veri.brans ? 'Dosyanın branşına uygun' : 'Kodlar (branş bilinmiyor)'}>
                  {uygunlar.map((s) => <option key={s.kod} value={s.kod}>{s.ad} — {s.k1Etiketi}</option>)}
                </optgroup>
                {digerleri.length > 0 && (
                  <optgroup label="Branşla uyuşmayan">
                    {digerleri.map((s) => <option key={s.kod} value={s.kod}>{s.ad} — {s.k1Etiketi}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            {gerekceGerekli && (
              <label className="flex min-w-[280px] flex-1 flex-col gap-1">
                <span className="text-[11.5px] font-semibold text-muted-foreground">Gerekçe (zorunlu)</span>
                <input required minLength={10} className={GIRDI} value={gerekce} onChange={(e) => setGerekce(e.target.value)} placeholder="Hangi GŞ hâli, neden" />
              </label>
            )}
            <button type="submit" disabled={bekliyor || !kod || degismedi} className={DUGME_ONAY}>
              {buMu('sec') ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />} Rücu sebebini kaydet
            </button>
            {secili && !secili.bransUygun && <span className="basis-full text-[11.5px] text-warning">Seçilen kod dosyanın branşıyla uyuşmuyor; branşı kontrol edin.</span>}
          </form>
        ) : (
          <p className="text-[12px] text-muted-foreground">Bu seçimi avukat yapar.</p>
        )}
      </div>
      <HataSatiri hata={hata} />
    </section>
  )
}
