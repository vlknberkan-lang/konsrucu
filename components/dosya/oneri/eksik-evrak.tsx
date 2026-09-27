'use client'

/**
 * KonsRücü — Eksik evrak (asgari set) · components/dosya/oneri/eksik-evrak.tsx  (S19; 06 §2(a); EV-04)
 *
 * Seçilen rücu sebebi koduna bağlı asgari evrak seti ↔ dosyadaki belgeler. Belge türünden anlaşılamayan öğeler
 * (ör. olay yerini terki gösteren kayıt) "kontrol edin" olarak durur. Eksik varsa Ray'e istek e-postasının taslağı
 * hazırdır: program göndermez; avukat kopyalar ya da e-posta programında açar. Asgari set K1'de Yelda'nın
 * doğrulamasını bekler (etiketle gösterilir).
 *
 * Veri: oneriPaneliYukle(dosyaId).eksikEvrak.
 */
import { useState } from 'react'
import { CheckCircle2, Circle, HelpCircle, Copy, Mail, Check } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import type { EksikEvrakVerisi } from '@/lib/konsrucu/oneri/tipler'
import { BolumBasligi, DUGME_IKINCIL } from './ortak'

/** `capa`: bölüm kimliği — Yol Haritası EV-04 "Ray'e istek taslağı" eylemi bu çapaya gider. */
export function EksikEvrak({ veri, capa = 'yh-eksik-evrak' }: { veri: EksikEvrakVerisi; capa?: string }) {
  const [taslakAcik, setTaslakAcik] = useState(false)
  const [kopyalandi, setKopyalandi] = useState(false)

  if (!veri.kod) {
    return (
      <section id={capa} aria-labelledby="eksik-evrak-baslik" className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <BolumBasligi id="eksik-evrak-baslik" kicker="Eksik evrak" baslik="Önce rücu sebebini seçin" alt="Asgari evrak listesi rücu sebebi koduna göre gelir." />
      </section>
    )
  }

  async function kopyala() {
    if (!veri.rayTaslagi) return
    try {
      await navigator.clipboard.writeText(`${veri.rayTaslagi.konu}\n\n${veri.rayTaslagi.govde}`)
      setKopyalandi(true)
      setTimeout(() => setKopyalandi(false), 2000)
    } catch { /* pano izni yoksa metin ekranda seçilebilir */ }
  }

  const baslik = veri.eksikSayisi ? `${veri.eksikSayisi} evrak eksik` : 'Asgari evrak tamam'
  return (
    <section id={capa} aria-labelledby="eksik-evrak-baslik" className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <BolumBasligi
        id="eksik-evrak-baslik" kicker={`Eksik evrak · ${veri.kodAd ?? ''}`} baslik={baslik}
        alt={veri.oneriyeGore ? 'Liste henüz onaylanmamış rücu sebebi önerisine göre; kod seçilince kesinleşir.' : undefined}
        sag={veri.k1Etiketi ? <Badge tone={veri.k1Etiketi.includes('doğrulandı') ? 'success' : 'warning'}>{veri.k1Etiketi}</Badge> : null}
      />
      <ul className="divide-y divide-border-subtle">
        {veri.ogeler.map((o) => (
          <li key={o.tur} className="flex items-start gap-3 px-5 py-2.5 text-[12.5px]">
            {o.durum === 'VAR' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              : o.durum === 'EKSIK' ? <Circle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
              : <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">{o.ad}</span>
                {o.durum === 'VAR' && <span className="text-[11.5px] text-success">var · {o.belgeSayisi} belge</span>}
                {o.durum === 'EKSIK' && <span className="text-[11.5px] font-semibold text-danger">EKSİK</span>}
                {o.durum === 'KONTROL' && <span className="text-[11.5px] font-semibold text-warning">kontrol edin</span>}
              </div>
              {o.aciklama && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{o.aciklama}</div>}
            </div>
          </li>
        ))}
      </ul>
      {veri.rayTaslagi && (
        <div className="border-t border-border-subtle px-5 py-3">
          <button type="button" aria-expanded={taslakAcik} onClick={() => setTaslakAcik((a) => !a)} className={DUGME_IKINCIL}>
            <Mail className="h-3 w-3" aria-hidden /> Ray&apos;e istek taslağı
          </button>
          {taslakAcik && (
            <div className="mt-3 rounded-xl border border-border-subtle bg-surface-muted/60 p-3">
              <div className="text-[12px] text-muted-foreground">Konu: <span className="font-semibold text-foreground">{veri.rayTaslagi.konu}</span></div>
              <pre className="mt-2 whitespace-pre-wrap font-body text-[12.5px] leading-[1.55] text-foreground">{veri.rayTaslagi.govde}</pre>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={kopyala} className={DUGME_IKINCIL}>
                  {kopyalandi ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />} {kopyalandi ? 'Kopyalandı' : 'Taslağı kopyala'}
                </button>
                <a href={veri.rayTaslagi.mailto} className={DUGME_IKINCIL}><Mail className="h-3 w-3" aria-hidden /> E-postada aç</a>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Program e-posta göndermez; alıcıyı siz seçersiniz.</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
