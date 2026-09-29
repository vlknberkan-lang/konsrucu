'use client'

/**
 * KonsRücü — "Bulduklarımız" kartı · components/dosya/oneri/bulduklarimiz.tsx  (S18; 06 §2(a))
 *
 * Kural, Hugo, Excel ve (izin varsa) AI'dan gelen her değer kaynaklı ÖNERİdir; onaylanan değer kilitlenir ve
 * yeniden çıkarım onu ezmez. AI kapalıyken kart yalnız kural ve Hugo önerileriyle dolar (Varyant B).
 * Engeller (bin kat tutar şüphesi, kaynak çelişkisi) kırmızı kutuda; kaynaksız alanlar ayrıca listelenir.
 * Toplu onay yalnız deterministik kaynaklı, kritik olmayan önerilerde; tutar ve tarih tek tek onaylanır.
 *
 * Veri: lib/konsrucu/oneri/yukle.ts · oneriPaneliYukle(dosyaId).bulduklarimiz (sunucuda maskelenmiş).
 */
import { useCallback, useState } from 'react'
import { AlertTriangle, CheckCheck, Loader2, RefreshCw, ScanSearch } from 'lucide-react'
import { onerileriTopluOnaylaEylem, kuralOnerileriniUretEylem } from '@/app/(app)/dosya-islem/oneri-actions'
import type { BulduklarimizVerisi } from '@/lib/konsrucu/oneri/tipler'
import { KaynakGoster, type KaynakHedefi } from './kaynak-goster'
import { OneriSatiri } from './oneri-satiri'
import { BolumBasligi, DUGME_IKINCIL, DUGME_ONAY, HataSatiri, useEylem } from './ortak'

/** `capa`: bölüm kimliği — Yol Haritası eylem çapası varsayılanı (components/dosya/yol-haritasi/eylem.ts).
 *  `bulDugmesi`: "Belgelerden yeniden bul" başlıkta dursun mu. Yeni ekranda aynı eylem "Yapay zekâ çıkarımı" kartındadır
 *  ("AI ile Çıkarım Yap"); orada false verilir ki ekranda aynı işi yapan iki düğme olmasın. */
