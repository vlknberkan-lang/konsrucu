/**
 * KonsRücü — Dosya Yol Haritası · "Neden?" paneli · components/dosya/yol-haritasi/neden-paneli.tsx
 *
 * Kararı doğuran kural kodu ve sürümü, bir cümlelik gerekçe, kanıt belgeleri (sayfa ve alıntıyla), hukuki etiket.
 * Madde atıfları her zaman "teyit gerekli" etiketiyle görünür. Belge bağlantısı `belgeHrefSablonu` verilirse açılır
 * (ör. "/akilli-giris/abc?belge={belgeId}"; sunucu→istemci sınırından geçebilsin diye fonksiyon değil metin).
 */
import { FileText, Scale, Quote } from 'lucide-react'
import type { Adim } from '@/lib/konsrucu/yol-haritasi/tipler'
import { belgeAdresi, gunGoster } from './eylem'

const KANIT_ADI: Record<string, string> = {
  BELGE: 'Belge', OLAY: 'UYAP gelişmesi', SURE: 'Süre', ALAN: 'Bulunan bilgi', DOSYA: 'Dosya', SENKRON: 'UYAP', ARABULUCULUK: 'Arabuluculuk',
  DAVA: 'Dava', DAVA_ISLEM: 'Dava işlemi', ETKINLIK: 'Takvim', YOL_SECIMI: 'Yol seçimi', ONAY_KAYDI: 'Müvekkil onayı', TAKIP_TALEBI: 'Takip talebi', BORCLU: 'Borçlu',
}

export function NedenPaneli({ adim, belgeHrefSablonu, id }: {
  adim: Adim
  /** "{belgeId}" yer tutuculu belge görüntüleme adresi (Bağla aşaması verir; yoksa bağlantısız). */
  belgeHrefSablonu?: string
  id?: string
}) {
  return (
    <div id={id} className="mt-3 rounded-xl border border-border-subtle bg-surface-muted/60 px-4 py-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[11px] font-semibold text-foreground">Kural {adim.kural} · sürüm {adim.surum}</span>
        {adim.hukukiEtiket && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <Scale className="h-3.5 w-3.5" aria-hidden />{adim.hukukiEtiket.includes('teyit gerekli') ? adim.hukukiEtiket : `${adim.hukukiEtiket} · teyit gerekli`}
          </span>
        )}
      </div>
      <p className="mt-1.5 leading-[1.5] text-foreground/90">{adim.neden}</p>
      {adim.kanit.length > 0 ? (
        <ul className="mt-2.5 space-y-2" aria-label="Kanıtlar">
          {adim.kanit.map((k, i) => (
            <li key={`${k.tur}-${k.id ?? i}`} className="flex items-start gap-2">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <div className="text-[12.5px] text-foreground">
                  <span className="text-muted-foreground">{KANIT_ADI[k.tur] ?? k.tur}: </span>
                  {k.belgeId && belgeHrefSablonu ? (
                    <a href={belgeAdresi(belgeHrefSablonu, k.belgeId) ?? undefined} className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">{k.etiket}</a>
                  ) : (
                    <span className="font-medium">{k.etiket}</span>
                  )}
                  {k.tarih && <span className="font-mono text-[11.5px] text-muted-foreground"> · {gunGoster(k.tarih)}</span>}
                  {k.sayfa != null && <span className="font-mono text-[11.5px] text-muted-foreground"> · s.{k.sayfa}</span>}
                </div>
                {k.alinti && (
                  <p className="mt-0.5 flex items-start gap-1 text-[12px] italic text-muted-foreground">
                    <Quote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />“{k.alinti}”
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">Bu öneri dosyadaki kayıtların yokluğundan çıkarıldı; ayrı bir kanıt belgesi yok.</p>
      )}
    </div>
  )
}