export function Bulduklarimiz({ veri, capa = 'yh-bulduklarimiz', bulDugmesi = true }: { veri: BulduklarimizVerisi; capa?: string; bulDugmesi?: boolean }) {
  const { calistir, buMu, bekliyor, hata } = useEylem()
  const [hedef, setHedef] = useState<KaynakHedefi | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)
  const kapat = useCallback(() => setHedef(null), [])

  const baslik = veri.bekleyen
    ? `${veri.bekleyen} bilgi onay bekliyor${veri.kritikBekleyen ? ` (${veri.kritikBekleyen} kritik)` : ''}`
    : veri.satirlar.length ? 'Bütün bilgiler onaylı' : 'Henüz öneri yok'

  const yenidenBul = bulDugmesi && veri.yetki.duzenleyebilir ? (
    <button
      type="button" disabled={bekliyor} className={DUGME_IKINCIL}
      onClick={() => calistir('bul', async () => {
        setBilgi(veri.aiAcik ? 'Belgeler yapay zekâyla okunuyor; bu bir dakika kadar sürebilir.' : null)
        const r = await kuralOnerileriniUretEylem({ dosyaId: veri.dosyaId })
        setBilgi(r.ok ? bulMesaji(r) : null)
        return r
      })}
    >
      {buMu('bul') ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />} Belgelerden yeniden bul
    </button>
  ) : null

  return (
    <section id={capa} aria-labelledby="bulduklarimiz-baslik" className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <BolumBasligi
        id="bulduklarimiz-baslik" kicker="Bulduklarımız" baslik={baslik}
        alt={
          <>
            Her bilginin yanında kaynağı durur. Doğruysa onaylayın; onaylanan bilgi kilitlenir ve yeniden çıkarım onu değiştirmez.
            {veri.aiAcik
              ? <> Yapay zekâ açık: belgeleri okur, bulduğu her bilgi burada onay bekler; eklediği borçlular teyit ister.</>
              : <> Yapay zekâ kapalı: öneriler belge kurallarından ve içe aktarılan Excel satırından geliyor.</>}
          </>
        }
        sag={yenidenBul}
      />

      {veri.engeller.length > 0 && (
        <div className="space-y-2 border-b border-border-subtle bg-danger-soft/40 px-5 py-3.5">
          {veri.engeller.map((e, i) => (
            <div key={`${e.tur}-${e.alan ?? i}`} className="flex items-start gap-2 text-[12.5px]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
              <div>
                <span className="font-bold text-danger">{e.tur === 'BIN_KAT' ? 'ENGEL' : 'ÇELİŞKİ'} · {e.baslik}</span>
                <div className="text-foreground">{e.aciklama}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {veri.satirlar.length === 0 ? (
        <div className="flex flex-col items-start gap-3 px-5 py-6 text-[12.5px] text-muted-foreground">
          <div className="flex items-center gap-2"><ScanSearch className="h-4 w-4" aria-hidden /> Henüz öneri yok. Evrak okununca poliçe, dekont, plaka ve kaza tarihi burada görünür.</div>
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {veri.satirlar.map((s) => (
            <OneriSatiri key={s.alan} dosyaId={veri.dosyaId} satir={s} yetki={veri.yetki} onKaynakGoster={setHedef} />
          ))}
        </ul>
      )}

      {veri.kaynaksiz.length > 0 && (
        <p className="border-t border-border-subtle px-5 py-2.5 text-[12px] text-muted-foreground">
          <span className="font-semibold text-danger">Kaynaksız {veri.kaynaksiz.length} alan:</span>{' '}
          {veri.kaynaksiz.map((k) => k.etiket).join(', ')}. Alıntı belgede bulunamadı; değeri belgeden kontrol edip elle girin.
        </p>
      )}

      {(veri.topluUygunIds.length > 0 || veri.kritikBekleyen > 0) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-5 py-3">
          {veri.topluUygunIds.length > 0 && (
            <button
              type="button" disabled={bekliyor} className={DUGME_ONAY}
              onClick={() => calistir('toplu', async () => {
                const r = await onerileriTopluOnaylaEylem({ dosyaId: veri.dosyaId, oneriIds: veri.topluUygunIds })
                if (r.ok) setBilgi(`${r.onaylanan} öneri onaylandı${r.atlanan ? `, ${r.atlanan} tanesi uygun olmadığı için atlandı` : ''}.`)
                return r
              })}
            >
              {buMu('toplu') ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> : <CheckCheck className="h-3 w-3" aria-hidden />} Uygun olanları toplu onayla ({veri.topluUygunIds.length})
            </button>
          )}
          {veri.kritikBekleyen > 0 && (
            <span className="text-[11.5px] text-muted-foreground">Tutar, ödeme ve tarihler toplu onaylanmaz; kritikler onaylanmadan hazırlık açılmaz (HZ-02).</span>
          )}
        </div>
      )}

      {bilgi && !hata && <p role="status" className="border-t border-border-subtle px-5 py-2 text-[12px] text-muted-foreground">{bilgi}</p>}
      <HataSatiri hata={hata} />
      <KaynakGoster hedef={hedef} onKapat={kapat} />
    </section>
  )
}

type BulSonucu = Extract<Awaited<ReturnType<typeof kuralOnerileriniUretEylem>>, { ok: true }>

/** "Belgelerden yeniden bul" sonucunu tek cümleye çevirir (yapay zekâ adımı dahil). Evrak yüklemesi de kullanır. */
export function bulMesaji(r: BulSonucu): string {
  let m = r.gorsel ? `${r.gorsel.charAt(0).toLocaleUpperCase('tr-TR')}${r.gorsel.slice(1)}. ` : ''
  m += r.eklenen ? `${r.eklenen} yeni öneri bulundu${r.kaynaksiz ? `, ${r.kaynaksiz} tanesi kaynaksız` : ''}.` : 'Yeni öneri çıkmadı; mevcut öneriler yerinde.'
  if (r.ai === 'TAMAM') {
    const ek = [r.yazilanAlan ? `${r.yazilanAlan} boş alanı doldurdu` : '', r.yeniBorclu ? `${r.yeniBorclu} borçlu ekledi (teyit gerek)` : ''].filter(Boolean)
    m += ` Yapay zekâ belgeleri okudu${ek.length ? `; ${ek.join(', ')}` : ''}.`
  } else if (r.ai === 'HATA') {
    m += ` Yapay zekâ çalışmadı (${r.aiHata}); yalnız kural ve Excel önerileri eklendi.`
  } else if (r.ai === 'METIN_YOK') {
    m += r.gorselKapali
      ? ' Yapay zekânın okuyacağı belge metni yok: fotoğraf ve taranmış görüntüler (ör. el yazılı tutanak) okunmuyor.'
      : ' Yapay zekânın okuyacağı belge metni yok.'
  }
  return m
}
